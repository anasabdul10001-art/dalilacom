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

interface Card {
  title: string;
  description: string;
  url: string;
  image: string;
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
  ].join("\n");
}

let template: string | null = null;
function readTemplate(): string {
  if (template === null) template = fs.readFileSync(INDEX, "utf8");
  return template;
}

/** The website's page with the right preview card in it. */
export async function renderSharePage(merchantId?: unknown): Promise<string> {
  const base = baseUrl();
  let card: Card = { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, url: `${base}/`, image: `${base}/brand/og-share-v2.png` };

  if (typeof merchantId === "string" && /^[0-9a-f-]{36}$/i.test(merchantId)) {
    const shop = await prisma.merchantProfile.findFirst({
      where: { id: merchantId, approvalStatus: "APPROVED" },
      select: { id: true, businessName: true, address: true, category: { select: { name: true } }, discounts: { where: liveDiscountWhere(), select: { percent: true }, orderBy: { percent: "desc" }, take: 1 } },
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
      };
    }
  }

  return readTemplate()
    .replace(/<!--share:start-->[\s\S]*?<!--share:end-->/, `<!--share:start-->\n${shareTags(card)}\n<!--share:end-->`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(card.title)}</title>`);
}
