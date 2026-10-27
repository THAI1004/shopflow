# Render + Aiven

Repository public chỉ chứa mã và dữ liệu kiểm thử tổng hợp. Không commit .env, ca có kèm khóa riêng, token, database dump hoặc video thật.

1. Trong Render chọn New > Blueprint, kết nối repository này, chọn nhánh main. Kiểm tra plan Free trước khi tạo. Hoặc tạo Web Service Node: Build `npm ci --include=dev && npm run build`; Start `node server/migrate.mjs && node app.js`.
2. Thiết lập biến theo render.yaml. DB_HOST/DB_PORT/DB_USER/DB_PASSWORD lấy từ Aiven. DB_NAME=defaultdb. DB_SSL=true. DB_SSL_CA là toàn bộ nội dung file ca.pem, gồm BEGIN/END CERTIFICATE và các dòng ở giữa. Tuyệt đối không tắt xác minh TLS. Mật khẩu và khóa chỉ điền trong Render Environment.
3. APP_SECRET ngẫu nhiên tối thiểu 32 ký tự, giữ ổn định. HOST=0.0.0.0, NODE_ENV=production, REQUIRE_DRIVE_BEFORE_ACK=true. APP_ORIGIN tự dùng RENDER_EXTERNAL_URL; nếu dùng custom domain phải đặt APP_ORIGIN bằng origin HTTPS chính xác.
4. Lệnh Start chạy migration idempotent trước khi mở server. Chỉ triển khai một instance cho bản miễn phí này. Xem Logs để xác nhận kết nối Aiven thành công, rồi tạo tài khoản chủ shop.
5. Tạo Google OAuth Web Application + Drive API riêng, redirect `https://TEN-APP.onrender.com/api/drive/callback`. Điền GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET rồi redeploy. Chủ shop kết nối Drive trước khi đóng đơn. Nếu chưa có OAuth có thể thử quản lý đơn/Excel, chưa dùng quay video vận hành.
6. Với REQUIRE_DRIVE_BEFORE_ACK=true, API chỉ trả thành công để xóa bản IndexedDB sau khi Drive xác nhận đủ file. Khi Drive lỗi hoặc Render mất ổ tạm, tải lại cùng video từ thiết bị sẽ phục hồi file tạm và thử lại. Không xóa dữ liệu trình duyệt/đăng xuất khi còn clip chờ. File tạm Render không phải bản lưu bền vững.
7. Render Free có thể ngủ/restart. Chưa kiểm thử trên tài khoản Render/Aiven thật. Không dùng ngay để thay thế toàn bộ bằng chứng đóng hàng trước khi kiểm trên iPhone và Drive thật.
8. Bản này không tự chạy cron dọn 30 ngày trên Render Free. Chủ shop có nút dọn video quá hạn trong Cài đặt; cần chạy đều hoặc cấu hình lịch ngoài riêng. Sao lưu MySQL định kỳ vì giao diện gói Aiven Free hiện báo không có backup.

Nguồn dịch vụ: https://render.com/docs/free ; https://render.com/docs/tls ; https://aiven.io/docs/products/mysql/howto/connect-with-nodejs
