document.getElementById('extensionVersion').textContent = 'v' + chrome.runtime.getManifest().version;
const el = id => document.getElementById(id);

// ==========================================
// 1. NAVIGATION TABS (Doanh số vs Nhân bản SP)
// ==========================================
el('tabNavRevenue').onclick = () => {
  el('tabNavRevenue').classList.add('active');
  el('tabNavCloner').classList.remove('active');
  el('panelRevenue').style.display = 'block';
  el('panelCloner').style.display = 'none';
};

el('tabNavCloner').onclick = () => {
  el('tabNavCloner').classList.add('active');
  el('tabNavRevenue').classList.remove('active');
  el('panelCloner').style.display = 'block';
  el('panelRevenue').style.display = 'none';
  checkClonerTabContext();
};

// ==========================================
// 2. DOANH SỐ THỰC NHẬN LOGIC
// ==========================================
let orders = [];
let payoutOverview = null;

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
    if(globalThis.ShopFlowRevenueState.isRevenueEligible(o)){totalBuyer += buyerAmt;totalFinal += finalAmt;}

    if (o.isPendingFinal && o.finalAmount > 0 && globalThis.ShopFlowRevenueState.isRevenueEligible(o)) pendingExactCount++;

    const st = String(o.status || '');
    if (/chờ lấy hàng/i.test(st)) countPending++;
    else if (/đang giao/i.test(st)) countShipping++;
    else if (/đã giao/i.test(st)) countDelivered++;
  }

  const fees = Math.max(0, totalBuyer - totalFinal);
  const pendingNote = pendingExactCount > 0 ? ` (${pendingExactCount} đơn tạm tính)` : '';

  const unpaid=orders.filter(o=>o.payoutStatus==='unpaid');
  el('kpiUnpaidOverview').textContent=payoutOverview?formatVND(payoutOverview.total):'Chưa đọc tổng Shopee';
  el('kpiUnpaidTime').textContent=payoutOverview?'Lần đọc: '+new Date(payoutOverview.at).toLocaleString('vi-VN'):'';
  el('kpiUnpaidCoverage').textContent=unpaid.length+' mã đã đọc ('+unpaid.filter(o=>o.pendingPayout>=0).length+' khoản không âm, '+unpaid.filter(o=>o.pendingPayout<0).length+' điều chỉnh âm). Các ô Đang giao / Đã giao bên dưới là trạng thái vận chuyển của giỏ chung.';
  el('kpiUnpaid').textContent = formatVND(orders.filter(o=>o.payoutStatus==='unpaid').reduce((sum,o)=>sum+(Number(o.pendingPayout)||0),0));
  el('kpiFinal').textContent = formatVND(totalFinal) + pendingNote;
  el('kpiBuyer').textContent = formatVND(totalBuyer);
  el('returnCount').textContent = orders.filter(o=>globalThis.ShopFlowRevenueState.isReturnOrder(o)).length+' đơn hoàn / yêu cầu trả hàng (loại khỏi doanh số dự kiến)';
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
  const s = await chrome.storage.local.get(['draftRevenueOrders', 'revenueTarget', 'savedClonerDraft', 'payoutOverview']);
  orders = s.draftRevenueOrders || [];
  payoutOverview=s.payoutOverview||null;
  if (s.revenueTarget) el('targetUrl').value = s.revenueTarget;
  updateKPI();

  if (s.savedClonerDraft) {
    renderSavedDraftBanner(s.savedClonerDraft);
  }

  // Check current active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const u = new URL(tab.url);
      if (u.hostname === 'banhang.shopee.vn') {
        let name = u.pathname.startsWith('/portal/finance/income')?'Doanh thu · Chưa thanh toán':'Tất cả';
        if (u.search.includes('type=toship') || u.search.includes('source=to_process')) name = 'Chờ lấy hàng';
        else if (u.search.includes('type=shipping')) name = 'Đang giao';
        else if (u.search.includes('type=completed')) name = 'Đã giao';
        else if (u.search.includes('type=cancelled')) name = 'Đã hủy';
        else if (u.pathname.includes('/portal/sale/order/')) name = 'Chi tiết đơn hàng';
        else if (u.pathname.includes('/portal/product/new')) name = 'Thêm sản phẩm mới';
        else if (u.pathname.includes('/portal/product/')) name = 'Sản phẩm Shopee';
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
  el('log').textContent = '⏳ Đang đọc. Với Chưa thanh toán: tự cuộn danh sách và tìm trang tiếp, tối đa 50 giây. Giữ popup mở và không đổi tab.';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !new URL(tab.url).hostname.includes('banhang.shopee.vn')) {
      throw Error('Vui lòng mở trang Shopee Seller Center (banhang.shopee.vn) trước khi đọc.');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['injected-hook.js', 'revenue-state.js', 'finance-parser.js', 'parser.js']
    });

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

    if(Number.isFinite(r.payoutOverviewTotal)){payoutOverview={total:r.payoutOverviewTotal,at:r.payoutOverviewReadAt};await chrome.storage.local.set({payoutOverview});}
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
          items: incoming.items?.length ? incoming.items : (prev.items || []),
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
    el('log').textContent = `✅ Đã đọc trang Shopee [${r.currentTab}]:\n• Tìm thấy: ${r.orders.length} đơn | Thực nhận chính xác: ${exactCount} đơn\n• Đơn mới: ${newCount} | Đơn cập nhật: ${updatedCount}\n• Tổng giỏ tạm: ${orders.length} đơn.\n${(r.warnings||[]).join("\n")}`;
  } catch (e) {
    el('log').textContent = '⚠️ Lỗi: ' + (e.message || String(e));
  } finally {
    el('btnRead').disabled = false;
    el('btnRead').innerHTML = '<span>📥</span> Đọc trang hiện tại';
  }
};

