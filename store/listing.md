# Chrome Web Store: what to enter in the developer dashboard

Package: `python tools/build.py` → `dist/livesub-<version>.zip` (upload this file).

## Store listing

- **Name** (from the manifest): livesub - Phụ đề tiếng Việt cho YouTube
- **Summary** (from the manifest, 132 characters max): Dịch phụ đề tiếng Anh của video YouTube sang tiếng Việt bằng AI bạn
  chọn, có ngữ cảnh, dịch trước cả video.
- **Category:** Accessibility (or Tools)
- **Language:** Vietnamese (add English if the dashboard asks for a second language)
- **Icon:** `icons/128.png`
- **Screenshots (1280x800):** `store/screenshots/1-player.png`, `store/screenshots/2-popup.png`
- **Small promo tile (440x280):** `store/promo-440x280.png`
- **Homepage / support URL:** https://github.com/nhuphuc1602/livesub-extension

### Description (Vietnamese)

livesub dịch phụ đề tiếng Anh của video YouTube sang tiếng Việt và hiện ngay trên khung video, cả khi xem toàn màn hình.

• Dùng AI bạn chọn: OpenAI, Google Gemini, OpenRouter, hoặc model chạy trên máy (Ollama, LM Studio, vLLM). Endpoint
  nào theo chuẩn OpenAI đều dùng được. Bạn tự nhập endpoint, model và API key.
• Đọc thẳng chữ phụ đề của video và dịch trước cả video, câu gần chỗ đang xem được dịch trước. Câu tiếng Việt có sẵn khi
  tới lúc hiện.
• Dịch theo ngữ cảnh:
  – các câu trước trong cùng đoạn hội thoại;
  – cách xưng hô: video có người dẫn tự xưng "mình", gọi người xem "các bạn";
  – thuật ngữ của bạn, lưu cho một video hoặc cả kênh.
• Tự học từ các câu đã dịch: thuật ngữ được dịch một kiểu ở đa số câu thì những câu dịch lệch được dịch lại cho thống nhất.
• Gợi ý thuật ngữ nổi bật của video để bạn điền nghĩa.
• Sửa câu đang hiện: câu sửa được giữ lại. Đổi cách xưng hô thì app học cho cả video.
• Tuỳ chỉnh cỡ chữ, vị trí, nền, màu; hiện kèm câu tiếng Anh; ẩn phụ đề gốc.

Quyền riêng tư: phụ đề và ngữ cảnh chỉ được gửi tới endpoint AI bạn nhập. API key chỉ lưu trên máy bạn. Không có thống
kê, quảng cáo hay máy chủ trung gian.

### Description (English)

livesub translates the English captions of YouTube videos into Vietnamese and draws them over the player, also in
full screen.

• Uses the AI you choose: OpenAI, Google Gemini, OpenRouter or a local model (Ollama, LM Studio, vLLM), through any
  OpenAI-compatible endpoint. You enter the endpoint, model and API key.
• Reads the video's caption track and translates the whole video ahead, nearest the playback position first.
• Translates with context:
  – the previous lines of the dialogue;
  – the pronoun register (a host talking to viewers);
  – your glossary, per video or per channel.
• Learns how its translations render the video's key terms and redoes the lines that disagree.
• Keeps your corrections.
• Privacy: captions and context go only to the endpoint you enter; the key stays on your device.

## Privacy practices tab

- **Single purpose:** Translate the English captions of YouTube videos into Vietnamese and show them over the video.
- **Permission justifications:**
  - `storage`: Saves the user's settings, the translations already made (so a video is not translated twice) and the
    user's corrections and glossary, on the device.
  - `activeTab`: When the user clicks the toolbar icon, the popup reads which YouTube video is open in the current tab,
    to show its translation status and context.
  - Host permission (content scripts on `https://www.youtube.com/*`): Reads the caption track of the video being
    watched and draws the translated line over the player.
  - Optional host permissions (`https://*/*`, `http://*/*`): The user chooses their own AI translation service.
    Access is requested at runtime for the single origin the user enters, when they press "Lưu và kiểm tra", and is
    used only to send translation requests there.
- **Remote code:** No. All code is in the package.
- **Data usage** (check these):
  - *Website content:* caption text, video title and description of the video being watched. Sent to the AI endpoint
    the user configured, only to translate them.
  - *Authentication information:* the API key the user enters. Stored on the device and sent only to that endpoint.
  - Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used
    for creditworthiness or lending.
- **Privacy policy URL:** https://github.com/nhuphuc1602/livesub-extension/blob/main/PRIVACY.md

## Distribution

- Visibility: Public (or Unlisted first, to try the store build).
- Regions: all.
- Pricing: free.
