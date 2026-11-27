/* Smart to-do lists for TraceyTech (used by the Conductor IO Android app).
   - Preset lists (To-do, Shopping, Work, Errands, Website projects, App ideas, Home). Each list is a
     checklist or a spreadsheet, with columns that suit what it holds.
   - A lists agent files every new to-do (from the app, the web page or a voice note) into the right list,
     fills its columns, and reviews the lists every few hours: duplicates, stale items, misfiled items,
     new lists and better columns. Small fixes apply straight away; the rest wait as suggestions.
   Additive: the todos table and /api/todos are unchanged. Route it next to todoRoutes, behind the sign-in:
     {const lr=await listRoutes(r,env,u);if(lr)return lr;}
   Uses env.ANTHROPIC_API_KEY (Claude) when set, else Workers AI (env.AI). */

const LIST_PRESETS=[
  {name:'To-do',cat:'general',color:'#efede8',kind:'checklist',purpose:'Everyday tasks that fit no other list.',columns:[]},
  {name:'Shopping',cat:'shopping',color:'#3fb950',kind:'table',purpose:'Things to buy: food, household and anything else.',
    columns:[{key:'qty',label:'Qty',type:'text'},{key:'shop',label:'Shop',type:'text'}]},
  {name:'Work',cat:'work',color:'#e3b341',kind:'table',purpose:'Tasks for your job: shifts, colleagues, admin.',
    columns:[{key:'status',label:'Status',type:'select',options:['To do','Doing','Waiting','Done']},{key:'who',label:'Who',type:'text'}]},
  {name:'Errands',cat:'town',color:'#58a6ff',kind:'checklist',purpose:'Things to do when out and about: collect, drop off, post, book in person.',
    columns:[{key:'place',label:'Where',type:'text'}]},
  {name:'Website projects',cat:null,color:'#bc8cff',kind:'table',purpose:'Tasks and fixes for the websites you run or are building.',
    columns:[{key:'project',label:'Site',type:'text'},{key:'status',label:'Status',type:'select',options:['To do','Doing','Blocked','Done']},{key:'link',label:'Link',type:'url'}]},
  {name:'App ideas',cat:null,color:'#ff7eb6',kind:'table',purpose:'Ideas for apps, features and gadgets worth building.',
    columns:[{key:'why',label:'Why it matters',type:'text'},{key:'stage',label:'Stage',type:'select',options:['Idea','Exploring','Building','Parked']},{key:'next',label:'Next step',type:'text'}]},
  {name:'Home',cat:null,color:'#ffa657',kind:'checklist',purpose:'House, garden, car, money and family jobs.',columns:[]}];
const COL_TYPES=['text','date','select','url','number'];

