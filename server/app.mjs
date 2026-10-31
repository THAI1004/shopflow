import {day} from '../lib/orders.mjs';
import express from 'express';import helmet from 'helmet';import path from 'node:path';import {randomUUID,randomBytes,createHash} from 'node:crypto';import {existsSync,readFileSync} from 'node:fs';
import {root} from './config.mjs';import {httpError,digest,hashPassword,verifyPassword,currentUser,requireUser,requireOrigin,issueSession,clearSession,shopAccess,rateLimit} from './security.mjs';
import {EventEmitter} from 'node:events';
import {importOrders,recordEvent,bump,deleteOrdersBulk,deleteRevenueOrders} from './domain.mjs';import {putVideo,streamVideo} from './storage.mjs';import {createDrive} from './drive.mjs';
const now=()=>new Date().toISOString();
export async function createApp({db,config,fetchImpl=fetch}){
 const app=express(),updates=new EventEmitter(),streams=new Map(),drive=createDrive({db,config,fetchImpl}),dummyHash=await hashPassword(randomBytes(24).toString('hex'));let uploads=0;updates.setMaxListeners(100);
 app.disable('x-powered-by');app.set('trust proxy',config.proxyHops);
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","'wasm-unsafe-eval'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:'],mediaSrc:["'self'",'blob:'],connectSrc:["'self'"],workerSrc:["'self'",'blob:'],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:config.environment==='production'?[]:null}},crossOriginEmbedderPolicy:false,hsts:config.environment==='production'?undefined:false}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!['GET','HEAD','OPTIONS'].includes(req.method))requireOrigin(req,config);next();});
 app.use('/api',(req,res,next)=>{if(req.method==='POST'&&req.query.shop)res.on('finish',()=>{if(res.statusCode<300)updates.emit(String(req.query.shop));});next();});
 app.use('/api/video',async(req,res,next)=>{await shopAccess(req,db);if(req.method==='POST'){if(uploads>=2)throw httpError(429,'Máy chủ đang nhận video khác. Bản trên thiết bị được giữ, hãy tải lại sau.');uploads++;let released=false;const release=()=>{if(!released){released=true;uploads--;}};res.on('finish',release);res.on('close',release);}next();});
 app.use('/api/video',express.raw({type:()=>true,limit:'32mb'}));app.use(express.json({limit:'2mb'}));
 app.get('/api/health',async(_req,res)=>{await db.query('SELECT 1');res.json({ok:true});});
 app.get('/api/auth',async(req,res)=>res.json({user:await currentUser(req,db),registration:config.registration}));
 app.post('/api/auth',async(req,res)=>{
  const b=req.body||{};if(b.action==='logout'){await clearSession(req,res,db,config);res.json({ok:true});return;}
  const email=String(b.email||'').trim().toLowerCase(),password=b.password;
  if(b.action==='password'){
   const user=await requireUser(req,db);if(typeof b.newPassword!=='string'||b.newPassword.length<10||b.newPassword.length>256)throw httpError(400,'Mật khẩu mới cần từ 10 đến 256 ký tự.');
   await rateLimit(db,config,'password|'+user.id,10,15*60000);const stored=await db.first('SELECT password_hash FROM users WHERE id=?',[user.id]);if(typeof password!=='string'||!await verifyPassword(password,stored.password_hash))throw httpError(400,'Mật khẩu hiện tại chưa đúng.');
   const hash=await hashPassword(b.newPassword);await db.transaction(async tx=>{await tx.query('UPDATE users SET password_hash=? WHERE id=?',[hash,user.id]);await tx.query('DELETE FROM sessions WHERE user_id=?',[user.id]);});await issueSession(res,db,config,user);res.json({ok:true});return;
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>190||typeof password!=='string'||password.length>256)throw httpError(400,'Nhập email và mật khẩu hợp lệ.');
  if(b.action==='register'){
   if(!config.registration)throw httpError(403,'Trang này đang tắt đăng ký mới.');await rateLimit(db,config,'register|'+req.ip,8,3600000);
   const name=String(b.name||'').trim();if(password.length<10||!name||name.length>100)throw httpError(400,'Nhập tên và mật khẩu ít nhất 10 ký tự.');
   const user={id:randomUUID(),email,name},hash=await hashPassword(password);
   try{await db.query('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)',[user.id,email,name,hash,now()]);}catch(e){if(e.code==='ER_DUP_ENTRY')throw httpError(409,'Email này đã được đăng ký.');throw e;}
   await clearSession(req,res,db,config);await issueSession(res,db,config,user);res.status(201).json({ok:true,user});return;
  }
  if(b.action==='login'){
   await rateLimit(db,config,'login-ip|'+req.ip,50,15*60000);await rateLimit(db,config,'login-email|'+email,20,15*60000);
   const row=await db.first('SELECT * FROM users WHERE email=?',[email]),valid=await verifyPassword(password,row?.password_hash||dummyHash);if(!row||!valid)throw httpError(401,'Email hoặc mật khẩu chưa đúng.');
   const user={id:row.id,email:row.email,name:row.name};await clearSession(req,res,db,config);await issueSession(res,db,config,user);res.json({ok:true,user});return;
  }
  throw httpError(400,'Thao tác không hợp lệ.');
 });
 app.get('/api/shops',async(req,res)=>{
  const user=await requireUser(req,db),shops=await db.query('SELECT s.id,s.name,s.created_at,s.revision,m.role FROM shops s JOIN members m ON s.id=m.shop WHERE m.user_id=? ORDER BY s.created_at',[user.id]);let members=[],connected=false;
  if(req.query.shop){const a=await shopAccess(req,db);if(a.role==='owner')members=await db.query('SELECT u.id AS user,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.shop=?',[a.shop]);connected=!!await db.first('SELECT shop FROM integrations WHERE shop=?',[a.shop]);}
  res.json({shops,members,drive:connected,user,driveConfigured:!!(config.googleId&&config.googleSecret)});
 });
 app.post('/api/shops',async(req,res)=>{
  const user=await requireUser(req,db),b=req.body||{};
  if(b.action==='create'){
   const name=String(b.name||'').trim();if(!name||name.length>100)throw httpError(400,'Tên shop cần từ 1 đến 100 ký tự.');const id=randomUUID();
   await db.transaction(async tx=>{await tx.query('INSERT INTO shops(id,name,creator,created_at) VALUES(?,?,?,?)',[id,name,user.id,now()]);await tx.query('INSERT INTO members(shop,user_id,role) VALUES(?,?,?)',[id,user.id,'owner']);});res.status(201).json({ok:true,id});return;
  }
  if(b.action==='join'){
   const shop=await db.transaction(async tx=>{const invite=await tx.first('SELECT * FROM invitations WHERE token=? AND expires>? FOR UPDATE',[digest(String(b.code||'')),Date.now()]);if(!invite||invite.email!==user.email)throw httpError(403,'Mã hết hạn, đã dùng hoặc không dành cho email này.');await tx.query("INSERT IGNORE INTO members(shop,user_id,role) VALUES(?,?,'packer')",[invite.shop,user.id]);await tx.query('DELETE FROM invitations WHERE token=?',[invite.token]);await bump(tx,invite.shop);return invite.shop;});res.json({ok:true,id:shop});return;
  }
  const a=await shopAccess(req,db,true);
  if(b.action==='invite'){
   const email=String(b.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>190)throw httpError(400,'Email chưa hợp lệ.');const code=randomBytes(32).toString('base64url');await db.query('INSERT INTO invitations(token,shop,email,expires) VALUES(?,?,?,?)',[digest(code),a.shop,email,Date.now()+7*86400000]);res.json({ok:true,code});return;
  }
  if(b.action==='remove'){
   if(b.user===a.user.id)throw httpError(400,'Không thể gỡ chủ shop.');await db.transaction(async tx=>{await tx.query("DELETE FROM members WHERE shop=? AND user_id=? AND role!='owner'",[a.shop,String(b.user)]);await bump(tx,a.shop);});res.json({ok:true});return;
  }
  throw httpError(400,'Thao tác không hợp lệ.');
 });
 app.get('/api/store',async(req,res)=>{
  const a=await shopAccess(req,db);const [orders,videos,events,revenueOrders]=await Promise.all([
   db.query('SELECT * FROM orders WHERE shop=? ORDER BY updated_at DESC LIMIT 5000',[a.shop]),
   db.query('SELECT id,order_id,mime,bytes,duration,created_at,recorded_at,audio,drive_id,drive_status FROM videos WHERE shop=? ORDER BY created_at DESC LIMIT 5000',[a.shop]),
   db.query('SELECT * FROM events WHERE shop=? ORDER BY at DESC LIMIT 100',[a.shop]),
   db.query('SELECT * FROM revenue_orders WHERE shop=? ORDER BY updated_at DESC LIMIT 5000',[a.shop]).catch(()=>[])]);
  const revision=(await db.first('SELECT revision FROM shops WHERE id=?',[a.shop])).revision;
  res.json({orders:orders.map(o=>({...JSON.parse(o.data),importedDay:JSON.parse(o.data).importedDay||day(o.updated_at),packedAt:o.packed_at,updatedAt:o.updated_at})),revenueOrders:(revenueOrders||[]).map(r=>({...JSON.parse(r.data),updatedAt:r.updated_at})),videos,events,revision});
 });
 app.post('/api/store',async(req,res)=>{
  const a=await shopAccess(req,db),b=req.body||{};
  if(b.action==='save_revenue'){
   const list=Array.isArray(b.orders)?b.orders:[];
   try {
     await db.query(`CREATE TABLE IF NOT EXISTS revenue_orders (shop CHAR(36) NOT NULL, id VARCHAR(50) NOT NULL, data LONGTEXT NOT NULL, updated_at VARCHAR(30) NOT NULL, PRIMARY KEY(shop,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
   } catch(e){}
   await db.transaction(async tx=>{for(const r of list){if(!r?.id)continue;await tx.query('INSERT INTO revenue_orders(shop,id,data,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=VALUES(updated_at)',[a.shop,String(r.id).trim().toUpperCase(),JSON.stringify(r),now()]);}await recordEvent(tx,a.shop,a.user,'REVENUE',`Đồng bộ ${list.length} đơn doanh số thực nhận`);await bump(tx,a.shop);});
   res.json({ok:true,count:list.length});return;
  }
  if(b.action==='delete_revenue'){await deleteRevenueOrders(db,a.shop,b.id==='all'?'all':(b.ids||(b.id?[b.id]:null)));res.json({ok:true});return;}
  if(b.action==='import'){let count;try{count=await importOrders(db,a,b.orders,b.restoreDeleted===true);}catch(e){if(!e.status&&!(e.code||'').startsWith('ER_'))e.status=400;throw e;}res.json({ok:true,count});return;}
  if(b.action==='delete_many'){const count=await deleteOrdersBulk(db,a,b.ids);res.json({ok:true,count});return;}
  if(b.action==='delete'||b.action==='restore'){await db.transaction(async tx=>{const row=await tx.first('SELECT data,updated_at FROM orders WHERE shop=? AND id=? FOR UPDATE',[a.shop,String(b.id)]);if(!row)throw httpError(404,'Không tìm thấy đơn.');const data=JSON.parse(row.data);data.importedDay=data.importedDay||day(row.updated_at);if(b.action==='delete')data.deletedAt=now();else delete data.deletedAt;await tx.query('UPDATE orders SET data=?,updated_at=? WHERE shop=? AND id=?',[JSON.stringify(data),now(),a.shop,String(b.id)]);await recordEvent(tx,a.shop,a.user,String(b.id),b.action==='delete'?'Xóa đơn khỏi danh sách và phiếu kho':'Khôi phục đơn');await bump(tx,a.shop);});res.json({ok:true});return;}
  if(b.action==='unpack'){await db.transaction(async tx=>{const o=await tx.first('SELECT id FROM orders WHERE shop=? AND id=? FOR UPDATE',[a.shop,String(b.id)]);if(!o)throw httpError(404,'Không tìm thấy đơn.');await tx.query('UPDATE orders SET packed_at=NULL,updated_at=? WHERE shop=? AND id=?',[now(),a.shop,o.id]);await recordEvent(tx,a.shop,a.user,o.id,'Mở lại đơn để đóng lại');await bump(tx,a.shop);});res.json({ok:true});return;}
  throw httpError(400,'Thao tác không hợp lệ.');
 });
 app.post('/api/video',async(req,res)=>{
  const a=await shopAccess(req,db),id=String(req.query.order||''),upload=String(req.query.upload||''),duration=Number(req.query.duration),recordedAt=String(req.query.recordedAt||now()),mime=req.get('content-type')?.split(';')[0],buffer=req.body;
  if(!/^[a-f0-9-]{36}$/.test(upload)||!Number.isFinite(duration)||duration<0||duration>1800||!Number.isFinite(Date.parse(recordedAt))||Date.parse(recordedAt)>Date.now()+300000)throw httpError(400,'Thông tin video không hợp lệ.');
  if(!['video/mp4','video/webm'].includes(mime)||!Buffer.isBuffer(buffer)||buffer.length<100)throw httpError(400,'Video trống hoặc không đúng định dạng.');
  const valid=mime==='video/mp4'?buffer.toString('ascii',4,8)==='ftyp':buffer[0]===0x1a&&buffer[1]===0x45&&buffer[2]===0xdf&&buffer[3]===0xa3;if(!valid)throw httpError(400,'Tệp không có định dạng video hợp lệ.');
  const checksum=createHash('sha256').update(buffer).digest('hex');
  const acknowledge=async()=>{if(config.requireDrive)await drive.sync(a.shop,upload);res.json({ok:true,id:upload,bytes:buffer.length});};
  const previous=await db.first('SELECT shop,order_id,sha256,file_key,drive_status FROM videos WHERE id=?',[upload]);if(previous){if(previous.shop!==a.shop||previous.order_id!==id||previous.sha256!==checksum)throw httpError(409,'Mã tải lên bị trùng hoặc nội dung khác.');if(config.requireDrive&&previous.drive_status!=='saved'){await putVideo(config,previous.file_key,buffer);}await acknowledge();return;}
  const order=await db.first('SELECT data FROM orders WHERE shop=? AND id=?',[a.shop,id]);if(!order)throw httpError(404,'Không tìm thấy đơn.');if(JSON.parse(order.data).status!=='pending'||JSON.parse(order.data).deletedAt)throw httpError(409,'Đơn đã hủy hoặc đã giao, không thể đóng mới.');
  const fileKey=a.shop+'/'+id+'/'+upload;await putVideo(config,fileKey,buffer);
  try{await db.transaction(async tx=>{const o=await tx.first('SELECT data FROM orders WHERE shop=? AND id=? FOR UPDATE',[a.shop,id]);if(!o||JSON.parse(o.data).status!=='pending'||JSON.parse(o.data).deletedAt)throw httpError(409,'Trạng thái đơn vừa thay đổi. Hãy kiểm tra lại.');await tx.query('INSERT INTO videos(id,shop,order_id,file_key,mime,bytes,duration,created_at,recorded_at,audio,sha256) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[upload,a.shop,id,fileKey,mime,buffer.length,Math.round(duration),now(),new Date(recordedAt).toISOString(),req.query.audio==='1'?1:0,checksum]);await tx.query('UPDATE orders SET packed_at=?,updated_at=? WHERE shop=? AND id=?',[now(),now(),a.shop,id]);await recordEvent(tx,a.shop,a.user,id,'Đã lưu video và hoàn tất đóng hàng');await bump(tx,a.shop);});}catch(e){if(e.code==='ER_DUP_ENTRY'){const v=await db.first('SELECT shop,order_id,sha256 FROM videos WHERE id=?',[upload]);if(v?.shop===a.shop&&v.order_id===id&&v.sha256===checksum){await acknowledge();return;}}throw e;}
  await acknowledge();
 });
 app.get('/api/video',async(req,res)=>{const a=await shopAccess(req,db),v=await db.first('SELECT * FROM videos WHERE shop=? AND id=?',[a.shop,String(req.query.id||'')]);if(!v)throw httpError(404,'Không tìm thấy video.');if(v.drive_status==='expired')throw httpError(410,'Video đã hết hạn lưu.');if(v.drive_status==='saved'&&v.drive_id){await drive.stream(req,res,a.shop,v);return;}await streamVideo(req,res,config,v);});
 app.post('/api/drive',async(req,res)=>{const b=req.body||{},a=await shopAccess(req,db,b.action!=='sync');if(b.action==='connect'){res.json({url:await drive.connect(a)});return;}if(b.action==='sync'){res.json(await drive.sync(a.shop,String(b.id||'')));return;}if(b.action==='cleanup'){res.json({ok:true,count:await drive.cleanup(a.shop,a.user.email)});return;}throw httpError(400,'Thao tác không hợp lệ.');});
 app.get('/api/drive/callback',async(req,res)=>{const user=await requireUser(req,db);await drive.callback(req.query,user);res.redirect(303,'/?drive=connected');});
 app.get('/api/events',async(req,res)=>{
  const a=await shopAccess(req,db);if((streams.get(a.user.id)||0)>=6)throw httpError(429,'Đã mở quá nhiều màn hình cập nhật.');streams.set(a.user.id,(streams.get(a.user.id)||0)+1);res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();let last='';let alive=true;let running=false;
  const tick=async()=>{if(!alive||running)return;running=true;try{const member=await db.first('SELECT s.revision FROM shops s JOIN members m ON s.id=m.shop WHERE m.user_id=? AND s.id=?',[a.user.id,a.shop]);if(!member){res.end();return;}if(String(member.revision)!==last){last=String(member.revision);res.write('data: '+JSON.stringify({revision:last})+'\n\n');}else res.write(': heartbeat\n\n');}catch{res.end();}finally{running=false;}};
  let timer,end;res.on('close',()=>{alive=false;updates.off(a.shop,tick);clearInterval(timer);clearTimeout(end);const count=(streams.get(a.user.id)||1)-1;if(count)streams.set(a.user.id,count);else streams.delete(a.user.id);});await tick();if(!alive||res.writableEnded)return;updates.on(a.shop,tick);timer=setInterval(tick,3000);end=setTimeout(()=>res.end(),45000);
 });
 app.use('/api',(_req,res)=>res.status(404).json({error:'Không tìm thấy chức năng.'}));
 const dist=path.join(root,'dist');if(existsSync(dist)){app.use(express.static(dist,{dotfiles:'deny',index:false,maxAge:'1h',setHeaders:(res,file)=>{if(file.endsWith('.html'))res.setHeader('Cache-Control','no-store');}}));app.get('/{*path}',(req,res)=>{if(req.path.split('/').some(s=>s.startsWith('.'))){res.status(404).end();return;}res.set('Cache-Control','no-store').sendFile(path.join(dist,'index.html'));});}
 app.use((error,req,res,_next)=>{if(res.headersSent){res.destroy();return;}const status=error.status||error.statusCode||500;if(status>=500)console.error('Request failed:',error.code||error.message);res.status(status).json({error:status>=500?'Máy chủ chưa hoàn tất yêu cầu. Bản video trên thiết bị được giữ nguyên.':error.type==='entity.too.large'?'Tệp vượt giới hạn 32 MB.':error.message});});
 return app;
}
