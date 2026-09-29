import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../prisma/singleton.js";
import {
  GALLERY_REF,
  GROUP_REF,
  type NestedLink,
  PERFORMER_REF,
  STUDIO_REF,
  TAG_REF,
  loadNestedRefs,
  loadRefsByKey,
} from "../../../services/query/nestedRefs.js";
import { entityKey, pairsJson } from "../../../utils/entityRef.js";
import { toProxyUrl } from "../../../utils/proxyUrl.js";
import { must } from "../../helpers/must.js";
import { prismaImpl } from "../../helpers/prismaMock.js";

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

const SCENE_PERFORMERS: NestedLink = {
  table: "ScenePerformer",
  parentIdCol: "sceneId",
  parentInstanceCol: "sceneInstanceId",
  refIdCol: "performerId",
  refInstanceCol: "performerInstanceId",
};

/** Two instances' parents with the same id */
const A = { id: "1", instanceId: "inst-a" };
const B = { id: "1", instanceId: "inst-b" };

const viewer = { userId: 7, applyExclusions: true };

/** Answers every statement with these rows */
function answer(rows: unknown[]) {
  mockPrisma.$queryRawUnsafe.mockImplementation(prismaImpl(() => rows));
}

/** The one statement sent, as [sql, ...params] */
function statement(): [string, ...unknown[]] {
  expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  return must(mockPrisma.$queryRawUnsafe.mock.calls[0], "the statement");
}

describe("nested refs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answer([]);
  });

  describe("loadNestedRefs", () => {
    it("sends nothing for an empty page", async () => {
      const refs = await loadNestedRefs(
        PERFORMER_REF,
        SCENE_PERFORMERS,
        [],
        viewer
      );

      expect(refs.size).toBe(0);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("drives from the page's pairs into the link's key, reads live entities, and leaves out the viewer's exclusion rows on the entity's instance", async () => {
      await loadNestedRefs(PERFORMER_REF, SCENE_PERFORMERS, [A, B, A], viewer);

      const [sql, ...params] = statement();
      expect(sql).toContain("FROM json_each(?)");
      expect(sql).toContain(
        "FROM page pg\nCROSS JOIN ScenePerformer j ON j.sceneId = pg.pid AND j.sceneInstanceId = pg.pinst"
      );
      expect(sql).toContain(
        "CROSS JOIN StashPerformer x ON x.id = j.performerId AND x.stashInstanceId = j.performerInstanceId"
      );
      expect(sql).toContain(
        "LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'performer' AND e.entityId = x.id AND (e.instanceId = '' OR e.instanceId = x.stashInstanceId)"
      );
      expect(sql).toContain("WHERE x.deletedAt IS NULL AND e.id IS NULL");
      // Stash's own favorite and rating are not even read
      expect(sql).not.toContain("favorite");
      expect(sql).not.toContain("rating100");
      // The page once, each pair once, then the viewer
      expect(params).toEqual([pairsJson([A, B]), 7]);
    });

    it("without the viewer's exclusions, keeps the live entities only", async () => {
      await loadNestedRefs(PERFORMER_REF, SCENE_PERFORMERS, [A], {
        userId: 7,
        applyExclusions: false,
      });

      const [sql, ...params] = statement();
      expect(sql).not.toContain("UserExcludedEntity");
      expect(sql).toContain("WHERE x.deletedAt IS NULL");
      expect(params).toEqual([pairsJson([A])]);
    });

    it("rows become refs under their parent's entityKey, in order, with no favorite or rating100 whatever the row holds", async () => {
      answer([
        {
          pid: "1",
          pinst: "inst-b",
          id: "9",
          stashInstanceId: "inst-b",
          name: "Performer 9",
          disambiguation: "",
          gender: "FEMALE",
          imagePath: "http://stash:9999/performer/9/image",
          favorite: true,
          rating100: 90,
        },
        {
          pid: "1",
          pinst: "inst-b",
          id: "8",
          stashInstanceId: "inst-b",
          name: "Performer 8",
          disambiguation: "the other",
          gender: null,
          imagePath: null,
        },
      ]);

      const refs = await loadNestedRefs(
        PERFORMER_REF,
        SCENE_PERFORMERS,
        [A, B],
        viewer
      );

      expect(refs.get(entityKey(A.id, A.instanceId))).toBeUndefined();
      expect(refs.get(entityKey(B.id, B.instanceId))).toEqual([
        {
          id: "9",
          instanceId: "inst-b",
          name: "Performer 9",
          disambiguation: null,
          gender: "FEMALE",
          image_path: toProxyUrl(
            "http://stash:9999/performer/9/image",
            "inst-b"
          ),
        },
        {
          id: "8",
          instanceId: "inst-b",
          name: "Performer 8",
          disambiguation: "the other",
          gender: null,
          image_path: null,
        },
      ]);
    });
  });

  describe("loadRefsByKey", () => {
    it("sends nothing for no refs", async () => {
      const refs = await loadRefsByKey(STUDIO_REF, [], viewer);

      expect(refs.size).toBe(0);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("looks each distinct ref up by its key, live and not excluded for the viewer", async () => {
      await loadRefsByKey(STUDIO_REF, [A, A, B], viewer);

      const [sql, ...params] = statement();
      expect(sql).toContain("FROM json_each(?)");
      expect(sql).toContain(
        "FROM refs r\nCROSS JOIN StashStudio x ON x.id = r.rid AND x.stashInstanceId = r.rinst"
      );
      expect(sql).toContain("e.entityType = 'studio'");
      expect(sql).toContain("WHERE x.deletedAt IS NULL AND e.id IS NULL");
      expect(params).toEqual([pairsJson([A, B]), 7]);
    });

    it("keys the visible ones by entityKey", async () => {
      answer([
        {
          id: "1",
          stashInstanceId: "inst-b",
          name: "Studio 1 on B",
          imagePath: null,
          parentId: "3",
          favorite: true,
        },
      ]);

      const refs = await loadRefsByKey(STUDIO_REF, [A, B], viewer);

      expect([...refs.keys()]).toEqual([entityKey(B.id, B.instanceId)]);
      expect(refs.get(entityKey(B.id, B.instanceId))).toEqual({
        id: "1",
        instanceId: "inst-b",
        name: "Studio 1 on B",
        image_path: null,
        parent_studio: { id: "3" },
      });
    });
  });

  it("each ref shape: a tag, a collection and a gallery (its displayed title)", () => {
    const key = { id: "5", stashInstanceId: "inst-a" };

    expect(TAG_REF.toRef({ ...key, name: "Tag 5", imagePath: null })).toEqual({
      id: "5",
      instanceId: "inst-a",
      name: "Tag 5",
      image_path: null,
    });
    expect(
      GROUP_REF.toRef({
        ...key,
        name: "Collection 5",
        frontImagePath: "http://stash:9999/group/5/frontimage",
        backImagePath: null,
      })
    ).toEqual({
      id: "5",
      instanceId: "inst-a",
      name: "Collection 5",
      front_image_path: toProxyUrl(
        "http://stash:9999/group/5/frontimage",
        "inst-a"
      ),
      back_image_path: null,
    });
    expect(
      GALLERY_REF.toRef({
        ...key,
        title: "",
        folderPath: "/library/Holiday",
        fileBasename: null,
        coverPath: null,
      })
    ).toEqual({ id: "5", instanceId: "inst-a", title: "Holiday", cover: null });
  });
});
