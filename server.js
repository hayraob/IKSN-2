'use strict';
const express=require('express');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const app=express();
const PORT=Number(process.env.PORT||8080);
const HOST=process.env.HOST||'0.0.0.0';
const DATA_DIR=path.resolve(process.env.DATA_DIR||'./data');
const DB_FILE=path.join(DATA_DIR,'database.json');
fs.mkdirSync(DATA_DIR,{recursive:true});

function loadDB(){try{const d=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));return {requests:Array.isArray(d.requests)?d.requests:[],personnel:Array.isArray(d.personnel)?d.personnel:[],audit:Array.isArray(d.audit)?d.audit:[],locations:d.locations&&typeof d.locations==='object'?d.locations:{},sessions:d.sessions&&typeof d.sessions==='object'?d.sessions:{}}}catch(_){return {requests:[],personnel:[],audit:[],locations:{},sessions:{}}}}
let db=loadDB();
function saveDB(){const tmp=DB_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,DB_FILE)}
function now(){return new Date().toISOString()}
function rid(prefix){return prefix+'-'+crypto.randomBytes(5).toString('hex').toUpperCase()}
const PEPPER=String(process.env.PASSWORD_PEPPER||'CHANGE_ME_ON_RAILWAY');
function hash(v){return crypto.scryptSync(String(v),PEPPER,32).toString('hex')}
function sameHash(a,b){try{return crypto.timingSafeEqual(Buffer.from(a||'','hex'),Buffer.from(b||'','hex'))}catch(_){return false}}
function code6(){return String(crypto.randomInt(100000,1000000))}
function makeSerial(){return 'IKSN-SN-'+crypto.randomBytes(2).toString('hex').toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase()}
function makePassword(){return 'IKSN#'+crypto.randomBytes(6).toString('base64url')}
function publicRequest(r,includeCreds=false){const c={...r};delete c.passwordHash;if(!includeCreds){delete c.otp;delete c.serial;delete c.loginPassword}return c}
function publicPersonnel(p){const c={...p};delete c.passwordHash;return c}
function cookieConfig(maxAge){return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge}}
function sessionFrom(req){const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('iksn_session='));const token=raw?.slice('iksn_session='.length);const s=token&&db.sessions[token];if(!s)return null;if(s.expiresAt<Date.now()){delete db.sessions[token];saveDB();return null}return {token,s}}
function issueSession(type,user){const token=crypto.randomBytes(32).toString('base64url');const expiresAt=Date.now()+(type==='admin'?10:30)*60*1000;db.sessions[token]={type,user,expiresAt,issuedAt:Date.now()};saveDB();return {token,expiresAt}}
function requireAuth(type){return (req,res,next)=>{const cur=sessionFrom(req);if(!cur||cur.s.type!==type)return res.status(401).json({error:'Sesi tidak valid atau telah kedaluwarsa.'});req.session=cur.s;req.sessionToken=cur.token;next()}}
function audit(user,action,record,result='SUCCESS',device='WEB'){db.audit.unshift({timestamp:now(),user,action,record,result,device});db.audit=db.audit.slice(0,500);saveDB()}

const ADMIN_EMAIL=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const ADMIN_PASSWORD_HASH=String(process.env.ADMIN_PASSWORD_HASH||'');
const ADMIN_PASSWORD=String(process.env.ADMIN_PASSWORD||'');
const ADMIN_HASH=ADMIN_PASSWORD_HASH||hash(ADMIN_PASSWORD);
const adminChallenges=new Map();
const userChallenges=new Map();

app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'10mb'}));
app.use('/api/',rateLimit({windowMs:15*60*1000,max:180,standardHeaders:true,legacyHeaders:false}));
app.use(express.static(__dirname,{index:'index.html'}));

app.get('/api/health',(req,res)=>res.json({ok:true,service:'IKSN',time:now()}));
app.get('/api/bootstrap',(req,res)=>{
  const cur=sessionFrom(req);
  if(!cur)return res.json({ok:true,session:null,requests:db.requests.map(publicRequest),personnel:db.personnel.map(publicPersonnel)});
  cur.s.expiresAt=Date.now()+(cur.s.type==='admin'?10:30)*60*1000;db.sessions[cur.token]=cur.s;saveDB();
  const user=cur.s.type==='user'?db.personnel.find(p=>p.id===cur.s.user.id):null;
  res.json({ok:true,session:{type:cur.s.type,expiresAt:cur.s.expiresAt,user:cur.s.user},user:user&&publicPersonnel(user),requests:db.requests.map(publicRequest),personnel:db.personnel.map(publicPersonnel)});
});
app.post('/api/auth/session/refresh', (req,res)=>{const cur=sessionFrom(req);if(!cur)return res.status(401).json({error:'SESSION_EXPIRED'});cur.s.expiresAt=Date.now()+(cur.s.type==='admin'?10:30)*60*1000;db.sessions[cur.token]=cur.s;saveDB();res.json({ok:true,expiresAt:cur.s.expiresAt})});

