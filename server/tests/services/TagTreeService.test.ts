/**
 * The compact tag tree's statement and rows (services/TagTreeService.ts).
 * The same queries run against SQLite in
 * integration/services/TagTree.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  loadTagTree,
  loadUntaggedCount,
} from "../../services/TagTreeService.js";
import type { TagTreeQueryRow } from "../../types/internal/queryRows.js";
import { must } from "../helpers/must.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

function row(fields: Partial<TagTreeQueryRow>): TagTreeQueryRow {
  return {
    id: "1",
    stashInstanceId: "a",
    name: "Tag",
    imagePath: null,
    parentIds: null,
    sceneCountAll: 0,
    imageCount: 0,
    galleryCount: 0,
    performerCount: 0,
    stashCreatedAt: null,
    stashUpdatedAt: null,
    userRating: null,
    userFavorite: null,
    userOCounter: null,
    scopeSceneCount: null,
    ...fields,
  };
}

/** The one statement sent, with its parameters */
function statement(): { sql: string; params: unknown[] } {
  expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
  return { sql, params };
}

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;

describe("loadTagTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  it("sends nothing and answers no tags without an allowed instance", async () => {
    await expect(
      loadTagTree({ userId: 7, allowedInstanceIds: [] })
    ).resolves.toEqual([]);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("reads every visible tag in one statement: exclusion join with the instance, live, allowed instances", async () => {
    await loadTagTree({ userId: 7, allowedInstanceIds: ["a", "b"] });

    const { sql, params } = statement();
    expect(sql).not.toContain("WITH RECURSIVE");
    expect(sql).toContain(
      "te.entityType = 'tag' AND te.entityId = t.id AND (te.instanceId = '' OR te.instanceId = t.stashInstanceId)"
    );
    expect(sql).toContain(
      "t.deletedAt IS NULL AND te.id IS NULL AND t.stashInstanceId IN (?, ?)"
    );
    expect(sql).toContain("r.userId = ? AND r.instanceId = t.stashInstanceId");
    expect(sql).toContain(
      "us.userId = ? AND us.instanceId = t.stashInstanceId"
    );
    // The viewer's excluded links per tag: the counts are the card's (B13b)
    expect(sql).toContain(
      "LEFT JOIN UserExcludedContentCount d ON d.userId = ? AND d.entityType = 'tag' AND d.entityId = t.id AND d.instanceId = t.stashInstanceId"
    );
    expect(sql).toContain(
      "MAX(t.sceneCountAll - COALESCE(d.scenes, 0), 0) AS sceneCountAll"
    );
    expect(params).toEqual([7, 7, 7, 7, "a", "b"]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it("an empty scope is the whole tree", async () => {
    await loadTagTree({ userId: 7, allowedInstanceIds: ["a"], scope: {} });

    expect(statement().sql).not.toContain("WITH RECURSIVE");
  });

  it("a scope walks up from its scenes' tags, applying visibility at every step", async () => {
    await loadTagTree({
      userId: 7,
      allowedInstanceIds: ["a", "b"],
      scope: { performer: { id: "12", instanceId: "a" } },
    });

    const { sql, params } = statement();
    expect(sql).toContain("WITH RECURSIVE");
    expect(sql).toContain(
      "SELECT j.sceneId, j.sceneInstanceId FROM ScenePerformer j WHERE j.performerId = ? AND j.performerInstanceId = ?"
    );
    // The scenes, the seed tags and every parent step
    for (const alias of ["s", "t", "p"]) {
      expect(sql).toContain(
        `${alias}.deletedAt IS NULL AND ${alias}e.id IS NULL AND ${alias}.stashInstanceId IN (?, ?)`
      );
      expect(sql).toContain(
        `(${alias}e.instanceId = '' OR ${alias}e.instanceId = ${alias}.stashInstanceId)`
      );
    }
    expect(sql).toContain("se.entityType = 'scene'");
    expect(sql).toContain("pe.entityType = 'tag'");
    // A scene's tags are its own and its inherited ones, read by the
    // junctions, never the inherited JSON
    expect(sql).toContain(
      "FROM visible_scene v\n    CROSS JOIN SceneTag st ON st.sceneId = v.id AND st.sceneInstanceId = v.inst"
    );
    expect(sql).toContain(
      "FROM visible_scene v\n    CROSS JOIN SceneInheritedTag it ON it.sceneId = v.id AND it.sceneInstanceId = v.inst"
    );
    // An inherited row that is also direct counts once
    expect(sql).toContain(
      "WHERE NOT EXISTS (SELECT 1 FROM SceneTag d WHERE d.sceneId = it.sceneId AND d.sceneInstanceId = it.sceneInstanceId AND d.tagId = it.tagId AND d.tagInstanceId = it.tagInstanceId)"
    );
    expect(sql).not.toContain("inheritedTagIds");
    expect(sql).toContain("CROSS JOIN json_each(c.parentIds) jp");
    expect(sql).toContain(
      "CROSS JOIN StashTag p ON p.id = jp.value AND p.stashInstanceId = c.inst"
    );
    expect(params.slice(0, 2)).toEqual(["12", "a"]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it("scope parts intersect; a bare ref binds the id alone, a studio the scene's own instance", async () => {
    await loadTagTree({
      userId: 7,
      allowedInstanceIds: ["a"],
      scope: {
        performer: { id: "1", instanceId: undefined },
        tag: { id: "2", instanceId: "a" },
        studio: { id: "3", instanceId: "a" },
        group: { id: "4", instanceId: undefined },
      },
    });

    const { sql, params } = statement();
    expect(sql).toContain(
      "FROM ScenePerformer j WHERE j.performerId = ?\nINTERSECT\n"
    );
    // A tag's scenes carry it directly or by inheritance
    expect(sql).toContain(
      "FROM SceneTag j WHERE j.tagId = ? AND j.tagInstanceId = ?\nUNION\nSELECT j.sceneId, j.sceneInstanceId FROM SceneInheritedTag j WHERE j.tagId = ? AND j.tagInstanceId = ?"
    );
    expect(sql).toContain("FROM SceneGroup j WHERE j.groupId = ?\nINTERSECT\n");
    expect(sql).toContain(
      "FROM StashScene s WHERE s.studioId = ? AND s.stashInstanceId = ?"
    );
    expect(params.slice(0, 8)).toEqual([
      "1",
      "2",
      "a",
      "2",
      "a",
      "4",
      "3",
      "a",
    ]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it("keeps only the parents in the answer, on the tag's own instance", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      row({ id: "1", stashInstanceId: "a", parentIds: "[]" }),
      row({ id: "2", stashInstanceId: "a", parentIds: '["1","9"]' }),
      // B has no tag 1: B's tag 2 is a root
      row({ id: "2", stashInstanceId: "b", parentIds: '["1"]' }),
      row({ id: "3", stashInstanceId: "a", parentIds: "not json" }),
    ]);

    const tags = await loadTagTree({
      userId: 7,
      allowedInstanceIds: ["a", "b"],
    });

    expect(tags.map((t) => [t.id, t.instanceId, t.parents])).toEqual([
      ["1", "a", []],
      ["2", "a", [{ id: "1" }]],
      ["2", "b", []],
      ["3", "a", []],
    ]);
  });

  it("writes the row: counts, the user's own data, dates and the image through the proxy", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      row({
        id: "5",
        stashInstanceId: "a",
        name: "Five",
        imagePath: "http://stash:9999/tag/5/image",
        sceneCountAll: 9,
        imageCount: 3,
        galleryCount: 2,
        performerCount: 1,
        stashCreatedAt: new Date("2024-01-02T03:04:05.000Z"),
        userRating: 60,
        userFavorite: true,
        userOCounter: 2,
      }),
    ]);

    const [tag] = await loadTagTree({ userId: 7, allowedInstanceIds: ["a"] });

    expect(tag).toEqual({
      id: "5",
      instanceId: "a",
      name: "Five",
      image_path: "/api/proxy/stash?path=%2Ftag%2F5%2Fimage&instanceId=a",
      parents: [],
      scene_count: 9,
      image_count: 3,
      gallery_count: 2,
      performer_count: 1,
      created_at: "2024-01-02T03:04:05.000Z",
      updated_at: null,
      rating100: 60,
      favorite: true,
      o_counter: 2,
    });
  });

  it("a scoped row counts the scope's scenes and nothing else", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      row({
        id: "5",
        sceneCountAll: 40,
        imageCount: 3,
        galleryCount: 2,
        performerCount: 1,
        scopeSceneCount: 2n,
      }),
      row({ id: "6", sceneCountAll: 10, scopeSceneCount: 0n }),
    ]);

    const tags = await loadTagTree({
      userId: 7,
      allowedInstanceIds: ["a"],
      scope: { group: { id: "4", instanceId: "a" } },
    });

    expect(
      tags.map((t) => [
        t.scene_count,
        t.image_count,
        t.gallery_count,
        t.performer_count,
      ])
    ).toEqual([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });
});

describe("loadUntaggedCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ n: 3n }]);
  });

  it("answers 0 and sends nothing without an allowed instance", async () => {
    await expect(
      loadUntaggedCount({ userId: 7, allowedInstanceIds: [], kind: "image" })
    ).resolves.toBe(0);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it.each([
    ["scene", "StashScene s", "s", "s.tagCount = 0"],
    [
      "gallery",
      "StashGallery g",
      "g",
      "NOT EXISTS (SELECT 1 FROM GalleryTag gt WHERE gt.galleryId = g.id AND gt.galleryInstanceId = g.stashInstanceId)",
    ],
    [
      "image",
      "StashImage i",
      "i",
      "NOT EXISTS (SELECT 1 FROM ImageTag it WHERE it.imageId = i.id AND it.imageInstanceId = i.stashInstanceId)",
    ],
  ] as const)(
    "counts the visible %ss with no tag of their own, under the exclusion join",
    async (kind, from, alias, untagged) => {
      await expect(
        loadUntaggedCount({ userId: 7, allowedInstanceIds: ["a", "b"], kind })
      ).resolves.toBe(3);

      const { sql, params } = statement();
      expect(sql).toContain(`FROM ${from}\n`);
      // The list's count of tag_count EQUALS 0: live, allowed instances and
      // the exclusion anti-join with the instance (invariant 3)
      expect(sql).toContain(
        `${alias}e.entityType = '${kind}' AND ${alias}e.entityId = ${alias}.id AND (${alias}e.instanceId = '' OR ${alias}e.instanceId = ${alias}.stashInstanceId)`
      );
      expect(sql).toContain(
        `WHERE ${alias}.deletedAt IS NULL AND ${alias}e.id IS NULL AND ${alias}.stashInstanceId IN (?, ?) AND ${untagged}`
      );
      expect(params).toEqual([7, "a", "b"]);
      expect(placeholders(sql)).toBe(params.length);
    }
  );

  it("with a scope, counts the scope's visible untagged scenes", async () => {
    await expect(
      loadUntaggedCount({
        userId: 7,
        allowedInstanceIds: ["a"],
        scope: { performer: { id: "12", instanceId: "a" } },
        kind: "scene",
      })
    ).resolves.toBe(3);

    const { sql, params } = statement();
    expect(sql).toContain(
      "SELECT j.sceneId, j.sceneInstanceId FROM ScenePerformer j WHERE j.performerId = ? AND j.performerInstanceId = ?"
    );
    expect(sql).toContain(
      "CROSS JOIN StashScene s ON s.id = x.id AND s.stashInstanceId = x.inst"
    );
    expect(sql).toContain(
      "s.deletedAt IS NULL AND se.id IS NULL AND s.stashInstanceId IN (?) AND s.tagCount = 0"
    );
    expect(params).toEqual(["12", "a", 7, "a"]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it("with a scope, galleries and images are 0 without a statement, as the scoped rows count", async () => {
    const scope = { performer: { id: "12", instanceId: "a" } };
    for (const kind of ["gallery", "image"] as const) {
      await expect(
        loadUntaggedCount({ userId: 7, allowedInstanceIds: ["a"], scope, kind })
      ).resolves.toBe(0);
    }
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
