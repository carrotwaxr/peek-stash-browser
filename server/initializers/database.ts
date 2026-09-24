import { logger } from "../utils/logger.js";
import { type MigrationResult, migrateDatabase } from "./migrations.js";

// This startup's migration run
let migrationRun: Promise<MigrationResult> | null = null;

/**
 * Resolves once this startup's migration run has finished or failed, and at
 * once when none has started.
 */
export const whenMigrationsSettled = async (): Promise<void> => {
  await migrationRun?.catch(() => undefined);
};

/**
 * Brings the database up to this version's schema. A failure stops the
 * server before it listens; `main()` logs the error's message.
 */
export const initializeDatabase = async (): Promise<void> => {
  logger.info("Initializing database");
  migrationRun = migrateDatabase();
  await migrationRun;
  logger.info("Database initialization complete");
};