async function listTables(env){
  const db=env.DB;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS todos(id INTEGER PRIMARY KEY AUTOINCREMENT,text TEXT NOT NULL,cat TEXT,place TEXT,ctx TEXT,due TEXT,state TEXT DEFAULT \'open\',created TEXT,updated TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS todo_lists(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,color TEXT,sort INTEGER DEFAULT 0,cat TEXT UNIQUE,created TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS todo_list_items(todo_id INTEGER PRIMARY KEY,list_id INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS todo_agent(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT,payload TEXT,reason TEXT,state TEXT DEFAULT \'pending\',created TEXT,updated TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS todo_agent_meta(name TEXT PRIMARY KEY,value TEXT)')]);
  // Columns added after the first version: ignore "duplicate column" errors
  for(const q of ["ALTER TABLE todo_lists ADD COLUMN kind TEXT DEFAULT 'checklist'","ALTER TABLE todo_lists ADD COLUMN columns TEXT","ALTER TABLE todo_lists ADD COLUMN purpose TEXT",
    "ALTER TABLE todo_list_items ADD COLUMN fields TEXT","ALTER TABLE todo_list_items ADD COLUMN filed_by TEXT"]){try{await db.prepare(q).run();}catch(e){}}
  if(await meta(env,'presets')!=='2'){
    const now=new Date().toISOString();
    const have=(await db.prepare('SELECT id,name,cat FROM todo_lists').all()).results||[];
    let sort=0;
    for(const p of LIST_PRESETS){
      const ex=p.cat?have.find(l=>l.cat===p.cat):have.find(l=>l.name.toLowerCase()===p.name.toLowerCase());
      if(ex){const name=['General','Town'].includes(ex.name)?p.name:ex.name;
        // a list from the first version has no purpose yet: give it the preset's shape
        await db.prepare('UPDATE todo_lists SET name=?,kind=CASE WHEN purpose IS NULL THEN ? ELSE kind END,columns=CASE WHEN purpose IS NULL THEN ? ELSE columns END,purpose=COALESCE(purpose,?),sort=? WHERE id=?')
          .bind(name,p.kind,JSON.stringify(p.columns),p.purpose,sort,ex.id).run();}
      else await db.prepare('INSERT INTO todo_lists(name,cat,color,kind,columns,purpose,sort,created) VALUES(?,?,?,?,?,?,?,?)')
        .bind(p.name,p.cat,p.color,p.kind,JSON.stringify(p.columns),p.purpose,sort,now).run();
      sort++;}
    await setMeta(env,'presets','2');
  }
}
async function meta(env,k){const r=await env.DB.prepare('SELECT value FROM todo_agent_meta WHERE name=?').bind(k).first();return r?r.value:null;}
async function setMeta(env,k,v){await env.DB.prepare('INSERT INTO todo_agent_meta(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').bind(k,String(v)).run();}
const jparse=(s,d)=>{try{const v=JSON.parse(s);return v==null?d:v;}catch{return d;}};
function cleanColumns(c){if(!Array.isArray(c))return [];const seen=new Set();
  return c.slice(0,8).map(x=>{const label=String((x&&x.label)||'').trim().slice(0,30);let key=String((x&&x.key)||label).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,20);
    const type=COL_TYPES.includes(x&&x.type)?x.type:'text';const o={key,label,type};
    if(type==='select')o.options=(Array.isArray(x.options)?x.options:[]).map(v=>String(v).trim().slice(0,24)).filter(Boolean).slice(0,8);return o;})
    .filter(x=>x.key&&x.label&&x.key!=='text'&&x.key!=='due'&&!seen.has(x.key)&&seen.add(x.key));}
function cleanFields(f,cols){const o={};if(!f||typeof f!=='object')return o;
  for(const c of cols){const v=f[c.key];if(v==null||v==='')continue;let s=String(v).trim().slice(0,200);
    if(c.type==='select'&&c.options&&c.options.length&&!c.options.includes(s))continue;if(c.type==='url'&&!/^https?:\/\//.test(s))continue;o[c.key]=s;}return o;}

async function snapshot(env){
  const db=env.DB;
  const lists=((await db.prepare('SELECT id,name,color,sort,cat,kind,columns,purpose FROM todo_lists ORDER BY sort,id').all()).results||[])
    .map(l=>({...l,kind:l.kind||'checklist',columns:cleanColumns(jparse(l.columns,[])),purpose:l.purpose||''}));
  const since=new Date(Date.now()-3*864e5).toISOString();
  const rows=(await db.prepare("SELECT t.id,t.text,t.cat,t.place,t.ctx,t.due,t.state,t.created,t.updated,m.list_id,m.fields,m.filed_by FROM todos t LEFT JOIN todo_list_items m ON m.todo_id=t.id WHERE t.state='open' OR (t.state='done' AND t.updated>?) ORDER BY t.id DESC LIMIT 600").bind(since).all()).results||[];
  const byCat={};for(const l of lists)if(l.cat)byCat[l.cat]=l.id;const ids=new Set(lists.map(l=>l.id));
  const todos=rows.map(t=>({id:t.id,text:t.text,cat:t.cat,due:t.due||'',state:t.state,created:t.created,updated:t.updated,
    list:(t.list_id&&ids.has(t.list_id))?t.list_id:(byCat[t.cat]||byCat.general||lists[0]&&lists[0].id),
    fields:jparse(t.fields,{}),filed:!!t.list_id,by:t.filed_by||''}));
  return {lists,todos};
}

/* ---------- the model ---------- */
async function aiJSON(env,system,user,schema){
  if(env.ANTHROPIC_API_KEY){
    try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','anthropic-beta':'server-side-fallback-2026-07-01','content-type':'application/json'},
        body:JSON.stringify({model:env.LISTS_CLAUDE_MODEL||'claude-opus-5-5',max_tokens:16000,system,fallbacks:'default',
          output_config:{effort:'low',format:{type:'json_schema',schema}},messages:[{role:'user',content:user}]})});
      const j=await r.json();
      if(r.ok&&j.stop_reason!=='refusal'){const t=(j.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');return {data:JSON.parse(t),engine:'claude'};}
      console.error('Lists agent: Claude',r.status,j.stop_reason||'',JSON.stringify(j.error||'').slice(0,200));
    }catch(e){console.error('Lists agent: Claude failed',String(e));}
  }
  if(!env.AI)return null;
  try{const o=await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast',{messages:[{role:'system',content:system+' Reply with JSON only.'},{role:'user',content:user}],
      response_format:{type:'json_schema',json_schema:schema},max_tokens:2500});
    const x=o&&o.response;return {data:typeof x==='string'?JSON.parse(x):x,engine:'workers-ai'};}
  catch(e){console.error('Lists agent: Workers AI failed',String(e));return null;}
}
const AGENT_SYSTEM=`You look after one person's to-do lists in their TraceyTech app. Each list has a purpose and, for spreadsheet lists, columns. UK English, dates as YYYY-MM-DD or YYYY-MM-DDTHH:MM, today is TODAY.
Be conservative: only suggest a change that clearly makes the lists more useful. Never invent tasks. Keep the person's own wording.`;
const listBrief=lists=>lists.map(l=>`#${l.id} ${l.name} (${l.kind}) - ${l.purpose}`+(l.columns.length?` Columns: ${l.columns.map(c=>c.key+(c.type==='select'?'['+c.options.join('|')+']':'')+':'+c.label).join(', ')}`:'')).join('\n');
const FILE_SCHEMA={type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'object',additionalProperties:false,
  required:['id','list','fields'],properties:{id:{type:'integer'},list:{type:'integer'},fields:{type:'object',additionalProperties:{type:'string'}},due:{type:'string'}}}}}};

