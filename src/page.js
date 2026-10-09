// Runs in the page itself (world MAIN), from the very start: it sees the caption track the YouTube player loads
// (the player signs that request, so this works where a plain download of the track is refused) and can ask the
// player for its caption list and to turn English captions on. It only talks to content.js, by window messages.
(() => {
  'use strict';
  if (window.__livesubPage) return;
  window.__livesubPage = true;

  const captured = [];                                   // the last caption tracks the player loaded
  const post = (type, data) => window.postMessage(Object.assign({source: 'livesub-page', type}, data || {}), '*');
  const isTrack = u => typeof u === 'string' && u.indexOf('/api/timedtext') >= 0;

  function keep(url, body) {
    if (!body) return;
    captured.push({url, body});
    if (captured.length > 6) captured.shift();
    post('timedtext', {url, body});
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isTrack(url)) p.then(r => r.clone().text()).then(b => keep(url, b)).catch(() => {});
    } catch (e) { /* never break the player */ }
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__livesubUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (isTrack(this.__livesubUrl)) {
      this.addEventListener('load', () => {
        try {                                    // the player asks for an ArrayBuffer: responseText would throw
          const r = this.response, rt = this.responseType, url = this.__livesubUrl;
          if (rt === '' || rt === 'text') keep(url, this.responseText);
          else if (rt === 'arraybuffer' && r) keep(url, new TextDecoder().decode(r));
          else if (rt === 'json') keep(url, JSON.stringify(r));
          else if (rt === 'blob' && r) r.text().then(b => keep(url, b));
        } catch (e) { /* ignore */ }
      });
    }
    return origSend.apply(this, arguments);
  };

  const player = () => document.getElementById('movie_player');

  function info() {
    const p = player();
    let pr = null;
    try { pr = p && p.getPlayerResponse ? p.getPlayerResponse() : null; } catch (e) { /* not ready */ }
    pr = pr || window.ytInitialPlayerResponse || null;
    const r = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer;
    const name = n => (n && (n.simpleText || (n.runs || []).map(x => x.text).join(''))) || '';
    const vd = (pr && pr.videoDetails) || {};
    const mf = (pr && pr.microformat && pr.microformat.playerMicroformatRenderer) || {};
    return {
      videoId: vd.videoId,
      title: vd.title,
      // what the video says about itself: the context the app can read (game, characters)
      details: {title: vd.title || '', description: (vd.shortDescription || '').slice(0, 3000),
                keywords: (vd.keywords || []).slice(0, 40), channel: vd.author || '', channelId: vd.channelId || '',
                category: mf.category || ''},
      tracks: ((r && r.captionTracks) || []).map(t => ({lang: t.languageCode, kind: t.kind || '', name: name(t.name), url: t.baseUrl}))
    };
  }

  window.addEventListener('message', async ev => {
    const m = ev.data;
    if (ev.source !== window || !m || m.source !== 'livesub-cs') return;
    if (m.type === 'info') {
      post('info', {id: m.id, info: info()});
    } else if (m.type === 'captured') {
      post('captured', {id: m.id, items: captured.slice()});
    } else if (m.type === 'enableCaptions') {
      const p = player();
      try {
        if (p && p.loadModule) p.loadModule('captions');
        if (p && p.setOption) p.setOption('captions', 'track', {languageCode: m.lang || 'en'});
      } catch (e) { /* older player */ }
      post('enabled', {id: m.id});
    } else if (m.type === 'fetchTrack') {
      let body = '';
      try {
        const url = m.url + (m.url.indexOf('fmt=') >= 0 ? '' : '&fmt=json3');
        body = await (await origFetch(url, {credentials: 'include'})).text();
      } catch (e) { /* refused */ }
      post('fetched', {id: m.id, body});
    }
  });
})();
