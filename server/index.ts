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

const main = async () => {
  console.log("🚀 Starting Stash Player Backend...");

  validateStartup();

  // Run database migrations and seeding
  await initializeDatabase();

  const app = setupAPI();
};

const initializeDatabase = async () => {
  console.log("💾 Initializing database...");

  try {
    // Generate Prisma client
    console.log("📦 Generating Prisma client...");
    await execAsync("npx prisma generate");

    // Initialize database schema (SQLite uses db push)
    console.log("🔄 Initializing database schema...");
    await execAsync("npx prisma db push --accept-data-loss");

    // Create admin user directly
    console.log("🌱 Creating admin user...");
    await createAdminUser();

    console.log("✅ Database initialization complete!");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);

    // If it's a seeding error (admin already exists), continue anyway
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("Unique constraint") ||
      errorMessage.includes("admin user already exists")
    ) {
      console.log("ℹ️  Admin user already exists, continuing...");
    } else {
      console.log(
        "⚠️  Database initialization failed, but continuing with server startup..."
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

    console.log("✅ Admin user created/updated successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Unique constraint")) {
      console.log("ℹ️  Admin user already exists");
    } else {
      throw new Error(`Failed to create admin user: ${errorMessage}`);
    }
  }
};

const validateStartup = () => {
  console.log("Environment check:");
  console.log("STASH_URL:", process.env.STASH_URL);
  console.log("STASH_API_KEY exists:", !!process.env.STASH_API_KEY);

  if (!process.env.STASH_URL || !process.env.STASH_API_KEY) {
    throw new Error(
      "STASH_URL and STASH_API_KEY must be set in environment variables"
    );
  }
};

main().catch(async (e) => {
  console.error("Fatal error:", e);
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
