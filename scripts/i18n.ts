import path from "path";
import { addLanguage, checkLanguages, formatReport } from "./i18n-lib";

const root = path.resolve(__dirname, "..");
const [command, ...args] = process.argv.slice(2);

async function main() {
  if (command === "add") {
    const [code, name, dir] = args;
    if (!code || !name || !dir) {
      console.error('Usage: npm run i18n:add -- <code> "<language name>" <rtl|ltr>\n  e.g.  npm run i18n:add -- de "Deutsch" ltr');
      process.exit(2);
    }
    const done = await addLanguage(root, { code, name, dir: dir as "rtl" | "ltr" });
    console.log(`Added "${name}" (${code}):\n  ${done.join("\n  ")}`);
    console.log(`\nNext: translate the English placeholders in those files, add the category names (see docs/I18N.md), then run: npm run i18n:check`);
    return;
  }
  if (command === "check") {
    const { text, failed } = formatReport(await checkLanguages(root));
    console.log(text);
    process.exit(failed ? 1 : 0);
  }
  console.error("Commands: add | check");
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