/* Files to-dos that have no list yet (new ones from the web page, voice notes, or "auto" adds). */
async function fileItems(env,snap,only){
  const todo=snap.todos.filter(t=>t.state==='open'&&!t.filed&&(!only||only.includes(t.id))).slice(0,30);
  if(!todo.length)return {filed:[]};
  const today=new Date().toISOString().slice(0,10);
  const user=`Lists:\n${listBrief(snap.lists)}\n\nFile each to-do into the best list. Fill the list's columns only where the to-do says so (e.g. Qty "2", Shop "Tesco"). Give due only if the to-do names a date or time.\nTo-dos:\n`+todo.map(t=>`${t.id}: ${t.text}${t.due?' (due '+t.due+')':''}`).join('\n');
  const out=await aiJSON(env,AGENT_SYSTEM.replace('TODAY',today),user,FILE_SCHEMA);
  const byId=new Map(snap.lists.map(l=>[l.id,l]));const filed=[];
  for(const it of (out&&out.data&&out.data.items)||[]){const t=todo.find(x=>x.id===it.id);const l=byId.get(Number(it.list));if(!t||!l)continue;
    await putItem(env,t.id,l,cleanFields(it.fields,l.columns),'agent');
    if(it.due&&!t.due&&/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(it.due))await env.DB.prepare('UPDATE todos SET due=? WHERE id=?').bind(it.due,t.id).run();
    filed.push({id:t.id,list:l.id,listName:l.name});}
  // anything the model skipped: file where its cat says, so it is not sent again
  for(const t of todo)if(!filed.some(f=>f.id===t.id)){const l=byId.get(t.list);if(l)await putItem(env,t.id,l,{},'default');}
  return {filed,engine:out&&out.engine};
}
async function putItem(env,todoId,l,fields,by){
  const db=env.DB,now=new Date().toISOString();
  await db.prepare('INSERT INTO todo_list_items(todo_id,list_id,fields,filed_by) VALUES(?,?,?,?) ON CONFLICT(todo_id) DO UPDATE SET list_id=excluded.list_id,fields=excluded.fields,filed_by=excluded.filed_by')
    .bind(todoId,l.id,JSON.stringify(fields||{}),by).run();
  if(l.cat)await db.prepare('UPDATE todos SET cat=?,updated=? WHERE id=?').bind(l.cat,now,todoId).run();
}

