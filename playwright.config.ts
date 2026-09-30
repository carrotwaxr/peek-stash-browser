import { defineConfig, devices } from "@playwright/test";
import {
  REPLAY_API_KEY,
  baseURL,
  dbFile,
  devStack,
  ports,
  replayStatsUrl,
  runDir,
} from "./e2e/support/env";

/**
 * Playwright E2E test configuration for Peek Stash Browser.
 *
 * Hermetic by default, locally and in CI: Playwright starts the Stash replay
 * (serving item 83's second library), its own server and Vite client beside
 * the dev stack, on a throwaway database. Their ports come from the checkout's
 * path, so two worktrees can run the suite at once. Global setup creates the
 * run admin and the replay's instance, and waits for the sync.
 *
 * Dev-stack mode, for manual runs on real data: set E2E_BASE_URL (for example
 * http://localhost:6969). Nothing is started; .env.e2e names a bootstrap admin
 * of that stack, which creates a throwaway run admin and deletes it afterwards.
 * image-smoke.yml uses this mode against the production image.
 *
 * Ports and the run directory are in e2e/support/env.ts.
 */

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  failOnFlakyTests: isCI,
  workers: isCI ? "50%" : undefined,

  reporter: isCI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,

    // Artifacts: only captured on failure
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Auth setup: runs first, saves login state for other tests
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },

    // Main test suite: Chromium only (start simple, expand later)
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  // Hermetic mode starts the Stash replay (item 83), then the server on a
  // fresh database, which it migrates itself, then the client. stdout is
  // shown so the log names the ports, the database file and the sync.
  webServer: devStack
    ? undefined
    : [
        {
          // tsx straight from server/node_modules, not npx: Playwright's stop
          // signal then reaches the replay rather than an npm wrapper
          command: `cd server && node_modules/.bin/tsx integration/stash-replay/cli.ts --port ${ports.stash} --api-key ${REPLAY_API_KEY} --library second`,
          url: replayStatsUrl,
          reuseExistingServer: false,
          timeout: 30_000,
          stdout: "pipe",
        },
        {
          command:
            "node e2e/support/reset-db.mjs && cd server && npx tsx index.ts",
          url: `http://localhost:${ports.server}/api/health`,
          reuseExistingServer: false,
          timeout: 120_000, // slow disks without /dev/shm
          stdout: "pipe",
          env: {
            E2E_RUN_DIR: runDir,
            DATABASE_URL: `file:${dbFile}`,
            CONFIG_DIR: runDir,
            PEEK_SERVER_PORT: String(ports.server),
            JWT_SECRET: "e2e-test-secret",
            STASH_URL: "", // dotenv never overrides a set variable, so the root .env's Stash is not used
            STASH_API_KEY: "",
          },
        },
        {
          command: `cd client && npx vite --port ${ports.client} --strictPort`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 60_000,
          stdout: "pipe",
          env: { VITE_API_PROXY_TARGET: `http://localhost:${ports.server}` },
        },
      ],
});
