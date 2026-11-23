import { html, raw } from '../lib/html.js';
import { allSettings } from '../db.js';
import { config } from '../config.js';
import { layout, abs } from './layout.js';
import { card, row, chip, adSlot, mostReadBox, tagsBox, pager, shareButtons, videoBox, nabdBox, reelsBox } from './components.js';
import { fmtDateTime, monthName, num } from '../lib/time.js';
import { videoEmbed } from '../lib/sanitize.js';
import { stripHtml } from '../lib/text.js';

const sideApp = () => {
  const s = allSettings();
  return html`<section class="box app-cta"><h2>حمّل تطبيق ${s.site_name}</h2><p>تنبيهات فورية للأخبار العاجلة، والمفضلة، وقراءة أسرع.</p>
    ${s.app_android_url ? html`<a class="btn" href="${s.app_android_url}">تحميل لأندرويد</a>` : html`<span class="btn" aria-disabled="true">قريباً على أندرويد</span>`}</section>`;
};
const sidebar = ({ mostRead, tags, nabd = [], reels = [] }) => html`<aside class="side" aria-label="الشريط الجانبي">
  ${adSlot('sidebar')}${nabdBox(nabd)}${reelsBox(reels)}${mostReadBox(mostRead)}${tagsBox(tags)}${sideApp()}</aside>`;

export function homePage({ breaking, featured, latest, mostRead, sections, tags }) {
  const [side1, side2] = latest;
  const body = html`
  ${adSlot('header', 'ad-header')}
  ${featured ? html`<section class="hero" aria-label="الخبر الرئيسي">
    <a class="hero-main" href="${featured.url}">
      ${featured.cover ? html`<img src="${featured.cover.url}" alt="${featured.cover.alt}" fetchpriority="high" ${featured.cover.width ? raw(`width="${featured.cover.width}" height="${featured.cover.height}"`) : ''}>` : ''}
      <div class="txt">
        <span class="chip solid" style="--c:${featured.category.color}">${featured.category.name}</span>
        <h1>${featured.title}</h1><p>${featured.summary}</p>
        <div class="meta"><time datetime="${featured.publishedAt}">${fmtDateTime(featured.publishedAt)}</time><span class="dot">${featured.readingMinutes} د قراءة</span></div>
      </div>
    </a>
    <div class="hero-side">${[side1, side2].filter(Boolean).map(card)}</div>
  </section>` : ''}
  <div class="layout">
    <div>
      <section class="block"><h2 class="section-title">آخر الأخبار</h2>
        <div class="stream">${latest.slice(2).map(row)}</div>
        <p style="text-align:center;margin-top:18px"><a class="btn ghost" href="/latest">كل الأخبار</a></p>
      </section>
      ${sections.map((s) => html`<section class="block" style="--c:${s.category.color}"><h2 class="section-title">${s.category.name}<a class="more" href="/category/${encodeURIComponent(s.category.slug)}">المزيد ‹</a></h2>
        <div class="grid">${s.items.slice(0, 4).map(card)}</div></section>`)}
    </div>
    ${sidebar({ mostRead, tags })}
  </div>`;
  const s = allSettings();
  return layout({ title: '', description: s.description, path: '/', body });
}

