'use strict';
(() => {
  // ---------- أدوات ----------
  const NS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs, ...kids) {
    const svg = ['svg', 'rect', 'text', 'line', 'g', 'path'].includes(tag);
    const el = svg ? document.createElementNS(NS, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.setAttribute('class', v);
      else if (k === 'value' && !svg) el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(9)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const $app = document.getElementById('app');
  const toast = (m, bad) => { const t = document.getElementById('toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3200); };
  async function api(path, { method = 'GET', body, form } = {}) {
    const opts = { method, headers: { 'X-Requested-With': 'np-admin' }, credentials: 'same-origin' };
    if (form) opts.body = form; else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch('/api/admin' + path, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { me = null; render(); throw new Error('انتهت الجلسة'); }
    if (!res.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
  }
  const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ar-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const num = (n) => new Intl.NumberFormat('ar-u-nu-latn').format(n || 0);
  const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const STATUS = { draft: 'مسودة', review: 'قيد المراجعة', scheduled: 'مجدول', published: 'منشور', archived: 'مؤرشف' };
  const can = (p) => me && me.permissions.includes(p);
  const field = (label, input, hint) => h('div', { class: 'f' }, h('label', null, label), input, hint && h('small', null, hint));

  let me = null;
  let route = location.hash.slice(1) || '/';
  addEventListener('hashchange', () => { route = location.hash.slice(1) || '/'; render(); });

  // ---------- الدخول ----------
  function loginView() {
    const err = h('div', { class: 'err' });
    const email = h('input', { type: 'email', autocomplete: 'username', required: true });
    const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const form = h('form', { class: 'card', onsubmit: guard(async (e) => {
      e.preventDefault(); err.textContent = '';
      try { await api('/login', { method: 'POST', body: { email: email.value, password: pw.value } }); await boot(); }
      catch (x) { err.textContent = x.message; }
    }) }, field('البريد الإلكتروني', email), field('كلمة المرور', pw), err, h('button', { class: 'btn', style: 'width:100%' }, 'دخول'));
    return h('div', { class: 'login' }, h('h1', null, 'لوحة الإدارة'), form);
  }

  // ---------- الهيكل ----------
  const NAV = [
    ['/', 'لوحة المعلومات', 'stats.view'], ['/articles', 'الأخبار', 'articles.create'], ['/articles/new', '+ خبر جديد', 'articles.create'],
    ['/categories', 'التصنيفات', 'categories.manage'], ['/media', 'الوسائط', 'media.manage'], ['/reels', 'الريلز', 'media.manage'], ['/ads', 'الإعلانات', 'ads.manage'],
    ['/notifications', 'الإشعارات', 'notifications.send'], ['/users', 'المحررون والصلاحيات', 'users.manage'], ['/settings', 'الإعدادات والنسخ الاحتياطي', 'settings.manage'],
  ];
  function shell(title, content, actions) {
    const sb = h('aside', { class: 'sb' }, h('h1', null, h('i'), 'جريدة الحياة'),
      ...NAV.filter((n) => can(n[2])).map((n) => h('a', { href: '#' + n[0], class: route === n[0] ? 'on' : '', onclick: () => sb.classList.remove('open') }, n[1])),
      h('a', { href: '/', target: '_blank' }, 'عرض الموقع ↗'),
      h('div', { class: 'who' }, h('b', null, me.name), h('div', null, me.roleLabel),
        h('button', { class: 'btn sec sm', onclick: changePassword }, 'تغيير كلمة المرور'), ' ',
        h('button', { class: 'btn sec sm', onclick: guard(async () => { await api('/logout', { method: 'POST' }); me = null; render(); }) }, 'خروج')));
    return h('div', { class: 'shell' }, sb, h('main', null,
      h('div', { class: 'top' }, h('button', { class: 'btn sec menu', onclick: () => sb.classList.toggle('open'), 'aria-label': 'القائمة' }, '☰'), h('h2', null, title), h('span', { class: 'sp' }), actions), content));
  }
  const changePassword = guard(async () => {
    const current = prompt('كلمة المرور الحالية'); if (!current) return;
    const password = prompt('كلمة المرور الجديدة (10 أحرف على الأقل)'); if (!password) return;
    await api('/me/password', { method: 'POST', body: { current, password } });
    toast('تم التغيير، سجّل الدخول من جديد'); me = null; render();
  });

  // ---------- لوحة المعلومات ----------
  async function dashboard() {
    const d = await api('/dashboard');
    const t = d.totals;
    const stat = (v, l) => h('div', { class: 'card stat' }, h('b', null, num(v)), h('span', null, l));
    const chart = (series, keyA, keyB) => {
      const W = 1000, H = 240, p = 24, max = Math.max(1, ...series.map((s) => s[keyA]));
      const bw = (W - p * 2) / series.length;
      const svg = h('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'الزيارات اليومية' });
      series.forEach((s, i) => {
        const hh = ((H - 40) * s[keyA]) / max, hb = ((H - 40) * s[keyB]) / max;
        svg.append(h('rect', { class: 'bar', x: p + i * bw + 2, y: H - 20 - hh, width: Math.max(2, bw - 4), height: hh, rx: 2 }, h('title', null, `${s.day}: ${num(s[keyA])}`)));
        svg.append(h('rect', { class: 'bar2', x: p + i * bw + 2, y: H - 20 - hb, width: Math.max(2, bw - 4), height: hb, rx: 2, opacity: .85 }));
        if (i % 5 === 0) svg.append(h('text', { x: p + i * bw, y: H - 4, 'font-size': 10, fill: 'currentColor', opacity: .6 }, s.day.slice(5)));
      });
      return svg;
    };
    return shell('لوحة المعلومات', h('div', { class: 'grid' },
      h('div', { class: 'grid g4' }, stat(t.today.views, 'مشاهدات اليوم'), stat(t.today.visitors, 'زوار اليوم'), stat(t.views7, 'مشاهدات 7 أيام'),
        stat(d.articles.published || 0, 'أخبار منشورة'), stat((d.articles.draft || 0) + (d.articles.review || 0), 'مسودات/مراجعة'), stat(d.devices, 'أجهزة التطبيق')),
      h('div', { class: 'card' }, h('h3', null, 'الزيارات خلال 30 يوماً'), h('small', null, 'الأحمر: كل المشاهدات، الأزرق: تطبيق الأندرويد  •  الموقع ', num(t.webPeriod), ' | التطبيق ', num(t.appPeriod)), chart(d.series, 'views', 'app')),
      h('div', { class: 'grid g2' },
        h('div', { class: 'card' }, h('h3', null, 'الأكثر قراءة'), h('div', { class: 'tw' }, h('table', null, ...d.topArticles.map((a) => h('tr', null, h('td', null, h('a', { href: `/news/${a.id}/${a.slug}`, target: '_blank' }, a.title)), h('td', null, num(a.views))))))),
        h('div', { class: 'card' }, h('h3', null, 'القراءات حسب التصنيف'), ...d.byCategory.map((c) => {
          const total = d.byCategory.reduce((s, x) => s + x.views, 0) || 1;
          return h('div', { style: 'margin-bottom:8px' }, h('div', { class: 'row' }, h('span', { class: 'grow' }, c.name), num(c.views)),
            h('div', { style: `height:8px;border-radius:4px;background:var(--line)` }, h('div', { style: `height:8px;border-radius:4px;width:${(c.views / total) * 100}%;background:${c.color}` })));
        })))));
  }

  // ---------- قائمة الأخبار ----------
  async function articlesList() {
    const q = Object.fromEntries(new URLSearchParams(route.split('?')[1] || ''));
    const [cats, list] = await Promise.all([api('/categories'), api('/articles?' + new URLSearchParams({ ...q, limit: 20 }))]);
    const go = (extra) => { location.hash = '/articles?' + new URLSearchParams({ ...q, ...extra, ...(extra.page ? {} : { page: 1 }) }); };
    const search = h('input', { type: 'search', placeholder: 'بحث في العناوين...', value: q.q || '', onkeydown: (e) => e.key === 'Enter' && go({ q: e.target.value }) });
    const st = h('select', { onchange: (e) => go({ status: e.target.value }) }, h('option', { value: '' }, 'كل الحالات'), ...Object.entries(STATUS).map(([k, v]) => h('option', { value: k, selected: q.status === k }, v)));
    const ct = h('select', { onchange: (e) => go({ category: e.target.value }) }, h('option', { value: '' }, 'كل التصنيفات'), ...cats.items.map((c) => h('option', { value: c.id, selected: q.category == c.id }, c.name)));
    const del = guard(async (a) => { if (confirm(`حذف «${a.title}» نهائياً؟`)) { await api('/articles/' + a.id, { method: 'DELETE' }); toast('تم الحذف'); render(); } });
    const setStatus = guard(async (a, s) => { await api(`/articles/${a.id}/status`, { method: 'POST', body: { status: s } }); toast('تم التحديث'); render(); });
    return shell(`الأخبار (${num(list.total)})`, h('div', { class: 'grid' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, search), st, ct),
      h('div', { class: 'card tw' }, h('table', null,
        h('thead', null, h('tr', null, ...['العنوان', 'التصنيف', 'الحالة', 'التاريخ', 'قراءات', ''].map((x) => h('th', null, x)))),
        h('tbody', null, ...list.items.map((a) => h('tr', null,
          h('td', null, h('a', { href: `#/articles/${a.id}`, style: 'font-weight:600' }, a.title), a.isBreaking && h('span', { class: 'pill', style: 'background:#d3202f;color:#fff;margin-inline-start:6px' }, 'عاجل'), a.isFeatured && h('span', { class: 'pill', style: 'margin-inline-start:6px' }, '★ رئيسي')),
          h('td', null, a.category.name), h('td', null, h('span', { class: 'pill ' + a.status }, STATUS[a.status])),
          h('td', null, a.status === 'scheduled' ? fmt(a.publishAt) : fmt(a.publishedAt || a.createdAt)), h('td', null, num(a.views)),
          h('td', null, h('div', { class: 'row' },
            can('articles.publish') && a.status === 'review' && h('button', { class: 'btn sm', onclick: () => setStatus(a, 'published') }, 'نشر'),
            can('articles.publish') && a.status === 'published' && h('button', { class: 'btn sec sm', onclick: () => setStatus(a, 'archived') }, 'أرشفة'),
            can('articles.delete') && h('button', { class: 'btn danger sm', onclick: () => del(a) }, 'حذف'))))))),
        !list.items.length && h('p', { style: 'text-align:center;color:var(--muted)' }, 'لا توجد أخبار.')),
      h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'btn sec', disabled: list.page <= 1, onclick: () => go({ page: list.page - 1 }) }, 'السابق'), `صفحة ${list.page} من ${list.pages}`,
        h('button', { class: 'btn sec', disabled: list.page >= list.pages, onclick: () => go({ page: list.page + 1 }) }, 'التالي'))),
      h('a', { class: 'btn', href: '#/articles/new' }, '+ خبر جديد'));
  }

  // ---------- منتقي الوسائط ----------
  function mediaPicker({ kind = 'image', onPick }) {
    const grid = h('div', { class: 'media-grid' });
    const modal = h('div', { class: 'modal', onclick: (e) => e.target === modal && modal.remove() }, h('div', null,
      h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'مكتبة الوسائط'), h('button', { class: 'btn sec sm', onclick: () => modal.remove() }, 'إغلاق')),
      uploader(() => load()), grid));
    const load = guard(async () => {
      const r = await api('/media?kind=' + kind);
      grid.replaceChildren(...r.items.map((m) => h('div', { class: 'mi', onclick: () => { onPick(m); modal.remove(); } }, m.kind === 'image' ? h('img', { src: m.thumb_url || m.url, alt: m.alt, loading: 'lazy' }) : h('video', { src: m.url, muted: true }), h('small', null, m.filename))));
    });
    document.body.append(modal); load();
  }
  function uploader(done) {
    const input = h('input', { type: 'file', multiple: true, accept: 'image/*,video/mp4,video/webm', onchange: guard(async () => {
      if (!input.files.length) return;
      const form = new FormData(); for (const f of input.files) form.append('files', f);
      try { const r = await api('/media', { method: 'POST', form }); toast(`تم رفع ${r.items.length} ملف`); if (r.errors?.length) toast(r.errors[0].error, true); } catch (e) { toast(e.message, true); }
      input.value = ''; done();
    }) });
    return h('div', { class: 'f' }, h('label', null, 'رفع ملفات (صور حتى 50MB، فيديو MP4/WebM)'), input);
  }

  // ---------- المحرر ----------
  async function editor() {
    const id = route.split('/')[2];
    const isNew = id === 'new';
    const [cats, art] = await Promise.all([api('/categories'), isNew ? null : api('/articles/' + id)]);
    const a = art || { title: '', subtitle: '', summary: '', body: '', categoryId: cats.items[0]?.id, status: 'draft', tags: [], isBreaking: false, isFeatured: false };
    const catId = a.category?.id || a.categoryId;
    let coverId = a.coverMediaId || null;
    const title = h('input', { class: 'titlein', value: a.title, placeholder: 'عنوان الخبر', maxlength: 200 });
    const subtitle = h('input', { value: a.subtitle, placeholder: 'عنوان فرعي (اختياري)' });
    const summary = h('textarea', { rows: 3, placeholder: 'ملخص يظهر في القوائم ومحركات البحث', maxlength: 400 }, a.summary);
    const body = h('div', { class: 'body', contenteditable: 'true', dir: 'rtl' });
    body.innerHTML = a.body;
    const cmd = (c, v) => (e) => { e.preventDefault(); body.focus(); document.execCommand(c, false, v); };
    const tbtn = (label, handler, t) => h('button', { type: 'button', title: t || label, onmousedown: handler }, label);
    const toolbar = h('div', { class: 'tb' },
      tbtn('B', cmd('bold'), 'عريض'), tbtn('I', cmd('italic'), 'مائل'), tbtn('U', cmd('underline'), 'تحته خط'),
      tbtn('H2', cmd('formatBlock', 'h2'), 'عنوان'), tbtn('H3', cmd('formatBlock', 'h3'), 'عنوان فرعي'), tbtn('¶', cmd('formatBlock', 'p'), 'فقرة'),
      tbtn('•', cmd('insertUnorderedList'), 'قائمة'), tbtn('1.', cmd('insertOrderedList'), 'قائمة مرقمة'), tbtn('❝', cmd('formatBlock', 'blockquote'), 'اقتباس'),
      tbtn('🔗', (e) => { e.preventDefault(); const u = prompt('الرابط (https://...)'); if (u && /^https?:\/\//.test(u)) { body.focus(); document.execCommand('createLink', false, u); } }, 'رابط'),
      tbtn('🖼', (e) => { e.preventDefault(); const sel = getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null; mediaPicker({ onPick: (m) => { body.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); } document.execCommand('insertHTML', false, `<p><img src="${m.url}" alt="${(m.alt || '').replace(/"/g, '')}"></p>`); } }); }, 'صورة'),
      tbtn('✕', cmd('removeFormat'), 'إزالة التنسيق'));
    body.addEventListener('paste', (e) => { e.preventDefault(); const t = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, t); }); // لصق نص نظيف
    const category = h('select', null, ...cats.items.map((c) => h('option', { value: c.id, selected: c.id === catId }, c.name)));
    const tags = h('input', { value: (a.tags || []).map((t) => t.name).join('، '), placeholder: 'وسوم مفصولة بفاصلة' });
    const cover = h('img', { class: 'cover-prev', src: a.cover?.url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', alt: '' });
    const coverCaption = h('input', { value: a.cover?.caption || a.coverCaption || '', placeholder: 'وصف الصورة' });
    const video = h('input', { value: a.videoUrl || '', placeholder: 'رابط يوتيوب أو ملف mp4' });
    const source = h('input', { value: a.source || '', placeholder: 'المصدر (اختياري)' });
    const seoT = h('input', { value: a.seoTitle || '', placeholder: 'عنوان SEO (اختياري)', maxlength: 120 });
    const seoD = h('textarea', { rows: 2, placeholder: 'وصف SEO', maxlength: 200 }, a.seoDescription || '');
    const status = h('select', null, ...(can('articles.publish') ? Object.entries(STATUS) : [['draft', STATUS.draft], ['review', STATUS.review]]).map(([k, v]) => h('option', { value: k, selected: a.status === k }, v)));
    const publishAt = h('input', { type: 'datetime-local', value: toLocalInput(a.publishAt) });
    const breaking = h('input', { type: 'checkbox', checked: a.isBreaking }); const featured = h('input', { type: 'checkbox', checked: a.isFeatured });
    const push = h('input', { type: 'checkbox' });
    const schedRow = field('وقت النشر المجدول', publishAt);
    const sync = () => (schedRow.style.display = status.value === 'scheduled' ? '' : 'none'); status.onchange = sync; sync();
    const save = guard(async () => {
      const payload = { title: title.value, subtitle: subtitle.value, summary: summary.value, body: body.innerHTML, categoryId: +category.value, coverMediaId: coverId,
        coverCaption: coverCaption.value, videoUrl: video.value, source: source.value, tags: tags.value.split(/[،,]/).map((t) => t.trim()).filter(Boolean), status: status.value,
        publishAt: publishAt.value ? new Date(publishAt.value).toISOString() : null, isBreaking: breaking.checked, isFeatured: featured.checked, seoTitle: seoT.value, seoDescription: seoD.value, sendPush: push.checked };
      const r = await api(isNew ? '/articles' : '/articles/' + id, { method: isNew ? 'POST' : 'PUT', body: payload });
      toast('تم الحفظ'); if (isNew) location.hash = '/articles/' + r.id; else render();
    });
    const side = h('div', { class: 'grid' },
      h('div', { class: 'card' }, field('الحالة', status), schedRow, field('التصنيف', category),
        can('articles.publish') && h('div', null,
          h('label', { class: 'switch' }, breaking, 'خبر عاجل (يظهر في الشريط 36 ساعة)'), h('label', { class: 'switch' }, featured, 'الخبر الرئيسي في الصفحة الأولى'),
          can('notifications.send') && h('label', { class: 'switch' }, push, 'إرسال إشعار فوري عند النشر')),
        h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: save }, 'حفظ'),
          !isNew && a.status === 'published' && h('a', { class: 'btn sec', href: a.url, target: '_blank' }, 'عرض'))),
      h('div', { class: 'card' }, h('label', null, 'الصورة الرئيسية'), cover, h('div', { class: 'row' },
        h('button', { class: 'btn sec sm', type: 'button', onclick: () => mediaPicker({ onPick: (m) => { coverId = m.id; cover.src = m.url; } }) }, 'اختيار'),
        h('button', { class: 'btn sec sm', type: 'button', onclick: () => { coverId = null; cover.removeAttribute('src'); } }, 'إزالة')), field('الوصف', coverCaption)),
      h('div', { class: 'card' }, field('الوسوم', tags), field('فيديو', video), field('المصدر', source)),
      h('div', { class: 'card' }, h('h4', { style: 'margin-top:0' }, 'تحسين محركات البحث'), field('العنوان', seoT), field('الوصف', seoD)));
    return shell(isNew ? 'خبر جديد' : 'تعديل الخبر', h('div', { class: 'editor' },
      h('div', { class: 'card' }, field('العنوان', title), field('العنوان الفرعي', subtitle), field('الملخص', summary), h('label', null, 'نص الخبر'), toolbar, body), side));
  }

  // ---------- التصنيفات ----------
  async function categories() {
    const r = await api('/categories');
    const edit = (c) => {
      const name = h('input', { value: c?.name || '' }), desc = h('input', { value: c?.description || '' }), color = h('input', { type: 'color', value: c?.color || '#c62828' });
      const sort = h('input', { type: 'number', value: c?.sortOrder ?? r.items.length }), active = h('input', { type: 'checkbox', checked: c ? !!c.active : true });
      const m = h('div', { class: 'modal', onclick: (e) => e.target === m && m.remove() }, h('div', { style: 'max-width:480px' }, h('h3', null, c ? 'تعديل تصنيف' : 'تصنيف جديد'),
        field('الاسم', name), field('الوصف', desc), field('اللون', color), field('الترتيب', sort), h('label', { class: 'switch' }, active, 'مفعّل'),
        h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: guard(async () => {
          await api(c ? '/categories/' + c.id : '/categories', { method: c ? 'PUT' : 'POST', body: { name: name.value, description: desc.value, color: color.value, sortOrder: +sort.value, active: active.checked } });
          m.remove(); toast('تم الحفظ'); render(); }) }, 'حفظ'), h('button', { class: 'btn sec', onclick: () => m.remove() }, 'إلغاء'))));
      document.body.append(m);
    };
    return shell('التصنيفات', h('div', { class: 'card tw' }, h('table', null, h('thead', null, h('tr', null, ...['', 'الاسم', 'الرابط', 'الأخبار', 'الحالة', ''].map((x) => h('th', null, x)))),
      h('tbody', null, ...r.items.map((c) => h('tr', null, h('td', null, h('span', { style: `display:inline-block;width:16px;height:16px;border-radius:4px;background:${c.color}` })), h('td', null, c.name), h('td', null, c.slug), h('td', null, c.articlesCount),
        h('td', null, c.active ? 'مفعّل' : 'معطّل'), h('td', null, h('div', { class: 'row' }, h('button', { class: 'btn sec sm', onclick: () => edit(c) }, 'تعديل'),
          h('button', { class: 'btn danger sm', onclick: guard(async () => { if (confirm('حذف التصنيف؟')) { await api('/categories/' + c.id, { method: 'DELETE' }); render(); } }) }, 'حذف')))))))),
      h('button', { class: 'btn', onclick: () => edit(null) }, '+ تصنيف'));
  }

  // ---------- الوسائط ----------
  async function media() {
    const r = await api('/media');
    const grid = h('div', { class: 'media-grid' }, ...r.items.map((m) => h('div', { class: 'mi', title: 'انقر للتفاصيل', onclick: guard(async () => {
      const alt = prompt('النص البديل (للوصولية وSEO)', m.alt); if (alt === null) return;
      await api('/media/' + m.id, { method: 'PUT', body: { alt, caption: m.caption } }); toast('تم'); render(); }) },
      m.kind === 'image' ? h('img', { src: m.thumb_url || m.url, alt: m.alt, loading: 'lazy' }) : h('video', { src: m.url, muted: true, preload: 'metadata' }),
      h('small', null, m.filename), h('div', { class: 'row', style: 'padding:0 6px 6px' }, h('button', { class: 'btn sec sm', onclick: (e) => { e.stopPropagation(); navigator.clipboard?.writeText(location.origin + m.url); toast('نُسخ الرابط'); } }, 'نسخ الرابط'),
        h('button', { class: 'btn danger sm', onclick: guard(async (e) => { e.stopPropagation(); if (confirm('حذف الملف؟')) { await api('/media/' + m.id, { method: 'DELETE' }); render(); } }) }, 'حذف')))));
    return shell(`الوسائط (${num(r.total)})`, h('div', { class: 'grid' }, h('div', { class: 'card' }, uploader(() => render())), grid));
  }

  // ---------- الإعلانات ----------
  async function ads() {
    const r = await api('/ads');
    const edit = (ad) => {
      const name = h('input', { value: ad?.name || '' }), place = h('select', null, ...Object.entries(r.placements).map(([k, v]) => h('option', { value: k, selected: ad?.placement === k }, v)));
      const kind = h('select', null, h('option', { value: 'image', selected: ad?.kind !== 'html' }, 'صورة'), h('option', { value: 'html', selected: ad?.kind === 'html' }, 'HTML بسيط'));
      const img = h('input', { value: ad?.image_url || '', placeholder: '/uploads/... أو https://...' }), link = h('input', { value: ad?.link_url || '', placeholder: 'https://...' });
      const htmlIn = h('textarea', { rows: 3 }, ad?.html || ''), s = h('input', { type: 'datetime-local', value: toLocalInput(ad?.starts_at) }), e = h('input', { type: 'datetime-local', value: toLocalInput(ad?.ends_at) });
      const active = h('input', { type: 'checkbox', checked: ad ? !!ad.active : true });
      const m = h('div', { class: 'modal' }, h('div', { style: 'max-width:520px' }, h('h3', null, ad ? 'تعديل إعلان' : 'إعلان جديد'), field('الاسم', name), field('الموضع', place), field('النوع', kind),
        field('رابط الصورة', img, 'ارفع الصورة من الوسائط وانسخ رابطها'), field('رابط الوجهة', link), field('HTML (للنوع HTML)', htmlIn), field('يبدأ في', s), field('ينتهي في', e), h('label', { class: 'switch' }, active, 'مفعّل'),
        h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: guard(async () => {
          await api(ad ? '/ads/' + ad.id : '/ads', { method: ad ? 'PUT' : 'POST', body: { name: name.value, placement: place.value, kind: kind.value, imageUrl: img.value, linkUrl: link.value, html: htmlIn.value, startsAt: s.value, endsAt: e.value, active: active.checked } });
          m.remove(); render(); }) }, 'حفظ'), h('button', { class: 'btn sec', onclick: () => m.remove() }, 'إلغاء'))));
      document.body.append(m);
    };
    return shell('الإعلانات', h('div', { class: 'card tw' }, h('table', null, h('thead', null, h('tr', null, ...['الاسم', 'الموضع', 'الفترة', 'ظهور', 'نقرات', 'CTR', ''].map((x) => h('th', null, x)))),
      h('tbody', null, ...r.items.map((a) => h('tr', null, h('td', null, a.name, !a.active && h('span', { class: 'pill', style: 'margin-inline-start:6px' }, 'معطّل')), h('td', null, r.placements[a.placement]), h('td', null, `${a.starts_at ? fmt(a.starts_at) : '—'} ← ${a.ends_at ? fmt(a.ends_at) : '—'}`),
        h('td', null, num(a.impressions)), h('td', null, num(a.clicks)), h('td', null, a.impressions ? (a.clicks / a.impressions * 100).toFixed(2) + '%' : '—'),
        h('td', null, h('div', { class: 'row' }, h('button', { class: 'btn sec sm', onclick: () => edit(a) }, 'تعديل'), h('button', { class: 'btn danger sm', onclick: guard(async () => { if (confirm('حذف؟')) { await api('/ads/' + a.id, { method: 'DELETE' }); render(); } }) }, 'حذف')))))))),
      h('button', { class: 'btn', onclick: () => edit(null) }, '+ إعلان'));
  }

  // ---------- الإشعارات ----------
  async function notifications() {
    const r = await api('/notifications');
    const title = h('input', { placeholder: 'عنوان الإشعار', maxlength: 100 }), body = h('textarea', { rows: 2, placeholder: 'نص مختصر', maxlength: 200 });
    const topic = h('select', null, h('option', { value: 'breaking' }, 'الأخبار العاجلة (كل المشتركين)'), h('option', { value: 'news' }, 'أخبار عامة'));
    const art = h('input', { type: 'number', placeholder: 'رقم الخبر (اختياري) ليفتحه التطبيق' });
    const SL = { sent: 'أُرسل', failed: 'فشل', dry_run: 'تجريبي (لم يُرسل)', pending: 'معلّق' };
    return shell('الإشعارات الفورية', h('div', { class: 'grid' },
      !r.configured && h('div', { class: 'card', style: 'border-color:var(--warn)' }, 'خدمة FCM غير مفعّلة: ستُسجَّل الإشعارات فقط (وضع تجريبي). أضف FCM_SERVICE_ACCOUNT في إعدادات الخادم للإرسال الفعلي.'),
      h('div', { class: 'card' }, h('h3', null, `إرسال إشعار (أجهزة مسجّلة: ${num(r.devices)})`), field('العنوان', title), field('النص', body), field('المجموعة', topic), field('الخبر', art),
        h('button', { class: 'btn', onclick: guard(async () => { if (!confirm('إرسال الإشعار الآن؟')) return; const n = await api('/notifications', { method: 'POST', body: { title: title.value, body: body.value, topic: topic.value, articleId: art.value } }); toast(SL[n.status]); render(); }) }, 'إرسال')),
      h('div', { class: 'card tw' }, h('h3', null, 'السجل'), h('table', null, h('tbody', null, ...r.items.map((n) => h('tr', null, h('td', null, n.title), h('td', null, n.topic), h('td', null, h('span', { class: 'pill ' + n.status }, SL[n.status] || n.status)), h('td', null, fmt(n.created_at)), h('td', null, n.detail?.slice(0, 60)))))))));
  }

  // ---------- المستخدمون والأدوار ----------
  async function users() {
    const r = await api('/users');
    const roleLabel = Object.fromEntries(r.roles.map((x) => [x.name, x.label]));
    const edit = (u) => {
      const name = h('input', { value: u?.name || '' }), email = h('input', { type: 'email', value: u?.email || '' }), role = h('select', null, ...r.roles.map((x) => h('option', { value: x.name, selected: u?.role === x.name }, x.label)));
      const pw = h('input', { type: 'password', autocomplete: 'new-password', placeholder: u ? 'اتركه فارغاً بدون تغيير' : '10 أحرف على الأقل' }), bio = h('input', { value: u?.bio || '' }), active = h('input', { type: 'checkbox', checked: u ? !!u.active : true });
      const m = h('div', { class: 'modal' }, h('div', { style: 'max-width:480px' }, h('h3', null, u ? 'تعديل مستخدم' : 'مستخدم جديد'), field('الاسم', name), field('البريد', email), field('الدور', role), field('كلمة المرور', pw), field('نبذة', bio), h('label', { class: 'switch' }, active, 'الحساب نشط'),
        h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: guard(async () => { await api(u ? '/users/' + u.id : '/users', { method: u ? 'PUT' : 'POST', body: { name: name.value, email: email.value, role: role.value, password: pw.value, bio: bio.value, active: active.checked } }); m.remove(); render(); }) }, 'حفظ'), h('button', { class: 'btn sec', onclick: () => m.remove() }, 'إلغاء'))));
      document.body.append(m);
    };
    const editRole = (ro) => {
      const name = h('input', { value: ro?.name || '', disabled: !!ro, placeholder: 'معرّف لاتيني مثل: photographer' }), label = h('input', { value: ro?.label || '' });
      const boxes = Object.entries(me.allPermissions).map(([k, v]) => [k, h('input', { type: 'checkbox', checked: ro?.permissions.includes(k) }), v]);
      const m = h('div', { class: 'modal' }, h('div', { style: 'max-width:620px' }, h('h3', null, ro ? 'صلاحيات الدور' : 'دور جديد'), field('المعرّف', name), field('الاسم', label), h('div', { class: 'perm' }, ...boxes.map(([k, b, v]) => h('label', null, b, v))),
        h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: guard(async () => { await api('/roles/' + name.value, { method: 'PUT', body: { label: label.value, permissions: boxes.filter(([, b]) => b.checked).map(([k]) => k) } }); m.remove(); render(); }) }, 'حفظ'), h('button', { class: 'btn sec', onclick: () => m.remove() }, 'إلغاء'))));
      document.body.append(m);
    };
    return shell('المحررون والصلاحيات', h('div', { class: 'grid' },
      h('div', { class: 'card tw' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'المستخدمون'), h('button', { class: 'btn', onclick: () => edit(null) }, '+ مستخدم')),
        h('table', null, h('thead', null, h('tr', null, ...['الاسم', 'البريد', 'الدور', 'أخبار', 'آخر دخول', ''].map((x) => h('th', null, x)))), h('tbody', null, ...r.items.map((u) => h('tr', null, h('td', null, u.name, !u.active && h('span', { class: 'pill', style: 'margin-inline-start:6px' }, 'موقوف')), h('td', null, u.email), h('td', null, roleLabel[u.role]), h('td', null, u.articles), h('td', null, fmt(u.lastLoginAt)),
          h('td', null, h('div', { class: 'row' }, h('button', { class: 'btn sec sm', onclick: () => edit(u) }, 'تعديل'), u.id !== me.id && h('button', { class: 'btn danger sm', onclick: guard(async () => { if (confirm('حذف المستخدم؟')) { await api('/users/' + u.id, { method: 'DELETE' }); render(); } }) }, 'حذف')))))))),
      h('div', { class: 'card tw' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'الأدوار والصلاحيات'), h('button', { class: 'btn', onclick: () => editRole(null) }, '+ دور')),
        h('table', null, h('tbody', null, ...r.roles.map((ro) => h('tr', null, h('td', null, h('b', null, ro.label), ' ', h('small', null, ro.name)), h('td', null, ro.permissions.length === Object.keys(me.allPermissions).length ? 'كل الصلاحيات' : ro.permissions.map((p) => me.allPermissions[p]).join('، ')),
          h('td', null, ro.name !== 'admin' && h('div', { class: 'row' }, h('button', { class: 'btn sec sm', onclick: () => editRole(ro) }, 'تعديل'), !ro.builtin && h('button', { class: 'btn danger sm', onclick: guard(async () => { await api('/roles/' + ro.name, { method: 'DELETE' }); render(); }) }, 'حذف'))))))))));
  }

  // ---------- الإعدادات ----------
  async function settings() {
    const [s, b] = await Promise.all([api('/settings'), api('/backups')]);
    const L = { site_name: 'اسم الموقع', tagline: 'الشعار النصي', description: 'وصف الموقع', timezone: 'المنطقة الزمنية (IANA)', contact_email: 'بريد التواصل', twitter: 'رابط X', facebook: 'رابط فيسبوك', youtube: 'رابط يوتيوب', instagram: 'رابط إنستغرام', telegram: 'رابط تيليغرام', app_android_url: 'رابط تطبيق أندرويد' };
    const inputs = Object.fromEntries(Object.keys(L).map((k) => [k, h('input', { value: s[k] || '' })]));
    const tick = h('input', { type: 'checkbox', checked: s.ticker_enabled === '1' }), adsOn = h('input', { type: 'checkbox', checked: s.ads_enabled === '1' });
    return shell('الإعدادات', h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, ...Object.entries(L).map(([k, l]) => field(l, inputs[k])), h('label', { class: 'switch' }, tick, 'شريط الأخبار العاجلة'), h('label', { class: 'switch' }, adsOn, 'عرض الإعلانات'),
        h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: guard(async () => { await api('/settings', { method: 'PUT', body: { ...Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])), ticker_enabled: tick.checked ? '1' : '0', ads_enabled: adsOn.checked ? '1' : '0' } }); toast('تم الحفظ'); }) }, 'حفظ'))),
      h('div', { class: 'card' }, h('h3', null, 'النسخ الاحتياطي'), h('p', null, 'تُؤخذ نسخة يومية تلقائياً، ويمكنك أخذ نسخة الآن وتنزيلها. احفظ مجلد uploads أيضاً.'),
        h('button', { class: 'btn', onclick: guard(async () => { await api('/backups', { method: 'POST' }); toast('تم إنشاء نسخة'); render(); }) }, 'نسخة احتياطية الآن'),
        h('table', null, h('tbody', null, ...b.items.map((f) => h('tr', null, h('td', null, f.name), h('td', null, (f.size / 1048576).toFixed(2) + ' MB'), h('td', null, h('a', { class: 'btn sec sm', href: '/api/admin/backups/' + f.name }, 'تنزيل')))))))));
  }

  // ---------- التوجيه ----------
  async function reels() {
    const r = await api('/reels');
    const title = h('input', { type: 'text', placeholder: 'عنوان الريل', maxlength: 120 });
    const file = h('input', { type: 'file', accept: 'video/mp4,video/webm' });
    const add = h('button', { class: 'btn', type: 'button', onclick: guard(async () => {
      if (!file.files[0]) { toast('اختر ملف فيديو', true); return; }
      const form = new FormData(); form.append('title', title.value); form.append('file', file.files[0]);
      await api('/reels', { method: 'POST', form }); toast('تم رفع الريل'); render(); }) }, 'رفع الريل');
    const list = h('div', { class: 'media-grid' }, ...r.items.map((m) => h('div', { class: 'mi' },
      h('video', { src: m.url, controls: true, preload: 'metadata' }), h('small', null, m.title + (m.active ? '' : ' (مخفي)')),
      h('div', { class: 'row', style: 'padding:0 6px 6px' },
        h('button', { class: 'btn sec sm', onclick: guard(async () => { await api('/reels/' + m.id, { method: 'PUT', body: { active: !m.active } }); render(); }) }, m.active ? 'إخفاء' : 'إظهار'),
        h('button', { class: 'btn danger sm', onclick: guard(async () => { if (confirm('حذف الريل؟')) { await api('/reels/' + m.id, { method: 'DELETE' }); render(); } }) }, 'حذف')))));
    return shell(`الريلز (${num(r.total)})`, h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('div', { class: 'f' }, h('label', null, 'العنوان'), title), h('div', { class: 'f' }, h('label', null, 'فيديو قصير (MP4 أو WebM، حتى 50MB)'), file), add), list));
  }

  async function render() {
    if (!me) { $app.replaceChildren(loginView()); return; }
    const path = route.split('?')[0];
    try {
      let view;
      if (path === '/') view = can('stats.view') ? await dashboard() : await articlesList();
      else if (path === '/articles') view = await articlesList();
      else if (/^\/articles\/(new|\d+)$/.test(path)) view = await editor();
      else if (path === '/categories') view = await categories();
      else if (path === '/media') view = await media();
      else if (path === '/reels') view = await reels();
      else if (path === '/ads') view = await ads();
      else if (path === '/notifications') view = await notifications();
      else if (path === '/users') view = await users();
      else if (path === '/settings') view = await settings();
      else view = h('p', null, 'الصفحة غير موجودة');
      $app.replaceChildren(view);
    } catch (e) { if (me) { toast(e.message, true); $app.replaceChildren(shell('خطأ', h('div', { class: 'card' }, e.message))); } }
  }
  async function boot() { try { me = await api('/me'); } catch { me = null; } render(); }
  boot();
})();
