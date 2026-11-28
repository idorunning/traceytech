
/* ===================== TraceyTech v2 app ===================== */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TZ='Europe/London';
const hhmm=d=>new Date(d).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:TZ});
const dayLabel=d=>new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:TZ});
const shortDay=d=>new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:TZ});
const ago=d=>{const m=Math.round((Date.now()-new Date(d))/60000);if(m<1)return 'just now';if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+' h ago';return Math.round(h/24)+' days ago';};
const parse=s=>{try{return JSON.parse(s||'null')}catch{return null}};
const fmt=n=>Number(n).toLocaleString('en-GB');
const GOAT={sites:null};
async function loadGoat(){try{const r=await api('/api/goat/status');GOAT.sites=r.sites||[];}catch(e){}}
async function api(path,body){
  const r=await fetch(path,body===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(r.status===401){location.replace('/login');throw Error('Signed out');}
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw Error(j.error||'TraceyTech could not complete that. Try again.');
  return j;
}
const hasLinear=CSS.supports('animation-timing-function','linear(0, 1)');
function springEase(stiff,damp){
  if(!hasLinear) return {ease:'cubic-bezier(.2,.85,.25,1)',dur:620};
  let x=0,v=0;const pts=[];const dt=1/120;let t=0;
  while(t<2){const f=-stiff*(x-1)-damp*v;v+=f*dt;x+=v*dt;t+=dt;pts.push(x);if(t>.3&&Math.abs(x-1)<.0008&&Math.abs(v)<.01)break;}
  const st=Math.max(1,Math.floor(pts.length/60));const s=pts.filter((_,i)=>i%st===0).map(n=>n.toFixed(4));s[s.length-1]='1';
  return {ease:`linear(0, ${s.join(', ')})`,dur:Math.round(t*1000)};
}
const SPRING=springEase(190,26),SOFT=springEase(140,24);

/* ---------- live data only: empty until a source is connected ---------- */
function sampleData(){return {emails:[],events:[],ahead:[]};}

/* ---------- state ---------- */
const S={data:null,brief:null,conn:null,items:[],dismissed:new Set(),learning:null,sample:sampleData(),deckI:0,real:{mail:false,cal:false}};
try{JSON.parse(localStorage.getItem('tt-dismissed')||'[]').forEach(x=>S.dismissed.add(x));}catch{}
const saveDismissed=()=>{try{localStorage.setItem('tt-dismissed',JSON.stringify([...S.dismissed].slice(-80)));}catch{}};
const NODE_OF={assets:'Supabase',tasks:'GitHub',seo:'GoatCounter',finance:'Finance',monitor:'Cloudflare',research:'GitHub',services:'Cloudflare'};

/* ---------- merge items that are the same job in different places ---------- */
const STOP=new Set('the a an of and to for in on by with your our is are'.split(' '));
const words=s=>String(s).toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/\s+/).filter(w=>w&&!STOP.has(w));
function overlap(a,b){const A=new Set(words(a)),B=new Set(words(b));if(!A.size||!B.size)return 0;let i=0;A.forEach(w=>{if(B.has(w))i++;});return i/Math.min(A.size,B.size);}
const plural=w=>/[^aeiou]y$/i.test(w)?w.slice(0,-1)+'ies':/s$/i.test(w)?w:w+'s';
const NUM=['zero','one','two','three','four','five','six','seven','eight','nine'];
function clusterTitle(titles){
  const T=titles.map(t=>t.split(/\s+/));let p=0;while(T.every(t=>t[p]&&t[p].toLowerCase()===T[0][p].toLowerCase()))p++;
  let s=0;while(T.every(t=>t.length-s-1>=p&&t[t.length-1-s].toLowerCase()===T[0][T[0].length-1-s].toLowerCase()))s++;
  const members=T.map(t=>t.slice(p,t.length-s).join(' ')||t.join(' '));
  if(p>=2&&s>=1){const pre=T[0].slice(0,p).join(' '),suf=T[0].slice(T[0].length-s);suf[suf.length-1]=plural(suf[suf.length-1]);
    return {title:`${pre} ${NUM[titles.length]||titles.length} ${suf.join(' ')}`.replace(/\bthe (\w+) /,'$1 '),members};}
  return {title:`${titles[0]}, and ${titles.length-1} like it`,members:titles};
}
const RANK={urgent:0,watch:1,opportunity:2};
function compose(){
  const d=S.data,b=S.brief||{priorities:[],workflows:[],improvements:[]};
  const groups=d.groups||{},tasks=new Map(d.tasks.map(t=>[t.id,t]));
  const pr=(b.priorities||[]).map(p=>({key:'p:'+p.title,kind:'priority',p,level:p.level,group:groups[p.group]||p.group,node:NODE_OF[p.topic]||'Cloudflare',task:Number.isInteger(p.taskId)?tasks.get(p.taskId):null}));
  const used=new Set(),out=[];
  pr.forEach((x,i)=>{if(used.has(i))return;const sib=[x];
    pr.forEach((y,j)=>{if(j>i&&!used.has(j)&&overlap(x.p.title,y.p.title)>=.6){sib.push(y);used.add(j);}});used.add(i);
    if(sib.length===1){out.push(x);return;}
    const c=clusterTitle(sib.map(s=>s.p.title));
    out.push({key:'c:'+sib.map(s=>s.p.title).join('|'),kind:'cluster',title:c.title,level:sib.reduce((m,s)=>RANK[s.level]<RANK[m]?s.level:m,'opportunity'),
      members:sib.map((s,k)=>({...s,label:c.members[k]})),node:sib[0].node,group:[...new Set(sib.map(s=>s.group))].join(', ')});});
  const wf=(b.workflows||[]).map(w=>({key:'w:'+w.group,kind:'project',w,level:'watch',group:groups[w.group]||w.group,node:'GitHub',steps:(w.taskIds||[]).map(id=>tasks.get(id)).filter(t=>t&&!t.done)})).filter(x=>x.steps.length>1);
  const im=(b.improvements||[]).map((t,i)=>({key:'i:'+i,kind:'improvement',text:t,level:'opportunity',node:'Supabase',title:(b.interface?.blocks||[]).find(x=>x.kind==='efficiency'&&String(x.ref)===String(i))?.title||''}));
  const items=[...out.filter(x=>x.level==='urgent'),...out.filter(x=>x.level==='watch'),...out.filter(x=>x.level==='opportunity'),...wf.slice(0,2),...im.slice(0,2)];
  // tasks already shown inside a cluster or priority are not repeated as projects
  S.items=items.filter(x=>!S.dismissed.has(x.key));
}
const titleOf=it=>it.kind==='priority'?it.p.title:it.kind==='cluster'?it.title:it.kind==='project'?`${it.group}: the order I'd do it in`:it.kind==='improvement'?(it.title||firstSentence(it.text)):it.kind==='email'?it.e.subject:it.kind==='event'?it.ev.title:it.title||'';
const firstSentence=t=>{const m=String(t).match(/^.*?[.!?](\s|$)/);return (m?m[0]:String(t)).trim();};
const isCrit=it=>it.level==='urgent'||(it.kind==='email'&&it.e.triage==='need');

/* ---------- health of real sources ---------- */
function health(){
  const src=(S.conn?.sources||[]);const latest=new Map();
  for(const o of S.data.observations){if(!latest.has(o.subject))latest.set(o.subject,{});const e=latest.get(o.subject);if(e[o.metric]===undefined)e[o.metric]={v:o.value,at:o.observed};}
  const sites=[...latest.entries()].map(([name,m])=>({name,status:m.http_status?.v,ms:m.response_ms?.v}));
  const bad=[...src.filter(s=>s.status==='error').map(s=>s.name),...sites.filter(s=>s.status&&(s.status>=500||s.status===0)).map(s=>s.name)];
  return {src,sites,bad};
}
function nodeStates(){
  const h=health();const st=n=>{const s=h.src.find(x=>x.name===n);return !s?'off':s.status==='ok'?'ok':s.status==='error'?'crit':'off';};
  return [{name:'Gmail',state:S.real.mail?'ok':'off'},{name:'Calendar',state:S.real.cal?'ok':'off'},{name:'GoatCounter',state:GOAT.sites==null||!GOAT.sites.length?'off':GOAT.sites.some(x=>!x.ok)?'crit':'ok'},{name:'GitHub',state:st('GitHub')},
    {name:'Cloudflare',state:st('Cloudflare')},{name:'Supabase',state:st('Supabase')},{name:'LinkedIn',state:'off'},{name:'Finance',state:'off'}];
}

/* ---------- the voice ---------- */
let spoken='';
function speak(head,sub){
  const h=$('voice');if(spoken===head+sub)return;spoken=head+sub;
  h.innerHTML=head.split(/(\s+)/).map((w,i)=>/\s+/.test(w)?w:`<span class="w">${esc(w)}</span>`).join('');
  [...h.querySelectorAll('.w')].forEach((w,i)=>w.style.animationDelay=(reduce?0:i*70)+'ms');
  const s=$('sub');s.hidden=!sub;s.textContent=sub||'';s.style.animation='none';void s.offsetWidth;s.style.animation='';s.style.animationDelay=(reduce?0:Math.min(2.2,head.split(/\s+/).length*.07+.3))+'s';
}
function composeVoice(){
  const hr=Number(new Date().toLocaleString('en-GB',{hour:'2-digit',hour12:false,timeZone:TZ}));
  const hi=hr<12?'Morning':hr<18?'Afternoon':'Evening';
  const top=S.items[0];const need=S.sample.emails.filter(e=>e.triage==='need').length,drafted=S.sample.emails.filter(e=>e.draft).length;
  const nextEv=S.sample.events.find(e=>e.end>new Date());
  const head=S.brief?.interface?.headline||S.brief?.headline||'Nothing urgent needs you right now.';
  const merged=S.items.filter(x=>x.kind==='cluster');
  const parts=[`${hi}, Nathan.`];
  if(top)parts.push(`${top.level==='urgent'?'The one that matters most':'First up'}: ${titleOf(top).replace(/\.$/,'')}.`);
  if(merged.length){const k=merged.reduce((n,c)=>n+c.members.length,0);parts.push(`I merged ${NUM[k]||k} near-identical checks into ${merged.length===1?'one job':merged.length+' jobs'}.`);}
  const cap=w=>w[0].toUpperCase()+w.slice(1);parts.push(`${cap(NUM[need]||String(need))} email${need===1?'':'s'} need${need===1?'s':''} you${drafted?`, and I've drafted ${NUM[drafted]||drafted} ${drafted===1?'reply':'replies'}`:''}.`);
  if(nextEv)parts.push(`Next on your calendar: ${nextEv.title} at ${hhmm(nextEv.start)}.`);
  speak(head.replace(/\.$/,'')+'.',parts.join(' '));
}
function chainItems(){
  const top=S.items[0];
  const email=S.sample.emails.find(e=>e.triage==='need'&&e.draft);
  const ahead=allAhead()[0];
  return [top&&{lab:'Now',it:top},email&&{lab:'Next',it:{kind:'email',e:email,key:'e:'+email.id,node:'Gmail',sample:!S.real.mail}},ahead&&{lab:'Then',it:{kind:'ahead',a:ahead,key:'a:'+ahead.title,node:'Calendar',sample:ahead.sample,title:ahead.title}}].filter(Boolean);
}
function renderChain(){
  const c=chainItems();
  $('chain').innerHTML=`<div class="ln"><i></i></div>`+c.map((x,i)=>`<button type="button" class="step ${i===0?'now':''} ${i===0&&isCrit(x.it)?'crit':''}" data-i="${i}"><b>${x.lab}</b><span>${esc(x.it.kind==='ahead'?x.it.a.when+' · '+x.it.a.title:titleOf(x.it))}</span></button>`).join('');
  $('chain').querySelectorAll('.step').forEach(b=>b.addEventListener('click',()=>openFocus(c[+b.dataset.i].it,b)));
}

/* ---------- needs-you deck: cards move through depth as you swipe ---------- */
function stateOf(it){
  if(it.kind==='cluster')return [`${it.members.length} places`,it.level==='urgent'?'crit':''];
  if(it.kind==='priority')return it.level==='urgent'?['Needs you','crit']:it.level==='opportunity'?['Opportunity','']:['Watching',''];
  if(it.kind==='project')return [`${it.steps.length} steps`,''];
  return ['Efficiency',''];
}
function eyebrow(it){
  if(it.kind==='cluster')return 'Merged · '+esc(it.group);
  if(it.kind==='priority')return esc(it.group)+' · '+esc(it.p.topic);
  if(it.kind==='project')return 'Workflow · '+esc(it.group);
  return 'Working smarter';
}
function cardBody(it){
  if(it.kind==='cluster')return `<h3>${esc(it.title)}</h3><ul class="members">${it.members.slice(0,4).map(m=>`<li class="${m.level==='urgent'?'crit':''}">${esc(m.label)}</li>`).join('')}</ul>`;
  if(it.kind==='priority')return `<h3>${esc(it.p.title)}</h3><p>${esc(it.p.reason)}</p>`;
  if(it.kind==='project')return `<h3>${esc(it.group)}: the order I'd do it in</h3><ul class="members">${it.steps.slice(0,4).map(t=>`<li>${esc(t.title)}</li>`).join('')}</ul>`;
  return `<h3>${esc(it.title||firstSentence(it.text))}</h3><p>${esc(it.title?it.text:it.text.replace(firstSentence(it.text),'').trim())}</p>`;
}
function renderDeck(){
  const deck=$('deck');const items=S.items.slice(0,9);
  deck.innerHTML=items.map((it,i)=>{const [lab,cls]=stateOf(it);
    return `<button type="button" class="card glass ${isCrit(it)?'crit':''}" data-i="${i}"><div class="eyebrow"><span>${eyebrow(it)}</span><span class="state ${cls}"><i></i>${esc(lab)}</span></div>${cardBody(it)}<div class="foot"><span>${i+1} of ${items.length}</span><span class="go">Open<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div></button>`;}).join('')||'<p class="empty">Nothing needs you. I\'ll raise anything new here.</p>';
  $('dots').innerHTML=items.map((_,i)=>`<i class="${i===0?'on':''}"></i>`).join('');
  const urgent=S.items.filter(x=>x.level==='urgent').length;
  $('focus-meta').innerHTML=`${urgent?`<span class="state crit"><i></i>${urgent} urgent</span>`:''}<span>Swipe</span>`;
  deck.querySelectorAll('.card').forEach(c=>{c.addEventListener('click',()=>openFocus(items[+c.dataset.i],c));glassLight(c);});
  deckFx();
}
function deckFx(){
  const deck=$('deck');const r=deck.getBoundingClientRect();const mid=r.left+r.width/2;let best=0,bd=1e9;
  deck.querySelectorAll('.card').forEach((c,i)=>{const b=c.getBoundingClientRect();const o=(b.left+b.width/2-mid)/b.width;const a=Math.min(1.6,Math.abs(o));
    if(Math.abs(o)<bd){bd=Math.abs(o);best=i;}
    if(reduce){c.style.transform='';return;}
    c.style.transform=`translateZ(${-a*140}px) rotateY(${Math.max(-1.2,Math.min(1.2,o))*-22}deg) scale(${1-a*.06})`;
    c.style.filter=a>.15?`blur(${(a*3).toFixed(1)}px) brightness(${(1-a*.25).toFixed(2)})`:'none';
    c.style.opacity=(1-a*.35).toFixed(2);});
  if(best!==S.deckI){S.deckI=best;const it=S.items[best];if(it){env.look=it.node;}}
  $('dots').querySelectorAll('i').forEach((d,i)=>d.classList.toggle('on',i===best));
}
$('deck').addEventListener('scroll',()=>requestAnimationFrame(deckFx),{passive:true});

/* ---------- inbox ---------- */
const TRI={need:['Needs you','need'],draft:['Reply drafted','drafted'],wait:['Can wait','']};
function renderInbox(){
  const E=S.sample.emails;
  $('inbox-meta').textContent=`${E.filter(e=>e.triage==='need').length} need you · ${E.filter(e=>e.draft).length} drafted`;
  $('inbox').innerHTML=E.map(e=>`<button type="button" class="row" data-id="${e.id}"><span class="av">${esc(e.ini)}</span><span class="t">${esc(e.subject)}</span><span class="when">${hhmm(e.when)}</span><span class="s">${esc(e.from)} · ${esc(e.summary)}</span><span class="tri ${TRI[e.triage][1]}">${e.draft&&e.triage==='need'?'Draft ready':TRI[e.triage][0]}</span></button>`).join('');
  $('inbox').querySelectorAll('.row').forEach(r=>r.addEventListener('click',()=>{const e=E.find(x=>x.id===r.dataset.id);openFocus({kind:'email',e,key:'e:'+e.id,node:'Gmail',sample:!S.real.mail},r);}));
}

/* ---------- two steps ahead ---------- */
function allAhead(){
  const out=[...(S.upcoming||[]).filter(e=>e.start>new Date()).slice(0,3).map(e=>({at:e.start,title:e.title,detail:e.where||'On your calendar',ev:e}))];
  const nextEv=S.sample.events.find(e=>e.start>new Date()&&e.note);
  if(nextEv)out.unshift({at:nextEv.start,title:nextEv.title,detail:nextEv.note||nextEv.where,move:nextEv.move,sample:true,ev:nextEv});
  const wf=(S.brief?.workflows||[])[0];
  if(wf){const tk=new Map(S.data.tasks.map(t=>[t.id,t]));const st=(wf.taskIds||[]).map(i=>tk.get(i)).filter(t=>t&&!t.done);
    if(st.length>2)out.push({at:null,when:'This week',title:`${S.data.groups?.[wf.group]||wf.group}: ${st[1].title}, then ${st[2].title}`,detail:wf.reason});}
  const d=new Date();const mon=new Date(d);mon.setDate(d.getDate()+((8-d.getDay())%7||7));
  mon.setHours(7,0,0,0);
  out.push({at:mon,title:'Weekly research sweep',detail:'I scan the web for new techniques and changes that affect your sites, then reassess everything.',move:'Nothing for you to do. Tell me in the box below if there is a topic you want covered.'});
  return out.map(a=>({...a,when:a.at?whenLabel(a.at):a.when}));
}
function whenLabel(d){const now=new Date();const day=x=>Math.floor((new Date(x).setHours(0,0,0,0)-new Date(now).setHours(0,0,0,0))/864e5);const n=day(d);
  return n===0?'Today '+hhmm(d):n===1?'Tomorrow '+hhmm(d):n<7?shortDay(d)+' '+hhmm(d):shortDay(d);}
function countdown(d){if(!d)return '';const m=Math.round((d-Date.now())/60000);if(m<0)return 'now';if(m<60)return 'in '+m+' min';const h=Math.round(m/60);if(h<36)return 'in '+h+' h';return 'in '+Math.round(h/24)+' days';}
function renderAhead(){
  const A=allAhead();
  $('ahead').innerHTML=A.map((a,i)=>`<button type="button" class="fut ${a.crit?'crit':''}" data-i="${i}"><div class="when"><span>${esc(a.when)}</span>${a.at?`<span class="cd">${countdown(a.at)}</span>`:''}${a.sample?'<span class="sample">Sample</span>':''}</div><h4>${esc(a.title)}</h4><p>${esc(a.detail||'')}</p>${a.move?`<p class="move"><b>My move</b>${esc(a.move)}</p>`:''}</button>`).join('');
  $('ahead').querySelectorAll('.fut').forEach(b=>b.addEventListener('click',()=>{const a=A[+b.dataset.i];openFocus(a.ev?{kind:'event',ev:a.ev,key:'ev:'+a.ev.id,node:'Calendar',sample:!S.real.cal}:{kind:'ahead',a,key:'a:'+a.title,node:'Calendar',sample:a.sample,title:a.title},b);}));
}

/* ---------- today ribbon (sample calendar) ---------- */
const H0=7,H1=21;const pct=d=>((d.getHours()+d.getMinutes()/60)-H0)/(H1-H0)*100;
function renderToday(){
  const tr=$('track');const now=new Date();
  $('today-h').textContent=dayLabel(now).split(' ')[0];
  const left=S.sample.events.filter(e=>e.end>now).length;$('today-meta').textContent=`${left} left today`;
  let h='';for(let k=H0;k<H1;k++){h+=`<span class="hour" data-h="${k}">${String(k).padStart(2,'0')}</span>`;}
  const nextE=S.sample.events.find(e=>e.end>now);
  h+=S.sample.events.map(e=>`<button type="button" class="ev glass ${e.end<now?'past':''} ${e===nextE?'next':''}" data-id="${e.id}"><small>${hhmm(e.start)}–${hhmm(e.end)}</small>${esc(e.title)}</button>`).join('');
  const G=gapPlan();
  h+=G.map((g,i)=>`<button type="button" class="gap ${g.fill[0]?.crit?'crit':''}" data-i="${i}"><small>Free ${dur(g.end-g.start)}${g.fill.some(f=>f.sample)?' · sample':''}</small>${g.fill.length?`<b>${esc(g.fill[0].t)}</b>${g.fill.length>1?`<em>then ${esc(g.fill.slice(1).map(f=>f.t).join(', then '))}</em>`:''}`:'<b>Keep it clear</b>'}</button>`).join('');
  h+=`<span class="nowline" id="nowline"></span>`;tr.innerHTML=h;
  tr.querySelectorAll('.gap').forEach(x=>{const g=G[+x.dataset.i];x.style.left=`calc(${pct(g.start)}% + 2px)`;x.style.width=`calc(${pct(g.end)-pct(g.start)}% - 4px)`;
    x.addEventListener('click',()=>{const f=g.fill[0];if(f)openFocus(f.it,x);});});
  const used=G.reduce((n,g)=>n+g.fill.length,0);
  $('today-plan').textContent=G.length?`${G.length} free slot${G.length===1?'':'s'} left today. I've fitted ${NUM[used]||used} jobs into them, most urgent first, so nothing waits for a free afternoon.`:'No free time left today. Anything new waits for tomorrow\'s plan.';
  tr.querySelectorAll('.hour').forEach(x=>x.style.left=pct(new Date(new Date().setHours(+x.dataset.h,0,0,0)))+'%');
  tr.querySelectorAll('.ev').forEach(x=>{const e=S.sample.events.find(y=>y.id===x.dataset.id);x.style.left=`calc(${pct(e.start)}% + 2px)`;x.style.width=`calc(${pct(e.end)-pct(e.start)}% - 4px)`;
    glassLight(x);x.addEventListener('click',()=>openFocus({kind:'event',ev:e,key:'ev:'+e.id,node:'Calendar',sample:!S.real.cal},x));});
  tickNow(true);
}
function tickNow(scroll){const n=$('nowline');if(!n)return;const d=new Date();const p=pct(d);n.hidden=p<0||p>100;n.style.left=p+'%';n.dataset.t=hhmm(d);
  if(scroll){const rb=$('ribbon');rb.scrollLeft=Math.max(0,$('track').scrollWidth*p/100-rb.clientWidth*.3);}}

/* ---------- pulse ---------- */
function spark(a,w=200,h=46){if(a.length<2)return '';const mx=Math.max(...a),mn=Math.min(...a),r=mx-mn||1;
  const P=a.map((v,i)=>[i/(a.length-1)*w,h-4-(v-mn)/r*(h-10)]);const d=P.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  let len=0;for(let i=1;i<P.length;i++)len+=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);const L=P[P.length-1];
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d}L${w},${h}L0,${h}Z"/><path class="l" data-len="${Math.ceil(len)}" d="${d}"/><circle cx="${L[0].toFixed(1)}" cy="${L[1].toFixed(1)}" r="3"/></svg>`;}
function goatSum(){const S2=(GOAT.sites||[]).filter(x=>x.ok);if(!S2.length)return null;const n=Math.max(...S2.map(x=>(x.series||[]).length),0);const series=Array.from({length:n},(_,i)=>S2.reduce((t,x)=>t+((x.series||[])[i]||0),0));return {week:S2.reduce((t,x)=>t+x.week,0),today:S2.reduce((t,x)=>t+x.today,0),series,sites:S2};}
function renderPulse(){
  const h=health();const ms=S.data.observations.filter(o=>o.metric==='response_ms').slice(0,40).reverse().map(o=>o.value);
  const avg=ms.length?Math.round(ms.slice(-6).reduce((a,b)=>a+b,0)/Math.min(6,ms.length)):null;
  const slow=h.sites.filter(x=>x.ms!=null).sort((a,b)=>b.ms-a.ms)[0];const g=goatSum();
  const T=[
    g?{k:'Visitors',v:fmt(g.week),d:`${fmt(g.today)} today, last 7 days`,s:g.series,node:'GoatCounter',kind:'metric',id:'visitors',ins:`${g.sites.length} site${g.sites.length>1?'s':''} reporting`}
     :{k:'Visitors',v:'–',d:'Not connected',empty:true,go:'lens-conns',ins:'Add each site from GoatCounter. Tap to see how.'},
    {k:'Site response',v:avg!=null?avg+' ms':'–',d:`${h.sites.length} sites, live checks`,s:ms.slice(-24),node:'Sites',kind:'metric',id:'health',dn:h.bad.length>0,ins:h.bad.length?`${h.bad[0]} is failing. I'm checking it every two hours.`:slow?`Slowest is ${slow.name} at ${slow.ms} ms. Fine for now; I flag anything over a second.`:''},
    {k:'LinkedIn',v:'–',d:'Not connected',empty:true,go:'lens-conns',ins:'LinkedIn limits what apps can read. Tap for the options.'}];
  $('tiles').innerHTML=T.map((x,i)=>`<button type="button" class="mtile glass ${x.empty?'empty':''}" data-i="${i}"><span class="k"><span>${esc(x.k)}</span></span><span class="v">${esc(x.v)}</span><span class="d ${x.dn?'dn':''}">${esc(x.d)}</span>${spark(x.s||[])}${x.ins?`<span class="ins">${esc(x.ins)}</span>`:''}</button>`).join('');
  $('tiles').querySelectorAll('.mtile').forEach(b=>{const p=b.querySelector('path.l');if(p)p.style.setProperty('--len',p.dataset.len);glassLight(b);
    b.addEventListener('click',()=>{const x=T[+b.dataset.i];if(x.go){openPane(x.go,b);return;}openFocus(x.id==='health'?{kind:'health',key:'health',node:'Cloudflare'}:{...x,key:'m:'+x.id,title:x.k},b);});});
  io.observe($('tiles'));
}

