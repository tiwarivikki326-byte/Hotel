/* Customer menu page */
(function () {
  'use strict';

  var T = {
    en: {
      search: 'Search dishes…', all: 'All', table: 'Table', avail: 'Available', unavail: 'Not available',
      none: 'No dishes found.', review: '⭐ Give us a review', photo: 'Photo', video: 'Video',
      note: 'Please tell your order to the waiter.', error: 'Could not load the menu. Please refresh.',
      menu: 'Menu'
    },
    hi: {
      search: 'डिश खोजें…', all: 'सभी', table: 'टेबल', avail: 'उपलब्ध', unavail: 'उपलब्ध नहीं',
      none: 'कोई डिश नहीं मिली।', review: '⭐ हमें रिव्यू दें', photo: 'फोटो', video: 'वीडियो',
      note: 'कृपया अपना ऑर्डर वेटर को बताएं।', error: 'मेन्यू लोड नहीं हो सका। कृपया पेज रिफ्रेश करें।',
      menu: 'मेन्यू'
    }
  };

  var state = { lang: 'en', cat: '', q: '', data: null };

  try {
    var saved = localStorage.getItem('qrm_lang');
    if (saved === 'hi' || saved === 'en') state.lang = saved;
    else if ((navigator.language || '').toLowerCase().indexOf('hi') === 0) state.lang = 'hi';
  } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var t = function (k) { return T[state.lang][k]; };
  var pick = function (o, f) {            // choose text in current language, fall back to the other one
    var a = o[f + '_' + state.lang], b = o[f + '_' + (state.lang === 'en' ? 'hi' : 'en')];
    return a || b || '';
  };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmtPrice(n) {
    var cur = (state.data && state.data.settings.currency) || '₹';
    var v = Number(n);
    return cur + (v % 1 === 0 ? v : v.toFixed(2));
  }

  /* table number from QR: /?table=5 */
  var tableNo = '';
  try {
    var tp = new URLSearchParams(location.search).get('table');
    if (tp) tableNo = tp.replace(/[^\w \-]/g, '').slice(0, 12);
  } catch (e) {}

  function setLang(l) {
    state.lang = l;
    try { localStorage.setItem('qrm_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    render();
  }

  document.querySelectorAll('.lang-btn').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
  });
  $('search').addEventListener('input', function (e) { state.q = e.target.value.trim().toLowerCase(); renderMenu(); });

  /* ---------- render ---------- */
  function render() {
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      var on = b.getAttribute('data-lang') === state.lang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
    $('search').placeholder = t('search');
    $('footNote').textContent = t('note');

    if (!state.data) return;
    var s = state.data.settings;
    var name = pick(s, 'name') || t('menu');
    $('restName').textContent = name;
    $('restTagline').textContent = pick(s, 'tagline');
    $('restTagline').hidden = !pick(s, 'tagline');
    document.title = name + ' – ' + t('menu');

    var tb = $('tableBadge');
    if (tableNo) { tb.hidden = false; tb.textContent = t('table') + ' ' + tableNo; } else tb.hidden = true;

    var rb = $('reviewBtn');
    if (s.review_url) { rb.hidden = false; rb.href = s.review_url; rb.textContent = t('review'); } else rb.hidden = true;

    renderChips();
    renderMenu();
  }

  function categories() {
    var seen = [], map = {};
    state.data.items.forEach(function (i) {
      var key = i.category_en || i.category_hi || '';
      if (!map[key]) { map[key] = true; seen.push({ key: key, label: pick(i, 'category') }); }
    });
    return seen;
  }

  function renderChips() {
    var box = $('chips');
    box.textContent = '';
    var cats = categories();
    if (cats.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    var mk = function (key, label) {
      var b = el('button', 'chip' + (state.cat === key ? ' active' : ''), label);
      b.type = 'button';
      b.addEventListener('click', function () { state.cat = key; renderChips(); renderMenu(); });
      box.appendChild(b);
    };
    mk('', t('all'));
    cats.forEach(function (c) { if (c.key) mk(c.key, c.label); });
  }

  function renderMenu() {
    var box = $('menu');
    box.textContent = '';
    var items = state.data.items.filter(function (i) {
      var key = i.category_en || i.category_hi || '';
      if (state.cat && key !== state.cat) return false;
      if (state.q) {
        var hay = [i.name_en, i.name_hi, i.desc_en, i.desc_hi].join(' ').toLowerCase();
        if (hay.indexOf(state.q) < 0) return false;
      }
      return true;
    });
    if (!items.length) { box.appendChild(el('div', 'empty', t('none'))); return; }

    var groups = [], idx = {};
    items.forEach(function (i) {
      var key = i.category_en || i.category_hi || '';
      if (!(key in idx)) { idx[key] = groups.length; groups.push({ key: key, label: pick(i, 'category'), items: [] }); }
      groups[idx[key]].items.push(i);
    });
    groups.forEach(function (g) {
      if (g.label) box.appendChild(el('h2', 'cat-title', g.label));
      g.items.forEach(function (i) { box.appendChild(card(i)); });
    });
  }

  function card(i) {
    var c = el('article', 'item' + (i.available ? '' : ' off'));
    var hasMedia = i.image || i.video;
    var th = el('button', 'thumb' + (hasMedia ? '' : ' noclick'));
    th.type = 'button';
    if (i.image) {
      var img = el('img'); img.src = i.image; img.alt = pick(i, 'name'); img.loading = 'lazy';
      th.appendChild(img);
    } else th.textContent = '🍽️';
    if (i.video) th.appendChild(el('span', 'play', '▶'));
    if (hasMedia) th.addEventListener('click', function () { openViewer(i); });
    c.appendChild(th);

    var info = el('div', 'info');
    info.appendChild(el('h3', '', pick(i, 'name')));
    var d = pick(i, 'desc');
    if (d) info.appendChild(el('p', '', d));
    var row = el('div', 'row');
    row.appendChild(el('span', 'price', fmtPrice(i.price)));
    row.appendChild(el('span', 'badge ' + (i.available ? 'ok' : 'no'), i.available ? t('avail') : t('unavail')));
    info.appendChild(row);
    c.appendChild(info);
    return c;
  }

  /* ---------- photo / video viewer ---------- */
  var viewer = $('viewer');
  function closeViewer() {
    viewer.hidden = true;
    $('viewerMedia').textContent = '';
    document.body.style.overflow = '';
  }
  function openViewer(i) {
    var media = $('viewerMedia');
    media.textContent = '';
    var holder = el('div');
    function showImage() {
      holder.textContent = '';
      var im = el('img'); im.src = i.image; im.alt = pick(i, 'name'); holder.appendChild(im);
    }
    function showVideo() {
      holder.textContent = '';
      var v = el('video'); v.src = i.video; v.controls = true; v.autoplay = true;
      v.setAttribute('playsinline', ''); holder.appendChild(v);
    }
    if (i.image && i.video) {
      var tabs = el('div', 'viewer-tabs');
      var bp = el('button', 'active', t('photo')), bv = el('button', '', t('video'));
      bp.type = bv.type = 'button';
      bp.onclick = function () { bp.className = 'active'; bv.className = ''; showImage(); };
      bv.onclick = function () { bv.className = 'active'; bp.className = ''; showVideo(); };
      tabs.appendChild(bp); tabs.appendChild(bv);
      media.appendChild(tabs);
      showImage();
    } else if (i.video) showVideo(); else showImage();
    media.appendChild(holder);

    $('viewerTitle').textContent = pick(i, 'name');
    $('viewerDesc').textContent = pick(i, 'desc');
    $('viewerPrice').textContent = fmtPrice(i.price);
    viewer.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  $('viewerClose').addEventListener('click', closeViewer);
  viewer.addEventListener('click', function (e) { if (e.target === viewer) closeViewer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !viewer.hidden) closeViewer(); });

  /* ---------- load ---------- */
  document.documentElement.lang = state.lang;
  render();
  fetch('/api/menu', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) { state.data = d; render(); })
    .catch(function () { $('menu').appendChild(el('div', 'empty', t('error'))); });
})();
