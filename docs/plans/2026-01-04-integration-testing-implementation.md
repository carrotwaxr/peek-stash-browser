# Integration Testing Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add API integration tests that validate Peek works correctly against a real Stash server.

**Architecture:** Vitest with separate config for integration tests, Express server started in globalSetup, HTTP client wrapper for authenticated requests, persistent SQLite test database.

**Tech Stack:** Vitest, native fetch, Express, Prisma, existing app code

---

## Task 1: Create Integration Test Directory Structure

**Files:**
- Create: `server/integration/vitest.integration.config.ts`
- Create: `server/integration/helpers/globalSetup.ts`
- Create: `server/integration/helpers/globalTeardown.ts`
- Create: `server/integration/fixtures/testEntities.example.ts`
- Modify: `server/package.json` (add scripts)
- Modify: `.gitignore` (add integration test files)

**Step 1: Create Vitest integration config**

Create `server/integration/vitest.integration.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", "dist"],
    globalSetup: "./helpers/globalSetup.ts",
    globalTeardown: "./helpers/globalTeardown.ts",
    testTimeout: 30000, // 30s for integration tests
    hookTimeout: 60000, // 60s for setup/teardown hooks
    fileParallelism: false, // Run sequentially
    root: path.resolve(__dirname),
  },
});
```

**Step 2: Create placeholder globalSetup**

Create `server/integration/helpers/globalSetup.ts`:

```typescript
export async function setup() {
  console.log("[Integration Tests] Global setup - placeholder");
}

export default setup;
```

**Step 3: Create placeholder globalTeardown**

Create `server/integration/helpers/globalTeardown.ts`:

```typescript
export async function teardown() {
  console.log("[Integration Tests] Global teardown - placeholder");
}

export default teardown;
```

**Step 4: Create test entities example file**

Create `server/integration/fixtures/testEntities.example.ts`:

```typescript
/**
 * Test Entity IDs
 *
 * Copy this file to testEntities.ts and fill in IDs from your Stash library.
 * These entities are used by integration tests to validate API behavior.
 *
 * Requirements:
 * - sceneWithRelations: A scene that has performers, tags, and a studio
 * - performerWithScenes: A performer that appears in multiple scenes
 * - studioWithScenes: A studio with multiple scenes
 * - tagWithEntities: A tag used on scenes, performers, or studios
 * - groupWithScenes: A group/collection containing scenes
 * - galleryWithImages: A gallery containing images
 * - restrictableTag: A tag that can be used for content restriction tests
 */
export const TEST_ENTITIES = {
  sceneWithRelations: "REPLACE_WITH_SCENE_ID",
  performerWithScenes: "REPLACE_WITH_PERFORMER_ID",
  studioWithScenes: "REPLACE_WITH_STUDIO_ID",
  tagWithEntities: "REPLACE_WITH_TAG_ID",
  groupWithScenes: "REPLACE_WITH_GROUP_ID",
  galleryWithImages: "REPLACE_WITH_GALLERY_ID",
  restrictableTag: "REPLACE_WITH_TAG_ID_FOR_RESTRICTIONS",
};

/**
 * Test Admin Credentials
 *
 * These are used to create/login the test admin user.
 * The integration test setup will create this user if it doesn't exist.
 */
export const TEST_ADMIN = {
  username: "integration_admin",
  password: "integration_test_password_123",
};
```

**Step 5: Add npm scripts to package.json**

Modify `server/package.json`, add to scripts:

```json
"test:integration": "vitest run --config integration/vitest.integration.config.ts",
"test:integration:watch": "vitest --config integration/vitest.integration.config.ts",
"test:integration:fresh": "FRESH_DB=true npm run test:integration"
```

**Step 6: Update .gitignore**

Add to `.gitignore`:

```
# Integration test secrets and data
server/integration/fixtures/testEntities.ts
server/integration/*.db
server/integration/.env.integration
```

**Step 7: Run vitest to verify config works**

Run: `cd server && npm run test:integration`
Expected: "No test files found" or empty test run (no errors about config)

**Step 8: Commit**

```bash
git add server/integration/ server/package.json .gitignore
git commit -m "feat(tests): add integration test directory structure and config"
```

---

## Task 2: Create Test HTTP Client

**Files:**
- Create: `server/integration/helpers/testClient.ts`
- Create: `server/integration/helpers/config.ts`

**Step 1: Create config helper**

Create `server/integration/helpers/config.ts`:

```typescript
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEST_CONFIG = {
  serverPort: 9999,
  get baseUrl() {
    return `http://localhost:${this.serverPort}`;
  },
  get databasePath() {
    return path.resolve(__dirname, "../test.db");
  },
  get databaseUrl() {
    return `file:${this.databasePath}`;
  },
};
```

**Step 2: Create TestClient class**

Create `server/integration/helpers/testClient.ts`:

```typescript
import { TEST_CONFIG } from "./config.js";

