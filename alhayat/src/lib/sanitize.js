import sanitizeHtml from 'sanitize-html';

const YT = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//;

/** تنظيف محتوى الخبر القادم من المحرّر: قائمة بيضاء صارمة */
export function cleanBody(dirty = '') {
  return sanitizeHtml(String(dirty), {
    allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'blockquote',
      'img', 'figure', 'figcaption', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'iframe', 'span'],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'title', 'loading'],
      th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'youtube.com'],
    transformTags: {
      a: (tag, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, rel: 'noopener noreferrer nofollow', ...(attribs.target ? { target: '_blank' } : {}) },
      }),
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }),
    },
    exclusiveFilter: (f) => f.tag === 'iframe' && !YT.test(f.attribs.src || ''),
  });
}

/** نص عادي فقط */
export function plain(s = '', max = 500) {
  return sanitizeHtml(String(s), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** يتحقق من رابط خارجي آمن (http/https أو مسار داخلي) */
export function safeUrl(u = '') {
  u = String(u).trim();
  if (!u) return '';
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  try {
    const p = new URL(u);
    return ['http:', 'https:'].includes(p.protocol) ? p.toString() : '';
  } catch {
    return '';
  }
}

/** يحوّل رابط يوتيوب/فيميو إلى رابط تضمين، أو يُبقي على رابط ملف فيديو مباشر */
export function videoEmbed(u = '') {
  u = safeUrl(u);
  if (!u) return null;
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { type: 'embed', src: `https://www.youtube-nocookie.com/embed/${m[1]}`, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
  if (/\.(mp4|webm)(\?|$)/i.test(u)) return { type: 'file', src: u };
  return null;
}
