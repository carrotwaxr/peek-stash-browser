import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TEST_CONFIG } from "./config.js";
import { setServerInstance, stopServer } from "./serverManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setup() {
  console.log("[Integration Tests] Starting global setup...");

  // Load environment from project root
  const envPath = path.resolve(__dirname, "../../../.env");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Missing .env file at ${envPath}. Integration tests require STASH_URL and STASH_API_KEY.`
    );
  }
  dotenv.config({ path: envPath });

  // Validate required env vars
  if (!process.env.STASH_URL || !process.env.STASH_API_KEY) {
    throw new Error(
      "Integration tests require STASH_URL and STASH_API_KEY in .env"
    );
  }

  // Check if testEntities.ts exists
  const testEntitiesPath = path.resolve(
    __dirname,
    "../fixtures/testEntities.ts"
  );
  if (!fs.existsSync(testEntitiesPath)) {
    throw new Error(
      `Missing testEntities.ts. Copy testEntities.example.ts to testEntities.ts and fill in entity IDs from your Stash.`
    );
  }

  // Set test database URL
  process.env.DATABASE_URL = TEST_CONFIG.databaseUrl;

  // Handle fresh DB mode
  if (
    process.env.FRESH_DB === "true" &&
    fs.existsSync(TEST_CONFIG.databasePath)
  ) {
    console.log(
      "[Integration Tests] FRESH_DB=true, deleting existing test database..."
    );
    fs.unlinkSync(TEST_CONFIG.databasePath);
  }

  // Run prisma migrations (applies migration files to ensure schema matches)
  console.log("[Integration Tests] Running database migrations...");
  const { execSync } = await import("child_process");
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: TEST_CONFIG.databaseUrl },
    stdio: "inherit",
  });

  // Import and start the server
  console.log(
    "[Integration Tests] Starting test server on port",
    TEST_CONFIG.serverPort
  );

  // Dynamic import to ensure env vars are set first
  const { setupAPI, startServer } = await import("../../initializers/api.js");
  const app = setupAPI();
  const server = startServer(app, TEST_CONFIG.serverPort);

  setServerInstance(server);

  // Wait for server to be ready
  await waitForServer();

  // Ensure admin user exists and Stash is connected
  // This creates the admin user and Stash instance in the DB if needed
  const { ensureTestSetup } = await import("./testSetup.js");
  await ensureTestSetup();

  // Initialize the StashInstanceManager - loads Stash config from DB
  // This MUST happen after testSetup creates the Stash instance
  console.log("[Integration Tests] Initializing Stash instance manager...");
  const { stashInstanceManager } = await import(
    "../../services/StashInstanceManager.js"
  );
  await stashInstanceManager.initialize();

  // Initialize the cache - starts sync scheduler
  // On subsequent runs, this will do an incremental sync (fast)
  // The initial full sync was done by testSetup on first run
  console.log("[Integration Tests] Initializing cache (starting sync scheduler)...");
  const { initializeCache } = await import("../../initializers/cache.js");
  await initializeCache();

  // Wait for any ongoing sync to complete before running tests
  console.log("[Integration Tests] Waiting for sync to complete...");
  const { stashSyncService } = await import("../../services/StashSyncService.js");
  let attempts = 0;
  while (stashSyncService.isSyncing() && attempts < 120) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;
    if (attempts % 10 === 0) {
      console.log(`[Integration Tests] Still syncing... (attempt ${attempts})`);
    }
  }
  if (stashSyncService.isSyncing()) {
    throw new Error("Sync did not complete within timeout");
  }

  console.log("[Integration Tests] Global setup complete");

  // Return teardown function for Vitest
  return async () => {
    console.log("[Integration Tests] Starting global teardown...");

    // Stop the sync scheduler first to prevent new sync operations
    console.log("[Integration Tests] Stopping sync scheduler...");
    const { syncScheduler } = await import("../../services/SyncScheduler.js");
    syncScheduler.stop();

    // Close the HTTP server
    await stopServer();

    // Disconnect Prisma to close database connections
    console.log("[Integration Tests] Disconnecting Prisma...");
    const { default: prisma } = await import("../../prisma/singleton.js");
    await prisma.$disconnect();

    console.log("[Integration Tests] Global teardown complete");
  };
}

async function waitForServer(
  maxAttempts = 30,
  delayMs = 500
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);
      if (response.ok) {
        console.log("[Integration Tests] Server is ready");
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Server failed to start within timeout");
}

export default setup;