function renderLearned(){
  const L=S.learning;const n=L?.decisions?.length||0;
  $('learned').innerHTML=L?.prefs?.length?`<ul class="learned">${L.prefs.map(p=>`<li><span>${esc(p.statement)}</span><em>${p.confidence!=null?Math.round(p.confidence*100)+'%':''}</em></li>`).join('')}</ul>`:
    n?`<ul class="learned">${L.decisions.slice(0,6).map(x=>`<li><span>${esc(x.title)}${x.choice?' · '+esc(x.choice):''}${(x.decision_reasons||[]).filter(r=>r.answer).map(r=>`<br><em>Why: ${esc(r.answer)}</em>`).join('')}</span><em>${x.decided_at?ago(x.decided_at):''}</em></li>`).join('')}</ul>`:
    `<p class="empty">${L?.error?esc(L.error):'Nothing yet. Every time you act on something I\'ll ask why, and the patterns appear here.'}</p>`;
}

/* ---------- detail views ---------- */
const BACK=`<button class="back" type="button" data-act="close"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 3 5 7l4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Back</button>`;
const decisionBtns=`<button class="act" data-act="later">Not now</button><button class="act quiet" data-act="dismiss">Not useful</button>`;
function detail(it){
  if(it.kind==='cluster')return BACK+`<div class="d-head"><h2 id="d-title">${esc(it.title)}</h2><div class="row2"><div class="kv"><span>Merged from</span><b>${it.members.length} separate alerts</b></div><div class="kv"><span>Areas</span><b>${esc(it.group)}</b></div></div></div>
    <div class="d-grid"><div class="d-sec"><h3>Why I merged them</h3><p>These are the same job in different places. Doing them together means you gather the evidence once and record it in one register.</p><h3 class="mt">What I suggest</h3><p>${esc(it.members[0].p.action)}</p></div>
    <div class="d-sec"><h3>Each one</h3><ul class="steps">${it.members.map(m=>`<li><div><b>${esc(m.label)}</b><em>${esc(m.p.reason)}</em></div>${m.task?`<button class="step-done" data-act="done" data-id="${m.task.id}">Done</button>`:''}</li>`).join('')}</ul></div></div>
    <div class="actions">${decisionBtns}</div>`;
  if(it.kind==='priority'){const p=it.p,t=it.task;
    return BACK+`<div class="d-head"><h2 id="d-title">${esc(p.title)}</h2><div class="row2"><div class="kv"><span>Area</span><b>${esc(it.group)}</b></div><div class="kv"><span>Level</span><b>${p.level==='urgent'?'Needs you':p.level==='opportunity'?'Opportunity':'Watching'}</b></div></div></div>
    <div class="d-grid"><div class="d-sec"><h3>Why it matters</h3><p>${esc(p.reason)}</p></div><div class="d-sec"><h3>What I suggest</h3><p>${esc(p.action)}</p></div></div>
    <div class="actions">${t?`<button class="act ${p.level==='urgent'?'critical':'primary'}" data-act="done" data-id="${t.id}">Mark as done</button>`:`<button class="act primary" data-act="add">Add as an action</button>`}${decisionBtns}</div>`;}
  if(it.kind==='project')return BACK+`<div class="d-head"><h2 id="d-title">${esc(it.group)}</h2></div>
    <div class="d-grid"><div class="d-sec"><h3>In this order</h3><ul class="steps">${it.steps.map(t=>`<li><div><b>${esc(t.title)}</b><em>${esc(t.detail||'')}</em></div><button class="step-done" data-act="done" data-id="${t.id}">Done</button></li>`).join('')}</ul></div>
    <div class="d-sec"><h3>Why this order</h3><p>${esc(it.w.reason)}</p></div></div>`;
  if(it.kind==='improvement')return BACK+`<div class="d-head"><h2 id="d-title">${esc(it.title||firstSentence(it.text))}</h2></div><div class="d-sec"><h3>What I'd change</h3><p>${esc(it.text)}</p></div>
    <div class="actions"><button class="act primary" data-act="add">Make this an action</button>${decisionBtns}</div>`;
  if(it.kind==='email'){const e=it.e;return BACK+`<div class="d-head"><h2 id="d-title">${esc(e.subject)}</h2><div class="row2"><div class="kv"><span>From</span><b>${esc(e.from)}</b></div><div class="kv"><span>Received</span><b>${hhmm(e.when)}</b></div><div class="kv"><span>Area</span><b>${esc(e.group)}</b></div>${S.real.mail?'':'<span class="sample">Sample</span>'}</div></div>
    <div class="d-grid"><div class="d-sec"><h3>What it says</h3><p>${esc(e.summary)}</p>${e.fix?`<h3 class="mt">What I'd do</h3><p>${esc(e.fix)}. It takes about a minute and removes the risk.</p>`:''}</div>
    ${e.draft?`<div class="d-sec"><h3>Reply I've drafted</h3><div class="draft">${esc(e.draft)}</div></div>`:''}</div>
    <div class="actions">${e.draft?`<button class="act primary" data-act="sample">Send this reply</button><button class="act" data-act="sample">Edit draft</button>`:e.fix?`<button class="act primary" data-act="sample">${esc(e.fix)}</button>`:S.real.mail?`<button class="act primary" data-act="gmail" data-href="https://mail.google.com/mail/u/0/#inbox/${esc(e.thread||e.id)}">Open in Gmail</button>`:`<button class="act" data-act="sample">Archive</button>`}<button class="act quiet" data-act="close">Not now</button></div>`;}
  if(it.kind==='event'){const v=it.ev;return BACK+`<div class="d-head"><h2 id="d-title">${esc(v.title)}</h2><div class="row2"><div class="kv"><span>When</span><b>${hhmm(v.start)}–${hhmm(v.end)}</b></div>${v.where?`<div class="kv"><span>Where</span><b>${esc(v.where)}</b></div>`:''}${S.real.cal?'':'<span class="sample">Sample</span>'}</div></div>
    <div class="d-sec"><h3>Before it starts</h3><p>${esc(v.note||'Nothing to prepare. I\'ll remind you ten minutes before.')}</p></div><div class="actions"><button class="act quiet" data-act="close">Close</button></div>`;}
  if(it.kind==='ahead'){const a=it.a;return BACK+`<div class="d-head"><h2 id="d-title">${esc(a.title)}</h2><div class="row2"><div class="kv"><span>When</span><b>${esc(a.when)}</b></div>${a.sample?'<span class="sample">Sample</span>':''}</div></div>
    <div class="d-sec"><h3>Why I'm flagging it now</h3><p>${esc(a.detail||'')}</p></div><div class="actions">${a.ref?`<button class="act primary" data-act="email" data-id="${a.ref}">Open the email</button>`:''}<button class="act quiet" data-act="close">Close</button></div>`;}
  if(it.kind==='metric'){const g=goatSum();
    const body=it.id==='visitors'&&g?`<div class="tbl"><table class="sites"><tr><th>Site</th><th>Today</th><th>7 days</th></tr>${g.sites.map(s=>`<tr><td>${esc(s.code)}</td><td class="n">${s.today}</td><td class="n">${s.week}</td></tr>`).join('')}</table></div>`:'<p>No detail yet.</p>';
    return BACK+`<div class="d-head"><h2 id="d-title">${esc(it.k)}</h2><div class="row2"><div class="kv"><span>Now</span><b>${esc(it.v)}</b></div><div class="kv"><span>Trend</span><b>${esc(it.d)}</b></div></div></div><div class="d-sec">${body}</div>`;}
  if(it.kind==='health'){const h=health();const hist=n=>S.data.observations.filter(o=>o.subject===n&&o.metric==='response_ms').slice(0,24).reverse().map(o=>o.value);
    const N=nodeStates();const txt={ok:'live',sample:'sample data until connected',off:'not connected',crit:'failing'};
    return BACK+`<div class="d-head"><h2 id="d-title">Sources and sites</h2><p class="statusline">Last sweep ${S.conn?.updated?hhmm(S.conn.updated)+' · '+ago(S.conn.updated):'not run yet'}</p></div>
    <div class="d-grid"><div class="d-sec"><h3>Sources</h3><ul class="steps">${N.map(n=>`<li><div><b>${esc(n.name)}</b><em>${txt[n.state]}</em></div></li>`).join('')}</ul></div>
    <div class="d-sec"><h3>Your sites</h3><div class="tbl"><table class="sites"><tr><th>Site</th><th>Status</th><th>Response</th></tr>${h.sites.map(s=>`<tr><td>${esc(s.name)}</td><td class="n">${s.status??'–'}</td><td class="n">${s.ms!=null?s.ms+' ms':'–'}</td></tr>`).join('')}</table></div></div></div>
    <div class="actions"><button class="act" data-act="sweep">Check sources now</button></div>`;}
  if(it.kind==='node')return nodeDetail(it.n);
  if(it.kind==='idea')return BACK+`<div class="d-head"><h2 id="d-title">${esc(it.title)}</h2><div class="row2"><div class="kv"><span>Value</span><b>${esc(it.value)}</b></div><div class="kv"><span>Your time</span><b>${esc(it.eff)}</b></div>${it.sample?'<span class="sample">Sample</span>':''}</div></div>
    <div class="d-grid"><div class="d-sec"><h3>Why now</h3><p>${esc(it.why)}</p></div>${it.steps.length?`<div class="d-sec"><h3>How</h3><ol class="howto">${it.steps.map(st=>`<li><span>${esc(st[0])}</span>${st[1]?`<a class="act" href="${esc(st[1])}" target="_blank" rel="noopener">Open</a>`:''}</li>`).join('')}</ol></div>`:''}</div>
    <div class="actions">${it.open?`<button class="act primary" data-act="openref">Open it</button>`:''}${it.sample?`<button class="act ${it.open?'':'primary'}" data-act="sample">Do it</button><button class="act quiet" data-act="close">Not now</button>`:`<button class="act ${it.open?'':'primary'}" data-act="add">Make this an action</button>${decisionBtns}`}</div>`;
  if(it.kind==='conn'){const c=it.c;const st=connState(c);return BACK+`<div class="d-head"><h2 id="d-title">${c.steps.length&&!c.novel?'Connect '+esc(c.name):esc(c.name)}</h2><div class="row2"><div class="kv"><span>Now</span><b>${esc(c.novel?'Ready when you are':CONN_TXT[st])}</b></div>${c.time?`<div class="kv"><span>Your time</span><b>${esc(c.time)}</b></div>`:''}</div></div>
    <div class="d-grid"><div class="d-sec"><h3>What it unlocks</h3><p>${esc(c.unlocks)}</p>${c.limit?`<h3 class="mt">Where I can't help</h3><p>${esc(c.limit)}</p>`:''}</div>${c.steps.length?`<div class="d-sec"><h3>What you do</h3><ol class="howto">${c.steps.map(s=>`<li><span>${esc(s[0])}</span>${s[1]?`<a class="act" href="${esc(s[1])}" target="_blank" rel="noopener">Open</a>`:''}</li>`).join('')}</ol></div>`:''}</div>
    <div class="actions"><button class="act quiet" data-act="close">Close</button></div>`;}
  return BACK;
}

/* ---------- focus: an object flies forward, the world recedes ---------- */
const focusEl=$('focus'),panel=$('panel'),detailEl=$('detail');let current=null,openedAt=0;
function targetRect(){const m=innerWidth<760?10:40;const w=Math.min(1080,innerWidth-2*m),h=Math.min(innerHeight-2*m,880);return {left:(innerWidth-w)/2,top:Math.max(m,(innerHeight-h)/2),width:w,height:h};}
function placePanel(){const t=targetRect();Object.assign(panel.style,{left:t.left+'px',top:t.top+'px',width:t.width+'px',height:t.height+'px'});return t;}
const topicOf=it=>(it.kind==='priority'?'priority:'+it.p.topic:it.kind==='cluster'?'cluster:'+it.node:it.kind).slice(0,100);
function openFocus(it,el){
  if(!it)return;current=it;current.el=el;openedAt=Date.now();detailEl.innerHTML=detail(it);
  if(['email','event','idea','priority','cluster','ahead'].includes(it.kind)){const t=it.title||(it.e&&it.e.subject)||(it.ev&&it.ev.title)||(it.a&&it.a.title)||titleOf(it)||'Item';detailEl.insertAdjacentHTML('beforeend',rbHtml('item:'+it.key,t,'Tell me more, or correct me'));}
  focusEl.classList.add('on');focusEl.setAttribute('aria-hidden','false');document.body.classList.add('focused');
  env.target=1;env.look=it.node||null;if(S.graph&&!env.hot)env.hot=S.graph.nodes.some(n=>n.id==='i:'+it.key)?'i:'+it.key:it.node?'s:'+it.node:null;
  if(!it.sample)api('/api/attention',{topic:topicOf(it),visit:true,seconds:0}).catch(()=>{});
  const t=placePanel(),o=(el||panel).getBoundingClientRect();
  if(!reduce&&el)panel.animate([{transform:`translate(${o.left-t.left}px,${o.top-t.top}px) scale(${o.width/t.width},${o.height/t.height})`,borderRadius:'30px',opacity:.4},{transform:'none',borderRadius:'34px',opacity:1}],{duration:SPRING.dur,easing:SPRING.ease});
  setTimeout(()=>{focusEl.classList.add('ready');detailEl.scrollTop=0;detailEl.querySelector('.back')?.focus({preventScroll:true});},reduce?0:150);
}
function closeFocus(){
  if(!current)return;const it=current;current=null;
  if(!it.sample)api('/api/attention',{topic:topicOf(it),visit:false,seconds:Math.min(60,Math.round((Date.now()-openedAt)/1000))}).catch(()=>{});
  focusEl.classList.remove('ready');document.body.classList.remove('focused');env.target=0;if(!document.body.classList.contains('map'))env.hot=null;
  const el=it.el;const finish=()=>{focusEl.classList.remove('on');focusEl.setAttribute('aria-hidden','true');el?.focus?.({preventScroll:true});};
  if(reduce||!el||!el.isConnected){finish();return;}
  const t=panel.getBoundingClientRect(),o=el.getBoundingClientRect();
  panel.animate([{transform:'none',opacity:1},{transform:`translate(${o.left-t.left}px,${o.top-t.top}px) scale(${o.width/t.width},${o.height/t.height})`,borderRadius:'30px',opacity:0}],{duration:Math.round(SOFT.dur*.75),easing:SOFT.ease,fill:'forwards'}).finished.then(()=>{finish();panel.getAnimations().forEach(a=>a.cancel());});
}
$('scrim').addEventListener('click',closeFocus);
addEventListener('keydown',e=>{if(e.key==='Escape'){if(whyEl.classList.contains('on'))closeWhy();else if(!$('menu').hidden)toggleMenu(false);else if(current)closeFocus();else if(pane)closePane();else closeMap();}});

/* ---------- decisions and "why?" ---------- */
const whyEl=$('why');let whyCtx=null;
async function decide(it,choice,question,chips){
  let id=null;
  try{const r=await api('/api/decision',{title:titleOf(it).slice(0,300),choice,domain:it.kind==='priority'?it.p.topic:it.kind,context:it.kind==='priority'?it.p.reason:it.kind==='cluster'?it.members.map(m=>m.p.title).join('; '):it.text||'',source_ref:it.key.slice(0,300),options:['Done','Add as an action','Not now','Not useful']});id=r.id;}
  catch(e){toast(`<b>Not logged.</b> ${esc(e.message)}`);return;}
  $('reply').classList.remove('on');clearTimeout(toast.t);
  whyCtx={id,question};$('why-q').textContent=question;
  $('why-chips').innerHTML=chips.map(c=>`<button type="button">${esc(c)}</button>`).join('');$('why-input').value='';
  setTimeout(()=>{whyEl.classList.add('on');whyEl.setAttribute('aria-hidden','false');},reduce?0:500);
}
function closeWhy(){whyEl.classList.remove('on');whyEl.setAttribute('aria-hidden','true');}
async function answer(text){
  const c=whyCtx;closeWhy();if(!c)return;whyCtx=null;
  try{await api('/api/decision',{decision_id:c.id,title:'reason',question:c.question,answer:text||null});if(text){toast(`<b>Got it.</b> I'll weigh "${esc(text)}" next time something like this comes up.`);env.ripple();}await loadLearning();renderLearned();}
  catch(e){toast(`<b>Reason not saved.</b> ${esc(e.message)}`);}
}
$('why-chips').addEventListener('click',e=>{const b=e.target.closest('button');if(b)answer(b.textContent);});
$('why-form').addEventListener('submit',e=>{e.preventDefault();const v=$('why-input').value.trim();if(v)answer(v);});
$('why-skip').addEventListener('click',()=>answer(null));

detailEl.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,it=current;
  if(a==='close')return closeFocus();
  if(a==='openref'){const r=it.open;closeFocus();setTimeout(()=>openFocus(r,null),420);return;}
  if(a==='open'||a==='node'){const n=S.graph.nodes.find(x=>x.id===b.dataset.id);if(!n)return;closeFocus();setTimeout(()=>{env.hot=n.id;openFocus(n.kind==='item'?n.ref:{kind:'node',n,key:'n:'+n.id,node:n.kind==='source'?n.label:null,sample:true},labelEls.get(n.id)||null);},420);return;}
  if(a==='gmail'){window.open(b.dataset.href,'_blank','noopener');return;}
  if(a==='sample'){toast('<b>This is sample data.</b> Nothing was sent. Once Gmail is connected this button does it for real.');return;}
  if(a==='email'){const em=S.sample.emails.find(x=>x.id===b.dataset.id);closeFocus();setTimeout(()=>openFocus({kind:'email',e:em,key:'e:'+em.id,node:'Gmail',sample:!S.real.mail},document.querySelector(`.row[data-id="${em.id}"]`)),450);return;}
  try{
    if(a==='done'){b.disabled=true;await api('/api/task',{id:Number(b.dataset.id),done:true});toast('<b>Marked as done.</b>');
      if(it.kind==='cluster'){b.textContent='Done ✓';await load(true);decide(it,'Marked one as done','What made this one the right one to finish first?',['It was the most at risk','It was quickest','Someone was waiting','Just working through them']);return;}
      closeFocus();await load(true);decide(it,'Marked as done','What made this the right thing to finish now?',['It was urgent','It was quick','Someone was waiting on it','It was blocking other work']);return;}
    if(a==='add'){b.disabled=true;const title=titleOf(it).slice(0,200);const group=it.kind==='priority'&&S.data.groups[it.p.group]?it.p.group:'traceytech';
      await api('/api/new-task',{title,group,priority:it.level==='urgent'?'High':'Medium',detail:(it.kind==='priority'?it.p.action:it.text||'').slice(0,700)});
      toast('<b>Added.</b> I\'ll track it with your other actions.');closeFocus();await load(true);decide(it,'Added as an action','Why is this worth doing?',['It saves time later','It reduces risk','It makes money','A client needs it']);return;}
    if(a==='later'){closeFocus();toast('<b>Okay.</b> I\'ll bring it back at the next assessment.');decide(it,'Not now','What would make this worth doing sooner?',['A deadline','If it got worse','When I have a free afternoon','Nothing, it can wait']);return;}
    if(a==='dismiss'){S.dismissed.add(it.key);if(it.kind==='idea')setTimeout(renderIdeas,80);saveDismissed();closeFocus();setTimeout(()=>{compose();renderDeck();renderChain();},80);
      decide(it,'Not useful','Why wasn\'t this useful? I\'ll use it to filter what I show you.',['Already dealt with','Not important to me','The evidence is wrong','Not my responsibility']);return;}
    if(a==='sweep'){b.disabled=true;b.textContent='Checking…';env.thinkGoal=1;env.burst();await api('/api/test-connections',{});await load(true);env.thinkGoal=0;toast('<b>Sources checked.</b>');closeFocus();return;}
  }catch(err){env.thinkGoal=0;toast(`<b>That didn't work.</b> ${esc(err.message)}`);b.disabled=false;}
});
function toast(msg){const r=$('reply');r.innerHTML=msg;r.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>r.classList.remove('on'),6000);}

