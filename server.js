'use strict';
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const DB_FILE = path.join(DATA_DIR, 'iksn-db.json');
const COOKIE = 'iksn_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const OTP_TTL_MS = 1000 * 60 * 5;
const isProd = process.env.NODE_ENV === 'production';

function ensureDir(){ fs.mkdirSync(DATA_DIR, {recursive:true}); }
function uid(prefix='ID'){ return prefix+'-'+crypto.randomBytes(7).toString('hex').toUpperCase(); }
function iso(){ return new Date().toISOString(); }
function hash(v){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function escapeNull(v){ return v==null ? '' : String(v); }
function safeJsonBodyLimit(){ return express.json({limit:'1mb', strict:true}); }
function readDb(){
  ensureDir();
  if(!fs.existsSync(DB_FILE)) return makeDb();
  try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'));}catch(e){console.error('DB read failed',e);return makeDb();}
}
function writeDb(db){
  ensureDir();
  const tmp=DB_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(db,null,2));
  fs.renameSync(tmp,DB_FILE);
}

const FIRST=['Arga','Nadira','Raka','Dimas','Alya','Faris','Mira','Rizky','Naila','Bima','Kirana','Tegar','Satrio','Rendra','Vania','Ilham','Adit','Naufal','Citra','Bagas','Keisha','Rafi','Anindya','Daffa','Ghani','Salsa','Rasya','Niken','Yudha','Aurelia','Fikri','Laras','Bram','Gita','Reza','Nara','Hana','Tasya','Rivan','Haydar'];
const LAST=['Pranata','Wicaksa','Adinata','Kusuma','Mahendra','Permata','Wiratama','Nusantara','Suryana','Cakrawala','Purnama','Laksana','Sasmita','Hardana','Prasetya','Yudhistira','Ramadhan','Aksara','Pamungkas','Santosa'];
const DIV=['Pusat Kajian Ketahanan','Analisis Strategis','Riset Infrastruktur','Metodologi Intelijen','Komunikasi Strategis','Kesiapsiagaan Krisis','Kajian Geopolitik','Arsip Historis'];
const ROLES=['Mata-mata','Penyerbu','Logistik','Analis','Observasi'];
const REGIONS=['Kawasan Arunika','Kawasan Samudra','Kawasan Utara Selatan','Kawasan Merapi','Kawasan Selat','Kawasan Cakrawala','Koridor Nusa','Zona Lembayung'];
const CATS=['Ketahanan Infrastruktur','Kesiapsiagaan Krisis','Metodologi Analisis','Geopolitik','Komunikasi Strategis','Resiliensi Maritim','Sejarah Strategis','Keamanan Humaniter'];
const LEVELS=['PUBLIC','RESTRICTED','CONFIDENTIAL','SECRET','TOP SECRET'];
const TOPICS=['Maritime Resilience Assessment','Urban Infrastructure Protection Study','Emergency Response Framework','Strategic Communication Research','Airspace Safety Simulation','Coastal Resilience Research','Critical Infrastructure Protection','Humanitarian Evacuation Planning','Strategic Decision-Making Review','Regional Resilience Review','Institutional Preparedness Study','Strategic Logistics Resilience','Historical Decision Review','Geopolitical Scenario Analysis'];
const ASSETS=['ARX-11 Sentinel','Vektor-7 Scout','Atlas Mobile Shield','Horizon Recon Platform','Aegis-4 Defense Node','Meridian Transport System','Orion Surveillance Array','Garuda-X Research Platform','Lumen Field Sensor','Nusantara Relay Unit','Sagara Support Node','Khatulistiwa Analysis Kit'];
const VEHICLES=['Meridian-12','Nusa Carrier','Sagara Utility','Arunika Field Van','Cakrawala Support','Lembayung Runner','Atlas Response','Horizon Utility','Nusantara Transport','Selat Command'];
const FACILITIES=['Pusat Riset Arunika','Kompleks Kajian Samudra','Laboratorium Ketahanan Kota','Arsip Historis Nusa','Pusat Analisis Cakrawala','Sentra Kesiapsiagaan Merapi','Fasilitas Resiliensi Selat','Pusat Simulasi Lembayung','Unit Kajian Nusa Utara','Pusat Observasi Nusantara'];
const ORGS=['Lembaga Kajian Arunika','Pusat Resiliensi Nusantara','Forum Riset Cakrawala','Institut Kajian Selat','Konsorsium Infrastruktur Nusa','Center of Strategic Methods','Lembaga Analisis Humaniter','Forum Geopolitik Lembayung'];
function pick(a,i){return a[(i*7+3)%a.length];}
function initials(name){return String(name).split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();}
function fakePhotoData(name, seed=1){
  const bg=['#2a2927','#3d3530','#2c3437','#3b302b','#32322f','#473c34'][seed%6];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250"><rect width="200" height="250" fill="${bg}"/><circle cx="100" cy="92" r="42" fill="#8b7767"/><path d="M52 228c6-48 27-69 48-69s42 21 48 69" fill="#202020"/><path d="M61 92c4-35 20-54 39-54 23 0 42 17 44 54-16-15-29-23-47-23-17 0-28 9-36 23Z" fill="#181818"/><text x="100" y="236" text-anchor="middle" font-family="Arial" font-size="17" fill="#e8e0d2" letter-spacing="2">${initials(name)}</text></svg>`;
  return 'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
}
function makeDb(){
  const personnel=[];
  for(let i=0;i<60;i++){
    let name=`${pick(FIRST,i)} ${pick(LAST,i+5)}`;
    let email=`${name.toLowerCase().replace(/[^a-z]+/g,'.').replace(/^\.|\.$/g,'')}@iksn.local`;
    let id=`USR-${String(480+i).padStart(5,'0')}`;
    personnel.push({id,name,codename:`${['KALPA','NARA','SENA','ARUNA','TALUS','RANA','LUMA','HAYDAR'][i%8]}-${String(i+1).padStart(2,'0')}`,email,phone:'',division:pick(DIV,i),position:['Peneliti Senior','Analis Strategis','Koordinator Riset','Spesialis Ketahanan','Peneliti Madya','Pengelola Arsip'][i%6],region:pick(REGIONS,i),clearance:i%17===0?'TOP SECRET':i%7===0?'SECRET':i%3===0?'CONFIDENTIAL':i%2===0?'RESTRICTED':'PUBLIC',status:'Active',joined:`202${(i%5)+1}-${String((i%12)+1).padStart(2,'0')}-${String((i%27)+1).padStart(2,'0')}`,lastActive:iso(),expertise:pick(CATS,i),scope:['Riset','Dokumen','Analitik','Arsip'][i%4],category:['Peneliti','Analis','Koordinator','Administrator Terbatas'][i%4],role:ROLES[i%ROLES.length],photo:fakePhotoData(name,i),locationSharing:false,deleted:false});
  }
  const nadira=personnel[2]; Object.assign(nadira,{id:'USR-00482',name:'Nadira Anindya',email:'nadira.demo@iksn.local',clearance:'CONFIDENTIAL',status:'Active',role:'Analis',serial:'IKSN-SN-91C4-7A28',passwordHash:hash('Nadira#2041')});
  const haydar=personnel[10]; Object.assign(haydar,{id:'USR-00490',name:'Haydar Wiratama',email:'haydar.demo@iksn.local',clearance:'SECRET',status:'Active',role:'Observasi',codename:'HAYDAR-S/01',serial:'IKSN-SN-72H9-4K11',passwordHash:hash('Haydar#2041')});
  const users=personnel.map(p=>({id:p.id,email:p.email,role:'PERSONNEL',personnelId:p.id,status:p.status,passwordHash:p.passwordHash||hash(`Pass#${p.id}`),serial:p.serial||`IKSN-SN-${String(p.id).replace('USR-','')}-DEMO`}));
  const now=iso();
  const demoReq={id:'REQ-00291',name:'Alya Mahendra',nick:'Alya',dob:'2001-05-17',country:'Indonesia',province:'Jawa Barat',city:'Bandung',phone:'081200000291',email:'alya.demo@iksn.local',institution:'Lembaga Kajian Arunika',division:'Analisis Strategis',position:'Peneliti Madya',expertise:'Metodologi Analisis',purpose:'Riset dan arsip strategis',photo:fakePhotoData('Alya Mahendra',19),photoConfirmed:true,biometricVerified:true,locationConsent:false,status:'PENDING',submitted:now,role:'Analis',clearance:'CONFIDENTIAL',personnelId:null,serial:null,passwordHash:null,loginPassword:null};
  return {meta:{createdAt:now,version:'2.0.0-rebuild'},personnel,users,admins:[],requests:[demoReq],sessions:[],otpCodes:[],locations:[],conversations:[],messages:[],notifications:[],audit:[{id:uid('AUD'),timestamp:now,actor:'SYSTEM',role:'SYSTEM',action:'BOOTSTRAP',target:'IKSN',result:'SUCCESS',meta:{note:'Fictional prototype initialized'}}],securityEvents:[]};
}
let db=readDb();
function ensureSeed(){
  const adminEmail=(process.env.ADMIN_EMAIL||'admin-001@iksn.local').trim().toLowerCase();
  const adminPass=process.env.ADMIN_PASSWORD||'IKSN#Admin-72Qp!9';
  if(!db.admins?.length){db.admins=[{id:'ADMIN-001',email:adminEmail,passwordHash:hash(adminPass),role:'ADMIN',status:'ACTIVE',name:'IKSN Administrator'}];}
  let admin=db.admins[0];
  if(admin.email!==adminEmail){admin.email=adminEmail;admin.passwordHash=hash(adminPass);}
  const addUser=(p,email,pass)=>{const u=db.users.find(x=>x.email===email); if(!u) db.users.push({id:p.id,email,role:'PERSONNEL',personnelId:p.id,status:'Active',passwordHash:hash(pass)}); else {u.passwordHash=hash(pass);u.personnelId=p.id;u.status='Active';}};
  addUser(db.personnel.find(p=>p.id==='USR-00482'),'nadira.demo@iksn.local','Nadira#2041');
  addUser(db.personnel.find(p=>p.id==='USR-00490'),'haydar.demo@iksn.local','Haydar#2041');
  writeDb(db);
}
ensureSeed();

