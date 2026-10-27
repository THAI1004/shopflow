export function verifyReceipt(status,text,id){
 let result;try{result=JSON.parse(text);}catch{throw Error('Máy chủ chưa xác nhận video. Kiểm tra đăng nhập rồi tải lại; bản trên thiết bị vẫn được giữ.');}
 if(status<200||status>=300||result.ok!==true||result.id!==id)throw Error(result.error||'Chưa xác nhận đúng video đã lưu. Bản trên thiết bị vẫn được giữ.');
 return result;
}