export function articlePage(a, { related, mostRead, tags }) {
  const s = allSettings();
  const url = abs(a.url);
  const desc = a.seoDescription || a.summary;
  const parts = a.body.split('</p>');
  const mid = parts.length > 5 ? Math.floor(parts.length / 2) : -1;
  const bodyHtml = mid > 0 ? parts.slice(0, mid).join('</p>') + '</p>' + `\u0000AD\u0000` + parts.slice(mid).join('</p>') : a.body;
  const [b1, b2] = bodyHtml.includes('\u0000AD\u0000') ? bodyHtml.split('\u0000AD\u0000') : [bodyHtml, null];
  const ld = [{
    '@context': 'https://schema.org', '@type': 'NewsArticle', mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: a.title.slice(0, 110), description: desc, inLanguage: 'ar',
    image: a.cover ? [abs(a.cover.url)] : undefined, datePublished: a.publishedAt, dateModified: a.updatedAt || a.publishedAt,
    author: [{ '@type': 'Person', name: a.author || s.site_name }], articleSection: a.category.name,
    keywords: a.tags.map((t) => t.name).join('، ') || undefined, wordCount: stripHtml(a.body).split(/\s+/).length,
    publisher: { '@type': 'NewsMediaOrganization', name: s.site_name, logo: { '@type': 'ImageObject', url: abs('/img/logo-512.png') } },
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: config.siteUrl + '/' },
      { '@type': 'ListItem', position: 2, name: a.category.name, item: `${config.siteUrl}/category/${encodeURIComponent(a.category.slug)}` },
      { '@type': 'ListItem', position: 3, name: a.title, item: url }] },
  ...(videoEmbed(a.videoUrl) ? [{ '@context': 'https://schema.org', '@type': 'VideoObject', name: a.title, description: desc, uploadDate: a.publishedAt, thumbnailUrl: a.cover ? abs(a.cover.url) : undefined, contentUrl: a.videoUrl }] : [])];

  const body = html`
  ${adSlot('header', 'ad-header')}
  <div class="layout">
    <article class="article" data-article-id="${a.id}">
      <div class="article-head">
        <ol class="crumbs"><li><a href="/">الرئيسية</a></li><li><a href="/category/${encodeURIComponent(a.category.slug)}">${a.category.name}</a></li></ol>
        ${chip(a.category, true)}
        <h1>${a.isBreaking ? html`<span class="badge-break">عاجل</span>` : ''}${a.title}</h1>
        ${a.subtitle ? html`<p class="sub">${a.subtitle}</p>` : ''}
        <div class="byline">
          ${a.author ? html`<span>بقلم <strong>${a.author}</strong></span>` : ''}
          <time datetime="${a.publishedAt}">${fmtDateTime(a.publishedAt)}</time>
          <span>${a.readingMinutes} د قراءة</span><span>${num(a.views)} قراءة</span>
          ${shareButtons(a, url)}
        </div>
      </div>
      ${a.cover ? html`<figure class="cover"><img src="${a.cover.url}" alt="${a.cover.alt}" fetchpriority="high" ${a.cover.width ? raw(`width="${a.cover.width}" height="${a.cover.height}"`) : ''}>${a.cover.caption ? html`<figcaption>${a.cover.caption}</figcaption>` : ''}</figure>` : ''}
      ${videoBox(a.videoUrl)}
      <div class="prose">${raw(b1)}${b2 !== null ? html`${adSlot('in_article', 'in-article-ad')}${raw(b2)}` : ''}</div>
      ${a.source ? html`<p class="source">المصدر: ${a.source}</p>` : ''}
      ${a.tags.length ? html`<div class="tags" style="margin-top:22px">${a.tags.map((t) => html`<a href="/tag/${encodeURIComponent(t.slug)}">${t.name}</a>`)}</div>` : ''}
      ${related.length ? html`<section class="block" style="margin-top:36px"><h2 class="section-title">اقرأ أيضاً</h2><div class="grid">${related.map(card)}</div></section>` : ''}
    </article>
    ${sidebar({ mostRead, tags })}
  </div>`;
  return layout({
    title: a.seoTitle || a.title, description: desc, path: a.url, image: a.cover?.url, type: 'article', jsonld: ld, body,
    activeCat: a.category.slug, publishedAt: a.publishedAt, modifiedAt: a.updatedAt, section: a.category.name,
  });
}

