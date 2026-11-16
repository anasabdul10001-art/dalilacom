"""Generates all script lines with the cloned voice (Chatterbox, local) into styleDemo/real/clone/.
Run: C:/Users/Tom/dal-clone-venv/Scripts/python.exe brand-kit/styleDemo/cloneBatch.py   (PYTHONUTF8=1)"""
import os, sys, torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
HERE=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.join(HERE,"real","clone"); os.makedirs(OUT,exist_ok=True)
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
only=sys.argv[1:] or list(LINES)
m=ChatterboxMultilingualTTS.from_pretrained(device="cpu")
for k in only:
    wav=m.generate(LINES[k],language_id="ar",audio_prompt_path=os.path.join(HERE,"real","ref.wav"),exaggeration=0.45,cfg_weight=0.4)
    ta.save(os.path.join(OUT,k+".wav"),wav,m.sr); print("saved",k,flush=True)
