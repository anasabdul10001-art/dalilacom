import { addDemoStore, removeDemoStore } from "../src/services/demoStore.service";

// npx tsx scripts/demoStore.ts [remove] — sample shops and 50 sample products for the online store
(async () => {
  const result = process.argv[2] === "remove" ? await removeDemoStore() : await addDemoStore();
  console.log(result);
  process.exit(0);
})();
