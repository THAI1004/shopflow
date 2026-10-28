import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMoney, formatVND, normalizeStatus, mergeRevenueOrders, summarizeRevenue } from '../lib/revenue-orders.mjs';
import { revenueParser } from '../lib/revenue-parser.mjs';

test('cleanMoney and formatVND handle Shopee dot and comma formatting', () => {
  assert.equal(cleanMoney('₫182.750'), 182750);
  assert.equal(cleanMoney('₫155.992'), 155992);
  assert.equal(cleanMoney('1.250.000 đ'), 1250000);
  assert.equal(cleanMoney('0'), 0);
  assert.equal(cleanMoney(null), 0);
  assert.equal(cleanMoney(182750), 182750);

  assert.equal(formatVND(182750).replace(/\s/g, ' '), '182.750 ₫');
  assert.equal(formatVND(155992).replace(/\s/g, ' '), '155.992 ₫');
});

test('normalizeStatus categorizes Shopee tabs correctly', () => {
  assert.equal(normalizeStatus('Chờ lấy hàng'), 'Chờ lấy hàng');
  assert.equal(normalizeStatus('to_ship'), 'Chờ lấy hàng');
  assert.equal(normalizeStatus('Đang giao'), 'Đang giao');
  assert.equal(normalizeStatus('shipping'), 'Đang giao');
  assert.equal(normalizeStatus('Đã giao'), 'Đã giao');
  assert.equal(normalizeStatus('completed'), 'Đã giao');
  assert.equal(normalizeStatus('Đã hủy'), 'Đã hủy');
});

test('parseListCard extracts all fields from Shopee Order List card (Screenshot 1)', () => {
  const sampleCardText = `
    if791ea9jp
    Mã đơn hàng 261028SRJJ39RA
    Sạc Xe Đạp Điện, Xe Máy Điện Hộp Đỏ Đủ Cỡ 48V / 60V / 72V / 84... x1
    Variation: 60V-20Ah (5B To) [SACXE_D...]
    ₫182.750
    Thanh toán khi nhận hàng
    Chờ lấy hàng
    Để tránh việc giao hàng trễ, vui lòng giao hàng/chuẩn bị hàng trước 29/10/2026
    Nhanh
    Giao Hàng Nhanh
    Drop off / Pickup
    Chuẩn bị hàng
  `;

  const order = revenueParser.parseListCard(sampleCardText, null, { currentTab: 'Chờ lấy hàng' });
  assert.ok(order);
  assert.equal(order.id, '261028SRJJ39RA');
  assert.equal(order.buyer, 'if791ea9jp');
  assert.equal(order.status, 'Chờ lấy hàng');
  assert.equal(order.buyerPayment, 182750);
  assert.equal(order.carrier, 'Giao Hàng Nhanh');
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].qty, 1);
  assert.match(order.items[0].name, /Sạc Xe Đạp Điện/);
});

test('parseDetailPage extracts finalAmount and breakdown (Screenshot 2)', () => {
  const sampleDetailText = `
    Trang chủ > Tất cả > Chi tiết đơn hàng
    Mã đơn hàng 261028SRJJ39RA
    1  Sạc Xe Đạp Điện, Xe Máy Điện Hộp Đỏ Đủ Cỡ 48V / 60V / 72V / 84... 182.750 1 182.750
    Tổng tiền sản phẩm ₫182.750
    Giảm giá sản phẩm -₫182.750
    Tổng phí vận chuyển ước tính ₫0
    Phụ phí -₫26.018
    Phí Dịch vụ -₫13.301
    Phí xử lý giao dịch -₫10.005
    Thuế -₫2.712
    Doanh thu đơn hàng ước tính ₫155.992
    Số tiền cuối cùng ₫155.992
    Thanh toán của Người Mua
    Tổng tiền sản phẩm ₫182.750
    Tổng tiền Thanh toán ₫182.750
  `;

  const parsed = revenueParser.parseDetailPage(sampleDetailText);
  assert.ok(parsed);
  assert.equal(parsed.id, '261028SRJJ39RA');
  assert.equal(parsed.finalAmount, 155992);
  assert.equal(parsed.buyerPayment, 182750);
  assert.equal(parsed.diffAmount, 182750 - 155992);
  assert.equal(parsed.breakdown.serviceFee, 13301);
  assert.equal(parsed.breakdown.transactionFee, 10005);
  assert.equal(parsed.breakdown.tax, 2712);
  assert.equal(parsed.breakdown.extraFees, 26018);
});