/* ---------- menu + command ---------- */
function toggleMenu(on){$('menu').hidden=!on;$('menu-btn').setAttribute('aria-expanded',String(on));}
$('menu-btn').addEventListener('click',e=>{e.stopPropagation();toggleMenu($('menu').hidden);});
document.addEventListener('click',e=>{if(!$('menu').hidden&&!e.target.closest('#menu'))toggleMenu(false);});
$('assess').addEventListener('click',async e=>{const b=e.currentTarget;toggleMenu(false);b.disabled=true;env.thinkGoal=1;env.burst();$('live-text').textContent='Reassessing everything';scrollTo({top:0,behavior:reduce?'auto':'smooth'});
  try{await api('/api/assess',{});spoken='';await load(true);toast('<b>Fresh assessment ready.</b> I\'ve rearranged things to match.');}catch(err){toast(esc(err.message));}env.thinkGoal=0;b.disabled=false;});
$('signout').addEventListener('click',async()=>{try{await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});}catch{}location.replace('/login');});
$('cmd').addEventListener('submit',async e=>{e.preventDefault();const i=$('cmd-input');const v=i.value.trim();if(!v)return;const q=v.toLowerCase();
  const pool=[...S.items,...S.sample.emails.map(e=>({kind:'email',e,key:'e:'+e.id,node:'Gmail',sample:!S.real.mail})),...S.sample.events.map(ev=>({kind:'event',ev,key:'ev:'+ev.id,node:'Calendar',sample:!S.real.cal}))];
  const hit=q.length>2&&pool.find(x=>(titleOf(x)+' '+(x.kind==='email'?x.e.from+' '+x.e.group:'')+' '+(x.group||'')).toLowerCase().includes(q));
  if(hit){i.value='';const el=document.querySelector(`[data-id="${hit.e?.id||hit.ev?.id}"]`)||$('deck');openFocus(hit,el);return;}
  $('cmd').classList.add('thinking');env.thinkGoal=1;env.burst();
  try{await api('/api/focus',{intent:v.slice(0,300)});i.value='';setTimeout(()=>{env.thinkGoal=0;$('cmd').classList.remove('thinking');env.ripple();toast(`<b>Noted.</b> I'll weight "${esc(v)}" in the next assessment. Use Assess now in the menu to do it straight away.`);},1400);}
  catch(err){env.thinkGoal=0;$('cmd').classList.remove('thinking');toast(esc(err.message));}});

/* ---------- glass light follows the pointer ---------- */
function glassLight(el){el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();el.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');el.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');},{passive:true});}
addEventListener('pointermove',e=>{env.tx=e.clientX/innerWidth;env.ty=e.clientY/innerHeight;},{passive:true});

/* ---------- scrolling moves through the space ---------- */
const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add('in');if(x.target.id==='tiles')x.target.querySelectorAll('.mtile').forEach(t=>t.classList.add('in'));}}),{threshold:.15});
document.querySelectorAll('.reveal').forEach(s=>io.observe(s));
const lookIO=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting&&!current)env.look=x.target.dataset.look||null;}),{rootMargin:'-45% 0px -45% 0px'});
document.querySelectorAll('[data-look]').forEach(s=>lookIO.observe(s));
const onScroll=()=>{env.scroll=scrollY/innerHeight;$('bar').classList.toggle('solid',scrollY>40);if(scrollY<innerHeight*.4&&!current)env.look=null;};
addEventListener('scroll',onScroll,{passive:true});

/* ---------- live feed: every pulse in the scene is a real or sample reading ---------- */
let feedQ=[],feedI=0;
function buildFeed(){
  const h=health();const q=[];
  h.src.filter(s=>s.status==='ok').forEach(s=>{const d=s.data||{};q.push({name:s.name,text:s.name==='GitHub'?`${d.count??'?'} repos, ${d.openIssues??'?'} open issues`:s.name==='Cloudflare'?`${d.count??'?'} zones checked`:s.name==='Supabase'?`${(d.projects||[]).filter(p=>p.status==='ACTIVE_HEALTHY').length} of ${d.count??'?'} projects healthy`:'reporting'});});
  h.sites.forEach(s=>q.push({name:'Sites',text:`${s.name} answered ${s.status??'?'} in ${s.ms??'?'} ms`,crit:s.status>=500}));
  if(S.real.mail){const E=S.sample.emails;q.push({name:'Gmail',text:`${E.length} new · ${E.filter(e=>e.triage==='need').length} need you`,crit:true});}
  if(S.real.cal)q.push({name:'Calendar',text:`${S.sample.events.filter(e=>e.end>new Date()).length} events left today`});
  if((GOAT.sites||[]).some(x=>x.ok))q.push({name:'GoatCounter',text:`${GOAT.sites.reduce((n,x)=>n+(x.today||0),0)} visitors today`});
  for(let i=q.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[q[i],q[j]]=[q[j],q[i]];}
  feedQ=q;
}
env.pick=()=>{if(!feedQ.length)return null;if(env.look&&Math.random()<.5){const m=feedQ.find(x=>x.name===env.look);if(m)return m;}return feedQ[feedI++%feedQ.length];};
env.onPulse=m=>{const t=$('live-text');t.classList.add('swap');setTimeout(()=>{t.innerHTML=`<span class="${m.crit?'crit':''}">${esc(m.name)}</span> · ${esc(m.text)}`;t.classList.remove('swap');},220);$('ldot').classList.toggle('crit',!!m.crit);};

/* ---------- today: free time gets a plan ---------- */
const dur=ms=>{const m=Math.round(ms/60000);const h=Math.floor(m/60),r=m%60;return h?`${h}h${r?' '+String(r).padStart(2,'0'):''}`:m+' min';};
function todoPool(){
  const E=id=>S.sample.emails.find(e=>e.id===id);const em=e=>({kind:'email',e,key:'e:'+e.id,node:'Gmail',sample:!S.real.mail});const out=[];
  S.items.filter(x=>x.level==='urgent').slice(0,2).forEach(x=>out.push({t:x.kind==='cluster'?x.title:titleOf(x),min:20,it:x,crit:true}));
  const tap=S.ideas?.find(i=>i.id==='tap-titles');if(tap)out.push({t:'Rewrite TAP page titles',min:45,it:tap});
  return out;
}
function gapPlan(){
  const now=new Date(),day=h=>new Date(new Date().setHours(h,0,0,0));
  const ev=[...S.sample.events].sort((a,b)=>a.start-b.start);const gaps=[];let cur=new Date(Math.max(now,day(8)));cur.setMinutes(Math.ceil(cur.getMinutes()/5)*5,0,0);
  for(const e of ev){if(e.start-cur>=25*60000)gaps.push({start:new Date(cur),end:new Date(e.start)});if(e.end>cur)cur=new Date(e.end);}
  if(day(18)-cur>=25*60000)gaps.push({start:cur,end:day(18)});
  const pool=todoPool();
  gaps.forEach(g=>{let left=(g.end-g.start)/60000-5;g.fill=[];while(pool.length){const k=pool.findIndex(p=>p.min<=left);if(k<0)break;const p=pool.splice(k,1)[0];g.fill.push(p);left-=p.min;if(g.fill.length>=3)break;}});
  return gaps;
}

