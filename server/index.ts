import dotenv from "dotenv";
dotenv.config();
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
