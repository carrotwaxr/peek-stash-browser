import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { setupAPI, startServer } from "./initializers/api.js";
import { initializeCache } from "./initializers/cache.js";
import { initializeDatabase } from "./initializers/database.js";
import { initializeStashInstances } from "./initializers/stashInstance.js";
import { validateStartup } from "./initializers/validate.js";
import { scheduleDownloadCleanup } from "./jobs/downloadCleanup.js";
import { dataMigrationService } from "./services/DataMigrationService.js";
import { stashInstanceManager } from "./services/StashInstanceManager.js";
import { stashSyncService } from "./services/StashSyncService.js";
import { logger } from "./utils/logger.js";

const prisma = new PrismaClient();

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

const main = async () => {
  logger.info("Starting Peek server");

  validateStartup();

  // Run database migrations and seeding
  await initializeDatabase();

  // Initialize Stash instances (migrate from env vars if needed)
  const stashConfig = await initializeStashInstances();

  // Initialize the StashInstanceManager with database config
  await stashInstanceManager.initialize();

  // Start API server (needed for setup wizard if no Stash configured)
  const app = setupAPI();
  startServer(app);

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

    // Run one-time data migrations AFTER cache is ready (e.g., backfill stats for v1.4.x)
    await dataMigrationService.runPendingMigrations();
  }
};

main().catch(async (e) => {
  logger.error("Fatal error", {
    error: e instanceof Error ? e.message : String(e),
  });
  await prisma.$disconnect();
  process.exit(1);
});

// Cleanup on exit
process.on("SIGTERM", async () => {
  stashSyncService.abort();
  await prisma.$disconnect();
});

process.on("SIGINT", async () => {
  stashSyncService.abort();
  await prisma.$disconnect();
});
