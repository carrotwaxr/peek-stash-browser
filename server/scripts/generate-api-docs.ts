// server/scripts/generate-api-docs.ts
import * as path from "path";
import { parseApiMounts } from "./lib/routeParser.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const API_FILE = path.join(SERVER_DIR, "initializers", "api.ts");

async function main() {
  console.log("Generating API documentation...");

  // Parse mount points from api.ts
  const mounts = parseApiMounts(API_FILE);
  console.log(`Found ${mounts.size} route mounts`);

  // For now, just output mount info
  for (const [routeVar, basePath] of mounts) {
    console.log(`  ${routeVar} -> ${basePath}`);
  }

  console.log("Done (skeleton only)");
}

main().catch(console.error);