const REVIEW_SCHEMA={type:'object',additionalProperties:false,required:['suggestions'],properties:{suggestions:{type:'array',items:{type:'object',additionalProperties:false,
  required:['kind','reason'],properties:{
    kind:{type:'string',enum:['move','merge','archive','update','new_list','columns']},
    reason:{type:'string'},todo:{type:'integer'},todos:{type:'array',items:{type:'integer'}},list:{type:'integer'},
    text:{type:'string'},due:{type:'string'},fields:{type:'object',additionalProperties:{type:'string'}},
    name:{type:'string'},purpose:{type:'string'},listKind:{type:'string',enum:['checklist','table']},
    columns:{type:'array',items:{type:'object',additionalProperties:false,required:['key','label','type'],properties:{key:{type:'string'},label:{type:'string'},type:{type:'string',enum:COL_TYPES},options:{type:'array',items:{type:'string'}}}}}}}}}};

/* Reviews every list and stores suggestions. "update" (filling columns) applies straight away;
   the rest wait for the person unless they turned on "Let the agent tidy without asking". */
async function review(env,snap){
  const today=new Date().toISOString().slice(0,10),now=Date.now();
  const open=snap.todos.filter(t=>t.state==='open').slice(0,250);
  if(!open.length)return {added:0};
  const age=t=>Math.round((now-Date.parse(t.created||t.updated||new Date().toISOString()))/864e5)||0;
  const user=`Lists:\n${listBrief(snap.lists)}\n\nOpen to-dos (id | list | text | due | columns | age in days):\n`+
    open.map(t=>`${t.id} | #${t.list} | ${t.text} | ${t.due||'-'} | ${JSON.stringify(t.fields)} | ${age(t)}`).join('\n')+
    `\n\nSuggest up to 10 changes, most useful first:
- move: a to-do that sits in the wrong list (todo, list).
- merge: two or more to-dos that are the same thing (todos, text = the merged wording).
- archive: a to-do that is clearly done, past its time or no longer relevant (todo). Only when the text or dates make this obvious, or it is over 60 days old with no due date.
- update: fill empty columns or a due date the text already states (todo, fields, due).
- new_list: five or more to-dos share a theme no list covers (name, purpose, listKind, columns, todos).
- columns: a spreadsheet list whose items keep mentioning a detail that deserves a column, or a column nobody uses (list, columns = the full new set).
Give a short plain reason for each. An empty list is a fine answer.`;
  const out=await aiJSON(env,AGENT_SYSTEM.replace('TODAY',today),user,REVIEW_SCHEMA);
  if(!out||!out.data)return {added:0,error:'The lists agent could not run.'};
  const pend=((await env.DB.prepare("SELECT payload FROM todo_agent WHERE state IN ('pending','dismissed','applied')").all()).results||[]).map(r=>r.payload);
  const isT=id=>open.some(t=>t.id===Number(id)),isL=id=>snap.lists.some(l=>l.id===Number(id));
  const valid=s=>({move:()=>isT(s.todo)&&isL(s.list)&&open.find(t=>t.id===s.todo).list!==s.list,archive:()=>isT(s.todo),update:()=>isT(s.todo),
    merge:()=>Array.isArray(s.todos)&&s.todos.filter(isT).length>1,new_list:()=>!!String(s.name||'').trim()&&!snap.lists.some(l=>l.name.toLowerCase()===String(s.name).trim().toLowerCase()),
    columns:()=>isL(s.list)&&Array.isArray(s.columns)&&s.columns.length>0}[s.kind]||(()=>false))();
  const auto=(await meta(env,'auto'))==='1';let added=0,applied=0;
  for(const s of (out.data.suggestions||[]).slice(0,10)){
    if(!valid(s))continue;const p=JSON.stringify({...s,reason:undefined});if(pend.includes(p))continue;
    const ts=new Date().toISOString();
    const x=await env.DB.prepare('INSERT INTO todo_agent(kind,payload,reason,state,created,updated) VALUES(?,?,?,?,?,?)').bind(s.kind,p,String(s.reason||'').slice(0,300),'pending',ts,ts).run();
    const id=x.meta&&x.meta.last_row_id;added++;
    if(s.kind==='update'||auto){const r=await applySuggestion(env,id);if(r.ok)applied++;}
  }
  return {added,applied,engine:out.engine};
}

