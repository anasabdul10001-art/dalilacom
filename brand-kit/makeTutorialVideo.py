"""Turns a recorded walk through the web app (frames + stamps.json from brand-kit/recordTutorial.cjs) into a vertical 1080x1920 video:
the phone screen in the middle, a short line under it, the logo on top and an end card.
When a voice file exists for the video (brand-kit/social/weekly/voice/<name>.m4a|wav|mp3) it is laid under the video and the screen is held to the voice length.
Run: python brand-kit/makeTutorialVideo.py <frames-dir> <video-name> <lang: ar-sy|ar-fusha>"""
import json, os, sys, tempfile, subprocess
import numpy as np
from moviepy import ImageClip, CompositeVideoClip, concatenate_videoclips, AudioFileClip
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "social", "weekly")
VOICE = os.path.join(OUT, "voice")
CHROME = r"C:/Program Files/Google/Chrome/Application/chrome.exe"
W, H = 1080, 1920
FONTS = "file:///" + os.path.join(HERE, "fonts").replace("\\", "/")
LOGO = "file:///" + os.path.join(HERE, "logo", "logo-full-horizontal-white.png").replace("\\", "/")

# the line shown under the screen, from the approved scripts (marketing/weeks/week-1-tutorial-scripts.md): (from, to) as a fraction of the recording
CAPTIONS = {
    "a": {
        "ar-sy": [(0.0, 0.34, "١ سجّل حساب بدليلكم"), (0.34, 0.6, "٢ افتح «المحاسب»"), (0.6, 1.0, "٣ اكبس «ابدأ التجربة»")],
        "ar-fusha": [(0.0, 0.34, "١ أنشئ حسابًا في دليلكم"), (0.34, 0.6, "٢ افتح «المحاسب»"), (0.6, 1.0, "٣ اضغط «ابدأ التجربة»")],
        "end": ["٣ شهور مجاناً، لفترة محدودة", "بدون بطاقة دفع"],
        "end_fusha": ["٣ أشهر مجانًا لفترة محدودة", "بدون بطاقة دفع"],
    },
    "b": {
        "ar-sy": [(0.0, 0.1, "افتح «المخزون»"), (0.1, 0.6, "اكتب اسم المنتج والسعر والتكلفة والكمية"), (0.6, 0.72, "«إضافة المنتج للجرد»"), (0.72, 1.0, "بضاعة جديدة؟ اكبس + وأدخل الكمية")],
        "ar-fusha": [(0.0, 0.1, "افتح «المخزون»"), (0.1, 0.6, "اكتب اسم المنتج والسعر والتكلفة والكمية"), (0.6, 0.72, "«إضافة المنتج للجرد»"), (0.72, 1.0, "بضاعة جديدة؟ اضغط + وأدخل الكمية")],
        "end": ["حمّل دليلكم من متجر غوغل بلاي"], "end_fusha": ["حمّل دليلكم من متجر غوغل بلاي"],
    },
    "c": {
        "ar-sy": [(0.0, 0.2, "افتح المنتج بالجرد"), (0.2, 0.6, "اكبس «بيع» واكتب كم قطعة انباعت"), (0.6, 1.0, "الدخل انسجّل والكمية نقصت لحالها")],
        "ar-fusha": [(0.0, 0.2, "افتح المنتج في الجرد"), (0.2, 0.6, "اضغط «بيع» واكتب عدد القطع المباعة"), (0.6, 1.0, "سُجّل الدخل ونقصت الكمية تلقائيًا")],
        "end": ["حمّل دليلكم من متجر غوغل بلاي"], "end_fusha": ["حمّل دليلكم من متجر غوغل بلاي"],
    },
    "d": {
        "ar-sy": [(0.0, 0.3, "افتح «الملخص»"), (0.3, 1.0, "الدخل والمصاريف والصافي، لكل عملة")],
        "ar-fusha": [(0.0, 0.3, "افتح «الملخص»"), (0.3, 1.0, "الدخل والمصاريف والصافي، لكل عملة")],
        "end": ["حمّل دليلكم من متجر غوغل بلاي"], "end_fusha": ["حمّل دليلكم من متجر غوغل بلاي"],
    },
}

CSS = f"""
@font-face{{font-family:"Tajawal";font-weight:400;src:url("{FONTS}/tajawal_regular.ttf")}}
@font-face{{font-family:"Tajawal";font-weight:700;src:url("{FONTS}/tajawal_bold.ttf")}}
*{{box-sizing:border-box;margin:0}}html{{direction:ltr;background:transparent;overflow:hidden}}
body{{width:{W}px;height:{H}px;position:relative;overflow:hidden;background:transparent;font-family:"Tajawal",sans-serif;direction:rtl;color:#fff}}
"""


