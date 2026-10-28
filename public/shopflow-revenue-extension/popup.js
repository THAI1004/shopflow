const el = id => document.getElementById(id);
let orders = [];

function formatVND(amount) {
  const n = typeof amount === 'number' ? amount : (parseInt(String(amount || 0).replace(/[^0-9]/g, ''), 10) || 0);
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
}

function updateKPI() {
  let totalFinal = 0;
  let totalBuyer = 0;
  let pendingExactCount = 0;
  let countPending = 0;
  let countShipping = 0;
  let countDelivered = 0;

  for (const o of orders) {
    const buyerAmt = Number(o.buyerPayment) || 0;
    const finalAmt = (Number(o.finalAmount) > 0) ? Number(o.finalAmount) : buyerAmt;
    totalBuyer += buyerAmt;
    totalFinal += finalAmt;

    if (o.isPendingFinal) pendingExactCount++;

    const st = String(o.status || '');
    if (/chờ lấy hàng/i.test(st)) countPending++;
    else if (/đang giao/i.test(st)) countShipping++;
    else if (/đã giao/i.test(st)) countDelivered++;
  }

  const fees = Math.max(0, totalBuyer - totalFinal);
  const pendingNote = pendingExactCount > 0 ? ` (${pendingExactCount} đơn tạm tính)` : '';

  el('kpiFinal').textContent = formatVND(totalFinal) + pendingNote;
  el('kpiBuyer').textContent = formatVND(totalBuyer);
  el('kpiFees').textContent = '-' + formatVND(fees);

  el('countPending').textContent = countPending;
  el('countShipping').textContent = countShipping;
  el('countDelivered').textContent = countDelivered;
  el('countTotal').textContent = orders.length;

  el('btnSend').disabled = orders.length === 0;
  el('btnExcel').disabled = orders.length === 0;
  el('btnJson').disabled = orders.length === 0;
}

async function load() {
  const s = await chrome.storage.local.get(['draftRevenueOrders', 'revenueTarget']);
  orders = s.draftRevenueOrders || [];
  if (s.revenueTarget) el('targetUrl').value = s.revenueTarget;
  updateKPI();

  // Check current active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const u = new URL(tab.url);
      if (u.hostname === 'banhang.shopee.vn') {
        let name = 'Tất cả';
        if (u.search.includes('type=toship') || u.search.includes('source=to_process')) name = 'Chờ lấy hàng';
        else if (u.search.includes('type=shipping')) name = 'Đang giao';
        else if (u.search.includes('type=completed')) name = 'Đã giao';
        else if (u.search.includes('type=cancelled')) name = 'Đã hủy';
        else if (u.pathname.includes('/portal/sale/order/')) name = 'Chi tiết đơn hàng';
        el('currentTabLabel').textContent = name;
      } else {
        el('currentTabLabel').textContent = 'Chưa mở Shopee Seller';
      }
    }
  } catch (e) {
    el('currentTabLabel').textContent = '—';
  }
}

