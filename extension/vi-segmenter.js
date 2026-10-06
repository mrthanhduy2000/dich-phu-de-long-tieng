// ============================================================
// BỘ PHÂN ĐOẠN & NGẮT DÒNG PHỤ ĐỀ TIẾNG VIỆT
//
// Tách rõ hai bài toán:
//   A. segmentGroup(): một câu/nhóm câu đã dịch nên chia thành bao nhiêu
//      cue và cắt ở đâu (quy hoạch động trên toàn câu, có tính thời gian).
//   B. breakLines(): một cue đã có thì hiển thị thành 1-2 dòng thế nào.
//
// Cả hai dùng chung một bộ chấm điểm "khe" (khoảng trắng giữa hai âm tiết):
//   - dấu câu, ranh giới mệnh đề, liên từ mở đầu mệnh đề  -> nên cắt
//   - bên trong từ ghép, thuật ngữ, cụm số + đơn vị, tên riêng,
//     sau giới từ / lượng từ / trợ động từ, trước tiểu từ cuối câu -> không nên cắt
// Độ dài dòng, độ cân bằng, tốc độ đọc và thời lượng chỉ là yếu tố phụ,
// được cộng vào sau khi đã xét cú pháp và ngữ nghĩa.
//
// Bản dịch từ Gemini có thể kèm dấu "¦" đánh dấu chỗ ngắt nghỉ tự nhiên.
// Dấu này chỉ là gợi ý (thưởng nhẹ), thuật toán tất định vẫn quyết định
// cuối cùng và luôn xóa dấu này khỏi văn bản hiển thị.
// Module thuần, không đụng DOM: chạy được trong trình duyệt, service
// worker và Node (để kiểm thử).
// ============================================================
(function (root) {
    "use strict";

    const DEFAULTS = {
        maxLineChars: 42,       // chuẩn phổ biến cho phụ đề tiếng Việt
        maxLines: 2,
        maxCps: 17,             // ký tự/giây người Việt đọc thoải mái
        minCueDuration: 1.0,    // giây
        maxCueDuration: 7.0,
        maxSegmentChars: 110,   // cắt tỉa không gian tìm kiếm của quy hoạch động
        straddleCost: 45        // a cue that starts a sentence and stops before it ends (see segmentTokens)
    };

    const HINT = "¦";

    // ---------------- TỪ ĐIỂN ----------------
    // Từ ghép 2-4 âm tiết thường gặp trong bài giảng, hội thoại và kỹ thuật.
    // Mọi khe nằm TRONG một từ ghép đều bị phạt nặng.
    const COMPOUND_LIST = `
chúng ta|chúng tôi|chúng mình|các bạn|mọi người|người ta|bản thân|cá nhân|riêng tư|điều này|điều đó|bây giờ|hôm nay|ngày mai|hôm qua|hiện nay|hiện tại|tương lai|quá khứ|thời gian|thời điểm|lúc này|trước đây|sau này|gần đây|cuối cùng|đầu tiên|tiếp theo|tiếp tục|bắt đầu|kết thúc|hoàn thành|thực hiện|thực sự|thật sự|thực tế|thật ra|thực ra|quan trọng|cần thiết|cơ bản|đơn giản|phức tạp|dễ dàng|khó khăn|nhanh chóng|chính xác|cụ thể|chi tiết|tổng quan|tổng quát|tổng hợp|ví dụ|chẳng hạn|minh họa|minh hoạ|trường hợp|tình huống|vấn đề|câu hỏi|câu trả lời|trả lời|giải thích|giải quyết|giải pháp|phương pháp|cách thức|phương thức|kỹ thuật|kĩ thuật|công cụ|công nghệ|công việc|công ty|doanh nghiệp|khách hàng|người dùng|người học|người đọc|người xem|người nghe|người nói|sản phẩm|dịch vụ|thị trường|kinh doanh|kinh tế|tài chính|chi phí|lợi nhuận|doanh thu|giá trị|giá cả|mục tiêu|mục đích|kết quả|hiệu quả|hiệu suất|chất lượng|số lượng|khối lượng|kích thước|kích cỡ|độ dài|chiều dài|chiều rộng|chiều cao|chiều sâu|khoảng cách|tốc độ|nhiệt độ|áp suất|năng lượng|sức mạnh|khả năng|năng lực|kinh nghiệm|kiến thức|kỹ năng|kĩ năng|học tập|học sinh|sinh viên|giáo viên|giảng viên|bài giảng|bài học|bài tập|khóa học|khoá học|chương trình|nội dung|thông tin|dữ liệu|tài liệu|tài nguyên|hệ thống|cấu trúc|kiến trúc|thiết kế|phát triển|xây dựng|triển khai|cài đặt|cấu hình|ứng dụng|phần mềm|phần cứng|máy tính|điện thoại|thiết bị|mạng lưới|trang web|trình duyệt|máy chủ|máy khách|cơ sở|nền tảng|mô hình|thuật toán|tham số|biến số|hằng số|hàm số|phương trình|công thức|định nghĩa|định lý|định lí|chứng minh|giả thuyết|giả sử|lý thuyết|lí thuyết|thực hành|thí nghiệm|nghiên cứu|phân tích|đánh giá|so sánh|kiểm tra|kiểm thử|kiểm soát|quản lý|quản lí|điều khiển|xử lý|xử lí|tính toán|đo lường|dự đoán|dự báo|ước lượng|ước tính|tối ưu|tối thiểu|tối đa|cực tiểu|cực đại|trung bình|trung tâm|trung gian|xác suất|thống kê|phân phối|phân loại|phân cụm|hồi quy|huấn luyện|đào tạo|suy luận|suy nghĩ|ý tưởng|ý nghĩa|khái niệm|nguyên tắc|nguyên lý|quy tắc|quy trình|quá trình|giai đoạn|lựa chọn|quyết định|chiến lược|kế hoạch|tổ chức|cộng đồng|xã hội|con người|thế giới|quốc gia|lịch sử|văn hóa|văn hoá|ngôn ngữ|tiếng anh|tiếng việt|tự nhiên|nhân tạo|trí tuệ|thông minh|tự động|thủ công|trực tiếp|gián tiếp|trực tuyến|ngoại tuyến|trực quan|hình ảnh|âm thanh|văn bản|tài khoản|mật khẩu|bảo mật|an toàn|an ninh|rủi ro|sai số|sai lầm|cải thiện|cải tiến|nâng cao|nâng cấp|giảm thiểu|tăng cường|mở rộng|thu hẹp|thay đổi|biến đổi|chuyển đổi|di chuyển|tương tự|tương ứng|tương đương|tương tác|liên quan|liên kết|kết nối|kết hợp|tích hợp|bao gồm|chứa đựng|đại diện|biểu diễn|biểu thị|thể hiện|hiển thị|trình bày|mô tả|giới thiệu|tóm tắt|nhắc lại|ôn tập|lưu ý|chú ý|quan sát|nhận thấy|phát hiện|khám phá|tìm hiểu|tìm kiếm|truy vấn|truy cập|cập nhật|lưu trữ|bộ nhớ|bộ đệm|bộ xử lý|đồ thị|biểu đồ|bảng tính|ma trận|vectơ|véctơ|tọa độ|toạ độ|không gian|đạo hàm|tích phân|giới hạn|hội tụ|phân kỳ|đường thẳng|đường cong|hình học|đại số|giải tích|lũy thừa|luỹ thừa|căn bậc|bình phương|lập phương|số nguyên|số thực|số phức|phân số|phần trăm|tỷ lệ|tỉ lệ|tỷ số|hệ số|độ dốc|đặc trưng|đặc điểm|đặc biệt|thuộc tính|phương sai|độ lệch|sai lệch|thiên lệch|quá khớp|lớp ẩn|đầu vào|đầu ra|trọng số|tích chập|lan truyền|truyền ngược|truyền thẳng|kích hoạt|chuẩn hóa|chuẩn hoá|mất mát|tổn thất|học máy|học sâu|giám sát|tạo sinh|mã nguồn|lập trình|lập trình viên|câu lệnh|vòng lặp|điều kiện|đối tượng|thư viện|tệp tin|thư mục|đường dẫn|dòng lệnh|giao diện|khóa chính|chỉ mục|vâng|được rồi|tất nhiên|dĩ nhiên|có lẽ|chắc chắn|hoàn toàn|tuyệt vời|cảm ơn|xin chào|tạm biệt|không sao|như vậy|như thế|vì vậy|vì thế|tuy nhiên|tuy vậy|mặc dù|bởi vì|cho nên|do đó|do vậy|ngoài ra|hơn nữa|thậm chí|đồng thời|sau đó|trước đó|trong đó|từ đó|nhờ đó|thay vì|xem xét|cân nhắc|nói chuyện|làm việc|hiểu biết|ghi nhớ|lắng nghe|chia sẻ|giúp đỡ|hỗ trợ|sử dụng|áp dụng|tạo ra|đưa ra|chỉ ra|nhận ra|tìm ra|xảy ra|diễn ra|vượt qua|bỏ qua|trải qua|thông qua|dẫn đến|hiểu rõ|nắm vững|nắm bắt|làm quen|tập trung|chú trọng|quan tâm|mong muốn|cố gắng|thử nghiệm|trải nghiệm|kiểm chứng|xác định|xác nhận|xác thực|khởi tạo|khởi động|gỡ lỗi|sửa lỗi|mã hóa|mã hoá|giải mã|tải lên|tải xuống|đăng nhập|đăng ký|đăng kí|đăng xuất|nhất quán|quan điểm|cảm thấy|cảm xúc|hạnh phúc|gia đình|bạn bè|cuộc sống|cuộc sống|thói quen|sức khỏe|sức khoẻ|tập luyện|dinh dưỡng|tâm lý|tâm trí|ý kiến|lý do|lí do|nguyên nhân|hậu quả|ảnh hưởng|tác động|tác dụng|lợi ích|bất lợi|ưu điểm|nhược điểm|điểm mạnh|điểm yếu|phần lớn|phần nhỏ|đa số|thiểu số|tất cả|toàn bộ|một số|một chút|một phần|nhiều hơn|ít hơn|khác nhau|giống nhau|với nhau|cho nhau|lẫn nhau|như nhau|nhau|cùng nhau|gần bằng|gần giống|xấp xỉ|tương đương với|bất cứ|bất kỳ|bất kì|bất cứ lúc nào|bất kỳ lúc nào|bất cứ thứ gì|bất kỳ thứ gì|tủ đồ|tủ quần áo|quần áo|trào lưu|bày biện|ngăn nắp|đồ đạc|đồ dùng|gia dụng|nước dùng|nhãn dán|tích trữ|tiết kiệm được|riêng biệt|độc lập|phụ thuộc|tùy thuộc|dựa trên|dựa vào|nhờ vào|thay thế|loại bỏ|bổ sung|thêm vào|gộp lại|kết luận|tổng kết|nhìn chung|nói chung|nói riêng|cuối kỳ|học kỳ|kỳ thi|bài thi|điểm số|đồ án|dự án|nhóm nghiên cứu|bài báo|tạp chí|hội nghị|toán học|vật lý|vật lí|hóa học|hoá học|sinh học|khoa học|kỹ sư|kĩ sư|chuyên gia|bác sĩ|tiến sĩ|thạc sĩ|giáo sư|chuyên ngành|lĩnh vực|ngành nghề|nghề nghiệp|sự nghiệp|trình độ|cấp độ|mức độ|độ phức tạp|độ chính xác|tối ưu hóa|tối ưu hoá|khái quát hóa|khái quát hoá|trực quan hóa|đơn giản hóa|số hóa|hiện đại hóa|tự động hóa|siêu tham số|tái sử dụng|phi tuyến|tuyến tính|ngẫu nhiên|xác định|liên tục|rời rạc|song song|tuần tự|đồng bộ|bất đồng bộ|hiệu năng|băng thông|độ trễ|thông lượng|tài liệu tham khảo|mã giả|tham chiếu|con trỏ|ngăn xếp|hàng đợi|cây nhị phân|danh sách|từ điển|chuỗi ký tự|kiểu dữ liệu|số học|logic|phép tính|phép cộng|phép trừ|phép nhân|phép chia|dấu bằng|giá trị riêng|vectơ riêng|đạo hàm riêng|tích vô hướng|phân phối chuẩn|độ lệch chuẩn|kỳ vọng|mẫu số|tử số|hàm mũ|hàm log|lô-ga-rít|logarit|đi bộ|chạy bộ|thể dục|ăn uống|ngủ nghỉ|nghỉ ngơi|thư giãn|bình thường|thông thường|thường xuyên|đôi khi|luôn luôn|mãi mãi|ngay lập tức|ngay bây giờ|lần nữa|một lần|nhiều lần|lần đầu|lần cuối|trước tiên|sau cùng|cùng lúc|một lúc|chốc lát|tí nữa|nãy giờ|từ trước|từ đầu|từ đầu đến cuối|đến cuối|cuối cùng thì|phía trước|phía sau|bên trong|bên ngoài|bên trên|bên dưới|ở giữa|xung quanh|gần như|hầu như|hầu hết|chủ yếu|chủ đề|chủ đạo|đề cập|nhắc đến|nói đến|nói về|bàn về|liên quan đến|đề xuất|gợi ý|khuyến nghị|khuyên|lời khuyên|câu chuyện|kinh ngạc|thú vị|hấp dẫn|nhàm chán|khó hiểu|dễ hiểu|rõ ràng|mơ hồ|chính thức|không chính thức|miễn phí|trả phí|mã hóa|điện toán|đám mây|mạng xã hội|trang chủ|trình soạn thảo|bảng điều khiển|biểu mẫu|nút bấm|màn hình|bàn phím|con chuột|tệp|định dạng|phiên bản|bản cập nhật|kho lưu trữ|nhánh|hợp nhất|triển khai|vận hành|bảo trì|giám sát|nhật ký|cảnh báo|lỗi cú pháp|ngoại lệ|biên dịch|thông dịch|trình biên dịch|máy ảo|vùng chứa|dịch vụ vi mô|bề mặt|bao phủ|nhìn lại|trái đất|mặt trời|mặt trăng|không khí|nguồn nước|môi trường|khí hậu|thời tiết|sinh vật|tế bào|phân tử|nguyên tử|điện tử|hạt nhân|trọng lực|lực hấp dẫn|vận tốc|gia tốc|quãng đường|chuyển động|dao động|tần số|bước sóng|ánh sáng|nhiệt lượng|phản ứng|hợp chất|dung dịch|nồng độ|thể tích|diện tích|chu vi|bán kính|đường kính|góc vuông|tam giác|hình tròn|hình vuông|số liệu|bảng biểu|đơn vị|kết cấu|chức năng|tính năng|yêu cầu|điều kiện|trạng thái|sự kiện|thao tác|hành động|hành vi|phản hồi|đầu cuối|ngữ cảnh|ngữ nghĩa|cú pháp|từ vựng|ngữ pháp|câu văn|đoạn văn|bài viết|tiêu đề|chủ đề|danh mục|nhãn dán|gán nhãn|dán nhãn|mẫu số|mẫu thử|lấy mẫu|chọn mẫu|trích xuất|nhúng|véc-tơ|nơ-ron|lượt truyền|độ đo|chỉ số|chỉ tiêu|tiêu chí|tiêu chuẩn|ngưỡng|sai khác|chênh lệch|khác biệt|điểm chung|điểm khác|phạm vi|quy mô|mở đầu|phần kết|phần tiếp theo|phần này|nhiễu loạn|chính quy|chính quy hóa|điều chuẩn|hiệu chỉnh|tinh chỉnh|đóng băng|tăng tốc|giảm tốc|tăng lên|giảm xuống|đi lên|đi xuống|dừng lại|quay lại|trở lại|lặp lại|bắt kịp|theo dõi|theo kịp|ghi lại|lưu lại|chạy thử|chạy lại|thử lại|làm lại|học lại|đọc lại|viết lại|nói lại|hỏi lại|nghe lại|xem lại|kiểm tra lại|tìm lại|nhớ lại|đi tiếp|làm tiếp|học tiếp|hướng dẫn|chỉ dẫn|dẫn dắt|lãnh đạo|quản trị|điều hành|vận dụng|thực thi|thi hành|cho phép|ngăn chặn|bảo vệ|phòng tránh|tránh khỏi|khắc phục|xử lý sự cố|sự cố|trục trặc|hỏng hóc|tốn kém|tiết kiệm|đắt đỏ|rẻ tiền|nhanh hơn|chậm hơn|tốt hơn|kém hơn|lớn hơn|nhỏ hơn|cao hơn|thấp hơn|dài hơn|ngắn hơn|mạnh mẽ|yếu ớt|ổn định|linh hoạt|hiệu quả hơn|tiện lợi|thuận tiện|phù hợp|thích hợp|hợp lý|hợp lí|vô lý|chính đáng|đúng đắn|sai sót|thiếu sót|đầy đủ|thiếu hụt|dư thừa|cân bằng|mất cân bằng|đồng đều|ngẫu nhiên hóa|xáo trộn|sắp xếp|trộn lẫn|chia nhỏ|gộp chung|tách biệt|tách rời|nối tiếp|kế tiếp|liền kề|lân cận|xa xôi|gần gũi|thân thiện|quen thuộc|xa lạ|mới mẻ|cũ kỹ|hiện đại|truyền thống|cổ điển|tiên tiến|lạc hậu|phổ biến|hiếm hoi|đặc thù|chung chung|riêng lẻ|tổng thể|cục bộ|toàn cục|toàn cầu|địa phương|quốc tế|trong nước|nước ngoài|dữ kiện|tình hình|bối cảnh|hoàn cảnh|trải nghiệm|câu chuyện|ví dụ minh họa|ví dụ cụ thể|vượt quá|vượt ra|quá mức|quá tải|quá nhiều|quá ít|đây là|đó là|đấy là|ấy là|chính là|tức là|nghĩa là|gọi là|những gì|điều gì|cái gì|là gì|thế nào|như thế nào|bao nhiêu|tại sao|vì sao|làm sao|ở đâu|khi nào|lúc nào|bao giờ|ai đó|cái đó|điều đó|việc đó|lúc đó|khi đó|ở đó|chỗ đó
`;

    // Thuật ngữ nhiều âm tiết (tiếng Việt) phải giữ nguyên khối.
    const TERM_LIST = `
mạng nơ-ron tích chập|mạng nơ ron tích chập|mạng nơron tích chập|mạng nơ-ron hồi quy|mạng nơ-ron|mạng nơ ron|mạng nơron|mạng thần kinh|nơ ron|học có giám sát|học không giám sát|học bán giám sát|học tự giám sát|học tăng cường|học chuyển giao|học máy|học sâu|hàm mất mát|hàm chi phí|hàm kích hoạt|hàm mục tiêu|tốc độ học|lan truyền ngược|lan truyền thuận|lan truyền tiến|giảm độ dốc|hạ độ dốc|cơ chế chú ý|cơ chế tự chú ý|mô hình ngôn ngữ lớn|mô hình ngôn ngữ|mô hình nền tảng|xử lý ngôn ngữ tự nhiên|ngôn ngữ tự nhiên|thị giác máy tính|trí tuệ nhân tạo tạo sinh|trí tuệ nhân tạo|hồi quy tuyến tính|hồi quy logistic|hồi quy lô-gi-stic|cây quyết định|rừng ngẫu nhiên|máy vectơ hỗ trợ|tập huấn luyện|tập kiểm tra|tập kiểm thử|tập xác thực|tập dữ liệu|bộ dữ liệu|dữ liệu huấn luyện|dữ liệu kiểm tra|dữ liệu đầu vào|dữ liệu đầu ra|dữ liệu thô|kích thước lô|chuẩn hóa theo lô|chuẩn hoá theo lô|ma trận nhầm lẫn|giá trị riêng|vectơ riêng|đạo hàm riêng|tích vô hướng|phân phối chuẩn|độ lệch chuẩn|xác suất có điều kiện|cơ sở dữ liệu|hệ điều hành|ngôn ngữ lập trình|giao diện lập trình ứng dụng|điện toán đám mây|mạng đối nghịch tạo sinh|mô hình tạo sinh|bộ mã hóa|bộ mã hoá|bộ giải mã|cửa sổ ngữ cảnh|kỹ thuật prompt|kỹ thuật đặc trưng|trích xuất đặc trưng|lớp ẩn|lớp đầu vào|lớp đầu ra|lớp tích chập|lớp gộp|lớp kết nối đầy đủ|kết nối đầy đủ|siêu tham số|hệ số học|tốc độ hội tụ|điểm cực tiểu|cực tiểu cục bộ|cực tiểu toàn cục|bùng nổ gradient|biến mất gradient|triệt tiêu gradient|dữ liệu lớn|khoa học dữ liệu|kỹ sư dữ liệu|phân tích dữ liệu|trực quan hóa dữ liệu|tiền xử lý|hậu xử lý|thời gian thực|mã nguồn mở|nguồn mở|dòng lệnh|kiểm thử đơn vị|tích hợp liên tục|triển khai liên tục|cân bằng tải|độ phức tạp thời gian|độ phức tạp|quy hoạch động|tìm kiếm nhị phân|cây nhị phân|danh sách liên kết|bảng băm|đồ thị có hướng|phép nhân ma trận|ma trận đơn vị|ma trận chuyển vị|định thức|không gian vectơ|không gian đặc trưng|phép biến đổi|biến đổi fourier|chuỗi thời gian|phân phối xác suất|biến ngẫu nhiên|kỳ vọng toán học|luật số lớn|định lý giới hạn trung tâm|khoảng tin cậy|kiểm định giả thuyết|giá trị p|mức ý nghĩa
`;

    // Liên từ / cụm mở đầu mệnh đề: THƯỞNG khi cắt ngay TRƯỚC chúng.
    const OPENERS = {
        // mệnh đề nhượng bộ, điều kiện, nguyên nhân, thời gian, kết quả
        "nhưng": 30, "nhưng mà": 30, "tuy nhiên": 32, "tuy vậy": 30, "song": 18,
        "mặc dù": 30, "dù": 24, "dù cho": 28, "dẫu": 22, "dẫu cho": 26, "cho dù": 28,
        "nếu": 30, "nếu như": 30, "giả sử": 26, "giả như": 26, "trừ khi": 26, "miễn là": 26,
        "khi": 28, "khi mà": 28, "trong khi": 30, "sau khi": 30, "trước khi": 30,
        "cho đến khi": 30, "cho tới khi": 30, "ngay khi": 30, "ngay sau khi": 30, "ngay cả khi": 30, "ngay cả": 20, "ngay lúc": 24, "đến khi": 26, "lúc": 12, "mỗi khi": 28, "một khi": 28,
        "vì": 26, "bởi vì": 30, "bởi lẽ": 28, "tại vì": 28, "do": 16, "nhờ": 12,
        "cho nên": 30, "vì vậy": 32, "vì thế": 32, "do đó": 32, "do vậy": 32, "bởi vậy": 30,
        "thế nên": 30, "vậy nên": 30, "thành ra": 24, "nên": 16,
        "để": 22, "để mà": 22, "nhằm": 20, "nhằm mục đích": 22,
        "nghĩa là": 22, "tức là": 22, "có nghĩa là": 24, "ví dụ": 22, "ví dụ như": 22,
        "chẳng hạn": 20, "chẳng hạn như": 22, "đặc biệt là": 22,
        "ngoài ra": 28, "hơn nữa": 28, "thêm vào đó": 28, "bên cạnh đó": 28, "thậm chí": 20,
        "đồng thời": 24, "sau đó": 26, "trước đó": 24, "cuối cùng": 24, "đầu tiên": 20,
        "tiếp theo": 22, "thứ nhất": 20, "thứ hai": 16, "trong đó": 24, "từ đó": 22,
        "nhờ đó": 24, "nhờ vậy": 24, "như vậy": 22, "như thế": 18, "thay vì": 22,
        "trái lại": 26, "ngược lại": 24, "mặt khác": 28, "thực ra": 20, "thật ra": 20,
        "rồi": 12, "còn": 10, "thì": 18, "mà": 12, "rằng": 14, "là": 6,
        "và": 16, "hoặc": 16, "hoặc là": 18, "hay": 8, "hay là": 16, "cũng như": 14,
        "giống như": 16, "như": 10, "kể cả": 16, "bao gồm": 12,
        // cụm giới từ (ranh giới cụm từ, thưởng nhẹ)
        "trong": 9, "với": 9, "cho": 7, "về": 8, "từ": 8, "đến": 6, "tới": 6, "bằng": 8,
        "theo": 9, "tại": 9, "ở": 8, "trên": 8, "dưới": 8, "giữa": 8, "qua": 6, "vào": 5,
        "của": 3, "bởi": 8, "sau": 8, "trước": 8, "sau mỗi": 10, "trước mỗi": 10, "đối với": 14, "so với": 14, "dựa trên": 12, "dựa vào": 12,
        "thông qua": 10, "liên quan đến": 10
    };

    // Từ "đòi" đi cùng từ PHÍA SAU: không được đứng cuối dòng/cue.
    // (giới từ, lượng từ, loại từ, trợ động từ, phó từ đứng trước, liên từ...)
    const LEFT_BIND = {
        "của": 80, "các": 75, "những": 75, "mọi": 70, "mỗi": 70, "từng": 45, "một": 60, "vài": 60,
        "mấy": 55, "sự": 80, "việc": 70, "cuộc": 70, "nỗi": 70, "niềm": 70, "cái": 55, "chiếc": 60,
        "con": 35, "hãy": 80, "đừng": 75, "chớ": 70, "rất": 70, "khá": 55, "hơi": 55,
        "đã": 60, "đang": 65, "sẽ": 65, "sắp": 60, "vừa": 45, "mới": 25, "đều": 55, "cũng": 55,
        "vẫn": 55, "còn": 25, "chỉ": 55, "luôn": 30, "thường": 30, "hay": 30, "chưa": 35,
        "không": 35, "chẳng": 55, "chả": 50, "là": 60, "và": 70, "hoặc": 70, "với": 65, "cho": 50,
        "về": 55, "từ": 60, "đến": 55, "tới": 50, "trong": 70, "ngoài": 50, "trên": 60, "dưới": 60,
        "giữa": 65, "bằng": 55, "theo": 55, "tại": 65, "ở": 60, "qua": 25, "như": 45, "để": 60,
        "khi": 60, "nếu": 65, "vì": 60, "do": 45, "bởi": 55, "rằng": 65, "mà": 45, "thì": 45,
        "nhưng": 55, "tuy": 60, "dù": 55, "nên": 30, "phải": 30, "cần": 40, "muốn": 40,
        "bị": 55, "nhằm": 55, "gồm": 55, "thuộc": 45, "cùng": 30, "lẫn": 30, "nhiều": 20, "ít": 20,
        "số": 40, "thứ": 45, "người": 20, "nhà": 25, "bộ": 40, "tập": 15, "hàm": 25, "mạng": 20,
        "siêu": 75, "đa": 45, "tái": 60, "phi": 45, "bất": 45, "chính": 25, "hơn": 0, "quá": 25,
        "được": 45, "có thể": 65, "có lẽ": 25, "đối với": 60, "so với": 55, "thay vì": 55,
        "sau": 40, "trước": 35, "ngay": 30, "trong khi": 55, "sau khi": 60, "trước khi": 60, "cho đến khi": 60, "bởi vì": 60,
        "tức là": 55, "nghĩa là": 55, "chính là": 55, "gọi là": 50, "được gọi là": 55, "như là": 50,
        "ví dụ như": 50, "chẳng hạn như": 55, "bao gồm": 50, "liên quan đến": 50, "dựa trên": 50,
        "dựa vào": 50, "thông qua": 45, "cũng như": 45, "nhờ vào": 45, "tùy thuộc vào": 50,
        "phụ thuộc vào": 50, "mặc dù": 60, "tuy nhiên": 10, "vì vậy": 20, "do đó": 20,
        "một số": 55, "tất cả": 20, "toàn bộ": 30, "hầu hết": 45, "phần lớn": 30,
        "chúng ta hãy": 80, "hãy cùng": 70, "cùng nhau": 0
    };

    // Từ "đòi" đi cùng từ PHÍA TRƯỚC: không được đứng đầu dòng/cue.
    const RIGHT_BIND = {
        "nhé": 80, "nhỉ": 80, "nha": 75, "ạ": 85, "à": 70, "ư": 70, "hả": 70, "chứ": 55, "cơ": 40,
        "kìa": 60, "đấy": 60, "này": 60, "kia": 55, "ấy": 60, "nọ": 55, "đó": 45, "đây": 35,
        "hơn": 50, "nhất": 60, "lắm": 60, "nữa": 55, "nhau": 70, "xong": 45, "hết": 20,
        "hóa": 90, "hoá": 90, "ra": 45, "lại": 20, "thôi": 40, "vậy": 30, "đâu": 45, "rồi": 20,
        "được": 0, "quá": 0, "không": 0, "chưa": 0, "sao": 0
    };

    // Danh từ chỉ mốc/đánh số: "tháng 3", "phiên bản 3.5", "bước 1".
    const REF_NOUNS = new Set([
        "tháng", "năm", "ngày", "tuần", "quý", "chương", "bước", "phần", "bài", "trang", "hình",
        "bảng", "số", "lớp", "mục", "câu", "dòng", "cột", "hàng", "cấp", "thứ", "giai đoạn",
        "phiên bản", "version", "tập", "lần", "vòng", "epoch", "level", "phòng", "tầng"
    ]);

    const UNITS = new Set([
        "%", "phần trăm", "km", "m", "cm", "mm", "nm", "kg", "g", "mg", "gb", "mb", "kb", "tb", "pb",
        "ghz", "mhz", "hz", "ms", "s", "giây", "phút", "giờ", "ngày", "tuần", "tháng", "năm",
        "thập kỷ", "thế kỷ", "lần", "người", "lớp", "tầng", "chiều", "đô", "đô la", "usd", "đồng",
        "vnd", "triệu", "tỷ", "tỉ", "nghìn", "ngàn", "trăm", "mươi", "chục", "độ", "mét", "lít",
        "byte", "bit", "token", "tham số", "mẫu", "điểm", "bước", "epoch", "vòng", "phần", "cái",
        "con", "chiếc", "trang", "dòng", "cột", "hàng", "ô", "kw", "w", "v", "a", "mah", "fps",
        "px", "dpi", "bpm", "kcal", "calo", "°c", "°f", "x", "lõi", "luồng", "gpu", "cpu"
    ]);

    const NUMBER_WORDS = new Set([
        "một", "hai", "ba", "bốn", "tư", "năm", "lăm", "sáu", "bảy", "bẩy", "tám", "chín", "mười",
        "mươi", "trăm", "nghìn", "ngàn", "triệu", "tỷ", "tỉ", "lẻ", "linh", "rưỡi", "nửa", "chục"
    ]);

    const PRONOUNS = new Set([
        "tôi", "ta", "mình", "tớ", "bạn", "anh", "chị", "em", "họ", "nó", "ông", "bà", "cô", "chú",
        "chúng ta", "chúng tôi", "các bạn", "mọi người", "người ta"
    ]);

    // Hư từ: ranh giới cụm từ thường nằm cạnh chúng. Khe giữa hai THỰC từ
    // (không phải hư từ) nhiều khả năng nằm trong một từ ghép hay cụm chặt.
    const FUNCTION_WORDS = new Set([
        ...Object.keys(LEFT_BIND).filter(k => !k.includes(" ")),
        ...Object.keys(RIGHT_BIND),
        ...Object.keys(OPENERS).filter(k => !k.includes(" ")),
        ...[...PRONOUNS].filter(k => !k.includes(" ")),
        "có", "đây", "gì", "nào", "ai", "đâu", "bao", "sao", "thế"
    ]);

    const MATH_OPS = new Set(["=", "+", "-", "−", "×", "*", "/", "÷", "<", ">", "≤", "≥", "≈", "≠", "^", "±"]);
    const DASHES = new Set(["–", "—", "-", "--"]);

    function buildPhraseSet(src) {
        const set = new Set();
        let maxLen = 1;
        for (const raw of src.split("|")) {
            const p = raw.trim().toLowerCase().replace(/\s+/g, " ");
            if (!p) continue;
            set.add(p);
            maxLen = Math.max(maxLen, p.split(" ").length);
        }
        return { set, maxLen };
    }

    const COMPOUNDS = buildPhraseSet(COMPOUND_LIST);
    // Từ ghép mà bản thân vẫn "đòi" từ phía sau (không được treo dù đã trọn từ)
    const LEFT_BIND_PHRASE_END = new Set(["thể", "khi", "vì", "với", "là", "như", "đến", "vào", "trên", "gồm", "hạn", "dụ", "nhưng", "dù"]);
    const TERMS = buildPhraseSet(TERM_LIST);
    const OPENER_MAX = Math.max(...Object.keys(OPENERS).map(k => k.split(" ").length));
    const LEFT_MAX = Math.max(...Object.keys(LEFT_BIND).map(k => k.split(" ").length));
    // multi-word openers / left binders, built once instead of on every analyze()
    const OPENER_PHRASES = new Set(Object.keys(OPENERS).filter(k => k.includes(" ")));
    const LEFT_PHRASES = new Set(Object.keys(LEFT_BIND).filter(k => k.includes(" ")));

    // ---------------- TIỆN ÍCH CHUỖI ----------------
    const TOKEN_RE = /(?:\[\[\s*(?:\\?_){2}\s*T\s*\d+\s*(?:\\?_){2}\s*\]\]|(?:\\?_){2}T\s*\d+(?:\\?_){2}|Z\s*Q\s*\d+\s*Q\s*Z)/gi;

    // Làm sạch bản dịch trước khi hiển thị: xóa mã giữ chỗ bị sót, dấu gợi ý,
    // markdown, ngoặc kép bao ngoài, khoảng trắng thừa trước dấu câu.
    function cleanText(text, opts = {}) {
        let t = String(text == null ? "" : text);
        t = t.replace(/\r/g, "");
        if (!opts.keepHints) t = t.split(HINT).join(" ");
        t = t.replace(TOKEN_RE, " ");
        t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)[*_](\S.*?\S|\S)[*_](?=\s|$)/g, "$1$2");
        t = t.replace(/^\s*(?:bản dịch(?: tiếng việt)?|dịch|translation)\s*:\s*/i, "");
        t = t.replace(/[ \t ]+/g, " ");
        if (!opts.keepNewlines) t = t.replace(/\s*\n\s*/g, " ");
        t = t.trim();
        // Ngoặc kép bao toàn bộ do mô hình tự thêm (prompt đặt câu trong ngoặc kép)
        const m = t.match(/^["“”„«](.*)["“”»]$/s);
        if (m && !/["“”«»]/.test(m[1])) t = m[1].trim();
        t = t.replace(/\s+([,.;:!?…%)\]}»”])/g, "$1").replace(/([(\[{«“])\s+/g, "$1");
        if (opts.keepHints) t = t.replace(/\s*¦\s*/g, ` ${HINT} `).replace(/(?:\s*¦\s*){2,}/g, ` ${HINT} `).replace(/^\s*¦\s*|\s*¦\s*$/g, "");
        return t.replace(/ {2,}/g, " ").trim();
    }

    function stripTones(s) {
        return s.normalize("NFD")
            .replace(/[̣̀́̃̉]/g, "")
            .normalize("NFC");
    }

    const VI_SYLLABLE = /^(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdđghklmnprstvx])?[aăâeêioôơuưy]{1,3}(?:ch|ng|nh|[cmnpt])?$/;
    const VI_GI = /^gi(?:ch|ng|nh|[cmnpt])?$/;

    // Memoised: the planner and the segmenter ask about the same few thousand syllables over and
    // over, and the NFD/NFC round trip in stripTones was the top self-time in a dubbing profile.
    const sylMemo = new Map();
    function isVietSyllable(core) {
        if (!core) return false;
        let r = sylMemo.get(core);
        if (r !== undefined) return r;
        const s = stripTones(core.toLowerCase());
        r = VI_SYLLABLE.test(s) || VI_GI.test(s);
        if (sylMemo.size >= 20000) sylMemo.clear();
        sylMemo.set(core, r);
        return r;
    }

    function isVietWord(core) {
        if (!core) return false;
        return core.split("-").every(isVietSyllable);
    }

    // ---------------- TÁCH TOKEN ----------------
    const LEAD_RE = /^[([{"“‘'«¿¡]+/;
    const TRAIL_RE = /[.,;:!?…)\]}"”’'»]+$/;

    function makeToken(raw, idx, prevTrail) {
        const leadM = raw.match(LEAD_RE);
        const lead = leadM ? leadM[0] : "";
        let rest = raw.slice(lead.length);
        const trailM = rest.match(TRAIL_RE);
        let trail = trailM ? trailM[0] : "";
        let core = rest.slice(0, rest.length - trail.length);
        if (!core && trail) { core = trail; trail = ""; }
        const lower = core.toLowerCase();
        const isNumber = /^[+\-−]?\d[\d.,]*(?:%|[a-zA-Z]{0,3})?$/.test(core) || /^\d+(?:[.,]\d+)?x$/i.test(core);
        const hasLetter = /\p{L}/u.test(core);
        const isPunct = !hasLetter && !/\d/.test(core);
        const sentenceInitial = idx === 0 || /[.!?…]$/.test(prevTrail || "");
        const upper = /^\p{Lu}/u.test(core);
        const acronym = /^[\p{Lu}\d][\p{Lu}\d.\-+]+$/u.test(core) && /\p{Lu}.*\p{Lu}|\p{Lu}\d|\d\p{Lu}/u.test(core);
        const viWord = hasLetter && isVietWord(lower);
        const foreign = hasLetter && (!viWord || acronym || /[\p{Lu}].*[\p{Lu}]/u.test(core.slice(1)) || /[_()]/.test(core));
        return {
            raw, lead, trail, core: lower, len: raw.length,
            isNumber, isNumberWord: NUMBER_WORDS.has(lower), isPunct,
            isMath: MATH_OPS.has(core), isDash: DASHES.has(core),
            foreign, nameLike: upper && !sentenceInitial,
            hint: false
        };
    }

    function tokenize(text, opts = {}) {
        const cleaned = cleanText(text, { keepHints: true, keepNewlines: false });
        const parts = cleaned.split(/\s+/).filter(Boolean);
        const tokens = [];
        let pendingHint = false;
        for (const p of parts) {
            if (p === HINT) { pendingHint = tokens.length > 0; continue; }
            const pieces = p.split(HINT);
            for (let k = 0; k < pieces.length; k++) {
                if (k > 0) pendingHint = tokens.length > 0;
                if (!pieces[k]) continue;
                const prev = tokens[tokens.length - 1];
                const t = makeToken(pieces[k], tokens.length, prev ? prev.trail : "");
                t.hint = pendingHint;
                pendingHint = false;
                tokens.push(t);
            }
        }
        return tokens;
    }

    function joinTokens(tokens, a = 0, b = tokens.length) {
        let s = "";
        for (let i = a; i < b; i++) s += (i > a ? " " : "") + tokens[i].raw;
        return s;
    }

    // ---------------- PHÂN TÍCH KHE ----------------
    // gap[g] = chi phí khi cắt TRƯỚC token g (1 <= g < n). Âm = nên cắt.
    function phraseAt(tokens, i, len) {
        if (i < 0 || i + len > tokens.length) return null;
        let s = "";
        for (let k = 0; k < len; k++) {
            const t = tokens[i + k];
            // Cụm từ không được vắt qua dấu câu (trừ token cuối)
            if (k < len - 1 && t.trail) return null;
            if (k > 0 && t.lead) return null;
            s += (k ? " " : "") + t.core;
        }
        return s;
    }

    // Đánh dấu mọi khe nằm trong một cụm của từ điển; ghi lại token kết thúc
    // cụm (wordEnd) để biết "quá" trong "vượt quá" là hết từ, không phải phó từ.
    // Same result as trying phraseAt for every length from longest down (longest match wins), but
    // each phrase is grown one token at a time instead of rebuilt from scratch for every length.
    function markSpans(tokens, inside, phraseSet, maxLen, cost, wordEnd) {
        const n = tokens.length;
        for (let i = 0; i < n; i++) {
            const top = Math.min(maxLen, n - i);
            let s = tokens[i].core, best = 0;
            for (let len = 2; len <= top; len++) {
                // a phrase never spans punctuation: same rule as phraseAt
                if (tokens[i + len - 2].trail || tokens[i + len - 1].lead) break;
                s += " " + tokens[i + len - 1].core;
                if (phraseSet.has(s)) best = len;
            }
            if (best) {
                for (let g = i + 1; g < i + best; g++) inside[g] = Math.max(inside[g], cost);
                if (wordEnd) wordEnd[i + best - 1] = true;
            }
        }
    }

    function analyze(tokens, opts = {}) {
        const n = tokens.length;
        const inside = new Array(n + 1).fill(0);   // phạt vì nằm trong một khối liền
        const gap = new Array(n + 1).fill(0);
        const userTerms = opts.keepTerms || [];
        const wordEnd = new Array(n).fill(false);

        markSpans(tokens, inside, COMPOUNDS.set, COMPOUNDS.maxLen, 85, wordEnd);
        markSpans(tokens, inside, TERMS.set, TERMS.maxLen, 100, wordEnd);

        // Cụm liên từ/giới từ nhiều âm tiết cũng không được tách đôi
        markSpans(tokens, inside, OPENER_PHRASES, OPENER_MAX, 85);
        markSpans(tokens, inside, LEFT_PHRASES, LEFT_MAX, 80);

        // Thuật ngữ do người dùng/từ điển cung cấp (dạng hiển thị cuối cùng)
        if (userTerms.length) {
            const termSet = new Set();
            let tMax = 1;
            for (const term of userTerms) {
                const words = String(term).toLowerCase().trim().split(/\s+/);
                if (words.length < 2 || words.length > 6) continue;
                termSet.add(words.join(" "));
                tMax = Math.max(tMax, words.length);
            }
            if (termSet.size) markSpans(tokens, inside, termSet, tMax, 110);
        }

        // Chuỗi từ nước ngoài / tên riêng liên tiếp: "gradient descent", "Claude Code", "Hà Nội"
        let runStart = -1;
        const closeRun = (end) => {
            if (runStart >= 0 && end - runStart >= 2) {
                const cost = end - runStart <= 5 ? 80 : 30;
                for (let g = runStart + 1; g < end; g++) inside[g] = Math.max(inside[g], cost);
            }
            runStart = -1;
        };
        for (let i = 0; i < n; i++) {
            const t = tokens[i];
            const isRunTok = (t.foreign || t.nameLike) && !t.isNumber;
            const prev = tokens[i - 1];
            if (isRunTok && runStart >= 0 && prev && !prev.trail && !t.lead) continue;
            closeRun(i);
            if (isRunTok) runStart = i;
        }
        closeRun(n);

        // Ngoặc đơn / ngoặc kép ngắn: giữ nguyên khối
        for (let i = 0; i < n; i++) {
            if (!tokens[i].lead) continue;
            let chars = 0;
            for (let j = i; j < n && j < i + 8; j++) {
                chars += tokens[j].len + 1;
                if (tokens[j].trail && /[)\]}"”’»]/.test(tokens[j].trail)) {
                    if (chars <= 36) for (let g = i + 1; g <= j; g++) inside[g] = Math.max(inside[g], 50);
                    break;
                }
            }
        }

        for (let g = 1; g < n; g++) {
            const A = tokens[g - 1];
            const B = tokens[g];
            const C = tokens[g + 1];
            let c = 0;
            const tr = A.trail;
            const endSentence = /[.!?…]/.test(tr);
            const strong = /[;:]/.test(tr);
            const comma = /,/.test(tr);
            const closeQ = /[)\]}"”’»]/.test(tr);

            if (endSentence) c -= 70;
            else if (strong) c -= 50;
            else if (comma) c -= 38;
            else if (closeQ) c -= 18;
            if (!tr && B.lead) c -= 12;
            if (A.isDash) c -= 25;
            if (B.isDash) c += 10;
            if (B.hint) c -= 18;

            // Liên từ mở mệnh đề ngay sau khe (khớp cụm dài nhất)
            let opener = 0;
            for (let len = Math.min(OPENER_MAX, n - g); len >= 1; len--) {
                const p = phraseAt(tokens, g, len);
                if (p && OPENERS[p] !== undefined) { opener = OPENERS[p]; break; }
            }

            if (!tr && !A.isDash && !A.isPunct) {
                c += 10; // chi phí nền: hai từ không dấu câu thường cùng một cụm
                const contentPair = !FUNCTION_WORDS.has(A.core) && !FUNCTION_WORDS.has(B.core) &&
                    !A.isNumber && !B.isNumber && !A.foreign && !B.foreign;
                if (contentPair) c += 14;
                c -= opener;

                // Từ bên trái đòi đi với từ sau (xét cả cụm nhiều âm tiết kết thúc tại A)
                let lb = 0;
                for (let len = Math.min(LEFT_MAX, g); len >= 1; len--) {
                    const p = phraseAt(tokens, g - len, len);
                    if (p && LEFT_BIND[p] !== undefined) { lb = LEFT_BIND[p]; break; }
                }
                if (A.core === "quá" && B && !B.isPunct) lb = 35;
                // Âm tiết cuối của từ ghép ("vượt quá", "đi qua", "tạo ra") đã trọn nghĩa
                if (wordEnd[g - 1] && lb > 0 && !LEFT_BIND_PHRASE_END.has(A.core)) lb = 0;
                c += lb;

                // Từ bên phải đòi đi với từ trước
                let rb = RIGHT_BIND[B.core] || 0;
                const bFinal = !!B.trail || !C;
                if (B.core === "được" && bFinal) rb = 55;
                if (B.core === "quá" && bFinal) rb = 50;
                if ((B.core === "không" || B.core === "chưa" || B.core === "sao") && /\?/.test(B.trail)) rb = 70;
                if (B.core === "vậy" && bFinal) rb = 60;
                if (B.core === "rồi" && bFinal) rb = 55;
                if (B.core === "đó" && !bFinal && opener) rb = 0;
                if (B.core === "đây" && A.core === "ở") rb = 60;
                if (opener >= 12 && rb > 0 && !bFinal) rb = Math.min(rb, 10);
                c += rb;

                // Số + đơn vị / danh từ đếm: "175 tỷ", "3 lớp", "hai lớp"
                if (A.isNumber) {
                    const unit2 = C ? `${B.core} ${C.core}` : "";
                    if (UNITS.has(B.core) || UNITS.has(unit2) || B.isNumber || B.isNumberWord) c += 85;
                    else if (!opener) c += 55;
                } else if (A.isNumberWord && (B.isNumberWord || UNITS.has(B.core)) && !opener) {
                    c += 50;
                }
                if (B.isNumber && REF_NOUNS.has(A.core)) c += 60;
                if (B.isNumber && g >= 2 && REF_NOUNS.has(`${tokens[g - 2].core} ${A.core}`)) c += 60;

                // Toán tử toán học đứng cạnh: "x = 2", "a + b"
                if (A.isMath || B.isMath) c += 70;

                // Danh từ + thuật ngữ nước ngoài: "hàm ReLU", "mô hình GPT-4"
                if ((B.foreign || B.nameLike) && !A.foreign && !A.nameLike && !opener) c += 18;
            } else if (opener) {
                c -= Math.round(opener * 0.4);
            }

            // Từ cuối cụm bị treo sang dòng mới: "cá nhân | tôi,"
            if (B.trail && /[,.;:!?…]/.test(B.trail) && !opener && !B.isPunct) {
                c += 32;
                if (PRONOUNS.has(B.core)) c += 10;
            }
            if (C && C.trail && /[,.;:!?…]/.test(C.trail) && !tr && !opener && PRONOUNS.has(`${B.core} ${C.core}`)) c += 20;

            gap[g] = c + inside[g];
        }
        return { gap, inside };
    }

    // ---------------- B. NGẮT DÒNG ----------------
    function prefixLengths(tokens) {
        const pre = new Array(tokens.length + 1).fill(0);
        for (let i = 0; i < tokens.length; i++) pre[i + 1] = pre[i] + tokens[i].len;
        return pre;
    }

    function spanLen(pre, a, b) {
        return b <= a ? 0 : pre[b] - pre[a] + (b - a - 1);
    }

    // Vượt 1-4 ký tự: phạt vừa (vẫn tốt hơn cắt đôi thuật ngữ hay treo giới từ);
    // vượt nhiều: gần như cấm. Khung phụ đề thực tế chứa được ~50 ký tự/dòng.
    const SOFT_OVER = 4;
    function lineLenCost(len, maxLen) {
        const over = len - maxLen;
        if (over <= 0) return 0;
        if (over <= SOFT_OVER) return over * 18;
        return 300 + over * 30;
    }

    function balanceCost(l1, l2) {
        const short = Math.min(l1, l2);
        const long = Math.max(l1, l2) || 1;
        const r = short / long;
        let c = r < 0.55 ? (0.55 - r) * 90 : 0;
        if (short < 10) c += 20;
        return c;
    }

    // Tìm cách chia tokens[a..b) thành số dòng tối thiểu, chi phí thấp nhất.
    // Trả về { cost, cuts: [chỉ số token bắt đầu mỗi dòng mới] }.
    function bestLineSplit(tokens, gap, pre, a, b, cfg) {
        const maxLen = cfg.maxLineChars;
        const total = spanLen(pre, a, b);
        if (total <= maxLen || b - a <= 1) return { cost: lineLenCost(total, maxLen), cuts: [] };

        let best = null;
        for (let g = a + 1; g < b; g++) {
            const l1 = spanLen(pre, a, g);
            const l2 = spanLen(pre, g, b);
            const cost = gap[g] + lineLenCost(l1, maxLen) + lineLenCost(l2, maxLen) + balanceCost(l1, l2);
            if (!best || cost < best.cost) best = { cost, cuts: [g] };
        }
        const fits = best.cuts.length === 1 &&
            spanLen(pre, a, best.cuts[0]) <= maxLen + SOFT_OVER && spanLen(pre, best.cuts[0], b) <= maxLen + SOFT_OVER;
        if (fits || cfg.maxLines <= 2) return best;
        // Không vừa 2 dòng (chữ rất to / khung hẹp): chia nhiều dòng bằng quy hoạch động
        return multiLineSplit(tokens, gap, pre, a, b, cfg);
    }

    function multiLineSplit(tokens, gap, pre, a, b, cfg) {
        const maxLen = cfg.maxLineChars;
        const n = b - a;
        const dp = new Array(n + 1).fill(Infinity);
        const back = new Array(n + 1).fill(-1);
        dp[0] = 0;
        for (let j = 1; j <= n; j++) {
            for (let i = j - 1; i >= 0; i--) {
                const len = spanLen(pre, a + i, a + j);
                if (len > maxLen * 1.6 && j - i > 1) break;
                const c = dp[i] + lineLenCost(len, maxLen) + 40 + (i > 0 ? gap[a + i] : 0) + (len < 10 && n > 3 ? 20 : 0);
                if (c < dp[j]) { dp[j] = c; back[j] = i; }
            }
        }
        const cuts = [];
        for (let j = n; j > 0; j = back[j]) if (back[j] > 0) cuts.unshift(a + back[j]);
        return { cost: dp[n], cuts };
    }

    function linesFromCuts(tokens, a, b, cuts) {
        const lines = [];
        let s = a;
        for (const c of cuts) { lines.push(joinTokens(tokens, s, c)); s = c; }
        lines.push(joinTokens(tokens, s, b));
        return lines;
    }

    function breakLines(text, options = {}) {
        const cfg = { ...DEFAULTS, ...options };
        const tokens = tokenize(text);
        if (tokens.length === 0) return [];
        const { gap } = analyze(tokens, cfg);
        const pre = prefixLengths(tokens);
        const res = bestLineSplit(tokens, gap, pre, 0, tokens.length, cfg);
        return linesFromCuts(tokens, 0, tokens.length, res.cuts);
    }

    // ---------------- DÒNG THỜI GIAN NGUỒN ----------------
    // Ánh xạ vị trí ký tự (tỷ lệ 0..1) -> thời điểm, dựa trên cue tiếng Anh
    // và thời gian từng từ nếu có (phụ đề tự động YouTube).
    function buildTimeline(srcCues) {
        const pts = [];      // [charPos, time] tăng dần
        const bounds = [];   // ranh giới giữa hai cue nguồn
        let pos = 0;
        const cues = (srcCues || []).filter(c => c && typeof c.start === "number" && typeof c.end === "number");
        cues.forEach((cue, i) => {
            const text = String(cue.text || "").replace(/\s+/g, " ").trim();
            const len = Math.max(1, text.length);
            const c0 = pos;
            const c1 = pos + len;
            const start = cue.start;
            const end = Math.max(cue.end, cue.start + 0.01);
            pts.push([c0, start]);
            if (Array.isArray(cue.words) && cue.words.length > 1) {
                let off = 0;
                for (const w of cue.words) {
                    const wt = String(w.text || "").trim();
                    if (!wt) continue;
                    const at = text.indexOf(wt, off);
                    if (at > 0 && typeof w.t === "number" && w.t > start && w.t < end) {
                        pts.push([c0 + at, w.t]);
                    }
                    if (at >= 0) off = at + wt.length;
                }
            }
            pts.push([c1, end]);
            if (i < cues.length - 1) {
                const next = cues[i + 1];
                const gapSec = Math.max(0, next.start - end);
                bounds.push({
                    pos: c1 + 0.5,
                    end, nextStart: Math.max(next.start, end),
                    pause: gapSec,
                    punct: /[.!?…]["')\]]?$/.test(text) ? 1 : (/[,;:]$/.test(text) ? 0.5 : 0)
                });
            }
            pos = c1 + 1;
        });
        pts.sort((x, y) => x[0] - y[0]);
        for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[i - 1][1]) pts[i][1] = pts[i - 1][1];
        const total = Math.max(1, pos - 1);
        const start = cues.length ? cues[0].start : 0;
        const end = cues.length ? Math.max(...cues.map(c => c.end)) : 0;

        function timeAtPos(p) {
            if (pts.length === 0) return 0;
            if (p <= pts[0][0]) return pts[0][1];
            for (let i = 1; i < pts.length; i++) {
                if (p <= pts[i][0]) {
                    const [x0, t0] = pts[i - 1];
                    const [x1, t1] = pts[i];
                    return x1 === x0 ? t1 : t0 + (t1 - t0) * (p - x0) / (x1 - x0);
                }
            }
            return pts[pts.length - 1][1];
        }

        return {
            total, start, end, bounds,
            timeAt: f => timeAtPos(Math.max(0, Math.min(1, f)) * total),
            posOf: f => Math.max(0, Math.min(1, f)) * total,
            wordTimes: pts.map(p => p[1])
        };
    }

    // ---------------- A. PHÂN ĐOẠN CUE ----------------
    function segmentTokens(tokens, analysis, timeline, cfg) {
        const n = tokens.length;
        const { gap } = analysis;
        const pre = prefixLengths(tokens);
        const totalChars = spanLen(pre, 0, n) || 1;
        const frac = g => (g <= 0 ? 0 : g >= n ? 1 : (pre[g] + g - 0.5) / totalChars);
        const T = g => timeline.timeAt(frac(g));
        const maxCue = cfg.maxLineChars * cfg.maxLines;

        // Chi phí khi cắt cue tại khe g: ngữ pháp + căn theo khoảng lặng của lời nói
        const cutCost = new Array(n + 1).fill(0);
        for (let g = 1; g < n; g++) {
            let c = gap[g] * 1.4;
            const viPunct = /[,.;:!?…]/.test(tokens[g - 1].trail) ? 1 : 0;
            const p = timeline.posOf(frac(g));
            const t = T(g);
            let bestBonus = 0;
            for (const b of timeline.bounds) {
                const dt = Math.min(Math.abs(t - b.end), Math.abs(t - b.nextStart));
                const dc = Math.abs(p - b.pos) / timeline.total;
                if (dt > 0.8 && dc > 0.09) continue;
                const closeness = Math.max(0, 1 - Math.min(dt / 0.8, dc / 0.09));
                const weight = 4 + 16 * Math.min(1, b.pause / 0.6) + 16 * b.punct + (viPunct && b.punct ? 14 : 0);
                bestBonus = Math.max(bestBonus, weight * closeness);
            }
            // Không âm: dấu câu chỉ làm điểm cắt "đỡ tệ", không tự sinh thêm cue
            cutCost[g] = Math.max(0, c - bestBonus + 60);
        }

        // A cue that starts a new sentence but ends before that sentence does ("bền vững về lâu dài. /
        // Văn hóa dùng thẻ tín dụng không phổ biến", then the rest in the next cue) makes the reader
        // hold the tail of one thought and the head of the next at once. Measured on two real cached
        // videos: 38 of 347 cues did this, because with machine-heard captions (no punctuation in the
        // source) the Vietnamese sentence end earned no bonus in cutCost.
        const sentEnd = new Array(n + 1).fill(false);
        for (let g = 1; g < n; g++) sentEnd[g] = /[.!?…]/.test(tokens[g - 1].trail);
        const lineCache = new Map();
        const segCost = (i, j) => {
            const L = spanLen(pre, i, j);
            let c = 15;
            if (L > maxCue && j - i > 1) c += 500 + (L - maxCue) * 20;
            const key = i * 10007 + j;
            let lb = lineCache.get(key);
            if (lb === undefined) {
                lb = bestLineSplit(tokens, gap, pre, i, j, { ...cfg, maxLines: cfg.maxLines }).cost;
                lineCache.set(key, lb);
            }
            // Cue vừa 1 dòng: không tốn gì. Cue 2 dòng: chất lượng điểm ngắt dòng
            // (ngắt ở dấu phẩy ~ 0, ngắt giữa từ ghép rất đắt) cộng đầy đủ.
            if (L > cfg.maxLineChars) c += Math.max(0, lb + 25) * 1.25;
            const d = Math.max(0.01, T(j) - T(i));
            // Phạt theo số ký tự vượt khả năng đọc: không phụ thuộc cách gộp/tách cue
            const excess = L - cfg.maxCps * d;
            if (excess > 0) c += excess * 1.6;
            if (d < cfg.minCueDuration) c += (cfg.minCueDuration - d) * 80;
            if (d > cfg.maxCueDuration) c += (d - cfg.maxCueDuration) * 10;
            if (j < n && !sentEnd[j]) {
                for (let k = i + 1; k < j; k++) if (sentEnd[k]) { c += cfg.straddleCost; break; }
            }
            const whole = i === 0 && j === n;
            if (!whole && L < 16) c += 25;
            if (!whole && j - i <= 2 && L < 12) c += 60;
            return c;
        };

        const dp = new Array(n + 1).fill(Infinity);
        const back = new Array(n + 1).fill(-1);
        dp[0] = 0;
        for (let j = 1; j <= n; j++) {
            for (let i = j - 1; i >= 0; i--) {
                const L = spanLen(pre, i, j);
                if (L > cfg.maxSegmentChars && j - i > 1) break;
                const c = dp[i] + segCost(i, j) + (j < n ? cutCost[j] : 0);
                if (c < dp[j]) { dp[j] = c; back[j] = i; }
            }
        }
        const cuts = [];
        for (let j = n; j > 0; j = back[j]) cuts.unshift(back[j]);
        cuts.push(n);
        // Tính điểm một phương án cắt bất kỳ (phục vụ gỡ lỗi / kiểm thử)
        const scoreCuts = list => {
            const b = [0, ...list, n];
            const parts = [];
            let total = 0;
            for (let k = 0; k < b.length - 1; k++) {
                const sc = segCost(b[k], b[k + 1]);
                const cc = b[k + 1] < n ? cutCost[b[k + 1]] : 0;
                parts.push({ text: joinTokens(tokens, b[k], b[k + 1]), seg: Math.round(sc), cut: Math.round(cc) });
                total += sc + cc;
            }
            return { total: Math.round(total), parts };
        };
        return { cuts: cuts.slice(1, -1), pre, T, frac, scoreCuts };
    }

    // Gán thời gian cho các khe cắt: ưu tiên bám ranh giới cue nguồn gần đó
    // (thường trùng khoảng ngừng của người nói), sau đó đảm bảo thời lượng tối thiểu.
    function timeCuts(cutIdx, T, timeline, cfg, groupStart, groupEnd) {
        const times = [];
        const used = new Set();
        let floor = groupStart;
        for (const g of cutIdx) {
            const t = T(g);
            let best = null;
            for (const b of timeline.bounds) {
                if (used.has(b) || b.end < floor) continue;
                const dt = Math.min(Math.abs(t - b.end), Math.abs(t - b.nextStart));
                if (dt <= 0.5 && (!best || dt < best.dt)) best = { dt, b };
            }
            let cut;
            if (best) { used.add(best.b); cut = { end: best.b.end, start: best.b.nextStart }; }
            else cut = { end: t, start: t };
            // Đơn điệu: điểm cắt sau không được lùi về trước điểm cắt trước
            cut.end = Math.min(Math.max(cut.end, floor), groupEnd);
            cut.start = Math.min(Math.max(cut.start, cut.end), groupEnd);
            floor = cut.start;
            times.push(cut);
        }
        // Cue: [start_k, end_k]
        const cues = [];
        let s = groupStart;
        for (let k = 0; k <= times.length; k++) {
            const e = k < times.length ? times[k].end : groupEnd;
            cues.push({ start: s, end: e });
            if (k < times.length) s = times[k].start;
        }
        // Bảo đảm thứ tự và thời lượng tối thiểu bằng cách dời ranh giới
        for (let k = 0; k < cues.length; k++) {
            if (cues[k].end < cues[k].start) cues[k].end = cues[k].start;
        }
        for (let pass = 0; pass < 2; pass++) {
            for (let k = 0; k < cues.length; k++) {
                const c = cues[k];
                const d = c.end - c.start;
                if (d >= cfg.minCueDuration) continue;
                const need = cfg.minCueDuration - d;
                const next = cues[k + 1];
                const prev = cues[k - 1];
                if (next) {
                    const room = Math.max(0, (next.end - next.start) - cfg.minCueDuration);
                    const take = Math.min(need, room);
                    c.end += take;
                    next.start = Math.max(next.start, c.end);
                }
                const d2 = c.end - c.start;
                if (d2 < cfg.minCueDuration && prev) {
                    const room = Math.max(0, (prev.end - prev.start) - cfg.minCueDuration);
                    const take = Math.min(cfg.minCueDuration - d2, room);
                    c.start -= take;
                    prev.end = Math.min(prev.end, c.start);
                }
            }
        }
        // Lượt cuối: tuyệt đối không chồng lấn, không thời lượng bằng 0
        for (let k = 0; k < cues.length; k++) {
            if (k > 0) cues[k].start = Math.max(cues[k].start, cues[k - 1].end);
            cues[k].end = Math.max(cues[k].end, cues[k].start + 0.05);
        }
        return cues;
    }

    // Đầu vào:
    //   viText   : bản dịch tiếng Việt của cả nhóm (có thể chứa dấu gợi ý ¦)
    //   srcCues  : cue nguồn [{start, end, text, words?}] thuộc nhóm
    //   options  : { maxLineChars, maxCps, keepTerms, maxEnd }
    // Đầu ra: [{ start, end, text, lines }]
    function segmentGroup(viText, srcCues, options = {}) {
        const cfg = { ...DEFAULTS, ...options };
        const tokens = tokenize(viText);
        if (tokens.length === 0) return [];
        const timeline = buildTimeline(srcCues);
        const groupStart = timeline.start;
        let groupEnd = timeline.end;
        const analysis = analyze(tokens, cfg);
        const { cuts, pre, T } = segmentTokens(tokens, analysis, timeline, cfg);
        const bounds = [0, ...cuts, tokens.length];

        // Câu cuối quá dày chữ: cho phép kéo dài vào khoảng lặng phía sau
        if (typeof cfg.maxEnd === "number" && cfg.maxEnd > groupEnd) {
            const lastA = bounds[bounds.length - 2];
            const L = spanLen(pre, lastA, tokens.length);
            const d = groupEnd - T(lastA);
            const want = L / cfg.maxCps;
            if (d < want) groupEnd = Math.min(cfg.maxEnd, T(lastA) + want);
            if (groupEnd - groupStart < cfg.minCueDuration) groupEnd = Math.min(cfg.maxEnd, groupStart + cfg.minCueDuration);
        }

        const times = timeCuts(cuts, T, timeline, cfg, groupStart, groupEnd);
        const out = [];
        for (let k = 0; k < bounds.length - 1; k++) {
            const a = bounds[k];
            const b = bounds[k + 1];
            const split = bestLineSplit(tokens, analysis.gap, pre, a, b, cfg);
            const lines = linesFromCuts(tokens, a, b, split.cuts);
            out.push({
                start: round3(times[k].start),
                end: round3(times[k].end),
                text: lines.join(" "),
                lines
            });
        }
        return out;
    }

    function round3(x) { return Math.round(x * 1000) / 1000; }

    // Kiểm tra không mất / không lặp chữ: nối các cue phải đúng bằng văn bản gốc
    function validateSegments(viText, segs) {
        const norm = s => cleanText(s).replace(/\s+/g, " ").trim();
        const joined = norm(segs.map(s => s.text).join(" "));
        const src = norm(viText);
        if (joined !== src) return { ok: false, reason: "text-mismatch", joined, src };
        for (let i = 0; i < segs.length; i++) {
            const s = segs[i];
            if (!(s.end > s.start)) return { ok: false, reason: `bad-duration@${i}` };
            if (i > 0 && s.start < segs[i - 1].end - 1e-6) return { ok: false, reason: `overlap@${i}` };
            if (s.lines.join(" ") !== s.text) return { ok: false, reason: `lines-mismatch@${i}` };
        }
        return { ok: true };
    }

    // Phương án dự phòng an toàn: không bao giờ làm mất chữ
    function segmentGroupSafe(viText, srcCues, options = {}) {
        try {
            const segs = segmentGroup(viText, srcCues, options);
            const v = validateSegments(viText, segs);
            if (v.ok) return segs;
            console.warn("[CST] Phân đoạn không hợp lệ, dùng phương án dự phòng:", v.reason);
        } catch (e) {
            console.warn("[CST] Lỗi phân đoạn, dùng phương án dự phòng:", e && e.message);
        }
        const clean = cleanText(viText);
        const cues = (srcCues || []).filter(c => typeof c.start === "number");
        const start = cues.length ? cues[0].start : 0;
        const end = cues.length ? Math.max(...cues.map(c => c.end)) : start + 2;
        return [{ start, end: Math.max(end, start + 0.05), text: clean, lines: breakLines(clean, { ...options, maxLines: 4 }) }];
    }

    // Gỡ lỗi: so điểm các phương án cắt, mỗi phương án là danh sách từ đứng TRƯỚC điểm cắt
    function explain(viText, srcCues, alternatives, options = {}) {
        const cfg = { ...DEFAULTS, ...options };
        const tokens = tokenize(viText);
        const timeline = buildTimeline(srcCues);
        const res = segmentTokens(tokens, analyze(tokens, cfg), timeline, cfg);
        const toIdx = words => words.map(w => {
            const i = tokens.findIndex((t, k) => k > 0 && tokens[k - 1].raw === w);
            return i;
        });
        const out = { chosen: res.scoreCuts(res.cuts) };
        (alternatives || []).forEach((alt, k) => { out["alt" + k] = res.scoreCuts(toIdx(alt)); });
        return out;
    }

    const api = {
        explain,
        DEFAULTS, HINT,
        cleanText, tokenize, analyze, breakLines,
        buildTimeline, segmentGroup, segmentGroupSafe, validateSegments,
        isVietWord,
        _lex: { COMPOUNDS, TERMS, OPENERS, LEFT_BIND, RIGHT_BIND, UNITS }
    };

    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CST_VI_SEG = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