def shot(html, out):
    tmp = tempfile.mkdtemp()
    f = os.path.join(tmp, "p.html")
    open(f, "w", encoding="utf-8").write(html)
    raw = os.path.join(tmp, "raw.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--default-background-color=00000000", "--force-device-scale-factor=1",
                    f"--window-size={W},{H}", "--virtual-time-budget=5000", f"--screenshot={raw}", "file:///" + f.replace("\\", "/")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    Image.open(raw).convert("RGBA").crop((0, 0, W, H)).save(out)


def caption_png(text, out, tag):
    shot(f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}
.top{{position:absolute;top:64px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:0 50px}}
.logo{{height:78px}}.tag{{background:#fff;color:#c4552b;font-weight:700;font-size:34px;padding:10px 26px;border-radius:30px}}
.cap{{position:absolute;left:46px;right:46px;top:1640px;background:#1d1a1a;border-radius:36px;padding:34px 26px;text-align:center;font-weight:700;font-size:60px;line-height:1.3}}
</style></head><body><div class="top"><img class="logo" src="{LOGO}"><div class="tag">{tag}</div></div><div class="cap">{text}</div></body></html>""", out)


def end_png(lines, out):
    body = "".join(f'<div class="l{i}">{l}</div>' for i, l in enumerate(lines))
    shot(f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}
body{{background:linear-gradient(160deg,#c4552b -10%,#f48050 80%)}}
.w{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:46px;text-align:center;padding:0 70px}}
.logo{{height:150px}}.l0{{background:#fff;color:#c4552b;font-weight:700;font-size:60px;padding:18px 48px;border-radius:50px}}.l1{{font-size:46px}}
.cta{{font-weight:700;font-size:52px;margin-top:20px}}.url{{direction:ltr;font-weight:700;font-size:58px}}
</style></head><body><div class="w"><img class="logo" src="{LOGO}">{body}<div class="cta">حمّل دليلكم من متجر غوغل بلاي</div><div class="url">dalilacom.com</div></div></body></html>""", out)


def phone_frame(path):
    im = Image.open(path).convert("RGB").resize((760, 1520))
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0], im.size[1]), radius=46, fill=255)
    canvas = Image.new("RGB", (W, H), (29, 26, 26))
    canvas.paste((38, 34, 34), (0, 0, W, H))
    border = Image.new("RGB", (im.size[0] + 24, im.size[1] + 24), (12, 11, 11))
    bm = Image.new("L", border.size, 0)
    ImageDraw.Draw(bm).rounded_rectangle((0, 0, border.size[0], border.size[1]), radius=58, fill=255)
    x = (W - border.size[0]) // 2
    canvas.paste(border, (x, 150), bm)
    canvas.paste(im, (x + 12, 162), mask)
    return np.array(canvas)


def build(frames_dir, name, lang):
    key = os.path.basename(frames_dir.rstrip("/\\")).lower()
    stamps = json.load(open(os.path.join(frames_dir, "stamps.json")))
    total = stamps[-1] / 1000.0
    cap = CAPTIONS[key]
    tag = "مثال توضيحي"
    tmp = tempfile.mkdtemp()
    caps = []
    for i, (a, b, text) in enumerate(cap[lang]):
        p = os.path.join(tmp, f"cap{i}.png"); caption_png(text, p, tag); caps.append((a * total, b * total, p))
    clips = []
    for i in range(len(stamps) - 1):
        d = min(max((stamps[i + 1] - stamps[i]) / 1000.0, 0.04), 0.5)
        clips.append(ImageClip(phone_frame(os.path.join(frames_dir, f"{i:05d}.jpg"))).with_duration(d))
    main = concatenate_videoclips(clips, method="chain")
    layers = [main] + [ImageClip(p, transparent=True).with_start(a).with_duration(max(b - a, 0.1)).with_position((0, 0)) for a, b, p in caps]
    body = CompositeVideoClip(layers, size=(W, H)).with_duration(main.duration)
    end = os.path.join(tmp, "end.png"); end_png(cap["end_fusha" if lang == "ar-fusha" else "end"], end)
    final = concatenate_videoclips([body, ImageClip(end).with_duration(3.5)], method="compose")
    voice = next((os.path.join(VOICE, f"{name}.{e}") for e in ("m4a", "wav", "mp3") if os.path.exists(os.path.join(VOICE, f"{name}.{e}"))), None)
    if voice:
        au = AudioFileClip(voice)
        if au.duration > final.duration:
            from moviepy.video.fx import Freeze
            final = final.with_effects([Freeze(t=body.duration - 0.05, freeze_duration=au.duration - final.duration + 0.2)]) if False else final
        final = final.with_audio(au)
    out = os.path.join(OUT, name + ".mp4")
    final.write_videofile(out, fps=24, codec="libx264", audio_codec="aac", preset="medium", logger=None, temp_audiofile=os.path.join(tempfile.gettempdir(), name + "-audio.m4a"))
    print("ok", out, round(final.duration, 1), "s", "with voice" if voice else "silent draft")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "ar-sy")
