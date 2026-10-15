// Builds the logo variants of the brand kit (brand-kit/logo/*) from the transparent app icon.
// Run: node scripts/makeBrandKit.cjs   (the social images and the guide are drawn from brand-kit/templates/*.html with Chrome)
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const source = path.join(root, "public", "brand", "app-icon-1024-transparent.png");
const out = path.join(root, "brand-kit", "logo");
fs.mkdirSync(out, { recursive: true });

const RED = { r: 0xcb, g: 0x0c, b: 0x2e };

/** The logo with every visible pixel painted one colour (alpha kept). */
async function mono(color) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b;
  }
  return sharp(data, { raw: info }).png();
}

async function onBackground(logoPng, bg, size, ratio, name) {
  const logo = await sharp(await logoPng.toBuffer()).trim().resize(Math.round(size * ratio), Math.round(size * ratio), { fit: "inside" }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: logo, gravity: "center" }]).png().toFile(path.join(out, name));
}

(async () => {
  // 1. the logo itself, trimmed to its edges, on transparent
  const trimmed = async (p) => sharp(await p.toBuffer()).trim().png();
  await (await trimmed(sharp(source).png())).toFile(path.join(out, "logo-color.png"));
  await (await trimmed(await mono({ r: 255, g: 255, b: 255 }))).toFile(path.join(out, "logo-white.png"));
  await (await trimmed(await mono({ r: 1, g: 1, b: 1 }))).toFile(path.join(out, "logo-black.png"));
  await (await trimmed(await mono(RED))).toFile(path.join(out, "logo-red-mono.png"));

  // 2. squares for profile pictures (a round crop keeps the logo: it fills 62% of the square)
  const color = sharp(source).png();
  await onBackground(color, "#ffffff", 1080, 0.62, "profile-on-white-1080.png");
  await onBackground(await mono({ r: 255, g: 255, b: 255 }), { r: RED.r, g: RED.g, b: RED.b, alpha: 1 }, 1080, 0.62, "profile-on-red-1080.png");
  await onBackground(await mono({ r: 255, g: 255, b: 255 }), { r: 0x1c, g: 0x14, b: 0x13, alpha: 1 }, 1080, 0.62, "profile-on-ink-1080.png");
  console.log("logo variants written to brand-kit/logo");
})();
