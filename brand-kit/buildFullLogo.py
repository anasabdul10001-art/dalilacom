"""
Builds the full logo (the mark + the real lettering of the word «دليلكم», arrows on its letters) from the owner's own images:
- the lettering is cut out of reference/480150122_..._n.jpg (black on white, 1080 px wide): only the dark pixels of the word's
  letters, arrows and dots are kept (not «الشامل», not the tagline, not the mark), then enlarged 4x with crisp edges;
- the mark is the clean one in logo/logo-color.png.
The layout follows the owner's cover picture (mark centred above the word, gap = 13.5% of the mark width, word = 1.46 x mark width).
Run: python brand-kit/buildFullLogo.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "reference", "480150122_642093358214502_8798875758131265536_n.jpg")
OUT = os.path.join(HERE, "logo")
INK = (1, 1, 1)
RED_WORD = None


def cut_word():
    rgb = np.array(Image.open(SRC).convert("RGB")).astype(int)
    mx = rgb.max(axis=2)
    dark = mx < 110
    dark[:, 0] = False  # the thin frame line at the picture's left edge
    lab, n = ndi.label(dark)
    keep = np.zeros_like(dark)
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        area = int((lab[sl] == i).sum())
        if area < 30:
            continue
        in_word_area = xs.start >= 140 and xs.stop <= 740 and ys.stop <= 416 and ys.start >= 195
        is_shamel = xs.start >= 150 and xs.stop <= 320 and ys.start >= 380  # «الشامل» under the word
        if in_word_area and not is_shamel:
            keep |= lab == i
    near = ndi.binary_dilation(keep, iterations=2)
    # soft edges: how dark a pixel is, only around the kept letters
    alpha = np.clip((150 - mx) / 110.0, 0, 1) * near
    ys, xs = np.where(alpha > 0.02)
    y0, y1, x0, x1 = ys.min() - 2, ys.max() + 3, xs.min() - 2, xs.max() + 3
    alpha = alpha[y0:y1, x0:x1]
    # enlarge 4x and sharpen the edge (a smooth step around 0.5): crisp lettering instead of a blurry picture
    big = Image.fromarray((alpha * 255).astype(np.uint8)).resize((alpha.shape[1] * 4, alpha.shape[0] * 4), Image.LANCZOS)
    a = np.asarray(big).astype(float) / 255.0
    a = np.clip((a - 0.5) * 3.2 + 0.5, 0, 1)
    return a


def tint(alpha, color):
    h, w = alpha.shape
    img = np.zeros((h, w, 4), dtype=np.uint8)
    img[..., 0], img[..., 1], img[..., 2] = color
    img[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(img, "RGBA")


def mark(variant):
    name = {"color": "logo-color.png", "white": "logo-white.png", "black": "logo-black.png"}[variant]
    return Image.open(os.path.join(OUT, name)).convert("RGBA")


def lockup_vertical(word_img, mark_img):
    mw = 1000
    mh = round(mark_img.height * mw / mark_img.width)
    m = mark_img.resize((mw, mh), Image.LANCZOS)
    ww = round(mw * 1.46)
    wh = round(word_img.height * ww / word_img.width)
    w = word_img.resize((ww, wh), Image.LANCZOS)
    gap = round(mw * 0.135)
    pad = 60
    W, H = ww + 2 * pad, mh + gap + wh + 2 * pad
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(m, ((W - mw) // 2, pad))
    canvas.alpha_composite(w, ((W - ww) // 2, pad + mh + gap))
    return canvas


def lockup_horizontal(word_img, mark_img):
    mh = 600
    mw = round(mark_img.width * mh / mark_img.height)
    m = mark_img.resize((mw, mh), Image.LANCZOS)
    wh = round(mh * 0.99)  # in the owner's picture the lettering is as tall as the mark
    ww = round(word_img.width * wh / word_img.height)
    w = word_img.resize((ww, wh), Image.LANCZOS)
    gap = round(mh * 0.05)
    pad = 60
    W, H = ww + gap + mw + 2 * pad, mh + 2 * pad
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(w, (pad, pad + (mh - wh) // 2))
    canvas.alpha_composite(m, (pad + ww + gap, pad))
    return canvas


if __name__ == "__main__":
    alpha = cut_word()
    words = {"color": tint(alpha, INK), "white": tint(alpha, (255, 255, 255)), "black": tint(alpha, INK)}
    words["white"].save(os.path.join(OUT, "wordmark-white.png"))
    words["black"].save(os.path.join(OUT, "wordmark-black.png"))
    for variant in ("color", "white", "black"):
        lockup_vertical(words[variant], mark(variant)).save(os.path.join(OUT, f"logo-full-vertical-{variant}.png"))
        lockup_horizontal(words[variant], mark(variant)).save(os.path.join(OUT, f"logo-full-horizontal-{variant}.png"))
    print("done", alpha.shape)
