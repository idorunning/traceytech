/* Multiple to-do lists for TraceyTech (used by the Conductor IO Android app).
   Additive: the todos table and /api/todos are unchanged, so the web app keeps working.
   A to-do's list is its row in todo_list_items, or else the built-in list for its cat.
   Route it next to todoRoutes, behind the sign-in:
     {const lr=await listRoutes(r,env,u);if(lr)return lr;}                                   */
const LIST_DEFAULTS=[['General','general','#efede8'],['Shopping','shopping','#3fb950'],['Town','town','#58a6ff'],['Work','work','#e3b341']];
async function listTables(env){
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS todos(id INTEGER PRIMARY KEY AUTOINCREMENT,text TEXT NOT NULL,cat TEXT,place TEXT,ctx TEXT,due TEXT,state TEXT DEFAULT \'open\',created TEXT,updated TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS todo_lists(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,color TEXT,sort INTEGER DEFAULT 0,cat TEXT UNIQUE,created TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS todo_list_items(todo_id INTEGER PRIMARY KEY,list_id INTEGER NOT NULL)')]);
  const n=await env.DB.prepare('SELECT COUNT(*) AS n FROM todo_lists').first();
  if(!n||!n.n){const now=new Date().toISOString();
    await env.DB.batch(LIST_DEFAULTS.map((d,i)=>env.DB.prepare('INSERT OR IGNORE INTO todo_lists(name,cat,color,sort,created) VALUES(?,?,?,?,?)').bind(d[0],d[1],d[2],i,now)));}
}
async function listRoutes(r,env,u){
  if(u.pathname!=='/api/lists')return null;
  await listTables(env);
  const db=env.DB;
  if(r.method==='GET'){
    const lists=(await db.prepare('SELECT id,name,color,sort,cat FROM todo_lists ORDER BY sort,id').all()).results||[];
    const since=new Date(Date.now()-3*864e5).toISOString();
    const rows=(await db.prepare("SELECT t.id,t.text,t.cat,t.place,t.ctx,t.due,t.state,t.updated,m.list_id FROM todos t LEFT JOIN todo_list_items m ON m.todo_id=t.id WHERE t.state='open' OR (t.state='done' AND t.updated>?) ORDER BY t.id DESC LIMIT 500").bind(since).all()).results||[];
    const byCat={};for(const l of lists)if(l.cat)byCat[l.cat]=l.id;const ids=new Set(lists.map(l=>l.id));
    const todos=rows.map(t=>({id:t.id,text:t.text,cat:t.cat,place:t.place,ctx:t.ctx,due:t.due||'',state:t.state,updated:t.updated,
      list:(t.list_id&&ids.has(t.list_id))?t.list_id:(byCat[t.cat]||byCat.general)}));
    return json({lists,todos});
  }
  if(r.method!=='POST')return json({error:'Not allowed'},405);
  if(!(r.headers.get('content-type')||'').includes('json'))return json({error:'Unsupported request'},415);
  if(!sameOrigin(r,u))return json({error:'Request origin could not be verified.'},403);
  let b;try{b=await r.json();}catch{return json({error:'Bad request'},400);}
  const now=new Date().toISOString(),op=String((b&&b.op)||'');
  const s=(v,n)=>String(v==null?'':v).trim().slice(0,n);
  const color=v=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v):null;
  const list=async id=>Number.isInteger(id)?await db.prepare('SELECT id,cat FROM todo_lists WHERE id=?').bind(id).first():null;
  const todo=async id=>Number.isInteger(id)?await db.prepare('SELECT id FROM todos WHERE id=?').bind(id).first():null;
  if(op==='create'){const name=s(b.name,40);if(!name)return json({error:'Give the list a name'},400);
    const c=await db.prepare('SELECT COUNT(*) AS n FROM todo_lists').first();if(c&&c.n>=50)return json({error:'That is a lot of lists. Delete one first.'},400);
    const mx=await db.prepare('SELECT COALESCE(MAX(sort),0)+1 AS s FROM todo_lists').first();
    const x=await db.prepare('INSERT INTO todo_lists(name,color,sort,created) VALUES(?,?,?,?)').bind(name,color(b.color)||'#58a6ff',mx.s,now).run();
    return json({ok:true,id:x.meta&&x.meta.last_row_id});}
  if(op==='rename'){const l=await list(Number(b.id));if(!l)return json({error:'List not found'},404);const name=s(b.name,40);if(!name)return json({error:'Give the list a name'},400);
    await db.prepare('UPDATE todo_lists SET name=?,color=COALESCE(?,color) WHERE id=?').bind(name,color(b.color),l.id).run();return json({ok:true});}
  if(op==='delete'){const l=await list(Number(b.id));if(!l)return json({error:'List not found'},404);if(l.cat)return json({error:'The built-in lists cannot be deleted.'},400);
    await db.batch([db.prepare('DELETE FROM todo_list_items WHERE list_id=?').bind(l.id),db.prepare('DELETE FROM todo_lists WHERE id=?').bind(l.id)]);return json({ok:true});}
  if(op==='reorder'){const ids=Array.isArray(b.ids)?b.ids.map(Number).filter(Number.isInteger).slice(0,50):[];
    if(ids.length)await db.batch(ids.map((id,i)=>db.prepare('UPDATE todo_lists SET sort=? WHERE id=?').bind(i,id)));return json({ok:true});}
  if(op==='add'){const l=await list(Number(b.list));if(!l)return json({error:'List not found'},404);
    const text=s(b.text,300);if(text.length<2)return json({error:'Write the task first'},400);
    const x=await db.prepare('INSERT INTO todos(text,cat,place,ctx,due,state,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(text,l.cat||'general','','',s(b.due,20),'open',now,now).run();
    const id=x.meta&&x.meta.last_row_id;if(!l.cat&&id)await db.prepare('INSERT OR REPLACE INTO todo_list_items(todo_id,list_id) VALUES(?,?)').bind(id,l.id).run();
    return json({ok:true,id});}
  const t=await todo(Number(b.todo));if(!t)return json({error:'To-do not found'},404);
  if(op==='move'){const l=await list(Number(b.list));if(!l)return json({error:'List not found'},404);
    if(l.cat)await db.batch([db.prepare('DELETE FROM todo_list_items WHERE todo_id=?').bind(t.id),db.prepare('UPDATE todos SET cat=?,updated=? WHERE id=?').bind(l.cat,now,t.id)]);
    else await db.prepare('INSERT OR REPLACE INTO todo_list_items(todo_id,list_id) VALUES(?,?)').bind(t.id,l.id).run();
    return json({ok:true});}
  if(op==='edit'){const text=s(b.text,300);if(text.length<2)return json({error:'Write the task first'},400);
    await db.prepare('UPDATE todos SET text=?,due=?,updated=? WHERE id=?').bind(text,s(b.due,20),now,t.id).run();return json({ok:true});}
  if(op==='state'){const st=String(b.state||'');if(!['open','done','ignored'].includes(st))return json({error:'Bad request'},400);
    await db.prepare('UPDATE todos SET state=?,updated=? WHERE id=?').bind(st,now,t.id).run();return json({ok:true});}
  return json({error:'Bad request'},400);
}