el('btnClear').onclick = async () => {
  if (!orders.length) return;
  if (!confirm(`Xóa toàn bộ ${orders.length} đơn đã đọc trong giỏ tạm?`)) return;
  orders = [];payoutOverview=null;
  await chrome.storage.local.set({ draftRevenueOrders: [],payoutOverview:null });
  updateKPI();
  el('log').textContent = 'Đã xóa giỏ tạm. Bạn có thể bấm Đọc lại từ đầu.';
};

el('btnDiagnose').onclick = async () => {
  el('btnDiagnose').disabled = true;
  el('log').textContent = '🔍 Đang chẩn đoán kết nối và API Shopee...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !new URL(tab.url).hostname.includes('banhang.shopee.vn')) {
      throw Error('Vui lòng mở Kênh Người Bán Shopee.');
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['injected-hook.js', 'revenue-state.js', 'finance-parser.js', 'parser.js']
    });
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => ({
        url: window.location.href,
        hasCache: !!window.__SHOPEE_REVENUE_CACHE__,
        hasProductCache: !!window.__SHOPEE_PRODUCT_CACHE__?.currentItem
      })
    });
    const d = result?.[0]?.result;
    el('log').textContent = `🔍 Chẩn đoán:\n• URL: ${d?.url}\n• Hook Doanh số: ${d?.hasCache ? 'OK' : 'Chưa'}\n• Cache Sản phẩm: ${d?.hasProductCache ? 'Có dữ liệu' : 'Chưa có'}`;
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
    const pattern = url.protocol + '//' + url.hostname + (url.port ? ':' + url.port : '') + '/*';

    await chrome.storage.local.set({
      pendingRevenueImport: { orders, at: Date.now(), origin: url.origin },
      revenueTarget: rawUrl
    });

    const allTabs = await chrome.tabs.query({});
    const targetTab = allTabs.find(t => {
      try { return new URL(t.url).origin === url.origin; } catch { return false; }
    });

    if (targetTab) {
      await chrome.tabs.update(targetTab.id, { active: true });
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: (payload) => {
          window.postMessage({ type: 'SHOPFLOW_REVENUE_IMPORT', orders: payload, timestamp: Date.now() }, location.origin);
        },
        args: [orders]
      }).catch(() => {});
    } else {
      await chrome.tabs.create({ url: rawUrl });
    }

    el('log').textContent = `🚀 Đã gửi ${orders.length} đơn sang Web ShopFlow (${url.origin}) thành công!`;
  } catch (e) {
    el('log').textContent = '⚠️ Lỗi gửi sang Web: ' + (e.message || String(e));
  }
};

