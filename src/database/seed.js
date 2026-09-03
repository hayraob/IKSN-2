const { pool } = require('./index');
const config = require('../config/env');
const { createUser, createPersonnel, hashPassword } = require('./store');

const orgs=['Strategic Resilience Unit','Archive Studies Division','Infrastructure Readiness Group','Institutional Analysis Office'];
const depts=['Operations Support','Strategic Research','Resilience Planning','Archive Management'];

(async()=>{
  if(!pool) throw new Error('DATABASE_URL is required for production seed.');
  const exists=await pool.query('SELECT COUNT(*)::int count FROM users');
  if(exists.rows[0].count>0){console.log('Seed skipped: users already exist.'); await pool.end(); return;}
  const admin=await createUser({email:config.adminEmail,password:config.adminPassword,role:'ADMIN'});
  for(let i=1;i<=60;i++){
    const code=`PX-${String(i).padStart(3,'0')}`;
    const email=`px${String(i).padStart(3,'0')}@iksn.demo`;
    const u=await createUser({email,password:config.demoPersonnelPassword,role:'PERSONNEL'});
    await createPersonnel({user_id:u.id,personnel_code:code,full_name:i===1?'Haydar Rahman':['Arman Pratama','Nadia Putri','Raka Wijaya','Satria Anwar'][i%4]+' '+String(i).padStart(2,'0'),codename:['HAYDAR','ORION','NOVA','ARCADIA','VECTOR'][i%5],email,phone:`+62 812 00${String(i).padStart(5,'0')}`,organization:orgs[i%orgs.length],department:depts[i%depts.length],position:['Analyst','Coordinator','Officer','Research Lead'][i%4],rank:['A-1','A-2','B-1','B-2'][i%4],clearance:['C2','C3','C4'][i%3],status:'APPROVED',join_date:`202${i%6}-0${(i%9)+1}-01`,avatar:null});
  }
  console.log(`Seeded admin ${admin.email} + 60 personnel.`);
  await pool.end();
})().catch(err=>{console.error(err);process.exit(1)});
