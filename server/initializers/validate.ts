import { logger } from "../utils/logger.js";
import { parseTrustedAddresses } from "../utils/proxyAuthTrust.js";

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

  // Log environment configuration (informational only). The API key's
  // length only: no character of it reaches the log.
  const stashApiKey = process.env.STASH_API_KEY;
  const proxyAuthHeader = process.env.PROXY_AUTH_HEADER;
  const proxyAuthTrustedIps = process.env.PROXY_AUTH_TRUSTED_IPS?.trim();
  logger.info("Environment Configuration", {
    STASH_URL: process.env.STASH_URL || "NOT SET",
    STASH_API_KEY: stashApiKey
      ? `set (${stashApiKey.length} characters)`
      : "NOT SET",
    CONFIG_DIR: process.env.CONFIG_DIR || "/app/data",
    LOG_LEVEL: process.env.LOG_LEVEL || "INFO",
    PROXY_AUTH_HEADER: proxyAuthHeader || "NOT SET",
    PROXY_AUTH_TRUSTED_IPS: proxyAuthTrustedIps || "NOT SET",
  });

  // Proxy auth: without a list, any request carrying the header signs in;
  // an invalid list turns header sign-in off (auth.ts fails closed)
  if (proxyAuthHeader && !proxyAuthTrustedIps) {
    logger.warn(
      `PROXY_AUTH_HEADER is set without PROXY_AUTH_TRUSTED_IPS: any request carrying ${proxyAuthHeader} is signed in as the user it names. Set PROXY_AUTH_TRUSTED_IPS to your proxy's address as Peek sees it (the "Proxy auth: signed in from header" log line shows it as peer).`
    );
  }
  if (proxyAuthTrustedIps) {
    const { invalid } = parseTrustedAddresses(proxyAuthTrustedIps);
    if (invalid.length > 0) {
      logger.error(
        `PROXY_AUTH_TRUSTED_IPS has invalid entries: ${invalid.join(", ")}. Use IP addresses or CIDR ranges, comma-separated. Header sign-in is off until this is fixed.`
      );
    }
  }

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
