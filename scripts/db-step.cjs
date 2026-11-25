// Runs one database step of the build (migrate, seed, backfill).
// TEMPORARY (2026-11-25): the free database hours ran out until the next month, and the build could not publish code that
// needs no database change. While that lasts, a step that fails ONLY because the database cannot be reached is skipped,
// as long as there is no migration newer than the last one that was applied. Remove this file (and call the commands
// directly again in package.json) once the database is back.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const LAST_APPLIED = "20261202100000_auctions"; // the newest migration of the last successful publish (2522cfc)
const UNREACHABLE = /P1001|Can't reach database server|compute time quota/i;

const command = process.argv.slice(2).join(" ");
const run = spawnSync(command, { shell: true, encoding: "utf8" });
process.stdout.write(run.stdout || "");
process.stderr.write(run.stderr || "");
if (run.status === 0) process.exit(0);

const newest = fs.readdirSync(path.join(__dirname, "..", "prisma", "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort().pop();
if (UNREACHABLE.test(`${run.stdout}${run.stderr}`) && newest === LAST_APPLIED) {
  console.warn(`SKIPPED (database unreachable, no new migration): ${command}`);
  process.exit(0);
}
process.exit(run.status || 1);
