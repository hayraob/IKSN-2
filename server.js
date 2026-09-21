const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_PATH = path.join(ROOT, 'data', 'db.json');

const sessions = new Map(); // token -> { userId, expiresAt }
const sseClients = new Map(); // id -> { res, userId }

function dbRead(){ return JSON.parse(fs.readFileSync(DB_PATH,'utf8')); }
function dbWrite(db){ const tmp=DB_PATH+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(db,null,2)); fs.renameSync(tmp,DB_PATH); }
function makeId(prefix){ return prefix+'_'+Date.now().toString(36)+'_'+crypto.randomBytes(4).toString('hex'); }
function safeUser(u){ return {id:u.id,name:u.name,email:u.email,role:u.role,createdAt:u.createdAt,lastLoginAt:u.lastLoginAt,isOnline:!!u.isOnline}; }
function passwordHash(password,saltB64){ const salt=saltB64?Buffer.from(saltB64,'base64'):crypto.randomBytes(16); const key=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}); return {salt:salt.toString('base64'),key:key.toString('base64')}; }
function passwordCheck(password,stored){ try { const key=crypto.scryptSync(password,Buffer.from(stored.salt,'base64'),64,{N:16384,r:8,p:1}); const a=Buffer.from(stored.key,'base64'), b=Buffer.from(key); return a.length===b.length && crypto.timingSafeEqual(a,b);} catch{return false;} }
function newSession(userId){ const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{userId,expiresAt:Date.now()+7*24*3600*1000}); return token; }
function currentUser(req){ const h=req.headers.authorization||''; const token=h.startsWith('Bearer ')?h.slice(7):null; if(!token)return null; const s=sessions.get(token); if(!s || s.expiresAt<Date.now()){sessions.delete(token);return null;} const db=dbRead(); const u=db.users.find(x=>x.id===s.userId); return u||null; }
function currentUserFromToken(token){ const fake={headers:{authorization:`Bearer ${token||''}`}}; return currentUser(fake); }
function addActivity(user,type,meta={}){ const db=dbRead(); db.activity.unshift({id:makeId('act'),userId:user.id,userName:user.name,email:user.email,role:user.role,type,at:new Date().toISOString(),meta}); db.activity=db.activity.slice(0,500); dbWrite(db); broadcast('activity:update',{}); }
function broadcast(event,data,targetUserId=null){ const payload=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for(const [id,client] of sseClients){ if(targetUserId && client.userId!==targetUserId) continue; try{client.res.write(payload);}catch{ sseClients.delete(id);} } }
function json(res,status,data){ const body=JSON.stringify(data); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body)}); res.end(body); }
function text(res,status,body,contentType='text/plain; charset=utf-8'){ res.writeHead(status,{'Content-Type':contentType,'Content-Length':Buffer.byteLength(body)}); res.end(body); }
function parseCookies(header){ const out={}; for(const part of (header||'').split(';')){ const i=part.indexOf('='); if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim()); } return out; }
async function body(req){ return await new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>2e6){req.destroy();reject(new Error('Payload too large'));}});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject);}); }
function adminOnly(user,res){ if(!user||user.role!=='admin'){json(res,user?403:401,{error:user?'Admin only':'Unauthorized'});return false;} return true; }

function serveStatic(req,res){
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); if(pathname==='/')pathname='/index.html';
  const full=path.resolve(PUBLIC,'.'+pathname); if(!full.startsWith(PUBLIC))return text(res,403,'Forbidden');
  fs.readFile(full,(err,data)=>{ if(err)return text(res,404,'Not found'); const ext=path.extname(full).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}; res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);});
}