el('btnExcel').onclick = () => {
  if (!orders.length) return;
  const headers = ['Mã đơn hàng', 'Khách hàng', 'Sản phẩm', 'Số lượng', 'Trạng thái', 'Tiền khách trả', 'Thực nhận người bán', 'Chênh lệch phí sàn', 'Đơn vị vận chuyển'];
  const rows = [headers];
  orders.forEach(o => {
    const itemsText = (o.items || []).map(i => `${i.name}${i.variant ? ' [' + i.variant + ']' : ''} x${i.qty}`).join('; ');
    rows.push([o.id, o.buyer || '—', itemsText, o.totalQty || 1, o.status, o.buyerPayment || 0, o.finalAmount || 0, o.diffAmount || 0, o.carrier || '—']);
  });
  const csvContent = '\uFEFF' + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Doanh-So-Shopee_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
};

// ==========================================
// 3. PRODUCT CLONER & AUTO-FILL LOGIC
// ==========================================
let currentRawProduct = null;
let currentSpunProduct = null;

async function checkClonerTabContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const u = new URL(tab.url);
    if (!u.hostname.includes('banhang.shopee.vn')) {
      el('clonerStatusText').innerHTML = 'Chưa mở Shopee. Hãy mở <strong style="color:var(--orange)">banhang.shopee.vn</strong>';
      return;
    }

    if (u.pathname.includes('/portal/product/new')) {
      el('clonerStatusText').innerHTML = 'Phát hiện: <strong style="color:var(--orange)">Trang Thêm SP mới (Shop Phụ)</strong>';
      el('clonerLog').textContent = '👉 Đang ở trang Thêm SP mới! Bấm nút "Điền Tự Động Vào Form" bên dưới.';
    } else if (u.pathname.includes('/portal/product/')) {
      el('clonerStatusText').innerHTML = 'Phát hiện: <strong style="color:var(--primary)">Trang Sửa/Xem SP (Shop Chính)</strong>';
      el('clonerLog').textContent = '👉 Đang ở trang SP Shop Chính! Bấm "Lấy & Biến Tính SP Này" để bắt đầu sao chép.';
    } else {
      el('clonerStatusText').innerHTML = 'Shopee: <strong style="color:var(--primary)">Kênh Người Bán</strong>';
    }
  } catch (e) {
    el('clonerStatusText').textContent = '—';
  }
}

function renderSavedDraftBanner(draft) {
  if (!draft) return;
  el('savedDraftBanner').style.display = 'block';
  el('savedDraftTitle').textContent = draft.spunName || draft.name || 'Sản phẩm đã sao chép';
  const modelCount = draft.models?.length || 1;
  const imgCount = draft.images?.length || 0;
  el('savedDraftMeta').textContent = `${modelCount} phân loại · ${imgCount} ảnh đã lưu`;
}

