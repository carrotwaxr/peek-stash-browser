import { adminClient } from "./testClient.js";
import { TEST_CONFIG } from "./config.js";

interface SetupStatus {
  setupComplete: boolean;
  hasUsers: boolean;
  hasStashInstance: boolean;
}

/**
 * Ensures the test database is set up with an admin user and Stash connection.
 * Only runs the setup if needed (idempotent).
 */
export async function ensureTestSetup(): Promise<void> {
  const status = await getSetupStatus();

  if (status.setupComplete) {
    console.log("[Integration Tests] Setup already complete, logging in admin...");
    await loginAdmin();
    return;
  }

  console.log("[Integration Tests] Running initial setup...");

  // Step 1: Create admin user if needed
  if (!status.hasUsers) {
    console.log("[Integration Tests] Creating admin user...");
    await createAdminUser();
  }

  // Step 2: Connect to Stash if needed
  if (!status.hasStashInstance) {
    console.log("[Integration Tests] Connecting to Stash...");
    await connectStash();
  }

  // Step 3: Login as admin
  await loginAdmin();

  // Step 4: Wait for initial sync to complete
  console.log("[Integration Tests] Waiting for initial sync...");
  await waitForSync();

  console.log("[Integration Tests] Setup complete");
}

async function getSetupStatus(): Promise<SetupStatus> {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/setup/status`);
  if (!response.ok) {
    throw new Error(`Failed to get setup status: ${response.status}`);
  }
  return response.json();
}

async function createAdminUser(): Promise<void> {
  // Import test credentials
  const { TEST_ADMIN } = await import("../fixtures/testEntities.js");

  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/setup/create-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: TEST_ADMIN.username,
      password: TEST_ADMIN.password,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create admin user: ${response.status} ${error}`);
  }
}

async function connectStash(): Promise<void> {
  // Test connection first
  const testResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/setup/test-stash-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: process.env.STASH_URL,
      apiKey: process.env.STASH_API_KEY,
    }),
  });

  if (!testResponse.ok) {
    const error = await testResponse.text();
    throw new Error(`Failed to test Stash connection: ${testResponse.status} ${error}`);
  }

  // Create the instance
  const createResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/setup/create-stash-instance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Integration Test Stash",
      url: process.env.STASH_URL,
      apiKey: process.env.STASH_API_KEY,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create Stash instance: ${createResponse.status} ${error}`);
  }
}

async function loginAdmin(): Promise<void> {
  const { TEST_ADMIN } = await import("../fixtures/testEntities.js");
  await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
}

async function waitForSync(maxAttempts = 120, delayMs = 2000): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await adminClient.get<{ isSyncing: boolean }>("/api/sync/status");

    if (response.ok && !response.data.isSyncing) {
      // Verify we have data
      const sceneResponse = await adminClient.post<{ count: number }>("/api/library/scenes", {
        per_page: 1,
      });

      if (sceneResponse.ok && sceneResponse.data.count > 0) {
        console.log(`[Integration Tests] Sync complete. ${sceneResponse.data.count} scenes available.`);
        return;
      }
    }

    if (i % 10 === 0) {
      console.log(`[Integration Tests] Waiting for sync... (attempt ${i + 1}/${maxAttempts})`);
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  throw new Error("Sync did not complete within timeout");
}
