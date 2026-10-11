// AI photo editing for a shop's product pictures: remove the background, studio light, change the product's colour.
// Uses Google's image model with the same GEMINI_API_KEY the rest of the AI uses; the key never leaves the server.
export const PHOTO_COLORS = ["red", "blue", "green", "black", "white", "gold", "silver", "pink", "purple", "orange", "yellow", "brown", "gray", "beige", "navy"] as const;
export type PhotoColor = (typeof PHOTO_COLORS)[number];
export type PhotoAiAction = "white_bg" | "studio" | "recolor";

const API = "https://generativelanguage.googleapis.com/v1beta";

/** Models change often: GEMINI_IMAGE_MODEL first, then the ones Google lists for editing pictures. */
const models = () => [...new Set([process.env.GEMINI_IMAGE_MODEL, "gemini-3.1-flash-image", "gemini-3.1-flash-image-preview", "gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"].filter((m): m is string => !!m))];

/** What went wrong the last time, so the admin can read why the AI did not edit a picture (the key is never in it). */
let lastError: string | null = null;
export const lastImageEditError = () => lastError;

export const imageEditAvailable = (): boolean => Boolean(process.env.GEMINI_API_KEY);

const KEEP = "Keep the product exactly as it is: the same shape, proportions, details, material and any text or logo printed on it. Do not add any text, logo, frame or watermark. Output only the edited image.";

export function instructionFor(action: PhotoAiAction, color?: PhotoColor): string {
  if (action === "white_bg")
    return `Remove the background of this product photo completely and put the product on a pure white (#FFFFFF) studio background, centred, with at most a very soft natural shadow under it. ${KEEP}`;
  if (action === "studio")
    return `Retouch this product photo as a professional online-shop studio photo: soft even bright lighting, clean pure white background, sharp details and accurate natural colours. ${KEEP}`;
  return `Change the main colour of the product in this photo to ${color ?? "red"}. Change nothing else: the shape, material texture, shadows, details and background stay identical. Output only the edited image.`;
}

/** The first base64 picture anywhere in an answer (the shape of the answer has changed before, so it is looked for rather than assumed). */
function findImage(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  if (o.thought === true) return null; // a half-finished picture the model drew while thinking
  const mime = String(o.mime_type ?? o.mimeType ?? "");
  if (typeof o.data === "string" && o.data.length > 200 && (o.type === "image" || mime.startsWith("image/"))) return o.data;
  for (const value of Object.values(o)) {
    const hit = findImage(value);
    if (hit) return hit;
  }
  return null;
}

/** The edited picture, or null when no model could do it (the caller then does not charge for it). */
export async function editPhotoWithAi(image: { mime: string; data: Buffer }, instruction: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { lastError = "GEMINI_API_KEY is not set on the server"; return null; }
  const timeout = Number(process.env.AI_IMAGE_TIMEOUT_MS ?? 60000);
  const errors: string[] = [];
  const attempt = async (label: string, url: string, body: unknown): Promise<Buffer | null> => {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      const text = await res.text();
      if (!res.ok) { errors.push(`${label}: HTTP ${res.status} ${text.replace(/\s+/g, " ").slice(0, 160)}`); return null; }
      const b64 = findImage(JSON.parse(text));
      if (b64) return Buffer.from(b64, "base64");
      errors.push(`${label}: answered without a picture`);
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : "failed"}`);
    }
    return null;
  };
  for (const model of models()) {
    // the standard way: generateContent asking for a picture back
    const done = await attempt(model, `${API}/models/${model}:generateContent`, {
      contents: [{ role: "user", parts: [{ text: instruction }, { inline_data: { mime_type: image.mime, data: image.data.toString("base64") } }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });
    if (done) { lastError = null; return done; }
  }
  // the newer interactions endpoint, as a last try with the first model
  const first = models()[0];
  const viaInteractions = await attempt(`${first} (interactions)`, `${API}/interactions`, { model: first, input: [{ type: "text", text: instruction }, { type: "image", mime_type: image.mime, data: image.data.toString("base64") }] });
  if (viaInteractions) { lastError = null; return viaInteractions; }
  lastError = errors.slice(-3).join(" | ");
  return null;
}