app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:false,limit:'200kb'}));
app.use(rateLimit({windowMs:60*1000,max:180,standardHeaders:true,legacyHeaders:false}));
app.use('/api/auth',rateLimit({windowMs:10*60*1000,max:40,standardHeaders:true,legacyHeaders:false}));
app.use(express.static(__dirname,{extensions:['html'],index:'index.html'}));

function cookieOptions(maxAge){return `Path=/; HttpOnly; SameSite=Lax; ${isProd?'Secure; ':''}${maxAge?`Max-Age=${Math.floor(maxAge/1000)};`:''}`;}
function setCookie(res,token,maxAge=SESSION_TTL_MS){res.setHeader('Set-Cookie',`${COOKIE}=${token}; ${cookieOptions(maxAge)}`);}
function clearCookie(res){res.setHeader('Set-Cookie',`${COOKIE}=; ${cookieOptions(0)}`);}
function getToken(req){const c=req.headers.cookie||'';const m=c.match(new RegExp(`${COOKIE}=([^;]+)`));return m?m[1]:null;}
function createSession(user,role){const token=crypto.randomBytes(32).toString('hex');const s={id:uid('SES'),token,principalId:user.id,role,userId:user.id,personnelId:user.personnelId||null,createdAt:iso(),expiresAt:new Date(Date.now()+SESSION_TTL_MS).toISOString(),revoked:false};db.sessions.push(s);writeDb(db);return s;}
function currentSession(req){const token=getToken(req);if(!token)return null;const s=db.sessions.find(x=>x.token===token&&!x.revoked);if(!s)return null;if(new Date(s.expiresAt).getTime()<Date.now()){s.revoked=true;writeDb(db);return null;} return s;}
function requireAuth(req,res,next){const s=currentSession(req);if(!s)return res.status(401).json({ok:false,error:{code:'AUTH_REQUIRED',message:'Sesi tidak valid atau telah berakhir.'}});req.session=s;next();}
function requireRole(...roles){return (req,res,next)=>{if(!req.session||!roles.includes(req.session.role))return res.status(403).json({ok:false,error:{code:'FORBIDDEN',message:'Akses tidak diizinkan.'}});next();};}
function audit(actor,role,action,target,result='SUCCESS',meta={}){db.audit.unshift({id:uid('AUD'),timestamp:iso(),actor,role,action,target,result,meta});if(db.audit.length>1000)db.audit.length=1000;writeDb(db);}
function publicPersonnel(p){return {...p,passwordHash:undefined};}
function publicRequest(r){const o={...r}; delete o.credentialPasswordHash; delete o.otp; delete o.passwordHash; if(process.env.DEV_OTP_LOG!=='true') delete o.loginPassword; return o;}
function createOtp(principalId,channel='personnel'){
  const code=(process.env.ADMIN_OTP&&channel==='admin'&&process.env.DEV_FIXED_OTP==='true')?String(process.env.ADMIN_OTP).replace(/\D/g,'').slice(0,6):String(Math.floor(100000+Math.random()*900000));
  db.otpCodes=db.otpCodes.filter(x=>x.principalId!==principalId || x.used || new Date(x.expiresAt).getTime()<Date.now());
  const item={id:uid('OTP'),principalId,code,channel,createdAt:iso(),expiresAt:new Date(Date.now()+OTP_TTL_MS).toISOString(),used:false,attempts:0};db.otpCodes.push(item);writeDb(db);
  if(process.env.DEV_OTP_LOG==='true') console.log(`[IKSN DEV OTP] ${channel} ${principalId}: ${code}`);
  return item;
}
function verifyOtp(principalId,code,channel){
  const item=db.otpCodes.find(x=>x.principalId===principalId&&x.channel===channel&&!x.used);
  if(!item)return {ok:false,reason:'OTP_NOT_FOUND'};
  if(item.attempts>=5)return {ok:false,reason:'OTP_LOCKED'};
  item.attempts++; if(new Date(item.expiresAt).getTime()<Date.now()){item.used=true;writeDb(db);return {ok:false,reason:'OTP_EXPIRED'};}
  if(String(item.code)!==String(code)){writeDb(db);return {ok:false,reason:'OTP_INVALID'};}
  item.used=true;writeDb(db);return {ok:true};
}
function getUserBySession(s){
  if(s.role==='ADMIN')return db.admins.find(a=>a.id===s.principalId)||null;
  return db.users.find(u=>u.id===s.principalId)||null;
}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'IKSN',status:'operational',time:iso()}));
app.get('/api/bootstrap',(req,res)=>res.json({ok:true,data:{levels:LEVELS,divisions:DIV,roles:ROLES,personnelCount:db.personnel.filter(p=>!p.deleted).length,features:{messaging:true,locationConsent:true,cameraPrototype:true}}}));