/* ---------- ideas: what I'd do if I were running your week ---------- */
function ideas(){
  const out=[];const E=id=>S.sample.emails.find(e=>e.id===id);const cl=S.items.find(x=>x.kind==='cluster');
  if(cl)out.push({id:'own-once',title:`Do the ${NUM[cl.members.length]||cl.members.length} ownership checks in one sitting`,why:'Each check needs the same evidence: who owns it, who pays, and whether backups restore. Gathering it once and recording it in one register stops the same work being redone three times.',value:'One register instead of three reviews',eff:'20 min',crit:cl.level==='urgent',
    steps:cl.members.map(m=>[m.label+': '+(m.p.action||'confirm the owner and payer')]),open:cl});
  if(!(GOAT.sites||[]).length)out.push({id:'goat-add',title:'Add your sites to GoatCounter here',why:'I can only tell you what your visitors are doing once each site is connected. Until then there are no visitor numbers at all, because I will not invent them.',value:'Real visitor numbers for every site',eff:'3 min per site',
    steps:[['Open https://YOURCODE.goatcounter.com/user/api, choose New token, tick Read statistics and copy it','https://www.goatcounter.com/'],['Open Connections, GoatCounter, paste the site code and token, and press Add site']]});
  S.items.filter(x=>x.kind==='improvement').forEach(x=>out.push({id:x.key,title:x.title||firstSentence(x.text),why:x.title?x.text:x.text.replace(firstSentence(x.text),'').trim(),value:'Less repeated checking',eff:'Half a day',steps:[],imp:x}));
  return out.filter(x=>!S.dismissed.has('idea:'+x.id)).map(x=>({...x,kind:'idea',key:'idea:'+x.id,node:x.open?.node||'Supabase',text:x.why,level:'opportunity'}));
}
function renderIdeas(){
  const I=S.ideas=ideas();
  $('ideas-meta').textContent=`${I.length} ideas`;
  $('ideas').innerHTML=I.map((x,i)=>`<button type="button" class="idea glass ${x.crit?'crit':''}" data-i="${i}"><span class="n">${String(i+1).padStart(2,'0')}</span><span class="b"><b>${esc(x.title)}</b><small>${esc(x.value)}</small></span><span class="side"><span class="eff">${esc(x.eff)}</span>${x.sample?'<span class="sample">Sample</span>':''}</span></button>`).join('');
  $('ideas').querySelectorAll('.idea').forEach(b=>{glassLight(b);b.addEventListener('click',()=>openFocus(I[+b.dataset.i],b));});
}

/* ---------- plugged in: what I can see, and exactly what you do to give me more ---------- */
const CF_SECRETS='https://dash.cloudflare.com/50b17fc7d1884367a1b2df1c400f8cf2/workers/services/view/traceytech-cockpit/production/settings';
const CONNECT=[
  {name:'Google',covers:['Gmail','Calendar'],unlocks:'Your real inbox triaged with drafted replies, your calendar with prep notes, and search clicks for every site.',time:'10 min',
    steps:[['Create a Google Cloud project called TraceyTech','https://console.cloud.google.com/projectcreate'],
      ['Turn on the Gmail API, Google Calendar API and Search Console API','https://console.cloud.google.com/apis/library'],
      ['Set up the consent screen as External and add your own email as a test user','https://console.cloud.google.com/apis/credentials/consent'],
      ['Create an OAuth client ID, type Web application, with https://traceytech.app/connect/google/callback as the redirect address','https://console.cloud.google.com/apis/credentials'],
      ['Add the client ID and secret to TraceyTech as secrets named GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',CF_SECRETS],
      ['Open Plugged in, press Connect Google and approve once, then press Test every service']]},
  {name:'Claude agents',covers:[],novel:true,unlocks:'Your Gmail and Google Calendar are already connected to Claude. Until Google is set up here, a scheduled Claude agent can read them every hour and post a summary into TraceyTech. Nothing is sent, and no password is stored here.',time:'1 min',
    steps:[['Say yes in our chat and I set it up. You can switch it off at any time']]},
  {name:'GoatCounter',covers:['GoatCounter'],unlocks:'Visitors and pageviews for each of your sites, privately, with no cookies.',time:'3 min per site',
    steps:[['Open your site\'s GoatCounter API settings. The address is https://YOURCODE.goatcounter.com/user/api, where YOURCODE is the name you chose at sign-up','https://www.goatcounter.com/'],['Choose New token, tick Read statistics only, and copy it'],['Open Connections, GoatCounter, paste the site code and the token, and press Add site']]},
  {name:'LinkedIn',covers:['LinkedIn'],partial:true,unlocks:'Followers, post reach and which topics land.',time:'15 min',
    limit:'LinkedIn does not let apps read a personal profile\'s analytics, so here I can only partly help.',
    steps:[['Best route: create a LinkedIn Page for Thinking About Policing or TraceyTech. Page analytics can be read by an approved app','https://www.linkedin.com/company/setup/new/'],
      ['Register a TraceyTech developer app and request the Community Management API','https://www.linkedin.com/developers/apps/new'],
      ['Last resort for your personal profile: export your post analytics once a month and drop the file into our chat','https://www.linkedin.com/analytics/creator/content/']]},
  {name:'Finance',covers:['Finance'],unlocks:'Spend by company, AI subscription costs and receipts in one place.',time:'2 min',
    steps:[['Tell me which tool keeps your books: Xero, FreeAgent, QuickBooks or your bank. Each offers a read-only connection'],['If you take payments through Stripe, Claude can already read it. Say yes and I link it']]},
  {name:'Messages',covers:[],partial:true,unlocks:'WhatsApp and text messages that need a reply.',
    limit:'WhatsApp and iMessage do not let outside apps read personal chats, so I cannot bring these in. Email and LinkedIn messages will arrive once those are connected.',steps:[]}
];
function connState(c){
  if(c.live)return c.live;const N=nodeStates();
  if(c.covers.length&&c.covers.every(n=>N.find(x=>x.name===n)?.state==='ok'))return 'ok';
  if(c.covers.some(n=>N.find(x=>x.name===n)?.state==='sample'))return 'sample';
  return c.partial&&!c.covers.length?'cant':'off';
}
const CONN_TXT={ok:'Live',sample:'Sample data until you connect',off:'Not connected',cant:'Can\'t connect',crit:'Failing'};
function renderSources(){
  const N=nodeStates();const h=health();
  const live=['GitHub','Cloudflare','Supabase'].map(n=>({name:n,state:N.find(x=>x.name===n)?.state||'off'}));
  live.push({name:'Your sites',state:h.bad.length?'crit':'ok',note:`${h.sites.length} checked`});
  $('src-meta').textContent=`${live.filter(n=>n.state==='ok').length} live · ${CONNECT.filter(c=>connState(c)!=='ok').length} to plug in`;
  $('srcs').innerHTML=`<div class="goog glass" id="goog"></div><div class="live-row">${live.map(n=>`<button type="button" class="src glass" data-n="${esc(n.name)}"><i class="${n.state==='ok'?'':n.state}"></i>${esc(n.name)}<em>${esc(n.note||CONN_TXT[n.state]||'')}</em></button>`).join('')}</div>`+
    `<div class="plug">${CONNECT.map((c,i)=>{const st=connState(c);return `<button type="button" class="conn glass ${c.novel?'novel':''}" data-i="${i}"><span class="top"><i class="${st==='ok'?'':st}"></i><b>${esc(c.name)}</b><em>${esc(c.novel?'New idea':CONN_TXT[st])}</em></span><span class="u">${esc(c.unlocks)}</span><span class="f">${c.steps.length?`<span>You: ${esc(c.time)}</span><span class="go">${c.novel?'How it works':'How to connect'}</span>`:'<span>No route in. Last resort only</span><span class="go">Why</span>'}</span></button>`;}).join('')}</div>`;
  $('srcs').querySelectorAll('.src').forEach(b=>{glassLight(b);b.addEventListener('mouseenter',()=>{env.look=b.dataset.n==='Your sites'?'Sites':b.dataset.n;});b.addEventListener('click',()=>openFocus({kind:'health',key:'health',node:b.dataset.n==='Your sites'?'Sites':b.dataset.n},b));});
  $('srcs').querySelectorAll('.conn').forEach(b=>{glassLight(b);const c=CONNECT[+b.dataset.i];b.addEventListener('click',()=>openFocus({kind:'conn',c,key:'conn:'+c.name,node:c.covers[0]||'Supabase',sample:true},b));});
}


/* ---------- Google: connect once, then test each service. Summaries only, nothing is sent ---------- */
const GOOG={s:null,busy:false};
async function loadGoogle(){try{GOOG.s=await api('/api/google/status');}catch(e){GOOG.s={error:e.message};}
  const c=CONNECT[0];if(GOOG.s&&GOOG.s.connected)c.live='ok';else delete c.live;renderGoogle();
  const g=GOOG.s;if(g&&g.connected&&!GOOG.auto&&(!g.test||Date.now()-new Date(g.test.at)>216e5)){GOOG.auto=true;try{const r=await api('/api/google/test',{});g.test={at:r.at,results:r.results};g.refused=false;}catch(e){g.refused=true;}GOOG.auto=false;renderGoogle();if(typeof renderLenses==='function'&&S.graph){renderLenses();refreshConns();}}}
function renderGoogle(){
  const host=$('goog');if(!host)return;const g=GOOG.s;
  if(!g){host.innerHTML='';return;}
  if(g.error){host.innerHTML=`<div class="gh"><b>Google</b><em>Could not check: ${esc(g.error)}</em></div>`;return;}
  if(!g.configured){host.innerHTML=`<div class="gh"><b>Google</b><em>The client ID and secret are not saved yet</em></div>`;return;}
  const res=(g.test&&g.test.results||[]).filter(r=>r.name!=='Analytics');
  const rows=res.map(r=>`<li class="${r.ok?'ok':'bad'}"><i></i><b>${esc(r.name)}</b><span>${esc(r.ok?(r.detail||'Working'):(r.error||'Failed'))}</span></li>`).join('');
  host.innerHTML=`<div class="gh"><b>Google</b><em>${g.connected?'Connected as '+esc(g.email||'your account'):'Not connected yet'}</em></div>`+
   `<p class="gp">${g.connected?'Read-only access: Gmail, Calendar, Search Console and Drive file names. I never send or change anything, and message contents are not stored.':'One approval on Google\'s own page. Read-only. You can disconnect here at any time.'}</p>`+
   `<div class="gb">${g.connected?`<button type="button" class="pill" id="g-test"${GOOG.busy?' disabled':''}>${GOOG.busy?'Testing…':'Test every service'}</button><a class="pill" href="/connect/google">Reconnect</a><button type="button" class="pill" id="g-off">Disconnect</button>`:'<a class="pill gear" href="/connect/google">Connect Google</a>'}</div>`+
   (rows?`<ul class="gres">${rows}</ul><p class="gp">Last test ${esc(new Date(g.test.at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}. A failed row says why; usually that API still needs switching on in Google Cloud.</p>`:'');
  const t=$('g-test');if(t)t.onclick=async()=>{GOOG.busy=true;renderGoogle();try{const r=await api('/api/google/test',{});GOOG.s.test={at:r.at,results:r.results};}catch(e){toast(`<b>Test did not run.</b> ${esc(e.message)}`);}GOOG.busy=false;renderGoogle();};
  const o=$('g-off');if(o)o.onclick=async()=>{try{await api('/api/google/disconnect',{});GOOG.s=await api('/api/google/status');delete CONNECT[0].live;}catch(e){toast(`<b>Not disconnected.</b> ${esc(e.message)}`);}renderGoogle();renderSources();};
}



/* ---------- reply boxes: answer anything I raise, in your own words ---------- */
S.answers={};
async function loadAnswers(){try{const r=await api('/api/answers');S.answers=Object.fromEntries((r.rows||[]).map(x=>[x.key,x]));}catch(e){}}
const clashKey=p=>'clash:'+p.title+'|'+new Date(p.start).toISOString().slice(0,10);
function rbHtml(key,title,ph){const a=S.answers[key];
  return `<div class="rbox" data-key="${esc(key)}" data-title="${esc(title)}">${a?`<p class="rans"><b>You told me:</b> ${esc(a.text)}${a.summary?`<em>Understood: ${esc(a.summary)}</em>`:''}<button type="button" data-rb="undo">Undo</button></p>`:''}
  <div class="rin"><input type="text" maxlength="500" placeholder="${esc(ph||'Tell me more, or correct me')}" aria-label="Reply to TraceyTech"><button type="button" data-rb="send">Send</button></div><div class="rwhy" hidden></div></div>`;}
function refreshClash(){S.life=lifeData();S.clash=clashes();const s=$('lens-clash');const L=LENSES.find(l=>l.id==='clash');if(s&&L)s.innerHTML=L.pane();renderLenses();}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-rb]');if(!b)return;const box=b.closest('.rbox');if(!box)return;const key=box.dataset.key,title=box.dataset.title,a=b.dataset.rb;
  if(a==='send'){const inp=box.querySelector('input'),text=inp.value.trim();if(!text)return;b.disabled=true;
    try{const r=await api('/api/reply',{key,title,text});S.answers[key]={key,text,effect:r.effect,summary:r.summary};
      const why=box.querySelector('.rwhy');
      if(key.startsWith('clash:')){refreshClash();}else{box.outerHTML=rbHtml(key,title);}
      const nb=document.querySelector(`.rbox[data-key="${CSS.escape(key)}"]`)||box;const w=nb.querySelector('.rwhy');
      if(w){w.hidden=false;w.dataset.did=r.decision_id||'';w.innerHTML=`<p>Understood: <b>${esc(r.summary||'noted')}</b>${r.effect==='resolved'?'. I will stop flagging this.':r.effect==='ignore'?'. I will stop raising it.':'. Saved.'}</p>${r.decision_id?`<div class="rin"><input type="text" maxlength="400" placeholder="Why? (optional, it helps me learn)"><button type="button" data-rb="why">Save why</button></div>`:''}`;}
    }catch(er){toast(`<b>Not saved.</b> ${esc(er.message)}`);b.disabled=false;}return;}
  if(a==='why'){const w=box.querySelector('.rwhy'),v=w.querySelector('input').value.trim(),did=w.dataset.did;if(!v||!did)return;b.disabled=true;
    try{await api('/api/decision',{decision_id:did,title:'reason',question:'Why?',answer:v});w.innerHTML='<p>Thanks, logged with your reason.</p>';loadLearning().then(renderLearned);}catch(er){toast(`<b>Not saved.</b> ${esc(er.message)}`);b.disabled=false;}return;}
  if(a==='undo'){try{await api('/api/reply',{key,undo:true});delete S.answers[key];if(key.startsWith('clash:'))refreshClash();else box.outerHTML=rbHtml(key,title);}catch(er){toast(`<b>Not undone.</b> ${esc(er.message)}`);}}
});


/* ---------- Google Maps: directions and places near you. Location stays on this device until you ask for a route ---------- */
const MAPS={configured:null,pos:null,posErr:'',mode:'DRIVE',route:null,routeFor:'',near:null,nearType:'',busy:'',err:''};
const MAP_STEPS=[['Turn on Routes API and Places API (New) in your TraceyTech Google Cloud project. Billing must be switched on; personal use normally stays inside the free monthly allowance','https://console.cloud.google.com/apis/library/routes.googleapis.com'],['Also turn on Places API (New)','https://console.cloud.google.com/apis/library/places.googleapis.com'],['Create an API key and restrict it to just those two APIs','https://console.cloud.google.com/apis/credentials'],['Open Connections, Google Maps, paste the key and press Save key']];
async function loadMaps(){try{const r=await api('/api/maps/status');MAPS.configured=!!r.configured;}catch(e){MAPS.configured=false;}}
function getPos(){return new Promise(res=>{if(!navigator.geolocation){MAPS.posErr='This device cannot share its location.';return res(null);}
  navigator.geolocation.getCurrentPosition(p=>{MAPS.pos={lat:p.coords.latitude,lng:p.coords.longitude,at:Date.now()};MAPS.posErr='';res(MAPS.pos);},e=>{MAPS.posErr=e.code===1?'Location is blocked. Allow it for TraceyTech in your phone or app settings, then try again.':'Could not get your location. Try again outdoors or with signal.';res(null);},{enableHighAccuracy:false,timeout:12000,maximumAge:120000});});}
const virtualWhere=w=>!w||/^https?:|zoom|teams|meet\.google|video call|webex|phone|call$/i.test(w);
function nextPlace(){const now=Date.now();return (S.upcoming||[]).find(e=>e.end>now&&e.start-now<36*36e5&&!virtualWhere(e.where))||null;}
const dirUrl=(dest,mode)=>'https://www.google.com/maps/dir/?api=1'+(MAPS.pos?`&origin=${MAPS.pos.lat},${MAPS.pos.lng}`:'')+`&destination=${encodeURIComponent(dest)}&travelmode=${({DRIVE:'driving',WALK:'walking',TRANSIT:'transit',BICYCLE:'bicycling'})[mode]||'driving'}`;
async function fetchRoute(){const ev=nextPlace();if(!ev||!MAPS.pos||!MAPS.configured)return;const k=ev.id+'|'+MAPS.mode+'|'+MAPS.pos.lat.toFixed(2)+MAPS.pos.lng.toFixed(2);if(MAPS.routeFor===k&&MAPS.route)return;
  MAPS.busy='route';MAPS.err='';try{const r=await api('/api/maps/route',{lat:MAPS.pos.lat,lng:MAPS.pos.lng,dest:ev.where,mode:MAPS.mode});MAPS.route=r;MAPS.routeFor=k;}catch(e){MAPS.route=null;MAPS.err=e.message;}MAPS.busy='';}
