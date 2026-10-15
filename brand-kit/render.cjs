// Renders brand-kit/templates/*.html to brand-kit/social/*.png with Chrome (so the Arabic is shaped correctly).
// Run: node brand-kit/render.cjs
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const CH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const jobs = [
  ["cover.html", 1640, 624, "facebook-cover-1640x624.png"],
  ["post-1.html", 1080, 1080, "post-1-announcement.png"],
  ["post-2.html", 1080, 1080, "post-2-offer.png"],
  ["story.html", 1080, 1920, "story-1080x1920.png"],
];

(async () => {
  for (const [file, w, h, out] of jobs) {
    const tmp = path.join(__dirname, "social", "_raw-" + out);
    const url = "file:///" + path.join(__dirname, "templates", file).split(path.sep).join("/");
    // a bigger window than the picture: the page sits in its top-left corner and is cut out below at its exact size
    execFileSync(CH, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${w + 400},${h + 400}`, "--virtual-time-budget=6000", `--screenshot=${tmp}`, url], { stdio: "ignore" });
    // Chrome may place the page a few hundred pixels from the left edge of a wider window: find where it starts (the first
    // pixel of the top row that is not the white page background) and cut the picture out from there
    const { data, info } = await sharp(tmp).raw().toBuffer({ resolveWithObject: true });
    let left = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (2 * info.width + x) * info.channels;
      if (!(data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255)) { left = x; break; }
    }
    await sharp(tmp).extract({ left, top: 0, width: w, height: h }).toFile(path.join(__dirname, "social", out));
    fs.unlinkSync(tmp);
    console.log("ok", out);
  }
})();
