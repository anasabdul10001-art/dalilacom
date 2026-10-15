// Builds the site's icons from the logo: Google wants a square favicon whose side is a multiple of 48px (48, 96, 144...),
// reachable at /favicon.ico and through <link rel="icon">. Run once: node scripts/makeFavicons.cjs
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..", "public");
const source = path.join(root, "brand", "logo-on-white.png");

async function square(size) {
  // the logo without its empty margin, centred on white with a small border, so it stays readable at 48px
  const trimmed = await sharp(source).trim({ background: "#ffffff", threshold: 20 }).toBuffer();
  const inner = Math.round(size * 0.86);
  const logo = await sharp(trimmed).resize(inner, inner, { fit: "inside", background: "#ffffff" }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

(async () => {
  for (const size of [48, 96, 144, 192, 512]) {
    fs.writeFileSync(path.join(root, "brand", `favicon-${size}.png`), await square(size));
  }
  // favicon.ico: three PNG pictures (16, 32, 48) in one ICO file
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const s of sizes) pngs.push(await square(s));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s, 0);
    e.writeUInt8(s, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  fs.writeFileSync(path.join(root, "favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));
  console.log("icons written");
})();
