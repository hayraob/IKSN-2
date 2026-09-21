const app = document.getElementById('app');
const toastStack = document.getElementById('toast-stack');

const INTERESTS = ['Puisi','Cinta','Kehilangan','Kehidupan','Kesepian','Motivasi','Filosofi','Self-growth','Persahabatan','Keluarga','Alam','Renungan','Nostalgia','Spiritual','Relationship','Cerita'];
const NAV = [
  { key:'home', label:'Beranda', icon:'home' },
  { key:'discover', label:'Temukan', icon:'search' },
  { key:'create', label:'Post', icon:'plus' },
  { key:'messages', label:'Pesan', icon:'message' },
  { key:'account', label:'Akun', icon:'user' }
];

const state = {
  user: null,
  guest: true,
  sse: null,
  audio: null,
  adminTab: 'overview',
  openConversationId: null,
  currentQuote: null
};

const icons = {
  home:'<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  message:'<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-5 5v-5.8A2.5 2.5 0 0 1 3 12.5v-7z"/></svg>',
  user:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.3-3.7 3.7-5.5 7-5.5s5.7 1.8 7 5.5"/></svg>',
  heart:'<svg viewBox="0 0 24 24"><path d="M20.4 5.9c-2-2.3-5.4-1.9-7.2.5L12 7.8l-1.2-1.4C9 4 5.6 3.6 3.6 5.9c-2.5 2.8-1.6 7 1 9.3L12 21l7.4-5.8c2.6-2.3 3.5-6.5 1-9.3z"/></svg>',
  comment:'<svg viewBox="0 0 24 24"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5V13a2.5 2.5 0 0 1-2.5 2.5H10L5 20v-4.5A2.5 2.5 0 0 1 3 13V5.5z"/></svg>',
  repost:'<svg viewBox="0 0 24 24"><path d="m9 7-3 3 3 3"/><path d="M6 10h9a4 4 0 0 1 4 4v1"/><path d="m15 17 3-3-3-3"/><path d="M18 14H9a4 4 0 0 1-4-4V9"/></svg>',
  bell:'<svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9z"/><path d="M10 21h4"/></svg>',
  close:'<svg viewBox="0 0 24 24"><path d="m5 5 14 14M19 5 5 19"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>',
  pause:'<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  logout:'<svg viewBox="0 0 24 24"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M14 8l4 4-4 4M8 12h10"/></svg>'
};

function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function initials(value='?') { return esc(value.slice(0,1).toUpperCase()); }
function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastStack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 320); }, 2800);
}
async function api(path, options={}) {
  const headers = {'Content-Type':'application/json', ...(options.headers || {})};
  const res = await fetch(path, {...options, headers, credentials:'include'});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || 'REQUEST_FAILED'); err.status = res.status; throw err; }
  return data;
}
function routeTo(route) {
  if (route.startsWith('/admin') || route.startsWith('/creator')) window.history.pushState({}, '', route);
  else window.history.pushState({}, '', `#${route.replace(/^\//,'')}`);
  render();
}
function hashParts() { return (location.hash.replace(/^#/,'') || 'home').split('/').filter(Boolean); }
function routeType() {
  if (location.pathname === '/admin') return 'admin';
  if (location.pathname === '/creator') return 'creator';
  const parts = hashParts();
  return parts[0] || 'home';
}
function renderWithTransition(html) {
  const old = app.firstElementChild;
  const mount = () => { app.innerHTML = html; app.firstElementChild?.classList.add('view-enter'); };
  if (!old) return mount();
  old.classList.remove('view-enter'); old.classList.add('view-exit');
  setTimeout(mount, 250);
}
function publicTopbar(title='silent.dt') {
  return `<header class="topbar"><div><div class="brand">${esc(title)}</div>${title==='silent.dt'?'<small>diam · baca · rasa</small>':''}</div><button class="icon-btn" data-action="notifications" aria-label="Notifikasi">${icons.bell}<i class="badge-dot" style="display:none"></i></button></header>`;
}
function bottomNav(active) {
  return `<div class="bottom-nav-wrap"><nav class="bottom-nav">${NAV.map(n => {
    const inner = n.key === 'create' ? `<div class="nav-post">${icons.plus}</div>` : `${icons[n.icon]}<span>${n.label}</span>`;
    return `<button class="nav-item ${active===n.key?'active':''}" data-nav="${n.key}">${inner}</button>`;
  }).join('')}</nav></div>`;
}
function pageShell(inner, active='home') { return `<main class="page">${publicTopbar()}${inner}${bottomNav(active)}</main>`; }
function requireAuth() { if (!state.user) { openAuth('login'); return false; } return true; }

async function loadMe() {
  try { const d = await api('/api/auth/me'); state.user = d.user; state.guest = !d.user; }
  catch { state.user = null; state.guest = true; }
}
function connectSSE() {
  if (!state.user) return;
  if (state.sse) state.sse.close();
  const es = new EventSource('/api/stream');
  es.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'notification') {
        document.querySelectorAll('.badge-dot').forEach(x => x.style.display = 'block');
        toast(data.notification.text);
      }
      if (data.type === 'message') handleLiveMessage(data);
      if (data.type === 'conversation') toast(data.status === 'accepted' ? 'Permintaan pesan diterima.' : 'Permintaan pesan ditolak.');
    } catch {}
  };
  state.sse = es;
}
function handleLiveMessage(data) {
  toast('Pesan baru masuk.');
  if (state.openConversationId === Number(data.conversationId)) {
    const log = document.getElementById('chatLog');
    if (log && data.message.senderId !== state.user?.id) {
      log.insertAdjacentHTML('beforeend', chatBubble(data.message, false));
      log.scrollTop = log.scrollHeight;
    }
  }
  if (routeType() === 'messages') loadConversations();
}
function chatBubble(m, mine) {
  return `<div class="panel" style="max-width:85%;margin-left:${mine?'auto':'0'}"><strong style="font-size:11px">@${esc(m.senderUsername || 'user')}</strong><p style="margin:6px 0 0;white-space:pre-wrap;line-height:1.5;color:#ccc">${esc(m.body)}</p></div>`;
}

