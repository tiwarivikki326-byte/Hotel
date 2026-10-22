/*
 * QR Menu - simple server (no external packages needed, only Node.js 16+)
 * Run:  node server.js     then open  http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const MENU_FILE = path.join(DATA, 'menu.json');
const SETTINGS_FILE = path.join(DATA, 'settings.json');

const MAX_UPLOAD = 60 * 1024 * 1024; // 60 MB
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

/* ---------- storage helpers ---------- */
fs.mkdirSync(UPLOADS, { recursive: true });

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + h;
}
function checkPassword(pw, stored) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const real = Buffer.from(h, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}
const uid = () => crypto.randomBytes(6).toString('hex');

/* ---------- first-run data ---------- */
if (!fs.existsSync(SETTINGS_FILE)) {
  writeJSON(SETTINGS_FILE, {
    name_en: 'My Restaurant',
    name_hi: 'मेरा रेस्टोरेंट',
    tagline_en: 'Scan • Choose • Enjoy',
    tagline_hi: 'स्कैन करें • चुनें • आनंद लें',
    currency: '₹',
    review_url: '',
    admin_user: 'admin',
    admin_pass: hashPassword('admin123'),
    default_password: true,
  });
}
if (!fs.existsSync(MENU_FILE)) {
  const now = Date.now();
  const s = (en, hi, de, dh, price, ce, ch, i) => ({
    id: uid(), name_en: en, name_hi: hi, desc_en: de, desc_hi: dh, price,
    category_en: ce, category_hi: ch, available: true, image: '', video: '', created: now + i,
  });
  writeJSON(MENU_FILE, [
    s('Paneer Butter Masala', 'पनीर बटर मसाला', 'Soft paneer cubes in a rich, creamy tomato gravy.', 'मलाईदार टमाटर ग्रेवी में नरम पनीर।', 220, 'Main Course', 'मुख्य व्यंजन', 1),
    s('Dal Tadka', 'दाल तड़का', 'Yellow lentils tempered with garlic, cumin and ghee.', 'लहसुन, जीरा और घी के तड़के वाली पीली दाल।', 140, 'Main Course', 'मुख्य व्यंजन', 2),
    s('Butter Naan', 'बटर नान', 'Soft tandoor-baked bread brushed with butter.', 'मक्खन लगा तंदूरी नान।', 40, 'Breads', 'रोटी / नान', 3),
    s('Veg Biryani', 'वेज बिरयानी', 'Fragrant basmati rice cooked with vegetables and spices.', 'सब्ज़ियों और मसालों वाली खुशबूदार बासमती बिरयानी।', 180, 'Rice', 'चावल', 4),
    s('Masala Chai', 'मसाला चाय', 'Hot ginger-cardamom tea.', 'अदरक-इलायची वाली गरमा-गरम चाय।', 25, 'Drinks', 'पेय', 5),
    s('Gulab Jamun (2 pcs)', 'गुलाब जामुन (2 पीस)', 'Warm milk dumplings in sugar syrup.', 'चाशनी में डूबे गरम गुलाब जामुन।', 60, 'Desserts', 'मिठाई', 6),
  ]);
}

/* ---------- sessions ---------- */
const sessions = new Map(); // token -> expiry
const failed = new Map();   // ip -> {count, until}
const SESSION_MS = 1000 * 60 * 60 * 12;

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) {
  const t = parseCookies(req).qrm_session;
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}

/* ---------- response helpers ---------- */
function send(res, code, body, headers) {
  const h = Object.assign({ 'X-Content-Type-Options': 'nosniff' }, headers || {});
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    h['Content-Type'] = 'application/json; charset=utf-8';
    h['Cache-Control'] = 'no-store';
  }
  res.writeHead(code, h);
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJSONBody(req) {
  const b = await readBody(req, 1024 * 1024);
  try { return JSON.parse(b.toString('utf8') || '{}'); } catch (e) { return {}; }
}

