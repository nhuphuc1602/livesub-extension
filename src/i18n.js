// The texts of the popup and of the status the page reports, in Vietnamese and English. uiLang 'auto': the language
// the user translates into when the UI has it, else the browser's (Vietnamese or English).
(function (root) {
  'use strict';
  const STR = {
    vi: {
      tagline: 'dịch phụ đề YouTube',
      loading: 'Đang đọc cài đặt…',
      from: 'Dịch từ', to: 'Dịch sang', sourceAuto: 'Tự nhận (ngôn ngữ của video)',
      uiLang: 'Giao diện', uiAuto: 'Tự động',
      langNote: 'Xưng hô tự nhận, gợi ý thuật ngữ và tự học thuật ngữ chỉ có khi dịch phụ đề tiếng Anh sang tiếng Việt.',
      aiBox: 'Kết nối AI', presets: 'Mẫu có sẵn', presetPick: 'Chọn để điền nhanh…',
      presetOllama: 'Ollama trên máy này', presetLmStudio: 'LM Studio trên máy này', presetVllm: 'vLLM (vd. model Hy-MT)',
      endpoint: 'Endpoint (OpenAI-compatible, thường kết thúc bằng /v1)',
      apiKey: 'API key (để trống nếu server không cần; chỉ lưu trên máy này)',
      model: 'Model', style: 'Kiểu prompt', styleAuto: 'Tự chọn', styleChat: 'Chat thường',
      ahead: 'Dịch trước', aheadAll: 'Cả video', ahead300: '5 phút tới', ahead120: '2 phút tới',
      parallel: 'Số câu dịch cùng lúc', save: 'Lưu và kiểm tra',
      aiNote: 'Chrome sẽ hỏi quyền gọi đúng địa chỉ endpoint này. Phụ đề của video và ngữ cảnh được gửi tới endpoint bạn ' +
        'nhập để dịch, không gửi đi đâu khác. "Cả video" gọi AI cho mọi câu ngay khi mở video: nhanh nhất, nhưng tốn ' +
        'lượt gọi hơn nếu bạn trả tiền theo lượt.',
      fixBox: 'Sửa câu đang hiện', fixNone: 'Chưa có câu nào trên màn hình.', fixSave: 'Lưu câu sửa',
      fixLoad: 'Lấy câu đang hiện',
      fixHelp: 'Câu sửa thay ngay trên video và được giữ lại. Đổi cách xưng hô (vd. "tôi" thành "mình") thì app học cho ' +
        'cả video.',
      enabled: 'Bật dịch', showEn: 'Hiện cả câu gốc', hideYt: 'Ẩn phụ đề gốc của YouTube',
      autoCaptions: 'Tự bật phụ đề của video',
      learnTerms: 'Tự học thuật ngữ từ các câu đã dịch',
      learnTermsTip: 'Dịch xong cả bài, app xem cách dịch thuật ngữ nào chiếm đa số rồi dịch lại những câu dịch lệch ' +
        '(phụ đề tiếng Anh sang tiếng Việt).',
      mergeAsr: 'Gộp phụ đề tự động thành câu dài',
      mergeAsrTip: 'Tắt: cắt ở mỗi chỗ người nói ngừng, khớp video. Bật: ghép thành câu dài hơn, đủ ý hơn nhưng có thể ' +
        'lệch lời nói.',
      size: 'Cỡ chữ', bottom: 'Vị trí (cách đáy)', box: 'Nền chữ', color: 'Màu chữ',
      ctxBox: 'Ngữ cảnh dịch', ctxOpen: 'Mở một video để xem app tự nhận gì.', scopeVideo: 'Video này',
      scopeChannel: 'Cả kênh',
      game: 'Bối cảnh (để trống: app tự nhận; video thường là "a YouTube video")',
      speaker: 'Người nói (cố định)', listener: 'Người nghe', self: 'Xưng', address: 'Gọi người nghe',
      glossary: 'Thuật ngữ: mỗi dòng "từ gốc = bản dịch" (giữ nguyên tên: "Vice City = Vice City")',
      apply: 'Áp dụng', clear: 'Xoá',
      ctxNote: 'Model chỉ đọc đúng các mục này: bối cảnh, người nói / nghe, cách xưng hô, thuật ngữ và các câu trước. ' +
        'Đổi ngữ cảnh thì chỉ những câu bị ảnh hưởng mới dịch lại.',
      guide: 'Hướng dẫn', privacy: 'Quyền riêng tư',
      noAi: 'Chưa kết nối AI: mở "Kết nối AI" bên dưới để nhập endpoint và model.',
      badEndpoint: 'Endpoint chưa đúng (vd. https://api.openai.com/v1).', noPerm: 'Chưa cấp quyền gọi {host}.',
      testing: 'Đang thử…', error: 'Lỗi: {e}', noReply: 'không phản hồi', notSent: 'không gửi được',
      noPage: 'Không có phản hồi từ trang: mở video YouTube, tải lại trang (F5).', openVideo: 'Mở một video YouTube để dùng.',
      notVideo: 'Không phải trang video', generalVideo: 'video thường', waitCaptions: 'Đang chờ phụ đề của video…',
      autoFrom: 'Tự nhận từ video: {game}', hostViewers: 'người dẫn nói với người xem',
      manyPeople: 'cuộc trò chuyện nhiều người', ctxLive: 'chưa có (đang dịch từng câu)', ctxWaiting: 'đang chờ phụ đề…',
      conversation: 'cuộc trò chuyện', talksTo: '{a} nói với {b}', pair: 'xưng "{self}" / gọi "{address}"',
      pairAuto: ' (tự nhận: người dẫn nói với người xem)', userTerms: '{n} thuật ngữ của bạn',
      termsIntro: 'Thuật ngữ nổi bật trong video (bấm để thêm, rồi điền nghĩa): ', termAdd: 'Thêm vào mục Thuật ngữ',
      learnedIntro: 'Tự học từ các câu đã dịch: ', learnedOf: '{k}/{n} câu', learnedFixed: ', sửa {n} câu lệch',
      ctxLabel: 'Ngữ cảnh: ', ctxEdit: 'Mở một video để chỉnh ngữ cảnh.',
      fixOnlyTrack: 'Chỉ sửa được khi video có bài phụ đề.', fixSaved: 'Đã lưu câu sửa.',
      fixLearned: 'Đã lưu. Học được{what} cho video này: đang dịch lại các câu khác.', learnSelf: ' xưng "{v}"',
      learnAddr: ' gọi "{v}"', savedRedo: 'Đã lưu, đang dịch lại…', cleared: 'Đã xoá',
      // the page (content script)
      off: 'Đang tắt', getting: 'Đang lấy phụ đề {lang}…', gettingAny: 'Đang lấy phụ đề…',
      noTrack: 'Video không có phụ đề {lang}: dịch từng câu phụ đề đang hiện (nếu có)',
      noTrackAny: 'Video không có phụ đề: dịch từng câu phụ đề đang hiện (nếu có)',
      noFetch: 'Không tải được cả bài phụ đề (hãy bật CC): dịch từng câu đang hiện',
      same: 'Phụ đề của video đã là {lang}: không cần dịch', done: 'Đã dịch {done}/{total} câu',
      doing: 'Đang dịch {done}/{total} câu…', fixing: 'Đã dịch {done}/{total} câu · đang sửa {n} câu theo thuật ngữ đã học…',
      errSuffix: ' (lỗi: {e})', live: 'Đang dịch từng câu ({n} câu)', noLine: 'Không có câu này',
      NO_ENDPOINT: 'Chưa có endpoint AI: bấm biểu tượng livesub để nhập',
      NO_MODEL: 'Chưa nhập tên model (bấm biểu tượng livesub)',
      NO_PERMISSION: 'Chưa cấp quyền gọi endpoint: mở livesub, bấm "Lưu và kiểm tra"',
      BAD_ENDPOINT: 'Endpoint không hợp lệ (cần http:// hoặc https://)',
      TIMEOUT: 'Endpoint không trả lời kịp (quá 45 giây)',
      RELOADED: 'Extension vừa được cập nhật: tải lại trang (F5)', NO_ANSWER: 'Extension không phản hồi: tải lại trang (F5)',
      NETWORK: 'Không kết nối được endpoint AI: {e}'
    },
    en: {
      tagline: 'YouTube subtitle translator',
      loading: 'Reading settings…',
      from: 'Translate from', to: 'Translate into', sourceAuto: 'Auto (the video\'s language)',
      uiLang: 'Interface', uiAuto: 'Automatic',
      langNote: 'Automatic pronouns, term suggestions and term learning only work from English captions into Vietnamese.',
      aiBox: 'AI connection', presets: 'Presets', presetPick: 'Pick one to fill in…',
      presetOllama: 'Ollama on this computer', presetLmStudio: 'LM Studio on this computer',
      presetVllm: 'vLLM (e.g. a Hy-MT model)',
      endpoint: 'Endpoint (OpenAI-compatible, usually ends with /v1)',
      apiKey: 'API key (leave empty if the server needs none; stored on this computer only)',
      model: 'Model', style: 'Prompt style', styleAuto: 'Automatic', styleChat: 'Plain chat',
      ahead: 'Translate ahead', aheadAll: 'Whole video', ahead300: 'Next 5 minutes', ahead120: 'Next 2 minutes',
      parallel: 'Lines translated at once', save: 'Save and test',
      aiNote: 'Chrome asks for access to this endpoint\'s address only. The video\'s captions and context are sent to the ' +
        'endpoint you enter, to be translated, and nowhere else. "Whole video" calls the AI for every line as soon as ' +
        'the video opens: fastest, but more calls if you pay per call.',
      fixBox: 'Correct the line on screen', fixNone: 'No line on screen yet.', fixSave: 'Save correction',
      fixLoad: 'Take the line on screen',
      fixHelp: 'The correction replaces the line on the video and is kept. Change a Vietnamese pronoun (e.g. "tôi" to ' +
        '"mình") and the app uses it for the whole video.',
      enabled: 'Translate', showEn: 'Also show the original line', hideYt: 'Hide YouTube\'s own captions',
      autoCaptions: 'Turn on the video\'s captions',
      learnTerms: 'Learn terms from the translated lines',
      learnTermsTip: 'After the whole video is translated, the app sees how most lines render each key term and translates ' +
        'the odd lines again (English captions into Vietnamese).',
      mergeAsr: 'Merge auto-generated captions into long lines',
      mergeAsrTip: 'Off: a line ends at every pause, in step with the video. On: longer, fuller lines that can drift ' +
        'from the speech.',
      size: 'Text size', bottom: 'Position (from the bottom)', box: 'Background', color: 'Text color',
      ctxBox: 'Translation context', ctxOpen: 'Open a video to see what the app reads from it.', scopeVideo: 'This video',
      scopeChannel: 'Whole channel',
      game: 'Setting (empty: read from the video; ordinary videos are "a YouTube video")',
      speaker: 'Speaker (fixed)', listener: 'Listener', self: 'Speaker calls themself', address: 'Calls the listener',
      glossary: 'Terms: one "original = translation" per line (keep a name: "Vice City = Vice City")',
      apply: 'Apply', clear: 'Clear',
      ctxNote: 'The model reads exactly these: setting, speaker / listener, pronouns, terms and the previous lines. ' +
        'Changing the context translates only the lines it affects again.',
      guide: 'Guide', privacy: 'Privacy',
      noAi: 'No AI connected: open "AI connection" below to enter an endpoint and a model.',
      badEndpoint: 'Not a valid endpoint (e.g. https://api.openai.com/v1).', noPerm: 'No access to {host} granted.',
      testing: 'Testing…', error: 'Error: {e}', noReply: 'no answer', notSent: 'could not send',
      noPage: 'No answer from the page: open a YouTube video and reload it (F5).', openVideo: 'Open a YouTube video to use it.',
      notVideo: 'Not a video page', generalVideo: 'ordinary video', waitCaptions: 'Waiting for the video\'s captions…',
      autoFrom: 'Read from the video: {game}', hostViewers: 'a host talking to viewers',
      manyPeople: 'a conversation between several people', ctxLive: 'none yet (translating line by line)',
      ctxWaiting: 'waiting for captions…', conversation: 'conversation', talksTo: '{a} talking to {b}',
      pair: 'self "{self}" / listener "{address}"', pairAuto: ' (read: a host talking to viewers)',
      userTerms: '{n} of your terms',
      termsIntro: 'Key terms in this video (click to add, then fill in the translation): ', termAdd: 'Add to Terms',
      learnedIntro: 'Learned from the translated lines: ', learnedOf: '{k}/{n} lines', learnedFixed: ', fixed {n} odd ones',
      ctxLabel: 'Context: ', ctxEdit: 'Open a video to edit its context.',
      fixOnlyTrack: 'Lines can be corrected only when the video has a caption track.', fixSaved: 'Correction saved.',
      fixLearned: 'Saved. Learned{what} for this video: translating the other lines again.', learnSelf: ' self "{v}"',
      learnAddr: ' listener "{v}"', savedRedo: 'Saved, translating again…', cleared: 'Cleared',
      off: 'Off', getting: 'Loading the {lang} captions…', gettingAny: 'Loading the captions…',
      noTrack: 'This video has no {lang} captions: translating the captions on screen line by line (if any)',
      noTrackAny: 'This video has no captions: translating the captions on screen line by line (if any)',
      noFetch: 'Could not load the whole caption track (turn CC on): translating the line on screen',
      same: 'The video\'s captions are already in {lang}: nothing to translate', done: 'Translated {done}/{total} lines',
      doing: 'Translating {done}/{total} lines…',
      fixing: 'Translated {done}/{total} lines · fixing {n} lines with the learned terms…',
      errSuffix: ' (error: {e})', live: 'Translating line by line ({n} lines)', noLine: 'No such line',
      NO_ENDPOINT: 'No AI endpoint yet: click the livesub icon to enter one',
      NO_MODEL: 'No model name yet (click the livesub icon)',
      NO_PERMISSION: 'No access to the endpoint: open livesub and press "Save and test"',
      BAD_ENDPOINT: 'Invalid endpoint (needs http:// or https://)',
      TIMEOUT: 'The endpoint did not answer in time (45 seconds)',
      RELOADED: 'The extension was just updated: reload the page (F5)',
      NO_ANSWER: 'The extension does not answer: reload the page (F5)',
      NETWORK: 'Cannot reach the AI endpoint: {e}'
    }
  };
  const UI = ['vi', 'en'];
  let cur = 'vi';

  // 'vi' / 'en' as chosen; 'auto': the target language if the UI has it, else the browser's language, else English
  function pick(ui, target, browser) {
    if (UI.includes(ui)) return ui;
    const base = x => String(x || '').toLowerCase().split('-')[0];
    if (UI.includes(base(target))) return base(target);
    return UI.includes(base(browser)) ? base(browser) : 'en';
  }
  function use(settings) {
    const s = settings || {};
    cur = pick(s.uiLang, s.targetLang, typeof navigator !== 'undefined' ? navigator.language : '');
    return cur;
  }
  function t(key, vars) {
    let s = STR[cur][key];
    if (s === undefined) s = STR.vi[key] !== undefined ? STR.vi[key] : key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  }
  // a language's name in the UI language, as it reads inside a sentence ("tiếng Anh", "English")
  function langName(code) {
    let n = null;
    try { n = new Intl.DisplayNames([cur], {type: 'language'}).of(code); } catch (e) { /* unknown code */ }
    n = n || String(code || '');
    return cur === 'vi' ? n.replace(/^Tiếng /, 'tiếng ') : n;
  }
  // texts of a page: data-i18n (text), data-i18n-title, data-i18n-ph (placeholder)
  function apply(doc) {
    doc.documentElement.lang = cur;
    doc.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    doc.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    doc.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  }

  const api = {STR, UI, pick, use, t, langName, apply, get lang() { return cur; }};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LivesubI18n = api;
})(typeof self !== 'undefined' ? self : globalThis);
