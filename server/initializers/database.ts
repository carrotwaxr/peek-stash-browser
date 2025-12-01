import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger.js";
import { runSchemaCatchup } from "./schemaCatchup.js";

const execAsync = promisify(exec);

export const initializeDatabase = async () => {
  logger.info("Initializing database");

  const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "/app/data/peek-stash-browser.db";

  try {
    // Generate Prisma client
    logger.info("Generating Prisma client");
    await execAsync("npx prisma generate");

    // Handle legacy databases that need schema catchup
    // See schemaCatchup.ts for details on why this is needed
    await runSchemaCatchup(dbPath);

    // Run migrations (safe for both new and existing databases)
    logger.info("Running database migrations");
    await execAsync("npx prisma migrate deploy");

    logger.info("Database initialization complete");
  } catch (error) {
    logger.error("Database initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Re-throw to prevent server from starting with broken database
    throw error;
  }
};
