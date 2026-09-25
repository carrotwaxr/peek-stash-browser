import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { setupAPI, startServer } from "./initializers/api.js";
import { initializeCache } from "./initializers/cache.js";
import { initializeDatabase } from "./initializers/database.js";
import {
  closeResources,
  installProcessHandlers,
  isShuttingDown,
  registerHttpServer,
} from "./initializers/processHandlers.js";
import { hashLegacyRecoveryKeys } from "./initializers/recoveryKeys.js";
import { initializeStashInstances } from "./initializers/stashInstance.js";
import { validateStartup } from "./initializers/validate.js";
import { scheduleDownloadCleanup } from "./jobs/downloadCleanup.js";
import { configureSQLite } from "./prisma/singleton.js";
import { dataMigrationService } from "./services/DataMigrationService.js";
import { stashInstanceManager } from "./services/StashInstanceManager.js";
import { getJwtSecret } from "./utils/jwtSecret.js";
import { logger } from "./utils/logger.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (handles both dev and compiled scenarios)
// In dev: server/ -> ../
// In compiled: server/dist/ -> ../../
const envPath =
  __filename.includes("/dist/") || __filename.includes("\\dist\\")
    ? path.resolve(__dirname, "../../.env") // From server/dist/ to project root
    : path.resolve(__dirname, "../.env"); // From server/ to project root

dotenv.config({ path: envPath });

// Shut down cleanly on SIGTERM and SIGINT; log (and, for an uncaught
// exception, exit on) errors nothing else caught
installProcessHandlers();

const main = async () => {
  logger.info("Starting Peek server");

  validateStartup();

  // Resolve the session secret now: a missing or unwritable one stops the
  // server here rather than on the first login
  getJwtSecret();

  // Run database migrations and seeding
  await initializeDatabase();
  // A stop signal during the migrations: the shutdown takes it from here
  if (isShuttingDown()) return;

  // WAL mode and the performance PRAGMAs; logs what SQLite reports
  await configureSQLite();

  // Recovery keys from before 3.3.7 were stored in plaintext
  await hashLegacyRecoveryKeys();

  // Initialize Stash instances (migrate from env vars if needed)
  const stashConfig = await initializeStashInstances();

  // Initialize the StashInstanceManager with database config
  await stashInstanceManager.initialize();

  // Start API server (needed for setup wizard if no Stash configured)
  const app = setupAPI();
  // PEEK_SERVER_PORT is for development and tests (E2E runs beside the dev
  // stack); the Docker image's nginx forwards to 8000
  registerHttpServer(
    startServer(app, Number(process.env.PEEK_SERVER_PORT) || 8000)
  );

  // Schedule background jobs
  scheduleDownloadCleanup();

  // Only initialize cache if we have Stash instances configured
  if (stashConfig.needsSetup) {
    logger.warn("=".repeat(60));
    logger.warn("No Stash instance configured - setup wizard required");
    logger.warn("Access the web UI to complete setup");
    logger.warn("=".repeat(60));
  } else {
    // Initialize cache FIRST (needed for data migrations that access scene data)
    await initializeCache();
    // A stop signal during the startup sync: no data migration starts
    if (isShuttingDown()) return;

    // Run one-time data migrations AFTER cache is ready (e.g., backfill stats for v1.4.x)
    await dataMigrationService.runPendingMigrations();
  }
};

main().catch(async (e: unknown) => {
  // The message as it is, not escaped into JSON: a refusal such as
  // LegacyDatabaseError's tells the admin what to do
  logger.error(`Fatal error: ${e instanceof Error ? e.message : String(e)}`);
  await closeResources();
  process.exit(1);
});
