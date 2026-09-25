/**
 * Integration tests for the clip spec's batch writer
 * (ENTITY_SYNC.clip.processBatch), against the real test SQLite database.
 *
 * A page of scene markers is written with a fixed number of statements, all
 * values bound as JSON, whatever the page's size (item 42). Each marker's
 * preview is probed with its own instance's API key (SYNC-03): with the
 * first instance's key, every marker of another instance was stored as not
 * generated and hidden from the Clips page.
 *
 * Rows are seeded under two made-up instances, cl-a and cl-b, with the same
 * ids. Both are real `StashInstance` rows with their own API keys, loaded
 * into the instance manager, at an unreachable address; the preview probe is
 * stubbed with a fake Stash that answers only its own instance's key.
 */
import type { Prisma } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipPreviewProber } from "../../services/ClipPreviewProber.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
  type SyncRunContext,
} from "../../services/StashSyncService.js";
import {
  type BatchChanges,
  SyncChangeSet,
} from "../../services/SyncChangeSet.js";
import { must } from "../../tests/helpers/must.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";
import { UNREACHABLE_STASH_URL } from "../helpers/stashTarget.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const CL_A = "cl-a";
const CL_B = "cl-b";
const INSTANCES = [CL_A, CL_B];

/** Each instance's API key, and the host its previews are served from */
const API_KEYS: Record<string, string> = {
  [CL_A]: "cl-a-api-key",
  [CL_B]: "cl-b-api-key",
};
const previewHost = (instanceId: string) => `${instanceId}.stash.invalid`;

/** The scene and tags every seeded marker points at, on both instances */
const SCENE_ID = "1";
const TAG_IDS = ["1", "2", "3", "4"];

const CREATED_AT = "2026-01-01T10:00:00Z";
const UPDATED_AT = "2026-01-02T11:30:00.250Z";

type SyncClip = SyncEntityOf<"clip">;

function marker(
  instanceId: string,
  id: string,
  over: Partial<SyncClip> = {}
): SyncClip {
  const base = `http://${previewHost(instanceId)}/scene/${SCENE_ID}/scene_marker/${id}`;
  return partialRow<SyncClip>({
    id,
    title: `Marker ${id}`,
    seconds: 12.5,
    end_seconds: 20,
    preview: `${base}/preview`,
    screenshot: `${base}/screenshot`,
    stream: `${base}/stream`,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
    scene: { id: SCENE_ID },
    primary_tag: partialRow({ id: "1", name: "Tag 1" }),
    tags: [partialRow({ id: "2", name: "Tag 2" })],
    ...over,
  });
}

const tags = (...ids: string[]) =>
  ids.map((id) =>
    partialRow<SyncClip["tags"][number]>({ id, name: `Tag ${id}` })
  );

/** Write one page of markers onto an instance, as its sync would */
async function writePage(
  instanceId: string,
  markers: SyncClip[]
): Promise<BatchChanges> {
  const run: SyncRunContext = {
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  };
  return ENTITY_SYNC.clip.processBatch(markers, instanceId, run);
}

interface ClipRow {
  id: string;
  stashInstanceId: string;
  sceneId: string;
  sceneInstanceId: string;
  title: string | null;
  seconds: number;
  endSeconds: number | null;
  primaryTagId: string | null;
  primaryTagInstanceId: string | null;
  previewPath: string | null;
  screenshotPath: string | null;
  streamPath: string | null;
  isGenerated: boolean;
  deletedAt: Date | null;
}

async function clipsOf(instanceId: string): Promise<ClipRow[]> {
  return prisma.stashClip.findMany({
    where: { stashInstanceId: instanceId },
    select: {
      id: true,
      stashInstanceId: true,
      sceneId: true,
      sceneInstanceId: true,
      title: true,
      seconds: true,
      endSeconds: true,
      primaryTagId: true,
      primaryTagInstanceId: true,
      previewPath: true,
      screenshotPath: true,
      streamPath: true,
      isGenerated: true,
      deletedAt: true,
    },
    orderBy: { id: "asc" },
  });
}

/** An instance's clip tags as `clipId -> tagId@tagInstanceId`, sorted */
async function clipTagsOf(instanceId: string): Promise<string[]> {
  const rows = await prisma.clipTag.findMany({
    where: { clipInstanceId: instanceId },
  });
  return rows.map((r) => `${r.clipId}->${r.tagId}@${r.tagInstanceId}`).sort();
}

