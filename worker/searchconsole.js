/* Search Console lens: clicks, impressions, top searches, pages, sitemap problems and "chances"
   (searches where a site sits just off page one) for a Search Console property such as
   sc-domain:haylinglegends.co.uk. Uses the Google accounts already connected at traceytech.app
   (their sign-in includes webmasters.readonly) and picks whichever account can see the site.
   Cached for 3 hours; Conductor reads the cached summary for its brief.
   It also serves the same view as a page on the site at /search-console.
   Route it behind the sign-in, next to conductorRoutes:
     {const sc=await gscRoutes(r,env,u);if(sc)return sc;}
   Needs from the same bundle: json, sameOrigin, gTables, gAccess, condGet, condPut, condClip, condYMD. */

const GSC_DEFAULT='sc-domain:haylinglegends.co.uk';
const GSC_API='https://www.googleapis.com/webmasters/v3';
async function gscFetch(tok,path,body){const c=new AbortController();const t=setTimeout(()=>c.abort(),15000);
  try{const r=await fetch(GSC_API+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+tok,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:c.signal});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error((j.error&&j.error.message)||('HTTP '+r.status));return j;}finally{clearTimeout(t);}}
const gscDay=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const gscSum=rows=>{const c=rows.reduce((a,r)=>a+(r.clicks||0),0),i=rows.reduce((a,r)=>a+(r.impressions||0),0),p=rows.reduce((a,r)=>a+(r.position||0)*(r.impressions||0),0);
  return {clicks:Math.round(c),impressions:Math.round(i),ctr:i?+(c/i*100).toFixed(1):0,position:i?+(p/i).toFixed(1):0};};

/* Every site each connected Google account can see, so the app can offer a choice. */
async function gscSites(env){await gTables(env);
  const rows=(await env.DB.prepare('SELECT email,scopes FROM google_accts ORDER BY added').all()).results||[];const out=[];
  for(const rw of rows){if(!String(rw.scopes||'').includes('webmasters'))continue;const a=await gAccess(env,rw.email);if(!a||a.error)continue;
    try{const j=await gscFetch(a.token,'/sites');for(const s of j.siteEntry||[])if(s.permissionLevel!=='siteUnverifiedUser')out.push({site:s.siteUrl,email:rw.email,level:s.permissionLevel,token:a.token});}catch(e){}}
  return out;}