interface RequestOptions {
  headers?: Record<string, string>;
}

interface ApiResponse<T> {
  status: number;
  data: T;
  ok: boolean;
}

export class TestClient {
  private token?: string;
  private baseUrl: string;

  constructor(baseUrl: string = TEST_CONFIG.baseUrl) {
    this.baseUrl = baseUrl;
  }

  async login(username: string, password: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} ${await response.text()}`);
    }

    // Extract token from Set-Cookie header
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const tokenMatch = setCookie.match(/token=([^;]+)/);
      if (tokenMatch) {
        this.token = tokenMatch[1];
      }
    }

    // Also check response body for token (some auth flows return it there)
    const data = await response.json();
    if (data.token) {
      this.token = data.token;
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  private getHeaders(options?: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options?.headers,
    };

    if (this.token) {
      headers["Cookie"] = `token=${this.token}`;
    }

    return headers;
  }

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.getHeaders(options),
    });

    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async post<T = unknown>(path: string, body?: object, options?: RequestOptions): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.getHeaders(options),
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async put<T = unknown>(path: string, body?: object, options?: RequestOptions): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.getHeaders(options),
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.getHeaders(options),
    });

    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }
}

// Singleton instances for common use cases
export const adminClient = new TestClient();
export const guestClient = new TestClient();
```

**Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors related to integration test files

**Step 4: Commit**

```bash
git add server/integration/helpers/
git commit -m "feat(tests): add TestClient HTTP helper for integration tests"
```

---

## Task 3: Implement Global Setup (Server Startup)

**Files:**
- Modify: `server/integration/helpers/globalSetup.ts`
- Create: `server/integration/helpers/serverManager.ts`
- Modify: `server/initializers/api.ts` (export app separately from listen)

**Step 1: Refactor api.ts to export app without starting**

Modify `server/initializers/api.ts`. Change the end of the file (around line 150-161):

Find:
```typescript
  // Start API server immediately so /api/setup/status is available
  app.listen(8000, () => {
    logger.info("Server is running", {
      url: "http://localhost:8000",
      transcodingSystem: "session-based",
    });
  });

  logger.info("Server started - accepting connections during cache load");

  return app;
};
```

Replace with:
```typescript
  return app;
};

/**
 * Start the API server on the specified port.
 * Separated from setupAPI() to allow integration tests to start on a different port.
 */
export const startServer = (app: ReturnType<typeof setupAPI>, port: number = 8000) => {
  return app.listen(port, () => {
    logger.info("Server is running", {
      url: `http://localhost:${port}`,
      transcodingSystem: "session-based",
    });
  });
};
```

**Step 2: Update index.ts to use startServer**

Modify `server/index.ts`, find where `setupAPI()` is called (around line 46):

Find:
```typescript
  // Start API server (needed for setup wizard if no Stash configured)
  setupAPI();
```

Replace with:
```typescript
  import { startServer } from "./initializers/api.js";
  // ... (at top of file, add to existing imports)

  // Start API server (needed for setup wizard if no Stash configured)
  const app = setupAPI();
  startServer(app, 8000);
```

Actually, let's be more careful. Find the import line:
```typescript
import { setupAPI } from "./initializers/api.js";
```

Replace with:
```typescript
import { setupAPI, startServer } from "./initializers/api.js";
```

Then find:
```typescript
  setupAPI();
```

Replace with:
```typescript
  const app = setupAPI();
  startServer(app);
```

**Step 3: Create serverManager helper**

Create `server/integration/helpers/serverManager.ts`:

```typescript
import type { Server } from "http";

// Store server instance globally for teardown
let serverInstance: Server | null = null;

export function setServerInstance(server: Server): void {
  serverInstance = server;
}

export function getServerInstance(): Server | null {
  return serverInstance;
}

