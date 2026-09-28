import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  selectAllInstances,
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

  afterAll(async () => {
    await selectAllInstances();
  });

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
