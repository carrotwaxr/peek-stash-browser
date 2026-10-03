/**
 * The where tree compiled after the base clauses (item 64, #425,
 * FILTERS-12), against the real test SQLite database. Each case compares
 * the builder's ids and total with SQL written by hand over the junctions.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do. Tags
 * a, b, c, d, f and m1..m20, performers p and q, studio s on both:
 * - wt-a: scene 1 (a, c), 2 (b, inherits d), 3 (a), 4 (c), 5 (a, b, c),
 *   6 (f), 7 (performer q), 8 (f, watched), 9 (f, hidden by the viewer),
 *   10 (f, restricted for the viewer), 11 (p, a, studio s), 12 (p, c),
 *   13 (p), 14 (studio s), 15 (p, studio s), 21..40 (m1..m20 one each, and
 *   scene 21 also m2); clips 1 (primary tag a), 2 (tag list c), 3 (tag list
 *   d), 4 (no tag), all of scene 1
 * - wt-b: scene 1 (a, c)
 * The viewer favours tag f and performer q on wt-a. Every seeded row is
 * deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import {
  parsedClipRequest,
  parsedListRequest,
} from "../../tests/helpers/fixtures.js";
import type {
  FilterRef,
  ParsedFilter,
  ParsedWhereGroup,
  ParsedWhereLeaf,
  RefCriterion,
} from "../../types/parsedFilters.js";
import { mirrorInheritedTags } from "../helpers/inheritedTags.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "wt-a";
const B = "wt-b";
const INSTANCES = [A, B];
const USERNAME = "wt-where-viewer";

const TAG = {
  a: "7910001",
  b: "7910002",
  c: "7910003",
  d: "7910004",
  f: "7910005",
} as const;
const m = (i: number) => String(7910100 + i);
const PERFORMER = { p: "7910001", q: "7910002" } as const;
const STUDIO = "7910001";
const scene = (n: number) => String(7920000 + n);
const clip = (n: number) => String(7930000 + n);
const [HIDDEN, RESTRICTED] = [scene(9), scene(10)];

let userId = 0;

const key = (id: string, instanceId: string) => `${id}:${instanceId}`;
const keys = (rows: Array<{ id: string; instanceId: string }>): string[] =>
  rows.map((row) => key(row.id, row.instanceId)).sort();

/** "id" or "id:instance", as the parser hands a ref over */
const refOf = (value: string): FilterRef => {
  const [id = "", instanceId] = value.split(":");
  return { id, instanceId };
};
const refs = (
  modifier: RefCriterion["modifier"],
  ...values: string[]
): RefCriterion => ({ refs: values.map(refOf), modifier, depth: 0 });
const row = <F extends "tags" | "performers" | "studios" | "groups">(
  field: F,
  criterion: RefCriterion
) => ({ field, criterion }) as const;
const tags = (...values: string[]) => row("tags", refs("INCLUDES", ...values));
const any = (
  ...rules: ParsedWhereGroup<"scene">["rules"]
): ParsedWhereGroup<"scene"> => ({ match: "any", rules });
const all = (
  ...rules: ParsedWhereGroup<"scene">["rules"]
): ParsedWhereGroup<"scene"> => ({ match: "all", rules });

interface Listed {
  readonly ids: string[];
  readonly total: number | null;
}

/** One scene page for the viewer, with their exclusions */
async function scenes(
  request: {
    filter?: ParsedFilter<"scene">;
    where?: ParsedWhereGroup<"scene">;
  },
  allowedInstanceIds: string[] = INSTANCES
): Promise<Listed> {
  const { items, total } = await sceneQueryBuilder.execute({
    userId,
    allowedInstanceIds,
    request: parsedListRequest("scene", {
      perPage: 100,
      filter: request.filter ?? {},
      ...(request.where ? { where: request.where } : {}),
    }),
  });
  return { ids: keys(items), total };
}

/**
 * The scenes the viewer sees that meet `condition` (SQL over `s`), written
 * by hand: live, on an allowed instance, with no exclusion row for the
 * viewer
 */
