import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 45000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
