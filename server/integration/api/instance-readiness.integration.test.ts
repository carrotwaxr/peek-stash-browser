/**
 * A newly added Stash instance shows once its first sync's exclusions are
 * computed (item 42, CS-18). Until then it is hidden from everyone, admins
 * included: its content is not listed, a user whose every instance is on
 * its first sync gets the "initializing" 503, and its media is not served.
 * The admin's sync status reports `firstSyncedAt` per instance.
 *
 * The instance is the replay's second library under a made-up id. This
 * file creates its row and runs its syncs in the test process, so a spy can
 * look through the server's API while the first sync has written every row
 * and its exclusion recompute has not run yet. A no-op rename through the
 * API reloads the server's instance list, so the server can serve the
 * instance's media once it shows. Replay runs only: the second library is
 * the production Stash in a live run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { must } from "../../tests/helpers/must.js";
import type { SyncStatusResponse } from "../../types/api/sync.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import { TEST_CONFIG } from "../helpers/config.js";
import { type TestClient, adminClient } from "../helpers/testClient.js";
import { SECOND_ID_OFFSET } from "../stash-replay/library.js";

const SECOND_URL = process.env.STASH_SECOND_URL;
const SECOND_API_KEY = process.env.STASH_SECOND_API_KEY;
const describeReplay =
  process.env.STASH_REPLAY === "1" && SECOND_URL && SECOND_API_KEY
    ? describe
    : describe.skip;

/** The instance this file adds, and removes again */
const NEW = "readiness-it";
/** The Always-hide tag on it: the test library's restrictable tag, renumbered */
const TAG = String(Number(TEST_ENTITIES.restrictableTag) + SECOND_ID_OFFSET);
const PASSWORD = "Readiness-IT-password-1";

interface ListedScene {
  id: string;
  instanceId: string;
}

/** What the server shows of the new instance at one moment. */
interface Observation {
  /** NEW's scene ids in each user's scene list */
  restrictedScenes: string[];
  adminScenes: string[];
  /** POST /api/library/scenes for the user whose only instance is NEW */
  onlyNew: { status: number; ready: unknown };
  /** The admin's GET of a NEW scene's screenshot */
  screenshot: number;
  /** firstSyncedAt of NEW and of the primary instance in the sync status */
  firstSyncedAt: { new: unknown; primary: unknown };
}

/** Waits up to `ms` for `done`, polling every half second. */
async function waitFor(
  what: string,
  done: () => Promise<boolean>,
  ms = 120_000
): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function serverSyncIdle(): Promise<boolean> {
  const res = await adminClient.get<{ inProgress: boolean }>(
    "/api/sync/status"
  );
  return res.status === 200 && !res.data.inProgress;
}

/** Logs in with raw fetch and returns the `token=` cookie for media. */
async function loginCookie(
  username: string,
  password: string
): Promise<string> {
  const res = await fetch(`${TEST_CONFIG.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const token = res.headers.get("set-cookie")?.match(/token=([^;]+)/)?.[1];
  await res.body?.cancel();
  if (!res.ok || !token) {
    throw new Error(`Login failed for ${username}: ${res.status}`);
  }
  return `token=${token}`;
}

/** NEW's scene ids in `client`'s scene list. */
async function newScenesListedTo(client: TestClient): Promise<string[]> {
  const res = await client.post<{
    findScenes: { count: number; scenes: ListedScene[] };
  }>("/api/library/scenes", { filter: { per_page: 1000 } });
  expect(res.status).toBe(200);
  expect(res.data.findScenes.count).toBeLessThanOrEqual(1000);
  return res.data.findScenes.scenes
    .filter((scene) => scene.instanceId === NEW)
    .map((scene) => scene.id)
    .sort();
}

async function firstSyncedAtOf(instanceId: string): Promise<unknown> {
  return (
    await prisma.$queryRawUnsafe<Array<{ at: unknown }>>(
      `SELECT "firstSyncedAt" AS at FROM "StashInstance" WHERE "id" = ?`,
      instanceId
    )
  )[0]?.at;
}

/** As a changed URL does (updateStashInstance): the instance is new again. */
async function clearFirstSyncedAt(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "StashInstance" SET "firstSyncedAt" = NULL WHERE "id" = ?`,
    NEW
  );
}

