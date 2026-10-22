/* Admin panel */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var items = [];
  var settings = {};
  var editing = null;           // item being edited (null = new)
  var form = { image: '', video: '' };
  var uploading = 0;

  /* ---------- api ---------- */
  function api(method, url, body) {
    var opt = { method: method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && url !== '/api/admin/login') { showLogin(); throw new Error(d.error || 'Please login'); }
        if (!r.ok) throw new Error(d.error || 'Something went wrong');
        return d;
      });
    });
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2400);
  }

  /* ---------- views ---------- */
  function showLogin() {
    $('appView').hidden = true; $('loginView').hidden = false; $('lPass').value = '';
  }
  function showApp() {
    $('loginView').hidden = true; $('appView').hidden = false;
  }
  function boot() {
    api('GET', '/api/admin/me').then(function (me) {
      settings = me.settings; $('pwBanner').hidden = !me.default_password;
      $('pUser').placeholder = me.username;
      fillSettings(); showApp(); loadItems();
      $('qrBase').value = location.origin;
    }).catch(function () { showLogin(); });
  }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('lErr').textContent = '';
    api('POST', '/api/admin/login', { username: $('lUser').value, password: $('lPass').value })
      .then(boot).catch(function (er) { $('lErr').textContent = er.message; });
  });
  $('logoutBtn').addEventListener('click', function () {
    api('POST', '/api/admin/logout').then(showLogin).catch(showLogin);
  });

  /* tabs */
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x === b); });
      ['items', 'qr', 'settings'].forEach(function (n) { $('tab-' + n).hidden = (n !== b.getAttribute('data-tab')); });
      if (b.getAttribute('data-tab') === 'qr' && !$('qrGrid').children.length) genQR();
    });
  });

  /* ---------- items list ---------- */
  function loadItems() {
    return fetch('/api/menu', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      items = d.items; renderItems(); fillCategories();
    });
  }
  function fmtPrice(n) {
    var v = Number(n); return (settings.currency || '₹') + (v % 1 === 0 ? v : v.toFixed(2));
  }
  function renderItems() {
    var list = $('itemList'); list.textContent = '';
    $('itemCount').textContent = items.length;
    if (!items.length) {
      list.appendChild(el('div', 'empty', 'No items yet. Click “Add Item”. · अभी कोई आइटम नहीं है।'));
      return;
    }
    items.forEach(function (i) {
      var row = el('div', 'row');
      var th = el('div', 'th');
      if (i.image) { var im = el('img'); im.src = i.image; im.alt = ''; th.appendChild(im); } else th.textContent = '🍽️';
      if (i.video) th.appendChild(el('span', 'vd', '▶ video'));
      row.appendChild(th);

      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'nm', i.name_en));
      if (i.name_hi) meta.appendChild(el('div', 'nm2', i.name_hi));
      var cat = [i.category_en, i.category_hi].filter(Boolean).join(' / ');
      if (cat) meta.appendChild(el('div', 'cat', cat));
      row.appendChild(meta);

      row.appendChild(el('div', 'pr', fmtPrice(i.price)));

      var acts = el('div', 'acts');
      var sw = el('label', 'sw-wrap');
      var swb = el('span', 'sw'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = i.available;
      cb.setAttribute('aria-label', 'Available');
      swb.appendChild(cb); swb.appendChild(el('span'));
      var lbl = el('span', '', i.available ? 'ON' : 'OFF');
      cb.addEventListener('change', function () {
        api('PUT', '/api/admin/items/' + i.id, { available: cb.checked }).then(function () {
          i.available = cb.checked; lbl.textContent = cb.checked ? 'ON' : 'OFF';
          toast(cb.checked ? 'Marked available' : 'Marked not available');
        }).catch(function (er) { cb.checked = !cb.checked; toast(er.message); });
      });
      sw.appendChild(swb); sw.appendChild(lbl); acts.appendChild(sw);

      var eb = el('button', 'btn small', 'Edit'); eb.type = 'button';
      eb.addEventListener('click', function () { openForm(i); });
      var db = el('button', 'btn small danger', 'Delete'); db.type = 'button';
      db.addEventListener('click', function () {
        if (!confirm('Delete "' + i.name_en + '"?\nक्या आप इसे हटाना चाहते हैं?')) return;
        api('DELETE', '/api/admin/items/' + i.id).then(function () { toast('Deleted'); return loadItems(); })
          .catch(function (er) { toast(er.message); });
      });
      acts.appendChild(eb); acts.appendChild(db);
      row.appendChild(acts);
      list.appendChild(row);
    });
  }
  function fillCategories() {
    var en = {}, hi = {};
    items.forEach(function (i) { if (i.category_en) en[i.category_en] = 1; if (i.category_hi) hi[i.category_hi] = 1; });
    var f = function (id, obj) {
      var dl = $(id); dl.textContent = '';
      Object.keys(obj).forEach(function (k) { var o = el('option'); o.value = k; dl.appendChild(o); });
    };
    f('catListEn', en); f('catListHi', hi);
  }

  /* ---------- item form ---------- */
  var dlg = $('itemDlg');
  $('addBtn').addEventListener('click', function () { openForm(null); });
  $('dlgClose').addEventListener('click', function () { dlg.close(); });
  $('dlgCancel').addEventListener('click', function () { dlg.close(); });

  function openForm(i) {
    editing = i;
    $('dlgTitle').textContent = i ? 'Edit Item · आइटम बदलें' : 'Add Item · आइटम जोड़ें';
    $('fNameEn').value = i ? i.name_en : '';
    $('fNameHi').value = i ? i.name_hi : '';
    $('fPrice').value = i ? i.price : '';
    $('fAvail').checked = i ? i.available : true;
    $('fCatEn').value = i ? i.category_en : '';
    $('fCatHi').value = i ? i.category_hi : '';
    $('fDescEn').value = i ? i.desc_en : '';
    $('fDescHi').value = i ? i.desc_hi : '';
    form.image = i ? i.image : ''; form.video = i ? i.video : '';
    $('fErr').textContent = ''; $('upStatus').textContent = '';
    renderMedia();
    dlg.showModal();
  }
  function renderMedia() {
    var ip = $('imgPrev'); ip.textContent = '';
    if (form.image) { var im = el('img'); im.src = form.image; ip.appendChild(im); } else ip.textContent = 'No photo';
    $('imgDel').hidden = !form.image; $('imgPick').textContent = form.image ? 'Change photo' : 'Choose photo';
    var vp = $('vidPrev'); vp.textContent = '';
    if (form.video) { var v = el('video'); v.src = form.video; v.controls = true; v.preload = 'metadata'; v.setAttribute('playsinline', ''); vp.appendChild(v); } else vp.textContent = 'No video';
    $('vidDel').hidden = !form.video; $('vidPick').textContent = form.video ? 'Change video' : 'Choose video';
  }
  $('imgPick').addEventListener('click', function () { $('fImg').click(); });
  $('vidPick').addEventListener('click', function () { $('fVid').click(); });
  $('imgDel').addEventListener('click', function () { form.image = ''; renderMedia(); });
  $('vidDel').addEventListener('click', function () { form.video = ''; renderMedia(); });

  /* shrink big phone photos before upload (faster for customers too) */
  function shrinkImage(file) {
    return new Promise(function (resolve) {
      if (/gif$/i.test(file.type) || !file.type) return resolve({ blob: file, ext: extOf(file) });
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1200, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); resolve(b ? { blob: b, ext: 'jpg' } : { blob: file, ext: extOf(file) }); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve({ blob: file, ext: extOf(file) }); };
      img.src = url;
    });
  }
  function extOf(f) {
    var m = /\.([a-z0-9]+)$/i.exec(f.name || ''); var e = m ? m[1].toLowerCase() : '';
    if (!e && f.type) e = f.type.split('/')[1];
    return e === 'jpeg' ? 'jpg' : e;
  }
  function upload(blob, ext, label) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', '/api/admin/upload?ext=' + encodeURIComponent(ext));
      x.upload.onprogress = function (e) {
        if (e.lengthComputable) $('upStatus').textContent = 'Uploading ' + label + '… ' + Math.round(e.loaded / e.total * 100) + '%';
      };
      x.onload = function () {
        var d = {}; try { d = JSON.parse(x.responseText); } catch (e) {}
        if (x.status === 200 && d.url) resolve(d.url);
        else if (x.status === 401) { showLogin(); reject(new Error('Please login again')); }
        else reject(new Error(d.error || 'Upload failed'));
      };
      x.onerror = function () { reject(new Error('Upload failed (network)')); };
      x.send(blob);
    });
  }
  function pickHandler(inputId, kind) {
    $(inputId).addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      $('fErr').textContent = '';
      uploading++; $('dlgSave').disabled = true;
      var job;
      if (kind === 'image') {
        job = shrinkImage(f).then(function (r) { return upload(r.blob, r.ext, 'photo'); });
      } else {
        if (f.size > 60 * 1024 * 1024) { uploading--; $('dlgSave').disabled = uploading > 0; $('fErr').textContent = 'Video is bigger than 60 MB.'; return; }
        job = upload(f, extOf(f) || 'mp4', 'video');
      }
      job.then(function (url) { form[kind === 'image' ? 'image' : 'video'] = url; renderMedia(); $('upStatus').textContent = 'Uploaded ✓'; })
        .catch(function (er) { $('fErr').textContent = er.message; $('upStatus').textContent = ''; })
        .then(function () { uploading--; $('dlgSave').disabled = uploading > 0; });
    });
  }
  pickHandler('fImg', 'image'); pickHandler('fVid', 'video');

  $('itemForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (uploading) return;
    $('fErr').textContent = '';
    var body = {
      name_en: $('fNameEn').value, name_hi: $('fNameHi').value, price: $('fPrice').value,
      available: $('fAvail').checked, category_en: $('fCatEn').value, category_hi: $('fCatHi').value,
      desc_en: $('fDescEn').value, desc_hi: $('fDescHi').value, image: form.image, video: form.video
    };
    var req = editing ? api('PUT', '/api/admin/items/' + editing.id, body) : api('POST', '/api/admin/items', body);
    req.then(function () { dlg.close(); toast('Saved ✓'); return loadItems(); })
      .catch(function (er) { $('fErr').textContent = er.message; });
  });

  /* ---------- settings ---------- */
  function fillSettings() {
    $('topName').textContent = settings.name_en || 'Admin';
    $('sNameEn').value = settings.name_en || ''; $('sNameHi').value = settings.name_hi || '';
    $('sTagEn').value = settings.tagline_en || ''; $('sTagHi').value = settings.tagline_hi || '';
    $('sCur').value = settings.currency || '₹'; $('sReview').value = settings.review_url || '';
  }
  $('setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {
      name_en: $('sNameEn').value, name_hi: $('sNameHi').value, tagline_en: $('sTagEn').value,
      tagline_hi: $('sTagHi').value, currency: $('sCur').value, review_url: $('sReview').value
    };
    api('PUT', '/api/admin/settings', body).then(function () {
      return api('GET', '/api/admin/me');
    }).then(function (me) {
      settings = me.settings; fillSettings(); renderItems();
      $('setMsg').textContent = 'Saved ✓'; setTimeout(function () { $('setMsg').textContent = ''; }, 2500);
    }).catch(function (er) { toast(er.message); });
  });
  $('pwForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var m = $('pwMsg'); m.className = 'ok'; m.textContent = '';
    api('POST', '/api/admin/password', { current: $('pCur').value, new_password: $('pNew').value, new_username: $('pUser').value })
      .then(function () {
        m.textContent = 'Changed ✓'; $('pwBanner').hidden = true; $('pwForm').reset();
      }).catch(function (er) { m.className = 'err'; m.textContent = er.message; });
  });

  /* ---------- QR codes ---------- */
  function cleanBase(v) {
    v = (v || '').trim().replace(/\/+$/, '');
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    return v;
  }
  function genQR() {
    var base = cleanBase($('qrBase').value) || location.origin;
    var from = Math.max(1, parseInt($('qrFrom').value, 10) || 1);
    var to = Math.min(200, Math.max(from, parseInt($('qrTo').value, 10) || from));
    var warn = $('qrWarn');
    if (/localhost|127\.0\.0\.1/i.test(base)) {
      warn.hidden = false;
      warn.textContent = '⚠️ "localhost" only works on this computer. Before printing, enter your live website address (or this computer\'s Wi-Fi IP like http://192.168.1.5:3000) above and click Generate. · प्रिंट करने से पहले अपनी लाइव वेबसाइट का पता डालें।';
    } else warn.hidden = true;

    var grid = $('qrGrid'); grid.textContent = '';
    var name = settings.name_en || '';
    for (var n = from; n <= to; n++) {
      var link = base + '/?table=' + n;
      var card = el('div', 'qr-card');
      card.appendChild(el('div', 'rn', name));
      card.appendChild(el('div', 'tn', 'Table ' + n + ' · टेबल ' + n));
      var holder = el('div'); holder.innerHTML = window.makeQRSvg(link, 200);   // svg generated by our own code
      card.appendChild(holder);
      card.appendChild(el('div', 'sc', 'Scan for menu · मेन्यू के लिए स्कैन करें'));
      card.appendChild(el('div', 'u', link));
      var a = el('a', 'dl', 'Download SVG');
      a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.makeQRSvg(link, 600));
      a.download = 'table-' + n + '-qr.svg';
      card.appendChild(a);
      grid.appendChild(card);
    }
  }
  $('qrGen').addEventListener('click', genQR);
  $('qrPrint').addEventListener('click', function () { if (!$('qrGrid').children.length) genQR(); window.print(); });

  boot();
})();
