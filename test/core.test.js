// node test/core.test.js — the JS core against outputs of the original Python implementation (fixtures.json)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

globalThis.self = globalThis;
require('../src/words.js');                            // self.LivesubWords
const C = require('../src/core.js');
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); n++; };
const round = cs => cs.map(c => [Math.round(c.start * 1e4) / 1e4, Math.round(c.end * 1e4) / 1e4, c.text]);

// Hy-MT prompt: byte for byte
for (const p of fx.prompts) {
  const k = p.kw;
  const out = C.hymtPrompt(p.en, {history: k.history, speaker: k.speaker, addressee: k.addressee, self: k.self_pron,
                                  address: k.address_pron, glossary: k.glossary, game: k.game,
                                  historyLimit: k.history_limit === undefined ? 4 : k.history_limit});
  eq(out, p.out, 'prompt for ' + JSON.stringify(p.en));
}
for (const [s, want] of fx.clean) eq(C.clean(s), want, 'clean ' + JSON.stringify(s));
for (const t of fx.tracks) eq(round(C.parseTrack(t.body, t.merge)), t.out, `track ${t.name} merge=${t.merge}`);
eq(round(C.mergeWords(fx.mergeWords.words)), fx.mergeWords.plain, 'mergeWords plain');
eq(round(C.mergeWords(fx.mergeWords.words, {merge: true})), fx.mergeWords.merge, 'mergeWords merge');
// the same terms; their order can differ among words rarer than the bundled table (Zipf < 3.5 counts as 0)
const byTerm = xs => xs.map(x => x.en + ':' + x.n).sort();
eq(byTerm(C.keyTerms(fx.keyTerms.texts, {limit: 10})), byTerm(fx.keyTerms.out), 'keyTerms');
eq(C.learnTerms(fx.learnTerms.pairs, fx.learnTerms.terms), fx.learnTerms.out, 'learnTerms');
const g = new C.Glossary(fx.glossary.entries);
for (const [text, want] of fx.glossary.cases) eq(g.match(text), want, 'glossary ' + text);
for (const v of fx.viewers) {
  const cues = v.lines.map((t, i) => ({start: i, end: i + 1, text: t}));
  eq(C.isConversation(cues), v.conversation, 'conversation');
  eq(C.talksToViewers(cues), v.viewers, 'viewers');
}

// planning: dialogues split on 12 s of silence, 4 previous lines, glossary per line, the pair on every line
const cues = [['Where were you?', 0, 2], ['NOAH: At work.', 2.5, 4], ['At work?', 4.5, 6], ['Yes.', 6.5, 7],
              ['Fine.', 7.5, 8], ['Six lines.', 8.5, 9], ['After the silence, Vice City.', 30, 32]]
  .map(([text, start, end]) => ({start, end, text}));
const ctx = C.mergeContext({game: 'a YouTube video', viewers: true}, {glossary: 'Vice City = Vice City'});
eq([ctx.self, ctx.address, ctx.source.pair], ['mình', 'các bạn', 'auto']);
const plan = C.planTrack(cues, ctx);
eq(plan[1].en, 'At work.'); eq(plan[1].speaker, 'Noah');
eq(plan[5].history, ['At work.', 'At work?', 'Yes.', 'Fine.']);
eq(plan[6].history, []); eq(plan[6].glossary, {'Vice City': 'Vice City'});
const userPair = C.mergeContext({game: 'x', viewers: true}, {self: 'tôi'});
eq([userPair.self, userPair.address, userPair.source.pair], ['tôi', null, 'user']);

