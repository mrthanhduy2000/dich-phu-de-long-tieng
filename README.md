# Dịch Phụ Đề & Lồng Tiếng AI

[![Cài thử tự động](https://github.com/mrthanhduy2000/dich-phu-de-long-tieng/actions/workflows/install-test.yml/badge.svg)](https://github.com/mrthanhduy2000/dich-phu-de-long-tieng/actions/workflows/install-test.yml)

Tiện ích Chrome dịch phụ đề YouTube và Coursera sang tiếng Việt bằng Gemini, và lồng tiếng Việt bằng
giọng [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) chạy ngay trên máy (miễn phí, không gửi
lời thoại ra ngoài).

Huy hiệu ở trên là kết quả cài thử tự động: mỗi lần có bản mới, GitHub chạy đúng lệnh cài bên dưới
trên máy Windows và Mac sạch (cài, đọc thử một câu, tắt máy chủ giọng xem nó tự bật lại, cập nhật,
gỡ bỏ).

## Máy dùng được

| Máy | Dịch phụ đề | Lồng tiếng VieNeu |
|---|---|---|
| Mac chip Apple (M1 trở lên) | Có | Có |
| Mac chip Intel | Có | Không |
| Windows 10/11, máy Intel hoặc AMD 64-bit | Có | Có |
| Windows chip ARM (Snapdragon) | Có | Không |

Cần Google Chrome và khoảng 3 GB trống. Giọng đọc chạy bằng CPU: máy càng mạnh thì giọng càng theo kịp
phụ đề. Trang Cài đặt của tiện ích có báo tốc độ đo được trên máy bạn (dưới 0,4 là thoải mái).

## Cài đặt

### Cách 1: nhờ AI cài (Claude Code, Codex, hay AI nào chạy được lệnh trên máy)

Chép nguyên đoạn dưới đây gửi cho AI:

```text
Hãy cài cho tôi tiện ích Chrome "Dịch Phụ Đề & Lồng Tiếng AI" theo hướng dẫn tại
https://github.com/mrthanhduy2000/dich-phu-de-long-tieng

1. Xác định máy tôi là macOS hay Windows, rồi chạy đúng MỘT lệnh cài trong mục "Cách 2" của trang
   đó. Đừng tự cài từng bước bằng tay: bộ cài đã lo hết (tải tiện ích, tải và cài VieNeu, bật
   VieNeu tự chạy cùng máy, chờ VieNeu sẵn sàng). Lần đầu mất 5 đến 15 phút, cứ để nó chạy hết.
   Nếu công cụ chạy lệnh của bạn có giới hạn thời gian, đặt giới hạn 20 phút hoặc chạy nền rồi
   theo dõi.
2. Nếu bộ cài báo "LỖI" hay "LOI", tra bảng "Khi gặp lỗi" trên trang đó, sửa đúng nguyên nhân,
   rồi chạy lại đúng lệnh cài. Chạy lại bao nhiêu lần cũng an toàn. Không sửa tệp trong thư mục
   tiện ích hay VieNeu. Việc gì cần tôi đồng ý (tắt một chương trình, bấm Yes khi Windows hỏi
   quyền) thì hỏi tôi trước.
3. Chrome không cho AI tự bật tiện ích. Khi bộ cài xong, đọc phần hướng dẫn cuối cùng nó in ra và
   chỉ tôi làm từng bước, chờ tôi báo xong mới sang bước sau.
4. Không hỏi tôi khóa API, tôi sẽ tự dán sau. Trả lời tôi bằng tiếng Việt.
```

### Cách 2: tự chạy một lệnh

**Mac:** mở ứng dụng Terminal, dán lệnh này rồi nhấn Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash
```

**Windows:** bấm Start, gõ `PowerShell`, mở **Windows PowerShell**, dán lệnh này rồi nhấn Enter:

```powershell
irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
```

Bộ cài không cần quyền quản trị (riêng Windows thiếu gói Microsoft Visual C++ thì Windows hỏi quyền
một lần để cài gói đó). Khi xong, nó mở trang `chrome://extensions` và in ra 4 bước cuối:

1. Bật **Chế độ dành cho nhà phát triển** ở góc trên bên phải.
2. Bấm **Tải tiện ích đã giải nén**.
3. Chọn thư mục `DichPhuDe` trong thư mục người dùng của bạn (đường dẫn đã được chép sẵn, chỉ cần dán).
4. Mở Cài đặt của tiện ích, dán khóa Gemini API, để model là **Tự động**.

Khóa Gemini miễn phí lấy tại [Google AI Studio](https://aistudio.google.com/apikey).

## Cập nhật

Nhấp đúp **Cập nhật Dịch Phụ Đề** trên màn hình chính (hoặc chạy lại lệnh cài), rồi ở
`chrome://extensions` bấm nút **Tải lại** trên thẻ tiện ích và F5 tab video.

**Đừng gỡ tiện ích rồi cài lại:** Chrome sẽ xóa hết cài đặt và khóa API.

## Khi gặp lỗi

| Bộ cài báo | Cách xử lý |
|---|---|
| Cổng 8000 đang bị chương trình khác dùng | Tiện ích gọi giọng VieNeu ở cổng 8000. Tắt chương trình được nêu tên (thường là một máy chủ lập trình đang chạy), rồi chạy lại lệnh cài |
| Thư mục `VieNeu-TTS` hoặc `DichPhuDe` đã có sẵn | Đó là thư mục bạn tự tạo trước đây. Đổi tên nó (ví dụ thêm `-cu`), rồi chạy lại lệnh cài |
| Thiếu Microsoft Visual C++ Redistributable (Windows) | Cài tại https://aka.ms/vs/17/release/vc_redist.x64.exe, rồi chạy lại lệnh cài |
| VieNeu chưa phản hồi sau 15 phút | Thường do mạng chậm khi tải mô hình giọng (khoảng 600 MB). Chạy lại lệnh cài: phần đã tải được giữ lại |
| `uv sync` không thành công | Thường do mạng. Chạy lại lệnh cài |

Giọng bị trễ dần so với phụ đề: mở Cài đặt của tiện ích, xem dòng "Tốc độ tạo giọng". Trên 0,8 là máy
quá chậm cho giọng đọc; vẫn dùng được phần dịch phụ đề.

## Gỡ bỏ

**Mac:**

```bash
curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash -s -- --uninstall
```

**Windows** (Windows PowerShell):

```powershell
$env:DPD_UNINSTALL='1'; irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
```

Lệnh gỡ tắt VieNeu, bỏ tự khởi động, xóa thư mục `DichPhuDe`, `VieNeu-TTS` và mô hình giọng đã tải.
Cuối cùng bấm **Xóa** trên thẻ tiện ích ở `chrome://extensions`.

## Ghi chú

- Thư mục `vieneu/` chứa một tệp của VieNeu-TTS (giấy phép Apache 2.0) đã được vá: máy chủ giọng giải
  phóng chỗ khi người xem tua video, nếu không mọi yêu cầu sau đó đều bị từ chối cho tới khi khởi động
  lại. `openai_speech.patch` là phần thay đổi so với bản gốc.
- Giọng VieNeu chỉ mở ở `127.0.0.1:8000`, máy khác trong mạng không gọi được.
- Trên Windows, VieNeu chạy ẩn bằng `pythonw.exe` (không có cửa sổ), khởi động cùng Windows qua một
  lối tắt trong thư mục Startup.
