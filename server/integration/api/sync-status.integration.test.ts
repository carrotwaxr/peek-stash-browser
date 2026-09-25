/**
 * GET /api/sync/status reports every configured instance's sync state
 * (item 20, SYNC-14): one entry per instance, with its name, whether it is
 * enabled and its per-type `SyncState` rows, and never a Stash address. It
 * is admin-only (adminOnlyInfo.test.ts covers the 403).
 *
 * `20260925000800_sync_state_instance_required` makes
 * `SyncState.stashInstanceId` NOT NULL, deleting the rows of no instance or
 * of a missing one first.
 */
import { cpSync } from "fs";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runPrismaCli } from "../../initializers/migrations.js";
import prisma from "../../prisma/singleton.js";
import { arrayContaining } from "../../tests/helpers/matchers.js";
import { must } from "../../tests/helpers/must.js";
import type { SyncStatusResponse } from "../../types/api/sync.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
} from "../helpers/migrationSandbox.js";
import { adminClient } from "../helpers/testClient.js";

/** The eight types every sync saves a state for. */
const ENTITY_TYPES = [
  "clip",
  "gallery",
  "group",
  "image",
  "performer",
  "scene",
  "studio",
  "tag",
];

const PRIMARY_URL = must(process.env.STASH_URL, "STASH_URL");
const PRIMARY_API_KEY = must(process.env.STASH_API_KEY, "STASH_API_KEY");
// The second instance globalSetup allows for this run (replay: always)
const SECOND_URL = process.env.STASH_SECOND_URL;
const SECOND_API_KEY = process.env.STASH_SECOND_API_KEY;
const RUN_URLS = SECOND_URL ? [PRIMARY_URL, SECOND_URL] : [PRIMARY_URL];
const RUN_API_KEYS = SECOND_API_KEY
  ? [PRIMARY_API_KEY, SECOND_API_KEY]
  : [PRIMARY_API_KEY];

interface ConfiguredInstance {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

async function listInstances(): Promise<ConfiguredInstance[]> {
  const res = await adminClient.get<{ instances: ConfiguredInstance[] }>(
    "/api/setup/stash-instances"
  );
  expect(res.status).toBe(200);
  return res.data.instances;
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

async function syncIdle(): Promise<boolean> {
  const res = await adminClient.get<{ inProgress: boolean }>(
    "/api/sync/status"
  );
  return res.status === 200 && !res.data.inProgress;
}

describe("GET /api/sync/status", () => {
  /** The second instance this file added, which afterAll deletes again. */
  let added: string | undefined;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    if (!SECOND_URL || !SECOND_API_KEY) return;
    if ((await listInstances()).some((i) => i.url === SECOND_URL)) return;

    // multi-instance.integration.test.ts adds the same instance when it runs
    // first; without it this file adds it and waits for its first sync
    await waitFor("the sync to finish", syncIdle);
    const res = await adminClient.post<{ instance: ConfiguredInstance }>(
      "/api/setup/stash-instance",
      {
        name: "Second Stash (sync status)",
        url: SECOND_URL,
        apiKey: SECOND_API_KEY,
        enabled: true,
        priority: 2,
      }
    );
    expect(res.status).toBe(201);
    const id = res.data.instance.id;
    added = id;
    await waitFor(
      "the second instance's first sync",
      async () =>
        (await prisma.syncState.count({ where: { stashInstanceId: id } })) ===
          ENTITY_TYPES.length && (await syncIdle())
    );
  }, 180_000);

  afterAll(async () => {
    if (added === undefined) return;
    const id = added;
    await adminClient.delete(`/api/setup/stash-instance/${id}`);
    // The purge runs after the answer; its last step is SyncState
    await waitFor(
      "the second instance's purge",
      async () =>
        (await prisma.syncState.count({ where: { stashInstanceId: id } })) === 0
    );
  }, 180_000);

  it("GET /api/sync/status lists every configured instance with its eight entity states and no Stash address", async () => {
    // The run's Stash instances are configured
    const configured = await listInstances();
    expect(configured.map((i) => i.url)).toEqual(arrayContaining(RUN_URLS));

    const res = await adminClient.get<SyncStatusResponse>("/api/sync/status");
    expect(res.status).toBe(200);
    const status = res.data;

    // Every configured instance, and only those
    expect(status.instances.map((i) => i.instanceId).sort()).toEqual(
      configured.map((i) => i.id).sort()
    );
    expect(status.inProgress).toBe(false);
    expect(status.activeJob).toBeNull();
    expect(typeof status.settings.syncIntervalMinutes).toBe("number");
    expect(typeof status.settings.enableScanSubscription).toBe("boolean");
    for (const instance of status.instances) {
      const config = must(
        configured.find((c) => c.id === instance.instanceId),
        `instance ${instance.instanceId}`
      );
      expect(instance.name).toBe(config.name);
      expect(instance.enabled).toBe(config.enabled);
    }

    // The run's Stash instances: the eight types each, synced cleanly
    for (const url of RUN_URLS) {
      const config = must(
        configured.find((c) => c.url === url),
        `the instance at ${url}`
      );
      const instance = must(
        status.instances.find((i) => i.instanceId === config.id),
        `the status of ${config.id}`
      );
      expect(instance.states.map((s) => s.entityType).sort()).toEqual(
        ENTITY_TYPES
      );
      for (const state of instance.states) {
        expect(Object.keys(state)).not.toContain("id");
        expect(Object.keys(state)).not.toContain("stashInstanceId");
        expect(state.lastError).toBeNull();
        expect(
          state.lastFullSyncActual ?? state.lastIncrementalSyncActual
        ).not.toBeNull();
      }
    }

    // No Stash address and no API key anywhere in the answer
    const body = JSON.stringify(status);
    for (const url of RUN_URLS) {
      expect(body).not.toContain(new URL(url).host);
    }
    for (const apiKey of RUN_API_KEYS) {
      expect(body).not.toContain(apiKey);
    }
  });
});

