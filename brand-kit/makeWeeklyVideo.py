"""Assemble a vertical (1080x1920) video from AI clips: blurred fill, the clip in the middle, an approved text under it, an end card.
Run: python brand-kit/makeWeeklyVideo.py w1-video1
The Arabic text is drawn by Chrome (correct shaping) into transparent PNG overlays, then moviepy puts everything together."""
import os, subprocess, sys, tempfile
import numpy as np
from moviepy import VideoFileClip, ImageClip, CompositeVideoClip, concatenate_videoclips, ColorClip
from moviepy.video.fx import Resize, Crop
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = os.path.join(HERE, "social", "weekly", "clips")
OUT = os.path.join(HERE, "social", "weekly")
CHROME = r"C:/Program Files/Google/Chrome/Application/chrome.exe"
W, H = 1080, 1920
FONTS = "file:///" + os.path.join(HERE, "fonts").replace("\\", "/")
LOGO_W = "file:///" + os.path.join(HERE, "logo", "logo-full-horizontal-white.png").replace("\\", "/")

JOBS = {
    "w1-video1": {
        "segments": [
            {"clip": "w1-net-b1.mp4", "text": "كم ربحت هالشهر؟", "tag": "😂 خبر مضحك · تمثيل"},
            {"clip": "w1-chair-b3.mp4", "text": "ما بتعرف بالضبط؟", "tag": "😂 خبر مضحك · تمثيل"},
        ],
        "end": {
            "lines": ["سجّل دخلك ومصاريفك", "بدليلكم، والصافي", "بيطلع لحاله."],
            "offer": "٣ شهور مجاناً، لفترة محدودة",
            "small": "بدون بطاقة دفع",
            "cta": "حمّل دليلكم من متجر غوغل بلاي",
        },
    }
}

BASE_CSS = f"""
@font-face{{font-family:"Tajawal";font-weight:400;src:url("{FONTS}/tajawal_regular.ttf")}}
@font-face{{font-family:"Tajawal";font-weight:700;src:url("{FONTS}/tajawal_bold.ttf")}}
*{{box-sizing:border-box;margin:0}}html{{direction:ltr;background:transparent;overflow:hidden}}
body{{width:{W}px;height:{H}px;position:relative;overflow:hidden;background:transparent;font-family:"Tajawal",sans-serif;direction:rtl;color:#fff}}
"""


def shot(html, out, w=W, h=H):
    tmp = tempfile.mkdtemp()
    f = os.path.join(tmp, "p.html")
    open(f, "w", encoding="utf-8").write(html)
    raw = os.path.join(tmp, "raw.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--default-background-color=00000000",
                    "--force-device-scale-factor=1", f"--window-size={w},{h}", "--virtual-time-budget=5000", f"--screenshot={raw}", "file:///" + f.replace("\\", "/")],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    im = Image.open(raw).convert("RGBA")
    print("shot", im.size)
    im.crop((0, 0, w, h)).save(out)


def overlay_html(text, tag):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{BASE_CSS}
.top{{position:absolute;top:70px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:0 50px}}
.tag{{background:#fff;color:#c4552b;font-weight:700;font-size:36px;padding:10px 26px;border-radius:30px}}
.logo{{height:78px}}
.bar{{position:absolute;left:0;right:0;top:1300px;text-align:center}}
.bar span{{display:inline-block;background:#f48050;color:#fff;font-weight:700;font-size:48px;padding:6px 40px;border-radius:30px 30px 0 0}}
.text{{position:absolute;left:40px;right:40px;top:1370px;background:#1d1a1a;border-radius:0 0 36px 36px;padding:46px 30px;text-align:center;font-weight:700;font-size:78px;line-height:1.3;color:#fff}}
.cta{{position:absolute;left:0;right:0;bottom:120px;text-align:center;font-size:44px;font-weight:700;color:#fff;text-shadow:0 2px 12px #000}}
</style></head><body>
<div class="top"><div class="tag">{tag}</div><img class="logo" src="{LOGO_W}"></div>
<div class="bar"><span>🚨 خبر عاجل</span></div>
<div class="text">{text}</div>
<div class="cta">📲 حمّل دليلكم من متجر غوغل بلاي</div>
</body></html>"""


def end_html(e):
    lines = "<br>".join(e["lines"])
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{BASE_CSS}
body{{background:linear-gradient(160deg,#c4552b -10%,#f48050 80%)}}
.wrap{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:50px;text-align:center;padding:0 70px}}
.logo{{height:150px}}
.lines{{font-weight:700;font-size:74px;line-height:1.35}}
.offer{{background:#fff;color:#c4552b;font-weight:700;font-size:64px;padding:18px 50px;border-radius:50px}}
.small{{font-size:44px;opacity:.95}}
.cta{{font-weight:700;font-size:52px;margin-top:30px}}
.url{{direction:ltr;font-weight:700;font-size:58px;letter-spacing:1px}}
</style></head><body><div class="wrap">
<img class="logo" src="{LOGO_W}">
<div class="lines">{lines}</div>
<div class="offer">{e['offer']}</div>
<div class="small">{e['small']}</div>
<div class="cta">{e['cta']}</div>
<div class="url">dalilacom.com</div>
</div></body></html>"""


def content_box(clip):
    """The picture inside the 16:9 frame (the AI clip has black bars at the sides): find it from a middle frame."""
    fr = clip.get_frame(clip.duration / 2)
    lum = fr.mean(axis=(0, 2))
    xs = np.where(lum > 12)[0]
    return int(xs.min()), int(xs.max()) + 1


def build(name):
    job = JOBS[name]
    parts = []
    tmp = tempfile.mkdtemp()
    for i, seg in enumerate(job["segments"]):
        clip = VideoFileClip(os.path.join(CLIPS, seg["clip"]))
        x0, x1 = content_box(clip)
        core = clip.with_effects([Crop(x1=x1, x2=None) if False else Crop(x1=x0, x2=x1)])
        fg = core.with_effects([Resize(width=W)]).with_position(("center", 400))
        # background: the same clip, filled to the full frame and blurred
        bg = core.with_effects([Resize(height=H)]).with_effects([Crop(x_center=core.w * (H / core.h) / 2, width=W, y1=0, y2=H)]) if False else None
        bgc = core.with_effects([Resize(height=H)])
        bgc = bgc.with_effects([Crop(x_center=bgc.w / 2, width=W)])
        bgc = bgc.image_transform(lambda f: np.array(Image.fromarray(f).filter(ImageFilter.GaussianBlur(40)).point(lambda v: int(v * 0.55))))
        ov = os.path.join(tmp, f"ov{i}.png")
        shot(overlay_html(seg["text"], seg["tag"]), ov)
        over = ImageClip(ov, transparent=True).with_duration(clip.duration)
        comp = CompositeVideoClip([bgc, fg, over], size=(W, H)).with_duration(clip.duration)
        parts.append(comp)
    end = os.path.join(tmp, "end.png")
    shot(end_html(job["end"]), end)
    parts.append(ImageClip(end).with_duration(4))
    final = concatenate_videoclips(parts, method="compose")
    out = os.path.join(OUT, name + ".mp4")
    final.write_videofile(out, fps=24, codec="libx264", audio_codec="aac", preset="medium", logger=None, temp_audiofile=os.path.join(tempfile.gettempdir(), name + "-audio.m4a"))
    print("ok", out, round(final.duration, 1), "s")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "w1-video1")
