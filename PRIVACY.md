# Chính sách quyền riêng tư / Privacy policy: livesub

*Cập nhật / Updated: 2026-10-09*

## Tiếng Việt

livesub là extension Chrome dịch phụ đề YouTube sang tiếng Việt bằng dịch vụ AI do **chính bạn** cấu hình.

**Dữ liệu được xử lý**
- **Chữ phụ đề tiếng Anh của video bạn đang xem** và các thông tin dùng làm ngữ cảnh dịch:
  - tiêu đề, mô tả, từ khoá, tên kênh của video;
  - các câu trước;
  - cách xưng hô, thuật ngữ bạn nhập.
  Những thứ này được gửi **chỉ tới endpoint AI bạn nhập** trong phần "Kết nối AI" để dịch. Việc dịch vụ đó lưu hay dùng
  dữ liệu thế nào tuân theo chính sách của dịch vụ ấy (ví dụ OpenAI, Google, OpenRouter, hoặc máy chủ của bạn).
- **API key** bạn nhập được lưu trong bộ nhớ của extension **trên máy bạn** (`chrome.storage.local`, không đồng bộ lên
  tài khoản Google). Key chỉ được gửi tới endpoint đó, trong header `Authorization`.
- **Cài đặt** (endpoint, tên model, kiểu chữ...) được lưu bằng `chrome.storage.sync` của Chrome.
- **Bản dịch, câu bạn sửa và ngữ cảnh theo video / kênh** được lưu **trên máy bạn** (`chrome.storage.local`) để không
  phải dịch lại. Bộ nhớ đệm chỉ giữ 60 video gần nhất.

**Không có:** thống kê sử dụng, quảng cáo, theo dõi, bán hay chia sẻ dữ liệu, máy chủ trung gian của livesub. Extension
không đọc trang nào ngoài `www.youtube.com`, không đọc lịch sử, cookie hay mật khẩu.

**Quyền truy cập**
- `storage`: lưu cài đặt và bản dịch trên máy.
- `activeTab`: biết video ở tab đang mở khi bạn bấm biểu tượng.
- Truy cập `www.youtube.com`: đọc phụ đề và hiện bản dịch.
- Quyền gọi endpoint AI: chỉ xin cho đúng địa chỉ bạn nhập, khi bạn bấm "Lưu và kiểm tra".

**Xoá dữ liệu:** gỡ extension sẽ xoá toàn bộ dữ liệu nó lưu trên máy.

**Liên hệ:** mở issue tại https://github.com/nhuphuc1602/livesub-extension/issues

## English

livesub is a Chrome extension that translates YouTube captions into Vietnamese using an AI service **you** configure.

- **Caption text and context, sent only to the AI endpoint you enter.** This covers the English caption text of the video
  you are watching. It also covers the context used for the translation: the video's title, description, keywords and
  channel name, previous lines, and the pronouns and glossary you enter. How that service stores or uses the data is
  governed by its own policy.
- **API key:** the key you enter is stored **on your device** (`chrome.storage.local`, not synced). It is sent only to
  that endpoint, in the `Authorization` header.
- **Settings** use `chrome.storage.sync`.
- **Translations, your corrections and per-video / per-channel context** are cached **on your device**, for the 60 most
  recent videos.
- **What livesub does not do:**
  - no analytics, ads, tracking, data sales or sharing, and no livesub server;
  - no pages other than `www.youtube.com` are read;
  - no history, cookies or passwords are accessed.
- **Permissions:**
  - `storage`: settings and cache.
  - `activeTab`: the video in the tab when you click the icon.
  - `www.youtube.com`: read captions, draw translations.
  - Optional host permission: the one endpoint origin you save.
- **Deleting data:** uninstalling the extension removes all data it stored.
- **Contact:** https://github.com/nhuphuc1602/livesub-extension/issues
