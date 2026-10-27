import dotenv from 'dotenv';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({path:path.join(root,'.env')});
export function makeConfig(overrides={}){
 const c={environment:process.env.NODE_ENV||'development',origin:process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||'http://127.0.0.1:4174',port:Number(process.env.PORT||4174),host:process.env.HOST||(process.env.RENDER?'0.0.0.0':'127.0.0.1'),secret:process.env.APP_SECRET||'',requireDrive:process.env.REQUIRE_DRIVE_BEFORE_ACK==='true',registration:process.env.ALLOW_REGISTRATION!=='false',storage:path.resolve(root,process.env.STORAGE_DIR||'storage'),db:{host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME||'shopflow',user:process.env.DB_USER||'shopflow',password:process.env.DB_PASSWORD||''},googleId:process.env.GOOGLE_CLIENT_ID||'',googleSecret:process.env.GOOGLE_CLIENT_SECRET||'',proxyHops:Number(process.env.TRUST_PROXY_HOPS||1),...overrides};
 if(process.env.DB_SSL==='true'){c.db={...c.db,ssl:{rejectUnauthorized:true,...(process.env.DB_SSL_CA?{ca:process.env.DB_SSL_CA.replace(/\\n/g,'\n')}:{})}};}
 const u=new URL(c.origin);if(u.origin!==c.origin||u.username||u.password)throw Error('APP_ORIGIN must be the exact origin without a path.');
 if(c.environment==='production'&&(u.protocol!=='https:'||c.secret.length<32))throw Error('Production requires HTTPS APP_ORIGIN and APP_SECRET of at least 32 characters.');
 if(c.environment==='production'&&(!c.db.password||c.db.user==='root'))throw Error('Production requires a dedicated database user and password.');
 if(c.secret.length<32)throw Error('Set APP_SECRET to a random value of at least 32 characters.');
 return c;
}