export function listPage({ title, heading, description, color, path, result, hrefFor, activeCat, mostRead, tags, noindex, intro }) {
  const body = html`${adSlot('header', 'ad-header')}
  <div class="layout"><div>
    <header class="page-head" style="--c:${color || 'var(--accent)'}"><h1>${heading}</h1>${description ? html`<p>${description}</p>` : ''}${intro || ''}</header>
    ${result.items.length ? html`<div class="stream">${result.items.map(row)}</div>${pager(result.page, result.pages, hrefFor)}`
      : html`<div class="empty"><h2>لا توجد نتائج</h2><p>جرّب كلمات مختلفة أو تصفّح الأقسام.</p></div>`}
  </div>${sidebar({ mostRead, tags })}</div>`;
  return layout({ title: result.page > 1 ? `${title} - صفحة ${result.page}` : title, description, path, activeCat, body, noindex, canonical: path + (result.page > 1 ? `?page=${result.page}` : '') });
}

export function archivePage(months) {
  const years = [...new Set(months.map((m) => m.year))];
  const body = html`<header class="page-head"><h1>الأرشيف</h1><p>تصفّح الأخبار حسب الشهر.</p></header>
  ${years.map((y) => html`<h2 class="year">${y}</h2><div class="months">${months.filter((m) => m.year === y).map((m) => html`<a href="/archive/${m.year}/${m.month}">${monthName(m.month)}<span>${num(m.count)} خبر</span></a>`)}</div>`)}
  ${months.length ? '' : html`<div class="empty">لا يوجد أرشيف بعد.</div>`}`;
  return layout({ title: 'الأرشيف', description: 'أرشيف الأخبار مرتّباً حسب الشهر والسنة.', path: '/archive', body });
}

export function videosPage(result) {
  const thumb = (a) => a.cover?.thumb || videoEmbed(a.videoUrl)?.thumb || '';
  const body = html`<header class="page-head"><h1>الفيديو</h1><p>أحدث التقارير المصوّرة والمقاطع الإخبارية.</p></header>
  ${result.items.length ? html`<div class="videos">${result.items.map((a) => html`<article class="card"><a class="thumb" href="${a.url}"><img src="${thumb(a)}" alt="${a.title}" loading="lazy"><span class="badge-play">فيديو</span></a>
    <div class="body">${chip(a.category)}<h3><a href="${a.url}">${a.title}</a></h3></div></article>`)}</div>${pager(result.page, result.pages, (n) => `/videos?page=${n}`)}`
    : html`<div class="empty">لا توجد مقاطع فيديو بعد.</div>`}`;
  return layout({ title: 'الفيديو', description: 'أحدث الفيديوهات والتقارير المصوّرة.', path: '/videos', body });
}

export function photosPage(result) {
  const body = html`<header class="page-head"><h1>ألبوم الصور</h1><p>لقطات من أبرز الأحداث.</p></header>
  <div class="videos">${result.items.filter((a) => a.cover).map((a) => html`<article class="card"><a class="thumb" href="${a.url}"><img src="${a.cover.thumb}" alt="${a.cover.alt}" loading="lazy"></a>
    <div class="body"><h3><a href="${a.url}">${a.cover.caption || a.title}</a></h3></div></article>`)}</div>
  ${pager(result.page, result.pages, (n) => `/photos?page=${n}`)}`;
  return layout({ title: 'ألبوم الصور', description: 'معرض صور من أبرز الأحداث.', path: '/photos', body });
}

const STATIC = (s) => ({
  about: { title: 'من نحن', text: [`${s.site_name} موقع إخباري عربي مستقل يقدّم تغطية سريعة وموثوقة للأحداث المحلية والعالمية، بأسلوب واضح ومحتوى متنوّع في السياسة والاقتصاد والرياضة والتقنية والثقافة.`, 'نلتزم بالدقة والتحقق من المعلومات قبل النشر، ونصحّح أي خطأ فور اكتشافه.'] },
  contact: { title: 'اتصل بنا', text: [`للتواصل مع التحرير أو الإعلان: ${s.contact_email}`, 'نرحّب بملاحظاتكم واقتراحاتكم وأخباركم.'] },
  privacy: { title: 'سياسة الخصوصية', text: ['لا نجمع بيانات شخصية من القرّاء لأغراض تتبّع فردية. تُحسب الزيارات إحصائياً بدون تخزين هوية الزائر.', 'يستخدم الموقع ملفات تعريف الارتباط الضرورية لتشغيل لوحة الإدارة فقط. قد يعرض الموقع إعلانات من أطراف ثالثة وفق سياساتهم.'] },
  terms: { title: 'شروط الاستخدام', text: ['المحتوى المنشور للاستخدام الشخصي. يُسمح بالاقتباس المحدود مع ذكر المصدر ورابط الخبر الأصلي.', 'لا يتحمّل الموقع مسؤولية محتوى المواقع الخارجية المرتبطة.'] },
});
export function staticPage(slug) {
  const p = STATIC(allSettings())[slug];
  if (!p) return null;
  return layout({ title: p.title, description: p.text[0], path: `/page/${slug}`, body: html`<div class="prose" style="margin:auto"><header class="page-head"><h1>${p.title}</h1></header>${p.text.map((t) => html`<p>${t}</p>`)}</div>` });
}

