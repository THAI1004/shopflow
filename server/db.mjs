import mysql from 'mysql2/promise';
export function createDb(config){const pool=mysql.createPool({...config.db,charset:'utf8mb4',timezone:'Z',connectionLimit:5,waitForConnections:true,multipleStatements:false});return {
 async query(sql,args=[]){const [rows]=await pool.execute(sql,args);return rows;},
 async first(sql,args=[]){return (await this.query(sql,args))[0]||null;},
 async transaction(fn){const connection=await pool.getConnection();try{await connection.beginTransaction();const tx={async query(sql,args=[]){return (await connection.execute(sql,args))[0];},async first(sql,args=[]){return (await this.query(sql,args))[0]||null;}};const result=await fn(tx);await connection.commit();return result;}catch(e){await connection.rollback();throw e;}finally{connection.release();}},
 async close(){await pool.end();}
};}
export async function migrate(db){
 const statements=[
 `CREATE TABLE IF NOT EXISTS users (id CHAR(36) PRIMARY KEY,email VARCHAR(190) NOT NULL UNIQUE,name VARCHAR(100) NOT NULL,password_hash VARCHAR(255) NOT NULL,created_at VARCHAR(30) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS sessions (token CHAR(64) PRIMARY KEY,user_id CHAR(36) NOT NULL,expires BIGINT NOT NULL,INDEX sessions_user(user_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS shops (id CHAR(36) PRIMARY KEY,name VARCHAR(100) NOT NULL,creator CHAR(36) NOT NULL,created_at VARCHAR(30) NOT NULL,revision BIGINT NOT NULL DEFAULT 0,FOREIGN KEY(creator) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS members (shop CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,role VARCHAR(12) NOT NULL,PRIMARY KEY(shop,user_id),INDEX members_user(user_id),FOREIGN KEY(shop) REFERENCES shops(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS invitations (token CHAR(64) PRIMARY KEY,shop CHAR(36) NOT NULL,email VARCHAR(190) NOT NULL,expires BIGINT NOT NULL,FOREIGN KEY(shop) REFERENCES shops(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS orders (shop CHAR(36) NOT NULL,id VARCHAR(50) NOT NULL,data LONGTEXT NOT NULL,packed_at VARCHAR(30),updated_at VARCHAR(30) NOT NULL,PRIMARY KEY(shop,id),FOREIGN KEY(shop) REFERENCES shops(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS videos (id CHAR(36) PRIMARY KEY,shop CHAR(36) NOT NULL,order_id VARCHAR(50) NOT NULL,file_key VARCHAR(180) NOT NULL,mime VARCHAR(30) NOT NULL,bytes BIGINT NOT NULL,duration INT NOT NULL,created_at VARCHAR(30) NOT NULL,recorded_at VARCHAR(30) NOT NULL,audio TINYINT NOT NULL DEFAULT 0,drive_id VARCHAR(120),drive_status VARCHAR(12) NOT NULL DEFAULT 'pending',INDEX videos_shop_created(shop,created_at),FOREIGN KEY(shop,order_id) REFERENCES orders(shop,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS events (id CHAR(36) PRIMARY KEY,shop CHAR(36) NOT NULL,order_id VARCHAR(50) NOT NULL,action VARCHAR(250) NOT NULL,actor VARCHAR(190) NOT NULL,at VARCHAR(30) NOT NULL,INDEX events_shop_at(shop,at),FOREIGN KEY(shop) REFERENCES shops(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS integrations (shop CHAR(36) PRIMARY KEY,data LONGTEXT NOT NULL,FOREIGN KEY(shop) REFERENCES shops(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS oauth_states (token CHAR(64) PRIMARY KEY,shop CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,expires BIGINT NOT NULL,FOREIGN KEY(shop) REFERENCES shops(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS rate_limits (id CHAR(64) PRIMARY KEY,hits INT NOT NULL,expires BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
 `CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY,applied_at VARCHAR(30) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
 ];for(const statement of statements)await db.query(statement);await db.query('INSERT IGNORE INTO schema_migrations(version,applied_at) VALUES(1,?)',[new Date().toISOString()]);
 if(!await db.first('SELECT version FROM schema_migrations WHERE version=2')){const columns=await db.query("SHOW COLUMNS FROM videos LIKE 'sha256'");if(!columns.length)await db.query("ALTER TABLE videos ADD COLUMN sha256 CHAR(64) NOT NULL DEFAULT ''");await db.query('INSERT IGNORE INTO schema_migrations(version,applied_at) VALUES(2,?)',[new Date().toISOString()]);}
}
