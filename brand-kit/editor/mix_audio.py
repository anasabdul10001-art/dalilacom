#!/usr/bin/env python3
"""
Deterministic audio mix for the guided videos (replaces the 235-input ffmpeg amix, which produced a 57-minute track with silence).
  python mix_audio.py --timeline out/accounting-guided.timeline.json --video-in out/accounting-guided-silent.mp4 --out out/accounting-guided-edit.mp4 [--music FILE] [--vol 0.06]
Every narration clip is decoded and added at exactly its scheduled second (sample accurate), so the result is predictable.
Writes <out>.voice.wav (voice only, 16 kHz mono, the sync checker's input) and muxes voice + quiet music into the video (video stream is copied).
"""
import argparse, json, os, subprocess, tempfile
import numpy as np, scipy.io.wavfile as wf

FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
SR = 44100


def ff(*a):
    r = subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", *a], capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode(errors="ignore")[:500])


def decode(path, sr=SR):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, "c.wav"); ff("-i", path, "-vn", "-ac", "1", "-ar", str(sr), "-c:a", "pcm_s16le", w)
        _, x = wf.read(w)
    return x.astype(np.float32) / 32768.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", required=True); ap.add_argument("--video-in", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--music"); ap.add_argument("--vol", type=float, default=0.06)
    a = ap.parse_args()
    tl = json.load(open(a.timeline, encoding="utf-8")); total = tl["total"]
    n = int(round(total * SR)); voice = np.zeros(n, np.float32); cache = {}
    items = [(tl["hook"]["file"], tl["hook"]["at"])] if tl.get("hook") else []
    items += [(g["file"], g["at"]) for g in tl["segs"] if g.get("file")]
    for f, at in items:
        if f not in cache: cache[f] = decode(f)
        x = cache[f]; s = int(round(at * SR)); e = min(n, s + len(x))
        if s < n: voice[s:e] += x[: e - s]
    peak = float(np.abs(voice).max())
    if peak > 0.98: voice *= 0.98 / peak
    tmp = os.path.dirname(os.path.abspath(a.out))
    vwav = os.path.join(tmp, "_voice44.wav"); wf.write(vwav, SR, (voice * 32767).astype(np.int16))
    stem = a.out.replace(".mp4", ".voice.wav"); ff("-i", vwav, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", stem)
    if a.music:
        fc = f"[1:a]volume={a.vol},afade=t=in:d=2,afade=t=out:st={total - 3:.2f}:d=3,atrim=end={total:.3f}[m];[0:a][m]amix=inputs=2:normalize=0:duration=first:dropout_transition=0[a]"
        ff("-i", vwav, "-stream_loop", "-1", "-i", a.music, "-i", a.video_in, "-filter_complex", fc, "-map", "2:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart", a.out)
    else:
        ff("-i", a.video_in, "-i", vwav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart", a.out)
    os.remove(vwav)
    print("mixed", a.out, f"{total:.1f}s", "clips", len(items), "peak", round(peak, 3))


if __name__ == "__main__":
    main()
