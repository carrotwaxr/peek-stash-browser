import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@peek/shared-types": path.resolve(__dirname, "../shared/types"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // Session tokens need a secret; jwtSecret.test.ts deletes it per test.
    // Unknown list filter input is a 400 here, so client drift fails tests
    env: {
      JWT_SECRET: "vitest-only-secret-0123456789abcdef0123456789",
      PEEK_FILTER_POLICY: "reject",
    },
    include: ["**/*.{test,spec}.{js,ts}"],
    exclude: [
      "node_modules",
      "dist",
      "prisma/migrations",
      "**/*.integration.test.ts",
      "integration/**",
    ],
    // Run test files sequentially to avoid database isolation issues
    // Tests using the real database (not mocks) can conflict when run in parallel
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "prisma/migrations/**",
        "**/*.config.ts",
        "**/*.spec.{js,ts}",
        "**/*.test.{js,ts}",
        "**/*.integration.test.ts",
        "integration/**",
        "index.ts",
      ],
      thresholds: {
        statements: 87,
        branches: 89,
        functions: 94,
        lines: 87,
      },
    },
  },
});
