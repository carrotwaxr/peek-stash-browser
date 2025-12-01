/**
 * Schema Catchup for Legacy Databases
 *
 * This module handles database schema migration for users upgrading from older versions
 * of Peek that used `prisma db push` instead of proper migrations.
 *
 * HISTORICAL CONTEXT:
 * Prior to v2.0.1, the database was managed with `prisma db push` which doesn't create
 * migration history. When we switched to proper migrations with a baseline, users
 * upgrading from older versions had incomplete schemas because the baseline was marked
 * as "applied" without actually running.
 *
 * This module creates any missing tables/columns so that:
 * 1. Users from v1.x can upgrade directly to the latest version
 * 2. Users with broken v2.0.x databases (baseline marked but tables missing) are fixed
 *
 * Schema evolution history:
 * - v1.0.0: User, WatchHistory, Playlist, PlaylistItem, PathMapping
 * - v1.3.0: + CustomTheme, SceneRating, PerformerRating, StudioRating, TagRating,
 *           GalleryRating, GroupRating, UserContentRestriction
 * - v1.4.0: + UserPerformerStats, UserStudioStats, UserTagStats
 * - v1.5.0: + DataMigration, ImageRating
 * - v1.6.0: + UserHiddenEntity, User.hideConfirmationDisabled
 * - v2.0.0: + StashInstance (PathMapping removed from schema but table kept)
 * - v2.1.0: + UserCarousel
 *
 * NOTE: This file can be removed once all users have upgraded past v2.1.x and we're
 * confident no one is running ancient versions. The catchup logic is idempotent and
 * safe to run on already-current databases (it just no-ops).
 */

import { exec } from "child_process";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { promisify } from "util";
import { logger } from "../utils/logger.js";

const execAsync = promisify(exec);

/**
 * Execute a SQLite query and return the result
 */
