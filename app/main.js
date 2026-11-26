
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

/* ---------- placeholder data: shown until the real feeds are connected ---------- */
function sampleData(){
  const at=(h,m)=>{const d=new Date();d.setHours(h,m,0,0);return d;};
  const minsAgo=m=>new Date(Date.now()-m*60000);
  const dayAt=(dd,h,m)=>{const d=new Date();d.setDate(d.getDate()+dd);d.setHours(h,m,0,0);return d;};
  return {
    emails:[
      {id:'e1',from:'SEBP conference team',ini:'SC',subject:'Venue contract needs your signature by Friday',when:minsAgo(48),triage:'need',group:'SEBP',
        summary:'The venue will release the date unless the signed contract is back by Friday 5pm. Two clauses changed since the draft you saw: cancellation terms and catering minimums.',
        draft:'Hi both,\n\nThanks for sending the final contract. I\'ve read the changes to the cancellation terms and catering minimums and I\'m happy with them.\n\nI\'ll sign and return it today so the date is secured well before Friday.\n\nBest,\nNathan'},
      {id:'e2',from:'Prospective client',ini:'PC',subject:'Onboarding three brokers in January?',when:minsAgo(95),triage:'draft',group:'AI Broker Solutions',
        summary:'A broker firm wants to onboard three advisers in January and asks about timelines, pricing and data handling.',
        draft:'Hi,\n\nThanks for getting in touch. January works well for onboarding three advisers.\n\nOnboarding usually takes two weeks from contract to go-live. I\'ve attached our pricing and data handling summary. Would a 30 minute call on Tuesday or Wednesday next week suit you to go through it?\n\nBest regards,\nNathan'},
      {id:'e3',from:'Domain registrar',ini:'DR',subject:'mortgage-oasis.com renews in 14 days, auto-renew is off',when:minsAgo(190),triage:'need',group:'Mortgage Oasis',
        summary:'Auto-renew is switched off for this domain. If nothing changes it lapses on 10 December and the site goes offline.',fix:'Turn on auto-renew'},
      {id:'e4',from:'Accountant',ini:'AC',subject:'Quarter-end: receipts for AI subscriptions',when:minsAgo(330),triage:'draft',group:'TraceyTech',
        summary:'Asks for receipts for OpenAI, Anthropic and ElevenLabs subscriptions, split by company.',
        draft:'Hi,\n\nI\'ll pull the receipts together this week, split by AI Broker Solutions Ltd and TraceyTech, and share a folder by Monday.\n\nThanks,\nNathan'},
      {id:'e5',from:'GitHub',ini:'GH',subject:'Dependabot: 2 security updates ready for sebp-site',when:minsAgo(610),triage:'wait',group:'SEBP',summary:'Two moderate dependency updates are ready to merge. No breaking changes reported.'},
      {id:'e6',from:'Research digest',ini:'RD',subject:'This week in evidence-based policing',when:minsAgo(900),triage:'wait',group:'Thinking About Policing',summary:'Five new papers. Two are relevant to your next TAP article on hot-spot patrols.'}
    ],
    events:[
      {id:'c1',start:at(8,30),end:at(9,0),title:'Inbox and priorities',where:'TraceyTech'},
      {id:'c2',start:at(10,0),end:at(10,45),title:'SEBP committee call',where:'Video call',note:'Venue contract is on the agenda. Sign it before the call and this becomes a two minute update.',move:'Sign the contract first. The draft confirmation email is ready.'},
      {id:'c3',start:at(12,30),end:at(13,15),title:'Lunch',where:''},
      {id:'c4',start:at(14,0),end:at(15,0),title:'Mortgage Oasis content review',where:'Studio',note:'Search clicks are 22 from 2,388 impressions. Bring the three pages with the most impressions.',move:'I\'ll list the three pages and suggested new titles an hour before.'},
      {id:'c5',start:at(16,30),end:at(17,0),title:'Call with accountant',where:'Phone',note:'They will ask for AI subscription receipts. A reply is drafted in your inbox.',move:'Send the drafted reply before the call so it is already handled.'},
      {id:'c6',start:at(19,0),end:at(20,0),title:'Write TAP article',where:'Home'}
    ],
    analytics:{sessions:[48,52,61,57,66,59,69],prev:369,sites:[['thinkingaboutpolicing.org',214,'+18%'],['mortgage-oasis.com',121,'+6%'],['id-ebp.org',47,'-4%'],['sebp-conference.app',30,'+41%']]},
    social:{name:'LinkedIn',followers:1284,series:[1242,1249,1255,1262,1266,1279,1284],posts:2,top:'Your hot-spot policing post reached 3,120 people.'},
    ahead:[
      {at:dayAt(1,17,0),title:'SEBP venue contract deadline',detail:'The date is released at 5pm if it is not signed.',move:'Sign it in your next free slot today, before anyone has to chase you.',crit:true,sample:true,ref:'e1'},
      {at:dayAt(14,0,0),title:'mortgage-oasis.com lapses',detail:'Auto-renew is off, so the site goes offline on this date.',move:'Turn on auto-renew now. It takes a minute and removes the risk.',crit:true,sample:true,ref:'e3'}
    ]
  };
}