// 3.1 Extract product from current page
el('btnExtractProduct').onclick = async () => {
  el('btnExtractProduct').disabled = true;
  el('btnExtractProduct').innerHTML = '<span>⏳</span> Đang bóc tách dữ liệu SP...';
  el('clonerLog').textContent = '⏳ Đang quét thông tin sản phẩm từ Shopee...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !new URL(tab.url).hostname.includes('banhang.shopee.vn')) {
      throw Error('Vui lòng mở trang chi tiết sản phẩm trên Shopee (banhang.shopee.vn).');
    }

    // Inject cloner script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['injected-hook.js', 'product-cloner.js']
    });

    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        if (!globalThis.ShopFlowProductCloner) throw Error('Không tải được module đọc sản phẩm.');
        return globalThis.ShopFlowProductCloner.extractFromCurrentPage(document);
      }
    });

    const raw = res?.[0]?.result;
    if (!raw || (!raw.name && !raw.price)) {
      throw Error('Chưa tìm thấy thông tin sản phẩm trên trang này. Hãy chắc chắn bạn đang mở trang Sửa hoặc Chi tiết sản phẩm.');
    }

    currentRawProduct = raw;
    applySpinning();

    el('clonerPreviewCard').style.display = 'block';
    el('clonerLog').textContent = `✅ Đã bóc tách thành công sản phẩm:\n"${raw.name.slice(0, 45)}..."\n• ${raw.models?.length || 1} phân loại | ${raw.images?.length || 0} ảnh sản phẩm.`;
  } catch (e) {
    el('clonerLog').textContent = '⚠️ Lỗi: ' + (e.message || String(e));
  } finally {
    el('btnExtractProduct').disabled = false;
    el('btnExtractProduct').innerHTML = '<span>⚡</span> Lấy & Biến Tính SP Này';
  }
};

function applySpinning() {
  if (!currentRawProduct) return;
  const Cloner = globalThis.ShopFlowProductCloner;
  if (!Cloner) return;

  const prefixType = el('selPrefix').value;
  const spunTitle = Cloner.spinTitle(currentRawProduct.name, prefixType);
  const spunDesc = Cloner.spinDescription(currentRawProduct.description);

  el('spunTitleInput').value = spunTitle;
  el('charCountTitle').textContent = `${spunTitle.length}/120`;
  el('spunDescInput').value = spunDesc;

  const prefixSku = el('skuPrefixInput').value.trim() || 'S2-';
  const priceType = el('priceAdjType').value;
  const priceVal = parseFloat(el('priceAdjValue').value) || 0;

  // Process models with new prices & SKUs
  const models = (currentRawProduct.models && currentRawProduct.models.length > 0)
    ? currentRawProduct.models.map(m => {
        const adjPrice = Cloner.adjustPrice(m.price, priceType, priceVal);
        return {
          ...m,
          price: adjPrice,
          sku: Cloner.generateVariantSku(currentRawProduct.name, m.name, m.sku, prefixSku)
        };
      })
    : [];

  const singlePrice = Cloner.adjustPrice(currentRawProduct.price, priceType, priceVal);
  const singleSku = Cloner.generateVariantSku(currentRawProduct.name, 'Chính', currentRawProduct.sku, prefixSku);

  currentSpunProduct = {
    ...currentRawProduct,
    spunName: spunTitle,
    spunDescription: spunDesc,
    price: singlePrice,
    sku: singleSku,
    models,
    images: currentRawProduct.images || []
  };

  el('badgeModelCount').textContent = `${models.length || 1} phân loại`;
  el('imageCountText').textContent = `${currentSpunProduct.images.length} ảnh`;

  // Render Category & Shipping
  el('previewCategoryText').textContent = currentRawProduct.category || 'Mặc định Shopee';
  el('previewShippingText').textContent = `${currentRawProduct.weight || 500}g (${currentRawProduct.dimension?.length || 20}x${currentRawProduct.dimension?.width || 15}x${currentRawProduct.dimension?.height || 10}cm)`;

  // Render Models in preview box
  el('badgeVariationSummary').textContent = `${models.length || 1} dòng`;
  if (models.length > 0) {
    el('previewModelsBox').innerHTML = models.map(m => `
      <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px dotted var(--line)">
        <span><b>${m.name}</b> <small style="color:var(--muted)">[${m.sku}]</small></span>
        <span style="color:var(--green);font-weight:700">${formatVND(m.price)} <small style="color:var(--muted)">(kho: ${m.stock || 100})</small></span>
      </div>
    `).join('');
  } else {
    el('previewModelsBox').innerHTML = `
      <div style="display:flex;justify-content:space-between">
        <span><b>Sản phẩm đơn</b> <small>[${singleSku}]</small></span>
        <span style="color:var(--green);font-weight:700">${formatVND(singlePrice)}</span>
      </div>
    `;
  }
}

