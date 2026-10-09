// livesub core: everything between a YouTube caption track and the request to the AI model, with no browser API in
// it (the content script, the popup and node tests all load it). Ported from the livesub desktop app.
//
//   caption track (json3 / srv3)  -> lines         parseTrack: manual captions as they are; auto-generated words cut
//                                                   at the speaker's pauses (or merged into longer lines)
//   video details + lines         -> context       game / topic, a host talking to viewers (pronoun pair), key terms
//   lines + context               -> requests      previous lines of the same dialogue (4), glossary terms found in
//                                                   the line, the pronoun pair; Hy-MT prompt or a plain chat prompt
//   translations                  -> learned terms a term rendered one way most of the time fixes the odd lines
(function (root) {
  'use strict';

  // --- settings -------------------------------------------------------------------------------------------------
  const DEFAULTS = {               // chrome.storage.sync (the API key alone lives in chrome.storage.local)
    enabled: true,
    showEn: false,
    hideYt: true,
    autoCaptions: true,
    mergeAsr: false,               // auto-captions merged into longer lines (off: cut at every pause)
    learnTerms: true,              // after the first pass, fix the lines that render a key term differently
    size: 4.2,
    bottom: 8,
    color: '#ffffff',
    box: 0.55,
    endpoint: '',                  // OpenAI-compatible base URL, e.g. https://api.openai.com/v1
    model: '',
    style: 'auto',                 // auto | hymt | chat
    parallel: 4,                   // requests in flight
    ahead: 'all'                   // 'all' (translate the whole video ahead) or seconds ahead of playback
  };
  const GENERAL = 'a YouTube video';

  // --- caption text ---------------------------------------------------------------------------------------------
  const SOUND = /\[[^\]]*\]|\(\s*[A-Z][A-Z '\-]*\)|[♪♫]+/g;
  function clean(text) {
    let t = String(text || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ').replace(/\n/g, ' ');
    t = t.replace(SOUND, ' ').replace(/\s*>>+\s*/g, ' ').replace(/^\s*-\s+/, '');
    t = t.split(/\s+/).filter(Boolean).join(' ');
    return /[A-Za-z]/.test(t) ? t : '';
  }

  function manual(items) {
    const out = [];
    for (const [t0, t1, raw] of items) {
      const text = clean(raw);
      if (!text) continue;
      const last = out[out.length - 1];
      if (last && Math.abs(last.start - t0) < 1e-3 && last.text === text) continue;
      out.push({start: t0, end: Math.max(t1, t0 + 0.5), text});
    }
    return out;
  }

  // a line should not end on a word that needs what follows (only used when merging)
  const BAD_END = new Set(('the a an of to and or but nor in on at for with about from into onto by as than then my your ' +
    'his her its our their this these those is are was were be been being am i we you they he she it i\'m we\'re ' +
    'you\'re they\'re it\'s that\'s there\'s here\'s what\'s let\'s can could will would should must may might shall ' +
    'not no very so if because when while which who whose whom where what how why just really some any each every ' +
    'more most less such like going gonna wanna gotta have has had do does did get got make kind sort lot bit one two'
  ).split(' '));
  const lowWord = w => w.toLowerCase().replace(/^[.,?!;:"']+|[.,?!;:"']+$/g, '');

  // Auto-generated captions: (time, word) -> lines. Default: a line ends at every pause over 0.8 s, at ".?!" (3+
  // words) or at 14 words, so it follows the speech. merge: short lines join the next and a pause right after
  // "about / the / and" does not cut (longer, fuller lines that can drift from the speech).
  function mergeWords(words, opts) {
    const o = Object.assign({pause: 0.8, maxWords: 14, hold: 2.0, minWords: 3, longPause: 2.0, badEndPause: 1.2,
                             merge: false}, opts || {});
    const ws = words.map(([t, w]) => [t, String(w || '').trim()]).filter(([, w]) => w).sort((a, b) => a[0] - b[0]);
    const groups = [];
    let cur = [];
    for (const [t, w] of ws) {
      if (cur.length) {
        const last = cur[cur.length - 1];
        const gap = t - last[0];
        const endsSentence = /[.?!]$/.test(last[1]) && cur.length >= 3;
        let cut;
        if (!o.merge) cut = gap > o.pause || cur.length >= o.maxWords || endsSentence;
        else cut = gap > o.longPause || endsSentence || cur.length >= o.maxWords ||
          (gap > o.pause && cur.length >= o.minWords && (!BAD_END.has(lowWord(last[1])) || gap > o.badEndPause));
        if (cut) { groups.push(cur); cur = []; }
      }
      cur.push([t, w]);
    }
    if (cur.length) groups.push(cur);
    const out = [];
    groups.forEach((g, k) => {
      const first = g[0][0], last = g[g.length - 1][0];
      const next = k + 1 < groups.length ? groups[k + 1][0][0] : last + o.hold;
      const text = clean(g.map(x => x[1]).join(' '));
      if (text) out.push({start: first, end: Math.max(Math.min(next, last + o.hold), first + 0.5), text});
    });
    return out;
  }

  function parseJson3(data, merge) {
    const events = (data.events || []).filter(e => e.segs && e.segs.length);
    const asr = events.some(e => e.segs.some(s => 'tOffsetMs' in s));
    if (asr) {
      const words = [];
      for (const e of events) {
        if (e.aAppend) continue;
        for (const s of e.segs) words.push([((e.tStartMs || 0) + (s.tOffsetMs || 0)) / 1000, s.utf8 || '']);
      }
      return mergeWords(words, {merge});
    }
    return manual(events.map(e => [(e.tStartMs || 0) / 1000, ((e.tStartMs || 0) + (e.dDurationMs || 0)) / 1000,
                                   e.segs.map(s => s.utf8 || '').join('')]));
  }

  const decode = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
  const attr = (tag, name) => { const m = tag.match(new RegExp(name + '="(\\d+)"')); return m ? +m[1] : 0; };

  function parseSrv3(text, merge) {
    const items = [], words = [];
    for (const m of text.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      const t0 = attr(m[1], 't'), d = attr(m[1], 'd');
      const ss = [...m[2].matchAll(/<s\b([^>]*)>([\s\S]*?)<\/s>/g)];
      if (ss.length) ss.forEach(s => words.push([(t0 + attr(s[1], 't')) / 1000, decode(s[2])]));
      else items.push([t0 / 1000, (t0 + d) / 1000, decode(m[2])]);
    }
    return words.length && !items.length ? mergeWords(words, {merge}) : manual(items);
  }

  function parseTrack(body, merge) {
    body = String(body || '').trim();
    if (!body) return [];
    return body[0] === '{' ? parseJson3(JSON.parse(body), merge) : parseSrv3(body, merge);
  }

  // --- what the video is ----------------------------------------------------------------------------------------
  const GAMES = [[/\b(?:GTA|Grand Theft Auto)\s*(?:VI|6)\b/i, 'Grand Theft Auto VI'],
                 [/\b(?:GTA|Grand Theft Auto)\s*(?:V|5)\b/i, 'Grand Theft Auto V'],
                 [/\b(?:GTA|Grand Theft Auto)\s*(?:IV|4)\b/i, 'Grand Theft Auto IV'],
                 [/\b(?:Red Dead Redemption\s*(?:2|II)|RDR\s*2)\b/i, 'Red Dead Redemption 2']];
  function gameFor(text, dflt) {
    for (const [rx, g] of GAMES) if (rx.test(text || '')) return g;
    return dflt;
  }

  const STRONG = /\b(?:subscrib\w*|this video|today's video|my channel|welcome back|thanks for watching|in the comments?|comment below|link (?:is )?(?:in|below)|in the description|down below|like button|smash (?:that|the) like|see you (?:guys )?(?:next|in the next))\b/i;
  const WEAK = /\b(?:hey guys|hi guys|what's up,? guys|you guys|hello everyone|hey everyone|hi everyone|everybody|guys)\b/i;
  const REPLY = /^(?:yes|yeah|yep|no|nope|okay|ok|right|absolutely|exactly|interesting|sure|true|correct|indeed|wow|really|mhm|uh-huh|of course|that's right|i see|got it|good|great)[.!?,]*$/i;

  // two or more people (interview, podcast, film): short replies are 4-6 % of the lines there, under 1 % alone
  function isConversation(cues) {
    if (!cues || !cues.length) return false;
    const short = cues.filter(c => REPLY.test(c.text.trim()) || /^(?:yes|yeah|absolutely|exactly|right)[.!?]\s/i.test(c.text.trim())).length;
    return short >= Math.max(4, 0.02 * cues.length);
  }
  // one host talking to the viewers (vlog, tutorial, review): "mình" / "các bạn"
  function talksToViewers(cues) {
    if (!cues || !cues.length || isConversation(cues)) return false;
    const strong = cues.filter(c => STRONG.test(c.text)).length;
    const weak = cues.filter(c => WEAK.test(c.text)).length;
    return strong >= 1 && 2 * strong + weak >= 4;
  }

  // --- key terms (said often here, rare in English) -------------------------------------------------------------
  const STOP = new Set(('the a an and or but of to in on at for with from by as is are was were be been being it its this ' +
    'that these those you your i my we our they their he his she her me him them us so if not no do does did just like ' +
    'really very what which who how when where there here then than also can could would should will going gonna get ' +
    "got let's lets uh um huh hmm uh-huh mm-hmm yeah okay").split(' '));
  const WORD = /\p{L}(?:(?:\p{L}|['-])*\p{L})?/gu;
  const zipfOf = w => ((root.LivesubWords || {})[w]) || 0;
  const normQuotes = s => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ');
  const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const termRx = (en, flags) => new RegExp(`(?<![\\p{L}\\p{N}_'])${escapeRx(en)}(?![\\p{L}\\p{N}_'])`, 'iu' + (flags || ''));

  function keyTerms(texts, opts) {
    const o = Object.assign({limit: 8, minCount: 3, maxZipf: 4.0, skip: []}, opts || {});
    const joined = normQuotes(texts.join(' '));
    const words = joined.toLowerCase().match(WORD) || [];
    const uni = new Map(), bi = new Map();
    words.forEach(w => uni.set(w, (uni.get(w) || 0) + 1));
    for (let i = 0; i + 1 < words.length; i++) {
      const a = words[i], b = words[i + 1];
      if (!STOP.has(a) && !STOP.has(b)) bi.set(a + ' ' + b, (bi.get(a + ' ' + b) || 0) + 1);
    }
    const scored = [];
    for (const [t, n] of bi) {
      const [a, b] = t.split(' ');
      const za = zipfOf(a), zb = zipfOf(b);
      if (n >= o.minCount && Math.min(za, zb) < o.maxZipf && Math.max(za, zb) < 5.5) scored.push([n * (7 - Math.min(za, zb)) * 1.2, t, n]);
    }
    for (const [w, n] of uni) {
      if (n < o.minCount || STOP.has(w) || w.length < 4) continue;
      const z = zipfOf(w);
      if (z >= o.maxZipf) continue;
      const inPairs = scored.filter(s => s[1].split(' ').includes(w)).reduce((x, s) => x + s[2], 0);
      if (inPairs && n - inPairs < o.minCount) continue;          // "summation" only inside "discrete summation"
      scored.push([n * (7 - z), w, n]);
    }
    scored.sort((x, y) => (y[0] - x[0]) || (y[1] < x[1] ? -1 : y[1] > x[1] ? 1 : 0) || (y[2] - x[2]));
    const skip = new Set(o.skip.map(s => s.toLowerCase()));
    const out = [], seen = new Set();
    for (const [, t, n] of scored) {
      const stem = t.split(' ').map(x => (x.endsWith('s') && x.length > 4 ? x.slice(0, -1) : x)).join(' ');
      if (seen.has(stem) || skip.has(t) || skip.has(stem)) continue;
      seen.add(stem);
      const forms = new Map();                                      // as written most often: "Lucia", "convolution"
      for (const m of joined.matchAll(termRx(t, 'g'))) forms.set(m[0], (forms.get(m[0]) || 0) + 1);
      let best = t, bn = 0;
      for (const [f, k] of forms) if (k > bn) { best = f; bn = k; }
      out.push({en: best, n});
      if (out.length >= o.limit) break;
    }
    return out;
  }

  // --- learning term renderings from the translations ----------------------------------------------------------
  const VI_STOP = new Set(('và của là các những một có thì mà này đó cho với được để không như về từ trong ra rằng nó họ ' +
    'ta mình bạn tôi anh em chúng đã đang sẽ vẫn rất cũng lại nên vì nếu khi thế vậy rồi nhé à ạ ơi đi').split(' '));
  function viGrams(text, nmax) {
    const ws = String(text || '').toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
    const out = new Set();
    for (let n = 1; n <= (nmax || 4); n++) {
      for (let i = 0; i + n <= ws.length; i++) {
        const g = ws.slice(i, i + n);
        if (!VI_STOP.has(g[0]) && !VI_STOP.has(g[g.length - 1])) out.add(g.join(' '));
      }
    }
    return out;
  }

  // {term: {vi, support, lines}} for key terms the translations render one way most of the time; the rendering is
  // the longest Vietnamese phrase in >= minShare of the term's lines and >= prefer x as many as the most common one
  function learnTerms(pairs, terms, opts) {
    const o = Object.assign({minSupport: 4, minShare: 0.6, prefer: 0.75, skip: []}, opts || {});
    const skip = new Set(o.skip.map(s => s.toLowerCase()));
    const grams = pairs.map(([, vi]) => viGrams(vi));
    const out = {};
    for (const t of terms) {
      const en = t.en;
      if (/^\p{Lu}/u.test(en) || /(?:ly|ed|ing)$/i.test(en) || skip.has(en.toLowerCase())) continue;
      const rx = termRx(en);
      const hit = pairs.map(([e], i) => (rx.test(e) ? i : -1)).filter(i => i >= 0);
      if (hit.length < o.minSupport) continue;
      const count = new Map();
      for (const i of hit) for (const g of grams[i]) count.set(g, (count.get(g) || 0) + 1);
      const top = [...count].filter(([, k]) => k >= o.minSupport && k >= o.minShare * hit.length);
      if (!top.length) continue;
      const kmax = Math.max(...top.map(([, k]) => k));
      const pick = top.filter(([, k]) => k >= o.prefer * kmax)
        .sort((a, b) => (b[0].split(' ').length - a[0].split(' ').length) || (b[1] - a[1]) || (b[0] < a[0] ? -1 : 1))[0];
      const [g, k] = pick;
      if (g.split(' ').length < en.split(' ').length || g === en.toLowerCase()) continue;   // lossy, or kept in English
      out[en] = {vi: g, support: k, lines: hit.length};
    }
    for (const en of Object.keys(out).filter(e => e.includes(' '))) {     // a two-word term that only repeats a part's
      if (Object.keys(out).some(x => x !== en && termRx(x).test(en) && out[x].vi === out[en].vi)) delete out[en];
    }
    return out;
  }

  // --- glossary -------------------------------------------------------------------------------------------------
  function parseGlossary(text, limit) {
    const out = {};
    for (const line of String(text || '').split('\n')) {
      for (const sep of ['=', '->', '→', '\t']) {
        if (line.includes(sep)) {
          const i = line.indexOf(sep);
          const en = line.slice(0, i).trim(), vi = line.slice(i + sep.length).trim();
          if (en && vi && en.length <= 80 && vi.length <= 80) out[en] = vi;
          break;
        }
      }
      if (Object.keys(out).length >= (limit || 300)) break;
    }
    return out;
  }

  class Glossary {
    constructor(entries) {
      this.entries = Object.assign({}, entries || {});
      const terms = Object.keys(this.entries).sort((a, b) => b.length - a.length);
      this.lower = new Map(terms.map(t => [t.toLowerCase(), t]));
      this.rx = terms.length ? new RegExp(`(?<![\\p{L}\\p{N}_'])(${terms.map(escapeRx).join('|')})(?![\\p{L}\\p{N}_'])`, 'giu') : null;
    }
    match(text) {                                     // {term: translation} found in the text, in order of appearance
      const out = {};
      if (!this.rx || !text) return out;
      for (const m of String(text).matchAll(this.rx)) {
        const t = this.lower.get(m[1].toLowerCase());
        if (t && !(t in out)) out[t] = this.entries[t];
      }
      return out;
    }
  }

  // --- the video's context: its details, its captions, the user ----------------------------------------------------
  function autoContext(details, cues, dflt) {
    const d = details || {};
    let game = dflt || GENERAL;
    for (const text of [d.title || '', (d.keywords || []).join(' ').slice(0, 1000), (d.description || '').slice(0, 2000)]) {
      const g = gameFor(text, '');
      if (g) { game = g; break; }
    }
    const out = {game};
    if (cues) {
      out.viewers = talksToViewers(cues);
      out.conversation = isConversation(cues);
      out.terms = keyTerms(cues.map(c => c.text));
    }
    return out;
  }

  // the user's fields (popup: channel, then video) over the automatic ones
  function mergeContext(auto, user) {
    const u = Object.assign({}, user || {});
    const userPair = ['speaker', 'listener', 'self', 'address'].some(k => (u[k] || '').trim());
    const autoPair = auto.viewers && !userPair;
    const glossary = parseGlossary(u.glossary);
    const s = (k, n) => (u[k] || '').trim().slice(0, n) || null;
    return {
      game: s('game', 80) || auto.game || GENERAL,
      speaker: s('speaker', 40), listener: s('listener', 40),
      self: s('self', 20) || (autoPair ? 'mình' : null), address: s('address', 20) || (autoPair ? 'các bạn' : null),
      glossary,
      source: {game: s('game', 80) ? 'user' : 'auto', pair: userPair ? 'user' : (autoPair ? 'auto' : null)},
      auto
    };
  }

  // "NAME: line" (all-caps name, at most three words) -> speaker
  function splitSpeaker(text) {
    const m = /^\s*([A-Z][A-Z .'-]{1,30}):\s+(.+)$/.exec(text || '');
    if (!m) return null;
    const name = m[1].trim(), words = name.split(/\s+/);
    if (words.length > 3 || name !== name.toUpperCase() || (name.match(/[A-Z]/g) || []).length < 2) return null;
    return {name: words.map(w => w[0] + w.slice(1).toLowerCase()).join(' '), rest: m[2].trim()};
  }

  // per line: what the model gets. A dialogue ends after 12 s of silence; its previous lines are the history.
  function planTrack(cues, ctx, opts) {
    const o = Object.assign({gapS: 12, historyLimit: 4}, opts || {});
    const gl = new Glossary(ctx.glossary || {});
    let lastEnd = null, hist = [];
    return cues.map((c, i) => {
      if (lastEnd !== null && c.start - lastEnd > o.gapS) hist = [];
      let en = c.text, speaker = ctx.speaker || null;
      const sp = splitSpeaker(en);
      if (sp) { en = sp.rest; if (!ctx.speaker) speaker = sp.name; }
      const item = {i, en, history: hist.slice(-o.historyLimit), speaker, listener: ctx.listener || null,
                    self: ctx.self || null, address: ctx.address || null, glossary: gl.match(en)};
      hist.push(en);
      lastEnd = c.end;
      return item;
    });
  }

  // --- prompts --------------------------------------------------------------------------------------------------
  // Hy-MT2 (Tencent) fine-tuned with this exact layout (byte-identical to the training prompt builder)
  const PLAIN = 'Translate the following text into Vietnamese. Note that you should only output ' +
    'the translated result without any additional explanation:\n\n{en}';
  const CONTEXT_INSTRUCTION = 'Please translate the following text into Vietnamese, taking the provided background ' +
    'information into consideration. Only output the translated result without any additional explanation.';
  const norm = x => { if (x === null || x === undefined) return null; const s = String(x).trim(); return !s || s.toLowerCase() === 'unknown' ? null : s; };
  const oneLine = s => String(s).replace(/\r/g, ' ').replace(/\n/g, ' ').split(/\s+/).filter(Boolean).join(' ');

  function hymtPrompt(en, o) {
    o = o || {};
    let hist = (o.history || []).filter(h => h !== null && h !== undefined && String(h).trim()).map(oneLine);
    const limit = o.historyLimit === undefined ? 4 : o.historyLimit;
    if (limit !== null) hist = limit > 0 ? hist.slice(-limit) : [];
    const gloss = Object.entries(o.glossary || {}).map(([k, v]) => [String(k).trim(), String(v).trim()]).filter(([k, v]) => k && v);
    const spk = norm(o.speaker), adr = norm(o.addressee), selfP = norm(o.self), addrP = norm(o.address);
    if (!(hist.length || spk || adr || selfP || addrP || gloss.length)) return PLAIN.replace('{en}', () => en);
    const bg = ['[Background Information]', `Game dialogue from ${o.game || GENERAL}.`,
                `Speaker: ${spk || 'unknown'}. Listener: ${adr || 'unknown'}.`];
    if (selfP && addrP) bg.push(`The speaker calls themself "${selfP}" and the listener "${addrP}".`);
    else if (selfP) bg.push(`The speaker calls themself "${selfP}".`);
    else if (addrP) bg.push(`The speaker calls the listener "${addrP}".`);
    if (hist.length) { bg.push('Previous lines:'); hist.forEach(h => bg.push(`- ${h}`)); }
    const blocks = [bg.join('\n')];
    if (gloss.length) blocks.push(['Reference the following translations:', ...gloss.map(([t, v]) => `${t} translates to ${v}`)].join('\n'));
    blocks.push(CONTEXT_INSTRUCTION);
    blocks.push(`[Source Text]\n${en}`);
    return blocks.join('\n\n');
  }

  // any chat model (GPT, Claude, Llama, Qwen...): the same context as instructions
  const CHAT_SYSTEM = 'You translate English video subtitles into natural, idiomatic Vietnamese subtitles. ' +
    'Reply with the Vietnamese translation of the line to translate and nothing else: no quotes, no notes, no ' +
    'English. Keep names as they are unless the glossary says otherwise. Keep it as short as the original so it reads ' +
    'as a subtitle. Use the context only to understand the line; do not translate the context.';
  function chatMessages(en, o) {
    o = o || {};
    const parts = [`Video: ${o.title || o.game || GENERAL}.`];
    if (o.speaker || o.addressee) parts.push(`Speaker: ${o.speaker || 'unknown'}. Listener: ${o.addressee || 'unknown'}.`);
    if (o.self || o.address) parts.push(`Pronouns: the speaker calls themself "${o.self || '?'}" and the listener "${o.address || '?'}".`);
    const gloss = Object.entries(o.glossary || {});
    if (gloss.length) parts.push('Glossary (use these translations):\n' + gloss.map(([k, v]) => `${k} = ${v}`).join('\n'));
    const hist = (o.history || []).slice(-(o.historyLimit || 4));
    if (hist.length) parts.push('Previous lines (context only):\n' + hist.map(h => `- ${oneLine(h)}`).join('\n'));
    parts.push(`Line to translate:\n${en}`);
    return [{role: 'system', content: CHAT_SYSTEM}, {role: 'user', content: parts.join('\n\n')}];
  }

  const pickStyle = (style, model) => (style === 'hymt' || style === 'chat') ? style : (/hy-?mt/i.test(model || '') ? 'hymt' : 'chat');

  // the request body (without "model", which the background adds from the settings)
  function makeBody(style, item, ctx) {
    const o = {history: item.history, speaker: item.speaker, addressee: item.listener, self: item.self,
               address: item.address, glossary: item.glossary, game: ctx.game, title: ctx.title};
    if (style === 'hymt') {
      return {messages: [{role: 'user', content: hymtPrompt(item.en, o)}], temperature: 0, max_tokens: 160,
              repetition_penalty: 1.05, stream: false};
    }
    return {messages: chatMessages(item.en, o), temperature: 0, max_tokens: 200, stream: false};
  }

  // a translation as it comes back: one line, no quotes or labels a chat model may add
  function tidy(text) {
    let t = String(text || '').trim().split(/\s*\n\s*/).filter(Boolean)[0] || '';
    t = t.replace(/^(?:vietnamese|tiếng việt|bản dịch|translation)\s*:\s*/i, '');
    if (/^["“].*["”]$/.test(t)) t = t.slice(1, -1).trim();
    return t;
  }

  // --- pronouns a correction changed (learned for the whole video) --------------------------------------------------
  const SELF_WORDS = ['bọn tao', 'tụi tao', 'bọn tôi', 'tụi tôi', 'chúng tôi', 'chúng mình', 'tôi', 'tao', 'tớ', 'tui', 'mình'];
  const ADDRESS_WORDS = ['các người', 'bọn mày', 'chúng mày', 'tụi mày', 'các cậu', 'các anh', 'các ông', 'các bạn',
                         'các vị', 'quý vị', 'anh bạn', 'ông anh', 'mày', 'bạn', 'ngươi', 'cậu'];
  const MASK = /(?<![\p{L}])(?:(?:anh|chị|cô|ông|bà|cậu|bạn|sếp|thằng|con) (?:ấy|ta|đó|kia|này)|bạn (?:tôi|tao|tớ|tui|của|bè|gái|trai|thân|học|cũ|mới|đời|nhậu|cùng|đồng)|(?:người|thằng|đứa|đám|lũ|bọn) bạn|lông mày|mày râu)(?![\p{L}])/gu;
  function findWord(text, cands) {
    const ws = String(text || '').toLowerCase().replace(MASK, ' ').match(/[\p{L}\p{N}_]+/gu) || [];
    for (const p of cands) {                         // longer forms first: "bọn tao" is not read as "tao"
      const pw = p.split(' ');
      for (let i = 0; i + pw.length <= ws.length; i++) if (pw.every((x, k) => ws[i + k] === x)) return p;
    }
    return null;
  }
  function learnedPair(before, after) {
    const out = {};
    for (const [key, cands] of [['self', SELF_WORDS], ['address', ADDRESS_WORDS]]) {
      const now = findWord(after, cands), was = findWord(before, cands);
      if (now && now !== was) out[key] = now;
    }
    return out;
  }

  // --- YouTube helpers ------------------------------------------------------------------------------------------
  function findCue(lines, t) {
    let lo = 0, hi = lines.length - 1, k = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (lines[m].start <= t) { k = m; lo = m + 1; } else { hi = m - 1; }
    }
    for (let i = k; i >= 0 && i >= k - 3; i--) if (t < lines[i].end) return i;
    return -1;
  }
  function pickTrack(tracks) {
    const en = (tracks || []).filter(t => /^en/i.test(t.lang || ''));
    return en.find(t => t.kind !== 'asr') || en.find(t => t.kind === 'asr') || null;
  }
  function trackParams(url) {
    try {
      const u = new URL(url, 'https://www.youtube.com');
      return {v: u.searchParams.get('v'), lang: u.searchParams.get('lang') || '', kind: u.searchParams.get('kind') || '',
              tlang: u.searchParams.get('tlang')};
    } catch (e) { return null; }
  }
  function usableTrack(url, videoId) {
    const p = trackParams(url);
    return !!p && !!videoId && p.v === videoId && /^en/i.test(p.lang) && !p.tlang;
  }
  function videoIdOf(href) {
    try { const u = new URL(href); return u.pathname === '/watch' ? u.searchParams.get('v') : null; } catch (e) { return null; }
  }
  const CTX_FIELDS = ['game', 'speaker', 'listener', 'self', 'address', 'glossary'];
  const ctxKeys = (videoId, channelId) => ({video: videoId ? 'ctx:v:' + videoId : null, channel: channelId ? 'ctx:c:' + channelId : null});
  function mergeCtx(channel, video) {
    const out = {};
    for (const k of CTX_FIELDS) {
      const v = (video && video[k]) || (channel && channel[k]) || '';
      if (String(v).trim()) out[k] = String(v).trim();
    }
    return out;
  }
  // POST URL of an OpenAI-compatible base ("https://api.openai.com/v1" -> ".../v1/chat/completions")
  function chatUrl(endpoint) {
    const u = String(endpoint || '').trim().replace(/\/+$/, '');
    return /\/chat\/completions$/.test(u) ? u : u + '/chat/completions';
  }

  const api = {DEFAULTS, GENERAL, CTX_FIELDS, clean, mergeWords, parseJson3, parseSrv3, parseTrack, gameFor,
               isConversation, talksToViewers, keyTerms, learnTerms, termRx, parseGlossary, Glossary, autoContext,
               mergeContext, splitSpeaker, planTrack, hymtPrompt, chatMessages, pickStyle, makeBody, tidy, learnedPair,
               findCue, pickTrack, trackParams, usableTrack, videoIdOf, ctxKeys, mergeCtx, chatUrl};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LivesubCore = api;
})(typeof self !== 'undefined' ? self : globalThis);
