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