/* ---------- state ---------- */
const S={data:null,brief:null,conn:null,items:[],dismissed:new Set(),learning:null,sample:sampleData(),deckI:0};
try{JSON.parse(localStorage.getItem('tt-dismissed')||'[]').forEach(x=>S.dismissed.add(x));}catch{}
const saveDismissed=()=>{try{localStorage.setItem('tt-dismissed',JSON.stringify([...S.dismissed].slice(-80)));}catch{}};
const NODE_OF={assets:'Supabase',tasks:'GitHub',seo:'Analytics',finance:'Finance',monitor:'Cloudflare',research:'GitHub',services:'Cloudflare'};

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
  return [{name:'Gmail',state:'sample'},{name:'Calendar',state:'sample'},{name:'Analytics',state:'sample'},{name:'GitHub',state:st('GitHub')},
    {name:'Cloudflare',state:st('Cloudflare')},{name:'Supabase',state:st('Supabase')},{name:'LinkedIn',state:'sample'},{name:'Finance',state:'off'}];
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
  const cap=w=>w[0].toUpperCase()+w.slice(1);parts.push(`${cap(NUM[need]||String(need))} email${need===1?'':'s'} need${need===1?'s':''} you, and I've drafted ${NUM[drafted]||drafted} replies.`);
  if(nextEv)parts.push(`Next on your calendar: ${nextEv.title} at ${hhmm(nextEv.start)}.`);
  speak(head.replace(/\.$/,'')+'.',parts.join(' '));
}
function chainItems(){
  const top=S.items[0];
  const email=S.sample.emails.find(e=>e.triage==='need'&&e.draft);
  const ahead=allAhead()[0];
  return [top&&{lab:'Now',it:top},email&&{lab:'Next',it:{kind:'email',e:email,key:'e:'+email.id,node:'Gmail',sample:true}},ahead&&{lab:'Then',it:{kind:'ahead',a:ahead,key:'a:'+ahead.title,node:'Calendar',sample:ahead.sample,title:ahead.title}}].filter(Boolean);
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

/* ---------- inbox (sample) ---------- */
const TRI={need:['Needs you','need'],draft:['Reply drafted','drafted'],wait:['Can wait','']};
function renderInbox(){
  const E=S.sample.emails;
  $('inbox-meta').textContent=`${E.filter(e=>e.triage==='need').length} need you · ${E.filter(e=>e.draft).length} drafted`;
  $('inbox').innerHTML=E.map(e=>`<button type="button" class="row" data-id="${e.id}"><span class="av">${esc(e.ini)}</span><span class="t">${esc(e.subject)}</span><span class="when">${hhmm(e.when)}</span><span class="s">${esc(e.from)} · ${esc(e.summary)}</span><span class="tri ${TRI[e.triage][1]}">${e.draft&&e.triage==='need'?'Draft ready':TRI[e.triage][0]}</span></button>`).join('');
  $('inbox').querySelectorAll('.row').forEach(r=>r.addEventListener('click',()=>{const e=E.find(x=>x.id===r.dataset.id);openFocus({kind:'email',e,key:'e:'+e.id,node:'Gmail',sample:true},r);}));
}

/* ---------- two steps ahead ---------- */
function allAhead(){
  const out=[...S.sample.ahead];
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
  $('ahead').querySelectorAll('.fut').forEach(b=>b.addEventListener('click',()=>{const a=A[+b.dataset.i];openFocus(a.ev?{kind:'event',ev:a.ev,key:'ev:'+a.ev.id,node:'Calendar',sample:true}:{kind:'ahead',a,key:'a:'+a.title,node:'Calendar',sample:a.sample,title:a.title},b);}));
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
    glassLight(x);x.addEventListener('click',()=>openFocus({kind:'event',ev:e,key:'ev:'+e.id,node:'Calendar',sample:true},x));});
  tickNow(true);
}
function tickNow(scroll){const n=$('nowline');if(!n)return;const d=new Date();const p=pct(d);n.hidden=p<0||p>100;n.style.left=p+'%';n.dataset.t=hhmm(d);
  if(scroll){const rb=$('ribbon');rb.scrollLeft=Math.max(0,$('track').scrollWidth*p/100-rb.clientWidth*.3);}}

