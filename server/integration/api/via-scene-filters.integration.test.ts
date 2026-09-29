import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type { ParsedFilter } from "../../types/parsedFilters.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

/**
 * Via-scene filters with instance-qualified ids (item 34a)
 *
 * These filters list an entity through its scenes: a scene's Collections and
 * Galleries tabs, a performer's Collections tab, a collection's Performers
 * tab, a studio's performers, and the Tags page's scene and collection
 * filters. The detail pages send "id:instanceId", so each filter must match
 * the pair; a bare id still matches that id on every instance.
 */

interface Ref {
  id: string;
}

interface SceneRow extends Ref {
  performers?: Ref[];
  tags?: Ref[];
  studio?: Ref | null;
}

interface FindScenesResponse {
  findScenes: { scenes: SceneRow[]; count: number };
}

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/** An instance no server has: its composite ids must match nothing */
const OTHER_INSTANCE = "via-scene-other-instance";

/** Each list endpoint and the key its response holds the rows under */
const LISTS = {
  groups: { body: "group_filter", result: "findGroups", rows: "groups" },
  galleries: {
    body: "gallery_filter",
    result: "findGalleries",
    rows: "galleries",
  },
  performers: {
    body: "performer_filter",
    result: "findPerformers",
    rows: "performers",
  },
  tags: { body: "tag_filter", result: "findTags", rows: "tags" },
} as const;

type ListName = keyof typeof LISTS;

/** The ids a list endpoint returns for one filter */
async function listIds(list: ListName, filter: object): Promise<string[]> {
  const { body, result, rows } = LISTS[list];
  const response = await adminClient.post<
    Record<string, Record<string, Ref[]>>
  >(`/api/library/${list}`, {
    filter: { per_page: 100 },
    [body]: filter,
  });
  expect(response.status, `POST /api/library/${list}`).toBe(200);
  return must(must(response.data[result], result)[rows], rows)
    .map((row) => row.id)
    .sort();
}

async function findScenes(body: object): Promise<SceneRow[]> {
  const response = await adminClient.post<FindScenesResponse>(
    "/api/library/scenes",
    { filter: { per_page: 100 }, ...body }
  );
  expect(response.status, "POST /api/library/scenes").toBe(200);
  return response.data.findScenes.scenes;
}

/** What the cases filter by and expect, read from the library */
interface Subjects {
  /** A performer of sceneInGroup */
  performer: string;
  /** sceneInGroup's studio */
  studio: string;
  /** A tag of sceneInGroup */
  groupSceneTag: string;
  /** A tag of sceneWithRelations */
  sceneTag: string;
  /** A scene of galleryWithScenes */
  galleryScene: string;
}

const inclusive = (value: string) => ({ value: [value], modifier: "INCLUDES" });

/**
 * One via-scene filter: the list it runs on, the filter for a ref (bare or
 * composite), the id it filters by, and an id the list must hold
 */
interface ViaSceneCase {
  name: string;
  list: ListName;
  filter: (ref: string) => object;
  by: (s: Subjects) => string;
  lists: (s: Subjects) => string;
}