app.post('/api/auth/admin/credentials',(req,res)=>{
 const email=String(req.body?.email||'').trim().toLowerCase();const password=String(req.body?.password||'');
 if(!ADMIN_EMAIL||email!==ADMIN_EMAIL||!sameHash(hash(password),ADMIN_HASH)){audit('ADMIN-GATE','ADMIN LOGIN FAILED','ADMIN-001','BLOCKED','PRIVILEGED LOGIN');return res.status(401).json({error:'Kredensial administrator tidak valid.'})}
 const otp=code6();adminChallenges.set(email,{otp,expiresAt:Date.now()+5*60*1000});
 if(String(process.env.DEV_OTP_LOG||'false').toLowerCase()==='true')console.log(`[IKSN DEV OTP] ${otp}`);
 audit('ADMIN-GATE','ADMIN CREDENTIAL VERIFIED','ADMIN-001','SUCCESS','PRIVILEGED LOGIN');
 res.json({ok:true,otpPreview:String(process.env.DEV_OTP_LOG||'false').toLowerCase()==='true'?otp:null});
});
app.post('/api/auth/admin/otp',(req,res)=>{
 const email=String(req.body?.email||'').trim().toLowerCase();const otp=String(req.body?.otp||'').trim();const c=adminChallenges.get(email);
 if(!c||Date.now()>c.expiresAt||c.otp!==otp){audit('ADMIN-GATE','ADMIN OTP FAILED','ADMIN-001','BLOCKED','PRIVILEGED LOGIN');return res.status(401).json({error:'OTP administrator tidak valid atau telah kedaluwarsa.'})}
 c.verified=true;adminChallenges.set(email,c);audit('ADMIN-GATE','ADMIN OTP VERIFIED','ADMIN-001','SUCCESS','PRIVILEGED LOGIN');res.json({ok:true});
});
app.post('/api/auth/admin/session',(req,res)=>{
 const c=adminChallenges.get(ADMIN_EMAIL);if(!c?.verified||Date.now()>c.expiresAt)return res.status(401).json({error:'Verifikasi OTP belum selesai.'});adminChallenges.delete(ADMIN_EMAIL);const s=issueSession('admin',{id:'ADMIN-001',email:ADMIN_EMAIL});res.cookie('iksn_session',s.token,cookieConfig(10*60*1000));res.json({ok:true,expiresAt:s.expiresAt});
});

