# Dịch Phụ Đề & Lồng Tiếng AI

[![Cài thử tự động](https://github.com/mrthanhduy2000/dich-phu-de-long-tieng/actions/workflows/install-test.yml/badge.svg)](https://github.com/mrthanhduy2000/dich-phu-de-long-tieng/actions/workflows/install-test.yml)

Tiện ích Chrome dịch phụ đề YouTube và Coursera sang tiếng Việt bằng Gemini, và lồng tiếng Việt bằng
giọng [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) chạy ngay trên máy (miễn phí, không gửi
lời thoại ra ngoài).

## Cài đặt: một lệnh

**Mac:** mở ứng dụng **Terminal**, dán lệnh này, nhấn Enter.

```bash
curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash
```

**Windows:** bấm Start, gõ `PowerShell`, mở **Windows PowerShell**, dán lệnh này, nhấn Enter.

```powershell
irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
```

Lần đầu mất 5 đến 15 phút. Không cần quyền quản trị. Khi xong, Chrome tự mở một trang hướng dẫn 4 bước
(có nút chép sẵn): bật **Chế độ dành cho nhà phát triển**, bấm **Tải tiện ích đã giải nén**, chọn thư
mục `DichPhuDe`, rồi dán khóa Gemini (miễn phí tại [Google AI Studio](https://aistudio.google.com/apikey)).
Chrome không cho chương trình nào tự làm bước này, nên đây là việc tay duy nhất.

**Sau đó không cần làm gì nữa:** giọng đọc tự chạy mỗi khi bật máy, và bản mới tự được tải về rồi
cài vào lần mở Chrome kế tiếp.

### Nhờ AI cài giúp

Gửi nguyên đoạn này cho AI chạy được lệnh trên máy (Claude Code, Codex...):

```text
Cài cho tôi tiện ích theo https://github.com/mrthanhduy2000/dich-phu-de-long-tieng : xác định máy
là Mac hay Windows rồi chạy đúng MỘT lệnh cài ở mục "Cài đặt: một lệnh" (lần đầu tới 15 phút, đặt
giới hạn thời gian 20 phút hoặc chạy nền). Nếu bộ cài báo "LỖI"/"LOI", tra bảng "Khi gặp lỗi" ở trang
đó, sửa đúng nguyên nhân rồi chạy lại lệnh cài; việc gì cần tôi đồng ý thì hỏi trước. Xong thì chỉ tôi
làm theo trang hướng dẫn Chrome vừa mở, từng bước. Không hỏi khóa API. Trả lời bằng tiếng Việt.
```

## Máy dùng được

| Máy | Dịch phụ đề | Lồng tiếng VieNeu | Tự cập nhật |
|---|---|---|---|
| Mac chip Apple (M1 trở lên) | Có | Có | Có |
| Windows 10/11, Intel hoặc AMD | Có | Có | Có |
| Mac chip Intel, Windows chip ARM | Có | Không | Không: nhấp đúp **Cập nhật Dịch Phụ Đề** trên màn hình chính |

Cần Google Chrome và khoảng 3 GB trống. Giọng đọc chạy bằng CPU; trang Cài đặt của tiện ích báo tốc
độ đo được trên máy bạn (dưới 0,4 là thoải mái, trên 0,8 thì giọng sẽ trễ dần).

Huy hiệu ở đầu trang là kết quả cài thử tự động: mỗi bản mới được GitHub cài thử bằng đúng lệnh trên,
trên máy Windows và Mac sạch (kể cả thư mục người dùng có tên tiếng Việt có dấu), rồi đọc thử, tắt
máy chủ giọng xem nó tự bật lại, tự cập nhật, gỡ bỏ.

## Khi gặp lỗi

| Bộ cài báo | Cách xử lý |
|---|---|
| Cổng 8000 đang bị chương trình khác dùng | Tắt chương trình được nêu tên (thường là một máy chủ lập trình), rồi chạy lại lệnh cài |
| Thư mục `VieNeu-TTS` hoặc `DichPhuDe` đã có sẵn | Thư mục bạn tự tạo trước đây: đổi tên nó (ví dụ thêm `-cu`), rồi chạy lại lệnh cài |
| Thiếu Microsoft Visual C++ Redistributable (Windows) | Cài tại https://aka.ms/vs/17/release/vc_redist.x64.exe, rồi chạy lại lệnh cài |
| VieNeu chưa phản hồi sau 15 phút, hoặc `uv sync` không thành công | Thường do mạng chậm. Chạy lại lệnh cài: phần đã tải được giữ lại |

Chạy lại lệnh cài bao nhiêu lần cũng an toàn; nó cũng là cách cập nhật ngay. Cài đặt và khóa API
trong Chrome luôn được giữ. **Đừng gỡ tiện ích trong Chrome rồi cài lại:** làm thế mất hết cài đặt.

## Gỡ bỏ

**Mac:** `curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash -s -- --uninstall`

**Windows:** `$env:DPD_UNINSTALL='1'; irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex`

Lệnh gỡ tắt VieNeu và tự cập nhật, xóa thư mục `DichPhuDe`, `VieNeu-TTS` và mô hình giọng đã tải.
Cuối cùng bấm **Xóa** trên thẻ "Vietnamese Subtitle Translator" ở `chrome://extensions`.

## Ghi chú

- Trong Chrome, tiện ích mang tên **Vietnamese Subtitle Translator (Coursera + YouTube)**.
- Thư mục `vieneu/` chứa một tệp của VieNeu-TTS (giấy phép Apache 2.0) đã được vá để máy chủ giọng
  không bị kẹt sau khi người xem tua video. `openai_speech.patch` là phần thay đổi so với bản gốc.
- Giọng VieNeu chỉ mở ở `127.0.0.1:8000`, máy khác trong mạng không gọi được. Trên Windows nó chạy ẩn
  (không cửa sổ); muốn tạm tắt: Task Manager, mục Startup apps, "DichPhuDe VieNeu".
- Tự cập nhật: mỗi 6 giờ hỏi GitHub; bản mới được tải sẵn và chỉ chép vào thư mục tiện ích khi Chrome
  đang đóng, nên không bao giờ chen ngang lúc bạn đang xem. Nhật ký: `VieNeu-TTS/update.log`.
