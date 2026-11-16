"""Timing for the all-Shami video: scene starts follow the real voice lines (see wordtimes_"+SET+".json for word times).
Writes timing.json / timing.js. Run: python brand-kit/styleDemo/makeTimingV3.py"""
import os, json, sys
SET=sys.argv[1] if len(sys.argv)>1 else "shami"
HERE=os.path.dirname(os.path.abspath(__file__))
E="real/eleven/"
FILES={"shami":{"v1":E+"v2-line1-ghaida.mp3","v2":E+"v2-line2-ghaida.mp3","v3":E+"v3-line3-owner-shami.mp3","v4":E+"v3-line4-owner-shami.mp3","v5":E+"v3-line5-owner-shami.mp3","v6":E+"v3-line6-owner-shami.mp3"},
 "fusha":{"v1":E+"f-line1-ghaida-fusha.mp3","v2":E+"f-line2-ghaida-fusha.mp3","v3":E+"v2-line3-owner.mp3","v4":E+"v2-line4-owner.mp3","v5":E+"v2-line5-owner.mp3","v6":E+"v2-line6-owner.mp3"}}[SET]
W=json.load(open(os.path.join(HERE,"wordtimes_"+SET+".json"),encoding="utf-8"))
d={k:W[k]["dur"] for k in FILES}
T=[0.0]
def add(x): T.append(round(T[-1]+x,2))
add(max(3.4,0.5+d["v1"]+0.9))            # 1 hook
add(0.6+d["v2"]+0.65)                    # 2 problem
add(0.5+d["v3"]+0.9)                     # 3 solution
add(0.5+d["v4"]+0.6)                     # 4 three steps
add(2.6 if SET=="shami" else 3.2)        # 5 net (voice v5 starts inside it)
add(3.0)                                 # 6 per currency (rest of v5)
add(0.9+d["v6"]+1.5)                     # 7 offer
voice={"v1":0.5,"v2":T[1]+0.6,"v3":T[2]+0.5,"v4":T[3]+0.5,"v5":T[4]+0.5,"v6":T[6]+0.9}
steps=[0.0,1.3,2.3,round(0.5+d["v4"]+0.6,2)]
CUES={"shami":{
 "s2":{"lines":[2.3,3.8,5.16,6.5],"notes":[3.28,4.78,6.26],"cap2":8.0},
 "s3":{"words":[0.45,1.05,2.35],"icon":1.0},
 "s5":{"panel":0.6,"words":[1.6,2.0],"rows":[1.0,1.5],"chart":1.7},
 "s6":{"words":[0.2,0.6],"ring":0.1,"fill":0.3,"tag":1.5},
 "s7":{"logo":0.3,"l1":0.5,"pill":0.9,"small":3.46,"cta":4.9}},
 "fusha":{
 "s2":{"lines":[2.8,4.3,5.98,7.68],"notes":[3.88,5.7,7.3],"cap2":9.18},
 "s3":{"words":[0.45,1.18,2.54],"icon":1.1},
 "s5":{"panel":0.6,"words":[2.06,2.54],"rows":[1.1,1.7],"chart":2.0},
 "s6":{"words":[0.2,0.6],"ring":0.1,"fill":0.3,"tag":1.5},
 "s7":{"logo":0.3,"l1":0.5,"pill":0.9,"small":3.98,"cta":5.56}}}
cue=CUES[SET]
timing={"T":T,"steps":steps,"voice":{k:round(v,2) for k,v in voice.items()},"files":FILES,"dur":T[-1],"cue":cue}
json.dump(timing,open(os.path.join(HERE,"timing_"+SET+".json"),"w"))
open(os.path.join(HERE,"timing_"+SET+".js"),"w").write("window.TIMING="+json.dumps(timing)+";")
print(json.dumps({"T":T,"dur":T[-1],"voice":timing["voice"]},indent=1))
