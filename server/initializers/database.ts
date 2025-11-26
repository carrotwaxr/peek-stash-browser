import { exec } from "child_process";
import { existsSync } from "fs";
import { promisify } from "util";
import { logger } from "../utils/logger.js";

const execAsync = promisify(exec);

export const initializeDatabase = async () => {
  logger.info("Initializing database");

  const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "/app/data/peek-stash-browser.db";

  try {
    // Generate Prisma client
    logger.info("Generating Prisma client");
    await execAsync("npx prisma generate");

    // Check if this is an existing database that needs baselining
    if (existsSync(dbPath)) {
      try {
        // Check if _prisma_migrations table exists
        const { stdout } = await execAsync(
          `sqlite3 "${dbPath}" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations';" 2>/dev/null || echo ""`
        );

        if (!stdout.trim()) {
          // Check if User table exists (existing db push database)
          const { stdout: userCheck } = await execAsync(
            `sqlite3 "${dbPath}" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='User';" 2>/dev/null || echo ""`
          );

          if (userCheck.trim() === "1") {
            logger.info("Detected existing database without migration history - baselining...");
            await execAsync("npx prisma migrate resolve --applied 0_baseline");
            logger.info("Baseline migration marked as applied");
          }
        }
      } catch (checkError) {
        // If sqlite3 check fails, continue with normal migration flow
        logger.warn("Could not check database state, proceeding with migrations", {
          error: checkError instanceof Error ? checkError.message : String(checkError),
        });
      }
    }

    // Run migrations (safe for both new and existing databases)
    logger.info("Running database migrations");
    await execAsync("npx prisma migrate deploy");

    logger.info("Database initialization complete");
  } catch (error) {
    logger.error("Database initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    logger.warn(
      "Database initialization failed, but continuing with server startup"
    );
  }
};