async function clearSeed(): Promise<void> {
  const inSeed = { in: INSTANCES };
  await prisma.clipTag.deleteMany({ where: { clipInstanceId: inSeed } });
  await prisma.stashClip.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashScene.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashTag.deleteMany({ where: { stashInstanceId: inSeed } });
}

describeWithDb("StashSyncService clip pages (integration)", () => {
  /** Every preview URL the probe was asked about */
  let probed: string[];

  beforeAll(async () => {
    await clearSeed();
    await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
    for (const [i, id] of INSTANCES.entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: UNREACHABLE_STASH_URL,
          apiKey: must(API_KEYS[id]),
          enabled: true,
          // After the test Stash, which stays the highest-priority instance
          priority: 970 + i,
        },
      });
    }
    await stashInstanceManager.reload();
  });

  beforeEach(async () => {
    await clearSeed();
    for (const instanceId of INSTANCES) {
      await prisma.stashScene.create({
        data: { id: SCENE_ID, stashInstanceId: instanceId, title: "Scene" },
      });
      await prisma.stashTag.createMany({
        data: TAG_IDS.map((id) => ({
          id,
          stashInstanceId: instanceId,
          name: `Tag ${id}`,
        })),
      });
    }

    // A fake Stash per instance: a preview is generated, and served only to
    // a request carrying that instance's own key
    probed = [];
    vi.spyOn(clipPreviewProber, "probeBatch").mockImplementation((urls) => {
      probed.push(...urls);
      return Promise.resolve(
        new Map(
          urls.map((url) => {
            const { hostname, searchParams } = new URL(url);
            const owner = INSTANCES.find((id) => previewHost(id) === hostname);
            return [
              url,
              owner !== undefined &&
                searchParams.get("apikey") === API_KEYS[owner],
            ];
          })
        )
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearSeed();
    await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
    await stashInstanceManager.reload();
  });

  it("a page of markers is written with its tags and its primary tag", async () => {
    const changes = await writePage(CL_A, [
      marker(CL_A, "10", { tags: tags("2", "3") }),
      marker(CL_A, "11", {
        title: "",
        end_seconds: null,
        primary_tag: partialRow({ id: "4", name: "Tag 4" }),
        tags: [],
      }),
      // 0 is a real end, not an unset one
      marker(CL_A, "12", { seconds: 0, end_seconds: 0, tags: tags("4") }),
    ]);

    const base = (id: string) =>
      `http://${previewHost(CL_A)}/scene/${SCENE_ID}/scene_marker/${id}`;
    expect(await clipsOf(CL_A)).toEqual([
      {
        id: "10",
        stashInstanceId: CL_A,
        sceneId: SCENE_ID,
        sceneInstanceId: CL_A,
        title: "Marker 10",
        seconds: 12.5,
        endSeconds: 20,
        primaryTagId: "1",
        primaryTagInstanceId: CL_A,
        previewPath: `${base("10")}/preview`,
        screenshotPath: `${base("10")}/screenshot`,
        streamPath: `${base("10")}/stream`,
        isGenerated: true,
        deletedAt: null,
      },
      {
        id: "11",
        stashInstanceId: CL_A,
        sceneId: SCENE_ID,
        sceneInstanceId: CL_A,
        title: null,
        seconds: 12.5,
        endSeconds: null,
        primaryTagId: "4",
        primaryTagInstanceId: CL_A,
        previewPath: `${base("11")}/preview`,
        screenshotPath: `${base("11")}/screenshot`,
        streamPath: `${base("11")}/stream`,
        isGenerated: true,
        deletedAt: null,
      },
      {
        id: "12",
        stashInstanceId: CL_A,
        sceneId: SCENE_ID,
        sceneInstanceId: CL_A,
        title: "Marker 12",
        seconds: 0,
        endSeconds: 0,
        primaryTagId: "1",
        primaryTagInstanceId: CL_A,
        previewPath: `${base("12")}/preview`,
        screenshotPath: `${base("12")}/screenshot`,
        streamPath: `${base("12")}/stream`,
        isGenerated: true,
        deletedAt: null,
      },
    ]);
    expect(await clipTagsOf(CL_A)).toEqual([
      `10->2@${CL_A}`,
      `10->3@${CL_A}`,
      `12->4@${CL_A}`,
    ]);
    // All three are new, with their tags as the new far sides
    expect(changes.changed).toEqual(
      ["10", "11", "12"].map((id) => ({ id, instanceId: CL_A }))
    );
    expect(
      [...(changes.farSides.ClipTag ?? [])].map((r) => r.id).sort()
    ).toEqual(["2", "3", "4"]);
  });

  it("a marker whose tags shrink to none loses its ClipTag rows", async () => {
    await writePage(CL_A, [
      marker(CL_A, "20", { tags: tags("2", "3") }),
      marker(CL_A, "21", { tags: tags("4") }),
    ]);

    // The same updated_at: only the tag set changed
    const changes = await writePage(CL_A, [
      marker(CL_A, "20", { tags: [] }),
      marker(CL_A, "21", { tags: tags("4") }),
    ]);

    expect(await clipTagsOf(CL_A)).toEqual([`21->4@${CL_A}`]);
    // The old far sides come back from the delete, for the change set
    expect(changes.changed).toEqual([{ id: "20", instanceId: CL_A }]);
    expect(
      [...(changes.farSides.ClipTag ?? [])].map((r) => r.id).sort()
    ).toEqual(["2", "3"]);
  });

  it("timestamps are stored as epoch milliseconds as before", async () => {
    const before = Date.now();
    await writePage(CL_A, [marker(CL_A, "30")]);
    const after = Date.now();

    const [row] = await prisma.$queryRawUnsafe<
      Array<{
        created: bigint;
        updated: bigint;
        checked: bigint;
        synced: bigint;
        types: string;
      }>
    >(
      `SELECT "stashCreatedAt" AS created, "stashUpdatedAt" AS updated,
              "generationCheckedAt" AS checked, "syncedAt" AS synced,
              typeof("stashCreatedAt") || ',' || typeof("stashUpdatedAt") || ',' ||
              typeof("generationCheckedAt") || ',' || typeof("syncedAt") || ',' ||
              typeof("deletedAt") AS types
       FROM "StashClip" WHERE "id" = ? AND "stashInstanceId" = ?`,
      "30",
      CL_A
    );
    const stored = must(row);
    // What Prisma wrote for a DateTime: integer epoch milliseconds
    expect(stored.types).toBe("integer,integer,integer,integer,null");
    expect(Number(stored.created)).toBe(Date.parse(CREATED_AT));
    expect(Number(stored.updated)).toBe(Date.parse(UPDATED_AT));
    expect(Number(stored.checked)).toBeGreaterThanOrEqual(before);
    expect(Number(stored.checked)).toBeLessThanOrEqual(after);
    expect(Number(stored.synced)).toBeGreaterThanOrEqual(before);
    expect(Number(stored.synced)).toBeLessThanOrEqual(after);

    // Prisma reads them back as the same instants
    const read = must(
      await prisma.stashClip.findUnique({
        where: { id_stashInstanceId: { id: "30", stashInstanceId: CL_A } },
      })
    );
    expect(read.stashCreatedAt?.toISOString()).toBe(
      new Date(CREATED_AT).toISOString()
    );
    expect(read.stashUpdatedAt?.toISOString()).toBe(
      new Date(UPDATED_AT).toISOString()
    );

    // An unchanged marker sent again is not a change
    const again = await writePage(CL_A, [marker(CL_A, "30")]);
    expect(again.written).toEqual([{ id: "30", instanceId: CL_A }]);
    expect(again.changed).toEqual([]);
  });

  it("cl-b's rows with the same ids are untouched", async () => {
    await writePage(CL_B, [
      marker(CL_B, "40", { title: "B's 40", tags: tags("2", "3") }),
      marker(CL_B, "41", { title: "B's 41", tags: tags("4") }),
    ]);
    const clipsB = await clipsOf(CL_B);
    const tagsB = await clipTagsOf(CL_B);

    // The same ids on cl-a, written, rewritten with other tags, soft-deleted
    // and brought back
    await writePage(CL_A, [
      marker(CL_A, "40", { tags: tags("4") }),
      marker(CL_A, "41", { tags: tags("2") }),
    ]);
    await prisma.stashClip.updateMany({
      where: { stashInstanceId: CL_A },
      data: { deletedAt: new Date() },
    });
    await writePage(CL_A, [
      marker(CL_A, "40", { title: "A's 40", tags: [] }),
      marker(CL_A, "41", { title: "A's 41", tags: tags("3") }),
    ]);

    expect(await clipsOf(CL_B)).toEqual(clipsB);
    expect(await clipTagsOf(CL_B)).toEqual(tagsB);
    expect(tagsB).toEqual([`40->2@${CL_B}`, `40->3@${CL_B}`, `41->4@${CL_B}`]);
    expect((await clipsOf(CL_A)).map((c) => [c.title, c.deletedAt])).toEqual([
      ["A's 40", null],
      ["A's 41", null],
    ]);
    expect(await clipTagsOf(CL_A)).toEqual([`41->3@${CL_A}`]);
  });

  it("the page runs a fixed number of statements, whatever its size", async () => {
    const page = (size: number, from: number) =>
      Array.from({ length: size }, (_, i) =>
        marker(CL_A, String(from + i), { tags: tags("2", "3") })
      );

    /**
     * Statements one page sends: raw SQL, and the clip model's calls. vi.spyOn
     * cannot see these methods through Prisma's client proxy (it finds no
     * descriptor and installs a stub that swallows them), so each wrapper is
     * installed by hand around the bound original.
     */
    const countStatements = async (markers: SyncClip[]): Promise<number> => {
      let statements = 0;
      const exec = prisma.$executeRawUnsafe.bind(prisma);
      const query = prisma.$queryRawUnsafe.bind(prisma);
      const findMany = prisma.stashClip.findMany.bind(prisma.stashClip);
      const upsert = prisma.stashClip.upsert.bind(prisma.stashClip);
      prisma.$executeRawUnsafe = (sql: string, ...values: unknown[]) => {
        statements++;
        return exec(sql, ...values);
      };
      prisma.$queryRawUnsafe = <T>(sql: string, ...values: unknown[]) => {
        statements++;
        return query<T>(sql, ...values);
      };
      prisma.stashClip.findMany = <T extends Prisma.StashClipFindManyArgs>(
        args?: Prisma.SelectSubset<T, Prisma.StashClipFindManyArgs>
      ) => {
        statements++;
        return findMany(args);
      };
      prisma.stashClip.upsert = <T extends Prisma.StashClipUpsertArgs>(
        args: Prisma.SelectSubset<T, Prisma.StashClipUpsertArgs>
      ) => {
        statements++;
        return upsert(args);
      };
      try {
        await writePage(CL_A, markers);
        return statements;
      } finally {
        prisma.$executeRawUnsafe = exec;
        prisma.$queryRawUnsafe = query;
        prisma.stashClip.findMany = findMany;
        prisma.stashClip.upsert = upsert;
      }
    };

    const small = await countStatements(page(5, 1000));
    const large = await countStatements(page(500, 2000));

    expect(large).toBeLessThanOrEqual(4);
    expect(large).toBe(small);
    // And all 505 were written, with both tags each
    expect(
      await prisma.stashClip.count({ where: { stashInstanceId: CL_A } })
    ).toBe(505);
    expect(
      await prisma.clipTag.count({ where: { clipInstanceId: CL_A } })
    ).toBe(1010);
  });

  it("each instance's markers are probed with that instance's API key (SYNC-03)", async () => {
    await writePage(CL_A, [marker(CL_A, "50"), marker(CL_A, "51")]);
    await writePage(CL_B, [marker(CL_B, "50"), marker(CL_B, "51")]);

    const keysBy = (instanceId: string) =>
      probed
        .filter((url) => new URL(url).hostname === previewHost(instanceId))
        .map((url) => new URL(url).searchParams.get("apikey"));
    expect(keysBy(CL_A)).toEqual([API_KEYS[CL_A], API_KEYS[CL_A]]);
    expect(keysBy(CL_B)).toEqual([API_KEYS[CL_B], API_KEYS[CL_B]]);

    // So the second instance's generated previews show as generated
    expect((await clipsOf(CL_B)).map((c) => c.isGenerated)).toEqual([
      true,
      true,
    ]);
    expect((await clipsOf(CL_A)).map((c) => c.isGenerated)).toEqual([
      true,
      true,
    ]);
  });
});