const CASES: ViaSceneCase[] = [
  {
    name: "groups by scene (a scene's Collections tab)",
    list: "groups",
    filter: (ref) => ({ scenes: inclusive(ref) }),
    by: () => TEST_ENTITIES.sceneInGroup,
    lists: () => TEST_ENTITIES.groupWithScenes,
  },
  {
    name: "groups by performer (a performer's Collections tab)",
    list: "groups",
    filter: (ref) => ({ performers: inclusive(ref) }),
    by: (s) => s.performer,
    lists: () => TEST_ENTITIES.groupWithScenes,
  },
  {
    name: "galleries by scene (a scene's Galleries tab)",
    list: "galleries",
    filter: (ref) => ({ scenes: inclusive(ref) }),
    by: (s) => s.galleryScene,
    lists: () => TEST_ENTITIES.galleryWithScenes,
  },
  {
    name: "performers by scene",
    list: "performers",
    filter: (ref) => ({ scenes: inclusive(ref) }),
    by: () => TEST_ENTITIES.sceneInGroup,
    lists: (s) => s.performer,
  },
  {
    name: "performers by group (a collection's Performers tab)",
    list: "performers",
    filter: (ref) => ({ groups: inclusive(ref) }),
    by: () => TEST_ENTITIES.groupWithScenes,
    lists: (s) => s.performer,
  },
  {
    name: "performers by studio",
    list: "performers",
    filter: (ref) => ({ studios: inclusive(ref) }),
    by: (s) => s.studio,
    lists: (s) => s.performer,
  },
  {
    name: "tags by scene (the Tags page's scene filter)",
    list: "tags",
    filter: (ref) => ({ scenes_filter: { id: inclusive(ref) } }),
    by: () => TEST_ENTITIES.sceneWithRelations,
    lists: (s) => s.sceneTag,
  },
  {
    name: "tags by group (the Tags page's collection filter)",
    list: "tags",
    filter: (ref) => ({ scenes_filter: { groups: inclusive(ref) } }),
    by: () => TEST_ENTITIES.groupWithScenes,
    lists: (s) => s.groupSceneTag,
  },
];

describe("Via-scene filters with instance-qualified ids", () => {
  let instanceId: string;
  let subjects: Subjects;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    instanceId = await selectTestInstanceOnly();

    const groupScene = must(
      (await findScenes({ ids: [TEST_ENTITIES.sceneInGroup] }))[0],
      "sceneInGroup"
    );
    const relationsScene = must(
      (await findScenes({ ids: [TEST_ENTITIES.sceneWithRelations] }))[0],
      "sceneWithRelations"
    );
    const galleryScene = must(
      (
        await findScenes({
          scene_filter: {
            galleries: inclusive(TEST_ENTITIES.galleryWithScenes),
          },
        })
      )[0],
      "a scene of galleryWithScenes"
    );
    subjects = {
      performer: must(groupScene.performers?.[0], "sceneInGroup's performer")
        .id,
      studio: must(groupScene.studio, "sceneInGroup's studio").id,
      groupSceneTag: must(groupScene.tags?.[0], "sceneInGroup's tag").id,
      sceneTag: must(relationsScene.tags?.[0], "sceneWithRelations' tag").id,
      galleryScene: galleryScene.id,
    };
  });

  afterAll(restoreInstanceSelection);

  describe.each(CASES)("$name", ({ list, filter, by, lists }) => {
    it("lists the entity for an instance-qualified id", async () => {
      const ids = await listIds(list, filter(`${by(subjects)}:${instanceId}`));
      expect(ids).toContain(lists(subjects));
    });

    it("the bare id lists the same", async () => {
      const bare = await listIds(list, filter(by(subjects)));
      const composite = await listIds(
        list,
        filter(`${by(subjects)}:${instanceId}`)
      );
      expect(bare).toContain(lists(subjects));
      expect(composite).toEqual(bare);
    });

    it("an id on another instance lists nothing", async () => {
      const ids = await listIds(
        list,
        filter(`${by(subjects)}:${OTHER_INSTANCE}`)
      );
      expect(ids).toEqual([]);
    });
  });
});

/**
 * A soft-deleted scene links nothing: every via-scene arm requires the scene
 * to be live. Seeded on a made-up instance and read through the builders
 * directly, as the admin's selection does not cover it; every row is deleted
 * before the file ends.
 */
