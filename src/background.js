// Service worker: the only part that talks to the AI endpoint the user configured (OpenAI-compatible
// /chat/completions). It holds no state; the content script sends one request at a time and gets the text back.
// The endpoint's origin must have been granted in the popup ("Lưu và kiểm tra"), nothing else is reachable.
importScripts('core.js');
const C = self.LivesubCore;

async function settings() {
  const s = await chrome.storage.sync.get({endpoint: '', model: ''});
  const l = await chrome.storage.local.get({apiKey: ''});
  return {endpoint: String(s.endpoint || '').trim(), model: String(s.model || '').trim(), key: String(l.apiKey || '').trim()};
}

function originOf(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('BAD_ENDPOINT');
  return `${u.protocol}//${u.hostname}/*`;
}

async function chat(body, timeoutMs) {
  const c = await settings();
  if (!c.endpoint) throw new Error('NO_ENDPOINT');
  if (!c.model) throw new Error('NO_MODEL');
  const url = C.chatUrl(c.endpoint);
  let origin;
  try { origin = originOf(url); } catch (e) { throw new Error('BAD_ENDPOINT'); }
  if (!(await chrome.permissions.contains({origins: [origin]}))) throw new Error('NO_PERMISSION');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 45000);
  const t0 = performance.now();
  try {
    const headers = {'Content-Type': 'application/json'};
    if (c.key) headers.Authorization = 'Bearer ' + c.key;
    const r = await fetch(url, {method: 'POST', headers, body: JSON.stringify(Object.assign({model: c.model}, body)),
                                signal: ctl.signal});
    const raw = await r.text();
    let j = null;
    try { j = JSON.parse(raw); } catch (e) { /* not json */ }
    if (!r.ok) {
      const msg = j && ((j.error && (j.error.message || j.error)) || j.message || j.detail);
      throw new Error(`HTTP ${r.status}: ${String(msg || raw).slice(0, 200)}`);
    }
    const ch = j && j.choices && j.choices[0];
    const text = (ch && ((ch.message && ch.message.content) || ch.text)) || '';
    return {text, ms: Math.round(performance.now() - t0), usage: (j && j.usage) || null};
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('TIMEOUT');
    if (e instanceof TypeError) throw new Error('NETWORK: ' + e.message);    // unreachable, refused, TLS...
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    if (m && m.type === 'chat') return chat(m.body);
    if (m && m.type === 'test') {
      return chat({messages: [{role: 'user', content: 'Translate the following text into Vietnamese. Note that you ' +
                   'should only output the translated result without any additional explanation:\n\nGood morning, everyone.'}],
                   temperature: 0, max_tokens: 40, stream: false}, 20000);
    }
    throw new Error('unknown request');
  })().then(reply, e => reply({error: String((e && e.message) || e)}));
  return true;
});

chrome.runtime.onInstalled.addListener(d => {         // first install: open the settings once
  if (d.reason === 'install') chrome.tabs.create({url: chrome.runtime.getURL('src/popup.html?welcome=1')});
});