export async function stopServer(): Promise<void> {
  if (serverInstance) {
    return new Promise((resolve, reject) => {
      serverInstance!.close((err) => {
        if (err) {
          reject(err);
        } else {
          serverInstance = null;
          resolve();
        }
      });
    });
  }
}
```

**Step 4: Implement globalSetup**

Replace `server/integration/helpers/globalSetup.ts`:

```typescript
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TEST_CONFIG } from "./config.js";
import { setServerInstance } from "./serverManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setup() {
  console.log("[Integration Tests] Starting global setup...");

  // Load environment from project root
  const envPath = path.resolve(__dirname, "../../../.env");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env file at ${envPath}. Integration tests require STASH_URL and STASH_API_KEY.`);
  }
  dotenv.config({ path: envPath });

  // Validate required env vars
  if (!process.env.STASH_URL || !process.env.STASH_API_KEY) {
    throw new Error("Integration tests require STASH_URL and STASH_API_KEY in .env");
  }

  // Check if testEntities.ts exists
  const testEntitiesPath = path.resolve(__dirname, "../fixtures/testEntities.ts");
  if (!fs.existsSync(testEntitiesPath)) {
    throw new Error(
      `Missing testEntities.ts. Copy testEntities.example.ts to testEntities.ts and fill in entity IDs from your Stash.`
    );
  }

  // Set test database URL
  process.env.DATABASE_URL = TEST_CONFIG.databaseUrl;

  // Handle fresh DB mode
  if (process.env.FRESH_DB === "true" && fs.existsSync(TEST_CONFIG.databasePath)) {
    console.log("[Integration Tests] FRESH_DB=true, deleting existing test database...");
    fs.unlinkSync(TEST_CONFIG.databasePath);
  }

  // Run prisma migrations
  console.log("[Integration Tests] Running database migrations...");
  const { execSync } = await import("child_process");
  execSync("npx prisma db push --skip-generate", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: TEST_CONFIG.databaseUrl },
    stdio: "inherit",
  });

  // Import and start the server
  console.log("[Integration Tests] Starting test server on port", TEST_CONFIG.serverPort);

  // Dynamic import to ensure env vars are set first
  const { setupAPI, startServer } = await import("../../initializers/api.js");
  const app = setupAPI();
  const server = startServer(app, TEST_CONFIG.serverPort);

  setServerInstance(server);

  // Wait for server to be ready
  await waitForServer();

  console.log("[Integration Tests] Global setup complete");
}

async function waitForServer(maxAttempts = 30, delayMs = 500): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${TEST_CONFIG.baseUrl}/api/health`);
      if (response.ok) {
        console.log("[Integration Tests] Server is ready");
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Server failed to start within timeout");
}

export default setup;
```

**Step 5: Implement globalTeardown**

Replace `server/integration/helpers/globalTeardown.ts`:

```typescript
import { stopServer } from "./serverManager.js";

export async function teardown() {
  console.log("[Integration Tests] Starting global teardown...");

  await stopServer();

  console.log("[Integration Tests] Global teardown complete");
}

export default teardown;
```

**Step 6: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add server/initializers/api.ts server/index.ts server/integration/helpers/
git commit -m "feat(tests): implement integration test server startup and teardown"
```

---

## Task 4: Add First Integration Test (Health Check)

**Files:**
- Create: `server/integration/api/health.integration.test.ts`

**Step 1: Create health check test**

Create `server/integration/api/health.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { guestClient } from "../helpers/testClient.js";

describe("Health API", () => {
  it("returns healthy status without authentication", async () => {
    const response = await guestClient.get<{ status: string }>("/api/health");

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe("healthy");
  });

  it("returns version without authentication", async () => {
    const response = await guestClient.get<{ server: string }>("/api/version");

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.data.server).toBeDefined();
    expect(typeof response.data.server).toBe("string");
  });
});
```

**Step 2: Run the integration test**

Run: `cd server && npm run test:integration`
Expected: Tests pass (2 passing)

**Step 3: Commit**

```bash
git add server/integration/api/health.integration.test.ts
git commit -m "feat(tests): add first integration test for health endpoint"
```

---

## Task 5: Add Test Setup Helper (Admin User & Initial Sync)

**Files:**
- Create: `server/integration/helpers/testSetup.ts`
- Modify: `server/integration/helpers/globalSetup.ts`

**Step 1: Create testSetup helper**

Create `server/integration/helpers/testSetup.ts`:

```typescript
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
```

**Step 2: Update globalSetup to run ensureTestSetup**

Modify `server/integration/helpers/globalSetup.ts`, add at the end of the setup function (before the final console.log):

Find:
```typescript
  console.log("[Integration Tests] Global setup complete");
}
```

Replace with:
```typescript
  // Ensure admin user exists and is logged in
  const { ensureTestSetup } = await import("./testSetup.js");
  await ensureTestSetup();

  console.log("[Integration Tests] Global setup complete");
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/integration/helpers/
git commit -m "feat(tests): add test setup helper for admin user and initial sync"
```

---

## Task 6: Add Scene API Integration Tests

**Files:**
- Create: `server/integration/api/scenes.integration.test.ts`

**Step 1: Create scene API tests**

