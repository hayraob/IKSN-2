const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const COOKIE_NAME = 'silent_dt_session';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false }
    : undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const clients = new Map(); // userId -> Set(res)

function publicUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id), username: row.username, email: row.email,
    role: row.role, bio: row.bio || '', interests: row.interests || [],
    avatarUrl: row.avatar_url || '', createdAt: row.created_at,
  };
}

function signSession({ userId, sessionId }) {
  return jwt.sign({ userId: Number(userId), sessionId }, JWT_SECRET, { expiresIn: '30d' });
}

function verifySession(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function getUserFromReq(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = verifySession(token);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [payload.userId]);
    const user = result.rows[0];
    if (!user) return null;
    const session = await pool.query('SELECT id FROM sessions WHERE id = $1 AND user_id = $2', [payload.sessionId, payload.userId]);
    if (!session.rows[0]) return null;
    return { ...publicUser(user), sessionId: payload.sessionId };
  } catch {
    return null;
  }
}

async function auth(req, res, next) {
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
    next();
  };
}

async function logActivity(userId, action, metadata = {}) {
  await pool.query('INSERT INTO activity_logs (user_id, action, metadata) VALUES ($1,$2,$3)', [userId || null, action, metadata]);
}

async function notify(userId, kind, text, link = '') {
  const { rows } = await pool.query(
    'INSERT INTO notifications (user_id, kind, text, link) VALUES ($1,$2,$3,$4) RETURNING *',
    [userId, kind, text, link]
  );
  broadcast(userId, { type: 'notification', notification: rows[0] });
}

function broadcast(userId, payload) {
  const set = clients.get(Number(userId));
  if (!set) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch {}
  }
}

function addSseClient(userId, res) {
  const id = Number(userId);
  if (!clients.has(id)) clients.set(id, new Set());
  clients.get(id).add(res);
}
function removeSseClient(userId, res) {
  const set = clients.get(Number(userId));
  if (!set) return;
  set.delete(res);
  if (!set.size) clients.delete(Number(userId));
}

function normalizeUsername(input) {
  return String(input || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
}
function cleanText(input, max = 2000) { return String(input ?? '').trim().slice(0, max); }
function cleanArray(input, maxItems = 12) {
  if (!Array.isArray(input)) return [];
  return input.map(v => cleanText(v, 40)).filter(Boolean).slice(0, maxItems);
}

async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Attach a PostgreSQL service in Railway.');
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);

  const email = String(process.env.ADMIN_EMAIL || 'admin@silent.local').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || 'Admin123!');
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (!existing.rows.length) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (username,email,password_hash,role,bio,interests) VALUES ($1,$2,$3,'admin',$4,$5)`,
      ['silentadmin', email, hash, 'Platform administrator', ['puisi','kehidupan','filosofi']]
    );
  }

  const creatorEmail = 'demo.creator@silent.local';
  const creatorExisting = await pool.query('SELECT id FROM users WHERE email=$1',[creatorEmail]);
  let demoCreatorId;
  if (creatorExisting.rows[0]) {
    demoCreatorId = creatorExisting.rows[0].id;
  } else {
    const creatorHash = await bcrypt.hash('Creator123!', 12);
    const created = await pool.query(
      `INSERT INTO users (username,email,password_hash,role,bio,interests) VALUES ($1,$2,$3,'creator',$4,$5) RETURNING id`,
      ['sena', creatorEmail, creatorHash, 'Menulis hal-hal yang terlalu pelan untuk disebut keras.', ['puisi','kesepian','kehilangan','kehidupan']]
    );
    demoCreatorId = created.rows[0].id;
  }

  const count = await pool.query('SELECT COUNT(*)::int AS count FROM quotes');
  if (count.rows[0].count === 0) {
    await pool.query(`INSERT INTO quotes (author_id,title,description,content,image_url,music_title,music_artist,categories)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8),($1,$9,$10,$11,$12,$13,$14,$15)`, [
      demoCreatorId,
      'Hal-hal yang tidak terucap', 'Kadang diam bukan berarti tidak punya jawaban.', 'Ada hal-hal yang tidak ingin dijelaskan.\nBukan karena tidak penting,\ntetapi karena terlalu dalam untuk sekadar menjadi kalimat.', '', 'Night Drive', 'silent.dt', ['kesepian','renungan'],
      'Ruang yang tersisa', 'Tentang menerima ruang setelah seseorang pergi.', 'Yang pergi meninggalkan ruang.\nYang tinggal belajar mengisinya\ndengan dirinya sendiri.', '', 'After Hours', 'silent.dt', ['kehilangan','kehidupan']
    ]);
  }
}

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'silent.dt' }); }
  catch { res.status(503).json({ ok: false }); }
});

app.get('/api/config', (_req,res) => res.json({ appName: 'silent.dt' }));

app.post('/api/auth/register', async (req,res) => {
  try {
    const email = cleanText(req.body.email, 160).toLowerCase();
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '');
    const role = req.body.role === 'creator' ? 'creator' : 'reader';
    const interests = cleanArray(req.body.interests);
    const bio = cleanText(req.body.bio, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'INVALID_EMAIL' });
    if (username.length < 3) return res.status(400).json({ error: 'INVALID_USERNAME' });
    if (password.length < 8) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
    const existing = await pool.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length) return res.status(409).json({ error: 'ACCOUNT_EXISTS' });
    const hash = await bcrypt.hash(password, 12);
    const inserted = await pool.query(
      `INSERT INTO users (username,email,password_hash,role,bio,interests) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [username,email,hash,role,bio,interests]
    );
    const user = inserted.rows[0];
    await logActivity(user.id, 'register', { role, interests });
    const sessionId = crypto.randomUUID();
    await pool.query('INSERT INTO sessions (id,user_id) VALUES ($1,$2)', [sessionId, user.id]);
    const token = signSession({ userId: user.id, sessionId });
    res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'lax', maxAge: 30*24*60*60*1000 });
    res.status(201).json({ user: publicUser(user), message: 'ACCOUNT_CREATED' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'REGISTER_FAILED' });
  }
});