app.post('/api/auth/admin/request-otp',(req,res)=>{
  const email=escapeNull(req.body?.email).trim().toLowerCase(); const password=escapeNull(req.body?.password);
  const admin=db.admins.find(a=>a.email===email&&a.status==='ACTIVE');
  if(!admin || hash(password)!==admin.passwordHash){return res.status(401).json({ok:false,error:{code:'INVALID_CREDENTIALS',message:'Credentials tidak valid.'}})}
  const otp=createOtp(admin.id,'admin'); audit(admin.id,'ADMIN','OTP_REQUESTED',admin.id,'SUCCESS',{channel:'admin'});
  res.json({ok:true,data:{challengeId:otp.id,expiresAt:otp.expiresAt,devOtp:process.env.DEV_OTP_LOG==='true'?otp.code:undefined}});
});
app.post('/api/auth/admin/verify-otp',(req,res)=>{
  const email=escapeNull(req.body?.email).trim().toLowerCase();const code=String(req.body?.otp||'').trim();const admin=db.admins.find(a=>a.email===email);
  if(!admin)return res.status(401).json({ok:false,error:{code:'INVALID_CREDENTIALS',message:'Credentials tidak valid.'}});
  const v=verifyOtp(admin.id,code,'admin');if(!v.ok)return res.status(401).json({ok:false,error:{code:v.reason,message:'Kode OTP tidak valid.'}});
  const s=createSession(admin,'ADMIN');setCookie(res,s.token);audit(admin.id,'ADMIN','LOGIN','ADMIN-001','SUCCESS',{method:'password+otp'});res.json({ok:true,data:{user:{id:admin.id,name:admin.name,email:admin.email,role:'ADMIN'},expiresAt:s.expiresAt}});
});