async function sqliteQuery(dbPath: string, sql: string): Promise<string> {
  const tmpFile = path.join(process.env.TMP_DIR || "/tmp", `sql_${Date.now()}.sql`);
  try {
    writeFileSync(tmpFile, sql);
    const { stdout } = await execAsync(`sqlite3 "${dbPath}" < "${tmpFile}" 2>/dev/null || true`);
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
 * Check if a table exists in the SQLite database
 */
async function tableExists(dbPath: string, tableName: string): Promise<boolean> {
  const result = await sqliteQuery(
    dbPath,
    `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${tableName}';`
  );
  return result === "1";
}

/**
 * Check if a column exists in a table
 */
async function columnExists(dbPath: string, tableName: string, columnName: string): Promise<boolean> {
  const result = await sqliteQuery(
    dbPath,
    `SELECT COUNT(*) FROM pragma_table_info('${tableName}') WHERE name='${columnName}';`
  );
  return parseInt(result, 10) > 0;
}

/**
 * Execute SQL statements, logging any errors but not failing
 */
async function executeSql(dbPath: string, sql: string, description: string): Promise<boolean> {
  try {
    await sqliteQuery(dbPath, sql);
    return true;
  } catch (error) {
    logger.warn(`Schema catchup SQL warning for ${description}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Create missing tables and columns for databases from older versions.
 * Each section creates tables/columns that were added in a specific version.
 * Uses CREATE TABLE IF NOT EXISTS so it's safe to run multiple times.
 */
async function createMissingTablesAndColumns(dbPath: string): Promise<void> {
  // Tables added in v1.4.0
  if (!(await tableExists(dbPath, "UserPerformerStats"))) {
    logger.info("Creating missing table: UserPerformerStats (v1.4.0)");
    await executeSql(
      dbPath,
      `
CREATE TABLE IF NOT EXISTS "UserPerformerStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "performerId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" DATETIME,
    "lastOAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "UserPerformerStats_userId_idx" ON "UserPerformerStats"("userId");
CREATE INDEX IF NOT EXISTS "UserPerformerStats_performerId_idx" ON "UserPerformerStats"("performerId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserPerformerStats_userId_performerId_key" ON "UserPerformerStats"("userId", "performerId");
    `,
      "UserPerformerStats"
    );
  }

  if (!(await tableExists(dbPath, "UserStudioStats"))) {
    logger.info("Creating missing table: UserStudioStats (v1.4.0)");
    await executeSql(
      dbPath,
      `
CREATE TABLE IF NOT EXISTS "UserStudioStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "studioId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "UserStudioStats_userId_idx" ON "UserStudioStats"("userId");
CREATE INDEX IF NOT EXISTS "UserStudioStats_studioId_idx" ON "UserStudioStats"("studioId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserStudioStats_userId_studioId_key" ON "UserStudioStats"("userId", "studioId");
    `,
      "UserStudioStats"
    );
  }

  if (!(await tableExists(dbPath, "UserTagStats"))) {
    logger.info("Creating missing table: UserTagStats (v1.4.0)");
    await executeSql(
      dbPath,
      `
CREATE TABLE IF NOT EXISTS "UserTagStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tagId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "UserTagStats_userId_idx" ON "UserTagStats"("userId");
CREATE INDEX IF NOT EXISTS "UserTagStats_tagId_idx" ON "UserTagStats"("tagId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserTagStats_userId_tagId_key" ON "UserTagStats"("userId", "tagId");
    `,
      "UserTagStats"
    );
  }

  // Tables added in v1.5.0
  if (!(await tableExists(dbPath, "DataMigration"))) {
    logger.info("Creating missing table: DataMigration (v1.5.0)");
    await executeSql(
      dbPath,
      `
CREATE TABLE IF NOT EXISTS "DataMigration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataMigration_name_key" ON "DataMigration"("name");
    `,
      "DataMigration"
    );
  }

  if (!(await tableExists(dbPath, "ImageRating"))) {
    logger.info("Creating missing table: ImageRating (v1.5.0)");
    await executeSql(
      dbPath,
      `
CREATE TABLE IF NOT EXISTS "ImageRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "imageId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ImageRating_userId_idx" ON "ImageRating"("userId");
CREATE INDEX IF NOT EXISTS "ImageRating_imageId_idx" ON "ImageRating"("imageId");
CREATE INDEX IF NOT EXISTS "ImageRating_favorite_idx" ON "ImageRating"("favorite");
CREATE INDEX IF NOT EXISTS "ImageRating_rating_idx" ON "ImageRating"("rating");
CREATE UNIQUE INDEX IF NOT EXISTS "ImageRating_userId_imageId_key" ON "ImageRating"("userId", "imageId");
    `,
      "ImageRating"
    );
  }

  // Tables/columns added in v1.6.0
  if (!(await tableExists(dbPath, "UserHiddenEntity"))) {
    logger.info("Creating missing table: UserHiddenEntity (v1.6.0)");
    await executeSql(
      dbPath,
      `
CREATE TABLE IF NOT EXISTS "UserHiddenEntity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "hiddenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserHiddenEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UserHiddenEntity_userId_idx" ON "UserHiddenEntity"("userId");
CREATE INDEX IF NOT EXISTS "UserHiddenEntity_entityType_idx" ON "UserHiddenEntity"("entityType");
CREATE INDEX IF NOT EXISTS "UserHiddenEntity_entityId_idx" ON "UserHiddenEntity"("entityId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserHiddenEntity_userId_entityType_entityId_key" ON "UserHiddenEntity"("userId", "entityType", "entityId");
    `,
      "UserHiddenEntity"
    );
  }

  if (!(await columnExists(dbPath, "User", "hideConfirmationDisabled"))) {
    logger.info("Adding missing column: User.hideConfirmationDisabled (v1.6.0)");
    await executeSql(
      dbPath,
      `ALTER TABLE "User" ADD COLUMN "hideConfirmationDisabled" BOOLEAN NOT NULL DEFAULT false;`,
      "User.hideConfirmationDisabled"
    );
  }

  // Tables added in v2.0.0
  if (!(await tableExists(dbPath, "StashInstance"))) {
    logger.info("Creating missing table: StashInstance (v2.0.0)");
    await executeSql(
      dbPath,
      `
CREATE TABLE IF NOT EXISTS "StashInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "url" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
    `,
      "StashInstance"
    );
  }

  // Tables added in v2.1.0
  if (!(await tableExists(dbPath, "UserCarousel"))) {
    logger.info("Creating missing table: UserCarousel (v2.1.0)");
    await executeSql(
      dbPath,
      `
CREATE TABLE IF NOT EXISTS "UserCarousel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Film',
    "rules" JSONB NOT NULL,
    "sort" TEXT NOT NULL DEFAULT 'random',
    "direction" TEXT NOT NULL DEFAULT 'DESC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserCarousel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UserCarousel_userId_idx" ON "UserCarousel"("userId");
    `,
      "UserCarousel"
    );
  }
}

/**
 * Run schema catchup for legacy databases.
 *
 * This function handles three scenarios:
 * 1. Old databases without migration history (v1.x) - creates missing tables, marks migrations as applied
 * 2. Databases with broken migration state (baseline marked but tables missing) - creates missing tables
 * 3. Current databases - no-op, everything already exists
 *
 * @param dbPath - Path to the SQLite database file
 */
export async function runSchemaCatchup(dbPath: string): Promise<void> {
  if (!existsSync(dbPath)) {
    // Fresh install, nothing to catch up
    return;
  }

  const hasMigrationTable = await tableExists(dbPath, "_prisma_migrations");
  const hasUserTable = await tableExists(dbPath, "User");

  if (!hasMigrationTable && hasUserTable) {
    // Scenario: Old database created with db push (v1.x users)
    logger.info("Detected legacy database without migration history - running schema catchup");

    await createMissingTablesAndColumns(dbPath);

    // Mark migrations as applied since we just created all the tables
    logger.info("Marking baseline migration as applied");
    await execAsync("npx prisma migrate resolve --applied 0_baseline");

    logger.info("Marking add_user_carousel migration as applied");
    await execAsync("npx prisma migrate resolve --applied 20251126202944_add_user_carousel");

    logger.info("Schema catchup complete for legacy database");
  } else if (hasMigrationTable) {
    // Scenario: Database has migration history but might be missing tables
    // This handles broken v2.0.x databases and upgrades from v2.0.x to v2.1.x
    logger.info("Checking for missing tables in existing database");

    // Check if UserCarousel migration was already applied
    const userCarouselMigrationApplied = await sqliteQuery(
      dbPath,
      `SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20251126202944_add_user_carousel';`
    );

    await createMissingTablesAndColumns(dbPath);

    // If UserCarousel migration wasn't applied but we just created the table, mark it as applied
    if (userCarouselMigrationApplied !== "1" && (await tableExists(dbPath, "UserCarousel"))) {
      logger.info("Marking add_user_carousel migration as applied (table already exists)");
      await execAsync("npx prisma migrate resolve --applied 20251126202944_add_user_carousel");
    }

    logger.info("Schema catchup check complete");
  }
}
