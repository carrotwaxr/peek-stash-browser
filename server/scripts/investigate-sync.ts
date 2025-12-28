/**
 * Investigation script - query Stash directly to understand the sync issue
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const STASH_URL = process.env.STASH_URL || "http://10.0.0.4:6969/graphql";
const STASH_API_KEY = process.env.STASH_API_KEY;

async function graphqlQuery(query: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (STASH_API_KEY) headers["ApiKey"] = STASH_API_KEY;

  const response = await fetch(STASH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  console.log("=== Stash Sync Investigation ===\n");

  // 1. Get total scene count
  const totalResult = await graphqlQuery(`
    query { findScenes(filter: { per_page: 1 }) { count } }
  `);
  console.log(`Total scenes in Stash: ${totalResult.data?.findScenes?.count}`);

  // 2. Get 5 most recently updated scenes
  console.log("\n--- 5 Most Recently Updated Scenes ---");
  const recentResult = await graphqlQuery(`
    query {
      findScenes(filter: { per_page: 5, sort: "updated_at", direction: DESC }) {
        scenes { id title updated_at created_at }
      }
    }
  `);

  for (const scene of recentResult.data?.findScenes?.scenes || []) {
    console.log(`  ID: ${scene.id}`);
    console.log(`  Title: ${scene.title || "(no title)"}`);
    console.log(`  updated_at: ${scene.updated_at}`);
    console.log(`  created_at: ${scene.created_at}`);
    console.log("");
  }

  // 3. Get 5 most recently created scenes
  console.log("--- 5 Most Recently Created Scenes ---");
  const createdResult = await graphqlQuery(`
    query {
      findScenes(filter: { per_page: 5, sort: "created_at", direction: DESC }) {
        scenes { id title updated_at created_at }
      }
    }
  `);

  for (const scene of createdResult.data?.findScenes?.scenes || []) {
    console.log(`  ID: ${scene.id}`);
    console.log(`  Title: ${scene.title || "(no title)"}`);
    console.log(`  updated_at: ${scene.updated_at}`);
    console.log(`  created_at: ${scene.created_at}`);
    console.log("");
  }

  // 4. Test timestamp queries with different formats
  console.log("--- Timestamp Query Tests ---");

  // Get the most recent scene's timestamp
  const mostRecent = recentResult.data?.findScenes?.scenes?.[0];
  if (mostRecent) {
    const stashTs = mostRecent.updated_at;
    console.log(`\nMost recent scene updated_at: ${stashTs}`);

    // Strip timezone (correct approach)
    const stripped = stashTs.replace(/([+-]\d{2}:\d{2}|Z)$/, "");
    console.log(`Stripped (what we should send): ${stripped}`);

    // What we were sending before (UTC converted)
    const asDate = new Date(stashTs);
    const utcStripped = asDate.toISOString().replace(/Z$/, "");
    console.log(`UTC stripped (old bug): ${utcStripped}`);

    // Test: How many scenes updated after the stripped timestamp?
    const afterStripped = await graphqlQuery(`
      query {
        findScenes(
          filter: { per_page: 1 }
          scene_filter: { updated_at: { modifier: GREATER_THAN, value: "${stripped}" } }
        ) { count }
      }
    `);
    console.log(`\nScenes updated AFTER "${stripped}": ${afterStripped.data?.findScenes?.count}`);

    // Test: How many scenes updated after the UTC timestamp?
    const afterUtc = await graphqlQuery(`
      query {
        findScenes(
          filter: { per_page: 1 }
          scene_filter: { updated_at: { modifier: GREATER_THAN, value: "${utcStripped}" } }
        ) { count }
      }
    `);
    console.log(`Scenes updated AFTER "${utcStripped}": ${afterUtc.data?.findScenes?.count}`);

    // Test: Scenes in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayLocal = yesterday.toLocaleString("sv-SE").replace(" ", "T");
    const last24h = await graphqlQuery(`
      query {
        findScenes(
          filter: { per_page: 1 }
          scene_filter: { updated_at: { modifier: GREATER_THAN, value: "${yesterdayLocal}" } }
        ) { count }
      }
    `);
    console.log(`\nScenes updated in last 24h (since ${yesterdayLocal}): ${last24h.data?.findScenes?.count}`);

    // Test: Scenes in last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const twoHoursLocal = twoHoursAgo.toLocaleString("sv-SE").replace(" ", "T");
    const last2h = await graphqlQuery(`
      query {
        findScenes(
          filter: { per_page: 1 }
          scene_filter: { updated_at: { modifier: GREATER_THAN, value: "${twoHoursLocal}" } }
        ) { count }
      }
    `);
    console.log(`Scenes updated in last 2h (since ${twoHoursLocal}): ${last2h.data?.findScenes?.count}`);
  }

  // 5. Check what timezone Stash is using
  console.log("\n--- Stash System Info ---");
  const systemResult = await graphqlQuery(`
    query { systemStatus { databasePath configPath } }
  `);
  console.log(`Database: ${systemResult.data?.systemStatus?.databasePath}`);
  console.log(`Config: ${systemResult.data?.systemStatus?.configPath}`);

  console.log("\n=== Done ===");
}

main().catch(console.error);
