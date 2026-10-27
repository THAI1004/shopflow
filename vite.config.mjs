import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwind()],build:{outDir:'dist',emptyOutDir:true},server:{proxy:{'/api':{target:'http://127.0.0.1:4174',changeOrigin:false}}}});
