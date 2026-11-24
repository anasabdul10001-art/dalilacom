// Makes 3 short Russian samples with the owner's cloned voice (same hashing as build2.cjs, so the clips are reused by the full build).
// Output: voice2-ru/<hash>.mp3 and samples/ru-sample-1..3.mp3.   node voice-sample-ru.cjs
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const KEY = fs.readFileSync("C:/Users/Tom/.elevenlabs-key.txt", "utf8").trim();
const VOICE_ID = process.env.VOICE_ID || "clS4TmlZF18Hafme6bgr"; // "Anas DALILACOM" (the owner's clone)
const VO = path.join(__dirname, "voice2-ru"), SAMPLES = path.join(__dirname, "samples"); fs.mkdirSync(VO, { recursive: true }); fs.mkdirSync(SAMPLES, { recursive: true });
const script = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "video-plans", "accounting", "script-ru.json"), "utf8"));
const hash = (t) => crypto.createHash("sha1").update(t).digest("hex").slice(0, 12);
const texts = [
  script.hook.voice,
  "Откройте Dalilacom, введите название своего города в строку поиска и выберите город из результатов.",
  "Если клиент оплатил только часть суммы, введите оплаченную сумму, а остаток запишется как его долг.",
];
(async () => {
  for (let i = 0; i < texts.length; i++) {
    const f = path.join(VO, hash(texts[i]) + ".mp3");
    if (!fs.existsSync(f)) {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ text: texts[i], model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.1, use_speaker_boost: true } }) });
      if (!r.ok) { console.error("TTS fail", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    fs.copyFileSync(f, path.join(SAMPLES, `ru-sample-${i + 1}.mp3`));
    console.log("ok", i + 1, fs.statSync(f).size, "bytes");
  }
})();
