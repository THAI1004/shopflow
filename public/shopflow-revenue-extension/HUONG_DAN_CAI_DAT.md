# Hướng Dẫn Cài Đặt & Sử Dụng Extension Đọc Doanh Số Thực Nhận Shopee

Tiện ích mở rộng này được thiết kế chuyên biệt để đọc đơn hàng từ 3 trạng thái trên **Shopee Kênh Người Bán** (`banhang.shopee.vn`):
1. **Chờ lấy hàng** (To ship)
2. **Đang giao** (Shipping)
3. **Đã giao** (Delivered / Completed)

---

## 1. Cài đặt tiện ích vào Chrome / Cốc Cốc / Edge

1. Mở trình duyệt Chrome / Cốc Cốc, gõ vào thanh địa chỉ:
   ```
   chrome://extensions
   ```
2. Bật công tắc **"Chế độ dành cho nhà phát triển"** (Developer mode) ở góc trên bên phải.
3. Bấm nút **"Tải tiện ích đã giải nén"** (Load unpacked).
4. Chọn thư mục `shopflow-revenue-extension` (hoặc giải nén từ tệp `shopflow-revenue-extension.zip`).
5. Ghim (Pin) biểu tượng extension lên thanh công cụ trình duyệt để tiện sử dụng.

---

## 2. Quy trình đọc đơn từ 3 tab Shopee

1. **Bước 1**: Đăng nhập vào [Kênh Người Bán Shopee](https://banhang.shopee.vn/portal/sale/order).
2. **Bước 2**: Bấm vào tab **"Chờ lấy hàng"**:
   - Bấm biểu tượng Extension ShopFlow Doanh Số.
   - Bấm nút **"Đọc trang hiện tại"**.
   - Extension sẽ tự động đọc danh sách đơn, khách hàng, số lượng, tiền khách trả và số tiền thực nhận.
3. **Bước 3**: Bấm tiếp sang tab **"Đang giao"**:
   - Mở extension và bấm **"Đọc trang hiện tại"**.
   - Extension tự động gộp đơn, kiểm tra trùng lặp mã đơn (`Mã đơn hàng`). Nếu đơn đã có từ tab trước, hệ thống sẽ tự cập nhật trạng thái mới nhất mà **không cộng dồn hay nhân đôi doanh thu**.
4. **Bước 4**: Bấm sang tab **"Đã giao"**:
   - Mở extension và bấm **"Đọc trang hiện tại"**.
5. **Bước 5**: Bấm nút **"Gửi sang Web ShopFlow"**:
   - Dữ liệu toàn bộ đơn từ cả 3 tab sẽ được chuyển ngay sang tab **"Doanh số thực nhận"** trên trang web ShopFlow.
   - Bạn cũng có thể bấm **"Tải Excel (.xlsx)"** hoặc **"Tải JSON"** trực tiếp ngay trên Extension nếu muốn lưu file offline.

---

## 3. Các cột thông tin trên Web ShopFlow (Tab "Doanh số thực nhận")

Bảng tổng hợp trên Web cung cấp đầy đủ 8 trường thông tin theo yêu cầu:
1. **Mã đơn hàng**: Mã đơn Shopee (ví dụ: `261028SRJJ39RA`). Có thể bấm vào để xem chi tiết chiết khấu / mở trên Shopee.
2. **Tên khách hàng**: Tên tài khoản người mua (ví dụ: `if791ea9jp`).
3. **Tên sản phẩm & phân loại**: Tên sản phẩm đầy đủ kèm thông tin phân loại SKU (ví dụ: `Sạc Xe Đạp Điện... Variation: 60V-20Ah`).
4. **Số lượng**: Tổng số lượng sản phẩm của từng đơn.
5. **Trạng thái**: Nhận diện chuẩn xác 3 trạng thái (`Chờ lấy hàng`, `Đang giao`, `Đã giao`).
6. **Số tiền khách trả**: Tổng số tiền người mua thanh toán (ví dụ: `182.750 ₫`).
7. **Số tiền cuối cùng (Người bán thực nhận)**: Số tiền thực nhận sau khi trừ phí sàn, phí vận chuyển ước tính, thuế, voucher sàn (ví dụ: `155.992 ₫`).
8. **Đơn vị vận chuyển**: Tên đơn vị vận chuyển (ví dụ: `Giao Hàng Nhanh`, `SPX Express`, `Viettel Post`...).

---

## 4. Các tính năng nổi bật trên Web ShopFlow

- **KPI Cards Thống kê tài chính**:
  - **Doanh số thực nhận**: Tổng tiền người bán thực nhận cho tất cả các đơn đang hiển thị.
  - **Tiền khách thanh toán**: Tổng doanh số giá trị đơn hàng khách trả.
  - **Phí sàn & Chiết khấu**: Tự động tính chênh lệch `Tiền khách trả - Thực nhận` để biết sàn đã giữ lại bao nhiêu tiền phí.
  - **Tổng đơn hàng & Sản phẩm**: Đếm tổng số đơn và tổng số lượng sản phẩm.
- **Thanh lọc nhanh theo trạng thái**: Lọc 1 chạm giữa `Tất cả`, `Chờ lấy hàng`, `Đang giao`, `Đã giao`.
- **Tìm kiếm đa năng**: Gõ mã đơn, tên khách, tên sản phẩm hoặc đơn vị vận chuyển để lọc tức thì.
- **Xuất Excel (.xlsx)**: Tạo báo cáo Excel chuẩn màu sắc đẹp mắt, có dòng Tổng cộng ở cuối, công thức tính chênh lệch phí sàn.
- **Lưu trữ máy chủ**: Lưu vĩnh viễn dữ liệu doanh số lên máy chủ hoặc bộ nhớ cache cục bộ.
- **Nhập JSON dự phòng**: Dễ dàng dán JSON hoặc tải file backup khi cần khôi phục lại dữ liệu.