app.post('/api/auth/login', async (req,res) => {
  try {
    const email = cleanText(req.body.email, 160).toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const sessionId = crypto.randomUUID();
    await pool.query('INSERT INTO sessions (id,user_id) VALUES ($1,$2)', [sessionId, user.id]);
    await logActivity(user.id, 'login');
    const token = signSession({ userId: user.id, sessionId });
    res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'lax', maxAge: 30*24*60*60*1000 });
    res.json({ user: publicUser(user), redirect: user.role === 'admin' ? '/admin' : user.role === 'creator' ? '/creator' : '/' });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'LOGIN_FAILED' });
  }
});

app.post('/api/auth/logout', auth, async (req,res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE id = $1', [req.user.sessionId]);
    await logActivity(req.user.id, 'logout');
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'LOGOUT_FAILED' }); }
});

app.get('/api/auth/me', async (req,res) => {
  const user = await getUserFromReq(req);
  res.json({ user });
});

app.post('/api/auth/skip', (_req,res)=>res.json({ guest: true }));

app.get('/api/quotes', async (req,res) => {
  try {
    const current = await getUserFromReq(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 30);
    const q = cleanText(req.query.q, 100);
    const category = cleanText(req.query.category, 50);
    const values = [];
    const conditions = ['q.published = TRUE'];
    if (q) { values.push(`%${q}%`); conditions.push(`(q.title ILIKE $${values.length} OR q.description ILIKE $${values.length} OR q.content ILIKE $${values.length})`); }
    if (category) { values.push(category); conditions.push(`$${values.length} = ANY(q.categories)`); }
    values.push(limit);
    const sql = `SELECT q.*, u.username, u.bio AS author_bio,
      (SELECT COUNT(*) FROM quote_likes l WHERE l.quote_id=q.id)::int AS likes_count,
      (SELECT COUNT(*) FROM quote_comments c WHERE c.quote_id=q.id)::int AS comments_count,
      (SELECT COUNT(*) FROM quote_reposts r WHERE r.quote_id=q.id)::int AS reposts_count
      FROM quotes q JOIN users u ON u.id=q.author_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY RANDOM() LIMIT $${values.length}`;
    const { rows } = await pool.query(sql, values);
    let liked = new Set(), reposted = new Set(), following = new Set();
    if (current) {
      const ids = rows.map(r=>Number(r.id));
      if (ids.length) {
        const a = await pool.query('SELECT quote_id FROM quote_likes WHERE user_id=$1 AND quote_id=ANY($2::bigint[])',[current.id,ids]);
        const b = await pool.query('SELECT quote_id FROM quote_reposts WHERE user_id=$1 AND quote_id=ANY($2::bigint[])',[current.id,ids]);
        liked = new Set(a.rows.map(r=>Number(r.quote_id))); reposted = new Set(b.rows.map(r=>Number(r.quote_id)));
        const authors = [...new Set(rows.map(r=>Number(r.author_id)))];
        if (authors.length) { const f=await pool.query('SELECT following_id FROM follows WHERE follower_id=$1 AND following_id=ANY($2::bigint[])',[current.id,authors]); following=new Set(f.rows.map(r=>Number(r.following_id))); }
      }
    }
    res.json({ quotes: rows.map(r=>({
      id:Number(r.id), authorId:Number(r.author_id), author:{ username:r.username, bio:r.author_bio||'' }, title:r.title,
      description:r.description, content:r.content, imageUrl:r.image_url, music:{ url:r.music_url, title:r.music_title, artist:r.music_artist }, categories:r.categories||[],
      likes:Number(r.likes_count), comments:Number(r.comments_count), reposts:Number(r.reposts_count), liked:liked.has(Number(r.id)), reposted:reposted.has(Number(r.id)), followingAuthor:following.has(Number(r.author_id)), createdAt:r.created_at
    }))});
  } catch(e) { console.error(e); res.status(500).json({ error:'QUOTES_FAILED' }); }
});

