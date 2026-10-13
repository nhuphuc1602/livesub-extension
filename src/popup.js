// Settings (chrome.storage.sync; the API key in chrome.storage.local), the languages, the AI connection, the status of
// the current YouTube tab (asked to its content script), corrections and the per-video / per-channel context.
(() => {
  'use strict';
  const C = window.LivesubCore;
  const I = window.LivesubI18n, T = I.t;
  const D = C.DEFAULTS;
  const F = C.CTX_FIELDS;
  const $ = id => document.getElementById(id);
  const checks = ['enabled', 'showEn', 'hideYt', 'autoCaptions', 'mergeAsr', 'learnTerms'];
  const sliders = ['size', 'bottom', 'box', 'color'];
  const langs = ['sourceLang', 'targetLang', 'uiLang'];
  let cfg = Object.assign({}, D);                       // the settings as last read or set here
  let cur = null;                                       // {vid, channelId} once the context form is filled
  let fix = null, fixTab = null, lastStatus = null;     // the line being corrected
  let termsShown = '';                                  // the key terms on display
  const hostOf = u => { try { return new URL(u).host; } catch (e) { return u; } };
  const scope = () => document.querySelector('input[name=scope]:checked').value;
  const keyFor = sc => C.ctxKeys(cur.vid, cur.channelId)[sc];
  if (new URLSearchParams(location.search).has('welcome')) document.body.classList.add('page');

  try { $('ver').textContent = 'v' + chrome.runtime.getManifest().version; } catch (e) { /* not in Chrome */ }
  I.use(cfg);
  I.apply(document);

  // --- settings ----------------------------------------------------------------------------------------------
  chrome.storage.sync.get(D, s => {
    cfg = Object.assign({}, D, s);
    for (const k of checks) {
      $(k).checked = !!s[k];
      $(k).addEventListener('change', () => chrome.storage.sync.set({[k]: $(k).checked}));
    }
    for (const k of sliders) {
      $(k).value = s[k];
      $(k).addEventListener('input', () => chrome.storage.sync.set({[k]: $(k).type === 'range' ? Number($(k).value) : $(k).value}));
    }
    for (const k of langs) {
      $(k).addEventListener('change', () => {
        cfg[k] = $(k).value;
        chrome.storage.sync.set({[k]: cfg[k]});
        relabel();
      });
    }
    $('endpoint').value = s.endpoint || '';
    $('model').value = s.model || '';
    $('style').value = s.style || 'auto';
    $('ahead').value = String(s.ahead || 'all');
    $('parallel').value = s.parallel || 4;
    relabel();
  });
  chrome.storage.local.get({apiKey: ''}, l => { $('apiKey').value = l.apiKey || ''; });

  // --- languages: of the captions, of the translation, of this page ------------------------------------------
  function langLabel(l) {                               // "Tiếng Nhật · 日本語", "Japanese · 日本語", "Tiếng Anh"
    const d = C.displayName(l.code, I.lang) || l.own;
    return /[^\p{Script=Latin}\p{P}\s]/u.test(l.own) && d !== l.own ? `${d} · ${l.own}` : d;
  }
  function fillLangs() {
    for (const k of ['sourceLang', 'targetLang']) {
      const sel = $(k);
      sel.textContent = '';
      if (k === 'sourceLang') sel.append(new Option(T('sourceAuto'), 'auto'));
      for (const l of C.LANGS) sel.append(new Option(langLabel(l), l.code));
      sel.value = cfg[k];
      if (sel.value !== cfg[k]) { sel.append(new Option(cfg[k], cfg[k])); sel.value = cfg[k]; }   // a code set elsewhere
    }
    $('uiLang').value = cfg.uiLang || 'auto';
  }
  const toVi = () => C.sameLang(cfg.targetLang, 'vi');
  // every text again in the UI language; the parts that depend on the languages
  function relabel() {
    I.use(cfg);
    I.apply(document);
    fillLangs();
    showAi(cfg);
    $('langNote').hidden = toVi() && ['en', 'auto'].includes(cfg.sourceLang);
    $('c_self').placeholder = toVi() ? 'mình' : '';
    $('c_address').placeholder = toVi() ? 'các bạn' : '';
    termsShown = '';
    if (fix) $('fixEn').textContent = fix.en;
    if (lastStatus) { context(lastStatus); fixLine(lastStatus, fixTab); }
  }

  function showAi(s) {
    const el = $('ai');
    if (!s.endpoint || !s.model) {
      el.className = 'bad';
      el.textContent = T('noAi');
      $('aiBox').open = true;
    } else {
      el.className = 'ok';
      el.textContent = `AI: ${s.model} · ${hostOf(s.endpoint)}`;
    }
  }
  $('preset').addEventListener('change', () => {
    const [ep, model] = $('preset').value.split('|');
    if (ep) { $('endpoint').value = ep; if (model) $('model').value = model; }
  });

  $('save').addEventListener('click', () => {
    const endpoint = $('endpoint').value.trim(), model = $('model').value.trim();
    let origin;
    try {
      const u = new URL(C.chatUrl(endpoint));
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      origin = `${u.protocol}//${u.hostname}/*`;
    } catch (e) {
      $('aiMsg').className = 'msg bad';
      $('aiMsg').textContent = T('badEndpoint');
      return;
    }
    // asked right in the click (Chrome needs the user gesture): access to this one endpoint only
    chrome.permissions.request({origins: [origin]}, granted => {
      void chrome.runtime.lastError;
      if (!granted) {
        $('aiMsg').className = 'msg bad';
        $('aiMsg').textContent = T('noPerm', {host: hostOf(endpoint)});
        return;
      }
      const s = {endpoint, model, style: $('style').value, ahead: $('ahead').value,
                 parallel: Math.max(1, Math.min(16, Number($('parallel').value) || 4))};
      chrome.storage.local.set({apiKey: $('apiKey').value.trim()}, () => {
        chrome.storage.sync.set(s, () => {
          Object.assign(cfg, s);
          showAi(cfg);
          $('aiMsg').className = 'msg';
          $('aiMsg').textContent = T('testing');
          chrome.runtime.sendMessage({type: 'test'}, r => {
            void chrome.runtime.lastError;
            if (!r || r.error) {
              $('aiMsg').className = 'msg bad';
              $('aiMsg').textContent = T('error', {e: (r && r.error) || T('noReply')});
            } else {
              $('aiMsg').className = 'msg';
              $('aiMsg').textContent = `OK (${r.ms} ms): "${C.tidy(r.text, C.langName(cfg.targetLang))}"`;
            }
          });
        });
      });
    });
  });

  // --- the current tab -----------------------------------------------------------------------------------------
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    const tab = tabs && tabs[0];
    if (!tab || /welcome/.test(location.search)) return;
    const show = () => chrome.tabs.sendMessage(tab.id, {type: 'status'}, r => {
      void chrome.runtime.lastError;
      if (!r) {
        const yt = /^https:\/\/www\.youtube\.com\//.test(tab.url || '');
        $('video').textContent = !tab.url || yt ? T('noPage') : T('openVideo');
        return;
      }
      $('video').textContent = r.title ? r.title : (r.vid ? r.vid : T('notVideo'));
      $('progress').textContent = r.status || '';
      context(r);
      fixLine(r, tab);
    });
    show();
    setInterval(show, 1000);
  });

  // --- context for this video / its channel ----------------------------------------------------------------
  function gameName(g) { return g === C.GENERAL ? T('generalVideo') : g || '?'; }

  function describe(c) {
    if (!c) return T('waitCaptions');
    const a = c.auto || {};
    const parts = [T('autoFrom', {game: gameName(a.game)})];
    if (a.viewers) parts.push(T('hostViewers'));
    if (a.conversation) parts.push(T('manyPeople'));
    return parts.join(', ') + '.';
  }

  function shortContext(r) {
    if (!r.vid) return '';
    const c = r.context;
    if (!c) return r.mode === 'live' ? T('ctxLive') : T('ctxWaiting');
    const parts = [gameName(c.game)];
    if (c.auto && c.auto.conversation) parts.push(T('conversation'));
    if (c.speaker || c.listener) parts.push(T('talksTo', {a: c.speaker || '?', b: c.listener || '?'}));
    if (c.self || c.address) {
      parts.push(T('pair', {self: c.self || '?', address: c.address || '?'}) +
                 (c.source && c.source.pair === 'auto' ? T('pairAuto') : ''));
    }
    if (c.glossary_terms) parts.push(T('userTerms', {n: c.glossary_terms}));
    return parts.join(' · ');
  }

  // key terms found in the video's text: one click puts "term = " in the Terms field for the user to complete
  function showTerms(c) {
    const terms = (c && c.terms) || [];
    const sig = terms.map(t => t.en).join('|');
    if (sig === termsShown) return;
    termsShown = sig;
    const box = $('terms');
    box.textContent = '';
    if (!terms.length) return;
    box.append(T('termsIntro'));
    for (const t of terms) {
      const b = document.createElement('span');
      b.className = 'chip';
      b.textContent = `${t.en} ×${t.n}`;
      b.title = T('termAdd');
      b.addEventListener('click', () => {
        const ta = $('c_glossary');
        const has = ta.value.split('\n').some(l => l.split('=')[0].trim().toLowerCase() === t.en.toLowerCase());
        if (!has) ta.value = (ta.value.trim() ? ta.value.replace(/\s*$/, '\n') : '') + t.en + ' = ';
        $('ctxBox').open = true;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
      box.append(b);
    }
  }

  function showLearned(list) {
    const el = $('learned');
    if (!list || !list.length) { el.textContent = ''; return; }
    el.textContent = T('learnedIntro') + list.map(x => `${x.en} = ${x.vi} (` + T('learnedOf', {k: x.support, n: x.lines}) +
      (x.fixed ? T('learnedFixed', {n: x.fixed}) : '') + ')').join(' · ');
  }

  function fill(sc) {
    const k = keyFor(sc);
    if (!k) return;
    chrome.storage.local.get(k, got => {
      const v = (got && got[k]) || {};
      for (const f of F) $('c_' + f).value = v[f] || '';
    });
  }

  function context(r) {
    showTerms(r.context);
    showLearned(r.learned);
    const line = shortContext(r);
    $('ctxLine').textContent = '';
    if (line) {
      const b = document.createElement('b');
      b.textContent = T('ctxLabel');
      $('ctxLine').append(b, line);
    }
    $('auto').textContent = r.vid ? describe(r.context) : T('ctxEdit');
    if (r.context && r.context.auto) $('c_game').placeholder = r.context.auto.game || '';
    if (!r.vid || (cur && cur.vid === r.vid)) return;
    cur = {vid: r.vid, channelId: r.channelId || ''};
    $('chName').textContent = r.channel ? '(' + r.channel + ')' : '';
    document.querySelector('input[value=channel]').disabled = !cur.channelId;
    const k = C.ctxKeys(cur.vid, cur.channelId);
    chrome.storage.local.get([k.video, k.channel].filter(Boolean), got => {   // open on the scope that has something
      const sc = got && got[k.video] ? 'video' : (got && k.channel && got[k.channel] ? 'channel' : 'video');
      document.querySelector(`input[value=${sc}]`).checked = true;
      if (got && (got[k.video] || got[k.channel])) $('ctxBox').open = true;
      fill(sc);
    });
  }

  // --- correcting the line on screen ---------------------------------------------------------------------------
  function loadFix(r) {
    if (!r || !r.cur) return;
    fix = {i: r.cur.i, en: r.cur.en};
    $('fixEn').textContent = r.cur.en;
    $('fixVi').value = r.cur.vi || '';
  }
  function fixLine(r, tab) {
    fixTab = tab;
    lastStatus = r;
    if (!fix && r && r.cur && document.activeElement !== $('fixVi')) loadFix(r);   // the line when the popup opened
    if (r && r.mode && r.mode !== 'track') $('fixMsg').textContent = T('fixOnlyTrack');
  }
  $('fixLoad').addEventListener('click', () => { fix = null; loadFix(lastStatus); });
  $('fixSave').addEventListener('click', () => {
    const vi = $('fixVi').value.trim();
    if (!fix || !vi || !fixTab) return;
    chrome.tabs.sendMessage(fixTab.id, {type: 'correct', i: fix.i, vi}, r => {
      void chrome.runtime.lastError;
      if (!r || r.error) { $('fixMsg').textContent = T('error', {e: (r && r.error) || T('notSent')}); return; }
      const l = r.learned || {};
      $('fixMsg').textContent = Object.keys(l).length
        ? T('fixLearned', {what: (l.self ? T('learnSelf', {v: l.self}) : '') + (l.address ? T('learnAddr', {v: l.address}) : '')})
        : T('fixSaved');
      if (cur) fill(scope());
    });
  });

  document.querySelectorAll('input[name=scope]').forEach(el => el.addEventListener('change', () => cur && fill(scope())));
  $('apply').addEventListener('click', () => {
    if (!cur) return;
    const v = {};
    for (const f of F) { const x = $('c_' + f).value.trim(); if (x) v[f] = x; }
    const k = keyFor(scope());
    const done = () => { $('saved').textContent = T('savedRedo'); setTimeout(() => { $('saved').textContent = ''; }, 2500); };
    if (Object.keys(v).length) chrome.storage.local.set({[k]: v}, done);
    else chrome.storage.local.remove(k, done);
  });
  $('clear').addEventListener('click', () => {
    if (!cur) return;
    for (const f of F) $('c_' + f).value = '';
    chrome.storage.local.remove(keyFor(scope()), () => { $('saved').textContent = T('cleared'); });
  });
})();
