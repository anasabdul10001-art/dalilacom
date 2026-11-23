// معالجة النصوص العربية: توحيد، تهيئة للبحث، روابط، وقت القراءة

const DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g; // التشكيل والتطويل

/** توحيد الحروف للبحث: ألف/ياء/تاء مربوطة/أرقام هندية */
export function normalizeAr(s = '') {
  return String(s)
    .replace(DIACRITICS, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase();
}

export function stripHtml(html = '') {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(s = '', max = 70) {
  let t = String(s)
    .replace(DIACRITICS, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  if (t.length > max) {
    t = t.slice(0, max);
    const i = t.lastIndexOf('-');
    if (i > 20) t = t.slice(0, i);
  }
  return t.replace(/^-|-$/g, '') || 'item';
}

/** وقت القراءة بالدقائق (~180 كلمة/دقيقة للعربية) */
export function readingMinutes(html = '') {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

export function truncate(s = '', n = 160) {
  s = String(s).trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const i = cut.lastIndexOf(' ');
  return (i > n * 0.6 ? cut.slice(0, i) : cut).replace(/[\s،,.؛:-]+$/, '') + '…';
}

/** بناء استعلام FTS5 آمن من نص المستخدم (يدعم البادئة «ال») */
export function ftsQuery(q = '') {
  const tokens = normalizeAr(q)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens
    .map((t) => {
      const bare = t.replace(/^(وال|بال|كال|فال|لل|ال)/, '');
      const parts = [`"${t}"*`];
      if (bare.length >= 2 && bare !== t) parts.push(`"${bare}"*`);
      return `(${parts.join(' OR ')})`;
    })
    .join(' AND ');
}