Create `server/integration/api/scenes.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Scene API", () => {
  describe("POST /api/library/scenes", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/scenes", {});

      expect(response.status).toBe(401);
    });

    it("returns scenes with pagination", async () => {
      const response = await adminClient.post<{
        scenes: Array<{ id: string; title: string }>;
        count: number;
      }>("/api/library/scenes", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.scenes).toBeDefined();
      expect(Array.isArray(response.data.scenes)).toBe(true);
      expect(response.data.scenes.length).toBeLessThanOrEqual(10);
      expect(response.data.count).toBeGreaterThan(0);
    });

    it("returns scene by ID with relations", async () => {
      const response = await adminClient.post<{
        scenes: Array<{
          id: string;
          title: string;
          performers?: Array<{ id: string; name: string }>;
          tags?: Array<{ id: string; name: string }>;
          studio?: { id: string; name: string };
        }>;
      }>("/api/library/scenes", {
        ids: [TEST_ENTITIES.sceneWithRelations],
      });

      expect(response.ok).toBe(true);
      expect(response.data.scenes).toHaveLength(1);

      const scene = response.data.scenes[0];
      expect(scene.id).toBe(TEST_ENTITIES.sceneWithRelations);
      expect(scene.title).toBeDefined();
      // The test entity should have relations
      expect(scene.performers).toBeDefined();
      expect(scene.tags).toBeDefined();
    });

    it("filters scenes by performer", async () => {
      const response = await adminClient.post<{
        scenes: Array<{
          id: string;
          performers: Array<{ id: string }>;
        }>;
        count: number;
      }>("/api/library/scenes", {
        performers: {
          value: [TEST_ENTITIES.performerWithScenes],
          modifier: "INCLUDES",
        },
        per_page: 50,
      });

      expect(response.ok).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);

      // All returned scenes should include the performer
      for (const scene of response.data.scenes) {
        const performerIds = scene.performers.map((p) => p.id);
        expect(performerIds).toContain(TEST_ENTITIES.performerWithScenes);
      }
    });

    it("filters scenes by studio", async () => {
      const response = await adminClient.post<{
        scenes: Array<{
          id: string;
          studio: { id: string };
        }>;
        count: number;
      }>("/api/library/scenes", {
        studios: {
          value: [TEST_ENTITIES.studioWithScenes],
          modifier: "INCLUDES",
        },
        per_page: 50,
      });

      expect(response.ok).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);

      // All returned scenes should be from the studio
      for (const scene of response.data.scenes) {
        expect(scene.studio?.id).toBe(TEST_ENTITIES.studioWithScenes);
      }
    });

    it("filters scenes by tag", async () => {
      const response = await adminClient.post<{
        scenes: Array<{
          id: string;
          tags: Array<{ id: string }>;
        }>;
        count: number;
      }>("/api/library/scenes", {
        tags: {
          value: [TEST_ENTITIES.tagWithEntities],
          modifier: "INCLUDES",
        },
        per_page: 50,
      });

      expect(response.ok).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);

      // All returned scenes should have the tag (direct or inherited)
      // Note: Tags can be inherited, so we check the scene has it
      for (const scene of response.data.scenes) {
        const tagIds = scene.tags.map((t) => t.id);
        expect(tagIds).toContain(TEST_ENTITIES.tagWithEntities);
      }
    });

    it("respects per_page limit", async () => {
      const response = await adminClient.post<{
        scenes: Array<{ id: string }>;
        count: number;
      }>("/api/library/scenes", {
        per_page: 5,
      });

      expect(response.ok).toBe(true);
      expect(response.data.scenes.length).toBeLessThanOrEqual(5);
    });

    it("paginates correctly", async () => {
      // Get first page
      const page1 = await adminClient.post<{
        scenes: Array<{ id: string }>;
      }>("/api/library/scenes", {
        page: 1,
        per_page: 5,
      });

      // Get second page
      const page2 = await adminClient.post<{
        scenes: Array<{ id: string }>;
      }>("/api/library/scenes", {
        page: 2,
        per_page: 5,
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      // Pages should have different scenes (unless there are fewer than 6 total)
      if (page1.data.scenes.length === 5 && page2.data.scenes.length > 0) {
        const page1Ids = page1.data.scenes.map((s) => s.id);
        const page2Ids = page2.data.scenes.map((s) => s.id);

        // No overlap between pages
        for (const id of page2Ids) {
          expect(page1Ids).not.toContain(id);
        }
      }
    });
  });

  describe("GET /api/library/scenes/:id/similar", () => {
    it("returns similar scenes", async () => {
      const response = await adminClient.get<{
        scenes: Array<{ id: string; title: string }>;
      }>(`/api/library/scenes/${TEST_ENTITIES.sceneWithRelations}/similar`);

      expect(response.ok).toBe(true);
      expect(response.data.scenes).toBeDefined();
      expect(Array.isArray(response.data.scenes)).toBe(true);
    });
  });
});
```

**Step 2: Run the integration tests**

Run: `cd server && npm run test:integration`
Expected: Tests pass (some may fail if they reveal actual bugs - investigate those!)

**Step 3: Commit**

```bash
git add server/integration/api/scenes.integration.test.ts
git commit -m "feat(tests): add scene API integration tests"
```

---

## Task 7: Add Performer API Integration Tests

**Files:**
- Create: `server/integration/api/performers.integration.test.ts`

**Step 1: Create performer API tests**