app.post('/api/auth/user/identity',(req,res)=>{
 const email=String(req.body?.email||'').trim().toLowerCase();const otp=String(req.body?.otp||'').trim();const r=db.requests.find(x=>x.email===email&&x.status==='APPROVED'&&x.activeAccess!==false);
 if(!r||String(r.otp||'')!==otp)return res.status(401).json({error:'Email atau OTP tidak valid.'});const p=db.personnel.find(x=>x.id===r.personnelId);if(!p||p.status==='TERMINATED')return res.status(403).json({error:'Akun personel tidak aktif.'});const s=issueSession('user',{id:p.id,email:p.email});res.cookie('iksn_session',s.token,cookieConfig(30*60*1000));res.json({user:publicPersonnel(p),expiresAt:s.expiresAt});
});
app.post('/api/auth/user/credentials',(req,res)=>{
 const email=String(req.body?.email||'').trim().toLowerCase();const serial=String(req.body?.serial||'').trim();const password=String(req.body?.password||'');const r=db.requests.find(x=>x.email===email&&x.status==='APPROVED'&&x.activeAccess!==false);
 if(!r||r.serial!==serial||!sameHash(hash(password),r.passwordHash))return res.status(401).json({error:'Serial Number atau kata sandi tidak valid.'});const p=db.personnel.find(x=>x.id===r.personnelId);if(!p||p.status==='TERMINATED')return res.status(403).json({error:'Akun personel tidak aktif.'});const s=issueSession('user',{id:p.id,email:p.email});res.cookie('iksn_session',s.token,cookieConfig(30*60*1000));res.json({user:publicPersonnel(p),expiresAt:s.expiresAt});
});
app.post('/api/auth/logout',(req,res)=>{const cur=sessionFrom(req);if(cur){delete db.sessions[cur.token];saveDB();audit(cur.s.user?.id||'UNKNOWN','LOGOUT',cur.s.user?.id||'SESSION','SUCCESS',cur.s.type==='admin'?'ADMIN CONSOLE':'USER ACCESS')}res.clearCookie('iksn_session',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'});res.json({ok:true})});

app.post('/api/requests',(req,res)=>{
 const d=req.body||{};const required=['name','email','dob','phone','institution','division','position','clearance','scope','sponsor','department','photo'];for(const k of required)if(!String(d[k]||'').trim())return res.status(400).json({error:`Data wajib belum lengkap: ${k}`});
 const email=String(d.email).trim().toLowerCase();if(db.requests.some(r=>r.email===email&&r.status==='APPROVED'&&r.activeAccess!==false))return res.status(409).json({error:'Email sudah memiliki akun aktif.'});const r={...d,id:rid('REQ'),email,status:'PENDING',submitted:now(),activeAccess:false,biometric:true,photoConfirmed:true,verification:'COMPLETED'};delete r.otp;delete r.serial;delete r.loginPassword;delete r.passwordHash;db.requests.unshift(r);saveDB();audit('PUBLIC-REQUEST','ACCESS REQUEST SUBMITTED',r.id,'SUCCESS','WEB');res.status(201).json({request:publicRequest(r)});
});
app.get('/api/requests/status',(req,res)=>{const key=String(req.query.key||'').trim().toLowerCase();const r=db.requests.find(x=>String(x.email||'').toLowerCase()===key||String(x.id||'').toLowerCase()===key);if(!r)return res.status(404).json({error:'Pengajuan tidak ditemukan.'});res.json({request:publicRequest(r,true)});});

function adminRequestAction(action){return (req,res)=>{
 const r=db.requests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Pengajuan tidak ditemukan.'});
 if(action==='approve'){if(r.status!=='PENDING')return res.status(409).json({error:`Pengajuan sudah berstatus ${r.status}.`});const p={id:rid('USR'),name:r.name,email:r.email,division:r.division,position:r.position,region:r.city||r.province||'Indonesia',clearance:r.clearance,status:'Active',joined:new Date().toISOString().slice(0,10),lastActivity:'Baru disetujui',expertise:r.expertise||'Analisis',scope:r.scope||'Akses terbatas',category:'Approved Personnel',photo:r.photo,role:String(req.body?.role||'Analis')};const password=makePassword();r.status='APPROVED';r.activeAccess=true;r.role=p.role;r.device='VERIFIED';r.personnelId=p.id;r.otp=code6();r.serial=makeSerial();r.loginPassword=password;r.passwordHash=hash(password);r.approvedAt=now();db.personnel.push(p);saveDB();audit('ADMIN-001','ACCESS REQUEST APPROVED',r.id,'APPROVED','ADMIN CONSOLE');return res.json({request:publicRequest(r,true),personnel:publicPersonnel(p)});}
 if(action==='info'){r.status='INFO_REQUESTED';r.activeAccess=false;saveDB();audit('ADMIN-001','REQUEST ADDITIONAL INFORMATION',r.id,'NOTICE','ADMIN CONSOLE');return res.json({request:publicRequest(r)});}
 r.status='REJECTED';r.activeAccess=false;saveDB();audit('ADMIN-001','ACCESS REQUEST REJECTED',r.id,'REJECTED','ADMIN CONSOLE');return res.json({request:publicRequest(r)});
}}
app.post('/api/admin/requests/:id/approve',requireAuth('admin'),adminRequestAction('approve'));
app.post('/api/admin/requests/:id/info',requireAuth('admin'),adminRequestAction('info'));
app.post('/api/admin/requests/:id/reject',requireAuth('admin'),adminRequestAction('reject'));
app.post('/api/admin/personnel/:id/terminate',requireAuth('admin'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Personel tidak ditemukan.'});p.status='TERMINATED';p.terminationDate=now();const r=db.requests.find(x=>x.personnelId===p.id);if(r){r.status='TERMINATED';r.activeAccess=false}delete db.locations[p.id];saveDB();audit('ADMIN-001','PERSONNEL TERMINATED',p.id,'NOTICE','ADMIN CONSOLE');res.json({personnel:publicPersonnel(p),request:r?publicRequest(r):null})});
app.post('/api/admin/personnel/:id/delete',requireAuth('admin'),(req,res)=>{const id=req.params.id;const p=db.personnel.find(x=>x.id===id);if(!p)return res.status(404).json({error:'Personel tidak ditemukan.'});db.personnel=db.personnel.filter(x=>x.id!==id);db.requests=db.requests.filter(x=>x.personnelId!==id);delete db.locations[id];saveDB();audit('ADMIN-001','PERSONNEL DATA DELETED',id,'NOTICE','ADMIN CONSOLE');res.json({ok:true})});

app.post('/api/location',requireAuth('user'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.session.user.id);if(!p||p.status!=='Active')return res.status(403).json({error:'Akun tidak aktif.'});const {lat,lon,accuracy,battery,network,updatedAt}=req.body||{};if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon)))return res.status(400).json({error:'Koordinat tidak valid.'});db.locations[p.id]={userId:p.id,name:p.name,lat:Number(lat),lon:Number(lon),accuracy:Number(accuracy||0),battery:battery==null?null:Number(battery),network:String(network||'Unknown'),updatedAt:updatedAt||now(),role:p.role||'Analis'};saveDB();res.json({ok:true});});
app.delete('/api/location',requireAuth('user'),(req,res)=>{delete db.locations[req.session.user.id];saveDB();res.json({ok:true})});
app.get('/api/admin/locations',requireAuth('admin'),(req,res)=>res.json({locations:Object.values(db.locations)}));
app.get('/api/admin/audit',requireAuth('admin'),(req,res)=>res.json({audit:db.audit.slice(0,300)}));

app.use((req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,HOST,()=>console.log(`IKSN server listening on ${HOST}:${PORT}`));