export function notFoundPage() {
  return layout({ title: 'الصفحة غير موجودة', path: '/404', noindex: true, body: html`<div class="empty"><h1 style="font-size:64px;color:var(--accent)">404</h1><h2>الصفحة التي تبحث عنها غير موجودة</h2><p><a class="btn" href="/">العودة للرئيسية</a></p></div>` });
}
export const errorPage = () => layout({ title: 'خطأ', path: '/error', noindex: true, body: html`<div class="empty"><h2>حدث خطأ غير متوقع</h2><p><a class="btn" href="/">العودة للرئيسية</a></p></div>` });

export function nabdPage(result) {
  const body = html`${adSlot('header', 'ad-header')}
  <header class="page-head" style="--c:#c9a227"><h1>نبض الحياة</h1><p>مقالات المدير العام ورئيس التحرير.</p></header>
  ${result.items.length ? html`<div class="opinion-list">${result.items.map((a) => html`<article class="opinion">
    <div class="who"><span class="avatar" aria-hidden="true">${(a.author || '؟').trim().slice(0, 1)}</span><div><b>${a.author || ''}</b><small>${a.authorRole || ''}</small></div></div>
    <h2><a href="${a.url}">${a.title}</a></h2><p>${a.summary}</p>
    <div class="meta"><time datetime="${a.publishedAt}">${fmtDateTime(a.publishedAt)}</time><span class="dot">${a.readingMinutes} د قراءة</span></div></article>`)}</div>${pager(result.page, result.pages, (n) => `/nabd?page=${n}`)}`
    : html`<div class="empty"><h2>لا توجد مقالات بعد</h2><p>ستظهر هنا مقالات المدير العام ورئيس التحرير.</p></div>`}`;
  return layout({ title: result.page > 1 ? `نبض الحياة - صفحة ${result.page}` : 'نبض الحياة', description: 'مقالات المدير العام ورئيس التحرير.', path: '/nabd', activeCat: 'nabd', body, canonical: '/nabd' + (result.page > 1 ? `?page=${result.page}` : '') });
}

export function reelsPage(result) {
  const body = html`<header class="page-head" style="--c:#d4a62a"><h1>ريلز</h1><p>مقاطع فيديو قصيرة، شاهدها أو حمّلها.</p></header>
  ${result.items.length ? html`<div class="reels">${result.items.map((r) => html`<article class="reel" id="r${r.id}">
    <video src="${r.url}" controls playsinline preload="metadata"></video>
    <div class="b"><h3>${r.title}</h3><a class="btn sm" href="${r.url}" download>تحميل</a></div></article>`)}</div>${pager(result.page, result.pages, (n) => `/reels?page=${n}`)}`
    : html`<div class="empty"><h2>لا توجد ريلز بعد</h2><p>ستظهر هنا المقاطع القصيرة فور رفعها من لوحة الإدارة.</p></div>`}`;
  return layout({ title: 'ريلز', description: 'مقاطع فيديو قصيرة من جريدة الحياة.', path: '/reels', activeCat: 'reels', body, canonical: '/reels' + (result.page > 1 ? `?page=${result.page}` : '') });
}
