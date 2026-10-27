export const tz = 'Asia/Ho_Chi_Minh';
export function day(value = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)); }
export function normalizeOrders(input) {
  if (!Array.isArray(input) || !input.length || input.length > 500) throw Error('Mỗi lần nhập từ 1 đến 500 đơn.');
  const seen=new Set();
  return input.map(o=>{
    const id=String(o.id||'').trim().toUpperCase();
    if(!/^[A-Z0-9_-]{5,50}$/.test(id)||seen.has(id)) throw Error('Mã đơn không hợp lệ hoặc bị trùng trong lần nhập: '+id);
    seen.add(id);
    if(!Array.isArray(o.items)||!o.items.length||o.items.length>100) throw Error('Đơn '+id+' thiếu danh sách sản phẩm.');
    const items=o.items.map(i=>{
      const qty=Number(i.qty),name=String(i.name||'').trim().slice(0,500);
      if(!name||!Number.isInteger(qty)||qty<1||qty>10000) throw Error('Đơn '+id+': cần tên sản phẩm và số lượng nguyên dương.');
      return {name,variant:String(i.variant||'').trim().slice(0,300),sku:String(i.sku||'').trim().slice(0,100),qty};
    });
    const date=v=>{if(!v)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('Ngày không hợp lệ: '+v);return v;};
    return {id,tracking:String(o.tracking||'').trim().toUpperCase().slice(0,100),buyer:String(o.buyer||'').slice(0,150),carrier:String(o.carrier||'').slice(0,100),createdDay:date(o.createdDay),shipDay:date(o.shipDay),status:['pending','shipped','cancelled'].includes(o.status)?o.status:'pending',items,source:String(o.source||'manual').slice(0,100)};
  });
}
export function pendingFor(orders,date) { return orders.filter(o=>o.status==='pending'&&!o.packedAt&&!o.deletedAt&&(!o.createdDay||o.createdDay<=date)); }
export function pickList(orders) {
  const map=new Map();
  for(const o of orders) for(const i of o.items){
    const k=JSON.stringify([i.sku,i.name,i.variant]);
    if(!map.has(k))map.set(k,{...i,qty:0,orders:0,missingSku:!i.sku});
    const row=map.get(k);row.qty+=i.qty;row.orders++;
  }
  return [...map.values()].sort((a,b)=>(a.sku||a.name).localeCompare(b.sku||b.name,'vi'));
}
export function mergeOrder(previous,incoming){
  if(!previous)return incoming;
  incoming={...incoming,...(previous.deletedAt?{deletedAt:previous.deletedAt}:{}),...(previous.importedDay?{importedDay:previous.importedDay}:{})};
  if(incoming.source==='manual')return incoming;
  const result={...incoming};
  for(const k of ['tracking','buyer','carrier','createdDay','shipDay'])if(!result[k])result[k]=previous[k]||'';
  result.items=incoming.items.map(i=>{const prior=previous.items.filter(p=>p.name===i.name&&p.variant===i.variant);return {...i,sku:i.sku||(prior.length===1?prior[0].sku:'')};});
  return result;
}
export function csv(rows) {return '\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@\-\t\r]/,"'$&")+'"').join(',')).join('\r\n');}

export function filterOrderDate(order,date,mode='exact',field='createdDay'){if(mode==='all')return true;const value=field==='shipDay'?order.shipDay:(order.createdDay||order.importedDay||'');if(mode==='missing')return !value;if(!value)return false;return mode==='until'?value<=date:value===date;}
