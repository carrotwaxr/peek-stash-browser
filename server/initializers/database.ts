import { logger } from "../utils/logger.js";
import { type MigrationResult, migrateDatabase } from "./migrations.js";
import { runSchemaCatchup } from "./schemaCatchup.js";

// This startup's migration run
let migrationRun: Promise<MigrationResult> | null = null;

/**
 * Resolves once this startup's migration run has finished or failed, and at
 * once when none has started.
 */
export const whenMigrationsSettled = async (): Promise<void> => {
  await migrationRun?.catch(() => undefined);
};

/** The database file, for the legacy schema check that reads it directly. */
function databaseFilePath(): string {
  const url = process.env.DATABASE_URL;
  return url === undefined || url === ""
    ? "/app/data/peek-stash-browser.db"
    : url.replace("file:", "");
}

export const initializeDatabase = async (): Promise<void> => {
  logger.info("Initializing database");

  try {
    // Handle legacy databases that need schema catchup
    // See schemaCatchup.ts for details on why this is needed
    await runSchemaCatchup(databaseFilePath());

    migrationRun = migrateDatabase();
    await migrationRun;

    logger.info("Database initialization complete");
  } catch (error) {
    logger.error("Database initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Re-throw to prevent server from starting with broken database
    throw error;
  }
};
