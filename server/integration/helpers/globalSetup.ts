import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  FIXTURE_API_KEY,
  FIXTURE_LIBRARY,
} from "../stash-replay/fixture/manifest.js";
import {
  parseReplayLibrary,
  secondLibraryOf,
} from "../stash-replay/library.js";
import { type ReplayServer, startStashReplay } from "../stash-replay/server.js";
import { TEST_CONFIG } from "./config.js";
import { findForeignKeyViolations } from "./foreignKeyCheck.js";
import { setServerInstance, stopServer } from "./serverManager.js";
import {
  type StashEndpoint,
  StashTargetError,
  findDisallowedInstances,
  resolveStashTarget,
  stashHost,
} from "./stashTarget.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPLAY_LIBRARY_FILE = path.resolve(
  __dirname,
  "../stash-replay/fixture/library.json"
);

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

  // Refuses (StashTargetError) unless STASH_REPLAY=1, a test Stash is
  // configured or ALLOW_PROD_STASH=1 comes from the shell; see stashTarget.ts
  const target = resolveStashTarget(fileEnv, shellEnv);
  let primary: StashEndpoint;
  let second: StashEndpoint | undefined;
  let replay: ReplayServer | undefined;
  if (target.mode === "replay") {
    // The test workers fork after this and inherit every variable set here:
    // STASH_REPLAY picks the replay's ids in fixtures/testEntities.ts and
    // the replay database in config.ts
    process.env.STASH_REPLAY = "1";
    const library = parseReplayLibrary(
      JSON.parse(fs.readFileSync(REPLAY_LIBRARY_FILE, "utf8")) as unknown,
      REPLAY_LIBRARY_FILE
    );
    const secondLibrary = secondLibraryOf(library);
    replay = await startStashReplay([
      { name: "test", library, apiKey: FIXTURE_API_KEY },
      {
        name: "second",
        library: secondLibrary,
        apiKey: `${FIXTURE_API_KEY}-second`,
      },
    ]);
    const [testStash, secondStash] = replay.libraries;
    if (testStash === undefined || secondStash === undefined) {
      await replay.close();
      throw new Error("The Stash replay did not start both libraries");
    }
    primary = testStash;
    second = secondStash;
    process.env.STASH_REPLAY_STATS_URL = replay.statsUrl;

    // Every replay run starts from an empty database, so its ids and sync
    // state come from the fixture alone
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(`${TEST_CONFIG.databasePath}${suffix}`, { force: true });
    }
    console.log(
      `[Integration Tests] Stash: replay (${library.entities.scene.length} scenes; second library ${secondLibrary.entities.scene.length} scenes)`
    );
  } else {
    primary = target.primary;
    second = target.second;
    delete process.env.STASH_REPLAY_STATS_URL;
    console.log(
      `[Integration Tests] Stash: ${target.source} (${stashHost(primary.url)}), second instance: ${second ? stashHost(second.url) : "none"}`
    );
  }
  process.env.STASH_URL = primary.url;
  process.env.STASH_API_KEY = primary.apiKey;
  if (second) {
    process.env.STASH_SECOND_URL = second.url;
    process.env.STASH_SECOND_API_KEY = second.apiKey;
  } else {
    delete process.env.STASH_SECOND_URL;
    delete process.env.STASH_SECOND_API_KEY;
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
  fs.mkdirSync(path.dirname(TEST_CONFIG.databasePath), { recursive: true });
  const { execSync } = await import("child_process");
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: TEST_CONFIG.databaseUrl },
    stdio: "inherit",
  });

  // WAL mode and the performance PRAGMAs, as the server does at startup
  // Must happen after migrations but before any application queries
  console.log("[Integration Tests] Configuring SQLite PRAGMAs...");
  const { default: prisma, configureSQLite } =
    await import("../../prisma/singleton.js");
  await configureSQLite();

  // Close what setup opened, so a refused run exits at once
  const abort = async (error: Error): Promise<never> => {
    await stopServer();
    fs.rmSync(configDir, { recursive: true, force: true });
    await prisma.$disconnect();
    await replay?.close();
    throw error;
  };
  const refuse = (message: string) => abort(new StashTargetError(message));

  // Import and start the server
  console.log(
    "[Integration Tests] Starting test server on port",
    TEST_CONFIG.serverPort
  );

  // Dynamic import to ensure env vars are set first
  const { setupAPI, startServer } = await import("../../initializers/api.js");
  const app = setupAPI();
  const server = startServer(app, TEST_CONFIG.serverPort);

  // A port another run holds must fail here: the health check below would
  // otherwise reach that run's server, and the tests its database
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.once("listening", () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    await abort(
      new Error(
        `The integration server cannot listen on port ${TEST_CONFIG.serverPort} (${error instanceof Error ? error.message : String(error)}). Another run or program holds it: set INTEGRATION_SERVER_PORT to a free port.`
      )
    );
  }
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
  const allowedUrls = [primary.url];
  if (second) allowedUrls.push(second.url);
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

  // A replay run must have synced the whole fixture: a request the replay
  // could not answer shows up here as missing rows
  if (replay) {
    const { syncScheduler } = await import("../../services/SyncScheduler.js");
    const instance = await prisma.stashInstance.findFirst({
      where: { url: primary.url },
      select: { id: true },
    });
    const where = { stashInstanceId: instance?.id ?? "", deletedAt: null };
    const stored = {
      scenes: await prisma.stashScene.count({ where }),
      performers: await prisma.stashPerformer.count({ where }),
      studios: await prisma.stashStudio.count({ where }),
      tags: await prisma.stashTag.count({ where }),
      groups: await prisma.stashGroup.count({ where }),
      galleries: await prisma.stashGallery.count({ where }),
      images: await prisma.stashImage.count({ where }),
    };
    const short = (Object.keys(stored) as Array<keyof typeof stored>)
      .filter((type) => stored[type] !== FIXTURE_LIBRARY[type])
      .map(
        (type) =>
          `Replay sync stored ${stored[type]} of ${FIXTURE_LIBRARY[type]} ${type}`
      );
    if (short.length > 0) {
      syncScheduler.stop();
      await abort(
        new Error(
          `${short.join("; ")}. Requests the Stash replay could not answer: ${JSON.stringify(replay.stats().unsupported)}`
        )
      );
    }
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

    // What the Stash replay was sent over the whole run
    const audit = replay?.stats();
    await replay?.close();

    fs.rmSync(configDir, { recursive: true, force: true });

    // Rows whose parent is gone, left by any sync, cleanup, instance
    // deletion or migration the run went through. A replay run starts from
    // an empty database, so any is this run's; a live run's test.db may carry
    // older ones, so it only logs them.
    const violations = await findForeignKeyViolations(prisma);
    const violationList = violations
      .map((row) => `${row.table} -> ${row.parent}: ${row.n}`)
      .join(", ");
    if (violations.length > 0 && !replay) {
      console.warn(
        `[Integration Tests] Foreign key violations in the test database: ${violationList}`
      );
    }

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

    // replayAudit.ts names the file; this catches what no file owned (the
    // startup sync, say). vitest reports a teardown error as a startup error
    // but sets exit code 1 only when process.exitCode is still unset.
    const failures: string[] = [];
    if (audit && (audit.mutations.length > 0 || audit.unsupported.length > 0)) {
      failures.push(
        `The Stash replay refused requests during the run. Mutations: ${JSON.stringify(audit.mutations)}. Requests it cannot answer: ${JSON.stringify(audit.unsupported)}`
      );
    }
    if (replay && violations.length > 0) {
      failures.push(
        `Foreign key violations after the run (table -> missing parent: rows): ${violationList}. A code path or migration the run went through left rows without their parent.`
      );
    }
    if (failures.length > 0) {
      process.exitCode = 1;
      throw new Error(failures.join(" "));
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
