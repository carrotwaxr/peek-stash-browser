import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", "dist"],
    globalSetup: "./helpers/globalSetup.ts",
    testTimeout: 30000, // 30s for integration tests
    hookTimeout: 60000, // 60s for setup/teardown hooks
    fileParallelism: false, // Run sequentially
    root: path.resolve(__dirname),
  },
});
