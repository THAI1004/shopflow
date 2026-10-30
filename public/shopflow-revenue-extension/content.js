// Content script running on banhang.shopee.vn
(function () {
  const path = window.location.pathname;
  const isOrderPage = path.startsWith('/portal/sale/order');
  const isProductPage = path.startsWith('/portal/product');

  if (!isOrderPage && !isProductPage && !path.startsWith('/portal/finance/income')) return;

  // Inject main-world hook
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected-hook.js');
    s.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.error('ShopFlow: Cannot inject hook', e);
  }

  // Listen for messages from popup
  chrome.runtime.onMessage?.addListener((req, sender, sendResponse) => {
    if (req.action === 'EXTRACT_REVENUE') {
      if (!globalThis.ShopFlowRevenueParser) {
        sendResponse({ error: 'Bộ đọc doanh số chưa sẵn sàng. Vui lòng tải lại trang Shopee.' });
        return true;
      }
      globalThis.ShopFlowRevenueParser.extract(document)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ error: err.message || String(err) }));
      return true;
    }

    if (req.action === 'EXTRACT_PRODUCT') {
      try {
        if (!globalThis.ShopFlowProductCloner) {
          sendResponse({ error: 'Bộ đọc sản phẩm chưa sẵn sàng. Vui lòng tải lại trang Shopee.' });
          return true;
        }
        const data = globalThis.ShopFlowProductCloner.extractFromCurrentPage(document);
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ error: err.message || String(err) });
      }
      return true;
    }

    if (req.action === 'AUTO_FILL_PRODUCT') {
      try {
        if (!globalThis.ShopFlowProductCloner) {
          sendResponse({ error: 'Bộ điền sản phẩm chưa sẵn sàng. Vui lòng tải lại trang Shopee.' });
          return true;
        }
        globalThis.ShopFlowProductCloner.fillIntoShopeeForm(req.productData)
          .then(res => sendResponse(res))
          .catch(err => sendResponse({ error: err.message || String(err) }));
        return true;
      } catch (err) {
        sendResponse({ error: err.message || String(err) });
      }
      return true;
    }

    if (req.action === 'PING') {
      sendResponse({ status: 'ok', isOrderPage, isProductPage, path });
      return true;
    }
  });
})();