async function byHand(
  condition: string,
  allowedInstanceIds: string[] = INSTANCES
): Promise<Listed> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; inst: string }>
  >(
    `SELECT s.id, s.stashInstanceId AS inst FROM StashScene s
     WHERE s.deletedAt IS NULL
       AND s.stashInstanceId IN (SELECT value FROM json_each(?))
       AND NOT EXISTS (SELECT 1 FROM UserExcludedEntity x WHERE x.userId = ? AND x.entityType = 'scene' AND x.entityId = s.id AND x.instanceId IN ('', s.stashInstanceId))
       AND (${condition})`,
    JSON.stringify(allowedInstanceIds),
    userId
  );
  const ids = rows.map((r) => key(r.id, r.inst)).sort();
  return { ids, total: ids.length };
}

/** The scene holds one of the tags, its own or inherited, on its own instance */
const holdsTag = (...ids: string[]) => {
  const list = ids.map((id) => `'${id}'`).join(", ");
  return `(EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND st.tagId IN (${list})) OR EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = s.id AND sit.sceneInstanceId = s.stashInstanceId AND sit.tagId IN (${list})))`;
};
const holdsPerformer = (id: string) =>
  `EXISTS (SELECT 1 FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND sp.performerId = '${id}')`;

async function seed(): Promise<void> {
  userId = (
    await prisma.user.create({
      data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
    })
  ).id;

  const named = (id: string, instance: string, name: string) => ({
    id,
    stashInstanceId: instance,
    name: `${name} ${instance}`,
  });
  const tagIds = [
    ...Object.values(TAG),
    ...Array.from({ length: 20 }, (_, i) => m(i + 1)),
  ];
  await prisma.stashTag.createMany({
    data: INSTANCES.flatMap((instance) =>
      tagIds.map((id) => named(id, instance, `Where tag ${id}`))
    ),
  });
  await prisma.stashPerformer.createMany({
    data: INSTANCES.flatMap((instance) =>
      Object.values(PERFORMER).map((id) =>
        named(id, instance, `Where performer ${id}`)
      )
    ),
  });
  await prisma.stashStudio.createMany({
    data: INSTANCES.map((instance) => named(STUDIO, instance, "Where studio")),
  });

  /** Scene n on A: its tags, inherited tags, performers and studio */
  const plan: Record<
    number,
    {
      tags?: string[];
      inherits?: string[];
      performers?: string[];
      studio?: boolean;
    }
  > = {
    1: { tags: [TAG.a, TAG.c] },
    2: { tags: [TAG.b], inherits: [TAG.d] },
    3: { tags: [TAG.a] },
    4: { tags: [TAG.c] },
    5: { tags: [TAG.a, TAG.b, TAG.c] },
    6: { tags: [TAG.f] },
    7: { performers: [PERFORMER.q] },
    8: { tags: [TAG.f] },
    9: { tags: [TAG.f] },
    10: { tags: [TAG.f] },
    11: { tags: [TAG.a], performers: [PERFORMER.p], studio: true },
    12: { tags: [TAG.c], performers: [PERFORMER.p] },
    13: { performers: [PERFORMER.p] },
    14: { studio: true },
    15: { performers: [PERFORMER.p], studio: true },
    ...Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        21 + i,
        { tags: i === 0 ? [m(1), m(2)] : [m(i + 1)] },
      ])
    ),
  };
  await prisma.stashScene.createMany({
    data: [
      ...Object.entries(plan).map(([n, p]) => ({
        id: scene(Number(n)),
        stashInstanceId: A,
        title: `Where scene ${n}`,
        ...(p.studio ? { studioId: STUDIO } : {}),
        ...(p.inherits ? { inheritedTagIds: JSON.stringify(p.inherits) } : {}),
      })),
      { id: scene(1), stashInstanceId: B, title: "Where scene 1 B" },
    ],
  });
  await mirrorInheritedTags(INSTANCES);
  await prisma.sceneTag.createMany({
    data: [
      ...Object.entries(plan).flatMap(([n, p]) =>
        (p.tags ?? []).map((tagId) => ({
          sceneId: scene(Number(n)),
          sceneInstanceId: A,
          tagId,
          tagInstanceId: A,
        }))
      ),
      ...[TAG.a, TAG.c].map((tagId) => ({
        sceneId: scene(1),
        sceneInstanceId: B,
        tagId,
        tagInstanceId: B,
      })),
    ],
  });
  await prisma.scenePerformer.createMany({
    data: Object.entries(plan).flatMap(([n, p]) =>
      (p.performers ?? []).map((performerId) => ({
        sceneId: scene(Number(n)),
        sceneInstanceId: A,
        performerId,
        performerInstanceId: A,
      }))
    ),
  });

  await prisma.stashClip.createMany({
    data: [1, 2, 3, 4].map((n) => ({
      id: clip(n),
      stashInstanceId: A,
      sceneId: scene(1),
      sceneInstanceId: A,
      title: `Where clip ${n}`,
      seconds: n,
      ...(n === 1 ? { primaryTagId: TAG.a, primaryTagInstanceId: A } : {}),
    })),
  });
  await prisma.clipTag.createMany({
    data: [
      { clipId: clip(2), clipInstanceId: A, tagId: TAG.c, tagInstanceId: A },
      { clipId: clip(3), clipInstanceId: A, tagId: TAG.d, tagInstanceId: A },
    ],
  });

  await prisma.tagRating.create({
    data: { userId, instanceId: A, tagId: TAG.f, favorite: true },
  });
  await prisma.performerRating.create({
    data: { userId, instanceId: A, performerId: PERFORMER.q, favorite: true },
  });
  await prisma.watchHistory.create({
    data: { userId, instanceId: A, sceneId: scene(8), playCount: 1 },
  });
  await prisma.userExcludedEntity.createMany({
    data: [
      {
        userId,
        entityType: "scene",
        entityId: HIDDEN,
        instanceId: A,
        reason: "hidden",
      },
      {
        userId,
        entityType: "scene",
        entityId: RESTRICTED,
        instanceId: A,
        reason: "restricted",
      },
    ],
  });
}