el('btnRead').onclick = async () => {
  el('btnRead').disabled = true;
  el('btnRead').innerHTML = '<span>⏳</span> Đang đọc & đối soát...';
  el('log').textContent = '⏳ Đang quét danh sách và lấy doanh số thực nhận Shopee (hạch toán chi tiết)...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !new URL(tab.url).hostname.includes('banhang.shopee.vn')) {
      throw Error('Vui lòng mở trang Shopee Seller Center (banhang.shopee.vn) trước khi đọc.');
    }

    // Inject hook and parser script into MAIN world
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['injected-hook.js', 'parser.js']
    });

    // Execute extract in MAIN world
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async () => {
        if (!globalThis.ShopFlowRevenueParser) throw Error('Không tải được bộ đọc doanh số.');
        return await globalThis.ShopFlowRevenueParser.extract(document);
      }
    });

    const r = result?.[0]?.result;
    if (!r || !Array.isArray(r.orders)) {
      throw Error('Không nhận được dữ liệu đơn từ trang này.');
    }

    // Deduplication check by ID
    const map = new Map(orders.map(o => [String(o.id).toUpperCase(), o]));
    let newCount = 0;
    let updatedCount = 0;

    for (const incoming of r.orders) {
      const key = String(incoming.id).toUpperCase();
      if (map.has(key)) {
        const prev = map.get(key);
        const incomingHasFinal = incoming.finalAmount && incoming.finalAmount > 0 && !incoming.isPendingFinal;
        const prevHasFinal = prev.finalAmount && prev.finalAmount > 0 && !prev.isPendingFinal;

        const finalAmount = incomingHasFinal ? incoming.finalAmount : (prevHasFinal ? prev.finalAmount : (incoming.finalAmount || prev.finalAmount || incoming.buyerPayment || 0));
        const isPendingFinal = incomingHasFinal ? false : (prevHasFinal ? false : (incoming.isPendingFinal ?? prev.isPendingFinal ?? false));

        map.set(key, {
          ...prev,
          ...incoming,
          finalAmount,
          isPendingFinal,
          diffAmount: Math.max(0, (incoming.buyerPayment || prev.buyerPayment || 0) - finalAmount),
          buyerPayment: (incoming.buyerPayment && incoming.buyerPayment > 0) ? incoming.buyerPayment : (prev.buyerPayment || 0),
          status: incoming.status || prev.status,
          carrier: (incoming.carrier && incoming.carrier !== '—') ? incoming.carrier : (prev.carrier || '—'),
          buyer: (incoming.buyer && incoming.buyer !== '—') ? incoming.buyer : (prev.buyer || '—')
        });
        updatedCount++;
      } else {
        map.set(key, incoming);
        newCount++;
      }
    }

    orders = [...map.values()];
    await chrome.storage.local.set({ draftRevenueOrders: orders });
    updateKPI();

    const exactCount = r.exactFinalCount ?? r.orders.filter(o => !o.isPendingFinal && o.finalAmount > 0).length;
    const logLines = [
      `✅ Đã đọc trang Shopee [${r.currentTab}]:`,
      `• Tìm thấy: ${r.orders.length} đơn trên trang`,
      exactCount > 0 ? `• Đã lấy thực nhận chính xác: ${exactCount}/${r.orders.length} đơn` : null,
      r.mappedIdsCount ? `• Đã liên kết mã hệ thống Shopee: ${r.mappedIdsCount} đơn` : null,
      `• Đơn mới thêm vào giỏ: ${newCount}`,
      `• Đơn trùng mã (đã cập nhật thông tin): ${updatedCount}`,
      `• Tổng giỏ tạm hiện tại: ${orders.length} đơn`
    ].filter(Boolean);

    if (r.orders.length > 0) {
      logLines.push('\nChi tiết các đơn vừa đọc:');
      r.orders.forEach(o => {
        const finalTxt = (o.finalAmount > 0 && !o.isPendingFinal)
          ? `${formatVND(o.finalAmount)} (Phí sàn: -${formatVND(o.diffAmount)})`
          : `${formatVND(o.finalAmount)} (Tạm tính)`;
        logLines.push(`• ${o.id} | ${o.buyer} | Khách: ${formatVND(o.buyerPayment)} -> Thực nhận: ${finalTxt} | ${o.carrier}`);
      });
    }

    if (exactCount < r.orders.length) {
      logLines.push('\n💡 Mẹo: Với các đơn đang tạm tính, bạn có thể click mở 1 đơn để extension tự động nhận diện API chi tiết doanh số.');
    }

    if (r.warnings?.length) {
      logLines.push('\n' + r.warnings.join('\n'));
    }

    el('log').textContent = logLines.join('\n');
  } catch (e) {
    el('log').textContent = '⚠️ Lỗi: ' + (e.message || String(e));
  } finally {
    el('btnRead').disabled = false;
    el('btnRead').innerHTML = '<span>📥</span> Đọc trang hiện tại';
  }
};