/* ---------- pulse ---------- */
function spark(a,w=200,h=46){if(a.length<2)return '';const mx=Math.max(...a),mn=Math.min(...a),r=mx-mn||1;
  const P=a.map((v,i)=>[i/(a.length-1)*w,h-4-(v-mn)/r*(h-10)]);const d=P.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  let len=0;for(let i=1;i<P.length;i++)len+=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);const L=P[P.length-1];
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d}L${w},${h}L0,${h}Z"/><path class="l" data-len="${Math.ceil(len)}" d="${d}"/><circle cx="${L[0].toFixed(1)}" cy="${L[1].toFixed(1)}" r="3"/></svg>`;}
function renderPulse(){
  const A=S.sample.analytics,So=S.sample.social;const sess=A.sessions.reduce((a,b)=>a+b,0);
  const h=health();const ms=S.data.observations.filter(o=>o.metric==='response_ms').slice(0,40).reverse().map(o=>o.value);
  const avg=ms.length?Math.round(ms.slice(-6).reduce((a,b)=>a+b,0)/Math.min(6,ms.length)):null;
  const tapNow=52,tapPrev=30;const slow=h.sites.filter(x=>x.ms!=null).sort((a,b)=>b.ms-a.ms)[0];const up=[...A.sites].sort((a,b)=>parseFloat(b[2])-parseFloat(a[2]))[0];
  const T=[
    {k:'Visitors',v:fmt(sess),d:`${sess>=A.prev?'+':''}${Math.round((sess-A.prev)/A.prev*100)}% on last week`,s:A.sessions,sample:true,node:'Analytics',kind:'metric',id:'visitors',ins:`${up[0]} is up ${up[2]}. Interest is rising, so this is the week to give people a reason to book.`},
    {k:'Search clicks · TAP',v:fmt(tapNow),d:`from ${tapPrev}, previous 4 weeks`,s:[tapPrev,tapNow],node:'Analytics',kind:'metric',id:'search',ins:'Click-through is stuck at 0.9%. Better titles on three pages is the quickest lift.'},
    {k:'Site response',v:avg!=null?avg+' ms':'–',d:`${h.sites.length} sites, live checks`,s:ms.slice(-24),node:'Sites',kind:'metric',id:'health',dn:h.bad.length>0,ins:h.bad.length?`${h.bad[0]} is failing. I'm checking it every two hours.`:slow?`Slowest is ${slow.name} at ${slow.ms} ms. Fine for now; I flag anything over a second.`:''},
    {k:So.name+' followers',v:fmt(So.followers),d:`+${So.followers-So.series[0]} this week`,s:So.series,sample:true,node:'LinkedIn',kind:'metric',id:'social',ins:'Your hot-spot policing post reached 3,120. Pair each TAP article with a post.'}];
  $('tiles').innerHTML=T.map((x,i)=>`<button type="button" class="mtile glass" data-i="${i}"><span class="k"><span>${esc(x.k)}</span>${x.sample?'<span class="sample">Sample</span>':''}</span><span class="v">${esc(x.v)}</span><span class="d ${x.dn?'dn':''}">${esc(x.d)}</span>${spark(x.s)}${x.ins?`<span class="ins">${esc(x.ins)}</span>`:''}</button>`).join('');
  $('tiles').querySelectorAll('.mtile').forEach(b=>{const p=b.querySelector('path.l');if(p)p.style.setProperty('--len',p.dataset.len);glassLight(b);
    b.addEventListener('click',()=>{const x=T[+b.dataset.i];openFocus(x.id==='health'?{kind:'health',key:'health',node:'Cloudflare'}:{...x,key:'m:'+x.id,title:x.k},b);});});
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
  if(it.kind==='email'){const e=it.e;return BACK+`<div class="d-head"><h2 id="d-title">${esc(e.subject)}</h2><div class="row2"><div class="kv"><span>From</span><b>${esc(e.from)}</b></div><div class="kv"><span>Received</span><b>${hhmm(e.when)}</b></div><div class="kv"><span>Area</span><b>${esc(e.group)}</b></div><span class="sample">Sample</span></div></div>
    <div class="d-grid"><div class="d-sec"><h3>What it says</h3><p>${esc(e.summary)}</p>${e.fix?`<h3 class="mt">What I'd do</h3><p>${esc(e.fix)}. It takes about a minute and removes the risk.</p>`:''}</div>
    ${e.draft?`<div class="d-sec"><h3>Reply I've drafted</h3><div class="draft">${esc(e.draft)}</div></div>`:''}</div>
    <div class="actions">${e.draft?`<button class="act primary" data-act="sample">Send this reply</button><button class="act" data-act="sample">Edit draft</button>`:e.fix?`<button class="act primary" data-act="sample">${esc(e.fix)}</button>`:`<button class="act" data-act="sample">Archive</button>`}<button class="act quiet" data-act="close">Not now</button></div>`;}
  if(it.kind==='event'){const v=it.ev;return BACK+`<div class="d-head"><h2 id="d-title">${esc(v.title)}</h2><div class="row2"><div class="kv"><span>When</span><b>${hhmm(v.start)}–${hhmm(v.end)}</b></div>${v.where?`<div class="kv"><span>Where</span><b>${esc(v.where)}</b></div>`:''}<span class="sample">Sample</span></div></div>
    <div class="d-sec"><h3>Before it starts</h3><p>${esc(v.note||'Nothing to prepare. I\'ll remind you ten minutes before.')}</p></div><div class="actions"><button class="act quiet" data-act="close">Close</button></div>`;}
  if(it.kind==='ahead'){const a=it.a;return BACK+`<div class="d-head"><h2 id="d-title">${esc(a.title)}</h2><div class="row2"><div class="kv"><span>When</span><b>${esc(a.when)}</b></div>${a.sample?'<span class="sample">Sample</span>':''}</div></div>
    <div class="d-sec"><h3>Why I'm flagging it now</h3><p>${esc(a.detail||'')}</p></div><div class="actions">${a.ref?`<button class="act primary" data-act="email" data-id="${a.ref}">Open the email</button>`:''}<button class="act quiet" data-act="close">Close</button></div>`;}
  if(it.kind==='metric'){const A=S.sample.analytics;
    const body=it.id==='visitors'?`<div class="tbl"><table class="sites"><tr><th>Site</th><th>Sessions</th><th>Change</th></tr>${A.sites.map(s=>`<tr><td>${esc(s[0])}</td><td class="n">${s[1]}</td><td class="n">${s[2]}</td></tr>`).join('')}</table></div>`:
      it.id==='social'?`<p>${esc(S.sample.social.top)} ${S.sample.social.posts} posts this week.</p>`:
      `<p>Thinking About Policing went from 30 to 52 clicks, but click-through only moved from 0.84% to 0.90%. Most of the gain came from more impressions. Rewriting the titles and descriptions on the three most-seen pages is the quickest lift. This is from the Search Console snapshot for 26 October to 22 November.</p>`;
    return BACK+`<div class="d-head"><h2 id="d-title">${esc(it.k)}</h2><div class="row2"><div class="kv"><span>Now</span><b>${esc(it.v)}</b></div><div class="kv"><span>Trend</span><b>${esc(it.d)}</b></div>${it.sample?'<span class="sample">Sample</span>':''}</div></div><div class="d-sec">${body}</div>`;}
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
  if(a==='sample'){toast('<b>This is sample data.</b> Nothing was sent. Once Gmail is connected this button does it for real.');return;}
  if(a==='email'){const em=S.sample.emails.find(x=>x.id===b.dataset.id);closeFocus();setTimeout(()=>openFocus({kind:'email',e:em,key:'e:'+em.id,node:'Gmail',sample:true},document.querySelector(`.row[data-id="${em.id}"]`)),450);return;}
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
  const pool=[...S.items,...S.sample.emails.map(e=>({kind:'email',e,key:'e:'+e.id,node:'Gmail',sample:true})),...S.sample.events.map(ev=>({kind:'event',ev,key:'ev:'+ev.id,node:'Calendar',sample:true}))];
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
  const E=S.sample.emails;q.push({name:'Gmail',text:`${E.length} new · ${E.filter(e=>e.triage==='need').length} need you (sample)`,crit:true});
  q.push({name:'Calendar',text:`${S.sample.events.filter(e=>e.end>new Date()).length} events left today (sample)`});
  q.push({name:'Analytics',text:`${S.sample.analytics.sessions.slice(-1)[0]} visitors yesterday (sample)`});
  q.push({name:'LinkedIn',text:`${S.sample.social.followers} followers (sample)`});
  for(let i=q.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[q[i],q[j]]=[q[j],q[i]];}
  feedQ=q;
}
env.pick=()=>{if(!feedQ.length)return null;if(env.look&&Math.random()<.5){const m=feedQ.find(x=>x.name===env.look);if(m)return m;}return feedQ[feedI++%feedQ.length];};
env.onPulse=m=>{const t=$('live-text');t.classList.add('swap');setTimeout(()=>{t.innerHTML=`<span class="${m.crit?'crit':''}">${esc(m.name)}</span> · ${esc(m.text)}`;t.classList.remove('swap');},220);$('ldot').classList.toggle('crit',!!m.crit);};

/* ---------- today: free time gets a plan ---------- */
const dur=ms=>{const m=Math.round(ms/60000);const h=Math.floor(m/60),r=m%60;return h?`${h}h${r?' '+String(r).padStart(2,'0'):''}`:m+' min';};
function todoPool(){
  const E=id=>S.sample.emails.find(e=>e.id===id);const em=e=>({kind:'email',e,key:'e:'+e.id,node:'Gmail',sample:true});const out=[];
  if(E('e1'))out.push({t:'Sign the SEBP contract',min:10,it:em(E('e1')),crit:true,sample:true});
  if(E('e3'))out.push({t:'Turn on auto-renew',min:5,it:em(E('e3')),crit:true,sample:true});
  S.items.filter(x=>x.level==='urgent').slice(0,2).forEach(x=>out.push({t:x.kind==='cluster'?x.title:titleOf(x),min:20,it:x,crit:true}));
  if(E('e2'))out.push({t:'Reply to the broker enquiry',min:10,it:em(E('e2')),sample:true});
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
  if(E('e1'))out.push({id:'sebp-sign',title:'Sign the SEBP contract today, not on Friday',why:'The venue releases the date at 5pm Friday. It is also on today\'s committee call agenda, so signing first turns a discussion into a two minute update.',value:'Date secured a day early',eff:'10 min',crit:true,sample:true,
    steps:[['Open the email and check the two changed clauses: cancellation terms and catering minimums'],['Sign and send the reply I drafted']],open:{kind:'email',e:E('e1'),key:'e:e1',node:'Gmail',sample:true}});
  if(cl)out.push({id:'own-once',title:`Do the ${NUM[cl.members.length]||cl.members.length} ownership checks in one sitting`,why:'Each check needs the same evidence: who owns it, who pays, and whether backups restore. Gathering it once and recording it in one register stops the same work being redone three times.',value:'One register instead of three reviews',eff:'20 min',crit:cl.level==='urgent',
    steps:cl.members.map(m=>[m.label+': '+(m.p.action||'confirm the owner and payer')]),open:cl});
  out.push({id:'tap-titles',title:'Rewrite the titles of TAP\'s three most-seen pages',why:'Search clicks rose from 30 to 52, but click-through only moved from 0.84% to 0.90%. The gain came from being shown more, not from more people choosing you. Better titles are the quickest lift.',value:'About 115 clicks a month at 2% click-through',eff:'1 hour',
    steps:[['Open Search Console, go to Pages and sort by impressions','https://search.google.com/search-console'],['Send me the top three page addresses and I\'ll draft new titles and descriptions'],['Paste them into each page and I\'ll measure the change for four weeks']]});
  out.push({id:'sebp-early',title:'Announce an early-bird deadline for SEBP',why:'Visits to sebp-conference.app are up 41% this week. Interest is rising now, so a deadline turns visits into bookings while attention is high.',value:'More bookings while interest peaks',eff:'30 min',sample:true,
    steps:[['Pick a date two to three weeks out'],['I draft the banner text and an email to last year\'s attendees'],['You approve, and I schedule the LinkedIn post']]});
  out.push({id:'li-tap',title:'Turn your next TAP article into a LinkedIn post',why:'Your hot-spot policing post reached 3,120 people, far above your usual reach. Pairing each new article with a short post brings that audience back to the site.',value:'Steady traffic from your strongest channel',eff:'15 min',sample:true,
    steps:[['When the article is published, I draft the post with the key finding first'],['You edit and approve it'],['I suggest the best time to post based on past reach']]});
  if(E('e4'))out.push({id:'receipts',title:'Have AI receipts collected automatically each month',why:'Your accountant asks for these every quarter. A Gmail filter can label every receipt by company as it arrives, and this app can file them, so quarter-end is one click.',value:'An hour saved every quarter',eff:'15 min once',sample:true,
    steps:[['Connect Google (see Plugged in below)'],['I create the filter and labels for each company'],['Each quarter I share one folder with your accountant, after you approve']],open:{kind:'email',e:E('e4'),key:'e:e4',node:'Gmail',sample:true}});
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
  {name:'Google',covers:['Gmail','Calendar','Analytics'],unlocks:'Your real inbox triaged with drafted replies, your calendar with prep notes, and visitors and search for every site.',time:'10 min',
    steps:[['Create a Google Cloud project called TraceyTech','https://console.cloud.google.com/projectcreate'],
      ['Turn on the Gmail API, Google Calendar API and Google Analytics Data API','https://console.cloud.google.com/apis/library'],
      ['Set up the consent screen as External and add your own email as a test user','https://console.cloud.google.com/apis/credentials/consent'],
      ['Create an OAuth client ID, type Web application, with https://traceytech.app/connect/google/callback as the redirect address','https://console.cloud.google.com/apis/credentials'],
      ['Add the client ID and secret to TraceyTech as secrets named GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',CF_SECRETS],
      ['Tell me it is done. I add a Connect Google button here and you approve access once']]},
  {name:'Claude agents',covers:[],novel:true,unlocks:'Your Gmail and Google Calendar are already connected to Claude. Until Google is set up here, a scheduled Claude agent can read them every hour and post a summary into TraceyTech. Nothing is sent, and no password is stored here.',time:'1 min',
    steps:[['Say yes in our chat and I set it up. You can switch it off at any time']]},
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
  $('srcs').innerHTML=`<div class="live-row">${live.map(n=>`<button type="button" class="src glass" data-n="${esc(n.name)}"><i class="${n.state==='ok'?'':n.state}"></i>${esc(n.name)}<em>${esc(n.note||CONN_TXT[n.state]||'')}</em></button>`).join('')}</div>`+
    `<div class="plug">${CONNECT.map((c,i)=>{const st=connState(c);return `<button type="button" class="conn glass ${c.novel?'novel':''}" data-i="${i}"><span class="top"><i class="${st==='ok'?'':st}"></i><b>${esc(c.name)}</b><em>${esc(c.novel?'New idea':CONN_TXT[st])}</em></span><span class="u">${esc(c.unlocks)}</span><span class="f">${c.steps.length?`<span>You: ${esc(c.time)}</span><span class="go">${c.novel?'How it works':'How to connect'}</span>`:'<span>No route in. Last resort only</span><span class="go">Why</span>'}</span></button>`;}).join('')}</div>`;
  $('srcs').querySelectorAll('.src').forEach(b=>{glassLight(b);b.addEventListener('mouseenter',()=>{env.look=b.dataset.n==='Your sites'?'Sites':b.dataset.n;});b.addEventListener('click',()=>openFocus({kind:'health',key:'health',node:b.dataset.n==='Your sites'?'Sites':b.dataset.n},b));});
  $('srcs').querySelectorAll('.conn').forEach(b=>{glassLight(b);const c=CONNECT[+b.dataset.i];b.addEventListener('click',()=>openFocus({kind:'conn',c,key:'conn:'+c.name,node:c.covers[0]||'Supabase',sample:true},b));});
}

/* ---------- the map: every source, project and item, joined where they really connect ---------- */
const SRC_OF_KIND={'Repository':'GitHub','DNS zone':'Cloudflare','Worker':'Cloudflare','Pages project':'Cloudflare','Database':'Supabase','Search Console':'Analytics'};
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
  S.sample.emails.forEach(e=>item({kind:'email',e,key:'e:'+e.id,node:'Gmail',sample:true},e.subject,'Gmail',[groupKey(e.group)],e.triage==='need',true));
  S.sample.events.forEach(ev=>item({kind:'event',ev,key:'ev:'+ev.id,node:'Calendar',sample:true},ev.title,'Calendar',EV_GROUP.filter(([r])=>r.test(ev.title+' '+(ev.note||''))).map(x=>x[1]).slice(0,1),false,true));
  return {nodes,edges};
}
function neighbours(id){const g=S.graph;const out=new Set();g.edges.forEach(([a,b])=>{if(a===id)out.add(b);if(b===id)out.add(a);});return [...out].map(x=>g.nodes.find(n=>n.id===x)).filter(Boolean);}
let labelEls=new Map();
function buildLabels(){
  const box=$('map-labels');box.innerHTML='';labelEls=new Map();
  S.graph.nodes.filter(n=>n.kind!=='asset').forEach(n=>{const b=document.createElement('button');b.type='button';b.className=`ml ${n.kind} ${n.crit?'crit':''} ${n.sample?'smp':''}`;
    b.textContent=n.label.length>38?n.label.slice(0,36)+'…':n.label;b.addEventListener('click',e=>{e.stopPropagation();tapNode(n,b);});box.appendChild(b);labelEls.set(n.id,b);});
  const k=S.graph.nodes.reduce((m,n)=>(m[n.kind]=(m[n.kind]||0)+1,m),{});
  $('map-meta').textContent=`${k.source} sources · ${k.project} projects · ${k.asset} assets · ${k.item} live items`;
}
function drawLabels(){
  const hot=env.hot;const near=hot?new Set(neighbours(hot).map(n=>n.id)):null;const sm=innerWidth<700;
  env.screen().forEach(({n,x,y,z})=>{const b=labelEls.get(n.id);if(!b)return;
    const show=n.kind!=='item'||!sm||n.crit||n.id===hot||(near&&near.has(n.id));
    const dim=hot&&n.id!==hot&&!(near&&near.has(n.id))&&n.kind!=='hub';
    b.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;b.style.opacity=show?(dim?.28:1)*(1.15-Math.max(0,z-.9)*8):0;b.style.pointerEvents=show?'auto':'none';b.classList.toggle('on',n.id===hot);});
}
function tapNode(n,el){
  if(n.kind==='item'){env.hot=n.id;openFocus(n.ref,el);return;}
  env.hot=env.hot===n.id?null:n.id;if(!env.hot)return;
  openFocus({kind:'node',n,key:'n:'+n.id,node:n.kind==='source'?n.label:null,sample:true},el);
}
function openMap(){if(!$('env'))return;toggleMenu(false);document.body.classList.add('map');env.mapGoal=1;$('mapui').hidden=false;buildLabels();env.onFrame=drawLabels;}
function closeMap(){document.body.classList.remove('map');env.mapGoal=0;env.hot=null;$('mapui').hidden=true;env.onFrame=null;}
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
  $('tp-inbox').innerHTML=`<span class="avs">${E.slice(0,5).map(e=>`<i class="${e.triage==='need'?'crit':''}">${esc(e.ini)}</i>`).join('')}</span><span class="row1"><b class="${need.length?'crit':''}">${need.length}</b> need you</span><span class="lbl">${E.filter(e=>e.draft).length} replies drafted</span>`;
  const k=S.graph.nodes.reduce((m,n)=>(m[n.kind]=(m[n.kind]||0)+1,m),{});
  $('tp-map').innerHTML=`${miniMap()}<span class="lbl">${k.source} sources · ${k.project} projects · ${k.asset} assets · ${k.item} live items. Tap to bring it into focus</span>`;
  const I=S.ideas||[];$('tp-ideas').innerHTML=`<span class="big">${I.length}</span><span class="row1">${esc(I[0]?.title||'')}</span><span class="lbl">${esc(I[0]?.value||'')}</span>`;
  const A=allAhead().filter(a=>a.at&&a.at>now).sort((a,b)=>(b.crit?1:0)-(a.crit?1:0)||a.at-b.at)[0];
  $('tp-ahead').innerHTML=A?`<span class="big ${A.crit?'crit':''}">${esc(countdown(A.at).replace(/^in /,''))}</span><span class="row1">${esc(A.title)}</span><span class="lbl">${esc(A.when)}</span>`:'';
  const An=S.sample.analytics,sess=An.sessions.reduce((a,b)=>a+b,0),So=S.sample.social;const ms=S.data.observations.filter(o=>o.metric==='response_ms').slice(0,24).reverse().map(o=>o.value);
  $('tp-pulse').innerHTML=`<span class="pcols">${[['Visitors',fmt(sess),An.sessions,true],['TAP search clicks','52',[30,52],false],['Site response',ms.length?Math.round(ms.slice(-6).reduce((a,b)=>a+b,0)/Math.min(6,ms.length))+' ms':'–',ms,false],['LinkedIn',fmt(So.followers),So.series,true]].map(c=>`<span class="pc"><small>${esc(c[0])}${c[3]?' ·  sample':''}</small><b>${esc(c[1])}</b>${spark(c[2],120,30)}</span>`).join('')}</span>`;
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
  const P=(y,mo,d,h,mi,hrs,title,kind,real)=>{const s=new Date(y,mo,d,h,mi);return {title,kind,sample:!real&&kind!=='work',start:s,end:new Date(+s+hrs*36e5)};};
  const plans=[P(2027,2,11,0,0,96,'Kraków with your wife','trip',true),P(2026,10,27,13,30,1,'Call with Richard Kempshall (Davidhorn)','work'),P(2026,10,30,11,0,.5,'RSG exploratory meeting (Martin Jerrold)','work'),P(2026,11,5,19,0,4,'Dinner with friends','social'),
    P(2026,11,12,10,0,6,'Christmas shopping','errand'),P(2026,11,19,19,30,4,'Christmas drinks with friends','social'),
    P(2026,11,25,13,0,5,'Christmas dinner at home','family'),P(2026,11,31,20,0,5,"New Year's Eve",'social')];
  const presents=[{who:'Your wife (Christmas)',idea:'Weekend away in January, booked as the present',by:new Date(2026,11,15),done:false},
    {who:'Mum and Dad',idea:'Framed family photo and a meal out',by:new Date(2026,11,15),done:false},
    {who:'Work Secret Santa',idea:'£10 limit',by:new Date(2026,11,18),done:false}];
  return {plans,presents,birthday:new Date(2027,8,2),trip:new Date(2027,2,11),summer:new Date(2027,6,17),xmas:new Date(2026,11,25)};
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
  });return out.sort((a,b)=>a.p.start-b.p.start);
}
function nextRest(d){for(let i=0;i<20;i++){const x=new Date(+new Date(d)+i*DAY);if(shiftOn(x).c==='R')return x;}return d;}
function restDays(from,to){const o=[];for(let t=+new Date(from).setHours(0,0,0,0);t<=+to;t+=DAY)if(shiftOn(t).c==='R')o.push(new Date(t));return o;}
const days=d=>Math.ceil((new Date(d).setHours(0,0,0,0)-new Date().setHours(0,0,0,0))/DAY);
const strip=(n=10)=>`<span class="shs">${Array.from({length:n},(_,i)=>{const s=shiftOn(Date.now()+i*DAY);return `<i class="s${s.c} ${i?'':'now'}"><b>${s.c==='R'?'':s.c}</b><small>${new Date(Date.now()+i*DAY).toLocaleDateString('en-GB',{weekday:'narrow'})}</small></i>`;}).join('')}</span>`;