async function applySuggestion(env,id){
  const db=env.DB,row=await db.prepare('SELECT * FROM todo_agent WHERE id=?').bind(id).first();
  if(!row||row.state!=='pending')return {ok:false,error:'That suggestion is no longer open.'};
  const s=jparse(row.payload,{}),snap=await snapshot(env),now=new Date().toISOString();
  const L=id=>snap.lists.find(l=>l.id===Number(id)),T=id=>snap.todos.find(t=>t.id===Number(id)&&t.state==='open');
  const done=async()=>{await db.prepare("UPDATE todo_agent SET state='applied',updated=? WHERE id=?").bind(now,id).run();return {ok:true};};
  const gone=async()=>{await db.prepare("UPDATE todo_agent SET state='stale',updated=? WHERE id=?").bind(now,id).run();return {ok:false,error:'Things changed since the agent looked, so this was skipped.'};};
  if(s.kind==='move'){const t=T(s.todo),l=L(s.list);if(!t||!l)return gone();await putItem(env,t.id,l,cleanFields(t.fields,l.columns),'agent');return done();}
  if(s.kind==='archive'){const t=T(s.todo);if(!t)return gone();await db.prepare("UPDATE todos SET state='ignored',updated=? WHERE id=?").bind(now,t.id).run();return done();}
  if(s.kind==='update'){const t=T(s.todo);if(!t)return gone();const l=L(t.list);
    await putItem(env,t.id,l,{...t.fields,...cleanFields(s.fields,l.columns)},t.by||'agent');
    if(s.due&&/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s.due))await db.prepare('UPDATE todos SET due=?,updated=? WHERE id=?').bind(s.due,now,t.id).run();return done();}
  if(s.kind==='merge'){const ts=(s.todos||[]).map(T).filter(Boolean);if(ts.length<2)return gone();const keep=ts[0];
    const text=String(s.text||keep.text).trim().slice(0,300);
    await db.prepare('UPDATE todos SET text=?,updated=? WHERE id=?').bind(text.length>1?text:keep.text,now,keep.id).run();
    for(const t of ts.slice(1))await db.prepare("UPDATE todos SET state='ignored',updated=? WHERE id=?").bind(now,t.id).run();return done();}
  if(s.kind==='new_list'){const name=String(s.name||'').trim().slice(0,40);if(!name)return gone();
    if(snap.lists.length>=50)return {ok:false,error:'That is a lot of lists. Delete one first.'};
    const cols=cleanColumns(s.columns),mx=await db.prepare('SELECT COALESCE(MAX(sort),0)+1 AS s FROM todo_lists').first();
    const x=await db.prepare('INSERT INTO todo_lists(name,color,kind,columns,purpose,sort,created) VALUES(?,?,?,?,?,?,?)')
      .bind(name,'#79c0ff',s.listKind==='table'?'table':'checklist',JSON.stringify(cols),String(s.purpose||'').slice(0,200),mx.s,now).run();
    const l={id:x.meta.last_row_id,cat:null,columns:cols};for(const t of (s.todos||[]).map(T).filter(Boolean))await putItem(env,t.id,l,{},'agent');return done();}
  if(s.kind==='columns'){const l=L(s.list),cols=cleanColumns(s.columns);if(!l||!cols.length)return gone();
    await db.prepare("UPDATE todo_lists SET columns=?,kind='table' WHERE id=?").bind(JSON.stringify(cols),l.id).run();return done();}
  return gone();
}

/* A to-do that only names a list ("Shopping list", "shopping") is not a task: it made other screens
   say "Shopping 2" when the list was empty. Set such items aside (state 'ignored', so nothing is lost). */
async function clearPlaceholders(env){
  const snap=await snapshot(env),norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const names=new Set();for(const l of snap.lists){const n=norm(l.name);names.add(n);names.add(n+' list');names.add('my '+n+' list');names.add('the '+n+' list');}
  ['list','lists','to do','todo','to do list','todo list','shopping','shopping list','groceries','grocery list'].forEach(x=>names.add(x));
  const ids=snap.todos.filter(t=>t.state==='open'&&names.has(norm(t.text))).map(t=>t.id);
  if(ids.length){const now=new Date().toISOString();await env.DB.batch(ids.map(id=>env.DB.prepare("UPDATE todos SET state='ignored',updated=? WHERE id=?").bind(now,id)));}
  return ids;
}