test('mergeRevenueOrders deduplicates by order id across Shopee tabs', () => {
  // Step 1: Read order from "Chờ lấy hàng" tab
  const step1Orders = [
    {
      id: '261028SRJJ39RA',
      buyer: 'if791ea9jp',
      status: 'Chờ lấy hàng',
      carrier: 'Giao Hàng Nhanh',
      buyerPayment: 182750,
      finalAmount: 155992,
      items: [{ name: 'Sạc Xe Đạp Điện', qty: 1 }]
    },
    {
      id: '261028SRYSJQGK',
      buyer: '84cl0snq2z',
      status: 'Chờ lấy hàng',
      carrier: 'Giao Hàng Nhanh',
      buyerPayment: 417650,
      finalAmount: 370000,
      items: [{ name: 'IC Đúc Nguyên Khối', qty: 1 }]
    }
  ];

  let current = mergeRevenueOrders([], step1Orders);
  assert.equal(current.length, 2);

  // Step 2: Read order from "Đang giao" tab (order 261028SRJJ39RA moved to shipping)
  const step2Orders = [
    {
      id: '261028SRJJ39RA', // Duplicate ID
      status: 'Đang giao',  // Updated status
      carrier: 'Giao Hàng Nhanh',
      buyerPayment: 182750,
      finalAmount: 155992
    },
    {
      id: '261028NEW001',
      buyer: 'khach_moi',
      status: 'Đang giao',
      carrier: 'SPX Express',
      buyerPayment: 250000,
      finalAmount: 220000,
      items: [{ name: 'Đèn led', qty: 2 }]
    }
  ];

  current = mergeRevenueOrders(current, step2Orders);
  // Total should be 3 unique orders, NOT 4!
  assert.equal(current.length, 3);

  // The first order status should now be updated to "Đang giao"
  const updatedOrder = current.find(o => o.id === '261028SRJJ39RA');
  assert.equal(updatedOrder.status, 'Đang giao');
  assert.equal(updatedOrder.finalAmount, 155992);
  assert.equal(updatedOrder.buyerPayment, 182750);
  assert.equal(updatedOrder.buyer, 'if791ea9jp'); // Preserved buyer name
});

test('summarizeRevenue computes correct totals and fee differences', () => {
  const orders = [
    { id: '1', status: 'Chờ lấy hàng', finalAmount: 155992, buyerPayment: 182750, totalQty: 1 },
    { id: '2', status: 'Đang giao', finalAmount: 370000, buyerPayment: 417650, totalQty: 1 },
    { id: '3', status: 'Đã giao', finalAmount: 200000, buyerPayment: 220000, totalQty: 2 }
  ];

  const summary = summarizeRevenue(orders);
  assert.equal(summary.totalOrders, 3);
  assert.equal(summary.totalProducts, 4);
  assert.equal(summary.totalFinalAmount, 155992 + 370000 + 200000);
  assert.equal(summary.totalBuyerPayment, 182750 + 417650 + 220000);
  assert.equal(summary.totalFees, summary.totalBuyerPayment - summary.totalFinalAmount);
  assert.equal(summary.byStatus['Chờ lấy hàng'].count, 1);
  assert.equal(summary.byStatus['Đang giao'].count, 1);
  assert.equal(summary.byStatus['Đã giao'].count, 1);
});