const LENSES=[
 {id:'clash',title:'Clashes',sample:true,mixed:true,score:()=>{const c=S.clash;return c.some(x=>x.level==='clash')?96:c.length?72:0;},
  why:()=>{const c=S.clash.find(x=>x.level==='clash')||S.clash[0];return c?`${c.p.title} vs your ${c.s.name.toLowerCase()} shift`:'';},
  preview:()=>{const c=S.clash,n=c.filter(x=>x.level==='clash').length;const f=c[0];
    return `<span class="big ${n?'crit':''}">${c.length}</span><span class="row1">${n} clash${n===1?'':'es'}, ${c.length-n} tight</span><span class="lbl">Next: ${esc(f?shortDay(f.p.start)+' · '+f.p.title:'')}</span>`;},
  pane:()=>`<header><h2>Clashes</h2><div class="meta">Your plans checked against your real rota <span class="sample">Personal plans are samples</span></div></header>
   <div class="clist">${S.clash.map((c,i)=>`<article class="cl ${c.level}"><div class="cl-h"><b>${esc(c.level==='clash'?'Clash':'Tight')}</b><span>${esc(dayLabel(c.p.start))}</span></div>
   <h3>${esc(c.p.title)} <small>${c.multi?esc(shortDay(c.p.start)+' to '+shortDay(new Date(+c.p.end-DAY))):hhmm(c.p.start)+'–'+hhmm(c.p.end)}</small>${c.p.sample?' <span class="sample">Sample</span>':' <span class="real">From your calendar</span>'}</h3><p>${esc(c.why)}</p><p class="fix">${esc(c.fix)}</p>
   ${c.p.kind==='work'?'':`<button type="button" class="act" data-draft="${i}">${c.multi?'Draft a leave request':'Draft a swap request'}</button>`}<div class="drafted" id="swap-${i}" hidden></div></article>`).join('')||'<p class="empty">No clashes in the next month.</p>'}</div>`},
 {id:'birthday',title:"Wife's birthday",sample:false,score:()=>{const d=days(S.life.birthday);return d<0?0:d<=14?88:d<=30?62:d<=90?36:14;},
  why:()=>{const d=days(S.life.birthday);return d>120?`Plenty of time. I'd start planning in ${new Date(+S.life.birthday-90*DAY).toLocaleDateString('en-GB',{month:'long',timeZone:TZ})}`:`${d} days to go`;},
  preview:()=>{const b=S.life.birthday,d=days(b),s=shiftOn(b);return `<span class="big">${d}<small> days</small></span><span class="row1">${esc(shortDay(b))} 2027 · ${esc(s.proj?'rota not out yet':shiftTxt(s))}</span><span class="lbl">Start planning ${esc(new Date(+b-90*DAY).toLocaleDateString('en-GB',{month:'long',timeZone:TZ}))}. Leave, gift, table</span>`;},
  pane:()=>{const b=S.life.birthday,s=shiftOn(b),d=n=>new Date(+b-n*DAY);const mo=x=>x.toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:TZ});
   return `<header><h2>Your wife's birthday</h2><div class="meta">${esc(dayLabel(b))} 2027 · ${days(b)} days <span class="real">Date from you</span></div></header>
   <div class="plan3"><article><small>1 · By ${esc(mo(d(120)))}</small><b>Protect the day</b><p>Your rota only runs to the end of January, so I can't see that day yet. A day that far ahead is ${esc(s.proj?'projected as '+shiftTxt(s)+'. That is only a guess':shiftTxt(s))}. Book it as annual leave now, then it can't clash.</p></article>
   <article><small>2 · By ${esc(mo(d(75)))}</small><b>Choose the present</b><p>Anything made or booked takes weeks. Ask her sister or a friend what she's wanted, check what she mentioned this year, and decide a budget.</p></article>
   <article><small>3 · By ${esc(mo(d(45)))}</small><b>Book the evening</b><p>Table for two or a weekend away. Popular places go six weeks ahead. A Thursday is a quieter night to book.</p></article>
   <article><small>4 · By ${esc(mo(d(10)))}</small><b>Card, flowers, wrap</b><p>I'll remind you ten days before so the delivery isn't left to the last minute.</p></article></div>
   <p class="fix">I'll keep the day on my radar and raise it again in ${esc(new Date(+b-90*DAY).toLocaleDateString('en-GB',{month:'long',timeZone:TZ}))}. Tell me what she likes and I'll turn it into present ideas.</p>`;}},
 {id:'trip',title:'Kraków',sample:false,score:()=>{const d=days(S.life.trip);if(d<0)return 0;const bad=S.clash.some(x=>x.multi);return Math.min(80,(d<=120?44:24)+(bad?30:0));},
  why:()=>{const bad=S.clash.find(x=>x.multi);return bad?'Not yet covered by leave':`${days(S.life.trip)} days to go`;},
  preview:()=>{const bad=S.clash.find(x=>x.multi),n=bad?bad.why.match(/work (\d+)/)[1]:0;return `<span class="big">${days(S.life.trip)}<small> days</small></span><span class="row1">11 to 14 March, with your wife</span><span class="lbl ${bad?'crit':''}">${bad?'You are due to work '+n+' of the 4 days. Request leave':'Leave is sorted'}</span>`;},
  pane:()=>{const t=S.life.trip,d=n=>new Date(+t-n*DAY),mo=x=>x.toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:TZ}),bad=S.clash.find(x=>x.multi);
   return `<header><h2>Kraków</h2><div class="meta">Thu 11 to Sun 14 March 2027 <span class="real">Dates from you</span></div></header>
   <div class="plan3"><article><small>1 · This week</small><b>${bad?'Request the leave':'Leave is covered'}</b><p>${esc(bad?bad.why:'Nothing on your rota clashes.')} ${bad?'I have a request drafted in Clashes, ready for you to send.':''}</p></article>
   <article><small>2 · By ${esc(mo(d(70)))}</small><b>Flights and hotel</b><p>Compare direct flights from your nearest airport. Book once leave is agreed. Stay near the Old Town to walk everywhere.</p></article>
   <article><small>3 · By ${esc(mo(d(45)))}</small><b>Check the paperwork</b><p>Passports valid and under ten years old, travel insurance, and the current UK entry rules for Poland: <a href="https://www.gov.uk/foreign-travel-advice/poland" target="_blank" rel="noopener">gov.uk Poland travel advice</a>.</p></article>
   <article><small>4 · By ${esc(mo(d(14)))}</small><b>Plan the days</b><p>March is cold, about 0 to 8 degrees. Book Wawel Castle tickets and a table for one dinner ahead. Auschwitz-Birkenau needs tickets weeks ahead.</p></article></div>
   <p class="fix">The ideas are my suggestions. Tell me what you two enjoy and I will build the days around it.</p>`;}},
 {id:'summer',title:'Summer holiday',sample:false,score:()=>{const d=days(S.life.summer);return d<0?0:d<=60?72:d<=150?40:24;},
  why:()=>{const d=days(S.life.summer);return d>150?`${d} days away. Where are you going?`:`${d} days to go`;},
  preview:()=>`<span class="big">${days(S.life.summer)}<small> days</small></span><span class="row1">17 to 28 July 2027</span><span class="lbl">12 days off. Tell me where and I will plan it</span>`,
  pane:()=>{const t=S.life.summer,d=n=>new Date(+t-n*DAY),mo=x=>x.toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:TZ});
   return `<header><h2>Summer holiday</h2><div class="meta">Sat 17 to Wed 28 July 2027 <span class="real">Dates from you</span></div></header>
   <div class="plan3"><article><small>1 · Now</small><b>Is the leave approved?</b><p>Tell me when it is and I will mark it as confirmed. Until then, the same early request advice applies: ask first and ask early.</p></article>
   <article><small>2 · By ${esc(mo(d(150)))}</small><b>Choose where</b><p>Twelve days is long enough for abroad. Tell me the kind of trip you want, a budget, and who is coming, and I will give you three options.</p></article>
   <article><small>3 · By ${esc(mo(d(120)))}</small><b>Book flights and stay</b><p>July is peak season, so prices climb steadily. Booking four months out usually beats waiting.</p></article>
   <article><small>4 · By ${esc(mo(d(14)))}</small><b>Before you go</b><p>Passports and insurance, an out-of-office I draft for you, and a list of what can wait until you are back. I can hold the non-urgent emails and flag only the urgent ones.</p></article></div>`;}},
 {id:'xmas',title:'Christmas',sample:true,score:()=>{const d=days(S.life.xmas);if(d<0||d>50)return 0;const left=S.life.presents.filter(p=>!p.done).length;return 40+(50-d)*.6+left*4;},
  why:()=>{const left=S.life.presents.filter(p=>!p.done).length;return `${days(S.life.xmas)} days, ${left} present${left===1?'':'s'} to sort`;},
  preview:()=>{const P=S.life.presents,done=P.filter(p=>p.done).length,s=shiftOn(S.life.xmas);return `<span class="big">${days(S.life.xmas)}<small> days</small></span><span class="row1">${done} of ${P.length} presents sorted</span><span class="lbl">Christmas Day: ${esc(shiftTxt(s))}</span>`;},
  pane:()=>{const P=S.life.presents,r=restDays(Date.now(),new Date(2026,11,15));
   return `<header><h2>Christmas</h2><div class="meta">${days(S.life.xmas)} days · order online by Tue 15 Dec to be safe <span class="sample">Sample</span></div></header>
   <div class="plist">${P.map(p=>`<article><div><b>${esc(p.who)}</b><p>${esc(p.idea)}</p></div><span class="by ${days(p.by)<7?'crit':''}">by ${esc(shortDay(p.by))}</span></article>`).join('')}</div>
   <p class="fix">Shopping days that are already rest days: ${r.map(shortDay).map(esc).join(', ')}. I'd do it all on ${esc(r[0]?shortDay(r[0]):'your next rest day')}.</p>`;}},
 {id:'shifts',title:'Shifts and days off',sample:false,score:()=>{const t=shiftOn(Date.now());return t.c==='R'?52:66;},
  why:()=>{const t=shiftOn(Date.now());return t.c==='R'?'Rest day today':`${t.name} today, rest from ${shortDay(nextRest(Date.now()))}`;},
  preview:()=>{const t=shiftOn(Date.now());return `${strip(10)}<span class="row1"><b>Today</b> ${esc(shiftTxt(t))}</span><span class="lbl">Next rest day ${esc(shortDay(nextRest(Date.now())))}</span>`;},
  pane:()=>{const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));
   const cells=Array.from({length:35},(_,i)=>{const d=new Date(+start+i*DAY),s=shiftOn(d),pl=S.life.plans.filter(p=>p.start.toDateString()===d.toDateString()),cl=S.clash.some(c=>c.p.start.toDateString()===d.toDateString()&&c.level==='clash');
     return `<div class="rc s${s.c} ${d.toDateString()===new Date().toDateString()?'now':''} ${cl?'cx':''}"><small>${d.getDate()}</small><b>${s.leave?'Leave':s.c==='R'?'Rest':s.name}</b>${pl.map(p=>`<i>${esc(p.title)}</i>`).join('')}</div>`;}).join('');
   return `<header><h2>Shifts and days off</h2><div class="meta">Sussex RIT D, from Section Shifts <span class="real">Real</span></div></header>
   <div class="roster"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>${cells}</div>
   <p class="fix">Red outline: a plan clashes with a shift. Rota published to 31 January; later weeks follow the same ten-day cycle. It excludes leave, bank holidays and rest days in lieu, so check the official system before committing. <a href="${ROTA_SRC}" target="_blank" rel="noopener">Open Section Shifts</a></p>`;}},
 {id:'plans',title:'Plans',sample:true,score:()=>S.life.plans.filter(p=>p.start>Date.now()&&days(p.start)<=21).length?44:0,
  why:()=>'Social and family, next three weeks',
  preview:()=>{const n=S.life.plans.filter(p=>p.start>Date.now());const f=n[0];const bad=new Set(S.clash.map(c=>c.p));return `<span class="big">${n.filter(p=>days(p.start)<=31).length}</span><span class="row1">${esc(f?f.title:'')}</span><span class="lbl">${esc(f?shortDay(f.start):'')}${f&&bad.has(f)?' · clashes with a shift':''}</span>`;},
  pane:()=>{const bad=new Map(S.clash.map(c=>[c.p,c]));return `<header><h2>Plans</h2><div class="meta">Social and family <span class="sample">Sample</span></div></header>
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
  all.forEach((t,i)=>{t.hidden=t._score<=0;t.classList.toggle('hero',i===0);t.classList.toggle('span2',i===0||t.id==='map-open'||t.classList.contains('t-pulse'));t.classList.remove('rows2');
    let w=t.querySelector(':scope>.lwhy');if(!w){w=document.createElement('span');w.className='lwhy';t.querySelector('.tk').after(w);}w.textContent=t._why||'';
    t.setAttribute('aria-label',t.querySelector('.tk').textContent.replace('Sample','').trim()+'. '+(t._why||''));board.appendChild(t);});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-draft]');if(!b)return;const c=S.clash[+b.dataset.draft];if(!c)return;const box=$('swap-'+b.dataset.draft);
  box.hidden=false;if(c.multi){box.textContent=`Hi Sarge, I would like to request annual leave from ${dayLabel(c.p.start)} to ${dayLabel(new Date(+c.p.end-DAY))} for a trip abroad with my wife. I am asking early so it can be planned around. Please let me know if you need anything else from me. Thanks.`;b.textContent='Drafted. Nothing is sent';b.disabled=true;return;}
  box.hidden=false;box.textContent=`Hi Sarge, could I swap my ${c.s.name.toLowerCase()} shift on ${dayLabel(c.s.day)} for one of my rest days? I have ${c.p.kind==='family'?'a family commitment':'plans I can\'t move'} (${c.p.title.toLowerCase()}). Happy to cover a shift in return. Thanks.`;
  b.textContent='Drafted. Sample: nothing is sent';b.disabled=true;});

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
  composeVoice();renderChain();renderDeck();renderIdeas();renderInbox();renderAhead();renderToday();renderPulse();renderSources();renderLearned();
  renderPreviews();
}
const clock=()=>{$('clock').textContent=hhmm(Date.now());tickNow(false);};clock();setInterval(clock,20000);
(async()=>{
  env.thinkGoal=1;
  try{await Promise.all([load(),loadLearning()]);renderLearned();}
  catch(e){if(e.message!=='Signed out')speak('I couldn\'t read your sources just now.',e.message);}
  setTimeout(()=>{env.thinkGoal=0;},1800);onScroll();
  setInterval(()=>{if(!current&&!document.hidden)load().catch(()=>{});},180000);
})();
