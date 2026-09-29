/**
 * The two shapes of a ref filter against real SQLite (item 74).
 *
 * Up to PAIR_INLINE_LIMIT refs are bound inline as OR-ed pairs; above it
 * the refs travel as one JSON parameter into a materialized set the scene
 * is matched against, so a subtree of 1,200 tags filters where an OR chain
 * of that size fails to prepare. Two made-up instances reuse the same tag
 * and scene ids, as two Stash servers do; instance A also holds a root tag
 * with CHILDREN child tags, each on one scene of its own. Every seeded row
 * is deleted before the file ends.
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
  selectAllInstances,
  selectTestInstanceOnly,
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
    ],
  });

  u = (
    await prisma.user.create({
      data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
    })
  ).id;
}

/** The scenes on A and B, as the seeded user sees them */
const SEEDED_ON_A = CHILDREN + 3;
const SEEDED_ON_B = 1;

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
      await sceneQueryBuilder.execute({
        userId: u,
        allowedInstanceIds: [A],
        request: request({
          tags: { refs: childRefs(CHILDREN), modifier: "INCLUDES", depth: 0 },
        }),
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

    afterAll(async () => {
      await selectTestInstanceOnly();
    });

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
