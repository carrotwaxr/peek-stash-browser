/**
 * PUT /api/sync/settings saves the settings and, when the interval changed,
 * re-arms the scheduler's timer (item 42, SYNC-15). It never starts a sync,
 * so it answers at once instead of after one.
 *
 * Any sync rewrites every synced type's `lastError` (an unchanged type's to
 * null), so a marker left in one type's `lastError` shows that none ran.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import type { SyncStatusResponse } from "../../types/api/sync.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient } from "../helpers/testClient.js";

const PRIMARY_URL = must(process.env.STASH_URL, "STASH_URL");
const MARKER = "sync-settings.integration: a sync would clear this";

interface SettingsResponse {
  ok: boolean;
  settings: SyncStatusResponse["settings"];
}

async function syncStatus(): Promise<SyncStatusResponse> {
  const res = await adminClient.get<SyncStatusResponse>("/api/sync/status");
  expect(res.status).toBe(200);
  return res.data;
}

/** Waits up to two minutes for no sync to run. */
async function waitForIdleSync(): Promise<void> {
  const deadline = Date.now() + 120_000;
  while ((await syncStatus()).inProgress) {
    if (Date.now() > deadline) throw new Error("A sync is still running");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

describe("PUT /api/sync/settings", () => {
  let instanceId: string;
  let originalMinutes: number;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await waitForIdleSync();
    const instance = await prisma.stashInstance.findFirst({
      where: { url: PRIMARY_URL },
      select: { id: true },
    });
    instanceId = must(instance, "the test instance").id;
    originalMinutes = (await syncStatus()).settings.syncIntervalMinutes;
  }, 150_000);

  afterAll(async () => {
    await adminClient.put("/api/sync/settings", {
      syncIntervalMinutes: originalMinutes,
    });
    await prisma.syncState.updateMany({
      where: { lastError: MARKER },
      data: { lastError: null },
    });
  });

  it("PUT /api/sync/settings answers before any sync starts and /api/sync/status shows inProgress false right after", async () => {
    await prisma.syncState.updateMany({
      where: { stashInstanceId: instanceId, entityType: "tag" },
      data: { lastError: MARKER },
    });
    const minutes = originalMinutes === 120 ? 240 : 120;

    const put = await adminClient.put<SettingsResponse>("/api/sync/settings", {
      syncIntervalMinutes: minutes,
    });

    expect(put.status).toBe(200);
    expect(put.data.settings.syncIntervalMinutes).toBe(minutes);

    const status = await syncStatus();
    expect(status.inProgress).toBe(false);
    expect(status.settings.syncIntervalMinutes).toBe(minutes);
    // No sync ran during the request or since
    const tag = must(
      must(
        status.instances.find((i) => i.instanceId === instanceId),
        "the test instance's status"
      ).states.find((state) => state.entityType === "tag"),
      "its tag state"
    );
    expect(tag.lastError).toBe(MARKER);
  });
});
