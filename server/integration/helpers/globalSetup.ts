import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { TEST_CONFIG } from "./config.js";
import { setServerInstance, stopServer } from "./serverManager.js";
import {
  StashTargetError,
  findDisallowedInstances,
  resolveStashTarget,
  stashHost,
} from "./stashTarget.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setup() {
  console.log("[Integration Tests] Starting global setup...");

  // The shell as it was before the root .env loads: the Stash guard reads
  // ALLOW_PROD_STASH only from here, never from the file.
  const shellEnv = { ...process.env };

  // Load the root .env if there is one (the Stash settings, LOG_LEVEL and
  // the like). dotenv keeps any variable the shell already set, even empty.
  const envPath = path.resolve(__dirname, "../../../.env");
  let fileEnv: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    fileEnv = dotenv.parse(fs.readFileSync(envPath));
  }

  // Refuses (StashTargetError) unless a test Stash is configured or
  // ALLOW_PROD_STASH=1 comes from the shell; see stashTarget.ts
  const target = resolveStashTarget(fileEnv, shellEnv);
  process.env.STASH_URL = target.primary.url;
  process.env.STASH_API_KEY = target.primary.apiKey;
  if (target.second) {
    process.env.STASH_SECOND_URL = target.second.url;
    process.env.STASH_SECOND_API_KEY = target.second.apiKey;
  } else {
    delete process.env.STASH_SECOND_URL;
    delete process.env.STASH_SECOND_API_KEY;
  }
  console.log(
    `[Integration Tests] Stash: ${target.source} (${stashHost(target.primary.url)}), second instance: ${target.second ? stashHost(target.second.url) : "none"}`
  );

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

  // The server runs in this process. Files it writes under CONFIG_DIR, such
  // as the playlist zips the download tests start, go to a temp directory
  // that teardown removes, never to a real config directory.
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-it-config-"));
  process.env.CONFIG_DIR = configDir;

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

  // Configure SQLite PRAGMAs (WAL mode, busy_timeout, etc.)
  // Must happen after migrations but before any application queries
  console.log("[Integration Tests] Configuring SQLite PRAGMAs...");
  const { configureSQLite } = await import("../../prisma/singleton.js");
  await configureSQLite();

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

  // Nothing has contacted a stored instance yet: the instance manager and
  // the sync scheduler start below. Refuse any enabled instance that is not
  // this run's Stash (a production row left from an earlier run, say).
  const { default: prisma } = await import("../../prisma/singleton.js");
  // Close what setup opened, so a refused run exits at once
  const refuse = async (message: string): Promise<never> => {
    await stopServer();
    fs.rmSync(configDir, { recursive: true, force: true });
    await prisma.$disconnect();
    throw new StashTargetError(message);
  };
  const allowedUrls = [target.primary.url];
  if (target.second) allowedUrls.push(target.second.url);
  const disallowed = findDisallowedInstances(
    await prisma.stashInstance.findMany({
      select: { id: true, url: true, enabled: true },
    }),
    allowedUrls
  );
  if (disallowed.length > 0) {
    const rows = disallowed.map((row) => `${row.id} (${row.url})`).join(", ");
    await refuse(
      `The test database has enabled Stash instances this run may not use: ${rows}. Start from an empty database with FRESH_DB=true npm run test:integration, or allow the production Stash with ALLOW_PROD_STASH=1 in the shell.`
    );
  }

  // Sync to Stash writes ratings and plays back to Stash
  const syncingUsers = await prisma.user.findMany({
    where: { syncToStash: true },
    select: { username: true },
  });
  if (syncingUsers.length > 0) {
    const usernames = syncingUsers.map((user) => user.username).join(", ");
    await refuse(
      `Users in the test database have Sync to Stash on, so a test could write to Stash: ${usernames}. Turn it off for them, or start from an empty database with FRESH_DB=true npm run test:integration.`
    );
  }

  // Initialize the StashInstanceManager - loads Stash config from DB
  // This MUST happen after testSetup creates the Stash instance
  console.log("[Integration Tests] Initializing Stash instance manager...");
  const { stashInstanceManager } =
    await import("../../services/StashInstanceManager.js");
  await stashInstanceManager.initialize();

  // Initialize the cache - starts sync scheduler
  // On subsequent runs, this will do an incremental sync (fast)
  // The initial full sync was done by testSetup on first run
  console.log(
    "[Integration Tests] Initializing cache (starting sync scheduler)..."
  );
  const { initializeCache } = await import("../../initializers/cache.js");
  await initializeCache();

  // Wait for any ongoing sync to complete before running tests
  console.log("[Integration Tests] Waiting for sync to complete...");
  const { stashSyncService } =
    await import("../../services/StashSyncService.js");
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

    fs.rmSync(configDir, { recursive: true, force: true });

    // Disconnect Prisma — suppress stderr noise from SQLite cleanup
    // Prisma emits benign connection-close warnings that pollute test output
    console.log("[Integration Tests] Disconnecting Prisma...");
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const teardownLog: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
      teardownLog.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      await prisma.$disconnect();
    } finally {
      process.stderr.write = originalStderrWrite;

      // Write captured stderr to log file for debugging
      if (teardownLog.length > 0) {
        const resultsDir = path.resolve(__dirname, "../results");
        fs.mkdirSync(resultsDir, { recursive: true });
        fs.writeFileSync(
          path.join(resultsDir, "teardown.log"),
          teardownLog.join("")
        );
      }
    }

    console.log("[Integration Tests] Global teardown complete");
  };
}

async function waitForServer(maxAttempts = 30, delayMs = 500): Promise<void> {
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