/** Clips first (their tags cascade), then the rest; the viewer's rows cascade */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: INSTANCES } };
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  await prisma.stashClip.deleteMany({ where });
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

describeWithDb("The where tree (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  });

  afterAll(async () => {
    await removeRows();
  });

  describe("item 64 and #425: two Tags rows at the root", () => {
    it("INCLUDES [a, b] and INCLUDES [c, d] list the scenes holding (a or b) and (c or d)", async () => {
      const listed = await scenes({
        where: all(tags(TAG.a, TAG.b), tags(TAG.c, TAG.d)),
      });
      const expected = await byHand(
        `${holdsTag(TAG.a, TAG.b)} AND ${holdsTag(TAG.c, TAG.d)}`
      );

      expect(listed).toEqual(expected);
      // Scene 2 holds d through its inherited tags
      expect(listed.ids).toEqual(
        [
          key(scene(1), A),
          key(scene(1), B),
          key(scene(2), A),
          key(scene(5), A),
        ].sort()
      );
    });

    it("INCLUDES_ALL [a, b] and INCLUDES [c] list the scenes holding a, b and c", async () => {
      const listed = await scenes({
        where: all(
          row("tags", refs("INCLUDES_ALL", TAG.a, TAG.b)),
          tags(TAG.c)
        ),
      });
      const expected = await byHand(
        `${holdsTag(TAG.a)} AND ${holdsTag(TAG.b)} AND ${holdsTag(TAG.c)}`
      );

      expect(listed).toEqual(expected);
      expect(listed.ids).toEqual([key(scene(5), A)]);
    });
  });

  it("an any group: favourite tag OR favourite performer, AND unwatched, is the union AND-ed with unwatched", async () => {
    const favourites: ParsedWhereLeaf<"scene">[] = [
      { field: "tag_favorite", criterion: true },
      { field: "performer_favorite", criterion: true },
    ];
    const listed = await scenes({
      where: all(any(...favourites), { field: "watched", criterion: false }),
    });
    const unwatched = `NOT EXISTS (SELECT 1 FROM WatchHistory w WHERE w.userId = ${userId} AND w.sceneId = s.id AND w.instanceId = s.stashInstanceId AND w.playCount > 0)`;
    const expected = await byHand(
      `(${holdsTag(TAG.f)} OR ${holdsPerformer(PERFORMER.q)}) AND ${unwatched}`
    );

    expect(listed).toEqual(expected);
    expect(listed.ids).toEqual([key(scene(6), A), key(scene(7), A)]);
  });

  it("invariant 3: a scene the viewer hid or is restricted from, holding the any group's tag, is never listed or counted", async () => {
    const listed = await scenes({
      where: any(tags(TAG.f), row("performers", refs("INCLUDES", PERFORMER.q))),
    });
    const expected = await byHand(
      `${holdsTag(TAG.f)} OR ${holdsPerformer(PERFORMER.q)}`
    );

    expect(listed).toEqual(expected);
    expect(listed.ids).not.toContain(key(HIDDEN, A));
    expect(listed.ids).not.toContain(key(RESTRICTED, A));
    // Scenes 6, 7 and 8 (watched, but not excluded)
    expect(listed.total).toBe(3);
  });

  it("invariant 11: a row naming an instance the viewer cannot see lists nothing from it; a bare id lists the allowed instance's only", async () => {
    expect(await scenes({ where: all(tags(`${TAG.a}:${B}`)) }, [A])).toEqual({
      ids: [],
      total: 0,
    });

    const bare = await scenes(
      {
        where: any(
          tags(TAG.a),
          row("studios", refs("INCLUDES", `${STUDIO}:${B}`))
        ),
      },
      [A]
    );
    expect(bare).toEqual(await byHand(holdsTag(TAG.a), [A]));
    expect(bare.ids.every((id) => id.endsWith(`:${A}`))).toBe(true);
    expect(bare.total).toBe(4);
  });

  it("page lock (FILTERS-12): a performer page's rows in an any group list only that performer's scenes", async () => {
    const listed = await scenes({
      filter: { performers: refs("INCLUDES", `${PERFORMER.p}:${A}`) },
      where: any(tags(TAG.a), row("studios", refs("INCLUDES", STUDIO))),
    });
    const expected = await byHand(
      `${holdsPerformer(PERFORMER.p)} AND s.stashInstanceId = '${A}' AND (${holdsTag(TAG.a)} OR s.studioId = '${STUDIO}')`
    );

    expect(listed).toEqual(expected);
    expect(listed.ids).toEqual([key(scene(11), A), key(scene(15), A)]);
  });

  it("a tag page's Tags row lists the scenes holding both", async () => {
    const listed = await scenes({
      filter: { tags: refs("INCLUDES", TAG.a) },
      where: all(tags(TAG.c)),
    });
    const expected = await byHand(`${holdsTag(TAG.a)} AND ${holdsTag(TAG.c)}`);

    expect(listed).toEqual(expected);
    expect(listed.ids).toEqual(
      [key(scene(1), A), key(scene(1), B), key(scene(5), A)].sort()
    );
  });

  it("20 one-tag rows under any equal one 20-tag row, in ids and total", async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => m(i + 1));
    const rows = await scenes({ where: any(...twenty.map((id) => tags(id))) });
    const one = await scenes({ where: all(tags(...twenty)) });

    expect(rows).toEqual(one);
    expect(rows).toEqual(await byHand(holdsTag(...twenty)));
    expect(rows.total).toBe(20);
  });

  it("clips: an any group of two clip tags equals the union", async () => {
    const where: ParsedWhereGroup<"clip"> = {
      match: "any",
      rules: [
        { field: "tags", criterion: refs("INCLUDES", TAG.a) },
        { field: "tags", criterion: refs("INCLUDES", TAG.c) },
      ],
    };
    const { items, total } = await clipQueryBuilder.execute({
      userId,
      allowedInstanceIds: INSTANCES,
      request: parsedClipRequest({ perPage: 100, where }),
    });
    const handRows = await prisma.$queryRawUnsafe<
      Array<{ id: string; inst: string }>
    >(
      `SELECT c.id, c.stashInstanceId AS inst FROM StashClip c
       JOIN StashScene s ON s.id = c.sceneId AND s.stashInstanceId = c.sceneInstanceId
       WHERE c.deletedAt IS NULL AND s.deletedAt IS NULL
         AND c.stashInstanceId IN ('${A}', '${B}')
         AND (c.primaryTagId IN ('${TAG.a}', '${TAG.c}')
           OR EXISTS (SELECT 1 FROM ClipTag ct WHERE ct.clipId = c.id AND ct.clipInstanceId = c.stashInstanceId AND ct.tagId IN ('${TAG.a}', '${TAG.c}')))`
    );
    const expected = handRows.map((r) => key(r.id, r.inst)).sort();

    expect(keys(items)).toEqual(expected);
    expect(total).toBe(expected.length);
    expect(expected).toEqual([key(clip(1), A), key(clip(2), A)]);
  });
});
