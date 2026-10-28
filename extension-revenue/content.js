// Content script running on banhang.shopee.vn
(function () {
  // Only inject hook on order management pages
  if (!window.location.pathname.startsWith('/portal/sale/order')) return;

  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected-hook.js');
    s.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.error('ShopFlow Revenue: Cannot inject hook', e);
  }

  // Listen for messages from popup
  chrome.runtime.onMessage?.addListener((req, sender, sendResponse) => {
    if (req.action === 'EXTRACT_REVENUE') {
      if (!globalThis.ShopFlowRevenueParser) {
        sendResponse({ error: 'Bộ đọc chưa sẵn sàng. Vui lòng tải lại trang Shopee.' });
        return true;
      }
      globalThis.ShopFlowRevenueParser.extract(document)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ error: err.message || String(err) }));
      return true; // Keep channel open for async response
    }
  });
})();
