/**
 * Check Peek's database to see stored sync timestamps
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Peek Database Sync State ===\n");

  const syncStates = await prisma.syncState.findMany();

  for (const state of syncStates) {
    console.log(`Entity: ${state.entityType}`);
    console.log(`  lastFullSyncTimestamp: ${state.lastFullSyncTimestamp || "null"}`);
    console.log(`  lastIncrementalSyncTimestamp: ${state.lastIncrementalSyncTimestamp || "null"}`);
    console.log(`  lastFullSyncActual: ${state.lastFullSyncActual?.toISOString() || "null"}`);
    console.log(`  lastIncrementalSyncActual: ${state.lastIncrementalSyncActual?.toISOString() || "null"}`);
    console.log(`  lastSyncCount: ${state.lastSyncCount}`);
    console.log("");
  }

  // Check what the most recent sync timestamp would format to
  const sceneState = syncStates.find(s => s.entityType === "scene");
  if (sceneState) {
    const lastSync = sceneState.lastIncrementalSyncTimestamp || sceneState.lastFullSyncTimestamp;
    if (lastSync) {
      // Strip timezone suffix for Stash query
      const formatted = lastSync.replace(/[+-]\d{2}:\d{2}$/, "");
      console.log("--- Scene Sync Timestamp Analysis ---");
      console.log(`Raw from DB: ${lastSync}`);
      console.log(`Formatted for Stash query: ${formatted}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
