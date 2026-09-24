import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  hashRecoveryKey,
} from "../../utils/recoveryKey.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { TestClient, adminClient } from "../helpers/testClient.js";

/**
 * Integration tests for session ends and recovery keys (sweep item 8).
 *
 * A password change or reset stamps User.passwordChangedAt, and a token issued
 * in an earlier second is refused. Tokens carry whole seconds, so each test
 * waits 1100 ms between the last login it expects revoked and the password
 * write. Recovery keys are stored as SHA-256 hex and returned only on creation.
 */

const USERNAME = "session_test_user";
const KEY_PATTERN = /^([A-Z2-9]{4}-){6}[A-Z2-9]{4}$/;
const SESSION_EXPIRED = { error: "Session expired. Please log in again." };

const waitPastTokenSecond = () =>
  new Promise((resolve) => setTimeout(resolve, 1100));

describe("Session end and recovery keys", () => {
  let userId: number;
  let password = "SessionTest1";
  let passwordCount = 1;
  const nextPassword = () => `SessionTest${++passwordCount}`;

  async function signedInClient(): Promise<TestClient> {
    const client = new TestClient();
    await client.login(USERNAME, password);
    return client;
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);

    const created = await adminClient.post<{ user: { id: number } }>(
      "/api/user/create",
      { username: USERNAME, password, role: "USER" }
    );
    if (created.ok) {
      userId = created.data.user.id;
      return;
    }

    // Left over from an interrupted run: find it and give it a known password
    const users = await adminClient.get<{
      users: Array<{ id: number; username: string }>;
    }>("/api/user/all");
    const existing = users.data.users?.find((u) => u.username === USERNAME);
    if (!existing) {
      throw new Error(`Failed to create or find ${USERNAME}`);
    }
    userId = existing.id;
    const reset = await adminClient.post(`/api/user/${userId}/reset-password`, {
      newPassword: password,
    });
    if (!reset.ok) {
      throw new Error(`Failed to reset ${USERNAME}: ${reset.status}`);
    }
  });

  afterAll(async () => {
    if (userId) {
      await adminClient.delete(`/api/user/${userId}`);
    }
  });

  it("changing the password signs out other sessions and keeps this one", async () => {
    const current = await signedInClient();
    const other = await signedInClient();
    await waitPastTokenSecond();

    const newPassword = nextPassword();
    const changed = await current.post("/api/user/change-password", {
      currentPassword: password,
      newPassword,
    });
    expect(changed.status).toBe(200);
    password = newPassword;

    expect((await current.get("/api/auth/me")).status).toBe(200);
    const otherMe = await other.get("/api/auth/me");
    expect(otherMe.status).toBe(401);
    expect(otherMe.data).toEqual(SESSION_EXPIRED);
  });

  it("an admin reset signs the user out", async () => {
    const client = await signedInClient();
    await waitPastTokenSecond();

    const newPassword = nextPassword();
    const reset = await adminClient.post(`/api/user/${userId}/reset-password`, {
      newPassword,
    });
    expect(reset.status).toBe(200);
    password = newPassword;

    const me = await client.get("/api/auth/me");
    expect(me.status).toBe(401);
    expect(me.data).toEqual(SESSION_EXPIRED);
  });

  it("a recovery-key reset signs the user out", async () => {
    const client = await signedInClient();
    const key = await adminClient.post<{ recoveryKey: string }>(
      `/api/user/${userId}/regenerate-recovery-key`
    );
    expect(key.status).toBe(200);
    await waitPastTokenSecond();

    const newPassword = nextPassword();
    const reset = await new TestClient().post(
      "/api/auth/forgot-password/reset",
      { username: USERNAME, recoveryKey: key.data.recoveryKey, newPassword }
    );
    expect(reset.status).toBe(200);
    password = newPassword;

    const me = await client.get("/api/auth/me");
    expect(me.status).toBe(401);
    expect(me.data).toEqual(SESSION_EXPIRED);
  });

  it("recovery keys are stored hashed and never returned after creation", async () => {
    const key = await adminClient.post<{ recoveryKey: string }>(
      `/api/user/${userId}/regenerate-recovery-key`
    );
    expect(key.status).toBe(200);
    const client = await signedInClient();

    const shown = await client.get("/api/user/recovery-key");
    expect(shown.status).toBe(200);
    expect(shown.data).toEqual({ hasRecoveryKey: true });

    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryKeyHash: true },
    });
    expect(row?.recoveryKeyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("creating a key needs the current password", async () => {
    const client = await signedInClient();

    const missing = await client.post("/api/user/recovery-key/regenerate");
    expect(missing.status).toBe(400);

    const wrong = await client.post("/api/user/recovery-key/regenerate", {
      currentPassword: "NotThePassword1",
    });
    expect(wrong.status).toBe(400);

    const right = await client.post<{ recoveryKey: string }>(
      "/api/user/recovery-key/regenerate",
      { currentPassword: password }
    );
    expect(right.status).toBe(200);
    expect(right.data.recoveryKey).toMatch(KEY_PATTERN);
  });

  it("a legacy plaintext key still resets the password after hashLegacyRecoveryKeys", async () => {
    // Versions before 3.3.7 stored the 28-character key itself
    const legacyKey = generateRecoveryKey();
    await prisma.user.update({
      where: { id: userId },
      data: { recoveryKeyHash: legacyKey },
    });

    const { hashLegacyRecoveryKeys } =
      await import("../../initializers/recoveryKeys.js");
    expect(await hashLegacyRecoveryKeys()).toBeGreaterThanOrEqual(1);

    const newPassword = nextPassword();
    const reset = await new TestClient().post(
      "/api/auth/forgot-password/reset",
      {
        username: USERNAME,
        recoveryKey: formatRecoveryKey(legacyKey),
        newPassword,
      }
    );
    expect(reset.status).toBe(200);
    password = newPassword;
  });

  it("a key 3.3.6 wrote to recoveryKey after a downgrade replaces the hash and resets the password", async () => {
    // 3.3.6 generates a plaintext key at sign-in and stores it in recoveryKey,
    // leaving the older hash in recoveryKeyHash
    const oldKey = generateRecoveryKey();
    const downgradeKey = generateRecoveryKey();
    await prisma.user.update({
      where: { id: userId },
      data: {
        recoveryKeyHash: hashRecoveryKey(oldKey),
        recoveryKey: downgradeKey,
      },
    });

    const { hashLegacyRecoveryKeys } =
      await import("../../initializers/recoveryKeys.js");
    expect(await hashLegacyRecoveryKeys()).toBeGreaterThanOrEqual(1);

    const stored = await prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryKey: true, recoveryKeyHash: true },
    });
    expect(stored).toEqual({
      recoveryKey: null,
      recoveryKeyHash: hashRecoveryKey(downgradeKey),
    });
    // Idempotent: a second run leaves the row alone
    await hashLegacyRecoveryKeys();
    expect(
      await prisma.user.findUnique({
        where: { id: userId },
        select: { recoveryKey: true, recoveryKeyHash: true },
      })
    ).toEqual(stored);

    const newPassword = nextPassword();
    const reset = await new TestClient().post(
      "/api/auth/forgot-password/reset",
      {
        username: USERNAME,
        recoveryKey: formatRecoveryKey(downgradeKey),
        newPassword,
      }
    );
    expect(reset.status).toBe(200);
    password = newPassword;
  });
});
