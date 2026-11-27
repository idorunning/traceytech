/* Search Console lens: clicks, impressions, top searches, pages, sitemap problems and "chances"
   (searches where a site sits just off page one) for a Search Console property such as
   sc-domain:haylinglegends.co.uk. Uses the Google accounts already connected at traceytech.app
   (their sign-in includes webmasters.readonly) and picks whichever account can see the site.
   Cached for 3 hours; Conductor reads the cached summary for its brief.
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

async function gscRoutes(r,env,u){
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
