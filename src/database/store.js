const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { query, withTransaction, pool } = require('./index');
const config = require('../config/env');

const memory = {
  users: new Map(), personnel: new Map(), requests: new Map(), locations: [], conversations: new Map(), members: new Map(), messages: new Map(), notifications: [], audit: [], otps: []
};

async function hashPassword(password) { return bcrypt.hash(`${password}${config.passwordPepper}`, 12); }
async function verifyPassword(password, hash) { return bcrypt.compare(`${password}${config.passwordPepper}`, hash); }

function normalizeUser(row) { return row ? { id: row.id, email: row.email, role: row.role, active: row.active } : null; }
function normalizePersonnel(row) { return row ? {
  id: row.id, user_id: row.user_id, personnel_code: row.personnel_code, full_name: row.full_name, codename: row.codename,
  email: row.email, phone: row.phone, organization: row.organization, department: row.department, position: row.position,
  rank: row.rank, clearance: row.clearance, status: row.status, join_date: row.join_date, last_active: row.last_active,
  avatar: row.avatar, location_sharing: row.location_sharing, location_status: row.location_status, last_location_at: row.last_location_at
} : null; }

async function findUserByEmail(email) {
  if (pool) { const r = await query('SELECT * FROM users WHERE lower(email)=lower($1)', [email]); return r.rows[0] || null; }
  return [...memory.users.values()].find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}
async function findUserById(id) {
  if (pool) { const r = await query('SELECT * FROM users WHERE id=$1', [id]); return r.rows[0] || null; }
  return memory.users.get(id) || null;
}
async function findPersonnelByUserId(userId) {
  if (pool) { const r = await query('SELECT * FROM personnel WHERE user_id=$1 AND soft_deleted_at IS NULL', [userId]); return normalizePersonnel(r.rows[0]); }
  return normalizePersonnel([...memory.personnel.values()].find(p => p.user_id === userId && !p.soft_deleted_at));
}
async function updatePersonnelStatus(id,status,actorId) { if(pool){ const r=await query("UPDATE personnel SET status=$2, location_status=CASE WHEN $2 <> 'APPROVED' THEN 'OFFLINE' ELSE location_status END WHERE id=$1 RETURNING *",[id,status]); if(r.rows[0]) await audit(actorId,'ADMIN',`PERSONNEL_${status}`,id,{status}); return normalizePersonnel(r.rows[0]); } const p=memory.personnel.get(id); if(!p) return null; p.status=status; if(status!=='APPROVED')p.location_status='OFFLINE'; await audit(actorId,'ADMIN',`PERSONNEL_${status}`,id,{status}); return normalizePersonnel(p); }
async function softDeletePersonnel(id,actorId){ if(pool){ const r=await query("UPDATE personnel SET soft_deleted_at=NOW(),status='TERMINATED' WHERE id=$1 RETURNING id",[id]); if(r.rows[0]) await audit(actorId,'ADMIN','PERSONNEL_DELETED',id,{}); return !!r.rowCount; } const p=memory.personnel.get(id); if(!p) return false; p.soft_deleted_at=new Date(); p.status='TERMINATED'; await audit(actorId,'ADMIN','PERSONNEL_DELETED',id,{}); return true; }
async function findPersonnelById(id) {
  if (pool) { const r = await query('SELECT * FROM personnel WHERE id=$1 AND soft_deleted_at IS NULL', [id]); return normalizePersonnel(r.rows[0]); }
  return normalizePersonnel(memory.personnel.get(id));
}
async function listPersonnel({ search = '', status = '' } = {}) {
  if (pool) {
    const clauses = ['soft_deleted_at IS NULL']; const params = [];
    if (search) { params.push(`%${search}%`); clauses.push(`(full_name ILIKE $${params.length} OR personnel_code ILIKE $${params.length} OR email ILIKE $${params.length} OR department ILIKE $${params.length})`); }
    if (status) { params.push(status); clauses.push(`status=$${params.length}`); }
    const r = await query(`SELECT * FROM personnel WHERE ${clauses.join(' AND ')} ORDER BY personnel_code`, params); return r.rows.map(normalizePersonnel);
  }
  return [...memory.personnel.values()].filter(p => !p.soft_deleted_at && (!search || [p.full_name,p.personnel_code,p.email,p.department].some(v => String(v||'').toLowerCase().includes(search.toLowerCase()))) && (!status || p.status === status)).sort((a,b)=>a.personnel_code.localeCompare(b.personnel_code)).map(normalizePersonnel);
}

