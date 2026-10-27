# Cài ShopFlow trên cPanel

## Điều kiện trước khi tải lên
Hosting phải có Setup Node.js App hoặc Application Manager/Passenger hỗ trợ Node.js, MySQL, HTTPS, outbound HTTPS đến Google và cron. cPanel thông thường chỉ hỗ trợ PHP không đủ để chạy backend này. Hỏi nhà cung cấp xác nhận Node >=20.19 (nên 22/24), npm và ứng dụng Node chạy lâu dài. Dùng domain/subdomain riêng tại đường dẫn gốc, ví dụ https://don.tenmien.vn.

## Triển khai
1. Tạo thư mục ứng dụng riêng ngoài public_html, ví dụ /home/USER/shopflow. Giải nén shopflow-node-cpanel.zip vào đó. Không đặt toàn bộ mã nguồn hay storage trong public_html.
2. Tạo database MySQL và user riêng có quyền trên database đó. Không dùng tài khoản root.
3. Trong Setup Node.js App chọn production, application root vừa tạo, domain HTTPS, startup file app.js. Chạy npm ci --omit=dev trong môi trường Node của ứng dụng. React đã được build nên server không cần Vite.
4. Sao chép .env.example thành .env trong thư mục riêng. Điền NODE_ENV=production; APP_ORIGIN là đúng origin HTTPS không có đường dẫn; APP_SECRET ngẫu nhiên tối thiểu 32 ký tự; DB_HOST/PORT/NAME/USER/PASSWORD. Giữ APP_SECRET ổn định vì dùng mã hóa kết nối Drive. Không gửi .env lên chat hay Git.
5. Trong terminal đã kích hoạt môi trường Node, chạy node server/migrate.mjs một lần để khởi tạo schema. Bản cập nhật cũng phải chạy migration trước khi khởi động.
6. Restart ứng dụng trong cPanel. Kiểm tra /api/health, tạo tài khoản chủ shop và tạo shop. Mỗi người có tài khoản riêng; chủ shop mời nhân viên bằng đúng email. Sau khi đủ chủ shop, có thể đặt ALLOW_REGISTRATION=false để tắt đăng ký công khai.
7. Kiểm tra upload và phát lại một video trước khi dùng thật. Proxy cần cho phép request đến 32 MB và SSE; nếu SSE bị buffering, đồng bộ dự phòng có thể chậm khoảng 10 giây. Không bật cache cho /api.

## Google Drive
Tạo OAuth Web Application của riêng bạn trong Google Cloud, bật Drive API, cấu hình consent/test users và redirect chính xác https://DOMAIN/api/drive/callback. Điền GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong .env rồi restart. Chủ từng shop bấm kết nối Drive trong Cài đặt và cấp quyền cho đúng tài khoản. Kết nối Drive trong ChatGPT không tự áp dụng cho ứng dụng này. Chỉ xác nhận video đã có trên Drive khi server nhận kết quả đúng kích thước; lỗi tải giữ bản chờ để thử lại.

Tạo cron mỗi giờ bằng đường dẫn Node của môi trường cPanel, chạy:
node /home/USER/shopflow/server/maintenance.mjs
Thay USER và đường dẫn Node theo hosting. Cron thử lại tải Drive và chuyển video hết 30 ngày vào thùng rác, không xóa vĩnh viễn. Drive Trash vẫn có thể tính dung lượng. Chưa có cron nào được cài tự động trên host của bạn.

## Sử dụng
Máy tính: giải nén /shopflow-extension.zip, cài extension ở Chrome Developer Mode, nhập domain riêng rồi cấp quyền đúng domain. Mở Seller, mở đủ sản phẩm, bấm lấy đơn và kiểm tra trước khi lưu. Bản extension chưa được thử trên Seller thật.

iPhone: mở webapp HTTPS; vào Đơn hàng → Lấy đơn từ điện thoại. Có hướng dẫn dấu trang cho Seller web, dán nội dung và nhập file. Dấu trang là thử nghiệm cần kiểm tra trên máy thật. Quét mã trong Đóng hàng bằng camera; nhận đơn thì tự quay. Bật/tắt micro trước khi quay. Giữ trang ở tiền cảnh, không khóa màn hình hay chuyển app khi quay. Dung lượng được giảm ngay lúc ghi bằng cấu hình bitrate, không bảo đảm mọi iPhone chọn đúng bitrate; chưa có bộ chuyển mã nền FFmpeg trên shared hosting. Kiểm tra độ rõ tem/mã trước khi dùng chính thức.

## Vận hành và sao lưu
Sao lưu database, thư mục storage và .env/APP_SECRET ở nơi riêng có kiểm soát truy cập. Không phục hồi dữ liệu của khách vào môi trường thử công khai. Khi chuyển host phải giữ khóa mã hóa và cấu hình lại origin/OAuth. Mất APP_SECRET cần kết nối lại Drive. Chưa có khôi phục mật khẩu qua email; chủ tài khoản phải giữ thông tin đăng nhập.

Chưa triển khai lên hosting thật vì chưa có domain và xác nhận tính năng Node của gói hosting. Không cần cung cấp mật khẩu cPanel trong cuộc trò chuyện; có thể tự cài theo hướng dẫn hoặc mở phiên đăng nhập sẵn để hỗ trợ sau.