describe("sync state instance required migration", () => {
  /** The newest migration before this one */
  const BEFORE = "20260925000600_drop_plugin_webhook_setting";
  const MIGRATION = "20260925000800_sync_state_instance_required";

  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  type Row = Record<string, unknown>;

  it("the migration removes NULL-instance SyncState rows and makes the column NOT NULL", async () => {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;

    // Raw SQL: the client follows the current schema, whose StashInstance
    // has columns later migrations add (lastFullPassAt, 20260925000850)
    for (const id of ["inst-a", "inst-b"]) {
      await client.$executeRawUnsafe(
        `INSERT INTO "StashInstance" ("id", "name", "url", "apiKey", "createdAt", "updatedAt")
         VALUES (?, ?, ?, 'k', ?, ?)`,
        id,
        id,
        `http://${id}:9999/graphql`,
        Date.now(),
        Date.now()
      );
    }
    // Kept: rows of the two instances, every column set on one of them.
    // Gone: January's rows with no instance and a deleted instance's row,
    // with the highest ids, so the counter must not fall back to 3
    const rows: Array<[number, string | null, string]> = [
      [1, "inst-a", "scene"],
      [2, "inst-a", "tag"],
      [3, "inst-b", "scene"],
      [4, null, "scene"],
      [5, null, "tag"],
      [6, "gone", "scene"],
    ];
    for (const [id, instance, entityType] of rows) {
      await client.$executeRawUnsafe(
        `INSERT INTO "SyncState" ("id", "stashInstanceId", "entityType",
           "lastFullSyncTimestamp", "lastIncrementalSyncTimestamp",
           "lastFullSyncActual", "lastIncrementalSyncActual", "lastSyncCount",
           "lastSyncDurationMs", "lastError", "totalEntities")
         VALUES (?, ?, ?, '2026-09-20T10:00:00-07:00',
           '2026-09-24T10:00:00-07:00', ?, ?, ?, 1200, ?, ?)`,
        id,
        instance,
        entityType,
        Date.UTC(2026, 8, 20, 17),
        Date.UTC(2026, 8, 24, 17),
        id * 10,
        id === 3 ? "FindScenes: something broke (HTTP 200)" : null,
        id * 100
      );
    }
    const before = await client.$queryRawUnsafe<Row[]>(
      `SELECT * FROM "SyncState" ORDER BY "id"`
    );

    await client.$disconnect();
    cpSync(
      path.join(PRISMA_DIR, "migrations", MIGRATION),
      path.join(db.prismaDir, "migrations", MIGRATION),
      { recursive: true }
    );
    await runPrismaCli(["migrate", "deploy"], {
      prismaDir: db.prismaDir,
      databaseUrl: db.url,
    });

    // The rows of existing instances, unchanged in every column
    const after = await client.$queryRawUnsafe<Row[]>(
      `SELECT * FROM "SyncState" ORDER BY "id"`
    );
    expect(after).toEqual(
      before.filter(
        (row) =>
          row.stashInstanceId === "inst-a" || row.stashInstanceId === "inst-b"
      )
    );

    // NOT NULL, the unique key, and the counter past the deleted ids
    const columns = await client.$queryRawUnsafe<
      Array<{ name: string; notnull: bigint }>
    >(`SELECT "name", "notnull" FROM pragma_table_info('SyncState')`);
    expect(
      must(
        columns.find((c) => c.name === "stashInstanceId"),
        "the stashInstanceId column"
      ).notnull
    ).toBe(1n);
    await expect(
      client.$executeRawUnsafe(
        `INSERT INTO "SyncState" ("stashInstanceId", "entityType") VALUES (NULL, 'group')`
      )
    ).rejects.toThrow(/NOT NULL/);
    await expect(
      client.$executeRawUnsafe(
        `INSERT INTO "SyncState" ("stashInstanceId", "entityType") VALUES ('inst-a', 'scene')`
      )
    ).rejects.toThrow(/UNIQUE/);
    const indexes = await client.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT "name" FROM sqlite_master WHERE "type" = 'index' AND "tbl_name" = 'SyncState' AND "sql" IS NOT NULL`
    );
    expect(indexes.map((i) => i.name)).toEqual([
      "SyncState_stashInstanceId_entityType_key",
    ]);
    const created = await client.syncState.create({
      data: { stashInstanceId: "inst-b", entityType: "tag" },
    });
    expect(created.id).toBe(7);

    expect(
      await client.$queryRawUnsafe<Array<{ integrity_check: string }>>(
        "PRAGMA integrity_check"
      )
    ).toEqual([{ integrity_check: "ok" }]);
    expect(
      await client.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check")
    ).toEqual([]);
  });
});
