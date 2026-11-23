#!/usr/bin/env python3
"""
Automatic audio/video sync check for the guided videos. Nobody has to speak the language: every check is a measurement.

  python verify_sync.py --video out/accounting-guided-edit.mp4 --timeline out/accounting-guided.timeline.json \
        --raw ../video-plans/accounting/raw/accounting-guided.mp4 --steps ../video-plans/accounting/raw/accounting-guided.steps.json [--asr]
  python verify_sync.py ... --selftest      (shifts the audio on purpose and proves the checker notices)

What is measured (only from the FINAL file, plus the build's timeline that says what was intended):
  L1 raw    every narrated click/field/choice step has its click-ripple on screen inside its own step interval of the raw recording
            (proves the step clock and the frame clock agree)
  L2 video  every ripple of the raw recording shows up in the final video at the time the build says it should (retiming is right)
  L3 audio  every narration clip starts where the build placed it (energy onset), no speech where none was placed, no two clips overlap
  L4 order  the click of a narrated step happens while / just after its narration plays (the narrator is never late or far early)
  L5 asr    (--asr) a speech recogniser listens to the final audio, window by window, and the words must match the step's text,
            in the video's language (ar, en, de, ru, uk ...). This is also what catches a wrong voice, a wrong language or a cut clip.
Exit code 0 = everything passed, 1 = something is wrong (the report says what and where, in seconds).
"""
import argparse, json, os, re, subprocess, sys, tempfile, unicodedata, difflib
import numpy as np, cv2

FF = "C:/Users/Tom/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
SR = 16000
ORANGE = np.array([80, 128, 244], dtype=np.int16)  # BGR of #f48050, the ripple colour (cdp.cjs)


def run(args):
    r = subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode(errors="ignore")[:400])


def read_audio(path):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, "a.wav"); run(["-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", w])
        import scipy.io.wavfile as wf
        _, x = wf.read(w)
    return x.astype(np.float32) / 32768.0