Create `server/integration/api/performers.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Performer API", () => {
  describe("POST /api/library/performers", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/performers", {});

      expect(response.status).toBe(401);
    });

    it("returns performers with pagination", async () => {
      const response = await adminClient.post<{
        performers: Array<{ id: string; name: string }>;
        count: number;
      }>("/api/library/performers", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.performers).toBeDefined();
      expect(Array.isArray(response.data.performers)).toBe(true);
      expect(response.data.performers.length).toBeLessThanOrEqual(10);
      expect(response.data.count).toBeGreaterThan(0);
    });

    it("returns performer by ID", async () => {
      const response = await adminClient.post<{
        performers: Array<{
          id: string;
          name: string;
          scene_count?: number;
        }>;
      }>("/api/library/performers", {
        ids: [TEST_ENTITIES.performerWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.performers).toHaveLength(1);

      const performer = response.data.performers[0];
      expect(performer.id).toBe(TEST_ENTITIES.performerWithScenes);
      expect(performer.name).toBeDefined();
    });

    it("filters performers by tag", async () => {
      // This test may not return results if no performers have the tag
      const response = await adminClient.post<{
        performers: Array<{
          id: string;
          tags?: Array<{ id: string }>;
        }>;
        count: number;
      }>("/api/library/performers", {
        tags: {
          value: [TEST_ENTITIES.tagWithEntities],
          modifier: "INCLUDES",
        },
        per_page: 50,
      });

      expect(response.ok).toBe(true);
      // If performers have this tag, verify the filter works
      if (response.data.count > 0) {
        for (const performer of response.data.performers) {
          if (performer.tags) {
            const tagIds = performer.tags.map((t) => t.id);
            expect(tagIds).toContain(TEST_ENTITIES.tagWithEntities);
          }
        }
      }
    });
  });

  describe("POST /api/library/performers/minimal", () => {
    it("returns minimal performer data for dropdowns", async () => {
      const response = await adminClient.post<{
        performers: Array<{ id: string; name: string }>;
      }>("/api/library/performers/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.performers).toBeDefined();
      expect(Array.isArray(response.data.performers)).toBe(true);

      // Minimal should only have id and name
      if (response.data.performers.length > 0) {
        const performer = response.data.performers[0];
        expect(performer.id).toBeDefined();
        expect(performer.name).toBeDefined();
      }
    });
  });
});
```

**Step 2: Run tests**

Run: `cd server && npm run test:integration`
Expected: Tests pass

**Step 3: Commit**

```bash
git add server/integration/api/performers.integration.test.ts
git commit -m "feat(tests): add performer API integration tests"
```

---

## Task 8: Add Remaining Entity API Tests (Studios, Tags, Groups, Galleries, Images)

**Files:**
- Create: `server/integration/api/studios.integration.test.ts`
- Create: `server/integration/api/tags.integration.test.ts`
- Create: `server/integration/api/groups.integration.test.ts`
- Create: `server/integration/api/galleries.integration.test.ts`
- Create: `server/integration/api/images.integration.test.ts`

**Step 1: Create studios tests**

Create `server/integration/api/studios.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Studio API", () => {
  describe("POST /api/library/studios", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/studios", {});
      expect(response.status).toBe(401);
    });

    it("returns studios with pagination", async () => {
      const response = await adminClient.post<{
        studios: Array<{ id: string; name: string }>;
        count: number;
      }>("/api/library/studios", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.studios).toBeDefined();
      expect(Array.isArray(response.data.studios)).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);
    });

    it("returns studio by ID", async () => {
      const response = await adminClient.post<{
        studios: Array<{ id: string; name: string }>;
      }>("/api/library/studios", {
        ids: [TEST_ENTITIES.studioWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.studios).toHaveLength(1);
      expect(response.data.studios[0].id).toBe(TEST_ENTITIES.studioWithScenes);
    });
  });

  describe("POST /api/library/studios/minimal", () => {
    it("returns minimal studio data", async () => {
      const response = await adminClient.post<{
        studios: Array<{ id: string; name: string }>;
      }>("/api/library/studios/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.studios).toBeDefined();
    });
  });
});
```

**Step 2: Create tags tests**

Create `server/integration/api/tags.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Tag API", () => {
  describe("POST /api/library/tags", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/tags", {});
      expect(response.status).toBe(401);
    });

    it("returns tags with pagination", async () => {
      const response = await adminClient.post<{
        tags: Array<{ id: string; name: string }>;
        count: number;
      }>("/api/library/tags", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.tags).toBeDefined();
      expect(Array.isArray(response.data.tags)).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);
    });

    it("returns tag by ID", async () => {
      const response = await adminClient.post<{
        tags: Array<{ id: string; name: string }>;
      }>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      expect(response.ok).toBe(true);
      expect(response.data.tags).toHaveLength(1);
      expect(response.data.tags[0].id).toBe(TEST_ENTITIES.tagWithEntities);
    });
  });

  describe("POST /api/library/tags/minimal", () => {
    it("returns minimal tag data", async () => {
      const response = await adminClient.post<{
        tags: Array<{ id: string; name: string }>;
      }>("/api/library/tags/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.tags).toBeDefined();
    });
  });
});
```

