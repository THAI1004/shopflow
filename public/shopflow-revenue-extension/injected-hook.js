// Injected into Shopee Seller page context (world: MAIN) to capture Shopee network requests
(function () {
  // Activate on order management and product management pages
  const path = window.location.pathname;
  if (!path.startsWith('/portal/sale/order') && !path.startsWith('/portal/product')) return;
  // The destination editor only fills DOM fields; do not hook its network traffic.
  if (/^\/portal\/product\/(?:new|edit)(?:\/|$)/i.test(path)) return;
  if (window.__SHOPEE_REVENUE_HOOK_INSTALLED__) return;
  window.__SHOPEE_REVENUE_HOOK_INSTALLED__ = true;

  window.__SHOPEE_REVENUE_CACHE__ = window.__SHOPEE_REVENUE_CACHE__ || {
    ordersBySn: {},
    ordersById: {}
  };

  window.__SHOPEE_PRODUCT_CACHE__ = window.__SHOPEE_PRODUCT_CACHE__ || {
    currentItem: null
  };

  function parseMoney(v) {
    if (typeof v === 'number') {
      if (v > 1000000000) return Math.round(v / 100000); // Shopee micro-units (cents * 1000)
      return Math.round(v);
    }
    if (!v) return 0;
    const num = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(num) ? num : 0;
  }

  function cacheOrderData(obj) {
    if (!obj || typeof obj !== 'object') return;
    const sn = String(obj.order_sn || obj.ordersn || obj.id || '').trim().toUpperCase();
    const id = String(obj.order_id || obj.orderid || '').trim();

    const buyer = obj.buyer_user?.user_name || obj.buyer_user?.username || obj.buyer_name || obj.buyer || '';
    const carrier = obj.shipping_carrier || obj.carrier || '';
    const status = obj.order_status || obj.status || '';

    // Income / final amount
    const income = obj.order_income || obj.income_details || obj.escrow_detail || obj.income || obj;
    let finalAmount = income.seller_expected_income ?? income.escrow_amount ?? income.seller_net_income ?? income.final_amount ?? income.actual_amount;
    let buyerPayment = income.buyer_total_amount ?? obj.total_price ?? obj.order_total_price ?? income.total_amount;

    const parsedFinal = parseMoney(finalAmount);
    const parsedBuyer = parseMoney(buyerPayment);

    const record = {
      id: sn || id,
      sn,
      detailId: id,
      buyer,
      carrier,
      status,
      finalAmount: parsedFinal,
      buyerPayment: parsedBuyer,
      breakdown: {
        serviceFee: parseMoney(income.service_fee),
        transactionFee: parseMoney(income.seller_transaction_fee),
        tax: parseMoney(income.tax_amount),
        commissionFee: parseMoney(income.commission_fee)
      },
      timestamp: Date.now()
    };

    if (sn) {
      const prev = window.__SHOPEE_REVENUE_CACHE__.ordersBySn[sn];
      window.__SHOPEE_REVENUE_CACHE__.ordersBySn[sn] = {
        ...prev,
        ...record,
        finalAmount: (parsedFinal > 0) ? parsedFinal : (prev?.finalAmount || 0),
        detailId: id || prev?.detailId || ''
      };
    }
    if (id) {
      const prev = window.__SHOPEE_REVENUE_CACHE__.ordersById[id];
      window.__SHOPEE_REVENUE_CACHE__.ordersById[id] = {
        ...prev,
        ...record,
        finalAmount: (parsedFinal > 0) ? parsedFinal : (prev?.finalAmount || 0)
      };
    }
  }

  function handleApiResponse(url, json) {
    if (!json || typeof json !== 'object') return;
    const d = json.data || json;

    // 1. Order lists
    const list = d.orders || d.order_list || d.list || d.items;
    if (Array.isArray(list)) {
      list.forEach(cacheOrderData);
    }

    // 2. Order detail / income
    if (d.order_detail || d.order_income || d.seller_income || d.seller_expected_income || d.escrow_detail) {
      cacheOrderData(d.order_detail || d);
    }

    // 3. Product detail
    if (d.item || (d.name && (d.description || d.images))) {
      window.__SHOPEE_PRODUCT_CACHE__.currentItem = d.item || d;
    }
  }

  function shouldObserve(input, init) {
    try {
      if (/^\/portal\/product\/(?:new|edit)(?:\/|$)/i.test(window.location.pathname)) return false;
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      if (method !== 'GET') return false;
      const raw = typeof input === 'string' ? input : input?.url || input?.href || '';
      const url = new URL(raw, window.location.href);
      if (url.hostname !== 'banhang.shopee.vn') return false;
      return /order|income|finance|escrow|product|item/i.test(url.pathname) && !/report|collect|metric|grafana|log|analytics/i.test(url.pathname);
    } catch { return false; }
  }

  // Observe successful reads without replacing the promise returned to Shopee.
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const observe = shouldObserve(args[0], args[1]);
      const request = origFetch.apply(this, args);
      if (observe) request.then(res => {
        try {
          if (res?.ok) Promise.resolve(res.clone().json()).then(j => {
            try { handleApiResponse('', j); } catch {}
          }, () => {});
        } catch {}
      }, () => { /* Observing must not create a second unhandled rejection. */ });
      return request;
    };
  }

  // Hook XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._shopeeUrl = url;
    this._shopeeMethod = method;
    return origOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function (...rest) {
    this.addEventListener('load', function () {
      try {
        if (this.status >= 200 && this.status < 300 && shouldObserve(this._shopeeUrl, {method:this._shopeeMethod})) {
          const j = JSON.parse(this.responseText);
          handleApiResponse(this._shopeeUrl, j);
        }
      } catch (e) {}
    });
    return origSend.apply(this, rest);
  };
})();
