/**
 * The clip list's tag, scene-tag and performer filters with each modifier
 * (item 38, FILTERS-08): Has ANY, Has ALL and Has NONE reach SQL, each ref
 * matched as an (id, instance) pair, against the real test SQLite database.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do, and
 * hold the same rows:
 * - tags 7891001 (T1), 7891002 (T2) and 7891003 (T3); performers 7891001
 *   (P1) and 7891002 (P2)
 * - scene 7891001 tagged T1 and T2, with P1 and P2; scene 7891002 tagged
 *   T1, with P1; scene 7891003 with neither
 * - clip 7891101 (scene 7891001): primary tag T1, tag list T2
 * - clip 7891102 (scene 7891002): tag list T1 and T2, no primary tag
 * - clip 7891103 (scene 7891003): primary tag T1 only
 * - clip 7891104 (scene 7891001): tag list T2 only
 * - clip 7891105 (scene 7891002): no tag
 * - clip 7891106 (scene 7891003): primary tag T3 only
 * - cf-a only: clip 7891107 (scene 7891003), deleted, with no tag
 *
 * A clip's own tags are its primary tag or its tag list: Has ALL needs each
 * ref in one or the other, Has NONE neither (a clip without a primary tag
 * counts). A ref with an instance matches that instance only, so the other
 * instance's same-id clips are untouched; a bare ref matches its id on
 * every instance. Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { parsedClipRequest } from "../../tests/helpers/fixtures.js";
import type {
  ClipListRequest,
  FilterRef,
  RefCriterion,
} from "../../types/parsedFilters.js";
import { PAIR_INLINE_LIMIT } from "../../utils/sqlClauses.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "cf-a";
const B = "cf-b";
const INSTANCES = [A, B];
const [T1, T2, T3] = ["7891001", "7891002", "7891003"];
const [P1, P2] = ["7891001", "7891002"];
const [S_BOTH, S_ONE, S_NONE] = ["7891001", "7891002", "7891003"];
const [C_MIXED, C_LIST, C_PRIMARY, C_LIST_ONE, C_NONE, C_OTHER, C_DELETED] = [
  "7891101",
  "7891102",
  "7891103",
  "7891104",
  "7891105",
  "7891106",
  "7891107",
];
const LIVE_CLIPS = [C_MIXED, C_LIST, C_PRIMARY, C_LIST_ONE, C_NONE, C_OTHER];

type Modifier = RefCriterion["modifier"];

const ref = (id: string, instanceId?: string): FilterRef => ({
  id,
  instanceId,
});
const criterion = (modifier: Modifier, ...refs: FilterRef[]): RefCriterion => ({
  refs,
  modifier,
  depth: 0,
});
const on = (instance: string, ...ids: string[]): string[] =>
  ids.map((id) => `${id}:${instance}`);
/** Every live clip on an instance */
const allOn = (instance: string): string[] => on(instance, ...LIVE_CLIPS);

/** The clips a filter lists, as sorted "id:instance" keys */
async function clipKeys(filter: ClipListRequest["filter"]): Promise<string[]> {
  const { items, total } = await clipQueryBuilder.execute({
    userId: 0,
    applyExclusions: false,
    allowedInstanceIds: INSTANCES,
    request: parsedClipRequest({ perPage: 100, filter }),
  });
  const keys = items.map((clip) => `${clip.id}:${clip.instanceId}`).sort();
  // The count reads the same rows as the page
  expect(total).toBe(keys.length);
  return keys;
}

const sorted = (...groups: string[][]): string[] => groups.flat().sort();

async function seed(): Promise<void> {
  const named = (id: string, instance: string, name: string) => ({
    id,
    stashInstanceId: instance,
    name,
  });
  await prisma.stashTag.createMany({
    data: INSTANCES.flatMap((i) => [
      named(T1, i, `T1 ${i}`),
      named(T2, i, `T2 ${i}`),
      named(T3, i, `T3 ${i}`),
    ]),
  });
  await prisma.stashPerformer.createMany({
    data: INSTANCES.flatMap((i) => [
      named(P1, i, `P1 ${i}`),
      named(P2, i, `P2 ${i}`),
    ]),
  });
  await prisma.stashScene.createMany({
    data: INSTANCES.flatMap((i) =>
      [S_BOTH, S_ONE, S_NONE].map((id) => ({
        id,
        stashInstanceId: i,
        title: `Scene ${id} ${i}`,
      }))
    ),
  });
  const sceneRows = (
    sceneId: string,
    refIds: string[]
  ): Array<{ sceneId: string; refId: string }> =>
    refIds.map((refId) => ({ sceneId, refId }));
  const sceneLinks = [
    ...sceneRows(S_BOTH, [T1, T2]),
    ...sceneRows(S_ONE, [T1]),
  ];
  await prisma.sceneTag.createMany({
    data: INSTANCES.flatMap((i) =>
      sceneLinks.map(({ sceneId, refId }) => ({
        sceneId,
        sceneInstanceId: i,
        tagId: refId,
        tagInstanceId: i,
      }))
    ),
  });
  const performerLinks = [
    ...sceneRows(S_BOTH, [P1, P2]),
    ...sceneRows(S_ONE, [P1]),
  ];
  await prisma.scenePerformer.createMany({
    data: INSTANCES.flatMap((i) =>
      performerLinks.map(({ sceneId, refId }) => ({
        sceneId,
        sceneInstanceId: i,
        performerId: refId,
        performerInstanceId: i,
      }))
    ),
  });

  const clip = (
    id: string,
    instance: string,
    sceneId: string,
    primaryTagId?: string
  ) => ({
    id,
    stashInstanceId: instance,
    sceneId,
    sceneInstanceId: instance,
    title: `Clip ${id} ${instance}`,
    seconds: Number(id) - 7891100,
    ...(primaryTagId === undefined
      ? {}
      : { primaryTagId, primaryTagInstanceId: instance }),
  });
  await prisma.stashClip.createMany({
    data: [
      ...INSTANCES.flatMap((i) => [
        clip(C_MIXED, i, S_BOTH, T1),
        clip(C_LIST, i, S_ONE),
        clip(C_PRIMARY, i, S_NONE, T1),
        clip(C_LIST_ONE, i, S_BOTH),
        clip(C_NONE, i, S_ONE),
        clip(C_OTHER, i, S_NONE, T3),
      ]),
      { ...clip(C_DELETED, A, S_NONE), deletedAt: new Date() },
    ],
  });
  const clipTags: Array<[string, string]> = [
    [C_MIXED, T2],
    [C_LIST, T1],
    [C_LIST, T2],
    [C_LIST_ONE, T2],
  ];
  await prisma.clipTag.createMany({
    data: INSTANCES.flatMap((i) =>
      clipTags.map(([clipId, tagId]) => ({
        clipId,
        clipInstanceId: i,
        tagId,
        tagInstanceId: i,
      }))
    ),
  });
}

