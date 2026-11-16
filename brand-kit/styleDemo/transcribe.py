"""Transcribes the owner's voice recording locally (faster-whisper, nothing leaves the machine) into real/transcript.json with timestamps.
Run: python brand-kit/styleDemo/transcribe.py"""
import os, json
from faster_whisper import WhisperModel
HERE=os.path.dirname(os.path.abspath(__file__))
m=WhisperModel("large-v3",device="cpu",compute_type="int8")
import subprocess, numpy as np, imageio_ffmpeg
raw=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-i",os.path.join(HERE,"real","raw.m4a"),"-ar","16000","-ac","1","-f","s16le","-"],capture_output=True,check=True).stdout
audio=np.frombuffer(raw,dtype=np.int16).astype(np.float32)/32768.0
segs,info=m.transcribe(audio,language="ar",word_timestamps=True,vad_filter=False,beam_size=5)
out=[]
for s in segs:
    out.append({"start":round(s.start,2),"end":round(s.end,2),"text":s.text.strip(),"words":[(round(w.start,2),round(w.end,2),w.word) for w in s.words]})
    print(out[-1]["start"],out[-1]["end"],out[-1]["text"],flush=True)
json.dump(out,open(os.path.join(HERE,"real","transcript.json"),"w",encoding="utf-8"),ensure_ascii=False)
