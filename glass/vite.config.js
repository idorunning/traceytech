import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],define:{'process.env.NODE_ENV':'"production"'},
  build:{lib:{entry:'glass/glass.jsx',formats:['iife'],name:'TTGlassLib',fileName:()=>'ttglass.js'},minify:'esbuild',target:'es2020',outDir:'dist/glass',emptyOutDir:true}});