// request bodies
eq(C.pickStyle('auto', 'hymt'), 'hymt'); eq(C.pickStyle('auto', 'gpt-4o-mini'), 'chat'); eq(C.pickStyle('chat', 'hymt'), 'chat');
const hb = C.makeBody('hymt', plan[2], ctx);
ok(hb.repetition_penalty === 1.05 && hb.messages.length === 1 && hb.messages[0].content.includes('[Source Text]\nAt work?'));
const cb = C.makeBody('chat', plan[6], Object.assign({title: 'My trip'}, ctx));
ok(!('repetition_penalty' in cb) && cb.messages[0].role === 'system' && cb.messages[1].content.includes('Vice City = Vice City'));
ok(cb.messages[1].content.startsWith('Video: My trip.'));
eq(C.tidy('Bản dịch: "Xin chào"\nNote: x'), 'Xin chào');
eq(C.chatUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1/chat/completions');
eq(C.chatUrl('http://localhost:11434/v1/chat/completions'), 'http://localhost:11434/v1/chat/completions');

// corrections: a changed pronoun is learned
eq(C.learnedPair('Tôi đã nói với anh rồi.', 'Mình nói với bạn rồi.'), {self: 'mình', address: 'bạn'});
eq(C.learnedPair('Mình đi đây.', 'Mình đi nhé.'), {});
eq(C.learnedPair('Bạn của tôi đến.', 'Bạn tôi tới rồi.'), {});      // "bạn tôi" is not an address

// YouTube helpers
const lines = [{start: 1, end: 3}, {start: 3, end: 5.5}, {start: 5, end: 6}, {start: 30, end: 32}];
eq([0.5, 1, 3, 5.2, 6.5, 31].map(t => C.findCue(lines, t)), [-1, 0, 1, 2, -1, 3]);
eq(C.pickTrack([{lang: 'vi'}, {lang: 'en', kind: 'asr'}, {lang: 'en-GB'}]), {lang: 'en-GB'});
const u = 'https://www.youtube.com/api/timedtext?v=abcdEFGH123&lang=en&kind=asr&fmt=json3';
ok(C.usableTrack(u, 'abcdEFGH123') && !C.usableTrack(u + '&tlang=vi', 'abcdEFGH123'));
eq(C.videoIdOf('https://www.youtube.com/watch?v=abcdEFGH123&t=4'), 'abcdEFGH123');
eq(C.mergeCtx({self: 'mình', address: 'các bạn'}, {self: 'anh'}), {self: 'anh', address: 'các bạn'});
eq(C.autoContext({title: 'GTA 6 trailer'}, null).game, 'Grand Theft Auto VI');

// languages: English -> Vietnamese stays exactly as before; other pairs only change the language names
const OLD_CHAT = 'You translate English video subtitles into natural, idiomatic Vietnamese subtitles. Reply with the ' +
  'Vietnamese translation of the line to translate and nothing else: no quotes, no notes, no English. Keep names as ' +
  'they are unless the glossary says otherwise. Keep it as short as the original so it reads as a subtitle. Use the ' +
  'context only to understand the line; do not translate the context.';
eq(C.chatMessages('Hi.', {})[0].content, OLD_CHAT, 'chat prompt en -> vi unchanged');
eq(C.makeBody('chat', plan[6], Object.assign({from: 'English', to: 'Vietnamese'}, ctx)), C.makeBody('chat', plan[6], ctx));
eq(C.makeBody('hymt', plan[2], Object.assign({to: 'Vietnamese'}, ctx)), hb);
const ja = C.chatMessages('こんにちは', {from: 'Japanese', to: 'English'})[0].content;
ok(ja.startsWith('You translate Japanese video subtitles into natural, idiomatic English subtitles.') && ja.includes('no Japanese.'));
ok(C.chatMessages('x', {from: null, to: 'Korean'})[0].content.includes('no text in the original language'));
eq(C.hymtPrompt('Hello.', {target: 'Japanese'}), 'Translate the following text into Japanese. Note that you should ' +
   'only output the translated result without any additional explanation:\n\nHello.');
ok(C.makeBody('hymt', plan[2], Object.assign({to: 'French'}, ctx)).messages[0].content
   .includes('Please translate the following text into French, taking'));
eq(['en-GB', 'zh-TW', 'zh-CN', 'zh', 'iw', 'fil', ''].map(C.langKey), ['en', 'zh-Hant', 'zh-Hans', 'zh', 'he', 'fil', '']);
eq([C.sameLang('zh-CN', 'zh-Hans'), C.sameLang('zh', 'zh-Hant'), C.sameLang('zh-TW', 'zh-Hans'), C.sameLang('en-US', 'en')],
   [true, true, false, true]);
eq([C.langName('vi'), C.langName('en-GB'), C.langName('zh-TW'), C.langName('auto'), C.langName('sv')],
   ['Vietnamese', 'English', 'Traditional Chinese', null, 'Swedish']);
// tracks: a language (own captions first), or 'auto' = the spoken language (the auto-generated track's)
const tr = [{lang: 'vi'}, {lang: 'ja', kind: 'asr'}, {lang: 'en'}, {lang: 'ja'}, {lang: 'en', kind: 'asr'}];
eq(C.pickTrack(tr, 'en', 'vi'), {lang: 'en'});
eq(C.pickTrack(tr, 'auto', 'vi'), {lang: 'ja'});
eq(C.pickTrack([{lang: 'ko', kind: 'asr'}], 'auto', 'en'), {lang: 'ko', kind: 'asr'});
eq(C.pickTrack([{lang: 'vi'}, {lang: 'fr'}], 'auto', 'vi'), {lang: 'fr'});
eq(C.pickTrack([{lang: 'vi'}], 'auto', 'vi'), {lang: 'vi'});     // already in the target: the page says so
eq(C.pickTrack(tr, 'de', 'vi'), null);
const uj = 'https://www.youtube.com/api/timedtext?v=abcdEFGH123&lang=ja&fmt=json3';
ok(C.usableTrack(uj, 'abcdEFGH123', 'ja', 'vi') && !C.usableTrack(uj, 'abcdEFGH123', 'en', 'vi'));
ok(C.usableTrack(uj, 'abcdEFGH123', null, 'vi') && !C.usableTrack(uj, 'abcdEFGH123', null, 'ja'));
// English-only help: no viewers pair for other targets, no English cues for other caption languages
const host = ['Welcome back to my channel, guys.', 'Hey guys, today we cook.', 'You guys will love it.',
              'Subscribe for more.', 'See you in the next video.'].map((t, i) => ({start: i, end: i + 1, text: t}));
const auto = C.autoContext({title: 'Cooking'}, host, C.GENERAL);
ok(auto.viewers && C.mergeContext(auto, {}, 'vi').self === 'mình' && C.mergeContext(auto, {}, 'ja').self === null);
eq(C.autoContext({title: 'Cooking'}, host, C.GENERAL, 'ja'), {game: C.GENERAL});
eq(C.clean('こんにちは、皆さん'), 'こんにちは、皆さん');
eq(C.clean('Привет [музыка]'), 'Привет');
eq(C.mergeWords([[0, '今日は'], [0.3, 'いい'], [0.6, '天気'], [0.9, 'ですね。'], [3, 'Hi'], [3.2, 'there']]).map(c => c.text),
   ['今日はいい天気ですね。', 'Hi there']);
eq(C.tidy('Japanese: こんにちは', 'Japanese'), 'こんにちは');
eq(C.tidy('「こんにちは」'), 'こんにちは');

// UI texts: the same keys in both languages; 'auto' follows the target, then the browser
const I = require('../src/i18n.js');
eq(Object.keys(I.STR.en).sort(), Object.keys(I.STR.vi).sort(), 'i18n keys');
eq([I.pick('auto', 'vi', 'en-US'), I.pick('auto', 'ja', 'en-US'), I.pick('auto', 'ja', 'vi-VN'), I.pick('en', 'vi', 'vi'),
    I.pick('auto', 'fr', 'de-DE')], ['vi', 'en', 'vi', 'en', 'en']);
I.use({uiLang: 'en'});
eq([I.t('done', {done: 3, total: 9}), I.langName('ja'), I.t('nope')], ['Translated 3/9 lines', 'Japanese', 'nope']);
I.use({uiLang: 'vi'});
eq([I.t('same', {lang: I.langName('vi')}), I.langName('en')], ['Phụ đề của video đã là tiếng Việt: không cần dịch', 'tiếng Anh']);
console.log(`core.test.js: ${n} checks ok`);
