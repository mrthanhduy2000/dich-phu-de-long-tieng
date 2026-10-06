// Lịch sử phiên bản: MỘT nguồn duy nhất cho mục "Lịch sử phiên bản" trong trang Cài đặt.
// Mỗi mục: v (số phiên bản), luc (thời điểm cập nhật, để trống nếu không ghi lại được),
// ten (tên bản), y (những việc đã làm), bang (bảng so sánh Trước / Nay, nếu có số đo thật).
(function (root) {
    const HISTORY = [
        {
            v: "2.4.9", luc: "", ten: "Chia sẻ cho bạn bè, có cả máy Windows",
            y: [
                "Có bộ cài một lệnh cho Mac và Windows: tự tải tiện ích, tải và cài giọng VieNeu, bật VieNeu tự chạy cùng máy rồi chờ tới khi giọng sẵn sàng. Không cần git, không cần quyền quản trị. Chạy lại bộ cài là cập nhật, cài đặt và khóa API được giữ nguyên.",
                "Máy chủ giọng VieNeu nay tự chạy cùng Windows và tự bật lại nếu bị tắt, như trên Mac: nhấp đúp tools/vieneu-autostart.cmd trong thư mục tiện ích. Trang Cài đặt chỉ đúng tệp cho từng loại máy.",
                "Bản cài cho bạn bè có sẵn bản vá giúp máy chủ giọng không bị kẹt sau khi tua video."
            ],
        },
        {
            v: "2.4.8", luc: "", ten: "Giọng thứ hai biết đâu là video một người nói",
            y: [
                "Trước đây giọng thứ hai đổi giọng mỗi khi phụ đề có dấu \">>\". Phụ đề tự động của YouTube lại hay chèn dấu này quanh đoạn nhạc nền hay tiếng thở dài ngay giữa lời của một người, nên video chỉ có một người nói vẫn bị đọc bằng hai giọng: có video 35 phút bị đọc 94% bằng giọng thứ hai chỉ vì một tiếng thở dài.",
                "Nay tiện ích bỏ qua dấu đổi người nói nằm cạnh đoạn nhạc hay tiếng động, và chỉ dùng giọng thứ hai khi video thật sự là một cuộc trò chuyện, tức là có những lượt hỏi đáp qua lại trong vòng vài giây. Vài dấu lẻ loi cách nhau nhiều phút trong một bài độc thoại không còn làm đổi giọng.",
                "Lượt đổi người nói nằm giữa một câu phụ đề (ví dụ \"Bạn muốn nóng hay đá? >> Nóng.\") trước đây bị bỏ sót, làm hai giọng bị tráo cho tới hết video. Nay giọng đổi đúng chỗ đó.",
                "Người nói nhiều nhất (người dẫn vlog, khách mời chính) luôn dùng giọng chính. Nếu phụ đề bỏ sót một lượt đổi người nói, hai giọng chỉ bị tráo tới khi người chính nói một đoạn dài, không còn tới hết video.",
                "Phụ đề có ghi tên người nói (\"ANDREW HUBERMAN:\") vẫn được dùng, nhưng dòng ghi công người dịch của TED (\"Translator: ...\") hay câu có dấu hai chấm không còn bị coi là tên người.",
                "Khi tắt giọng thứ hai, cách đọc giữ nguyên như trước."
            ],
            bang: { cot: ["46 video đã lưu", "2.4.7", "Nay"], hang: [
                ["Video một người nói bị đọc bằng hai giọng", "10 video (2% đến 94% thời lượng)", "0"],
                ["Lượt đổi người nói trong video phỏng vấn creatine", "54", "97"],
                ["Vlog có tiểu phẩm: người dẫn bị đọc bằng giọng thứ hai", "50% thời lượng", "1%"]
            ] }
        },
        {
            v: "2.4.7", luc: "", ten: "Phụ đề không còn trượt dòng ở đoạn hội thoại nhiều lượt, tua video không còn tiếng \"bụp\"",
            y: [
                "Rà soát 6 video mới (64 phút). Ở một đoạn phỏng vấn, một dòng dài 20 giây chứa ba lượt nói; bản dịch chỉ dịch lượt đầu và đẩy lượt sau xuống dòng kế tiếp, kéo theo mọi câu sau đó hiện muộn đúng một dòng, rồi ba câu bị dồn vào 1,6 giây. Bộ kiểm tra lệch dòng cũ không bắt được vì một câu trong chuỗi dài vừa với cả hai dòng bên cạnh. Nay tiện ích tự chia lại các câu đã dịch về đúng dòng của chúng, dựa vào độ dài và những từ giữ nguyên như tên riêng, con số. Chỉ dời chữ, không thêm không bớt, không tốn lượt gọi Gemini.",
                "Quy tắc này đo trên toàn bộ 45 video đã lưu (7513 dòng): dời đúng 2 chỗ, không dời nhầm chỗ nào trong 10 chỗ trông giống (ví dụ hai người nói lặp lại cùng một câu). Video đã lưu cũng được sửa khi mở lại.",
                "Khi tua video, khi có quảng cáo xen vào hoặc khi tắt lồng tiếng lúc giọng đang đọc, giọng nay nhỏ dần trong 0,04 giây rồi mới dừng, thay vì bị cắt phụt.",
                "Tên chất và món ăn mà tiếng Việt vẫn giữ nguyên (gluten, creatinine, monohydrate, granola...) và tên hãng có chữ hoa ở giữa (iPad, eBay) không còn bị coi là sót tiếng Anh, nên không còn tốn lượt dịch lại vô ích."
            ],
            bang: { cot: ["Số đo", "2.4.6", "Nay"], hang: [
                ["Đợt 6 video mới: câu nghi bỏ sót ý / lượt dịch lại bị gọi", "2 / 3", "0 / 0"],
                ["Đợt 6 video mới: từ bị coi là sót tiếng Anh", "53", "3"],
                ["Mô phỏng tua, quảng cáo, tắt lồng tiếng: giọng bị cắt khi còn to", "18 lần", "0"],
                ["45 video đã lưu: câu đọc / câu bỏ", "7752 / 0", "7752 / 0"]
            ] }
        },
        {
            v: "2.4.6", luc: "", ten: "Hết tiếng \"bụp bụp\" và giọng lúc có lúc mất khi lồng tiếng",
            y: [
                "Nguyên nhân tìm được trong nhật ký trình phát của chính Chrome (chrome://media-internals) lúc bạn nghe video WalkingPad: khi máy đang bận tạo giọng, Chrome cần từ 0,16 đến gần 1 giây mới bắt đầu phát một câu. Bộ đồng bộ tưởng giọng bị chậm nên tua tới, mà mỗi lần tua lại bắt Chrome khởi động lại từ đầu, nên lại bị coi là chậm và lại bị tua: một câu 3 giây bị tua 7 lần trong 1 giây, mỗi lần là một tiếng \"bụp\", giọng lúc có lúc mất. Nay câu được chờ tới khi Chrome thật sự phát, rồi mốc của câu dời theo đúng khoảng chờ đó: câu vào muộn vài phần mười giây nhưng đủ chữ, không tua, không bụp.",
                "Lỗi này không hiện ra lúc kiểm tra trước đây vì bộ mô phỏng coi mọi câu đều phát được ngay. Nay bộ mô phỏng có độ trễ khởi động như Chrome thật, và có bài kiểm tra riêng để lỗi không quay lại.",
                "Khi video tạm dừng hoặc khựng lại để tải, giọng nhỏ dần trong 0,04 giây rồi mới dừng, thay vì bị cắt ngang giữa chữ. Khi phát tiếp từ giữa câu, giọng lên dần từ im lặng thay vì bật lên đột ngột. Đo trên Chrome thật: mép âm lúc dừng nhỏ hơn trước 26 đến 46 dB, lúc phát lại nhỏ hơn khoảng 15 dB.",
                "YouTube thỉnh thoảng tự đặt lại âm lượng của nó (đo được: 2 giây sau khi bấm phát). Tiếng gốc từng vọt lên mức đầy trong tối đa 0,05 giây trước khi được hạ lại. Nay được hạ lại ngay lập tức.",
                "\"Chép chẩn đoán\" ghi thêm thời gian Chrome cần để bắt đầu phát mỗi câu (startUp)."
            ],
            bang: { cot: ["34 video đã xem (712 phút), mô phỏng với độ trễ khởi động như Chrome thật", "2.4.5", "Nay"], hang: [
                ["Số lần tua giọng đang phát (mỗi lần một tiếng bụp)", "1599", "0"],
                ["Giọng bị nhảy cóc (mất chữ giữa câu)", "253 giây", "0"],
                ["Giọng bật lên đột ngột giữa chữ", "213 lần", "0"],
                ["Câu đọc / câu bỏ", "7165 / 0", "7165 / 0"],
                ["Câu bắt đầu trễ hơn 0,5 giây", "1689", "1715"]
            ] }
        },
        {
            v: "2.4.5", luc: "", ten: "Lồng tiếng không bỏ câu nào, sửa lỗi lệch dòng khi dịch lại",
            y: [
                "Giọng đọc không còn bỏ câu khi đang trễ. Trước đây câu nào tới lượt mà giọng đã trễ quá 4,5 giây thì bị bỏ nguyên câu để đuổi kịp hình. Đo trên 40 video đã xem thì việc bỏ câu gần như không giúp đuổi kịp: đọc hết mọi câu thì lúc trễ nhất vẫn chỉ 6,7 giây như cũ. Nay câu đã có sẵn giọng thì luôn được đọc, chỉ bỏ khi trễ quá 8 giây (40 video chưa lần nào tới mức đó) hoặc khi máy tạo giọng quá chậm chưa kịp làm ra câu đó.",
                "Lỗi lệch dòng: ở podcast nhiều câu ngắn, đôi khi mô hình tách một câu làm hai, khiến các câu sau hiện bản dịch của câu trước đó vài giây (\"It's 8:00.\" hiện \"Mọi việc phải dừng lại hết để đọc sách.\"). Trước đây bộ kiểm tra chỉ thấy một dòng ngắn bất thường và bảo dịch đủ ý; nay nó nhận ra cả lượt bị lệch, nói rõ cho mô hình khi dịch lại, và nhận nguyên bản dịch lại nếu tốt hơn thay vì ghép từng dòng của hai bản (ghép như vậy sẽ hiện một câu hai lần và mất một câu khác). Trên 40 video: bắt đúng 1 lượt lệch, không gắn cờ nhầm lượt nào.",
                "Chữ tiếng Việt viết không dấu trùng với chữ tiếng Anh (\"chổi than\", \"con\", \"tin\") không còn bị tính là sót tiếng Anh."
            ],
            bang: { cot: ["40 video đã xem (745 phút), mô phỏng lồng tiếng", "2.4.4", "Nay"], hang: [
                ["Câu bị bỏ không đọc", "8", "0"],
                ["Chữ bị mất", "113", "0"],
                ["Lúc trễ nhất", "6,68 giây", "6,70 giây"],
                ["Câu bắt đầu trễ hơn 4,5 giây", "11", "38 trên 7271"]
            ] }
        },
        {
            v: "2.4.4", luc: "", ten: "Chỗ nối giữa hai lượt dịch: không lặp câu, không dồn nội dung",
            y: [
                "Tiện ích dịch video theo từng lượt vài đoạn. Khi câu tiếng Anh bị cắt ngang ở cuối một lượt (\"you can put it in a\" | \"charger or in a box\"), mô hình dịch trọn câu ở lượt trước rồi lượt sau dịch lại phần cuối câu bằng lời khác, nên phụ đề hiện và giọng đọc nói câu đó hai lần (\"... để khuất tầm mắt, khuất tâm trí.\" rồi lại \"ngăn kéo hoặc trong hộp để khuất tầm mắt, khuất tâm trí.\"). Nay câu kể lại đó được bỏ. Quy tắc này áp dụng cho mọi video, không phải riêng một video: trên 40 video đã xem (6873 đoạn) nó bắt đúng 2 chỗ như vậy và không đụng 45 chỗ trông giống nhưng đúng (người nói tự lặp, hỏi lại, câu chia đúng giữa hai đoạn).",
                "Cùng chỗ nối đó, đôi khi lượt trước dịch luôn nội dung của đoạn sau, còn đoạn sau chỉ còn vài chữ (\"cơn đau mới thực sự ập đến và\"). Một đoạn phải đọc gấp đôi lời trong khung giờ của mình, giọng trễ gần 5 giây rồi bỏ cả một câu 60 chữ. Nay phần thừa được chuyển về đúng đoạn sau, cắt ở dấu câu khớp với độ dài câu gốc. Không chữ nào bị thêm hay bớt, chỉ dời chỗ.",
                "Cả hai quy tắc cũng tự sửa các video đã lưu khi mở lại, không tốn lượt dịch."
            ],
            bang: { cot: ["40 video đã xem (745 phút), mô phỏng lồng tiếng", "2.4.3", "Nay"], hang: [
                ["Câu bị đọc hai lần ở chỗ nối", "2", "0"],
                ["Câu bị bỏ không đọc", "9", "8"],
                ["Chữ bị mất", "173", "113"]
            ] }
        },
        {
            v: "2.4.3", luc: "", ten: "Tên người nói hiện đều trên phụ đề podcast",
            y: [
                "Podcast ghi tên người nói ở đầu lời thoại (\"ANDREW HUBERMAN: ...\"): bản dịch lúc giữ tên, lúc bỏ, nên phụ đề chỉ thỉnh thoảng cho biết ai đang nói. Video 3 tiếng của Huberman giữ tên ở 239 trên 311 lời thoại. Nay tên được ghép lại vào đầu bản dịch khi bị bỏ: 311 trên 311, kể cả với video đã lưu. Giọng đọc vẫn không đọc tên."
            ]
        },
        {
            v: "2.4.2", luc: "", ten: "Rà soát đợt 18 video: không cắt mất ý, không đọc tên người nói, ít bỏ câu",
            y: [
                "Câu bị cắt mất nửa sau: khi người nói lặp lại một ý hoặc nói hai vế song song (\"tiêu tiền này cho bản thân\" rồi \"cho người khác\"), bộ lọc chống dịch lấn sang câu sau tưởng vế của chính câu đó là phần lấn và cắt đi, phụ đề còn \"Bạn phải nhớ rằng\" và giọng đọc cũng mất vế đó. Đợt này có 9 câu như vậy lúc dịch, và 7 câu đã lưu bị cắt lại mỗi lần mở video. Nay bộ lọc so với độ dài câu gốc: bản dịch không dài hơn bình thường thì không có gì lấn để cắt. Những câu đã lưu bị cắt từ trước vẫn giữ nguyên, vì bản đã lưu chỉ còn phần đó.",
                "Podcast có ghi tên người nói trong phụ đề (\"ANDREW HUBERMAN: ...\"): tên vẫn hiện trên phụ đề nhưng giọng không đọc nữa. Video 3 tiếng của Huberman bị đọc tên 262 lần, vừa nghe lạ vừa làm giọng chậm nhịp tới mức phải bỏ câu.",
                "Lồng tiếng ít bỏ câu hơn: sau một câu quá dày, câu kế tiếp từng bị bỏ nguyên câu khi giọng đã trễ quá 4,5 giây, kể cả khi câu đó thưa và đọc nhanh một chút là bắt kịp. Nay câu như vậy vẫn được đọc (trễ tối đa 8 giây). Chỉ còn bỏ những câu tự nó quá dày để đọc kịp.",
                "Kiểm tra chất lượng bớt báo nhầm, nên bớt lượt dịch lại tốn phí ở chế độ Cân bằng: tên chất giữ nguyên tiếng Anh như caffeine, melatonin, cortisol, dopamine và các từ thể thao như golf, squat, cardio không còn bị coi là sót tiếng Anh; dòng \"(Laughter)\" thành \"[Tiếng cười]\" không còn bị coi là bản dịch rỗng; tên người nói bị lược khỏi bản dịch không còn bị coi là thiếu ý. Trên đợt này: 36 dòng cần dịch lại giảm còn 13, phần lớn số còn lại là các câu bị cắt nói ở trên.",
                "\"Chép chẩn đoán\" ghi thêm số lần giọng bị tua lại giữa câu, số lần chỉnh nhịp, số lần tiếng gốc trở lại to giữa hai câu và mức hạ tiếng gốc bạn đang đặt, để lần sau nghe thấy tiếng \"bụp\" thì biết ngay nó từ đâu."
            ],
            bang: { cot: ["18 video mới (505 phút), mô phỏng lồng tiếng", "2.4.1", "Nay"], hang: [
                ["Câu bị bỏ không đọc", "65", "8"],
                ["Chữ bị mất", "1015", "153"],
                ["Câu bắt đầu trễ hơn 0,5 giây", "1548", "1396"],
                ["Dòng bị đánh dấu cần dịch lại", "36", "13"]
            ] }
        },
        {
            v: "2.4.1", luc: "", ten: "Nút xóa những video đã rà soát",
            y: [
                "Thẻ Bộ nhớ đệm trong trang Cài đặt có thêm nút \"Xóa video đã rà soát\": chỉ xóa bản dịch của những video mà lần rà soát gần nhất đã xem qua, giữ nguyên các video mới đang chờ rà soát. Dòng Rà soát chất lượng ghi thêm số video đã rà soát còn đang lưu. Xem lại một video đã xóa thì phải dịch lại. Audio lồng tiếng không bị xóa theo; nó tự nhường chỗ khi kho đầy."
            ]
        },
        {
            v: "2.4.0", luc: "", ten: "Lưu tới 100 video, kho audio lồng tiếng lên 3 GB",
            y: [
                "Số video YouTube được giữ bản dịch tăng từ 50 lên 100, để một đợt xem dài hơn rồi mới rà soát. 100 video cỡ 13 phút chiếm khoảng 9 MB, vượt mức 10 MB mà trình duyệt cho sẵn nếu video dài hơn, nên tiện ích xin thêm quyền lưu trữ không giới hạn. Quyền này không hiện cảnh báo và không cho tiện ích truy cập thêm gì.",
                "Kho audio lồng tiếng tăng từ 200 MB lên 3 GB. Một giây giọng đọc chiếm 96 KB và giọng nói khoảng 85% thời lượng video, nên một video 13 phút cần khoảng 61 MB: mức cũ chỉ đủ 3 video, mức mới đủ khoảng 50 video. Muốn đủ audio cho cả 100 video thì cần khoảng 6 GB. Khi đầy, audio lâu không dùng nhất bị xóa trước; video đó vẫn xem được, giọng sẽ được tạo lại.",
                "Dòng Audio lồng tiếng trong trang Cài đặt ghi thêm số video ước tính mà kho đang chứa."
            ],
            bang: { cot: ["Sức chứa", "2.3.9", "Nay"], hang: [
                ["Bản dịch video", "50 video", "100 video"],
                ["Audio lồng tiếng", "200 MB (khoảng 3 video)", "3 GB (khoảng 50 video)"]
            ] }
        },
        {
            v: "2.3.9", luc: "", ten: "Lưu tới 50 video, có bộ đếm video mới chờ rà soát",
            y: [
                "Tiện ích trước đây chỉ giữ bản dịch của 15 video YouTube gần nhất. Nay giữ 50 video, để bạn xem một đợt dài rồi mới nhờ rà soát cả đợt trên dữ liệu thật. Đo trên 15 video đang lưu: 1,32 MB, trung bình 90 KB mỗi video (khoảng 6,8 KB mỗi phút video), nên 50 video cỡ đó chiếm khoảng 4,4 MB. Trình duyệt chỉ cho tiện ích 10 MB, vì vậy có thêm trần 8 MB: nếu bạn xem toàn video rất dài, video cũ nhất sẽ nhường chỗ sớm hơn mốc 50.",
                "Trang Cài đặt, thẻ Bộ nhớ đệm có thêm hai dòng: số video YouTube đang lưu kèm dung lượng, và số video mới chưa rà soát. Mốc hiện tại: đã rà soát video số 1 đến 21, tới ngày 30/09/2026. Khi số video mới đủ nhiều (tối đa 50), bạn nhắn để rà soát; rà xong thì mốc được dời lên."
            ],
            bang: { cot: ["Bộ nhớ bản dịch video", "2.3.8", "Nay"], hang: [
                ["Số video giữ lại", "15", "50"],
                ["Dung lượng ước tính khi đầy (video 13 phút)", "1,3 MB", "4,4 MB"],
                ["Trần dung lượng", "không có", "8 MB"]
            ] }
        },
        {
            v: "2.3.8", luc: "", ten: "Phụ đề sạch ghi chú nhạc giữa câu, gợi ý dịch cho video đời sống, bỏ thuật ngữ học sai",
            y: [
                "Phụ đề tự động của YouTube chèn \"[music]\" vào bất cứ chỗ nào có nhạc nền, kể cả giữa câu. Bản dịch thường bỏ đi nhưng đôi khi giữ lại, làm cụm từ bị cắt đôi trên màn hình (\"dễ dàng [nhạc] vệ sinh\"): 10 dòng trong 5 video bạn đã xem. Nay ghi chú nhạc nằm giữa câu được bỏ; ghi chú ở đầu dòng, cuối dòng hoặc giữa hai câu vẫn giữ. Dấu \">>\" (ký hiệu đổi người nói của phụ đề tiếng Anh) cũng được bỏ khỏi bản dịch: trước đây còn sót ở 5 trong 27 dòng. Video đã lưu được sửa khi mở lại, không tốn lượt dịch.",
                "Danh sách gợi ý thành ngữ gửi kèm mỗi lượt dịch trước đây chỉ có cách nói của bài giảng. Đọc kỹ từng dòng 3 video đời sống bạn đã xem thì thấy nhiều cụm bị dịch từng chữ hoặc sai nghĩa: \"in my 20s\" thành \"ở độ tuổi 20\" (đúng ra là cả những năm ngoài hai mươi), \"dresser\" thành tủ quần áo, \"go viral\" thành \"trở nên phổ biến\", \"logistics\" của chuyến đi thành \"hậu cần\", \"declutter\" thành dọn dẹp nhà cửa. Nay có thêm 51 gợi ý cho các cụm này, xếp trước để không bị cắt khi đoạn có nhiều cụm. Trên 21 video đã lưu, chúng được gửi 74 lần. Chưa đo được trên video thật: mô hình có theo gợi ý hay không phải xem ở video kế tiếp.",
                "Danh sách thuật ngữ đã thống nhất lưu theo kênh YouTube: cả 6 danh sách trong máy bạn được học từ trước bản 2.3.0, lúc video đời sống còn bị nhận nhầm là bài giảng kỹ thuật, nên chứa từ thường ngày và cả tên thương hiệu bị dịch (\"Whole Foods = thực phẩm hữu cơ\", \"pricey = giá thành cao\"). Mỗi video sau của kênh đó lại gửi chúng kèm lượt dịch như thuật ngữ bắt buộc và lưu lại, nên chúng không bao giờ hết hạn. Nay các danh sách cũ này không còn được dùng và bị xóa ở lần dọn hằng ngày; danh sách của khóa học Coursera giữ nguyên. Một thuật ngữ có bản dịch là mã giữ chỗ cũng không còn được lưu."
            ],
            bang: { cot: ["21 video bạn đã xem", "2.3.7", "Nay"], hang: [
                ["Dòng có ghi chú nhạc cắt giữa câu", "10", "0"],
                ["Dòng còn dấu \">>\"", "5", "0"],
                ["Danh sách thuật ngữ kênh YouTube học sai còn được gửi đi", "6", "0"]
            ] }
        },
        {
            v: "2.3.7", luc: "", ten: "Chữ cuối câu không còn thành nhóm câu riêng",
            y: [
                "Khi một câu tiếng Anh dài chạm giới hạn 24 giây của nhóm câu ngay trước chữ cuối, chữ đó (\"mind.\", 0,72 giây) thành một nhóm riêng và bản dịch dồn nửa sau câu tiếng Việt vào đó. Trên video \"From Chaos to Calm...\" bạn xem sáng nay, giọng đọc phải nói 29 âm tiết trong 0,72 giây, trễ 6 giây và bỏ câu kế tiếp ở phút 31:43. Nay mẩu cuối câu ngắn (tới 40 ký tự, 2 giây) được nhập vào nhóm trước, chỉ khoảng lặng thật mới tách nó ra. Trên 16 video của bạn, thay đổi này chỉ chạm đúng 2 nhóm câu bị nhồi như vậy."
            ]
        },
        {
            v: "2.3.6", luc: "", ten: "Giọng đọc không bỏ sót câu đến muộn, lượt dịch YouTube không còn phình to",
            y: [
                "Khi bản dịch của đoạn kế tiếp về đúng lúc giọng đang đọc câu ngay trước nó, phần đầu đoạn mới từng bị ghép vào câu đang đọc và không bao giờ được đọc. Lỗi có từ bản 1.6.7 và chỉ xảy ra khi bản dịch về sát giờ (sau khi tua, mạng chậm). Nay phần đó được đọc thành câu riêng. Mô phỏng trên video bạn vừa xem với bản dịch về trễ: số chữ không được đọc từ 18-38 còn 4-24, không chữ nào bị đọc hai lần; bản dịch về sớm như thường lệ thì giọng đọc y như cũ.",
                "Dòng phụ đề YouTube chỉ còn một hai chữ sau dấu chấm (\"...5 years now. There's\") trước đây được giữ nguyên cả dòng, nên nhóm câu chạy qua nhiều câu: trên video \"Things I refuse to upgrade...\" có nhóm dài 20 giây gồm 4 câu, kết thúc ở dấu phẩy. Nay mấy chữ đó được chuyển sang đầu dòng sau, câu mới bắt đầu đúng chỗ.",
                "Bản 2.3.2 cho một lượt gửi dịch chạy quá giới hạn 800 ký tự, 45 giây khi gặp câu bắt đầu giữa dòng. Trên video nhiều câu như vậy, một lượt dài tới 3.075 ký tự, 142 giây, dài hơn khoảng dịch trước (90-120 giây), nên chỉ được gửi khi video đã phát tới: đầu đoạn đó thiếu phụ đề và giọng. Nay giới hạn luôn được giữ. Đổi lại mỗi video gọi dịch thêm 3 đến 12 lần, khoảng 0,0005-0,0018 USD."
            ],
            bang: { cot: ["7 video có dấu câu bạn đã xem", "2.3.5", "Nay"], hang: [
                ["Dòng có dấu chấm ở giữa mà không được cắt (ước tính)", "135", "33"],
                ["Nhóm câu kết thúc giữa câu (ước tính)", "23", "10"],
                ["Lượt dịch vượt giới hạn", "49 / 105", "0 / 150"],
                ["Lượt dịch dài nhất", "3.075 ký tự, 142 giây", "789 ký tự, 45 giây"]
            ] }
        },
        {
            v: "2.3.5", luc: "", ten: "Bản chép lời và tệp .srt song ngữ không còn lặp dòng tiếng Anh",
            y: [
                "Trong bảng bản chép lời bên cạnh video và tệp .srt song ngữ xuất ra, một dòng tiếng Anh vắt qua ranh giới hai dòng tiếng Việt từng được ghi ở cả hai hàng. Trên 15 video bạn đã xem, 33% dòng tiếng Anh bị lặp như vậy, tổng số chữ tiếng Anh dài hơn video 45%. Nay mỗi dòng tiếng Anh chỉ nằm ở hàng tiếng Việt trùng giờ với nó nhiều nhất; khoảng 10% hàng không có dòng tiếng Anh riêng vì câu đó đã ở hàng bên cạnh."
            ],
            bang: { cot: ["15 video bạn đã xem", "2.3.4", "Nay"], hang: [
                ["Số chữ tiếng Anh trong bản chép lời (video có 19.524 chữ)", "28.263", "19.524"]
            ] }
        },
        {
            v: "2.3.4", luc: "", ten: "Trang Cài đặt mở ở thẻ nền vẫn kiểm tra máy chủ giọng ngay",
            y: [
                "Bản 2.3.3 bỏ qua lần kiểm tra máy chủ VieNeu đầu tiên khi trang Cài đặt được mở ở một thẻ nền, nên mục trạng thái đứng ở \"Đang kiểm tra máy chủ VieNeu...\" cho tới khi bạn chuyển sang thẻ đó. Nay lần đầu luôn kiểm tra ngay như trước."
            ]
        },
        {
            v: "2.3.3", luc: "", ten: "Trang Cài đặt bớt hỏi máy chủ giọng, nút dịch gọi đúng tên video",
            y: [
                "Trang Cài đặt để mở hỏi máy chủ giọng VieNeu mỗi 5 giây, mỗi lần 2 yêu cầu, kể cả khi không lồng tiếng: nhật ký máy chủ của bạn ghi 5.082 yêu cầu trong 6 tiếng không dùng giọng. Nay chỉ hỏi dồn khi máy chủ chưa chạy (để thấy ngay lúc nó vừa bật), chạy rồi thì 30 giây một lần.",
                "Nút trong cửa sổ nhỏ của tiện ích ghi \"Bắt đầu dịch video\" và \"Dịch lại video\" trên YouTube và các trang video khác; \"bài giảng\" chỉ còn dùng trên Coursera.",
                "Các danh sách thuật ngữ rỗng còn sót từ trước bản 2.3.1 (43 trên 51 danh sách theo kênh) được dọn ở lượt dọn bộ nhớ hằng ngày."
            ]
        },
        {
            v: "2.3.2", luc: "", ten: "Phụ đề YouTube ngắt đúng chỗ hết câu, bớt lượt dịch lại tốn tiền",
            y: [
                "Một dòng phụ đề YouTube thường chứa cuối câu này và đầu câu sau (\"...cook more at home. I feel like I am\"). Trước đây tiện ích chỉ xét chỗ hết dòng, nên trong 6 video có dấu câu bạn đã xem, 112 trên 316 nhóm câu kết thúc giữa câu và 64 lượt gửi Gemini dừng ở một mảnh câu: Gemini hay dịch luôn phần câu của lượt sau (câu hiện và được đọc hai lần) hoặc chia một câu thành hai mục lặp nhau. Nay dòng được cắt tại chỗ hết câu, theo mốc thời gian từng chữ khi phụ đề tự động có: còn 11 nhóm và 1 lượt. Mỗi lượt gửi gom được nhiều câu hơn, nên số lượt gọi Gemini chỉ tăng khoảng 6%.",
                "Giọng lồng tiếng miễn phí vẫn đọc liền qua chỗ cắt giữa dòng như trước, nên nhịp đọc không đổi. Mô phỏng trên 6 video đó với giọng Mỹ Duyên: đọc tách từng câu sẽ làm số câu bắt đầu trễ tăng từ 88 lên 124; đọc liền giữ ở 87 và không mất thêm chữ nào.",
                "Bộ kiểm tra chất lượng bản dịch không còn báo lỗi nhầm: địa chỉ web, email, @tên kênh và từ mượn quen thuộc (video, email, app, livestream...) không bị coi là tiếng Anh sót lại; dòng chỉ có nhãn âm thanh như [Music] không bị coi là dịch thiếu; câu gốc tiếng Hindi, tiếng Trung không bị so độ dài như tiếng Anh. Mỗi lỗi nặng tốn thêm một lượt Gemini dịch lại ở chế độ Cân bằng.",
                "Lỗi lặp đầu câu và nhãn âm thanh được sửa miễn phí ngay khi bản dịch về, trước khi chấm điểm, nên không còn trả tiền dịch lại cho lỗi đã tự sửa được."
            ],
            bang: { cot: ["Đo trên video bạn đã xem", "2.3.1", "Nay"], hang: [
                ["531 câu đã dịch: lỗi nặng bị báo (mỗi lỗi tốn một lượt dịch lại)", "6", "1 (lỗi thật)"],
                ["6 video có dấu câu: nhóm câu kết thúc giữa câu", "112 trên 316", "11"],
                ["6 video có dấu câu: lượt gửi Gemini dừng ở mảnh câu", "64", "1"]
            ] }
        },
        {
            v: "2.3.1", luc: "", ten: "Giọng đọc không còn đọc to \"Âm nhạc\", đặt lại chi phí luôn giữ",
            y: [
                "Nhãn âm thanh trong phụ đề tự động như [Music], [Applause], [Musik], [Tepuk tangan], [เพลง] trước đây được gửi cho Gemini dịch và trả về lúc \"Âm nhạc\", lúc \"(Âm nhạc)\", lúc \"[Âm nhạc]\" ngay trong một video; bản không có ngoặc bị giọng lồng tiếng đọc to thành lời giữa đoạn nhạc. Nay nhãn được dịch sẵn theo danh sách và luôn nằm trong ngoặc vuông nên giọng đọc bỏ qua. Trên 531 đoạn bạn đã xem: số đoạn bị đọc to tên nhãn từ 45 xuống 1, và 50 đoạn chỉ có nhãn không còn tốn lượt gọi Gemini. Video đã lưu từ trước được sửa khi mở lại.",
                "Bấm đặt lại chi phí trong Cài đặt sau khi tiện ích đã nghỉ (khoảng 30 giây không dùng) có thể không ăn thua: số cũ vừa nạp lên đè lại lên số vừa xóa rồi được lưu. Nay việc đặt lại luôn giữ. Lượt dùng lại audio đã lưu ngay lúc tiện ích vừa thức dậy cũng không còn bị mất khỏi thống kê.",
                "Tên video trong thẻ chi phí, bảng điều khiển nhỏ và danh sách bản sửa phụ đề không còn dính số thông báo \"(1) \" ở đầu và \" - YouTube\" ở cuối (4 trong 5 video hôm nay bị). Tên lấy từ chính trình phát YouTube, nên video có tên thật bắt đầu bằng \"(2024)\" vẫn giữ đúng.",
                "Video đời sống không học thuật ngữ nào thì không còn ghi một mục thuật ngữ rỗng cho kênh (43 trong 51 mục đang lưu là rỗng)."
            ]
        },
        {
            v: "2.3.0", luc: "", ten: "Dịch sát ngữ cảnh hơn cho video đời sống, không đọc một câu hai lần",
            y: [
                "Bộ nhận diện lĩnh vực của video trước đây so từ khóa theo phần đầu chữ, nên \"important\" bị tính là từ lập trình \"import\", \"general\" thành \"gene\" (sinh học), \"meaning\" thành \"mean\" (thống kê). Trong 13 video không phải bài giảng bạn xem gần đây, 6 video bị xếp nhầm vào toán, học máy, lập trình, marketing hoặc kinh doanh, và mọi gợi ý nghĩa gửi kèm cho Gemini đều sai (video về thói quen nhận gợi ý \"run: chạy chương trình\"). Nay so nguyên từ và cần đủ nhiều từ khóa khác nhau theo độ dài: cả 13 video được nhận là hội thoại thông thường, các bài giảng kỹ thuật vẫn nhận đúng lĩnh vực.",
                "Gemini đôi khi trả một mục là mảnh đầu câu, rồi mở đầu mục sau bằng chính mảnh đó cùng phần còn lại, nên phụ đề hiện và giọng đọc đọc câu đó hai lần. Nay phần lặp được bỏ và hai mục được chia lại theo độ dài câu gốc, tại chỗ ngắt câu gần nhất (YouTube, Coursera, trang khác, cả bản dịch đã lưu từ trước). Câu gốc tự lặp lại (bài hát, câu kinh) thì giữ nguyên.",
                "Bộ phát hiện dịch máy không còn coi \"...của tôi. Tôi thích...\" là lặp từ \"tôi tôi\", và không coi từ láy như \"rần rần\", \"ầm ầm\" là lỗi. Trên 531 câu bạn đã dịch: báo nhầm lặp từ từ 9 xuống 0, số câu bị gửi dịch lại (tốn thêm một lượt Gemini ở chế độ Cân bằng) từ 15 xuống 6."
            ]
        },
        {
            v: "2.2.9", luc: "", ten: "Bộ máy lồng tiếng: không bỏ sót bản dịch lại cùng độ dài, dọn tài nguyên gọn hơn",
            y: [
                "Bản dịch lại (hoặc bản sửa) có cùng số ký tự với bản cũ, ví dụ đổi \"bước\" thành \"khâu\", trước đây không được bộ máy lồng tiếng nhận ra nên giọng vẫn đọc câu cũ. Nay mọi thay đổi nội dung đều được nhận ra, với chi phí như trước.",
                "Audio của câu đã đổi nội dung được giải phóng hẳn (cả trình phát đã nạp sẵn), không chỉ thu hồi đường dẫn.",
                "Tắt lồng tiếng hủy luôn hẹn giờ gọi câu kế tiếp; mỗi lần tra kho audio không còn để sót một hẹn giờ.",
                "Audio về sau khi đã chuyển giọng được lưu kho theo đúng giọng đã tạo ra nó.",
                "Kiểm tra trên bộ mô phỏng phát lại: cả 14 kịch bản (xem thường, tua, tạm dừng, máy chủ chậm, tốc độ 1,5x và 2x...) cho kết quả giống hệt bản trước."
            ]
        },
        {
            v: "2.2.8", luc: "", ten: "Nhập bản sao lưu không bị ghi đè ngược, menu nhanh dùng phím Tab trọn vẹn",
            y: [
                "Nhập tệp sao lưu cài đặt: nếu vừa đổi một cài đặt ngay trước đó, lúc trang Cài đặt tải lại bộ tự lưu có thể ghi biểu mẫu cũ đè lên bản vừa nhập. Nay nhập xong thì bộ tự lưu dừng hẳn cho tới khi trang tải lại.",
                "Menu nhanh trên trình phát: phím Tab và Shift+Tab chạy vòng bên trong menu trên cả Coursera (trước đây Tab rơi ra sau trình phát) lẫn YouTube (trước đây Tab thoát ra từ thanh trượt âm lượng và cỡ chữ)."
            ]
        },
        {
            v: "2.2.7", luc: "", ten: "Giọng VieNeu có tiếng sớm hơn sau thời gian nghỉ, đọc liền \"Điều này có nghĩa là\"",
            y: [
                "Sau khi máy nghỉ lâu, macOS đẩy giọng VieNeu ra khỏi bộ nhớ nên vài giây đầu video im lặng. Nay khi bật lồng tiếng mà máy chủ đã nguội (hơn 10 phút không đọc), tiện ích đọc thử một câu rất ngắn ngay trong 1 đến 2 giây chờ bản dịch đầu tiên, để giọng nạp lại vào bộ nhớ sẵn. Máy chủ đang ấm thì không làm gì (đo từ bản 1.2.6: làm nóng lúc ấm chỉ làm câu đầu chậm hơn).",
                "Giọng đọc không còn ngắt giữa \"Điều này | có nghĩa là\", \"Việc này | tức là\": chủ ngữ ngắn đọc liền với hệ từ giải thích, như đã làm với \"là\". Trên các bộ câu mẫu: chỗ ngắt sai 1 xuống 0, không bộ nào xấu đi.",
                "Rà xong toàn bộ danh sách tồn đọng: mỗi mục đều có kết luận (đã sửa, không thể xảy ra khi giọng trả phí đang tắt, giữ nguyên có chủ đích và ghi vào tài liệu, hoặc từ chối kèm lý do)."
            ]
        },
        {
            v: "2.2.6", luc: "", ten: "Không nhầm tiếng Bồ Đào Nha thành tiếng Việt, sửa dòng phụ đề chắc chắn hơn, tệp .srt đúng chuẩn",
            y: [
                "Video tiếng Bồ Đào Nha (và tiếng Romania) trước đây bị nhận là tiếng Việt vì chữ \"ã\", \"ă\" (não, então, să): tiện ích bỏ qua không dịch và trả nguyên văn từng câu. Nay nhận đúng và dịch bình thường; tiếng Việt vẫn được nhận chắc chắn như cũ.",
                "Dòng phụ đề bạn đã sửa mà sau đó bị dịch lại lệch vài mili giây: hoàn tác hoặc sửa lần nữa trước đây không xóa được bản sửa cũ (nó cứ hiện lại). Nay sửa, hoàn tác và xóa đều tìm đúng dòng.",
                "Xuất .srt: mốc thời gian có thể ra dạng sai \"00:00:01,1000\" khiến trình phát bỏ qua dòng đó; tên tệp từ tiêu đề tiếng Việt không còn mất chữ \"đ\" (\"Đường\" thành \"Duong\" thay vì \"uong\").",
                "Bộ phát hiện dịch máy không còn cắt mảnh \"thu\" từ \"thuật\" khi tìm từ tiếng Anh còn sót."
            ]
        },
        {
            v: "2.2.5", luc: "", ten: "Nút Kiểm tra API Key kiểm tra lại thật",
            y: [
                "Khi Google từ chối key (sai quyền, hết tiền trả trước, dự án chưa bật thanh toán), tiện ích tạm chặn key đó 10 phút để khỏi gọi phí. Trước đây nếu bạn sửa xong trong AI Studio rồi bấm Kiểm tra trong Cài đặt, nút vẫn báo lỗi cũ suốt 10 phút mà không hỏi Google. Nay bấm Kiểm tra luôn gọi Google thật; qua được thì dịch dùng key ngay."
            ]
        },
        {
            v: "2.2.4", luc: "", ten: "Giọng đọc chữ viết tắt tiếng Việt đúng kiểu Việt, cửa sổ bật lên rõ ràng hơn",
            y: [
                "Chữ viết tắt tiếng Việt mà giọng VieNeu không có sẵn trong bảng (DN, NHNN, TMCP, CTCP, SGK, HS, ThS, mã cổ phiếu HPG, VNM, MWG...) trước đây bị đọc bằng chữ cái tiếng Anh (\"đi en\"). Nay đọc kiểu Việt.",
                "Mã in hoa lạ mà câu gốc tiếng Anh không có thì do người dịch viết ra, nên được đọc kiểu Việt; mã có trong câu gốc vẫn đọc chữ cái tiếng Anh. Các mã tiếng Anh quen thuộc (PDF, URL, CPC, ROI...) luôn đọc tiếng Anh.",
                "Cửa sổ bật lên: sau khi bấm dịch hoặc gặp lỗi, nút không còn quay về \"Bắt đầu dịch bài giảng\" trên trang đã dịch mà ghi \"Dịch lại bài giảng\". Lỗi của Chrome (trang cửa hàng, tệp PDF, trang chưa sẵn sàng) được báo bằng câu dễ hiểu kèm cách xử lý.",
                "Đo trên sổ chi phí thật: 0 trong 268 lượt dịch Gemini ngày 28 và 29/09 bị quá thời gian chờ, nên giữ nguyên thời gian chờ (nới ra chỉ làm phụ đề chậm hơn)."
            ]
        },
        {
            v: "2.2.3", luc: "", ten: "Dịch miễn phí bằng Google chắc chắn hơn",
            y: [
                "Khi dịch bằng Google (chưa có key, hoặc Gemini đang lỗi), cả đoạn phụ đề được gửi trong một yêu cầu thay vì mỗi câu một yêu cầu. Một đoạn 16 câu trên Coursera trước đây bắn 16 yêu cầu cùng lúc (tới 48 nếu máy chủ đầu lỗi), dễ bị Google chặn vì gọi dồn.",
                "Một câu Google không dịch được chỉ để trống đúng câu đó (dịch lại sau), không còn làm mất cả đoạn. Trên Coursera, lỗi đó trước đây còn kéo theo gọi Gemini lại từng câu một.",
                "Máy chủ dự phòng thứ ba của Google không còn dính mã ngôn ngữ vào cuối câu (\"Cảm ơn đã xem.en\").",
                "YouTube: sau khi bấm Tải lại tiện ích, bản mã cũ trong tab dừng hẳn bộ theo dõi chuyển video, không để chạy nền mãi."
            ]
        },
        {
            v: "2.2.2", luc: "", ten: "Cài đặt ghi đúng model đang dịch, bớt thử lại model bị Google từ chối",
            y: [
                "Key bị Google từ chối Gemini 2.5 Flash-Lite: sau 3 ngày tiện ích thử lại model đó một lần. Trước đây trong lúc chờ thử lại, thẻ Chi phí và mục model ghi \"đang dịch bằng 2.5 Flash-Lite\" dù thực tế vẫn dịch bằng 3.1 Flash-Lite (trang Usage của AI Studio không có lượt 2.5 nào). Nay hai chỗ đó ghi đúng model đang dịch và nói rõ lượt tới sẽ thử lại 2.5 một lần.",
                "Mỗi lần Google từ chối lại, tiện ích nhớ lâu gấp đôi: 3, 6, 12, 24 rồi tối đa 30 ngày. Key không bao giờ được cấp quyền thì không còn phải chờ một lượt bị từ chối mỗi 3 ngày giữa lúc đang xem. Key được cấp quyền thì lần thử lại thành công và tiện ích chuyển về model rẻ hơn ngay.",
                "Thẻ Chi phí không còn hiện chữ \"undefined\" khi Chrome đang chạy bản cũ hơn file trên máy (trước khi bấm Tải lại)."
            ]
        },
        {
            v: "2.2.1", luc: "", ten: "Chi phí: đếm đúng token của lượt quá giờ, tra giá đúng cho tên model biến thể",
            y: [
                "Lượt dịch quá thời gian chờ mà Google không trả lời: số token vào nay được chính Google đếm (lệnh đếm token, không tạo chữ nên không có giá trong bảng giá), chỉ còn phần token ra là ước lượng.",
                "Trong lúc chờ câu trả lời muộn, tiện ích giữ cho mình không bị Chrome cho ngủ, nên câu trả lời không bị mất giữa chừng (mất thì số tiền phải để ước lượng và bản dịch bị bỏ phí).",
                "Model nhập tay có đuôi như -preview, -latest, -001 hay ngày tháng được tính đúng giá của model gốc. Model chưa có giá trong tiện ích (ví dụ dòng Pro) được cảnh báo rõ là số tiền có thể thấp hơn thật, thay vì lặng lẽ tính theo một giá đoán. Thẻ ghi ngày kiểm tra bảng giá và có đường dẫn tới bảng giá mới nhất của Google."
            ]
        },
        {
            v: "2.2.0", luc: "", ten: "Chi phí: không bỏ phí câu trả lời muộn, cho biết độ tin cậy của con số",
            y: [
                "Lượt dịch quá thời gian chờ vẫn bị Google tính tiền đủ. Nay câu trả lời đến muộn được kiểm tra rồi lưu vào bộ nhớ đệm: lần sau gặp lại đúng đoạn đó (xem lại, tua lại, mở tab thứ hai) thì dùng luôn, không trả tiền lần nữa. Nếu đoạn đó được yêu cầu lại khi câu trả lời còn đang tới, tiện ích chờ nó tối đa 4 giây thay vì gọi Gemini lần hai.",
                "Thẻ Chi phí ghi độ tin cậy: bao nhiêu phần trăm số tiền hôm nay tính từ số token Google báo về, bao nhiêu phần trăm là ước lượng.",
                "Tỉ lệ ký tự trên token đo từ các lượt thật được nhớ lại sau khi trình duyệt hoặc tiện ích khởi động lại, nên ước lượng cho lượt quá giờ sát ngay từ đầu."
            ]
        },
        {
            v: "2.1.9", luc: "14:31 29/09/2026", ten: "Lồng tiếng: thêm chỗ lấy hơi cho đoạn 14 âm tiết",
            y: [
                "Chỗ lấy hơi được thêm cho cả đoạn 14 âm tiết chưa có chỗ nghỉ nào (trước từ 15). Ví dụ \"CPU, bộ nhớ, tốc độ mạng và độ trễ, đều ảnh hưởng đến trải nghiệm người dùng\" trước đây bị đọc liền qua chỗ trước \"đều\" 3 trên 5 lần. Câu 13 âm tiết trở xuống vẫn đọc một hơi. Chữ không đổi, không bớt từ nào; dấu phẩy chỉ nằm trong chữ gửi cho giọng đọc.",
                "Đo trên bản đọc thật của VieNeu trên máy (miễn phí, bạn chạy trong Terminal). Chưa nghe thử trên video thật. Không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["Bản đọc thật", "2.1.8", "Nay"], hang: [
                ["3 câu bị ảnh hưởng: chỗ cần ngắt mà giọng đọc liền", "3 trên 10", "0 trên 10"],
                ["3 câu bị ảnh hưởng: chỗ giọng dừng mà không nên dừng", "0", "0"],
                ["Cả 184 câu mẫu: chỗ cần ngắt mà giọng đọc liền", "9 trên 365", "6 trên 365"]
            ] }
        },
        {
            v: "2.1.8", luc: "14:24 29/09/2026", ten: "Lồng tiếng: chỗ lấy hơi nghỉ ngắn như một hơi thở, không như dấu phẩy",
            y: [
                "Dấu phẩy lấy hơi mà tiện ích thêm vào (từ bản 2.1.5) trước đây được giữ khoảng nghỉ dài như dấu phẩy thật của bản dịch, khoảng 0,24 đến 0,28 giây. Nay chỗ đó chỉ nghỉ như một lần lấy hơi, 0,14 đến 0,22 giây, bằng đúng khoảng nghỉ khi giọng tự ngừng ở chính chỗ đó. Dấu phẩy thật của bản dịch giữ nguyên như cũ.",
                "Những câu đã lưu sẵn trong kho vẫn giữ khoảng nghỉ cũ cho tới khi được đọc lại. Đo trên 920 bản đọc thật của VieNeu trên máy (miễn phí). Chưa nghe thử trên video thật. Không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["184 câu mẫu, 920 bản đọc thật", "2.1.7", "Nay"], hang: [
                ["Chỗ cần ngắt mà giọng đọc liền", "9 trên 365", "9 trên 365"],
                ["Chỗ giọng dừng mà không nên dừng", "1", "1"],
                ["Khoảng nghỉ giữ lại, trung bình", "0,23 giây", "0,21 giây"],
                ["Tổng độ dài giọng đọc", "3854,5 giây", "3841,8 giây (-0,3%)"]
            ] }
        },
        {
            v: "2.1.7", luc: "14:12 29/09/2026", ten: "Lồng tiếng: câu có chủ ngữ dài được ngắt hơi trước động từ",
            y: [
                "Câu kiểu \"Chi phí quảng cáo trên mạng xã hội chiếm phần lớn ngân sách\" (chủ ngữ dài rồi mới tới động từ) trước đây bị giọng VieNeu đọc liền một mạch khoảng một nửa số lần. Nay chữ gửi cho giọng đọc có một dấu phẩy lấy hơi ở chỗ ngắt tốt nhất của những đoạn từ 15 âm tiết trở lên chưa có chỗ nghỉ nào. Dấu phẩy này chỉ nằm trong chữ gửi cho giọng đọc, phụ đề trên màn hình không đổi. Chữ không đổi, không bớt từ nào.",
                "Đo trên bản đọc thật của VieNeu trên máy (miễn phí, bạn chạy trong Terminal): 184 câu mẫu, 920 bản đọc. Chưa nghe thử trên video thật. Không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["Bản đọc thật", "2.1.6", "Nay"], hang: [
                ["20 câu bị ảnh hưởng: chỗ cần ngắt mà giọng đọc liền", "30 trên 55", "0 trên 55"],
                ["20 câu bị ảnh hưởng: đoạn đọc liền dài nhất (9 trên 10 câu không vượt quá)", "17 âm tiết", "10 âm tiết"],
                ["Cả 184 câu: chỗ cần ngắt mà giọng đọc liền", "39 trên 365", "9 trên 365"],
                ["Cả 184 câu: chỗ giọng dừng mà không nên dừng", "1", "1"],
                ["Cả 184 câu: tổng độ dài giọng đọc", "3847,2 giây", "3854,5 giây (+0,2%)"]
            ] }
        },
        {
            v: "2.1.6", luc: "13:38 29/09/2026", ten: "Lồng tiếng: đoạn rất dài cũng có chỗ lấy hơi",
            y: [
                "Câu dài từ 26 âm tiết mà không có chỗ ngắt mạnh nào trước đây được đọc liền một hơi, có câu tới 30 âm tiết. Nay tiện ích cho phép lấy hơi ở chỗ ngắt nhẹ hơn trong những đoạn rất dài này. Chỗ lấy hơi cũng được đặt khi một bên chỉ có 6 âm tiết, ví dụ \"Do tốc độ học quá lớn, nên hàm mất mát...\". Chữ không đổi, không bớt từ nào.",
                "Đo trên bản đọc thật của VieNeu trên máy (miễn phí, bạn chạy trong Terminal): 7 câu mẫu bị ảnh hưởng, mỗi câu 5 lần với 2 giọng, trước và sau. Giọng dừng đúng ở cả 35 trên 35 dấu phẩy thêm vào. Có 1 chỗ giọng tự dừng ở nơi không cần, không phải ở dấu phẩy thêm vào. Chưa nghe thử trên video thật. Không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["7 câu mẫu, 35 bản đọc mỗi bên", "2.1.5", "Nay"], hang: [
                ["Đoạn đọc liền dài nhất (9 trên 10 câu không vượt quá)", "26 âm tiết", "15 âm tiết"],
                ["Đoạn đọc liền dài nhất trong cả 7 câu", "30 âm tiết", "17 âm tiết"],
                ["Chỗ cần ngắt mà giọng đọc liền một mạch", "0 trên 15", "0 trên 15"],
                ["Chỗ giọng dừng mà không nên dừng", "0", "1"],
                ["Tổng độ dài giọng đọc", "242,6 giây", "246,0 giây (+1,4%)"]
            ] }
        },
        {
            v: "2.1.5", luc: "13:01 29/09/2026", ten: "Lồng tiếng: câu dài có chỗ lấy hơi đúng chỗ",
            y: [
                "Giọng VieNeu chỉ dừng chắc chắn ở dấu câu. Câu dài không có dấu phẩy trước đây hay bị đọc liền một mạch qua chỗ lẽ ra phải ngắt. Nay tiện ích thêm dấu phẩy lấy hơi ở nhiều chỗ ngắt tự nhiên hơn (trước chỉ ở chỗ ngắt rất mạnh), trong đoạn từ 18 âm tiết trở lên. Chữ không đổi, không bớt từ nào.",
                "Lần này đo trên bản đọc thật của VieNeu trên máy (miễn phí): 20 câu mẫu bị ảnh hưởng, mỗi câu đọc 5 lần với 2 giọng, trước và sau. Chưa nghe thử bằng tai trên video thật. Không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["20 câu mẫu, 100 bản đọc mỗi bên", "2.1.4", "Nay"], hang: [
                ["Chỗ cần ngắt mà giọng đọc liền một mạch", "18 trên 60", "0 trên 60"],
                ["Chỗ giọng dừng mà không nên dừng", "2", "0"],
                ["Đoạn đọc liền dài nhất (9 trên 10 câu không vượt quá)", "22 âm tiết", "17 âm tiết"],
                ["Đoạn đọc liền dài nhất trong cả 20 câu", "38 âm tiết", "26 âm tiết"],
                ["Tổng độ dài giọng đọc", "571,9 giây", "575,8 giây (+0,7%)"]
            ] }
        },
        {
            v: "2.1.4", luc: "12:39 29/09/2026", ten: "Lồng tiếng: máy chủ giọng chậm không còn làm tiếng gốc bật lên giữa hai câu",
            y: [
                "Khi máy chủ giọng VieNeu chậm, âm thanh của câu sau có thể chưa làm xong lúc câu trước vừa đọc hết. Trước đây tiếng gốc lúc đó bật to lên, rồi lại hạ xuống khi câu sau cất lên chỉ một, hai giây sau. Nay nếu câu sau đang được làm và dự kiến bắt đầu trong vòng 2 giây, tiếng gốc vẫn được giữ nhỏ. Nếu chờ quá 2 giây mà câu sau chưa tới, tiếng gốc được nâng lên như cũ, để không có khoảng lặng dài.",
                "Mã của thay đổi này đã có sẵn từ bản 2.1.3. Bản này thêm bài kiểm tra và ghi lại số đo. Cách đọc (câu nào, lúc nào, nhanh hay chậm) không đổi. Đo ngoại tuyến bằng mô phỏng, chưa nghe thử bằng tai, không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["144 lượt mô phỏng máy chủ chậm, mỗi lượt tua 2 lần", "2.1.2", "Nay"], hang: [
                ["Khoảng nghỉ ngắn giữa hai câu mà tiếng gốc bật lên rồi hạ lại", "197 trên 1097", "8 trên 1097 (đều do tua)"],
                ["Câu bắt đầu khi tiếng gốc còn trên 50%", "594 trên 2067", "382 trên 2067"],
                ["Thời gian im lặng mà tiếng gốc vẫn được giữ nhỏ", "22,1%", "25,9%"]
            ] }
        },
        {
            v: "2.1.3", luc: "12:35 29/09/2026", ten: "Chi phí: chọn hiển thị VNĐ, USD hoặc cả hai; ước tính sát hơn",
            y: [
                "Thẻ Chi phí có nút chọn đơn vị tiền: VNĐ, USD, hoặc VNĐ và USD song song. Cửa sổ nhỏ của tiện ích cũng theo lựa chọn này. Tỷ giá mặc định 26.020 đ cho 1 USD (giá giữa thị trường ngày 29/09/2026), sửa được cho khớp sao kê thẻ; có thêm ô thuế và phí cộng thêm (%). Ở chế độ VNĐ, ngân sách nhập bằng đồng.",
                "Bốn ô tổng quan ở đầu thẻ: hôm nay, tháng này theo ngày tính tiền của Google, dự kiến cả tháng (chỉ hiện khi có từ 3 ngày số liệu, ghi rõ là suy từ mức dùng trung bình), và trung bình mỗi lượt dịch. Thêm thanh ngân sách ngày.",
                "Lượt dịch quá thời gian chờ không còn bị cắt ngang: phụ đề vẫn chuyển sang bản dự phòng ngay như trước, nhưng tiện ích tiếp tục nghe câu trả lời của Google thêm tối đa 2 phút. Nếu Google trả về, số token thật thay cho số ước lượng, nên chi phí sát hóa đơn hơn.",
                "Trang Cài đặt không còn bị tràn ngang ở cửa sổ hẹp vì các bảng chi phí."
            ]
        },
        {
            v: "2.1.2", luc: "12:22 29/09/2026", ten: "Lồng tiếng: tiếng gốc nhường chỗ nhanh hơn khi giọng Việt cất lên bất ngờ",
            y: [
                "Khi audio của câu về vừa kịp lúc (câu đầu tiên sau khi bắt đầu xem hoặc tua, máy chủ giọng chậm), giọng Việt cất lên lúc tiếng gốc còn to. Trước đây tiếng gốc cần 0,45 giây mới hạ hết nên lấn mấy chữ đầu; nay nó hạ trong 0,2 giây. Câu biết trước vẫn được hạ tiếng gốc từ từ trước khi bắt đầu, và lúc nâng tiếng gốc lên vẫn đều và chậm như bản 2.0.9.",
                "Cách đọc (câu nào, lúc nào, nhanh hay chậm) không đổi. Đo ngoại tuyến bằng mô phỏng, chưa nghe thử bằng tai, không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["11 tình huống mô phỏng", "2.1.1", "Nay"], hang: [
                ["Tiếng gốc trong 0,45 giây đầu của 20 câu bắt đầu lúc tiếng gốc còn to", "-6,1 đề-xi-ben", "-9,6 đề-xi-ben"],
                ["Thời gian giọng Việt đọc đè lên tiếng gốc còn to", "0,3%", "0,1%"],
                ["Bước hạ lớn nhất trong một nhịp (chỉ khi giọng đã cất lên)", "1,55 đề-xi-ben", "3,49 đề-xi-ben"]
            ] }
        },
        {
            v: "2.1.1", luc: "12:21 29/09/2026", ten: "Chi phí ước tính: chi tiết theo model và theo ngày của Google",
            y: [
                "Thẻ Chi phí trong Cài đặt có thêm bảng theo từng model (số lượt, token vào, token ra, tiền), bảng tách token vào, token ra và token \"suy nghĩ\" của model, và bảng 7 ngày gần nhất tính theo ngày của Google (giờ Thái Bình Dương), để so trực tiếp với trang sử dụng của Google AI Studio. Nút Xóa thống kê giữ lại bảng theo ngày này.",
                "Phần câu lệnh Google lấy từ bộ nhớ đệm của Google được tính theo giá rẻ hơn (0,025 USD mỗi triệu token với 3.1 Flash-Lite), không còn tính như token vào thường. Lượt quá thời gian chờ được ước lượng theo tỉ lệ ký tự trên token đo từ chính các lượt thật trong phiên, thay vì một con số đoán cố định.",
                "Cửa sổ nhỏ của tiện ích ghi số lượt dịch Gemini hôm nay thay cho dòng \"0,0 phút giọng AI\" (giọng AI trả phí đang tắt)."
            ]
        },
        {
            v: "2.1.0", luc: "12:14 29/09/2026", ten: "Chi phí ước tính: đếm đủ mọi lượt Google tính tiền",
            y: [
                "Trước đây chỉ lượt dịch thành công cuối cùng được cộng vào chi phí. Lượt Gemini trả về bị hỏng rồi phải gửi lại, và lượt quá thời gian chờ (Google vẫn chạy xong và vẫn tính tiền dù tiện ích đã bỏ đi) đều bị bỏ sót, nên con số ước tính thấp hơn hóa đơn thật. Nay mọi lượt Google đã nhận đều được cộng; lượt quá giờ được tính theo ước lượng độ dài và ghi riêng.",
                "Trang Cài đặt ghi rõ model đang dịch (Gemini 3.1 Flash-Lite) cùng giá, và số token vào, token ra của hôm nay để đối chiếu với trang sử dụng của Google AI Studio. Giá Gemini 3.8 Flash sửa theo bảng giá mới (0,75 và 3,75 USD mỗi triệu token). Bỏ các dòng nói về giọng AI trả phí và giọng hệ thống, vốn không còn đúng vì lồng tiếng chỉ dùng giọng VieNeu miễn phí."
            ]
        },
        {
            v: "2.0.9", luc: "12:04 29/09/2026", ten: "Lồng tiếng: tiếng gốc tăng giảm đều tai hơn",
            y: [
                "Tiếng gốc được hạ xuống và nâng lên theo những bước đều nhau về độ to nghe được (tai người nghe độ to theo đề-xi-ben), thay vì những bước đều nhau về âm lượng. Trước đây nhịp đầu tiên lúc nâng tiếng gốc lên nhảy mạnh (+2,9 đề-xi-ben) rồi các nhịp sau nhỏ dần; nay mỗi nhịp như nhau (1,55 đề-xi-ben ở mức hạ mặc định). Thời gian hạ hoặc nâng vẫn là 0,45 giây.",
                "Câu bắt đầu khi tiếng gốc còn to (câu đầu tiên sau khi bắt đầu xem hoặc tua, hoặc audio về trễ): tiếng gốc nhỏ đi nhanh hơn ở đầu câu, nên mấy chữ đầu của giọng Việt ít bị lấn hơn. Cách đọc không đổi. Đo ngoại tuyến, chưa nghe thử bằng tai, không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["11 tình huống mô phỏng", "2.0.8", "Nay"], hang: [
                ["Bước đổi độ to lớn nhất trong một nhịp", "3,23 đề-xi-ben", "1,55 đề-xi-ben"],
                ["Tiếng gốc trong 0,45 giây đầu của câu bắt đầu lúc tiếng gốc còn to", "-4,5 đề-xi-ben", "-6,1 đề-xi-ben"]
            ] }
        },
        {
            v: "2.0.8", luc: "06:47 29/09/2026", ten: "Lồng tiếng: tiếng gốc không còn bật lên giữa hai câu",
            y: [
                "Trước đây giọng Việt dừng quá 0,35 giây là tiếng gốc bắt đầu to lại. Với khoảng nghỉ 0,8 giây giữa hai câu, tiếng gốc vừa về đủ to đúng lúc câu sau bắt đầu, nên mấy chữ đầu của câu Việt bị tiếng gốc đè lên rồi mới hạ xuống. Nay khi đã biết câu sau bắt đầu lúc nào (audio của nó đã có sẵn), khoảng nghỉ dưới 2 giây giữ nguyên mức hạ; khoảng nghỉ dài hơn thì tiếng gốc được hạ xuống trước khi câu sau bắt đầu.",
                "Tạm dừng rồi phát tiếp giữa một câu: tiếng gốc giữ ở mức hạ, không còn to lên 91% đúng lúc giọng Việt đọc tiếp. Giọng hệ thống (giọng dự phòng) cũng được sửa như vậy, và tiếng gốc không còn to lên dưới một cụm đọc chậm hơn dự kiến.",
                "Khoảng lặng dài vẫn để tiếng gốc (nhạc, âm thanh minh họa) trở lại, chỉ hạ xuống sớm hơn một chút trước câu kế tiếp. Cách đọc không đổi: số câu, thời điểm và tốc độ đọc giống hệt bản trước trên mọi mô phỏng. Đo ngoại tuyến, chưa nghe thử bằng tai, không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["9 tình huống mô phỏng", "2.0.7", "Nay"], hang: [
                ["Khoảng nghỉ dưới 1,5 giây mà tiếng gốc bật lên rồi hạ", "88 / 180", "2 / 180"],
                ["Câu bắt đầu khi tiếng gốc còn trên 50%", "163 / 265", "11 / 265"],
                ["Thời gian đọc mà tiếng gốc còn trên 35%", "6,4%", "0,4%"],
                ["Khoảng lặng trên 2,5 giây có tiếng gốc đủ to", "75%", "63%"]
            ] }
        },
        {
            v: "2.0.7", luc: "02:56 29/09/2026", ten: "Lồng tiếng: nhịp đọc đều trong cùng một câu",
            y: [
                "Câu dài được đọc thành nhiều đoạn: phần sau của câu nay giữ gần như nguyên nhịp của phần trước (đổi tối đa 3%), không còn lúc nhanh lúc chậm giữa chừng câu. Đoạn còn nối tiếp vẫn được chậm lại khi cần, để giọng không phải dừng giữa câu chờ phụ đề; khi giọng đang trễ nhiều thì vẫn được đuổi kịp như cũ.",
                "Đo trên mô phỏng 60 lần tua liên tục: chỗ nối giữa câu đổi nhịp từ 5% trở lên giảm từ 23 xuống 6 (trên 53); số câu đọc, câu trễ và khoảng im không đổi."
            ]
        },
        {
            v: "2.0.6", luc: "02:50 29/09/2026", ten: "Lồng tiếng: sau khi tua không còn cắt đôi từ",
            y: [
                "Ngay sau khi bắt đầu xem hoặc tua, câu phụ đề dài được chia thành đoạn đọc ngắn để có tiếng sớm. Trước đây chỗ chia chỉ theo số âm tiết nên hay cắt giữa cụm từ, cả giữa một từ: \"mạng | nơ-ron\", \"điện | tử\", \"50 xuống | 30 đô la\"; giọng đọc hai nửa như hai câu rời. Nay chỗ chia là ranh giới ngữ pháp gần điểm giữa nhất.",
                "Đoạn đầu vẫn ngắn (trung bình 8,8 âm tiết, trước là 8,5), nên tiếng vẫn đến sớm như cũ; trên máy chủ khỏe, số câu đọc và độ trễ không đổi. Đo ngoại tuyến, không gọi dịch vụ trả phí."
            ],
            bang: { cot: ["138 câu dài mẫu (156 đến 157 chỗ chia)", "2.0.5", "Nay"], hang: [
                ["Chia giữa một cụm từ hoặc một từ", "106", "30"],
                ["Chia ở chỗ không nên ngắt (theo đánh dấu)", "89", "18"]
            ] }
        },
        {
            v: "2.0.5", luc: "02:33 29/09/2026", ten: "Lồng tiếng: nghỉ trước động từ sau chủ ngữ có cụm \"trên, trong, ở\"",
            y: [
                "Câu như \"Độ chính xác trên tập kiểm tra | đạt 95%\": chủ ngữ ngắn nhưng có cụm chỉ nơi chốn bên trong nay được nghỉ trước động từ, thay vì nghỉ sai ở \"95 phần trăm | sau\".",
                "Chỉ đổi đúng câu này trong 493 câu mẫu của bộ kiểm thử; trên bản đọc thật đã lưu, chỗ ngắt sai của bộ câu đó giảm từ 4 xuống 2, các bộ khác không đổi. Không gọi dịch vụ trả phí."
            ]
        },
        {
            v: "2.0.4", luc: "02:25 29/09/2026", ten: "Lồng tiếng: ngắt hơi đúng sau chủ ngữ dài",
            y: [
                "Giọng VieNeu nay nghỉ đúng chỗ giữa chủ ngữ dài và động từ như \"ảnh hưởng đến\", \"cải thiện\", \"chứng minh\", \"thể hiện\" (thêm 16 động từ), và không còn ngắt giữa chủ ngữ.",
                "Không nhầm danh từ thành động từ: \"đưa ra quyết định\", \"những hạn chế\", \"trẻ em\" vẫn đọc liền.",
                "Đo trên giọng đọc thật của máy (không gọi dịch vụ trả phí): 24 câu mới, 120 lượt đọc; các bộ câu cũ không đổi."
            ],
            bang: { cot: ["Giọng thật, 24 câu mới (120 lượt đọc)", "2.0.3", "Nay"], hang: [
                ["Chỗ ngắt sai", "7", "0"],
                ["Chỗ giọng đã nghỉ đúng mà bị bỏ", "29 / 65", "0 / 65"]
            ] }
        },
        {
            v: "2.0.3", luc: "01:59 29/09/2026", ten: "Trang Cài đặt: dọn nốt kiểu dáng thừa",
            y: [
                "Gỡ 50 khai báo kiểu dáng mà quy tắc phía sau luôn ghi đè, cùng màu cũ trong 3 đường viền (màu xám xanh và tím của giao diện cũ còn sót). Giao diện không đổi: so từng phần tử ở nền sáng và nền tối, 0 khác biệt."
            ]
        },
        {
            v: "2.0.2", luc: "01:54 29/09/2026", ten: "Trang Cài đặt: bỏ phần kiểu dáng thừa",
            y: [
                "Gỡ bộ màu tím cũ không còn dùng và 9 quy tắc kiểu dáng bị quy tắc sau ghi đè hoàn toàn. Giao diện không đổi: đã so từng phần tử trang Cài đặt ở cả nền sáng lẫn nền tối, 0 khác biệt."
            ]
        },
        {
            v: "2.0.1", luc: "21:08 28/09/2026", ten: "Lồng tiếng: sau quảng cáo không đọc lại câu vừa nghe xong",
            y: [
                "Quảng cáo chen vào lúc giọng vừa đọc xong một câu (phụ đề của câu vẫn còn trên màn hình): trước đây hết quảng cáo, phần cuối câu đó bị đọc lại lần nữa. Nay giọng đi tiếp sang câu sau.",
                "Kiểm tra thật trong Chrome với máy chủ VieNeu: câu sau quảng cáo bắt đầu đúng giờ; trễ nhất 0,61 giây thay vì 5,96 giây ở lần chạy trước."
            ]
        },
        {
            v: "2.0.0", luc: "20:54 28/09/2026", ten: "Lồng tiếng: menu nhanh đếm đúng số câu bị bỏ",
            y: [
                "Dòng \"đã bỏ N câu để bắt kịp\" trong menu nhanh nay tính cả câu bị mất vì phải chờ giọng quá lâu ngay sau khi mở video hoặc tua. Trước đây những câu này không được đếm nên con số thấp hơn thực tế.",
                "Câu mà người xem tự tua vào giây cuối không bị tính là câu bị bỏ.",
                "Cách đọc và thời điểm đọc không đổi: 144 lần chạy mô phỏng máy chủ chậm cho kết quả giống hệt 1.9.9.",
                "Không rút gọn lời thoại; không gọi Gemini."
            ]
        },
        {
            v: "1.9.9", luc: "15:38 28/09/2026", ten: "Lồng tiếng: chuẩn bị giọng trước xa hơn, không còn im rồi bỏ câu khi máy chậm lúc xem video mới",
            y: [
                "Giọng VieNeu nay luôn tạo sẵn ít nhất 60 giây lời phía trước (trước đây 20 giây). Khi máy Mac bận làm máy chủ giọng chậm đi vài phút, phần chuẩn bị sẵn đủ bù, giọng không im rồi bỏ câu nữa.",
                "Việc tạo giọng dở dang bị bỏ lại sau khi tua nay vẫn được dùng để đo tốc độ máy chủ, nên chương trình biết đúng lúc máy chủ chậm.",
                "Trang bị khựng một nhịp (máy bận) không còn bị tưởng là tua video: câu đang đọc không bị cắt và đọc lại giữa chừng.",
                "Menu nhanh trên YouTube có nút \"Chép chẩn đoán\": chép tình trạng lồng tiếng gần đây (câu bị bỏ và lý do, lỗi, tốc độ máy chủ) để gửi khi cần kiểm tra.",
                "Giọng đọc quá chậm so với người nói nhanh: dòng trạng thái gợi ý tên giọng nhanh hơn cùng loại.",
                "Đánh đổi: khi máy chủ chậm suốt và người xem tua liên tục, số câu được đọc ít hơn khoảng 1,4 phần trăm so với 1.9.8.",
                "Không rút gọn lời thoại; không gọi Gemini."
            ],
            bang: { cot: ["Đo ngoại tuyến (mô phỏng, không phải đo trên video thật)", "1.9.8", "Nay"], hang: [
                ["Người nói nhanh, máy chủ chậm 2 phút: số câu bị bỏ", "11", "0"],
                ["Như trên: tổng thời gian im khi đáng lẽ có giọng", "6,6 giây", "0"],
                ["144 lần chạy máy chủ chậm có tua: số câu được đọc", "2138", "2109"],
                ["144 lần chạy máy chủ chậm có tua: tổng thời gian im", "799 giây", "745 giây"]
            ] }
        },
        {
            v: "1.9.8", luc: "02:35 28/09/2026", ten: "Lồng tiếng: câu bị quảng cáo cắt ngang được đọc tiếp đúng chỗ, bớt trễ sau khi tua nhiều lần",
            y: [
                "Câu đang đọc bị quảng cáo cắt ngang: hết quảng cáo đọc tiếp từ chỗ giọng đã dừng, không bỏ đoạn chưa nghe.",
                "Đo tốc độ máy chủ giọng chính xác hơn sau khi tua liên tục; thêm biên an toàn nhỏ để bớt câu bị trễ.",
                "Thử thật trong Chrome với máy chủ VieNeu: tua liên tục, tua khi đang dừng, tốc độ 0,5 đến 1,75 lần, dừng giữa quảng cáo: không lỗi, không hai giọng chồng nhau."
            ]
        },
        {
            v: "1.9.7", luc: "02:06 28/09/2026", ten: "Giọng VieNeu: ước lượng đúng tốc độ máy chủ, bớt đuổi theo video khi máy chủ chậm",
            y: [
                "Trước đây chương trình tưởng máy chủ giọng nhanh hơn thực tế tới 5 lần (tính cả câu lấy sẵn từ kho và câu rất ngắn), nên gửi những câu chắc chắn về trễ. Nay nó tự đo thời gian cố định mỗi lượt từ các lần tạo gần nhất.",
                "Sau khi tua, việc tạo giọng còn dở của vị trí cũ nay được tính đúng là máy chủ còn bận.",
                "Máy chủ chậm: một câu đằng nào cũng về trễ thì nhường chỗ cho câu sau, nếu câu sau được lợi nhiều hơn phần câu trễ còn nghe được.",
                "Thử thật trong Chrome với máy chủ VieNeu thật: tua tới, tua lui, dừng rồi phát tiếp, tốc độ gấp đôi, quảng cáo: không lỗi, không hai giọng chồng nhau.",
                "Không rút gọn lời thoại; không gọi Gemini."
            ],
            bang: { cot: ["Đo ngoại tuyến (144 lần chạy mô phỏng, máy chủ chậm)", "1.9.6", "Nay"], hang: [
                ["Số câu được đọc", "2025", "2141"],
                ["Câu bắt đầu trễ", "559", "546"],
                ["Lâu nhất để có tiếng lại sau khi tua", "34,0 giây", "24,6 giây"]
            ] }
        },
        {
            v: "1.9.6", luc: "01:39 28/09/2026", ten: "Giọng VieNeu: ngắt đúng sau chủ ngữ dài trước động từ như \"đạt\", \"cho thấy\", \"mang lại\"",
            y: [
                "Câu kiểu \"Doanh thu của công ty trong quý ba | đạt mức cao nhất\" nay nghỉ đúng chỗ trước động từ, thay vì nghỉ lạc giữa chủ ngữ.",
                "Giữ nguyên khi động từ nằm trong một danh từ (\"tỷ lệ chiếm dụng\") hoặc khi chủ ngữ ngắn.",
                "Đo trên 40 bản thu thật: khoảng dừng sai được giữ giảm từ 9 xuống 3, chỗ cần ngắt bị bỏ sót từ 6/20 xuống 0/20; tám bộ câu khác không đổi.",
                "Không bỏ chữ nào, không rút gọn câu; không gọi Gemini."
            ],
            bang: { cot: ["Đo ngoại tuyến", "1.9.5", "Nay"], hang: [
                ["Khoảng dừng sai được giữ (40 bản thu thật)", "9", "3"],
                ["Chỗ cần ngắt bị bỏ sót", "6 / 20", "0 / 20"]
            ] }
        },
        {
            v: "1.9.5", luc: "01:30 28/09/2026", ten: "Giọng VieNeu: bớt ngắt sai chỗ, đọc đúng thêm tên tiếng Anh (kiểm bằng bản thu thật)",
            y: [
                "Bớt ngắt sai giữa chủ ngữ ngắn và vị ngữ (\"Số nhân viên của công ty | đã tăng\"), trước \"như\" so sánh (\"dễ dàng như nhiều người nghĩ\"), trước \"khi\" trong vế ngắn (\"gặp lỗi khi cài đặt\").",
                "Đo trên 65 bản thu thật: số khoảng dừng sai được giữ lại giảm từ 13 xuống 1; các bộ câu khác không tệ đi.",
                "Đọc đúng kiểu Anh: Long Beach, Long Island, Raspberry Pi, Ray, Theresa May, Bin, Son (trong tên tiếng Anh). Tên người Việt như chị May, anh Sơn, Trần Văn Long giữ nguyên.",
                "Không bỏ chữ nào, không rút gọn câu; không gọi Gemini."
            ],
            bang: { cot: ["Đo ngoại tuyến", "1.9.4", "Nay"], hang: [
                ["Khoảng dừng sai được giữ (65 bản thu thật)", "13", "1"],
                ["Phát âm đúng, bộ câu kiểm tra mù 2", "79 / 82", "81 / 82"],
                ["Phát âm đúng, bộ câu phát triển", "114 / 123", "120 / 123"]
            ] }
        },
        {
            v: "1.9.4", luc: "01:08 28/09/2026", ten: "Dọn nợ: bản dịch tinh chỉnh được lưu, kho âm thanh bớt quét thừa, giải phóng âm thanh khi tắt",
            y: [
                "YouTube: câu được dịch lại tự nhiên hơn sau khi cả video đã dịch xong trước đây không được lưu, lần sau mở lại vẫn thấy bản cũ. Nay được lưu (một lần, sau khi các bản dịch lại đến xong).",
                "Kho âm thanh: khi dọn bớt hoặc xóa âm thanh của một video, trước đây đọc lại toàn bộ kho hai lần; nay một lần. Đo trên Chrome thật: đọc 1.000 bản ghi mất 5,4 ms.",
                "Tắt lồng tiếng hoặc xóa âm thanh đã lưu: các trình phát âm thanh được giải phóng hẳn thay vì chỉ tạm dừng.",
                "Tài liệu cho người bảo trì được cập nhật đúng kích thước tệp; thêm công cụ tự kiểm tra.",
                "Không đổi cách dịch, giọng, ngắt nghỉ; không thêm lượt gọi Gemini nào."
            ]
        },
        {
            v: "1.9.3", luc: "01:00 28/09/2026", ten: "Quảng cáo YouTube: không còn đọc lồng tiếng và hiện phụ đề đè lên quảng cáo",
            y: [
                "Quảng cáo YouTube phát ngay trong khung video của bài giảng, nên tiện ích tưởng đó là đầu bài giảng: đọc lồng tiếng các câu đầu đè lên quảng cáo, hạ nhỏ tiếng quảng cáo, và hiện phụ đề đầu bài lên đó.",
                "Tệ hơn: nếu các câu đầu bài chưa được dịch, tiện ích gửi chúng sang Gemini để dịch (tốn tiền) chỉ vì đang có quảng cáo.",
                "Nay trong lúc quảng cáo: không đọc, không hạ tiếng, không hiện phụ đề, không gửi yêu cầu dịch. Hết quảng cáo thì tiếp tục đúng chỗ đang xem.",
                "Không đổi cách dịch, giọng, ngắt nghỉ."
            ],
            bang: { cot: ["Kiểm thử ngoại tuyến (quảng cáo 15 giây giữa video)", "1.9.2", "Nay"], hang: [
                ["Câu lồng tiếng đọc đè lên quảng cáo", "5", "0"],
                ["Yêu cầu dịch gửi đi vì đồng hồ của quảng cáo", "có", "0"],
                ["Tiếng quảng cáo bị hạ nhỏ", "có", "không"]
            ] }
        },
        {
            v: "1.9.2", luc: "00:38 28/09/2026", ten: "Tải lại tiện ích lúc đang lồng tiếng: tiếng gốc không còn bị kẹt ở mức nhỏ",
            y: [
                "Bấm Tải lại tiện ích đúng lúc giọng Việt đang đọc (tiếng gốc đang được hạ nhỏ): bản cũ và bản mới cùng chỉnh âm lượng, mỗi bên tưởng mức đã hạ của bên kia là mức bạn chọn. Sau khi tắt lồng tiếng, tiếng YouTube có thể còn 1%. Nay âm lượng bạn chọn được ghi lên chính video, bản mới dùng đúng mức đó và bản cũ tự dừng.",
                "Không còn hai giọng đọc chồng nhau trong khoảng 1,5 giây sau khi Tải lại.",
                "Không đổi cách dịch, giọng, ngắt nghỉ; không thêm lượt gọi Gemini nào."
            ],
            bang: { cot: ["Âm lượng sau khi tắt lồng tiếng (bạn để 80%)", "1.9.1", "Nay"], hang: [
                ["YouTube, bản cũ dừng sau 1,5 giây", "1%", "80%"],
                ["YouTube, bản cũ không dừng", "16%", "80%"],
                ["Video thường, bản cũ không dừng", "16%", "80%"],
                ["Chrome thật, hai bộ đọc trên một video", "chưa đo", "80%, bản cũ tự dừng"]
            ] }
        },
        {
            v: "1.9.1", luc: "00:30 28/09/2026", ten: "Giọng hệ thống không còn im hẳn khi Chrome làm mất tín hiệu nói xong",
            y: [
                "Khi dùng giọng hệ thống (giọng dự phòng của Chrome), đôi khi Chrome không báo một cụm đã nói xong. Trước đây lồng tiếng chờ tín hiệu đó mãi và im lặng tới hết video. Nay cụm quá thời gian dự kiến được bỏ qua và đọc tiếp cụm sau.",
                "Xóa âm thanh đã lưu của video: danh sách khóa được kiểm tra trước khi xóa.",
                "Không đổi cách dịch, giọng, ngắt nghỉ; không thêm lượt gọi Gemini nào."
            ],
            bang: { cot: ["Kiểm thử ngoại tuyến (bài giảng 2,5 phút)", "1.9.0", "Nay"], hang: [
                ["Câu được đọc sau khi mất một tín hiệu nói xong", "3 / 23", "23 / 23"]
            ] }
        },
        {
            v: "1.9.0", luc: "00:12 28/09/2026", ten: "Trình duyệt chặn hoặc không phát được âm thanh: xử lý đúng từng trường hợp",
            y: [
                "Chrome chặn tự phát âm thanh: trước đây tiện ích thử phát lại 20 lần mỗi giây và im lặng không báo gì. Nay thử lại mỗi giây một lần, và thẻ lồng tiếng báo \"bấm vào trang video một lần để nghe\".",
                "Tua hoặc tạm dừng đúng lúc câu vừa bắt đầu không còn bị tính là lỗi giọng đọc (trước đây 3 lần liên tiếp có thể chuyển cả video sang giọng hệ thống khi dùng giọng trả phí).",
                "Một bản âm thanh trình duyệt không phát được: bỏ đi và tạo lại câu đó, thay vì thử phát bản hỏng liên tục.",
                "Tệp âm thanh có phần đầu sai (tần số lấy mẫu 0, số kênh 0, định dạng lạ) bị từ chối rõ ràng thay vì đọc thành tiếng rè.",
                "Không đổi cách dịch, giọng, ngắt nghỉ; không thêm lượt gọi Gemini nào."
            ],
            bang: { cot: ["Kiểm thử ngoại tuyến", "1.8.9", "Nay"], hang: [
                ["Số lần thử phát khi bị chặn 20 giây", "282", "25"],
                ["Tua/dừng lúc câu vừa bắt đầu bị tính lỗi (30 giây)", "8", "0"],
                ["Số lần thử phát một bản hỏng", "51", "1 (rồi tạo lại)"]
            ] }
        },
        {
            v: "1.8.9", luc: "00:01 28/09/2026", ten: "Tua đi rồi tua lại ngay: câu không còn bị bỏ, không phải chờ",
            y: [
                "Tua đi rồi tua lại ngay về chỗ cũ: câu đang chờ tạo giọng trước đây bị từ chối, phải đợi lượt sau. Nay câu đó được tạo đúng một lần, hoặc dùng luôn bản máy chủ vừa tạo xong.",
                "Câu bị bỏ khi tua không còn phải chờ tới lượt trong hàng mới được hủy; lệnh hủy gửi quá sớm không còn bị lạc (câu không cần nữa không chiếm máy chủ VieNeu).",
                "Máy chủ VieNeu ngắt kết nối giữa chừng: tự tạo lại câu đó, không còn báo nhầm \"máy chủ chưa chạy\" và không chuyển cả video sang giọng hệ thống.",
                "Một bản ghi âm thanh hỏng trong kho không còn làm mất mọi câu khác trong cùng lần tra; câu hay nghe lại được giữ trong bộ nhớ lâu hơn.",
                "Không đổi cách dịch, giọng, ngắt nghỉ; không thêm lượt gọi Gemini nào."
            ],
            bang: { cot: ["Kiểm thử ngoại tuyến", "1.8.8", "Nay"], hang: [
                ["Tua đi rồi tua lại khi câu đang chờ", "bị từ chối", "tạo 1 lần"],
                ["Hủy câu khi máy chủ không trả lời /health", "1,7 giây", "~5 ms"],
                ["Kết nối đứt giữa chừng", "báo máy chủ chưa chạy", "tạo lại"],
                ["1 bản ghi hỏng trong lần tra 4 câu", "mất cả 4", "mất 1"]
            ] }
        },
        {
            v: "1.8.8", luc: "23:46 27/09/2026", ten: "Lồng tiếng không còn im hẳn khi tiện ích nền không trả lời",
            y: [
                "Khi phần chạy nền của tiện ích bị Chrome tắt giữa chừng hoặc kho âm thanh bị treo, lồng tiếng có thể im cho tới hết video. Nay mỗi lần tra kho chờ tối đa 4 giây, lượt tạo giọng không có hồi âm được bỏ qua sau 20 đến 90 giây, rồi tự tạo lại (không tạo trùng).",
                "Âm thanh hỏng (thiếu thời lượng) không còn làm lồng tiếng đứng sau một câu: thời lượng được đọc lại từ tệp, tệp hỏng thì tạo lại.",
                "Tắt lồng tiếng hoặc chuyển video đúng lúc đang tra kho không còn để lại âm thanh chiếm bộ nhớ; câu vừa được dịch lại không bao giờ đọc bằng âm thanh cũ.",
                "Tra kho nhiều câu cùng lúc: đọc song song thay vì lần lượt (kho bị treo: 18 giây xuống 1,5 giây).",
                "Không đổi cách dịch, giọng, ngắt nghỉ; không thêm lượt gọi Gemini nào."
            ],
            bang: { cot: ["Kiểm thử ngoại tuyến (60 giây bài giảng)", "1.8.7", "Nay"], hang: [
                ["Tra kho không bao giờ trả lời: số câu được đọc", "0", "10 / 13"],
                ["3 lượt tạo giọng không trả lời: số câu được đọc", "0", "7 / 13"],
                ["Âm thanh thiếu thời lượng: số câu được đọc", "1", "13 / 13"],
                ["Tra 12 khóa khi kho bị treo", "18 giây", "1,5 giây"]
            ] }
        },
        {
            v: "1.8.7", luc: "23:34 27/09/2026", ten: "Tua vào giữa câu: giọng bắt đầu đúng chỗ ngắt giữa hai từ",
            y: [
                "Tua vào giữa một câu: trước đây giọng bắt đầu ở vị trí ước theo tỉ lệ, 85% số lần rơi vào giữa một âm tiết (nghe cụt, đôi khi có tiếng tách). Nay giọng bắt đầu ở khoảng lặng giữa hai từ gần nhất (thường nghe lại khoảng nửa giây), chỉ còn 0,3%.",
                "Tua lùi xa (hơn một phút rưỡi): tra kho âm thanh đã lưu trước khi tạo giọng lại, có tiếng gần như ngay lập tức.",
                "Xem ở tốc độ 1,5x hoặc 2x: câu đầu tiên không còn bị tạo giọng rồi bỏ vì không kịp, có tiếng sớm hơn khoảng 0,5 đến 1 giây.",
                "Không đổi cách dịch, giọng, ngắt nghỉ; không thêm lượt gọi Gemini nào."
            ],
            bang: { cot: ["Đo ngoại tuyến (không gọi API)", "1.8.6", "Nay"], hang: [
                ["Vào câu giữa âm tiết, 1.509 lần tua trên 25 bản ghi VieNeu thật", "1.277", "4"],
                ["Có tiếng sau khi tua lùi 3 phút (mô phỏng)", "0,95 giây", "0,1 giây"],
                ["Tiếng đầu tiên ở tốc độ 2x (mô phỏng)", "2,75 giây", "1,75 giây"],
                ["Chrome thật: tua vào giữa câu bắt đầu đúng khoảng lặng", "chưa đo", "3 / 3"]
            ] }
        },
        {
            v: "1.8.6", luc: "20:33 27/09/2026", ten: "Lồng tiếng có tiếng lại gần như ngay sau khi tua, không tạo lại đoạn đã có",
            y: [
                "Tua trong lúc VieNeu đang tạo một câu: trước đây tiện ích cắt ngang câu đó, máy chủ VieNeu vẫn giữ chỗ thêm khoảng 4 giây, và câu ở vị trí mới phải chờ (nhật ký máy chủ hôm nay: 11 lần, mỗi lần 3 đến 5 giây im lặng). Nay câu đang tạo được làm nốt (khoảng 1 giây) và lưu vào kho, câu ở vị trí mới đi ngay sau.",
                "Tua lùi (hoặc tua tới đoạn đã chuẩn bị sẵn): phát ngay âm thanh đã có thay vì cắt lại câu và tạo giọng lại.",
                "Máy chủ chậm hoặc xem ở tốc độ cao: sau khi tua không tạo giọng cho câu chắc chắn không kịp phát nữa, dành máy chủ cho câu kế tiếp.",
                "Tạm dừng không còn hủy câu sắp tới đang được tạo; tắt lồng tiếng hoặc chuyển video thì bỏ các câu còn đang chờ để video mới có tiếng sớm hơn.",
                "Giải phóng trình phát âm thanh của câu đã đọc xong: trang giữ tối đa 2 thay vì khoảng 20.",
                "Không đổi cách dịch, giọng, ngắt nghỉ; không thêm lượt gọi Gemini nào."
            ],
            bang: { cot: ["Mô phỏng ngoại tuyến (không gọi API)", "1.8.5", "Nay"], hang: [
                ["Có tiếng sau khi tua lùi về đoạn đã nghe", "0,8 giây", "0,05 giây"],
                ["Tua liên tục 5 lần: chờ trung bình / lâu nhất", "3,7 / 7,1 giây", "1,4 / 2,5 giây"],
                ["Máy chủ chậm (gần thời gian thực), có tiếng sau khi tua", "13,6 giây", "7,7 giây"],
                ["Trình phát âm thanh giữ cùng lúc", "12 đến 21", "2"],
                ["Chrome thật: có tiếng sau khi tua vào đoạn đã có", "chưa đo", "15 đến 27 ms"]
            ] }
        },
        {
            v: "1.8.5", luc: "20:11 27/09/2026", ten: "Từ điển thuật ngữ: 526 thuật ngữ có cách dịch tiếng Việt chuẩn, thêm 2 nhóm ngành",
            y: [
                "Trước đây mọi thuật ngữ trong từ điển đều bị giữ nguyên tiếng Anh, kể cả những cụm đã có tên tiếng Việt chuẩn: phụ đề và giọng lồng tiếng ra \"standard deviation\", \"interest rate\", \"side effect\". Nay 526 cụm như vậy luôn hiện đúng một cách dịch tiếng Việt (độ lệch chuẩn, lãi suất, tác dụng phụ) trong suốt bài giảng.",
                "Tên sản phẩm, viết tắt và thuật ngữ dân trong nghề quen nói tiếng Anh (CTR, conversion rate, unit test, pull request, overfitting) vẫn giữ nguyên.",
                "Thêm nhóm \"Toán học và thuật toán\" và \"Kỹ năng và năng suất\"; thêm tên công cụ AI mới (DeepSeek, Cursor, NotebookLM, n8n...) và viết tắt (RLHF, VRAM, CUDA...).",
                "Nhận cả dạng số nhiều (\"interest rates\"), sở hữu (\"prisoner’s dilemma\", \"Bayes's theorem\") và chữ số (\"Scope 3 emissions\"); thuật ngữ đứng đầu câu được viết hoa chữ đầu.",
                "Nhóm ngành mới tự bật kể cả khi đã từng bấm Lưu cài đặt; nhóm bạn đã tắt vẫn tắt. Từ bạn khai trong \"Danh sách từ giữ nguyên\" hoặc quy tắc \"=>\" luôn thắng cách dịch sẵn.",
                "Đoạn có thuật ngữ vừa đổi sang tiếng Việt sẽ được dịch lại một lần (tốn phí một lần), đoạn khác vẫn dùng bản đã lưu."
            ],
            bang: { cot: ["Từ điển", "1.8.4", "Nay"], hang: [
                ["Nhóm ngành", "17", "19"],
                ["Tổng thuật ngữ", "1.447", "1.611"],
                ["Thuật ngữ có cách dịch tiếng Việt chuẩn", "0", "526"]
            ] }
        },
        {
            v: "1.8.4", luc: "19:59 27/09/2026", ten: "Nhắc lại chủ thể ở xa, mô tả video sạch hơn, tự kiểm tra ngữ cảnh trong console",
            y: [
                "Đoạn mở đầu bằng \"he\", \"she\" hay \"the company\" mà người / vật đó được nêu từ 3 câu trở lên trước đây: Gemini nhận kèm đúng câu đã nêu tên (\"Sam joined the company in 2019.\"). Từ chủ đề lặp khắp bài (\"the model\" trong bài học máy) và \"it\", \"they\" không kéo thêm gì.",
                "Mô tả video YouTube bỏ đường dẫn, tài khoản mạng xã hội, dòng tài trợ, mốc thời gian chương trước khi gửi làm chủ đề.",
                "Khi tua tới chỗ chưa dịch trên YouTube, đoạn kế tiếp nằm xa (hơn 20 giây) chờ đoạn hiện tại dịch xong để mang theo bản dịch đó; đoạn sắp phát vẫn gửi ngay.",
                "Mỗi dòng \"🤖 GEMINI\" trong console ghi thêm ngữ cảnh đã gửi (câu trước, bản dịch trước, nhắc lại xa, số thuật ngữ, số gợi ý), để kiểm tra khi xem mà không tốn lượt gọi nào.",
                "Bản dịch đã lưu vẫn dùng lại được, trừ đoạn có câu nhắc lại mới."
            ],
            bang: { cot: ["Đo ngoại tuyến (không gọi API)", "1.8.3", "Nay"], hang: [
                ["Đoạn có câu nhắc lại chủ thể xa, bài mẫu 52 nhóm", "0", "1 (\"the company\")"],
                ["Đoạn thứ 3 trở đi xong sớm nhất trước khi phát, mô phỏng trả lời 3 giây (không chậm đi)", "13 giây", "13 giây"],
                ["Đoạn thiếu bản dịch trước, YouTube 130 giây đầu", "1", "1"]
            ] }
        },
        {
            v: "1.8.3", luc: "19:49 27/09/2026", ten: "Gemini nhận đúng ngữ cảnh câu trước khi dịch",
            y: [
                "Coursera: hai luồng dịch trước đây chạy so le nên mỗi đoạn gửi đi đều thiếu bản dịch của đoạn ngay trước (xưng hô, thuật ngữ, đại từ không nối được qua ranh giới đoạn). Nay mỗi luồng dịch một nửa bài theo thứ tự, chỉ đoạn đầu của mỗi nửa còn thiếu.",
                "YouTube: đoạn còn xa (hơn 20 giây) chờ đoạn ngay trước dịch xong rồi mới gửi, để mang theo bản dịch đó. Đoạn sắp phát vẫn gửi ngay.",
                "Bỏ gợi ý nghĩa \"thông dụng\" gây nhầm (ví dụ \"point: ý, luận điểm\" cho \"at this point\"); chỉ gửi nghĩa do lĩnh vực quyết định, không lặp \"weight\" / \"weights\".",
                "Câu kết ngắn (\"Thanks for watching.\") đi chung với đoạn trước thay vì tốn một lượt gọi riêng.",
                "Không đổi lời nhắc, model, bộ nhớ đệm bản dịch; bản dịch đã lưu vẫn dùng lại được (trừ đoạn cuối của bài có câu kết ngắn)."
            ],
            bang: { cot: ["Đo ngoại tuyến trên bài giảng mẫu 49 nhóm câu (không gọi API)", "Trước", "Nay"], hang: [
                ["Coursera: lượt gọi Gemini", "7", "6"],
                ["Coursera: đoạn có câu trước nhưng thiếu bản dịch trước", "6/6", "1/5"],
                ["YouTube: đoạn có câu trước nhưng thiếu bản dịch trước", "3", "1"],
                ["Tổng ký tự đầu vào cả bài (Coursera)", "17.815", "16.826"]
            ] }
        },
        {
            v: "1.8.2", luc: "19:29 27/09/2026", ten: "Ngắt nghỉ theo thành phần câu chính xác hơn, thêm tên Ben, Kim, Leo",
            y: [
                "Chữ \"nên\" mang nghĩa \"cho nên\" sau một vế câu đầy đủ được ngắt như ranh giới vế câu (\"Trời mưa rất to từ sáng / nên ...\"); khi \"nên\" có thể là \"nên làm\" (\"Doanh nghiệp nhỏ nên tập trung ...\") thì không mời ngắt nữa.",
                "Không ngắt trước \"so với\" sau một con số (\"tăng hai mươi phần trăm so với cùng kỳ\"), không tách mệnh đề \"mà\" ngắn khỏi danh từ (\"chiếc máy mà tôi mua hôm qua\").",
                "Mục cuối dài của một liệt kê được phép lấy hơi trước \"và\"; câu ngắn có \"để\" (\"Mình ghé qua đây để mua ít cà phê\") được đọc liền một hơi, trừ khi giọng tự dừng dài.",
                "Giọng VieNeu đọc đúng kiểu tiếng Anh các tên Ben, Kim, Leo khi đứng trong tên người nước ngoài (Ben Affleck, Kim Kardashian, Leo DiCaprio); \"Chị Kim\", \"leo núi\" vẫn đọc tiếng Việt.",
                "Không gọi thêm API nào; bản dịch đã lưu không bị dịch lại. Những câu VieNeu có thay đổi sẽ được đọc lại một lần (miễn phí, trên máy)."
            ],
            bang: { cot: ["Đo (tự động, chưa ai nghe thử)", "Trước", "Nay"], hang: [
                ["Chỗ nghỉ sai trên bản ghi thật VieNeu, bộ câu mới (lỗi bộ mù 1.8.0)", "6", "0"],
                ["Chỗ nghỉ sai theo văn bản, bộ mù thứ hai do tác tử khác viết, chấm một lần", "5", "4"],
                ["Tên, viết tắt, số đọc đúng (âm vị VieNeu), bộ mù thứ hai", "78/82", "79/82"],
                ["Tên/từ tiếng Việt giữ tiếng Việt, bộ mù thứ hai (ca sai duy nhất: VieNeu tự đọc \"Vinamilk\" kiểu Anh)", "13/14", "13/14"]
            ] }
        },
        {
            v: "1.8.1", luc: "19:11 27/09/2026", ten: "Tắt giọng Gemini trả phí, chỉ dùng giọng VieNeu",
            y: [
                "Lồng tiếng chỉ dùng giọng VieNeu trên máy (miễn phí) ở mọi chế độ chi phí. Không còn gọi Gemini TTS từ bất kỳ đâu, kể cả nút nghe thử trong Cài đặt; không còn tự chuyển sang giọng hệ thống.",
                "Nguồn giọng đã lưu là Gemini, Tự động hay Giọng hệ thống được tự chuyển về VieNeu một lần. Cài đặt chỉ còn lựa chọn VieNeu.",
                "Máy chủ VieNeu chưa chạy: hiện một thông báo, rồi tự bật lồng tiếng khi máy chủ sẵn sàng (không đọc tạm bằng giọng khác).",
                "Dịch phụ đề bằng Gemini không đổi."
            ]
        },
        {
            v: "1.8.0", luc: "19:02 27/09/2026", ten: "Giọng VieNeu phân biệt tên Việt và tên Anh theo ngữ cảnh, ngắt nghỉ theo thành phần câu",
            y: [
                "Tên trùng chữ tiếng Việt (Tom, Sam, Tim, Don, Dan...) chỉ đọc kiểu Anh khi đủ chắc: có họ tiếng Anh đi kèm (Sam Altman, Tim Cook, cả khi đứng đầu câu), hoặc câu tiếng Anh gốc gọi đúng tên đó (\"Tom said\" -> \"Tom kể\"). Đứng một mình không có ngữ cảnh thì giữ nguyên. Tên người Việt (chị Kim, Nguyễn Văn Dan, cô Kim Anh) không bao giờ bị đọc kiểu Anh.",
                "Mã viết hoa dài (5 chữ trở lên) không có nguyên âm như SMTPS chỉ đọc chữ cái tiếng Anh khi có bằng chứng; mã tiếng Việt (THPTQG, CHXHCN, UBMTTQ) giữ nguyên. NVIDIA đọc đúng \"en-vi-đi-a\" (trước đây mất hai chữ I).",
                "Số có đơn vị đọc là số lượng: \"CPU 3.5 GHz\" là \"ba phẩy năm\" (trước đây \"ba chấm năm\"); số phiên bản vẫn đọc \"chấm\" (Python 3.12, iOS 18.2).",
                "Ngắt nghỉ theo thành phần câu: không ngắt giữa chủ ngữ dài và cụm giới từ của nó (\"một công ty ở California trong quý vừa qua | đã...\"), không tách vị ngữ ngắn khỏi bổ ngữ (\"tăng mạnh nhờ vào\", \"chạy Google Ads cho...\"); mệnh đề mục đích (\"để...\") vẫn là chỗ ngắt hợp lệ.",
                "Giọng miễn phí không cắt câu ở ranh giới phụ đề khi chỗ đó nằm giữa một cụm (Christopher | Nolan, 3,5 | GHz) và người nói chỉ ngừng ngắn (dưới 1,2 giây).",
                "Không thêm lệnh gọi API nào. Giọng Gemini trả phí và kho bản dịch không đổi khóa (đã kiểm bằng mã băm cố định), nên không phải trả tiền tạo lại. Audio VieNeu đã lưu được tạo lại một lần (miễn phí, trên máy)."
            ],
            bang: { cot: ["Đo (tự động, chưa ai nghe thử)", "Trước", "Nay"], hang: [
                ["Tên, viết tắt, số đọc đúng (âm vị VieNeu), bộ câu phát triển / kiểm định", "97/107 · 35/42", "104/107 · 39/42"],
                ["Như trên, bộ câu mù do tác tử khác viết, chấm một lần", "62/70", "65/70"],
                ["Đọc nhầm tên/từ tiếng Việt thành tiếng Anh (bộ mù)", "0", "0"],
                ["Chỗ nghỉ sai trên bản ghi thật, câu thành phần mới (phát triển / kiểm định)", "5 · 1", "0 · 0"],
                ["Cắt câu sai ở ranh giới phụ đề (bộ mù, người nói ngừng 0,7 giây)", "10", "1"]
            ] }
        },
        {
            v: "1.7.9", luc: "15:07 27/09/2026", ten: "Tiếng gốc trên YouTube hạ nhỏ đúng mức khi giọng Việt đang đọc",
            y: [
                "Sửa lỗi tiếng gốc không hạ xuống mức đã chọn (ví dụ 10%) khi giọng Việt đang nói trên YouTube. Nguyên nhân: trình phát YouTube tự đặt lại âm lượng video (tính năng Âm lượng ổn định, sau khi tua...), tiện ích tưởng là người xem tự chỉnh nên thôi hạ nhỏ cho tới lúc giọng Việt ngừng.",
                "Giờ mỗi khi YouTube tự đặt lại âm lượng, tiếng gốc được hạ lại ngay ở nhịp kế tiếp (khoảng 0,05 giây). Khi tắt lồng tiếng, âm lượng trả về đúng mức của YouTube chứ không bị đẩy lên 100%."
            ]
        },
        {
            v: "1.7.8", luc: "14:51 27/09/2026", ten: "Giọng VieNeu đọc đúng tên riêng, thương hiệu, viết tắt và số phiên bản tiếng Anh",
            y: [
                "Giọng VieNeu không còn đánh vần tên tiếng Anh bằng chữ cái tiếng Việt: IKEA đọc \"ai-ki-a\" thay vì \"i ca e a\", CPC / ROI / TPM đọc chữ cái tiếng Anh thay vì \"xê phê xê\". Những viết tắt tiếng Việt (CLB, HLV, VTV, UBND), khổ giấy A4, đội U23 vẫn đọc kiểu Việt như cũ.",
                "Tên người và địa danh có chữ trùng âm tiết tiếng Việt được đọc kiểu Anh khi chắc chắn là tên: Tom Hanks, Tom Cruise, San Francisco, San Diego, Leonardo DiCaprio, La La Land. Không đoán bừa: \"Con AI này\", \"Chị Lan\", một chữ \"Tom\" đứng một mình vẫn đọc kiểu Việt.",
                "Số phiên bản đọc bằng \"chấm\" cho mọi giọng: GPT-5.6 là \"GPT năm chấm sáu\" (trước đây \"năm phẩy sáu\"), gemini-2.5-flash-lite không còn đọc \"gạch ngang\" hay \"dash\", iOS 18.2 và Llama-3.3-70B cũng vậy. Số lượng vẫn đọc \"phẩy\": 2,5 kg, 10.5 GB, 3.5 giây. Mã sản phẩm đọc như mã: RTX 5090 là \"năm không chín không\", MacBook Pro M3 là \"em ba\".",
                "Không ngắt giữa tên, thuật ngữ hay số hiệu (Google Ads API, Christopher Nolan, Performance Max campaign, GPT 5 chấm 6); hai tên nối bằng \"và\" đọc liền một cụm (ROI và KPI, Facebook và Instagram).",
                "Ngắt nghỉ tiếng Việt: sửa các chỗ ngắt sai còn tồn đọng: \"tăng | từ 72,5%\", \"chỉ tốt | bằng dữ liệu\", \"thấp hơn nhiều | so với\", \"mà\" nối mệnh đề sau danh từ, \"thì\" sau chủ đề ngắn, \"tập thể dục | vào buổi sáng\", \"tăng mạnh | nhờ vào\".",
                "Tất cả chạy trên máy, không gọi thêm API nào, không tốn thêm tiền. Audio VieNeu đã lưu được tạo lại một lần (miễn phí). Giọng Gemini chỉ đổi ở cách đọc số phiên bản."
            ],
            bang: { cot: ["Đo (tự động, không nghe tay)", "Trước", "Nay"], hang: [
                ["Tên, thương hiệu, viết tắt, số phiên bản đọc đúng (đo trên âm vị của chính VieNeu, bộ câu phát triển)", "68/79", "79/79"],
                ["Như trên, bộ câu kiểm tra riêng / bộ câu chưa dùng để chỉnh", "18/24 · 23/29", "23/24 · 28/29"],
                ["Chỗ nghỉ đặt sai, câu tiếng Việt thuần (4 bộ câu × 5 bản ghi thật, cùng bản ghi)", "26", "5"],
                ["Chỗ nghỉ đặt sai, câu trộn tiếng Anh (86 câu × 3 bản ghi thật)", "20", "8"],
                ["Chỗ nghỉ giữa tên riêng hoặc thuật ngữ / tiếng lách cách, vỡ tiếng", "0 / 0", "0 / 0"],
                ["Tổng thời lượng đọc (câu trộn tiếng Anh)", "825,6 giây", "821,4 giây"]
            ] }
        },
        {
            v: "1.7.7", luc: "13:36 27/09/2026", ten: "Máy chủ giọng vừa khởi động lại không còn làm bỏ câu",
            y: [
                "Khi máy chủ VieNeu để lâu không dùng, macOS đẩy mô hình giọng ra khỏi bộ nhớ và vài câu đầu tạo rất chậm (đo được 1 giây lời mất 3,5 giây, bình thường khoảng 0,25 giây). Trước đây chính những câu đầu đó khiến tiện ích tưởng máy chủ chậm lâu dài và bỏ câu để bắt kịp.",
                "Nay lượt đầu sau khi nghỉ lâu (hơn 10 phút) được chờ tới 60 giây thay vì bị cắt ở 8 giây rồi tạo lại từ đầu, và không tính vào tốc độ đo. Một lượt chậm riêng lẻ không còn bị coi là máy chủ chậm; máy chủ vừa nhanh lại thì thôi bỏ câu ngay.",
                "Thời gian cố định của mỗi lượt gọi không còn bị tính hai lần, nên câu ngắn không còn trông chậm gấp đôi thực tế."
            ]
        }, {
            v: "1.7.6", luc: "13:24 27/09/2026", ten: "Giọng VieNeu ngắt nghỉ theo cấu trúc câu, không còn ngắt giữa từ",
            y: [
                "Bộ ngắt nghỉ viết lại: mỗi chỗ giữa hai từ được chấm điểm theo cấu trúc câu (mệnh đề, cụm từ, con số, tên riêng, thuật ngữ) thay vì dò danh sách từ khóa. Trong những chỗ giọng tự dừng, tiện ích giữ những chỗ đáng nghỉ nhất và khép phần còn lại, để lời đọc không vụn mà cũng không dồn một hơi quá dài.",
                "Không còn ngắt giữa con số và đơn vị, giữa hai tiếng của một từ (\"gấp | mười\", \"chuẩn | bị\") hay ngay sau \"rằng\". Chỗ giọng tự dừng trước \"mà\", \"nên\", \"sau mỗi\" trong câu dài nay được giữ (trước đây bị ép liền).",
                "Độ dài chỗ nghỉ theo vai trò: câu dẫn ngắn nghỉ nhẹ, các mục liệt kê nghỉ đều nhau, dấu phẩy trước \"nhưng\" nghỉ lâu hơn trước \"và\", câu hỏi và câu mở ý mới nghỉ lâu hơn một chút. Câu dày chữ (người nói nhanh) bỏ các chỗ nghỉ không bắt buộc trước.",
                "Câu rất dài không có dấu phẩy: tiện ích thêm dấu phẩy ở chỗ chuyển ý rõ nhất để giọng lấy hơi (chỉ thêm dấu phẩy, không đổi chữ nào). Khi một câu phải cắt làm hai lượt đọc, chỗ cắt rơi vào ranh giới câu hoặc mệnh đề thay vì giữa cụm như \"đưa ra | quyết định\" (giọng miễn phí).",
                "Audio VieNeu đã lưu được tạo lại một lần (miễn phí). Giọng Gemini trả phí không đổi, không tốn thêm lượt gọi API nào."
            ],
            bang: { cot: ["Đo (cùng bản ghi VieNeu, bộ câu đánh dấu tay)", "Trước", "Nay"], hang: [
                ["Chỗ nghỉ giữa từ, số hoặc tên riêng (56 câu × 5 bản ghi)", "4", "0"],
                ["Chỗ nghỉ đặt sai, tính cả lỗi nhẹ (cùng bộ câu)", "10", "7"],
                ["Câu dày chữ: chỗ nghỉ đặt sai / chỗ đáng nghỉ bị ép liền", "10 / 11", "4 / 1"],
                ["Đoạn dài nhất không nghỉ ở câu được thêm dấu phẩy thở (35 bản ghi)", "28 âm tiết", "18 âm tiết"]
            ] }
        },
        {
            v: "1.7.5", luc: "05:26 27/09/2026", ten: "Coursera hiện phụ đề ngay từ đoạn đầu, giọng nghỉ đúng chỗ hơn",
            y: [
                "Coursera: phụ đề tiếng Việt hiện ngay khi đoạn đầu dịch xong, không còn chờ dịch hết cả bài. Đoạn đang xem được dịch trước (kể cả khi bài được mở tiếp ở giữa), đoạn chưa dịch vẫn hiện câu tiếng Anh. Lồng tiếng tự bật cũng bắt đầu từ đoạn đầu.",
                "Sửa lỗi nút trên trình phát Coursera cứ quay \"Đang dịch phụ đề…\" sau khi đã dịch xong. Trong lúc còn dịch phần sau, nút ở trạng thái bật và ghi rõ đang dịch tiếp.",
                "Bảng điều khiển: thanh \"Đã dịch x/y đoạn\" chạy theo thời gian thực khi đang mở, và trên Coursera đếm đúng tổng số đoạn của bài (trước đây luôn báo đã xong).",
                "Tắt phụ đề giữa chừng thì bài đang dịch dừng gửi đi ngay; chuyển bài thì bảng lời thoại và bảng điều khiển không còn giữ câu của bài cũ.",
                "Giọng VieNeu: giữ chỗ ngừng tự nhiên trước \"bằng cách\", \"thông qua\", \"dựa trên\"... trong câu dài (trước đây bị ép liền, nghe như nói dồn). Câu ngắn và khi các từ này là động từ thì không ngắt. Audio VieNeu đã lưu được tạo lại một lần (miễn phí)."
            ],
            bang: { cot: ["Đo", "Trước", "Nay"], hang: [
                ["Số lượt dịch phải chờ trước câu tiếng Việt đầu tiên (bài 10 phút mô phỏng)", "25", "1"],
                ["Chỗ ngừng trước \"thông qua\" / \"bằng cách\" được giữ (10 bản ghi Mỹ Duyên)", "0/10", "10/10"]
            ] }
        },
        {
            v: "1.7.4", luc: "04:55 27/09/2026", ten: "Chuyển bài giữa chừng không còn lẫn phụ đề, bớt trả tiền trùng",
            y: [
                "Coursera: chuyển sang bài giảng khác khi bài cũ còn đang dịch thì bài cũ dừng gửi Gemini ngay (trước đây vẫn dịch nốt cả bài, tốn tiền), phụ đề của bài cũ không còn bị vẽ đè lên video bài mới, và bài mới vẫn tự dịch (trước đây bị bỏ qua).",
                "YouTube: mở video khác trong vài giây đầu khi video cũ đang tải phụ đề cũng được xử lý như vậy: không hiện phụ đề của video cũ trên video mới, không gửi câu của video cũ đi dịch, video mới vẫn tự dịch.",
                "Mở lại video có đoạn từng được model kế tiếp dịch thay (khi model rẻ nhất bị giới hạn tốc độ): nay lấy từ bộ nhớ đệm, không trả tiền dịch lại. Yêu cầu dịch bằng model mạnh không bao giờ nhận bản của model rẻ hơn.",
                "Giọng Gemini: xem lại video đã nghe dở, câu nằm ngay sau đoạn bị bỏ qua không còn bị tạo giọng lại (trả tiền hai lần) khi đã có trong kho.",
                "Lồng tiếng: nếu lần bật đầu tiên không thành (chế độ Chỉ phụ đề, chưa có giọng đọc), các video sau trong cùng trang vẫn tự bật lồng tiếng như bình thường (trước đây bị kẹt tới khi tải lại trang)."
            ]
        },
        {
            v: "1.7.3", luc: "01:17 27/09/2026", ten: "Rà soát toàn bộ: ít gọi API hơn, sửa lỗi sau khi Tải lại, gọn mã",
            y: [
                "YouTube: mở lại một video đã xem dở không còn phải trả tiền dịch lại. Trước đây cách gom câu để gửi Gemini phụ thuộc vị trí đang xem, nên lần mở sau (YouTube tự tiếp tục ở chỗ cũ) gửi câu theo cách khác và bộ nhớ đệm không nhận ra. Nay mỗi câu luôn thuộc đúng một nhóm cố định.",
                "Gemini bị giới hạn tốc độ, hết hạn mức ngày hoặc quá tải ở model rẻ nhất: tiện ích dịch bằng model kế tiếp (không vượt mức giá của chế độ đang chọn) thay vì chuyển ngay sang Google không có ngữ cảnh. Bản dịch tạm bằng Google cũng không còn bị lưu vĩnh viễn cho video đó.",
                "Sửa lỗi Coursera: sau khi Tải lại tiện ích mà chưa F5, chuyển sang bài giảng khác có thể làm hiện lại nút cũ đã mất tác dụng và che nút mới.",
                "Công tắc \"Tiếng Anh ở trên\" trong bảng điều khiển áp dụng ngay khi đang xem. Bỏ công tắc \"Làm mờ dòng tiếng Anh\" vì nó chưa bao giờ có tác dụng (cỡ và màu dòng gốc chỉnh trong Cài đặt).",
                "Nhẹ máy hơn: phụ đề Coursera không còn đo lại cả thanh điều khiển 60 lần mỗi giây; mở tab YouTube không còn đọc toàn bộ kho lưu trữ mỗi lần (một lần mỗi ngày); kho audio trong trang giới hạn 16 MB.",
                "Gỡ mã không còn dùng: bộ rút gọn lời thoại (vốn bị khóa vĩnh viễn, nay không thể bật lại), nhánh đọc phụ đề trực tiếp chưa bao giờ chạy, bộ chặn khoảng lặng, nút tròn đời cũ. Bản dịch dự phòng Google dịch các câu song song, nhanh hơn."
            ]
        },
        {
            v: "1.7.2", luc: "00:32 27/09/2026", ten: "Giọng sạch hơn, hết tiếng ù trầm, ngắt nghỉ theo mệnh đề",
            y: [
                "Lọc tiếng ù trầm (dưới 80 Hz với giọng nữ, 60 Hz với giọng nam): bản thu mẫu của Mỹ Duyên có tiếng ù trầm nằm dưới cả lời nói, giọng cô ấy lại không có âm nào thấp như vậy, nên cắt đi không làm mỏng giọng.",
                "Sửa bộ khử tiếng xì: bản trước ước lượng tiếng nền thấp hơn thực tế khoảng 4,5 dB, nên tiếng xì ở vùng 1 đến 5 kHz (vùng tai nghe rõ nhất) giữa các từ chỉ giảm khoảng 2 dB. Nay giảm khoảng 8 đến 10 dB, phụ âm gió (s, x, ch) giữ nguyên, ít tiếng lấp lánh nhân tạo hơn.",
                "Bỏ bộ chặn khoảng lặng chạy sau bộ khử tiếng xì: nó chỉ bớt thêm khoảng 1,5 dB mà làm tiếng nền phập phồng theo nhịp nói.",
                "Ngắt nghỉ theo mệnh đề: câu dài không có dấu phẩy, giọng tự ngừng trước \"nhưng, thì, vì, để, khi, nếu...\" thì nay được giữ một nhịp ngắn (0,14 đến 0,2 giây) thay vì bị nối liền một mạch; chỗ ngừng lưng chừng giữa cụm từ vẫn được nối lại. Câu ngắn không bị chèn nhịp nghỉ.",
                "Nghỉ ở dấu chấm theo độ dài câu (câu 2 chữ nghỉ ngắn hơn câu dài), câu hỏi và câu cảm nghỉ lâu hơn một chút. Câu dài bị chia hai lượt đọc ở dấu phẩy nay có nhịp nghỉ của dấu phẩy ở chỗ nối.",
                "Giọng bắt đầu ngay bằng tiếng (Thái Sơn, đôi khi Thục Đoan) được vào tiếng mềm hơn, không \"bật\" ở chữ đầu. Audio VieNeu đã lưu được tạo lại một lần (miễn phí)."
            ],
            bang: { cot: ["Đo trên 17 câu thử, Mỹ Duyên", "Trước", "Nay"], hang: [
                ["Tiếng ù 20 đến 60 Hz so với giọng", "−45 dB", "−61 dB"],
                ["Tiếng xì giữa các từ, vùng 1 đến 4 kHz", "giảm 2 dB", "giảm 8,5 dB"],
                ["Chỗ giọng ngừng ở ranh giới mệnh đề (câu dài không dấu phẩy)", "nối liền 0,09 giây", "giữ 0,14 đến 0,2 giây"],
                ["Độ lệch độ to giữa các câu", "0,2 đến 0,3 dB", "0,2 đến 0,3 dB"]
            ] }
        },
        {
            v: "1.7.1", luc: "23:32 26/09/2026", ten: "Cỡ chữ 100% mới, Mỹ Duyên mặc định, khử tiếng xì, phụ đề dễ đọc hơn",
            y: [
                "Cỡ chữ đổi thang: mức 70% cũ (dễ đọc nhất) nay gọi là 100% và là mức khuyên dùng; mọi mức khác quy đổi theo cùng tỉ lệ. Cỡ chữ bạn đang dùng được tự đổi sang con số mới, chữ trên màn hình giữ nguyên độ lớn.",
                "Mỹ Duyên là giọng đọc mặc định (được đặt lại một lần; sau đó bạn vẫn đổi giọng khác được).",
                "Khử tiếng xì nền theo phổ tần số cho giọng VieNeu: tiếng xì của Mỹ Duyên giảm khoảng 10 dB cả lúc đang nói, giọng không đổi. Giọng vốn sạch (như Thục Đoan) được tự nhận ra và giữ nguyên.",
                "Phụ đề nán lại tối đa 0,7 giây trong khoảng lặng sau câu (không đè dòng sau) để đọc kịp; giọng đọc vẫn theo đúng nhịp phụ đề.",
                "Ngắt nghỉ thông minh: đo trên 8 câu có đủ loại dấu, cả 14 dấu câu đều có chỗ ngừng đúng, 6 chỗ ngừng sai được nối liền."
            ]
        },
        {
            v: "1.7.0", luc: "21:05 26/09/2026", ten: "Không chồng giọng lên bản lồng tiếng AI tiếng Việt của YouTube",
            y: [
                "Video nước ngoài mà YouTube đang phát bằng giọng lồng tiếng AI tiếng Việt: tiện ích không hiện phụ đề dịch và không lồng tiếng thêm, vì bạn đã nghe tiếng Việt, tránh hai giọng đè nhau.",
                "Thông báo nhỏ có nút \"Dùng tiếng gốc + giọng tiện ích\": bấm là trình phát chuyển về tiếng gốc, rồi tiện ích dịch phụ đề và lồng tiếng như bình thường.",
                "Đổi đường tiếng giữa chừng cũng được theo dõi: chuyển sang lồng tiếng AI tiếng Việt thì phụ đề và giọng của tiện ích tự tắt; chuyển về tiếng gốc thì tiện ích tự dịch lại (nếu đang bật Tự động dịch)."
            ]
        },
        {
            v: "1.6.9", luc: "21:00 26/09/2026", ten: "Nhận diện đúng video tiếng Việt, không phụ đề video tiếng Việt",
            y: [
                "Sửa lỗi dịch nhầm video tiếng Việt: YouTube nay tự lồng tiếng AI cho nhiều video (ví dụ bản tin tiếng Việt có thêm đường tiếng Anh tự động), kèm phụ đề tự động tiếng Anh của bản lồng tiếng đó. Tiện ích từng lấy phụ đề tiếng Anh này, tưởng video nói tiếng Anh, rồi dịch ngược sang tiếng Việt.",
                "Nay tiện ích hỏi trình phát đường tiếng nào là tiếng GỐC, bỏ qua phụ đề của bản lồng tiếng AI, và khi không có thông tin đó thì xem tiêu đề, mô tả (bỏ qua video ghi \"Vietsub\", \"thuyết minh\", \"lồng tiếng\").",
                "Video nói tiếng Việt không còn bị hiện phụ đề dịch hay lồng tiếng, kể cả bản dịch đã lưu từ trước. Nếu bạn tự bấm dịch, tiện ích báo lý do và có nút \"Vẫn dịch\"."
            ]
        },
        {
            v: "1.6.8", luc: "20:54 26/09/2026", ten: "Giọng đọc mượt, hết khựng như robot; ngắt nghỉ thông minh hơn",
            y: [
                "Tìm ra nguyên nhân giọng bị khựng như robot (đo trên Chrome thật, 2 phút lồng tiếng): tiện ích đổi tốc độ phát của giọng 510 lần trong lúc đang đọc, khoảng 21 lần mỗi câu, vì đuổi theo độ trễ vài chục mili giây lúc audio bắt đầu phát. Mỗi lần đổi, Chrome phải khởi động lại bộ co giãn giọng và tạo tiếng vấp. Nay: 0 lần, giọng vẫn khớp phụ đề.",
                "Câu có tốc độ gần tự nhiên được phát đúng 1 lần, không qua bộ co giãn, nên giọng giữ nguyên chất: 21 trên 24 câu với Thục Đoan. Mỹ Duyên (giọng chậm) vẫn được tăng tốc đều 1,07 đến 1,1 lần như trước.",
                "Ngắt nghỉ thông minh bản 2: dấu phẩy sau vế ngắn (\"Vâng,\") nghỉ rất nhẹ, sau vế dài nghỉ đủ hơi; dấu phẩy trước \"và, nhưng, còn...\" nghỉ ngắn hơn để nối ý; câu hỏi, câu cảm nghỉ lâu hơn một chút.",
                "Giảm tiếng xì nhẹ tay hơn, không còn làm cụt đuôi chữ (trước làm thay đổi 2 đến 4% phần giọng của Thục Đoan, nay gần như 0).",
                "Giọng VieNeu đọc liền mạch câu dài hơn (tối đa 11 giây một lượt thay vì 8), bớt chỗ một câu bị chia hai lượt đọc với ngữ điệu bị ngắt. Mọi giọng VieNeu (cả miền Nam, Bắc, Trung) dùng 48 kHz."
            ],
            bang: { cot: ["Đo trên Chrome thật, 120 giây", "Trước", "Nay"], hang: [
                ["Số lần đổi tốc độ giọng khi đang đọc (Thục Đoan)", "510", "0"],
                ["Câu phát đúng tốc độ gốc (Thục Đoan)", "0/24", "21/24"],
                ["Số lần đổi tốc độ khi đang đọc (Mỹ Duyên, chỉ đo sau khi sửa)", "chưa đo", "0"]
            ] }
        },
        {
            v: "1.6.7", luc: "20:22 26/09/2026", ten: "Giọng VieNeu chỉ ngừng ở dấu câu, bớt rè, bớt tiếng xì",
            y: [
                "Giọng đọc không còn ngừng giữa câu ở chỗ không có dấu câu. Trước đây có ba nguyên nhân: tiện ích tự thêm dấu phẩy ở chỗ người nói gốc ngừng, máy chủ giọng tự ngừng giữa câu, và một câu bị chia làm hai lượt đọc khi nằm ở ranh giới hai nhóm dịch. Nay chỉ dấu phẩy, dấu chấm, dấu chấm phẩy... mới tạo khoảng ngừng; câu dài không có dấu câu vẫn có một chỗ lấy hơi rất ngắn.",
                "Giọng Thục Đoan bớt rè ở đoạn đọc nhanh: tiện ích lấy âm thanh 48 kHz (tần số gốc của giọng) thay vì 24 kHz. Đo trong Chrome, cùng một câu đọc nhanh 1,4 lần, độ sạch của giọng giảm ít hơn khoảng 4 lần so với trước.",
                "Giọng Mỹ Duyên bớt tiếng xì nền giữa các từ (khoảng lặng từ -53 xuống -65 dB).",
                "Audio VieNeu đã lưu sẽ được tạo lại một lần theo cách mới (miễn phí, chỉ tốn thời gian máy chủ ở lần xem đầu)."
            ],
            bang: { cot: ["Đo trên máy", "Trước", "Nay"], hang: [
                ["Chỗ ngắt giữa câu khi nhóm dịch cắt ngang câu (22 câu mẫu)", "7", "1"],
                ["Độ sạch Thục Đoan ở 1,4 lần (10% đoạn kém nhất)", "giảm 0,087", "giảm 0,020"],
                ["Tiếng xì giữa các từ, Mỹ Duyên", "-53 dB", "-65 dB"]
            ] }
        },
        {
            v: "1.6.6", luc: "20:06 26/09/2026", ten: "Sao lưu cài đặt, giới hạn tốc độ đọc, tùy chọn dùng phụ đề Việt có sẵn",
            y: [
                "Thẻ mới \"Sao lưu cài đặt\": xuất toàn bộ cài đặt, danh sách thuật ngữ và các dòng phụ đề đã sửa ra một tệp, nhập lại bất cứ lúc nào. Có thể chọn kèm hoặc không kèm Gemini API Key. Bản dịch và audio đã lưu không nằm trong tệp (tự tạo lại được).",
                "Mục mới \"Tốc độ đọc tối đa\" trong phần Lồng tiếng: Tự động (như trước) hoặc giới hạn từ 1,1 đến 1,5 lần. Giới hạn thấp nghe rõ hơn nhưng giọng có thể trễ sau hình ở đoạn nói nhanh; không bao giờ bỏ chữ. Đổi là có hiệu lực từ câu kế tiếp.",
                "Mục mới \"Bỏ qua dịch khi video đã có phụ đề tiếng Việt\" (mặc định bật). Tắt đi thì vẫn dịch từ phụ đề gốc, dùng khi phụ đề Việt sẵn có là bản dịch máy kém. Áp dụng cho YouTube, Coursera và các trang video khác."
            ]
        },
        {
            v: "1.6.5", luc: "19:58 26/09/2026", ten: "Dịch phụ đề và lồng tiếng trên các trang video khác",
            y: [
                "Ngoài YouTube và Coursera, giờ dịch được phụ đề trên mọi trang có video dùng phụ đề chuẩn của trình duyệt (trang khoá học, blog, trang trường, trình phát video.js, Plyr...). Mở trang, bấm nút tiện ích rồi bấm Dịch, hoặc dùng phím tắt Alt+S / Alt+D.",
                "Tiện ích chỉ chạy trên trang đó khi bạn bấm, không xin quyền đọc mọi trang web.",
                "Trang không có thanh điều khiển mà tiện ích nhận ra được: nút dịch nổi ở góc trên bên phải video, phụ đề Việt nằm đúng trong khung hình. Khi xem toàn màn hình, trình duyệt tự hiện phụ đề Việt.",
                "Chưa hỗ trợ: video nằm trong khung nhúng của trang khác (ví dụ Vimeo nhúng, edX) và trang tự vẽ phụ đề riêng (ví dụ Udemy). Tiện ích sẽ báo rõ khi gặp trường hợp này."
            ]
        },
        {
            v: "1.6.4", luc: "19:37 26/09/2026", ten: "Dọn các lỗi tồn đọng; lồng tiếng và phụ đề nhẹ máy hơn",
            y: [
                "Sửa lỗi chế độ song ngữ tự tắt: bật song ngữ trong cửa sổ nhỏ rồi mở lại trang Coursera có thể quay về một ngôn ngữ, và trên YouTube tắt song ngữ trong cửa sổ nhỏ có thể không có tác dụng. Nay chỉ còn một chỗ quyết định chế độ hiển thị.",
                "Chỉ còn một cầu nối đọc phụ đề YouTube. Sau khi bấm Tải lại tiện ích, trang đang mở dùng đúng cầu nối đầy đủ (có mã xác thực của trình phát), không còn bản sao thiếu chức năng.",
                "Dựng kịch bản lồng tiếng nhanh gấp khoảng 3 lần (13 xuống 4 mili giây cho mỗi lần có câu mới), kết quả giống hệt từng đoạn trên bài giảng 60 phút.",
                "Nút trên thanh điều khiển không còn bị kiểm tra lại mỗi lần YouTube thay đổi trang (bình luận, đề xuất, trò chuyện trực tiếp), chỉ tối đa khoảng 7 lần mỗi giây.",
                "Dọn cài đặt rút gọn lời thoại vốn đã tắt: giờ chỉ còn một công tắc, luôn tắt. Lời thoại không bao giờ bị rút gọn."
            ],
            bang: { cot: ["Đo trên máy", "Trước", "Nay"], hang: [
                ["Dựng kịch bản cho 80 nhóm câu", "13,1 mili giây", "3,9 mili giây"],
                ["Tách dòng 22 câu mẫu", "2,2 mili giây", "1,8 mili giây"]
            ] }
        },
        {
            v: "1.6.3", luc: "23:06 23/09/2026", ten: "Mượt hơn với video dài; thực đơn và bản chép lời mở, đóng có chuyển động",
            y: [
                "Sửa nguyên nhân giật hình khi dịch video dài: mỗi lần thêm một nhóm câu dịch xong, bộ lồng tiếng dựng lại kịch bản cho toàn bộ video, tốn khoảng 90 mili giây (bằng 5 khung hình) với bài giảng 60 phút, và lặp lại hàng trăm lần trong lúc dịch. Nay chỉ dựng cho khoảng quanh chỗ đang xem: còn khoảng 15 mili giây, nhịp nặng nhất từ 97 xuống 16 mili giây. Kịch bản thu được giống hệt cách cũ (đã kiểm chứng từng đoạn, kể cả khi bật giọng thứ hai).",
                "Sửa rò rỉ bộ nhớ: audio của những đoạn không còn trong kịch bản trước đây không bao giờ được giải phóng.",
                "Tua tới chỗ khác thì nhịp đo tốc độ nói của video được đo lại ngay, không dùng số đo của chỗ cũ.",
                "Thực đơn trên video hiện ra mềm (mờ dần và nhích lên), bản chép lời trượt vào từ phải, cả hai mờ dần khi đóng. Phụ đề trượt mượt sang bên khi nhường chỗ. Ai bật \"giảm chuyển động\" trong hệ điều hành thì không có hiệu ứng nào.",
                "Bản chép lời không ghép lại toàn bộ lời thoại mỗi 150 mili giây nữa, chỉ khi có câu mới hoặc khi bạn sửa một dòng."
            ],
            bang: { cot: ["Bài giảng 60 phút", "Trước", "Nay"], hang: [
                ["Dựng lại kịch bản lồng tiếng mỗi lần có câu mới", "khoảng 90 mili giây", "khoảng 15 mili giây"],
                ["Nhịp xử lý nặng nhất", "97 mili giây", "16 mili giây"],
                ["Số đoạn phải lập kế hoạch", "668", "96"]
            ] }
        },
        {
            v: "1.6.2", luc: "22:57 23/09/2026", ten: "Bật/tắt giọng đọc thứ hai; đo thật: giọng Kim Thanh hết trễ ở đoạn nói nhanh",
            y: [
                "Thêm công tắc \"Dùng giọng thứ hai cho người nói khác\" trong Cài đặt, mục Lồng tiếng. Mặc định TẮT: cả video đọc bằng một giọng, không đổi giọng giữa chừng. Bật lên thì câu của người nói thứ hai (phụ đề đánh dấu >>, gạch đầu dòng hoặc TÊN:) đọc bằng giọng thứ hai, và hai ô chọn giọng thứ hai mới hiện ra.",
                "Đo trực tiếp bản 1.6.1 trên YouTube với giọng Kim Thanh, cùng đoạn dày chữ như lần trước: trễ tối đa từ 1,88 giây xuống 0,43 giây, nói lấn phụ đề từ 1,76 giây xuống 0,42 giây, tốc độ cao nhất giữ nguyên khoảng 1,4 lần, không bỏ câu nào."
            ],
            bang: { cot: ["Đo thật, đoạn dày chữ, Kim Thanh", "1.6.0", "1.6.1"], hang: [
                ["Trễ lúc bắt đầu, câu tệ nhất", "1,88 giây", "0,43 giây"],
                ["Nói lấn quá phụ đề, câu tệ nhất", "1,76 giây", "0,42 giây"],
                ["Tốc độ cao nhất", "1,40 lần", "1,41 lần"]
            ] }
        },
        {
            v: "1.6.1", luc: "22:43 23/09/2026", ten: "Giọng đọc tự thích ứng theo tốc độ nói của video, tăng tốc dần từ trước câu dày chữ",
            y: [
                "Giọng đọc nay tự đo nhịp nói của video (khoảng 90 giây phía trước): mỗi câu cần đọc nhanh bao nhiêu để vừa khung phụ đề, theo tốc độ thật của giọng bạn chọn. Video nói nhanh thì giọng giữ nhịp nhanh đều cả đoạn và được nới trần tốc độ (tối đa 1,55 lần, không bao giờ quá 5,8 âm tiết mỗi giây). Video nói chậm thì không đổi gì.",
                "Giọng biết trước câu nào sắp dày chữ và tăng tốc dần từ vài câu trước, thay vì đến sát câu đó mới dồn gấp rồi trễ. Mỗi câu vẫn chỉ nhanh hơn câu trước tối đa 0,1 nên nhịp không giật; và câu hiện tại không bao giờ kết thúc sớm quá 0,5 giây so với phụ đề của nó.",
                "Khi đang đọc nhanh theo người nói, thực đơn ghi rõ \"người nói nhanh, đọc nhanh theo\".",
                "Đo bằng mô phỏng trên dòng thời gian thật của hai video, với tốc độ thật của giọng Kim Thanh."
            ],
            bang: { cot: ["Giọng Kim Thanh, dòng thời gian thật", "Trước", "Nay"], hang: [
                ["Video nói nhanh 1: câu trễ quá 1 giây", "3", "0"],
                ["Video nói nhanh 1: trễ tối đa", "1,41 giây", "0,94 giây"],
                ["Video 2: câu trễ quá 1 giây", "5", "1"],
                ["Video 2: 90% số câu trễ dưới", "0,76 giây", "0,23 giây"],
                ["Người nói chậm: tốc độ đọc trung bình", "1,05 lần", "1,05 lần (không đổi)"]
            ] }
        },
        {
            v: "1.6.0", luc: "22:30 23/09/2026", ten: "Sửa theo lần đo trên video thật: thực đơn không che phụ đề, bản chép lời tự cuộn đúng",
            y: [
                "Đo trực tiếp trên YouTube trong Chrome của bạn, giọng Kim Thanh, nền tối. Thực đơn mở ra che mất cuối hai dòng phụ đề. Nay phụ đề tự dịch sang trái và thu hẹp lại khi thực đơn mở, giống như khi mở bản chép lời. Áp dụng cho cả Coursera.",
                "Bản chép lời không tự cuộn tới dòng đang phát (video ở 8:20 mà danh sách đứng ở 0:02). Hai lỗi chồng nhau: vị trí dòng tính lệch 112 điểm ảnh, và lệnh cuộn chỉ chạy một lần nên bị ngắt giữa chừng là kẹt luôn. Nay mỗi nhịp đều kiểm tra lại, xa thì nhảy thẳng, gần thì cuộn mượt.",
                "Không tách đôi \"gần bằng\", \"gần giống\", \"xấp xỉ\" khi ngắt dòng (gặp thật: \"cũng gần / bằng với tiền thuê nhà\").",
                "Đo giọng Kim Thanh trên đoạn dày chữ: tốc độ đọc lên tới 1,4 lần, trễ tối đa 1,9 giây rồi bắt kịp sau khoảng 10 giây, không bỏ câu nào. Kim Thanh là giọng nói chậm nhất trong 25 giọng (3,8 âm tiết mỗi giây)."
            ],
            bang: { cot: ["Đo trên video thật (8:25 đến hết, 13 câu, Kim Thanh)", "Kết quả"], hang: [
                ["Câu bị bỏ", "0"],
                ["Trễ lúc bắt đầu, đoạn thưa chữ", "tối đa 0,26 giây"],
                ["Trễ lúc bắt đầu, đoạn dày chữ", "tối đa 1,88 giây, bắt kịp sau khoảng 10 giây"],
                ["Tốc độ đọc cao nhất", "1,4 lần"]
            ] }
        },
        {
            v: "1.5.9", luc: "22:18 23/09/2026", ten: "Đo tốc độ nói của cả 25 giọng; thực đơn, bảng chép lời và bảng điều khiển gọn gàng, dễ đọc hơn",
            y: [
                "Đo thật tốc độ nói của cả 25 giọng VieNeu trên máy bạn. Trước đây chỉ 4 giọng có số đo, 21 giọng còn lại dùng chung con số ước 4,8 âm tiết mỗi giây, lệch tới 24% (giọng thật từ 3,8 đến 5,8). Nay bộ lồng tiếng chọn đúng nhịp ngay từ câu đầu với mọi giọng.",
                "Danh sách giọng ghi rõ giọng nói chậm, vừa hay nhanh, ví dụ \"Mỹ Duyên (nữ, đọc truyện, nói chậm)\": bài giảng nhiều chữ nên chọn giọng nói vừa hoặc nhanh.",
                "Thực đơn trên video chia hai phần có tiêu đề, Phụ đề và Giọng đọc, mỗi phần chỉ gồm nút của nó; khoảng cách rộng hơn, nhãn gọn hơn.",
                "Bản chép lời trình bày như một trang đọc: dòng đầu ghi số dòng, thời lượng, số dòng đã sửa; câu gốc in nghiêng như chú thích; dòng đang phát đánh dấu bằng vạch màu bên trái; khung rộng hơn nên ít xuống dòng vụn.",
                "Bảng điều khiển (bấm biểu tượng tiện ích) có thẻ Đang xem: tên video, thanh tiến độ dịch, và giọng đang đọc kèm tình trạng (đã chuẩn bị trước bao nhiêu giây, máy chủ có chậm không).",
                "Sửa ghi chú trong Cài đặt: kéo tiếng gốc về 0% là tắt hẳn (ghi chú cũ vẫn nói không tắt)."
            ],
            bang: { cot: ["Giọng VieNeu", "Trước", "Nay"], hang: [
                ["Số giọng có số đo tốc độ nói", "4 trên 25", "25 trên 25"],
                ["Sai số lớn nhất của con số ước chung", "24%", "không còn dùng con số ước"]
            ] }
        },
        {
            v: "1.5.8", luc: "22:02 23/09/2026", ten: "Giọng đọc số và ký hiệu đúng kiểu Việt, phụ đề không lặp câu, không vắt ngang câu",
            y: [
                "Giọng VieNeu đọc \"1.500.000 đồng\" thành \"một năm không không không không không\". Lỗi do chính tiện ích: bỏ dấu chấm thành 1500000, mà máy chủ giọng đọc từng chữ số với mọi số từ 7 chữ số trở lên. Nay đọc \"một triệu năm trăm nghìn\". Kiểm chứng bằng đúng bộ chuẩn hóa chữ của máy chủ VieNeu.",
                "Sửa thêm cách đọc: $20 thành \"20 đô la\" (trước là \"u s d\"), 7B và 200K thành \"7 tỷ\", \"200 nghìn\" (trước là \"bảy bê\", \"hai trăm ca\"), 1,000 kiểu Anh thành \"một nghìn\" (trước là \"một\"), 1990s thành \"những năm 1990\" (trước đọc chữ s thành \"giây\"), 1st/2nd thành \"thứ nhất, thứ hai\", Python 3.11 và v2.0 đọc bằng \"chấm\", địa chỉ web không còn đánh vần \"hát tê tê phê\", #1 thành \"số 1\", 2x thành \"2 lần\".",
                "Sửa lỗi nặng: đôi khi mô hình dịch luôn cả câu ngữ cảnh phía sau vào bản dịch của câu trước, trong khi câu sau vẫn được dịch riêng. Phụ đề hiện một ý hai lần, giọng Việt đọc hai lần và phải đọc 36 đến 51 ký tự mỗi giây. Nay tiện ích tự nhận ra phần lấn và cắt bỏ, không tốn thêm lượt gọi, áp dụng cả cho video đã dịch và lưu từ trước.",
                "Phụ đề không còn để một khung chứa đuôi câu trước dính với nửa đầu câu sau. Đo trên 2 video thật: từ 38 khung xuống 7.",
                "Bổ sung các từ ghép hay bị tách đôi khi ngắt dòng: tủ đồ, trào lưu, bày biện, bất cứ lúc nào, đồ đạc, ngăn nắp và vài từ khác."
            ],
            bang: { cot: ["Đo trên 2 video thật đã dịch (347 khung phụ đề)", "Trước", "Nay"], hang: [
                ["Khung vắt ngang hai câu", "38", "7"],
                ["Khung phải đọc nhanh hơn 25 ký tự/giây", "16", "7"],
                ["Khung phải đọc nhanh hơn 30 ký tự/giây", "8", "1"],
                ["Khung nhanh nhất", "45,5 ký tự/giây", "31 ký tự/giây"],
                ["Nội dung hiện và đọc hai lần", "257 ký tự", "0"]
            ] }
        },
        {
            v: "1.5.7", luc: "21:45 23/09/2026", ten: "Sửa tay một dòng phụ đề, giọng Việt đọc đúng câu đã sửa",
            y: [
                "Trong Bản chép lời, rê chuột vào một dòng rồi bấm biểu tượng bút chì để sửa bản dịch. Enter để lưu, Esc để hủy. Video tự tạm dừng trong lúc bạn gõ và phát tiếp khi lưu xong.",
                "Bản sửa được lưu riêng cho từng video, trên máy của bạn. Mở lại video (kể cả khi bản dịch lấy từ bộ nhớ đệm) thì bản sửa vẫn nằm trên bản dịch máy.",
                "Giọng Việt đọc đúng câu đã sửa. Chỉ câu bị sửa mới được tạo giọng lại, các câu khác giữ nguyên audio đã có.",
                "Dòng đã sửa có nhãn \"đã sửa\" màu cam, và có nút \"Dùng bản dịch máy\" để quay về bản gốc bất cứ lúc nào.",
                "Tab mới \"Phụ đề đã sửa\" trong Cài đặt: xem mọi dòng đã sửa của mọi video, bản dịch máy gạch ngang bên dưới, sửa tiếp, khôi phục từng dòng hoặc cả video. Đổi ở đây là video đang mở cập nhật ngay.",
                "Xuất .srt từ Bản chép lời nay có luôn các dòng bạn đã sửa."
            ]
        },
        {
            v: "1.5.6", luc: "19:11 23/09/2026", ten: "Chỉnh cỡ chữ và âm lượng ngay trên video, biết giọng đọc đang làm gì",
            y: [
                "Sửa lỗi: trong Cài đặt kéo \"Tiếng gốc khi đang đọc\" về 0% nhưng tiếng gốc vẫn còn 20%. Mã cũ coi số 0 là \"chưa chọn\" rồi thay bằng 20%. Nay 0% là tắt hẳn tiếng gốc đúng như bạn chọn.",
                "Sửa lỗi trên Coursera: đổi cỡ chữ, màu hay viền phụ đề trong Cài đặt phải chờ tới lần đổi kích thước khung video mới thấy. Nay áp dụng ngay. Bật tắt song ngữ từ bên ngoài cũng vẽ lại liền, không chờ câu kế.",
                "Thực đơn nhanh trên YouTube và Coursera có thêm nút chỉnh cỡ chữ phụ đề (A− / A+, mỗi lần 10%), không phải mở Cài đặt nữa.",
                "Thêm hai thanh trượt khi đang lồng tiếng: âm lượng giọng Việt và mức tiếng gốc khi đang đọc. Đổi là nghe khác ngay, không phải tạo lại giọng.",
                "Dòng Lồng tiếng Việt trong thực đơn nay nói giọng đang làm gì: đã chuẩn bị trước bao nhiêu giây, máy chủ giọng có đang chậm không (đo thật), và đã bỏ bao nhiêu câu để bắt kịp. Trước đây giọng im mà không biết vì sao.",
                "Nhãn tên giọng và thẻ \"Đang chuẩn bị phụ đề và giọng Việt…\" đổi sang cùng kiểu thẻ tối với thông báo và thực đơn, không còn là hộp đen phông mặc định."
            ],
            bang: { cot: ["Việc", "Trước", "Nay"], hang: [
                ["Tiếng gốc chọn 0%", "vẫn phát ở 20%", "tắt hẳn"],
                ["Đổi cỡ chữ trên Coursera", "chờ tới khi khung video đổi cỡ", "thấy ngay"],
                ["Chỉnh cỡ chữ, âm lượng", "phải mở trang Cài đặt", "ngay trong thực đơn trên video"],
                ["Giọng im một lúc", "không có lời giải thích", "ghi rõ máy chủ chậm hoặc đang tạo giọng"]
            ] }
        },
        {
            v: "1.5.5", luc: "17:22 23/09/2026", ten: "Sửa lỗi ngắt dòng phụ đề trên Coursera, phụ đề nhường chỗ cho bản chép lời",
            y: [
                "Phụ đề trên Coursera bị ngắt giữa cụm từ, kiểu \"... mà bạn có thể thực / hiện,\". Nguyên nhân: phần cắt dòng cắt theo cú pháp chứ không theo bề rộng, còn lớp phủ lại để trình duyệt tự xuống dòng ở chỗ nào cũng được.",
                "Đo thật trên trang: với cỡ chữ 130% một câu dài chiếm 1085 điểm ảnh trong khi khung chỉ rộng 848, nên bị ngắt bừa. Nay tiện ích đo đúng phông và cỡ chữ bạn đang dùng rồi cắt lại theo cú pháp (khoảng 50 ký tự mỗi dòng ở cỡ 130%).",
                "Phép cắt dòng này nay dùng chung cho cả YouTube và Coursera, nằm ở một chỗ duy nhất.",
                "Lớp phủ Coursera nay giống hệt YouTube: khung ôm sát chữ, không cho trình duyệt tự ngắt dòng nữa.",
                "Mở Bản chép lời thì phụ đề tự thu hẹp và dịch sang trái, không còn chạy xuống dưới khung chép lời."
            ],
            bang: { cot: ["Đo trên trang Coursera thật, cỡ chữ 130%", "Trước", "Nay"], hang: [
                ["Bề rộng một câu dài", "1085 điểm ảnh", "1085 điểm ảnh"],
                ["Khung chứa được", "848 điểm ảnh", "848 điểm ảnh"],
                ["Cách xử lý khi tràn", "trình duyệt ngắt bừa giữa cụm", "cắt lại theo cú pháp, 50 ký tự mỗi dòng"]
            ] }
        },
        {
            v: "1.5.4", luc: "16:59 23/09/2026", ten: "Bản chép lời cạnh video, xuất .srt, và báo phụ đề nguồn là loại nào",
            y: [
                "Thêm khung Bản chép lời trượt ra cạnh video trên cả YouTube và Coursera: xem toàn bộ lời thoại song ngữ, dòng đang phát tự sáng và tự cuộn theo, bấm một dòng là video nhảy tới đó, có ô tìm trong lời thoại.",
                "Xuất tệp .srt cho video đang xem. Đang để Song ngữ thì tệp có cả dòng gốc, để Chỉ tiếng Việt thì chỉ có bản dịch.",
                "Thực đơn nhanh nay nói rõ đang đọc phụ đề loại nào: phụ đề tác giả tải lên hay phụ đề máy nghe tự động. Phụ đề máy nghe là nguyên nhân chính làm bản dịch sai, nên dòng này hiện màu cảnh báo.",
                "Khung chép lời không tốn thêm tiền: nó dùng lại đúng dữ liệu mà lớp phụ đề đang vẽ.",
                "Mở khung bằng nút Bản chép lời trong thực đơn nhanh."
            ]
        },
        {
            v: "1.5.3", luc: "16:37 23/09/2026", ten: "Coursera hiển thị phụ đề như YouTube, có nút riêng trên thanh điều khiển",
            y: [
                "Phụ đề trên Coursera trước đây được giao cho phần vẽ phụ đề sẵn có của trình duyệt, mà Coursera cũng vẽ phụ đề của họ lên cùng chỗ, nên hai khung đè lên nhau và chữ chồng chữ. Nay tiện ích tự vẽ lớp phủ riêng như bên YouTube, và tắt hẳn phần vẽ của trình duyệt.",
                "Lớp phủ dùng chung bộ kiểu chữ, màu, nền và vị trí với YouTube, tự nâng lên trên thanh điều khiển nên không bị thanh che.",
                "Bỏ hai nút tròn nổi trên video. Thay bằng MỘT nút nằm ngay trong thanh điều khiển của Coursera, cạnh nút toàn màn hình, mở đúng thực đơn nhanh như trên YouTube: bật tắt phụ đề, bật tắt lồng tiếng, chọn giọng, chọn kiểu hiển thị, mở Cài đặt.",
                "Biểu tượng, màu sắc và thực đơn của hai trang nay lấy từ cùng một tệp dùng chung, không còn mỗi nơi một kiểu."
            ],
            bang: { cot: ["Trên Coursera", "Trước", "Nay"], hang: [
                ["Ai vẽ phụ đề", "trình duyệt vẽ, Coursera vẽ chồng lên", "tiện ích tự vẽ, chỉ một khung"],
                ["Kiểu phụ đề", "khác YouTube", "giống hệt YouTube"],
                ["Nút điều khiển", "2 nút tròn nổi trên video", "1 nút trong thanh điều khiển"],
                ["Thực đơn nhanh", "không có", "có, giống YouTube"]
            ] }
        },
        {
            v: "1.5.2", luc: "16:18 23/09/2026", ten: "Một biểu tượng duy nhất cho toàn bộ tiện ích",
            y: [
                "Trước đây mỗi nơi một hình: biểu tượng trên thanh Chrome là chữ C xanh, bảng điều khiển là hình tia, trang Cài đặt là nút phát màu tím, trên YouTube lại là hình khác. Nay tất cả dùng chung một hình: bong bóng thoại lồng tia sáng, màu cam đất.",
                "Biểu tượng trên thanh công cụ Chrome được vẽ lại ở bốn cỡ riêng (16, 32, 48, 128 điểm ảnh), cỡ nhỏ có nét dày hơn để không bị nhòe.",
                "Trang Cài đặt bỏ nốt mảng màu tím còn sót trong ô biểu tượng.",
                "Thêm bài kiểm tra: mọi nơi phải dùng đúng một hình, và mỗi tệp biểu tượng phải đúng số điểm ảnh đã khai báo."
            ],
            bang: { cot: ["Biểu tượng ở từng nơi", "Trước", "Nay"], hang: [
                ["Thanh công cụ Chrome", "chữ C màu xanh", "bong bóng thoại cam đất"],
                ["Bảng điều khiển", "hình tia bốn cánh", "bong bóng thoại"],
                ["Trang Cài đặt", "nút phát trên nền tím", "bong bóng thoại trên nền cam đất"],
                ["Nút trên YouTube", "bong bóng thoại (từ 1.5.1)", "giữ nguyên"],
                ["Số tệp biểu tượng", "1 tệp dùng cho mọi cỡ", "4 tệp vẽ riêng cho từng cỡ"]
            ] }
        },
        {
            v: "1.5.1", luc: "16:10 23/09/2026", ten: "Biểu tượng trên nút YouTube hiện được thật, đo trực tiếp trên trang",
            y: [
                "Nguyên nhân ô trống: chính CSS của YouTube ép hình vẽ đặt trong nút của trình phát về chiều rộng 0. Đo trên trang thật: chiều cao 18 điểm ảnh nhưng chiều rộng 0.",
                "Nay biểu tượng được vẽ bằng ảnh nền của nút, thứ mà CSS của YouTube không với tới được. Đã thử ngay trên trang YouTube thật trước khi phát hành.",
                "Biểu tượng vẫn là bong bóng thoại lồng tia sáng của tiện ích, cùng màu cam đất với bảng điều khiển.",
                "Bài kiểm tra tự động nay bắt buộc nút phải vẽ biểu tượng bằng ảnh nền và không được đổi màu bằng thuộc tính gộp (làm mất biểu tượng); bài này báo hỏng trên đúng bản 1.5.0."
            ],
            bang: { cot: ["Đo trên trang YouTube thật", "1.5.0", "1.5.1"], hang: [
                ["Chiều rộng hình trong nút", "0 điểm ảnh", "19 điểm ảnh"],
                ["Nhìn thấy biểu tượng", "không, chỉ có ô màu", "có"]
            ] }
        },
        {
            v: "1.5.0", luc: "16:00 23/09/2026", ten: "Nút trên thanh điều khiển YouTube có biểu tượng riêng, không còn ô trống",
            y: [
                "Bản 1.4.9 đặt biểu tượng vào nút nhưng không ghi kích thước cho hình vẽ, nên trên YouTube nút chỉ hiện một ô màu trống trơn.",
                "Nút nay có biểu tượng riêng: bong bóng thoại lồng tia sáng của tiện ích, nhìn rõ ở cỡ 17 điểm ảnh ngay cạnh các nút sẵn có của YouTube, và vẫn cùng một nhà với bảng điều khiển.",
                "Thêm bài kiểm tra: mọi hình vẽ trong nút phải khai báo kích thước, để lỗi ô trống không lặp lại."
            ],
            bang: { cot: ["Nút trên thanh điều khiển", "1.4.9", "1.5.0"], hang: [
                ["Hình bên trong nút", "không hiện (ô màu trống)", "bong bóng thoại + tia sáng"],
                ["Kích thước hình", "không khai báo", "lấp đầy khung 18 điểm ảnh"]
            ] }
        },
        {
            v: "1.4.9", luc: "15:55 23/09/2026", ten: "Nút và thực đơn trên YouTube dùng chung một bộ nhận diện với bảng điều khiển",
            y: [
                "Nút trên thanh điều khiển YouTube trước đây màu tím với biểu tượng loa, không giống bảng điều khiển và trang Cài đặt. Nay dùng đúng biểu tượng và màu cam đất của tiện ích.",
                "Thực đơn nhanh trên video được vẽ lại theo đúng bộ màu, bo góc, kiểu chữ và công tắc của bảng điều khiển: thẻ có viền, tiêu đề chữ có chân, công tắc 36x20 giống hệt.",
                "Thực đơn nhanh nay theo luôn lựa chọn Sáng / Tối trong Cài đặt, đổi trong Cài đặt là đổi ngay, không cần tải lại trang.",
                "Thông báo nhỏ hiện trên video cũng dùng chung bộ màu đó; nút thao tác trong thông báo chuyển sang màu nhấn.",
                "Chấm trạng thái trên nút rút còn hai màu cho dễ hiểu: vàng là đang dịch, xanh lá là đang bật. Đang bật phụ đề hay lồng tiếng thì xem ở chú thích khi rê chuột.",
                "Thêm bài kiểm tra tự động: bộ màu của nút, thực đơn và thông báo phải khớp với bảng điều khiển, tránh về sau lại lệch nhau."
            ]
        },
        {
            v: "1.4.8", luc: "12:10 23/09/2026", ten: "Dọn lại phần mã vừa viết cho đúng quy ước ngôn ngữ của dự án",
            y: [
                "Không đổi cách chạy: chỉ viết lại bằng tiếng Anh những dòng ghi chú và tên bài kiểm tra MỚI thêm ở bản 1.4.7, theo quy ước mới của dự án (ghi chú trong mã và tên hàm mới viết bằng tiếng Anh).",
                "Mọi chữ bạn nhìn thấy trên màn hình vẫn là tiếng Việt như cũ, kể cả trang Cài đặt, bảng điều khiển và các thông báo trên video."
            ]
        },
        {
            v: "1.4.7", luc: "11:46 23/09/2026", ten: "Máy chủ giọng chậm không còn làm lồng tiếng im cả quãng",
            y: [
                "Khi máy chủ giọng tạo không kịp (máy đang bận việc khác), engine đứng im chờ từng câu một tới 4,5 giây rồi mới bỏ, trong khi vẫn tiếp tục tạo audio cho những câu đã bỏ. Kết quả: im lặng cả quãng dài rồi bỗng đọc dồn cho kịp.",
                "Nay engine ước lượng \"còn phải chờ bao lâu\" theo tốc độ tạo giọng ĐO ĐƯỢC, biết chắc không kịp thì nhảy tới câu mà audio còn về kịp và đọc liền mạch từ đó.",
                "Không còn tạo audio cho câu đã trôi qua: mỗi lượt của máy chủ dành cho câu sắp đọc.",
                "Hết audio phía trước thì chỉ xin MỘT câu ngắn mỗi lượt (thay vì gộp 4 câu), để có tiếng sớm nhất.",
                "Máy chủ khỏe (0,23) thì mọi thứ y như cũ: 61/61 câu, không bỏ câu nào."
            ],
            bang: { cot: ["Mô phỏng trên dòng thời gian thật của một video 11 phút", "Trước", "Nay"], hang: [
                ["Máy chủ khỏe (tạo 1 giây lời nói mất 0,23 giây)", "61/61 câu", "61/61 câu"],
                ["Hơi chậm (0,45 giây)", "60/61 câu", "60/61 câu"],
                ["Chậm (0,70 giây)", "58/61 câu", "58/61 câu"],
                ["Chậm ngang thời gian thực (1,00 giây)", "12/61 câu", "30/61 câu"],
                ["... câu đọc trễ quá 2 giây", "10 câu", "2 câu"],
                ["... quãng im dài nhất", "63 giây", "không còn quãng im vì chờ audio"]
            ] }
        },
        {
            v: "1.4.6", luc: "11:05 23/09/2026", ten: "Xác nhận đã khôi phục tốc độ giọng; tệp cài chịu được lỗi của macOS",
            y: [
                "Đo lại sau khi cài lại dịch vụ: tốc độ tạo giọng về 0,23 (trước khi sửa là 1,07), mức ưu tiên tiến trình về 31 (trước là 4).",
                "Bài kiểm tra chạy thật: 25/25 câu được đọc, trễ tối đa 1,15 giây, ba đoạn đầu có audio sau 2,2 giây.",
                "Tệp cài dịch vụ: lần cài lại đầu tiên bị macOS trả lỗi và để máy chủ tắt hẳn, vì lệnh gỡ chưa xong mà lệnh nạp đã chạy. Nay chờ gỡ xong, thử lại 5 lần, hỏng thì báo rõ và chỉ cách bật tạm.",
                "Bảng so sánh của bản 1.4.5 đã điền số đo thật."
            ]
        },
        {
            v: "1.4.5", luc: "10:55 23/09/2026", ten: "Sửa lỗi máy chủ giọng chạy chậm gấp 5 lần; tiện ích tự đo tốc độ",
            y: [
                "Tệp cài dịch vụ tự khởi động (bản 1.4.2) đặt mức ưu tiên Nền, làm macOS đẩy máy chủ giọng sang lõi tiết kiệm điện: tạo 1 giây lời nói mất 1,07 giây thay vì khoảng 0,23. Nay đặt mức Tương tác.",
                "Tiện ích tự đo tốc độ tạo giọng của 5 lượt gần nhất và hiện trong Cài đặt; quá chậm thì báo ngay trên video thay vì để bạn đoán vì sao giọng trễ.",
                "Bài kiểm tra chạy thật nay BÁO HỎNG khi máy chủ chậm, và khi không câu nào được đọc (trước đó vẫn in ĐẠT).",
                "Thêm công cụ đo nhanh: node tools/vieneu-bench.js"
            ],
            bang: { cot: ["Đo thật trên MacBook Air M3", "Mức ưu tiên Nền (1.4.2)", "Mức Tương tác (1.4.5)"], hang: [
                ["Tạo 1 giây lời nói mất", "1,07 giây", "0,23 giây"],
                ["Ba đoạn đầu có audio sau", "10,3 giây", "2,2 giây"],
                ["Mức ưu tiên tiến trình", "4 (lõi tiết kiệm điện)", "31 (bình thường)"],
                ["Số câu đọc được", "0/24 (bài kiểm tra vẫn báo ĐẠT)", "25/25"],
                ["Câu trễ trên 1 giây khi mở video", "4 câu, tối đa 3,40 giây", "1 câu, tối đa 1,15 giây"]
            ] }
        },
        {
            v: "1.4.4", luc: "01:40 23/09/2026", ten: "Bỏ tin nhắn thừa trong bảng điều khiển; tài liệu hết ghi cứng số phiên bản",
            y: [
                "Bảng điều khiển từng gửi cho trang một tin nhắn (setOptions) mà không file nào xử lý; bật tắt lồng tiếng vốn đã đi qua kho cài đặt nên tin nhắn đó là thừa.",
                "Thêm bài kiểm tra: mọi tin nhắn bảng điều khiển gửi cho trang đều phải có nơi xử lý.",
                "Tài liệu nội bộ không còn ghi cứng số phiên bản (trước ghi 1.4.0 trong khi thật là 1.4.3), nay trỏ về manifest.json."
            ]
        },
        {
            v: "1.4.3", luc: "01:28 23/09/2026", ten: "Mục Lịch sử phiên bản trong Cài đặt",
            y: [
                "Thêm mục Lịch sử phiên bản: đủ 35 bản từ bản gốc tới bản đang dùng, mỗi bản ghi rõ đã sửa gì.",
                "Bản nào có số đo thật thì kèm bảng so sánh trước và sau.",
                "Có ô tìm kiếm trong lịch sử (ví dụ gõ \"giọng\", \"phím tắt\").",
                "Công cụ tăng phiên bản nhắc ghi lịch sử nếu bản mới chưa có mục; có bài kiểm tra giữ cho lịch sử không lệch với phiên bản thật."
            ]
        },
        {
            v: "1.4.2", luc: "01:05 23/09/2026", ten: "VieNeu luôn sẵn sàng; giao diện Sáng / Tối",
            y: [
                "Máy chủ giọng VieNeu tự chạy cùng máy: cài một lần bằng tools/vieneu-autostart.command (dịch vụ com.damduy.vieneu, chạy khi đăng nhập, tự bật lại nếu bị tắt).",
                "Nếu lúc bật lồng tiếng mà máy chủ chưa lên: đọc tạm bằng giọng khác rồi tự chuyển về VieNeu ngay khi máy chủ sẵn sàng, không phải bấm gì.",
                "Thêm giao diện Sáng / Tối / Theo máy, chọn ở đầu trang Cài đặt, dùng chung cho cả bảng điều khiển.",
                "Khung xem thử phụ đề hiện luôn nhãn lồng tiếng như trên video thật.",
                "Thêm phím tắt Alt+Shift+V để mở bảng điều khiển.",
                "Sửa lỗi nút Cài đặt tàng hình ở giao diện sáng, và lỗi bộ theo dõi VieNeu bị xóa nhầm (giọng không bao giờ tự chuyển về)."
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["Máy chủ VieNeu", "tự nhấp đúp mỗi lần bật máy", "tự chạy khi đăng nhập, tự bật lại khi tắt"],
                ["Máy chủ chưa chạy", "cả video dùng giọng hệ thống", "tự đổi về VieNeu giữa chừng khi máy chủ lên"],
                ["Giao diện", "chỉ theo cài đặt của macOS", "Sáng / Tối / Theo máy, tự chọn được"]
            ] }
        },
        {
            v: "1.4.1", luc: "00:45 23/09/2026", ten: "Viết lại thực đơn trên video; bảng điều khiển biết trang đang làm gì",
            y: [
                "Mỗi dòng trong thực đơn là công tắc thật, bấm được bằng bàn phím, một màu thống nhất.",
                "Chọn giọng đọc ngay trong thực đơn, không phải mở trang Cài đặt.",
                "Thực đơn tự cập nhật trạng thái mỗi 0,7 giây và không đóng sau mỗi lần bấm.",
                "Bảng điều khiển hiện trạng thái thật của trang: đã dịch bao nhiêu đoạn, đang đọc giọng nào."
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["Nhãn bật/tắt", 'chữ "BẬT" trông như nút bấm, hai màu khác nhau', "công tắc thật, một màu, đọc được bằng trình đọc màn hình"],
                ["Tiến độ dịch", "không biết", '"Đã dịch 12/40 đoạn"'],
                ["Đổi giọng", "phải mở trang Cài đặt", "chọn ngay trong thực đơn"],
                ["Bàn phím", "Tab lọt ra sau lưng trình phát", "Tab chạy vòng trong thực đơn, Esc đóng"]
            ] }
        },
        {
            v: "1.4.0", luc: "00:08 23/09/2026", ten: "Phím tắt, thông báo không chặn trang, dùng được bằng bàn phím",
            y: [
                "Thêm phím tắt Alt+S (phụ đề) và Alt+D (lồng tiếng), không thêm quyền nào.",
                "Bỏ mọi hộp thoại chặn trang trên YouTube và Coursera, thay bằng thẻ thông báo nhỏ tự ẩn, có nút thao tác.",
                "Viền tiêu điểm rõ khi dùng bàn phím; tôn trọng cài đặt giảm chuyển động của hệ điều hành.",
                "Nút trên trình phát báo đúng trạng thái cho trình đọc màn hình."
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["Phím tắt", "không có", "Alt+S, Alt+D"],
                ["Báo lỗi", "hộp thoại chặn cả trang, video vẫn chạy nên mất lời", "thẻ nhỏ tự ẩn, có nút Mở Cài đặt / Thử lại"],
                ["Trước khi lồng tiếng", 'hỏi "Cần dịch phụ đề trước?"', "dịch luôn và báo một dòng"]
            ] }
        },
        {
            v: "1.3.9", luc: "23:51 22/09/2026", ten: "Đổi giọng đọc không còn chồng hai giọng",
            y: [
                "Đổi giọng trong Cài đặt từng làm hai bộ đọc chạy song song (giọng cũ và giọng mới chồng nhau).",
                "Nguyên nhân: trang Cài đặt lưu tất cả mục mỗi lần đổi một thứ, nên hai nơi cùng bật lại lồng tiếng.",
                "Nay mỗi lượt bật mang số thứ tự, chỉ lượt mới nhất được chạy."
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["Đổi giọng khi đang xem", "hai giọng đọc chồng lên nhau", "chỉ một giọng, giọng cũ tắt hẳn"]
            ] }
        },
        {
            v: "1.3.8", luc: "22:49 22/09/2026", ten: 'Không đọc "(Vỗ tay)", "(Cười)"; giao diện tối giản',
            y: [
                "Chú thích âm thanh trong phụ đề vẫn hiện trên màn hình nhưng không còn bị đọc thành lời.",
                "Bảng điều khiển bỏ phần giới thiệu, mẹo, chân trang và nút Cài đặt trùng lặp.",
                "Trang Cài đặt chỉ hiện mục thuộc lựa chọn hiện tại; nhãn lồng tiếng trên video chỉ hiện 3 giây rồi mờ.",
                "Thực đơn trên video bỏ ô không bấm được và khối thông tin kỹ thuật."
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["(Vỗ tay), (Cười)", "bị đọc thành lời, nghe rất giả", "không đọc, thành khoảng lặng"],
                ["Bảng điều khiển", "6 công tắc + mẹo + chân trang", "2 công tắc + nút dịch"]
            ] }
        },
        {
            v: "1.3.7", luc: "22:39 22/09/2026", ten: "Câu đầu video không mất chữ",
            y: [
                "YouTube tự phát 0,2 đến 0,4 giây trước khi tiện ích kịp tạm dừng để chuẩn bị, nên câu đầu mất vài chữ.",
                "Nay hết thời gian chờ mà video còn ở dưới 1,5 giây thì quay về 0 rồi mới phát."
            ]
        },
        {
            v: "1.3.6", luc: "22:36 22/09/2026", ten: "Hết treo tab YouTube khi Tải lại tiện ích",
            y: [
                "Tải lại tiện ích khi đang mở video làm tab treo cứng (đo thật 330% CPU): mã cũ và mã mới xóa nút của nhau rồi tự tạo lại, lặp vô tận.",
                "Nay phần tử của thế hệ mã cũ chỉ bị ẩn, không bị xóa. Có bài kiểm tra giả lập hai thế hệ mã trong một tab."
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["Tải lại tiện ích khi đang xem", "tab treo cứng, phải đóng tab", "không treo, mã mới tiếp quản"]
            ] }
        },
        {
            v: "1.3.5", luc: "22:25 22/09/2026", ten: "Ghi chép chẩn đoán lúc bắt đầu phát",
            y: ["Thêm ghi chép trạng thái (chỉ bật khi đo, không gửi đi đâu) để tìm nguyên nhân giọng vào trễ."]
        },
        {
            v: "1.3.4", luc: "22:19 22/09/2026", ten: "Xóa audio đã lưu của riêng một video",
            y: [
                "Thêm nút trong bảng điều khiển để xóa audio lồng tiếng của đúng video đang mở rồi tạo lại.",
                "Audio các video khác và bản dịch đã lưu giữ nguyên."
            ]
        },
        {
            v: "1.3.3", luc: "19:46 22/09/2026", ten: "Không nghỉ giữa câu; gộp đoạn quá ngắn",
            y: [
                "Đang đọc sớm hơn phụ đề thì được chậm lại nhanh hơn để lấp khung.",
                "Đoạn từ 2 âm tiết trở xuống mà câu còn tiếp được gộp vào đoạn sau, không tạo audio lẻ loi."
            ]
        },
        {
            v: "1.3.2", luc: "19:39 22/09/2026", ten: "Giọng không chạy trước phụ đề, không bỏ đoạn ngắn",
            y: [
                "Đo thật video TED: giọng đọc trước phụ đề tới 2 giây do độ sớm cộng dồn qua chuỗi đoạn.",
                "Sửa thêm lỗi có sẵn: đoạn đầu rất ngắn (audio dưới 0,8 giây) sau khi mở video hoặc tua bị bỏ, không đọc."
            ],
            bang: { cot: ["Chỉ số (video TED, 70 giây đầu)", "1.3.1", "1.3.2"], hang: [
                ["Đọc sớm hơn phụ đề, tối đa", "2,00 giây", "0,80 giây"],
                ["Số đoạn sớm hơn 0,8 giây", "7/25", "0/27"],
                ["Bỏ câu / lỗi", "0 / 0", "0 / 0"]
            ] }
        },
        {
            v: "1.3.1", luc: "15:39 22/09/2026", ten: "KHÔNG rút gọn lời thoại (giữ đủ nội dung người nói)",
            y: [
                "Bỏ hẳn việc rút gọn câu: bản 1.2.9 và 1.3.0 có thể cắt tới khoảng 40% chữ với người nói nhanh.",
                "Người nói nhanh nay được xử lý bằng khoảng nghỉ ngắn hơn trong câu (0,15 giây) và tốc độ tối đa 1,4x khi đang trễ.",
                "Đánh đổi: với người nói rất nhanh, giọng Việt sẽ trễ hơn thay vì mất nội dung."
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["Câu dài hơn khung", "rút gọn chữ, mất nội dung", "giữ nguyên chữ, đọc nhanh hơn và bớt khoảng nghỉ"],
                ["Mô phỏng câu cần 1,35x", "có câu bị cắt", "14/14 câu nguyên vẹn, trễ dưới 2 giây"]
            ] }
        },
        {
            v: "1.3.0", luc: "22/09/2026", ten: "Chờ chuẩn bị 5 giây; người nói rất nhanh không làm trễ dồn",
            y: [
                "Nâng thời gian chờ chuẩn bị từ 3,5 lên 5 giây.",
                "Phát hiện bước rút gọn của 1.2.9 chưa bao giờ chạy vì ước độ dài theo tốc độ mục tiêu thay vì tốc độ thật của giọng."
            ],
            bang: { cot: ["Mô phỏng người nói rất nhanh", "1.2.9", "1.3.0"], hang: [
                ["Trễ tối đa", "4,4 giây", "0 giây"],
                ["Câu bị bỏ", "có", "0"]
            ] }
        },
        {
            v: "1.2.9", luc: "22/09/2026", ten: "Người nói nhanh không làm giọng Việt trễ dần",
            y: [
                "Đo thật: 25 giây đầu giọng Việt chạy hết tốc độ 1,3x mà vẫn trễ dần tới 1,3 giây.",
                "Thêm bước rút gọn nhẹ không chặn cho câu dài hơn khung (về sau bị bỏ hẳn ở 1.3.1 theo yêu cầu giữ đủ nội dung)."
            ]
        },
        {
            v: "1.2.8", luc: "22/09/2026", ten: "Đo thật bản 1.2.7; dịch nhanh hơn sau khi tua",
            y: [
                "Nhóm phụ đề sắp phát (8 giây tới) được dịch thành lượt nhỏ, dịch khẩn cả khi vị trí rơi vào khoảng lặng."
            ],
            bang: { cot: ["Đo thật (video mới 9SCixFSvTNY)", "Kết quả"], hang: [
                ["Chờ chuẩn bị khi mở video", "3,3 giây, có giọng ngay từ câu đầu"],
                ["Tua tới phút 7", "chờ 3,2 giây, khoảng hở trong cùng câu 0 đến 0,19 giây (trước 1,5 đến 3 giây)"]
            ] }
        },
        {
            v: "1.2.7", luc: "22/09/2026", ten: "Đọc liền mạch tới dấu câu; chờ chuẩn bị 3,5 giây",
            y: [
                "Đoạn đọc cắt ngay sau dấu câu thay vì cắt ở ranh giới khung phụ đề (thường giữa một vế câu).",
                "Thêm tính năng chờ chuẩn bị: tạm dừng video tối đa 3,5 giây để tải phụ đề, dịch và tạo giọng cho đoạn đầu.",
                "Cửa sổ Chrome bị che: đoạn sau bắt đầu theo sự kiện của audio và video, không hụt tiếng tới 1 giây nữa."
            ]
        },
        {
            v: "1.2.6", luc: "22/09/2026", ten: "Lồng tiếng mặc định bật; tab đang mở tự nhận bản mới",
            y: [
                'Sửa lỗi "mất luôn VieNeu, không thấy phụ đề": kho cài đặt bị Chrome tạo lại làm mất lựa chọn lồng tiếng.',
                "Tải lại tiện ích: service worker tự nạp lại đủ mã vào tab đang mở, không cần F5.",
                "Bỏ 2 lượt làm nóng giọng; đoạn đọc quanh chỗ bắt đầu xem cắt ngắn khoảng 3,5 giây."
            ],
            bang: { cot: ["Mô phỏng video phụ đề tự động", "Trước", "Nay"], hang: [
                ["Tiếng đầu tiên kể từ khi có bản dịch", "1,65 giây", "0,90 giây"]
            ] }
        },
        {
            v: "1.2.5", luc: "22/09/2026", ten: "Số phiên bản đúng quy tắc; vào giữa video có tiếng ngay",
            y: [
                "Sửa cách đánh số: mỗi lần +0.0.1, tới 9 thì lên bậc. Các bản ghi nhầm 1.1.10 đến 1.1.14 đổi thành 1.2.0 đến 1.2.4.",
                "Thêm giờ cập nhật bên cạnh số phiên bản trong Cài đặt và công cụ tools/bump-version.js.",
                "Sửa lỗi vào giữa một đoạn đọc bị bỏ cả đoạn; VieNeu luôn tạo sẵn audio ít nhất 20 giây phía trước."
            ]
        },
        {
            v: "1.2.4", luc: "22/09/2026", ten: "Có tiếng ngay với phụ đề tự động",
            y: [
                "Phụ đề tự động (không dấu câu) từng làm cả nhóm 20 đến 30 giây thành một đoạn đọc, audio xong thì video đã trôi qua.",
                "Đoạn đọc nay tối đa khoảng 8 giây, cắt ở ranh giới dòng và ưu tiên sau dấu câu."
            ],
            bang: { cot: ["Đo thật (DwWu9ZKCSzU, mở ở phút 6)", "Trước", "Nay"], hang: [
                ["Thời gian có giọng Việt", "25 giây vẫn chưa có", "4,4 giây"]
            ] }
        },
        {
            v: "1.2.3", luc: "22/09/2026", ten: "Giọng Việt không còn mất từng quãng",
            y: [
                "Tìm ra nguyên nhân giọng im khoảng 15 giây: bước rút gọn câu bằng Gemini chặn việc tạo audio tới 16 giây.",
                "Giọng mặc định đổi thành VieNeu trên máy; bỏ khối Model VieNeu trong Cài đặt.",
                "Dịch lỗi tạm thời được thử lại sau 2, 4, 8 giây thay vì chờ cố định 15 giây."
            ],
            bang: { cot: ["Đo thật với máy chủ VieNeu", "Kết quả"], hang: [
                ["Tiếng đầu tiên kể từ khi bật", "2,8 giây"],
                ["Số câu đọc được", "22/22, mỗi câu tạo audio đúng 1 lần"]
            ] }
        },
        {
            v: "1.2.2", luc: "22/09/2026", ten: "Sửa lỗi phụ đề rỗng; tự bật lồng tiếng",
            y: [
                'Sửa lỗi "tải được phụ đề nhưng không đọc được nội dung": từ 09/2026 YouTube trả phụ đề rỗng nếu thiếu mã xác thực của trình phát. Thêm cầu nối yt-bridge.js.',
                "Ghi nhớ lựa chọn lồng tiếng để video sau tự bật.",
                "Vá máy chủ VieNeu: bản gốc giữ luồng duy nhất mãi mãi khi phía gọi ngắt giữa chừng, làm các câu sau bị bỏ."
            ],
            bang: { cot: ["Đo thật (bài giảng 22 câu)", "Kết quả"], hang: [
                ["Câu đọc được / bỏ", "22/22 / bỏ 0"],
                ["Trễ tối đa", "1,15 giây"]
            ] }
        },
        {
            v: "1.2.1", luc: "21/09/2026", ten: "Nhịp nói đều; chất lượng giọng VieNeu",
            y: [
                "Giọng mặc định: Mỹ Duyên (chính) và Thái Sơn (thứ hai).",
                "Giọng chậm được tăng tốc đều cho cả video, giữ cao độ; rút khoảng lặng dài trong câu.",
                "Nhiệt độ lấy mẫu 0,6 để độ dài câu ổn định hơn."
            ],
            bang: { cot: ["Đo thật (bài giảng 22 câu, Mỹ Duyên)", "1.2.0", "1.2.1"], hang: [
                ["Độ lệch chuẩn tốc độ giữa các câu", "0,044", "0,006"],
                ["Bước nhảy tốc độ lớn nhất", "0,15", "0,018"],
                ["Trễ so với phụ đề, tối đa", "0,8 giây", "0,3 giây"],
                ["Tốc độ nghe", "khoảng 3,7 âm tiết/giây", "khoảng 4,5 âm tiết/giây"]
            ] }
        },
        {
            v: "1.2.0", luc: "20/09/2026", ten: "Giọng Việt chạy trên máy (VieNeu-TTS)",
            y: [
                "Thêm nguồn giọng miễn phí chạy ngay trên máy, không gửi lời thoại ra ngoài.",
                "25 giọng theo vùng, chọn trong Cài đặt.",
                'Chế độ "Tự động": VieNeu nếu đang chạy, rồi Gemini AI, rồi giọng hệ thống.'
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["Chi phí lồng tiếng", "tính tiền theo phút audio Gemini", "0 đồng với giọng VieNeu"],
                ["Đo trên MacBook Air M3", "", "tạo 5 giây lời nói trong khoảng 1,1 giây"]
            ] }
        },
        {
            v: "1.1.9", luc: "19/09/2026", ten: "Giao diện Cài đặt mới; lồng tiếng nhanh hơn",
            y: [
                "Trang Cài đặt thiết kế lại, tự đổi sáng tối theo máy.",
                "Coursera áp dụng vị trí và lề phụ đề; YouTube có tùy chọn luôn giữ sát lề đã chọn.",
                "Bảng điều khiển hiện chi phí ước tính hôm nay.",
                "Lượt tạo giọng đầu tiên chỉ một câu ngắn để có tiếng sớm nhất."
            ]
        },
        {
            v: "1.1.8", luc: "19/09/2026", ten: "Kiểu phụ đề mặc định; vị trí ổn định",
            y: [
                "Sửa lỗi phụ đề YouTube nhảy lên cao 64 px mỗi khi thanh điều khiển hiện ra.",
                "Sửa lỗi phụ đề kẹt ở vị trí cao sau khi tắt bật dịch hoặc đổi video.",
                "Bỏ hỗ trợ DeepLearning.AI; ảnh và biểu tượng chỉ cho YouTube và Coursera đọc."
            ]
        },
        {
            v: "1.1.7", luc: "18/09/2026", ten: "Phát hiện tiện ích chưa được nạp lại",
            y: [
                "Trang Cài đặt và bảng điều khiển so phiên bản đang chạy với phiên bản trên đĩa, lệch thì hiện nút nạp lại.",
                "Nút Cài đặt trên YouTube báo lỗi rõ ràng khi trang đang dùng kết nối cũ."
            ]
        },
        {
            v: "1.1.6", luc: "18/09/2026", ten: "Hoàn thiện: model, tự động dịch, ngân sách",
            y: [
                "Sửa lỗi model 2.5 Flash-Lite trả 404 với API key mới.",
                "Sửa lỗi Chrome chặn khi mở trang Cài đặt từ YouTube.",
                "Thêm tự động dịch (nhận diện ngôn ngữ ngay trên máy, không tốn phí).",
                "Thêm ngân sách và thống kê chi phí, chỉ lưu trên máy.",
                "Lồng tiếng không bị cắt giữa câu dài."
            ]
        },
        {
            v: "1.1.5", luc: "17/09/2026", ten: "Danh mục model tập trung",
            y: [
                "Mọi tên model Gemini nằm ở một nơi duy nhất (cost-policy.js).",
                "Quyền truy cập model tính theo từng API key, ghi nhớ 3 ngày theo mã băm của key (không lưu key).",
                "Bộ nhớ đệm bản dịch tách theo model."
            ]
        },
        {
            v: "1.1.4", luc: "17/09/2026", ten: "Độ tin cậy khi gọi API",
            y: [
                "API key gửi qua header, không còn nằm trong đường dẫn.",
                "Phân loại lỗi theo tài liệu Gemini: lỗi nào thử lại, lỗi nào dừng hẳn.",
                "Audio được cắt và lưu kho trước khi trả lời, yêu cầu giống hệt nhau chỉ tạo audio một lần."
            ]
        },
        {
            v: "1.1.3", luc: "17/09/2026", ten: "Tối ưu chi phí",
            y: [
                "Bộ nhớ đệm 2 tầng cho bản dịch và audio, sống qua khởi động lại trình duyệt.",
                "4 chế độ sử dụng: Cao cấp, Cân bằng, Tiết kiệm, Chỉ phụ đề.",
                "YouTube chỉ dịch trước quanh vị trí đang xem."
            ]
        },
        {
            v: "1.1.2", luc: "16/09/2026", ten: "Lồng tiếng Việt AI",
            y: [
                "Lồng tiếng đọc theo kịch bản liền mạch dựng từ bản dịch có ngữ cảnh, không đọc từng dòng phụ đề.",
                "Lập kế hoạch ngắt nghỉ, ngữ điệu và thời lượng, khớp nhịp với người nói gốc.",
                "Đồng bộ với video: tạm dừng, tua, đổi tốc độ; hạ nhỏ tiếng gốc mượt."
            ]
        },
        {
            v: "1.1.1", luc: "16/09/2026", ten: "Engine dịch hiểu ngữ cảnh",
            y: [
                "Nhận diện lĩnh vực và giữ ngữ cảnh của cả video (tóm tắt phần trước, thuật ngữ đã thống nhất).",
                "Phát hiện dấu hiệu dịch từng chữ và tự dịch lại, chỉ nhận bản mới nếu tốt hơn.",
                "Trang Cài đặt tự lưu và áp dụng ngay."
            ]
        },
        {
            v: "1.1.0", luc: "15/09/2026", ten: "Phân đoạn và ngắt dòng theo tiếng Việt",
            y: [
                "Phụ đề tiếng Việt được cắt theo cú pháp tiếng Việt thay vì theo số ký tự của câu tiếng Anh.",
                "Thêm danh mục phông chữ có dấu tiếng Việt và kiểu viền chữ dùng chung cho mọi trang."
            ],
            bang: { cot: ["Hạng mục", "Trước", "Nay"], hang: [
                ["Cách ngắt dòng", "theo số ký tự / theo dòng tiếng Anh", "theo mệnh đề và cụm từ tiếng Việt"]
            ] }
        },
        {
            v: "1.0.0 đến 1.0.4", luc: "", ten: "Bản gốc (trước khi Đàm bắt đầu nâng cấp)",
            y: [
                "Dịch phụ đề YouTube và Coursera sang tiếng Việt bằng Google Translate.",
                "Biểu tượng bật tắt dịch ngay trên trình phát, lưu tạm bản dịch để hiện nhanh hơn.",
                "Ghi chú: bản gốc không có nhật ký thay đổi cho từng bản 1.0.1 đến 1.0.4, nên phần này dựng lại từ danh sách tính năng trong README, không phải từ lịch sử thật."
            ]
        }
    ];

    const api = { HISTORY };
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_HISTORY = api;
})(typeof self !== "undefined" ? self : this);
