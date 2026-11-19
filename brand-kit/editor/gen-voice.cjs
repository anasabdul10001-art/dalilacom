// Generates the voice-over clips with the ElevenLabs API (voice: Ghaida). Key: file C:/Users/Tom/.elevenlabs-key.txt (only the key inside) or env ELEVEN_KEY.
// Usage: node gen-voice.cjs [hook|0|1|...]   -> voice/hook.mp3, voice/ch-00.mp3 ...  (existing files are kept; delete one to regenerate it)
const fs = require("fs"), path = require("path");
const KEY = (process.env.ELEVEN_KEY || (fs.existsSync("C:/Users/Tom/.elevenlabs-key.txt") ? fs.readFileSync("C:/Users/Tom/.elevenlabs-key.txt", "utf8") : "")).trim();
if (!KEY) { console.error("NO KEY: put the ElevenLabs API key in C:/Users/Tom/.elevenlabs-key.txt"); process.exit(1); }
const script = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "video-plans", "accounting", "script.json"), "utf8"));
const OUT = path.join(__dirname, "voice"); fs.mkdirSync(OUT, { recursive: true });
const H = { "xi-api-key": KEY, "Content-Type": "application/json" };
(async () => {
  let vid = process.env.VOICE_ID;
  if (!vid) {
    const r = await fetch("https://api.elevenlabs.io/v1/voices?show_legacy=true", { headers: H }); const j = await r.json();
    if (!r.ok) { console.error("voices:", r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
    const v = (j.voices || []).find((x) => /ghaida|غيداء/i.test(x.name));
    if (!v) { console.error("Ghaida not in 'My voices'. Found:", (j.voices || []).map((x) => x.name).join(", ")); process.exit(1); }
    vid = v.voice_id; console.log("voice", v.name, vid);
  }
  const items = [["hook", script.hook.voice], ...script.chapters.map((c) => [String(c.i).padStart(2, "0"), c.voice])];
  const only = process.argv.slice(2);
  for (const [id, text] of items) {
    if (only.length && !only.includes(id) && !only.includes(String(Number(id)))) continue;
    const f = path.join(OUT, (id === "hook" ? "hook" : "ch-" + id) + ".mp3");
    if (fs.existsSync(f)) { console.log("keep", path.basename(f)); continue; }
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`, { method: "POST", headers: H,
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true } }) });
    if (!r.ok) { console.error("TTS", id, r.status, (await r.text()).slice(0, 300)); continue; }
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log("ok", path.basename(f));
  }
})();
