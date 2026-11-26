// Assembles dist/app.html from the app/ pieces (the same replacement the live deploy uses).
import fs from 'node:fs';
const r=f=>fs.readFileSync(new URL('../app/'+f,import.meta.url),'utf8');
const out=r('shell.html').split('@@CSS@@').join(r('style.css')).split('@@ENV@@').join(r('env.js')).split('@@MAIN@@').join(r('main.js'));
fs.mkdirSync(new URL('../dist/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../dist/app.html',import.meta.url),out);
console.log('dist/app.html',out.length);
