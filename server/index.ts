import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

const main = async () => {
  logger.info("Starting Peek server");

  validateStartup();

  // Run database migrations and seeding
  await initializeDatabase();

  // Initialize path mapper (loads from database or migrates from env vars)
  await pathMapper.initialize();

  setupAPI();
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

    // Create admin user directly
    logger.info("Creating admin user");
    await createAdminUser();

    logger.info("Database initialization complete");
  } catch (error) {
    logger.error("Database initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    // If it's a seeding error (admin already exists), continue anyway
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("Unique constraint") ||
      errorMessage.includes("admin user already exists")
    ) {
      logger.info("Admin user already exists, continuing");
    } else {
      logger.warn(
        "Database initialization failed, but continuing with server startup"
      );
    }
  }
};

const createAdminUser = async () => {
  try {
    const hashedPassword = await bcrypt.hash("admin", 10);

    await prisma.user.upsert({
      where: { username: "admin" },
      update: {},
      create: {
        username: "admin",
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    logger.info("Admin user created/updated successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Unique constraint")) {
      logger.info("Admin user already exists");
    } else {
      throw new Error(`Failed to create admin user: ${errorMessage}`);
    }
  }
};

const validateStartup = () => {
  logger.info("Environment check", {
    STASH_URL: process.env.STASH_URL,
    STASH_API_KEY_exists: !!process.env.STASH_API_KEY,
  });

  if (!process.env.STASH_URL || !process.env.STASH_API_KEY) {
    throw new Error(
      "STASH_URL and STASH_API_KEY must be set in environment variables"
    );
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
  await prisma.$disconnect();
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
});
