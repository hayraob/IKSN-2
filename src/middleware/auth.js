const { findUserById } = require('../database/store');

async function auth(req,res,next){
  if(!req.session?.userId) return res.status(401).json({ok:false,error:{code:'AUTH_REQUIRED',message:'Authentication required.'}});
  const user=await findUserById(req.session.userId);
  if(!user || !user.active){ req.session.destroy(()=>{}); return res.status(401).json({ok:false,error:{code:'SESSION_INVALID',message:'Session invalid.'}}); }
  req.user=user; next();
}
function requireRole(...roles){ return (req,res,next)=>{ if(!req.user || !roles.includes(req.user.role)) return res.status(403).json({ok:false,error:{code:'FORBIDDEN',message:'You do not have access to this resource.'}}); next(); }; }
module.exports={auth,requireRole};
