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
import { parseClipQuery, parseListRequest } from "../../utils/listRequest.js";
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
          tags: criterion("INCLUDES", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST, C_PRIMARY, C_LIST_ONE).sort());
    });

    it("Has ALL [T1, T2] returns only clips with both, from the primary tag or the list, on the named instance only", async () => {
      expect(
        await clipKeys({
          tags: criterion("INCLUDES_ALL", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST).sort());
    });

    it("Has NONE [T1, T2] returns clips with neither (no primary tag counts), and every clip of the other instance", async () => {
      expect(
        await clipKeys({
          tags: criterion("EXCLUDES", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(sorted(on(A, C_NONE, C_OTHER), allOn(B)));
    });

    it("Has NONE [T1] drops a clip whose primary tag is T1 and one whose list holds it", async () => {
      expect(
        await clipKeys({ tags: criterion("EXCLUDES", ref(T1, A)) })
      ).toEqual(sorted(on(A, C_LIST_ONE, C_NONE, C_OTHER), allOn(B)));
    });

    it("bare refs match their ids on every instance", async () => {
      expect(
        await clipKeys({
          tags: criterion("INCLUDES_ALL", ref(T1), ref(T2)),
        })
      ).toEqual(sorted(on(A, C_MIXED, C_LIST), on(B, C_MIXED, C_LIST)));
      expect(
        await clipKeys({ tags: criterion("EXCLUDES", ref(T1), ref(T2)) })
      ).toEqual(sorted(on(A, C_NONE, C_OTHER), on(B, C_NONE, C_OTHER)));
    });

    it("more refs than the inline limit take the matched sets, with the same rows", async () => {
      const padding = Array.from({ length: PAIR_INLINE_LIMIT }, (_, i) =>
        ref(String(7899000 + i), A)
      );
      expect(
        await clipKeys({
          tags: criterion("EXCLUDES", ...padding, ref(T1, A), ref(T2, A)),
        })
      ).toEqual(sorted(on(A, C_NONE, C_OTHER), allOn(B)));
      expect(
        await clipKeys({
          tags: criterion("INCLUDES", ...padding, ref(T1, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST, C_PRIMARY).sort());
    });
  });

  describe("the clip's scene's tags", () => {
    it("Has ALL [T1, T2] returns the clips of scenes with both, on the named instance only", async () => {
      expect(
        await clipKeys({
          scene_tags: criterion("INCLUDES_ALL", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST_ONE).sort());
    });

    it("Has NONE [T1, T2] returns the clips of scenes with neither, and every clip of the other instance", async () => {
      expect(
        await clipKeys({
          scene_tags: criterion("EXCLUDES", ref(T1, A), ref(T2, A)),
        })
      ).toEqual(sorted(on(A, C_PRIMARY, C_OTHER), allOn(B)));
    });
  });

  describe("the performers in the clip's scene", () => {
    it("Has ALL [P1, P2] returns the clips of scenes with both, on the named instance only", async () => {
      expect(
        await clipKeys({
          performers: criterion("INCLUDES_ALL", ref(P1, A), ref(P2, A)),
        })
      ).toEqual(on(A, C_MIXED, C_LIST_ONE).sort());
    });

    it("Has NONE [P1, P2] returns the clips of scenes with neither, and every clip of the other instance", async () => {
      expect(
        await clipKeys({
          performers: criterion("EXCLUDES", ref(P1, A), ref(P2, A)),
        })
      ).toEqual(sorted(on(A, C_PRIMARY, C_OTHER), allOn(B)));
    });

    it("Has ANY [P2] on cf-b lists cf-b's clips of scene 7891001 only", async () => {
      expect(
        await clipKeys({ performers: criterion("INCLUDES", ref(P2, B)) })
      ).toEqual(on(B, C_MIXED, C_LIST_ONE).sort());
    });
  });
});

/**
 * The filter body's fields (F16): depth on the clip's tags, its scene's tags
 * and its scene's studio, the studio's EXCLUDES, the duration, the dates and
 * several scenes, each read as the parser hands it on. Two made-up
 * instances reuse the same ids and hold the same rows unless named:
 * - tags 7892001 (TP), 7892002 (TC, under TP), 7892003 (TG, under TC),
 *   7892004 (TO); studios 7892001 (SP) and 7892002 (SC, under SP)
 * - scene 7892001: studio SP, tagged TC; 7892002: studio SC, inheriting TG;
 *   7892003: no studio, no tag; 7892004: studio SP, hidden by the viewer on
 *   cfx-a only
 * - clip 7892101 (scene 7892001): primary tag TC, 0 to 20 s, with preview
 * - clip 7892102 (scene 7892002): tag list TG, 10 to 50 s, with preview
 * - clip 7892103 (scene 7892003): primary tag TO, from 5 s with no end
 * - clip 7892104 (scene 7892004): primary tag TP, 0 to 10 s, with preview
 * - clip 7892105 (scene 7892001): no tag, 30 to 40 s; hidden by the viewer
 *   on cfx-b only
 * On cfx-a the clips were created (and updated) 7892101 at
 * 2021-10-13T03:00Z (22:00 on 12 Oct in Chicago), 7892102 at
 * 2021-10-12T12:00Z, 7892104 at 2021-10-12T15:00Z, 7892105 at
 * 2021-10-20T12:00Z; on cfx-b every one at 2021-11-01T12:00Z; 7892103
 * never. Every seeded row and the viewer are deleted before the file ends.
 */
describeWithDb("Clip filters: the filter body (integration)", () => {
  const X = "cfx-a";
  const Y = "cfx-b";
  const BOTH = [X, Y];
  const VIEWER = "clip-filters-viewer";
  const CHICAGO = "America/Chicago";
  const [TP, TC, TG, TO] = ["7892001", "7892002", "7892003", "7892004"];
  const [SP, SC] = ["7892001", "7892002"];
  const [S1, S2, S3, S4] = ["7892001", "7892002", "7892003", "7892004"];
  const [K1, K2, K3, K4, K5] = [
    "7892101",
    "7892102",
    "7892103",
    "7892104",
    "7892105",
  ];
  let viewerId = 0;

  const at = (instance: string, ...ids: string[]): string[] =>
    ids.map((id) => `${id}:${instance}`);

  async function removeRows(): Promise<void> {
    await prisma.user.deleteMany({ where: { username: VIEWER } });
    const where = { stashInstanceId: { in: BOTH } };
    await prisma.stashClip.deleteMany({ where });
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashStudio.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
  }

  /**
   * The clips a `clip_filter` lists for the viewer through the parser, as
   * sorted "id:instance" keys
   */
  async function listed(
    clipFilter: Record<string, unknown>,
    options: { timeZone?: string; applyExclusions?: boolean } = {}
  ): Promise<string[]> {
    const request = parseListRequest(
      "clip",
      { filter: { per_page: 100 }, clip_filter: clipFilter },
      { userId: viewerId }
    );
    const { items, total } = await clipQueryBuilder.execute({
      userId: viewerId,
      allowedInstanceIds: BOTH,
      request,
      ...options,
    });
    const keys = items.map((clip) => `${clip.id}:${clip.instanceId}`).sort();
    expect(total).toBe(keys.length);
    return keys;
  }

  beforeAll(async () => {
    await removeRows();
    await prisma.stashTag.createMany({
      data: BOTH.flatMap((i) => [
        { id: TP, stashInstanceId: i, name: `TP ${i}` },
        { id: TC, stashInstanceId: i, name: `TC ${i}`, parentIds: `["${TP}"]` },
        { id: TG, stashInstanceId: i, name: `TG ${i}`, parentIds: `["${TC}"]` },
        { id: TO, stashInstanceId: i, name: `TO ${i}` },
      ]),
    });
    await prisma.stashStudio.createMany({
      data: BOTH.flatMap((i) => [
        { id: SP, stashInstanceId: i, name: `SP ${i}` },
        { id: SC, stashInstanceId: i, name: `SC ${i}`, parentId: SP },
      ]),
    });
    await prisma.stashScene.createMany({
      data: BOTH.flatMap((i) => [
        { id: S1, stashInstanceId: i, title: `S1 ${i}`, studioId: SP },
        { id: S2, stashInstanceId: i, title: `S2 ${i}`, studioId: SC },
        { id: S3, stashInstanceId: i, title: `S3 ${i}` },
        { id: S4, stashInstanceId: i, title: `S4 ${i}`, studioId: SP },
      ]),
    });
    await prisma.sceneTag.createMany({
      data: BOTH.map((i) => ({
        sceneId: S1,
        sceneInstanceId: i,
        tagId: TC,
        tagInstanceId: i,
      })),
    });
    await prisma.sceneInheritedTag.createMany({
      data: BOTH.map((i) => ({
        sceneId: S2,
        sceneInstanceId: i,
        tagId: TG,
        tagInstanceId: i,
      })),
    });
    const created = (instance: string, iso: string | null) => {
      const when =
        iso === null
          ? null
          : new Date(instance === X ? iso : "2021-11-01T12:00:00Z");
      return { stashCreatedAt: when, stashUpdatedAt: when };
    };
    const clip = (
      id: string,
      instance: string,
      sceneId: string,
      seconds: number,
      endSeconds: number | null,
      isGenerated: boolean,
      createdAt: string | null,
      primaryTagId?: string
    ) => ({
      id,
      stashInstanceId: instance,
      sceneId,
      sceneInstanceId: instance,
      title: `Clip ${id} ${instance}`,
      seconds,
      endSeconds,
      isGenerated,
      ...created(instance, createdAt),
      ...(primaryTagId === undefined
        ? {}
        : { primaryTagId, primaryTagInstanceId: instance }),
    });
    await prisma.stashClip.createMany({
      data: BOTH.flatMap((i) => [
        clip(K1, i, S1, 0, 20, true, "2021-10-13T03:00:00Z", TC),
        clip(K2, i, S2, 10, 50, true, "2021-10-12T12:00:00Z"),
        clip(K3, i, S3, 5, null, false, null, TO),
        clip(K4, i, S4, 0, 10, true, "2021-10-12T15:00:00Z", TP),
        clip(K5, i, S1, 30, 40, false, "2021-10-20T12:00:00Z"),
      ]),
    });
    await prisma.clipTag.createMany({
      data: BOTH.map((i) => ({
        clipId: K2,
        clipInstanceId: i,
        tagId: TG,
        tagInstanceId: i,
      })),
    });
    const viewer = await prisma.user.create({
      data: { username: VIEWER, password: "x", role: "USER" },
    });
    viewerId = viewer.id;
    await prisma.userExcludedEntity.createMany({
      data: [
        {
          userId: viewerId,
          entityType: "scene",
          entityId: S4,
          instanceId: X,
          reason: "hidden",
        },
        {
          userId: viewerId,
          entityType: "clip",
          entityId: K5,
          instanceId: Y,
          reason: "hidden",
        },
      ],
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("tags with depth -1 match a sub-tag on the primary tag or the tag list", async () => {
    expect(
      await listed({ tags: { value: [`${TP}:${X}`], depth: -1 } })
    ).toEqual(at(X, K1, K2).sort());
    // One level: TC on the primary tag, not TG in the list
    expect(await listed({ tags: { value: [`${TP}:${X}`], depth: 1 } })).toEqual(
      at(X, K1)
    );
    // No depth: the hidden scene's clip holds TP itself
    expect(await listed({ tags: { value: [`${TP}:${X}`] } })).toEqual([]);
    expect(
      await listed(
        { tags: { value: [`${TP}:${X}`] } },
        { applyExclusions: false }
      )
    ).toEqual(at(X, K4));
  });

  it("scene tags with a depth match the scene's own and inherited sub-tags", async () => {
    expect(
      await listed({ scene_tags: { value: [`${TP}:${Y}`], depth: -1 } })
    ).toEqual(at(Y, K1, K2).sort());
    expect(
      await listed({ scene_tags: { value: [`${TP}:${Y}`], depth: 1 } })
    ).toEqual(at(Y, K1));
    expect(await listed({ scene_tags: { value: [`${TP}:${Y}`] } })).toEqual([]);
  });

  it("studios with a depth take the sub-studios' clips; EXCLUDES keeps clips whose scene has no studio", async () => {
    expect(
      await listed({ studios: { value: [`${SP}:${X}`], depth: -1 } })
    ).toEqual(at(X, K1, K2, K5).sort());
    expect(await listed({ studios: { value: [`${SP}:${X}`] } })).toEqual(
      at(X, K1, K5).sort()
    );
    expect(
      await listed({
        studios: { value: [`${SP}:${X}`], modifier: "EXCLUDES", depth: -1 },
      })
    ).toEqual([...at(X, K3), ...at(Y, K1, K2, K3, K4)].sort());
  });

  it("the duration is end less start, and a clip without an end matches no comparison", async () => {
    expect(
      await listed({ duration: { modifier: "LESS_THAN", value: 30 } })
    ).toEqual([...at(X, K1, K5), ...at(Y, K1, K4)].sort());
    expect(
      await listed({
        duration: { modifier: "NOT_BETWEEN", value: 15, value2: 25 },
      })
    ).toEqual([...at(X, K2, K5), ...at(Y, K2, K4)].sort());
    expect(
      await listed({ duration: { modifier: "NOT_EQUALS", value: 20 } })
    ).not.toContain(`${K3}:${X}`);
  });

  it("created and updated dates are the viewer's local day, a clip without one matching no comparison", async () => {
    const oct12 = {
      modifier: "BETWEEN",
      value: "2021-10-12",
      value2: "2021-10-12",
    };
    expect(await listed({ created_at: oct12 }, { timeZone: CHICAGO })).toEqual(
      at(X, K1, K2).sort()
    );
    // 7892101 was created on 13 Oct in UTC
    expect(await listed({ created_at: oct12 }, { timeZone: "UTC" })).toEqual(
      at(X, K2)
    );
    expect(
      await listed(
        { updated_at: { modifier: "EQUALS", value: "2021-11-01" } },
        { timeZone: CHICAGO }
      )
    ).toEqual(at(Y, K1, K2, K4).sort());
    expect(
      await listed(
        { created_at: { modifier: "NOT_EQUALS", value: "2021-10-12" } },
        { timeZone: CHICAGO }
      )
    ).toEqual([...at(X, K5), ...at(Y, K1, K2, K4)].sort());
    expect(
      await listed(
        { created_at: { modifier: "IS_NULL" } },
        { timeZone: CHICAGO }
      )
    ).toEqual([...at(X, K3), ...at(Y, K3)].sort());
  });

  it("scenes INCLUDES several scenes lists their clips; 7892001@cfx-a lists only cfx-a's clips", async () => {
    expect(
      await listed({ scenes: { value: [`${S1}:${X}`, `${S2}:${X}`] } })
    ).toEqual(at(X, K1, K2, K5).sort());
    expect(await listed({ scenes: { value: [`${S1}:${X}`] } })).toEqual(
      at(X, K1, K5).sort()
    );
    // A bare id on every instance, the hidden clip left out
    expect(await listed({ scenes: { value: [S1] } })).toEqual(
      [...at(X, K1, K5), ...at(Y, K1)].sort()
    );
  });

  it("a hidden scene's clip and a hidden clip are never listed, in any form", async () => {
    const forms: Record<string, unknown>[] = [
      { scenes: { value: [`${S4}:${X}`, `${S1}:${Y}`] } },
      { tags: { value: [`${TO}:${X}`], modifier: "EXCLUDES" } },
      { tags: { value: [`${TP}:${X}`, `${TP}:${Y}`] } },
      { tags: { value: [], excludes: [`${TO}:${X}`] } },
      { scene_tags: { value: [`${TC}:${X}`], modifier: "EXCLUDES" } },
      { performers: { value: ["7892999"], modifier: "EXCLUDES" } },
      { studios: { value: [`${SC}:${X}`], modifier: "EXCLUDES" } },
      { studios: { value: [`${SP}:${X}`, `${SP}:${Y}`] } },
      { duration: { modifier: "NOT_EQUALS", value: 99 } },
      { duration: { modifier: "NOT_BETWEEN", value: 90, value2: 99 } },
      { created_at: { modifier: "NOT_EQUALS", value: "2000-01-01" } },
      { created_at: { modifier: "NOT_NULL" } },
      {
        updated_at: {
          modifier: "NOT_BETWEEN",
          value: "2000-01-01",
          value2: "2000-01-02",
        },
      },
      { title: { modifier: "NOT_NULL" } },
      { title: { modifier: "EXCLUDES", value: "zzz" } },
      { is_generated: true },
      { is_generated: false },
    ];
    for (const form of forms) {
      const keys = await listed(form, { timeZone: CHICAGO });
      expect(keys, JSON.stringify(form)).not.toContain(`${K4}:${X}`);
      expect(keys, JSON.stringify(form)).not.toContain(`${K5}:${Y}`);
    }
    // Without the viewer's exclusions both list
    expect(
      await listed(
        { scenes: { value: [`${S4}:${X}`, `${S1}:${Y}`] } },
        { applyExclusions: false }
      )
    ).toEqual([...at(X, K4), ...at(Y, K1, K5)].sort());
  });

  it("the prod clip preset's body matches the same clips as the GET ?sceneTagIds=<id> (a bare id on every instance)", async () => {
    // What buildPanelFilter("clip", { sceneTagIds: ["7892002"] }) sends
    const body = {
      scene_tags: { value: [TC], modifier: "INCLUDES" },
      is_generated: true,
    };
    const fromQuery = parseClipQuery(
      { sceneTagIds: TC, isGenerated: "true", perPage: "100" },
      { userId: viewerId }
    );
    const viaGet = await clipQueryBuilder.execute({
      userId: viewerId,
      allowedInstanceIds: BOTH,
      request: fromQuery,
    });
    const getKeys = viaGet.items
      .map((clip) => `${clip.id}:${clip.instanceId}`)
      .sort();
    expect(await listed(body)).toEqual(getKeys);
    expect(getKeys).toEqual([...at(X, K1), ...at(Y, K1)].sort());
  });
});

/**
 * The name a clip shows (R7): the Title sort, the search and the Title
 * filter's comparisons read the clip's title, else its live primary tag's
 * name; Title is set / not set still reads the clip's own title. One made-up
 * instance holds:
 * - tags 7893001 "Anal" (live) and 7893002 "Gone" (deleted)
 * - clip 7893101 titled "Zebra" (primary tag "Anal")
 * - clip 7893102 untitled, primary tag "Anal"
 * - clip 7893103 untitled (an empty title), primary tag "Gone"
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Clip filters: the shown name (integration)", () => {
  const N = "cfn-a";
  const [TAG_LIVE, TAG_GONE] = ["7893001", "7893002"];
  const [ZEBRA, BY_TAG, BY_GONE] = ["7893101", "7893102", "7893103"];
  const SCENE = "7893001";

  async function removeRows(): Promise<void> {
    const where = { stashInstanceId: N };
    await prisma.stashClip.deleteMany({ where });
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
  }

  /** The clip ids a request lists, in the page's order */
  async function ids(
    overrides: Partial<ClipListRequest> = {}
  ): Promise<string[]> {
    const { items, total } = await clipQueryBuilder.execute({
      userId: 0,
      applyExclusions: false,
      allowedInstanceIds: [N],
      request: parsedClipRequest({ perPage: 100, ...overrides }),
    });
    expect(total).toBe(items.length);
    return items.map((clip) => clip.id);
  }

  const bySort = (direction: "ASC" | "DESC"): Partial<ClipListRequest> => ({
    sort: { field: "title", direction, seed: undefined },
  });

  beforeAll(async () => {
    await removeRows();
    await prisma.stashTag.createMany({
      data: [
        { id: TAG_LIVE, stashInstanceId: N, name: "Anal" },
        {
          id: TAG_GONE,
          stashInstanceId: N,
          name: "Gone",
          deletedAt: new Date(),
        },
      ],
    });
    await prisma.stashScene.create({
      data: { id: SCENE, stashInstanceId: N, title: "Scene" },
    });
    const clip = (id: string, title: string | null, tagId?: string) => ({
      id,
      stashInstanceId: N,
      sceneId: SCENE,
      sceneInstanceId: N,
      title,
      seconds: Number(id) - 7893100,
      ...(tagId === undefined
        ? {}
        : { primaryTagId: tagId, primaryTagInstanceId: N }),
    });
    await prisma.stashClip.createMany({
      data: [
        clip(ZEBRA, "Zebra", TAG_LIVE),
        clip(BY_TAG, null, TAG_LIVE),
        clip(BY_GONE, "", TAG_GONE),
      ],
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("an untitled clip sorts by its tag's name", async () => {
    // Anal, Zebra, then the clips with neither (a deleted tag names nothing)
    expect(await ids(bySort("ASC"))).toEqual([BY_TAG, ZEBRA, BY_GONE]);
    // The clips with neither stay last in descending order too
    expect(await ids(bySort("DESC"))).toEqual([ZEBRA, BY_TAG, BY_GONE]);
  });

  it("the search finds an untitled clip by its tag's name", async () => {
    expect(await ids({ q: "anal" })).toEqual([BY_TAG]);
    expect(await ids({ q: "gone" })).toEqual([]);
  });

  it("Title contains 'ana' finds the untitled clip", async () => {
    expect(
      await ids({
        filter: { title: { modifier: "INCLUDES", value: "ana" } },
        ...bySort("ASC"),
      })
    ).toEqual([BY_TAG]);
  });

  it("Title is not set finds both untitled clips, and Title is set the titled one", async () => {
    expect(
      (await ids({ filter: { title: { modifier: "IS_NULL" } } })).sort()
    ).toEqual([BY_TAG, BY_GONE].sort());
    expect(await ids({ filter: { title: { modifier: "NOT_NULL" } } })).toEqual([
      ZEBRA,
    ]);
  });
});
