import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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
  validateStartup();

  const app = setupAPI();
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

main();
