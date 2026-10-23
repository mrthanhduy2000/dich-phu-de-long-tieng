# Dịch Phụ Đề & Lồng Tiếng AI

[![Cài thử tự động](https://github.com/mrthanhduy2000/dich-phu-de-long-tieng/actions/workflows/install-test.yml/badge.svg)](https://github.com/mrthanhduy2000/dich-phu-de-long-tieng/actions/workflows/install-test.yml)

Tiện ích cho trình duyệt nhân Chromium (Chrome, Cốc Cốc, Edge, Brave, Opera, Vivaldi, Arc) dịch phụ
đề YouTube và Coursera sang tiếng Việt bằng Gemini, và đọc lồng tiếng Việt bằng giọng
[VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) chạy ngay trên máy: giọng đọc miễn phí, lời
thoại không gửi ra ngoài để đọc.

Cài bằng **một lệnh**, sau đó bật tiện ích trong trình duyệt theo trang hướng dẫn tự mở (4 bước, có
nút chép sẵn). Từ đó giọng đọc tự chạy cùng máy và tiện ích tự cập nhật.

## Tiện ích làm được gì

**Phụ đề tiếng Việt**
- Dịch theo ngữ cảnh cả bài: gửi kèm câu trước, tiêu đề, mô tả video, nên đại từ và thuật ngữ nhất
  quán từ đầu tới cuối. Từ điển thuật ngữ 19 nhóm ngành; tự thêm từ giữ nguyên hoặc cách dịch riêng.
- Hiện song ngữ hoặc chỉ tiếng Việt; chỉnh cỡ chữ ngay trên video, chỉnh vị trí và kiểu chữ trong Cài đặt.
- Bản chép lời cạnh video: sửa tay từng dòng (được nhớ cho lần sau), xuất tệp `.srt`.
- Video đã có phụ đề tiếng Việt thì dùng luôn, không tốn phí.
- Các trang video khác có phụ đề dạng text track cũng dịch được khi bấm **Dịch** trong bảng điều khiển.

**Lồng tiếng Việt**
- 25 giọng VieNeu theo vùng miền (mặc định Mỹ Duyên), chạy trên máy bạn.
- Khớp theo mốc thời gian của phụ đề bằng tốc độ đọc và khoảng nghỉ. **Không bao giờ lược bớt lời**:
  người nói nhanh thì giọng đọc nhanh hơn trong giới hạn bạn đặt, nội dung giữ đủ.
- **Mỗi người nói một giọng, tự bật.** Video có 2 đến 5 người nói thì mỗi người một giọng riêng; video
  chỉ một người nói vẫn giữ một giọng, kể cả khi phụ đề tự động đánh dấu nhầm quanh đoạn nhạc hay tiếng
  cười. Phụ đề có tên người nói (`TÊN:`) thì theo tên; phụ đề không đánh dấu gì thì, nếu có khóa
  Gemini, tiện ích đọc lời gốc một lần cho mỗi video để biết ai nói câu nào, nam hay nữ, rồi chọn
  giọng hợp giới tính (ước tính vài chục đồng cho video 10 phút; xem lại không tốn thêm). Muốn cả
  video một giọng: Cài đặt > Lồng tiếng > **Giọng theo người nói** > Một giọng cho cả video.
- Tự hạ tiếng gốc khi giọng Việt đang đọc. Giọng đã tạo được lưu lại, xem lại video không phải tạo lại.

**Phím tắt:** `Alt+S` bật/tắt phụ đề, `Alt+D` bật/tắt lồng tiếng, `Alt+Shift+V` mở bảng điều khiển.

## Cài đặt: một lệnh

**Mac:** mở ứng dụng **Terminal**, dán lệnh này, nhấn Enter.

```bash
curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash
```

**Windows:** bấm Start, gõ `PowerShell`, mở **Windows PowerShell**, dán lệnh này, nhấn Enter.

```powershell
irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex
```

Lần đầu mất 5 đến 15 phút, cần khoảng 3 GB trống, không cần quyền quản trị. Bộ cài tự tải tiện ích
vào thư mục `DichPhuDe` trong thư mục người dùng, cài giọng VieNeu cùng mô hình giọng, cho VieNeu tự
chạy cùng máy, rồi chờ tới khi giọng sẵn sàng.

### Bước cuối: bật tiện ích trong trình duyệt

Khi bộ cài xong, một trang hướng dẫn tự mở trong trình duyệt nhân Chromium của bạn (trình mặc định nếu
nó là Chromium; nếu không thì Chrome, Cốc Cốc, Edge, Brave... trình nào có trên máy). Trang tự nhận ra
trình duyệt đang dùng và chỉ đúng địa chỉ, đúng tên nút của trình đó:

1. Chép địa chỉ trang tiện ích (ví dụ `chrome://extensions`, Edge là `edge://extensions`), dán vào
   thanh địa chỉ, nhấn Enter.
2. Bật **Chế độ dành cho nhà phát triển** (Developer mode).
3. Bấm **Tải tiện ích đã giải nén** (Load unpacked), chọn thư mục `DichPhuDe` (trang có nút chép
   đường dẫn).
4. Trang Cài đặt của tiện ích tự mở với phần chào mừng: dán khóa Gemini (tạo miễn phí tại
   [Google AI Studio](https://aistudio.google.com/apikey); chưa có khóa vẫn dịch được bằng Google
   Dịch), xem giọng VieNeu đã sẵn sàng chưa, rồi ghim tiện ích lên thanh công cụ.

Trình duyệt không cho chương trình nào tự bật một tiện ích không qua cửa hàng, nên đây là việc tay duy
nhất. **Sau đó không cần làm gì nữa:** giọng đọc tự chạy mỗi khi bật máy, bản mới tự tải về và được
cài vào lần mở trình duyệt kế tiếp.

### Nhờ AI cài giúp

Gửi nguyên đoạn này cho AI chạy được lệnh trên máy (Claude Code, Codex...):

```text
Cài cho tôi tiện ích theo https://github.com/mrthanhduy2000/dich-phu-de-long-tieng : xác định máy
là Mac hay Windows rồi chạy đúng MỘT lệnh cài ở mục "Cài đặt: một lệnh" (lần đầu tới 15 phút, đặt
giới hạn thời gian 20 phút hoặc chạy nền). Nếu bộ cài báo "LỖI"/"LOI", tra bảng "Khi gặp lỗi" ở trang
đó, sửa đúng nguyên nhân rồi chạy lại lệnh cài; việc gì cần tôi đồng ý thì hỏi trước. Xong thì chỉ tôi
làm theo trang hướng dẫn vừa mở trong trình duyệt, từng bước. Không hỏi khóa API. Trả lời bằng tiếng Việt.
```

## Trình duyệt dùng được

| Trình duyệt | Dùng được | Trang tiện ích |
|---|---|---|
| Google Chrome | Có (tác giả dùng hằng ngày) | `chrome://extensions` |
| Cốc Cốc | Có | `chrome://extensions` |
| Microsoft Edge | Có | `edge://extensions` (nút nhà phát triển ở cột bên trái) |
| Brave | Có | `brave://extensions` |
| Opera, Opera GX | Có | `opera://extensions` |
| Vivaldi | Có | `vivaldi://extensions` |
| Arc, Chromium | Có | `chrome://extensions` |
| Firefox, Safari | Không | Tiện ích chỉ viết cho nhân Chromium |

Các trình nhân Chromium chạy cùng một mã tiện ích; ngoài Chrome, chưa trình nào được thử đủ mọi tính
năng, nên gặp gì lạ xin báo lại. Dùng nhiều trình duyệt cùng lúc được: mỗi trình bật tiện ích từ cùng
thư mục `DichPhuDe`, nhưng giữ cài đặt và khóa riêng.

## Máy dùng được

| Máy | Dịch phụ đề | Lồng tiếng VieNeu | Tự cập nhật |
|---|---|---|---|
| Mac chip Apple (M1 trở lên) | Có | Có | Có |
| Windows 10/11, Intel hoặc AMD | Có | Có | Có |
| Mac chip Intel | Có | Thử nghiệm: thêm `DPD_INTEL_VOICE=1` trước chữ `bash` khi chạy lệnh cài | Có nếu cài giọng, không thì nhấp đúp **Cập nhật Dịch Phụ Đề** |
| Windows chip ARM | Có | Không | Không: nhấp đúp **Cập nhật Dịch Phụ Đề** trên màn hình chính |

Giọng đọc chạy bằng CPU; trang Cài đặt báo tốc độ đo được trên máy bạn (dưới 0,4 là thoải mái, trên
0,8 thì giọng sẽ trễ dần). Khi giọng không theo kịp, tiện ích tự báo và gợi ý tốc độ phát video phù hợp
(ví dụ 0,75× khi mất 1,3 giây cho 1 giây lời nói), bấm một nút là đặt luôn.

Huy hiệu ở đầu trang là kết quả cài thử tự động: mỗi bản mới được GitHub cài thử bằng đúng lệnh trên,
trên máy Windows và Mac sạch (kể cả thư mục người dùng có tên tiếng Việt có dấu), rồi kiểm mô hình
giọng từng byte, đọc thử khi không lên mạng, tắt máy chủ giọng xem nó tự bật lại, tự cập nhật, gỡ bỏ.
Bản mới chỉ tới máy bạn sau khi lần cài thử đó đạt.

## Giọng đọc chạy không cần mạng

Mô hình giọng (khoảng 600 MB) được tải một lần từ mục
[Releases](https://github.com/mrthanhduy2000/dich-phu-de-long-tieng/releases) của trang này, đúng một
phiên bản đã khóa, và bộ cài kiểm từng tệp bằng mã băm sha256 trước khi dùng. Sau đó máy chủ giọng
đọc mô hình ngay trong thư mục `VieNeu-TTS`, không hỏi Hugging Face hay trang nào khác, nên giọng
không tự đổi khi bên ngoài cập nhật và vẫn đọc được khi mất mạng. Mỗi lần khởi động, máy chủ giọng
kiểm lại đủ tệp, đúng kích thước; nếu lỡ mất một tệp (ví dụ do phần mềm dọn ổ đĩa), giọng vẫn chạy
bằng cách tạm tải mô hình từ Hugging Face, và bộ tự cập nhật tải bù tệp thiếu trong vòng nửa giờ.

## Khi gặp lỗi

| Bộ cài báo | Cách xử lý |
|---|---|
| Cổng 8000 đang bị chương trình khác dùng | Tắt chương trình được nêu tên (thường là một máy chủ lập trình), rồi chạy lại lệnh cài |
| Thư mục `VieNeu-TTS` hoặc `DichPhuDe` đã có sẵn | Thư mục bạn tự tạo trước đây: đổi tên nó (ví dụ thêm `-cu`), rồi chạy lại lệnh cài |
| Thiếu Microsoft Visual C++ Redistributable (Windows) | Cài tại https://aka.ms/vs/17/release/vc_redist.x64.exe, rồi chạy lại lệnh cài |
| VieNeu chưa phản hồi sau 15 phút, hoặc `uv sync` không thành công | Thường do mạng chậm. Chạy lại lệnh cài: phần đã tải được giữ lại |
| `CẢNH BÁO`/`CANH BAO`: chưa tải được mô hình giọng | Không phải lỗi chặn: giọng vẫn chạy, tạm tải mô hình từ Hugging Face. Bộ tự cập nhật thử lại sau vài giờ; muốn xong ngay thì chạy lại lệnh cài khi mạng ổn (phần đã tải được giữ lại). Nếu báo thiếu chỗ trống thì dọn bớt ổ đĩa trước |
| `Mang hoac proxy chan ket noi toi GitHub` (hoặc `Hugging Face`) | Tường lửa, proxy hoặc mạng công ty/trường học chặn trang đó (không phải do thiếu bản phát hành). Thử mạng khác (ví dụ điểm phát Wi-Fi từ điện thoại) hoặc nhờ người quản trị mạng mở `github.com` và các trang `*.githubusercontent.com`, rồi chạy lại lệnh cài |
| Không thấy trang hướng dẫn mở ra, hoặc máy không có trình duyệt nhân Chromium | Cài Chrome hoặc Cốc Cốc, rồi mở tệp `DichPhuDe/tools/huong-dan-cai-dat.html` bằng trình đó |

| Khi đang dùng | Cách xử lý |
|---|---|
| Có phụ đề nhưng không có giọng | Mở Cài đặt > Lồng tiếng xem dòng trạng thái VieNeu. Chưa chạy thì khởi động lại máy (VieNeu tự chạy cùng máy) hoặc chạy lại lệnh cài |
| Giọng thứ hai chen vào video chỉ có một người | Báo lại kèm đường dẫn video. Tạm thời: Cài đặt > Lồng tiếng > Giọng theo người nói > Một giọng cho cả video |
| Muốn dịch bằng Gemini nhưng báo hết hạn mức | Khóa miễn phí có giới hạn số lần gọi mỗi phút và mỗi ngày; chờ một lúc, hoặc đặt ngân sách trong Cài đặt |

Chạy lại lệnh cài bao nhiêu lần cũng an toàn; nó cũng là cách cập nhật ngay. Cài đặt và khóa API
trong trình duyệt luôn được giữ. **Đừng gỡ tiện ích trong trình duyệt rồi cài lại:** làm thế mất hết
cài đặt. Chạy lại lệnh cài lúc trình duyệt đang mở thì sau đó bấm **Tải lại** trên thẻ tiện ích ở
trang tiện ích (bản tự cập nhật thì không cần: nó chỉ chép khi trình duyệt đã đóng).

## Gỡ bỏ

**Mac:** `curl -fsSL https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-mac.sh | bash -s -- --uninstall`

**Windows:** `$env:DPD_UNINSTALL='1'; irm https://raw.githubusercontent.com/mrthanhduy2000/dich-phu-de-long-tieng/main/install-windows.ps1 | iex`

Lệnh gỡ tắt VieNeu và tự cập nhật, xóa thư mục `DichPhuDe`, `VieNeu-TTS` (mô hình giọng nằm trong đó)
và bản mô hình mà các bản cài cũ để trong thư mục `.cache`. Cuối cùng bấm **Xóa** trên thẻ
"Vietnamese Subtitle Translator" ở trang tiện ích của trình duyệt (`chrome://extensions`,
`edge://extensions`...).

## Quyền riêng tư

- **Giọng đọc:** chạy hoàn toàn trên máy. Máy chủ VieNeu chỉ mở ở `127.0.0.1:8000`, máy khác trong
  mạng không gọi được.
- **Dịch phụ đề:** lời phụ đề được gửi tới Gemini (Google) bằng khóa của bạn; khi tắt AI hoặc Gemini
  lỗi thì gửi tới Google Dịch. Khi bật "Dùng Gemini nhận ra ai đang nói", lời gốc của video YouTube
  được gửi thêm một lần cho việc đó.
- **Khóa Gemini** nằm trong kho cài đặt của trình duyệt, chỉ dùng để gọi Gemini.
- **Tự cập nhật** chỉ hỏi GitHub phiên bản mới và tải tệp từ chính trang này (mô hình giọng từ mục
  Releases; nếu không tải được thì từ Hugging Face, đúng phiên bản đã khóa).

## Ghi chú

- Trong trình duyệt, tiện ích mang tên **Vietnamese Subtitle Translator (Coursera + YouTube)**.
- Thư mục `vieneu/` chứa một tệp của VieNeu-TTS (giấy phép Apache 2.0) đã được vá để máy chủ giọng
  không bị kẹt sau khi người xem tua video, và chỉ nghe trên `127.0.0.1` nếu không đặt `HOST` khác.
  `openai_speech.patch` là phần thay đổi so với bản gốc.
- Mô hình giọng trong mục Releases là bản sao nguyên vẹn của
  [VieNeu-TTS-v3-Turbo](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo) và
  [MOSS-Audio-Tokenizer-Nano-ONNX](https://huggingface.co/OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX),
  cả hai theo giấy phép Apache 2.0. Ghi công tác giả: tệp `NOTICE`; toàn văn giấy phép:
  `LICENSE-Apache-2.0.txt`.
- Trên Windows, VieNeu chạy ẩn (không cửa sổ); muốn tạm tắt: Task Manager, mục Startup apps,
  "DichPhuDe VieNeu".
- Tự cập nhật: mỗi 6 giờ hỏi GitHub; bản mới được tải sẵn và chỉ chép vào thư mục tiện ích khi trình
  duyệt đang dùng tiện ích đã đóng hẳn, nên không bao giờ chen ngang lúc bạn đang xem. Edge trên
  Windows thường vẫn chạy ngầm sau khi đóng cửa sổ, nên bản mới có thể chờ tới lần khởi động lại máy.
  Mỗi nửa giờ bộ cập nhật cũng kiểm mô hình giọng và tải bù tệp thiếu; bản mô hình mà các bản cài cũ để
  trong thư mục `.cache` (khoảng 600 MB) được tự xóa một lần, sau khi giọng đã chạy bằng bản đã khóa.
  Nhật ký: `VieNeu-TTS/update.log`.