function quoteCard(q) {
  const image = q.imageUrl ? `<img src="${esc(q.imageUrl)}" alt="">` : '';
  const music = q.music?.title ? `<div class="music-row" data-inline-audio data-url="${esc(q.music.url||'')}" data-title="${esc(q.music.title)}"><button class="play-btn" data-audio-toggle>${icons.play}</button><div><strong>${esc(q.music.title)}</strong><span>${esc(q.music.artist||'silent.dt')}</span></div></div>` : '';
  return `<article class="quote-card ${q.imageUrl?'':'no-image'}" data-quote="${q.id}"><div class="cover">${image}</div><div class="content"><div class="author-row"><button class="author" data-profile="${esc(q.author.username)}" style="border:0;background:none;padding:0;color:inherit;cursor:pointer;text-align:left"><div class="avatar">${initials(q.author.username)}</div><div><strong>@${esc(q.author.username)}</strong><span>${q.followingAuthor?'Mengikuti · ':''}${esc(q.categories?.[0]||'words')}</span></div></button></div><h3 class="quote-title">${esc(q.title)}</h3><p class="quote-desc">${esc(q.description||'')}</p>${music}<div class="quote-actions"><button class="action ${q.liked?'active':''}" data-like="${q.id}">${icons.heart}<span>${q.likes}</span></button><button class="action" data-comment="${q.id}">${icons.comment}<span>${q.comments}</span></button><button class="action ${q.reposted?'active':''}" data-repost="${q.id}">${icons.repost}<span>${q.reposts}</span></button></div></div></article>`;
}

async function renderHome() {
  renderWithTransition(pageShell(`<section class="hero"><div><div class="eyebrow">silent / dt</div><h1>kata-kata<br>yang diam.</h1><p>Ruang hitam untuk tulisan yang tidak selalu ingin diteriakkan. Baca perlahan. Simpan yang terasa dekat.</p><div class="hero-actions"><button class="btn primary" data-nav="discover">Jelajahi</button>${state.user?'<button class="btn ghost" data-nav="account">Buka akun</button>':'<button class="btn ghost" data-action="auth" data-mode="register">Buat akun</button>'}</div></div></section><div class="section-head"><div><div class="eyebrow">untukmu</div><h2 class="section-title">Yang baru saja lewat.</h2></div><span class="eyebrow">random / fyp</span></div><section id="homeFeed" class="feed"><div class="empty">Memuat tulisan…</div></section>`, 'home'));
  try { const d = await api('/api/quotes?limit=8'); const feed = document.getElementById('homeFeed'); if (feed) feed.innerHTML = d.quotes.map(quoteCard).join('') || '<div class="empty">Belum ada tulisan.</div>'; }
  catch { const feed = document.getElementById('homeFeed'); if (feed) feed.innerHTML = '<div class="empty">Tulisan belum dapat dimuat.</div>'; }
}

async function renderDiscover() {
  const categoryHtml = INTERESTS.slice(0,12).map(x => `<button class="chip" data-category="${esc(x.toLowerCase())}">${esc(x)}</button>`).join('');
  renderWithTransition(pageShell(`<section class="stack" style="padding-top:14px"><div class="section-head"><div><div class="eyebrow">explore</div><h1 class="section-title" style="font-size:42px">Temukan.</h1></div></div><input id="discoverSearch" class="search" placeholder="Cari kata, judul, atau kalimat…"><div id="categoryChips" class="chips">${categoryHtml}</div><div class="section-head"><div><div class="eyebrow">pilihan</div><h2 class="section-title">Tulisan untukmu</h2></div><button class="btn small ghost" data-action="refresh-discover">Acak</button></div><section id="discoverGrid" class="grid-cards"><div class="empty">Memuat…</div></section><div class="section-head"><div><div class="eyebrow">info</div><h2 class="section-title">Kabar silent.dt</h2></div></div><section id="newsList" class="stack"><div class="empty">Memuat…</div></section></section>`, 'discover'));
  await loadDiscover();
}
async function loadDiscover(query='') {
  try {
    const qs = query ? `&q=${encodeURIComponent(query)}` : '';
    const d = await api(`/api/quotes?limit=12${qs}`);
    const grid = document.getElementById('discoverGrid');
    if (grid) grid.innerHTML = d.quotes.map(q => `<article class="mini-card" data-quote="${q.id}">${q.imageUrl?`<img src="${esc(q.imageUrl)}" alt="">`:''}<h3>${esc(q.title)}</h3><p>@${esc(q.author.username)} · ${esc(q.description)}</p></article>`).join('') || '<div class="empty">Tidak ditemukan.</div>';
    const news = await api('/api/news');
    const list = document.getElementById('newsList');
    if (list) list.innerHTML = news.news.map(n => `<article class="panel"><div class="eyebrow">${new Date(n.created_at).toLocaleDateString('id-ID')}</div><h3 style="margin:8px 0 6px">${esc(n.title)}</h3><p style="color:#999;line-height:1.6;white-space:pre-wrap;margin:0">${esc(n.body)}</p></article>`).join('') || '<div class="empty">Belum ada kabar.</div>';
  } catch { toast('Discover gagal dimuat.'); }
}

