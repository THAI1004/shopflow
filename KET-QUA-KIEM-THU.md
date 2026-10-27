# Kết quả kiểm thử — 27/10/2026

## Đã đạt trong môi trường cục bộ
- 44 kiểm thử tự động đạt, không lỗi: chuẩn hóa đơn, tổng hợp hàng, dữ liệu thiếu, CSV/Excel, barcode/QR, media, bảo mật, hàng đợi phục hồi và Google Drive giả lập.
- API chạy với MySQL thật trong database thử riêng: đăng ký/đăng nhập/đăng xuất; cookie phiên; chống giả mạo nguồn; tài khoản khác không đọc/sửa shop, đơn và video; lời mời đúng email, một lần; nhân viên bị thu hồi quyền; cập nhật SSE; đổi mật khẩu thu hồi phiên cũ.
- Video: tải file thật, phát byte range, chống dùng lại mã video với nội dung khác, giữ file khi Drive lỗi, chỉ bỏ bản chờ khi có xác nhận hợp lệ. Kiểm thử Drive dùng nhà cung cấp giả lập, chưa kiểm OAuth Google trên host riêng.
- Giao diện React: dữ liệu mẫu hai đơn; camera giả lập nhận barcode và QR, tự bắt đầu ghi, dừng và lưu. Phân tích file kết quả xác nhận bản bật micro có H.264 + AAC, bản tắt micro chỉ có video H.264. Đây là camera/âm thanh tổng hợp để kiểm luồng, không phải thử phần cứng iPhone.
- TypeScript kiểm tra đạt. Báo cáo media chi tiết nằm trong outputs/media-qa.json của bản mã nguồn.

## Cần kiểm thực tế trước vận hành
- Chưa chạy trên iPhone thật, chưa kiểm quyền camera/micro hoặc hành vi iOS khi khóa màn hình.
- Chưa lấy đơn từ Seller thật; bookmarklet Chrome iPhone là thử nghiệm, có thể bị chặn; extension chỉ dành cho Chrome máy tính. Có nhập file/dán nội dung dự phòng. Trang đơn gộp/thu gọn bị cảnh báo và bỏ qua để tránh thiếu hàng.
- Chưa triển khai trên hosting cPanel thật; cần xác nhận hỗ trợ Node/Passenger và domain HTTPS.
- Chưa cấu hình Google OAuth riêng, cron giữ 30 ngày và kiểm dung lượng Drive thực tế.
- Video giảm dung lượng khi ghi, không có bước chuyển mã nén lại sau quay trên server. Khả năng/bitrate thực tế phụ thuộc trình duyệt; cần xác minh chất lượng tem và dung lượng trên iPhone.

Không có tuyên bố bản này đã hoàn tất kiểm thử vận hành trên Shopee/iPhone/hosting thật.

## Bổ sung Render/Aiven
46 kiểm thử đạt sau bổ sung TLS Aiven và chế độ REQUIRE_DRIVE_BEFORE_ACK: không xác nhận video khi Drive lỗi; tải lại cùng clip phục hồi file tạm bị mất. Build TypeScript/Vite đạt. Chưa kết nối Aiven/Render hoặc Google OAuth thật. Hướng dẫn triển khai ở HUONG-DAN-RENDER.md.

## Cập nhật quét tem và danh sách điện thoại
- Thay bộ đọc camera bằng ZXing-C++ WebAssembly được phục vụ cùng ứng dụng; không gửi ảnh/mã sang dịch vụ giải mã bên ngoài.
- 29 kiểm thử core/queue/Drive và 2 kiểm thử QR + Code128 tổng hợp đạt. TypeScript/Vite build đạt.
- Đã giải mã QR của ảnh tem người dùng cung cấp ở máy cục bộ và trong giao diện trình duyệt, nhận đúng vận đơn và đơn tương ứng. Ảnh và dữ liệu chẩn đoán không được commit.
- Đã thử thẻ đơn gọn, mở/đóng popup, chuyển từ popup sang bàn đóng hàng; kiểm tra không tràn ngang ở kích thước điện thoại.
- Chưa kiểm tra quét trực tiếp bằng phần cứng iPhone trong đợt sửa này. Quét ảnh là phương án dự phòng: nhận diện rồi người dùng kiểm tra và bấm bắt đầu quay. Quét trực tiếp vẫn tự quay khi khớp duy nhất một đơn.
