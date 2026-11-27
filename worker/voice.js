/* TraceyTech voice notes: the NoteAI fob (M5StickS3) -> laptop bridge -> here.

   This block is pasted into the Worker next to the other route groups. It uses the
   Worker's own helpers: json, base, sameOrigin, gAccess, and the env.DB D1 binding.

   Wiring (two lines in the fetch handler):
     after authRoutes:            {const vi=await voiceIngest(r,env,u);if(vi)return vi;}
     with the other route groups: {const vr=await voiceRoutes(r,env,u);if(vr)return vr;}

   Secret: VOICE_TOKEN (a long random string). The bridge sends it as a Bearer token.

   What happens to a note:
     reminder, task           -> added to the To-do list straight away (state "done", undoable)
     note, article_idea,
     research, question       -> kept in the inbox (state "saved")
     calendar_event, email    -> waits for a press in the inbox (state "pending")
     unclear                  -> kept so Nathan can see what was heard (state "unclear")
   Nothing is sent or booked without a press on /voice.
*/
const VOICE_AUTO_TODO=['reminder','task'];
const VOICE_CONFIRM=['calendar_event','email_draft'];
const VOICE_INTENTS=['reminder','calendar_event','note','email_draft','task','research','article_idea','question','unclear'];

async function voiceTables(env){
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS voice_notes(id INTEGER PRIMARY KEY AUTOINCREMENT,transcript TEXT NOT NULL,intent TEXT,summary TEXT,title TEXT,body TEXT,due TEXT,recipient TEXT,target TEXT,state TEXT,result TEXT,device TEXT,recorded TEXT,created TEXT,updated TEXT)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS todos(id INTEGER PRIMARY KEY AUTOINCREMENT,text TEXT NOT NULL,cat TEXT,place TEXT,ctx TEXT,due TEXT,state TEXT DEFAULT \'open\',created TEXT,updated TEXT)').run();
}
function voiceEq(a,b){a=String(a||'');b=String(b||'');if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function voiceTodo(env,n){
  const now=new Date().toISOString();
  const text=String(n.title||n.summary||n.transcript||'').trim().slice(0,300)||'Voice note';
  let due='';const w=String(n.due||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(w))due=w;
  else if(/^\d{4}-\d{2}-\d{2}T/.test(w)&&!isNaN(new Date(w))){const x=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(w)).map(q=>[q.type,q.value]));due=x.year+'-'+x.month+'-'+x.day+' '+x.hour+':'+x.minute;}
  const res=await env.DB.prepare('INSERT INTO todos(text,cat,place,ctx,due,state,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(text,'general','','voice',due,'open',now,now).run();
  return res.meta&&res.meta.last_row_id;
}

