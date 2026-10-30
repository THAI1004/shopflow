// Parser running in Shopee page context (world: MAIN)
(function () {
  function cleanMoney(value) {
    if (typeof value === 'number') {
      if (value > 1000000000) return Math.round(value / 100000); // Shopee micro-units
      return Math.round(value);
    }
    if (!value) return 0;
    const s = String(value).trim().replace(/[₫đ\s]/gi, '');
    const normalized = s.replace(/[,.]/g, '');
    const num = parseInt(normalized, 10);
    return Number.isFinite(num) ? num : 0;
  }

  function normalizeStatus(rawStatus) {
    const s = String(rawStatus || '').toLowerCase();
    if (/chờ lấy hàng|to_ship|toship|chờ xử lý/i.test(s)) return 'Chờ lấy hàng';
    if (/đang giao|shipping|đang vận chuyển|đã giao cho/i.test(s)) return 'Đang giao';
    if (/đã giao|completed|thành công|giao hàng thành công/i.test(s)) return 'Đã giao';
    if (/hủy|huỷ|cancelled/i.test(s)) return 'Đã hủy';
    if (/chờ xác nhận|unpaid/i.test(s)) return 'Chờ xác nhận';
    return rawStatus ? String(rawStatus).trim() : 'Chờ lấy hàng';
  }

  // Extract Shopee security tokens (SPC_CDS, SPC_CDS_VER) from cookie or network history
  function getShopeeTokens() {
    let spcCds = '';
    const m = document.cookie.match(/(?:^|;\s*)SPC_CDS=([^;]+)/);
    if (m) spcCds = decodeURIComponent(m[1]);
    if (!spcCds) {
      try {
        const res = performance.getEntriesByType('resource') || [];
        for (let i = res.length - 1; i >= 0; i--) {
          const u = res[i].name || '';
          const match = u.match(/SPC_CDS=([^&]+)/);
          if (match) {
            spcCds = match[1];
            break;
          }
        }
      } catch (e) {}
    }
    return { spcCds, spcCdsVer: '2' };
  }

  // Search DOM for all direct links to order details (e.g. /portal/sale/order/246885386225418)
  function mapDomOrderLinks(doc = document) {
    const snToId = new Map();
    try {
      const links = Array.from(doc.querySelectorAll('a[href*="/portal/sale/order/"]'));
      for (const a of links) {
        const href = a.getAttribute('href') || a.getAttribute('data-href') || '';
        const m = href.match(/\/portal\/sale\/order\/(\d{10,25})/);
        if (!m) continue;
        const detailId = m[1];

        // Find ancestor container to match order SN
        let container = a;
        for (let i = 0; i < 10 && container && container !== doc.body; i++) {
          const text = container.innerText || '';
          const snMatch = text.match(/\b([0-9]{2}[0-9A-Z]{12,24})\b/);
          if (snMatch) {
            snToId.set(snMatch[1].toUpperCase(), detailId);
            break;
          }
          container = container.parentElement;
        }
      }
    } catch (e) {}
    return snToId;
  }

  // Deep recursive search for Shopee order object in React Fiber / Props / Vue
  function findShopeeOrderInNode(node, targetSn) {
    if (!node) return null;
    const snUpper = targetSn ? String(targetSn).trim().toUpperCase() : '';
    const elements = [node, ...Array.from(node.querySelectorAll ? node.querySelectorAll('*') : [])];

    for (const el of elements) {
      // Check Vue
      if (el.__vue__) {
        const d = el.__vue__.$data || el.__vue__.$props || el.__vue__;
        if (d && typeof d === 'object') {
          if (d.order_id && (!snUpper || String(d.order_sn || d.ordersn || '').toUpperCase() === snUpper)) {
            return d;
          }
        }
      }

      // Check React
      for (const k of Object.keys(el)) {
        if (k.startsWith('__reactProps$') || k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) {
          let curr = el[k];
          let depth = 0;
          while (curr && depth < 25) {
            const p = curr.memoizedProps || curr;
            if (p && typeof p === 'object') {
              if (p.order_id && (!snUpper || String(p.order_sn || p.ordersn || '').toUpperCase() === snUpper)) {
                return p;
              }
              for (const v of Object.values(p)) {
                if (v && typeof v === 'object') {
                  if (v.order_id && (!snUpper || String(v.order_sn || v.ordersn || '').toUpperCase() === snUpper)) {
                    return v;
                  }
                  if (v.order && v.order.order_id) {
                    if (!snUpper || String(v.order.order_sn || v.order.ordersn || '').toUpperCase() === snUpper) {
                      return v.order;
                    }
                  }
                }
              }
            }
            curr = curr.return;
            depth++;
          }
        }
      }
    }
    return null;
  }

  // Discover Shopee order list API from actual network resource entries
  async function getShopeeOrderListFromNetwork() {
    const snToOrderMap = new Map();
    const candidateUrls = [];

    try {
      const res = performance.getEntriesByType('resource') || [];
      for (let i = res.length - 1; i >= 0; i--) {
        const u = res[i].name || '';
        if (u.includes('shopee') && (
          u.includes('get_order_list') ||
          u.includes('get_shipment_order_list') ||
          u.includes('search_order') ||
          (u.includes('/order') && u.includes('type='))
        )) {
          if (!candidateUrls.includes(u)) candidateUrls.push(u);
        }
      }
    } catch (e) {}

    const { spcCds } = getShopeeTokens();
    const search = window.location.search || '?type=toship&source=to_process';
    if (spcCds) {
      candidateUrls.push(
        `/api/v3/order/get_shipment_order_list${search}&SPC_CDS=${spcCds}&SPC_CDS_VER=2&page_size=50&page_number=1`,
        `/api/v3/order/get_order_list${search}&SPC_CDS=${spcCds}&SPC_CDS_VER=2&page_size=50&page_number=1`
      );
    }

    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) continue;
        const json = await response.json();
        const d = json?.data || json;
        const list = d?.orders || d?.order_list || d?.list || d?.shipment_order_list || [];
        if (Array.isArray(list) && list.length > 0) {
          for (const item of list) {
            const sn = String(item.order_sn || item.ordersn || item.id || '').trim().toUpperCase();
            if (sn) snToOrderMap.set(sn, item);
          }
          if (snToOrderMap.size > 0) break;
        }
      } catch (e) {}
    }
    return snToOrderMap;
  }

  // Hidden background probe: loads order detail in invisible same-origin iframe to extract "Số tiền cuối cùng"
  function fetchIncomeViaIframe(targetId, timeoutMs = 5000) {
    return new Promise((resolve) => {
      let resolved = false;
      const iframe = document.createElement('iframe');
      iframe.id = '__shopee_income_probe_' + targetId;
      iframe.style.cssText = 'position:fixed;width:10px;height:10px;opacity:0.001;pointer-events:none;left:-9999px;top:-9999px;z-index:-1;';
      iframe.src = '/portal/sale/order/' + targetId;

      const cleanup = () => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (e) {}
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, timeoutMs);

      let checks = 0;
      const interval = setInterval(() => {
        if (resolved) {
          clearInterval(interval);
          return;
        }
        checks++;
        try {
          const idoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!idoc) return;
          const text = idoc.body?.innerText || '';

          // Check if page rendered the income
          const finalMatch = text.match(/(?:Số tiền cuối cùng|Doanh thu đơn hàng ước tính|Thực nhận)\s*[:：]?\s*[₫đ]?\s*([\d.,]+)/i);
          if (finalMatch) {
            const finalAmount = cleanMoney(finalMatch[1]);
            if (finalAmount > 0) {
              resolved = true;
              clearInterval(interval);
              clearTimeout(timer);

              const bpMatch = text.match(/(?:Tổng số tiền Người mua thanh toán|Tổng tiền Thanh toán|Thanh toán của Người Mua)[\s\S]{0,60}?[₫đ]\s*([\d.,]+)/i);
              const buyerPayment = bpMatch ? cleanMoney(bpMatch[1]) : 0;

              // Inspect iframe performance to discover the exact API endpoint template!
              try {
                const resEntries = iframe.contentWindow?.performance?.getEntriesByType('resource') || [];
                for (const r of resEntries) {
                  const u = r.name || '';
                  if (u.includes('/api/') && (u.includes('order') || u.includes('income') || u.includes('escrow') || u.includes('finance'))) {
                    if (u.includes(String(targetId))) {
                      window.__SHOPEE_DISCOVERED_DETAIL_API_TEMPLATE__ = u.replace(String(targetId), '{ORDER_ID}');
                      break;
                    }
                  }
                }
              } catch (e) {}

              cleanup();
              resolve({ finalAmount, buyerPayment });
              return;
            }
          }
        } catch (e) {}

        if (checks >= 25) { // 25 * 200ms = 5000ms
          resolved = true;
          clearInterval(interval);
          clearTimeout(timer);
          cleanup();
          resolve(null);
        }
      }, 200);

      document.body.appendChild(iframe);
    });
  }

  // 3-Tier cascade to resolve real income (finalAmount)
  async function resolveIncomeForOrder(orderId, orderSn, currentBuyerPayment = 0) {
    const cache = window.__SHOPEE_REVENUE_CACHE__ || { ordersBySn: {}, ordersById: {} };

    // Tier 1: Check in-memory intercepted cache
    if (orderSn && cache.ordersBySn?.[orderSn]?.finalAmount > 0) {
      return cache.ordersBySn[orderSn];
    }
    if (orderId && cache.ordersById?.[orderId]?.finalAmount > 0) {
      return cache.ordersById[orderId];
    }

    // Tier 2: If we discovered the exact detail API template from a previous order:
    if (window.__SHOPEE_DISCOVERED_DETAIL_API_TEMPLATE__ && orderId) {
      try {
        const u = window.__SHOPEE_DISCOVERED_DETAIL_API_TEMPLATE__.replace('{ORDER_ID}', orderId);
        const res = await fetch(u, { credentials: 'include' });
        if (res.ok) {
          const j = await res.json();
          const d = j?.data || j;
          const inc = d?.order_income || d?.income_details || d?.escrow_detail || d?.seller_income || d;
          let rawFinal = inc?.seller_expected_income ?? inc?.escrow_amount ?? inc?.seller_net_income ?? inc?.final_amount;
          const finalAmount = cleanMoney(rawFinal);
          if (finalAmount > 0) {
            return {
              finalAmount,
              buyerPayment: cleanMoney(inc?.buyer_total_amount ?? d?.total_price) || currentBuyerPayment
            };
          }
        }
      } catch (e) {}
    }

    // Tier 2b: Try candidate Shopee internal endpoints with SPC_CDS
    const { spcCds } = getShopeeTokens();
    const candidateUrls = [];
    const q = spcCds ? `SPC_CDS=${spcCds}&SPC_CDS_VER=2` : '';

    if (orderId) {
      candidateUrls.push(
        `/api/v3/finance/get_order_income_components?order_id=${orderId}&${q}`,
        `/api/v3/order/get_order_detail?order_id=${orderId}&${q}`,
        `/api/v3/finance/order/income_detail?order_id=${orderId}&${q}`,
        `/api/v3/finance/get_escrow_detail?order_id=${orderId}&${q}`,
        `/api/v3/order/get_order_income?order_id=${orderId}&${q}`,
        `/api/v2/payment/get_escrow_detail?order_id=${orderId}&${q}`
      );
    }
    if (orderSn) {
      candidateUrls.push(
        `/api/v3/order/get_order_detail?order_sn=${orderSn}&${q}`,
        `/api/v3/finance/get_order_income_components?order_sn=${orderSn}&${q}`
      );
    }

    for (const u of candidateUrls) {
      try {
        const res = await fetch(u, { credentials: 'include' });
        if (!res.ok) continue;
        const j = await res.json();
        const d = j?.data || j;
        const inc = d?.order_income || d?.income_details || d?.escrow_detail || d?.seller_income || d;
        if (inc && typeof inc === 'object') {
          let rawFinal = inc.seller_expected_income ?? inc.escrow_amount ?? inc.seller_net_income ?? inc.final_amount ?? inc.actual_amount;
          const finalAmount = cleanMoney(rawFinal);
          if (finalAmount > 0) {
            return {
              finalAmount,
              buyerPayment: cleanMoney(inc.buyer_total_amount ?? d?.total_price) || currentBuyerPayment,
              breakdown: {
                serviceFee: cleanMoney(inc.service_fee),
                transactionFee: cleanMoney(inc.seller_transaction_fee),
                tax: cleanMoney(inc.tax_amount),
                commissionFee: cleanMoney(inc.commission_fee)
              }
            };
          }
        }
      } catch (e) {}
    }

    // Tier 3: Hidden background iframe probe (Guaranteed Fallback)
    const targetId = orderId || orderSn;
    if (targetId) {
      try {
        const iframeResult = await fetchIncomeViaIframe(targetId, 5000);
        if (iframeResult && iframeResult.finalAmount > 0) {
          return iframeResult;
        }
      } catch (e) {}
    }

    return null;
  }

  const revenueParser = {
    detectActiveTab(doc = document) {
      const activeBtn = doc.querySelector('.shopee-tabs__nav-item.active, [role="tab"][aria-selected="true"], .order-tab.active');
      if (activeBtn) {
        const txt = activeBtn.innerText || activeBtn.textContent || '';
        if (/Chờ\s*lấy\s*hàng/i.test(txt)) return 'Chờ lấy hàng';
        if (/Đang\s*giao/i.test(txt)) return 'Đang giao';
        if (/Đã\s*giao/i.test(txt)) return 'Đã giao';
        if (/Trả\s*hàng|Hủy/i.test(txt)) return 'Đã hủy';
      }
      const u = window.location.href;
      if (u.includes('type=toship') || u.includes('source=to_process')) return 'Chờ lấy hàng';
      if (u.includes('type=shipping')) return 'Đang giao';
      if (u.includes('type=completed')) return 'Đã giao';
      if (u.includes('type=cancelled')) return 'Đã hủy';
      return 'Chờ lấy hàng';
    },

    // Parse Order Detail Page (Screenshot 2: /portal/sale/order/<id>)
    parseDetailPage(doc = document) {
      const text = doc.body.innerText || doc.body.textContent || '';
      const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
      const flat = lines.join('\n');

      const id = flat.match(/Mã\s*đơn\s*hàng\s*[:：]?\s*([A-Z0-9_-]{8,50})/i)?.[1]?.toUpperCase() ||
        flat.match(/\b([0-9]{2}[0-9A-Z]{12,24})\b/)?.[1]?.toUpperCase() || '';

      const pathMatch = window.location.pathname.match(/\/portal\/sale\/order\/(\d+)/);
      const detailId = pathMatch ? pathMatch[1] : '';

      let buyer = flat.match(/(?:Người mua|Tài khoản người mua|Khách hàng)\s*[:：]?\s*([^\n]+)/i)?.[1]?.trim() || '—';

      const carriers = [
        'Giao Hàng Nhanh', 'Giao Hàng Tiết Kiệm', 'Shopee Express', 'SPX Express',
        'Viettel Post', 'Vietnam Post', 'Ninja Van', 'BEST Express', 'J&T Express',
        'GrabExpress', 'beDelivery', 'J&T', 'GHN', 'GHTK', 'Nhanh', 'Tiết kiệm', 'Hỏa Tốc'
      ];
      let carrier = '—';
      for (const c of carriers) {
        if (new RegExp(`\\b${c}\\b`, 'i').test(flat)) {
          carrier = c;
          break;
        }
      }

      let status = 'Đã giao';
      if (/Chờ\s*lấy\s*hàng/i.test(flat)) status = 'Chờ lấy hàng';
      else if (/Đang\s*giao|Đang\s*vận\s*chuyển/i.test(flat)) status = 'Đang giao';
      else if (/Đã\s*giao|Giao\s*hàng\s*thành\s*công/i.test(flat)) status = 'Đã giao';

      let buyerPayment = 0;
      const bpMatch = flat.match(/(?:Tổng số tiền Người mua thanh toán|Tổng tiền Thanh toán|Thanh toán của Người Mua)[\s\S]{0,60}?[₫đ]\s*([\d.,]+)/i) ||
        flat.match(/Tổng tiền sản phẩm\s*[₫đ]\s*([\d.,]+)/i);
      if (bpMatch) buyerPayment = cleanMoney(bpMatch[1]);

      let finalAmount = 0;
      const finalMatch = flat.match(/(?:Số tiền cuối cùng|Doanh thu đơn hàng ước tính|Thực nhận)\s*[:：]?\s*[₫đ]?\s*([\d.,]+)/i);
      if (finalMatch) finalAmount = cleanMoney(finalMatch[1]);

      if (finalAmount <= 0 && buyerPayment > 0) {
        finalAmount = buyerPayment;
      }

      const items = [];
      const itemRows = doc.querySelectorAll('tr, .order-item, .product-item');
      for (const row of itemRows) {
        const rowText = row.innerText || '';
        const qtyMatch = rowText.match(/[x×]\s*(\d{1,4})/i) || rowText.match(/\b(\d{1,4})\s+[\d.,]+$/);
        if (qtyMatch && /[₫đ]|\b[\d.,]{4,}\b/.test(rowText)) {
          const rowLines = rowText.split(/\n+/).map(x => x.trim()).filter(Boolean);
          const name = rowLines[0] || 'Sản phẩm';
          const variant = rowLines.find(l => /Variation|Phân loại/i.test(l))?.replace(/Variation|Phân loại\s*[:：]?/i, '').trim() || '';
          const qty = parseInt(qtyMatch[1], 10) || 1;
          items.push({ name, variant, sku: '', qty });
        }
      }

      if (!items.length) {
        items.push({ name: 'Sản phẩm Shopee', variant: '', sku: '', qty: 1 });
      }

      return [{
        id: id || detailId || 'SHOPEE_ORDER',
        detailId,
        buyer,
        carrier,
        status: normalizeStatus(status),
        items,
        totalQty: items.reduce((s, i) => s + (i.qty || 1), 0),
        buyerPayment,
        finalAmount,
        diffAmount: Math.max(0, buyerPayment - finalAmount),
        isPendingFinal: false,
        readAt: new Date().toISOString()
      }];
    },

    // Parse card from order list (Screenshot 1)
    parseListCard(cardEl, activeTab = '', networkOrderMap = new Map(), domLinkMap = new Map()) {
      const text = cardEl.innerText || cardEl.textContent || '';
      const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
      const flat = lines.join('\n');

      // Order SN (e.g. 261028SRJJ39RA)
      const id = flat.match(/Mã\s*đơn\s*hàng\s*[:：]?\s*([A-Z0-9_-]{8,50})/i)?.[1]?.toUpperCase() ||
        flat.match(/\b([0-9]{2}[0-9A-Z]{12,24})\b/)?.[1]?.toUpperCase();
      if (!id) return null;

      // Check network-matched order object
      const netOrd = networkOrderMap.get(id);

      // Extract React / Vue order data if accessible
      const reactOrd = findShopeeOrderInNode(cardEl, id);

      // Detail ID (numeric order_id e.g. 246885386225418)
      let detailId = (netOrd?.order_id ? String(netOrd.order_id) : '') ||
        domLinkMap.get(id) ||
        (reactOrd?.order_id ? String(reactOrd.order_id) : '');

      if (!detailId) {
        const links = Array.from(cardEl.querySelectorAll ? cardEl.querySelectorAll('a') : []);
        for (const link of links) {
          const href = link.getAttribute('href') || link.getAttribute('data-href') || '';
          const m = href.match(/\/portal\/sale\/order\/(\d{10,25})/);
          if (m) { detailId = m[1]; break; }
        }
      }
      if (!detailId) {
        const inputs = Array.from(cardEl.querySelectorAll ? cardEl.querySelectorAll('input, button, [data-order-id], [data-id]') : []);
        for (const inp of inputs) {
          const val = inp.getAttribute('data-order-id') || inp.getAttribute('data-id') || inp.value || '';
          if (/^\d{10,25}$/.test(val)) { detailId = val; break; }
        }
      }

      // Buyer
      let buyer = netOrd?.buyer_user?.user_name || netOrd?.buyer_user?.username || reactOrd?.buyer_user?.user_name || reactOrd?.buyer_user?.username || '';
      if (!buyer) {
        buyer = flat.match(/(?:Người mua|Tài khoản người mua)\s*[:：]\s*([^\n]+)/i)?.[1];
      }
      if (!buyer) {
        const idIdx = lines.findIndex(l => /Mã\s*đơn\s*hàng/i.test(l));
        if (idIdx > 0) {
          const prev = lines[idIdx - 1].trim();
          if (/^[a-z0-9_.-]{3,60}$/i.test(prev) && !/^(?:Mã|₫|đ|Chờ|Đã|Nhanh)/i.test(prev)) buyer = prev;
        }
        if (!buyer && lines[0] && /^[a-z0-9_.-]{3,60}$/i.test(lines[0])) buyer = lines[0];
      }
      buyer = (buyer || '—').trim();

      // Carrier
      const carriers = [
        'Giao Hàng Nhanh', 'Giao Hàng Tiết Kiệm', 'Shopee Express', 'SPX Express',
        'Viettel Post', 'Vietnam Post', 'Ninja Van', 'BEST Express', 'J&T Express',
        'GrabExpress', 'beDelivery', 'J&T', 'GHN', 'GHTK', 'Hỏa Tốc', 'Tiết kiệm', 'Nhanh'
      ];
      let carrier = netOrd?.shipping_carrier || reactOrd?.shipping_carrier || '—';
      if (carrier === '—') {
        for (const c of carriers) {
          if (new RegExp(`\\b${c}\\b`, 'i').test(flat)) {
            carrier = c;
            break;
          }
        }
      }

      // Status
      let rawStatus = activeTab;
      if (!rawStatus) {
        if (/Chờ\s*lấy\s*hàng/i.test(flat)) rawStatus = 'Chờ lấy hàng';
        else if (/Đang\s*giao|Đang\s*vận\s*chuyển/i.test(flat)) rawStatus = 'Đang giao';
        else if (/Đã\s*giao|Giao\s*hàng\s*thành\s*công/i.test(flat)) rawStatus = 'Đã giao';
      }
      const status = normalizeStatus(rawStatus || 'Chờ lấy hàng');

      // Buyer Payment
      let buyerPayment = netOrd?.total_price ? cleanMoney(netOrd.total_price) : (reactOrd?.total_price ? cleanMoney(reactOrd.total_price) : 0);
      if (!buyerPayment) {
        const paymentMatch = flat.match(/(?:Tổng số tiền Người mua thanh toán|Người mua thanh toán|Tổng tiền Thanh toán)[\s\S]{0,60}?[₫đ]\s*([\d.,]+)/i) ||
          flat.match(/[₫đ]\s*([\d.,]+)[\s\S]{0,40}?(?:Thanh toán khi nhận hàng|Đã thanh toán|Người mua thanh toán|Thanh toán qua)/i) ||
          flat.match(/[₫đ]\s*([\d.,]+)/i);
        if (paymentMatch) buyerPayment = cleanMoney(paymentMatch[1]);
      }

      // Final Amount from DOM if present
      let finalAmount = 0;
      const finalMatch = flat.match(/(?:Số tiền cuối cùng|Doanh thu đơn hàng ước tính|Thực nhận|Người bán thực nhận)\s*[:：]?\s*(?:₫|đ)?\s*([\d.,]+)/i);
      if (finalMatch) finalAmount = cleanMoney(finalMatch[1]);

      // Items
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
          while (p >= 0 && n - p <= 6 && !boundary.test(lines[p])) {
            names.unshift(lines[p]);
            p--;
          }
          name = names.join(' ').trim();
        }

        const after = lines.slice(n + 1, n + 5);
        for (const line of after) {
          if (/^(?:Variation|Phân loại(?: hàng)?)\s*[:：]?\s*(.+)/i.test(line)) {
            variant = line.replace(/^(?:Variation|Phân loại(?: hàng)?)\s*[:：]?\s*/i, '').trim();
          }
          if (/^(?:SKU(?: phân loại)?|Mã SKU)\s*[:：]?\s*(.+)/i.test(line)) {
            sku = line.replace(/^(?:SKU(?: phân loại)?|Mã SKU)\s*[:：]?\s*/i, '').trim();
          }
        }

        if (name && name.length >= 2) {
          items.push({
            name,
            variant: variant || 'Mặc định',
            sku,
            qty: parseInt(q[2], 10) || 1
          });
        }
      }

      if (!items.length) {
        items.push({ name: 'Sản phẩm Shopee', variant: 'Mặc định', sku: '', qty: 1 });
      }

      const totalQty = items.reduce((s, i) => s + (i.qty || 1), 0);

      return {
        id,
        detailId,
        buyer,
        carrier,
        status,
        items,
        totalQty,
        buyerPayment,
        finalAmount,
        diffAmount: (finalAmount > 0) ? Math.max(0, buyerPayment - finalAmount) : 0,
        isPendingFinal: finalAmount <= 0,
        readAt: new Date().toISOString()
      };
    },

    // Extract all orders from document with automatic finalAmount resolution
    async extract(doc = document, onProgress = null) {
      if(location.pathname.startsWith('/portal/finance/income')){if(!globalThis.ShopFlowFinanceParser)throw Error('Tải lại extension để bật bộ đọc Chưa thanh toán.');return globalThis.ShopFlowFinanceParser.extract(doc);}
      const isDetail = window.location.pathname.includes('/portal/sale/order/') && !window.location.search.includes('type=');
      if (isDetail) {
        return {
          currentTab: 'Chi tiết đơn hàng',
          orders: revenueParser.parseDetailPage(doc),
          warnings: []
        };
      }

      const activeTab = revenueParser.detectActiveTab(doc);

      // Pre-discovery:
      // 1. Map order_sn -> numeric order_id via Shopee order list API
      const networkOrderMap = await getShopeeOrderListFromNetwork();
      // 2. Map order_sn -> detailId via DOM links
      const domLinkMap = mapDomOrderLinks(doc);

      // Find order cards in DOM
      const labels = [];
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let current;
      while ((current = walker.nextNode())) {
        if (/Mã\s*đơn\s*hàng/i.test(current.textContent || '')) {
          const el = current.parentElement;
          if (el && !labels.includes(el) && el.getClientRects().length) labels.push(el);
        }
      }

      const cards = [];
      for (const label of labels) {
        let node = label, best = null;
        for (let i = 0; i < 12 && node && node !== doc.body; i++, node = node.parentElement) {
          const text = node.innerText || node.textContent || '';
          const count = (text.match(/Mã\s*đơn\s*hàng/gi) || []).length;
          if (count > 1) break;
          if (count === 1 && /[₫đ]\s*[\d.,]+/i.test(text)) best = node;
        }
        if (best && !cards.some(c => c === best || c.contains(best) || best.contains(c))) {
          cards.push(best);
        }
      }

      const orders = [];
      let exactFinalCount = 0;

      for (let idx = 0; idx < cards.length; idx++) {
        const card = cards[idx];
        const o = revenueParser.parseListCard(card, activeTab, networkOrderMap, domLinkMap);
        if (!o || !o.id) continue;

        if (!o.detailId) {
          if (networkOrderMap.has(o.id)) o.detailId = String(networkOrderMap.get(o.id).order_id || '');
          if (!o.detailId && domLinkMap.has(o.id)) o.detailId = domLinkMap.get(o.id);
        }

        // Resolve real finalAmount if pending
        if (o.finalAmount <= 0) {
          try {
            const resolved = await resolveIncomeForOrder(o.detailId, o.id, o.buyerPayment);
            if (resolved && resolved.finalAmount > 0) {
              o.finalAmount = resolved.finalAmount;
              o.isPendingFinal = false;
              if (resolved.buyerPayment && resolved.buyerPayment > 0) o.buyerPayment = resolved.buyerPayment;
              if (resolved.breakdown) o.breakdown = resolved.breakdown;
              exactFinalCount++;
            }
          } catch (e) {}
        } else {
          exactFinalCount++;
        }

        // Fallback calculation if still unresolved
        if (o.finalAmount <= 0) {
          o.isPendingFinal = true;
          o.finalAmount = o.buyerPayment || 0;
          o.diffAmount = 0;
        } else {
          o.isPendingFinal = false;
          o.diffAmount = Math.max(0, (o.buyerPayment || 0) - o.finalAmount);
        }

        if (!orders.some(x => x.id === o.id)) {
          orders.push(o);
        }

        if (typeof onProgress === 'function') {
          onProgress({ current: idx + 1, total: cards.length, order: o });
        }
      }

      return {
        currentTab: activeTab,
        orders,
        exactFinalCount,
        mappedIdsCount: networkOrderMap.size || domLinkMap.size,
        warnings: orders.length === 0 ? ['Chưa tìm thấy đơn hàng trên trang này. Hãy đảm bảo bạn đang mở banhang.shopee.vn và danh sách đơn đã tải xong.'] : []
      };
    }
  };

  globalThis.ShopFlowRevenueParser = revenueParser;
  globalThis.ShopFlowRevenueHelpers = {
    cleanMoney,
    normalizeStatus,
    getShopeeTokens,
    resolveIncomeForOrder,
    fetchIncomeViaIframe,
    getShopeeOrderListFromNetwork
  };
})();
