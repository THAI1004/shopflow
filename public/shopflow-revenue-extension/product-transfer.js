(() => {
  const FORMAT = 'shopflow-product';
  const MAX_SIZE = 8 * 1024 * 1024;
  function validate(product) {
    if (!product || typeof product !== 'object' || Array.isArray(product)
      || typeof product.name !== 'string' || !product.name.trim()
      || (product.models !== undefined && !Array.isArray(product.models))
      || (product.images !== undefined && !Array.isArray(product.images))) {
      throw Error('Dữ liệu sản phẩm không hợp lệ. Hãy sao chép lại từ shop gốc.');
    }
    return product;
  }
  function encode(product) {
    const text = JSON.stringify({format: FORMAT, version: 1, product: validate(product)});
    if (text.length > MAX_SIZE) throw Error('Dữ liệu sản phẩm quá lớn để sao chép.');
    return text;
  }
  function decode(text) {
    if (typeof text !== 'string' || text.length > MAX_SIZE) throw Error('Bộ nhớ tạm không chứa sản phẩm hợp lệ.');
    let data;
    try { data = JSON.parse(text); } catch { throw Error('Chưa có sản phẩm trong bộ nhớ tạm. Bấm Sao chép sản phẩm ở shop gốc trước.'); }
    if (data?.format !== FORMAT || data.version !== 1) throw Error('Nội dung vừa sao chép không phải sản phẩm ShopFlow.');
    return validate(data.product);
  }
  globalThis.ShopFlowProductTransfer = {encode, decode};
})();
