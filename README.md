# Dịch Phụ Đề & Lồng Tiếng AI

Tiện ích Chrome dịch phụ đề YouTube và Coursera sang tiếng Việt bằng Gemini, và lồng tiếng Việt bằng
giọng [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) chạy ngay trên máy (miễn phí, không gửi
lời thoại ra ngoài).

## Máy dùng được

| Máy | Dịch phụ đề | Lồng tiếng VieNeu |
|---|---|---|
| Mac chip Apple (M1 trở lên) | Có | Có |
| Mac chip Intel | Có | Không |
| Windows 10/11, máy Intel hoặc AMD 64-bit | Có | Có |
| Windows chip ARM (Snapdragon) | Có | Không |

Cần Google Chrome và khoảng 3 GB trống. Giọng đọc chạy bằng CPU: máy càng mạnh thì giọng càng theo kịp
phụ đề. Trang Cài đặt của tiện ích có báo tốc độ đo được trên máy bạn.

## Cài đặt

### Cách 1: nhờ AI cài (Claude Code, Codex, hay AI nào chạy được lệnh trên máy)

Chép nguyên đoạn dưới đây gửi cho AI:

```text
Hãy cài cho tôi tiện ích Chrome "Dịch Phụ Đề & Lồng Tiếng AI" theo hướng dẫn tại
https://github.com/mrthanhduy2000/dich-phu-de-long-tieng

1. Xác định máy tôi là macOS hay Windows, rồi chạy đúng MỘT lệnh cài trong mục "Cách 2" của trang
   đó. Đừng tự cài từng bước bằng tay: bộ cài đã lo hết (tải tiện ích, tải và cài VieNeu, bật
   VieNeu tự chạy cùng máy, chờ VieNeu sẵn sàng). Lần đầu mất 5 đến 15 phút, cứ để nó chạy hết.
   Nếu lệnh của bạn có giới hạn thời gian, đặt giới hạn đủ dài hoặc chạy nền rồi theo dõi.
2. Nếu bộ cài báo "LỖI" hay "LOI", đọc thông báo, sửa đúng nguyên nhân đó (ví dụ thiếu Microsoft
   Visual C++ Redistributable trên Windows thì cài nó), rồi chạy lại đúng lệnh cài. Chạy lại bao
   nhiêu lần cũng an toàn. Không sửa tệp trong thư mục tiện ích hay VieNeu.
3. Chrome không cho AI tự bật tiện ích. Khi bộ cài xong, đọc phần hướng dẫn cuối cùng nó in ra và
   chỉ tôi làm từng bước, chờ tôi báo xong mới sang bước sau.
4. Không hỏi tôi khóa API, tôi sẽ tự dán sau. Trả lời tôi bằng tiếng Việt.
```

### Cách 2: tự chạy một lệnh

**Mac:** mở ứng dụng Terminal, dán lệnh này rồi nhấn Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash
```

**Windows:** bấm Start, gõ `PowerShell`, mở Windows PowerShell, dán lệnh này rồi nhấn Enter:

```powershell
irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
```

Bộ cài không cần quyền quản trị. Khi xong, nó mở trang `chrome://extensions` và in ra 4 bước cuối:

1. Bật **Chế độ dành cho nhà phát triển** ở góc trên bên phải.
2. Bấm **Tải tiện ích đã giải nén**.
3. Chọn thư mục `DichPhuDe` trong thư mục người dùng của bạn (đường dẫn đã được chép sẵn, chỉ cần dán).
4. Mở Cài đặt của tiện ích, dán khóa Gemini API, để model là **Tự động**.

## Cập nhật

Nhấp đúp **Cập nhật Dịch Phụ Đề** trên màn hình chính (hoặc chạy lại lệnh cài), rồi ở
`chrome://extensions` bấm nút **Tải lại** trên thẻ tiện ích và F5 tab video.

**Đừng gỡ tiện ích rồi cài lại:** Chrome sẽ xóa hết cài đặt và khóa API.

## Gỡ bỏ

1. Gỡ tiện ích ở `chrome://extensions`.
2. Tắt VieNeu tự chạy:
   - Mac: `~/DichPhuDe/tools/vieneu-autostart.command --uninstall`
   - Windows: `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\DichPhuDe\tools\vieneu-autostart.ps1" -Uninstall`
3. Xóa hai thư mục `DichPhuDe` và `VieNeu-TTS` trong thư mục người dùng.

## Ghi chú

- Thư mục `vieneu/` chứa một tệp của VieNeu-TTS (giấy phép Apache 2.0) đã được vá: máy chủ giọng giải
  phóng chỗ khi người xem tua video, nếu không mọi yêu cầu sau đó đều bị từ chối cho tới khi khởi động
  lại. `openai_speech.patch` là phần thay đổi so với bản gốc.
- Giọng VieNeu chỉ mở ở `127.0.0.1:8000`, máy khác trong mạng không gọi được.
