import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { PrismaClient } from "@prisma/client";

const execAsync = promisify(exec);
const prisma = new PrismaClient();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (handles both dev and compiled scenarios)
// In dev: server/ -> ../
// In compiled: server/dist/ -> ../../
const envPath =
  __filename.includes("/dist/") || __filename.includes("\\dist\\")
    ? path.resolve(__dirname, "../../.env") // From server/dist/ to project root
    : path.resolve(__dirname, "../.env"); // From server/ to project root

dotenv.config({ path: envPath });
import { setupAPI } from "./api.js";
import { logger } from "./utils/logger.js";
import { pathMapper } from "./utils/pathMapping.js";
import { stashCacheManager } from "./services/StashCacheManager.js";
import getStash from "./stash.js";

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

      if (errorMessage.includes('econnrefused')) {
        logger.error("Connection refused - Stash server is not reachable");
        logger.error("  → Verify Stash is running");
        logger.error("  → Check STASH_URL environment variable");
        logger.error("  → Test: curl -v " + process.env.STASH_URL);
      } else if (errorMessage.includes('enotfound') || errorMessage.includes('getaddrinfo')) {
        logger.error("DNS resolution failed - hostname not found");
        logger.error("  → Check STASH_URL hostname is correct");
        logger.error("  → Verify network/DNS configuration");
      } else if (errorMessage.includes('etimedout')) {
        logger.error("Connection timed out");
        logger.error("  → Stash server may be overloaded");
        logger.error("  → Check network connectivity");
        logger.error("  → Verify firewall rules");
      } else if (errorMessage.includes('certificate') || errorMessage.includes('ssl') || errorMessage.includes('tls')) {
        logger.error("TLS/SSL certificate error");
        logger.error("  → Use http:// instead of https:// for local Stash");
        logger.error("  → Or add NODE_TLS_REJECT_UNAUTHORIZED=0 to environment (not recommended for production)");
      } else if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
        logger.error("Authentication failed");
        logger.error("  → Verify STASH_API_KEY is correct");
        logger.error("  → Check Stash Settings > Security > API Key");
      } else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
        logger.error("Access forbidden");
        logger.error("  → API key may not have required permissions");
      } else if (errorMessage.includes('404')) {
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

const main = async () => {
  logger.info("Starting Peek server");

  validateStartup();

  // Run database migrations and seeding
  await initializeDatabase();

  // Initialize path mapper (loads from database or migrates from env vars)
  await pathMapper.initialize();

  // Start API server immediately so /api/setup/status is available
  setupAPI();
  logger.info("Server started - accepting connections during cache load");

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

    logger.warn("Server will continue without cache - performance may be degraded");
    logger.warn("Fix the issue and use the 'Refresh Cache' button in Server Settings");
  }

  logger.info("=".repeat(60));
  logger.info("Peek Server Ready");
  logger.info("=".repeat(60));
};

const initializeDatabase = async () => {
  logger.info("Initializing database");

  try {
    // Generate Prisma client
    logger.info("Generating Prisma client");
    await execAsync("npx prisma generate");

    // Initialize database schema (SQLite uses db push)
    logger.info("Initializing database schema");
    await execAsync("npx prisma db push --accept-data-loss");

    logger.info("Database initialization complete");
  } catch (error) {
    logger.error("Database initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    logger.warn(
      "Database initialization failed, but continuing with server startup"
    );
  }
};

const validateStartup = () => {
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
      : 'NOT SET',
    CONFIG_DIR: process.env.CONFIG_DIR || '/app/data',
    LOG_LEVEL: process.env.LOG_LEVEL || 'INFO',
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
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
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

main().catch(async (e) => {
  logger.error("Fatal error", {
    error: e instanceof Error ? e.message : String(e),
  });
  await prisma.$disconnect();
  process.exit(1);
});

// Cleanup on exit
process.on("SIGTERM", async () => {
  stashCacheManager.cleanup();
  await prisma.$disconnect();
});

process.on("SIGINT", async () => {
  stashCacheManager.cleanup();
  await prisma.$disconnect();
});
