/**
 * The two shapes of a ref filter against real SQLite (item 74).
 *
 * Up to PAIR_INLINE_LIMIT refs are bound inline as OR-ed pairs; above it
 * the refs travel as one JSON parameter into a materialized set the scene
 * is matched against, so a subtree of 1,200 tags filters where an OR chain
 * of that size fails to prepare. Two made-up instances reuse the same tag
 * and scene ids, as two Stash servers do; instance A also holds a root tag
 * with CHILDREN child tags, each on one scene of its own. A tag on both
 * instances is held by one scene of each directly and one of each through
 * its inherited list. Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { must } from "../../tests/helpers/must.js";
import type {
  FilterRef,
  ParsedFilter,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { PAIR_INLINE_LIMIT } from "../../utils/sqlClauses.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  type LargeLibraryPlanner,
  largeLibraryPlanner,
} from "../helpers/largeLibraryPlanner.js";
import { recordStatements } from "../helpers/statementRecorder.js";
import {
  adminClient,
  restoreInstanceSelection,
  selectAllInstances,
} from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "refshape-it-a";
const B = "refshape-it-b";
const USERNAME = "refshape-it-u";
const CHILDREN = 1200;

const ROOT = "7840000";
const childTag = (i: number) => String(7840000 + i);
const childScene = (i: number) => String(7850000 + i);
/** A tag and a scene present on both instances */
const SHARED_TAG = "7849999";
const SHARED_SCENE = "7859999";
/** A scene with no title, details or codecs, and one with all of them */
const BLANK_SCENE = "7859998";
const TITLED_SCENE = "7859997";
/** A tag on both instances, held directly by DIRECT_SCENE and inherited by INHERITING_SCENE on each */
const INHERITED_TAG = "7849997";
const DIRECT_SCENE = "7859995";
const INHERITING_SCENE = "7859994";

let u: number;
let planner: LargeLibraryPlanner;

const ref = (id: string, instanceId = A): FilterRef => ({ id, instanceId });
/** A legacy id with no instance */
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });
const childRefs = (n: number) =>
  Array.from({ length: n }, (_, i) => ref(childTag(i + 1)));

function request(
  filter: ParsedFilter<"scene">,
  perPage = 250
): ParsedListRequest<"scene"> {
  return {
    page: 1,
    perPage,
    q: undefined,
    sort: { field: "created_at", direction: "DESC", seed: undefined },
    filter,
    specificInstanceId: undefined,
    dropped: [],
  };
}

async function removeRows(): Promise<void> {
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
  await prisma.userStashInstance.deleteMany({
    where: { instanceId: { in: [A, B] } },
  });
  await prisma.stashInstance.deleteMany({ where: { id: { in: [A, B] } } });
}

async function seed(): Promise<void> {
  for (const [index, id] of [A, B].entries()) {
    await prisma.stashInstance.create({
      data: {
        id,
        name: id,
        url: "http://127.0.0.1:9/graphql",
        apiKey: "fixture-key",
        enabled: true,
        priority: 930 + index,
        // Synced: its content shows (a first-syncing instance does not)
        firstSyncedAt: new Date(),
      },
    });
  }

  const children = Array.from({ length: CHILDREN }, (_, i) => i + 1);
  await prisma.stashTag.createMany({
    data: [
      { id: ROOT, stashInstanceId: A, name: "Refshape root" },
      ...children.map((i) => ({
        id: childTag(i),
        stashInstanceId: A,
        name: `Refshape child ${i}`,
        parentIds: JSON.stringify([ROOT]),
      })),
      { id: SHARED_TAG, stashInstanceId: A, name: "Refshape shared A" },
      { id: SHARED_TAG, stashInstanceId: B, name: "Refshape shared B" },
      ...[A, B].map((instance) => ({
        id: INHERITED_TAG,
        stashInstanceId: instance,
        name: `Refshape inherited ${instance}`,
      })),
    ],
  });

  await prisma.stashScene.createMany({
    data: [
      ...children.map((i) => ({
        id: childScene(i),
        stashInstanceId: A,
        title: `Refshape scene ${i}`,
      })),
      { id: SHARED_SCENE, stashInstanceId: A, title: "Refshape shared A" },
      { id: SHARED_SCENE, stashInstanceId: B, title: "Refshape shared B" },
      {
        id: BLANK_SCENE,
        stashInstanceId: A,
        title: null,
        details: null,
        fileVideoCodec: null,
        fileAudioCodec: "",
        filePath: "/refshape/blank.mp4",
      },
      {
        id: TITLED_SCENE,
        stashInstanceId: A,
        title: "Refshape titled",
        details: "Some details",
        fileVideoCodec: "h264",
        fileAudioCodec: "aac",
        filePath: "/refshape/titled.mp4",
      },
      ...[A, B].flatMap((instance) => [
        {
          id: DIRECT_SCENE,
          stashInstanceId: instance,
          title: `Refshape direct ${instance}`,
        },
        {
          id: INHERITING_SCENE,
          stashInstanceId: instance,
          title: `Refshape inheriting ${instance}`,
          inheritedTagIds: JSON.stringify([INHERITED_TAG]),
        },
      ]),
    ],
  });

  await prisma.sceneTag.createMany({
    data: [
      ...children.map((i) => ({
        sceneId: childScene(i),
        sceneInstanceId: A,
        tagId: childTag(i),
        tagInstanceId: A,
      })),
      ...[A, B].map((instance) => ({
        sceneId: SHARED_SCENE,
        sceneInstanceId: instance,
        tagId: SHARED_TAG,
        tagInstanceId: instance,
      })),
      ...[A, B].map((instance) => ({
        sceneId: DIRECT_SCENE,
        sceneInstanceId: instance,
        tagId: INHERITED_TAG,
        tagInstanceId: instance,
      })),
    ],
  });

  u = (
    await prisma.user.create({
      data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
    })
  ).id;
}