// Re-spin buttons
el('btnRespinTitle').onclick = () => {
  if (!currentRawProduct) return;
  const spun = globalThis.ShopFlowProductCloner.spinTitle(currentRawProduct.name, el('selPrefix').value);
  el('spunTitleInput').value = spun;
  el('charCountTitle').textContent = `${spun.length}/120`;
  if (currentSpunProduct) currentSpunProduct.spunName = spun;
};

el('btnRespinDesc').onclick = () => {
  if (!currentRawProduct) return;
  const spun = globalThis.ShopFlowProductCloner.spinDescription(currentRawProduct.description);
  el('spunDescInput').value = spun;
  if (currentSpunProduct) currentSpunProduct.spunDescription = spun;
};

el('spunTitleInput').oninput = e => {
  el('charCountTitle').textContent = `${e.target.value.length}/120`;
  if (currentSpunProduct) currentSpunProduct.spunName = e.target.value;
};

el('spunDescInput').oninput = e => {
  if (currentSpunProduct) currentSpunProduct.spunDescription = e.target.value;
};

el('selPrefix').onchange = () => applySpinning();
el('skuPrefixInput').oninput = () => applySpinning();
el('priceAdjType').onchange = () => {
  const t = el('priceAdjType').value;
  el('priceAdjUnitLabel').textContent = t.includes('percent') ? '%' : t.includes('amount') ? '₫' : '';
  applySpinning();
};
el('priceAdjValue').oninput = () => applySpinning();

el('btnCopyOptions').onclick = () => {
  const models = currentSpunProduct?.models || currentRawProduct?.models || [];
  const options = currentSpunProduct?.tier_variation?.[0]?.options || models.map(m => m.name);
  if (!options.length) {
    alert('Chưa có danh sách phân loại.');
    return;
  }
  const text = options.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    el('clonerLog').textContent = `📋 Đã sao chép ${options.length} tên phân loại vào Clipboard:\n${options.join(', ')}`;
  }).catch(() => {
    prompt('Danh sách phân loại:', text);
  });
};

// Download processed images with canvas frames & zip
el('btnDownloadImages').onclick = async () => {
  if (!currentSpunProduct || !currentSpunProduct.images.length) {
    alert('Không tìm thấy ảnh sản phẩm để xử lý.');
    return;
  }

  const Processor = globalThis.ShopFlowImageProcessor;
  if (!Processor) {
    alert('Không tìm thấy bộ xử lý ảnh Canvas.');
    return;
  }

  el('btnDownloadImages').disabled = true;
  el('btnDownloadImages').innerHTML = '<span>⏳</span> Đang tạo khung & nén zip...';

  const frame = el('selFrameStyle').value;
  const flip = el('chkFlip').checked;
  const boost = el('chkBoost').checked;

  try {
    const result = await Processor.processAllImagesToZip(
      currentSpunProduct.images,
      { frame, flip, boost },
      msg => { el('clonerLog').textContent = msg; }
    );

    const safeName = (currentSpunProduct.spunName || 'san-pham').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 30);
    Processor.triggerDownload(result.zipBlob, `Bo-Anh-Lach-AI_${safeName}.zip`);

    el('clonerLog').textContent = `✅ Đã tải về file ZIP gồm ${result.count} ảnh đã đóng khung và lách AI thành công! Hãy giải nén để kéo thả vào Shopee.`;
  } catch (e) {
    el('clonerLog').textContent = '⚠️ Lỗi xử lý ảnh: ' + (e.message || String(e));
  } finally {
    el('btnDownloadImages').disabled = false;
    el('btnDownloadImages').innerHTML = '<span>📥</span> Tải Trọn Bộ Ảnh Đã Lách AI (.zip)';
  }
};

