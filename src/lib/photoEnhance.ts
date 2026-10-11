import sharp from "sharp";

/**
 * Makes a shop's product photo fit what Google Shopping and the image-reading algorithms ask for: the right way up, the empty
 * border cut away, the product centred and filling most of a square white canvas of 1200 x 1200, evened-out light, a little
 * more clarity, and a light JPEG. The original is never changed (the caller stores this as a new photo).
 */
export async function enhanceProductPhoto(input: Buffer): Promise<Buffer> {
  const upright = await sharp(input).rotate().toBuffer(); // follow the phone's orientation tag
  // cut the plain border around the product (a threshold, so a slightly noisy backdrop still goes)
  const cropped = await sharp(upright).trim({ threshold: 18 }).toBuffer().catch(() => upright);
  const product = await sharp(cropped)
    .resize(1040, 1040, { fit: "inside", withoutEnlargement: false }) // about 87% of the canvas, as Google recommends (75-90%)
    .flatten({ background: "#ffffff" })
    .normalise({ lower: 1, upper: 99 }) // spread the tones, evening out dark or washed-out light
    .modulate({ brightness: 1.03, saturation: 1.06 })
    .sharpen({ sigma: 0.8 })
    .toBuffer();
  const { width = 1040, height = 1040 } = await sharp(product).metadata();
  const left = Math.floor((1200 - width) / 2);
  const top = Math.floor((1200 - height) / 2);
  return sharp(product)
    .extend({ top, bottom: 1200 - height - top, left, right: 1200 - width - left, background: "#ffffff" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

/* ---------------- editing a photo here, without the AI ---------------- */
// Used when the AI cannot do the job (no key, no answer): it works on a plain backdrop (a wall, a table, a sheet), which is
// what most shop photos have. A busy background gives no clear result, and then nothing is changed.

const WORK = 900;

interface Analysed {
  width: number;
  height: number;
  rgb: Buffer; // 3 bytes per pixel
  alpha: Float32Array; // 1 = product, 0 = background (softened at the edge)
}

/** The product's outline: the backdrop colour is read from the picture's border and grown inwards. */
async function analyse(input: Buffer): Promise<Analysed | null> {
  const { data, info } = await sharp(input).rotate().resize(WORK, WORK, { fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const at = (x: number, y: number) => (y * w + x) * 3;

  // the backdrop colour: the middle value of a ring of border pixels
  const ring: number[][] = [];
  const edge = Math.max(2, Math.round(Math.min(w, h) * 0.01));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < edge || y < edge || x >= w - edge || y >= h - edge) ring.push([data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]]);
  }
  const mid = (c: number) => { const v = ring.map((p) => p[c]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const ref = [mid(0), mid(1), mid(2)];
  const dist2 = (i: number) => (data[i] - ref[0]) ** 2 + (data[i + 1] - ref[1]) ** 2 + (data[i + 2] - ref[2]) ** 2;
  const spread = Math.sqrt(ring.reduce((n, p) => n + (p[0] - ref[0]) ** 2 + (p[1] - ref[1]) ** 2 + (p[2] - ref[2]) ** 2, 0) / ring.length);
  if (spread > 55) return null; // a busy border: there is no plain backdrop to take away
  const limit = Math.min(70, 30 + spread * 1.6) ** 2;

  // grow the backdrop from the border through pixels of the same colour
  const background = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (background[p] || dist2(p * 3) > limit) return;
    background[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const productShare = 1 - tail / (w * h);
  if (productShare < 0.04 || productShare > 0.92) return null; // nothing was found, or the whole picture is the product

  // soften the edge so the outline is not jagged
  const hard = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) hard[p] = background[p] ? 0 : 255;
  const soft = await sharp(hard, { raw: { width: w, height: h, channels: 1 } }).blur(1.4).extractChannel(0).raw().toBuffer(); // one byte per pixel
  const alpha = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = soft[p] / 255;
  return { width: w, height: h, rgb: data, alpha };
}

/** The product on a pure white background, or null when the picture has no plain backdrop to take away. */
export async function removeBackgroundLocal(input: Buffer): Promise<Buffer | null> {
  const a = await analyse(input);
  if (!a) return null;
  const out = Buffer.alloc(a.width * a.height * 3);
  for (let p = 0; p < a.width * a.height; p++) {
    const k = a.alpha[p];
    for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(a.rgb[p * 3 + c] * k + 255 * (1 - k));
  }
  return sharp(out, { raw: { width: a.width, height: a.height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}

type Target = { h?: number; s?: number; mode?: "black" | "white" | "gray" | "silver" | "brown" | "navy" | "beige" };
const TARGETS: Record<string, Target> = {
  red: { h: 0, s: 0.78 }, blue: { h: 215, s: 0.72 }, green: { h: 130, s: 0.62 }, gold: { h: 45, s: 0.8 }, pink: { h: 335, s: 0.7 },
  purple: { h: 280, s: 0.6 }, orange: { h: 27, s: 0.85 }, yellow: { h: 52, s: 0.85 },
  black: { mode: "black" }, white: { mode: "white" }, gray: { mode: "gray" }, silver: { mode: "silver" },
  brown: { h: 25, s: 0.5, mode: "brown" }, navy: { h: 225, s: 0.6, mode: "navy" }, beige: { h: 38, s: 0.38, mode: "beige" },
};

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, s, l];
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The product in another colour (the shading stays), or null when the picture has no plain backdrop to tell the product apart. */
export async function recolorLocal(input: Buffer, color: string): Promise<Buffer | null> {
  const target = TARGETS[color];
  const a = target ? await analyse(input) : null;
  if (!a || !target) return null;
  const out = Buffer.from(a.rgb);
  for (let p = 0; p < a.width * a.height; p++) {
    const k = a.alpha[p];
    if (k < 0.02) continue;
    const [h, s, l] = toHsl(a.rgb[p * 3], a.rgb[p * 3 + 1], a.rgb[p * 3 + 2]);
    let nh = h;
    let ns = s;
    let nl = l;
    if (target.mode === "black") { nl = l * 0.25; ns = s * 0.2; }
    else if (target.mode === "white") { nl = 0.82 + 0.18 * l; ns = s * 0.1; }
    else if (target.mode === "gray") { ns = s * 0.04; }
    else if (target.mode === "silver") { ns = s * 0.04; nl = l * 0.85 + 0.15; }
    else {
      nh = target.h ?? h;
      ns = (target.s ?? 0.6) * (1 - smooth(0.88, 1, l)) * smooth(0.03, 0.12, l); // bright highlights and deep shadows stay neutral
      if (target.mode === "brown") nl = l * 0.75;
      if (target.mode === "navy") nl = l * 0.62;
      if (target.mode === "beige") nl = l * 0.4 + 0.55;
    }
    const [r, g, b] = fromHsl(nh, Math.min(1, Math.max(0, ns)), Math.min(1, Math.max(0, nl)));
    out[p * 3] = Math.round(a.rgb[p * 3] * (1 - k) + r * k);
    out[p * 3 + 1] = Math.round(a.rgb[p * 3 + 1] * (1 - k) + g * k);
    out[p * 3 + 2] = Math.round(a.rgb[p * 3 + 2] * (1 - k) + b * k);
  }
  return sharp(out, { raw: { width: a.width, height: a.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}
