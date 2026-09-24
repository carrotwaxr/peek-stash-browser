import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@peek/shared-types": path.resolve(__dirname, "../../shared/types"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", "dist"],
    globalSetup: "./helpers/globalSetup.ts",
    // Fails a file that sent Stash a mutation or a request the replay
    // cannot answer (replay runs only)
    setupFiles: ["./helpers/replayAudit.ts"],
    testTimeout: 30000, // 30s for integration tests
    hookTimeout: 60000, // 60s for setup/teardown hooks
    fileParallelism: false, // Run sequentially
    root: path.resolve(__dirname),
    reporters: [
      "default",
      path.resolve(__dirname, "./helpers/summaryReporter.ts"),
    ],
  },
});
