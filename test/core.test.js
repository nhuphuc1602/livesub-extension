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
console.log(`core.test.js: ${n} checks ok`);