async function fetchNear(type){if(!MAPS.pos||!MAPS.configured)return;MAPS.busy='near';MAPS.nearType=type;MAPS.err='';try{const r=await api('/api/maps/nearby',{lat:MAPS.pos.lat,lng:MAPS.pos.lng,type});MAPS.near=r.places||[];}catch(e){MAPS.near=null;MAPS.err=e.message;}MAPS.busy='';}
function refreshMaps(){['there','near'].forEach(id=>{const L=LENSES.find(l=>l.id===id),s=$('lens-'+id);if(s&&L)s.innerHTML=L.pane();});renderLenses();}
const mapSetup=()=>`<p class="empty">Google Maps is not connected yet. Nothing here is guessed. To switch it on:</p><ol class="steps">${MAP_STEPS.map(s=>`<li>${s[1]?`<a href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`:esc(s[0])}</li>`).join('')}</ol>`;
const locBtn=()=>`<p class="empty">${esc(MAPS.posErr||'I need your location to work this out. It stays on this phone until you ask for a route, then only your coordinates are sent to Google through TraceyTech.')}</p><button type="button" class="act primary" data-mp="loc">Share my location</button>`;
const hm=d=>hhmm(d);
const MAPLENS=[{id:'there',type:'work',title:'Getting there',sample:false,
  score:()=>{const e=nextPlace();if(!e)return 0;const h=(e.start-Date.now())/36e5;return h<=3?88:h<=12?60:40;},
  why:()=>{const e=nextPlace();if(!e)return '';if(MAPS.route&&MAPS.routeFor.startsWith(e.id)){const leave=new Date(+e.start-MAPS.route.seconds*1000-5*60000);return `Leave by ${hm(leave)} for ${e.title}`;}return `${e.title} at ${hm(e.start)}`;},
  preview:()=>{const e=nextPlace();if(!e)return '';return MAPS.route&&MAPS.routeFor.startsWith(e.id)?`<span class="big">${Math.round(MAPS.route.seconds/60)}<small> min</small></span>`:'';},
  pane:()=>{const e=nextPlace();if(!e)return `<header><h2>Getting there</h2></header><p class="empty">Nothing on your calendar in the next day has a place to travel to.</p>`;
   const modes=[['DRIVE','Drive'],['TRANSIT','Transit'],['WALK','Walk'],['BICYCLE','Cycle']];
   let body='';
   if(!MAPS.configured)body=mapSetup();else if(!MAPS.pos)body=locBtn();
   else if(MAPS.busy==='route')body='<p class="empty">Working it out…</p>';
   else if(MAPS.route&&MAPS.routeFor.startsWith(e.id)){const r=MAPS.route,leave=new Date(+e.start-r.seconds*1000-5*60000);
     body=`<div class="mroute"><span class="big">${Math.round(r.seconds/60)}<small> min</small></span><p>${(r.meters/1609.34).toFixed(1)} miles. Leave by <b>${hm(leave)}</b> to arrive five minutes early.</p></div>`;}
   else body=`<p class="empty">${esc(MAPS.err||'')}</p><button type="button" class="act primary" data-mp="route">Get travel time</button>`;
   return `<header><h2>Getting there</h2><div class="meta">${hm(e.start)}–${hm(e.end)}</div></header>
   <div class="d-sec"><h3>${esc(e.title)}</h3><p>${esc(e.where)}</p></div>
   <div class="mmodes">${modes.map(([k,n])=>`<button type="button" class="${MAPS.mode===k?'on':''}" data-mp="mode" data-v="${k}">${n}</button>`).join('')}</div>
   ${body}
   <p><a class="act" href="${esc(dirUrl(e.where,MAPS.mode))}" target="_blank" rel="noopener">Open directions in Google Maps</a></p>
   ${rbHtml('item:there:'+e.id,e.title+' travel','e.g. I will be coming from work')}`;}},
{id:'near',type:'idea',title:'Near you',sample:false,
  score:()=>MAPS.pos&&MAPS.configured?30:22,
  why:()=>!MAPS.configured?'Turn on Google Maps':!MAPS.pos?'Share your location':'Fuel, coffee, parking and more',
  preview:()=>'',
  pane:()=>{const types=[['gas_station','Fuel'],['cafe','Coffee'],['pharmacy','Pharmacy'],['parking','Parking'],['electric_vehicle_charging_station','EV charging'],['atm','Cash machine'],['restaurant','Food']];
   let body='';
   if(!MAPS.configured)body=mapSetup();else if(!MAPS.pos)body=locBtn();
   else body=`<div class="mmodes">${types.map(([k,n])=>`<button type="button" class="${MAPS.nearType===k?'on':''}" data-mp="near" data-v="${k}">${n}</button>`).join('')}</div>
     ${MAPS.busy==='near'?'<p class="empty">Looking…</p>':MAPS.err?`<p class="empty">${esc(MAPS.err)}</p>`:MAPS.near?(MAPS.near.length?`<div class="plist">${MAPS.near.map(p=>`<article><div><b>${esc(p.name)}</b><p>${esc(p.addr)}${p.rating?` · ${p.rating}★`:''}</p></div><a class="by" href="${esc(p.url||dirUrl(p.addr,'DRIVE'))}" target="_blank" rel="noopener">${p.open===true?'Open':p.open===false?'Closed':'Map'}</a></article>`).join('')}</div>`:'<p class="empty">Nothing found close by.</p>'):'<p class="empty">Pick what you need.</p>'}`;
   return `<header><h2>Near you</h2><div class="meta">${MAPS.pos?'Within about a mile':''}</div></header>${body}`;}}];
document.addEventListener('click',async e=>{const b=e.target.closest('[data-mp]');if(!b)return;const a=b.dataset.mp;
  if(a==='loc'){b.disabled=true;await getPos();if(MAPS.pos){await fetchRoute();}refreshMaps();return;}
  if(a==='mode'){MAPS.mode=b.dataset.v;MAPS.route=null;MAPS.routeFor='';refreshMaps();await fetchRoute();refreshMaps();return;}
  if(a==='route'){await fetchRoute();refreshMaps();return;}
  if(a==='near'){refreshMaps();await fetchNear(b.dataset.v);refreshMaps();}
});
function mapsBlock(){return `<div class="gcs"><div class="cam"><input type="password" id="mk-in" maxlength="80" placeholder="Google Maps API key" autocomplete="off"><button type="button" data-ca="maps-save">Save key</button>${MAPS.configured?'<button type="button" data-ca="maps-rm">Remove</button>':''}</div>
  <p class="gp2">Encrypted before it is saved, and only used from the server. Needs Routes API and Places API (New) switched on.</p></div>`;}

