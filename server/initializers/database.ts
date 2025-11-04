import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger.js";

const execAsync = promisify(exec);

export const initializeDatabase = async () => {
  logger.info("Initializing database");

  try {
    // Generate Prisma client
    logger.info("Generating Prisma client");
    await execAsync("npx prisma generate");

    // Initialize database schema (SQLite uses db push)
    logger.info("Initializing database schema");
    await execAsync("npx prisma db push --accept-data-loss");

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
