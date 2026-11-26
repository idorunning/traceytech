/* ---- Google connection: read-only, behind the login. Tokens are encrypted in D1; no message contents are ever stored or shown. ---- */
const GSCOPES=['openid','email','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.readonly','https://www.googleapis.com/auth/analytics.readonly','https://www.googleapis.com/auth/webmasters.readonly','https://www.googleapis.com/auth/drive.metadata.readonly'];
const GREDIR='https://traceytech.app/connect/google/callback';
const gb64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const gun=x=>Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function gSign(env,msg){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode('tt-state:'+env.GOOGLE_CLIENT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);return gb64(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(msg)));}
async function gKey(env){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('tt-tokens:'+env.GOOGLE_CLIENT_SECRET)),'AES-GCM',false,['encrypt','decrypt']);}
async function gEnc(env,t){const iv=crypto.getRandomValues(new Uint8Array(12));return gb64(iv)+'.'+gb64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await gKey(env),new TextEncoder().encode(t)));}
async function gDec(env,s){const [a,b]=s.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:gun(a)},await gKey(env),gun(b)));}
async function gTables(env){await env.DB.prepare('CREATE TABLE IF NOT EXISTS google_auth(id INTEGER PRIMARY KEY CHECK(id=1),email TEXT,scopes TEXT,refresh_enc TEXT,updated TEXT)').run();await env.DB.prepare('CREATE TABLE IF NOT EXISTS google_test(id INTEGER PRIMARY KEY CHECK(id=1),at TEXT,result TEXT)').run();}
const gEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function gPage(title,body){return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+gEsc(title)+'</title><body style="background:#09090a;color:#efede8;font:16px/1.5 system-ui;padding:40px;max-width:560px;margin:auto">'+body+'</body>',{headers:{...base,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
/* Google sends the browser back here before the session cookie is guaranteed to travel, so hop once on our own site */
function googleBounce(r,u){if(r.method==='GET'&&u.pathname==='/connect/google/callback'){const to='/connect/google/finish'+u.search;return new Response('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url='+gEsc(to)+'"><title>Connecting</title><body style="background:#09090a;color:#efede8;font:16px system-ui;padding:40px">Connecting Google…</body>',{headers:{...base,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}return null;}
async function gAccess(env){await gTables(env);const row=await env.DB.prepare('SELECT * FROM google_auth WHERE id=1').first();if(!row)return null;
  const rt=await gDec(env,row.refresh_enc);
  const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:rt,grant_type:'refresh_token'})});
  const j=await tr.json().catch(()=>({}));if(!tr.ok||!j.access_token)return {error:(j.error_description||j.error||('HTTP '+tr.status)),row};
  return {token:j.access_token,row,scope:j.scope||row.scopes};}
async function gCheck(name,url,tok,pick){try{const c=new AbortController();const t=setTimeout(()=>c.abort(),12000);const res=await fetch(url,{headers:{Authorization:'Bearer '+tok},signal:c.signal});clearTimeout(t);const j=await res.json().catch(()=>({}));
  if(!res.ok){const m=(j.error&&(j.error.message||j.error))||('HTTP '+res.status);return {name,ok:false,status:res.status,error:String(m).slice(0,320)};}
  return {name,ok:true,status:res.status,detail:pick(j)};}catch(e){return {name,ok:false,status:0,error:String(e&&e.message||e).slice(0,200)};}}
async function googleRoutes(r,env,u,s){
  const p=u.pathname;if(!(p.startsWith('/connect/google')||p.startsWith('/api/google/')))return null;
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET){if(p.startsWith('/api/'))return json({configured:false,connected:false});return gPage('Google keys missing','<p>The Google client ID and secret are not saved on the Worker yet.</p><p><a style="color:#bfe3ff" href="/">Back</a></p>');}
  if(p==='/connect/google'&&r.method==='GET'){const ts=String(Date.now()),n=gb64(crypto.getRandomValues(new Uint8Array(12)));const st=ts+'.'+n+'.'+await gSign(env,ts+'.'+n);
    const q=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:GREDIR,response_type:'code',scope:GSCOPES.join(' '),access_type:'offline',prompt:'consent',include_granted_scopes:'false',state:st});
    return new Response(null,{status:302,headers:{...base,Location:'https://accounts.google.com/o/oauth2/v2/auth?'+q,'Cache-Control':'no-store'}});}
  if(p==='/connect/google/finish'&&r.method==='GET'){
    const err=u.searchParams.get('error');if(err)return gPage('Google said no','<p>Google returned: <b>'+gEsc(err)+'</b>.</p><p>Nothing was connected.</p><p><a style="color:#bfe3ff" href="/">Back to TraceyTech</a></p>');
    const code=u.searchParams.get('code'),st=(u.searchParams.get('state')||'').split('.');
    if(!code||st.length!==3||Date.now()-Number(st[0])>600000||st[2]!==await gSign(env,st[0]+'.'+st[1]))return gPage('Could not verify','<p>That sign-in link expired or did not match. Start again from Plugged in.</p><p><a style="color:#bfe3ff" href="/">Back to TraceyTech</a></p>');
    const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:GREDIR,grant_type:'authorization_code'})});
    const j=await tr.json().catch(()=>({}));
    if(!tr.ok||!j.refresh_token)return gPage('Google did not finish','<p>Google said: <b>'+gEsc(j.error_description||j.error||('HTTP '+tr.status)||'no refresh token')+'</b>.</p>'+(j.error==='redirect_uri_mismatch'?'<p>The redirect address in your Google OAuth client must be exactly <code>'+GREDIR+'</code>.</p>':'')+'<p><a style="color:#bfe3ff" href="/">Back to TraceyTech</a></p>');
    let email='';try{email=JSON.parse(atob(j.id_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).email||'';}catch{}
    await gTables(env);await env.DB.prepare('INSERT INTO google_auth(id,email,scopes,refresh_enc,updated) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,scopes=excluded.scopes,refresh_enc=excluded.refresh_enc,updated=excluded.updated').bind(email,j.scope||'',await gEnc(env,j.refresh_token),new Date().toISOString()).run();
    return new Response(null,{status:302,headers:{...base,Location:'/?google=connected','Cache-Control':'no-store'}});}
  if(p==='/api/google/status'&&r.method==='GET'){await gTables(env);const row=await env.DB.prepare('SELECT email,scopes,updated FROM google_auth WHERE id=1').first();const t=await env.DB.prepare('SELECT at,result FROM google_test WHERE id=1').first();
    return json({configured:true,connected:!!row,email:row?row.email:null,scopes:row?String(row.scopes).split(' ').filter(x=>x.includes('googleapis.com')).map(x=>x.split('/').pop()):[],updated:row?row.updated:null,test:t?{at:t.at,results:JSON.parse(t.result)}:null});}
  if(r.method==='POST'&&!(r.headers.get('content-type')||'').includes('json'))return json({error:'Unsupported request'},415);
  if(p==='/api/google/test'&&r.method==='POST'){const a=await gAccess(env);if(!a)return json({error:'Google is not connected yet.'},409);
    if(a.error)return json({error:'Google refused the saved access: '+a.error+'. Connect again.'},409);
    const tok=a.token,now=new Date(),in30=new Date(+now+30*864e5).toISOString();
    const results=await Promise.all([
      gCheck('Gmail','https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX',tok,j=>`${j.messagesUnread??'?'} unread of ${j.messagesTotal??'?'} in the inbox`),
      gCheck('Calendar','https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=250&timeMin='+encodeURIComponent(now.toISOString())+'&timeMax='+encodeURIComponent(in30),tok,j=>`${(j.items||[]).length} events in the next 30 days`),
      gCheck('Analytics','https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=50',tok,j=>{const A=j.accountSummaries||[];return `${A.length} account${A.length===1?'':'s'}, ${A.reduce((n,x)=>n+(x.propertySummaries||[]).length,0)} propert${A.reduce((n,x)=>n+(x.propertySummaries||[]).length,0)===1?'y':'ies'}`;}),
      gCheck('Search Console','https://www.googleapis.com/webmasters/v3/sites',tok,j=>{const S=j.siteEntry||[];return `${S.length} site${S.length===1?'':'s'}: ${S.slice(0,6).map(x=>x.siteUrl.replace(/^sc-domain:|^https?:\/\//,'').replace(/\/$/,'')).join(', ')}`;}),
      gCheck('Drive','https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id)',tok,j=>`can list files (metadata only)`)]);
    const at=new Date().toISOString();await gTables(env);await env.DB.prepare('INSERT INTO google_test(id,at,result) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at,result=excluded.result').bind(at,JSON.stringify(results)).run();
    return json({at,results});}
  if(p==='/api/google/disconnect'&&r.method==='POST'){await gTables(env);const row=await env.DB.prepare('SELECT refresh_enc FROM google_auth WHERE id=1').first();
    if(row){try{await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:await gDec(env,row.refresh_enc)})});}catch{}}
    await env.DB.prepare('DELETE FROM google_auth WHERE id=1').run();await env.DB.prepare('DELETE FROM google_test WHERE id=1').run();return json({ok:true});}
  return null;
}
