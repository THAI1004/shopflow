import { cleanMoney, normalizeStatus } from './revenue-orders.mjs';

export const revenueParser = {
  // Parse card text from Shopee Order List Page (Screenshot 1)
  parseListCard(text, cardEl = null, pageContext = {}) {
    const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const flat = lines.join('\n');

    // 1. Mã đơn hàng (e.g. 261028SRJJ39RA)
    const id = flat.match(/Mã\s*đơn\s*hàng\s*[:：]?\s*([A-Z0-9_-]{8,50})/i)?.[1]?.toUpperCase();
    if (!id) return null;

    // Detail ID / link if element is available
    let detailId = '';
    let detailHref = '';
    if (cardEl) {
      const link = cardEl.querySelector ? cardEl.querySelector('a[href*="/portal/sale/order/"]') : null;
      if (link && link.getAttribute) {
        detailHref = link.getAttribute('href') || '';
        const match = detailHref.match(/\/portal\/sale\/order\/(\d+)/);
        if (match) detailId = match[1];
      }
    }
    if (!detailId) {
      const urlMatch = flat.match(/\/portal\/sale\/order\/(\d+)/);
      if (urlMatch) detailId = urlMatch[1];
    }

    // 2. Tên khách hàng (Buyer username, e.g. if791ea9jp)
    let buyer = flat.match(/(?:Người mua|Tài khoản người mua)\s*[:：]\s*([^\n]+)/i)?.[1];
    if (!buyer) {
      // Often the first line of the card header or line before "Mã đơn hàng"
      const idIdx = lines.findIndex(l => /Mã\s*đơn\s*hàng/i.test(l));
      if (idIdx > 0) {
        const candidate = lines[idIdx - 1].trim();
        if (/^[a-z0-9_.-]{3,60}$/i.test(candidate) && !/^(?:Mã|₫|đ|Chờ|Đã|Nhanh)/i.test(candidate)) {
          buyer = candidate;
        }
      }
      if (!buyer && lines[0] && /^[a-z0-9_.-]{3,60}$/i.test(lines[0])) {
        buyer = lines[0];
      }
    }
    buyer = (buyer || '—').trim();

    // 3. Đơn vị vận chuyển (Carrier, e.g. Giao Hàng Nhanh, Nhanh, SPX Express)
    const carriers = [
      'Giao Hàng Nhanh', 'Giao Hàng Tiết Kiệm', 'Shopee Express', 'SPX Express',
      'Viettel Post', 'Vietnam Post', 'Ninja Van', 'BEST Express', 'J&T Express',
      'GrabExpress', 'beDelivery', 'J&T', 'GHN', 'GHTK', 'Hỏa Tốc', 'Tiết kiệm', 'Nhanh'
    ];
    let carrier = '—';
    for (const c of carriers) {
      const reg = new RegExp(`\\b${c}\\b`, 'i');
      if (reg.test(flat)) {
        carrier = c;
        break;
      }
    }
    if (carrier === '—') {
      const dvvc = flat.match(/(?:Đơn vị vận chuyển|ĐVVC)\s*[:：]?\s*([^\n]+)/i)?.[1]?.trim();
      if (dvvc) carrier = dvvc;
    }

    // 4. Trạng thái (Chờ lấy hàng, Đang giao, Đã giao)
    let rawStatus = pageContext.currentTab || '';
    if (!rawStatus) {
      if (/Chờ\s*lấy\s*hàng/i.test(flat)) rawStatus = 'Chờ lấy hàng';
      else if (/Đang\s*giao|Đang\s*vận\s*chuyển|Đã\s*giao\s*cho\s*(?:đơn\s*vị\s*vận\s*chuyển|ĐVVC)/i.test(flat)) rawStatus = 'Đang giao';
      else if (/Đã\s*giao|Giao\s*hàng\s*thành\s*công|Hoàn\s*thành/i.test(flat)) rawStatus = 'Đã giao';
      else if (/Đã\s*hủy|Đã\s*huỷ|Người\s*mua\s*đã\s*hủy/i.test(flat)) rawStatus = 'Đã hủy';
      else if (/Chờ\s*xác\s*nhận/i.test(flat)) rawStatus = 'Chờ xác nhận';
    }
    const status = normalizeStatus(rawStatus || 'Chờ lấy hàng');

    // 5. Số tiền khách trả (Buyer payment: e.g. ₫182.750)
    let buyerPayment = 0;
    // Look for lines under "Tổng số tiền Người mua thanh toán" or matching "₫182.750"
    const paymentMatch = flat.match(/(?:Tổng số tiền Người mua thanh toán|Người mua thanh toán|Tổng tiền Thanh toán)[\s\S]{0,60}?[₫đ]\s*([\d.,]+)/i) ||
      flat.match(/[₫đ]\s*([\d.,]+)[\s\S]{0,40}?(?:Thanh toán khi nhận hàng|Đã thanh toán|Người mua thanh toán|Thanh toán qua)/i) ||
      flat.match(/[₫đ]\s*([\d.,]+)/i);

    if (paymentMatch) {
      buyerPayment = cleanMoney(paymentMatch[1]);
    }

    // 6. Số tiền cuối cùng (Người bán thực nhận) if available in text (e.g. from detail or tooltip)
    let finalAmount = 0;
    const finalMatch = flat.match(/(?:Số tiền cuối cùng|Doanh thu đơn hàng ước tính|Thực nhận|Người bán thực nhận)\s*[:：]?\s*(?:₫|đ)?\s*([\d.,]+)/i);
    if (finalMatch) {
      finalAmount = cleanMoney(finalMatch[1]);
    }

    // 7. Sản phẩm & Số lượng
    const items = [];
    const quantityRegex = /^(?:(.+?)\s+)?[x×]\s*(\d{1,4})$/i;
    const boundary = /Mã\s*đơn|Mã\s*vận|₫|^đ[\d.,]|^\d[\d.,]+$|^Chờ|^Đã|^SPX|^Nhanh|^Drop|^Thanh toán|^(?:Variation|Phân loại|SKU|Người mua|Tổng số tiền)/i;

    for (let n = 0; n < lines.length; n++) {
      const q = lines[n].match(quantityRegex);
      if (!q) continue;

      let name = q[1] || '';
      let variant = '';
      let sku = '';

      if (!name) {
        const names = [];
        let p = n - 1;
        while (p >= 0 && n - p <= 8 && !boundary.test(lines[p]) && !quantityRegex.test(lines[p])) {
          names.unshift(lines[p]);
          p--;
          if (names.join(' ').length > 120) break;
        }
        name = names.join(' ');
      }
      if (!name || name.length < 3 || boundary.test(name)) continue;

      // Look for variation after or before
      for (let j = n - 2; j <= n + 3 && j < lines.length; j++) {
        if (j < 0) continue;
        const vMatch = lines[j].match(/^(?:Variation|Phân loại(?: hàng)?)\s*[:：]\s*(.*)$/i);
        if (vMatch) {
          variant = vMatch[1].trim();
          break;
        }
      }

      items.push({
        name: name.trim(),
        variant: variant || '',
        qty: Number(q[2]) || 1,
        sku: sku || ''
      });
    }

    const totalQty = items.length ? items.reduce((sum, i) => sum + i.qty, 0) : 1;

    return {
      id,
      detailId,
      buyer,
      carrier,
      status,
      items,
      totalQty,
      buyerPayment,
      finalAmount, // If 0, will be fetched via detail API or cache
      diffAmount: (finalAmount > 0) ? Math.max(0, buyerPayment - finalAmount) : 0,
      isPendingFinal: finalAmount <= 0,
      readAt: new Date().toISOString()
    };
  },

  // Parse Order Detail Page (Screenshot 2: /portal/sale/order/<id>)
  parseDetailPage(text, documentRef = null) {
    const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const flat = lines.join('\n');

    // Order ID (SN)
    const id = flat.match(/Mã\s*đơn\s*hàng\s*[:：]?\s*([A-Z0-9_-]{8,50})/i)?.[1]?.toUpperCase() ||
      (documentRef?.location?.pathname?.match(/\/portal\/sale\/order\/(\d+)/)?.[1]) || '';

    // Số tiền cuối cùng (Người bán thực nhận)
    const finalMatch = flat.match(/Số\s*tiền\s*cuối\s*cùng\s*[:：]?\s*(?:₫|đ)?\s*([\d.,]+)/i) ||
      flat.match(/Doanh\s*thu\s*đơn\s*hàng\s*ước\s*tính\s*[:：]?\s*(?:₫|đ)?\s*([\d.,]+)/i);
    const finalAmount = finalMatch ? cleanMoney(finalMatch[1]) : 0;

    // Thanh toán của Người Mua / Tổng tiền thanh toán
    const buyerMatch = flat.match(/Thanh toán của Người Mua[\s\S]{0,150}?Tổng tiền\s*(?:Thanh toán)?\s*[:：]?\s*(?:₫|đ)?\s*([\d.,]+)/i) ||
      flat.match(/Tổng tiền\s*Thanh toán\s*[:：]?\s*(?:₫|đ)?\s*([\d.,]+)/i) ||
      flat.match(/Tổng tiền sản phẩm\s*[:：]?\s*(?:₫|đ)?\s*([\d.,]+)/i);
    const buyerPayment = buyerMatch ? cleanMoney(buyerMatch[1]) : 0;

    // Carrier
    const carrier = flat.match(/\b(SPX Express|Shopee Express|Giao Hàng Nhanh|Giao Hàng Tiết Kiệm|J&T Express|J&T|GHN|GHTK|Viettel Post|Vietnam Post|Ninja Van|BEST Express|GrabExpress|beDelivery|Nhanh)\b/i)?.[1] || '—';

    // Buyer name
    const buyer = flat.match(/(?:Người mua|Tài khoản người mua)\s*[:：]\s*([^\n]+)/i)?.[1]?.trim() || '—';

    // Status
    let status = 'Chờ lấy hàng';
    if (/Đã giao|Giao hàng thành công/i.test(flat)) status = 'Đã giao';
    else if (/Đang giao|Đang vận chuyển/i.test(flat)) status = 'Đang giao';
    else if (/Đã hủy|Đã huỷ/i.test(flat)) status = 'Đã hủy';

    // Fee breakdown if available
    const serviceFeeMatch = flat.match(/Phí\s*Dịch\s*vụ\s*[:：]?\s*[-+]?(?:₫|đ)?\s*([\d.,]+)/i);
    const txFeeMatch = flat.match(/Phí\s*xử\s*lý\s*giao\s*dịch\s*[:：]?\s*[-+]?(?:₫|đ)?\s*([\d.,]+)/i);
    const taxMatch = flat.match(/Thuế\s*[:：]?\s*[-+]?(?:₫|đ)?\s*([\d.,]+)/i);
    const extraMatch = flat.match(/Phụ\s*phí\s*[:：]?\s*[-+]?(?:₫|đ)?\s*([\d.,]+)/i);

    const breakdown = {
      serviceFee: serviceFeeMatch ? cleanMoney(serviceFeeMatch[1]) : 0,
      transactionFee: txFeeMatch ? cleanMoney(txFeeMatch[1]) : 0,
      tax: taxMatch ? cleanMoney(taxMatch[1]) : 0,
      extraFees: extraMatch ? cleanMoney(extraMatch[1]) : 0
    };

    return {
      id,
      buyer,
      carrier,
      status,
      buyerPayment,
      finalAmount,
      diffAmount: buyerPayment - finalAmount,
      breakdown,
      readAt: new Date().toISOString()
    };
  }
};
