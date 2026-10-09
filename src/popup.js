// Settings (chrome.storage.sync; the API key in chrome.storage.local), the AI connection, the status of the current
// YouTube tab (asked to its content script), corrections and the per-video / per-channel context.
(() => {
  'use strict';
  const C = window.LivesubCore;
  const D = C.DEFAULTS;
  const F = C.CTX_FIELDS;
  const $ = id => document.getElementById(id);
  const checks = ['enabled', 'showEn', 'hideYt', 'autoCaptions', 'mergeAsr', 'learnTerms'];
  const sliders = ['size', 'bottom', 'box', 'color'];
  let cur = null;                                       // {vid, channelId} once the context form is filled
  let fix = null, fixTab = null, lastStatus = null;     // the line being corrected
  const scope = () => document.querySelector('input[name=scope]:checked').value;
  const keyFor = sc => C.ctxKeys(cur.vid, cur.channelId)[sc];
  if (new URLSearchParams(location.search).has('welcome')) document.body.classList.add('page');

  try { $('ver').textContent = 'v' + chrome.runtime.getManifest().version; } catch (e) { /* not in Chrome */ }

  // --- settings ----------------------------------------------------------------------------------------------
  chrome.storage.sync.get(D, s => {
    for (const k of checks) {
      $(k).checked = !!s[k];
      $(k).addEventListener('change', () => chrome.storage.sync.set({[k]: $(k).checked}));
    }
    for (const k of sliders) {
      $(k).value = s[k];
      $(k).addEventListener('input', () => chrome.storage.sync.set({[k]: $(k).type === 'range' ? Number($(k).value) : $(k).value}));
    }
    $('endpoint').value = s.endpoint || '';
    $('model').value = s.model || '';
    $('style').value = s.style || 'auto';
    $('ahead').value = String(s.ahead || 'all');
    $('parallel').value = s.parallel || 4;
    showAi(s);
  });
  chrome.storage.local.get({apiKey: ''}, l => { $('apiKey').value = l.apiKey || ''; });

  function showAi(s) {
    const el = $('ai');
    if (!s.endpoint || !s.model) {
      el.className = 'bad';
      el.textContent = 'Chưa kết nối AI: mở "Kết nối AI" bên dưới để nhập endpoint và model.';
      $('aiBox').open = true;
    } else {
      el.className = 'ok';
      el.textContent = `AI: ${s.model} · ${hostOf(s.endpoint)}`;
    }
  }
  const hostOf = u => { try { return new URL(u).host; } catch (e) { return u; } };

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
      $('aiMsg').textContent = 'Endpoint chưa đúng (vd. https://api.openai.com/v1).';
      return;
    }
    // asked right in the click (Chrome needs the user gesture): access to this one endpoint only
    chrome.permissions.request({origins: [origin]}, granted => {
      void chrome.runtime.lastError;
      if (!granted) {
        $('aiMsg').className = 'msg bad';
        $('aiMsg').textContent = 'Chưa cấp quyền gọi ' + hostOf(endpoint) + '.';
        return;
      }
      const s = {endpoint, model, style: $('style').value, ahead: $('ahead').value,
                 parallel: Math.max(1, Math.min(16, Number($('parallel').value) || 4))};
      chrome.storage.local.set({apiKey: $('apiKey').value.trim()}, () => {
        chrome.storage.sync.set(s, () => {
          showAi(s);
          $('aiMsg').className = 'msg';
          $('aiMsg').textContent = 'Đang thử…';
          chrome.runtime.sendMessage({type: 'test'}, r => {
            void chrome.runtime.lastError;
            if (!r || r.error) {
              $('aiMsg').className = 'msg bad';
              $('aiMsg').textContent = 'Lỗi: ' + ((r && r.error) || 'không phản hồi');
            } else {
              $('aiMsg').className = 'msg';
              $('aiMsg').textContent = `OK (${r.ms} ms): "${C.tidy(r.text)}"`;
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
        $('video').textContent = !tab.url || yt ? 'Không có phản hồi từ trang: mở video YouTube, tải lại trang (F5).'
                                                : 'Mở một video YouTube để dùng.';
        return;
      }
      $('video').textContent = r.title ? r.title : (r.vid ? r.vid : 'Không phải trang video');
      $('progress').textContent = r.status || '';
      context(r);
      fixLine(r, tab);
    });
    show();
    setInterval(show, 1000);
  });

  // --- context for this video / its channel ----------------------------------------------------------------
  function gameName(g) { return g === C.GENERAL ? 'video thường' : g || '?'; }

  function describe(c) {
    if (!c) return 'Đang chờ phụ đề của video…';
    const a = c.auto || {};
    const parts = ['Tự nhận từ video: ' + gameName(a.game)];
    if (a.viewers) parts.push('người dẫn nói với người xem');
    if (a.conversation) parts.push('cuộc trò chuyện nhiều người');
    return parts.join(', ') + '.';
  }

  function shortContext(r) {
    if (!r.vid) return '';
    const c = r.context;
    if (!c) return r.mode === 'live' ? 'chưa có (đang dịch từng câu)' : 'đang chờ phụ đề…';
    const parts = [gameName(c.game)];
    if (c.auto && c.auto.conversation) parts.push('cuộc trò chuyện');
    if (c.speaker || c.listener) parts.push(`${c.speaker || '?'} nói với ${c.listener || '?'}`);
    if (c.self || c.address) {
      parts.push(`xưng "${c.self || '?'}" / gọi "${c.address || '?'}"` +
                 (c.source && c.source.pair === 'auto' ? ' (tự nhận: người dẫn nói với người xem)' : ''));
    }
    if (c.glossary_terms) parts.push(c.glossary_terms + ' thuật ngữ của bạn');
    return parts.join(' · ');
  }

  // key terms found in the video's text: one click puts "term = " in the Terms field for the user to complete
  let termsShown = '';
  function showTerms(c) {
    const terms = (c && c.terms) || [];
    const sig = terms.map(t => t.en).join('|');
    if (sig === termsShown) return;
    termsShown = sig;
    const box = $('terms');
    box.textContent = '';
    if (!terms.length) return;
    box.append('Thuật ngữ nổi bật trong video (bấm để thêm, rồi điền nghĩa): ');
    for (const t of terms) {
      const b = document.createElement('span');
      b.className = 'chip';
      b.textContent = `${t.en} ×${t.n}`;
      b.title = 'Thêm vào mục Thuật ngữ';
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
    el.textContent = 'Tự học từ các câu đã dịch: ' + list.map(x => `${x.en} = ${x.vi} (${x.support}/${x.lines} câu` +
      (x.fixed ? `, sửa ${x.fixed} câu lệch)` : ')')).join(' · ');
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
      b.textContent = 'Ngữ cảnh: ';
      $('ctxLine').append(b, line);
    }
    $('auto').textContent = r.vid ? describe(r.context) : 'Mở một video để chỉnh ngữ cảnh.';
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
    fix = {i: r.cur.i};
    $('fixEn').textContent = r.cur.en;
    $('fixVi').value = r.cur.vi || '';
  }
  function fixLine(r, tab) {
    fixTab = tab;
    lastStatus = r;
    if (!fix && r && r.cur && document.activeElement !== $('fixVi')) loadFix(r);   // the line when the popup opened
    if (r && r.mode && r.mode !== 'track') $('fixMsg').textContent = 'Chỉ sửa được khi video có bài phụ đề.';
  }
  $('fixLoad').addEventListener('click', () => { fix = null; loadFix(lastStatus); });
  $('fixSave').addEventListener('click', () => {
    const vi = $('fixVi').value.trim();
    if (!fix || !vi || !fixTab) return;
    chrome.tabs.sendMessage(fixTab.id, {type: 'correct', i: fix.i, vi}, r => {
      void chrome.runtime.lastError;
      if (!r || r.error) { $('fixMsg').textContent = 'Lỗi: ' + ((r && r.error) || 'không gửi được'); return; }
      const l = r.learned || {};
      $('fixMsg').textContent = Object.keys(l).length
        ? 'Đã lưu. Học được' + (l.self ? ` xưng "${l.self}"` : '') + (l.address ? ` gọi "${l.address}"` : '') +
          ' cho video này: đang dịch lại các câu khác.'
        : 'Đã lưu câu sửa.';
      if (cur) fill(scope());
    });
  });

  document.querySelectorAll('input[name=scope]').forEach(el => el.addEventListener('change', () => cur && fill(scope())));
  $('apply').addEventListener('click', () => {
    if (!cur) return;
    const v = {};
    for (const f of F) { const x = $('c_' + f).value.trim(); if (x) v[f] = x; }
    const k = keyFor(scope());
    const done = () => { $('saved').textContent = 'Đã lưu, đang dịch lại…'; setTimeout(() => { $('saved').textContent = ''; }, 2500); };
    if (Object.keys(v).length) chrome.storage.local.set({[k]: v}, done);
    else chrome.storage.local.remove(k, done);
  });
  $('clear').addEventListener('click', () => {
    if (!cur) return;
    for (const f of F) $('c_' + f).value = '';
    chrome.storage.local.remove(keyFor(scope()), () => { $('saved').textContent = 'Đã xoá'; });
  });
})();
