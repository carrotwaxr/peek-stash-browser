import { logger } from "../utils/logger";

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

  // Log environment configuration
  logger.info("Environment Configuration", {
    STASH_URL: process.env.STASH_URL,
    STASH_API_KEY_preview: process.env.STASH_API_KEY
      ? `${process.env.STASH_API_KEY.substring(0, 8)}...`
      : "NOT SET",
    CONFIG_DIR: process.env.CONFIG_DIR || "/app/data",
    LOG_LEVEL: process.env.LOG_LEVEL || "INFO",
  });

  if (!process.env.STASH_URL || !process.env.STASH_API_KEY) {
    throw new Error(
      "STASH_URL and STASH_API_KEY must be set in environment variables"
    );
  }

  // Validate URL format
  try {
    const url = new URL(process.env.STASH_URL);
    logger.info("Stash Connection Details", {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? "443" : "80"),
      pathname: url.pathname,
    });
  } catch (error) {
    logger.error("Invalid STASH_URL format", {
      url: process.env.STASH_URL,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("STASH_URL must be a valid URL (e.g., http://stash:9999)");
  }
};