async function createOtp(userId, codeHash, expiresAt) {
  if (pool) { await query('INSERT INTO otp_codes(user_id,code_hash,expires_at) VALUES($1,$2,$3)', [userId, codeHash, expiresAt]); return; }
  memory.otps.push({ id: randomUUID(), user_id: userId, code_hash: codeHash, expires_at: expiresAt, used_at: null });
}
async function consumeLatestOtp(userId, codeHash) {
  if (pool) {
    const r = await query('SELECT * FROM otp_codes WHERE user_id=$1 AND used_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1', [userId]);
    const otp = r.rows[0]; if (!otp || otp.code_hash !== codeHash) return false; await query('UPDATE otp_codes SET used_at=NOW() WHERE id=$1', [otp.id]); return true;
  }
  const otp = [...memory.otps].reverse().find(o => o.user_id === userId && !o.used_at && new Date(o.expires_at) > new Date());
  if (!otp || otp.code_hash !== codeHash) return false; otp.used_at = new Date(); return true;
}

async function createUser({ email, password, role, active = true }) {
  const password_hash = await hashPassword(password);
  if (pool) { const r = await query('INSERT INTO users(email,password_hash,role,active) VALUES($1,$2,$3,$4) RETURNING *',[email,password_hash,role,active]); return r.rows[0]; }
  const row = { id: randomUUID(), email, password_hash, role, active, created_at: new Date() }; memory.users.set(row.id,row); return row;
}

async function createPersonnel(data) {
  const id = randomUUID();
  if (pool) { const r = await query(`INSERT INTO personnel(id,user_id,personnel_code,full_name,codename,email,phone,organization,department,position,rank,clearance,status,join_date,last_active,avatar,location_sharing,location_status,last_location_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15,false,'OFFLINE',NULL) RETURNING *`, [id,data.user_id,data.personnel_code,data.full_name,data.codename,data.email,data.phone,data.organization,data.department,data.position,data.rank,data.clearance,data.status,data.join_date,data.avatar]); return normalizePersonnel(r.rows[0]); }
  const row = { id,user_id:data.user_id, ...data, last_active:new Date(), location_sharing:false, location_status:'OFFLINE', last_location_at:null }; memory.personnel.set(id,row); return normalizePersonnel(row);
}

async function createAccessRequest(data) {
  if (pool) { const r = await query(`INSERT INTO access_requests(full_name,email,phone,date_of_birth,country,city,organization,department,position,personnel_type,employee_number,reason,clearance_requested,photo_name,face_verified,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PENDING') RETURNING *`, [data.full_name,data.email,data.phone,data.date_of_birth||null,data.country,data.city,data.organization,data.department,data.position,data.personnel_type,data.employee_number,data.reason,data.clearance_requested,data.photo_name||null,!!data.face_verified]); return r.rows[0]; }
  const row = { id:randomUUID(), ...data, status:'PENDING', submitted_at:new Date(), face_verified:!!data.face_verified }; memory.requests.set(row.id,row); return row;
}
async function getAccessRequest(id) { if (pool) { const r=await query('SELECT * FROM access_requests WHERE id=$1',[id]); return r.rows[0]; } return memory.requests.get(id); }
async function listAccessRequests() { if (pool) { const r=await query('SELECT * FROM access_requests ORDER BY submitted_at DESC'); return r.rows; } return [...memory.requests.values()].sort((a,b)=>new Date(b.submitted_at)-new Date(a.submitted_at)); }

