import { html, raw, esc, toStr } from '../lib/html.js';
import { allSettings } from '../db.js';
import { config } from '../config.js';
import { listCategories } from '../services/categories.js';
import { breakingNews } from '../services/articles.js';
import { fmtToday, ago } from '../lib/time.js';

const ASSET_V = '3';
const abs = (u) => (!u ? '' : /^https?:/.test(u) ? u : config.siteUrl + (u.includes('%') ? u : encodeURI(u)));
export { abs };

const icon = {
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};
export const logoSvg = raw(`<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#0b2a5b"/><path d="M6 25h9l4-11 7 22 5-15 3 4h8" fill="none" stroke="#d4a62a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

/** يعرض صفحة HTML كاملة */
export function layout({ title, description, path = '/', canonical, image, type = 'website', jsonld = [], body, activeCat = '', noindex = false, extraHead = '', publishedAt, modifiedAt, section }) {
  const s = allSettings();
  const cats = listCategories();
  const breaking = s.ticker_enabled === '1' ? breakingNews(6) : [];
  const fullTitle = title ? `${title} | ${s.site_name}` : `${s.site_name} — ${s.tagline}`;
  const desc = description || s.description;
  const url = abs(canonical || path);
  const img = abs(image || '/img/og-default.jpg');
  const sameAs = ['twitter', 'facebook', 'youtube', 'instagram', 'telegram'].map((k) => s[k]).filter(Boolean);
  const org = {
    '@context': 'https://schema.org', '@type': 'NewsMediaOrganization', name: s.site_name, url: config.siteUrl,
    logo: { '@type': 'ImageObject', url: abs('/img/logo-512.png'), width: 512, height: 512 }, ...(sameAs.length ? { sameAs } : {}),
  };
  const site = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: s.site_name, url: config.siteUrl, inLanguage: 'ar',
    potentialAction: { '@type': 'SearchAction', target: `${config.siteUrl}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  };
  const ld = [org, ...(path === '/' ? [site] : []), ...jsonld].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('');

  return html`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
${noindex ? raw('<meta name="robots" content="noindex,follow">') : raw('<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">')}
<meta name="theme-color" content="#0b2a5b">
<meta property="og:site_name" content="${s.site_name}">
<meta property="og:locale" content="ar_AR">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${title || s.site_name}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
${publishedAt ? raw(`<meta property="article:published_time" content="${esc(publishedAt)}">`) : ''}
${modifiedAt ? raw(`<meta property="article:modified_time" content="${esc(modifiedAt)}">`) : ''}
${section ? raw(`<meta property="article:section" content="${esc(section)}">`) : ''}
<link rel="alternate" type="application/rss+xml" title="${s.site_name}" href="/rss.xml">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/logo-512.png">
<link rel="preload" href="/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/fonts.css?v=${ASSET_V}">
<link rel="stylesheet" href="/css/site.css?v=${ASSET_V}">
<script src="/js/theme.js"></script>
${raw(extraHead)}
${raw(ld)}
</head>
<body>
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
<div class="progress" id="progress" aria-hidden="true"></div>
<div class="topbar"><div class="wrap">
  <span>${fmtToday()}</span>
  <div class="links">
    ${s.app_android_url ? html`<a href="${s.app_android_url}" class="hide-sm">تطبيق أندرويد</a>` : ''}
    <a href="/rss.xml" class="hide-sm">RSS</a>
    <a href="/archive">الأرشيف</a>
    <button class="icon-btn" id="theme" type="button" aria-label="تبديل الوضع الليلي">${raw(icon.moon)}</button>
  </div>
</div></div>
<header class="masthead"><div class="wrap">
  <a class="banner" href="/" aria-label="${s.site_name} - الرئيسية"><img src="/img/header.webp" alt="${s.site_name}" width="690" height="290" fetchpriority="high"></a>
  <form class="search" action="/search" role="search">
    <label class="sr" for="q">ابحث في الأخبار</label>
    <input id="q" name="q" type="search" placeholder="ابحث في الأخبار..." autocomplete="off" maxlength="100">
    <button type="submit" aria-label="بحث">${raw(icon.search)}</button>
  </form>
</div></header>
<nav class="nav" aria-label="التصنيفات"><div class="wrap"><ul>
  <li><a href="/" ${path === '/' ? raw('aria-current="page"') : ''}>الرئيسية</a></li>
  ${cats.map((c) => html`<li><a href="${c.slug === 'nabd' ? '/nabd' : '/category/' + encodeURIComponent(c.slug)}" style="--c:${c.color}" ${activeCat === c.slug ? raw('aria-current="page"') : ''}>${c.name}</a></li>`)}
  <li class="sep"></li>
  <li><a href="/reels" ${activeCat === 'reels' ? raw('aria-current="page"') : ''}>ريلز</a></li>
  <li><a href="/videos" ${path === '/videos' ? raw('aria-current="page"') : ''}>فيديو</a></li>
</ul></div></nav>
${breaking.length ? html`<div class="ticker" role="region" aria-label="الأخبار العاجلة"><div class="wrap">
  <div class="label">عاجل</div>
  <div class="track"><div class="items">
    ${breaking.map((a) => html`<a href="${a.url}"><time datetime="${a.publishedAt}">${ago(a.publishedAt)}</time>${a.title}</a>`)}
    ${breaking.map((a) => html`<a href="${a.url}" aria-hidden="true" tabindex="-1"><time>${ago(a.publishedAt)}</time>${a.title}</a>`)}
  </div></div>
</div></div>` : ''}
<main id="main"><div class="wrap">${body}</div></main>
<footer><div class="wrap">
  <div class="cols">
    <div><a class="logo" href="/">${logoSvg}<span>${s.site_name}</span></a><p>${s.description}</p></div>
    <div><h3>الأقسام</h3><ul>${cats.slice(0, 6).map((c) => html`<li><a href="/category/${encodeURIComponent(c.slug)}">${c.name}</a></li>`)}</ul></div>
    <div><h3>المزيد</h3><ul><li><a href="/reels">ريلز</a></li><li><a href="/videos">الفيديو</a></li><li><a href="/archive">الأرشيف</a></li><li><a href="/rss.xml">الخلاصة RSS</a></li><li><a href="/sitemap.xml">خريطة الموقع</a></li></ul></div>
    <div><h3>عن الموقع</h3><ul><li><a href="/page/about">من نحن</a></li><li><a href="/page/contact">اتصل بنا</a></li><li><a href="/page/privacy">سياسة الخصوصية</a></li><li><a href="/page/terms">شروط الاستخدام</a></li></ul>
    <div class="tags" style="margin-top:12px">${['twitter', 'facebook', 'youtube', 'instagram', 'telegram'].filter((k) => s[k]).map((k) => html`<a rel="me noopener" href="${s[k]}">${{ twitter: 'X', facebook: 'فيسبوك', youtube: 'يوتيوب', instagram: 'إنستغرام', telegram: 'تيليغرام' }[k]}</a>`)}</div></div>
  </div>
  <div class="copy"><span>© ${new Date().getFullYear()} ${s.site_name}. جميع الحقوق محفوظة.</span><span>المحتوى الحالي تجريبي لأغراض العرض.</span></div>
</div></footer>
<button class="to-top" id="top" type="button" aria-label="إلى الأعلى">↑</button>
<script src="/js/site.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}
export const render = toStr;