/** The scenes on A and B, as the seeded user sees them */
const SEEDED_ON_A = CHILDREN + 5;
const SEEDED_ON_B = 3;

describeWithDb("Ref clause shapes", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
    planner = await largeLibraryPlanner();
  }, 120_000);

  afterAll(async () => {
    await planner.close();
    await removeRows();
  });

  it("INCLUDES with 1,200 expanded refs returns the right count", async () => {
    const { items, total } = await sceneQueryBuilder.execute({
      userId: u,
      allowedInstanceIds: [A, B],
      request: request({
        tags: { refs: childRefs(CHILDREN), modifier: "INCLUDES", depth: 0 },
      }),
    });

    expect(total).toBe(CHILDREN);
    expect(items).toHaveLength(250);
    expect(items.every((s) => s.instanceId === A)).toBe(true);
    expect(items.every((s) => s.tags.length === 1)).toBe(true);
  });

  it("EXCLUDES with the large shape excludes exactly the matched scenes", async () => {
    const { total } = await sceneQueryBuilder.execute({
      userId: u,
      allowedInstanceIds: [A, B],
      request: request({
        tags: { refs: childRefs(CHILDREN), modifier: "EXCLUDES", depth: 0 },
      }),
    });

    expect(total).toBe(SEEDED_ON_A + SEEDED_ON_B - CHILDREN);
  });

  it("a subtree filter (depth -1 on the root) expands to the large shape and lists every child's scene", async () => {
    const { total } = await sceneQueryBuilder.execute({
      userId: u,
      allowedInstanceIds: [A, B],
      request: request({
        tags: { refs: [ref(ROOT)], modifier: "INCLUDES", depth: -1 },
      }),
    });

    expect(total).toBe(CHILDREN);
  });

  it("a large set including one bare ref, for a user allowed only some instances, matches the bare ref on the allowed instances only", async () => {
    const refs = [...childRefs(PAIR_INLINE_LIMIT), bare(SHARED_TAG)];
    const recorder = recordStatements();
    let result: Awaited<ReturnType<typeof sceneQueryBuilder.execute>>;
    try {
      result = await sceneQueryBuilder.execute({
        userId: u,
        allowedInstanceIds: [B],
        request: request({ tags: { refs, modifier: "INCLUDES", depth: 0 } }),
      });
    } finally {
      recorder.restore();
    }

    expect(result.total).toBe(1);
    expect(result.items.map((s) => [s.id, s.instanceId])).toEqual([
      [SHARED_SCENE, B],
    ]);
    // The bound pair list names the bare tag on B only
    const page = must(recorder.statements[0]);
    const json = page.params.find(
      (p): p is string => typeof p === "string" && p.startsWith("[[")
    );
    const pairsBound = JSON.parse(
      must(json, "the JSON parameter")
    ) as string[][];
    expect(pairsBound.filter(([id]) => id === SHARED_TAG)).toEqual([
      [SHARED_TAG, B],
    ]);
  });

  it("the large shape materializes the matched set and probes the scene by primary key; the small shape is a correlated subquery", async () => {
    const recorder = recordStatements();
    try {
      // Under a sort with no index: an indexed sort's page reads the refs
      // list instead (L9, pinned below)
      await sceneQueryBuilder.execute({
        userId: u,
        allowedInstanceIds: [A],
        request: {
          ...request({
            tags: {
              refs: childRefs(CHILDREN),
              modifier: "INCLUDES",
              depth: 0,
            },
          }),
          sort: { field: "rating", direction: "DESC", seed: undefined },
        },
      });
      await sceneQueryBuilder.execute({
        userId: u,
        allowedInstanceIds: [A],
        request: request({
          tags: { refs: childRefs(CHILDREN), modifier: "EXCLUDES", depth: 0 },
        }),
      });
      await sceneQueryBuilder.execute({
        userId: u,
        allowedInstanceIds: [A],
        request: request({
          tags: { refs: childRefs(3), modifier: "INCLUDES", depth: 0 },
        }),
      });
    } finally {
      recorder.restore();
    }
    // Each call's page and count (its nested refs load after, from the page)
    const [largeIncludes, , largeExcludes, , small] =
      recorder.statements.filter((statement) =>
        statement.sql.includes("FROM StashScene s")
      );
    const plan = async (statement: typeof largeIncludes) => {
      const lines = await planner.planOf(
        must(statement).sql,
        ...must(statement).params
      );
      return lines.join("\n");
    };

    // The matched set is built once (never per row) and the scene is matched
    // against it as a list; with statistics SQLite drives the list into the
    // scene's primary key (measured on the 200k copy, see the progress log)
    const includesPlan = await plan(largeIncludes);
    expect(includesPlan).toContain("MATERIALIZE tags_refs");
    expect(includesPlan).toContain("MATERIALIZE tags_matched");
    expect(includesPlan).toMatch(/LIST SUBQUERY/);
    expect(includesPlan).not.toContain("CORRELATED");

    const excludesPlan = await plan(largeExcludes);
    expect(excludesPlan).toContain("MATERIALIZE tags_matched");
    expect(excludesPlan).toMatch(/LIST SUBQUERY/);
    expect(excludesPlan).not.toContain("CORRELATED");

    const smallPlan = await plan(small);
    expect(smallPlan).toContain("CORRELATED SCALAR SUBQUERY");
    expect(smallPlan).not.toContain("MATERIALIZE");
  });

  // L8: a sort with no index reads every match and sorts it, so a small
  // filter reads the tagged scenes from SceneTag's tag index as a list; an
  // indexed sort walks its index and probes each scene's tags, stopping at
  // the page (measured on the 200k and prod copies, see the progress log)
  it("a small filter under a sort with no index reads SceneTag by its tag index as a list; an indexed sort keeps the correlated probe", async () => {
    const recorder = recordStatements();
    try {
      for (const field of ["rating", "created_at"] as const) {
        await sceneQueryBuilder.execute({
          userId: u,
          allowedInstanceIds: [A],
          request: {
            ...request({
              tags: { refs: childRefs(3), modifier: "INCLUDES", depth: 0 },
            }),
            sort: { field, direction: "DESC", seed: undefined },
          },
        });
      }
    } finally {
      recorder.restore();
    }
    const [ratingPage, ratingCount, createdPage] = recorder.statements.filter(
      (statement) => statement.sql.includes("FROM StashScene s")
    );
    const plan = async (statement: typeof ratingPage) =>
      (
        await planner.planOf(must(statement).sql, ...must(statement).params)
      ).join("\n");

    for (const statement of [ratingPage, ratingCount]) {
      const lines = await plan(statement);
      expect(lines).toContain(
        "SEARCH st USING INDEX SceneTag_tagId_tagInstanceId_idx"
      );
      expect(lines).toMatch(/LIST SUBQUERY/);
      expect(lines).not.toContain("sqlite_autoindex_SceneTag_1");
    }

    const created = await plan(createdPage);
    expect(created).toContain("CORRELATED SCALAR SUBQUERY");
    expect(created).toContain("sqlite_autoindex_SceneTag_1");
    expect(created).not.toContain("SceneTag_tagId_tagInstanceId_idx");
  });

  // L9: a count walks no order, so under an indexed sort too it reads the
  // tagged scenes from SceneTag's tag index as a list, while the page walks
  // the sort index and probes each scene's tags
  it("under an indexed sort the count of a small filter reads SceneTag by its tag index as a list, the page probes each scene", async () => {
    const recorder = recordStatements();
    try {
      await sceneQueryBuilder.execute({
        userId: u,
        allowedInstanceIds: [A],
        request: request({
          tags: { refs: childRefs(3), modifier: "INCLUDES", depth: 0 },
        }),
      });
    } finally {
      recorder.restore();
    }
    const [page, count] = recorder.statements.filter((statement) =>
      statement.sql.includes("FROM StashScene s")
    );
    const plan = async (statement: typeof page) =>
      (
        await planner.planOf(must(statement).sql, ...must(statement).params)
      ).join("\n");

    expect(must(count).sql).toContain("SELECT COUNT(*) AS total");
    const countPlan = await plan(count);
    expect(countPlan).toContain(
      "SEARCH st USING INDEX SceneTag_tagId_tagInstanceId_idx"
    );
    expect(countPlan).toMatch(/LIST SUBQUERY/);
    expect(countPlan).not.toContain("sqlite_autoindex_SceneTag_1");

    const pagePlan = await plan(page);
    expect(pagePlan).toContain("CORRELATED SCALAR SUBQUERY");
    expect(pagePlan).toContain("sqlite_autoindex_SceneTag_1");
  });

  // L9: above the inline limit an indexed sort's page reads the refs list's
  // junction rows by the tag index (no matched set is built) and walks the
  // sort index; its count keeps the matched set
  it("under an indexed sort a large filter's page reads the refs list by the tag index with no matched set; its count reads the matched set", async () => {
    const recorder = recordStatements();
    try {
      await sceneQueryBuilder.execute({
        userId: u,
        allowedInstanceIds: [A],
        request: request({
          tags: { refs: childRefs(CHILDREN), modifier: "INCLUDES", depth: 0 },
        }),
      });
    } finally {
      recorder.restore();
    }
    const [page, count] = recorder.statements.filter((statement) =>
      statement.sql.includes("FROM StashScene s")
    );
    const plan = async (statement: typeof page) =>
      (
        await planner.planOf(must(statement).sql, ...must(statement).params)
      ).join("\n");

    const pagePlan = await plan(page);
    expect(pagePlan).toContain("MATERIALIZE tags_refs");
    expect(pagePlan).toContain(
      "SEARCH st USING INDEX SceneTag_tagId_tagInstanceId_idx"
    );
    expect(pagePlan).toMatch(/LIST SUBQUERY/);
    expect(pagePlan).not.toContain("tags_matched");

    const countPlan = await plan(count);
    expect(countPlan).toContain("MATERIALIZE tags_matched");
    expect(countPlan).not.toContain("CORRELATED");
  });

  it.each([
    ["created_at", "DESC"],
    ["title", "ASC"],
    ["rating", "DESC"],
    ["play_count", "DESC"],
    ["random", "DESC"],
  ] as const)(
    "a small tag filter sorted by %s matches the junction and the inherited list on the ref's instance",
    async (field, direction) => {
      const keysOf = async (refs: FilterRef[]) => {
        const { items, total } = await sceneQueryBuilder.execute({
          userId: u,
          allowedInstanceIds: [A, B],
          request: {
            ...request({ tags: { refs, modifier: "INCLUDES", depth: 0 } }),
            sort: {
              field,
              direction,
              seed: field === "random" ? 424242 : undefined,
            },
          },
        });
        expect(total).toBe(items.length);
        return items.map((s) => `${s.id}@${s.instanceId}`).sort();
      };
      const on = (instance: string) =>
        [
          `${DIRECT_SCENE}@${instance}`,
          `${INHERITING_SCENE}@${instance}`,
        ].sort();

      expect(await keysOf([ref(INHERITED_TAG)])).toEqual(on(A));
      expect(await keysOf([ref(INHERITED_TAG, B)])).toEqual(on(B));
      expect(await keysOf([bare(INHERITED_TAG)])).toEqual(
        [...on(A), ...on(B)].sort()
      );
    }
  );

  it("IS_NULL and NOT_NULL match on title, details and the codecs", async () => {
    const ids = async (filter: ParsedFilter<"scene">) => {
      const { items } = await sceneQueryBuilder.execute({
        userId: u,
        allowedInstanceIds: [A],
        request: request({
          ...filter,
          ids: {
            refs: [ref(BLANK_SCENE), ref(TITLED_SCENE)],
            modifier: "INCLUDES",
            depth: 0,
          },
        }),
      });
      return items.map((s) => s.id).sort();
    };

    for (const field of [
      "title",
      "details",
      "video_codec",
      "audio_codec",
    ] as const) {
      expect(await ids({ [field]: { modifier: "IS_NULL" } }), field).toEqual([
        BLANK_SCENE,
      ]);
      expect(await ids({ [field]: { modifier: "NOT_NULL" } }), field).toEqual([
        TITLED_SCENE,
      ]);
    }
  });

  describe("through the API", () => {
    beforeAll(async () => {
      await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
      // Every enabled instance, the two seeded ones included
      await selectAllInstances();
    });

    afterAll(restoreInstanceSelection);

    it.each([900, 1000])(
      "an ids filter of %i refs answers 200 with the right rows",
      async (count) => {
        const response = await adminClient.post<{
          findScenes: {
            scenes: { id: string; instanceId: string }[];
            count: number;
          };
        }>("/api/library/scenes", {
          ids: Array.from(
            { length: count },
            (_, i) => `${childScene(i + 1)}:${A}`
          ),
          filter: { per_page: 250, sort: "title", direction: "ASC" },
        });

        expect(response.status, JSON.stringify(response.data)).toBe(200);
        expect(response.data.findScenes.count).toBe(count);
        expect(response.data.findScenes.scenes).toHaveLength(250);
        expect(
          response.data.findScenes.scenes.every(
            (s) => s.instanceId === A && Number(s.id) <= 7850000 + count
          )
        ).toBe(true);
      }
    );
  });
});
