/**
 * Integration tests for the studio and group specs' tag junctions
 * (ENTITY_SYNC.studio.processBatch, ENTITY_SYNC.group.processBatch), against
 * the real test SQLite database (item 42, SYNC-09).
 *
 * A batch deletes its studios' `StudioTag` rows (its groups' `GroupTag`
 * rows) once, then inserts the tags Stash returned. A studio or group whose
 * tags were all removed in Stash loses its rows: when only the ones with tags
 * were rewritten, the old rows survived and kept passing their tags on to
 * the scenes.
 *
 * Rows are seeded under two made-up instances, jn-a and jn-b, with the same
 * ids, which real sync never touches; the batch writers are called directly
 * with Stash-shaped rows.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
  type SyncRunContext,
} from "../../services/StashSyncService.js";
import {
  type BatchChanges,
  SyncChangeSet,
} from "../../services/SyncChangeSet.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const JN_A = "jn-a";
const JN_B = "jn-b";
const INSTANCES = [JN_A, JN_B];

/** The tags every seeded studio and group points at, on both instances */
const TAG_IDS = ["1", "2", "3"];

const CREATED_AT = "2026-01-01T00:00:00Z";
const UPDATED_AT = "2026-01-02T00:00:00Z";
/** Removing a tag in Stash moves the entity's updated_at */
const LATER_AT = "2026-01-03T00:00:00Z";

type SyncStudio = SyncEntityOf<"studio">;
type SyncGroup = SyncEntityOf<"group">;

/** A studio as Stash's sync query returns it */
function studioRow(
  id: string,
  tagIds: string[],
  updatedAt = UPDATED_AT
): SyncStudio {
  return partialRow<SyncStudio>({
    id,
    name: `Junctions IT studio ${id}`,
    stash_ids: [],
    parent_studio: null,
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    created_at: CREATED_AT,
    updated_at: updatedAt,
  });
}

/** A group as Stash's sync query returns it */
function groupRow(
  id: string,
  tagIds: string[],
  updatedAt = UPDATED_AT
): SyncGroup {
  return partialRow<SyncGroup>({
    id,
    name: `Junctions IT group ${id}`,
    urls: [],
    studio: null,
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    created_at: CREATED_AT,
    updated_at: updatedAt,
  });
}

function newRun(): SyncRunContext {
  return {
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  };
}

function syncStudios(
  instanceId: string,
  studios: SyncStudio[]
): Promise<BatchChanges> {
  return ENTITY_SYNC.studio.processBatch(studios, instanceId, newRun());
}

function syncGroups(
  instanceId: string,
  groups: SyncGroup[]
): Promise<BatchChanges> {
  return ENTITY_SYNC.group.processBatch(groups, instanceId, newRun());
}

/** A junction's rows on the seed instances, as `<near>@<instance>:<tag>@<instance>` */
async function tagLinks(table: "StudioTag" | "GroupTag"): Promise<string[]> {
  const [near, nearInstance] =
    table === "StudioTag"
      ? ["studioId", "studioInstanceId"]
      : ["groupId", "groupInstanceId"];
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      nearId: string;
      nearInstanceId: string;
      tagId: string;
      tagInstanceId: string;
    }>
  >(
    `SELECT "${near}" AS nearId, "${nearInstance}" AS nearInstanceId, tagId, tagInstanceId
     FROM "${table}" WHERE "${nearInstance}" IN (?, ?)`,
    JN_A,
    JN_B
  );
  return rows
    .map((r) => `${r.nearId}@${r.nearInstanceId}:${r.tagId}@${r.tagInstanceId}`)
    .sort();
}

/** `id@instance` of each ref, sorted */
function refs(list: ReadonlyArray<{ id: string; instanceId: string }>) {
  return list.map((r) => `${r.id}@${r.instanceId}`).sort();
}

async function clearSeed(): Promise<void> {
  const inSeed = { in: INSTANCES };
  await prisma.studioTag.deleteMany({ where: { studioInstanceId: inSeed } });
  await prisma.groupTag.deleteMany({ where: { groupInstanceId: inSeed } });
  await prisma.stashStudio.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashGroup.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashTag.deleteMany({ where: { stashInstanceId: inSeed } });
}

describeWithDb(
  "StashSyncService studio and group tag junctions (integration)",
  () => {
    beforeEach(async () => {
      await clearSeed();
      // The same tag ids on both instances: the junctions' far sides
      await prisma.stashTag.createMany({
        data: INSTANCES.flatMap((stashInstanceId) =>
          TAG_IDS.map((id) => ({
            id,
            stashInstanceId,
            name: `Junctions IT tag ${id}`,
          }))
        ),
      });
    });

    afterAll(async () => {
      await clearSeed();
    });

    it("a studio whose tags were all removed in Stash loses its StudioTag rows", async () => {
      await syncStudios(JN_A, [
        studioRow("1", ["1", "2"]),
        studioRow("2", ["3"]),
      ]);
      expect(await tagLinks("StudioTag")).toEqual([
        `1@${JN_A}:1@${JN_A}`,
        `1@${JN_A}:2@${JN_A}`,
        `2@${JN_A}:3@${JN_A}`,
      ]);

      // Studio 1's tags removed in Stash; studio 2 in the same page keeps its tag
      const changes = await syncStudios(JN_A, [
        studioRow("1", [], LATER_AT),
        studioRow("2", ["3"]),
      ]);

      expect(await tagLinks("StudioTag")).toEqual([`2@${JN_A}:3@${JN_A}`]);
      // Its scenes stop inheriting the tags: the post-sync steps see the change
      expect(refs(changes.tagSetChanged)).toEqual([`1@${JN_A}`]);
      // The far sides: the tags it lost
      expect(refs(changes.farSides.StudioTag ?? [])).toEqual([
        `1@${JN_A}`,
        `2@${JN_A}`,
      ]);
    });

    it("the same for a group", async () => {
      await syncGroups(JN_A, [groupRow("1", ["1", "2"]), groupRow("2", ["3"])]);
      expect(await tagLinks("GroupTag")).toEqual([
        `1@${JN_A}:1@${JN_A}`,
        `1@${JN_A}:2@${JN_A}`,
        `2@${JN_A}:3@${JN_A}`,
      ]);

      const changes = await syncGroups(JN_A, [
        groupRow("1", [], LATER_AT),
        groupRow("2", ["3"]),
      ]);

      expect(await tagLinks("GroupTag")).toEqual([`2@${JN_A}:3@${JN_A}`]);
      expect(refs(changes.tagSetChanged)).toEqual([`1@${JN_A}`]);
      // The far sides: the tags it lost
      expect(refs(changes.farSides.GroupTag ?? [])).toEqual([
        `1@${JN_A}`,
        `2@${JN_A}`,
      ]);
    });

    it("jn-b's StudioTag rows for the same studio id stay", async () => {
      await syncStudios(JN_A, [studioRow("1", ["1", "2"])]);
      await syncStudios(JN_B, [studioRow("1", ["1", "2"])]);

      // Studio 1 loses its tags on jn-a only
      await syncStudios(JN_A, [studioRow("1", [], LATER_AT)]);

      expect(await tagLinks("StudioTag")).toEqual([
        `1@${JN_B}:1@${JN_B}`,
        `1@${JN_B}:2@${JN_B}`,
      ]);
    });
  }
);