app.get('/api/quotes/:id', async (req,res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({error:'INVALID_ID'});
  try {
    const current = await getUserFromReq(req);
    const { rows } = await pool.query(`SELECT q.*,u.username,u.bio AS author_bio,
      (SELECT COUNT(*) FROM quote_likes WHERE quote_id=q.id)::int AS likes_count,
      (SELECT COUNT(*) FROM quote_comments WHERE quote_id=q.id)::int AS comments_count,
      (SELECT COUNT(*) FROM quote_reposts WHERE quote_id=q.id)::int AS reposts_count
      FROM quotes q JOIN users u ON u.id=q.author_id WHERE q.id=$1 AND q.published=TRUE`,[id]);
    if (!rows[0]) return res.status(404).json({error:'NOT_FOUND'});
    const q=rows[0];
    let liked=false,reposted=false,followingAuthor=false;
    if(current){
      const a=await pool.query('SELECT 1 FROM quote_likes WHERE quote_id=$1 AND user_id=$2',[id,current.id]); liked=!!a.rows[0];
      const b=await pool.query('SELECT 1 FROM quote_reposts WHERE quote_id=$1 AND user_id=$2',[id,current.id]); reposted=!!b.rows[0];
      const c=await pool.query('SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',[current.id,q.author_id]); followingAuthor=!!c.rows[0];
    }
    res.json({quote:{id,authorId:Number(q.author_id),author:{username:q.username,bio:q.author_bio||''},title:q.title,description:q.description,content:q.content,imageUrl:q.image_url,music:{url:q.music_url,title:q.music_title,artist:q.music_artist},categories:q.categories||[],likes:Number(q.likes_count),comments:Number(q.comments_count),reposts:Number(q.reposts_count),liked,reposted,followingAuthor,createdAt:q.created_at}});
  } catch(e){console.error(e);res.status(500).json({error:'QUOTE_FAILED'});}
});

app.get('/api/quotes/:id/comments', async (req,res)=>{
  const id=Number(req.params.id); if(!Number.isFinite(id))return res.status(400).json({error:'INVALID_ID'});
  try{
    const {rows}=await pool.query(`SELECT c.id,c.body,c.created_at,u.id AS user_id,u.username FROM quote_comments c JOIN users u ON u.id=c.user_id WHERE c.quote_id=$1 ORDER BY c.created_at DESC LIMIT 100`,[id]);
    res.json({comments:rows.map(r=>({id:Number(r.id),body:r.body,createdAt:r.created_at,user:{id:Number(r.user_id),username:r.username}}))});
  }catch(e){res.status(500).json({error:'COMMENTS_FAILED'});}
});