async function gscBuild(env,site){
  const sites=await gscSites(env);const pick=sites.find(s=>s.site===site);
  const list=[...new Set(sites.map(s=>s.site))];
  if(!pick)return {site,sites:list,error:sites.length?`None of your connected Google accounts can see ${site.replace(/^sc-domain:/,'')} in Search Console.`:'No connected Google account allows Search Console yet.'};
  const tok=pick.token,P='/sites/'+encodeURIComponent(site);
  const end=gscDay(condYMD(Date.now()),-1),start=gscDay(end,-27),pEnd=gscDay(start,-1),pStart=gscDay(pEnd,-27);
  const q=(s,e,dims,n)=>gscFetch(tok,P+'/searchAnalytics/query',{startDate:s,endDate:e,dimensions:dims,rowLimit:n,dataState:'all'}).then(j=>j.rows||[]);
  const [daily,prevDaily,queries,pages,maps]=await Promise.all([q(start,end,['date'],40),q(pStart,pEnd,['date'],40),q(start,end,['query'],250),q(start,end,['page'],10),
    gscFetch(tok,P+'/sitemaps').then(j=>j.sitemap||[]).catch(()=>[])]);
  const totals=gscSum(daily),prev=gscSum(prevDaily);
  const qs=queries.map(r=>({q:condClip(r.keys[0],90),c:Math.round(r.clicks),i:Math.round(r.impressions),ctr:+(r.ctr*100).toFixed(1),pos:+r.position.toFixed(1)}));
  // chances: plenty of people see it, but it sits just off the top of page one, or nobody clicks
  const chances=qs.filter(x=>x.i>=30&&x.pos>=4&&x.pos<=20).sort((a,b)=>b.i-a.i).slice(0,4).map(x=>({...x,why:x.pos<=10?'on page one but low down':'just off page one'}))
    .concat(qs.filter(x=>x.i>=100&&x.pos<4&&x.ctr<2).slice(0,2).map(x=>({...x,why:'near the top but hardly clicked: check the title and description'})));
  const problems=[];
  for(const m of maps){const e=+m.errors||0,w=+m.warnings||0;if(e||w)problems.push(`Sitemap ${String(m.path).replace(/^https?:\/\/[^/]+/,'')||'/'}: ${e?e+' error'+(e>1?'s':''):''}${e&&w?', ':''}${w?w+' warning'+(w>1?'s':''):''}`);
    if(m.lastDownloaded&&Date.now()-Date.parse(m.lastDownloaded)>14*864e5)problems.push(`Google has not read ${String(m.path).replace(/^https?:\/\/[^/]+/,'')||'the sitemap'} for ${Math.round((Date.now()-Date.parse(m.lastDownloaded))/864e5)} days`);}
  if(!maps.length)problems.push('No sitemap submitted');
  const change=prev.clicks?Math.round((totals.clicks-prev.clicks)/prev.clicks*100):null;
  if(change!=null&&change<=-25&&prev.clicks>=20)problems.unshift(`Clicks are down ${-change}% on the 28 days before`);
  return {site,sites:list,account:pick.email,range:{start,end},totals,prev,change,
    daily:daily.map(r=>({d:r.keys[0],c:Math.round(r.clicks),i:Math.round(r.impressions)})),
    queries:qs.slice(0,10),pages:pages.map(r=>({url:r.keys[0],c:Math.round(r.clicks),i:Math.round(r.impressions),pos:+r.position.toFixed(1)})),
    sitemaps:maps.map(m=>({path:m.path,errors:+m.errors||0,warnings:+m.warnings||0,lastDownloaded:m.lastDownloaded||'',pending:!!m.isPending})),
    chances,problems,at:new Date().toISOString(),
    open:'https://search.google.com/search-console?resource_id='+encodeURIComponent(site)};
}
async function gscData(env,fresh){const cfg=await condGet(env,'gsc_site');const site=(cfg&&cfg.value)||GSC_DEFAULT;
  const c=await condGet(env,'gsc:'+site);
  if(!fresh&&c&&Date.now()-Date.parse(c.updated)<3*36e5)return JSON.parse(c.value);
  let d;try{d=await gscBuild(env,site);}catch(e){d={site,error:'Search Console did not answer: '+condClip(e.message,140)};if(c){const old=JSON.parse(c.value);old.stale=d.error;return old;}}
  if(!d.error||!c)await condPut(env,'gsc:'+site,JSON.stringify(d));
  return d;}
/* For Conductor's brief: small, and never slow it down by more than a cache read when it can help it. */
async function gscForBrief(env){try{const d=await gscData(env,false);if(d.error)return null;
  return {site:d.site.replace(/^sc-domain:/,''),last28days:d.totals,before:d.prev,changePct:d.change,topSearches:d.queries.slice(0,5).map(x=>`${x.q} (${x.c} clicks, pos ${x.pos})`),
    chances:d.chances.slice(0,3).map(x=>`${x.q}: ${x.i} views, position ${x.pos}, ${x.why}`),problems:d.problems.slice(0,3)};}catch(e){return null;}}