// Save ready-to-fill draft
el('btnSaveClonerDraft').onclick = async () => {
  if (!currentSpunProduct) return;
  currentSpunProduct.spunName = el('spunTitleInput').value.trim();
  currentSpunProduct.spunDescription = el('spunDescInput').value.trim();

  await chrome.storage.local.set({ savedClonerDraft: currentSpunProduct });
  renderSavedDraftBanner(currentSpunProduct);
  el('clonerLog').textContent = '💾 ĐÃ LƯU BỘ DỮ LIỆU THÀNH CÔNG!\nBây giờ bạn mở tab Thêm sản phẩm bên Shop Phụ (portal/product/new) rồi bấm "Điền Tự Động".';
};

el('btnResetCloner').onclick = async () => {
  if (!confirm('Đặt lại dữ liệu nhân bản sản phẩm?')) return;
  currentRawProduct = null;
  currentSpunProduct = null;
  await chrome.storage.local.remove('savedClonerDraft');
  el('clonerPreviewCard').style.display = 'none';
  el('savedDraftBanner').style.display = 'none';
  el('clonerLog').textContent = 'Đã đặt lại dữ liệu nhân bản.';
};

// Helper: Get target product draft
async function getTargetProduct() {
  const s = await chrome.storage.local.get(['savedClonerDraft']);
  const targetProduct = currentSpunProduct || s.savedClonerDraft;
  if (!targetProduct) {
    throw Error('Chưa có dữ liệu sản phẩm nào được lưu. Hãy sang tab Shop Chính bấm "Lấy & Biến Tính SP Này" trước.');
  }
  return targetProduct;
}

// 3.2.1 ĐIỀN RIÊNG PHÂN LOẠI & BẢNG GIÁ
el('btnFillVariationsOnly').onclick = async () => {
  el('btnFillVariationsOnly').disabled = true;
  el('btnFillVariationsOnly').innerHTML = '<span>⏳</span> Đang điền phân loại...';
  el('clonerLog').textContent = '⏳ Đang quét vùng Phân loại hàng & Danh sách giá Shopee...';

  try {
    const targetProduct = await getTargetProduct();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !new URL(tab.url).hostname.includes('banhang.shopee.vn')) {
      throw Error('Vui lòng mở trang Thêm sản phẩm Shopee.');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['product-cloner.js']
    });

    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async (payload) => {
        if (!globalThis.ShopFlowProductCloner) throw Error('Không tải được module điền form.');
        return await globalThis.ShopFlowProductCloner.fillVariationsOnly(payload, msg => console.log(msg));
      },
      args: [targetProduct]
    });

    const fillResult = res?.[0]?.result;
    if (fillResult?.success) {
      el('clonerLog').textContent = `🎯 ĐÃ ĐIỀN XONG PHÂN LOẠI & BẢNG GIÁ!\n• Đã điền: ${fillResult.filled.join(', ')}.\n👉 Kiểm tra lại các dòng giá và kho hàng 100 nhé!`;
    } else {
      el('clonerLog').textContent = '⚠️ Chưa tìm thấy bảng phân loại. Hãy chắc chắn bạn đang mở mục "Thông tin bán hàng".';
    }
  } catch (e) {
    el('clonerLog').textContent = '⚠️ Lỗi: ' + (e.message || String(e));
  } finally {
    el('btnFillVariationsOnly').disabled = false;
    el('btnFillVariationsOnly').innerHTML = '<span>🎯</span> Điền Riêng Phân Loại & Bảng Giá';
  }
};

