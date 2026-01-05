import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
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
    },
  },
});