app.post('/api/auth/personnel/request-otp',(req,res)=>{
  const email=escapeNull(req.body?.email).trim().toLowerCase();const user=db.users.find(u=>u.email===email&&u.status==='Active');
  if(!user)return res.status(401).json({ok:false,error:{code:'INVALID_CREDENTIALS',message:'Credentials tidak valid.'}});
  const p=db.personnel.find(x=>x.id===user.personnelId&&!x.deleted); if(!p || p.status!=='Active')return res.status(403).json({ok:false,error:{code:'PERSONNEL_INACTIVE',message:'Akun personel tidak aktif.'}});
  const otp=createOtp(user.id,'personnel');audit(user.id,'PERSONNEL','OTP_REQUESTED',p.id,'SUCCESS',{});res.json({ok:true,data:{challengeId:otp.id,expiresAt:otp.expiresAt,devOtp:process.env.DEV_OTP_LOG==='true'?otp.code:undefined}});
});
app.post('/api/auth/personnel/verify-otp',(req,res)=>{
  const email=escapeNull(req.body?.email).trim().toLowerCase();const code=String(req.body?.otp||'').trim();const user=db.users.find(u=>u.email===email&&u.status==='Active');
  if(!user)return res.status(401).json({ok:false,error:{code:'INVALID_CREDENTIALS',message:'Credentials tidak valid.'}});
  const v=verifyOtp(user.id,code,'personnel');if(!v.ok)return res.status(401).json({ok:false,error:{code:v.reason,message:'Kode OTP tidak valid.'}});
  const s=createSession(user,'PERSONNEL');setCookie(res,s.token);audit(user.id,'PERSONNEL','LOGIN',user.personnelId,'SUCCESS',{method:'otp'});res.json({ok:true,data:{user:{id:user.id,personnelId:user.personnelId,email:user.email,role:'PERSONNEL'},expiresAt:s.expiresAt}});
});
app.post('/api/auth/personnel/verify-credentials',requireAuth,requireRole('PERSONNEL'),(req,res)=>{
  const serial=escapeNull(req.body?.serial).trim();const password=escapeNull(req.body?.password);const p=db.personnel.find(x=>x.id===req.session.personnelId&&!x.deleted);
  if(!p)return res.status(404).json({ok:false,error:{code:'PERSONNEL_NOT_FOUND',message:'Personel tidak ditemukan.'}});
  if(serial!==p.serial || hash(password)!==p.passwordHash){return res.status(401).json({ok:false,error:{code:'INVALID_CREDENTIALS',message:'Credential tidak valid.'}})}
  audit(req.session.userId,'PERSONNEL','CREDENTIAL_VERIFIED',p.id,'SUCCESS');res.json({ok:true,data:{personnel:publicPersonnel(p)}});
});
app.get('/api/auth/session',requireAuth,(req,res)=>{const principal=getUserBySession(req.session);if(!principal)return res.status(401).json({ok:false,error:{code:'SESSION_INVALID',message:'Sesi tidak valid.'}});const p=req.session.role==='PERSONNEL'?db.personnel.find(x=>x.id===principal.personnelId&&!x.deleted):null;res.json({ok:true,data:{role:req.session.role,user:req.session.role==='ADMIN'?{id:principal.id,email:principal.email,name:principal.name,role:'ADMIN'}:{id:principal.id,email:principal.email,personnelId:principal.personnelId,role:'PERSONNEL'},personnel:p?publicPersonnel(p):null,expiresAt:req.session.expiresAt}})});
app.post('/api/auth/session/refresh',requireAuth,(req,res)=>{req.session.expiresAt=new Date(Date.now()+SESSION_TTL_MS).toISOString();writeDb(db);setCookie(res,req.session.token);res.json({ok:true,data:{expiresAt:req.session.expiresAt}})});
app.post('/api/auth/logout',(req,res)=>{const s=currentSession(req);if(s){s.revoked=true;writeDb(db);audit(s.principalId,s.role,'LOGOUT',s.personnelId||s.principalId,'SUCCESS');}clearCookie(res);res.json({ok:true,data:{loggedOut:true}})});

