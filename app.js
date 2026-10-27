// cPanel Passenger expects a CommonJS startup file named app.js.
import('./server/index.mjs').catch(error=>{console.error('ShopFlow could not start:',error.message);process.exit(1);});
