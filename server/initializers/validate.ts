import { logger } from "../utils/logger.js";

/**
 * Validate startup configuration and log system information.
 *
 * Note: This no longer throws if STASH_URL/STASH_API_KEY are missing.
 * Stash configuration is now handled by StashInstance records in the database,
 * with environment variables used only for backward-compatible migration.
 */
export const validateStartup = () => {
  logger.info("=".repeat(60));
  logger.info("Peek Server Starting");
  logger.info("=".repeat(60));

  // Log system information
  logger.info("System Information", {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    processId: process.pid,
  });

  // Log environment configuration (informational only)
  logger.info("Environment Configuration", {
    STASH_URL: process.env.STASH_URL || "NOT SET",
    STASH_API_KEY_preview: process.env.STASH_API_KEY
      ? `${process.env.STASH_API_KEY.substring(0, 8)}...`
      : "NOT SET",
    CONFIG_DIR: process.env.CONFIG_DIR || "/app/data",
    LOG_LEVEL: process.env.LOG_LEVEL || "INFO",
  });

  // Validate STASH_URL format if provided (for migration)
  if (process.env.STASH_URL) {
    try {
      const url = new URL(process.env.STASH_URL);
      logger.info("Environment STASH_URL is valid", {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? "443" : "80"),
        pathname: url.pathname,
      });
    } catch (error) {
      logger.warn("Invalid STASH_URL format in environment variables", {
        url: process.env.STASH_URL,
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn(
        "STASH_URL should be a valid URL (e.g., http://stash:9999/graphql)"
      );
    }
  }

  // Note: We no longer throw here if env vars are missing.
  // The setup wizard or database config will handle Stash connection.
};