async function renderQuotePage(id) {
  renderWithTransition(pageShell(`<section id="quoteDetail" class="stack" style="padding-top:14px"><div class="empty">Membuka tulisan…</div></section>`));
  try {
    const [{quote}, comments] = await Promise.all([api(`/api/quotes/${id}`), api(`/api/quotes/${id}/comments`)]);
    state.currentQuote = quote;
    const music = quote.music?.title ? `<div class="music-row" data-inline-audio data-url="${esc(quote.music.url||'')}" data-title="${esc(quote.music.title)}"><button class="play-btn" data-audio-toggle>${icons.play}</button><div><strong>${esc(quote.music.title)}</strong><span>${esc(quote.music.artist||'silent.dt')}</span></div></div>` : '';
    const image = quote.imageUrl ? `<div class="modal-cover"><img src="${esc(quote.imageUrl)}" alt=""></div>` : '';
    const cats = (quote.categories || []).map(esc).join(' · ');
    const commentList = comments.comments.map(commentHtml).join('') || '<div class="empty">Belum ada komentar.</div>';
    const detail = document.getElementById('quoteDetail');
    if (!detail) return;
    detail.innerHTML = `<div class="author-row"><button class="author" data-profile="${esc(quote.author.username)}" style="border:0;background:none;padding:0;color:inherit;cursor:pointer;text-align:left"><div class="avatar">${initials(quote.author.username)}</div><div><strong>@${esc(quote.author.username)}</strong><span>${quote.followingAuthor?'Mengikuti':'Kreator'}</span></div></button><div style="display:flex;gap:8px"><button class="btn small ${quote.followingAuthor?'ghost':'primary'}" data-follow="${quote.authorId}">${quote.followingAuthor?'Mengikuti':'Ikuti'}</button><button class="btn small ghost" data-message-user="${quote.authorId}" data-message-name="${esc(quote.author.username)}">Pesan</button></div></div>${image}<div><div class="eyebrow">${cats}</div><h1 style="font-size:clamp(44px,9vw,88px);line-height:.9;letter-spacing:-.065em;margin:10px 0 12px">${esc(quote.title)}</h1><p style="color:#999;line-height:1.65;max-width:760px;margin:0">${esc(quote.description)}</p></div>${music}<div class="reading">${esc(quote.content)}</div><div class="quote-actions"><button class="action ${quote.liked?'active':''}" data-like="${quote.id}">${icons.heart}<span>${quote.likes}</span></button><button class="action" data-comment="${quote.id}">${icons.comment}<span>${quote.comments}</span></button><button class="action ${quote.reposted?'active':''}" data-repost="${quote.id}">${icons.repost}<span>${quote.reposts}</span></button></div><div class="section-head"><div><div class="eyebrow">respon</div><h2 class="section-title" style="font-size:24px">Komentar</h2></div></div><div class="panel"><form id="commentForm" class="form-grid"><div class="field"><textarea id="commentBody" maxlength="800" placeholder="Tulis sesuatu yang jujur…"></textarea></div><button class="btn primary" type="submit">Kirim komentar</button></form></div><div id="comments" class="comment-list">${commentList}</div>`;
  } catch { const detail = document.getElementById('quoteDetail'); if (detail) detail.innerHTML = '<div class="empty">Tulisan tidak ditemukan.</div>'; }
}
function commentHtml(c) { return `<article class="comment"><strong>@${esc(c.user.username)}</strong><p>${esc(c.body)}</p><time>${new Date(c.createdAt).toLocaleString('id-ID')}</time></article>`; }

async function renderProfile(username) {
  renderWithTransition(pageShell(`<section id="profileView" class="stack"><div class="empty">Membuka profil…</div></section>`));
  try {
    const d = await api(`/api/users/${encodeURIComponent(username)}`);
    const u = d.user;
    const avatar = u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : initials(u.username);
    const works = d.quotes.map(q => `<article class="mini-card" data-quote="${q.id}">${q.image_url?`<img src="${esc(q.image_url)}" alt="">`:''}<h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><p style="margin-top:10px;color:#777">♡ ${q.likes}</p></article>`).join('') || '<div class="empty">Belum ada tulisan.</div>';
    const profile = document.getElementById('profileView');
    if (!profile) return;
    profile.innerHTML = `<section class="profile-head"><div class="profile-avatar">${avatar}</div><div><div class="eyebrow">${u.role==='creator'?'creator':'writer'}</div><h1>@${esc(u.username)}</h1><p>${esc(u.bio||'Tidak ada bio.')}</p><div class="stats"><div class="stat"><strong>${u.followers}</strong><span>pengikut</span></div><div class="stat"><strong>${u.following}</strong><span>mengikuti</span></div><div class="stat"><strong>${d.quotes.length}</strong><span>tulisan</span></div></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn small ${u.isFollowing?'ghost':'primary'}" data-follow="${u.id}">${u.isFollowing?'Mengikuti':'Ikuti'}</button>${state.user&&state.user.id!==u.id?`<button class="btn small ghost" data-message-user="${u.id}" data-message-name="${esc(u.username)}">Pesan</button>`:''}</div></div></section><div class="section-head"><div><div class="eyebrow">karya</div><h2 class="section-title">Tulisan</h2></div></div><section class="grid-cards">${works}</section>`;
  } catch { const profile = document.getElementById('profileView'); if (profile) profile.innerHTML = '<div class="empty">Profil tidak ditemukan.</div>'; }
}

