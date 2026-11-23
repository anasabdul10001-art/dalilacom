import { html, raw } from '../lib/html.js';
import { ago, fmtDateTime, num } from '../lib/time.js';
import { videoEmbed } from '../lib/sanitize.js';

const img = (a, { thumb = true, eager = false } = {}) => a.cover
  ? html`<img src="${thumb ? a.cover.thumb : a.cover.url}" alt="${a.cover.alt}" ${a.cover.width ? raw(`width="${a.cover.width}" height="${a.cover.height}"`) : ''} ${eager ? raw('fetchpriority="high"') : raw('loading="lazy" decoding="async"')}>`
  : '';
const play = (a) => (a.videoUrl ? html`<span class="badge-play">فيديو</span>` : '');

export const chip = (c, solid = false) => html`<a class="chip${solid ? ' solid' : ''}" style="--c:${c.color}" href="/category/${encodeURIComponent(c.slug)}">${c.name}</a>`;

export const card = (a) => html`<article class="card">
  <a class="thumb" href="${a.url}" tabindex="-1" aria-hidden="true">${img(a)}${play(a)}</a>
  <div class="body">${chip(a.category)}<h3><a href="${a.url}">${a.isBreaking ? html`<span class="badge-break">عاجل</span>` : ''}${a.title}</a></h3>
  <p>${a.summary}</p><div class="meta"><time datetime="${a.publishedAt}">${ago(a.publishedAt)}</time></div></div>
</article>`;

export const row = (a) => html`<article class="row">
  <a class="thumb" href="${a.url}" tabindex="-1" aria-hidden="true">${img(a)}${play(a)}</a>
  <div class="body"><span class="hide-sm chip-wrap">${chip(a.category)}</span>
    <h3><a href="${a.url}">${a.isBreaking ? html`<span class="badge-break">عاجل</span>` : ''}${a.title}</a></h3>
    <p>${a.summary}</p>
    <div class="meta"><time datetime="${a.publishedAt}" title="${fmtDateTime(a.publishedAt)}">${ago(a.publishedAt)}</time>${a.readingMinutes ? html`<span class="dot">${a.readingMinutes} د قراءة</span>` : ''}</div>
  </div>
</article>`;

export const adSlot = (placement, cls = '') => html`<div class="ad ${cls}" data-ad="${placement}" aria-label="إعلان"></div>`;

export const mostReadBox = (items) => items.length ? html`<section class="box"><h2>الأكثر قراءة</h2>
  <ol class="rank">${items.map((a) => html`<li><a href="${a.url}">${a.title}<span class="meta" style="display:block">${num(a.views)} قراءة</span></a></li>`)}</ol></section>` : '';

export const tagsBox = (tags) => tags.length ? html`<section class="box"><h2>مواضيع شائعة</h2>
  <div class="tags">${tags.map((t) => html`<a href="/tag/${encodeURIComponent(t.slug)}">${t.name}</a>`)}</div></section>` : '';

export function pager(page, pages, hrefFor) {
  if (pages <= 1) return '';
  const nums = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2].filter((n) => n >= 1 && n <= pages));
  const list = [...nums].sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of list) {
    if (n - prev > 1) out.push(html`<span>…</span>`);
    out.push(n === page ? html`<span class="cur" aria-current="page">${n}</span>` : html`<a href="${hrefFor(n)}">${n}</a>`);
    prev = n;
  }
  return html`<nav class="pager" aria-label="التنقل بين الصفحات">${page > 1 ? html`<a href="${hrefFor(page - 1)}" rel="prev">السابق</a>` : ''}${out}${page < pages ? html`<a href="${hrefFor(page + 1)}" rel="next">التالي</a>` : ''}</nav>`;
}

const SHARE_ICONS = {
  whatsapp: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.2 4.7H5.4z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24"><path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.5H7.6v3.2h2.8V22z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24"><path d="M21.9 4.6 2.8 11.9c-1.3.5-1.3 1.3-.2 1.6l4.9 1.5 1.9 5.8c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.7-.8l3.2-15.2c.3-1.3-.5-1.9-1.4-1.5zM8.5 14.1l10.8-6.8c.5-.3 1-.1.6.2l-8.9 8-.3 3.8z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3-3a3 3 0 1 1 4.2 4.2l-1.5 1.5-1.4-1.4 1.5-1.5a1 1 0 0 0-1.4-1.4l-3 3a1 1 0 0 1-1.4 0zm2.8-2.8a1 1 0 0 1 0 1.4l-3 3a1 1 0 0 0 1.4 1.4l1.5-1.5 1.4 1.4-1.5 1.5a3 3 0 1 1-4.2-4.2l3-3a1 1 0 0 1 1.4 0z"/></svg>',
};
export function shareButtons(a, absUrl) {
  const u = encodeURIComponent(absUrl), t = encodeURIComponent(a.title);
  const link = (k, href, label) => html`<a href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${label}" title="${label}">${raw(SHARE_ICONS[k])}</a>`;
  return html`<div class="share" data-url="${absUrl}" data-title="${a.title}">
    ${link('whatsapp', `https://wa.me/?text=${t}%20${u}`, 'مشاركة عبر واتساب')}
    ${link('telegram', `https://t.me/share/url?url=${u}&text=${t}`, 'مشاركة عبر تيليغرام')}
    ${link('x', `https://twitter.com/intent/tweet?url=${u}&text=${t}`, 'مشاركة على X')}
    ${link('facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`, 'مشاركة على فيسبوك')}
    <button type="button" data-copy aria-label="نسخ الرابط" title="نسخ الرابط">${raw(SHARE_ICONS.link)}</button>
  </div>`;
}

export function videoBox(url) {
  const v = videoEmbed(url);
  if (!v) return '';
  return v.type === 'embed'
    ? html`<div class="video-box"><iframe src="${v.src}" title="مشغّل الفيديو" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    : html`<div class="video-box"><video src="${v.src}" controls preload="metadata"></video></div>`;
}

export const nabdBox = (items) => items.length ? html`<section class="box nabd"><h2><a href="/nabd">نبض الحياة</a></h2>
  <ul class="side-list">${items.map((a) => html`<li><a href="${a.url}"><span class="by">${a.author || ''}</span>${a.title}</a></li>`)}</ul>
  <a class="more" href="/nabd">كل المقالات ‹</a></section>` : '';

export const reelsBox = (items) => html`<section class="box reels-box"><h2><a href="/reels">ريلز</a></h2>
  ${items.length ? html`<ul class="side-list">${items.map((r) => html`<li><a href="/reels#r${r.id}"><span class="by">▶ مقطع</span>${r.title}</a></li>`)}</ul>` : html`<p class="meta">قريباً: مقاطع قصيرة من قلب الحدث.</p>`}
  <a class="more" href="/reels">كل الريلز ‹</a></section>`;
