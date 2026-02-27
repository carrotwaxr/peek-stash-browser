import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration for Peek Stash Browser.
 *
 * Local dev: tests run against the docker-compose dev environment (localhost:6969).
 * CI: tests start the server + client dev server and run against localhost:5173.
 *
 * Override the base URL with the E2E_BASE_URL environment variable.
 */

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? "50%" : undefined,

  reporter: isCI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL || (isCI ? "http://localhost:5173" : "http://localhost:6969"),
    actionTimeout: 10_000,
    navigationTimeout: 15_000,

    // Artifacts — only capture on failure
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Auth setup — runs first, saves login state for other tests
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },

    // Main test suite — Chromium only (start simple, expand later)
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  // In CI, start both the server and client dev server.
  // Locally, assume docker-compose is already running.
  ...(isCI
    ? {
        webServer: [
          {
            command:
              "cd server && npx prisma migrate deploy && npx tsx index.ts",
            url: "http://localhost:8000/api/health",
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
              DATABASE_URL: "file:./e2e-test.db",
              JWT_SECRET: "e2e-test-secret",
              NODE_ENV: "test",
            },
          },
          {
            command: "cd client && npm run dev",
            url: "http://localhost:5173",
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
              VITE_API_PROXY_TARGET: "http://localhost:8000",
            },
          },
        ],
      }
    : {}),
});