**Step 3: Create groups tests**

Create `server/integration/api/groups.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Group API", () => {
  describe("POST /api/library/groups", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/groups", {});
      expect(response.status).toBe(401);
    });

    it("returns groups with pagination", async () => {
      const response = await adminClient.post<{
        groups: Array<{ id: string; name: string }>;
        count: number;
      }>("/api/library/groups", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.groups).toBeDefined();
      expect(Array.isArray(response.data.groups)).toBe(true);
    });

    it("returns group by ID", async () => {
      const response = await adminClient.post<{
        groups: Array<{ id: string; name: string }>;
      }>("/api/library/groups", {
        ids: [TEST_ENTITIES.groupWithScenes],
      });

      expect(response.ok).toBe(true);
      if (response.data.groups.length > 0) {
        expect(response.data.groups[0].id).toBe(TEST_ENTITIES.groupWithScenes);
      }
    });
  });

  describe("POST /api/library/groups/minimal", () => {
    it("returns minimal group data", async () => {
      const response = await adminClient.post<{
        groups: Array<{ id: string; name: string }>;
      }>("/api/library/groups/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.groups).toBeDefined();
    });
  });
});
```

**Step 4: Create galleries tests**

Create `server/integration/api/galleries.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Gallery API", () => {
  describe("POST /api/library/galleries", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/galleries", {});
      expect(response.status).toBe(401);
    });

    it("returns galleries with pagination", async () => {
      const response = await adminClient.post<{
        galleries: Array<{ id: string; title?: string }>;
        count: number;
      }>("/api/library/galleries", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.galleries).toBeDefined();
      expect(Array.isArray(response.data.galleries)).toBe(true);
    });

    it("returns gallery by ID with images", async () => {
      const response = await adminClient.post<{
        galleries: Array<{ id: string; image_count?: number }>;
      }>("/api/library/galleries", {
        ids: [TEST_ENTITIES.galleryWithImages],
      });

      expect(response.ok).toBe(true);
      if (response.data.galleries.length > 0) {
        expect(response.data.galleries[0].id).toBe(TEST_ENTITIES.galleryWithImages);
      }
    });
  });

  describe("GET /api/library/galleries/:id/images", () => {
    it("returns paginated images from gallery", async () => {
      const response = await adminClient.get<{
        images: Array<{ id: string }>;
        count: number;
      }>(`/api/library/galleries/${TEST_ENTITIES.galleryWithImages}/images?page=1&per_page=10`);

      expect(response.ok).toBe(true);
      expect(response.data.images).toBeDefined();
      expect(Array.isArray(response.data.images)).toBe(true);
    });
  });
});
```

**Step 5: Create images tests**

Create `server/integration/api/images.integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";

describe("Image API", () => {
  describe("POST /api/library/images", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/images", {});
      expect(response.status).toBe(401);
    });

    it("returns images with pagination", async () => {
      const response = await adminClient.post<{
        images: Array<{ id: string }>;
        count: number;
      }>("/api/library/images", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.images).toBeDefined();
      expect(Array.isArray(response.data.images)).toBe(true);
    });
  });
});
```

**Step 6: Run all integration tests**

Run: `cd server && npm run test:integration`
Expected: Tests pass

**Step 7: Commit**

```bash
git add server/integration/api/
git commit -m "feat(tests): add integration tests for all entity APIs"
```

---

## Task 9: Add Authentication Integration Tests

**Files:**
- Create: `server/integration/api/auth.integration.test.ts`

**Step 1: Create auth tests**