async function router(req,res){
  const u=new URL(req.url,'http://localhost'); const p=u.pathname; const method=req.method;
  if(p==='/api/health')return json(res,200,{ok:true,time:new Date().toISOString()});

  // SSE realtime channel. Token is accepted as query param because EventSource cannot set Authorization headers.
  if(p==='/api/events' && method==='GET'){
    const user=currentUserFromToken(u.searchParams.get('token')); if(!user)return text(res,401,'Unauthorized');
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}); res.write(': connected\n\n');
    const clientId=makeId('sse'); sseClients.set(clientId,{res,userId:user.id});
    const heartbeat=setInterval(()=>{try{res.write(': ping\n\n')}catch{}},25000);
    req.on('close',()=>{
      clearInterval(heartbeat);
      sseClients.delete(clientId);
      const stillConnected=[...sseClients.values()].some(c=>c.userId===user.id);
      if(!stillConnected){
        const db=dbRead();
        const found=db.users.find(x=>x.id===user.id);
        if(found && found.isOnline){ found.isOnline=false; dbWrite(db); broadcast('presence:update',{userId:user.id,isOnline:false}); }
      }
    }); return;
  }

  if(p==='/api/auth/register' && method==='POST'){
    try{const b=await body(req); if(!b.name||!b.email||!b.password||String(b.password).length<6)return json(res,400,{error:'Nama, email, dan password minimal 6 karakter wajib diisi.'}); const db=dbRead(); const email=String(b.email).trim().toLowerCase(); if(db.users.some(x=>x.email===email))return json(res,409,{error:'Email sudah terdaftar.'}); const user={id:makeId('usr'),name:String(b.name).trim().slice(0,80),email,passwordHash:passwordHash(String(b.password)),role:'customer',createdAt:new Date().toISOString(),lastLoginAt:null,isOnline:true}; db.users.push(user); dbWrite(db); const token=newSession(user.id); addActivity(user,'register'); broadcast('presence:update',{userId:user.id,isOnline:true}); return json(res,200,{token,user:safeUser(user)});}catch(e){return json(res,400,{error:e.message});}
  }
  if(p==='/api/auth/login' && method==='POST'){
    try{const b=await body(req); const db=dbRead(); const email=String(b.email||'').trim().toLowerCase(); const user=db.users.find(x=>x.email===email); if(!user||!passwordCheck(String(b.password||''),user.passwordHash))return json(res,401,{error:'Email atau password salah.'}); user.lastLoginAt=new Date().toISOString(); user.isOnline=true; dbWrite(db); const token=newSession(user.id); addActivity(user,'login'); broadcast('presence:update',{userId:user.id,isOnline:true}); return json(res,200,{token,user:safeUser(user)});}catch(e){return json(res,400,{error:e.message});}
  }
  const user=currentUser(req);
  if(p==='/api/auth/me' && method==='GET') return user?json(res,200,{user:safeUser(user)}):json(res,401,{error:'Unauthorized'});
  if(p==='/api/auth/logout' && method==='POST'){
    if(!user)return json(res,401,{error:'Unauthorized'}); const db=dbRead(); const found=db.users.find(x=>x.id===user.id); if(found)found.isOnline=false; dbWrite(db); addActivity(user,'logout'); broadcast('presence:update',{userId:user.id,isOnline:false}); const auth=req.headers.authorization||''; if(auth.startsWith('Bearer '))sessions.delete(auth.slice(7)); return json(res,200,{ok:true});
  }

  if(p==='/api/news' && method==='GET'){ const db=dbRead(); return json(res,200,{news:db.news.filter(n=>n.published).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))}); }
  if(p.startsWith('/api/news/')&&method==='GET'){const id=p.split('/').pop();const n=dbRead().news.find(x=>x.id===id&&x.published);return n?json(res,200,{news:n}):json(res,404,{error:'Berita tidak ditemukan.'});}

  if(p==='/api/admin/stats'&&method==='GET'){if(!adminOnly(user,res))return;const db=dbRead();return json(res,200,{totalUsers:db.users.filter(x=>x.role==='customer').length,onlineUsers:db.users.filter(x=>x.role==='customer'&&x.isOnline).length,totalNews:db.news.length,totalMessages:db.messages.length,registrations:db.activity.filter(x=>x.type==='register').length,loginsToday:db.activity.filter(x=>x.type==='login'&&x.at.slice(0,10)===new Date().toISOString().slice(0,10)).length});}
  if(p==='/api/admin/users'&&method==='GET'){if(!adminOnly(user,res))return;return json(res,200,{users:dbRead().users.map(safeUser).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});}
  if(p==='/api/admin/activity'&&method==='GET'){if(!adminOnly(user,res))return;return json(res,200,{activity:dbRead().activity});}
  if(p==='/api/admin/news'&&method==='GET'){if(!adminOnly(user,res))return;return json(res,200,{news:dbRead().news.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});}
  if(p==='/api/admin/news'&&method==='POST'){
    if(!adminOnly(user,res))return; try{const b=await body(req); if(!b.title||!b.content)return json(res,400,{error:'Judul dan isi berita wajib diisi.'}); const db=dbRead(); const item={id:makeId('news'),title:String(b.title).slice(0,120),slug:String(b.title).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''),excerpt:String(b.excerpt||'').slice(0,220),content:String(b.content),cover:String(b.cover||''),createdAt:new Date().toISOString(),published:!!b.published,author:user.name}; db.news.push(item);dbWrite(db);broadcast('news:update',{});return json(res,200,{news:item});}catch(e){return json(res,400,{error:e.message});}
  }
  if(p.startsWith('/api/admin/news/')&&method==='PUT'){
    if(!adminOnly(user,res))return; const id=p.split('/').pop(); try{const b=await body(req);const db=dbRead();const item=db.news.find(x=>x.id===id);if(!item)return json(res,404,{error:'Berita tidak ditemukan.'}); if(b.title!==undefined)item.title=String(b.title).slice(0,120);if(b.excerpt!==undefined)item.excerpt=String(b.excerpt).slice(0,220);if(b.content!==undefined)item.content=String(b.content);if(b.cover!==undefined)item.cover=String(b.cover);if(b.published!==undefined)item.published=!!b.published;dbWrite(db);broadcast('news:update',{});return json(res,200,{news:item});}catch(e){return json(res,400,{error:e.message});}
  }
  if(p.startsWith('/api/admin/news/')&&method==='DELETE'){
    if(!adminOnly(user,res))return;const id=p.split('/').pop();const db=dbRead();const before=db.news.length;db.news=db.news.filter(x=>x.id!==id);if(db.news.length===before)return json(res,404,{error:'Berita tidak ditemukan.'});dbWrite(db);broadcast('news:update',{});return json(res,200,{ok:true});
  }

  if(p==='/api/chat/conversations'&&method==='GET'){
    if(!user)return json(res,401,{error:'Unauthorized'}); const db=dbRead(); const map=new Map(); for(const m of db.messages){const otherId=m.fromId===user.id?m.toId:m.fromId;if(otherId===user.id)continue;const other=db.users.find(x=>x.id===otherId);if(!other)continue;const old=map.get(other.id);if(!old||new Date(m.at)>new Date(old.lastMessageAt))map.set(other.id,{user:safeUser(other),lastMessage:m.text,lastMessageAt:m.at});} return json(res,200,{conversations:[...map.values()].sort((a,b)=>new Date(b.lastMessageAt)-new Date(a.lastMessageAt))});
  }
  if(p.startsWith('/api/chat/')&&method==='GET'){
    if(!user)return json(res,401,{error:'Unauthorized'}); const otherId=p.split('/').pop(); const db=dbRead(); let other=db.users.find(x=>x.id===otherId); if(user.role==='admin'&&otherId==='me')other=user; if(!other)return json(res,404,{error:'User tidak ditemukan.'}); if(user.role!=='admin'&&other.id!==user.id&&other.id!=='usr_admin_001')return json(res,403,{error:'Forbidden'}); const messages=db.messages.filter(m=>(m.fromId===user.id&&m.toId===other.id)||(m.fromId===other.id&&m.toId===user.id)); return json(res,200,{user:safeUser(other),messages});
  }
  if(p==='/api/chat/send'&&method==='POST'){
    if(!user)return json(res,401,{error:'Unauthorized'}); try{const b=await body(req);const toId=String(b.toId||'');const textValue=String(b.text||'').trim().slice(0,2000);if(!toId||!textValue)return json(res,400,{error:'Pesan kosong.'});const db=dbRead();const target=db.users.find(x=>x.id===toId);if(!target)return json(res,404,{error:'Penerima tidak ditemukan.'});if(user.role!=='admin'&&target.role!=='admin')return json(res,403,{error:'Customer hanya dapat chat dengan admin.'});const msg={id:makeId('msg'),fromId:user.id,fromName:user.name,toId:target.id,toName:target.name,text:textValue,at:new Date().toISOString()};db.messages.push(msg);db.messages=db.messages.slice(-2000);dbWrite(db);broadcast('chat:message',msg,user.id);broadcast('chat:message',msg,target.id);return json(res,200,{message:msg});}catch(e){return json(res,400,{error:e.message});}
  }

  return serveStatic(req,res);
}

const server=http.createServer((req,res)=>router(req,res).catch(e=>{console.error(e);json(res,500,{error:'Server error'});}));

// Mark users offline when a server restarts; active sessions are in-memory.
try{const db=dbRead();for(const u of db.users)u.isOnline=false;dbWrite(db);}catch{}

server.listen(PORT,()=>console.log(`Novanox running on http://localhost:${PORT}`));