async function listRoutes(r,env,u){
  if(u.pathname!=='/api/lists')return null;
  await listTables(env);
  const db=env.DB;
  if(r.method==='GET'){
    let snap=await snapshot(env);
    const sug=((await db.prepare("SELECT id,kind,payload,reason,created FROM todo_agent WHERE state='pending' ORDER BY id DESC LIMIT 40").all()).results||[])
      .map(x=>({id:x.id,kind:x.kind,reason:x.reason,created:x.created,...jparse(x.payload,{})}));
    if(await clearPlaceholders(env).then(x=>x.length))snap=await snapshot(env);
    return json({lists:snap.lists,todos:snap.todos.map(({created,by,...t})=>t),suggestions:sug,
      agent:{lastReview:await meta(env,'last_review'),engine:await meta(env,'engine'),auto:(await meta(env,'auto'))==='1',ai:!!(env.ANTHROPIC_API_KEY||env.AI)}});
  }
  if(r.method!=='POST')return json({error:'Not allowed'},405);
  if(!(r.headers.get('content-type')||'').includes('json'))return json({error:'Unsupported request'},415);
  if(!sameOrigin(r,u))return json({error:'Request origin could not be verified.'},403);
  let b;try{b=await r.json();}catch{return json({error:'Bad request'},400);}
  const now=new Date().toISOString(),op=String((b&&b.op)||'');
  const s=(v,n)=>String(v==null?'':v).trim().slice(0,n);
  const color=v=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v):null;
  const getList=async id=>{if(!Number.isInteger(id))return null;const l=await db.prepare('SELECT id,cat,columns,kind FROM todo_lists WHERE id=?').bind(id).first();return l?{...l,columns:cleanColumns(jparse(l.columns,[]))}:null;};
  const getTodo=async id=>Number.isInteger(id)?await db.prepare('SELECT t.id,m.list_id,m.fields FROM todos t LEFT JOIN todo_list_items m ON m.todo_id=t.id WHERE t.id=?').bind(id).first():null;

  if(op==='agent'){ // file new to-dos every time; review at most every 6 hours unless forced
    await clearPlaceholders(env);
    if(!env.ANTHROPIC_API_KEY&&!env.AI)return json({error:'No AI is set up on the Worker.'},503);
    const busy=await meta(env,'busy');if(busy&&Date.now()-Number(busy)<90000)return json({ok:true,busy:true});
    await setMeta(env,'busy',Date.now());
    try{let snap=await snapshot(env);const f=await fileItems(env,snap);let rv=null;
      const last=Date.parse(await meta(env,'last_review')||0)||0;
      if(b.force||Date.now()-last>6*36e5){snap=await snapshot(env);rv=await review(env,snap);await setMeta(env,'last_review',now);if(rv.engine)await setMeta(env,'engine',rv.engine);}
      return json({ok:true,filed:f.filed,review:rv});}
    finally{await setMeta(env,'busy','');}}
  if(op==='apply'){const ids=(Array.isArray(b.ids)?b.ids:[b.id]).map(Number).filter(Number.isInteger).slice(0,40);const res=[];
    for(const id of ids)res.push({id,...await applySuggestion(env,id)});return json({ok:true,results:res});}
  if(op==='dismiss'){const ids=(Array.isArray(b.ids)?b.ids:[b.id]).map(Number).filter(Number.isInteger).slice(0,40);
    if(ids.length)await db.batch(ids.map(id=>db.prepare("UPDATE todo_agent SET state='dismissed',updated=? WHERE id=? AND state='pending'").bind(now,id)));return json({ok:true});}
  if(op==='setting'){if(typeof b.auto==='boolean')await setMeta(env,'auto',b.auto?'1':'0');return json({ok:true});}

  if(op==='create'){const name=s(b.name,40);if(!name)return json({error:'Give the list a name'},400);
    const c=await db.prepare('SELECT COUNT(*) AS n FROM todo_lists').first();if(c&&c.n>=50)return json({error:'That is a lot of lists. Delete one first.'},400);
    const mx=await db.prepare('SELECT COALESCE(MAX(sort),0)+1 AS s FROM todo_lists').first();
    const x=await db.prepare('INSERT INTO todo_lists(name,color,kind,columns,purpose,sort,created) VALUES(?,?,?,?,?,?,?)')
      .bind(name,color(b.color)||'#58a6ff',b.kind==='table'?'table':'checklist',JSON.stringify(cleanColumns(b.columns)),s(b.purpose,200),mx.s,now).run();
    return json({ok:true,id:x.meta&&x.meta.last_row_id});}
  if(op==='rename'||op==='list'){const l=await getList(Number(b.id));if(!l)return json({error:'List not found'},404);
    const name=b.name!=null?s(b.name,40):null;if(b.name!=null&&!name)return json({error:'Give the list a name'},400);
    await db.prepare('UPDATE todo_lists SET name=COALESCE(?,name),color=COALESCE(?,color),purpose=COALESCE(?,purpose),kind=COALESCE(?,kind),columns=COALESCE(?,columns) WHERE id=?')
      .bind(name,color(b.color),b.purpose!=null?s(b.purpose,200):null,['table','checklist'].includes(b.kind)?b.kind:null,Array.isArray(b.columns)?JSON.stringify(cleanColumns(b.columns)):null,l.id).run();
    return json({ok:true});}
  if(op==='delete'){const l=await getList(Number(b.id));if(!l)return json({error:'List not found'},404);if(l.cat)return json({error:'The built-in lists cannot be deleted.'},400);
    const gen=await db.prepare("SELECT id FROM todo_lists WHERE cat='general'").first();
    await db.batch([gen?db.prepare('UPDATE todo_list_items SET list_id=?,fields=NULL WHERE list_id=?').bind(gen.id,l.id):db.prepare('DELETE FROM todo_list_items WHERE list_id=?').bind(l.id),
      db.prepare('DELETE FROM todo_lists WHERE id=?').bind(l.id)]);return json({ok:true});}
  if(op==='reorder'){const ids=Array.isArray(b.ids)?b.ids.map(Number).filter(Number.isInteger).slice(0,50):[];
    if(ids.length)await db.batch(ids.map((id,i)=>db.prepare('UPDATE todo_lists SET sort=? WHERE id=?').bind(i,id)));return json({ok:true});}
  if(op==='add'){const text=s(b.text,300);if(text.length<2)return json({error:'Write the task first'},400);
    const auto=b.list==='auto';const l=auto?null:await getList(Number(b.list));if(!auto&&!l)return json({error:'List not found'},404);
    const x=await db.prepare('INSERT INTO todos(text,cat,place,ctx,due,state,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(text,(l&&l.cat)||'general','','',s(b.due,20),'open',now,now).run();
    const id=x.meta&&x.meta.last_row_id;
    if(!auto){await putItem(env,id,l,cleanFields(b.fields,l.columns),'you');return json({ok:true,id,list:l.id});}
    const f=(env.ANTHROPIC_API_KEY||env.AI)?await fileItems(env,await snapshot(env),[id]):{filed:[]};const hit=f.filed.find(z=>z.id===id);
    return json({ok:true,id,list:hit?hit.list:null,listName:hit?hit.listName:null});}
  const t=await getTodo(Number(b.todo));if(!t)return json({error:'To-do not found'},404);
  if(op==='move'){const l=await getList(Number(b.list));if(!l)return json({error:'List not found'},404);
    await putItem(env,t.id,l,cleanFields(jparse(t.fields,{}),l.columns),'you');return json({ok:true});}
  if(op==='edit'){const text=b.text!=null?s(b.text,300):null;if(text!=null&&text.length<2)return json({error:'Write the task first'},400);
    await db.prepare('UPDATE todos SET text=COALESCE(?,text),due=COALESCE(?,due),updated=? WHERE id=?').bind(text,b.due!=null?s(b.due,20):null,now,t.id).run();
    if(b.fields&&typeof b.fields==='object'){const snap=await snapshot(env),cur=snap.todos.find(x=>x.id===t.id),l=snap.lists.find(x=>x.id===(cur&&cur.list));
      if(l){const m={...jparse(t.fields,{}),...cleanFields(b.fields,l.columns)};for(const k in b.fields)if(b.fields[k]==='')delete m[k];await putItem(env,t.id,l,m,'you');}}
    return json({ok:true});}
  if(op==='state'){const st=String(b.state||'');if(!['open','done','ignored'].includes(st))return json({error:'Bad request'},400);
    await db.prepare('UPDATE todos SET state=?,updated=? WHERE id=?').bind(st,now,t.id).run();return json({ok:true});}
  return json({error:'Bad request'},400);
}