/* ---------- real Gmail and Calendar: summaries only, nothing is sent or changed ---------- */
const decode=s=>String(s||'').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
function mapMail(x){const m=/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(x.from||'');const addr=(m?m[2]:x.from||'').toLowerCase(),name=decode((m&&m[1])||addr.split('@')[0]||'Unknown');
  const auto=x.bulk||/(no-?reply|notification|noreply|mailer|donotreply|news|digest|alerts?@|support@|billing@|github\.com|linkedin\.com)/.test(addr);
  const dom=(addr.split('@')[1]||'').replace(/^(mail|email|e|info)\./,'');
  return {id:x.id,thread:x.thread,from:name,ini:name.split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?',subject:decode(x.subject)||'(no subject)',when:new Date(x.when),triage:auto?'wait':'need',group:dom,summary:decode(x.snippet).slice(0,170)};}
async function loadFeed(){if(!(GOOG.s&&GOOG.s.connected))return;
  try{const f=await api('/api/google/feed');GOOG.feedErr=f.errors||{};
    if(!GOOG.feedErr.gmail){S.sample.emails=(f.emails||[]).map(mapMail);S.real.mail=true;document.querySelectorAll('.t-inbox .sample,#inbox-smp').forEach(x=>x.remove());}
    if(!GOOG.feedErr.calendar){const t0=new Date().setHours(0,0,0,0),t1=t0+864e5;S.sample.events=(f.events||[]).filter(e=>!e.allDay&&e.start&&e.end&&+new Date(e.start)>=t0&&+new Date(e.start)<t1).map(e=>({id:e.id,start:new Date(e.start),end:new Date(e.end),title:e.title,where:e.where||''}));S.upcoming=(f.events||[]).filter(e=>!e.allDay&&e.start&&e.end).map(e=>({id:e.id,start:new Date(e.start),end:new Date(e.end),title:e.title,where:e.where||''}));S.real.cal=true;const ts=$('today-smp');if(ts)ts.remove();}
  }catch(e){GOOG.feedErr={google:e.message};}
  repaint();}
function repaint(){S.life=null;S.ideas=ideas();S.graph=graphData();env.setGraph(S.graph);composeVoice();renderChain();renderDeck();renderIdeas();renderInbox();renderAhead();renderToday();renderPulse();renderSources();renderGoogle();renderPreviews();refreshConns();}

/* ---------- the map: every source, project and item, joined where they really connect ---------- */
const SRC_OF_KIND={'Repository':'GitHub','DNS zone':'Cloudflare','Worker':'Cloudflare','Pages project':'Cloudflare','Database':'Supabase','Search Console':'GoatCounter'};
const EV_GROUP=[[/sebp/i,'sebp'],[/mortgage/i,'mortgage'],[/tap\b|policing/i,'tap'],[/accountant|inbox/i,'traceytech']];
function groupKey(name){const g=S.data.groups||{};const n=String(name||'').toLowerCase();return Object.keys(g).find(k=>{const v=g[k].toLowerCase();return k===n||v===n||v.startsWith(n)||n.startsWith(v);})||null;}
function graphData(){
  const nodes=[],edges=[],G=S.data.groups||{},h=health();const add=n=>{nodes.push(n);};
  add({id:'hub',kind:'hub',label:'You',w:3});
  [...nodeStates(),{name:'Sites',state:h.bad.length?'crit':'ok'}].forEach(s=>{add({id:'s:'+s.name,kind:'source',label:s.name,sample:s.state==='sample',off:s.state==='off',crit:s.state==='crit',w:2.4});edges.push(['hub','s:'+s.name,4.6]);});
  Object.entries(G).forEach(([k,v])=>{add({id:'p:'+k,kind:'project',label:v,w:2});edges.push(['hub','p:'+k,2.4]);});
  S.data.assets.forEach(a=>{const id='a:'+a.id;add({id,kind:'asset',label:a.name,near:'p:'+a.grp,meta:a.kind});if(G[a.grp])edges.push(['p:'+a.grp,id,1]);const s=SRC_OF_KIND[a.kind];if(s)edges.push(['s:'+s,id,3]);
    if(a.kind==='DNS zone'&&h.sites.some(x=>x.name===a.name))edges.push(['s:Sites',id,2.4]);});
  const item=(it,label,src,groups,crit,sample)=>{const id='i:'+it.key;add({id,kind:'item',label,crit,sample,ref:it,near:'s:'+src,w:1.4});edges.push(['s:'+src,id,1.9]);groups.filter(g=>G[g]).forEach(g=>edges.push(['p:'+g,id,1.3]));};
  S.items.forEach(it=>item(it,it.kind==='cluster'?it.title:titleOf(it),it.node,it.kind==='cluster'?[...new Set(it.members.map(m=>m.p.group))]:it.kind==='priority'?[it.p.group]:it.kind==='project'?[it.w.group]:[],isCrit(it),false));
  S.sample.emails.forEach(e=>item({kind:'email',e,key:'e:'+e.id,node:'Gmail',sample:!S.real.mail},e.subject,'Gmail',[groupKey(e.group)],e.triage==='need',true));
  S.sample.events.forEach(ev=>item({kind:'event',ev,key:'ev:'+ev.id,node:'Calendar',sample:!S.real.cal},ev.title,'Calendar',EV_GROUP.filter(([r])=>r.test(ev.title+' '+(ev.note||''))).map(x=>x[1]).slice(0,1),false,true));
  return {nodes,edges};
}
function neighbours(id){const g=S.graph;const out=new Set();g.edges.forEach(([a,b])=>{if(a===id)out.add(b);if(b===id)out.add(a);});return [...out].map(x=>g.nodes.find(n=>n.id===x)).filter(Boolean);}
let labelEls=new Map();
function buildLabels(){
  const box=$('map-labels');box.innerHTML='';labelEls=new Map();
  S.graph.nodes.forEach(n=>{const b=document.createElement('button');b.type='button';b.className=`ml ${n.kind} ${n.crit?'crit':''} ${n.sample?'smp':''}`;
    if(n.col)b.style.setProperty('--c',n.col);if(n.area&&n.kind!=='project'&&n.kind!=='source')b.title=n.area;
    b.textContent=n.label.length>38?n.label.slice(0,36)+'…':n.label;b.addEventListener('click',e=>{e.stopPropagation();tapNode(n,b);});box.appendChild(b);labelEls.set(n.id,b);});
  const k=S.graph.nodes.reduce((m,n)=>(m[n.kind]=(m[n.kind]||0)+1,m),{});
  $('map-meta').textContent=`${k.source} sources · ${k.project} projects · ${k.asset} assets · ${k.item} live items`;
  const lg=$('map-legend');if(lg){const areas=S.graph.nodes.filter(n=>n.kind==='project'&&n.col);
    lg.innerHTML=areas.map(n=>`<span><i style="background:${esc(n.col)}"></i>${esc(n.label)}</span>`).join('')+'<span><i class="crit"></i>Needs you</span><span><i class="smp"></i>Sample</span><span class="hint">Drag to turn · pinch or scroll to zoom · two fingers to move · tap to open</span>';}
}
function drawLabels(){
  const hot=env.hot;const near=hot?new Set(neighbours(hot).map(n=>n.id)):null;const sm=innerWidth<700;
  env.screen().forEach(({n,x,y,z})=>{const b=labelEls.get(n.id);if(!b)return;
    const zm=env.zoom||1,nb=near&&near.has(n.id);
    const show=n.kind==='asset'?(n.id===hot||(nb&&zm>=1.3)||zm>=2.3):n.kind!=='item'||!sm||n.crit||n.id===hot||nb||zm>=1.6;
    const dim=hot&&n.id!==hot&&!(near&&near.has(n.id))&&n.kind!=='hub';
    b.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;b.style.opacity=show?(dim?.28:1)*(1.15-Math.max(0,z-.9)*8):0;b.style.pointerEvents=show?'auto':'none';b.classList.toggle('on',n.id===hot);});
}
function tapNode(n,el){
  env.centre&&env.centre();
  if(n.kind==='asset'){env.hot=n.id;return;}
  if(n.kind==='item'){env.hot=n.id;openFocus(n.ref,el);return;}
  env.hot=env.hot===n.id?null:n.id;if(!env.hot)return;
  openFocus({kind:'node',n,key:'n:'+n.id,node:n.kind==='source'?n.label:null,sample:false},el);
}
function appPull(on){try{window.ConductorPage&&window.ConductorPage.top(!!on);}catch(e){}}
function openMap(){if(!$('env'))return;toggleMenu(false);document.body.classList.add('map');env.mapGoal=1;$('mapui').hidden=false;buildLabels();env.onFrame=drawLabels;appPull(false);
  env.onEmptyTap=()=>{env.hot=null;};}
function closeMap(){document.body.classList.remove('map');env.mapGoal=0;env.hot=null;$('mapui').hidden=true;env.onFrame=null;env.resetView&&env.resetView();appPull(true);}
{const zb=(id,f)=>{const b=$(id);if(b)b.addEventListener('click',f);};zb('map-zin',()=>env.zoomBy&&env.zoomBy(1.35));zb('map-zout',()=>env.zoomBy&&env.zoomBy(1/1.35));zb('map-zfit',()=>{env.hot=null;env.resetView&&env.resetView();});}
$('map-open').addEventListener('click',()=>{closePane(true);openMap();});$('map-menu').addEventListener('click',openMap);$('map-close').addEventListener('click',closeMap);
function nodeDetail(n){
  const nb=neighbours(n.id);const items=nb.filter(x=>x.kind==='item');const assets=nb.filter(x=>x.kind==='asset');const links=nb.filter(x=>x.kind==='source'||x.kind==='project');
  const byKind=assets.reduce((m,a)=>(m[a.meta]=(m[a.meta]||0)+1,m),{});
  const intro=n.kind==='hub'?'Everything I watch for you, in one place.':n.kind==='source'?(n.sample?'Showing sample data until this is connected.':n.off?'Not connected yet. See Plugged in for what to do.':'Live. I read this every two hours.'):'Everything connected to this project, across all your sources.';
  return BACK+`<div class="d-head"><h2 id="d-title">${esc(n.label)}</h2><p class="statusline">${esc(intro)}</p><div class="row2">${Object.entries(byKind).map(([k,v])=>`<div class="kv"><span>${esc(k)}${v===1?'':'s'}</span><b>${v}</b></div>`).join('')}</div></div>
  <div class="d-grid"><div class="d-sec"><h3>${items.length?'Needs attention or coming up':'Nothing needs you here'}</h3>${items.length?`<ul class="steps">${items.map(x=>`<li><div><b>${esc(x.label)}</b><em>${x.crit?'Needs you':x.sample?'Sample':'Watching'}</em></div><button class="step-done" data-act="open" data-id="${esc(x.id)}">Open</button></li>`).join('')}</ul>`:'<p>I\'ll raise anything new here.</p>'}</div>
  <div class="d-sec"><h3>Connected to</h3><p class="chips2">${links.map(x=>`<button type="button" class="chip" data-act="node" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</p>${assets.length?`<h3 class="mt">Assets</h3><p class="assets">${assets.slice(0,40).map(a=>esc(a.label)).join(' · ')}${assets.length>40?' …':''}</p>`:''}</div></div>`;
}

/* ---------- tiles: each one previews its picture; tap and it opens out to the full view ---------- */
const NUMC=n=>{const w=NUM[n]||String(n);return w[0].toUpperCase()+w.slice(1);};
const pv=$('pv'),pvPanel=$('pv-panel'),pvBody=$('pv-body');let pane=null;
const ON_OPEN={'focus-sec':()=>requestAnimationFrame(deckFx),'today-sec':()=>requestAnimationFrame(()=>tickNow(true)),'pulse-sec':()=>setTimeout(()=>$('tiles').querySelectorAll('.mtile').forEach(t=>t.classList.add('in')),250)};
function openPane(id,from){
  const sec=$(id);if(!sec)return;if(pane)closePane(true);toggleMenu(false);
  pane={id,sec,from,home:$('panes')};pvBody.appendChild(sec);pv.classList.add('on');pv.setAttribute('aria-hidden','false');document.body.classList.add('paned');
  env.look=sec.dataset.look||null;env.target=.6;pvBody.scrollTop=0;
  const t=pvPanel.getBoundingClientRect(),o=from&&from.getBoundingClientRect?from.getBoundingClientRect():null;
  if(!reduce&&o&&o.width)pvPanel.animate([{transform:`translate(${o.left-t.left}px,${o.top-t.top}px) scale(${o.width/t.width},${o.height/t.height})`,opacity:.55},{transform:'none',opacity:1}],{duration:SPRING.dur,easing:SPRING.ease});
  ON_OPEN[id]&&ON_OPEN[id]();setTimeout(()=>$('pv-close').focus({preventScroll:true}),reduce?0:200);
}
function closePane(instant){
  if(!pane)return;const p=pane;pane=null;
  const done=()=>{p.home.appendChild(p.sec);pv.classList.remove('on');pv.setAttribute('aria-hidden','true');document.body.classList.remove('paned');env.look=null;env.target=0;p.from?.focus?.({preventScroll:true});};
  const o=p.from&&p.from.isConnected?p.from.getBoundingClientRect():null;
  if(instant===true||reduce||!o||!o.width){done();return;}
  const t=pvPanel.getBoundingClientRect();
  pvPanel.animate([{transform:'none',opacity:1},{transform:`translate(${o.left-t.left}px,${o.top-t.top}px) scale(${o.width/t.width},${o.height/t.height})`,opacity:0}],{duration:Math.round(SOFT.dur*.7),easing:SOFT.ease,fill:'forwards'}).finished.then(()=>{done();pvPanel.getAnimations().forEach(a=>a.cancel());});
}
$('pv-close').addEventListener('click',()=>closePane());$('pv-scrim').addEventListener('click',()=>closePane());
document.querySelectorAll('[data-pane]').forEach(b=>b.addEventListener('click',()=>openPane(b.dataset.pane,b.closest('.tile')||(b.closest('#menu')?$('menu-btn'):b))));
$('voice').addEventListener('click',()=>openPane('brief-sec',$('brief')));

function miniDay(){
  const now=new Date(),E=S.sample.events,G=gapPlan();const x=d=>Math.max(0,Math.min(100,pct(d)));
  return `<svg class="mday" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">${G.map(g=>`<rect class="g" x="${x(g.start)}" y="6" width="${Math.max(.5,x(g.end)-x(g.start))}" height="12" rx="1.5"/>`).join('')}
    ${E.map(e=>`<rect class="e ${e.end<now?'past':''}" x="${x(e.start)+.3}" y="6" width="${Math.max(.6,x(e.end)-x(e.start)-.6)}" height="12" rx="1.5"/>`).join('')}<rect class="n" x="${x(now)}" y="1" width=".5" height="22"/></svg>`;
}
function miniMap(){
  const g=S.graph;if(!g)return '';const P={},src=g.nodes.filter(n=>n.kind==='source'),pr=g.nodes.filter(n=>n.kind==='project');P.hub=[0,0];
  const ring=(list,r,off)=>list.forEach((n,i)=>{const a=i/list.length*6.283+off;P[n.id]=[Math.cos(a)*r,Math.sin(a)*r*.5];});ring(src,44,.3);ring(pr,24,0);
  let k=0;g.nodes.forEach(n=>{if(P[n.id])return;const base=P[n.near]||[0,0];k++;const a=k*2.4,r=n.kind==='asset'?4+(k%5)*1.6:6;P[n.id]=[base[0]+Math.cos(a)*r,base[1]+Math.sin(a)*r*.6];});
  const L=g.edges.filter(([a,b])=>!(a.startsWith('a:')||b.startsWith('a:'))||k%3===0).map(([a,b])=>{const A=P[a],B=P[b];return A&&B?`<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" class="${g.nodes.find(n=>n.id===b)?.crit?'c':''}"/>`:'';}).join('');
  const D=g.nodes.map(n=>{const p=P[n.id];const r=n.kind==='hub'?2.4:n.kind==='source'?1.3:n.kind==='project'?1.1:n.kind==='item'?.8:.45;return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}" class="${n.kind} ${n.crit?'c':''} ${n.sample||n.off?'h':''}"/>`;}).join('');
  return `<svg class="mmap" viewBox="-56 -28 112 56" aria-hidden="true"><g class="ls">${L}</g><g>${D}</g></svg>`;
}
function renderPreviews(){
  const urgent=S.items.filter(x=>x.level==='urgent').length;
  $('tp-needs').innerHTML=`<span class="big ${urgent?'crit':''}">${S.items.length}</span><span class="lbl">${urgent?NUMC(urgent)+' urgent':'to look at'}</span><span class="stack">${S.items.slice(0,3).map(x=>`<i class="${isCrit(x)?'crit':''}"><b>${esc(x.kind==='cluster'?x.title:titleOf(x))}</b></i>`).join('')}</span>`;
  const now=new Date(),nx=S.sample.events.find(e=>e.end>now),G=gapPlan();
  $('tp-today').innerHTML=`${miniDay()}<span class="row1"><b>${nx?hhmm(nx.start):'–'}</b> ${esc(nx?nx.title:'Nothing else today')}</span><span class="lbl">${G.length} free slot${G.length===1?'':'s'}, planned</span>`;
  const E=S.sample.emails,need=E.filter(e=>e.triage==='need');
  $('tp-inbox').innerHTML=`<span class="avs">${E.slice(0,5).map(e=>`<i class="${e.triage==='need'?'crit':''}">${esc(e.ini)}</i>`).join('')}</span><span class="row1"><b class="${need.length?'crit':''}">${need.length}</b> need you</span><span class="lbl">${S.real.mail?'Unread, last 14 days':'Not connected'}</span>`;
  const k=S.graph.nodes.reduce((m,n)=>(m[n.kind]=(m[n.kind]||0)+1,m),{});
  $('tp-map').innerHTML=`${miniMap()}<span class="lbl">${k.source} sources · ${k.project} projects · ${k.asset} assets · ${k.item} live items. Tap to bring it into focus</span>`;
  const I=S.ideas||[];$('tp-ideas').innerHTML=`<span class="big">${I.length}</span><span class="row1">${esc(I[0]?.title||'')}</span><span class="lbl">${esc(I[0]?.value||'')}</span>`;
  const A=allAhead().filter(a=>a.at&&a.at>now).sort((a,b)=>(b.crit?1:0)-(a.crit?1:0)||a.at-b.at)[0];
  $('tp-ahead').innerHTML=A?`<span class="big ${A.crit?'crit':''}">${esc(countdown(A.at).replace(/^in /,''))}</span><span class="row1">${esc(A.title)}</span><span class="lbl">${esc(A.when)}</span>`:'';
  const g=goatSum(),ms=S.data.observations.filter(o=>o.metric==='response_ms').slice(0,24).reverse().map(o=>o.value);
  $('tp-pulse').innerHTML=`<span class="pcols">${[['Visitors',g?fmt(g.week):'–',g?g.series:[]],['Site response',ms.length?Math.round(ms.slice(-6).reduce((a,b)=>a+b,0)/Math.min(6,ms.length))+' ms':'–',ms]].map(c=>`<span class="pc"><small>${esc(c[0])}${c[0]==='Visitors'&&!g?' · not connected':''}</small><b>${esc(c[1])}</b>${spark(c[2],120,30)}</span>`).join('')}</span>`;
  $('tp-pulse').querySelectorAll('path.l').forEach(p=>p.style.setProperty('--len',p.dataset.len));
  const N=nodeStates();$('tp-plug').innerHTML=`<span class="sdots">${N.map(n=>`<i class="${n.state}" title="${esc(n.name)}"></i>`).join('')}</span><span class="row1"><b>${N.filter(n=>n.state==='ok').length}</b> live</span><span class="lbl">${CONNECT.filter(c=>connState(c)!=='ok').length} to plug in, with steps</span>`;
  const L=S.learning;const nd=L?.decisions?.length||0;$('tp-learn').innerHTML=`<span class="big">${nd}</span><span class="lbl">${nd?'decisions logged, with your reasons':'Every decision you make here teaches me. I ask why.'}</span>`;
  const st=edgeSettings();if($('tp-set')){$('tp-set').innerHTML=`<span class="sw">${EDGE.map(([n,c])=>`<i class="${c===st.c?'on':''}" data-c="${c}"></i>`).join('')}</span><span class="lbl">Edge light: ${esc((EDGE.find(e=>e[1]===st.c)||['Your own'])[0])}</span>`;
  $('tp-set').querySelectorAll('.sw i').forEach(i=>i.style.background=i.dataset.c);}
  renderLenses();
}

/* ---------- lenses: the buttons on the board are chosen, not fixed ----------
   Every lens scores itself from what is going on right now: clashes, deadlines,
   who needs you, how close something is. The board shows the strongest first
   and the top one gets the most room. Each lens says why it is where it is. */
const DAY=864e5,at=(d,h,m=0)=>{const x=new Date(d);x.setHours(h,m,0,0);return x;};
/* Your real rota: Section Shifts, Sussex RIT section D, read 26 Nov 2026. Published for Nov to Jan; later months follow the same
   ten-day cycle (four rest days, then early, early, late, late, late, early) and are marked as projected. Leave and bank holidays are not in it. */
const ROTA_FROM=new Date(2026,10,1),ROTA_SRC='https://www.sectionshifts.co.uk/shifts.asp?force=sussex&team=RIT&section=RITxzxD';
const ROTA=('R,R,R,R,E0700-1600,E0700-1700,L1500-2400,L1500-2400,L1200-2100,E0900-1800,R,R,R,R,E0700-1600,E0700-1600,L1300-2400,L1500-2400,L1200-2100,E0900-1800,R,R,R,E0700-1500,E0700-1600,E0700-1600,L1500-2400,L1500-2400,L1200-2100,E0900-1800,'
 +'R,R,R,R,E0700-1700,E0700-1600,L1300-2400,L1500-2400,L1200-2100,E0900-1800,R,R,R,R,E0700-1600,E0700-1600,L1300-2400,L1500-2400,L1200-2100,E0900-1800,R,R,R,R,E0700-1700,E0700-1700,L1500-2400,L1300-2400,L1200-2100,E0900-1800,R,'
 +'R,R,R,E0700-1600,E0700-1600,L1300-2400,L1500-2400,L1200-2100,E0900-1800,R,R,R,R,E0700-1600,E0700-1700,L1500-2400,L1500-2400,L1200-2100,E0900-1800,R,R,R,R,E0700-1600,E0700-1600,L1300-2400,L1500-2400,L1200-2100,E0900-1800,R,R').split(',');
const ROTA_END=new Date(+ROTA_FROM+ROTA.length*DAY);
const CYC=['R','R','R','R','E0700-1600','E0700-1600','L1500-2400','L1500-2400','L1200-2100','E0900-1800'],CYC0=new Date(2027,1,3);
const SH_NAME={E:'Early',L:'Late',R:'Rest day'};
const LEAVE=[[new Date(2026,11,21),new Date(2027,0,3),'Annual leave'],[new Date(2027,6,17),new Date(2027,6,28),'Summer holiday']];/* told to me by Nathan 26 Nov 2026 */
function shiftOn(d){const day=new Date(new Date(d).setHours(0,0,0,0));let code,proj=false;
  const lv=LEAVE.find(l=>day>=l[0]&&day<=l[1]);if(lv)return {c:'R',name:lv[2],day,leave:true};
  if(day>=ROTA_FROM&&day<ROTA_END)code=ROTA[Math.round((day-ROTA_FROM)/DAY)];
  else{proj=true;const i=Math.round((day-CYC0)/DAY);code=CYC[((i%10)+10)%10];}
  const c=code[0];if(c==='R')return {c,name:SH_NAME.R,day,proj};
  const h=code.slice(1).split('-');return {c,name:SH_NAME[c],day,proj,start:at(day,+h[0].slice(0,2),+h[0].slice(2)),end:at(day,+h[1].slice(0,2),+h[1].slice(2))};}
const shiftTxt=s=>s.c==='R'?(s.leave?s.name:'Rest day'):`${s.name} ${hhmm(s.start)}–${hhmm(s.end)}`;
function lifeData(){
  const trip=new Date(2027,2,11);
  const plans=[{title:'Kraków with your wife',kind:'trip',sample:false,start:trip,end:new Date(+trip+96*36e5)},
    ...(S.upcoming||[]).filter(e=>e.end>new Date()).map(e=>({title:e.title,kind:'plan',sample:false,start:e.start,end:e.end}))];
  return {plans,presents:[],birthday:new Date(2027,8,2),trip,summer:new Date(2027,6,17),xmas:new Date(2026,11,25)};
}
function clashes(){
  const L=S.life,out=[];
  L.plans.forEach(p=>{if(p.end<Date.now())return;
    if(p.end-p.start>36e5*30){const w=[];for(let t=+p.start;t<+p.end;t+=DAY){const s=shiftOn(t);if(s.c!=='R')w.push(s);}
      if(w.length){const L2=w.map(s=>`${s.day.toLocaleDateString('en-GB',{weekday:'short',timeZone:TZ})} ${s.name.toLowerCase()}`).join(', ');
        out.push({p,s:w[0],multi:true,level:'clash',why:`You are due to work ${w.length} of the ${Math.round((p.end-p.start)/DAY)} days: ${L2}.${w.some(s=>s.proj)?' The rota for then is not out yet, so this is the usual cycle projected.':''}`,
          fix:'Book annual leave for those days now, or swap the shifts. Early requests are the ones that get approved.'});}
      return;}
    for(const off of [-1,0]){const s=shiftOn(new Date(+p.start+off*DAY));if(s.c==='R')continue;
      if(p.start<s.end&&p.end>s.start){out.push({p,s,level:'clash',why:`You're on ${/^[aeiou]/i.test(s.name)?'an':'a'} ${s.name.toLowerCase()} shift (${hhmm(s.start)}–${hhmm(s.end)}).`,
        fix:p.kind==='work'?'Ask to move it to a rest day ('+shortDay(nextRest(p.start))+') or take the time as leave.':p.kind==='family'?'Ask for a rest-day swap or a few hours of leave now. Christmas and family dates go fast.':'Swap the shift, or move the plan to your next rest day: '+shortDay(nextRest(p.start))+'.'});return;}}
    const s=shiftOn(p.start);if(s.c!=='R'&&s.start>p.end&&s.start-p.end<2*36e5)out.push({p,s,level:'tight',why:`It finishes ${dur(s.start-p.end)} before your ${s.name.toLowerCase()} shift at ${hhmm(s.start)}.`,
      fix:p.kind==='work'?'Only a short gap before your shift. I would set a reminder to wrap up five minutes early.':'Book it for '+hhmm(new Date(+p.start-36e5))+' so you can still rest before the shift, or swap the night.'});
  });const all=out.sort((a,b)=>a.p.start-b.p.start);const hid=c=>{const a=S.answers[clashKey(c.p)];return a&&(a.effect==='resolved'||a.effect==='ignore');};
  S.handled=all.filter(hid);return all.filter(c=>!hid(c));
}
function nextRest(d){for(let i=0;i<20;i++){const x=new Date(+new Date(d)+i*DAY);if(shiftOn(x).c==='R')return x;}return d;}
function restDays(from,to){const o=[];for(let t=+new Date(from).setHours(0,0,0,0);t<=+to;t+=DAY)if(shiftOn(t).c==='R')o.push(new Date(t));return o;}
const days=d=>Math.ceil((new Date(d).setHours(0,0,0,0)-new Date().setHours(0,0,0,0))/DAY);
const strip=(n=10)=>`<span class="shs">${Array.from({length:n},(_,i)=>{const s=shiftOn(Date.now()+i*DAY);return `<i class="s${s.c} ${i?'':'now'}"><b>${s.c==='R'?'':s.c}</b><small>${new Date(Date.now()+i*DAY).toLocaleDateString('en-GB',{weekday:'narrow'})}</small></i>`;}).join('')}</span>`;

const LENSES=[
 {id:'clash',type:'urgent',title:'Clashes',sample:false,mixed:true,score:()=>{const c=S.clash;return c.some(x=>x.level==='clash')?96:c.length?72:0;},
  why:()=>{const c=S.clash.find(x=>x.level==='clash')||S.clash[0];return c?`${c.p.title} vs your ${c.s.name.toLowerCase()} shift`:'';},
  preview:()=>{const c=S.clash,n=c.filter(x=>x.level==='clash').length;const f=c[0];
    return `<span class="big ${n?'crit':''}">${c.length}</span><span class="row1">${n} clash${n===1?'':'es'}, ${c.length-n} tight</span><span class="lbl">Next: ${esc(f?shortDay(f.p.start)+' · '+f.p.title:'')}</span>`;},
  pane:()=>`<header><h2>Clashes</h2><div class="meta">Your plans checked against your real rota <span class="real">Live</span></div></header>
   <div class="clist">${S.clash.map((c,i)=>`<article class="cl ${c.level}"><div class="cl-h"><b>${esc(c.level==='clash'?'Clash':'Tight')}</b><span>${esc(dayLabel(c.p.start))}</span></div>
   <h3>${esc(c.p.title)} <small>${c.multi?esc(shortDay(c.p.start)+' to '+shortDay(new Date(+c.p.end-DAY))):hhmm(c.p.start)+'–'+hhmm(c.p.end)}</small>${c.p.kind==='trip'?' <span class="real">From you</span>':' <span class="real">From your calendar</span>'}</h3><p>${esc(c.why)}</p><p class="fix">${esc(c.fix)}</p>
   ${c.p.kind==='work'?'':`<button type="button" class="act" data-draft="${i}">${c.multi?'Draft a leave request':'Draft a swap request'}</button>`}<div class="drafted" id="swap-${i}" hidden></div>${rbHtml(clashKey(c.p),c.p.title+' clashes with a shift',c.multi?'e.g. my leave is already booked':'e.g. already sorted, or what has changed')}</article>`).join('')||'<p class="empty">No clashes in the next month.</p>'}</div>
   ${(S.handled||[]).length?`<h3 class="ch3">Handled by you</h3><div class="clist">${S.handled.map(c=>`<article class="cl"><div class="cl-h"><b>Handled</b><span>${esc(dayLabel(c.p.start))}</span></div><h3>${esc(c.p.title)}</h3>${rbHtml(clashKey(c.p),c.p.title,'Changed your mind? Tell me')}</article>`).join('')}</div>`:''}`},
 {id:'birthday',type:'personal',title:"Wife's birthday",sample:false,score:()=>{const d=days(S.life.birthday);return d<0?0:d<=14?88:d<=30?62:d<=90?36:14;},
  why:()=>{const d=days(S.life.birthday);return d>120?`Plenty of time. I'd start planning in ${new Date(+S.life.birthday-90*DAY).toLocaleDateString('en-GB',{month:'long',timeZone:TZ})}`:`${d} days to go`;},
  preview:()=>{const b=S.life.birthday,d=days(b),s=shiftOn(b);return `<span class="big">${d}<small> days</small></span><span class="row1">${esc(shortDay(b))} 2027 · ${esc(s.proj?'rota not out yet':shiftTxt(s))}</span><span class="lbl">Start planning ${esc(new Date(+b-90*DAY).toLocaleDateString('en-GB',{month:'long',timeZone:TZ}))}. Leave, gift, table</span>`;},
  pane:()=>{const b=S.life.birthday,s=shiftOn(b),d=n=>new Date(+b-n*DAY);const mo=x=>x.toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:TZ});
   return `<header><h2>Your wife's birthday</h2><div class="meta">${esc(dayLabel(b))} 2027 · ${days(b)} days <span class="real">Date from you</span></div></header>
   <div class="plan3"><article><small>1 · By ${esc(mo(d(120)))}</small><b>Protect the day</b><p>Your rota only runs to the end of January, so I can't see that day yet. A day that far ahead is ${esc(s.proj?'projected as '+shiftTxt(s)+'. That is only a guess':shiftTxt(s))}. Book it as annual leave now, then it can't clash.</p></article>
   <article><small>2 · By ${esc(mo(d(75)))}</small><b>Choose the present</b><p>Anything made or booked takes weeks. Ask her sister or a friend what she's wanted, check what she mentioned this year, and decide a budget.</p></article>
   <article><small>3 · By ${esc(mo(d(45)))}</small><b>Book the evening</b><p>Table for two or a weekend away. Popular places go six weeks ahead. A Thursday is a quieter night to book.</p></article>
   <article><small>4 · By ${esc(mo(d(10)))}</small><b>Card, flowers, wrap</b><p>I'll remind you ten days before so the delivery isn't left to the last minute.</p></article></div>
   <p class="fix">I'll keep the day on my radar and raise it again in ${esc(new Date(+b-90*DAY).toLocaleDateString('en-GB',{month:'long',timeZone:TZ}))}. Tell me what she likes and I'll turn it into present ideas.</p>`;}},
 {id:'trip',type:'personal',title:'Kraków',sample:false,score:()=>{const d=days(S.life.trip);if(d<0)return 0;const bad=S.clash.some(x=>x.multi);return Math.min(80,(d<=120?44:24)+(bad?30:0));},
  why:()=>{const bad=S.clash.find(x=>x.multi);return bad?'Not yet covered by leave':`${days(S.life.trip)} days to go`;},
  preview:()=>{const bad=S.clash.find(x=>x.multi),n=bad?bad.why.match(/work (\d+)/)[1]:0;return `<span class="big">${days(S.life.trip)}<small> days</small></span><span class="row1">11 to 14 March, with your wife</span><span class="lbl ${bad?'crit':''}">${bad?'You are due to work '+n+' of the 4 days. Request leave':'Leave is sorted'}</span>`;},
  pane:()=>{const t=S.life.trip,d=n=>new Date(+t-n*DAY),mo=x=>x.toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:TZ}),bad=S.clash.find(x=>x.multi);
   return `<header><h2>Kraków</h2><div class="meta">Thu 11 to Sun 14 March 2027 <span class="real">Dates from you</span></div></header>
   <div class="plan3"><article><small>1 · This week</small><b>${bad?'Request the leave':'Leave is covered'}</b><p>${esc(bad?bad.why:'Nothing on your rota clashes.')} ${bad?'I have a request drafted in Clashes, ready for you to send.':''}</p></article>
   <article><small>2 · By ${esc(mo(d(70)))}</small><b>Flights and hotel</b><p>Compare direct flights from your nearest airport. Book once leave is agreed. Stay near the Old Town to walk everywhere.</p></article>
   <article><small>3 · By ${esc(mo(d(45)))}</small><b>Check the paperwork</b><p>Passports valid and under ten years old, travel insurance, and the current UK entry rules for Poland: <a href="https://www.gov.uk/foreign-travel-advice/poland" target="_blank" rel="noopener">gov.uk Poland travel advice</a>.</p></article>
   <article><small>4 · By ${esc(mo(d(14)))}</small><b>Plan the days</b><p>March is cold, about 0 to 8 degrees. Book Wawel Castle tickets and a table for one dinner ahead. Auschwitz-Birkenau needs tickets weeks ahead.</p></article></div>
   <p class="fix">The ideas are my suggestions. Tell me what you two enjoy and I will build the days around it.</p>`;}},
 {id:'summer',type:'personal',title:'Summer holiday',sample:false,score:()=>{const d=days(S.life.summer);return d<0?0:d<=60?72:d<=150?40:24;},
  why:()=>{const d=days(S.life.summer);return d>150?`${d} days away. Where are you going?`:`${d} days to go`;},
  preview:()=>`<span class="big">${days(S.life.summer)}<small> days</small></span><span class="row1">17 to 28 July 2027</span><span class="lbl">12 days off. Tell me where and I will plan it</span>`,
  pane:()=>{const t=S.life.summer,d=n=>new Date(+t-n*DAY),mo=x=>x.toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:TZ});
   return `<header><h2>Summer holiday</h2><div class="meta">Sat 17 to Wed 28 July 2027 <span class="real">Dates from you</span></div></header>
   <div class="plan3"><article><small>1 · Now</small><b>Is the leave approved?</b><p>Tell me when it is and I will mark it as confirmed. Until then, the same early request advice applies: ask first and ask early.</p></article>
   <article><small>2 · By ${esc(mo(d(150)))}</small><b>Choose where</b><p>Twelve days is long enough for abroad. Tell me the kind of trip you want, a budget, and who is coming, and I will give you three options.</p></article>
   <article><small>3 · By ${esc(mo(d(120)))}</small><b>Book flights and stay</b><p>July is peak season, so prices climb steadily. Booking four months out usually beats waiting.</p></article>
   <article><small>4 · By ${esc(mo(d(14)))}</small><b>Before you go</b><p>Passports and insurance, an out-of-office I draft for you, and a list of what can wait until you are back. I can hold the non-urgent emails and flag only the urgent ones.</p></article></div>`;}},
 {id:'xmas',type:'personal',title:'Christmas',sample:false,score:()=>{const d=days(S.life.xmas);if(d<0||d>50)return 0;return 40+(50-d)*.6;},
  why:()=>`${days(S.life.xmas)} days. Who are you buying for?`,
  preview:()=>{const s=shiftOn(S.life.xmas);return `<span class="big">${days(S.life.xmas)}<small> days</small></span><span class="row1">Christmas Day: ${esc(shiftTxt(s))}</span>`;},
  pane:()=>{const P=S.life.presents,r=restDays(Date.now(),new Date(2026,11,15));
   return `<header><h2>Christmas</h2><div class="meta">${days(S.life.xmas)} days · order online by Tue 15 Dec to be safe</div></header>
   <p class="empty">I don't know who you are buying for yet. Tell me in the box below, for example "Mum, Dad and my wife", and I will track ideas and order-by dates for each.</p>
   <p class="fix">Shopping days that are already rest days: ${r.map(shortDay).map(esc).join(', ')}. I'd do it all on ${esc(r[0]?shortDay(r[0]):'your next rest day')}.</p>`;}},
 {id:'shifts',type:'work',title:'Shifts and days off',sample:false,score:()=>{const t=shiftOn(Date.now());return t.c==='R'?52:66;},
  why:()=>{const t=shiftOn(Date.now());return t.c==='R'?'Rest day today':`${t.name} today, rest from ${shortDay(nextRest(Date.now()))}`;},
  preview:()=>{const t=shiftOn(Date.now());return `${strip(10)}<span class="row1"><b>Today</b> ${esc(shiftTxt(t))}</span><span class="lbl">Next rest day ${esc(shortDay(nextRest(Date.now())))}</span>`;},
  pane:()=>{const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));
   const cells=Array.from({length:35},(_,i)=>{const d=new Date(+start+i*DAY),s=shiftOn(d),pl=S.life.plans.filter(p=>p.start.toDateString()===d.toDateString()),cl=S.clash.some(c=>c.p.start.toDateString()===d.toDateString()&&c.level==='clash');
     return `<div class="rc s${s.c} ${d.toDateString()===new Date().toDateString()?'now':''} ${cl?'cx':''}"><small>${d.getDate()}</small><b>${s.leave?'Leave':s.c==='R'?'Rest':s.name}</b>${pl.map(p=>`<i>${esc(p.title)}</i>`).join('')}</div>`;}).join('');
   return `<header><h2>Shifts and days off</h2><div class="meta">Sussex RIT D, from Section Shifts <span class="real">Real</span></div></header>
   <div class="roster"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>${cells}</div>
   <p class="fix">Red outline: a plan clashes with a shift. Rota published to 31 January; later weeks follow the same ten-day cycle. It excludes leave, bank holidays and rest days in lieu, so check the official system before committing. <a href="${ROTA_SRC}" target="_blank" rel="noopener">Open Section Shifts</a></p>`;}},
 {id:'plans',type:'personal',title:'Plans',sample:false,score:()=>S.life.plans.filter(p=>p.start>Date.now()&&days(p.start)<=21).length?44:0,
  why:()=>'From your calendar, next three weeks',
  preview:()=>{const n=S.life.plans.filter(p=>p.start>Date.now());const f=n[0];const bad=new Set(S.clash.map(c=>c.p));return `<span class="big">${n.filter(p=>days(p.start)<=31).length}</span><span class="row1">${esc(f?f.title:'')}</span><span class="lbl">${esc(f?shortDay(f.start):'')}${f&&bad.has(f)?' · clashes with a shift':''}</span>`;},
  pane:()=>{const bad=new Map(S.clash.map(c=>[c.p,c]));return `<header><h2>Plans</h2><div class="meta">From your Google Calendar <span class="real">Live</span></div></header>
   <div class="plist">${S.life.plans.filter(p=>p.end>Date.now()).map(p=>{const c=bad.get(p),s=shiftOn(p.start);return `<article class="${c?c.level:''}"><div><b>${esc(p.title)}</b><p>${esc(dayLabel(p.start))} · ${hhmm(p.start)}. ${esc(c?c.why:'You are '+(s.c==='R'?'on a rest day.':'free: '+shiftTxt(s)+'.'))}</p></div><span class="by ${c&&c.level==='clash'?'crit':''}">${c?c.level==='clash'?'Clash':'Tight':'Clear'}</span></article>`;}).join('')}</div>`;}},
];
const CORE={
 'focus-sec':()=>{const u=S.items.filter(x=>x.level==='urgent').length;return [Math.min(94,58+u*9),u?`${NUMC(u)} urgent from your businesses`:'Things waiting on a decision'];},
 'today-sec':()=>[74,`${gapPlan().length} free slots planned`],
 'inbox-sec':()=>{const n=S.sample.emails.filter(e=>e.triage==='need').length;return [38+n*12,n?`${n} business email${n>1?'s':''} need you`:'Nothing needs you'];},
 'ahead-sec':()=>{const a=allAhead().some(x=>x.crit&&x.at&&x.at>Date.now());return [a?70:48,a?'A deadline is close':'What is coming up'];},
 'ideas-sec':()=>[46,'Suggestions to save you time'],
 'map':()=>[30,'Everything you run, connected'],
 'pulse-sec':()=>[34,'Your websites and LinkedIn'],
 'sources-sec':()=>[CONNECT.some(c=>connState(c)!=='ok')?36:18,'Connect the rest'],
 'learn-sec':()=>[20,'What I have learned from you'],
};

