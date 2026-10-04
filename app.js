/* THUNDER CHAMPION'S - single page app (vanilla JS + Supabase) */
(() => {
'use strict';
const C = window.TC_CONFIG;
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '৳' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDT = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const PH = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'><rect width='100%' height='100%' fill='#0d120f'/><text x='50%' y='52%' fill='#1f2b23' font-size='120' font-family='sans-serif' font-weight='700' text-anchor='middle'>TC</text></svg>");
const src = u => esc(u || PH);
const SOC = { facebook: ['f', '#1877F2', 'Facebook'], youtube: ['▶', '#FF0000', 'YouTube'], tiktok: ['♪', '#111', 'TikTok'], discord: ['D', '#5865F2', 'Discord'] };
const socialLinks = T => Object.keys(SOC).filter(k => T[k]).map(k => { const [g, c, l] = SOC[k];
  return `<a href="${esc(T[k])}" target="_blank" rel="noopener" class="soc-ic" style="--sc:${c}"><span>${g}</span>${l}</a>`; }).join('');
const S = { team: {}, user: null, admin: false, manager: false, member: false, pending: false, me: null };
let chan = null, dip = null;

/* ---------- UI helpers ---------- */
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 3200);
}
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="box panel">${html}</div>`;
  m.addEventListener('mousedown', e => { if (e.target === m) m.remove(); });
  m.addEventListener('click', e => { if (e.target.closest('[data-x]')) m.remove(); });
  $('#modalRoot').append(m); return m;
}
function reveal(root = document) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; e.target.classList.add('vis'); io.unobserve(e.target);
    if (e.target.dataset.count !== undefined) count(e.target);
  }), { threshold: .12 });
  $$('.rv,[data-count]', root).forEach(el => io.observe(el));
}
function count(el) {
  const end = +el.dataset.count, isM = el.dataset.money !== undefined, t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0) / 1200), v = Math.round(end * (1 - Math.pow(1 - p, 3)));
    el.textContent = isM ? money(v) : v.toLocaleString(); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------- storage / forms ---------- */
async function compress(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bm = await createImageBitmap(file), s = Math.min(1, 1600 / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/webp', .86));
    if (b) return new File([b], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
  } catch { }
  return file;
}
async function upload(bucket, file) {
  file = await compress(file);
  const path = `${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
const toLocal = d => { const t = new Date(d); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
function fieldHTML(f, v) {
  const n = f.k, l = esc(f.l), val = v ?? '';
  if (f.t === 'textarea') return `<label>${l}<textarea name="${n}">${esc(val)}</textarea></label>`;
  if (f.t === 'select') return `<label>${l}<select name="${n}">${f.o.map(o => `<option ${o == val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  if (f.t === 'bool') return `<label><span><input type="checkbox" name="${n}" ${v ? 'checked' : ''}> ${l}</span></label>`;
  if (f.t === 'image' || f.t === 'video') return `<label>${l}<input type="file" accept="${f.t}/*" data-b="${f.b}" data-for="${n}"><input type="url" name="${n}" value="${esc(val)}" placeholder="Upload above or paste a link">${f.t === 'image' && val ? `<img class="prev" src="${esc(val)}" alt="">` : ''}</label>`;
  const type = { number: 'number', date: 'date', datetime: 'datetime-local', email: 'email', url: 'url' }[f.t] || 'text';
  const shown = f.t === 'datetime' && val ? toLocal(val) : val;
  return `<label>${l}<input type="${type}" name="${n}" value="${esc(shown)}" ${f.t === 'number' ? 'step="any"' : ''} ${f.req ? 'required' : ''}></label>`;
}
function readForm(root, fields) {
  const o = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.k}"]`); if (!el) continue;
    let v;
    if (f.t === 'bool') v = el.checked;
    else {
      v = el.value.trim();
      if (v === '') v = null;
      else if (f.t === 'number') v = Number(v);
      else if (f.t === 'datetime') v = new Date(v).toISOString();
      else if (f.t === 'email') v = v.toLowerCase();
    }
    o[f.k] = v;
  }
  return o;
}
document.addEventListener('change', async e => {
  const el = e.target;
  if (!el.matches || !el.matches('input[type=file][data-b]') || !el.files[0]) return;
  const tgt = el.parentElement.querySelector(`[name="${el.dataset.for}"]`);
  el.disabled = true; toast('Uploading…');
  try { tgt.value = await upload(el.dataset.b, el.files[0]); toast('Uploaded'); }
  catch (err) { toast(err.message, 1); }
  el.disabled = false;
});
function editModal(title, fields, values, onSave) {
  const m = modal(`<h3>${esc(title)}</h3><form class="f">${fields.map(f => fieldHTML(f, values?.[f.k])).join('')}
    <div class="row"><button class="btn pri" type="submit">Save changes</button><button class="btn" type="button" data-x>Cancel</button></div></form>`);
  $('form', m).addEventListener('submit', async e => {
    e.preventDefault(); const b = $('button[type=submit]', m); b.disabled = true;
    try { await onSave(readForm(m, fields)); m.remove(); } catch (err) { toast(err.message, 1); b.disabled = false; }
  });
}

/* ---------- auth / roles ---------- */
async function loadRoles() {
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null; S.admin = S.manager = S.coach = S.staff = S.member = S.pending = S.captain = false; S.role = null; S.me = null;
  if (!S.user) return;
  const [r, mm] = await Promise.all([sb.rpc('my_role'), sb.rpc('is_member')]);
  S.role = r.data || null; S.admin = S.role === 'admin'; S.manager = ['admin', 'manager'].includes(S.role);
  S.coach = ['admin', 'coach'].includes(S.role); S.staff = !!S.role; S.member = !!mm.data;
  const { data } = await sb.from('players').select('*').eq('email', S.user.email.toLowerCase()).maybeSingle();
  S.me = data; S.captain = S.manager || !!(data && data.is_captain);
  S.pending = !S.staff && !(data && data.approved);
}
sb.auth.onAuthStateChange(ev => {
  if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(async () => { await loadRoles(); nav(); route(); }, 0);
});

/* ---------- chrome: brand / nav / footer ---------- */
function brand() {
  const T = S.team; document.title = `${T.name || 'TC'} | ${T.short_name || ''}`;
  const l = $('#brandLogo'); if (T.logo_url) { l.src = T.logo_url; l.style.display = ''; } else l.style.display = 'none';
  $('#brandName').textContent = T.short_name || T.name || 'TC';
}
const LINKS = [['', 'Home'], ['squad', 'Squad'], ['management', 'Management'], ['achievements', 'Achievements'], ['team', 'Team']];
function nav() {
  const cur = location.hash.slice(2).split('/')[0];
  let h = LINKS.map(([p, l]) => `<a href="#/${p}" class="${cur === p ? 'on' : ''}">${l}</a>`).join('');
  h += `<a href="#/coaching" class="${cur === 'coaching' || cur === 'strategy' ? 'on' : ''}">Coaching Zone</a>`;
  if (S.member) h += `<a href="#/finance" class="${cur === 'finance' ? 'on' : ''}">Finance</a>`;
  if (S.manager) h += `<a href="#/admin" class="${cur === 'admin' ? 'on' : ''}">Admin</a>`;
  if (S.coach) h += `<a href="#/coach" class="${cur === 'coach' ? 'on' : ''}">Coaching Admin</a>`;
  h += S.user ? `<button data-act="logout">Log out</button>` : `<a class="cta" href="#/login">Log in</a>`;
  $('#nav').innerHTML = h; $('#nav').classList.remove('open'); $('#burger').setAttribute('aria-expanded', 'false');
}
function footer() {
  const T = S.team, soc = socialLinks(T);
  $('#foot').innerHTML = `<div class="wrap"><div class="cols">
    <div><h4>${esc(T.name)}</h4><p>${esc(T.tagline)}</p><br><div class="social">${soc}</div></div>
    <div><h4>Explore</h4><ul>${LINKS.concat([['coaching', 'Coaching Zone']]).map(([p, l]) => `<li><a href="#/${p}">${l}</a></li>`).join('')}</ul></div>
    <div><h4>Contact</h4><ul>${T.contact ? `<li>${esc(T.contact)}</li>` : ''}${T.email ? `<li><a href="mailto:${esc(T.email)}">${esc(T.email)}</a></li>` : ''}</ul><br>
    <button class="btn pri sm" data-act="install">Download the app</button></div></div>
    <div class="copy"><span>© ${new Date().getFullYear()} ${esc(T.name)}. ${esc(T.copyright || '')}
    ${T.policy ? ` <a href="#" data-act="policy" style="text-decoration:underline">Copyright policy</a>` : ''}</span>
    <span class="dev-credit">${T.developer_image_url ? `<img src="${esc(T.developer_image_url)}" alt="">` : ''}${T.developer ? (T.developer_link ? `<a href="${esc(T.developer_link)}" target="_blank" rel="noopener">Developed by ${esc(T.developer)}</a>` : 'Developed by ' + esc(T.developer)) : ''}</span></div></div>`;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (a) {
    const k = a.dataset.act;
    if (k === 'logout') { e.preventDefault(); sb.auth.signOut(); location.hash = '#/'; }
    if (k === 'policy') { e.preventDefault(); modal(`<h3>Copyright policy</h3><p style="white-space:pre-wrap">${esc(S.team.policy)}</p><br><button class="btn" data-x>Close</button>`); }
    if (k === 'install') installApp();
  }
  if (e.target.closest('#nav a')) $('#nav').classList.remove('open');
});
$('#burger').addEventListener('click', () => { const o = $('#nav').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', o); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); dip = e; });
function installApp() {
  if (S.team.app_url) return window.open(S.team.app_url, '_blank', 'noopener');
  if (dip) { dip.prompt(); return; }
  modal(`<h3>Install the app</h3><p class="mut">Android (Chrome): open the browser menu and tap <b>Install app</b> / <b>Add to Home screen</b>.<br><br>iPhone (Safari): tap <b>Share</b>, then <b>Add to Home Screen</b>.<br><br>Desktop (Chrome/Edge): click the install icon in the address bar.</p><br><button class="btn" data-x>Close</button>`);
}

/* ---------- router ---------- */
const R = {};
async function route() {
  if (chan) { sb.removeChannel(chan); chan = null; }
  if (window._slideT) { clearInterval(window._slideT); window._slideT = null; }
  const [p, arg] = location.hash.slice(2).split('/'); const v = $('#view');
  v.classList.remove('in'); nav();
  try { await (R[p || 'home'] || R.home)(v, arg); } catch (e) { v.innerHTML = `<div class="wrap sec"><p class="err">${esc(e.message || e)}</p></div>`; }
  requestAnimationFrame(() => v.classList.add('in')); reveal(v); window.scrollTo(0, 0);
  $('#splash').classList.add('off');
}
window.addEventListener('hashchange', route);
const lock = (v, msg) => v.innerHTML = `<div class="wrap lock"><h2>Members only</h2><p class="mut">${msg}</p><br><a class="btn pri" href="#/login">Log in</a></div>`;
const memberLock = v => S.pending
  ? (v.innerHTML = `<div class="wrap lock"><h2>অনুমোদনের অপেক্ষায়</h2><p class="mut">তোমার অ্যাকাউন্ট তৈরি হয়েছে, কিন্তু Admin এখনো অনুমোদন করেনি। অনুমোদন হলে এই সেকশন খুলে যাবে।</p></div>`)
  : lock(v, 'এই সেকশন শুধু টিম মেম্বারদের জন্য। তোমার UID আর পাসওয়ার্ড দিয়ে লগইন করো।');

/* ---------- public pages ---------- */
const tagIgn = ign => { const t = S.team.short_name || 'TC'; return String(ign).toUpperCase().startsWith(t.toUpperCase() + ' ') ? ign : `${t} ${ign}`; };
const pcard = p => `<a class="pcard rv" href="#/player/${p.id}">${p.game_role ? `<span class="badge">${esc(p.game_role)}</span>` : ''}
  <div class="ph"><img loading="lazy" decoding="async" src="${src(p.image_url)}" alt="${esc(p.full_name || p.ign)}"></div>
  <div class="meta"><h3>${esc(p.full_name || p.ign)}</h3><p>${esc(tagIgn(p.ign))}</p></div></a>`;

R.home = async v => {
  const T = S.team;
  const [pl, ac] = await Promise.all([
    sb.from('players').select('id,ign,full_name,game_role,image_url,kills,tournaments,earnings').order('sort').order('id'),
    sb.from('achievements').select('*').order('date', { ascending: false, nullsFirst: false }).limit(3)]);
  const P = pl.data || [], sum = k => P.reduce((a, p) => a + Number(p[k] || 0), 0);
  v.innerHTML = `<section class="hero">${T.cover_url ? `<img class="cover" src="${esc(T.cover_url)}" alt="">` : ''}
    <div class="wrap inner"><div><h1>${esc(T.name)}</h1><p class="tag">${esc(T.tagline)}</p>
    <div class="row"><a class="btn pri" href="#/squad">Meet the squad</a><a class="btn" href="#/achievements">Our achievements</a></div></div>
    ${T.logo_url ? `<img class="logo" src="${esc(T.logo_url)}" alt="${esc(T.name)} logo">` : `<div class="mono">${esc(T.short_name)}</div>`}</div></section>
  <section class="sec"><div class="wrap"><div class="stats">
    <div class="stat panel rv"><b data-count="${P.length}">0</b><span>Players in the squad</span></div>
    <div class="stat panel rv"><b data-count="${sum('tournaments')}">0</b><span>Tournaments played</span></div>
    <div class="stat panel rv"><b data-count="${sum('kills')}">0</b><span>Total kills</span></div>
    <div class="stat panel rv"><b data-count="${sum('earnings')}" data-money>0</b><span>Total earnings</span></div></div></div></section>
  ${P.length ? `<section class="sec"><div class="wrap"><h2>Squad spotlight</h2><p class="sub">Our players, one at a time. Tap to open a profile.</p><div class="slideshow panel" id="slide"></div></div></section>` : ''}
  ${(ac.data || []).length ? `<section class="sec"><div class="wrap"><h2>Latest achievements</h2><br><div class="tl">${ac.data.map(achItem).join('')}</div></div></section>` : ''}
  ${T.description ? `<section class="sec"><div class="wrap"><h2>About us</h2><p class="sub">${esc(T.description)}</p></div></section>` : ''}`;
  initSlideshow(P);
};
function initSlideshow(players) {
  const el = $('#slide'); if (!el || !players.length) return;
  el.innerHTML = players.map(p => `<a class="slide" href="#/player/${p.id}"><img loading="lazy" src="${src(p.image_url)}" alt=""><div class="cap"><h3>${esc(p.full_name || p.ign)}</h3><span>${esc(tagIgn(p.ign))}${p.game_role ? ' · ' + esc(p.game_role) : ''}</span></div></a>`).join('')
    + `<div class="dots">${players.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>`;
  const slides = $$('.slide', el), dots = $$('.dots i', el); let idx = 0;
  const show = n => { idx = (n + players.length) % players.length; slides.forEach((s, i) => s.classList.toggle('active', i === idx)); dots.forEach((d, i) => d.classList.toggle('on', i === idx)); };
  show(0); dots.forEach(d => d.onclick = () => show(+d.dataset.i));
  window._slideT = setInterval(() => show(idx + 1), 3500);
}

R.squad = async v => {
  const { data } = await sb.from('players').select('id,ign,full_name,game_role,image_url').order('sort').order('id');
  v.innerHTML = `<div class="wrap sec"><h2>স্কোয়াড রোস্টার</h2><p class="sub">${esc(S.team.short_name)} স্কোয়াডের সব প্লেয়ার। প্রোফাইল খুলতে কার্ডে ট্যাপ করো।</p>
    <div class="grid">${(data || []).map(pcard).join('') || '<p class="mut">No players added yet. Add them from the Admin Panel.</p>'}</div></div>`;
};

R.player = async (v, id) => {
  const { data: p, error } = await sb.from('players').select('*').eq('id', id).single();
  if (error) throw new Error('Player not found');
  const canEdit = S.admin || (S.me && S.me.id === p.id), clip = p.clip_url;
  const isVid = u => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u || '');
  v.innerHTML = `<div class="pf-cover">${isVid(clip) ? `<video id="cvid" src="${esc(clip)}" autoplay muted loop playsinline></video><button class="btn sm mute" id="mt">Sound off</button>` : ''}</div>
  <div class="wrap"><div class="pf-head"><img class="pf-av panel" src="${src(p.image_url)}" alt="${esc(p.ign)}">
    <div><h1>${esc(p.full_name || p.ign)}</h1><span class="chip">${esc(p.game_role || 'Player')}</span> <span class="chip">${esc(tagIgn(p.ign))}</span></div></div>
    <div class="info">
      <div class="panel"><small>In-game name</small><b>${esc(p.ign)}</b></div>
      <div class="panel"><small>UID</small><b>${esc(p.game_uid || '-')}</b></div>
      <div class="panel"><small>Role</small><b>${esc(p.game_role || '-')}</b></div>
      <div class="panel"><small>Joined</small><b>${fmtDate(p.joined) || '-'}</b></div>
      <div class="panel"><small>Age</small><b>${p.age ?? '-'}</b></div></div>
    <h2>Match stats</h2><br>
    <div class="stats"><div class="stat panel"><b data-count="${p.tournaments || 0}">0</b><span>Tournaments played</span></div>
      <div class="stat panel"><b data-count="${p.kills || 0}">0</b><span>Kills</span></div>
      <div class="stat panel"><b data-count="${p.earnings || 0}" data-money>0</b><span>Total earning</span></div></div><br>
    <div class="row"><button class="btn pri" id="dl">Download stats card</button><button class="btn" id="sh">Save to gallery / share</button>
      ${canEdit ? `<button class="btn" id="ed">Edit profile</button>` : ''}</div>
    ${p.about ? `<br><h2 style="margin-top:28px">About</h2><p class="mut" style="white-space:pre-wrap;max-width:70ch">${esc(p.about)}</p>` : ''}
    ${clip ? `<div class="clip" style="margin-top:28px"><h2>Gameplay clip</h2><br>${isVid(clip) ? `<video src="${esc(clip)}" controls playsinline preload="metadata"></video>` : `<a class="btn" href="${esc(clip)}" target="_blank" rel="noopener">Watch the clip</a>`}</div>` : ''}
    <div style="height:40px"></div></div>`;
  const mt = $('#mt'); if (mt) mt.onclick = () => { const vd = $('#cvid'); vd.muted = !vd.muted; mt.textContent = vd.muted ? 'Sound off' : 'Sound on'; };
  $('#dl').onclick = e => makeCard(p, 'download', e.target);
  $('#sh').onclick = e => makeCard(p, 'share', e.target);
  if (canEdit) $('#ed').onclick = () => editModal('Edit profile', [
    { k: 'age', l: 'Age', t: 'number' }, { k: 'about', l: 'About', t: 'textarea' },
    { k: 'image_url', l: 'Profile photo', t: 'image', b: 'Roaster' },
    { k: 'clip_url', l: 'Gameplay clip (plays on your profile cover)', t: 'video', b: 'Highlight' }], p, async d => {
      const { error } = await sb.from('players').update(d).eq('id', p.id); if (error) throw error; toast('Profile saved'); route(); });
};

async function makeCard(p, mode, btn) {
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…';
  try {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const load = u => new Promise(r => { if (!u) return r(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => r(i); i.onerror = () => r(null); i.src = u; });
    const [pi, lg] = await Promise.all([load(p.image_url), load(S.team.logo_url), document.fonts.load('700 60px "Chakra Petch"').catch(() => 0)]);
    const F = '"Chakra Petch", sans-serif';
    g.fillStyle = '#070a08'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffc40a'; g.beginPath(); g.moveTo(470, 0); g.lineTo(640, 0); g.lineTo(400, 1110); g.lineTo(230, 1110); g.fill();
    g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(520, 0); g.lineTo(290, 1110); g.lineTo(0, 1110); g.clip();
    g.fillStyle = '#0d120f'; g.fillRect(0, 0, 560, 1110);
    if (pi) { const s = Math.max(560 / pi.width, 1110 / pi.height), w = pi.width * s, h = pi.height * s; g.drawImage(pi, (560 - w) / 2, (1110 - h) / 2, w, h); }
    g.restore();
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = `700 76px ${F}`;
    let name = p.ign; while (g.measureText(name).width > 470 && name.length > 3) name = name.slice(0, -1); g.fillText(name, 580, 190);
    g.fillStyle = '#ffc40a'; g.font = `600 36px ${F}`; g.fillText(p.game_role || 'Player', 582, 245);
    const rows = [['Tournaments played', String(p.tournaments || 0)], ['Kills', String(p.kills || 0)], ['Total earning', money(p.earnings)]];
    rows.forEach(([l, v], i) => { const y = 380 + i * 230;
      g.fillStyle = '#8a9a8f'; g.font = `500 32px ${F}`; g.fillText(l, 582, y);
      g.fillStyle = '#fff'; g.font = `700 100px ${F}`; g.fillText(v, 578, y + 100);
      g.fillStyle = '#1f2b23'; g.fillRect(582, y + 130, 420, 3); });
    g.fillStyle = '#0d120f'; g.fillRect(0, 1110, W, 240); g.fillStyle = '#ffc40a'; g.fillRect(0, 1110, W, 8);
    if (lg) g.drawImage(lg, 60, 1160, 150, 150);
    g.fillStyle = '#fff'; g.font = `700 52px ${F}`; g.fillText(S.team.name || 'TEAM', lg ? 240 : 60, 1230);
    g.fillStyle = '#ffc40a'; g.font = `600 30px ${F}`; g.fillText(S.team.tagline || '', lg ? 242 : 62, 1282);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const file = new File([blob], `${p.ign}-stats-card.png`, { type: 'image/png' });
    if (mode === 'share' && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${p.ign} stats card` });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(mode === 'share' ? 'Sharing is not supported here. Card downloaded instead.' : 'Stats card downloaded');
    }
  } catch (e) { if (e.name !== 'AbortError') toast(e.message, 1); }
  btn.disabled = false; btn.textContent = orig;
}

R.management = async v => {
  const { data } = await sb.from('staff').select('*').order('sort').order('id');
  v.innerHTML = `<div class="wrap sec"><h2>Management</h2><p class="sub">The people who run the team.</p><div class="grid w">
    ${(data || []).map((s, i) => `<article class="panel rv" data-i="${i}" style="cursor:pointer"><div style="height:120px;background:var(--bg2) center/cover ${s.cover_url ? `url('${esc(s.cover_url)}')` : ''}"></div>
      <div class="card" style="margin-top:-46px"><img src="${src(s.image_url)}" alt="${esc(s.name)}" loading="lazy" style="width:92px;height:92px;object-fit:cover;border:3px solid var(--lime);background:var(--panel)">
      <h3 style="margin-top:10px">${esc(s.name)}</h3><span class="chip">${esc(s.position || '')}</span>${s.age ? `<p class="mut" style="margin-top:8px">Age ${s.age}</p>` : ''}</div></article>`).join('') || '<p class="mut">No managers added yet.</p>'}</div></div>`;
  $$('[data-i]', v).forEach(el => el.onclick = () => { const s = data[el.dataset.i];
    modal(`<h3>${esc(s.name)}</h3><p class="chip">${esc(s.position || '')}</p><p class="mut" style="margin:14px 0;white-space:pre-wrap">${esc(s.about || '')}</p><button class="btn" data-x>Close</button>`); });
};

const achItem = a => `<div class="item panel rv">${a.image_url ? `<img loading="lazy" src="${esc(a.image_url)}" alt="">` : ''}<div><h3>${esc(a.title)}</h3><p class="mut">${fmtDate(a.date)}</p><p style="margin-top:6px;white-space:pre-wrap">${esc(a.description || '')}</p></div></div>`;
R.achievements = async v => {
  const { data } = await sb.from('achievements').select('*').order('date', { ascending: false, nullsFirst: false });
  v.innerHTML = `<div class="wrap sec"><h2>Achievements</h2><p class="sub">What we have won so far.</p><div class="tl">${(data || []).map(achItem).join('') || '<p class="mut">No achievements added yet.</p>'}</div></div>`;
};

R.team = async v => {
  const T = S.team, rows = [['Team name', T.name], ['Short name', T.short_name], ['Founded', T.founded], ['Founder', T.founder], ['Email', T.email], ['Tagline', T.tagline]].filter(r => r[1]);
  v.innerHTML = `<div class="wrap sec"><h2>Team details</h2><br><div class="panel card">
    ${T.cover_url ? `<img src="${esc(T.cover_url)}" alt="" style="width:100%;max-height:260px;object-fit:cover;margin-bottom:20px">` : ''}
    <div class="row" style="align-items:flex-start;gap:24px">${T.logo_url ? `<img src="${esc(T.logo_url)}" alt="" width="120" height="120" style="object-fit:contain">` : ''}
    <dl class="kv" style="flex:1;min-width:260px">${rows.map(([k, x]) => `<dt>${k}</dt><dd>${esc(x)}</dd>`).join('')}</dl></div>
    ${T.description ? `<p class="mut" style="margin-top:20px;white-space:pre-wrap">${esc(T.description)}</p>` : ''}
    <div class="social" style="margin-top:20px">${socialLinks(T)}</div></div>
    ${(T.developer || T.developer_image_url) ? `<div class="panel card dev-card">
      ${T.developer_image_url ? `<img src="${esc(T.developer_image_url)}" alt="">` : `<div class="dev-ph">${esc((T.developer || 'D')[0])}</div>`}
      <div><small class="mut">Developer</small><h3>${esc(T.developer || '')}</h3>
      ${T.developer_link ? `<a class="btn sm" href="${esc(T.developer_link)}" target="_blank" rel="noopener">Contact / Profile</a>` : ''}</div></div>` : ''}
    </div>`;
};

const uidEmail = uid => 'p' + String(uid || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') + '@players.tc.local';
R.login = async (v, mode) => {
  if (S.user) { location.hash = '#/'; return; }
  const su = mode === 'signup';
  v.innerHTML = `<div class="wrap sec" style="max-width:460px"><h2>${su ? 'অ্যাকাউন্ট তৈরি করো' : 'লগইন'}</h2>
    <p class="sub">${su ? 'Admin Squad-এ তোমাকে যে UID দিয়ে যোগ করেছে সেটা লিখো, তারপর একটা পাসওয়ার্ড ঠিক করো। Admin অনুমোদন না করা পর্যন্ত Coaching Zone / Finance খুলবে না।' : 'প্লেয়ার হলে UID, Admin/Manager/Coach হলে ইমেইল দিয়ে লগইন করো।'}</p>
    <form class="f panel card" id="lf"><label>${su ? 'UID' : 'UID অথবা ইমেইল'}<input name="u" required autocomplete="username"></label>
    <label>Password<input type="password" name="p" required minlength="6" autocomplete="${su ? 'new-password' : 'current-password'}"></label>
    <button class="btn pri" type="submit">${su ? 'সাইন আপ' : 'লগইন'}</button>
    <p class="mut">${su ? 'অ্যাকাউন্ট আছে?' : 'প্লেয়ার হিসেবে নতুন?'} <a href="#/login${su ? '' : '/signup'}" class="ok">${su ? 'লগইন করো' : 'অ্যাকাউন্ট তৈরি করো'}</a>
    ${su ? '' : ` &nbsp;|&nbsp; <a href="#" id="fg" class="ok">পাসওয়ার্ড ভুলে গেছো?</a>`}</p></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const raw = e.target.u.value.trim(), pw = e.target.p.value, em = raw.includes('@') ? raw.toLowerCase() : uidEmail(raw), b = $('button', e.target); b.disabled = true;
    if (su) {
      const { data: pl } = await sb.from('players').select('id').ilike('game_uid', raw).maybeSingle();
      if (!pl) { b.disabled = false; return toast('এই UID খুঁজে পাওয়া যায়নি। আগে Admin কে Squad-এ যোগ করতে বলো।', 1); }
    }
    const r = su ? await sb.auth.signUp({ email: em, password: pw }) : await sb.auth.signInWithPassword({ email: em, password: pw });
    b.disabled = false;
    if (r.error) return toast(su ? 'সাইন আপ ব্যর্থ: ' + r.error.message : 'ভুল UID অথবা পাসওয়ার্ড', 1);
    if (su) toast('অ্যাকাউন্ট তৈরি হয়েছে। Admin অনুমোদন করলে Coaching Zone খুলবে।');
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    location.hash = '#/';
  };
  const fg = $('#fg'); if (fg) fg.onclick = e => { e.preventDefault(); const uid = $('#lf').u.value.trim(); if (!uid) return toast('আগে UID লিখো', 1);
    const to = S.team.email || '', subject = encodeURIComponent(`Password reset request - UID ${uid}`),
      body = encodeURIComponent(`Hi Admin,\n\nআমি আমার পাসওয়ার্ড ভুলে গেছি।\nআমার UID: ${uid}\n\nআমাকে একটা নতুন পাসওয়ার্ড সেট করে দিন।`);
    if (!to) return toast('Team email এখনো সেট করা হয়নি (Admin Panel, Team Details)।', 1);
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`; };
};

/* ---------- Coaching Zone ---------- */
const CTABS = [['esports', 'ই-স্পোর্টস জ্ঞান'], ['igl', 'IGL গাইড'], ['roles', 'প্লেয়ার রোল'], ['rules', 'টিম রুলস'], ['tournament', 'টুর্নামেন্ট জ্ঞান'],
  ['strategy', 'স্ট্র্যাটেজি'], ['schedule', 'সময়সূচি'], ['chat', 'টিম চ্যাট'], ['help', 'এক্সপার্ট হেল্প']];
R.coaching = async (v, tab = 'esports') => {
  if (!S.member) return memberLock(v);
  const head = `<div class="wrap sec"><h2>কোচিং জোন</h2><p class="sub">প্রাইভেট ট্রেনিং ম্যাটেরিয়াল ও টিম টুলস।</p>${S.coach ? '<p><a class="btn sm" href="#/coach">কোচিং জোন এডিট করো</a></p><br>' : ''}
    <div class="tabs">${CTABS.map(([k, l]) => `<a href="#/coaching/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div><div id="ct"></div></div>`;
  v.innerHTML = head; const ct = $('#ct');
  if (['esports', 'igl', 'roles', 'rules', 'tournament'].includes(tab)) {
    const { data } = await sb.from('knowledge').select('*').eq('section', tab).order('sort').order('id');
    ct.innerHTML = `<div class="acc">${(data || []).map(k => `<details class="panel"><summary>${esc(k.title)}</summary><div class="body">${esc(k.body)}</div></details>`).join('') || '<p class="mut">এখনো কিছু যোগ করা হয়নি।</p>'}</div>`;
  } else if (tab === 'strategy') {
    const { data } = await sb.from('strategies').select('id,title,version,created_by,created_at').order('created_at', { ascending: false });
    ct.innerHTML = `<a class="btn pri" href="#/strategy/new">নতুন স্ট্র্যাটেজি</a><br><br>${(data || []).map(s => `<a class="arow panel" href="#/strategy/${s.id}"><span class="t"><span><b>${esc(s.title)}</b> <span class="chip">v${s.version}</span></span></span><span class="mut">${fmtDate(s.created_at)}</span></a>`).join('') || '<p class="mut">এখনো কোনো স্ট্র্যাটেজি সেভ করা হয়নি।</p>'}`;
  } else if (tab === 'schedule') {
    const { data } = await sb.from('schedules').select('*').order('starts_at', { ascending: false }).limit(60);
    const now = Date.now();
    ct.innerHTML = (data || []).filter(s => !s.for_player || s.for_player === S.me?.ign || S.staff).map(s => `<div class="arow panel" style="opacity:${new Date(s.starts_at) < now ? .5 : 1}"><div><b>${esc(s.title)}</b> <span class="chip">${esc(s.type)}</span>
      <p class="mut">${fmtDT(s.starts_at)}${s.for_player ? ` · for ${esc(s.for_player)}` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</p></div></div>`).join('') || '<p class="mut">এখনো কোনো শিডিউল নেই।</p>';
  } else if (tab === 'chat') await chatTab(ct);
  else if (tab === 'help') {
    const n = (S.team.whatsapp || '').replace(/\D/g, '');
    ct.innerHTML = `<div class="panel card"><h3>এক্সপার্ট হেল্প দরকার?</h3><p class="mut" style="margin:8px 0 18px">স্ট্র্যাটেজি, রোল, সেটিংস বা যেকোনো esports সমস্যা নিয়ে জিজ্ঞাসা করো।</p>
      ${n ? `<a class="btn pri" href="https://wa.me/${n}" target="_blank" rel="noopener">WhatsApp-এ চ্যাট করো</a>` : '<p class="mut">WhatsApp নম্বর এখনো সেট করা হয়নি (Admin Panel, Team Details)।</p>'}</div>`;
  }
};
async function chatTab(ct) {
  ct.innerHTML = `<div class="panel"><div class="chat" id="ch"></div><form class="row" id="cf" style="padding:12px;border-top:1px solid var(--line);flex-wrap:nowrap">
    <input class="inp" name="m" placeholder="লিখে পাঠাও..." autocomplete="off">
    ${S.captain ? `<button type="button" class="btn sm" id="rec" title="Captain-রা ভয়েস মেসেজ পাঠাতে পারবে">🎤</button>` : ''}
    <button class="btn pri">Send</button></form></div>`;
  const box = $('#ch'), seen = new Set(), playCache = {};
  const pct = (id, secs) => { const el = box.querySelector(`audio[data-mid="${id}"]`); const tot = el ? (+el.dataset.dur || el.duration || 1) : 1; return Math.max(0, Math.min(100, Math.round((secs / tot) * 100))); };
  const playsLine = id => { const p = playCache[id]; if (!p || !Object.keys(p).length) return 'এখনো কেউ শোনেনি'; return Object.entries(p).map(([email, v]) => `${esc((v.name || email.split('@')[0]))} ${v.pct}%${v.pct >= 99 ? ' ✓' : ''}`).join(' · '); };
  const renderPlays = id => { const t = $('#pl' + id); if (t) t.textContent = '▶ ' + playsLine(id); };
  const add = m => {
    if (seen.has(m.id)) return; seen.add(m.id); const me = m.author_email === S.user.email.toLowerCase();
    const body = m.kind === 'voice'
      ? `<audio controls preload="metadata" data-mid="${m.id}" data-dur="${m.duration || 0}" src="${esc(m.audio_url)}"></audio><div class="plays" id="pl${m.id}">▶ ${esc(playsLine(m.id))}</div>`
      : esc(m.body);
    box.insertAdjacentHTML('beforeend', `<div class="msg ${me ? 'me' : ''}"><small>${esc(m.author)}${m.kind === 'voice' ? ' · <span class="chip" style="padding:1px 8px">Voice</span>' : ''} · ${fmtDT(m.created_at)}</small>${body}</div>`);
    box.scrollTop = box.scrollHeight;
    if (m.kind === 'voice') wireAudio(m);
  };
  async function wireAudio(m) {
    const el = box.querySelector(`audio[data-mid="${m.id}"]`); if (!el) return;
    let last = -1;
    const send = cur => { const r = Math.floor(cur); if (r <= last) return; last = r;
      sb.from('message_plays').upsert({ message_id: m.id, player_email: S.user.email.toLowerCase(), played_seconds: cur }, { onConflict: 'message_id,player_email' }).then(() => { }); };
    el.addEventListener('timeupdate', () => send(el.currentTime));
    el.addEventListener('ended', () => send(el.duration || m.duration || el.currentTime));
    const { data } = await sb.from('message_plays').select('*').eq('message_id', m.id);
    const p = {}; (data || []).forEach(r => p[r.player_email] = { pct: pct(m.id, r.played_seconds) });
    playCache[m.id] = p; renderPlays(m.id);
  }
  const { data } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(100); (data || []).reverse().forEach(add);
  chan = sb.channel('msgs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => add(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_plays' }, p => {
      const r = p.new; if (!r) return; playCache[r.message_id] = playCache[r.message_id] || {};
      playCache[r.message_id][r.player_email] = { pct: pct(r.message_id, r.played_seconds) }; renderPlays(r.message_id);
    }).subscribe();
  $('#cf').onsubmit = async e => { e.preventDefault(); const i = e.target.m, body = i.value.trim(); if (!body) return; i.value = '';
    const { data, error } = await sb.from('messages').insert({ body, kind: 'text', author: S.me?.ign || S.user.email.split('@')[0], author_email: S.user.email.toLowerCase() }).select().single();
    if (error) toast(error.message, 1); else add(data); };
  const rec = $('#rec');
  if (rec) {
    let mr = null, chunks = [], recording = false, startT = 0;
    rec.onclick = async () => {
      if (recording) { mr.stop(); recording = false; rec.classList.remove('on'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = []; startT = Date.now();
        mr = new MediaRecorder(stream);
        mr.ondataavailable = e => e.data.size && chunks.push(e.data);
        mr.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const duration = (Date.now() - startT) / 1000;
          if (duration < 1) { toast('অনেক ছোট রেকর্ডিং, আবার চেষ্টা করো', 1); return; }
          const blob = new Blob(chunks, { type: 'audio/webm' });
          rec.textContent = '⏳'; rec.disabled = true;
          try {
            const path = `${Date.now()}_voice.webm`;
            const { error: upErr } = await sb.storage.from('Extra').upload(path, blob, { contentType: 'audio/webm' }); if (upErr) throw upErr;
            const audio_url = sb.storage.from('Extra').getPublicUrl(path).data.publicUrl;
            const { data, error } = await sb.from('messages').insert({ kind: 'voice', audio_url, duration, body: '', author: S.me?.ign || S.user.email.split('@')[0], author_email: S.user.email.toLowerCase() }).select().single();
            if (error) throw error; add(data);
          } catch (err) { toast(err.message, 1); }
          rec.textContent = '🎤'; rec.disabled = false;
        };
        mr.start(); recording = true; rec.textContent = '⏹'; rec.classList.add('on');
      } catch { toast('মাইক্রোফোন পারমিশন দরকার', 1); }
    };
  }
}

/* ---------- Strategy editor ---------- */
const MARK = { player: { c: '#39a0ff', l: 'P' }, danger: { c: '#ff4d4d', l: '!' }, safe: { c: '#ffc40a', l: 'S' }, entry: { c: '#ffc53d', l: 'E' } };
function drawStroke(g, s) {
  g.lineWidth = 5; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = s.c || '#ffc40a';
  if (s.t === 'pen') { g.beginPath(); s.p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
  else if (s.t === 'arrow' && s.p[1]) {
    const [a, b] = s.p, an = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - 20 * Math.cos(an - .45), b[1] - 20 * Math.sin(an - .45)); g.lineTo(b[0] - 20 * Math.cos(an + .45), b[1] - 20 * Math.sin(an + .45)); g.closePath(); g.fill();
  } else if (MARK[s.t]) {
    const [x, y] = s.p[0], m = MARK[s.t]; g.fillStyle = m.c; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill();
    g.fillStyle = '#000'; g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.n || m.l, x, y + 1);
  }
}
R.strategy = async (v, id) => {
  if (!S.member) return memberLock(v);
  let s = { title: '', description: '', media_url: null, drawing: [], version: 1, parent_id: null };
  if (id !== 'new') { const r = await sb.from('strategies').select('*').eq('id', id).single(); if (r.error) throw new Error('Strategy not found'); s = r.data; }
  const W = 1000, H = 600; let strokes = [...(s.drawing || [])], cur = null, tool = 'pen', color = '#ffc40a', bg = null;
  const tools = [['pen', 'Draw'], ['arrow', 'Arrow / rotation'], ['player', 'Player'], ['entry', 'Entry point'], ['danger', 'Danger area'], ['safe', 'Safe route']];
  v.innerHTML = `<div class="wrap sec"><a class="mut" href="#/coaching/strategy">Back to strategies</a><h2 style="margin-top:8px">${id === 'new' ? 'New strategy' : esc(s.title)} ${id !== 'new' ? `<span class="chip">v${s.version}</span>` : ''}</h2><br>
    <div class="cvbar">${tools.map(([k, l]) => `<button data-t="${k}" class="${k === 'pen' ? 'on' : ''}">${l}</button>`).join('')}
      <input type="color" id="col" value="${color}" title="Colour"><button id="undo">Undo</button><button id="clr">Clear</button></div>
    <canvas id="cv" width="${W}" height="${H}"></canvas>
    <div id="vidbox" style="display:none;margin-top:10px"><video id="refv" controls playsinline style="max-width:100%;max-height:300px"></video><br><button class="btn sm" id="grab">Use this frame as the map</button></div>
    <form class="f" id="sf" style="margin-top:18px"><label>Map, photo or video<input type="file" id="med" accept="image/*,video/*"></label>
      <label>Title<input name="title" required value="${esc(s.title)}"></label><label>Notes<textarea name="description">${esc(s.description)}</textarea></label>
      <div class="row"><button class="btn pri" type="submit" data-m="${id === 'new' ? 'new' : 'ver'}">${id === 'new' ? 'Save strategy' : 'Save as new version'}</button>
      ${id !== 'new' && (S.staff || (s.created_by || '').toLowerCase() === S.user.email.toLowerCase()) ? `<button class="btn" type="button" id="upd">Update this version</button>` : ''}
      ${id !== 'new' && S.staff ? `<button class="btn dng" type="button" id="del">Delete</button>` : ''}</div></form>
    ${id !== 'new' ? `<h2 style="margin-top:40px">Feedback</h2><br><div id="cm"></div><form class="row" id="cmf" style="flex-wrap:nowrap;margin-top:12px"><input class="inp" name="b" placeholder="Write a comment or reply" required><button class="btn pri">Post</button></form>` : ''}</div>`;
  const cv = $('#cv'), g = cv.getContext('2d');
  const paint = () => { g.clearRect(0, 0, W, H); g.fillStyle = '#0b1210'; g.fillRect(0, 0, W, H);
    if (bg) { const k = Math.max(W / bg.width, H / bg.height), w = bg.width * k, h = bg.height * k; g.drawImage(bg, (W - w) / 2, (H - h) / 2, w, h); }
    else { g.strokeStyle = 'rgba(255,196,10,.08)'; g.lineWidth = 1; for (let x = 0; x <= W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y <= H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
    strokes.concat(cur ? [cur] : []).forEach(x => drawStroke(g, x)); };
  const setBg = u => { if (!u) return paint(); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => { bg = i; paint(); }; i.src = u; };
  setBg(s.media_url); paint();
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); const p = pos(e);
    if (MARK[tool]) { const n = tool === 'player' ? String(strokes.filter(x => x.t === 'player').length + 1) : undefined; strokes.push({ t: tool, p: [p], n }); paint(); return; }
    cur = { t: tool, c: color, p: [p] }; if (tool === 'arrow') cur.p[1] = p; };
  cv.onpointermove = e => { if (!cur) return; const p = pos(e); if (tool === 'pen') cur.p.push(p); else cur.p[1] = p; paint(); };
  cv.onpointerup = () => { if (cur) { strokes.push(cur); cur = null; paint(); } };
  $$('[data-t]', v).forEach(b => b.onclick = () => { tool = b.dataset.t; $$('[data-t]', v).forEach(x => x.classList.toggle('on', x === b)); });
  $('#col').oninput = e => color = e.target.value; $('#undo').onclick = () => { strokes.pop(); paint(); }; $('#clr').onclick = () => { strokes = []; paint(); };
  $('#med').onchange = async e => { const f = e.target.files[0]; if (!f) return;
    if (f.type.startsWith('video/')) { $('#refv').src = URL.createObjectURL(f); $('#vidbox').style.display = 'block'; return; }
    try { toast('Uploading…'); s.media_url = await upload('Extra', f); setBg(s.media_url); toast('Map added'); } catch (err) { toast(err.message, 1); } };
  $('#grab').onclick = async () => { const vd = $('#refv'), t = document.createElement('canvas'); t.width = vd.videoWidth; t.height = vd.videoHeight; t.getContext('2d').drawImage(vd, 0, 0);
    const b = await new Promise(r => t.toBlob(r, 'image/webp', .85)); try { s.media_url = await upload('Extra', new File([b], 'frame.webp', { type: 'image/webp' })); setBg(s.media_url); toast('Frame added as map'); } catch (err) { toast(err.message, 1); } };
  const payload = () => ({ title: $('#sf [name=title]').value.trim(), description: $('#sf [name=description]').value.trim(), media_url: s.media_url, drawing: strokes });
  $('#sf').onsubmit = async e => { e.preventDefault(); const isNew = id === 'new';
    const row = { ...payload(), created_by: S.user.email.toLowerCase(), version: isNew ? 1 : s.version + 1, parent_id: isNew ? null : (s.parent_id || s.id) };
    const { data, error } = await sb.from('strategies').insert(row).select().single(); if (error) return toast(error.message, 1);
    toast(isNew ? 'Strategy saved' : 'New version saved'); location.hash = '#/strategy/' + data.id; };
  const u = $('#upd'); if (u) u.onclick = async () => { const { error } = await sb.from('strategies').update(payload()).eq('id', s.id); toast(error ? error.message : 'Strategy updated', !!error); };
  const d = $('#del'); if (d) d.onclick = async () => { if (!confirm('Delete this strategy?')) return; const { error } = await sb.from('strategies').delete().eq('id', s.id); if (error) return toast(error.message, 1); location.hash = '#/coaching/strategy'; };
  if (id !== 'new') {
    const load = async () => { const { data } = await sb.from('strategy_comments').select('*').eq('strategy_id', s.id).order('created_at');
      $('#cm').innerHTML = (data || []).map(c => `<div class="msg" style="max-width:100%;margin-bottom:8px"><small>${esc(c.author)} · ${fmtDT(c.created_at)}</small>${esc(c.body)}</div>`).join('') || '<p class="mut">No feedback yet.</p>'; };
    load(); $('#cmf').onsubmit = async e => { e.preventDefault(); const body = e.target.b.value.trim(); if (!body) return;
      const { error } = await sb.from('strategy_comments').insert({ strategy_id: s.id, body, author: S.me?.ign || S.user.email.split('@')[0], author_email: S.user.email.toLowerCase() });
      if (error) return toast(error.message, 1); e.target.b.value = ''; load(); };
  }
};

/* ---------- Finance ---------- */
// Every stakeholder's % (Owner/Sponsor/Management/Squad Fund/each player) is a
// share of a tournament's PROFIT (prize - entry fee), never of the raw prize — a
// breakeven or loss tournament pays nobody anything, matching how the player
// earnings are computed server-side (see recalc_player in schema.sql).
const profitOf = t => Math.max(0, (+t.prize_win || 0) - (+t.entry_fee || 0));
// Sponsor loss carry-forward: when a tournament loses money (entry fee > prize),
// the full loss is added to a running debt against the Sponsor. On a later
// profitable tournament, before the Sponsor gets their normal % of that profit,
// whatever is still owed is paid off first from that same share — only the
// leftover (if any) counts as fresh Sponsor income. Runs in date order
// (undated tournaments last).
function sponsorLedger(rows, T) {
  const sorted = [...(rows || [])].sort((a, b) => {
    if (!a.played_at && !b.played_at) return a.id - b.id;
    if (!a.played_at) return 1; if (!b.played_at) return -1;
    return a.played_at < b.played_at ? -1 : a.played_at > b.played_at ? 1 : a.id - b.id;
  });
  let debt = 0; const byId = {};
  for (const t of sorted) {
    const P = +t.prize_win || 0, E = +t.entry_fee || 0, net = P - E;
    const raw = profitOf(t) * (+T.sponsor_percent || 0) / 100;
    let shown = raw, repaid = 0;
    if (net < 0) debt += (E - P);
    else if (debt > 0) { repaid = Math.min(raw, debt); debt -= repaid; shown = raw - repaid; }
    byId[t.id] = { raw, net: shown, repaid };
  }
  return { byId, finalDebt: debt };
}
// Admin sees every tournament with the full owner/sponsor/manager/fund/player
// breakdown; a player who only has the finance password sees three totals only.
function financeView(v, res) {
  if (!res.admin) {
    v.innerHTML = `<div class="wrap sec" style="max-width:640px"><h2>Finance</h2><p class="sub">সংক্ষিপ্ত হিসাব। বিস্তারিত হিসাব শুধু Admin দেখতে পারে।</p>
      <div class="stats">
        <div class="stat panel"><b>${res.total_tournaments}</b><span>Total tournament</span></div>
        <div class="stat panel"><b>${money(res.total_entry_fee)}</b><span>Entry fee total</span></div>
        <div class="stat panel"><b>${money(res.total_prize)}</b><span>Prize pool total</span></div>
      </div></div>`;
    return;
  }
  const T = res.team || {}, rows = res.tournaments || [];
  const ledger = sponsorLedger(rows, T);
  const calc = t => { const P = +t.prize_win || 0, E = +t.entry_fee || 0, profit = profitOf(t),
    own = profit * (+T.owner_percent || 0) / 100, mgr = profit * (+T.manager_percent || 0) / 100, fund = profit * (+T.squad_fund_percent || 0) / 100,
    ply = (t.participants || []).reduce((a, p) => a + (+p.amount || 0), 0), L = ledger.byId[t.id] || { net: 0, repaid: 0 };
    return { P, E, own, spo: L.net, spoRepaid: L.repaid, mgr, fund, ply, net: P - E }; };
  const c = rows.map(calc), sum = f => c.reduce((a, x) => a + f(x), 0);
  const profit = sum(x => x.net > 0 ? x.net : 0), loss = sum(x => x.net < 0 ? -x.net : 0);
  v.innerHTML = `<div class="wrap sec"><h2>Finance</h2><p class="sub">টুর্নামেন্টের সম্পূর্ণ হিসাব ও রেভিনিউ শেয়ার — শুধু Admin দেখতে পারে।</p>
    <div class="stats" style="margin-bottom:26px">
      <div class="stat panel"><b>${money(sum(x => x.E))}</b><span>Entry fee total</span></div>
      <div class="stat panel"><b>${money(sum(x => x.P))}</b><span>Prize total</span></div>
      <div class="stat panel"><b class="ok">${money(profit)}</b><span>Profit</span></div>
      <div class="stat panel"><b class="err">${money(loss)}</b><span>Loss</span></div>
      <div class="stat panel"><b>${money(sum(x => x.own))}</b><span>Owner (${T.owner_percent || 0}%)</span></div>
      <div class="stat panel"><b>${money(sum(x => x.spo))}</b><span>Sponsor (${T.sponsor_percent || 0}%) — net of loss recovery</span></div>
      <div class="stat panel"><b>${money(sum(x => x.mgr))}</b><span>Management (${T.manager_percent || 0}%)</span></div>
      <div class="stat panel"><b>${money(sum(x => x.fund))}</b><span>Squad Fund (${T.squad_fund_percent || 0}%)</span></div>
      ${ledger.finalDebt > 0 ? `<div class="stat panel"><b class="err">${money(ledger.finalDebt)}</b><span>Sponsor-কে এখনো ফেরত দিতে হবে (আগের loss)</span></div>` : ''}</div>
    <div class="panel tbl"><table><thead><tr><th>Tournament</th><th>Date</th><th>Position</th><th>Entry fee</th><th>Prize</th><th>Owner</th><th>Sponsor</th><th>Management</th><th>Fund</th><th>Players</th><th>P/L</th><th></th></tr></thead><tbody>
    ${rows.map((t, i) => `<tr><td>${esc(t.name)}</td><td>${fmtDate(t.played_at)}</td><td>${esc(t.position || '-')}</td><td>${money(c[i].E)}</td><td>${money(c[i].P)}</td><td>${money(c[i].own)}</td><td>${money(c[i].spo)}${c[i].spoRepaid > 0 ? `<br><small class="mut">(${money(c[i].spoRepaid)} loss recovery)</small>` : ''}</td><td>${money(c[i].mgr)}</td><td>${money(c[i].fund)}</td><td>${money(c[i].ply)}</td><td class="${c[i].net >= 0 ? 'pos' : 'neg'}">${money(c[i].net)}</td><td><button class="btn sm" data-pv="${i}">Players</button></td></tr>`).join('') || '<tr><td colspan="12" class="mut">No tournaments added yet.</td></tr>'}
    </tbody></table></div><p class="mut" style="margin-top:12px;font-size:.85rem">Add or edit tournaments (and pick which players played) from Admin Panel &gt; Finance. সব ভাগ (Owner/Sponsor/Management/Fund/Players) হিসাব হয় সেই tournament-এর <b>Profit</b>-এর উপর (Prize − Entry fee) — breakeven বা loss হলে কেউ কিছু পায় না। Tournament-এ loss হলে (entry fee &gt; prize), পুরো loss টা Sponsor-এর খাতায় জমা হয়; পরের profit হওয়া tournament থেকে Sponsor-এর নতুন ভাগ আগে সেই loss শোধ করে, তারপর বাকিটা Sponsor নতুন আয় হিসেবে পায়।</p></div>`;
  $$('[data-pv]', v).forEach(b => b.onclick = () => { const t = rows[b.dataset.pv];
    const list = (t.participants || []).map(p => `<div class="arow panel"><span>${esc(p.full_name || p.ign)} <span class="mut">(${p.revenue_percent}%)</span></span><b>${money(p.amount)}</b></div>`).join('') || '<p class="mut">No players were added to this tournament.</p>';
    modal(`<h3>${esc(t.name)} — players</h3>${list}<br><button class="btn" data-x>Close</button>`); });
}
R.finance = async v => {
  if (!S.member) return memberLock(v);
  if (S.admin) { const { data, error } = await sb.rpc('finance_view', { pass: null }); if (error) throw error; return financeView(v, data); }
  v.innerHTML = `<div class="wrap sec" style="max-width:460px"><h2>Finance</h2><p class="sub">Enter the finance password your manager gave you.</p>
    <form class="f panel card" id="ff"><label>Password<input type="password" name="p" required></label><button class="btn pri">Open finance</button></form></div>`;
  $('#ff').onsubmit = async e => { e.preventDefault(); const b = $('button', e.target); b.disabled = true;
    const { data, error } = await sb.rpc('finance_view', { pass: e.target.p.value }); b.disabled = false;
    if (error) return toast(error.message, 1); financeView(v, data); };
};

/* ---------- Admin-only monthly finance summary (downloadable) ---------- */
function monthlySummaryModal(tournaments) {
  const rows = tournaments || [], months = [...new Set(rows.filter(t => t.played_at).map(t => t.played_at.slice(0, 7)))].sort().reverse();
  const now = new Date().toISOString().slice(0, 7), all = months.includes(now) ? months : [now, ...months];
  const m = modal(`<h3>Monthly summary</h3><form class="f" id="msf"><label>Month<select name="m">${all.map(x => `<option value="${x}" ${x === now ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <button class="btn pri" type="submit">Generate</button></form><div id="msout" style="margin-top:18px"></div>`);
  const T = S.team, ledger = sponsorLedger(rows, T);
  const render = ym => {
    const sel = rows.filter(t => (t.played_at || '').slice(0, 7) === ym);
    const prize = sel.reduce((a, t) => a + (+t.prize_win || 0), 0), fee = sel.reduce((a, t) => a + (+t.entry_fee || 0), 0);
    const profitSum = sel.reduce((a, t) => a + profitOf(t), 0);
    const own = profitSum * (+T.owner_percent || 0) / 100, mgr = profitSum * (+T.manager_percent || 0) / 100, fund = profitSum * (+T.squad_fund_percent || 0) / 100;
    const spo = sel.reduce((a, t) => a + (ledger.byId[t.id]?.net || 0), 0);
    const ply = Math.max(0, profitSum - own - spo - mgr - fund), d = { count: sel.length, fee, prize, own, spo, mgr, fund, ply };
    $('#msout', m).innerHTML = `<div class="stats">
      <div class="stat panel"><b>${d.count}</b><span>Total tournament</span></div>
      <div class="stat panel"><b>${money(d.fee)}</b><span>Entry fee total</span></div>
      <div class="stat panel"><b>${money(d.prize)}</b><span>Prize total</span></div>
      <div class="stat panel"><b>${money(d.own)}</b><span>Owner total (${T.owner_percent || 0}%)</span></div>
      <div class="stat panel"><b>${money(d.spo)}</b><span>Sponsor total (${T.sponsor_percent || 0}%, net of loss recovery)</span></div>
      <div class="stat panel"><b>${money(d.mgr)}</b><span>Management total (${T.manager_percent || 0}%)</span></div>
      <div class="stat panel"><b>${money(d.fund)}</b><span>Squad Fund total (${T.squad_fund_percent || 0}%)</span></div>
      <div class="stat panel"><b>${money(d.ply)}</b><span>Players total (combined)</span></div></div>
      <br><button class="btn pri" id="msdl">Download summary</button>`;
    $('#msdl', m).onclick = e => downloadSummaryCard(ym, d, e.target);
  };
  $('#msf', m).onsubmit = e => { e.preventDefault(); render(e.target.m.value); };
  render(all[0]);
}
async function downloadSummaryCard(ym, d, btn) {
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'তৈরি হচ্ছে…';
  try {
    const W = 1080, H = 1360, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    await document.fonts.load('700 40px "Chakra Petch"').catch(() => 0);
    const F = '"Chakra Petch", sans-serif';
    g.fillStyle = '#070a08'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffc40a'; g.fillRect(0, 0, W, 10);
    g.fillStyle = '#fff'; g.font = `700 54px ${F}`; g.fillText(S.team.name || 'TEAM', 60, 100);
    g.fillStyle = '#ffc40a'; g.font = `600 28px ${F}`; g.fillText('Monthly Finance Summary — ' + ym, 60, 142);
    const rows = [['Total tournament', String(d.count)], ['Entry fee total', money(d.fee)], ['Prize pool total', money(d.prize)],
      [`Owner total (${S.team.owner_percent || 0}%)`, money(d.own)], [`Sponsor total (${S.team.sponsor_percent || 0}%)`, money(d.spo)],
      [`Management total (${S.team.manager_percent || 0}%)`, money(d.mgr)], [`Squad Fund total (${S.team.squad_fund_percent || 0}%)`, money(d.fund)],
      ['Players total (combined)', money(d.ply)]];
    let y = 230;
    rows.forEach(([l, v]) => { g.fillStyle = '#8a9a8f'; g.font = `500 27px ${F}`; g.fillText(l, 60, y);
      g.fillStyle = '#fff'; g.font = `700 50px ${F}`; g.fillText(v, 60, y + 52);
      g.fillStyle = '#1f2b23'; g.fillRect(60, y + 74, W - 120, 2); y += 128; });
    g.fillStyle = '#8a9a8f'; g.font = `400 22px sans-serif`; g.fillText('Generated ' + new Date().toLocaleDateString('en-GB'), 60, H - 40);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `finance-summary-${ym}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Summary downloaded');
  } catch (e) { toast(e.message, 1); }
  btn.disabled = false; btn.textContent = orig;
}

/* ---------- Admin panels: site admin (#/admin) and Coaching admin (#/coach) ---------- */
const T_ = (k, l) => ({ k, l }), U = (k, l) => ({ k, l, t: 'url' });
const TB = {
  team: { g: ['site'], roles: ['admin'], l: 'Team details', one: true, f: [{ k: 'name', l: 'Team name', req: 1 }, T_('short_name', 'Team short name'), T_('tagline', 'Tagline'), { k: 'description', l: 'Description', t: 'textarea' },
    T_('founded', 'Founded'), T_('founder', 'Founder'), { k: 'email', l: 'Team email', t: 'email' }, { k: 'logo_url', l: 'Logo', t: 'image', b: 'Logo' }, { k: 'cover_url', l: 'Logo cover photo', t: 'image', b: 'Logo' },
    U('facebook', 'Facebook link'), U('youtube', 'YouTube link'), U('tiktok', 'TikTok link'), U('discord', 'Discord link'), T_('whatsapp', 'WhatsApp number for Expert Help (with country code)'),
    U('app_url', 'App download link (optional, e.g. APK). Leave empty to use install-as-app'), { k: 'policy', l: 'Copyright policy', t: 'textarea' }, T_('copyright', 'Copyright line'), T_('developer', 'Developer name'),
    { k: 'developer_image_url', l: 'Developer photo', t: 'image', b: 'Extra' }, U('developer_link', 'Developer social / contact link'), T_('contact', 'Contact'),
    { k: 'sponsor_percent', l: 'Revenue share: Sponsor %', t: 'number' }, { k: 'manager_percent', l: 'Revenue share: Management %', t: 'number' },
    { k: 'owner_percent', l: 'Revenue share: Owner % (leave 0 if none)', t: 'number' }, { k: 'squad_fund_percent', l: 'Revenue share: Squad Fund % (leave 0 if none)', t: 'number' }] },
  players: { g: ['site'], roles: ['admin'], l: 'Squad', title: 'ign', sub: 'game_role', img: 'image_url', order: 'sort', f: [{ k: 'ign', l: 'In-game name', req: 1 }, T_('full_name', 'Full name (shown big on the roster card)'),
    T_('game_uid', 'UID (the player logs in with this — do not change once they have signed up)'), T_('game_role', 'Role (shown as the badge, e.g. Sniper, Rusher, Bomber)'), { k: 'joined', l: 'Joined', t: 'date' }, { k: 'age', l: 'Age', t: 'number' },
    { k: 'image_url', l: 'Player image (best: transparent or dark background)', t: 'image', b: 'Roaster' },
    { k: 'clip_url', l: 'Gameplay clip (plays on the profile cover)', t: 'video', b: 'Highlight' }, { k: 'about', l: 'About', t: 'textarea' },
    { k: 'kills', l: 'Kills', t: 'number' }, { k: 'revenue_percent', l: 'Revenue share % (this player\'s cut of a tournament prize)', t: 'number' },
    { k: 'is_captain', l: 'Captain (can send Voice messages in Team chat)', t: 'bool' }, { k: 'approved', l: 'Approved (can log in and use Coaching Zone / Finance)', t: 'bool' },
    { k: 'sort', l: 'Order (small number shows first)', t: 'number' }] },
  staff: { g: ['site'], roles: ['admin'], l: 'Management', title: 'name', sub: 'position', img: 'image_url', order: 'sort', f: [{ k: 'name', l: 'Name', req: 1 }, T_('position', 'Position'), { k: 'age', l: 'Age', t: 'number' },
    { k: 'image_url', l: 'Image', t: 'image', b: 'Roaster' }, { k: 'cover_url', l: 'Cover photo', t: 'image', b: 'Roaster' }, { k: 'about', l: 'About', t: 'textarea' }, { k: 'sort', l: 'Order', t: 'number' }] },
  achievements: { g: ['site'], roles: ['admin'], l: 'Achievements', title: 'title', sub: 'date', img: 'image_url', order: 'date', f: [{ k: 'title', l: 'Title', req: 1 }, { k: 'date', l: 'Date', t: 'date' }, { k: 'description', l: 'Description', t: 'textarea' }, { k: 'image_url', l: 'Picture', t: 'image', b: 'Achievment' }] },
  notices: { g: ['site'], roles: ['admin', 'manager'], l: 'Notice board', title: 'title', sub: 'active', order: 'id', f: [{ k: 'title', l: 'Notice title', req: 1 }, { k: 'body', l: 'Message', t: 'textarea' }, { k: 'active', l: 'Show as pop-up on the website', t: 'bool' }] },
  tournaments: { g: ['site'], roles: ['admin'], l: 'Finance', title: 'name', sub: 'played_at', order: 'played_at', custom: 1, f: [{ k: 'name', l: 'Tournament name', req: 1 }, { k: 'played_at', l: 'Date', t: 'date' }, T_('position', 'Position'),
    { k: 'entry_fee', l: 'Tournament entry fee', t: 'number' }, { k: 'prize_win', l: 'Prize won', t: 'number' }] },
  admins: { g: ['site'], roles: ['admin'], l: 'Admins', pk: 'email', title: 'email', sub: 'role', f: [{ k: 'email', l: 'Email', t: 'email', req: 1 }, { k: 'role', l: 'Role (coach = Coaching Zone only)', t: 'select', o: ['admin', 'manager', 'coach'] }] },
  knowledge: { g: ['coach'], roles: ['admin', 'coach'], l: 'Knowledge topics', title: 'title', sub: 'section', order: 'sort', f: [{ k: 'section', l: 'Section', t: 'select', o: ['esports', 'igl', 'roles', 'rules', 'tournament'] }, { k: 'title', l: 'Title', req: 1 }, { k: 'body', l: 'Content', t: 'textarea' }, { k: 'sort', l: 'Order', t: 'number' }] },
  schedules: { g: ['site', 'coach'], roles: ['admin', 'manager', 'coach'], l: 'Schedule', title: 'title', sub: 'starts_at', order: 'starts_at', f: [{ k: 'title', l: 'Title', req: 1 }, { k: 'type', l: 'Type', t: 'select', o: ['practice', 'scrim', 'tournament', 'strategy review', 'match preparation'] },
    { k: 'starts_at', l: 'Date and time', t: 'datetime', req: 1 }, { k: 'note', l: 'Custom message / reminder text', t: 'textarea' }, T_('for_player', 'Only for this player (in-game name). Empty = everyone'), { k: 'remind_min', l: 'Remind minutes before', t: 'number' }] },
  strategies: { g: ['coach'], roles: ['admin', 'coach'], l: 'Strategies', title: 'title', sub: 'version', order: 'created_at', noadd: 1, f: [{ k: 'title', l: 'Title', req: 1 }, { k: 'description', l: 'Notes', t: 'textarea' }] },
  messages: { g: ['coach'], roles: ['admin', 'coach'], l: 'Team chat', title: 'body', sub: 'author', order: 'created_at', noadd: 1, noedit: 1, f: [] }
};
const ADMIN_EMAIL = 'thunderchampions.esp@gmail.com';
async function adminPage(v, key, group) {
  const site = group === 'site', base = site ? 'admin' : 'coach';
  if (!S.user) {
    if (!site) return lock(v, 'Access is only for authorised staff.');
    v.innerHTML = `<div class="wrap sec" style="max-width:420px"><h2>Admin Login</h2><p class="sub">Shudhu password dao — eikhan theke shoja Admin Panel e dhuka jabe.</p>
      <form class="f panel card" id="alf"><label>Password<input type="password" name="p" required autocomplete="current-password" autofocus></label>
      <button class="btn pri" type="submit">Login</button></form></div>`;
    $('#alf').onsubmit = async e => { e.preventDefault(); const b = $('button', e.target); b.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: e.target.p.value });
      b.disabled = false; if (error) return toast('Vul password', 1);
      await loadRoles(); nav(); route(); };
    return;
  }
  const keys = Object.keys(TB).filter(k => TB[k].g.includes(group) && TB[k].roles.includes(S.role));
  if (!keys.length) return lock(v, 'Access is only for authorised staff.');
  key = keys.includes(key) ? key : keys[0];
  v.innerHTML = `<div class="wrap sec"><h2>${site ? 'Admin panel' : 'Coaching admin'}</h2><p class="sub">${site ? 'Add and manage everything on the website.' : 'Edit everything inside the Coaching Zone.'} Access is enforced by the database, not just by this screen.</p>
    <div class="adm"><aside>${keys.map(k => `<button data-k="${k}" class="${k === key ? 'on' : ''}">${TB[k].l}</button>`).join('')}</aside><section id="ad"></section></div></div>`;
  $$('[data-k]', v).forEach(b => b.onclick = () => location.hash = `#/${base}/${b.dataset.k}`);
  const cfg = TB[key], ad = $('#ad'), pk = cfg.pk || 'id';
  if (cfg.one) {
    ad.innerHTML = `<div class="panel card"><form class="f" id="tf">${cfg.f.map(f => fieldHTML(f, S.team[f.k])).join('')}<button class="btn pri">Save changes</button></form></div>`;
    $('#tf').onsubmit = async e => { e.preventDefault(); const { error } = await sb.from('team').upsert({ id: 1, ...readForm(e.target, cfg.f) }); if (error) return toast(error.message, 1);
      const { data } = await sb.from('team').select('*').eq('id', 1).single(); S.team = data; brand(); footer(); toast('Team details saved'); }; return;
  }
  let q = sb.from(key).select('*'); if (cfg.order) q = q.order(cfg.order, { ascending: cfg.order === 'sort', nullsFirst: false }); else q = q.order(pk);
  const { data, error } = await q; if (error) throw error;
  let players = null;
  if (key === 'tournaments') { const pr = await sb.from('players').select('id,ign,full_name').order('sort').order('id'); players = pr.data || []; }
  const subFor = (key === 'tournaments') ? (r => fmtDate(r.played_at)) : (r => String(r[cfg.sub] ?? ''));
  ad.innerHTML = `<div class="row" style="margin-bottom:16px">${cfg.noadd ? '' : '<button class="btn pri" id="add">Add new</button>'}${key === 'tournaments' ? `<button class="btn" id="fp">Set finance password</button><button class="btn" id="msum">Monthly summary</button>` : ''}</div>
    ${(data || []).map((r, i) => `<div class="arow panel"><div class="t">${cfg.img ? `<img src="${src(r[cfg.img])}" alt="">` : ''}<span><b>${esc(r[cfg.title] || (r.kind === 'voice' ? '[Voice message]' : ''))}</b> <span class="mut">${esc(subFor(r))}</span></span></div>
      <div class="row">${cfg.noedit ? '' : `<button class="btn sm" data-e="${i}">Edit</button>`}<button class="btn sm dng" data-d="${i}">Delete</button></div></div>`).join('') || '<p class="mut">Nothing here yet.</p>'}`;
  const save = row => async d => {
    const r = row ? await sb.from(key).update(d).eq(pk, row[pk]) : await sb.from(key).insert(d);
    if (r.error) throw r.error; toast('Saved'); route(); };
  if (key === 'tournaments') {
    const openTM = async row => {
      let picked = new Set();
      if (row) { const { data: tp } = await sb.from('tournament_players').select('player_id').eq('tournament_id', row.id); picked = new Set((tp || []).map(x => x.player_id)); }
      const m = modal(`<h3>${row ? 'Edit tournament' : 'Add tournament'}</h3><form class="f" id="tmf">${cfg.f.map(f => fieldHTML(f, row?.[f.k])).join('')}
        <label>Which players played this match?<div class="row" style="flex-wrap:wrap;gap:8px 16px;margin-top:6px">${players.map(p => `<label style="width:auto"><input type="checkbox" name="pl" value="${p.id}" ${picked.has(p.id) ? 'checked' : ''}> ${esc(p.full_name || p.ign)}</label>`).join('') || '<span class="mut">Add players in Squad first.</span>'}</div></label>
        <div class="row"><button class="btn pri" type="submit">Save</button><button class="btn" type="button" data-x>Cancel</button></div></form>`);
      $('#tmf', m).onsubmit = async e => {
        e.preventDefault(); const b = $('button[type=submit]', m); b.disabled = true;
        try {
          const d = readForm(m, cfg.f), ids = $$('input[name=pl]:checked', m).map(x => +x.value);
          const r = row ? await sb.from('tournaments').update(d).eq('id', row.id).select().single() : await sb.from('tournaments').insert(d).select().single();
          if (r.error) throw r.error;
          const tid = r.data.id;
          if (row) { const { error: de } = await sb.from('tournament_players').delete().eq('tournament_id', tid); if (de) throw de; }
          if (ids.length) { const { error: ie } = await sb.from('tournament_players').insert(ids.map(pid => ({ tournament_id: tid, player_id: pid }))); if (ie) throw ie; }
          toast('Saved'); m.remove(); route();
        } catch (err) { toast(err.message, 1); b.disabled = false; }
      };
    };
    const add = $('#add'); if (add) add.onclick = () => openTM(null);
    $$('[data-e]', ad).forEach(b => b.onclick = () => openTM(data[b.dataset.e]));
    const msum = $('#msum'); if (msum) msum.onclick = () => monthlySummaryModal(data);
  } else {
    const add = $('#add'); if (add) add.onclick = () => editModal('Add new', cfg.f, null, save(null));
    $$('[data-e]', ad).forEach(b => b.onclick = () => editModal('Edit', cfg.f, data[b.dataset.e], save(data[b.dataset.e])));
  }
  $$('[data-d]', ad).forEach(b => b.onclick = async () => { if (!confirm('Delete this item permanently?')) return;
    const r = data[b.dataset.d], { error } = await sb.from(key).delete().eq(pk, r[pk]); if (error) return toast(error.message, 1); toast('Deleted'); route(); });
  const fp = $('#fp'); if (fp) fp.onclick = () => editModal('Finance password for players', [{ k: 'p', l: 'New password (min 6 characters)', req: 1 }], null, async d => {
    if (!d.p || d.p.length < 6) throw new Error('Use at least 6 characters'); const { error } = await sb.rpc('set_finance_password', { p: d.p }); if (error) throw error; toast('Finance password updated'); });
}
R.admin = (v, k) => adminPage(v, k, 'site');
R.coach = (v, k) => adminPage(v, k, 'coach');

/* ---------- notice pop-up + reminders ---------- */
async function notice() {
  const { data } = await sb.from('notices').select('*').eq('active', true).order('id', { ascending: false }).limit(1);
  const n = data?.[0]; if (!n || sessionStorage.getItem('notice' + n.id)) return; sessionStorage.setItem('notice' + n.id, 1);
  setTimeout(() => modal(`<h3>${esc(n.title)}</h3><p style="white-space:pre-wrap;margin-bottom:20px">${esc(n.body || '')}</p><button class="btn pri" data-x>Got it</button>`), 900);
}
let remCache = [], remAt = 0;
async function reminders() {
  if (!S.member) return;
  if (Date.now() - remAt > 3e5) { remAt = Date.now(); const { data } = await sb.from('schedules').select('*').gte('starts_at', new Date().toISOString()).order('starts_at'); remCache = data || []; }
  const now = Date.now();
  for (const s of remCache) {
    const dt = new Date(s.starts_at) - now, k = 'rem' + s.id + s.starts_at;
    if (dt > 0 && dt <= (s.remind_min || 30) * 6e4 && (!s.for_player || s.for_player === S.me?.ign) && !localStorage.getItem(k)) {
      localStorage.setItem(k, 1); const msg = `${s.title} starts at ${fmtDT(s.starts_at)}${s.note ? '. ' + s.note : ''}`;
      toast(msg); if ('Notification' in window && Notification.permission === 'granted') new Notification(S.team.short_name + ' reminder', { body: msg });
    }
  }
}

/* ---------- boot ---------- */
(async function boot() {
  const { data } = await sb.from('team').select('*').eq('id', 1).maybeSingle(); S.team = data || { name: "THUNDER CHAMPION'S", short_name: 'TC', tagline: '#NEVER BACK DOWN' };
  setTimeout(() => $('#splash').classList.add('off'), 5000);
  brand(); footer(); await loadRoles(); await route(); notice(); reminders(); setInterval(reminders, 30000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
})();
})();