// 3.2.2 ĐIỀN RIÊNG THÔNG TIN CƠ BẢN & MÔ TẢ
el('btnFillBasicOnly').onclick = async () => {
  el('btnFillBasicOnly').disabled = true;
  el('btnFillBasicOnly').innerHTML = '<span>⏳</span> Đang điền cơ bản...';
  el('clonerLog').textContent = '⏳ Đang điền Tên, Mô tả & Vận chuyển...';

  try {
    const targetProduct = await getTargetProduct();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !new URL(tab.url).hostname.includes('banhang.shopee.vn')) {
      throw Error('Vui lòng mở trang Thêm sản phẩm Shopee.');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['product-cloner.js']
    });

    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async (payload) => {
        if (!globalThis.ShopFlowProductCloner) throw Error('Không tải được module điền form.');
        return await globalThis.ShopFlowProductCloner.fillBasicInfoOnly(payload, msg => console.log(msg));
      },
      args: [targetProduct]
    });

    const fillResult = res?.[0]?.result;
    if (fillResult?.isStep1) {
      el('clonerLog').textContent = `✅ ĐÃ ĐIỀN XONG TÊN SẢN PHẨM!\n👉 Bạn bấm nút "Tiếp theo" (màu cam) bên dưới màn hình Shopee để vào form chi tiết.`;
    } else if (fillResult?.success) {
      el('clonerLog').textContent = `📝 ĐÃ ĐIỀN XONG THÔNG TIN CƠ BẢN!\n• Đã điền: ${fillResult.filled.join(', ')}.`;
    } else {
      el('clonerLog').textContent = '⚠️ Chưa tìm thấy các ô thông tin cơ bản.';
    }
  } catch (e) {
    el('clonerLog').textContent = '⚠️ Lỗi: ' + (e.message || String(e));
  } finally {
    el('btnFillBasicOnly').disabled = false;
    el('btnFillBasicOnly').innerHTML = '<span>📝</span> Điền Riêng Tên, Mô Tả & Vận Chuyển';
  }
};

// 3.2.3 ĐIỀN TOÀN BỘ
el('btnAutoFill').onclick = async () => {
  el('btnAutoFill').disabled = true;
  el('btnAutoFill').innerHTML = '<span>⏳</span> Đang điền toàn bộ...';
  el('clonerLog').textContent = '⏳ Đang điền toàn bộ thông tin...';

  try {
    const targetProduct = await getTargetProduct();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !new URL(tab.url).hostname.includes('banhang.shopee.vn')) {
      throw Error('Vui lòng mở trang Thêm sản phẩm Shopee.');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['product-cloner.js']
    });

    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async (payload) => {
        if (!globalThis.ShopFlowProductCloner) throw Error('Không tải được module điền form.');
        return await globalThis.ShopFlowProductCloner.fillIntoShopeeForm(payload);
      },
      args: [targetProduct]
    });

    const fillResult = res?.[0]?.result;
    if (fillResult?.isStep1) {
      el('clonerLog').textContent = `✅ ĐÃ ĐIỀN XONG TÊN SẢN PHẨM!\n👉 Bấm nút "Tiếp theo" màu cam để vào form chi tiết, sau đó bấm nút "🎯 Điền Riêng Phân Loại & Bảng Giá" nhé!`;
    } else if (fillResult?.success) {
      el('clonerLog').textContent = `🎉 ĐIỀN FORM THÀNH CÔNG!\n• Đã điền: ${fillResult.filled.join(', ')}.\n👉 Kéo ảnh vào ô ảnh và bấm Lưu!`;
    } else {
      el('clonerLog').textContent = '⚠️ Chưa nhận diện được các ô form.';
    }
  } catch (e) {
    el('clonerLog').textContent = '⚠️ Lỗi: ' + (e.message || String(e));
  } finally {
    el('btnAutoFill').disabled = false;
    el('btnAutoFill').innerHTML = '<span>🚀</span> Điền Toàn Bộ (Cơ Bản + Phân Loại)';
  }
};

load();

el('btnClonerSourceJson').onclick=async()=>{try{const data=await getTargetProduct(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='shopflow-product-source.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(e){el('clonerLog').textContent=e.message;}};