app.post('/api/quotes/:id/like', auth, async (req,res)=>{
  const id=Number(req.params.id); try{
    const existing=await pool.query('SELECT 1 FROM quote_likes WHERE quote_id=$1 AND user_id=$2',[id,req.user.id]);
    let liked;
    if(existing.rows[0]){await pool.query('DELETE FROM quote_likes WHERE quote_id=$1 AND user_id=$2',[id,req.user.id]);liked=false;}
    else{await pool.query('INSERT INTO quote_likes (quote_id,user_id) VALUES ($1,$2)',[id,req.user.id]);liked=true; const q=await pool.query('SELECT author_id,title FROM quotes WHERE id=$1',[id]); if(q.rows[0]&&Number(q.rows[0].author_id)!==req.user.id) await notify(q.rows[0].author_id,'like',`${req.user.username} menyukai tulisan “${q.rows[0].title}”.`,`/quote/${id}`);}
    const c=await pool.query('SELECT COUNT(*)::int AS count FROM quote_likes WHERE quote_id=$1',[id]); res.json({liked,likes:c.rows[0].count});
  }catch(e){res.status(500).json({error:'LIKE_FAILED'});}
});

app.post('/api/quotes/:id/repost', auth, async (req,res)=>{
  const id=Number(req.params.id); try{
    const existing=await pool.query('SELECT 1 FROM quote_reposts WHERE quote_id=$1 AND user_id=$2',[id,req.user.id]);
    let reposted;
    if(existing.rows[0]){await pool.query('DELETE FROM quote_reposts WHERE quote_id=$1 AND user_id=$2',[id,req.user.id]);reposted=false;}
    else{await pool.query('INSERT INTO quote_reposts (quote_id,user_id) VALUES ($1,$2)',[id,req.user.id]);reposted=true; const q=await pool.query('SELECT author_id,title FROM quotes WHERE id=$1',[id]); if(q.rows[0]&&Number(q.rows[0].author_id)!==req.user.id) await notify(q.rows[0].author_id,'repost',`${req.user.username} me-repost tulisan “${q.rows[0].title}”.`,`/quote/${id}`);}
    const c=await pool.query('SELECT COUNT(*)::int AS count FROM quote_reposts WHERE quote_id=$1',[id]); res.json({reposted,reposts:c.rows[0].count});
  }catch(e){res.status(500).json({error:'REPOST_FAILED'});}
});

app.post('/api/quotes/:id/comments', auth, async (req,res)=>{
  const id=Number(req.params.id); const body=cleanText(req.body.body,800); if(!body)return res.status(400).json({error:'EMPTY_COMMENT'});
  try{
    const {rows}=await pool.query('INSERT INTO quote_comments (quote_id,user_id,body) VALUES ($1,$2,$3) RETURNING *',[id,req.user.id,body]);
    const q=await pool.query('SELECT author_id,title FROM quotes WHERE id=$1',[id]); if(q.rows[0]&&Number(q.rows[0].author_id)!==req.user.id) await notify(q.rows[0].author_id,'comment',`${req.user.username} mengomentari tulisan “${q.rows[0].title}”.`,`/quote/${id}`);
    res.status(201).json({comment:{id:Number(rows[0].id),body,createdAt:rows[0].created_at,user:{id:req.user.id,username:req.user.username}}});
  }catch(e){res.status(500).json({error:'COMMENT_FAILED'});}
});

app.post('/api/users/:id/follow', auth, async (req,res)=>{
  const id=Number(req.params.id); if(id===req.user.id)return res.status(400).json({error:'SELF_FOLLOW'});
  try{
    const u=await pool.query('SELECT id,username,role FROM users WHERE id=$1',[id]); if(!u.rows[0])return res.status(404).json({error:'NOT_FOUND'});
    if(u.rows[0].role !== 'creator' && u.rows[0].role !== 'admin') return res.status(400).json({error:'NOT_FOLLOWABLE'});
    const f=await pool.query('SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',[req.user.id,id]); let following;
    if(f.rows[0]){await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2',[req.user.id,id]); following=false;}
    else{await pool.query('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)',[req.user.id,id]); following=true; await notify(id,'follow',`${req.user.username} mulai mengikuti kamu.`,'/user/'+req.user.id);}
    const c=await pool.query('SELECT COUNT(*)::int AS count FROM follows WHERE following_id=$1',[id]); res.json({following,followers:c.rows[0].count});
  }catch(e){res.status(500).json({error:'FOLLOW_FAILED'});}
});

app.get('/api/users/:username', async (req,res)=>{
  try{
    const current=await getUserFromReq(req);
    const u=await pool.query('SELECT id,username,role,bio,interests,avatar_url,created_at FROM users WHERE username=$1',[req.params.username]);
    if(!u.rows[0])return res.status(404).json({error:'NOT_FOUND'});
    const user=u.rows[0];
    const [follower,following,quotes]=await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM follows WHERE following_id=$1',[user.id]),
      pool.query('SELECT COUNT(*)::int AS count FROM follows WHERE follower_id=$1',[user.id]),
      pool.query(`SELECT q.*, (SELECT COUNT(*) FROM quote_likes WHERE quote_id=q.id)::int AS likes_count FROM quotes q WHERE q.author_id=$1 AND q.published=TRUE ORDER BY q.created_at DESC LIMIT 60`,[user.id])
    ]);
    let isFollowing=false;
    if(current){const f=await pool.query('SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2',[current.id,user.id]);isFollowing=!!f.rows[0];}
    res.json({user:{...publicUser(user),followers:follower.rows[0].count,following:following.rows[0].count,isFollowing},quotes:quotes.rows.map(r=>({id:Number(r.id),title:r.title,description:r.description,imageUrl:r.image_url,likes:Number(r.likes_count),createdAt:r.created_at}))});
  }catch(e){res.status(500).json({error:'PROFILE_FAILED'});}
});