async function approveRequest(id, actorId) {
  return withTransaction(async client => {
    if (pool) {
      const c = client;
      const req = (await c.query('SELECT * FROM access_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!req) throw Object.assign(new Error('Request not found'), { status:404 });
      if (req.status === 'APPROVED') return req;
      const existing = (await c.query('SELECT * FROM users WHERE lower(email)=lower($1)',[req.email])).rows[0];
      let user = existing;
      if (!user) { const ph=await hashPassword(config.demoPersonnelPassword); user=(await c.query('INSERT INTO users(email,password_hash,role,active) VALUES($1,$2,\'PERSONNEL\',true) RETURNING *',[req.email,ph])).rows[0]; }
      const code = req.employee_number || `REQ-${String(String(id).replaceAll('-','').slice(0,8)).toUpperCase()}`;
      await c.query(`INSERT INTO personnel(user_id,personnel_code,full_name,email,phone,organization,department,position,clearance,status,join_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'APPROVED',CURRENT_DATE) ON CONFLICT(email) DO UPDATE SET user_id=EXCLUDED.user_id,status='APPROVED',clearance=EXCLUDED.clearance`, [user.id,code,req.full_name,req.email,req.phone,req.organization,req.department,req.position,req.clearance_requested]);
      const updated=(await c.query('UPDATE access_requests SET status=\'APPROVED\',reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1 RETURNING *',[id,actorId])).rows[0];
      await c.query('INSERT INTO notifications(user_id,type,title,body) VALUES($1,\'ACCESS_APPROVED\',\'Access request approved\',\'Your institutional access request has been approved.\')',[user.id]);
      await c.query('INSERT INTO audit_logs(actor,role,action,target,metadata) VALUES($1,\'ADMIN\',\'ACCESS_APPROVED\',$2,$3)',[actorId,id,JSON.stringify({email:req.email})]);
      return updated;
    }
    const req=memory.requests.get(id); if (!req) throw Object.assign(new Error('Request not found'),{status:404});
    req.status='APPROVED'; req.reviewed_at=new Date(); req.reviewed_by=actorId; return req;
  });
}
async function rejectRequest(id, actorId) { if (pool) { const r=await query('UPDATE access_requests SET status=\'REJECTED\',reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1 RETURNING *',[id,actorId]); if(!r.rows[0]) throw Object.assign(new Error('Request not found'),{status:404}); await audit(actorId,'ADMIN','ACCESS_REJECTED',id,{}); return r.rows[0]; } const req=memory.requests.get(id); if(!req) throw Object.assign(new Error('Request not found'),{status:404}); req.status='REJECTED'; req.reviewed_at=new Date(); req.reviewed_by=actorId; return req; }

async function setLocationSharing(personnelId, enabled) {
  if (pool) { const r=await query('UPDATE personnel SET location_sharing=$2, location_status=CASE WHEN $2 THEN \'RECENT\' ELSE \'OFFLINE\' END WHERE id=$1 RETURNING *',[personnelId,enabled]); return normalizePersonnel(r.rows[0]); }
  const p=memory.personnel.get(personnelId); if(!p) return null; p.location_sharing=enabled; p.location_status=enabled?'RECENT':'OFFLINE'; return normalizePersonnel(p);
}
async function addLocation(data) {
  if (pool) { const r=await query('INSERT INTO locations(personnel_id,latitude,longitude,accuracy,timestamp,sharing_enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[data.personnel_id,data.latitude,data.longitude,data.accuracy,data.timestamp,data.sharing_enabled]); await query('UPDATE personnel SET last_location_at=$2,location_status=\'RECENT\' WHERE id=$1',[data.personnel_id,data.timestamp]); return r.rows[0]; }
  memory.locations.push({id:randomUUID(),...data,created_at:new Date()}); const p=memory.personnel.get(data.personnel_id); if(p){p.last_location_at=data.timestamp;p.location_status='RECENT';} return memory.locations.at(-1);
}
async function getMyLocation(personnelId) { if (pool) { const r=await query('SELECT * FROM locations WHERE personnel_id=$1 ORDER BY timestamp DESC LIMIT 1',[personnelId]); return r.rows[0] || null; } return [...memory.locations].reverse().find(l=>l.personnel_id===personnelId) || null; }
async function getAdminLocations() { if (pool) { const r=await query(`SELECT p.personnel_code,p.full_name,p.status,p.location_sharing,p.location_status,p.last_location_at,l.latitude,l.longitude,l.accuracy,l.timestamp FROM personnel p JOIN LATERAL (SELECT * FROM locations WHERE personnel_id=p.id ORDER BY timestamp DESC LIMIT 1) l ON TRUE WHERE p.status='APPROVED' AND p.location_sharing=true AND p.last_location_at > NOW()-INTERVAL '10 minutes' ORDER BY l.timestamp DESC`); return r.rows; } return [...memory.personnel.values()].filter(p=>p.status==='APPROVED'&&p.location_sharing).map(p=>({...p,...(memory.locations.find(l=>l.personnel_id===p.id)||{})})); }

async function findOrCreateConversation(userA,userB) { if (pool) { const r=await query(`SELECT c.id FROM conversations c JOIN conversation_members m1 ON m1.conversation_id=c.id JOIN conversation_members m2 ON m2.conversation_id=c.id WHERE m1.user_id=$1 AND m2.user_id=$2 AND (SELECT COUNT(*) FROM conversation_members mx WHERE mx.conversation_id=c.id)=2 LIMIT 1`,[userA,userB]); if(r.rows[0]) return r.rows[0].id; const c=await query('INSERT INTO conversations DEFAULT VALUES RETURNING id',[]); await query('INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3)',[c.rows[0].id,userA,userB]); return c.rows[0].id; } const key=[userA,userB].sort().join(':'); if(memory.conversations.has(key)) return memory.conversations.get(key); const id=randomUUID(); memory.conversations.set(key,id); memory.members.set(id,new Set([userA,userB])); return id; }
async function listConversations(userId) { if(pool){ const r=await query(`SELECT c.id, MAX(m.created_at) last_message_at, COALESCE((SELECT body FROM messages mx WHERE mx.conversation_id=c.id ORDER BY mx.created_at DESC LIMIT 1),'') last_message, (SELECT u.email FROM users u JOIN conversation_members om ON om.user_id=u.id WHERE om.conversation_id=c.id AND u.id<>$1 LIMIT 1) other_email, (SELECT p.full_name FROM personnel p JOIN conversation_members om ON om.user_id=p.user_id WHERE om.conversation_id=c.id AND p.user_id<>$1 LIMIT 1) other_name FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id LEFT JOIN messages m ON m.conversation_id=c.id WHERE cm.user_id=$1 GROUP BY c.id ORDER BY last_message_at DESC NULLS LAST`,[userId]); return r.rows; } return [...memory.conversations.entries()].filter(([_,id])=>memory.members.get(id)?.has(userId)).map(([_,id])=>{const ms=[...memory.messages.values()].filter(m=>m.conversation_id===id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));const other=[...memory.members.get(id)].find(x=>x!==userId);const op=memory.personnel.values().find(p=>p.user_id===other);return {id,last_message_at:ms.at(-1)?.created_at||null,last_message:ms.at(-1)?.body||'',other_email:memory.users.get(other)?.email||'',other_name:op?.full_name||''};}); }
async function conversationMember(conversationId,userId){ if(pool){const r=await query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',[conversationId,userId]);return !!r.rowCount;} return memory.members.get(conversationId)?.has(userId) || false; }
async function getMessages(conversationId){ if(pool){const r=await query('SELECT id,conversation_id,sender_id,receiver_id,body,created_at,read_at,deleted_at FROM messages WHERE conversation_id=$1 AND deleted_at IS NULL ORDER BY created_at ASC',[conversationId]);return r.rows;} return [...memory.messages.values()].filter(m=>m.conversation_id===conversationId&&!m.deleted_at).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)); }
async function createMessage({conversation_id,sender_id,receiver_id,body}){ if(pool){const r=await query('INSERT INTO messages(conversation_id,sender_id,receiver_id,body) VALUES($1,$2,$3,$4) RETURNING *',[conversation_id,sender_id,receiver_id,body]);await query('INSERT INTO notifications(user_id,type,title,body) VALUES($1,\'NEW_MESSAGE\',\'New message\',\'You have a new internal message.\')',[receiver_id]); await audit(sender_id,'PERSONNEL','MESSAGE_SENT',r.rows[0].id,{});return r.rows[0];} const row={id:randomUUID(),conversation_id,sender_id,receiver_id,body,created_at:new Date(),read_at:null,deleted_at:null};memory.messages.set(row.id,row);memory.notifications.push({user_id:receiver_id,type:'NEW_MESSAGE',title:'New message',body:'You have a new internal message.',created_at:new Date(),read_at:null});return row; }
async function markMessageRead(id,userId){ if(pool){const r=await query('UPDATE messages SET read_at=NOW() WHERE id=$1 AND receiver_id=$2 RETURNING *',[id,userId]);if(r.rows[0]) await audit(userId,'PERSONNEL','MESSAGE_READ',id,{});return r.rows[0];}const m=memory.messages.get(id);if(m?.receiver_id===userId)m.read_at=new Date();return m; }
async function deleteMessage(id,userId){ if(pool){const r=await query('UPDATE messages SET deleted_at=NOW() WHERE id=$1 AND sender_id=$2 RETURNING id',[id,userId]);return !!r.rowCount;}const m=memory.messages.get(id);if(!m||m.sender_id!==userId)return false;m.deleted_at=new Date();return true; }
async function unreadCount(userId){ if(pool){const r=await query('SELECT COUNT(*)::int count FROM messages WHERE receiver_id=$1 AND read_at IS NULL AND deleted_at IS NULL',[userId]);return r.rows[0].count;}return [...memory.messages.values()].filter(m=>m.receiver_id===userId&&!m.read_at&&!m.deleted_at).length; }
async function notificationsFor(userId){ if(pool){const r=await query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[userId]);return r.rows;}return memory.notifications.filter(n=>n.user_id===userId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,50); }
async function markNotificationRead(id,userId){ if(pool){const r=await query('UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *',[id,userId]);return r.rows[0];}const n=memory.notifications.find(n=>n.id===id&&n.user_id===userId);if(n)n.read_at=new Date();return n; }
async function audit(actor,role,action,target,metadata,req){ const ip=req?.ip || null; const ua=req?.get?.('user-agent') || null; if(pool){await query('INSERT INTO audit_logs(actor,role,action,target,metadata,ip,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor,role,action,target,JSON.stringify(metadata||{}),ip,ua]);}else memory.audit.push({id:randomUUID(),timestamp:new Date(),actor,role,action,target,metadata,ip,user_agent:ua}); }
async function auditList(){ if(pool){const r=await query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200');return r.rows;}return [...memory.audit].reverse().slice(0,200); }

async function seedIfMemory(){
  if (pool || memory.users.size) return;
  const admin=await createUser({email:config.adminEmail,password:config.adminPassword,role:'ADMIN'});
  const orgs=['Strategic Resilience Unit','Archive Studies Division','Infrastructure Readiness Group','Institutional Analysis Office'];
  const depts=['Operations Support','Strategic Research','Resilience Planning','Archive Management'];
  for(let i=1;i<=60;i++){
    const code=`PX-${String(i).padStart(3,'0')}`; const email=`px${String(i).padStart(3,'0')}@iksn.demo`; const u=await createUser({email,password:config.demoPersonnelPassword,role:'PERSONNEL'});
    await createPersonnel({user_id:u.id,personnel_code:code,full_name:i===1?'Haydar Rahman':['Arman Pratama','Nadia Putri','Raka Wijaya','Satria Anwar'][i%4]+' '+String(i).padStart(2,'0'),codename:['HAYDAR','ORION','NOVA','ARCADIA','VECTOR'][i%5],email,phone:`+62 812 00${String(i).padStart(5,'0')}`,organization:orgs[i%orgs.length],department:depts[i%depts.length],position:['Analyst','Coordinator','Officer','Research Lead'][i%4],rank:['A-1','A-2','B-1','B-2'][i%4],clearance:['C2','C3','C4'][i%3],status:'APPROVED',join_date:`202${i%6}-0${(i%9)+1}-01`,avatar:null});
  }
  await audit(admin.id,'ADMIN','SYSTEM_SEEDED','system',{personnel:60});
}

module.exports = { hashPassword, verifyPassword, findUserByEmail, findUserById, findPersonnelByUserId, findPersonnelById, listPersonnel, createUser, createPersonnel, createAccessRequest, getAccessRequest, listAccessRequests, approveRequest, rejectRequest, createOtp, consumeLatestOtp, updatePersonnelStatus, softDeletePersonnel, setLocationSharing, addLocation, getMyLocation, getAdminLocations, findOrCreateConversation, listConversations, conversationMember, getMessages, createMessage, markMessageRead, deleteMessage, unreadCount, notificationsFor, markNotificationRead, audit, auditList, seedIfMemory };