/* Device side: no browser session, Bearer token instead. */
async function voiceIngest(r,env,u){
  if(u.pathname!=='/api/voice/ingest')return null;
  if(r.method!=='POST')return json({error:'Not allowed'},405);
  if(!env.VOICE_TOKEN)return json({error:'Voice notes are not set up on the Worker yet (VOICE_TOKEN missing).'},503);
  const h=r.headers.get('Authorization')||'';
  if(!voiceEq(h.replace(/^Bearer\s+/i,''),env.VOICE_TOKEN))return json({error:'Device not recognised.'},401);
  if(!(r.headers.get('content-type')||'').includes('json'))return json({error:'Unsupported request'},415);
  const raw=await r.text();if(raw.length>20000)return json({error:'Too large'},413);
  let b;try{b=JSON.parse(raw);}catch{return json({error:'Bad request'},400);}
  const f=(v,n)=>String(v==null?'':v).slice(0,n);
  const transcript=f(b.transcript,4000).trim();if(!transcript)return json({error:'Empty transcript'},400);
  const intent=VOICE_INTENTS.includes(b.intent)?b.intent:'unclear';
  const n={transcript,intent,summary:f(b.summary,400),title:f(b.title,300),body:f(b.body,4000),due:f(b.when,40),recipient:f(b.recipient,200),target:f(b.target,80)};
  await voiceTables(env);
  const now=new Date().toISOString();
  let state='saved',result='',message='Saved to your voice inbox.';
  if(intent==='unclear'){state='unclear';message='Saved, but it was not clear what you wanted.';}
  else if(VOICE_CONFIRM.includes(intent)){state='pending';message=intent==='calendar_event'?'Calendar event ready. Confirm it in TraceyTech.':'Email ready. Check and send it in TraceyTech.';}
  else if(VOICE_AUTO_TODO.includes(intent)){const id=await voiceTodo(env,n);state='done';result=JSON.stringify({todo:id});message='Added to your To-do list.';}
  const res=await env.DB.prepare('INSERT INTO voice_notes(transcript,intent,summary,title,body,due,recipient,target,state,result,device,recorded,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(n.transcript,n.intent,n.summary,n.title,n.body,n.due,n.recipient,n.target,state,result,f(b.device,60),f(b.recorded_at,40),now,now).run();
  return json({ok:true,id:res.meta&&res.meta.last_row_id,state,message});
}

/* Browser side: behind the normal TraceyTech sign-in. */
async function voiceRoutes(r,env,u){
  const p=u.pathname;
  if(p==='/voice'&&r.method==='GET'){const nonce=crypto.randomUUID().replace(/-/g,'');
    return new Response(voiceHtml.replaceAll('VNONCE',nonce),{headers:{...base,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});}
  if(p!=='/api/voice'&&p!=='/api/voice/act')return null;
  await voiceTables(env);
  if(p==='/api/voice'&&r.method==='GET'){const rows=(await env.DB.prepare('SELECT id,transcript,intent,summary,title,body,due,recipient,target,state,result,created FROM voice_notes WHERE state!=? ORDER BY id DESC LIMIT 100').bind('dismissed').all()).results||[];return json({rows});}
  if(r.method!=='POST')return json({error:'Not allowed'},405);
  if(!(r.headers.get('content-type')||'').includes('json'))return json({error:'Unsupported request'},415);
  if(!sameOrigin(r,u))return json({error:'Request origin could not be verified.'},403);
  let b;try{b=await r.json();}catch{return json({error:'Bad request'},400);}
  const id=Number(b&&b.id),action=String((b&&b.action)||'');
  if(!Number.isInteger(id)||!['calendar','email','todo','dismiss','undo'].includes(action))return json({error:'Bad request'},400);
  const n=await env.DB.prepare('SELECT * FROM voice_notes WHERE id=?').bind(id).first();if(!n)return json({error:'Not found'},404);
  const e=(b&&b.edit)||{};const pick=(k,d,m)=>String(e[k]!=null?e[k]:d||'').slice(0,m);
  const now=new Date().toISOString();
  const finish=async(state,result)=>{await env.DB.prepare('UPDATE voice_notes SET state=?,result=?,updated=? WHERE id=?').bind(state,result==null?n.result:JSON.stringify(result),now,id).run();return json({ok:true,state,result});};

  if(action==='dismiss')return finish('dismissed');
  if(action==='todo'){const t=await voiceTodo(env,{...n,title:pick('title',n.title||n.summary,300),due:pick('when',n.due,40)});return finish('done',{todo:t});}
  if(action==='undo'){let res={};try{res=JSON.parse(n.result||'{}');}catch{}
    if(res.todo)await env.DB.prepare('UPDATE todos SET state=?,updated=? WHERE id=?').bind('ignored',now,Number(res.todo)).run();
    else if(res.event)return json({error:'Delete the event in Google Calendar.'},409);
    else if(res.sent)return json({error:'An email that has gone cannot be unsent.'},409);
    return finish(VOICE_CONFIRM.includes(n.intent)?'pending':'saved',{});}

  const a=await gAccess(env);if(!a||a.error)return json({error:'Google is not connected.'},409);
  if(action==='calendar'){
    if(!String(a.scope||'').includes('calendar.events'))return json({error:'Calendar changes are not allowed yet. Press Allow Calendar and email.',needScope:true},403);
    const title=pick('title',n.title||n.summary,300).trim()||'Voice note';const when=pick('when',n.due,40).trim();
    const mins=Math.max(5,Math.min(720,Number(e.minutes)||30));let start,end;
    if(/^\d{4}-\d{2}-\d{2}$/.test(when)){const d=new Date(when+'T00:00:00Z');const nx=new Date(d.getTime()+864e5).toISOString().slice(0,10);start={date:when};end={date:nx};}
    else{const t=new Date(when);if(!when||isNaN(t))return json({error:'Give the event a date and time first.'},400);
      start={dateTime:t.toISOString(),timeZone:'Europe/London'};end={dateTime:new Date(t.getTime()+mins*6e4).toISOString(),timeZone:'Europe/London'};}
    const g=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/json'},body:JSON.stringify({summary:title,description:'From a NoteAI voice note: "'+String(n.transcript).slice(0,1000)+'"',start,end})});
    const gj=await g.json().catch(()=>({}));if(!g.ok)return json({error:(gj.error&&gj.error.message)||('HTTP '+g.status)},502);
    return finish('done',{event:gj.id,link:gj.htmlLink});}
  if(action==='email'){
    if(!String(a.scope||'').includes('gmail.send'))return json({error:'Sending is not allowed yet. Press Allow Calendar and email.',needScope:true},403);
    const to=pick('to',n.recipient,200).replace(/[\r\n]+/g,' ').trim(),subj=pick('subject',n.title,200).replace(/[\r\n]+/g,' ').trim()||'(no subject)',text=pick('body',n.body,4000).trim();
    if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to))return json({error:'Put the full email address in the To box.'},400);
    if(!text)return json({error:'The email is empty.'},400);
    const u8=s=>{const by=new TextEncoder().encode(s);let o='';for(let i=0;i<by.length;i+=8192)o+=String.fromCharCode.apply(null,by.subarray(i,i+8192));return btoa(o);};
    const raw='To: '+to+'\r\nSubject: =?UTF-8?B?'+u8(subj)+'?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n'+u8(text);
    const sr=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/json'},body:JSON.stringify({raw:u8(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')})});
    const sj=await sr.json().catch(()=>({}));if(!sr.ok)return json({error:(sj.error&&sj.error.message)||('HTTP '+sr.status)},502);
    return finish('done',{sent:sj.id,to});}
  return json({error:'Bad request'},400);
}

