import { liveDiscountWhere } from "./discounts";
import fs from "fs";
import path from "path";
import { prisma } from "../prisma";

/**
 * What a shared link looks like in WhatsApp, Facebook, Telegram... (the "preview card": title, description, picture).
 * The website's page carries default tags; a link to one shop (?merchant=<id>) gets that shop's name and details instead.
 */
const INDEX = path.join(__dirname, "..", "..", "public", "app", "index.html");

const SITE_NAME = "دليلكم";
const DEFAULT_TITLE = "دليلكم — كل محلات مدينتك وعروضها بمكان واحد";
const DEFAULT_DESCRIPTION = "اكتشف المحلات والمطاعم والخدمات القريبة منك، واستفد من خصومات حصرية ببطاقة عضوية واحدة. ابحث على الخريطة واطلب بسهولة ووفّر مع دليلكم.";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const baseUrl = () => (process.env.PUBLIC_BASE_URL ?? "https://dalilacom.com").replace(/\/+$/, "");

/**
 * Search engines and AI crawlers are kept out until the owner turns indexing on (SEARCH_INDEXING=on in the server settings):
 * while the site is being tested nothing of it should be found. Off by default, so a forgotten setting never exposes the site.
 */
export const searchIndexingOn = () => (process.env.SEARCH_INDEXING ?? "").toLowerCase() === "on";

interface Card {
  title: string;
  description: string;
  url: string;
  image: string;
  /** Structured data (schema.org) for search engines and AI assistants. */
  jsonLd?: unknown;
  /** The page's own text, for crawlers that do not run the app. */
  html?: string;
}

export function shareTags(card: Card): string {
  const t = escapeHtml(card.title);
  const d = escapeHtml(card.description);
  const u = escapeHtml(card.url);
  const i = escapeHtml(card.image);
  return [
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="ar_AR" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
    `<meta name="theme-color" content="#ba2a34" />`,
    ...(searchIndexingOn() ? [] : [`<meta name="robots" content="noindex, nofollow, noarchive" />`]),
    `<link rel="canonical" href="${u}" />`,
    ...(card.jsonLd ? [`<script type="application/ld+json">${JSON.stringify(card.jsonLd).replace(/</g, "\\u003c")}</script>`] : []),
  ].join("\n");
}

const SITE_TEXT = `
<main class="seo-static" lang="ar">
<h1>دليلكم — دليل المحلات والخدمات القريبة منك</h1>
<p>دليلكم منصة عربية تجمع المحلات والمطاعم والخدمات والأنشطة التجارية على خريطة واحدة. ابحث بالاسم أو بالمهنة (مثلًا: دكتور أسنان، مطعم، صيدلية، حلاق)، شوف الأقرب إليك، وخذ الاتجاهات والعروض.</p>
<h2>شو بتقدر تعمل على دليلكم</h2>
<ul>
<li>البحث عن محل أو مهنة على الخريطة، وتصفية النتائج: مفتوح الآن، فيه حسم، أو ضمن مسافة تختارها.</li>
<li>بطاقة عضوية رقمية برمز QR تعطيك حسومات عند المحلات المشاركة.</li>
<li>متجر إلكتروني لمنتجات أصحاب الأنشطة مع عروض خاصة للأعضاء.</li>
<li>أصحاب الأنشطة يسجّلون نشاطهم (محل أو عمل عبر الإنترنت) بعنوانه وموقعه وساعات عمله وعروضه، وتراجعه الإدارة قبل ظهوره.</li>
<li>تطبيق أندرويد وموقع ويب بلغتين: العربية والإنكليزية.</li>
</ul>
<h2>أسئلة شائعة</h2>
<h3>كيف أبحث عن دكتور أسنان في مدينتي؟</h3>
<p>اكتب «دكتور أسنان» في صندوق البحث أو اختر القسم الطبي ثم طب الأسنان، وحرّك الخريطة لمدينتك واضغط «ابحث بهالمنطقة».</p>
<h3>شو هي بطاقة العضوية؟</h3>
<p>بطاقة رقمية على جوالك بكود يتغيّر باستمرار، بيقرأها المحل ليعطيك الحسم المعلن عنده.</p>
<h3>كيف بسجّل نشاطي التجاري؟</h3>
<p>افتح حسابك ثم «سجّل كصاحب نشاط»، واكتب اسم النشاط ومهنته وعنوانه أو موقعه على الخريطة. بعد موافقة الإدارة بيظهر للناس.</p>
<p lang="en">DALILACOM (دليلكم) is an Arabic local business directory and discount-card app: search shops, restaurants and services on a map, get directions, and save with a digital membership card. Business owners can register their business and offers.</p>
</main>`;

