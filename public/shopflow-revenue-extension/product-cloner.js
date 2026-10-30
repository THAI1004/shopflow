// ShopFlow Product Cloner & Spinner Module (v1.3.6)
// High-precision extraction and modular auto-fill for Shopee Seller Portal

(function () {
  'use strict';

  const SYNONYMS = [
    { words: ['sạc xe điện', 'bộ sạc xe đạp điện', 'cục sạc xe máy điện', 'bộ sạc ắc quy xe điện', 'sạc pin xe điện'] },
    { words: ['điều tốc', 'bộ điều tốc', 'ic điều tốc', 'bo điều tốc', 'ic xe điện'] },
    { words: ['chính hãng', 'cao cấp', 'hàng chuẩn loại 1', 'chuẩn hãng', 'bền đẹp', 'chất lượng cao'] },
    { words: ['tự ngắt', 'ngắt tự động', 'chống chai pin', 'thông minh', 'bảo vệ bình'] },
    { words: ['đa năng', 'tiện dụng', 'chuyên dụng', 'tương thích cao'] },
    { words: ['nhanh', 'siêu nhanh', 'tốc độ cao', 'chuẩn dòng'] },
    { words: ['giá rẻ', 'giá tốt', 'giá sỉ', 'ưu đãi'] },
    { words: ['an toàn', 'chống cháy nổ', 'chống nước', 'tản nhiệt tốt'] }
  ];

  const PREFIXES = [
    '[CHÍNH HÃNG]',
    '[FREESHIP]',
    '[BẢO HÀNH 1 ĐỔI 1]',
    '[HÀNG CHUẨN LOẠI 1]',
    '[HÀNG CÓ SẴN]',
    '[GIÁ TỐT NHẤT]'
  ];

  const SUFFIXES = [
    'Bảo Hành 12 Tháng',
    'Lỗi 1 Đổi 1 Toàn Quốc',
    'Hàng Chuẩn Đẹp',
    'Tặng Kèm Phụ Kiện',
    'Bền Bỉ Êm Ái'
  ];

  function makeAcronym(str) {
    if (!str) return 'SP';
    const clean = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const words = clean.split(/[^a-zA-Z0-9]+/).filter(Boolean);
    if (!words.length) return 'SP';
    return words.slice(0, 4).map(w => /^[0-9]+$/.test(w) ? w : w[0].toUpperCase()).join('');
  }

  // Fill only: never submit/publish the seller form while automation is running.

  async function guardedFill(operation, productData, onProgress) {
    if (globalThis.__SHOPFLOW_FILL_RUNNING__) throw Error('Đang điền sản phẩm. Chờ hoàn tất trước khi bấm lại.');
    globalThis.__SHOPFLOW_FILL_RUNNING__ = true;
    const preventSubmit = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const proto = globalThis.HTMLFormElement?.prototype;
    const originals = new Map();
    document.addEventListener('submit', preventSubmit, true);
    try {
      if (proto) for (const name of ['submit', 'requestSubmit']) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (descriptor?.configurable) { originals.set(name, descriptor); Object.defineProperty(proto, name, {...descriptor, value() { /* Fill must not navigate or save. */ }}); }
      }
      return await operation(productData, onProgress);
    } finally {
      for (const [name, descriptor] of originals) Object.defineProperty(proto, name, descriptor);
      document.removeEventListener('submit', preventSubmit, true);
      globalThis.__SHOPFLOW_FILL_RUNNING__ = false;
    }
  }
  function clickFillControl(element) {
    if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
    if (element.tagName !== 'BUTTON') { element.click(); return true; }
    const previous = element.getAttribute('type');
    element.setAttribute('type', 'button');
    try { element.click(); } finally { if (previous === null) element.removeAttribute('type'); else element.setAttribute('type', previous); }
    return true;
  }

  function setNativeValue(input, val, skipBlur = false) {
    if (!input) return;
    const proto = input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(input, val);
    } else {
      input.value = val;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (!skipBlur) {
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    input.style.border = '2px solid #16a34a';
  }

  // 1. EXTRACTOR: Read from current Shopee Product page
  const cleanLabel = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  function shippingFromDom(doc) {
    return Array.from(doc.querySelectorAll('.optional-item')).map(row => {
      const name = row.querySelector('.logistics-item-name')?.textContent?.trim();
      const control = row.querySelector('.eds-switch, [role="switch"]');
      if (!name || !control) return null;
      const state = control.getAttribute('aria-checked');
      const enabled = state === 'true' || control.classList.contains('eds-switch--open');
      return {name, enabled};
    }).filter(Boolean);
  }
  function groupsFromDom(doc) {
    return Array.from(doc.querySelectorAll('.variation-edit-item[data-product-edit-field-unique-id^="tierVariation_"]')).map(group => ({
      name: group.querySelector('.variation-name-panel input')?.value?.trim() || '',
      options: Array.from(group.querySelectorAll('.options-item:not(.virtual-options-item) .variation-selector-input input')).filter(input => !input.closest('.variation-selector-selling-point')).map(input => input.value.trim()).filter(Boolean)
    })).filter(group => group.name && group.options.length);
  }

  function extractFromCurrentPage(doc = document) {
    const cached = window.__SHOPEE_PRODUCT_CACHE__?.currentItem;
    if (cached && (cached.name || cached.title)) {
      const item=normalizeExtractedItem(cached),shipping=shippingFromDom(doc);if(shipping.length)item.shipping=shipping;const groups=groupsFromDom(doc);if(groups.length)item.tier_variation=groups;return item;
    }

    const item = {
      sourceSchemaVersion: 2,
      name: '',
      description: '',
      images: [],
      category: '',
      brand: 'No brand',
      weight: 0,
      dimension: {},
      tier_variation: [],
      models: [],
      price: 0,
      stock: undefined,
      sku: ''
    };

    // Product Title
    const nameInput = doc.querySelector('[data-product-edit-field-unique-id="name"] input, input[placeholder*="Tên sản phẩm" i], input[placeholder*="Tên thương hiệu" i], input[placeholder*="tên" i], input[maxlength="120"], .product-edit-form input.shopee-input__inner');
    if (nameInput && nameInput.value) {
      item.name = nameInput.value.trim();
    } else {
      const heading = doc.querySelector('h1, .product-title, .shopee-header-title');
      if (heading) item.name = heading.textContent.trim();
    }

    // Category (Ngành hàng)
    const catEl = doc.querySelector('.category-selected, .shopee-cascader, [class*="category-box"], [class*="category-selected"]');
    if (catEl) {
      item.category = catEl.textContent.replace(/\s+/g, ' ').trim();
    }

    // Description (Mô tả)
    const descEl = doc.querySelector('textarea.shopee-input__inner, .content-editor textarea, div.ql-editor, div.ProseMirror, textarea[placeholder*="mô tả" i]');
    if (descEl) {
      item.description = (descEl.value || descEl.innerText || descEl.textContent || '').trim();
    }

    // Weight & Dimensions (Vận chuyển)
    const weightInp = doc.querySelector('[data-product-edit-field-unique-id="weight"] input, [data-auto-correct-key="weight"] input');
    if (weightInp && parseInt(weightInp.value, 10) > 0) {
      item.weight = parseInt(weightInp.value, 10);
    }

    const lenInp = doc.querySelector('[data-product-edit-field-unique-id="dimension.length"] input');
    if (lenInp && parseInt(lenInp.value, 10) > 0) item.dimension.length = parseInt(lenInp.value, 10);

    const widInp = doc.querySelector('[data-product-edit-field-unique-id="dimension.width"] input');
    if (widInp && parseInt(widInp.value, 10) > 0) item.dimension.width = parseInt(widInp.value, 10);

    const heiInp = doc.querySelector('[data-product-edit-field-unique-id="dimension.height"] input');
    if (heiInp && parseInt(heiInp.value, 10) > 0) item.dimension.height = parseInt(heiInp.value, 10);

    // Images: STRICT FILTERING (NO logos, NO app QR banners)
    const imageContainer = doc.querySelector('.shopee-image-manager, .product-image-upload, [class*="image-manager"], .image-list');
    const searchRoot = imageContainer || doc.querySelector('.basic-info, #basic-info, .product-edit-form') || doc;
    const imgEls = Array.from(searchRoot.querySelectorAll('img[src*="susercontent.com"], img[src*="shopee.vn"]'));

    const seenUrls = new Set();
    for (const img of imgEls) {
      const src = img.src || img.getAttribute('src');
      if (!src) continue;

      const low = src.toLowerCase();
      if (low.includes('avatar') || low.includes('icon') || low.includes('logo') || low.includes('banner') || low.includes('qr') || low.includes('download')) {
        continue;
      }
      if (img.closest('.header, .shopee-header, .sidebar, .footer, .shop-logo, .app-download, .nav')) {
        continue;
      }

      if (!seenUrls.has(src)) {
        seenUrls.add(src);
        item.images.push(src);
      }
    }

    // TIER VARIATIONS EXTRACTION (Phân loại hàng)
    // Find Tier 1 Name input
    const t1Input = doc.querySelector('.variation-name-panel input, .variation-name-edit input, input[placeholder*="Color" i], input[placeholder*="tên nhóm" i], .tier-title input, .tier-item input');
    let t1Name = t1Input?.value?.trim() || 'công suất';

    // Extract table rows for models & prices from Shopee table or fixed-left column
    const models = [];
    const tableBody = doc.querySelector('.variation-model-table-body, .variation-model-table-main, .variation-model-table, .tier-variation-table, table');

    // Extract option names from fixed-left table cells (sample Shopee seller page)
    const optLabels = [];
    const leftCol = doc.querySelector('.variation-model-table-fixed-left');
    if (leftCol) {
      const headerCell = leftCol.querySelector('.table-header');
      if (headerCell) {
        const hText = headerCell.textContent.replace(/<[^>]+>/g, '').replace(/Chỉnh sửa hình ảnh.*|Đã hiểu/gi, '').trim();
        if (hText) t1Name = hText;
      }
      const cells = Array.from(leftCol.querySelectorAll('.table-cell:not(.table-header)'));
      for (const c of cells) {
        const t = c.textContent.replace(/<[^>]+>/g, '').replace(/Chỉnh sửa hình ảnh.*|Đã hiểu/gi, '').replace(/\s+/g, ' ').trim();
        if (t && t !== t1Name && !t.includes('hình ảnh') && !t.includes('Đã hiểu') && !optLabels.includes(t)) {
          optLabels.push(t);
        }
      }
    }

    // If no fixed left labels, try option input tags
    if (optLabels.length === 0) {
      const inputLabels = Array.from(doc.querySelectorAll('.option-container .options-item:not(.virtual-options-item) .variation-selector-input input, .variation-option-panel input[placeholder="Nhập"]'))
        .map(inp => inp.value.trim()).filter(Boolean);
      optLabels.push(...inputLabels);
    }

    // Extract price inputs and stock inputs
    if (tableBody) {
      const priceInputs = Array.from(tableBody.querySelectorAll('[data-product-edit-field-unique-id^="priceModel_"] input, .basic-price input, .table-cell .price-input input'))
        .filter(inp => !inp.closest('.batch-container'));
      const stockInputs = Array.from(tableBody.querySelectorAll('[data-product-edit-field-unique-id^="stockModel_"] input, .two-tier-stock input'))
        .filter(inp => !inp.closest('.batch-container'));
      const skuInputs = Array.from(tableBody.querySelectorAll('[data-product-edit-field-unique-id^="skuModel_"] textarea, [data-product-edit-field-unique-id^="skuModel_"] input, .sku-textarea textarea, .sku-textarea input'))
        .filter(inp => !inp.closest('.batch-container'));

      const maxRows = Math.max(priceInputs.length, stockInputs.length, skuInputs.length, optLabels.length);
      for (let r = 0; r < maxRows; r++) {
        const pVal = priceInputs[r]?.value?.replace(/[^0-9]/g, '');
        const sVal = stockInputs[r]?.value?.replace(/[^0-9]/g, '');
        const skuVal = skuInputs[r]?.value?.trim() || '';
        const nameVal = optLabels[r] || `Phân loại ${r + 1}`;

        const price = parseInt(pVal, 10) || 0;
        const stock = sVal === '' ? undefined : Number(sVal);

        if (price > 0 || optLabels.length > 0) {
          models.push({
            name: nameVal,
            price,
            stock,
            sku: skuVal || `HMD-${nameVal.replace(/[^0-9a-zA-Z]/g, '')}`
          });
        }
      }
    }

    // Never invent variations or prices from marketing description text.
    if (models.length > 0) {
      item.models = models;
      item.price = models[0].price;
      item.tier_variation = [{
        name: t1Name || 'công suất',
        options: models.map(m => m.name)
      }];
    } else {
      const priceInput = doc.querySelector('.batch-price input, input[placeholder*="giá" i], .price-input input');
      if (priceInput) {
        const p = parseInt(priceInput.value.replace(/[^0-9]/g, ''), 10);
        if (p > 0) item.price = p;
      }
    }

    const groups=groupsFromDom(doc);if(groups.length)item.tier_variation=groups;item.shipping=shippingFromDom(doc);
    return item;
  }

  function normalizeExtractedItem(raw) {
    const item = {
      sourceSchemaVersion: 2,
      name: raw.name || raw.title || '',
      description: raw.description || raw.desc || '',
      images: [],
      category: raw.category_path ? raw.category_path.join(' > ') : (raw.category_id || ''),
      brand: 'No brand',
      weight: (typeof raw.weight === 'string' && parseFloat(raw.weight) < 10) ? Math.round(parseFloat(raw.weight) * 1000) : (raw.weight || 0),
      dimension: raw.dimension || {},
      tier_variation: raw.tier_variation || [],
      shipping: (raw.shipping || raw.logistics || raw.logistic_info || []).filter?.(x => x.name && (typeof x.enabled === 'boolean' || x.enabled === 0 || x.enabled === 1)).map(x => ({name:x.name,enabled:!!x.enabled})) || [],
      models: [],
      price: raw.price ? (raw.price > 10000000 ? Math.round(raw.price / 100000) : raw.price) : 0,
      stock: raw.stock ?? undefined,
      sku: raw.item_sku || raw.sku || ''
    };

    if (Array.isArray(raw.images)) {
      item.images = raw.images.map(img => {
        if (typeof img === 'string') {
          return img.startsWith('http') ? img : `https://down-vn.img.susercontent.com/file/${img}`;
        }
        return img.url || '';
      }).filter(Boolean);
    }

    if (Array.isArray(raw.models) && raw.models.length > 0) {
      item.models = raw.models.map(m => ({
        name: m.name || (m.tier_index ? m.tier_index.map((index,tier) => item.tier_variation[tier]?.options?.[index] || '').join(' / ') : ''),
        tier_index: m.tier_index,
        price: (m.price && m.price > 10000000) ? Math.round(m.price / 100000) : (m.price ?? 0),
        stock: m.stock ?? undefined,
        sku: m.sku || m.model_sku || ''
      }));
      if (item.models.length > 0 && !item.price) {
        item.price = item.models[0].price;
      }
    }

    return item;
  }

  // 2. SPINNERS
  function spinTitle(originalTitle, prefixType = 'none', suffixType = 'none') {
    if (!originalTitle) return '';
    let title = originalTitle.trim();

    // Remove any trailing ellipsis from prior truncations
    title = title.replace(/\.{2,}$/, '').trim();

    let prefix = '';
    if (prefixType === 'random') {
      prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    } else if (prefixType && prefixType !== 'none') {
      prefix = prefixType;
    }

    let suffix = '';
    if (suffixType === 'random') {
      suffix = ' - ' + SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    } else if (suffixType && suffixType !== 'none') {
      suffix = ' - ' + suffixType;
    }

    let result = `${prefix} ${title}${suffix}`.trim();
    if (result.length > 120 && suffix) {
      result = `${prefix} ${title}`.trim();
    }
    if (result.length > 120 && prefix) {
      result = title.trim();
    }
    // Clean word boundary truncation without adding '...'
    if (result.length > 120) {
      result = result.slice(0, 120);
      const lastSpace = result.lastIndexOf(' ');
      if (lastSpace > 90) result = result.slice(0, lastSpace);
    }

    return result;
  }

  function spinDescription(originalDesc) {
    if (!originalDesc) return '';
    let desc = originalDesc.trim();

    desc = desc.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    desc = desc.replace(/\n{3,}/g, '\n\n');

    desc = desc.split('\n')
      .map(line => line.trimEnd())
      .filter((line, i, arr) => {
        if (line.trim() === '' && arr[i - 1]?.trim() === '') return false;
        return true;
      })
      .join('\n');

    const icons = ['✔ ', '🔹 ', '► ', '★ '];
    const pickedIcon = icons[Math.floor(Math.random() * icons.length)];
    desc = desc.replace(/^[-*+•]\s*/gm, pickedIcon);

    const commitment = `\n\n━━━━━━━━━━━━━━━━━━━━━\n⭐ SHOP CAM KẾT:\n✔ Sản phẩm đúng 100% như mô tả và hình ảnh thực tế.\n✔ Hàng mới nguyên hộp, kiểm tra kỹ lưỡng trước khi đóng gói.\n✔ Đổi trả miễn phí trong 7 ngày nếu có lỗi từ nhà sản xuất.\n✔ Bảo hành uy tín, hỗ trợ kỹ thuật tận tâm.`;
    if (!desc.includes('SHOP CAM KẾT') && !desc.includes('CHÍNH SÁCH BÁN HÀNG')) {
      desc = desc + commitment;
    }

    return desc;
  }

  function generateVariantSku(baseTitle, variantName, existingSku = '', prefix = 'S2-') {
    if (existingSku && existingSku.trim()) {
      return `${prefix}${existingSku.trim().replace(/^S[0-9]+-/, '')}`;
    }
    const acro = makeAcronym(baseTitle);
    const varAcro = makeAcronym(variantName);
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}${acro}-${varAcro}-${rand}`.replace(/--+/g, '-');
  }

  function adjustPrice(originalPrice, type = 'percent_add', value = 5) {
    const p = Number(originalPrice) || 0;
    if (p <= 0) return 100000;
    const v = Number(value) || 0;

    let res = p;
    if (type === 'percent_add') {
      res = p * (1 + v / 100);
    } else if (type === 'percent_sub') {
      res = p * (1 - v / 100);
    } else if (type === 'amount_add') {
      res = p + v;
    } else if (type === 'amount_sub') {
      res = Math.max(1000, p - v);
    }

    return Math.max(1000, Math.round(res / 1000) * 1000);
  }

  // 3. TARGETED FILLERS: SEPARATE FOR VARIATIONS VS BASIC INFO

  // 3.1 Fill ONLY Variations & Pricing table (Không điền lung tung vào ô khác)
  async function fillVariationsOnly(productData, onProgress = () => {}) {
    if(productData.sourceSchemaVersion!==2)throw Error('Bản nháp này lấy bằng bộ đọc cũ, có thể đã thiếu kênh hoặc suy đoán phân loại. Sang trang chi tiết SP mẫu, Lấy SP và Lưu bộ dữ liệu lại bằng phiên bản 1.2.3 trước.');
    const doc=document, filled=[], tiers=productData.tier_variation;
    const pause=()=>new Promise(resolve=>setTimeout(resolve,250));
    if(!Array.isArray(tiers)||!tiers.length) throw Error('Bản mẫu chưa có dữ liệu nhóm phân loại chính xác. Lấy lại từ trang chi tiết mẫu; không suy đoán từ mô tả.');
    if(tiers.length>2||tiers.some(t=>!t.name||!Array.isArray(t.options)||!t.options.length))throw Error('Dữ liệu phân loại mẫu chưa đầy đủ.');
    const groups=()=>Array.from(doc.querySelectorAll('.variation-edit-item[data-product-edit-field-unique-id^="tierVariation_"]'));
    const waitFor=async predicate=>{for(let attempt=0;attempt<16;attempt++){if(predicate())return true;await pause();}return false;};
    for(let attempt=0;groups().length<tiers.length&&attempt<2;attempt++){
      const before=groups().length;
      const add=Array.from(doc.querySelectorAll('button')).find(button=>/^\+?\s*Thêm nhóm phân loại(?:\s*[12])?\s*$/i.test(button.textContent.trim())&&button.getClientRects().length&&!button.disabled);
      if(!add)throw Error('Không tìm thấy nút Thêm nhóm phân loại trên form hiện tại.');
      onProgress('Đang tạo nhóm phân loại '+(before+1));
      clickFillControl(add);
      if(!await waitFor(()=>groups().length>before))throw Error('Shopee chưa mở nhóm phân loại sau khi bấm Thêm nhóm phân loại.');
    }
    // Remove only the exact extra group, never an arbitrary button or form control.
    for(let tries=0;groups().length>tiers.length&&tries<2;tries++){
      const before=groups().length, extra=groups()[before-1],remove=extra.querySelector('.variation-delete-btn');
      if(!remove)throw Error('Còn nhóm phân loại thừa. Xóa nhóm thừa bằng dấu × rồi điền lại.');
      clickFillControl(remove);await pause();if(groups().length>=before)throw Error('Shopee chưa xác nhận xóa nhóm thừa. Kiểm tra hộp xác nhận rồi điền lại.');
    }
    if(groups().length!==tiers.length)throw Error('Hãy mở đúng '+tiers.length+' nhóm phân loại như mẫu trước khi điền.');
    for(let ti=0;ti<tiers.length;ti++){
      const tier=tiers[ti];let group=groups()[ti];
      const groupName=group.querySelector('.variation-name-panel input');if(!groupName)throw Error('Không tìm thấy tên nhóm '+(ti+1));setNativeValue(groupName,tier.name);
      const optionInputs=()=>Array.from(groups()[ti].querySelectorAll('.options-item .variation-selector-input input')).filter(i=>!i.closest('.variation-selector-selling-point'));
      for(let tries=0;optionInputs().filter(i=>i.value.trim()).length>tier.options.length&&tries<50;tries++){
        const extra=optionInputs().filter(i=>i.value.trim()).at(-1),remove=extra.closest('.options-item')?.querySelector('.options-remove-btn');if(!remove)throw Error('Còn tùy chọn thừa trong nhóm '+tier.name);clickFillControl(remove);await pause();
      }
      for(let oi=0;oi<tier.options.length;oi++){
        if(!optionInputs()[oi]){
          const add=Array.from(groups()[ti].querySelectorAll('.options-add-btn')).find(button=>button.getClientRects().length&&button.getAttribute('aria-disabled')!=='true');
          if(add){const before=optionInputs().length;clickFillControl(add);await waitFor(()=>optionInputs().length>before);}
        }
        const input=optionInputs()[oi];if(!input)throw Error('Shopee chưa tạo ô tùy chọn '+(oi+1)+' của '+tier.name+'.');
        input.focus();setNativeValue(input,tier.options[oi],true);
        const exact=Array.from(doc.querySelectorAll('.variation-selector-dropdown-menu-content .eds-dropdown-menu-item, .eds-dropdown-menu li')).find(x=>cleanLabel(x.textContent)===cleanLabel(tier.options[oi])&&x.getClientRects().length);
        if(exact)clickFillControl(exact);else {input.blur();input.dispatchEvent(new Event('blur',{bubbles:true}));}await pause();
        if(oi<tier.options.length-1)await waitFor(()=>optionInputs().length>oi+1);
      }
      const actual=optionInputs().map(i=>cleanLabel(i.value)).filter(Boolean),expected=tier.options.map(cleanLabel);
      if(actual.length!==expected.length||actual.some((name,index)=>name!==expected[index]))throw Error('Nhóm '+tier.name+' chưa khớp mẫu; dừng trước khi điền giá để tránh chia nhầm.');
      filled.push(tier.name+': '+tier.options.join(', '));
    }
    await waitFor(()=>doc.querySelectorAll('[data-product-edit-field-unique-id^="priceModel_"] input').length>=tiers.reduce((n,t)=>n*t.options.length,1));
    const scope=doc.querySelector('.variation-model-table')||doc.querySelector('.variation-model-table-main')||doc;
    const visible=selector=>Array.from(scope.querySelectorAll(selector)).filter(i=>i.offsetParent!==null&&!i.closest('.batch-container'));
    const prices=visible('[data-product-edit-field-unique-id^="priceModel_"] input, .basic-price input, .table-cell .price-input input');
    const stocks=visible('[data-product-edit-field-unique-id^="stockModel_"] input, .stock-input input');
    const skus=visible('[data-product-edit-field-unique-id^="skuModel_"] textarea, [data-product-edit-field-unique-id^="skuModel_"] input, .sku-textarea textarea, .sku-textarea input');
    const combinations=tiers.reduce((rows,tier)=>rows.flatMap(row=>tier.options.map((name,index)=>({names:[...row.names,name],indexes:[...row.indexes,index]}))),[{names:[],indexes:[]}]);
    if(prices.length!==combinations.length)throw Error('Bảng đang có '+prices.length+' dòng nhưng mẫu cần '+combinations.length+'. Dừng, chưa điền giá/kho.');
    const models=productData.models||[];
    const matches=combinations.map(combo=>models.filter(m=>Array.isArray(m.tier_index)?m.tier_index.length===combo.indexes.length&&m.tier_index.every((v,i)=>v===combo.indexes[i]):cleanLabel(m.name)===cleanLabel(combo.names.join(' / '))));
    if(matches.some(m=>m.length!==1))throw Error('Chưa đối chiếu được giá theo tên từng phân loại. Lấy lại dữ liệu mẫu, không điền giá theo thứ tự đoán.');
    for(let i=0;i<matches.length;i++){const model=matches[i][0];if(Number.isFinite(Number(model.price))&&Number(model.price)>0)setNativeValue(prices[i],String(model.price));if(stocks[i]&&model.stock!==undefined&&Number.isFinite(Number(model.stock)))setNativeValue(stocks[i],String(model.stock));if(skus[i]&&model.sku)setNativeValue(skus[i],model.sku);}
    filled.push(combinations.length+' dòng giá/kho/SKU đã khớp phân loại mẫu');
    return {success:true,filled,rowCount:combinations.length};
  }

  async function fillShipping(productData, onProgress=()=>{}) {
    const desired=productData.shipping;
    if(!Array.isArray(desired)||!desired.some(x=>x.enabled)){onProgress('Mẫu chưa lưu kênh vận chuyển. Mở chi tiết mẫu, lấy lại dữ liệu rồi điền; không tự bật kênh bất kỳ.');return ['Cần bổ sung kênh vận chuyển từ mẫu'];}
    const rows=Array.from(document.querySelectorAll('.optional-item')), changes=[];
    for(const channel of desired){const row=rows.find(r=>cleanLabel(r.querySelector('.logistics-item-name')?.textContent)===cleanLabel(channel.name));const toggle=row?.querySelector('.eds-switch, [role="switch"]');if(!toggle){if(channel.enabled)changes.push('Shop mới chưa có kênh '+channel.name);continue;}const enabled=toggle.getAttribute('aria-checked')==='true'||toggle.classList.contains('eds-switch--open');if(enabled!==!!channel.enabled){if(toggle.classList.contains('eds-switch--disabled')||toggle.getAttribute('aria-disabled')==='true'){changes.push('Kênh bị khóa: '+channel.name);continue;}clickFillControl(toggle);await new Promise(r=>setTimeout(r,250));const actual=toggle.getAttribute('aria-checked')==='true'||toggle.classList.contains('eds-switch--open');changes.push(actual===!!channel.enabled?'Vận chuyển: '+channel.name:'Cần xác nhận kênh '+channel.name+' trên Shopee');}}
    return changes.length?changes:['Kênh vận chuyển đã khớp mẫu'];
  }

  async function selectNoBrand(doc) {
    const field=doc.querySelector('.product-brand-item, [data-product-edit-field-unique-id="brand"], [data-product-edit-field-unique-id="brand_id"]');
    if(!field)return 'Chưa tìm thấy ô Thương hiệu; chọn No Brand thủ công nếu Shopee yêu cầu';
    const isNoBrand=text=>/^(?:no\s*brand|không\s*(?:có\s*)?thương\s*hiệu)$/i.test(String(text||'').trim());
    const native=field.querySelector('select');
    if(native){const option=Array.from(native.options).find(o=>isNoBrand(o.textContent));if(!option)return 'Danh sách Thương hiệu chưa có No Brand';native.value=option.value;native.dispatchEvent(new Event('change',{bubbles:true}));return 'Thương hiệu: No Brand';}
    const selected=()=>field.querySelector('.eds-selector__inner, .shopee-selector__selected-item, [role="combobox"]')?.textContent||'';
    if(isNoBrand(selected()))return 'Thương hiệu: No Brand';
    const trigger=field.querySelector('.eds-selector, [role="combobox"], .shopee-selector');
    if(!trigger||trigger.getAttribute('aria-disabled')==='true'||trigger.classList.contains('eds-selector--disabled'))return 'Thương hiệu đang khóa; cần chọn No Brand trên Shopee';
    clickFillControl(trigger);
    for(let attempt=0;attempt<12;attempt++){
      await new Promise(resolve=>setTimeout(resolve,100));
      const controlled=trigger.getAttribute('aria-controls'),popup=controlled?doc.getElementById(controlled):field;
      const option=Array.from((popup||field).querySelectorAll('.eds-dropdown-menu-item, .eds-select-option, [role="option"], .shopee-option')).find(o=>isNoBrand(o.textContent)&&o.getClientRects().length&&!o.classList.contains('disabled')&&o.getAttribute('aria-disabled')!=='true');
      if(!option)continue;clickFillControl(option);await new Promise(resolve=>setTimeout(resolve,150));
      return isNoBrand(selected())?'Thương hiệu: No Brand':'Shopee chưa xác nhận No Brand; kiểm tra ô Thương hiệu';
    }
    // Do not type arbitrary text or click another attribute's dropdown.
    clickFillControl(trigger);return 'Chưa tìm thấy No Brand trong danh sách Thương hiệu; chọn thủ công';
  }

  function isDetailsStep(doc) {
    return !!doc.querySelector('[data-product-edit-field-unique-id="description"], .content-editor, .ql-editor, .ProseMirror, textarea[placeholder*="mô tả" i], [data-product-edit-field-unique-id="weight"], [data-product-edit-field-unique-id="tierVariation_0"], .variation-option-panel, .variation-model-table, textarea, [contenteditable="true"]');
  }

  // 3.2 Fill ONLY Basic Info, Description, Brand & Shipping (Không đụng bảng phân loại)
  async function fillBasicInfoOnly(productData, onProgress = () => {}) {
    onProgress('Đang điền Thông tin cơ bản, Mô tả & Vận chuyển...');
    const doc = document;
    const filled = [];

    // Title: Check exact data-product-edit-field-unique-id="name" first!
    const detailsStep = isDetailsStep(doc);
    const titleInput = doc.querySelector('[data-product-edit-field-unique-id="name"] input, input[placeholder*="Tên sản phẩm" i]');
    if (!detailsStep && titleInput && productData.spunName) {
      setNativeValue(titleInput, productData.spunName);
      filled.push('Tên sản phẩm');
    }

    // Step 1 is name + images only. Let the user advance manually.
    if (!detailsStep) return {success:filled.length>0,filled,isStep1:true};

    // Description: never use an arbitrary SKU/variation textarea.
    const descEl = doc.querySelector('[data-product-edit-field-unique-id="description"] textarea, .content-editor textarea, textarea[placeholder*="mô tả" i]');
    if (descEl && productData.spunDescription) {
      setNativeValue(descEl, productData.spunDescription);
      filled.push('Mô tả');
    } else {
      const ql = doc.querySelector('div.ql-editor, div.ProseMirror, .rich-text-editor .editor-outer div[contenteditable="true"]');
      if (ql && productData.spunDescription) {
        ql.innerText = productData.spunDescription;
        ql.dispatchEvent(new Event('input', { bubbles: true }));
        ql.style.border = '2px solid #16a34a';
        filled.push('Mô tả (RichText)');
      }
    }

    filled.push(await selectNoBrand(doc));
    // Keep the selected category unchanged.

    // Shipping (Weight & Dimensions)
    const weightInp = doc.querySelector('[data-product-edit-field-unique-id="weight"] input, [data-auto-correct-key="weight"] input');
    if (weightInp && Number(productData.weight)>0) {
      setNativeValue(weightInp, String(productData.weight));
      filled.push(`Cân nặng theo mẫu: ${productData.weight}g`);
    }

    const lenInp = doc.querySelector('[data-product-edit-field-unique-id="dimension.length"] input');
    if (lenInp && Number(productData.dimension?.length)>0) setNativeValue(lenInp, String(productData.dimension.length));

    const widInp = doc.querySelector('[data-product-edit-field-unique-id="dimension.width"] input');
    if (widInp && Number(productData.dimension?.width)>0) setNativeValue(widInp, String(productData.dimension.width));

    const heiInp = doc.querySelector('[data-product-edit-field-unique-id="dimension.height"] input');
    if (heiInp && Number(productData.dimension?.height)>0) setNativeValue(heiInp, String(productData.dimension.height));

    if (lenInp || widInp || heiInp) {
      filled.push('Kích thước đóng gói: chỉ điền số có trong mẫu');
    }

    filled.push(...await fillShipping(productData,onProgress));

    // Check if Step 1 button exists
    const nextBtn = Array.from(doc.querySelectorAll('button')).find(b => b.textContent.trim() === 'Tiếp theo');
    const isStep1 = !detailsStep;
    // Category selection can rebuild the form and erase data. The user selects it explicitly.


    return {
      success: filled.length > 0,
      filled,
      isStep1
    };
  }



  // 3.3 Fill All
  async function fillIntoShopeeForm(productData, onProgress = () => {}) {
    const res1 = await fillBasicInfoOnly(productData, onProgress);
    if (res1.isStep1) return res1;
    const res2 = await fillVariationsOnly(productData, onProgress);
    return {
      success: res1.success || res2.success,
      filled: [...res1.filled, ...res2.filled]
    };
  }

  globalThis.ShopFlowProductCloner = {
    extractFromCurrentPage,
    normalizeExtractedItem,
    spinTitle,
    spinDescription,
    generateVariantSku,
    adjustPrice,
    fillIntoShopeeForm: (data, progress) => guardedFill(fillIntoShopeeForm, data, progress),
    fillVariationsOnly: (data, progress) => guardedFill(fillVariationsOnly, data, progress),
    fillBasicInfoOnly: (data, progress) => guardedFill(fillBasicInfoOnly, data, progress),
    PREFIXES,
    SUFFIXES
  };
})();
