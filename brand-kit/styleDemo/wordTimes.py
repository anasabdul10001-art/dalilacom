"""Word timestamps of the final voice lines (local faster-whisper), used to sync the scenes.
Run: PYTHONUTF8=1 python brand-kit/styleDemo/wordTimes.py"""
import os, json, subprocess, numpy as np
import imageio_ffmpeg
from faster_whisper import WhisperModel
HERE=os.path.dirname(os.path.abspath(__file__))
E=os.path.join(HERE,"real","eleven")
import sys
SET=sys.argv[1] if len(sys.argv)>1 else "shami"
LINES={"shami":{"v1":"v2-line1-ghaida","v2":"v2-line2-ghaida","v3":"v3-line3-owner-shami","v4":"v3-line4-owner-shami","v5":"v3-line5-owner-shami","v6":"v3-line6-owner-shami"},"fusha":{"v1":"f-line1-ghaida-fusha","v2":"f-line2-ghaida-fusha","v3":"v2-line3-owner","v4":"v2-line4-owner","v5":"v2-line5-owner","v6":"v2-line6-owner"}}[SET]
ff=imageio_ffmpeg.get_ffmpeg_exe()
m=WhisperModel("large-v3",device="cpu",compute_type="int8")
out={}
for k,f in LINES.items():
    raw=subprocess.run([ff,"-i",os.path.join(E,f+".mp3"),"-ar","16000","-ac","1","-f","f32le","-"],capture_output=True,check=True).stdout
    a=np.frombuffer(raw,dtype=np.float32)
    segs,_=m.transcribe(a,language="ar",word_timestamps=True)
    out[k]={"dur":len(a)/16000,"words":[[w.word.strip(),round(w.start,2),round(w.end,2)] for s in segs for w in s.words]}
    print(k,out[k],flush=True)
json.dump(out,open(os.path.join(HERE,"wordtimes_"+SET+".json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