el('btnClear').onclick = async () => {
  if (!orders.length) return;
  if (!confirm('Xóa toàn bộ các đơn đang lưu trong giỏ tạm của extension?')) return;
  orders = [];
  await chrome.storage.local.remove(['draftRevenueOrders', 'pendingRevenueImport']);
  updateKPI();
  el('log').textContent = 'Đã xóa giỏ tạm. Bạn có thể mở lại tab Shopee và đọc lại.';
};

el('btnDiagnose').onclick = async () => {
  el('btnDiagnose').disabled = true;
  el('log').textContent = '🔍 Đang kiểm tra kết nối mạng và chẩn đoán cấu trúc Shopee...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !new URL(tab.url).hostname.includes('banhang.shopee.vn')) {
      throw Error('Vui lòng mở Shopee banhang.shopee.vn trước khi chẩn đoán.');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['injected-hook.js', 'parser.js']
    });

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async () => {
        const url = window.location.href;
        const cookies = document.cookie;
        const spcCdsMatch = cookies.match(/SPC_CDS=([^;]+)/);
        const spcCds = spcCdsMatch ? 'Có (' + spcCdsMatch[1].slice(0, 8) + '...)' : 'Không tìm thấy trong cookie';

        const resources = performance.getEntriesByType('resource') || [];
        const apiCalls = resources.filter(r => r.name.includes('/api/')).map(r => r.name);
        const orderApiCalls = apiCalls.filter(u => /order|shipment|finance|income|escrow/i.test(u));

        // Count cards in DOM
        const textNodes = [];
        const walker = document.createTreeWalker(document.body, 4);
        let n;
        while (n = walker.nextNode()) {
          if (/Mã\s*đơn\s*hàng/i.test(n.textContent || '')) textNodes.push(n.textContent.trim());
        }

        // Test probe for first order if found
        let testProbeResult = 'Chưa thử';
        const sampleSn = textNodes[0]?.match(/([0-9]{2}[0-9A-Z]{12,24})/)?.[1];
        if (sampleSn && globalThis.ShopFlowRevenueHelpers) {
          try {
            const probe = await globalThis.ShopFlowRevenueHelpers.resolveIncomeForOrder(null, sampleSn);
            testProbeResult = probe ? `Thành công! Thực nhận: ${probe.finalAmount} ₫` : 'API chưa trả về ngay';
          } catch (e) {
            testProbeResult = 'Lỗi probe: ' + (e.message || String(e));
          }
        }

        return {
          url,
          spcCds,
          totalApiCalls: apiCalls.length,
          orderApiCalls: orderApiCalls.slice(-5),
          cardsFound: textNodes.length,
          sampleSn: sampleSn || 'Không thấy',
          testProbeResult
        };
      }
    });

    const d = result?.[0]?.result;
    if (!d) throw Error('Không nhận được kết quả chẩn đoán.');

    const lines = [
      '🔍 KẾT QUẢ CHẨN ĐOÁN SHOPEE:',
      `• URL: ${d.url}`,
      `• Token SPC_CDS: ${d.spcCds}`,
      `• Số đơn nhận diện trên DOM: ${d.cardsFound} (Mã mẫu: ${d.sampleSn})`,
      `• Thử nghiệm lấy thực nhận: ${d.testProbeResult}`,
      `• Tổng số API đã gọi: ${d.totalApiCalls} requests`,
      `• Các API đơn hàng gần nhất:`,
      ...(d.orderApiCalls.length ? d.orderApiCalls.map(u => '  -> ' + u) : ['  (Chưa ghi nhận API đơn hàng nào)'])
    ];
    el('log').textContent = lines.join('\n');
  } catch (e) {
    el('log').textContent = '⚠️ Lỗi chẩn đoán: ' + (e.message || String(e));
  } finally {
    el('btnDiagnose').disabled = false;
  }
};

