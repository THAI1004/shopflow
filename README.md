Triển khai Render + Aiven: xem [HUONG-DAN-RENDER.md](HUONG-DAN-RENDER.md).

# ShopFlow — Node.js + React

Ứng dụng độc lập cho hosting riêng, không dùng tài khoản hay luồng ChatGPT. Backend Node.js/Express, React/Vite, MySQL; giao diện đã biên dịch sẵn trong gói cPanel.

Chức năng: tài khoản riêng; shop và thành viên theo lời mời; nhập đơn, hạn giao, tổng hợp hàng theo SKU/phân loại và xuất Excel; quét barcode/QR để tìm đơn và quay video; tùy chọn micro; video dung lượng thấp, phục hồi bản ghi đang chờ tải; Google Drive theo shop/ngày và thời hạn 30 ngày khi cấu hình cron.

Đọc HUONG-DAN-CPANEL.md để cài và KET-QUA-KIEM-THU.md để biết phạm vi đã kiểm thử.

## Phát triển
Node >=20.19 (khuyến nghị 22/24). Chạy npm ci, sao chép .env.example thành .env và cấu hình MySQL, APP_ORIGIN, APP_SECRET. Chạy npm run db:init, npm run dev:server và npm run dev. Dev frontend dùng cổng 5174, backend đặt PORT=4174. Build: npm run build. Chạy bản build bằng npm start. Kiểm thử API cần MySQL thử nghiệm; không dùng cơ sở dữ liệu đang bán hàng.

## Lấy đơn trên điện thoại
Đăng nhập Seller trong Chrome rồi mở đầy đủ sản phẩm trong từng đơn. Công cụ dấu trang trong mục “Lấy đơn từ điện thoại” đọc nội dung trang đang mở và chuyển bản xem trước về ứng dụng. Đây là tính năng thử nghiệm, chưa xác minh trên iPhone thật/Shopee thật; Shopee hoặc Chrome iOS có thể chặn. Có phương án nhập Excel/CSV/JSON hoặc dán nội dung đã sao chép. Không lấy cookie, mật khẩu hoặc đọc ứng dụng Seller gốc.

Extension Chrome trên máy tính là phương án riêng; Chrome iPhone không dùng extension máy tính. Không thể cam kết tự đồng bộ nền chỉ bằng việc đăng nhập Seller. Tích hợp Shopee API cần quyền chính thức riêng và chưa nằm trong bản này.