/* ---------- connections lens: every plug-in, its health, and what you can do with it ---------- */
const CS={rows:{},loaded:false,open:null,busy:null};
async function loadConns(){try{const r=await api('/api/conns');CS.rows=Object.fromEntries((r.rows||[]).map(x=>[x.name,x]));CS.loaded=true;}catch(e){}}
async function saveConn(name,status,note){try{const r=await api('/api/conns',{name,status:status||null,note:note??null});CS.rows=Object.fromEntries((r.rows||[]).map(x=>[x.name,x]));}catch(e){toast(`<b>Not saved.</b> ${esc(e.message)}`);}}
const FIX={
 Google:[['Connect again','/connect/google'],['Google permissions','https://myaccount.google.com/permissions'],['Turn APIs on','https://console.cloud.google.com/apis/library']],
 GitHub:[['Make a new token','https://github.com/settings/tokens'],['Where I keep it',CF_SECRETS]],
 Cloudflare:[['Make a new token','https://dash.cloudflare.com/profile/api-tokens'],['Where I keep it',CF_SECRETS]],
 Supabase:[['Make a new token','https://supabase.com/dashboard/account/tokens'],['Where I keep it',CF_SECRETS]],
 'Your sites':[['Cloudflare DNS','https://dash.cloudflare.com/'],['Search Console','https://search.google.com/search-console']]};
function connItems(){
  const N=nodeStates(),h=health(),g=GOOG.s,items=[];
  const gOk=g&&g.connected,gBad=gOk?[...(g.test?(g.test.results||[]).filter(r=>!r.ok&&r.name!=='Analytics'):[]),...Object.keys(GOOG.feedErr||{}).map(k=>({name:k==='gmail'?'Gmail':k==='calendar'?'Calendar':'Google'}))].filter((r,i,a)=>a.findIndex(x=>x.name===r.name)===i):false;
  items.push({name:'Google',state:!g||g.error?'off':!gOk?'off':(gBad&&gBad.length)||g.refused?'dropped':'ok',
    why:!gOk?'Not connected yet':gBad&&gBad.length?`${gBad.map(r=>r.name).join(', ')} not answering`:g.refused?'Google refused the saved login':'Gmail, Calendar, Search Console, Drive',fix:FIX.Google});
  ['GitHub','Cloudflare','Supabase'].forEach(n=>{const s=N.find(x=>x.name===n)?.state||'off';items.push({name:n,state:s==='ok'?'ok':s==='crit'?'dropped':'off',why:s==='ok'?'Answering':s==='crit'?'Stopped answering':'Not connected',fix:FIX[n]});});
  items.push({name:'Your sites',state:h.bad.length?'dropped':'ok',why:h.bad.length?`${h.bad.length} of ${h.sites.length} not answering`:`${h.sites.length} sites answering`,fix:FIX['Your sites']});
  {const S2=GOAT.sites||[],bad=S2.filter(x=>!x.ok);items.push({name:'GoatCounter',state:!S2.length?'off':bad.length?'dropped':'ok',
    why:!S2.length?'No sites added yet':bad.length?`${bad.map(x=>x.code).join(', ')} not answering`:`${S2.length} site${S2.length>1?'s':''}, ${S2.reduce((n,x)=>n+(x.week||0),0)} visitors this week`,
    fix:bad.length?bad.map(x=>['Open '+x.code+' API settings',`https://${x.code}.goatcounter.com/user/api`]):[['How to get a token','https://www.goatcounter.com/']]});}
  items.push({name:'Google Maps',state:MAPS.configured?'ok':'off',why:MAPS.configured?'Directions and places near you':'No key yet',fix:MAP_STEPS.filter(s=>s[1]).slice(0,3).map(s=>[s[0].slice(0,34)+(s[0].length>34?'…':''),s[1]])});
  CONNECT.slice(1).filter(c=>c.name!=='GoatCounter').forEach(c=>{const st=connState(c);items.push({name:c.name,state:st==='ok'?'ok':'off',why:c.steps.length?`Not connected. ${c.time||''}`.trim():'No route in',fix:(c.steps||[]).filter(s=>s[1]).slice(0,2).map(s=>[s[0].slice(0,34)+(s[0].length>34?'…':''),s[1]])});});
  return items.map(i=>{const r=CS.rows[i.name];const own=r&&r.status;return {...i,own,note:r&&r.note||'',eff:own==='paused'||own==='archived'||own==='deleted'?own:i.state};});
}
const CST={ok:'Working',dropped:'Dropped out',off:'Not connected',paused:'Paused',archived:'Archived',deleted:'Deleted'};
function goatBlock(){const S2=GOAT.sites||[];
  return `<div class="gcs">${S2.map(x=>`<div class="gcr ${x.ok?'':'bad'}"><b>${esc(x.code)}</b><span>${esc(x.ok?`${x.today} today · ${x.week} this week`:x.error||'Not answering')}</span><button type="button" data-ca="goat-rm" data-n="${esc(x.code)}">Remove</button></div>`).join('')}
  <div class="cam"><input type="text" id="gc-code" maxlength="60" placeholder="Site code, e.g. mysite" autocapitalize="off" autocorrect="off"><input type="password" id="gc-tok" maxlength="200" placeholder="Read token" autocomplete="off"><button type="button" data-ca="goat-add">Add site</button></div>
  <p class="gp2">Tokens are encrypted before they are saved. Read-only. Make one at CODE.goatcounter.com/user/api.</p></div>`;}