describeWithDb("Via-scene filters and soft-deleted scenes", () => {
  const X = "via-live-it-x";
  const LIVE_SCENE = "7860001";
  const DELETED_SCENE = "7860002";
  /** Linked only through the deleted scene */
  const STALE_GROUP = "7860101";
  const STALE_PERFORMER = "7860201";
  /** Linked through the live scene */
  const LIVE_GROUP = "7860102";
  const LIVE_PERFORMER = "7860202";
  const USER_ID = 999998;

  const clear = async () => {
    const where = { stashInstanceId: X };
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashGroup.deleteMany({ where });
    await prisma.stashPerformer.deleteMany({ where });
  };

  beforeAll(async () => {
    await clear();
    await prisma.stashGroup.createMany({
      data: [
        { id: STALE_GROUP, stashInstanceId: X, name: "Stale group" },
        { id: LIVE_GROUP, stashInstanceId: X, name: "Live group" },
      ],
    });
    await prisma.stashPerformer.createMany({
      data: [
        { id: STALE_PERFORMER, stashInstanceId: X, name: "Stale performer" },
        { id: LIVE_PERFORMER, stashInstanceId: X, name: "Live performer" },
      ],
    });
    await prisma.stashScene.createMany({
      data: [
        { id: LIVE_SCENE, stashInstanceId: X, title: "Live" },
        {
          id: DELETED_SCENE,
          stashInstanceId: X,
          title: "Deleted",
          deletedAt: new Date(),
        },
      ],
    });
    await prisma.sceneGroup.createMany({
      data: [
        {
          sceneId: DELETED_SCENE,
          sceneInstanceId: X,
          groupId: STALE_GROUP,
          groupInstanceId: X,
        },
        {
          sceneId: LIVE_SCENE,
          sceneInstanceId: X,
          groupId: LIVE_GROUP,
          groupInstanceId: X,
        },
      ],
    });
    await prisma.scenePerformer.createMany({
      data: [
        {
          sceneId: DELETED_SCENE,
          sceneInstanceId: X,
          performerId: STALE_PERFORMER,
          performerInstanceId: X,
        },
        {
          sceneId: LIVE_SCENE,
          sceneInstanceId: X,
          performerId: LIVE_PERFORMER,
          performerInstanceId: X,
        },
        // The stale performer also worked on the live scene of the live group
        {
          sceneId: LIVE_SCENE,
          sceneInstanceId: X,
          performerId: STALE_PERFORMER,
          performerInstanceId: X,
        },
      ],
    });
  });

  afterAll(clear);

  it("a soft-deleted scene no longer links its group: groups by scene and groups by performer", async () => {
    const groups = async (filter: ParsedFilter<"group">) => {
      const { items } = await groupQueryBuilder.execute({
        userId: USER_ID,
        allowedInstanceIds: [X],
        request: parsedListRequest("group", { filter }),
      });
      return items.map((g) => g.id);
    };

    expect(
      await groups({
        scenes: {
          refs: [
            { id: DELETED_SCENE, instanceId: X },
            { id: LIVE_SCENE, instanceId: X },
          ],
          modifier: "INCLUDES",
          depth: 0,
        },
      })
    ).toEqual([LIVE_GROUP]);

    // The stale performer's only group link runs through the deleted scene;
    // the live scene links it to the live group
    expect(
      await groups({
        performers: {
          refs: [{ id: STALE_PERFORMER, instanceId: X }],
          modifier: "INCLUDES",
          depth: 0,
        },
      })
    ).toEqual([LIVE_GROUP]);
  });

  it("a soft-deleted scene no longer links its performer: performers by scene and performers by group", async () => {
    const performers = async (filter: ParsedFilter<"performer">) => {
      const { items } = await performerQueryBuilder.execute({
        userId: USER_ID,
        allowedInstanceIds: [X],
        request: parsedListRequest("performer", { filter }),
      });
      return items;
    };
    const refs = (...ids: string[]) => ids.map((id) => ({ id, instanceId: X }));

    const byScene = await performers({
      scenes: { refs: refs(DELETED_SCENE), modifier: "INCLUDES", depth: 0 },
    });
    expect(byScene).toEqual([]);

    const byGroup = await performers({
      groups: {
        refs: refs(STALE_GROUP, LIVE_GROUP),
        modifier: "INCLUDES",
        depth: 0,
      },
    });
    expect(byGroup.map((p) => p.id).sort()).toEqual(
      [LIVE_PERFORMER, STALE_PERFORMER].sort()
    );

    // EXCLUDES the stale group: its only scene is deleted, so it excludes nobody
    const excluding = await performers({
      groups: { refs: refs(STALE_GROUP), modifier: "EXCLUDES", depth: 0 },
    });
    expect(excluding.map((p) => p.id).sort()).toEqual(
      [LIVE_PERFORMER, STALE_PERFORMER].sort()
    );
  });
});
