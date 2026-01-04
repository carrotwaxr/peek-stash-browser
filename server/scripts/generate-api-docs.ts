// server/scripts/generate-api-docs.ts
import * as fs from "fs";
import * as path from "path";
import { parseRouteFile, parseApiMounts, type RouteGroup } from "./lib/routeParser.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const ROUTES_DIR = path.join(SERVER_DIR, "routes");
const API_FILE = path.join(SERVER_DIR, "initializers", "api.ts");
const OUTPUT_FILE = path.resolve(SERVER_DIR, "..", "docs", "development", "api-reference.md");

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
