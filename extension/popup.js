const el=id=>document.getElementById(id);let orders=[];
async function load(){const s=await chrome.storage.local.get(['draftOrders','target','parserVersion']);orders=s.parserVersion==='0.2.4'?(s.draftOrders||[]):[];if(s.parserVersion!=='0.2.4')await chrome.storage.local.remove(['draftOrders','pendingImport']);if(s.target)el('target').value=s.target;render();}function render(){el('count').textContent=orders.length+' đơn trong giỏ tạm';el('send').disabled=el('download').disabled=!orders.length;}
el('read').onclick=async()=>{el('read').disabled=true;try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.url||new URL(tab.url).hostname!=='banhang.shopee.vn')throw Error('Mở danh sách đơn trên banhang.shopee.vn để đọc.');await chrome.scripting.executeScript({target:{tabId:tab.id},files:['parser.js']});const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.ShopFlowParser.extract(document)});const r=result[0].result;const map=new Map(orders.map(o=>[o.id,o]));r.orders.forEach(o=>map.set(o.id,o));orders=[...map.values()];await chrome.storage.local.set({draftOrders:orders,parserVersion:'0.2.4'});render();el('result').textContent=r.warnings.join('\n\n')+'\n\n'+r.orders.map(o=>o.id+' · '+o.items.reduce((s,i)=>s+i.qty,0)+' sản phẩm\n'+o.items.map(i=>'  • '+i.name+'\n    Phân loại: '+(i.variant||'Không có phân loại')+'\n    Số lượng: '+i.qty+(i.sku?' · SKU: '+i.sku:'')).join('\n')).join('\n\n');}catch(e){el('result').textContent=e.message;}finally{el('read').disabled=false;}};
el('clear').onclick=async()=>{orders=[];await chrome.storage.local.remove(['draftOrders','pendingImport']);render();el('result').textContent='Đã xóa giỏ tạm. Đơn trong webapp được giữ nguyên.';};
el('send').onclick=async()=>{try{const url=new URL(el('target').value);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Webapp cần HTTPS.');if(url.hostname==='banhang.shopee.vn')throw Error('Nhập tên miền ShopFlow riêng của bạn.');const pattern=url.protocol+'//'+url.hostname+'/*';const granted=await chrome.permissions.request({origins:[pattern]});if(!granted)throw Error('Bạn chưa cấp quyền gửi dữ liệu tới tên miền này.');await chrome.scripting.unregisterContentScripts({ids:['shopflow-bridge']}).catch(()=>{});await chrome.scripting.registerContentScripts([{id:'shopflow-bridge',matches:[pattern],js:['bridge.js'],runAt:'document_idle',persistAcrossSessions:true}]);await chrome.storage.local.set({pendingImport:{orders,at:Date.now(),origin:url.origin},target:url.origin});const tabs=await chrome.tabs.query({});const old=tabs.find(t=>{try{return new URL(t.url).origin===url.origin;}catch{return false;}});if(old){await chrome.tabs.update(old.id,{active:true});await chrome.tabs.reload(old.id);}else await chrome.tabs.create({url:url.origin});el('result').textContent='Đã mở ShopFlow. Đăng nhập, chọn đúng shop và kiểm tra bản xem trước trước khi lưu.';}catch(e){el('result').textContent=e.message;}};
el('download').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(orders,null,2)],{type:'application/json'}));a.href=url;a.download='shopflow-orders.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};load();

el('diagnose').onclick=async()=>{try{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.url||new URL(tab.url).hostname!=='banhang.shopee.vn')throw Error('Mở danh sách đơn Shopee trước.');
 const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
  const walker=document.createTreeWalker(document.body,4),samples=[],seen=new Set();let node;
  while(node=walker.nextNode()){
   if(!/Mã\s*đơn\s*hàng/i.test(node.textContent||''))continue;
   let el=node.parentElement;if(!el||!el.getClientRects().length)continue;
   const ancestors=[];for(let level=0;el&&el!==document.body&&level<12;level++,el=el.parentElement){
    const text=el.innerText||'';if(text.length>20000)break;
    const ids=[...text.matchAll(/Mã\s*đơn\s*hàng\s*[:：]?\s*([A-Z0-9_-]{8,50})/gi)];if(ids.length>1)break;
    if(ids.length===1){ancestors.push({level,tag:el.tagName,classes:el.className,text});}
   }
   if(ancestors.length){const id=ancestors[0].text.match(/Mã\s*đơn\s*hàng\s*[:：]?\s*([A-Z0-9_-]{8,50})/i)?.[1];if(!seen.has(id)){seen.add(id);samples.push({id,ancestors:ancestors.slice(-3)});}}if(samples.length>=10)break;
  }return {version:'0.2.4',samples};
 }});
 const text=JSON.stringify(result[0].result,null,2),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='shopflow-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 el('result').textContent='Đã tải shopflow-diagnostic.json về máy. File có nội dung đơn đang hiển thị, không có cookie/mật khẩu. Bạn có thể xem trước khi gửi hỗ trợ. Không đưa file lên GitHub public.';
 }catch(e){el('result').textContent=e.message;}};