const voiceHtml=`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><meta name="robots" content="noindex,nofollow"><title>Voice notes · TraceyTech</title>
<style nonce="VNONCE">
:root{--bg:#09090a;--card:#161618;--edge:#ffffff17;--text:#ededee;--muted:#a7a7ad;--ok:#7fd8b5;--warn:#f0c674;--bad:#e1746d;--acc:#bfe3ff}
*{box-sizing:border-box}html{background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}body{margin:0 auto;max-width:760px;padding:20px 16px 60px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}h1{font-size:22px;font-weight:500;margin:0}a{color:var(--acc)}
.card{background:var(--card);border:1px solid var(--edge);border-radius:14px;padding:16px;margin:14px 0}.top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.pill{border-radius:99px;padding:2px 10px;font-size:12px;border:1px solid var(--edge)}.pending{color:var(--warn);border-color:#f0c67455}.done{color:var(--ok);border-color:#7fd8b555}.unclear{color:var(--bad);border-color:#e1746d55}
.said{font-style:italic;color:var(--muted);margin:8px 0}.sum{font-size:17px;margin:6px 0}label{display:block;font-size:12px;color:var(--muted);margin-top:8px}
input,textarea{width:100%;background:#0f0f11;color:var(--text);border:1px solid var(--edge);border-radius:8px;padding:8px;font:inherit}textarea{min-height:110px}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button{font:inherit;border-radius:10px;padding:8px 14px;border:1px solid var(--edge);background:#222226;color:var(--text);cursor:pointer}button.go{background:#2c5a4b;border-color:#7fd8b566}button:disabled{opacity:.5}
.msg{margin-top:8px;font-size:14px}.err{color:var(--bad)}.empty{color:var(--muted);text-align:center;margin-top:40px}
</style></head><body>
<header><h1>Voice notes</h1><span><a href="/">Back to TraceyTech</a></span></header>
<p class="top">Notes from your NoteAI fob. Reminders and tasks go straight onto your To-do list. Calendar events and emails wait here until you press the button.</p>
<div id="list"><p class="empty">Loading…</p></div>
<script nonce="VNONCE">
const $=s=>document.querySelector(s);const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={reminder:'Reminder',task:'Task',note:'Note',calendar_event:'Calendar event',email_draft:'Email',research:'Research',article_idea:'Article idea',question:'Question',unclear:'Not clear'};
const stateTxt={pending:'Waiting for you',done:'Done',saved:'Saved',unclear:'Not clear'};
async function api(path,body){const r=await fetch(path,body?{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{credentials:'same-origin'});const j=await r.json().catch(()=>({}));if(r.status===401){location.href='/login';throw new Error('Signed out');}if(!r.ok){const e=new Error(j.error||('HTTP '+r.status));e.needScope=j.needScope;throw e;}return j;}
function localWhen(w){if(!w)return '';const d=new Date(w);if(isNaN(d))return w;return /^\\d{4}-\\d{2}-\\d{2}$/.test(w)?d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}):d.toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function inputWhen(w){const d=new Date(w);if(!w||isNaN(d)||/^\\d{4}-\\d{2}-\\d{2}$/.test(w))return w||'';const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());}
function card(n){let res={};try{res=JSON.parse(n.result||'{}');}catch{}
  let form='',btns='';
  if(n.state==='pending'&&n.intent==='calendar_event'){form='<label>Title</label><input data-f="title" value="'+esc(n.title||n.summary)+'"><label>When</label><input data-f="when" type="datetime-local" value="'+esc(inputWhen(n.due))+'"><label>Minutes</label><input data-f="minutes" type="number" min="5" max="720" value="30">';btns='<button class="go" data-a="calendar">Add to my calendar</button><button data-a="todo">Make it a To-do instead</button>';}
  else if(n.state==='pending'&&n.intent==='email_draft'){form='<label>To (full email address)</label><input data-f="to" value="'+esc(/@/.test(n.recipient)?n.recipient:'')+'" placeholder="'+esc(n.recipient||'name@example.com')+'"><label>Subject</label><input data-f="subject" value="'+esc(n.title)+'"><label>Message</label><textarea data-f="body">'+esc(n.body)+'</textarea>';btns='<button class="go" data-a="email">Send this email</button><button data-a="todo">Make it a To-do instead</button>';}
  else if(n.state==='saved'||n.state==='unclear'){if(n.body)form='<p>'+esc(n.body).replace(/\\n/g,'<br>')+'</p>';btns='<button data-a="todo">Add to To-do</button>';}
  else if(n.state==='done'){form=res.todo?'<p class="msg">On your To-do list.</p>':res.event?'<p class="msg">In your calendar. '+(res.link?'<a href="'+esc(res.link)+'" target="_blank" rel="noopener">Open it</a>':'')+'</p>':res.sent?'<p class="msg">Sent to '+esc(res.to)+'.</p>':'';if(res.todo)btns='<button data-a="undo">Undo</button>';}
  btns+='<button data-a="dismiss">Clear</button>';
  return '<div class="card" data-id="'+n.id+'"><div class="top"><span class="pill '+esc(n.state)+'">'+esc(stateTxt[n.state]||n.state)+'</span><span>'+esc(label[n.intent]||n.intent)+'</span><span>'+esc(new Date(n.created).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</span>'+(n.due?'<span>· '+esc(localWhen(n.due))+'</span>':'')+'</div><div class="sum">'+esc(n.summary||n.title)+'</div><div class="said">You said: “'+esc(n.transcript)+'”</div>'+form+'<div class="btns">'+btns+'</div><div class="msg" data-m></div></div>';}
async function load(){try{const r=await api('/api/voice');$('#list').innerHTML=r.rows.length?r.rows.map(card).join(''):'<p class="empty">No voice notes yet. Hold the fob button, speak, let go.</p>';}catch(e){$('#list').innerHTML='<p class="empty err">'+esc(e.message)+'</p>';}}
$('#list').addEventListener('click',async ev=>{const b=ev.target.closest('button[data-a]');if(!b)return;const c=b.closest('.card'),m=c.querySelector('[data-m]'),a=b.dataset.a;
  const edit={};c.querySelectorAll('[data-f]').forEach(i=>{let v=i.value;if(i.dataset.f==='when'&&v&&v.length===16)v=new Date(v).toISOString();edit[i.dataset.f]=v;});
  if(a==='email'&&!confirm('Send this email to '+(edit.to||'?')+' now?'))return;
  c.querySelectorAll('button').forEach(x=>x.disabled=true);m.className='msg';m.textContent='Working…';
  try{await api('/api/voice/act',{id:Number(c.dataset.id),action:a,edit});await load();}
  catch(e){m.className='msg err';m.innerHTML=esc(e.message)+(e.needScope?' <a href="/connect/google?write=1">Allow Calendar and email</a>':'');c.querySelectorAll('button').forEach(x=>x.disabled=false);}});
load();setInterval(()=>{if(!document.querySelector('input:focus,textarea:focus'))load();},20000);
</script></body></html>`;