app.post('/api/requests',(req,res)=>{
  const d=req.body?.data||{};const required=['name','dob','country','province','city','phone','email','inst','div','pos','expert','purpose'];for(const k of required){if(!escapeNull(d[k]).trim())return res.status(422).json({ok:false,error:{code:'VALIDATION',message:`Kolom ${k} wajib diisi.`}})}
  const email=String(d.email).trim().toLowerCase(); if(db.requests.some(r=>String(r.email).toLowerCase()===email && !['REJECTED','TERMINATED'].includes(r.status)))return res.status(409).json({ok:false,error:{code:'DUPLICATE_REQUEST',message:'Pengajuan untuk email tersebut sudah ada.'}});
  const id=uid('REQ'); const r={id,name:d.name.trim(),nick:d.nick||'',dob:d.dob,country:d.country,province:d.province,city:d.city,phone:d.phone,email,institution:d.inst,division:d.div,position:d.pos,expertise:d.expert,purpose:d.purpose,photo:d.photo||'',photoConfirmed:Boolean(d.photoConfirmed),biometricVerified:Boolean(d.biometricVerified),locationConsent:Boolean(d.locationConsent),status:'PENDING',submitted:iso(),role:'Analis',clearance:d.clearanceRequested||'RESTRICTED',personnelId:null,serial:null,passwordHash:null};db.requests.unshift(r);audit('PUBLIC','PUBLIC','ACCESS_REQUESTED',id,'SUCCESS',{email});writeDb(db);res.status(201).json({ok:true,data:{request:publicRequest(r)}});
});
app.get('/api/requests/status',(req,res)=>{const email=String(req.query.email||'').trim().toLowerCase();const items=db.requests.filter(r=>String(r.email).toLowerCase()===email).slice(0,10).map(publicRequest);res.json({ok:true,data:{requests:items}})});
app.get('/api/admin/requests',requireAuth,requireRole('ADMIN'),(req,res)=>res.json({ok:true,data:{requests:db.requests.map(publicRequest)}}));
app.post('/api/admin/requests/:id/approve',requireAuth,requireRole('ADMIN'),(req,res)=>{
  const r=db.requests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Pengajuan tidak ditemukan.'}});if(r.status!=='PENDING')return res.status(409).json({ok:false,error:{code:'BAD_STATE',message:'Pengajuan tidak berada pada status PENDING.'}});
  let p=db.personnel.find(x=>String(x.email).toLowerCase()===String(r.email).toLowerCase()&&!x.deleted);if(!p){const n=db.personnel.length; p={id:`USR-${String(480+n).padStart(5,'0')}`,name:r.name,email:r.email,phone:r.phone,division:r.division,position:r.position,region:r.city,clearance:r.clearance,status:'Active',role:r.role,codename:'HAYDAR-'+String(n+1).padStart(2,'0'),joined:iso().slice(0,10),lastActive:iso(),expertise:r.expertise,scope:'Dokumen riset dan arsip terbatas',category:'Approved Personnel',photo:r.photo||fakePhotoData(r.name,n),locationSharing:false,deleted:false};db.personnel.push(p);} else {Object.assign(p,{name:r.name,phone:r.phone,division:r.division,position:r.position,region:r.city,clearance:r.clearance,status:'Active',photo:r.photo||p.photo,role:r.role});}
  r.status='APPROVED';r.personnelId=p.id;r.serial=r.serial||`IKSN-SN-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;r.loginPassword=r.loginPassword||`IKSN#${crypto.randomBytes(3).toString('hex').toUpperCase()}`;r.passwordHash=hash(r.loginPassword);p.serial=r.serial;p.passwordHash=r.passwordHash;
  const existing=db.users.find(u=>u.email===r.email); if(existing){existing.personnelId=p.id;existing.passwordHash=r.passwordHash;existing.status='Active';} else db.users.push({id:p.id,email:r.email,role:'PERSONNEL',personnelId:p.id,status:'Active',passwordHash:r.passwordHash});
  db.notifications.unshift({id:uid('NTF'),recipientId:p.id,type:'ACCESS',title:'Akses disetujui',body:'Pengajuan akses Anda telah disetujui.',createdAt:iso(),readAt:null});audit(req.session.principalId,'ADMIN','ACCESS_APPROVED',r.id,'SUCCESS',{personnelId:p.id});writeDb(db);res.json({ok:true,data:{request:publicRequest(r),credentials:{serial:r.serial,temporaryPassword:undefined}}});
});
app.post('/api/admin/requests/:id/reject',requireAuth,requireRole('ADMIN'),(req,res)=>{const r=db.requests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Pengajuan tidak ditemukan.'}});r.status='REJECTED';r.rejectionReason=String(req.body?.reason||'Tidak memenuhi persyaratan');audit(req.session.principalId,'ADMIN','ACCESS_REJECTED',r.id,'SUCCESS',{reason:r.rejectionReason});writeDb(db);res.json({ok:true,data:{request:publicRequest(r)}})});

// Demo credentials are stored server-side for approved seed personnel. For an approved request, the temporary password is deliberately not returned from the API.
app.get('/api/personnel/me',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.session.personnelId&&!x.deleted);if(!p)return res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Personel tidak ditemukan.'}});res.json({ok:true,data:{personnel:publicPersonnel(p)}})});
app.get('/api/admin/personnel',requireAuth,requireRole('ADMIN'),(req,res)=>{const q=String(req.query.q||'').trim().toLowerCase();let list=db.personnel.filter(p=>!p.deleted);if(q)list=list.filter(p=>[p.id,p.name,p.email,p.division,p.status,p.codename].some(v=>String(v||'').toLowerCase().includes(q)));res.json({ok:true,data:{personnel:list.map(publicPersonnel)}})});
app.post('/api/admin/personnel/:id/:action',requireAuth,requireRole('ADMIN'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.params.id&&!x.deleted);if(!p)return res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Personel tidak ditemukan.'}});const action=req.params.action;if(!['suspend','revoke','terminate','restore'].includes(action))return res.status(400).json({ok:false,error:{code:'ACTION_INVALID',message:'Action tidak valid.'}});p.status=action==='suspend'?'Suspended':action==='revoke'?'Revoked':action==='terminate'?'Terminated':'Active';audit(req.session.principalId,'ADMIN',`PERSONNEL_${action.toUpperCase()}`,p.id,'SUCCESS',{reason:req.body?.reason||''});writeDb(db);res.json({ok:true,data:{personnel:publicPersonnel(p)}})});
app.delete('/api/admin/personnel/:id',requireAuth,requireRole('ADMIN'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.params.id&&!x.deleted);if(!p)return res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Personel tidak ditemukan.'}});p.deleted=true;p.status='Archived';db.users.filter(u=>u.personnelId===p.id).forEach(u=>u.status='Archived');audit(req.session.principalId,'ADMIN','PERSONNEL_DELETED',p.id,'SUCCESS',{});writeDb(db);res.json({ok:true,data:{deleted:true}})});

app.post('/api/location/toggle',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.session.personnelId&&!x.deleted);if(!p)return res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Personel tidak ditemukan.'}});p.locationSharing=Boolean(req.body?.enabled);audit(req.session.principalId,'PERSONNEL',p.locationSharing?'LOCATION_ENABLED':'LOCATION_DISABLED',p.id,'SUCCESS',{});if(!p.locationSharing)db.locations=db.locations.filter(x=>x.personnelId!==p.id);writeDb(db);res.json({ok:true,data:{enabled:p.locationSharing}})});
app.post('/api/location',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const p=db.personnel.find(x=>x.id===req.session.personnelId&&!x.deleted);if(!p||!p.locationSharing)return res.status(403).json({ok:false,error:{code:'LOCATION_NOT_ENABLED',message:'Berbagi lokasi belum diaktifkan.'}});const lat=Number(req.body?.latitude),lon=Number(req.body?.longitude),accuracy=Number(req.body?.accuracy);if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(accuracy))return res.status(422).json({ok:false,error:{code:'LOCATION_INVALID',message:'Data lokasi tidak valid.'}});const item={personnelId:p.id,name:p.name,latitude:lat,longitude:lon,accuracy,updatedAt:iso(),role:p.role};const idx=db.locations.findIndex(x=>x.personnelId===p.id);if(idx>=0)db.locations[idx]=item;else db.locations.push(item);p.lastActive=item.updatedAt;audit(req.session.principalId,'PERSONNEL','LOCATION_UPDATE',p.id,'SUCCESS',{lat,lon,accuracy});writeDb(db);res.json({ok:true,data:{location:item}})});
app.get('/api/location/me',requireAuth,requireRole('PERSONNEL'),(req,res)=>res.json({ok:true,data:{location:db.locations.find(x=>x.personnelId===req.session.personnelId)||null,enabled:Boolean(db.personnel.find(x=>x.id===req.session.personnelId)?.locationSharing)}}));
app.get('/api/admin/locations',requireAuth,requireRole('ADMIN'),(req,res)=>{const active=db.locations.filter(x=>{const age=Date.now()-new Date(x.updatedAt).getTime();return age<10*60*1000;}).map(x=>({...x,ageSeconds:Math.max(0,Math.floor((Date.now()-new Date(x.updatedAt).getTime())/1000))}));res.json({ok:true,data:{locations:active}})});

function ensureConversation(a,b){let c=db.conversations.find(x=>x.memberIds.length===2&&x.memberIds.includes(a)&&x.memberIds.includes(b));if(c)return c;c={id:uid('CONV'),memberIds:[a,b],createdAt:iso()};db.conversations.push(c);writeDb(db);return c;}
function canAccessConversation(s,c){return c && c.memberIds.includes(s.personnelId||s.principalId);}
function publicMessage(m){return {id:m.id,conversationId:m.conversationId,senderId:m.senderId,body:m.body,createdAt:m.createdAt,readAt:m.readAt||null};}
app.get('/api/messages/conversations',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const me=req.session.personnelId;const out=db.conversations.filter(c=>c.memberIds.includes(me)).map(c=>{const otherId=c.memberIds.find(x=>x!==me);const other=db.personnel.find(p=>p.id===otherId&&!p.deleted);const msgs=db.messages.filter(m=>m.conversationId===c.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));const last=msgs[0]||null;const unread=msgs.filter(m=>m.senderId!==me&&!m.readAt).length;return {id:c.id,other:other?{id:other.id,name:other.name,role:other.role,photo:other.photo}:null,lastMessage:last?last.body:'',lastAt:last?last.createdAt:c.createdAt,unread};});out.sort((a,b)=>new Date(b.lastAt)-new Date(a.lastAt));res.json({ok:true,data:{conversations:out}})});
app.get('/api/messages/contacts',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const me=req.session.personnelId;const contacts=db.personnel.filter(p=>!p.deleted&&p.status==='Active'&&p.id!==me).map(p=>({id:p.id,name:p.name,role:p.role,division:p.division,photo:p.photo}));res.json({ok:true,data:{contacts}})});
app.get('/api/messages/conversations/:id',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const c=db.conversations.find(x=>x.id===req.params.id);if(!canAccessConversation(req.session,c))return res.status(403).json({ok:false,error:{code:'FORBIDDEN',message:'Percakapan tidak tersedia.'}});const msgs=db.messages.filter(m=>m.conversationId===c.id).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));res.json({ok:true,data:{conversation:c,messages:msgs.map(publicMessage)}})});
app.post('/api/messages',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const me=req.session.personnelId;const to=String(req.body?.toPersonnelId||'');const body=String(req.body?.body||'').trim();if(!to||!body)return res.status(422).json({ok:false,error:{code:'VALIDATION',message:'Penerima dan isi pesan wajib diisi.'}});if(body.length>2000)return res.status(422).json({ok:false,error:{code:'VALIDATION',message:'Pesan terlalu panjang.'}});const target=db.personnel.find(p=>p.id===to&&!p.deleted&&p.status==='Active');if(!target||target.id===me)return res.status(404).json({ok:false,error:{code:'RECIPIENT_INVALID',message:'Penerima tidak tersedia.'}});const c=ensureConversation(me,to);const m={id:uid('MSG'),conversationId:c.id,senderId:me,body,createdAt:iso(),readAt:null};db.messages.push(m);db.notifications.unshift({id:uid('NTF'),recipientId:to,type:'MESSAGE',title:'Pesan baru',body:`Anda menerima pesan dari ${db.personnel.find(p=>p.id===me)?.name||'personel'}.`,createdAt:iso(),readAt:null});audit(me,'PERSONNEL','MESSAGE_SENT',c.id,'SUCCESS',{recipient:to});writeDb(db);res.status(201).json({ok:true,data:{message:publicMessage(m),conversationId:c.id}})});
app.post('/api/messages/:id/read',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const m=db.messages.find(x=>x.id===req.params.id);if(!m)return res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Pesan tidak ditemukan.'}});const c=db.conversations.find(x=>x.id===m.conversationId);if(!canAccessConversation(req.session,c)||m.senderId===req.session.personnelId)return res.status(403).json({ok:false,error:{code:'FORBIDDEN',message:'Akses tidak diizinkan.'}});m.readAt=iso();db.notifications.filter(n=>n.recipientId===req.session.personnelId&&n.type==='MESSAGE').forEach(n=>{if(!n.readAt)n.readAt=iso();});writeDb(db);res.json({ok:true,data:{read:true}})});
app.get('/api/messages/unread-count',requireAuth,requireRole('PERSONNEL'),(req,res)=>{const me=req.session.personnelId;const count=db.messages.filter(m=>{const c=db.conversations.find(x=>x.id===m.conversationId);return c?.memberIds.includes(me)&&m.senderId!==me&&!m.readAt;}).length;res.json({ok:true,data:{count}})});

app.get('/api/notifications',requireAuth,(req,res)=>{const recipient=req.session.role==='PERSONNEL'?req.session.personnelId:req.session.principalId;res.json({ok:true,data:{notifications:db.notifications.filter(n=>n.recipientId===recipient).slice(0,50)}})});
app.post('/api/notifications/:id/read',requireAuth,(req,res)=>{const n=db.notifications.find(x=>x.id===req.params.id);const recipient=req.session.role==='PERSONNEL'?req.session.personnelId:req.session.principalId;if(!n||n.recipientId!==recipient)return res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Notifikasi tidak ditemukan.'}});n.readAt=iso();writeDb(db);res.json({ok:true,data:{read:true}})});
app.get('/api/admin/audit',requireAuth,requireRole('ADMIN'),(req,res)=>res.json({ok:true,data:{audit:db.audit.slice(0,300)}}));

app.use((req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({ok:false,error:{code:'INTERNAL_ERROR',message:'Terjadi kesalahan pada server.'}})});

app.listen(PORT,HOST,()=>console.log(`IKSN online server listening on http://${HOST}:${PORT}`));
