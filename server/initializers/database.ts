import { exec } from "child_process";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { promisify } from "util";
import { logger } from "../utils/logger.js";
import { runSchemaCatchup } from "./schemaCatchup.js";

const execAsync = promisify(exec);

// Track whether migrations were applied during startup
let migrationsApplied = false;

/**
 * Check if database migrations were applied during this startup.
 * Used to determine if a full sync should be triggered.
 */
export const wereMigrationsApplied = (): boolean => migrationsApplied;

/**
 * Execute a SQLite query and return the result
 */
async function sqliteQuery(dbPath: string, sql: string): Promise<string> {
  const tmpFile = path.join(
    process.env.TMP_DIR || "/tmp",
    `sql_${Date.now()}.sql`
  );
  try {
    writeFileSync(tmpFile, sql);
    const { stdout } = await execAsync(
      `sqlite3 "${dbPath}" < "${tmpFile}" 2>/dev/null || true`
    );
    return stdout.trim();
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Count applied migrations in the database.
 * Returns 0 if database doesn't exist or table doesn't exist.
 */
const countAppliedMigrations = async (dbPath: string): Promise<number> => {
  if (!existsSync(dbPath)) {
    return 0;
  }

  try {
    // Check if _prisma_migrations table exists
    const tableCheck = await sqliteQuery(
      dbPath,
      "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_prisma_migrations';"
    );

    if (tableCheck !== "1") {
      return 0;
    }

    // Count applied migrations (finished_at is not null)
    const result = await sqliteQuery(
      dbPath,
      "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"
    );

    return parseInt(result, 10) || 0;
  } catch (error) {
    logger.warn("Could not count migrations, assuming fresh database", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
};

export const initializeDatabase = async (): Promise<void> => {
  logger.info("Initializing database");

  const dbPath =
    process.env.DATABASE_URL?.replace("file:", "") ||
    "/app/data/peek-stash-browser.db";

  try {
    // Generate Prisma client
    logger.info("Generating Prisma client");
    await execAsync("npx prisma generate");

    // Handle legacy databases that need schema catchup
    // See schemaCatchup.ts for details on why this is needed
    await runSchemaCatchup(dbPath);

    // Count migrations before running migrate deploy
    // This is best-effort - if it fails, we'll just do normal startup sync
    let migrationCountBefore = 0;
    try {
      migrationCountBefore = await countAppliedMigrations(dbPath);
    } catch (error) {
      logger.warn("Could not count migrations before deploy", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Run migrations (safe for both new and existing databases)
    logger.info("Running database migrations");
    await execAsync("npx prisma migrate deploy");

    // Count migrations after to detect if any were applied
    // If this fails, fall back to incremental sync (don't set migrationsApplied)
    try {
      const migrationCountAfter = await countAppliedMigrations(dbPath);
      migrationsApplied = migrationCountAfter > migrationCountBefore;

      if (migrationsApplied) {
        logger.info("Database migrations applied", {
          before: migrationCountBefore,
          after: migrationCountAfter,
          newMigrations: migrationCountAfter - migrationCountBefore,
        });
      }
    } catch (error) {
      logger.warn(
        "Could not count migrations after deploy, falling back to incremental sync",
        { error: error instanceof Error ? error.message : String(error) }
      );
    }

    logger.info("Database initialization complete");
  } catch (error) {
    logger.error("Database initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Re-throw to prevent server from starting with broken database
    throw error;
  }
};