function connPane(){
  const it=connItems(),live=it.filter(i=>!['archived','deleted'].includes(i.own)).sort((a,b)=>(b.eff==='dropped')-(a.eff==='dropped')),arch=it.filter(i=>i.own==='archived'),del=it.filter(i=>i.own==='deleted');
  const row=i=>{const bad=i.eff==='dropped';const open=CS.open===i.name;
    return `<article class="cn ${i.eff}"><div class="ch"><i></i><b>${esc(i.name)}</b><em>${esc(CST[i.eff])}</em></div>
    <p>${esc(i.eff==='paused'?'Paused. I will not alert you about it':i.why)}${i.note?` <span class="cnote">${esc(i.note)}</span>`:''}</p>
    ${bad||i.eff==='off'?`<div class="cfix">${i.fix.map(f=>`<a href="${esc(f[1])}" ${f[1][0]==='/'?'':'target="_blank" rel="noopener"'}>${esc(f[0])}</a>`).join('')}</div>`:''}
    ${i.name==='GoatCounter'&&!['archived','deleted'].includes(i.own)?goatBlock():''}${i.name==='Google Maps'&&!['archived','deleted'].includes(i.own)?mapsBlock():''}
    <div class="cact">${i.own==='archived'||i.own==='deleted'?`<button type="button" data-ca="restore" data-n="${esc(i.name)}">Restore</button>`:
      `<button type="button" data-ca="test" data-n="${esc(i.name)}"${CS.busy===i.name?' disabled':''}>${CS.busy===i.name?'Testing…':'Test'}</button>
      <button type="button" data-ca="${i.own==='paused'?'resume':'pause'}" data-n="${esc(i.name)}">${i.own==='paused'?'Resume':'Pause'}</button>
      <button type="button" data-ca="reset" data-n="${esc(i.name)}">Reset</button>
      <button type="button" data-ca="amend" data-n="${esc(i.name)}">Amend</button>
      <button type="button" data-ca="archive" data-n="${esc(i.name)}">Archive</button>
      <button type="button" data-ca="delete" data-n="${esc(i.name)}">Delete</button>`}</div>
    ${open?`<div class="cam"><input type="text" maxlength="140" value="${esc(i.note)}" placeholder="A note: which account, what it is for" id="cn-in"><button type="button" data-ca="save" data-n="${esc(i.name)}">Save</button></div>`:''}</article>`;};
  const bad=it.filter(i=>i.eff==='dropped').length;
  return `<header><h2>Connections</h2><div class="meta">${bad?`${bad} dropped out`:'All answering'}</div></header>
  <p class="sub2">I check these every few minutes. If one drops out it moves to the top with the link to fix it.</p>
  <div class="cl2">${live.map(row).join('')}</div>
  ${arch.length?`<h3 class="ch3">Archived</h3><div class="cl2">${arch.map(row).join('')}</div>`:''}
  ${del.length?`<h3 class="ch3">Deleted</h3><div class="cl2">${del.map(row).join('')}</div>`:''}`;
}
LENSES.push({id:'conns',type:'system',title:'Connections',sample:false,
  score:()=>{const it=connItems();return it.some(i=>i.eff==='dropped')?93:it.some(i=>i.eff==='off')?26:20;},
  why:()=>{const it=connItems(),b=it.filter(i=>i.eff==='dropped');return b.length?`${b.map(i=>i.name).join(' and ')} dropped out`:`${it.filter(i=>i.eff==='ok').length} of ${it.length} working`;},
  preview:()=>{const b=connItems().filter(i=>i.eff==='dropped').length;return `<span class="big">${b?b:'OK'}</span>`;},
  pane:connPane});
LENSES.find(l=>l.id==='conns').urgentWhen=()=>connItems().some(i=>i.eff==='dropped');
LENSES.push(...MAPLENS);
function refreshConns(){const s=$('lens-conns');if(s)s.innerHTML=connPane();const t=document.querySelector('[data-lens="conns"]');if(t){const L=LENSES.find(l=>l.id==='conns');t.querySelector('.tp').innerHTML=L.preview();const w=t.querySelector('.lwhy');if(w)w.textContent=L.why();}}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-ca]');if(!b)return;const n=b.dataset.n,a=b.dataset.ca;
  if(a==='maps-save'){const key=$('mk-in').value.trim();if(!key)return;b.disabled=true;b.textContent='Checking…';try{await api('/api/maps/key',{key});MAPS.configured=true;toast('<b>Google Maps connected.</b>');}catch(er){toast(`<b>Not saved.</b> ${esc(er.message)}`);}refreshConns();refreshMaps();return;}
  if(a==='maps-rm'){try{await api('/api/maps/key',{remove:true});MAPS.configured=false;MAPS.route=null;MAPS.near=null;}catch(er){toast(`<b>Not removed.</b> ${esc(er.message)}`);}refreshConns();refreshMaps();return;}
  if(a==='goat-add'){const code=$('gc-code').value.trim(),token=$('gc-tok').value.trim();if(!code||!token){toast('<b>Need both.</b> The site code and the read token.');return;}
    b.disabled=true;b.textContent='Checking…';try{await api('/api/goat/add',{code,token});await loadGoat();toast(`<b>Added.</b> ${esc(code)} is answering.`);}catch(er){toast(`<b>Not added.</b> ${esc(er.message)}`);}
    renderLenses();refreshConns();return;}
  if(a==='goat-rm'){try{await api('/api/goat/remove',{code:n});await loadGoat();}catch(er){toast(`<b>Not removed.</b> ${esc(er.message)}`);}renderLenses();refreshConns();return;}
  if(a==='test'){CS.busy=n;refreshConns();
    if(n==='Google'){try{const r=await api('/api/google/test',{});GOOG.s.test={at:r.at,results:r.results};GOOG.s.refused=false;}catch(er){GOOG.s.refused=true;toast(`<b>Google test failed.</b> ${esc(er.message)}`);}renderGoogle();}
    else{try{await loadGoat();await load();}catch(er){}}
    CS.busy=null;renderLenses();refreshConns();const it=connItems().find(i=>i.name===n);if(it)toast(`<b>${esc(n)}:</b> ${esc(CST[it.eff].toLowerCase())}${it.eff==='dropped'?'. The fix links are on the card.':'.'}`);return;}
  if(a==='amend'){CS.open=CS.open===n?null:n;refreshConns();const i=$('cn-in');if(i)i.focus();return;}
  if(a==='save'){await saveConn(n,CS.rows[n]?.status,$('cn-in').value.trim());CS.open=null;refreshConns();return;}
  if(a==='delete'&&!b.dataset.sure){b.dataset.sure='1';b.textContent=n==='Google'?'Tap again: disconnect':'Tap again to delete';return;}
  if(a==='delete'&&n==='Google'){try{await api('/api/google/disconnect',{});GOOG.s=await api('/api/google/status');delete CONNECT[0].live;renderGoogle();}catch(er){toast(`<b>Not disconnected.</b> ${esc(er.message)}`);return;}}
  if(a==='reset'&&n==='Google'){location.href='/connect/google';return;}
  const map={pause:'paused',resume:null,archive:'archived',delete:'deleted',restore:null,reset:null};
  await saveConn(n,map[a],a==='reset'?'':undefined);renderLenses();refreshConns();});

function renderLenses(){
  S.life=S.life||lifeData();S.clash=clashes();
  const board=$('board'),panes=$('panes');
  LENSES.forEach(L=>{let t=board.querySelector(`[data-lens="${L.id}"]`);
    if(!t){t=document.createElement('button');t.type='button';t.className='tile edge lens';t.dataset.lens=L.id;t.dataset.pane='lens-'+L.id;
      t.innerHTML=`<span class="tk">${esc(L.title)}${L.sample?' <span class="sample">Sample</span>':''}</span><span class="tp"></span>`;
      t.addEventListener('click',()=>openPane(t.dataset.pane,t));board.appendChild(t);addRims(board);
      const sec=document.createElement('section');sec.className='sec lens-sec';sec.id='lens-'+L.id;panes.appendChild(sec);}
    const sec=$('lens-'+L.id);if(!(pane&&pane.sec===sec))sec.innerHTML=L.pane();
    t.querySelector('.tp').innerHTML=L.preview();t._score=L.score();t._why=L.why();});
  board.querySelectorAll('.tile:not(.lens):not(#brief)').forEach(t=>{const k=t.id==='map-open'?'map':t.dataset.pane;const f=CORE[k];if(f){const [sc,w]=f();t._score=sc;t._why=w;}else t._score=-1;});
  const all=[...board.querySelectorAll('.tile:not(#brief)')].filter(t=>t._score>=0).sort((a,b)=>b._score-a._score);
  all.forEach((t,i)=>{t.hidden=t._score<=0;const L0=LENSES.find(l=>l.id===t.dataset.lens);const ty=L0?(L0.urgentWhen&&L0.urgentWhen()?'urgent':L0.type):t.dataset.type;if(ty)t.dataset.type=t.dataset.pane==='focus-sec'&&!S.items.some(x=>x.level==='urgent')?'work':ty;t.classList.toggle('lg',i>0&&t._score>=60);t.classList.toggle('sm',t._score<30);t.classList.toggle('hero',i===0);t.classList.toggle('span2',i===0||t._score>=60);t.classList.remove('rows2');
    let w=t.querySelector(':scope>.lwhy');if(!w){w=document.createElement('span');w.className='lwhy';t.querySelector('.tk').after(w);}w.textContent=t._why||'';
    t.setAttribute('aria-label',t.querySelector('.tk').textContent.replace('Sample','').trim()+'. '+(t._why||''));board.appendChild(t);});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-draft]');if(!b)return;const c=S.clash[+b.dataset.draft];if(!c)return;const box=$('swap-'+b.dataset.draft);
  box.hidden=false;if(c.multi){box.textContent=`Hi Sarge, I would like to request annual leave from ${dayLabel(c.p.start)} to ${dayLabel(new Date(+c.p.end-DAY))} for a trip abroad with my wife. I am asking early so it can be planned around. Please let me know if you need anything else from me. Thanks.`;b.textContent='Drafted. Nothing is sent';b.disabled=true;return;}
  box.hidden=false;box.textContent=`Hi Sarge, could I swap my ${c.s.name.toLowerCase()} shift on ${dayLabel(c.s.day)} for one of my rest days? I have ${c.p.kind==='family'?'a family commitment':'plans I can\'t move'} (${c.p.title.toLowerCase()}). Happy to cover a shift in return. Thanks.`;
  b.textContent='Drafted. Nothing is sent';b.disabled=true;});

/* ---------- settings: the colour of the light in the glass ---------- */
const EDGE=[['Ice','#bfe3ff'],['Paper','#efede8'],['Signal','#ff5a4f'],['Amber','#ffb547'],['Mint','#5ff2c2'],['Violet','#a98bff'],['Cyan','#40d9ff']];
function edgeSettings(){let s={};try{s=JSON.parse(localStorage.getItem('tt-edge')||'{}')||{};}catch{}return {c:s.c||'#bfe3ff',k:s.k??85,bg:s.bg!==false};}
function applyEdge(s){const r=document.documentElement.style;r.setProperty('--edge',s.c);r.setProperty('--edge-k',String(s.k/100));document.body.classList.toggle('nomap',!s.bg);}
function saveEdge(p){const s={...edgeSettings(),...p};try{localStorage.setItem('tt-edge',JSON.stringify(s));}catch{}applyEdge(s);renderSettings();if(S.graph)renderPreviews();}
function renderSettings(){const s=edgeSettings();
  $('swatches').innerHTML=EDGE.map(([n,c])=>`<button type="button" class="swatch ${c===s.c?'on':''}" data-c="${c}"><i></i>${esc(n)}</button>`).join('');
  $('swatches').querySelectorAll('.swatch').forEach(b=>{b.querySelector('i').style.background=b.dataset.c;b.addEventListener('click',()=>saveEdge({c:b.dataset.c}));});
  $('edge-custom').value=s.c;$('edge-k').value=s.k;$('bg-map').checked=s.bg;}
$('edge-custom').addEventListener('input',e=>saveEdge({c:e.target.value}));
$('edge-k').addEventListener('input',e=>saveEdge({k:Number(e.target.value)}));
$('bg-map').addEventListener('change',e=>saveEdge({bg:e.target.checked}));
applyEdge(edgeSettings());renderSettings();

/* refracted light: every glass edge gets a rim of light that travels around it */
function addRims(root=document){root.querySelectorAll('.edge').forEach((el,i)=>{if(el.querySelector(':scope>.rim'))return;
  const r=document.createElement('i');r.className='rim';r.setAttribute('aria-hidden','true');
  r.innerHTML='<span class="ring"><span class="spin"></span></span>';
  r.style.setProperty('--d',(-(i*3.7)%14).toFixed(1)+'s');el.appendChild(r);rimSize(el);rimIO&&rimIO.observe(el);rimRO&&rimRO.observe(el);});}
/* the spinning light only needs to cover the tile's diagonal; anything bigger wastes phone GPU memory */
function rimSize(el){const b=el.getBoundingClientRect();if(!b.width)return;el.style.setProperty('--rs',Math.ceil(Math.hypot(b.width,b.height)+6)+'px');}
/* only tiles on screen keep their light moving, and it rests while you scroll */
const rimIO='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(x=>x.target.classList.toggle('off',!x.isIntersecting)),{rootMargin:'80px'}):null;
let scrollT=0;addEventListener('scroll',()=>{document.body.classList.add('scrolling');clearTimeout(scrollT);scrollT=setTimeout(()=>document.body.classList.remove('scrolling'),180);},{passive:true});
const rimRO='ResizeObserver' in window?new ResizeObserver(es=>es.forEach(x=>rimSize(x.target))):null;
addRims();

/* ---------- load ---------- */
let sceneOn=false;
async function loadLearning(){try{S.learning=await api('/api/learning');}catch(e){S.learning={error:'The decision log is not reachable yet.',prefs:[],decisions:[]};}if(S.graph)renderPreviews();}
async function load(){
  const d=await api('/api/state');S.data=d;const rep=k=>d.reports.find(r=>r.kind===k);
  S.brief=parse(rep('briefing')?.content);S.conn=parse(rep('connections')?.content);if(S.conn)S.conn.updated=rep('connections')?.updated;
  compose();buildFeed();
  env.crit=()=>health().bad;
  S.ideas=ideas();S.graph=graphData();
  if(!sceneOn){sceneOn=true;initEnv();env.live=true;if(reduce||!$('env'))setInterval(()=>{const m=env.pick();if(m)env.onPulse(m);},4000);}
  env.setGraph(S.graph);if(document.body.classList.contains('map'))buildLabels();
  if(!window.__hashMap&&location.hash==='#map'){window.__hashMap=1;openMap();}
  composeVoice();renderChain();renderDeck();renderIdeas();renderInbox();renderAhead();renderToday();renderPulse();renderSources();renderGoogle();renderLearned();
  renderPreviews();loadGoogle().then(loadFeed);loadGoat().then(()=>{renderLenses();refreshConns();});loadMaps().then(()=>{if(navigator.permissions&&navigator.permissions.query)navigator.permissions.query({name:'geolocation'}).then(p=>{if(p.state==='granted')getPos().then(()=>fetchRoute()).then(refreshMaps);}).catch(()=>{});else refreshMaps();});loadAnswers().then(()=>{if(S.clash)refreshClash();});if(!CS.loaded)loadConns().then(()=>{renderLenses();refreshConns();});
  if(/[?&]google=connected/.test(location.search)){history.replaceState(null,'','/');toast('<b>Google connected.</b> Open Plugged in and press Test every service.');}
}
const clock=()=>{$('clock').textContent=hhmm(Date.now());tickNow(false);};clock();setInterval(clock,20000);
(async()=>{
  env.thinkGoal=1;
  try{await Promise.all([load(),loadLearning()]);renderLearned();}
  catch(e){if(e.message!=='Signed out')speak('I couldn\'t read your sources just now.',e.message);}
  setTimeout(()=>{env.thinkGoal=0;},1800);onScroll();
  setInterval(()=>{if(!current&&!document.hidden)load().catch(()=>{});},180000);
})();
