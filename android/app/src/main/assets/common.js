'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=window.Native;
let _seq=1;const _wait={};
window.__native=(id,code,body)=>{const w=_wait[id];if(!w)return;delete _wait[id];let j={};try{j=JSON.parse(body||'{}');}catch(e){}
  w({code,ok:code>=200&&code<300,json:j});};
/* Calls traceytech.app through the app (same sign-in as the Home tab). */
function api(method,path,body){return new Promise(res=>{const id=_seq++;_wait[id]=res;
  if(!N){res({code:0,ok:false,json:{error:'Open this inside Conductor IO.'}});return;}
  N.request(id,method,path,body==null?null:JSON.stringify(body));});}
function toast(html,ms){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}
  t.innerHTML=html;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),ms||2600);}
function sheet(html){let bg=$('#sbg'),s=$('#sheet');
  if(!bg){bg=document.createElement('div');bg.id='sbg';bg.className='sheet-bg';document.body.appendChild(bg);bg.onclick=closeSheet;
    s=document.createElement('div');s.id='sheet';s.className='sheet';document.body.appendChild(s);}
  s.innerHTML='<div class="grab"></div>'+html;requestAnimationFrame(()=>{bg.classList.add('on');s.classList.add('on');});return s;}
function closeSheet(){const bg=$('#sbg'),s=$('#sheet');if(bg){bg.classList.remove('on');s.classList.remove('on');}}
function haptic(){try{N&&N.haptic();}catch(e){}}