app.get('/api/notifications', auth, async (req,res)=>{
  const {rows}=await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id]);
  res.json({notifications:rows});
});
app.post('/api/notifications/read', auth, async (req,res)=>{await pool.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1',[req.user.id]);res.json({ok:true});});

app.get('/api/news', async (_req,res)=>{try{const {rows}=await pool.query(`SELECT n.*,u.username FROM news n JOIN users u ON u.id=n.author_id WHERE n.published=TRUE ORDER BY n.created_at DESC LIMIT 30`);res.json({news:rows});}catch(e){res.status(500).json({error:'NEWS_FAILED'});}});

async function getConversation(userA,userB){
  const a=Math.min(Number(userA),Number(userB)), b=Math.max(Number(userA),Number(userB));
  const {rows}=await pool.query('SELECT * FROM conversations WHERE user_a=$1 AND user_b=$2',[a,b]); return rows[0]||null;
}

app.get('/api/messages/conversations', auth, async (req,res)=>{
  try{
    const {rows}=await pool.query(`SELECT c.*, ua.username AS a_username, ub.username AS b_username,
      (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
      (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at
      FROM conversations c JOIN users ua ON ua.id=c.user_a JOIN users ub ON ub.id=c.user_b
      WHERE c.user_a=$1 OR c.user_b=$1 ORDER BY COALESCE((SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1), c.updated_at) DESC`,[req.user.id]);
    res.json({conversations:rows.map(c=>({id:Number(c.id),status:c.status,requestedBy:Number(c.requested_by),other:{id:Number(c.user_a)===req.user.id?c.user_b:c.user_a,username:Number(c.user_a)===req.user.id?c.b_username:c.a_username},lastMessage:c.last_body||'',lastAt:c.last_at||c.updated_at}))});
  }catch(e){res.status(500).json({error:'CONVERSATIONS_FAILED'});}
});

app.post('/api/messages/start/:userId', auth, async (req,res)=>{
  const recipient=Number(req.params.userId); const body=cleanText(req.body.body,2000); if(!body)return res.status(400).json({error:'EMPTY_MESSAGE'});
  if(recipient===req.user.id)return res.status(400).json({error:'SELF_MESSAGE'});
  try{
    const u=await pool.query('SELECT id,username,role FROM users WHERE id=$1',[recipient]); if(!u.rows[0])return res.status(404).json({error:'NOT_FOUND'});
    let conv=await getConversation(req.user.id,recipient);
    if(!conv){
      const a=Math.min(req.user.id,recipient),b=Math.max(req.user.id,recipient);
      const created=await pool.query('INSERT INTO conversations (user_a,user_b,status,requested_by) VALUES ($1,$2,\'pending\',$3) RETURNING *',[a,b,req.user.id]); conv=created.rows[0];
    }
    if(conv.status==='declined')return res.status(403).json({error:'REQUEST_DECLINED'});
    if(conv.status==='pending'){
      const count=await pool.query('SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id=$1 AND sender_id=$2',[conv.id,req.user.id]);
      if(count.rows[0].count>=3)return res.status(429).json({error:'THREE_MESSAGE_LIMIT'});
    }
    const inserted=await pool.query('INSERT INTO messages (conversation_id,sender_id,body) VALUES ($1,$2,$3) RETURNING *',[conv.id,req.user.id,body]);
    await pool.query('UPDATE conversations SET updated_at=NOW() WHERE id=$1',[conv.id]);
    await notify(recipient,'message_request',`${req.user.username} mengirim pesan kepadamu.`,`/messages/${conv.id}`);
    broadcast(recipient,{type:'message',conversationId:Number(conv.id),message:{id:Number(inserted.rows[0].id),senderId:req.user.id,body,createdAt:inserted.rows[0].created_at}});
    res.status(201).json({conversationId:Number(conv.id),status:conv.status,message:{id:Number(inserted.rows[0].id),senderId:req.user.id,body,createdAt:inserted.rows[0].created_at}});
  }catch(e){console.error(e);res.status(500).json({error:'MESSAGE_SEND_FAILED'});}
});

app.post('/api/messages/:conversationId/send', auth, async (req,res)=>{
  const id=Number(req.params.conversationId);
  const body=cleanText(req.body.body,2000);
  if(!body)return res.status(400).json({error:'EMPTY_MESSAGE'});
  const c=await pool.query('SELECT * FROM conversations WHERE id=$1',[id]);
  if(!c.rows[0])return res.status(404).json({error:'NOT_FOUND'});
  const conv=c.rows[0];
  if(![Number(conv.user_a),Number(conv.user_b)].includes(req.user.id))return res.status(403).json({error:'FORBIDDEN'});
  if(conv.status==='declined')return res.status(403).json({error:'REQUEST_DECLINED'});
  if(conv.status==='pending') {
    const count=await pool.query('SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id=$1 AND sender_id=$2',[id,req.user.id]);
    if(count.rows[0].count>=3)return res.status(429).json({error:'THREE_MESSAGE_LIMIT'});
  }
  const inserted=await pool.query('INSERT INTO messages (conversation_id,sender_id,body) VALUES ($1,$2,$3) RETURNING *',[id,req.user.id,body]);
  await pool.query('UPDATE conversations SET updated_at=NOW() WHERE id=$1',[id]);
  const other=Number(conv.user_a)===req.user.id?Number(conv.user_b):Number(conv.user_a);
  await notify(other,'message',`${req.user.username} mengirim pesan baru.`,`/messages/${id}`);
  broadcast(other,{type:'message',conversationId:id,message:{id:Number(inserted.rows[0].id),senderId:req.user.id,senderUsername:req.user.username,body,createdAt:inserted.rows[0].created_at}});
  res.status(201).json({message:{id:Number(inserted.rows[0].id),senderId:req.user.id,senderUsername:req.user.username,body,createdAt:inserted.rows[0].created_at}});
});

app.post('/api/messages/:conversationId/respond', auth, async (req,res)=>{
  const id=Number(req.params.conversationId), action=req.body.action;
  if(!['accept','decline'].includes(action))return res.status(400).json({error:'INVALID_ACTION'});
  const c=await pool.query('SELECT * FROM conversations WHERE id=$1',[id]); if(!c.rows[0])return res.status(404).json({error:'NOT_FOUND'}); const conv=c.rows[0];
  if(![Number(conv.user_a),Number(conv.user_b)].includes(req.user.id))return res.status(403).json({error:'FORBIDDEN'});
  if(conv.status!=='pending')return res.json({status:conv.status});
  if(action==='accept'){
    await pool.query('UPDATE conversations SET status=\'accepted\',updated_at=NOW() WHERE id=$1',[id]);
    const other=Number(conv.user_a)===req.user.id?Number(conv.user_b):Number(conv.user_a); await notify(other,'message_accepted',`${req.user.username} menerima permintaan pesanmu.`,`/messages/${id}`);
    broadcast(other,{type:'conversation',conversationId:id,status:'accepted'});
  }else{
    await pool.query('UPDATE conversations SET status=\'declined\',updated_at=NOW() WHERE id=$1',[id]);
    const other=Number(conv.user_a)===req.user.id?Number(conv.user_b):Number(conv.user_a); await notify(other,'message_declined',`${req.user.username} menolak permintaan pesanmu.`,`/messages/${id}`);
    broadcast(other,{type:'conversation',conversationId:id,status:'declined'});
  }
  res.json({status:action==='accept'?'accepted':'declined'});
});

app.get('/api/messages/:conversationId', auth, async (req,res)=>{
  const id=Number(req.params.conversationId); const c=await pool.query('SELECT * FROM conversations WHERE id=$1',[id]); if(!c.rows[0])return res.status(404).json({error:'NOT_FOUND'}); const conv=c.rows[0];
  if(![Number(conv.user_a),Number(conv.user_b)].includes(req.user.id))return res.status(403).json({error:'FORBIDDEN'});
  const {rows}=await pool.query('SELECT m.*,u.username FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1 ORDER BY m.created_at ASC',[id]);
  res.json({conversation:{id,status:conv.status,requestedBy:Number(conv.requested_by)},messages:rows.map(m=>({id:Number(m.id),senderId:Number(m.sender_id),senderUsername:m.username,body:m.body,createdAt:m.created_at}))});
});

app.get('/api/stream', auth, async (req,res)=>{
  res.set({ 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', Connection:'keep-alive' });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({type:'connected'})}\n\n`);
  addSseClient(req.user.id,res);
  const interval=setInterval(()=>{try{res.write(': ping\n\n'); pool.query('UPDATE sessions SET last_seen_at=NOW() WHERE id=$1',[req.user.sessionId]).catch(()=>{});}catch{}},25000);
  req.on('close',()=>{clearInterval(interval);removeSseClient(req.user.id,res);});
});

app.post('/api/quotes', auth, requireRole('creator','admin'), async (req,res)=>{
  const title=cleanText(req.body.title,180); const description=cleanText(req.body.description,500); const content=cleanText(req.body.content,12000); const imageUrl=cleanText(req.body.imageUrl,2000); const musicUrl=cleanText(req.body.musicUrl,2000); const musicTitle=cleanText(req.body.musicTitle,180); const musicArtist=cleanText(req.body.musicArtist,180); const categories=cleanArray(req.body.categories);
  if(!title||!content)return res.status(400).json({error:'TITLE_CONTENT_REQUIRED'});
  try{const {rows}=await pool.query(`INSERT INTO quotes (author_id,title,description,content,image_url,music_url,music_title,music_artist,categories,published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[req.user.id,title,description,content,imageUrl,musicUrl,musicTitle,musicArtist,categories,req.body.published!==false]); res.status(201).json({quote:rows[0]});}catch(e){console.error(e);res.status(500).json({error:'QUOTE_CREATE_FAILED'});}
});

app.put('/api/quotes/:id', auth, requireRole('creator','admin'), async (req,res)=>{
  const id=Number(req.params.id); const owner=await pool.query('SELECT author_id FROM quotes WHERE id=$1',[id]); if(!owner.rows[0])return res.status(404).json({error:'NOT_FOUND'}); if(req.user.role!=='admin'&&Number(owner.rows[0].author_id)!==req.user.id)return res.status(403).json({error:'FORBIDDEN'});
  const title=cleanText(req.body.title,180); const description=cleanText(req.body.description,500); const content=cleanText(req.body.content,12000); const imageUrl=cleanText(req.body.imageUrl,2000); const musicUrl=cleanText(req.body.musicUrl,2000); const musicTitle=cleanText(req.body.musicTitle,180); const musicArtist=cleanText(req.body.musicArtist,180); const categories=cleanArray(req.body.categories);
  try{const {rows}=await pool.query(`UPDATE quotes SET title=$1,description=$2,content=$3,image_url=$4,music_url=$5,music_title=$6,music_artist=$7,categories=$8,published=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,[title,description,content,imageUrl,musicUrl,musicTitle,musicArtist,categories,req.body.published!==false,id]);res.json({quote:rows[0]});}catch(e){res.status(500).json({error:'QUOTE_UPDATE_FAILED'});}
});
app.delete('/api/quotes/:id', auth, requireRole('creator','admin'), async (req,res)=>{const id=Number(req.params.id);const owner=await pool.query('SELECT author_id FROM quotes WHERE id=$1',[id]);if(!owner.rows[0])return res.status(404).json({error:'NOT_FOUND'});if(req.user.role!=='admin'&&Number(owner.rows[0].author_id)!==req.user.id)return res.status(403).json({error:'FORBIDDEN'});await pool.query('DELETE FROM quotes WHERE id=$1',[id]);res.json({ok:true});});

app.get('/api/creator/dashboard', auth, requireRole('creator'), async (req,res)=>{
  const [quotes,followers,likes]=await Promise.all([
    pool.query(`SELECT q.id,q.title,q.description,q.image_url,q.created_at,(SELECT COUNT(*) FROM quote_likes WHERE quote_id=q.id)::int AS likes,(SELECT COUNT(*) FROM quote_comments WHERE quote_id=q.id)::int AS comments,(SELECT COUNT(*) FROM quote_reposts WHERE quote_id=q.id)::int AS reposts FROM quotes q WHERE q.author_id=$1 ORDER BY q.created_at DESC`,[req.user.id]),
    pool.query('SELECT COUNT(*)::int AS count FROM follows WHERE following_id=$1',[req.user.id]),
    pool.query('SELECT COUNT(*)::int AS count FROM quote_likes l JOIN quotes q ON q.id=l.quote_id WHERE q.author_id=$1',[req.user.id])
  ]); res.json({quotes:quotes.rows,followers:followers.rows[0].count,likes:likes.rows[0].count});
});

app.get('/api/admin/dashboard', auth, requireRole('admin'), async (_req,res)=>{
  const [users,online,quotes,news,logs,messages]=await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM users WHERE role<>\'admin\''),
    pool.query(`SELECT COUNT(DISTINCT user_id)::int AS count FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role<> 'admin' AND s.last_seen_at > NOW() - INTERVAL '60 seconds'`),
    pool.query('SELECT COUNT(*)::int AS count FROM quotes'),
    pool.query('SELECT COUNT(*)::int AS count FROM news'),
    pool.query(`SELECT a.*,u.username,u.email,u.role FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100`),
    pool.query('SELECT COUNT(*)::int AS count FROM messages')
  ]);
  res.json({stats:{users:users.rows[0].count,online:online.rows[0].count,quotes:quotes.rows[0].count,news:news.rows[0].count,messages:messages.rows[0].count},logs:logs.rows});
});
app.get('/api/admin/users', auth, requireRole('admin'), async (_req,res)=>{const {rows}=await pool.query(`SELECT u.id,u.username,u.email,u.role,u.interests,u.created_at,EXISTS(SELECT 1 FROM sessions s WHERE s.user_id=u.id AND s.last_seen_at > NOW() - INTERVAL '60 seconds') AS online FROM users u ORDER BY u.created_at DESC`);res.json({users:rows.map(u=>({...publicUser(u),online:u.online}))});});

app.post('/api/admin/news', auth, requireRole('admin'), async (req,res)=>{const title=cleanText(req.body.title,180),body=cleanText(req.body.body,10000),imageUrl=cleanText(req.body.imageUrl,2000);if(!title||!body)return res.status(400).json({error:'REQUIRED'});const {rows}=await pool.query('INSERT INTO news (author_id,title,body,image_url,published) VALUES ($1,$2,$3,$4,$5) RETURNING *',[req.user.id,title,body,imageUrl,req.body.published!==false]);res.status(201).json({news:rows[0]});});
app.put('/api/admin/news/:id', auth, requireRole('admin'), async (req,res)=>{const id=Number(req.params.id);const title=cleanText(req.body.title,180),body=cleanText(req.body.body,10000),imageUrl=cleanText(req.body.imageUrl,2000);const {rows}=await pool.query('UPDATE news SET title=$1,body=$2,image_url=$3,published=$4,updated_at=NOW() WHERE id=$5 RETURNING *',[title,body,imageUrl,req.body.published!==false,id]);res.json({news:rows[0]});});
app.delete('/api/admin/news/:id', auth, requireRole('admin'), async (req,res)=>{await pool.query('DELETE FROM news WHERE id=$1',[Number(req.params.id)]);res.json({ok:true});});

// Admin can create quotes as well and can inspect conversations through normal message APIs.
app.get('/api/admin/quotes', auth, requireRole('admin'), async (_req,res)=>{const {rows}=await pool.query(`SELECT q.*,u.username FROM quotes q JOIN users u ON u.id=q.author_id ORDER BY q.created_at DESC LIMIT 200`);res.json({quotes:rows});});

// Serve frontend.
app.use(express.static(path.join(__dirname,'public'), { extensions:['html'] }));
app.use((req,res,next)=>{
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(__dirname,'public','index.html'));
  next();
});

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error:'SERVER_ERROR' }); });

async function start(){
  try{ await initDb(); app.listen(PORT,()=>console.log(`silent.dt listening on ${PORT}`)); }
  catch(e){ console.error('Startup failed:',e.message); process.exit(1); }
}
start();