/** Clips first (their tags cascade), then the scenes (their junctions cascade) */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: INSTANCES } };
  await prisma.stashClip.deleteMany({ where });
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

describeWithDb("Clip filters: every modifier (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  });

  afterAll(async () => {
    await removeRows();
  });

  describe("the clip's own tags (primary tag or tag list)", () => {
    it("Has ANY [T1, T2] on cf-a lists cf-a's clips holding either", async () => {
      expect(
        await clipKeys({
          tagIds: criterion("INCLUDES", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST, C_PRIMARY, C_LIST_ONE).sort());
    });

    it("Has ALL [T1, T2] returns only clips with both, from the primary tag or the list, on the named instance only", async () => {
      expect(
        await clipKeys({
          tagIds: criterion("INCLUDES_ALL", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST).sort());
    });

    it("Has NONE [T1, T2] returns clips with neither (no primary tag counts), and every clip of the other instance", async () => {
      expect(
        await clipKeys({
          tagIds: criterion("EXCLUDES", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(sorted(on(A, C_NONE, C_OTHER), allOn(B)));
    });

    it("Has NONE [T1] drops a clip whose primary tag is T1 and one whose list holds it", async () => {
      expect(
        await clipKeys({ tagIds: criterion("EXCLUDES", ref(T1, A)) })
      ).toEqual(sorted(on(A, C_LIST_ONE, C_NONE, C_OTHER), allOn(B)));
    });

    it("bare refs match their ids on every instance", async () => {
      expect(
        await clipKeys({
          tagIds: criterion("INCLUDES_ALL", ref(T1), ref(T2)),
        })
      ).toEqual(sorted(on(A, C_MIXED, C_LIST), on(B, C_MIXED, C_LIST)));
      expect(
        await clipKeys({ tagIds: criterion("EXCLUDES", ref(T1), ref(T2)) })
      ).toEqual(sorted(on(A, C_NONE, C_OTHER), on(B, C_NONE, C_OTHER)));
    });

    it("more refs than the inline limit take the matched sets, with the same rows", async () => {
      const padding = Array.from({ length: PAIR_INLINE_LIMIT }, (_, i) =>
        ref(String(7899000 + i), A)
      );
      expect(
        await clipKeys({
          tagIds: criterion("EXCLUDES", ...padding, ref(T1, A), ref(T2, A)),
        })
      ).toEqual(sorted(on(A, C_NONE, C_OTHER), allOn(B)));
      expect(
        await clipKeys({
          tagIds: criterion("INCLUDES", ...padding, ref(T1, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST, C_PRIMARY).sort());
    });
  });

  describe("the clip's scene's tags", () => {
    it("Has ALL [T1, T2] returns the clips of scenes with both, on the named instance only", async () => {
      expect(
        await clipKeys({
          sceneTagIds: criterion("INCLUDES_ALL", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST_ONE).sort());
    });

    it("Has NONE [T1, T2] returns the clips of scenes with neither, and every clip of the other instance", async () => {
      expect(
        await clipKeys({
          sceneTagIds: criterion("EXCLUDES", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(sorted(on(A, C_PRIMARY, C_OTHER), allOn(B)));
    });
  });

  describe("the performers in the clip's scene", () => {
    it("Has ALL [P1, P2] returns the clips of scenes with both, on the named instance only", async () => {
      expect(
        await clipKeys({
          performerIds: criterion("INCLUDES_ALL", ref(P1, A), ref(P2, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST_ONE).sort());
    });

    it("Has NONE [P1, P2] returns the clips of scenes with neither, and every clip of the other instance", async () => {
      expect(
        await clipKeys({
          performerIds: criterion("EXCLUDES", ref(P1, A), ref(P2, A)),
        })
      ).toEqual(sorted(on(A, C_PRIMARY, C_OTHER), allOn(B)));
    });

    it("Has ANY [P2] on cf-b lists cf-b's clips of scene 7891001 only", async () => {
      expect(
        await clipKeys({ performerIds: criterion("INCLUDES", ref(P2, B)) })
      ).toEqual(on(B, C_MIXED, C_LIST_ONE).sort());
    });
  });
});