/* The same data as a page on the site: traceytech.app/search-console */
const GSC_PAGE=`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Search Console · TraceyTech</title>
<style nonce="N0NCE">:root{--void:#09090a;--paper:#efede8;--mist:#c9c7c2;--ash:#8f8e8a;--line:rgba(239,237,232,.09);--line2:rgba(239,237,232,.16);--sig:#e5322b;--ok:#3fb950;--cy:#56d4dd}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 70% -10%,#16202a 0,transparent 60%),var(--void);color:var(--paper);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;min-height:100vh}
main{max-width:980px;margin:0 auto;padding:22px 16px 60px}a{color:var(--paper)}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}h1{font-weight:300;font-size:clamp(28px,6vw,44px);letter-spacing:-.02em;margin:6px 0}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ash)}
.card{background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.015));box-shadow:inset 0 1px 0 rgba(239,237,232,.12),inset 0 0 0 1px var(--line);border-radius:22px;padding:18px;margin:14px 0}
.pill{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:999px;background:rgba(239,237,232,.08);box-shadow:inset 0 0 0 1px var(--line2);color:var(--paper);border:0;font:inherit;font-size:14px;text-decoration:none;cursor:pointer}
.pill.solid{background:var(--paper);color:var(--void)}select.pill{appearance:none;padding-right:16px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.stats div{padding:14px;border-radius:16px;background:rgba(239,237,232,.04);box-shadow:inset 0 0 0 1px var(--line)}
.stats b{display:block;font-weight:300;font-size:clamp(20px,4.5vw,30px)}.stats small{display:block;color:var(--ash);font-size:12px}
.up{color:var(--ok)}.down{color:#ff8a84}svg{display:block;width:100%;height:120px}
.row{display:flex;gap:12px;padding:11px 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}.tag{flex:none;width:64px}.row .s{color:var(--ash);font-size:13.5px}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-weight:400;color:var(--ash);font-size:12px;padding:6px 6px 6px 0}td{padding:9px 6px 9px 0;border-top:1px solid var(--line);vertical-align:top}td.n,th.n{text-align:right;white-space:nowrap}
.wrap{overflow-x:auto}.err{color:#ff8a84}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:720px){.grid2{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main>
<div class="top"><a class="pill" href="/">← TraceyTech</a><span class="mono" id="acct"></span></div>
<div class="top"><div><div class="mono">Search Console</div><h1 id="h">Loading…</h1><div class="s mono" id="range"></div></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><select class="pill" id="site" aria-label="Website"></select><button class="pill" id="fresh">Refresh</button><a class="pill solid" id="open" target="_blank" rel="noopener">Open in Google</a></div></div>
<div id="body"></div></main>
<script nonce="N0NCE">
const $=s=>document.querySelector(s),esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),n=v=>typeof v==='number'?v.toLocaleString('en-GB'):esc(v);
const host=s=>String(s).replace(/^sc-domain:/,'').replace(/^https?:\\/\\//,'').replace(/\\/$/,'');
function chart(d){if(!d||d.length<2)return '';const W=600,H=120,mc=Math.max(1,...d.map(x=>x.c)),mi=Math.max(1,...d.map(x=>x.i)),st=W/(d.length-1);
  const P=k=>d.map((x,i)=>(i*st).toFixed(1)+','+(H-6-(x[k]/(k==='c'?mc:mi))*(H-16)).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline points="'+P('i')+'" fill="none" stroke="rgba(239,237,232,.25)" stroke-width="1.2" vector-effect="non-scaling-stroke"/><polygon points="0,'+H+' '+P('c')+' '+W+','+H+'" fill="rgba(86,212,221,.12)"/><polyline points="'+P('c')+'" fill="none" stroke="#56d4dd" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="mono">Clicks (blue) and times seen (grey), each day</div>';}
function draw(g){const sel=$('#site');sel.innerHTML=(g.sites&&g.sites.length?g.sites:[g.site]).map(x=>'<option value="'+esc(x)+'"'+(x===g.site?' selected':'')+'>'+esc(host(x))+'</option>').join('');
  $('#open').href=g.open||'https://search.google.com/search-console';$('#acct').textContent=g.account?'Using '+g.account:'';
  if(!g.totals){$('#h').textContent=host(g.site);$('#body').innerHTML='<div class="card err">'+esc(g.error||'Not available yet.')+'</div>';return;}
  const t=g.totals,ch=g.change;$('#h').innerHTML=n(t.clicks)+' clicks to '+esc(host(g.site))+(ch!=null?' <span class="'+(ch<0?'down':'up')+'">'+(ch>0?'+':'')+ch+'%</span>':'');
  $('#range').textContent='Last 28 days, '+g.range.start+' to '+g.range.end+(g.stale?' · could not refresh just now':'');
  const dif=(a,b,inv)=>b?'<small class="'+((a>=b)!==!!inv?'up':'down')+'">'+(a>=b?'▲ ':'▼ ')+n(Math.abs(+(a-b).toFixed(1)))+' vs before</small>':'<small>&nbsp;</small>';
  let h='<div class="card"><div class="stats"><div><b>'+n(t.clicks)+'</b><small>Clicks</small>'+dif(t.clicks,g.prev.clicks)+'</div><div><b>'+n(t.impressions)+'</b><small>Times seen</small>'+dif(t.impressions,g.prev.impressions)+'</div><div><b>'+t.ctr+'%</b><small>Click rate</small>'+dif(t.ctr,g.prev.ctr)+'</div><div><b>'+t.position+'</b><small>Average position</small>'+dif(t.position,g.prev.position,true)+'</div></div>'+chart(g.daily)+'</div>';
  if((g.problems||[]).length||(g.chances||[]).length)h+='<div class="card"><div class="mono">What needs you</div>'+(g.problems||[]).map(x=>'<div class="row"><span class="tag mono down">Fix</span><div>'+esc(x)+'</div></div>').join('')+(g.chances||[]).map(x=>'<div class="row"><span class="tag mono up">Chance</span><div>“'+esc(x.q)+'”<div class="s">'+n(x.i)+' times seen, position '+x.pos+': '+esc(x.why)+'</div></div></div>').join('')+'</div>';
  h+='<div class="grid2"><div class="card"><div class="mono">Top searches</div><div class="wrap"><table><tr><th>Search</th><th class="n">Clicks</th><th class="n">Seen</th><th class="n">Pos</th></tr>'+(g.queries||[]).map(x=>'<tr><td>'+esc(x.q)+'</td><td class="n">'+n(x.c)+'</td><td class="n">'+n(x.i)+'</td><td class="n">'+x.pos+'</td></tr>').join('')+'</table></div></div>';
  h+='<div class="card"><div class="mono">Top pages</div><div class="wrap"><table><tr><th>Page</th><th class="n">Clicks</th><th class="n">Pos</th></tr>'+(g.pages||[]).map(x=>'<tr><td><a href="'+esc(x.url)+'" target="_blank" rel="noopener">'+esc(x.url.replace(/^https?:\\/\\/[^/]+/,'')||'/')+'</a></td><td class="n">'+n(x.c)+'</td><td class="n">'+x.pos+'</td></tr>').join('')+'</table></div></div></div>';
  h+='<div class="card"><div class="mono">Sitemaps</div>'+((g.sitemaps||[]).length?(g.sitemaps||[]).map(x=>'<div class="row"><div>'+esc(x.path)+'<div class="s">'+(x.errors?x.errors+' errors · ':'')+(x.warnings?x.warnings+' warnings · ':'')+(x.lastDownloaded?'read by Google '+new Date(x.lastDownloaded).toLocaleDateString('en-GB'):'not read yet')+(x.pending?' · pending':'')+'</div></div></div>').join(''):'<p class="err">No sitemap submitted.</p>')+'</div>';
  $('#body').innerHTML=h;}
async function load(fresh){$('#fresh').disabled=true;try{const r=await fetch('/api/search-console'+(fresh?'?fresh=1':''),{credentials:'same-origin'});draw(await r.json());}catch(e){$('#body').innerHTML='<div class="card err">Could not load. Try again.</div>';}$('#fresh').disabled=false;}
$('#fresh').onclick=()=>load(true);
$('#site').onchange=async e=>{$('#h').textContent='Loading…';const r=await fetch('/api/search-console',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'site',site:e.target.value})});draw(await r.json());};
load(false);
</script></body></html>`;

async function gscRoutes(r,env,u){
  if(u.pathname==='/search-console'&&r.method==='GET'){const nonce=crypto.randomUUID().replace(/-/g,'');
    return new Response(GSC_PAGE.replaceAll('N0NCE',nonce),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'self'; base-uri 'none'"}});}
  if(u.pathname!=='/api/search-console')return null;
  if(r.method==='GET')return json(await gscData(env,u.searchParams.get('fresh')==='1'));
  if(r.method!=='POST')return json({error:'Not allowed'},405);
  if(!sameOrigin(r,u))return json({error:'Request origin could not be verified.'},403);
  let b;try{b=await r.json();}catch{return json({error:'Bad request'},400);}
  if(b&&b.op==='site'){const s=condClip(b.site,200);if(!/^(sc-domain:[a-z0-9.-]+|https?:\/\/\S+)$/i.test(s))return json({error:'That is not a Search Console property'},400);
    const d=await gscBuild(env,s).catch(e=>({error:condClip(e.message,140)}));if(d.error)return json(d,422);
    await condPut(env,'gsc_site',s);await condPut(env,'gsc:'+s,JSON.stringify(d));return json(d);}
  return json({error:'Bad request'},400);
}