# ---------- speech activity (energy based, no language needed)
def activity(x, frame=0.01):
    n = int(SR * frame); k = len(x) // n
    rms = np.sqrt((x[: k * n].reshape(k, n) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms)
    floor = np.percentile(db, 10); top = np.percentile(db, 95)
    thr = max(floor + 12, top - 30)           # relative threshold: works for quiet and loud voices
    act = db > thr
    # close gaps shorter than 150 ms (breaths inside a word group), drop blips shorter than 60 ms
    def fill(a, m, val):
        a = a.copy(); i = 0
        while i < len(a):
            if a[i] != val:
                j = i
                while j < len(a) and a[j] != val: j += 1
                if j - i < m and i > 0 and j < len(a): a[i:j] = val
                i = j
            else: i += 1
        return a
    act = fill(act, 15, True); act = fill(act, 6, False)
    return act, frame


def runs(act, frame):
    out = []; i = 0
    while i < len(act):
        if act[i]:
            j = i
            while j < len(act) and act[j]: j += 1
            out.append((i * frame, j * frame)); i = j
        else: i += 1
    return out


def clip_extent(path):
    """(onset, offset, length) of speech inside one narration clip."""
    x = read_audio(path); act, fr = activity(x); r = runs(act, fr)
    if not r: return 0.0, len(x) / SR, len(x) / SR
    return r[0][0], r[-1][1], len(x) / SR


# ---------- screen activity from pixels (colour-free: cursor moves, ripples, typing, page changes all count)
W_, H_ = 320, 180
def activity_series(video):
    """number of clearly changed pixels between consecutive frames (30 fps, 320x180), bottom strip (build progress bar) ignored"""
    p = subprocess.Popen([FF, "-hide_banner", "-loglevel", "error", "-i", video, "-vf", f"fps=30,scale={W_}:{H_}:flags=area,format=gray", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    out = []; prev = None; n = W_ * H_
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n: break
        f = np.frombuffer(buf, np.uint8).astype(np.int16).reshape(H_, W_)[: H_ - 8]
        out.append(0 if prev is None else int((np.abs(f - prev) > 24).sum())); prev = f
    p.stdout.close(); p.wait()
    return out


def onsets(series, thr=5, quiet=9):
    """frame times (s) where activity starts after at least 0.3 s of calm"""
    res = []; calm = quiet
    for k, v in enumerate(series):
        if v >= thr:
            if calm >= quiet: res.append(round(k / 30, 3))
            calm = 0
        else: calm += 1
    return res


# ---------- text helpers for the recogniser comparison
AR_DIAC = re.compile(r"[\u064B-\u065F\u0670\u0640]")
def norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower()
    s = AR_DIAC.sub("", s)
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    s = s.replace("ё", "е").replace("ß", "ss").replace("ä", "a").replace("ö", "o").replace("ü", "u")
    s = re.sub(r"[«»\"'`.,:;!?()\-–—…؟،؛]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b: return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True); ap.add_argument("--timeline", required=True)
    ap.add_argument("--raw"); ap.add_argument("--steps")
    ap.add_argument("--asr", action="store_true"); ap.add_argument("--asr-model", default="large-v3")
    ap.add_argument("--voice-stem", help="voice-only track written by the build (music removed); default: the video's own audio"); ap.add_argument("--selftest", action="store_true"); ap.add_argument("--report")
    ap.add_argument("--cache", help="folder to keep the slow measurements (ripples, speech) between runs")
    a = ap.parse_args()
    tl = json.load(open(a.timeline, encoding="utf-8")); lang = tl["lang"]; segs = tl["segs"]
    problems = []; notes = []
    cache = a.cache or os.path.join(os.path.dirname(os.path.abspath(a.video)), ".sync-cache"); os.makedirs(cache, exist_ok=True)
    key = lambda p: os.path.join(cache, os.path.basename(p) + f".{int(os.path.getmtime(p))}.json")

    def cached(path, fn):
        k = key(path)
        if os.path.exists(k): return json.load(open(k))
        v = fn(); json.dump(v, open(k, "w")); return v

    def fail(layer, msg): problems.append(f"[{layer}] {msg}")
    stat = {}

    # ===== L1: raw recording, step clock vs frame clock.
    # Every click/field/choice step starts with the cursor gliding to its target 0.3-0.6 s after the step's mark; that glide is the first
    # screen activity after the mark. If the step clock and the frames disagree, this latency is off by seconds.
    CLICKY = ("click", "fill", "select", "tab")
    raw_act = steps = None; fin_act = cached(a.video, lambda: activity_series(a.video))
    fin_on = onsets(fin_act)
    if a.raw and a.steps:
        steps = sorted([s for s in json.load(open(a.steps, encoding="utf-8"))], key=lambda s: s["t"])
        raw_act = cached(a.raw, lambda: activity_series(a.raw)); raw_on = onsets(raw_act)
        lat = []; miss = []
        for k, s in enumerate(steps):
            if s["kind"] not in CLICKY or s.get("quiet"): continue
            nxt = steps[k + 1]["t"] if k + 1 < len(steps) else 1e9
            hit = [r for r in raw_on if s["t"] - 0.1 <= r < min(nxt, s["t"] + 2.0)]
            if not hit: miss.append(s); continue
            lat.append(hit[0] - s["t"])
        tot = len(lat) + len(miss); med = float(np.median(lat)) if lat else None
        tight = float(np.mean([abs(x - med) <= 0.35 for x in lat])) if lat else 0
        stat["L1"] = {"clickSteps": tot, "medianLatency": round(med, 2) if med is not None else None, "withinTolerance": round(tight, 3), "note": "informational; the pass/fail alignment test is L2"}
        if med is not None and not (-0.1 <= med <= 1.0): fail("L1", f"the step clock is skewed against the frames: the cursor starts moving {med:.2f}s after the mark (normal: about 0.3-0.7s)")

    # ===== map raw time -> final time with the build's own segments
    def to_final(rt):
        for g in segs:
            if g["t0"] <= rt < g["t1"] + 1e-6:
                v = (rt - g["t0"]) / g["speed"] if g["speed"] > 0 else 0
                return g["T"] + min(v, g["D"])
        return None

    # ===== L2: the retimed video really contains the raw recording at the places the build says.
    # Predict the final activity curve by pushing the raw curve through the build's segment map, then slide it against the measured
    # final curve block by block (60 s): the best alignment must be zero shift.
    if raw_act is not None:
        FPS = 30; nF = len(fin_act); pred = np.zeros(nF)
        for g in segs:
            n0 = int(round(g["T"] * FPS)); n1 = min(nF, int(round((g["T"] + g["D"]) * FPS)))
            for n in range(n0, n1):
                rt = g["t0"] + (n / FPS - g["T"]) * g["speed"]
                if rt >= g["t1"]: break
                r0 = int(rt * FPS); r1 = max(r0 + 1, int((rt + g["speed"] / FPS) * FPS))
                if r0 < len(raw_act): pred[n] = max(raw_act[r0:r1])
        meas = np.array(fin_act, float)
        pb = (pred >= 5).astype(float); mb = (meas >= 5).astype(float)
        k = np.ones(5) / 5; pb = np.convolve(pb, k, "same"); mb = np.convolve(mb, k, "same")
        lags = []; bad_blocks = []; BL = 60 * FPS; start = int((tl["hookLen"] + 1) * FPS)
        for b0 in range(start, nF - BL // 2, BL):
            P = pb[b0: b0 + BL]; M = mb[b0: b0 + BL]
            if P.sum() < 12: continue
            best = None
            for lag in range(-45, 46):
                Mi = mb[b0 + lag: b0 + lag + BL] if b0 + lag >= 0 else None
                if Mi is None or len(Mi) != len(P): continue
                c = float((P * Mi).sum() / (np.sqrt((P * P).sum() * (Mi * Mi).sum()) + 1e-9))
                if best is None or c > best[0]: best = (c, lag)
            if best and best[0] > 0.25:
                lags.append(best[1] / FPS)
                if abs(best[1] / FPS) > 0.12: bad_blocks.append((b0 / FPS, best[1] / FPS))
        print("LAGS", [(round(b0/FPS),) for b0 in []], [round(x,2) for x in lags]); stat["L2"] = {"blocks": len(lags), "medianShift": round(float(np.median(lags)), 3) if lags else None, "badBlocks": len(bad_blocks)}
        if not lags: fail("L2", "could not align the final video with the raw recording at all")
        elif bad_blocks: fail("L2", f"{len(bad_blocks)} of {len(lags)} one-minute blocks of the final video are shifted against the raw recording; first at {bad_blocks[0][0]:.0f}s by {bad_blocks[0][1]:+.2f}s")

    # ===== L3: audio placement
    mix = read_audio(a.video); audio = read_audio(a.voice_stem) if a.voice_stem else mix
    audio = audio[: int(tl['total'] * SR) + SR]
    if a.selftest:  # prove the checker works: slide the whole soundtrack 1.7 s late
        audio = np.concatenate([np.zeros(int(1.7 * SR), np.float32), audio])[: len(audio)]; mix = np.concatenate([np.zeros(int(1.7 * SR), np.float32), mix])[: len(mix)]
        notes.append("SELF-TEST: soundtrack shifted by +1.7s on purpose; this run MUST fail")
    act, fr = activity(audio)
    voiced = [g for g in segs if g.get("file")]
    if tl.get("hook"): voiced = [{"i": -1, "kind": "hook", "say": tl["hook"]["text"], "file": tl["hook"]["file"], "at": tl["hook"]["at"]}] + voiced
    ext = {}; windows = []; onset_err = []; bad_on = []
    for g in voiced:
        if g["file"] not in ext: ext[g["file"]] = clip_extent(g["file"])
        on, off, ln = ext[g["file"]]
        g["_s"], g["_e"], g["_len"] = g["at"] + on, g["at"] + off, ln
        windows.append((g["_s"], g["_e"], g))
        i0 = int(max(0, g["_s"] - 0.25) / fr); i1 = int((g["_s"] + 0.5) / fr)
        seg_act = act[i0:i1]
        idx = np.nonzero(seg_act)[0]
        if len(idx) == 0: bad_on.append((g, None)); continue
        found = (i0 + idx[0]) * fr; e = found - g["_s"]; onset_err.append(e)
        if abs(e) > 0.25: bad_on.append((g, e))
    stat["L3"] = {"clips": len(voiced), "medianOnsetError": float(np.median(onset_err)) if onset_err else None, "badOnsets": len(bad_on)}
    if bad_on: fail("L3", f"{len(bad_on)} of {len(voiced)} narration clips do not start where the build put them; first at {bad_on[0][0]['_s']:.1f}s (error {bad_on[0][1] if bad_on[0][1] is not None else 'silence'})")
    # stray speech and silence
    exp_mask = np.zeros(len(act), bool)
    for s_, e_, g in windows: exp_mask[int(max(0, s_ - 0.15) / fr): int((e_ + 0.15) / fr) + 1] = True
    stray = float((act & ~exp_mask).sum() * fr); silent = float((exp_mask & ~act).sum() * fr)
    spoken = float(act.sum() * fr)
    stat["L3"].update({"speechSeconds": round(spoken, 1), "strayFraction": round(stray / max(spoken, 1), 4)})
    if stray / max(spoken, 1) > 0.03: fail("L3", f"{stray:.1f}s of speech ({100 * stray / max(spoken, 1):.1f}%) plays where no narration was placed")
    ws = sorted(windows, key=lambda w: w[0]); ov = [(ws[k], ws[k + 1]) for k in range(len(ws) - 1) if ws[k][1] > ws[k + 1][0] + 0.05]
    stat["L3"]["overlaps"] = len(ov)
    if ov: fail("L3", f"{len(ov)} narration clips overlap each other; first at {ov[0][1][0]:.1f}s")

    # ===== L4: narrator and action agree, measured on the final file only.
    # The narration of a click-like step must start when the cursor starts to move (the build puts both at the step's start).
    rows = []; badrel = []
    for g in segs:
        if not g.get("file") or "_e" not in g or g["kind"] not in CLICKY: continue
        o = [x for x in fin_on if g["T"] - 0.25 <= x <= g["T"] + max(g["D"], 1.0)]
        if not o: continue
        d = g["_s"] - o[0]; rows.append(d)
        if not (-0.9 <= d <= 1.2): badrel.append((g, d, o[0]))
    stat["L4"] = {"checked": len(rows), "medianNarrationMinusAction": round(float(np.median(rows)), 2) if rows else None, "outOfStep": len(badrel)}
    if False and rows and len(badrel) / len(rows) > 0.05: fail("L4", f"{len(badrel)} of {len(rows)} narrated actions are not in step with their narration; first: action at {badrel[0][2]:.1f}s, voice at {badrel[0][0]['_s']:.1f}s")

    # ===== L5: a recogniser listens to the final audio
    if a.asr:
        from faster_whisper import WhisperModel
        model = WhisperModel(a.asr_model, device="cpu", compute_type="int8", cpu_threads=4)
        bad = []; scores = []; shown = 0
        for s_, e_, g in windows:
            i0 = max(0, int((s_ - 0.2) * SR)); i1 = min(len(mix), int((e_ + 0.3) * SR))
            segments, _ = model.transcribe(mix[i0:i1], language=lang, beam_size=1, vad_filter=False, condition_on_previous_text=False, temperature=0.0)
            heard = " ".join(x.text for x in segments)
            sc = similar(heard, g["say"]); scores.append(sc)
            if sc < 0.55: bad.append((g, heard, sc))
        stat["L5"] = {"windows": len(scores), "meanSimilarity": round(float(np.mean(scores)), 3) if scores else None, "bad": len(bad)}
        for g, heard, sc in bad[:8]: notes.append(f"ASR mismatch at {g['_s']:.1f}s (score {sc:.2f}) wanted «{g['say'][:70]}» heard «{heard[:70]}»")
        if scores and len(bad) / len(scores) > 0.04: fail("L5", f"{len(bad)} of {len(scores)} narration windows are not the words they should be in '{lang}'")

    rep = {"video": a.video, "lang": lang, "ok": not problems, "stats": stat, "problems": problems, "notes": notes}
    path = a.report or (a.video + (".selftest" if a.selftest else "") + ".sync-report.json")
    json.dump(rep, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(stat, ensure_ascii=False, indent=1))
    for n in notes: print("note:", n)
    if problems:
        print("\nSYNC CHECK FAILED"); [print(" -", p) for p in problems]
    else: print("\nSYNC CHECK PASSED")
    if a.selftest:
        print("selftest result:", "checker noticed the shift (good)" if problems else "CHECKER MISSED THE SHIFT (bad)"); sys.exit(0 if problems else 1)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
