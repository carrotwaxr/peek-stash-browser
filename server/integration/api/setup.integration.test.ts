import { type AddressInfo, createServer } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { TEST_CONFIG } from "../helpers/config.js";
import { TestClient, adminClient } from "../helpers/testClient.js";

/**
 * Integration tests for the setup window (sweep item 7).
 *
 * Setup is complete here, so the wizard's Stash routes need the admin session,
 * the reset endpoint is gone, and create-admin only ever fails. The rate-limit
 * test sends addresses from 203.0.113.0/24 (TEST-NET-3) through the trusted
 * loopback hop, which keeps localhost's own limiter budget untouched.
 */

const USERNAME = "setup_guard_user";
const PASSWORD = "SetupGuard1";
const STASH_ROUTES = [
  "/api/setup/test-stash-connection",
  "/api/setup/create-stash-instance",
];
const UNREACHABLE_STASH = { url: "http://127.0.0.1:9/graphql", apiKey: "x" };

/**
 * A Stash URL on a local port nothing listens on, so connecting is refused.
 * Not port 9: fetch refuses the ports it blocks ("bad port") without trying.
 */
async function refusingStash(): Promise<{ url: string; apiKey: string }> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return { url: `http://127.0.0.1:${port}/graphql`, apiKey: "x" };
}

async function anonymousCreateAdmin(address: string): Promise<number> {
  const response = await fetch(
    `${TEST_CONFIG.baseUrl}/api/setup/create-admin`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": address,
      },
      body: JSON.stringify({ username: "intruder", password: "Intruder1" }),
    }
  );
  await response.text();
  return response.status;
}

describe("Setup routes once setup is complete", () => {
  let userId: number;
  const userClient = new TestClient();

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);

    const created = await adminClient.post<{ user: { id: number } }>(
      "/api/user/create",
      { username: USERNAME, password: PASSWORD, role: "USER" }
    );
    if (created.ok) {
      userId = created.data.user.id;
    } else {
      // Left over from an interrupted run: find it and give it a known password
      const users = await adminClient.get<{
        users: Array<{ id: number; username: string }>;
      }>("/api/user/all");
      const existing = users.data.users?.find((u) => u.username === USERNAME);
      if (!existing) {
        throw new Error(`Failed to create or find ${USERNAME}`);
      }
      userId = existing.id;
      const reset = await adminClient.post(
        `/api/user/${userId}/reset-password`,
        { newPassword: PASSWORD }
      );
      if (!reset.ok) {
        throw new Error(`Failed to reset ${USERNAME}: ${reset.status}`);
      }
    }

    await userClient.login(USERNAME, PASSWORD);
  });

  afterAll(async () => {
    if (userId) {
      await adminClient.delete(`/api/user/${userId}`);
    }
  });

  it("POST /api/setup/reset returns 404", async () => {
    const response = await adminClient.post("/api/setup/reset", {});

    expect(response.status).toBe(404);
  });

  it("setup's Stash routes need an admin session", async () => {
    for (const path of STASH_ROUTES) {
      const anonymous = await new TestClient().post(path, UNREACHABLE_STASH);
      expect(anonymous.status, `anonymous ${path}`).toBe(401);

      const user = await userClient.post(path, UNREACHABLE_STASH);
      expect(user.status, `USER ${path}`).toBe(403);
    }
  });

  it("the admin gets the connection error reason without details, and cannot add a second first instance", async () => {
    const tested = await adminClient.post<Record<string, unknown>>(
      "/api/setup/test-stash-connection",
      await refusingStash()
    );
    expect(tested.status).toBe(400);
    expect(tested.data.error).toContain("Connection refused");
    expect(tested.data.details).toBeUndefined();

    const created = await adminClient.post<{ error: string }>(
      "/api/setup/create-stash-instance",
      UNREACHABLE_STASH
    );
    expect(created.status).toBe(403);
    expect(created.data.error).toContain("already exists");
  });

  it("anonymous create-admin is rate-limited per address", async () => {
    for (let i = 0; i < 20; i++) {
      expect(await anonymousCreateAdmin("203.0.113.50")).toBe(403);
    }
    expect(await anonymousCreateAdmin("203.0.113.50")).toBe(429);

    expect(await anonymousCreateAdmin("203.0.113.51")).toBe(403);
  });
});
