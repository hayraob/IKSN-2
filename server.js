'use strict';
const express=require('express');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const app=express();
const PORT=Number(process.env.PORT||8158);
const HOST=process.env.HOST||'0.0.0.0';
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');
const DB_FILE=path.join(DATA_DIR,'database.json');
fs.mkdirSync(DATA_DIR,{recursive:true});

function load(){try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch(_){return {requests:[],personnel:[],audit:[],locations:{}}}}
let db=load();
function save(){const tmp=DB_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,DB_FILE)}
function now(){return new Date().toISOString()}
function id(prefix){return prefix+'-'+crypto.randomBytes(5).toString('hex').toUpperCase()}
function hash(s){return crypto.scryptSync(String(s),process.env.PASSWORD_PEPPER||'change-this-pepper',32).toString('hex')}
function safeEqualHash(a,b){try{return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))}catch(_){return false}}
function randomCode(){return String(crypto.randomInt(100000,1000000))}
function randomPassword(){return 'IKSN#'+crypto.randomBytes(6).toString('base64url')}
function randomSerial(){return 'IKSN-SN-'+crypto.randomBytes(2).toString('hex').toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase()}
function env(name, fallback=''){return String(process.env[name]??fallback).trim()}
const ADMIN_EMAIL=env('ADMIN_EMAIL','admin@example.com').toLowerCase();
const ADMIN_PASSWORD=env('ADMIN_PASSWORD','change-me-now');
const ADMIN_PASSWORD_HASH=env('ADMIN_PASSWORD_HASH')||hash(ADMIN_PASSWORD);
const DEV_OTP_LOG=env('DEV_OTP_LOG','true').toLowerCase()==='true';
const sessions=new Map();
const adminChallenges=new Map();
const userChallenges=new Map();

app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'8mb'}));
const limiter=rateLimit({windowMs:15*60*1000,max:180,standardHeaders:true,legacyHeaders:false});
app.use('/api/',limiter);
app.use(express.static(__dirname,{index:'index.html',extensions:['html']}));

function cookieOptions(maxAge){return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge}}
function issueSession(type,user){const token=crypto.randomBytes(32).toString('base64url');sessions.set(token,{type,user,expiresAt:Date.now()+(type==='admin'?10:30)*60*1000});return token}
function auth(type){return (req,res,next)=>{const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('iksn_session='))?.split('=')[1];const s=token&&sessions.get(token);if(!s||s.expiresAt<Date.now()||(type&&s.type!==type)){return res.status(401).json({error:'Sesi tidak valid atau telah kedaluwarsa.'})}req.session=s;req.sessionToken=token;next()}}
function audit(entry){db.audit.unshift({...entry,timestamp:entry.timestamp||now()});db.audit=db.audit.slice(0,500);save()}
function publicRequest(r){const copy={...r};delete copy.passwordHash;delete copy.otp;delete copy.serial;delete copy.loginPassword;return copy}
function credentialRequest(r){const copy=publicRequest(r);if(r.status==='APPROVED'){copy.otp=r.otp;copy.serial=r.serial;copy.loginPassword=r.loginPassword}return copy}
function publicPersonnel(p){const copy={...p};delete copy.passwordHash;return copy}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'IKSN API',time:now()}));
app.get('/api/bootstrap',(req,res)=>{
  const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('iksn_session='))?.split('=')[1];
  const s=token&&sessions.get(token);const user=s?.type==='user'?db.personnel.find(p=>p.id===s.user.id):null;
  res.json({ok:true,requests:db.requests.map(publicRequest),personnel:db.personnel.map(publicPersonnel),user:user&&publicPersonnel(user)});
});

app.post('/api/requests',(req,res)=>{
  const d=req.body||{};
  if(!d.name||!d.email||!d.dob||!d.phone||!d.institution||!d.division||!d.position||!d.clearance||!d.scope||!d.sponsor||!d.department||!d.photo){return res.status(400).json({error:'Data pengajuan belum lengkap.'})}
  const email=String(d.email).trim().toLowerCase();
  if(db.requests.some(r=>r.email===email&&['PENDING','APPROVED'].includes(r.status)&&r.activeAccess!==false))return res.status(409).json({error:'Sudah ada pengajuan/akun aktif untuk email tersebut.'});
  const r={...d,id:id('REQ'),email,status:'PENDING',submitted:now(),activeAccess:false,biometric:true,photoConfirmed:true,verification:'COMPLETED'};
  delete r.otp;delete r.serial;delete r.loginPassword;delete r.passwordHash;
  db.requests.unshift(r);save();audit({user:'PUBLIC-REQUEST',action:'ACCESS REQUEST SUBMITTED',record:r.id,result:'SUCCESS',device:'WEB'});
  res.status(201).json({request:publicRequest(r)});
});

