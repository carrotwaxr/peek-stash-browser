import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * Result of checking Stash instance configuration status
 */
export interface StashConfigStatus {
  /** Whether setup is needed (no instances configured) */
  needsSetup: boolean;
  /** Where the config came from: 'database', 'environment' (migrated), or null (none) */
  source: "database" | "environment" | null;
  /** Number of configured instances */
  instanceCount: number;
}

/**
 * Check for Stash instance configuration and migrate from env vars if needed.
 *
 * Migration logic:
 * 1. Check database for existing StashInstance records
 * 2. If none exist but env vars are set, auto-create a StashInstance from env vars
 * 3. Return status indicating where config came from
 *
 * This ensures backward compatibility for existing users who configured
 * Stash via environment variables.
 */
export const initializeStashInstances = async (): Promise<StashConfigStatus> => {
  logger.info("Checking Stash instance configuration...");

  // Check database for existing instances
  const existingInstances = await prisma.stashInstance.count();

  if (existingInstances > 0) {
    logger.info(`Found ${existingInstances} Stash instance(s) in database`);
    return {
      needsSetup: false,
      source: "database",
      instanceCount: existingInstances,
    };
  }

  // No database instances - check for environment variables
  const envUrl = process.env.STASH_URL;
  const envApiKey = process.env.STASH_API_KEY;

  if (envUrl && envApiKey) {
    logger.info(
      "No Stash instances in database, but found environment variables - migrating..."
    );

    try {
      // Validate URL format
      const url = new URL(envUrl);
      logger.info("Environment variable STASH_URL is valid", {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? "443" : "80"),
      });

      // Create StashInstance from environment variables
      const instance = await prisma.stashInstance.create({
        data: {
          name: "Default",
          url: envUrl,
          apiKey: envApiKey,
          enabled: true,
          priority: 0,
        },
      });

      logger.info(
        "Successfully migrated Stash configuration from environment variables to database",
        {
          instanceId: instance.id,
          instanceName: instance.name,
        }
      );

      return {
        needsSetup: false,
        source: "environment",
        instanceCount: 1,
      };
    } catch (error) {
      logger.error("Failed to migrate Stash configuration from environment variables", {
        error: error instanceof Error ? error.message : String(error),
      });

      // If migration fails, fall through to needsSetup
      if (error instanceof TypeError && error.message.includes("URL")) {
        logger.error(
          "STASH_URL is not a valid URL format. Expected: http://hostname:port/graphql"
        );
      }
    }
  }

  // No configuration found
  logger.warn("No Stash instance configured - setup wizard will be required");

  if (!envUrl && !envApiKey) {
    logger.info(
      "Tip: You can set STASH_URL and STASH_API_KEY environment variables, or use the setup wizard"
    );
  } else if (!envUrl) {
    logger.warn("STASH_API_KEY is set but STASH_URL is missing");
  } else if (!envApiKey) {
    logger.warn("STASH_URL is set but STASH_API_KEY is missing");
  }

  return {
    needsSetup: true,
    source: null,
    instanceCount: 0,
  };
};
