import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.{test,spec}.{js,ts}"],
    exclude: ["node_modules", "dist", "prisma/migrations"],
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
        "index.ts",
      ],
    },
  },
});