app.get('/api/requests/status',(req,res)=>{
  const key=String(req.query.key||'').trim().toLowerCase();
  const r=db.requests.find(x=>String(x.email||'').toLowerCase()===key||String(x.id||'').toLowerCase()===key);
  if(!r)return res.status(404).json({error:'Pengajuan tidak ditemukan.'});
  res.json({request:credentialRequest(r)});
});

app.post('/api/auth/user/identity',(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  const otp=String(req.body?.otp||'').trim();
  const r=db.requests.find(x=>x.email===email&&x.status==='APPROVED'&&x.activeAccess!==false);
  if(!r||String(r.otp||'')!==otp)return res.status(401).json({error:'Email atau OTP tidak valid.'});
  const p=db.personnel.find(x=>x.id===r.personnelId);
  if(!p||p.status==='TERMINATED')return res.status(403).json({error:'Akun personel tidak aktif.'});
  const token=issueSession('user',{id:p.id,email:p.email});res.cookie('iksn_session',token,cookieOptions(30*60*1000));
  audit({user:p.id,action:'LOGIN IDENTITY VERIFIED',record:p.id,result:'SUCCESS',device:'USER ACCESS'});
  res.json({user:publicPersonnel(p)});
});

app.post('/api/auth/user/credentials',(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  const serial=String(req.body?.serial||'').trim();const password=String(req.body?.password||'');
  const r=db.requests.find(x=>x.email===email&&x.status==='APPROVED'&&x.activeAccess!==false);
  if(!r||r.serial!==serial||!safeEqualHash(r.passwordHash,hash(password)))return res.status(401).json({error:'Serial Number atau kata sandi tidak valid.'});
  const p=db.personnel.find(x=>x.id===r.personnelId);if(!p||p.status==='TERMINATED')return res.status(403).json({error:'Akun personel tidak aktif.'});
  const token=issueSession('user',{id:p.id,email:p.email});res.cookie('iksn_session',token,cookieOptions(30*60*1000));
  audit({user:p.id,action:'LOGIN CREDENTIAL VERIFIED',record:p.id,result:'SUCCESS',device:'USER ACCESS'});
  res.json({user:publicPersonnel(p)});
});

app.post('/api/auth/admin/credentials',(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();const password=String(req.body?.password||'');
  if(email!==ADMIN_EMAIL||!safeEqualHash(ADMIN_PASSWORD_HASH,hash(password)))return res.status(401).json({error:'Kredensial administrator tidak valid.'});
  const otp=randomCode();adminChallenges.set(email,{otp,expiresAt:Date.now()+5*60*1000,verified:false});
  if(DEV_OTP_LOG)console.log(`[IKSN DEV] Admin OTP for ${email}: ${otp}`);
  audit({user:'ADMIN-GATE',action:'ADMIN CREDENTIAL VERIFIED',record:'ADMIN-001',result:'SUCCESS',device:'PRIVILEGED LOGIN'});
  res.json({ok:true,message:'OTP diterbitkan. Hubungkan provider email/SMS untuk pengiriman nyata.'});
});

app.post('/api/auth/admin/otp',(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();const otp=String(req.body?.otp||'').trim();const c=adminChallenges.get(email);
  if(!c||c.expiresAt<Date.now()||c.otp!==otp)return res.status(401).json({error:'OTP administrator tidak valid atau telah kedaluwarsa.'});
  c.verified=true;audit({user:'ADMIN-GATE',action:'ADMIN OTP VERIFIED',record:'ADMIN-001',result:'SUCCESS',device:'PRIVILEGED LOGIN'});res.json({ok:true});
});
app.post('/api/auth/admin/session',(req,res)=>{
  const email=ADMIN_EMAIL;const c=adminChallenges.get(email);if(!c?.verified||c.expiresAt<Date.now())return res.status(401).json({error:'Selesaikan kredensial dan OTP administrator terlebih dahulu.'});
  const token=issueSession('admin',{id:'ADMIN-001',email});adminChallenges.delete(email);res.cookie('iksn_session',token,cookieOptions(10*60*1000));res.json({ok:true});
});

