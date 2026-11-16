"""Generates the voice lines (Microsoft Edge neural voice, Syrian Arabic) into styleDemo/voice/. Only public marketing text is sent.
Run: python -I brand-kit/styleDemo/makeVoice.py"""
import asyncio, os, edge_tts
HERE=os.path.dirname(os.path.abspath(__file__))
VOICE="ar-SY-LaithNeural"
LINES={
 "v1":"كم ربحت هالشهر؟",
 "v2":"الدخل بدفتر، والمصاريف بورقة، والباقي بالذاكرة.",
 "v3":"دليلكم بيجمعها بمكان واحد.",
 "v4a":"سجّل دخلك.",
 "v4b":"سجّل مصاريفك.",
 "v4c":"وصوّر الفاتورة، وراجعها وأكّدها بنفسك.",
 "v5":"وبيرتّبلك الأرقام بملخّص الشهر.",
 "v6":"وبالنهاية بيطلعلك الصافي، وكل عملة بصافيها لحالها.",
 "v7":"ثلاث شهور مجاناً، لفترة محدودة، وبدون بطاقة دفع. حمّل دليلكم من متجر غوغل بلاي.",
}
async def main():
    for k,t in LINES.items():
        await edge_tts.Communicate(t,VOICE,rate="+4%").save(os.path.join(HERE,"voice",k+".mp3"))
asyncio.run(main())

# ---- timing: the scenes follow the length of the voice lines ----
import json
from moviepy import AudioFileClip
d={k:AudioFileClip(os.path.join(HERE,"voice",k+".mp3")).duration for k in LINES}
T=[0.0]; V={}
def add(length): T.append(round(T[-1]+length,2))
V["v1"]=0.5;           add(max(3.4,0.5+d["v1"]+0.7))
V["v2"]=T[1]+0.7;      add(max(5.0,0.7+d["v2"]+0.6))
V["v3"]=T[2]+0.5;      add(max(4.0,0.5+d["v3"]+0.9))
V["v3"]=T[2]+0.5
steps=[0.0]; cur=0.0
for k,key in enumerate(["v4a","v4b","v4c"]):
    off=0.55 if k==0 else 0.3
    V[key]=T[3]+cur+off
    cur+=max(2.6,off+d[key]+0.6)
    steps.append(round(cur,2))
add(cur+0.2)
V["v5"]=T[4]+0.8;      add(max(5.4,0.8+d["v5"]+0.6))
V["v6"]=T[5]+0.6;      add(max(5.6,0.6+d["v6"]+0.7))
V["v7"]=T[6]+1.3;      add(max(5.8,1.3+d["v7"]+1.0))
timing={"T":T,"steps":steps,"voice":{k:round(v,2) for k,v in V.items()},"dur":T[-1],"len":{k:round(v,2) for k,v in d.items()}}
json.dump(timing,open(os.path.join(HERE,"timing.json"),"w"))
open(os.path.join(HERE,"timing.js"),"w").write("window.TIMING="+json.dumps(timing)+";")
print(json.dumps(timing,indent=1))
