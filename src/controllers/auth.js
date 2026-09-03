const crypto=require('crypto');
const {createHash}=crypto;
const config=require('../config/env');
const store=require('../database/store');

function makeOtp(){ return String(crypto.randomInt(0,1000000)).padStart(6,'0'); }
function hashOtp(code){return createHash('sha256').update(code+config.passwordPepper).digest('hex');}

async function issueOtp(user){
  const code=makeOtp(); await store.createOtp(user.id,hashOtp(code),new Date(Date.now()+5*60*1000));
  if(config.devOtpLog && !config.isProduction) console.log(`[DEV OTP] ${user.email}: ${code}`);
}
async function login(req,res,role){
  const email=String(req.body?.email||'').trim(); const password=String(req.body?.password||'');
  if(!email || !password) return res.status(422).json({ok:false,error:{code:'VALIDATION_ERROR',message:'Email dan password wajib diisi.'}});
  const user=await store.findUserByEmail(email); const valid=user && user.active && user.role===role && await store.verifyPassword(password,user.password_hash);
  if(!valid){await store.audit(user?.id||null,role,'LOGIN_FAILED',email,{source:role},req);return res.status(401).json({ok:false,error:{code:'INVALID_CREDENTIALS',message:'Credentials tidak valid.'}});}
  await issueOtp(user); req.session.pendingUserId=user.id; req.session.pendingRole=user.role; req.session.otpVerified=false;
  await store.audit(user.id,user.role,'OTP_REQUESTED',user.id,{},req);
  res.json({ok:true,data:{requiresOtp:true,message:'OTP dikirimkan melalui jalur demo.'}});
}
async function verifyOtp(req,res){
  const userId=req.session?.pendingUserId; const code=String(req.body?.code||'').trim();
  if(!userId || !/^\d{6}$/.test(code)) return res.status(422).json({ok:false,error:{code:'OTP_INVALID',message:'OTP tidak valid.'}});
  const ok=await store.consumeLatestOtp(userId,hashOtp(code));
  if(!ok){await store.audit(userId,req.session.pendingRole||'UNKNOWN','OTP_FAILED',userId,{},req);return res.status(401).json({ok:false,error:{code:'OTP_INVALID',message:'OTP tidak valid atau sudah kedaluwarsa.'}});}
  const user=await store.findUserById(userId); req.session.userId=user.id; req.session.role=user.role; req.session.otpVerified=true; delete req.session.pendingUserId; delete req.session.pendingRole;
  await new Promise((resolve,reject)=>req.session.save(err=>err?reject(err):resolve()));
  await store.audit(user.id,user.role,'LOGIN',user.id,{},req);
  res.json({ok:true,data:{user:{id:user.id,email:user.email,role:user.role}}});
}
async function session(req,res){
  if(!req.session?.userId) return res.json({ok:true,data:{authenticated:false}});
  const user=await store.findUserById(req.session.userId); if(!user)return res.json({ok:true,data:{authenticated:false}});
  const personnel=await store.findPersonnelByUserId(user.id); return res.json({ok:true,data:{authenticated:true,user:{id:user.id,email:user.email,role:user.role},personnel}});
}
async function refresh(req,res){ if(!req.session?.userId)return res.status(401).json({ok:false,error:{code:'AUTH_REQUIRED',message:'Session tidak aktif.'}}); await new Promise((resolve,reject)=>req.session.touch(err=>err?reject(err):resolve())); res.json({ok:true,data:{refreshed:true}}); }
async function logout(req,res){const id=req.session?.userId; if(id) await store.audit(id,req.session.role||'UNKNOWN','LOGOUT',id,{},req); req.session.destroy(err=>{if(err)return res.status(500).json({ok:false,error:{code:'LOGOUT_FAILED',message:'Logout gagal.'}});res.clearCookie('iksn.sid');res.json({ok:true,data:{loggedOut:true}});});}
module.exports={adminLogin:(req,res)=>login(req,res,'ADMIN'),personnelLogin:(req,res)=>login(req,res,'PERSONNEL'),verifyOtp,session,refresh,logout};
    
