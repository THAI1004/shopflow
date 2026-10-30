(function(){
function classifyShipment(value,fallback=''){
 const text=String(value||'').replace(/\r/g,'');
 if(/đã hoàn (?:về|trả)|hoàn hàng thành công/i.test(text))return {status:'Đã hoàn về',returnStatus:'returned',statusSource:'order-card'};
 if(/đang hoàn (?:về|trả|hàng)|đang trả (?:về|hàng)|chuyển hoàn|giao hàng không thành công[^\n]*hoàn/i.test(text))return {status:'Đang hoàn về',returnStatus:'returning',statusSource:'order-card'};
 if(/người mua đã gửi yêu cầu\s*trả hàng|yêu cầu trả hàng|\d+\s*trả hàng\s*\/\s*hoàn|đang xử lý[^\n]*trả hàng/i.test(text))return {status:'Yêu cầu trả hàng/Hoàn tiền',returnStatus:'requested',statusSource:'order-card'};
 if(/đã hủy|đã huỷ|người mua[^\n]*hủy đơn/i.test(text))return {status:'Đã hủy',returnStatus:'',statusSource:'order-card'};
 if(/đã giao cho\s*(?:đvvc|đơn vị vận chuyển)|đơn hàng đang được giao tới/i.test(text))return {status:'Đang giao',returnStatus:'',statusSource:'order-card'};
 if(/đã giao(?!\s+cho)|đơn hàng đã được giao tới người mua|giao hàng thành công/i.test(text))return {status:'Đã giao',returnStatus:'',statusSource:'order-card'};
 if(/chờ lấy hàng|chờ đơn vị vận chuyển xác nhận/i.test(text))return {status:'Chờ lấy hàng',returnStatus:'',statusSource:'order-card'};
 if(/đang giao|đang vận chuyển/i.test(text))return {status:'Đang giao',returnStatus:'',statusSource:'order-card'};
 return {status:fallback||'Chưa đối chiếu vận chuyển',statusSource:'tab'};
}
function isReturnOrder(order){return !!order.returnStatus||/hoàn về|trả hàng|hoàn tiền|chuyển hoàn/.test(String(order.status||'').toLowerCase());}
function isRevenueEligible(order){return !isReturnOrder(order)&&!/hủy|huỷ|cancel/i.test(order.status||'');}

globalThis.ShopFlowRevenueState={classifyShipment,isReturnOrder,isRevenueEligible};
})();
