import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { userStatsService } from "./UserStatsService.js";

/**
 * DataMigrationService
 *
 * Handles one-time data migrations that need to run on server startup.
 * Each migration runs once and is tracked in the DataMigration table.
 *
 * Migrations are idempotent and safe to re-run if needed.
 */

interface Migration {
  name: string;
  description: string;
  run: () => Promise<void>;
}

// Define all migrations here
const migrations: Migration[] = [
  {
    name: "001_rebuild_user_stats",
    description:
      "Rebuild all user stats from watch history (backfill for v1.4.x)",
    run: async () => {
      logger.info("[Migration 001] Starting user stats rebuild for all users");

      // Get all users
      const users = await prisma.user.findMany({
        select: { id: true, username: true },
      });

      logger.info("[Migration 001] Found users to migrate", {
        count: users.length,
      });

      // Rebuild stats for each user
      for (const user of users) {
        try {
          logger.info("[Migration 001] Rebuilding stats", {
            userId: user.id,
            username: user.username,
          });

          await userStatsService.rebuildAllStatsForUser(user.id);

          logger.info("[Migration 001] Successfully rebuilt stats", {
            userId: user.id,
            username: user.username,
          });
        } catch (error) {
          logger.error("[Migration 001] Failed to rebuild stats for user", {
            userId: user.id,
            username: user.username,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          // Continue with other users even if one fails
        }
      }

      logger.info("[Migration 001] Completed user stats rebuild for all users");
    },
  },
  {
    name: "002_rebuild_stats_multi_instance",
    description:
      "Rebuild all stats after multi-instance instanceId migration to correctly separate per-instance stats",
    run: async () => {
      const startTime = Date.now();
      logger.info(
        "[Migration 002] Starting full stats rebuild after multi-instance stats migration"
      );

      try {
        await userStatsService.rebuildAllStats();
        const duration = Date.now() - startTime;
        logger.info(
          "[Migration 002] Stats rebuild completed successfully",
          { durationMs: duration }
        );
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(
          "[Migration 002] Stats rebuild failed - will retry on next startup",
          {
            durationMs: duration,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          }
        );
        throw error;
      }
    },
  },
];

class DataMigrationService {
  /**
   * Run all pending migrations
   * Called once on server startup
   */
  async runPendingMigrations(): Promise<void> {
    try {
      logger.info("[DataMigration] Checking for pending migrations");

      // Get list of already-applied migrations
      const appliedMigrations = await prisma.dataMigration.findMany({
        select: { name: true },
      });
      const appliedMigrationNames = new Set(
        appliedMigrations.map((m) => m.name)
      );

      // Filter to only pending migrations
      const pendingMigrations = migrations.filter(
        (m) => !appliedMigrationNames.has(m.name)
      );

      if (pendingMigrations.length === 0) {
        logger.info("[DataMigration] No pending migrations");
        return;
      }

      logger.info("[DataMigration] Found pending migrations", {
        count: pendingMigrations.length,
        migrations: pendingMigrations.map((m) => m.name),
      });

      // Run each pending migration
      for (const migration of pendingMigrations) {
        logger.info("[DataMigration] Running migration", {
          name: migration.name,
          description: migration.description,
        });

        const startTime = Date.now();

        try {
          await migration.run();

          // Mark migration as applied
          await prisma.dataMigration.create({
            data: { name: migration.name },
          });

          const duration = Date.now() - startTime;
          logger.info("[DataMigration] Migration completed", {
            name: migration.name,
            durationMs: duration,
          });
        } catch (error) {
          logger.error("[DataMigration] Migration failed", {
            name: migration.name,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          // Don't mark as applied if it failed
          // Will retry on next server start
          throw error; // Propagate error to prevent server startup
        }
      }

      logger.info("[DataMigration] All pending migrations completed");
    } catch (error) {
      logger.error("[DataMigration] Fatal error running migrations", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Get list of applied migrations (for admin UI)
   */
  async getAppliedMigrations() {
    return await prisma.dataMigration.findMany({
      orderBy: { appliedAt: "asc" },
    });
  }
}

export const dataMigrationService = new DataMigrationService();
export default dataMigrationService;