function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
    headers['Cache-Control'] = cache || 'no-cache';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (m && !m[1] && m[2]) { start = Math.max(0, st.size - parseInt(m[2], 10)); end = st.size - 1; }
      if (isNaN(start) || start >= st.size || end >= st.size || start > end) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
        return res.end();
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers);
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- data logic ---------- */
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 300);

function cleanItem(b, old) {
  const price = parseFloat(b.price);
  const it = {
    id: old ? old.id : uid(),
    name_en: str(b.name_en, 120),
    name_hi: str(b.name_hi, 120),
    desc_en: str(b.desc_en, 600),
    desc_hi: str(b.desc_hi, 600),
    price: isFinite(price) && price >= 0 ? price : 0,
    category_en: str(b.category_en, 60),
    category_hi: str(b.category_hi, 60),
    available: b.available !== false,
    image: validUpload(b.image, IMAGE_EXT),
    video: validUpload(b.video, VIDEO_EXT),
    created: old ? old.created : Date.now(),
  };
  return it;
}
function validUpload(url, exts) {
  url = String(url || '');
  const m = /^\/uploads\/([a-f0-9]{16}\.([a-z0-9]+))$/.exec(url);
  if (!m || !exts.includes(m[2])) return '';
  return url;
}
function removeOrphans(candidates, items) {
  const used = new Set();
  items.forEach(i => { used.add(i.image); used.add(i.video); });
  candidates.forEach(u => {
    if (u && !used.has(u)) {
      const f = path.join(UPLOADS, path.basename(u));
      fs.unlink(f, () => {});
    }
  });
}

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  // ----- public -----
  if (p === '/api/menu' && method === 'GET') {
    const s = readJSON(SETTINGS_FILE, {});
    const items = readJSON(MENU_FILE, []).sort((a, b) => a.created - b.created);
    return send(res, 200, {
      settings: {
        name_en: s.name_en, name_hi: s.name_hi, tagline_en: s.tagline_en, tagline_hi: s.tagline_hi,
        currency: s.currency, review_url: s.review_url,
      },
      items,
    });
  }

  // ----- admin auth -----
  if (p === '/api/admin/login' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'x';
    const f = failed.get(ip);
    if (f && f.until > Date.now()) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    const b = await readJSONBody(req);
    const s = readJSON(SETTINGS_FILE, {});
    const ok = str(b.username, 60) === s.admin_user && checkPassword(String(b.password || ''), s.admin_pass);
    if (!ok) {
      const c = (f ? f.count : 0) + 1;
      failed.set(ip, { count: c, until: c >= 8 ? Date.now() + 10 * 60 * 1000 : 0 });
      return send(res, 401, { error: 'Wrong username or password' });
    }
    failed.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_MS);
    return send(res, 200, { ok: true, default_password: !!s.default_password }, {
      'Set-Cookie': `qrm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`,
    });
  }
  if (p === '/api/admin/logout' && method === 'POST') {
    const t = parseCookies(req).qrm_session;
    if (t) sessions.delete(t);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'qrm_session=; HttpOnly; Path=/; Max-Age=0' });
  }

  // everything below needs admin
  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'Not found' });
  if (!isAdmin(req)) return send(res, 401, { error: 'Please login' });

  if (p === '/api/admin/me' && method === 'GET') {
    const s = readJSON(SETTINGS_FILE, {});
    return send(res, 200, {
      ok: true, default_password: !!s.default_password, username: s.admin_user,
      settings: {
        name_en: s.name_en, name_hi: s.name_hi, tagline_en: s.tagline_en, tagline_hi: s.tagline_hi,
        currency: s.currency, review_url: s.review_url,
      },
    });
  }

  if (p === '/api/admin/items' && method === 'POST') {
    const b = await readJSONBody(req);
    const it = cleanItem(b);
    if (!it.name_en && !it.name_hi) return send(res, 400, { error: 'Item name is required' });
    if (!it.name_en) it.name_en = it.name_hi;
    const items = readJSON(MENU_FILE, []);
    items.push(it);
    writeJSON(MENU_FILE, items);
    return send(res, 200, it);
  }

  const m = /^\/api\/admin\/items\/([a-f0-9]+)$/.exec(p);
  if (m) {
    const items = readJSON(MENU_FILE, []);
    const idx = items.findIndex(i => i.id === m[1]);
    if (idx < 0) return send(res, 404, { error: 'Item not found' });
    const old = items[idx];
    if (method === 'PUT') {
      const b = await readJSONBody(req);
      const it = cleanItem(Object.assign({}, old, b), old);
      if (!it.name_en && !it.name_hi) return send(res, 400, { error: 'Item name is required' });
      if (!it.name_en) it.name_en = it.name_hi;
      items[idx] = it;
      writeJSON(MENU_FILE, items);
      removeOrphans([old.image, old.video], items);
      return send(res, 200, it);
    }
    if (method === 'DELETE') {
      items.splice(idx, 1);
      writeJSON(MENU_FILE, items);
      removeOrphans([old.image, old.video], items);
      return send(res, 200, { ok: true });
    }
  }

  if (p === '/api/admin/settings' && method === 'PUT') {
    const b = await readJSONBody(req);
    const s = readJSON(SETTINGS_FILE, {});
    s.name_en = str(b.name_en, 80) || s.name_en;
    s.name_hi = str(b.name_hi, 80);
    s.tagline_en = str(b.tagline_en, 120);
    s.tagline_hi = str(b.tagline_hi, 120);
    s.currency = str(b.currency, 4) || '₹';
    let r = str(b.review_url, 500);
    if (r && !/^https?:\/\//i.test(r)) r = 'https://' + r;
    s.review_url = r;
    writeJSON(SETTINGS_FILE, s);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/password' && method === 'POST') {
    const b = await readJSONBody(req);
    const s = readJSON(SETTINGS_FILE, {});
    if (!checkPassword(String(b.current || ''), s.admin_pass)) return send(res, 400, { error: 'Current password is wrong' });
    const np = String(b.new_password || '');
    if (np.length < 6) return send(res, 400, { error: 'New password must be at least 6 characters' });
    const nu = str(b.new_username, 60);
    if (nu) s.admin_user = nu;
    s.admin_pass = hashPassword(np);
    s.default_password = false;
    writeJSON(SETTINGS_FILE, s);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/upload' && method === 'POST') {
    const ext = str(url.searchParams.get('ext'), 6).toLowerCase().replace('jpeg', 'jpg');
    if (![...IMAGE_EXT, ...VIDEO_EXT].includes(ext)) return send(res, 400, { error: 'File type not allowed' });
    const len = parseInt(req.headers['content-length'] || '0', 10);
    if (len > MAX_UPLOAD) return send(res, 413, { error: 'File too large (max 60 MB)' });
    let body;
    try { body = await readBody(req, MAX_UPLOAD); } catch (e) { return send(res, 413, { error: 'File too large (max 60 MB)' }); }
    if (!body.length) return send(res, 400, { error: 'Empty file' });
    const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(UPLOADS, name), body);
    return send(res, 200, { url: '/uploads/' + name });
  }

  return send(res, 404, { error: 'Not found' });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p;
    try { p = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain' }); }

    if (p.startsWith('/api/')) {
      url.pathname = p;
      return await handleApi(req, res, url);
    }
    if (p.startsWith('/uploads/')) {
      const f = path.join(UPLOADS, path.basename(p));
      return serveFile(req, res, f, 'public, max-age=31536000, immutable');
    }
    if (p === '/admin' || p === '/admin/') p = '/admin.html';
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUB, p));
    if (!file.startsWith(PUB + path.sep)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
    serveFile(req, res, file);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log('\n  QR Menu is running!');
  console.log('  Customer menu : http://localhost:' + PORT + '/');
  console.log('  Admin panel   : http://localhost:' + PORT + '/admin');
  console.log('  Default login : admin / admin123   (change it after first login)\n');
});