Create `server/integration/api/auth.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { TestClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

describe("Auth API", () => {
  let client: TestClient;

  beforeEach(() => {
    client = new TestClient();
  });

  describe("POST /api/auth/login", () => {
    it("returns success with valid credentials", async () => {
      const response = await client.post<{
        success: boolean;
        user: { id: number; username: string };
      }>("/api/auth/login", {
        username: TEST_ADMIN.username,
        password: TEST_ADMIN.password,
      });

      expect(response.ok).toBe(true);
      expect(response.data.success).toBe(true);
      expect(response.data.user.username).toBe(TEST_ADMIN.username);
    });

    it("returns 401 with invalid password", async () => {
      const response = await client.post("/api/auth/login", {
        username: TEST_ADMIN.username,
        password: "wrong_password",
      });

      expect(response.status).toBe(401);
    });

    it("returns 401 with non-existent user", async () => {
      const response = await client.post("/api/auth/login", {
        username: "nonexistent_user",
        password: "any_password",
      });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/auth/check", () => {
    it("returns authenticated=true when logged in", async () => {
      await client.login(TEST_ADMIN.username, TEST_ADMIN.password);

      const response = await client.get<{
        authenticated: boolean;
        user: { username: string };
      }>("/api/auth/check");

      expect(response.ok).toBe(true);
      expect(response.data.authenticated).toBe(true);
      expect(response.data.user.username).toBe(TEST_ADMIN.username);
    });

    it("returns 401 when not logged in", async () => {
      const response = await client.get("/api/auth/check");
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns current user info when logged in", async () => {
      await client.login(TEST_ADMIN.username, TEST_ADMIN.password);

      const response = await client.get<{
        user: { id: number; username: string; role: string };
      }>("/api/auth/me");

      expect(response.ok).toBe(true);
      expect(response.data.user.username).toBe(TEST_ADMIN.username);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears session and returns success", async () => {
      await client.login(TEST_ADMIN.username, TEST_ADMIN.password);

      const logoutResponse = await client.post<{ success: boolean }>("/api/auth/logout");
      expect(logoutResponse.ok).toBe(true);
      expect(logoutResponse.data.success).toBe(true);

      // After logout, auth check should fail
      client.clearToken();
      const checkResponse = await client.get("/api/auth/check");
      expect(checkResponse.status).toBe(401);
    });
  });
});
```

**Step 2: Update testEntities.example.ts to export TEST_ADMIN**

The TEST_ADMIN is already in the example file from Task 1.

**Step 3: Run tests**

Run: `cd server && npm run test:integration`
Expected: Tests pass

**Step 4: Commit**

```bash
git add server/integration/api/auth.integration.test.ts
git commit -m "feat(tests): add authentication integration tests"
```

---

## Task 10: Add Content Restrictions Integration Tests

**Files:**
- Create: `server/integration/api/contentRestrictions.integration.test.ts`

**Step 1: Create content restrictions tests**

Create `server/integration/api/contentRestrictions.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, TestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

describe("Content Restrictions", () => {
  let restrictedUserClient: TestClient;
  const testUsername = "restriction_test_user";
  const testPassword = "test_password_123";
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user with content restrictions
    const createUserResponse = await adminClient.post<{
      user: { id: number };
    }>("/api/user/create", {
      username: testUsername,
      password: testPassword,
      role: "user",
    });

    if (!createUserResponse.ok) {
      // User might already exist from previous run, try to get their ID
      const usersResponse = await adminClient.get<{
        users: Array<{ id: number; username: string }>;
      }>("/api/user/list");

      const existingUser = usersResponse.data.users?.find(
        (u) => u.username === testUsername
      );
      if (existingUser) {
        testUserId = existingUser.id;
      } else {
        throw new Error("Failed to create or find test user");
      }
    } else {
      testUserId = createUserResponse.data.user.id;
    }

    // Add content restriction - exclude scenes with restrictableTag
    await adminClient.post("/api/user/restrictions", {
      userId: testUserId,
      restrictions: [
        {
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: [TEST_ENTITIES.restrictableTag],
        },
      ],
    });

    // Login as the restricted user
    restrictedUserClient = new TestClient();
    await restrictedUserClient.login(testUsername, testPassword);
  });

  afterAll(async () => {
    // Clean up: remove the test user
    if (testUserId) {
      await adminClient.delete(`/api/user/${testUserId}`);
    }
  });

  describe("Scene filtering with restrictions", () => {
    it("admin sees all scenes", async () => {
      const response = await adminClient.post<{
        scenes: Array<{ id: string; tags: Array<{ id: string }> }>;
        count: number;
      }>("/api/library/scenes", {
        tags: {
          value: [TEST_ENTITIES.restrictableTag],
          modifier: "INCLUDES",
        },
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      // Admin should see scenes with the restricted tag
      expect(response.data.count).toBeGreaterThan(0);
    });

    it("restricted user does not see excluded scenes", async () => {
      // First verify admin sees scenes with this tag
      const adminResponse = await adminClient.post<{
        count: number;
      }>("/api/library/scenes", {
        tags: {
          value: [TEST_ENTITIES.restrictableTag],
          modifier: "INCLUDES",
        },
      });

      // Skip test if no scenes have this tag
      if (adminResponse.data.count === 0) {
        console.log("Skipping: No scenes with restrictableTag");
        return;
      }

      // Restricted user should not see these scenes
      const restrictedResponse = await restrictedUserClient.post<{
        scenes: Array<{ id: string; tags: Array<{ id: string }> }>;
        count: number;
      }>("/api/library/scenes", {
        tags: {
          value: [TEST_ENTITIES.restrictableTag],
          modifier: "INCLUDES",
        },
        per_page: 10,
      });

      expect(restrictedResponse.ok).toBe(true);
      // Restricted user should see fewer or no scenes
      expect(restrictedResponse.data.count).toBeLessThan(adminResponse.data.count);
    });

    it("restricted user scene count reflects exclusions", async () => {
      // Get total scene count for admin
      const adminResponse = await adminClient.post<{ count: number }>(
        "/api/library/scenes",
        {}
      );

      // Get total scene count for restricted user
      const restrictedResponse = await restrictedUserClient.post<{ count: number }>(
        "/api/library/scenes",
        {}
      );

      expect(adminResponse.ok).toBe(true);
      expect(restrictedResponse.ok).toBe(true);

      // Restricted user should have same or fewer scenes
      expect(restrictedResponse.data.count).toBeLessThanOrEqual(
        adminResponse.data.count
      );
    });
  });
});
```

