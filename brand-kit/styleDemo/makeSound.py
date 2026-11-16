"""Sound effects for the style demo, synthesized (no samples, no copyright). Mixes whooshes, pops, ticks and a chime, then muxes into the video.
Run: python brand-kit/styleDemo/makeSound.py"""
import numpy as np, subprocess, wave, os, shutil
import imageio_ffmpeg
SR=44100
HERE=os.path.dirname(os.path.abspath(__file__))
import sys
VID=os.path.abspath(sys.argv[1]) if len(sys.argv)>1 else os.path.join(HERE,"..","social","style-demo","dalilacom-style-demo.mp4")
rng=np.random.default_rng(7)
def put(t,x,g=1.0):
    i=int(t*SR); mix[i:i+len(x)]+=x[:len(mix)-i]*g
def lp(x,k):  # simple moving-average low-pass
    return np.convolve(x,np.ones(k)/k,mode="same")
def whoosh(d=0.55):
    n=int(SR*d); t=np.linspace(0,1,n)
    noise=rng.standard_normal(n)
    hi=noise-lp(noise,40); lo=lp(noise,12)
    mixn=lo*(1-t)+hi*t              # brightens as it rises
    env=np.sin(np.pi*t)**2.2
    return mixn*env*0.5
def pop(f0=700,f1=260,d=0.16):
    n=int(SR*d); t=np.arange(n)/SR
    f=f1+(f0-f1)*np.exp(-t*40)
    ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-t*28)*0.7
def tick(d=0.04):
    n=int(SR*d); t=np.arange(n)/SR
    return np.sin(2*np.pi*1800*t)*np.exp(-t*140)*0.5
def chime(f=880,d=1.2):
    n=int(SR*d); t=np.arange(n)/SR
    return (np.sin(2*np.pi*f*t)+0.5*np.sin(2*np.pi*f*1.5*t)+0.25*np.sin(2*np.pi*f*2*t))*np.exp(-t*3.2)*0.35
import json
TM=json.load(open(os.path.join(HERE,"timing.json")))
T=TM["T"]; SB=TM["steps"]; DUR=TM["dur"]
mix=np.zeros(int(SR*(DUR+1)))
C=TM["cue"]
for s in T[1:7]: put(s-0.05,whoosh(),0.9)
for k in (1,2): put(T[3]+SB[k]-0.05,whoosh(0.4),0.7)
for k in range(3): put(T[3]+SB[k]+0.15,pop(900,300),0.8)
for i,c in enumerate(C["s2"]["notes"]): put(T[1]+c+0.25,pop(520,200),0.8)
put(T[2]+C["s3"]["icon"]+0.3,pop(800,180,0.3),1.0)
put(T[4]+C["s5"]["panel"]+0.2,pop(600,220),0.8)
for c in C["s5"]["rows"]: put(T[4]+c+0.2,pop(900,300),0.7)
for k in range(18): put(T[4]+C["s5"]["chart"]+k*(0.9/18),tick(),0.35)
put(T[4]+C["s5"]["chart"]+0.9,chime(1046,0.9),0.5)
for k in range(30): put(T[5]+C["s6"]["fill"]+k*(1.8/30),tick(),0.3)
put(T[5]+C["s6"]["fill"]+1.8,chime(1175,1.0),0.55)
put(T[6]+C["s7"]["pill"],pop(900,300),0.8); put(T[6]+C["s7"]["small"],pop(700,250),0.9); put(T[6]+C["s7"]["cta"],pop(700,250),0.7)
put(T[6]+C["s7"]["cta"]+0.1,chime(784,1.6),0.5); put(T[6]+C["s7"]["cta"]+0.3,chime(1046,1.6),0.45)
# the voice-over (effects sit under it)
fx=mix[:int(SR*DUR)]*0.5
ffm=imageio_ffmpeg.get_ffmpeg_exe()
voice=np.zeros(int(SR*(DUR+1)))
for k,t0 in TM["voice"].items():
    raw=subprocess.run([ffm,"-i",os.path.join(HERE,TM["files"][k]),"-ar",str(SR),"-ac","1","-f","s16le","-"],capture_output=True,check=True).stdout
    x=np.frombuffer(raw,dtype=np.int16).astype(np.float64)/32768
    i=int(t0*SR); voice[i:i+len(x)]+=x[:len(voice)-i]
voice=voice[:int(SR*DUR)]
voice=voice/max(1e-6,np.abs(voice).max())*0.9
mix=fx+voice
# fade out the tail, normalise
mix[-SR:]*=np.linspace(1,0,SR)
mix=mix/max(1e-6,np.abs(mix).max())*0.9
wav=os.path.join(HERE,"fx.wav")
with wave.open(wav,"wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype(np.int16).tobytes())
ff=imageio_ffmpeg.get_ffmpeg_exe()
tmp=VID+".tmp.mp4"
subprocess.run([ff,"-y","-i",VID,"-i",wav,"-c:v","copy","-c:a","aac","-b:a","192k","-shortest",tmp],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
shutil.move(tmp,VID); os.remove(wav)
print("done",VID)