describeReplay("an instance on its first sync", () => {
  let primaryId: string;
  let adminCookie: string;
  let adminSelection: string[] = [];
  let restricted: { id: number; client: TestClient };
  let onlyNew: { id: number; client: TestClient };
  /** The users this file created, deleted again afterwards */
  const createdUsers: number[] = [];
  /** A scene of NEW, for the media request */
  let sceneId: string;
  let before: Observation;
  let during: Observation;
  let after: Observation;
  let syncStartedAt: number;

  async function observe(): Promise<Observation> {
    const scenes = await onlyNew.client.post<{ ready?: unknown }>(
      "/api/library/scenes",
      { filter: { per_page: 1 } }
    );
    const screenshot = await fetch(
      `${TEST_CONFIG.baseUrl}/api/proxy/stash?path=${encodeURIComponent(`/scene/${sceneId}/screenshot`)}&instanceId=${NEW}`,
      { headers: { Cookie: adminCookie } }
    );
    await screenshot.body?.cancel();
    const status =
      await adminClient.get<SyncStatusResponse>("/api/sync/status");
    expect(status.status).toBe(200);
    const instance = (id: string) =>
      must(
        status.data.instances.find((i) => i.instanceId === id),
        `the status of ${id}`
      );
    return {
      restrictedScenes: await newScenesListedTo(restricted.client),
      adminScenes: await newScenesListedTo(adminClient),
      onlyNew: { status: scenes.status, ready: scenes.data.ready },
      screenshot: screenshot.status,
      firstSyncedAt: {
        new: instance(NEW).firstSyncedAt,
        primary: instance(primaryId).firstSyncedAt,
      },
    };
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    adminCookie = await loginCookie(TEST_ADMIN.username, TEST_ADMIN.password);
    // Another file's instance sync must not run beside this file's
    await waitFor("the server's sync to finish", serverSyncIdle);

    const instances = await adminClient.get<{
      instances: Array<{ id: string; url: string }>;
    }>("/api/setup/stash-instances");
    primaryId = must(
      instances.data.instances.find((i) => i.url === process.env.STASH_URL),
      "the primary instance"
    ).id;
    // The admin sees every instance while this file runs
    const selection = await adminClient.get<{ selectedInstanceIds: string[] }>(
      "/api/user/stash-instances"
    );
    adminSelection = selection.data.selectedInstanceIds;
    await adminClient.put("/api/user/stash-instances", { instanceIds: [] });

    // Added as the admin's form does, before any sync: raw SQL, so the row
    // is written the same way whatever columns the schema has
    await prisma.$executeRawUnsafe(
      `INSERT INTO "StashInstance" ("id", "name", "url", "apiKey", "enabled", "priority", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 1, 970, ?, ?)`,
      NEW,
      NEW,
      must(SECOND_URL, "STASH_SECOND_URL"),
      must(SECOND_API_KEY, "STASH_SECOND_API_KEY"),
      Date.now(),
      Date.now()
    );
    await stashInstanceManager.reload();
    // The server reloads its instance list on an update: it can then serve
    // NEW's media, and syncs nothing
    const renamed = await adminClient.put<{ sync: string }>(
      `/api/setup/stash-instance/${NEW}`,
      { name: "Readiness (first sync)" }
    );
    expect(renamed.status).toBe(200);
    expect(renamed.data.sync).toBe("none");

    // Always-hide TAG on NEW; no selection, so every instance
    restricted = await createApiUser("readiness_it_restricted", PASSWORD);
    createdUsers.push(restricted.id);
    await prisma.userContentRestriction.create({
      data: {
        userId: restricted.id,
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: JSON.stringify([`${TAG}:${NEW}`]),
      },
    });
    // Only NEW selected
    onlyNew = await createApiUser("readiness_it_only_new", PASSWORD);
    createdUsers.push(onlyNew.id);
    await prisma.userStashInstance.create({
      data: { userId: onlyNew.id, instanceId: NEW },
    });

    // The second library's scenes are renumbered test scenes
    sceneId = String(
      Number(TEST_ENTITIES.sceneWithRelations) + SECOND_ID_OFFSET
    );
    before = await observe();

    // The first sync, as adding the instance queues it. The spy looks when
    // every row is written and the recompute is next
    const recomputeAll = exclusionComputationService.recomputeAllUsers.bind(
      exclusionComputationService
    );
    const spy = vi
      .spyOn(exclusionComputationService, "recomputeAllUsers")
      .mockImplementation(async () => {
        during = await observe();
        return recomputeAll();
      });
    syncStartedAt = Date.now();
    try {
      await stashSyncService.fullSync(NEW);
    } finally {
      spy.mockRestore();
    }
    after = await observe();
  }, 240_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of createdUsers) {
      await adminClient.delete(`/api/user/${id}`);
    }
    await adminClient.put("/api/user/stash-instances", {
      instanceIds: adminSelection,
    });
    // Through the server, which reloads its instance list; the purge of the
    // cached library runs after the answer, SyncState last
    await adminClient.delete(`/api/setup/stash-instance/${NEW}`);
    await waitFor(
      "the instance's purge",
      async () =>
        (await prisma.stashInstance.count({ where: { id: NEW } })) === 0 &&
        (await prisma.syncState.count({ where: { stashInstanceId: NEW } })) ===
          0 &&
        (await prisma.stashScene.count({ where: { stashInstanceId: NEW } })) ===
          0
    );
    await stashInstanceManager.reload();
  }, 180_000);

  it("a user with an Always-hide restriction sees none of a newly added instance's scenes until its first sync has finished, then sees exactly the allowed ones", async () => {
    // Before the sync there is nothing; once every row is written, still
    // nothing, for the restricted user and the admin alike
    expect(before.restrictedScenes).toEqual([]);
    expect(during.restrictedScenes).toEqual([]);
    expect(during.adminScenes).toEqual([]);

    // Afterwards the admin sees the whole library, the user all of it but
    // what the restriction excludes, and at least every scene tagged TAG
    const live = await prisma.stashScene.findMany({
      where: { stashInstanceId: NEW, deletedAt: null },
      select: { id: true },
    });
    expect(after.adminScenes).toEqual(live.map((s) => s.id).sort());
    const excluded = new Set(
      (
        await prisma.userExcludedEntity.findMany({
          where: {
            userId: restricted.id,
            entityType: "scene",
            instanceId: NEW,
          },
          select: { entityId: true },
        })
      ).map((row) => row.entityId)
    );
    const tagged = await prisma.sceneTag.findMany({
      where: { tagId: TAG, tagInstanceId: NEW, sceneInstanceId: NEW },
      select: { sceneId: true },
    });
    expect(tagged.length).toBeGreaterThan(0);
    for (const { sceneId: id } of tagged) {
      expect(excluded.has(id), `scene ${id} is tagged`).toBe(true);
    }
    expect(after.restrictedScenes).toEqual(
      after.adminScenes.filter((id) => !excluded.has(id))
    );
    expect(after.restrictedScenes.length).toBeGreaterThan(0);
  });

  it("requireCacheReady answers 503 ready:false for a user whose every selected instance is still on its first sync", () => {
    expect(before.onlyNew).toEqual({ status: 503, ready: false });
    expect(during.onlyNew).toEqual({ status: 503, ready: false });
    expect(after.onlyNew.status).toBe(200);
  });

  it("GET /api/sync/status reports firstSyncedAt per instance", () => {
    expect(before.firstSyncedAt.new).toBeNull();
    expect(during.firstSyncedAt.new).toBeNull();
    // The primary instance synced at the run's start
    expect(typeof during.firstSyncedAt.primary).toBe("string");
    expect(typeof after.firstSyncedAt.new).toBe("string");
    expect(Date.parse(String(after.firstSyncedAt.new))).toBeGreaterThanOrEqual(
      syncStartedAt
    );
  });

  it("the media of a first-syncing instance is not served, to an admin either", () => {
    expect(during.screenshot).toBe(404);
    expect(after.screenshot).toBe(200);
  });

  it("a re-pointed instance whose content is unchanged is ready after its sync", async () => {
    await clearFirstSyncedAt();
    expect(await newScenesListedTo(adminClient)).toEqual([]);

    // Stash has nothing new: the sync changes nothing
    const results = await stashSyncService.incrementalSync(NEW);

    expect(results.map((r) => [r.entityType, r.synced])).toEqual(
      results.map((r) => [r.entityType, 0])
    );
    expect(await firstSyncedAtOf(NEW)).not.toBeNull();
    expect(await newScenesListedTo(adminClient)).toEqual(after.adminScenes);
    expect(await newScenesListedTo(restricted.client)).toEqual(
      after.restrictedScenes
    );
  }, 120_000);

  it("an instance stays hidden from everyone while a recompute of one of its users fails, and the next sync shows it", async () => {
    await clearFirstSyncedAt();
    const recompute = exclusionComputationService.recomputeForUser.bind(
      exclusionComputationService
    );
    const recomputed: number[] = [];
    const spy = vi
      .spyOn(exclusionComputationService, "recomputeForUser")
      .mockImplementation(async (userId) => {
        recomputed.push(userId);
        if (userId === restricted.id) {
          throw new Error("readiness-it: this recompute fails");
        }
        await recompute(userId);
      });
    try {
      await stashSyncService.incrementalSync(NEW);
    } finally {
      spy.mockRestore();
    }

    expect(recomputed).toContain(restricted.id);
    expect(await firstSyncedAtOf(NEW)).toBeNull();
    expect(await newScenesListedTo(adminClient)).toEqual([]);
    expect(await newScenesListedTo(restricted.client)).toEqual([]);

    // The next sync recomputes the users again, and the instance shows
    await stashSyncService.incrementalSync(NEW);

    expect(await firstSyncedAtOf(NEW)).not.toBeNull();
    expect(await newScenesListedTo(adminClient)).toEqual(after.adminScenes);
    expect(await newScenesListedTo(restricted.client)).toEqual(
      after.restrictedScenes
    );
  }, 120_000);

  it("a restricted user whose only selected instance is disabled sees every enabled instance, filtered by their restrictions, not the 503", async () => {
    // Always-hide the test library's restrictable tag on the primary
    // instance, and select only NEW: nothing of the primary is in scope
    const user = await createApiUser("readiness_it_disabled_only", PASSWORD);
    createdUsers.push(user.id);
    await prisma.userContentRestriction.create({
      data: {
        userId: user.id,
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: JSON.stringify([
          `${TEST_ENTITIES.restrictableTag}:${primaryId}`,
        ]),
      },
    });
    await prisma.userStashInstance.create({
      data: { userId: user.id, instanceId: NEW },
    });
    await exclusionComputationService.recomputeForUser(user.id);
    const primaryExclusions = () =>
      prisma.userExcludedEntity.findMany({
        where: { userId: user.id, entityType: "scene", instanceId: primaryId },
        select: { entityId: true },
      });
    expect(await primaryExclusions()).toEqual([]);

    const disabled = await adminClient.put(`/api/setup/stash-instance/${NEW}`, {
      enabled: false,
    });
    try {
      expect(disabled.status).toBe(200);
      const res = await user.client.post<{
        findScenes: { count: number; scenes: ListedScene[] };
        ready?: unknown;
      }>("/api/library/scenes", { filter: { per_page: 1000 } });
      expect({ status: res.status, ready: res.data.ready }).toEqual({
        status: 200,
        ready: undefined,
      });

      // The disable recomputed the user over the instances they now see
      const excluded = new Set(
        (await primaryExclusions()).map((row) => row.entityId)
      );
      const tagged = await prisma.sceneTag.findMany({
        where: {
          tagId: TEST_ENTITIES.restrictableTag,
          tagInstanceId: primaryId,
          sceneInstanceId: primaryId,
        },
        select: { sceneId: true },
      });
      expect(tagged.length).toBeGreaterThan(0);
      for (const { sceneId: id } of tagged) {
        expect(excluded.has(id), `scene ${id} is tagged`).toBe(true);
      }

      // Everything the admin sees (every enabled instance) but the user's
      // excluded scenes
      const admin = await adminClient.post<{
        findScenes: { count: number; scenes: ListedScene[] };
      }>("/api/library/scenes", { filter: { per_page: 1000 } });
      expect(admin.status).toBe(200);
      expect(admin.data.findScenes.count).toBeLessThanOrEqual(1000);
      const rows = await prisma.userExcludedEntity.findMany({
        where: { userId: user.id, entityType: "scene" },
        select: { entityId: true, instanceId: true },
      });
      const isExcluded = (scene: ListedScene) =>
        rows.some(
          (row) =>
            row.entityId === scene.id &&
            (row.instanceId === "" || row.instanceId === scene.instanceId)
        );
      const key = (scene: ListedScene) => `${scene.id}:${scene.instanceId}`;
      const listed = res.data.findScenes.scenes.map(key).sort();
      expect(listed.some((k) => k.endsWith(`:${primaryId}`))).toBe(true);
      expect(listed.some((k) => k.endsWith(`:${NEW}`))).toBe(false);
      expect(listed).toEqual(
        admin.data.findScenes.scenes
          .filter((scene) => !isExcluded(scene))
          .map(key)
          .sort()
      );
    } finally {
      await adminClient.put(`/api/setup/stash-instance/${NEW}`, {
        enabled: true,
      });
    }
  }, 120_000);
});
