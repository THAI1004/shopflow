export function cleanMoney(value) {
  if (typeof value === 'number') return Math.round(value);
  if (!value) return 0;
  // Remove currency symbol, whitespace, trailing zeroes if any
  const s = String(value).trim().replace(/[₫đ\s]/gi, '');
  // If Shopee formatted with dots (e.g. 182.750 or 1.250.000) or commas (182,750)
  // Check if Vietnamese dot thousands separator: e.g. 182.750
  const normalized = s.replace(/[,.]/g, '');
  const num = parseInt(normalized, 10);
  return Number.isFinite(num) ? num : 0;
}

export function formatVND(amount) {
  const n = typeof amount === 'number' ? amount : cleanMoney(amount);
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

export function normalizeStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase();
  if (/chờ lấy hàng|to_ship|toship|chờ xử lý/i.test(s)) return 'Chờ lấy hàng';
  if (/đang giao|shipping|đang vận chuyển|đã giao cho/i.test(s)) return 'Đang giao';
  if (/đã giao|completed|thành công|giao hàng thành công/i.test(s)) return 'Đã giao';
  if (/hủy|huỷ|cancelled/i.test(s)) return 'Đã hủy';
  if (/chờ xác nhận|unpaid/i.test(s)) return 'Chờ xác nhận';
  return rawStatus ? String(rawStatus).trim() : 'Chờ lấy hàng';
}

export function mergeRevenueOrders(existing = [], incoming = []) {
  const map = new Map();
  for (const o of existing) {
    if (!o || !o.id) continue;
    map.set(String(o.id).trim().toUpperCase(), { ...o });
  }

  for (const o of incoming) {
    if (!o || !o.id) continue;
    const key = String(o.id).trim().toUpperCase();
    const prev = map.get(key);

    const buyerPayment = Number(o.buyerPayment) || cleanMoney(o.buyerPayment) || prev?.buyerPayment || 0;
    const incomingHasFinal = o.finalAmount !== undefined && o.finalAmount !== null && Number(o.finalAmount) > 0 && !o.isPendingFinal;
    const prevHasFinal = prev?.finalAmount !== undefined && prev?.finalAmount !== null && Number(prev?.finalAmount) > 0 && !prev?.isPendingFinal;

    const finalAmount = incomingHasFinal
      ? Number(o.finalAmount)
      : (prevHasFinal
        ? Number(prev.finalAmount)
        : ((Number(o.finalAmount) > 0) ? Number(o.finalAmount) : ((Number(prev?.finalAmount) > 0) ? Number(prev.finalAmount) : (buyerPayment || 0))));
    const isPendingFinal = incomingHasFinal ? false : (prevHasFinal ? false : (o.isPendingFinal ?? prev?.isPendingFinal ?? false));

    const items = (Array.isArray(o.items) && o.items.length) ? o.items : (prev?.items || []);
    const totalQty = o.totalQty || (items.length ? items.reduce((sum, i) => sum + (Number(i.qty) || 1), 0) : (prev?.totalQty || 1));

    const merged = {
      ...(prev || {}),
      ...o,
      id: key,
      buyer: o.buyer || prev?.buyer || '—',
      status: o.status ? normalizeStatus(o.status) : (prev?.status || 'Chờ lấy hàng'),
      carrier: o.carrier || prev?.carrier || '—',
      items,
      totalQty,
      buyerPayment,
      finalAmount,
      isPendingFinal,
      diffAmount: Math.max(0, buyerPayment - finalAmount),
      updatedAt: new Date().toISOString()
    };
    map.set(key, merged);
  }

  return [...map.values()];
}

export function summarizeRevenue(orders = []) {
  let totalFinalAmount = 0;
  let totalBuyerPayment = 0;
  let totalProducts = 0;

  const byStatus = {
    'Chờ lấy hàng': { count: 0, finalAmount: 0, buyerPayment: 0 },
    'Đang giao': { count: 0, finalAmount: 0, buyerPayment: 0 },
    'Đã giao': { count: 0, finalAmount: 0, buyerPayment: 0 },
    'Khác': { count: 0, finalAmount: 0, buyerPayment: 0 }
  };

  for (const o of orders) {
    const finalAmt = Number(o.finalAmount) || 0;
    const buyerAmt = Number(o.buyerPayment) || 0;
    const qty = Number(o.totalQty) || (Array.isArray(o.items) ? o.items.reduce((s, i) => s + (Number(i.qty) || 1), 0) : 1);

    totalFinalAmount += finalAmt;
    totalBuyerPayment += buyerAmt;
    totalProducts += qty;

    const st = normalizeStatus(o.status);
    const target = byStatus[st] || byStatus['Khác'];
    target.count++;
    target.finalAmount += finalAmt;
    target.buyerPayment += buyerAmt;
  }

  return {
    totalOrders: orders.length,
    totalProducts,
    totalFinalAmount,
    totalBuyerPayment,
    totalFees: totalBuyerPayment - totalFinalAmount,
    byStatus
  };
}

export function normalizeRevenueOrders(input) {
  if (!Array.isArray(input)) return [];
  return input.map(o => {
    const id = String(o.id || o.order_sn || '').trim().toUpperCase();
    const buyer = String(o.buyer || o.buyer_user || '—').trim();
    const carrier = String(o.carrier || o.shipping_carrier || '—').trim();
    const status = normalizeStatus(o.status || o.order_status);
    const buyerPayment = Number(o.buyerPayment) || cleanMoney(o.buyerPayment || o.total_price) || 0;
    const finalAmount = Number(o.finalAmount) || cleanMoney(o.finalAmount || o.escrow_amount || o.seller_income) || 0;
    const items = Array.isArray(o.items) ? o.items.map(i => ({
      name: String(i.name || i.item_name || '').trim(),
      variant: String(i.variant || i.model_name || '').trim(),
      qty: Number(i.qty || i.amount || 1),
      sku: String(i.sku || '').trim()
    })) : [];
    const totalQty = o.totalQty || (items.length ? items.reduce((s, i) => s + i.qty, 0) : 1);

    return {
      id,
      buyer,
      carrier,
      status,
      items,
      totalQty,
      buyerPayment,
      finalAmount,
      diffAmount: buyerPayment - finalAmount,
      tracking: String(o.tracking || '').trim(),
      detailId: String(o.detailId || o.order_id || '').trim(),
      readAt: o.readAt || new Date().toISOString()
    };
  }).filter(o => o.id);
}