async function renderMessages() {
  renderWithTransition(pageShell(`<section class="stack" style="padding-top:14px"><div class="section-head"><div><div class="eyebrow">private</div><h1 class="section-title" style="font-size:42px">Pesan.</h1></div></div>${state.user?'<div id="conversationList" class="stack"><div class="empty">Memuat percakapan…</div></div>':'<div class="panel"><h2 style="margin:0 0 7px">Ruang pribadi.</h2><p style="color:#999;line-height:1.6">Masuk untuk mengirim pesan. Permintaan awal dibatasi 3 pesan sampai penerima menerimanya.</p><button class="btn primary" data-action="auth" data-mode="login">Masuk</button></div>'}</section>`, 'messages'));
  if (state.user) await loadConversations();
}
async function loadConversations() {
  try {
    const d = await api('/api/messages/conversations');
    const el = document.getElementById('conversationList');
    if (!el) return;
    el.innerHTML = d.conversations.map(c => `<button class="panel" data-conversation="${c.id}" style="text-align:left;cursor:pointer"><div style="display:flex;justify-content:space-between;gap:10px"><strong>@${esc(c.other.username)}</strong><span style="font-size:10px;color:#666">${esc(c.status)}</span></div><p style="margin:6px 0 0;color:#888;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.lastMessage||'Belum ada pesan')}</p></button>`).join('') || '<div class="empty">Belum ada percakapan.</div>';
  } catch { toast('Pesan belum bisa dimuat.'); }
}
async function openConversation(id) {
  const d = await api(`/api/messages/${id}`);
  state.openConversationId = Number(id);
  const pending = d.conversation.status === 'pending';
  const requestedBy = Number(d.conversation.requestedBy);
  const bubbles = d.messages.map(m => chatBubble(m, Number(m.senderId) === Number(state.user.id))).join('');
  const approval = pending && requestedBy !== state.user.id ? `<div style="display:flex;gap:8px;margin-top:14px"><button class="btn primary" data-conv-respond="${id}" data-response="accept">Terima</button><button class="btn ghost" data-conv-respond="${id}" data-response="decline">Tolak</button></div>` : '';
  const hint = pending && requestedBy === state.user.id ? '<div style="color:#666;font-size:10px">Maksimal 3 pesan sebelum diterima.</div>' : '';
  openModal(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">conversation</div><strong>Pesan</strong></div><button class="icon-btn" data-close>${icons.close}</button></div><div class="modal-body"><div id="chatLog" class="stack" style="max-height:52svh;overflow:auto">${bubbles}</div>${approval}<form id="chatForm" class="form-grid" data-conv="${id}" style="margin-top:14px"><div class="field"><textarea id="chatBody" placeholder="Tulis pesan…" maxlength="2000" ${d.conversation.status==='declined'?'disabled':''}></textarea></div><button class="btn primary" type="submit" ${d.conversation.status==='declined'?'disabled':''}>Kirim</button>${hint}</form></div></div>`);
}

function renderAccount() {
  if (!state.user) {
    renderWithTransition(pageShell(`<section class="hero" style="min-height:72svh"><div><div class="eyebrow">your space</div><h1 style="font-size:clamp(56px,12vw,120px)">Masuk.<br>Atau lewat.</h1><p>Jelajah dulu tanpa akun. Saat ingin menyukai, mengikuti, berkomentar, mengirim pesan, atau menulis, barulah buat akunmu.</p><div class="hero-actions"><button class="btn primary" data-action="auth" data-mode="login">Masuk</button><button class="btn ghost" data-action="auth" data-mode="register">Daftar</button></div></div></section>`, 'account'));
    return;
  }
  const u = state.user;
  const interests = (u.interests||[]).map(x=>`<span class="chip">${esc(x)}</span>`).join('');
  renderWithTransition(pageShell(`<section class="profile-head" style="padding-top:26px"><div class="profile-avatar">${u.avatarUrl?`<img src="${esc(u.avatarUrl)}" alt="">`:initials(u.username)}</div><div><div class="eyebrow">${esc(u.role)}</div><h1>@${esc(u.username)}</h1><p>${esc(u.bio||'Tulis bio pendekmu.')}</p><div class="chips" style="margin-top:12px">${interests}</div></div></section><section class="stack" style="margin-top:18px"><button class="panel" data-action="notifications" style="text-align:left"><strong>Notifikasi</strong><span style="display:block;color:#777;font-size:11px;margin-top:6px">Like, follow, komentar, repost, dan pesan masuk.</span></button>${u.role==='creator'?'<button class="panel" data-direct="/creator" style="text-align:left"><strong>Creator Studio</strong><span style="display:block;color:#777;font-size:11px;margin-top:6px">Tulis, edit, dan lihat performa karya.</span></button>':''}<button class="panel" data-action="profile-settings" style="text-align:left"><strong>Profil & preferensi</strong><span style="display:block;color:#777;font-size:11px;margin-top:6px">Pengaturan akun akan tersedia di sini.</span></button><button class="btn ghost" data-action="logout" style="justify-content:flex-start">${icons.logout} Keluar</button></section>`, 'account'));
}
function renderCreate() {
  if (!requireAuth()) return;
  if (state.user.role === 'reader') {
    renderWithTransition(pageShell(`<section class="hero" style="min-height:70svh"><div><div class="eyebrow">post</div><h1>kata-kata<br>ingin keluar?</h1><p>Untuk menerbitkan tulisan, akunmu perlu menjadi kreator. Pilihan ini bisa kamu aktifkan melalui profil.</p><button class="btn primary" data-action="creator-info">Jadi kreator</button></div></section>`, 'create'));
    return;
  }
  showCreateQuoteModal();
}
function showCreateQuoteModal(existing=null) {
  const cats = INTERESTS.slice(0,12).map(x => `<label class="check-chip"><input type="checkbox" name="categories" value="${esc(x.toLowerCase())}" ${(existing?.categories||[]).includes(x.toLowerCase())?'checked':''}><span>${esc(x)}</span></label>`).join('');
  openModal(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">${existing?'edit':'create'}</div><strong>${existing?'Edit tulisan':'Buat tulisan'}</strong></div><button class="icon-btn" data-close>${icons.close}</button></div><div class="modal-body"><form id="quoteForm" class="form-grid" data-id="${existing?.id||''}"><div class="field"><label>Judul</label><input name="title" required maxlength="180" value="${esc(existing?.title||'')}" placeholder="Judul yang tidak berisik"></div><div class="field"><label>Deskripsi</label><input name="description" maxlength="500" value="${esc(existing?.description||'')}" placeholder="Satu kalimat untuk membuka suasana"></div><div class="field"><label>Gambar (URL)</label><input name="imageUrl" value="${esc(existing?.image_url||existing?.imageUrl||'')}" placeholder="https://…"></div><div class="field"><label>Isi</label><textarea name="content" required maxlength="12000" placeholder="Tulis di sini…">${esc(existing?.content||'')}</textarea></div><div class="field"><label>Music URL</label><input name="musicUrl" value="${esc(existing?.music_url||existing?.music?.url||'')}" placeholder="https://…"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="field"><label>Judul musik</label><input name="musicTitle" value="${esc(existing?.music_title||existing?.music?.title||'')}"></div><div class="field"><label>Artist</label><input name="musicArtist" value="${esc(existing?.music_artist||existing?.music?.artist||'')}"></div></div><div class="field"><label>Kategori</label><div class="check-grid">${cats}</div></div><button class="btn primary" type="submit">${existing?'Simpan perubahan':'Terbitkan'}</button></form></div></div>`);
}

async function renderCreator() {
  if (!state.user || state.user.role !== 'creator') { routeTo('/home'); openAuth('login'); return; }
  renderWithTransition(`<main class="page no-nav">${publicTopbar('Creator Studio')}<section id="creatorDash" class="stack"><div class="empty">Memuat studio…</div></section></main>`);
  try {
    const d = await api('/api/creator/dashboard');
    const works = d.quotes.map(q => `<article class="panel" style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><strong>${esc(q.title)}</strong><p style="margin:7px 0 0;color:#777;font-size:11px">♡ ${q.likes} · 💬 ${q.comments} · ↗ ${q.reposts}</p></div><div style="display:flex;gap:7px"><button class="btn small ghost" data-edit-quote="${q.id}">Edit</button><button class="btn small ghost" data-delete-quote="${q.id}">Hapus</button></div></article>`).join('') || '<div class="empty">Belum ada tulisan.</div>';
    const dash = document.getElementById('creatorDash');
    if (!dash) return;
    dash.innerHTML = `<section class="metric-grid"><div class="metric"><strong>${d.quotes.length}</strong><span>tulisan</span></div><div class="metric"><strong>${d.followers}</strong><span>pengikut</span></div><div class="metric"><strong>${d.likes}</strong><span>suka</span></div></section><div class="section-head"><div><div class="eyebrow">studio</div><h1 class="section-title">Karya kamu.</h1></div><button class="btn primary" data-action="create-quote">+ Buat tulisan</button></div><section class="stack">${works}</section>`;
  } catch { const dash = document.getElementById('creatorDash'); if (dash) dash.innerHTML = '<div class="empty">Studio gagal dimuat.</div>'; }
}

async function renderAdmin() {
  if (!state.user || state.user.role !== 'admin') { window.history.pushState({},'', '#home'); openAuth('login'); render(); return; }
  const tabs = [['overview','Overview'],['users','Pengguna'],['activity','Aktivitas'],['quotes','Tulisan'],['news','Berita'],['messages','Pesan']];
  const tabHtml = tabs.map(([k,l]) => `<button class="${state.adminTab===k?'active':''}" data-admin-tab="${k}">${l}</button>`).join('');
  renderWithTransition(`<main class="admin-shell"><aside class="sidebar"><div class="brand">silent.dt<small>admin control</small></div><nav class="side-nav">${tabHtml}</nav><button class="btn ghost" data-action="logout" style="margin-top:24px;width:100%;justify-content:flex-start">${icons.logout} Keluar</button></aside><section class="admin-content"><div id="adminPanel" class="stack"><div class="empty">Memuat…</div></div></section></main>`);
  await loadAdminTab();
}
async function loadAdminTab() {
  const el = document.getElementById('adminPanel'); if (!el) return;
  try {
    if (state.adminTab === 'overview' || state.adminTab === 'activity') {
      const d = await api('/api/admin/dashboard');
      if (state.adminTab === 'overview') {
        const rows = d.logs.map(l => `<tr><td>${new Date(l.created_at).toLocaleString('id-ID')}</td><td>@${esc(l.username||'system')}</td><td>${esc(l.action)}</td><td>${esc(JSON.stringify(l.metadata||{}))}</td></tr>`).join('');
        el.innerHTML = `<div class="section-head"><div><div class="eyebrow">control room</div><h1 class="section-title">Overview.</h1></div></div><div class="metric-grid"><div class="metric"><strong>${d.stats.users}</strong><span>users</span></div><div class="metric"><strong>${d.stats.online}</strong><span>online</span></div><div class="metric"><strong>${d.stats.quotes}</strong><span>quotes</span></div><div class="metric"><strong>${d.stats.news}</strong><span>news</span></div><div class="metric"><strong>${d.stats.messages}</strong><span>messages</span></div></div><div class="section-head"><div><div class="eyebrow">latest</div><h2 class="section-title">Aktivitas terakhir</h2></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Waktu</th><th>User</th><th>Action</th><th>Metadata</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      } else {
        const rows = d.logs.map(l => `<tr><td>${new Date(l.created_at).toLocaleString('id-ID')}</td><td>@${esc(l.username||'system')}</td><td>${esc(l.email||'')}</td><td>${esc(l.role||'')}</td><td>${esc(l.action)}</td></tr>`).join('');
        el.innerHTML = `<div class="section-head"><div><div class="eyebrow">audit</div><h1 class="section-title">Aktivitas.</h1></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Waktu</th><th>User</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      return;
    }
    if (state.adminTab === 'users') {
      const d = await api('/api/admin/users');
      const rows = d.users.map(u => `<tr><td><span class="dot ${u.online?'on':''}"></span>${u.online?'online':'offline'}</td><td>@${esc(u.username)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc((u.interests||[]).join(', '))}</td><td><button class="btn small ghost" data-message-user="${u.id}" data-message-name="${esc(u.username)}">Pesan</button></td></tr>`).join('');
      el.innerHTML = `<div class="section-head"><div><div class="eyebrow">people</div><h1 class="section-title">Pengguna.</h1></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Status</th><th>Username</th><th>Email</th><th>Role</th><th>Minat</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      return;
    }
    if (state.adminTab === 'quotes') {
      const d = await api('/api/admin/quotes');
      const rows = d.quotes.map(q => `<article class="panel" style="display:flex;justify-content:space-between;gap:12px"><div><strong>${esc(q.title)}</strong><p style="margin:7px 0 0;color:#777;font-size:11px">@${esc(q.username)} · ${new Date(q.created_at).toLocaleDateString('id-ID')}</p></div><button class="btn small ghost" data-delete-quote="${q.id}">Hapus</button></article>`).join('') || '<div class="empty">Belum ada tulisan.</div>';
      el.innerHTML = `<div class="section-head"><div><div class="eyebrow">content</div><h1 class="section-title">Semua tulisan.</h1></div><button class="btn primary" data-action="create-quote">+ Tambah</button></div><section class="stack">${rows}</section>`;
      return;
    }
    if (state.adminTab === 'news') {
      const d = await api('/api/news');
      const rows = d.news.map(n => `<article class="panel" style="display:flex;justify-content:space-between;gap:12px"><div><strong>${esc(n.title)}</strong><p style="margin:7px 0 0;color:#777;font-size:11px">${new Date(n.created_at).toLocaleString('id-ID')}</p></div><button class="btn small ghost" data-delete-news="${n.id}">Hapus</button></article>`).join('') || '<div class="empty">Belum ada berita.</div>';
      el.innerHTML = `<div class="section-head"><div><div class="eyebrow">announcements</div><h1 class="section-title">Berita.</h1></div><button class="btn primary" data-action="create-news">+ Buat berita</button></div><section class="stack">${rows}</section>`;
      return;
    }
    if (state.adminTab === 'messages') {
      const d = await api('/api/messages/conversations');
      const rows = d.conversations.map(c => `<button class="panel" data-conversation="${c.id}" style="text-align:left"><strong>@${esc(c.other.username)}</strong><p style="margin:6px 0;color:#777;font-size:11px">${esc(c.lastMessage||'')}</p></button>`).join('') || '<div class="empty">Belum ada percakapan.</div>';
      el.innerHTML = `<div class="section-head"><div><div class="eyebrow">support</div><h1 class="section-title">Pesan.</h1></div></div><section class="stack">${rows}</section>`;
    }
  } catch { el.innerHTML = '<div class="empty">Panel tidak dapat dimuat.</div>'; }
}

function openModal(body) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = body;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  wrap.addEventListener('click', event => { if (event.target === wrap) closeModal(wrap); });
}
function closeModal(element) { const wrap = element || document.querySelector('.modal-backdrop'); if (!wrap) return; wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 260); state.openConversationId = null; }

function openAuth(mode='login') {
  const login = mode === 'login';
  const interestHtml = INTERESTS.map(x => `<label class="check-chip"><input type="checkbox" name="interests" value="${esc(x.toLowerCase())}"><span>${esc(x)}</span></label>`).join('');
  const registerHtml = login ? '' : `<div class="field"><label>Username</label><input name="username" required minlength="3" maxlength="40" placeholder="namamu"></div><div><label style="color:#aaa;font-size:11px">Kamu ingin hadir sebagai…</label><div class="role-pills"><label class="role-pill active"><input type="radio" name="role" value="reader" checked style="display:none"><strong>Pembaca</strong><span>Untuk membaca, menyukai, berkomentar, repost, mengikuti.</span></label><label class="role-pill"><input type="radio" name="role" value="creator" style="display:none"><strong>Kreator</strong><span>Untuk membuat dan menerbitkan tulisanmu sendiri.</span></label></div></div><div class="field"><label>Yang kamu minati</label><div class="check-grid">${interestHtml}</div></div>`;
  openModal(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">silent.dt</div><strong>${login?'Masuk':'Buat akun'}</strong></div><button class="icon-btn" data-close>${icons.close}</button></div><div class="modal-body"><div style="padding:8px 0 20px"><h1 style="font-size:52px;line-height:.9;letter-spacing:-.06em;margin:0">${login?'Welcome back.':'Masuk perlahan.'}</h1><p style="color:#777;line-height:1.6">${login?'Kembali ke ruang kata-kata yang terasa dekat.':'Pilih cara kamu ingin hadir di silent.dt, lalu tentukan apa yang ingin kamu temukan.'}</p></div><form id="authForm" class="form-grid" data-mode="${login?'login':'register'}"><div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div><div class="field"><label>Password</label><input name="password" type="password" required minlength="8" autocomplete="current-password"></div>${registerHtml}<button class="btn primary" type="submit">${login?'Masuk':'Buat akun'}</button></form><div class="auth-switch">${login?'Belum punya akun?':'Sudah punya akun?'} <button type="button" data-auth-switch="${login?'register':'login'}">${login?'Daftar':'Masuk'}</button></div>${login?'<div style="text-align:center;margin-top:18px"><button class="btn ghost small" data-action="skip-guest">Lewati untuk sekarang</button></div>':''}</div></div>`);
}

async function loginFlow(form) {
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    const d = await api('/api/auth/login', {method:'POST',body:JSON.stringify(data)});
    state.user = d.user; state.guest = false; closeModal(); toast('Selamat datang kembali.'); connectSSE();
    if (d.user.role === 'admin') window.history.pushState({},'', '/admin');
    else if (d.user.role === 'creator') window.history.pushState({},'', '/creator');
    else window.history.pushState({},'', '#home');
    render();
  } catch (e) { toast(e.message==='INVALID_CREDENTIALS' ? 'Email atau password salah.' : 'Login gagal.'); }
}
async function registerFlow(form) {
  try {
    const fd = new FormData(form);
    const payload = {email:fd.get('email'),password:fd.get('password'),username:fd.get('username'),role:fd.get('role'),interests:fd.getAll('interests')};
    const d = await api('/api/auth/register', {method:'POST',body:JSON.stringify(payload)});
    state.user = d.user; state.guest = false; closeModal(); toast('Akun berhasil dibuat.'); connectSSE();
    if (d.user.role === 'creator') window.history.pushState({},'', '/creator'); else window.history.pushState({},'', '#home');
    render();
  } catch (e) { toast(e.message==='ACCOUNT_EXISTS' ? 'Username atau email sudah dipakai.' : 'Pendaftaran gagal.'); }
}
async function logout() {
  try { await api('/api/auth/logout', {method:'POST'}); } catch {}
  if (state.sse) state.sse.close(); state.user = null; state.guest = true; window.history.pushState({},'', '#home'); render(); toast('Sampai jumpa.');
}

async function showNotifications() {
  if (!requireAuth()) return;
  try {
    const d = await api('/api/notifications');
    const rows = d.notifications.map(n => `<button class="panel" style="text-align:left"><div style="font-size:12px">${esc(n.text)}</div><div style="font-size:9px;color:#666;margin-top:5px">${new Date(n.created_at).toLocaleString('id-ID')}</div></button>`).join('') || '<div class="empty">Belum ada notifikasi.</div>';
    openModal(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">inbox</div><strong>Notifikasi</strong></div><button class="icon-btn" data-close>${icons.close}</button></div><div class="modal-body"><div class="stack">${rows}</div></div></div>`);
    await api('/api/notifications/read',{method:'POST'});
    document.querySelectorAll('.badge-dot').forEach(x=>x.style.display='none');
  } catch { toast('Notifikasi gagal dimuat.'); }
}
function createNewsModal() {
  openModal(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">admin</div><strong>Berita baru</strong></div><button class="icon-btn" data-close>${icons.close}</button></div><div class="modal-body"><form id="newsForm" class="form-grid"><div class="field"><label>Judul</label><input name="title" required maxlength="180"></div><div class="field"><label>Isi</label><textarea name="body" required maxlength="10000"></textarea></div><div class="field"><label>Gambar URL</label><input name="imageUrl"></div><button class="btn primary" type="submit">Terbitkan</button></form></div></div>`);
}
function messageRequestModal(userId, username) {
  if (!requireAuth()) return;
  if (Number(userId) === Number(state.user.id)) return toast('Kamu tidak bisa mengirim pesan ke diri sendiri.');
  openModal(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">message request</div><strong>@${esc(username)}</strong></div><button class="icon-btn" data-close>${icons.close}</button></div><div class="modal-body"><p style="color:#999;line-height:1.6">Kamu dapat mengirim maksimal 3 pesan sebelum permintaan ini diterima.</p><form id="startMessageForm" data-user="${userId}" class="form-grid"><div class="field"><label>Pesan pertama</label><textarea name="body" required maxlength="2000" placeholder="Tulis sesuatu…"></textarea></div><button class="btn primary" type="submit">Kirim permintaan</button></form></div></div>`);
}
async function saveQuote(form) {
  try {
    const fd = new FormData(form);
    const payload = {title:fd.get('title'),description:fd.get('description'),imageUrl:fd.get('imageUrl'),content:fd.get('content'),musicUrl:fd.get('musicUrl'),musicTitle:fd.get('musicTitle'),musicArtist:fd.get('musicArtist'),categories:fd.getAll('categories')};
    const id = form.dataset.id;
    await api(id ? `/api/quotes/${id}` : '/api/quotes', {method:id?'PUT':'POST',body:JSON.stringify(payload)});
    closeModal(); toast(id?'Tulisan diperbarui.':'Tulisan diterbitkan.');
    if (routeType()==='creator') renderCreator(); else if (routeType()==='admin') loadAdminTab(); else renderHome();
  } catch { toast('Tulisan gagal disimpan.'); }
}
async function deleteQuote(id) {
  if (!confirm('Hapus tulisan ini?')) return;
  try { await api(`/api/quotes/${id}`,{method:'DELETE'}); toast('Tulisan dihapus.'); if (routeType()==='creator') renderCreator(); else if(routeType()==='admin') loadAdminTab(); }
  catch { toast('Tidak bisa menghapus.'); }
}
async function deleteNews(id) {
  if (!confirm('Hapus berita ini?')) return;
  try { await api(`/api/admin/news/${id}`,{method:'DELETE'}); toast('Berita dihapus.'); loadAdminTab(); } catch { toast('Tidak bisa menghapus berita.'); }
}

// Click delegation: explicit data-action / data-* keeps submit buttons from navigating back home.
document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-nav]');
  if (nav) { routeTo(`/${nav.dataset.nav}`); return; }
  const direct = event.target.closest('[data-direct]');
  if (direct) { routeTo(direct.dataset.direct); return; }
  const close = event.target.closest('[data-close]');
  if (close) { closeModal(close.closest('.modal-backdrop')); return; }
  const authSwitch = event.target.closest('[data-auth-switch]');
  if (authSwitch) { closeModal(); setTimeout(() => openAuth(authSwitch.dataset.authSwitch), 280); return; }
  const action = event.target.closest('[data-action]');
  if (action) {
    const a = action.dataset.action;
    if (a==='auth') { openAuth(action.dataset.mode||'login'); return; }
    if (a==='notifications') { await showNotifications(); return; }
    if (a==='logout') { await logout(); return; }
    if (a==='skip-guest') { closeModal(); render(); return; }
    if (a==='refresh-discover') { await loadDiscover(document.getElementById('discoverSearch')?.value||''); return; }
    if (a==='create-quote') { showCreateQuoteModal(); return; }
    if (a==='create-news') { createNewsModal(); return; }
    if (a==='creator-info') { toast('Pendaftaran sebagai kreator tersedia saat membuat akun.'); return; }
    if (a==='profile-settings') { toast('Pengaturan profil akan ditambahkan pada modul berikutnya.'); return; }
  }
  const category = event.target.closest('[data-category]');
  if (category) { document.querySelectorAll('[data-category]').forEach(x=>x.classList.remove('active')); category.classList.add('active'); await loadDiscover(category.dataset.category); return; }
  const quote = event.target.closest('[data-quote]');
  if (quote && !event.target.closest('button')) { routeTo(`/quote/${quote.dataset.quote}`); return; }
  const profile = event.target.closest('[data-profile]');
  if (profile) { routeTo(`/profile/${encodeURIComponent(profile.dataset.profile)}`); return; }
  const like = event.target.closest('[data-like]');
  if (like) { if(!requireAuth()) return; try { const d=await api(`/api/quotes/${like.dataset.like}/like`,{method:'POST'}); like.classList.toggle('active',d.liked); like.querySelector('span').textContent=d.likes; } catch { toast('Like gagal.'); } return; }
  const repost = event.target.closest('[data-repost]');
  if (repost) { if(!requireAuth()) return; try { const d=await api(`/api/quotes/${repost.dataset.repost}/repost`,{method:'POST'}); repost.classList.toggle('active',d.reposted); repost.querySelector('span').textContent=d.reposts; } catch { toast('Repost gagal.'); } return; }
  const comment = event.target.closest('[data-comment]');
  if (comment) { routeTo(`/quote/${comment.dataset.comment}`); return; }
  const follow = event.target.closest('[data-follow]');
  if (follow) { if(!requireAuth()) return; try { const d=await api(`/api/users/${follow.dataset.follow}/follow`,{method:'POST'}); follow.textContent=d.following?'Mengikuti':'Ikuti'; } catch { toast('Follow gagal.'); } return; }
  const msgUser = event.target.closest('[data-message-user]');
  if (msgUser) { messageRequestModal(msgUser.dataset.messageUser,msgUser.dataset.messageName); return; }
  const conversation = event.target.closest('[data-conversation]');
  if (conversation) { try { await openConversation(conversation.dataset.conversation); } catch { toast('Percakapan gagal dibuka.'); } return; }
  const response = event.target.closest('[data-conv-respond]');
  if (response) { try { const d=await api(`/api/messages/${response.dataset.convRespond}/respond`,{method:'POST',body:JSON.stringify({action:response.dataset.response})}); toast(d.status==='accepted'?'Permintaan diterima.':'Permintaan ditolak.'); closeModal(); renderMessages(); } catch { toast('Permintaan gagal diproses.'); } return; }
  const audio = event.target.closest('[data-audio-toggle]');
  if (audio) { toggleAudio(audio); return; }
  const adminTab = event.target.closest('[data-admin-tab]');
  if (adminTab) { state.adminTab=adminTab.dataset.adminTab; renderAdmin(); return; }
  const edit = event.target.closest('[data-edit-quote]');
  if (edit) { try { const d=await api(`/api/quotes/${edit.dataset.editQuote}`); const q=d.quote; showCreateQuoteModal({id:q.id,title:q.title,description:q.description,content:q.content,image_url:q.image_url,categories:q.categories,music:{url:q.music?.url,title:q.music?.title,artist:q.music?.artist}}); } catch { toast('Tulisan tidak ditemukan.'); } return; }
  const delQuote = event.target.closest('[data-delete-quote]');
  if (delQuote) { await deleteQuote(delQuote.dataset.deleteQuote); return; }
  const delNews = event.target.closest('[data-delete-news]');
  if (delNews) { await deleteNews(delNews.dataset.deleteNews); return; }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.id==='authForm') { if(form.dataset.mode==='login') await loginFlow(form); else await registerFlow(form); return; }
  if (form.id==='quoteForm') { if(requireAuth()) await saveQuote(form); return; }
  if (form.id==='newsForm') { try { const payload=Object.fromEntries(new FormData(form).entries()); await api('/api/admin/news',{method:'POST',body:JSON.stringify(payload)}); closeModal(); toast('Berita diterbitkan.'); loadAdminTab(); } catch { toast('Berita gagal dibuat.'); } return; }
  if (form.id==='commentForm') { if(!requireAuth()) return; const id=hashParts()[1]; const body=form.querySelector('textarea').value.trim(); if(!body) return; try { const d=await api(`/api/quotes/${id}/comments`,{method:'POST',body:JSON.stringify({body})}); document.getElementById('comments')?.insertAdjacentHTML('afterbegin',commentHtml(d.comment)); form.reset(); toast('Komentar dikirim.'); } catch { toast('Komentar gagal dikirim.'); } return; }
  if (form.id==='startMessageForm') { try { const body=form.querySelector('textarea').value.trim(); if(!body)return; const d=await api(`/api/messages/start/${form.dataset.user}`,{method:'POST',body:JSON.stringify({body})}); closeModal(); await openConversation(d.conversationId); } catch(e) { toast(e.message==='THREE_MESSAGE_LIMIT'?'Batas 3 pesan tercapai.':'Pesan gagal dikirim.'); } return; }
  if (form.id==='chatForm') { try { const body=document.getElementById('chatBody').value.trim(); if(!body)return; const d=await api(`/api/messages/${form.dataset.conv}/send`,{method:'POST',body:JSON.stringify({body})}); const log=document.getElementById('chatLog'); if(log) { log.insertAdjacentHTML('beforeend',chatBubble(d.message,true)); log.scrollTop=log.scrollHeight; } document.getElementById('chatBody').value=''; } catch(e) { toast(e.message==='THREE_MESSAGE_LIMIT'?'Batas 3 pesan tercapai.':'Pesan gagal dikirim.'); } return; }
});

document.addEventListener('input', event => { if(event.target.id==='discoverSearch') loadDiscover(event.target.value); });
document.addEventListener('change', event => { if(event.target.matches('.role-pill input')) { document.querySelectorAll('.role-pill').forEach(x=>x.classList.remove('active')); event.target.closest('.role-pill')?.classList.add('active'); } });
window.addEventListener('popstate', render);
window.addEventListener('hashchange', render);

function toggleAudio(btn) {
  const holder=btn.closest('[data-inline-audio]'); if(!holder)return;
  const url=holder.dataset.url; if(!url){toast('Belum ada URL musik.');return;}
  if(state.audio && state.audio.src===url) {
    if(state.audio.paused){state.audio.play().then(()=>btn.innerHTML=icons.pause).catch(()=>{});} else {state.audio.pause();btn.innerHTML=icons.play;}
    return;
  }
  if(state.audio) state.audio.pause();
  const audio=new Audio(url); state.audio=audio;
  audio.play().then(()=>btn.innerHTML=icons.pause).catch(()=>toast('Musik tidak bisa diputar dari URL ini.'));
  audio.onended=()=>{btn.innerHTML=icons.play;};
}

function render() {
  const type=routeType();
  if(type==='admin'){renderAdmin();return;}
  if(type==='creator'){renderCreator();return;}
  const parts=hashParts();
  if(parts[0]==='quote' && parts[1]){renderQuotePage(Number(parts[1]));return;}
  if(parts[0]==='profile' && parts[1]){renderProfile(parts[1]);return;}
  if(type==='discover'){renderDiscover();return;}
  if(type==='messages'){renderMessages();return;}
  if(type==='account'){renderAccount();return;}
  if(type==='create'){renderCreate();return;}
  renderHome();
}

(async function boot(){ await loadMe(); connectSSE(); render(); })();