const SITE_JSON_LD = (base: string) => ({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${base}/#org`, name: "دليلكم", alternateName: "DALILACOM", url: `${base}/`, logo: `${base}/brand/favicon-512.png` },
    { "@type": "WebSite", "@id": `${base}/#website`, url: `${base}/`, name: "دليلكم", alternateName: "DALILACOM", inLanguage: ["ar", "en"], publisher: { "@id": `${base}/#org` } },
  ],
});

let template: string | null = null;
function readTemplate(): string {
  if (template === null) template = fs.readFileSync(INDEX, "utf8");
  return template;
}

/** The website's page with the right preview card in it. */
export async function renderSharePage(merchantId?: unknown): Promise<string> {
  const base = baseUrl();
  let card: Card = { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, url: `${base}/`, image: `${base}/brand/og-share-v3.png`, jsonLd: SITE_JSON_LD(base), html: SITE_TEXT };

  if (typeof merchantId === "string" && /^[0-9a-f-]{36}$/i.test(merchantId)) {
    const shop = await prisma.merchantProfile.findFirst({
      where: { id: merchantId, approvalStatus: "APPROVED" },
      select: { id: true, businessName: true, address: true, phone: true, latitude: true, longitude: true, category: { select: { name: true } }, discounts: { where: liveDiscountWhere(), select: { title: true, percent: true }, orderBy: { percent: "desc" }, take: 3 } },
    });
    if (shop) {
      const best = shop.discounts[0]?.percent;
      const where = [shop.category?.name, shop.address].filter(Boolean).join(" · ");
      const offer = best ? `خصم ${best}% لأعضاء دليلكم. ` : "";
      card = {
        title: `${shop.businessName} — دليلكم`,
        description: `${offer}${where ? where + ". " : ""}شوف المكان والعروض وخذ الاتجاهات على دليلكم.`.trim(),
        url: `${base}/?merchant=${shop.id}`,
        image: card.image,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "@id": `${base}/?merchant=${shop.id}#business`,
          name: shop.businessName,
          url: `${base}/?merchant=${shop.id}`,
          ...(shop.category?.name ? { description: `${shop.category.name}${shop.address ? " — " + shop.address : ""}` } : {}),
          ...(shop.address ? { address: { "@type": "PostalAddress", streetAddress: shop.address } } : {}),
          ...(shop.phone ? { telephone: shop.phone } : {}),
          ...(shop.latitude != null && shop.longitude != null ? { geo: { "@type": "GeoCoordinates", latitude: shop.latitude, longitude: shop.longitude } } : {}),
          isPartOf: { "@id": `${base}/#website` },
        },
        html: `<main class="seo-static" lang="ar"><h1>${escapeHtml(shop.businessName)}</h1>`
          + (shop.category?.name ? `<p>${escapeHtml(shop.category.name)}</p>` : "")
          + (shop.address ? `<p>العنوان: ${escapeHtml(shop.address)}</p>` : "")
          + (shop.phone ? `<p>الهاتف: ${escapeHtml(shop.phone)}</p>` : "")
          + (shop.discounts.length ? `<h2>العروض</h2><ul>${shop.discounts.map((d) => `<li>${escapeHtml(d.title)} — خصم ${d.percent}% لأعضاء دليلكم</li>`).join("")}</ul>` : "")
          + `<p>على دليلكم تجد الموقع على الخريطة والاتجاهات والعروض.</p></main>`,
      };
    }
  }

  return readTemplate()
    .replace(/<!--share:start-->[\s\S]*?<!--share:end-->/, `<!--share:start-->\n${shareTags(card)}\n<!--share:end-->`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(card.title)}</title>`)
    .replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, `<!--seo:start-->${card.html ?? ""}<!--seo:end-->`);
}

/** The list of pages for search engines: the home page and every approved shop's page. */
export async function renderSitemap(): Promise<string> {
  const base = baseUrl();
  if (!searchIndexingOn()) return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n`; // nothing to list while the site is closed to search
  const shops = await prisma.merchantProfile.findMany({ where: { approvalStatus: "APPROVED" }, select: { id: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 5000 });
  const url = (loc: string, lastmod?: Date) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    url(`${base}/`, new Date()),
    url(`${base}/privacy.html`),
    url(`${base}/terms.html`),
    ...shops.map((s) => url(`${base}/?merchant=${s.id}`, s.updatedAt)),
  ].join("\n")}\n</urlset>\n`;
}
