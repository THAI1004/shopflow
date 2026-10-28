import {makeConfig} from './config.mjs';import {createDb,migrate} from './db.mjs';import {createApp} from './app.mjs';import {mkdir} from 'node:fs/promises';
const config=makeConfig(),db=createDb(config);await migrate(db).catch(err=>console.warn('Auto migration note:',err.message));await mkdir(config.storage,{recursive:true});const app=await createApp({db,config});
const server=app.listen(config.port,config.host,()=>console.log('ShopFlow listening at '+config.origin));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(async()=>{await db.close();process.exit(0);});setTimeout(()=>process.exit(0),5000).unref();});
