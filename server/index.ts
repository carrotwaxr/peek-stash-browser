import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

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
import { setupAPI } from "./initializers/api.js";
import { initializeDatabase } from "./initializers/database.js";
import { validateStartup } from "./initializers/validate.js";
import { stashCacheManager } from "./services/StashCacheManager.js";
import { logger } from "./utils/logger.js";
import { pathMapper } from "./utils/pathMapping.js";
import { initializeCache } from "./initializers/cache.js";

const main = async () => {
  logger.info("Starting Peek server");

  validateStartup();

  // Run database migrations and seeding
  await initializeDatabase();

  // Initialize path mapper (loads from database or migrates from env vars)
  await pathMapper.initialize();

  setupAPI();

  initializeCache();
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
  stashCacheManager.cleanup();
  await prisma.$disconnect();
});

process.on("SIGINT", async () => {
  stashCacheManager.cleanup();
  await prisma.$disconnect();
});
