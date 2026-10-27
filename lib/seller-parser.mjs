/* No Shopee passwords, cookies or private APIs are collected. */
export const sellerParser={
 parseCard(text){
  const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean),flat=lines.join('\n');
  const id=flat.match(/Mã\s*đơn\s*hàng\s*[:：]?\s*([A-Z0-9_-]{8,50})/i)?.[1]?.toUpperCase();if(!id)return null;
  const carrier=flat.match(/\b(SPX Express|Shopee Express|J&T Express|J&T|GHN|GHTK|Viettel Post|Vietnam Post|Ninja Van|BEST Express|GrabExpress|beDelivery)\b/i)?.[1]||'';
  const tracking=flat.match(/\b(SPXVN[A-Z0-9]+|SPX[A-Z0-9]{8,}|JNT[A-Z0-9]{8,})\b/i)?.[1]?.toUpperCase()||flat.match(/Mã\s*vận\s*đơn\s*[:：]?\s*([A-Z0-9_-]{6,50})/i)?.[1]?.toUpperCase()||'';
  const date=flat.match(/(?:trước|Hạn\s*(?:gửi|giao)\s*hàng\s*[:：]?)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const shipDay=date?date[3]+'-'+date[2].padStart(2,'0')+'-'+date[1].padStart(2,'0'):'';
  const buyer=flat.match(/(?:Người mua|Tài khoản người mua)\s*[:：]\s*([^\n]+)/i)?.[1]||(/^[a-z0-9_.-]{3,100}$/i.test(lines[0])?lines[0]:'');
  const status=/Đã hủy|Đã huỷ|Người mua đã hủy/i.test(flat)?'cancelled':/Đã giao cho (?:đơn vị vận chuyển|ĐVVC)|Đang giao|Giao hàng thành công/i.test(flat)?'shipped':'pending';
  const items=[];
  for(let n=0;n<lines.length;n++){
   const variant=lines[n].match(/^(?:Variation|Phân loại(?: hàng)?)\s*[:：]\s*(.*)$/i);if(!variant)continue;
   let start=n-1;while(start>=0&&n-start<=8&&!/[x×]\s*\d+\b/i.test(lines[start])&&!/^(?:Variation|Phân loại)/i.test(lines[start]))start--;
   if(start<0||n-start>8)continue;
   const q=lines[start].match(/[x×]\s*(\d+)\b/i);if(!q)continue;
   let name=lines[start].replace(/[x×]\s*\d+\b.*$/i,'').trim();
   if(!name){let p=start-1;const names=[];while(p>=0&&start-p<=4&&!/Mã đơn|₫|đ\d|^\d[\d.,]+$|^Chờ|^Đã|^SPX|^Nhanh|^Drop|^Thanh toán|Variation|Phân loại|^SKU/i.test(lines[p])){names.unshift(lines[p]);p--;if(names.join(' ').length>100)break;}name=names.join(' ');}
   if(!name||name.length<3)continue;
   const sku=lines.slice(n+1,n+3).join('\n').match(/^(?:SKU(?: phân loại)?|Mã SKU(?: phân loại)?)\s*[:：]\s*([^\n]+)/im)?.[1]||'';
   const variantText=variant[1]||((lines[n+1]&&!/^(?:SKU|Mã|₫|Chờ|Đã|SPX|Nhanh|Thanh toán)/i.test(lines[n+1]))?lines[n+1]:'');
   items.push({name,variant:variantText,qty:Number(q[1]),sku});
  }
  const expected=lines.filter(line=>/^(?:Variation|Phân loại(?: hàng)?)\s*[:：]/i.test(line)).length;const incomplete=expected!==items.length||/Xem thêm|Xem tất cả|còn\s*\d+\s*sản phẩm|[+]\s*\d+\s*sản phẩm/i.test(flat);
  return {id,tracking,buyer,carrier,createdDay:'',shipDay,status,items,incomplete,source:'Shopee · extension'};
 },
 extract(document){
  const labels=[];const walker=document.createTreeWalker(document.body,4);let current;while(current=walker.nextNode()){if(/Mã\s*đơn\s*hàng/i.test(current.textContent||'')){const el=current.parentElement;if(el&&!labels.includes(el)&&el.getClientRects().length)labels.push(el);}}const cards=[],warnings=[];
  for(const label of labels){let node=label,best=null;for(let i=0;i<10&&node&&node!==document.body;i++,node=node.parentElement){const text=node.innerText||node.textContent||'';const count=(text.match(/Mã\s*đơn\s*hàng/gi)||[]).length;if(count>1)break;if(count===1&&/(?:Variation|Phân loại)/i.test(text)&&/[x×]\s*\d+/i.test(text)&&!best)best=node;}
   if(best&&!cards.includes(best))cards.push(best);
  }
  const orders=[];for(const card of cards){const o=this.parseCard(card.innerText||card.textContent||'');if(!o)continue;if(!o.items.length||o.incomplete){warnings.push(o.id+': chưa đọc chắc chắn được sản phẩm/số lượng.');continue;}if(!orders.some(x=>x.id===o.id))orders.push(o);}
  if(!orders.length)warnings.push('Chưa đọc được đơn. Mở danh sách đơn Shopee trên máy tính, cuộn để các sản phẩm hiện đầy đủ. Giao diện này có thể cần điều chỉnh bộ đọc.');
  if(orders.some(o=>!o.shipDay))warnings.push('Một số đơn thiếu hạn giao trên trang đang mở. Cần bổ sung từ chi tiết đơn.');
  warnings.push('Chỉ lấy đơn đã hiển thị trong trang hiện tại. Đối chiếu tổng số đơn và số sản phẩm trước khi lưu. SKU để trống nếu không có nhãn SKU rõ ràng.');
  return {orders,warnings};
 }
};
