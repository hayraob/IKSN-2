const express=require('express');
const path=require('path');
const helmet=require('helmet');
const session=require('express-session');
const rateLimit=require('express-rate-limit');
const pgSession=require('connect-pg-simple')(session);
const config=require('./config/env');
const {pool}=require('./database');
const api=require('./routes/api');
const store=require('./database/store');

const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'4mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));
app.use(rateLimit({windowMs:60*1000,max:120,standardHeaders:true,legacyHeaders:false}));
const sessionOpts={secret:config.sessionSecret,resave:false,saveUninitialized:false,name:'iksn.sid',cookie:{httpOnly:true,sameSite:'lax',secure:config.isProduction,maxAge:8*60*60*1000}};
if(pool)sessionOpts.store=new pgSession({pool,tableName:'sessions'});
app.use(session(sessionOpts));
app.use((req,res,next)=>{ if(req.path.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(req.method) && config.isProduction){ const origin=req.get('origin'); const host=req.get('host'); if(origin){ try{const u=new URL(origin); if(u.host!==host) return res.status(403).json({ok:false,error:{code:'CSRF_ORIGIN',message:'Origin tidak diizinkan.'}});}catch{return res.status(403).json({ok:false,error:{code:'CSRF_ORIGIN',message:'Origin tidak valid.'}})} } } next(); });
app.use('/api',api);
app.use(express.static(config.publicDir,{extensions:['html']}));
app.get('*',(req,res)=>res.sendFile(path.join(config.publicDir,'index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({ok:false,error:{code:'INTERNAL_ERROR',message:'Terjadi kesalahan internal.'}})});

(async()=>{await store.seedIfMemory();app.listen(config.port,'0.0.0.0',()=>console.log(`IKSN listening on ${config.port} (${config.nodeEnv})`));})().catch(err=>{console.error(err);process.exit(1)});
