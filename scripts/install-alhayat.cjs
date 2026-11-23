// Installs the dependencies of the Al-Hayat newspaper demo (folder alhayat/). A failure here only warns: the main site must still build.
const { spawnSync } = require("child_process");
const path = require("path");
const dir = path.join(__dirname, "..", "alhayat");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const r = spawnSync(npm, ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) console.warn("[alhayat] dependency install failed; the demo subdomain will answer 503 until it is fixed.");
