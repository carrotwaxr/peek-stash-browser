import { stashCacheManager } from "../services/StashCacheManager.js";
import getStash from "../stash.js";
import { logger } from "../utils/logger.js";

/**
 * Test basic connectivity to Stash server before attempting full cache load
 */
const testStashConnectivity = async (): Promise<void> => {
  const startTime = Date.now();

  try {
    logger.info("Running connectivity test to Stash server...");

    // Get Stash instance (this validates env vars)
    const stash = getStash();

    // Try a minimal GraphQL query (configuration is lightweight and doesn't require scanning)
    logger.info("Executing test query to Stash GraphQL endpoint...");
    const result = await stash.configuration();

    const duration = Date.now() - startTime;

    if (result && result.configuration) {
      logger.info("✓ Stash connectivity test passed", {
        duration: `${duration}ms`,
        hasGeneral: !!result.configuration.general,
      });
    } else {
      logger.warn("Stash responded but configuration was empty", {
        duration: `${duration}ms`,
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error("✗ Stash connectivity test failed", {
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : String(error),
    });

    // Provide detailed troubleshooting based on error
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes("econnrefused")) {
        logger.error("Connection refused - Stash server is not reachable");
        logger.error("  → Verify Stash is running");
        logger.error("  → Check STASH_URL environment variable");
        logger.error("  → Test: curl -v " + process.env.STASH_URL);
      } else if (
        errorMessage.includes("enotfound") ||
        errorMessage.includes("getaddrinfo")
      ) {
        logger.error("DNS resolution failed - hostname not found");
        logger.error("  → Check STASH_URL hostname is correct");
        logger.error("  → Verify network/DNS configuration");
      } else if (errorMessage.includes("etimedout")) {
        logger.error("Connection timed out");
        logger.error("  → Stash server may be overloaded");
        logger.error("  → Check network connectivity");
        logger.error("  → Verify firewall rules");
      } else if (
        errorMessage.includes("certificate") ||
        errorMessage.includes("ssl") ||
        errorMessage.includes("tls")
      ) {
        logger.error("TLS/SSL certificate error");
        logger.error("  → Use http:// instead of https:// for local Stash");
        logger.error(
          "  → Or add NODE_TLS_REJECT_UNAUTHORIZED=0 to environment (not recommended for production)"
        );
      } else if (
        errorMessage.includes("401") ||
        errorMessage.includes("unauthorized")
      ) {
        logger.error("Authentication failed");
        logger.error("  → Verify STASH_API_KEY is correct");
        logger.error("  → Check Stash Settings > Security > API Key");
      } else if (
        errorMessage.includes("403") ||
        errorMessage.includes("forbidden")
      ) {
        logger.error("Access forbidden");
        logger.error("  → API key may not have required permissions");
      } else if (errorMessage.includes("404")) {
        logger.error("Endpoint not found");
        logger.error("  → Verify STASH_URL includes /graphql endpoint");
        logger.error("  → Example: http://stash:9999/graphql");
      } else {
        logger.error("Unexpected error during connectivity test");
        logger.error("  → Check logs above for detailed error information");
        logger.error("  → Verify Stash version compatibility");
      }
    }

    throw error;
  }
};

export const initializeCache = async () => {
  // Pre-flight: Test Stash connectivity before attempting cache load
  logger.info("Testing Stash connectivity...");
  try {
    await testStashConnectivity();
  } catch (error) {
    logger.error("Stash connectivity test failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    logger.warn("Cache initialization may fail - proceeding anyway...");
  }

  // Initialize Stash cache (fetch all entities from Stash)
  // This happens AFTER server starts listening, so setup endpoints work during cache load
  logger.info("=".repeat(60));
  logger.info("Initializing Stash cache...");
  logger.info("=".repeat(60));
  try {
    await stashCacheManager.initialize();
  } catch (error) {
    logger.error("=".repeat(60));
    logger.error("Failed to initialize Stash cache");
    logger.error("=".repeat(60));

    if (error instanceof Error) {
      logger.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    } else {
      logger.error("Unknown error type:", { error: String(error) });
    }

    logger.warn(
      "Server will continue without cache - performance may be degraded"
    );
    logger.warn(
      "Fix the issue and use the 'Refresh Cache' button in Server Settings"
    );
  }

  logger.info("=".repeat(60));
  logger.info("Peek Server Ready");
  logger.info("=".repeat(60));
};