**Step 2: Run tests**

Run: `cd server && npm run test:integration`
Expected: Tests pass (or reveal bugs in content restriction system)

**Step 3: Commit**

```bash
git add server/integration/api/contentRestrictions.integration.test.ts
git commit -m "feat(tests): add content restrictions integration tests"
```

---

## Task 11: Add Pre-Release Skill

**Files:**
- Create: `.claude/skills/pre-release.md`
- Modify: `CLAUDE.md` (add integration testing docs)

**Step 1: Create pre-release skill**

Create `.claude/skills/pre-release.md`:

```markdown
---
name: pre-release
description: Run all validation checks before tagging a new release
---

# Pre-Release Checks

Run this before tagging a new version to ensure everything works.

## Checklist

1. **Server Unit Tests**
   ```bash
   cd server && npm test
   ```
   Expected: All tests pass

2. **Server Linter**
   ```bash
   cd server && npm run lint
   ```
   Expected: No errors (warnings OK)

3. **Client Unit Tests**
   ```bash
   cd client && npm test
   ```
   Expected: All tests pass

4. **Client Linter**
   ```bash
   cd client && npm run lint
   ```
   Expected: No errors (warnings OK)

5. **Integration Tests**
   ```bash
   cd server && npm run test:integration
   ```
   Expected: All tests pass
   Note: Requires testEntities.ts to be configured

6. **Client Build**
   ```bash
   cd client && npm run build
   ```
   Expected: Build succeeds without errors

7. **Docker Build**
   ```bash
   docker build -f Dockerfile.production -t peek:test .
   ```
   Expected: Image builds successfully

## After All Checks Pass

Report summary:
- Unit tests: X passed
- Integration tests: X passed
- Linter: Clean
- Build: Success

Ready to proceed with release tagging.
```

**Step 2: Update CLAUDE.md with integration testing docs**

Add to `CLAUDE.md` after the existing content:

```markdown

### Integration Testing

Integration tests run against a real Stash server to validate API functionality.

**Setup (first time):**
1. Ensure `.env` has `STASH_URL` and `STASH_API_KEY`
2. Copy `server/integration/fixtures/testEntities.example.ts` to `testEntities.ts`
3. Fill in entity IDs from your Stash library

**Running tests:**
- `cd server && npm run test:integration` - Run against persistent test DB
- `cd server && npm run test:integration:fresh` - Reset DB and test setup flow
- `cd server && npm run test:integration:watch` - Watch mode for development

**Pre-release validation:**
Run `/pre-release` to execute all checks before tagging a release.
```

**Step 3: Commit**

```bash
git add .claude/skills/pre-release.md CLAUDE.md
git commit -m "feat: add pre-release skill and integration testing documentation"
```

---

## Task 12: Final Verification and Cleanup

**Step 1: Run all integration tests**

Run: `cd server && npm run test:integration`
Expected: All tests pass

**Step 2: Run TypeScript compilation**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run linter**

Run: `cd server && npm run lint`
Expected: No errors (warnings OK)

**Step 4: Verify unit tests still pass**

Run: `cd server && npm test`
Expected: All 500+ unit tests still pass

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues found during final verification"
```

**Step 6: Push branch**

```bash
git push -u origin feature/integration-testing-infrastructure
```

---

## Summary

After completing all tasks, you will have:

1. **Integration test infrastructure** in `server/integration/`
2. **Vitest config** for running integration tests separately from unit tests
3. **Test HTTP client** with authentication support
4. **Global setup/teardown** that starts/stops the Express server
5. **Test database** that persists between runs (with fresh option)
6. **Integration tests** for:
   - Health/version endpoints
   - All entity APIs (scenes, performers, studios, tags, groups, galleries, images)
   - Authentication flow
   - Content restrictions
7. **Pre-release skill** for running all validation checks
8. **Documentation** in CLAUDE.md for running tests

**NPM scripts added:**
- `npm run test:integration` - Run integration tests
- `npm run test:integration:watch` - Watch mode
- `npm run test:integration:fresh` - Fresh database run