app.post('/api/admin/requests/:id/approve',auth('admin'),(req,res)=>{
  const r=db.requests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Pengajuan tidak ditemukan.'});if(r.status!=='PENDING')return res.status(409).json({error:`Pengajuan sudah berstatus ${r.status}.`});
  const role=String(req.body?.role||'Analis');const pid=id('USR');const loginPassword=randomPassword();
  const p={id:pid,name:r.name,email:r.email,division:r.division,position:r.position,region:r.city||r.province||'Indonesia',clearance:r.clearance,status:'Active',joined:new Date().toISOString().slice(0,10),lastActive:'Baru disetujui',expertise:r.expertise||'Analisis',scope:r.scope||'Akses terbatas',category:'Approved Personnel',photo:r.photo,role};
  r.status='APPROVED';r.activeAccess=true;r.role=role;r.device='VERIFIED';r.personnelId=pid;r.otp=randomCode();r.serial=randomSerial();r.loginPassword=loginPassword;r.passwordHash=hash(loginPassword);r.approvedAt=now();
  db.personnel.push(p);save();audit({user:'ADMIN-001',action:'ACCESS REQUEST REVIEW',record:r.id,result:'APPROVED',device:'ADMIN CONSOLE'});audit({user:'ADMIN-001',action:'PROFILE PHOTO REVIEW',record:pid,result:'SUCCESS',device:'ADMIN CONSOLE'});
  res.json({request:publicRequest(r),personnel:publicPersonnel(p)});
});
app.post('/api/admin/requests/:id/info',auth('admin'),(req,res)=>{const r=db.requests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Pengajuan tidak ditemukan.'});r.status='INFO_REQUESTED';save();audit({user:'ADMIN-001',action:'REQUEST ADDITIONAL INFORMATION',record:r.id,result:'NOTICE',device:'ADMIN CONSOLE'});res.json({request:publicRequest(r)})});
app.post('/api/admin/requests/:id/reject',auth('admin'),(req,res)=>{const r=db.requests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Pengajuan tidak ditemukan.'});r.status='REJECTED';r.activeAccess=false;save();audit({user:'ADMIN-001',action:'ACCESS REQUEST REVIEW',record:r.id,result:'REJECTED',device:'ADMIN CONSOLE'});res.json({request:publicRequest(r)})});

app.post('/api/admin/personnel/:id/terminate',auth('admin'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Personel tidak ditemukan.'});p.status='TERMINATED';p.terminationDate=new Date().toISOString().slice(0,10);const r=db.requests.find(x=>x.personnelId===p.id);if(r){r.activeAccess=false;r.status='TERMINATED'}delete db.locations[p.id];save();audit({user:'ADMIN-001',action:'PERSONNEL TERMINATED',record:p.id,result:'NOTICE',device:'ADMIN CONSOLE'});res.json({personnel:publicPersonnel(p),request:r?publicRequest(r):null})});
app.post('/api/admin/personnel/:id/delete',auth('admin'),(req,res)=>{const pid=req.params.id;const i=db.personnel.findIndex(x=>x.id===pid);if(i<0)return res.status(404).json({error:'Personel tidak ditemukan.'});const p=db.personnel[i];db.personnel.splice(i,1);db.requests=db.requests.filter(r=>r.personnelId!==pid);delete db.locations[pid];save();audit({user:'ADMIN-001',action:'PERSONNEL DATA DELETED',record:pid,result:'NOTICE',device:'ADMIN CONSOLE'});res.json({ok:true})});

app.post('/api/location',auth('user'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.session.user.id);if(!p||p.status!=='Active')return res.status(403).json({error:'Akun tidak aktif.'});const d=req.body||{};if(!Number.isFinite(Number(d.lat))||!Number.isFinite(Number(d.lon)))return res.status(400).json({error:'Koordinat tidak valid.'});db.locations[p.id]={userId:p.id,name:p.name,lat:Number(d.lat),lon:Number(d.lon),accuracy:Number(d.accuracy||0),updatedAt:d.updatedAt||now(),battery:d.battery,network:d.network,role:p.role};save();res.json({ok:true})});
app.get('/api/admin/locations',auth('admin'),(req,res)=>res.json({locations:Object.values(db.locations)}));
app.get('/api/admin/audit',auth('admin'),(req,res)=>res.json({audit:db.audit.slice(0,300)}));
app.post('/api/audit',(req,res)=>{const e=req.body||{};if(e&&e.action) audit({...e,user:String(e.user||'UNKNOWN')});res.json({ok:true})});
app.post('/api/auth/logout',(req,res)=>{const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('iksn_session='))?.split('=')[1];if(token)sessions.delete(token);res.clearCookie('iksn_session',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'});res.json({ok:true})});

app.use((req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,HOST,()=>console.log(`IKSN online server listening on http://${HOST}:${PORT}`));
