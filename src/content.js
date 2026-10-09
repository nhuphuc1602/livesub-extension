// YouTube watch pages: the English caption track (via page.js) becomes Vietnamese lines drawn over the player.
// The translation engine runs here, one per tab: lines are planned with their context (core.js), translated ahead
// through the service worker (the user's AI endpoint), nearest the playback position first, cached by request,
// then key terms are learned from the translations and the odd lines are translated again. Videos without a track:
// the captions on screen are translated one line at a time.
(() => {
  'use strict';
  const C = window.LivesubCore;
  let S = Object.assign({}, C.DEFAULTS);

  const st = {gen: 0, vid: null, title: null, details: null, mode: 'idle', status: '', url: null, body: null,
              job: null, lines: [], cur: -1, live: null, context: null};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const video = () => document.querySelector('#movie_player video') || document.querySelector('video');
  const now = () => { const v = video(); return v ? v.currentTime : 0; };
  const setStatus = s => { st.status = s; };
  const ERR = {
    NO_ENDPOINT: 'Chưa có endpoint AI: bấm biểu tượng livesub để nhập',
    NO_MODEL: 'Chưa nhập tên model (bấm biểu tượng livesub)',
    NO_PERMISSION: 'Chưa cấp quyền gọi endpoint: mở livesub, bấm "Lưu và kiểm tra"',
    BAD_ENDPOINT: 'Endpoint không hợp lệ (cần http:// hoặc https://)',
    TIMEOUT: 'Endpoint không trả lời kịp (quá 45 giây)',
    RELOADED: 'Extension vừa được cập nhật: tải lại trang (F5)',
    NO_ANSWER: 'Extension không phản hồi: tải lại trang (F5)'
  };
  const errText = e => ERR[e] || (/^NETWORK/.test(e) ? 'Không kết nối được endpoint AI: ' + e.slice(9) : e);
  const BLOCKING = /^(?:NO_ENDPOINT|NO_MODEL|NO_PERMISSION|BAD_ENDPOINT|RELOADED|NO_ANSWER|HTTP 40[0134])/;

  // --- page.js (inside the page) -------------------------------------------------------------------------------
  let reqId = 0;
  const waiters = new Map();
  window.addEventListener('message', ev => {
    const m = ev.data;
    if (ev.source !== window || !m || m.source !== 'livesub-page') return;
    if (m.type === 'timedtext') { onTrackLoaded(m.url, m.body); return; }
    const w = waiters.get(m.id);
    if (w) { waiters.delete(m.id); w(m); }
  });
  function ask(type, extra, timeout) {
    return new Promise(res => {
      const id = ++reqId;
      waiters.set(id, res);
      window.postMessage(Object.assign({source: 'livesub-cs', type, id}, extra || {}), '*');
      setTimeout(() => { if (waiters.delete(id)) res(null); }, timeout || 3000);
    });
  }

  // --- the service worker (AI endpoint) and storage ------------------------------------------------------------
  function bg(msg) {
    return new Promise(res => {
      try {
        chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r || {error: 'NO_ANSWER'}); });
      } catch (e) {
        res({error: 'RELOADED'});
      }
    });
  }
  const sget = keys => new Promise(r => chrome.storage.local.get(keys, x => { void chrome.runtime.lastError; r(x || {}); }));
  const sset = obj => new Promise(r => chrome.storage.local.set(obj, () => { void chrome.runtime.lastError; r(); }));
  const sdel = keys => new Promise(r => chrome.storage.local.remove(keys, () => { void chrome.runtime.lastError; r(); }));
  async function sha1(s) {
    const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // cache: "c:<sha1 of endpoint, model, request>" -> translation; per video "ck:<id>" lists its keys; the 60 most
  // recently opened videos are kept
  let cacheBuf = {}, cacheTimer = null;
  function cachePut(hash, vi) {
    cacheBuf['c:' + hash] = vi;
    if (!cacheTimer) cacheTimer = setTimeout(flushCache, 1500);
  }
  async function flushCache() {
    cacheTimer = null;
    const buf = cacheBuf, vid = st.vid;
    cacheBuf = {};
    if (!vid || !Object.keys(buf).length) return;
    const ck = 'ck:' + vid;
    const got = await sget([ck, 'cvids']);
    const keys = Array.from(new Set((got[ck] || []).concat(Object.keys(buf))));
    let vids = (got.cvids || []).filter(v => v !== vid).concat([vid]);
    const drop = vids.length > 60 ? vids.slice(0, vids.length - 60) : [];
    vids = vids.slice(-60);
    await sset(Object.assign({}, buf, {[ck]: keys, cvids: vids}));
    for (const old of drop) {
      const k = 'ck:' + old;
      const o = await sget(k);
      await sdel((o[k] || []).concat([k]));
    }
  }

  // --- one video ---------------------------------------------------------------------------------------------
  function stopJob() {
    if (st.job) st.job.stopped = true;
    st.job = null;
  }
  function reset(vid) {
    st.gen++;
    stopJob();
    Object.assign(st, {vid, title: null, details: null, mode: 'idle', status: '', url: null, body: null, lines: [],
                       cur: -1, live: null, context: null, track: null, askedOnPlay: false});
    stopLive();
  }

  async function start(vid) {
    reset(vid);
    const gen = st.gen;
    if (!vid) return;
    if (!S.enabled) { st.mode = 'off'; setStatus('Đang tắt'); return; }
    let info = null;
    for (let i = 0; i < 12 && gen === st.gen; i++) {
      const r = await ask('info');
      info = r && r.info;
      if (info && info.videoId === vid) break;
      await sleep(500);
    }
    if (gen !== st.gen) return;
    st.title = info && info.title;
    st.details = info && info.videoId === vid ? info.details : {title: st.title || ''};
    const got = await ask('captured');
    const have = ((got && got.items) || []).reverse().find(c => C.usableTrack(c.url, vid) && c.body.length > 20);
    if (have) return openTrack(have.url, have.body);
    const track = info && info.videoId === vid ? C.pickTrack(info.tracks) : null;
    st.track = track;
    if (!track) {
      st.mode = 'live';
      setStatus('Video không có phụ đề tiếng Anh: dịch từng câu phụ đề đang hiện (nếu có)');
      startLive();
      return;
    }
    st.mode = 'waiting';
    setStatus('Đang lấy phụ đề tiếng Anh…');
    if (S.autoCaptions) await ask('enableCaptions', {lang: track.lang});
    for (let i = 0; i < 10 && gen === st.gen && st.mode === 'waiting'; i++) await sleep(300);
    if (gen !== st.gen || st.mode !== 'waiting') return;
    const f = await ask('fetchTrack', {url: track.url}, 8000);
    if (gen !== st.gen || st.mode !== 'waiting') return;
    if (f && f.body && f.body.length > 20) return openTrack(track.url, f.body);
    st.mode = 'live';
    setStatus('Không tải được cả bài phụ đề (hãy bật CC): dịch từng câu đang hiện');
    startLive();
  }

  // the player loaded a caption track: also later, once the video plays (autoplay blocked, captions turned on late)
  function onTrackLoaded(url, body) {
    if (!st.vid || !['waiting', 'live'].includes(st.mode) || !C.usableTrack(url, st.vid) || !body || body.length <= 20) return;
    stopLive();
    openTrack(url, body);
  }

  // the user's context for this video: its channel's, then the video's own (popup), field by field
  async function userContext() {
    const k = C.ctxKeys(st.vid, st.details && st.details.channelId);
    const got = await sget([k.video, k.channel].filter(Boolean));
    return C.mergeCtx(got[k.channel], got[k.video]);
  }

  function contextView(ctx) {
    const have = new Set(Object.keys(ctx.glossary || {}).map(x => x.toLowerCase()));
    return {game: ctx.game, speaker: ctx.speaker, listener: ctx.listener, self: ctx.self, address: ctx.address,
            glossary_terms: Object.keys(ctx.glossary || {}).length, source: ctx.source,
            auto: {game: ctx.auto.game, viewers: !!ctx.auto.viewers, conversation: !!ctx.auto.conversation},
            terms: (ctx.auto.terms || []).filter(t => !have.has(t.en.toLowerCase()))};
  }

  async function openTrack(url, body) {
    const gen = st.gen;
    st.url = url;
    st.body = body;
    stopJob();
    const cues = C.parseTrack(body, S.mergeAsr);
    if (!cues.length) { st.mode = 'live'; startLive(); return; }
    const ctx = C.mergeContext(C.autoContext(st.details, cues, C.GENERAL), await userContext());
    ctx.title = st.title;
    const style = C.pickStyle(S.style, S.model);
    const items = C.planTrack(cues, ctx);
    for (const it of items) {
      it.body = C.makeBody(style, it, ctx);
      it.hash = await sha1(JSON.stringify([S.endpoint, S.model, it.body]));
    }
    const fixKey = 'fix:' + st.vid;
    const got = await sget(items.map(it => 'c:' + it.hash).concat([fixKey]));
    if (gen !== st.gen) return;
    const fixes = got[fixKey] || {};
    const job = {cues, items, ctx, style, results: new Map(), pending: new Set(), inflight: 0, learned: {},
                 learnDone: false, errors: 0, stopped: false, lastError: null};
    for (const it of items) {
      if (fixes[it.en]) job.results.set(it.i, {vi: fixes[it.en], src: 'corrected'});
      else if (got['c:' + it.hash]) job.results.set(it.i, {vi: got['c:' + it.hash], src: 'cache'});
      else job.pending.add(it.i);
    }
    Object.assign(st, {job, lines: cues, context: contextView(ctx), mode: 'track'});
    for (let k = 0; k < Math.max(1, Math.min(16, +S.parallel || 4)); k++) worker(job);
  }

  function pickNext(job) {
    const t = now();
    const ahead = S.ahead === 'all' ? Infinity : (+S.ahead || 120);
    let best = null;
    for (const i of job.pending) {
      const c = job.cues[i];
      if (c.end < t - 1 || c.start > t + ahead) continue;
      if (best === null || c.start < job.cues[best].start) best = i;
    }
    if (best === null && S.ahead === 'all') {           // nothing left ahead: the lines already passed
      for (const i of job.pending) if (best === null || job.cues[i].start > job.cues[best].start) best = i;
    }
    return best;
  }

  async function worker(job) {
    while (!job.stopped) {
      const i = pickNext(job);
      if (i === null) {
        if (!job.pending.size && !job.inflight) await maybeLearn(job);
        await sleep(400);
        continue;
      }
      job.pending.delete(i);
      job.inflight++;
      const it = job.items[i];
      const r = await bg({type: 'chat', body: it.body});
      job.inflight--;
      if (job.stopped) return;
      if (r.error) {
        job.errors++;
        job.lastError = r.error;
        if (BLOCKING.test(r.error)) { job.pending.add(i); job.stopped = true; return; }
        if (/^(?:HTTP 429|HTTP 5\d\d|NETWORK|TIMEOUT)/.test(r.error)) {   // busy, rate-limited or down: wait, retry
          job.pending.add(i);
          await sleep(5000);
          continue;
        }
        it.tries = (it.tries || 0) + 1;
        if (it.tries <= 2) { job.pending.add(i); await sleep(1500); } else job.results.set(i, {vi: null, error: r.error});
        continue;
      }
      const vi = C.tidy(r.text);
      const res = job.results.get(i);
      if (!(res && res.src === 'corrected')) job.results.set(i, {vi, src: it.learned ? 'learned' : 'model'});
      job.lastError = null;
      if (vi) cachePut(it.hash, vi);
    }
  }

  // once everything is translated: a key term rendered one way most of the time fixes the lines that differ
  async function maybeLearn(job) {
    if (!S.learnTerms || job.learnDone || job.stopped || job.pending.size || job.inflight) return;
    if (job.results.size < job.items.length || [...job.results.values()].some(r => !r.vi)) return;
    job.learnDone = true;
    const pairs = job.items.filter(it => job.results.get(it.i).src !== 'corrected').map(it => [it.en, job.results.get(it.i).vi]);
    const skip = Object.keys(job.ctx.glossary || {});
    const learned = C.learnTerms(pairs, C.keyTerms(pairs.map(p => p[0]), {limit: 12, skip}), {skip});
    const todo = [];
    for (const it of job.items) {
      const res = job.results.get(it.i);
      if (res.src === 'corrected') continue;
      const add = {};
      for (const [en, d] of Object.entries(learned)) {
        if (C.termRx(en).test(it.en) && !String(res.vi).toLowerCase().includes(d.vi)) add[en] = d.vi;
      }
      if (!Object.keys(add).length) continue;
      const fixed = Object.assign({}, it, {glossary: Object.assign({}, it.glossary, add), learned: add});
      fixed.body = C.makeBody(job.style, fixed, job.ctx);
      fixed.hash = await sha1(JSON.stringify([S.endpoint, S.model, fixed.body]));
      todo.push(fixed);
    }
    for (const en of Object.keys(learned)) learned[en].fixed = todo.filter(f => en in f.learned).length;
    job.learned = learned;
    const got = await sget(todo.map(f => 'c:' + f.hash));
    for (const f of todo) {
      job.items[f.i] = f;
      if (got['c:' + f.hash]) job.results.set(f.i, {vi: got['c:' + f.hash], src: 'learned'});
      else job.pending.add(f.i);
    }
  }

  function trackStatus() {
    const job = st.job;
    if (!job) return st.status;
    const done = [...job.results.values()].filter(r => r.vi).length, total = job.items.length;
    if (job.stopped && job.lastError) return errText(job.lastError);
    const fixing = job.learnDone ? job.pending.size + job.inflight : 0;
    let s = fixing ? `Đã dịch ${done}/${total} câu · đang sửa ${fixing} câu theo thuật ngữ đã học…`
      : (done >= total ? `Đã dịch ${done}/${total} câu` : `Đang dịch ${done}/${total} câu…`);
    if (job.lastError) s += ` (lỗi: ${errText(job.lastError)})`;
    return s;
  }

  // --- no track: the captions on screen, one line at a time ------------------------------------------------
  let liveIv = null, lastText = '', lastChange = 0, lastSent = '', liveHist = [], liveCues = [];
  const shownCaption = () => Array.from(document.querySelectorAll('.ytp-caption-window-container .ytp-caption-segment'))
    .map(e => e.textContent).join(' ').replace(/\s+/g, ' ').trim();
  function startLive() {
    st.live = {vi: '', en: ''};
    lastText = lastSent = '';
    liveHist = [];
    liveCues = [];
    if (!liveIv) liveIv = setInterval(liveTick, 250);
  }
  function stopLive() { clearInterval(liveIv); liveIv = null; }
  async function liveTick() {
    if (st.mode !== 'live' || !S.enabled) return;
    const t = shownCaption();
    if (t !== lastText) { lastText = t; lastChange = Date.now(); return; }
    if (!t || t === lastSent || Date.now() - lastChange <= 600) return;   // held still: a finished line
    lastSent = t;
    const gen = st.gen, en = C.clean(t);
    if (!en) return;
    liveCues.push({start: now(), end: now() + 2, text: en});
    const ctx = C.mergeContext(C.autoContext(st.details, liveCues, C.GENERAL), await userContext());
    ctx.title = st.title;
    st.context = contextView(ctx);
    const item = {en, history: liveHist.slice(-4), speaker: ctx.speaker, listener: ctx.listener, self: ctx.self,
                  address: ctx.address, glossary: new C.Glossary(ctx.glossary).match(en)};
    liveHist.push(en);
    const r = await bg({type: 'chat', body: C.makeBody(C.pickStyle(S.style, S.model), item, ctx)});
    if (gen !== st.gen) return;
    if (r.error) { setStatus(errText(r.error)); return; }
    st.live = {vi: C.tidy(r.text), en: t};
    setStatus(`Đang dịch từng câu (${liveCues.length} câu)`);
  }

  // --- drawing ---------------------------------------------------------------------------------------------
  let box = null, viEl = null, enEl = null, shown = ['', '', false];
  function ensureBox() {
    const p = document.getElementById('movie_player');
    if (!p) return null;
    if (!box || box.parentElement !== p) {
      box = document.createElement('div');
      box.className = 'livesub-box';
      viEl = document.createElement('div');
      viEl.className = 'livesub-vi';
      enEl = document.createElement('div');
      enEl.className = 'livesub-en';
      box.append(viEl, enEl);
      p.appendChild(box);
      shown = ['', '', false];
    }
    return box;
  }

  function render() {
    const b = ensureBox();
    if (!b) return;
    const p = b.parentElement;
    const active = S.enabled && (st.mode === 'track' || st.mode === 'live');
    p.classList.toggle('livesub-hide-yt', active && S.hideYt);
    let vi = '', en = '', pending = false;
    if (active && st.mode === 'track' && st.job) {
      const i = C.findCue(st.lines, now());
      st.cur = i;
      if (i >= 0) {
        en = st.job.items[i].en;
        const r = st.job.results.get(i);
        vi = (r && r.vi) || '';
        if (!vi) { vi = en; pending = true; }                            // not translated yet: the English, dimmed
      }
    } else if (active && st.live && st.live.vi && st.live.en === lastText) {
      vi = st.live.vi;
      en = st.live.en;
    }
    const showEn = S.showEn && !pending ? en : '';
    if (vi !== shown[0] || showEn !== shown[1] || pending !== shown[2]) {
      viEl.textContent = vi;
      enEl.textContent = showEn;
      enEl.style.display = showEn ? '' : 'none';
      b.classList.toggle('livesub-pending', pending);
      shown = [vi, showEn, pending];
    }
    b.style.display = vi ? '' : 'none';
    const h = p.clientHeight || 360;
    b.style.fontSize = Math.max(12, h * S.size / 100).toFixed(1) + 'px';
    b.style.bottom = S.bottom + '%';
    b.style.color = S.color;
    b.style.background = `rgba(8, 8, 12, ${S.box})`;
  }

  // --- corrections from the popup ----------------------------------------------------------------------------
  async function correct(i, vi) {
    const job = st.job;
    if (!job || !job.items[i]) return {error: 'Không có câu này'};
    const it = job.items[i];
    const before = (job.results.get(i) || {}).vi || '';
    job.results.set(i, {vi, src: 'corrected'});
    const fk = 'fix:' + st.vid;
    const got = await sget(fk);
    await sset({[fk]: Object.assign({}, got[fk] || {}, {[it.en]: vi})});
    const learned = C.learnedPair(before, vi);
    if (Object.keys(learned).length) {                    // kept as the video's pronoun pair: the rest follows it
      const k = C.ctxKeys(st.vid, null).video;
      const cur = (await sget(k))[k] || {};
      await sset({[k]: Object.assign({}, cur, learned)});
    }
    return {ok: true, learned};
  }

  // --- wiring ----------------------------------------------------------------------------------------------
  function check() {
    const v = C.videoIdOf(location.href);
    if (v !== st.vid) start(v);
  }

  chrome.storage.sync.get(C.DEFAULTS, s => {
    S = Object.assign({}, C.DEFAULTS, s);
    check();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      const k = C.ctxKeys(st.vid, st.details && st.details.channelId);
      const again = changes[k.video] || changes[k.channel] || changes.apiKey;
      if (again && st.body && st.mode === 'track') openTrack(st.url, st.body);
      return;
    }
    const was = S.enabled;
    for (const k in changes) S[k] = changes[k].newValue;
    if (S.enabled !== was) start(st.vid);
    else if (['mergeAsr', 'learnTerms', 'endpoint', 'model', 'style', 'parallel'].some(k => k in changes) && st.body) {
      openTrack(st.url, st.body);
    } else if (['endpoint', 'model'].some(k => k in changes) && st.mode !== 'track') start(st.vid);
  });
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (m && m.type === 'correct') { correct(m.i, m.vi).then(reply); return true; }
    if (m && m.type === 'status') {
      const job = st.job;
      const cur = st.mode === 'track' && job && st.cur >= 0 ? job.items[st.cur] : null;
      reply({vid: st.vid, title: st.title, mode: st.mode, context: st.context,
             status: st.mode === 'track' ? trackStatus() : st.status,
             learned: job ? Object.entries(job.learned).map(([en, d]) => Object.assign({en}, d)) : [],
             cur: cur ? {i: cur.i, en: cur.en, vi: (job.results.get(cur.i) || {}).vi || ''} : null,
             channelId: st.details && st.details.channelId, channel: st.details && st.details.channel});
    }
  });
  document.addEventListener('yt-navigate-finish', () => setTimeout(check, 200));
  document.addEventListener('playing', () => {          // the player loads captions once it plays: ask once more
    if (st.mode === 'live' && st.track && S.autoCaptions && !st.askedOnPlay) {
      st.askedOnPlay = true;
      ask('enableCaptions', {lang: st.track.lang});
    }
  }, true);
  setInterval(check, 1000);
  setInterval(render, 100);
})();
