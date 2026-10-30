# Hướng Dẫn Sử Dụng Extension ShopFlow: Doanh Số & Nhân Bản Sản Phẩm Shopee

Tiện ích mở rộng **ShopFlow (v1.2.0)** tích hợp 2 công cụ cốt lõi phục vụ vận hành đa shop chuyên nghiệp:
1. 💰 **Doanh số thực nhận**: Đọc và bóc tách thực nhận người bán sau khi trừ phí sàn từ 3 tab Shopee (*Chờ lấy hàng*, *Đang giao*, *Đã giao*), đồng bộ về Web ShopFlow.
2. 🚀 **Nhân bản sản phẩm (Clone SP) lách AI**: Sao chép sản phẩm từ Shop Chính $\rightarrow$ tự động spin tiêu đề, spin mô tả, tự sinh SKU, lệch giá thông minh, đóng khung lách thuật toán ảnh AI $\rightarrow$ Điền tự động vào trang Thêm sản phẩm Shop Phụ.

---

## 1. Cài đặt tiện ích vào Trình duyệt (Chrome / Cốc Cốc / Edge)

1. Mở trình duyệt, gõ vào thanh địa chỉ:
   ```
   chrome://extensions
   ```
2. Bật công tắc **"Chế độ dành cho nhà phát triển"** (Developer mode) ở góc trên bên phải.
3. Bấm nút **"Tải tiện ích đã giải nén"** (Load unpacked).
4. Chọn thư mục `shopflow-revenue-extension` (hoặc giải nén từ file `shopflow-revenue-extension.zip`).
5. Ghim (Pin) biểu tượng ShopFlow lên thanh công cụ trình duyệt.

---

## 2. Hướng dẫn tính năng "Nhân Bản Sản Phẩm (Clone SP)"

### Bước 1: Tại Shop Chính (Trang sản phẩm cần nhân bản)
1. Mở trang Kênh Người Bán Shop Chính $\rightarrow$ Vào mục **Tất cả sản phẩm** $\rightarrow$ Bấm nút **Chỉnh sửa** sản phẩm bạn muốn sao chép (hoặc trang chi tiết sản phẩm).
2. Bấm vào biểu tượng **Extension ShopFlow** $\rightarrow$ Chọn tab **🚀 Nhân Bản SP (Clone)**.
3. Bấm nút **"⚡ Lấy & Biến Tính SP Này"**:
   - Tiện ích tự động trích xuất Tên, Mô tả, Cân nặng, Kích thước, Phân loại, Giá & Bộ ảnh.
   - **Tự động lách tiêu đề**: Bạn có thể chọn tiền tố `[CHÍNH HÃNG]`, `[FREESHIP]`, `[BẢO HÀNH 1 ĐỔI 1]` hoặc bấm `🎲 Đổi tên` để xáo trộn từ đồng nghĩa.
   - **Tự sinh SKU**: Nếu sản phẩm gốc chưa có SKU, tiện ích sẽ tự sinh mã SKU thông minh kèm tiền tố (ví dụ: `S2-SXD6020-CD`).
   - **Quy tắc giá**: Chọn giữ nguyên giá, hoặc tăng nhẹ `+5%`, `+5.000 đ`, `+10.000 đ`...
4. **Xử lý bộ ảnh lách AI**:
   - Chọn kiểu khung viền: *🔶 Cam Shopee Freeship*, *🔴 Đỏ Đô Chuẩn Loại 1*, *🟢 Xanh ShopFlow Uy Tín*...
   - Tích chọn `Lật ngang (Flip)` hoặc `Tăng sáng & nét (+2%)`.
   - Bấm nút **"📥 Tải Trọn Bộ Ảnh Đã Lách AI (.zip)"** $\rightarrow$ Tệp ZIP chứa toàn bộ ảnh đã đóng khung viền lách AI sẽ tải về máy của bạn.
5. Bấm **"💾 Lưu Dữ Liệu Sẵn Sàng Fill"**.

---

### Bước 2: Tại Shop Phụ (Trang Thêm sản phẩm mới)
1. Mở trang Kênh Người Bán Shop Phụ $\rightarrow$ Bấm **"Thêm 1 sản phẩm mới"** (`https://banhang.shopee.vn/portal/product/new`).
2. Mở Extension ShopFlow $\rightarrow$ Chọn tab **🚀 Nhân Bản SP (Clone)**.
3. Bấm nút to màu cam: **"🚀 Điền Tự Động Vào Form (Auto-Fill)"**!
   - Tiện ích sẽ tự động điền Tên SP đã spin, Mô tả đã spin, Cân nặng, Kích thước, Phân loại, Giá mới & Mã SKU mới vào đúng các ô form của Shopee.
4. **Hoàn tất trong 5 giây**:
   - Bạn giải nén tệp `.zip` ảnh vừa tải ở Bước 1 và kéo thả vào ô ảnh của Shopee.
   - Liếc mắt kiểm tra lại các thông tin.
   - Bấm **"Lưu & Hiển thị"** (hoặc Lưu & Ẩn)!

---

## 3. Hướng dẫn tính năng "Doanh Số Thực Nhận"

1. Mở [Kênh Người Bán Shopee](https://banhang.shopee.vn/portal/sale/order).
2. Vào lần lượt các tab: **Chờ lấy hàng** $\rightarrow$ **Đang giao** $\rightarrow$ **Đã giao**.
3. Ở mỗi tab, bấm Extension $\rightarrow$ Chọn **"📥 Đọc trang hiện tại"**.
4. Tiện ích tự động gộp đơn, kiểm tra trùng lặp mã đơn và hiển thị:
   - Tổng thực nhận người bán.
   - Tổng tiền khách trả.
   - Tổng phí sàn đã trừ.
5. Bấm **"🚀 Gửi sang Web ShopFlow"** để đồng bộ sang giao diện quản lý tập trung.


## Đọc tiền chưa thanh toán (1.2.7)

1. Mở Doanh thu trên Shopee, chọn Chưa thanh toán.
2. Bấm Đọc trang hiện tại trong extension. Chuyển từng trang và đọc tiếp nếu có nhiều trang.
3. Xem tổng Chưa thanh toán trong extension, rồi Gửi sang Web ShopFlow.
4. Trên web, vào Doanh số thực nhận → Chưa thanh toán. Tổng chỉ gồm các mã đã đọc, tại lần đọc gần nhất.