el('btnSend').onclick = async () => {
  if (!orders.length) return;
  try {
    const rawUrl = el('targetUrl').value.trim();
    const url = new URL(rawUrl);

    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw Error('Địa chỉ webapp cần HTTPS hoặc localhost/127.0.0.1.');
    }
    if (url.hostname === 'banhang.shopee.vn') {
      throw Error('Nhập địa chỉ của website ShopFlow, không phải địa chỉ Shopee.');
    }

    const pattern = url.protocol + '//' + url.hostname + (url.port ? ':' + url.port : '') + '/*';

    // 1. Check existing permissions or request permission safely
    try {
      const hasPerm = await chrome.permissions.contains({ origins: [pattern] }).catch(() => false);
      if (!hasPerm) {
        await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
      }
    } catch (e) {
      console.warn('Permissions request note:', e);
    }

    // 2. Register bridge script for dynamic domain if permitted
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ['shopflow-revenue-bridge'] }).catch(() => {});
      await chrome.scripting.registerContentScripts([{
        id: 'shopflow-revenue-bridge',
        matches: [pattern],
        js: ['bridge.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true
      }]).catch(() => {});
    } catch (e) {}

    // 3. Store in pendingRevenueImport
    await chrome.storage.local.set({
      pendingRevenueImport: {
        orders,
        at: Date.now(),
        origin: url.origin
      },
      revenueTarget: rawUrl
    });

    // 4. Check if target tab is already open
    const allTabs = await chrome.tabs.query({});
    const targetTab = allTabs.find(t => {
      try { return new URL(t.url).origin === url.origin; } catch { return false; }
    });

    if (targetTab) {
      await chrome.tabs.update(targetTab.id, { active: true });
      // Inject message directly to open tab
      try {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: (payload) => {
            window.postMessage({
              type: 'SHOPFLOW_REVENUE_IMPORT',
              orders: payload,
              timestamp: Date.now()
            }, location.origin);
          },
          args: [orders]
        });
      } catch (e) {}
    } else {
      await chrome.tabs.create({ url: rawUrl });
    }

    el('log').textContent = `🚀 Đã gửi ${orders.length} đơn sang Web ShopFlow (${url.origin}) thành công!\nHãy kiểm tra tab "Doanh số thực nhận" trên giao diện Web.`;
  } catch (e) {
    el('log').textContent = '⚠️ Lỗi gửi sang Web: ' + (e.message || String(e));
  }
};

el('btnExcel').onclick = async () => {
  if (!orders.length) return;
  try {
    const headers = ['Mã đơn hàng', 'Khách hàng', 'Sản phẩm', 'Số lượng', 'Trạng thái', 'Tiền khách trả', 'Thực nhận người bán', 'Chênh lệch phí sàn', 'Đơn vị vận chuyển', 'Thời gian đọc'];
    const rows = [headers];

    orders.forEach(o => {
      const itemsText = (o.items || []).map(i => `${i.name}${i.variant ? ' [' + i.variant + ']' : ''} x${i.qty}`).join('; ');
      rows.push([
        o.id,
        o.buyer || '—',
        itemsText,
        o.totalQty || 1,
        o.status,
        o.buyerPayment || 0,
        o.finalAmount || 0,
        o.diffAmount || 0,
        o.carrier || '—',
        o.readAt || ''
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Doanh-So-Shopee_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    el('log').textContent = `📊 Đã tải file CSV doanh số cho ${orders.length} đơn hàng.`;
  } catch (e) {
    el('log').textContent = '⚠️ Lỗi tải CSV: ' + (e.message || String(e));
  }
};

el('btnJson').onclick = () => {
  if (!orders.length) return;
  const blob = new Blob([JSON.stringify(orders, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ShopFlow_Revenue_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  el('log').textContent = `💾 Đã tải file JSON cho ${orders.length} đơn hàng.`;
};

load();
