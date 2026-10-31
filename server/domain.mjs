import {randomUUID} from 'node:crypto';import {normalizeOrders,mergeOrder,day} from '../lib/orders.mjs';
export async function recordEvent(db,shop,user,order,action){await db.query('INSERT INTO events(id,shop,order_id,action,actor,at) VALUES(?,?,?,?,?,?)',[randomUUID(),shop,order,action,user.email||user,new Date().toISOString()]);}
export async function bump(db,shop){await db.query('UPDATE shops SET revision=revision+1 WHERE id=?',[shop]);}
export async function importOrders(db,access,input,restoreDeleted=false){const clean=normalizeOrders(input);if(clean.length>50){const e=new Error('Mỗi lượt lưu tối đa 50 đơn.');e.status=400;throw e;}return db.transaction(async tx=>{for(const order of clean){const previous=await tx.first('SELECT data,updated_at FROM orders WHERE shop=? AND id=? FOR UPDATE',[access.shop,order.id]);const prior=previous?JSON.parse(previous.data):null;if(prior&&!prior.importedDay)prior.importedDay=day(previous.updated_at);const merged={...mergeOrder(prior,order),importedDay:prior?.importedDay||day()};if(restoreDeleted===true)delete merged.deletedAt;await tx.query('INSERT INTO orders(shop,id,data,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=VALUES(updated_at)',[access.shop,order.id,JSON.stringify(merged),new Date().toISOString()]);await recordEvent(tx,access.shop,access.user,order.id,'Đồng bộ thông tin đơn');}await bump(tx,access.shop);return clean.length;});}

export async function deleteOrdersBulk(db,access,input){
 const httpError=(status,message)=>Object.assign(new Error(message),{status});
   if(!Array.isArray(input)||!input.length||input.length>2000||input.some(id=>typeof id!=='string'||!id.trim()||id.length>100))throw httpError(400,'Danh sách đơn không hợp lệ (tối đa 2000 đơn).');
   const ids=[...new Set(input)].sort();let count=0;
   await db.transaction(async tx=>{
    for(const id of ids){const row=await tx.first('SELECT data,updated_at FROM orders WHERE shop=? AND id=? FOR UPDATE',[access.shop,id]);if(!row)throw httpError(404,'Không tìm thấy đơn '+id);const data=JSON.parse(row.data);if(data.deletedAt)continue;data.importedDay=data.importedDay||day(row.updated_at);data.deletedAt=new Date().toISOString();await tx.query('UPDATE orders SET data=?,updated_at=? WHERE shop=? AND id=?',[JSON.stringify(data),new Date().toISOString(),access.shop,id]);await recordEvent(tx,access.shop,access.user,id,'Xóa hàng loạt khỏi danh sách và phiếu kho');count++;}
    await bump(tx,access.shop);
   });return count;
}

export async function deleteRevenueOrders(db,shop,input){
 const invalid=()=>Object.assign(new Error('Chọn tối đa 2000 mã doanh số hoặc xóa toàn bộ.'),{status:400});
 if(input!=='all'&&(!Array.isArray(input)||!input.length||input.length>2000||input.some(id=>typeof id!=='string'||!id.trim()||id.length>100)))throw invalid();
 await db.transaction(async tx=>{
  if(input==='all')await tx.query('DELETE FROM revenue_orders WHERE shop=?',[shop]);
  else{const ids=[...new Set(input)];await tx.query('DELETE FROM revenue_orders WHERE shop=? AND id IN ('+ids.map(()=>'?').join(',')+')',[shop,...ids]);}
  await bump(tx,shop);
 });
}
