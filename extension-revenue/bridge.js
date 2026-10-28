// Bridge to transmit revenue data to ShopFlow web application
(async () => {
  const data = await chrome.storage.local.get('pendingRevenueImport');
  const p = data.pendingRevenueImport;
  if (!p || p.origin !== location.origin || Date.now() - p.at > 60 * 60 * 1000) return;

  let attempts = 0;
  const timer = setInterval(() => {
    if (++attempts > 30) {
      clearInterval(timer);
      return;
    }
    window.postMessage({
      type: 'SHOPFLOW_REVENUE_IMPORT',
      orders: p.orders,
      timestamp: p.at
    }, location.origin);
  }, 1000);

  window.addEventListener('message', e => {
    if (e.source === window && e.origin === location.origin && e.data?.type === 'SHOPFLOW_REVENUE_IMPORT_RECEIVED') {
      clearInterval(timer);
      chrome.storage.local.remove('pendingRevenueImport');
    }
  });
})();
