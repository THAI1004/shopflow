export function matchScanned(orders,input){
 const text=String(input||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();if(!text||text.length>4096)throw Error('Mã quét trống hoặc quá dài.');
 const candidates=new Set([text.toUpperCase()]);
 const add=value=>{if(typeof value==='string'){candidates.add(value.trim().toUpperCase());for(const token of value.toUpperCase().match(/[A-Z0-9][A-Z0-9_-]{4,100}/g)||[])candidates.add(token);}};
 add(text);try{const url=new URL(text);for(const value of url.searchParams.values())add(value);add(decodeURIComponent(url.pathname));}catch{}
 try{const parsed=JSON.parse(text);for(const key of ['order_sn','order_id','order','tracking_number','tracking_no','tracking'])add(parsed?.[key]);}catch{}
 const found=orders.filter(o=>!o.deletedAt&&(candidates.has(o.id.toUpperCase())||(o.tracking&&candidates.has(o.tracking.toUpperCase()))));
 if(found.length!==1)throw Error(found.length?'Mã quét khớp nhiều đơn. Hãy chọn đúng đơn trong danh sách.':'Không tìm thấy đơn cho mã này. Đồng bộ đơn hoặc nhập mã đơn để kiểm tra.');return found[0];
}
export function recordingOptions(supports,audio,quality){const types=audio?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm']:['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp8','video/webm'];const mimeType=types.find(t=>supports(t));if(!mimeType)throw Error('Trình duyệt chưa có định dạng quay phù hợp.');return {mimeType,videoBitsPerSecond:quality==='480'?650000:1200000,...(audio?{audioBitsPerSecond:64000}:{})};}
