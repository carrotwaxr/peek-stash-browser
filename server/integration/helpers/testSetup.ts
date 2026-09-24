import { TEST_CONFIG } from "./config.js";
import { adminClient } from "./testClient.js";

interface SetupStatus {
  setupComplete: boolean;
  hasUsers: boolean;
  hasStashInstance: boolean;
}

/**
 * Ensures the test database is set up with an admin user and Stash connection.
 * Only runs the setup if needed (idempotent). Runs the wizard's path signed in:
 * once the admin exists, the Stash setup routes need the admin session.
 */
export async function ensureTestSetup(): Promise<void> {
  const status = await getSetupStatus();

  if (status.setupComplete) {
    console.log(
      "[Integration Tests] Setup already complete, logging in admin..."
    );
    await loginAdmin();
    return;
  }

  console.log("[Integration Tests] Running initial setup...");

  // Step 1: Create admin user if needed
  if (!status.hasUsers) {
    console.log("[Integration Tests] Creating admin user...");
    await createAdminUser();
  }

  // Step 2: Login as admin
  await loginAdmin();

  // Step 3: Connect to Stash if needed
  if (!status.hasStashInstance) {
    console.log("[Integration Tests] Connecting to Stash...");
    await connectStash();
  }

  // Note: We don't wait for sync here - globalSetup handles that after
  // initializing StashInstanceManager and the cache
  console.log(
    "[Integration Tests] Initial setup complete (sync will complete in globalSetup)"
  );
}

async function getSetupStatus(): Promise<SetupStatus> {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/setup/status`);
  if (!response.ok) {
    throw new Error(`Failed to get setup status: ${response.status}`);
  }
  return (await response.json()) as SetupStatus;
}

async function createAdminUser(): Promise<void> {
  // Import test credentials
  const { TEST_ADMIN } = await import("../fixtures/testEntities.js");

  const response = await fetch(
    `${TEST_CONFIG.baseUrl}/api/setup/create-admin`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: TEST_ADMIN.username,
        password: TEST_ADMIN.password,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create admin user: ${response.status} ${error}`);
  }
}

async function connectStash(): Promise<void> {
  // Test connection first
  const testResponse = await adminClient.post(
    "/api/setup/test-stash-connection",
    {
      url: process.env.STASH_URL,
      apiKey: process.env.STASH_API_KEY,
    }
  );

  if (!testResponse.ok) {
    throw new Error(
      `Failed to test Stash connection: ${testResponse.status} ${JSON.stringify(testResponse.data)}`
    );
  }

  // Create the instance
  const createResponse = await adminClient.post(
    "/api/setup/create-stash-instance",
    {
      name: "Integration Test Stash",
      url: process.env.STASH_URL,
      apiKey: process.env.STASH_API_KEY,
    }
  );

  if (!createResponse.ok) {
    throw new Error(
      `Failed to create Stash instance: ${createResponse.status} ${JSON.stringify(createResponse.data)}`
    );
  }
}

async function loginAdmin(): Promise<void> {
  const { TEST_ADMIN } = await import("../fixtures/testEntities.js");
  await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
}
