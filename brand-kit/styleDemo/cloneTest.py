"""Voice-clone test (Chatterbox multilingual, local, MIT). Reads the owner's reference clip and says one scripted line.
Run with the isolated env: C:/Users/Tom/dal-clone-venv/Scripts/python.exe brand-kit/styleDemo/cloneTest.py"""
import os, sys, torch, torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
HERE=os.path.dirname(os.path.abspath(__file__))
text=sys.argv[1] if len(sys.argv)>1 else "سجّل دخلك ومصاريفك، والصافي بيطلع لحاله."
out=sys.argv[2] if len(sys.argv)>2 else os.path.join(HERE,"real","clone-test.wav")
m=ChatterboxMultilingualTTS.from_pretrained(device="cpu")
wav=m.generate(text,language_id="ar",audio_prompt_path=os.path.join(HERE,"real","ref.wav"),exaggeration=0.45,cfg_weight=0.4)
ta.save(out,wav,m.sr); print("saved",out)
