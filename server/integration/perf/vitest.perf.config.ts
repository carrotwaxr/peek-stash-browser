import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.perf.test.ts"],
    exclude: ["node_modules", "dist"],
    globalSetup: "./helpers/globalSetup.ts",
    testTimeout: 120_000, // 2 min per test (benchmarks need headroom)
    hookTimeout: 120_000,
    fileParallelism: false,
    root: path.resolve(__dirname, ".."),
    reporters: [
      "default",
      path.resolve(__dirname, "../helpers/summaryReporter.ts"),
    ],
  },
});
