/**
 * Unit Tests for SceneQueryBuilder tag filtering with composite keys
 *
 * Bug #424: the carousel tag filter received composite keys
 * ("284:instance-1") and used them as bare tagId values. The parser now
 * hands the builder (id, instance) pairs, and the tag clause matches each
 * as a pair on the SceneTag junction and the SceneInheritedTag junction, through the
 * hierarchy expansion (item 34b): a descendant carries the instance it was
 * found on, a bare ref expands on every allowed instance. With a depth,
 * INCLUDES_ALL is one clause per selected tag with its own descendants
 * (QUERIES-08).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
// Import after mocks
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import type { QueryContext } from "../../services/query/EntityQueryBuilder.js";
import type { RefCriterion } from "../../types/parsedFilters.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);

const CTX: QueryContext = {
  userId: 1,
  applyExclusions: true,
  allowedInstanceIds: ["instance-1", "instance-2"],
  specificInstanceId: undefined,
  sortField: "created_at",
};

const ref = (id: string, instanceId = "instance-1") => ({ id, instanceId });
const bare = (id: string) => ({ id, instanceId: undefined });

/** The slim hierarchy the expansion loads: one child per tag on instance-1, another on instance-2 */
const tagRow = (id: string, stashInstanceId: string, parent?: string) =>
  partialRow<Awaited<ReturnType<typeof prisma.stashTag.findMany>>[number]>({
    id,
    stashInstanceId,
    parentIds: parent === undefined ? null : JSON.stringify([parent]),
  });

const tagClause = (criterion: RefCriterion, sortField = "created_at") =>
  sceneQueryBuilder["tagClause"](criterion, { ...CTX, sortField });

/** The small tag-index form (L8) of ref 284 on instance-1 */
const IN_FORM =
  "(s.id, s.stashInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM SceneTag st WHERE ((st.tagId = ? AND st.tagInstanceId = ?)) UNION ALL SELECT sit.sceneId, sit.sceneInstanceId FROM SceneInheritedTag sit WHERE ((sit.tagId = ? AND sit.tagInstanceId = ?)))";

/** The bare term of the inline shape, which matches an id on every instance */
const BARE_TERM = "(st.tagId = ?)";

describe("SceneQueryBuilder tag clause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stashTag.findMany.mockResolvedValue([
      tagRow("284", "instance-1"),
      tagRow("284-child", "instance-1", "284"),
      tagRow("313", "instance-1"),
      tagRow("313-child", "instance-1", "313"),
      tagRow("284", "instance-2"),
      tagRow("284-child-2", "instance-2", "284"),
    ]);
  });

  describe("composite key handling", () => {
    it.each(["INCLUDES", "INCLUDES_ALL", "EXCLUDES"] as const)(
      "binds each ref as its bare id and instance for %s",
      async (modifier) => {
        const result = await tagClause({
          refs: [ref("284"), ref("313")],
          modifier,
          depth: 0,
        });

        expect(result.sql).not.toBe("");
        expect(result.params).not.toContain("284:instance-1");
        expect(result.params).not.toContain("313:instance-1");
        expect(result.params).toContain("284");
        expect(result.params).toContain("313");
        expect(result.params).toContain("instance-1");
      }
    );

    it("INCLUDES with 284:instance-1 and a depth binds 284 and instance-1 as a pair and never a bare 284 alone", async () => {
      const result = await tagClause({
        refs: [ref("284")],
        modifier: "INCLUDES",
        depth: -1,
      });

      expect(result.sql).toContain(
        "(st.tagId = ? AND st.tagInstanceId = ?) OR (st.tagId = ? AND st.tagInstanceId = ?)"
      );
      expect(result.sql).not.toContain(BARE_TERM);
      // The direct arm, then the inherited arm, each the tag and its child
      // on the tag's own instance
      expect(result.params).toEqual([
        "284",
        "instance-1",
        "284-child",
        "instance-1",
        "284",
        "instance-1",
        "284-child",
        "instance-1",
      ]);
    });

    it("a bare 284 binds only 284, so it matches every instance", async () => {
      const result = await tagClause({
        refs: [ref("284"), bare("313")],
        modifier: "INCLUDES",
        depth: 0,
      });

      expect(result.sql).toContain(
        "(st.tagId = ? AND st.tagInstanceId = ?) OR (st.tagId = ?)"
      );
      expect(result.params).toEqual([
        "284",
        "instance-1",
        "313",
        "284",
        "instance-1",
        "313",
      ]);
      expect(mockPrisma.stashTag.findMany).not.toHaveBeenCalled();
    });

    it("a bare 284 with a depth expands on every allowed instance, each descendant on the instance it was found on", async () => {
      const result = await tagClause({
        refs: [bare("284")],
        modifier: "INCLUDES",
        depth: -1,
      });

      expect(result.sql).not.toContain(BARE_TERM);
      expect(result.params.slice(0, 8)).toEqual([
        "284",
        "instance-1",
        "284-child",
        "instance-1",
        "284",
        "instance-2",
        "284-child-2",
        "instance-2",
      ]);
    });

    it("EXCLUDES with a composite excludes only that instance's tag and its descendants", async () => {
      const result = await tagClause({
        refs: [ref("284")],
        modifier: "EXCLUDES",
        depth: -1,
      });

      expect(result.sql).toMatch(/^NOT \(EXISTS \(SELECT 1 FROM SceneTag st/);
      expect(result.sql).not.toContain(BARE_TERM);
      expect(result.params).toEqual([
        "284",
        "instance-1",
        "284-child",
        "instance-1",
        "284",
        "instance-1",
        "284-child",
        "instance-1",
      ]);
    });
  });

  describe("SQL structure", () => {
    it("a tag filter's inherited arm reads SceneInheritedTag, never json_each", async () => {
      const result = await tagClause({
        refs: [ref("284")],
        modifier: "INCLUDES",
        depth: 0,
      });

      expect(result.sql).toContain("EXISTS (SELECT 1 FROM SceneTag st");
      expect(result.sql).toContain(
        "EXISTS (SELECT 1 FROM SceneInheritedTag sit WHERE sit.sceneId = s.id AND sit.sceneInstanceId = s.stashInstanceId AND ((sit.tagId = ? AND sit.tagInstanceId = ?)))"
      );
      expect(result.sql).not.toContain("json_each");
      expect(result.sql).not.toContain("inheritedTagIds");
    });

    it("generates AND-joined checks for INCLUDES_ALL", async () => {
      const result = await tagClause({
        refs: [ref("284"), ref("313")],
        modifier: "INCLUDES_ALL",
        depth: 0,
      });

      expect(result.sql).toMatch(/^\(.* AND .*\)$/s);
      expect(result.sql.match(/FROM SceneTag st/g)).toHaveLength(2);
    });

    it("generates NOT for EXCLUDES", async () => {
      const result = await tagClause({
        refs: [ref("284")],
        modifier: "EXCLUDES",
        depth: 0,
      });

      expect(result.sql).toMatch(/^NOT \(EXISTS \(SELECT 1 FROM SceneTag st/);
    });

    // L8: a sort with an index lets the page walk it and stop at the page,
    // probing each scene's tags; a sort with none reads every match anyway,
    // so the matches are read from SceneTag's tag index as a list
    it.each([
      "created_at",
      "updated_at",
      "date",
      "title",
      "duration",
      "performer_count",
      "tag_count",
    ])(
      "an indexed sort (%s) keeps the correlated EXISTS",
      async (sortField) => {
        const result = await tagClause(
          { refs: [ref("284")], modifier: "INCLUDES", depth: 0 },
          sortField
        );

        expect(result.sql).toContain("EXISTS (SELECT 1 FROM SceneTag st WHERE");
        expect(result.sql).not.toContain("IN (SELECT st.sceneId");
        // L9: the count walks no order, so it reads the tag index
        expect(result.count).toEqual({
          sql: IN_FORM,
          params: ["284", "instance-1", "284", "instance-1"],
        });
      }
    );

    it.each([
      "rating",
      "play_count",
      "o_counter",
      "last_played_at",
      "random",
      "filesize",
    ])(
      "a sort with no index (%s) reads SceneTag and SceneInheritedTag by their tag indexes as one list",
      async (sortField) => {
        const result = await tagClause(
          { refs: [ref("284")], modifier: "INCLUDES", depth: 0 },
          sortField
        );

        expect(result.sql).toBe(IN_FORM);
        // The count reads the same form: no count form of its own
        expect(result.count).toBeUndefined();
        expect(result.params).toEqual([
          "284",
          "instance-1",
          "284",
          "instance-1",
        ]);
      }
    );

    it.each(["rating", "created_at"])(
      "EXCLUDES keeps the NOT EXISTS for the page and the count (%s)",
      async (sortField) => {
        const result = await tagClause(
          { refs: [ref("284")], modifier: "EXCLUDES", depth: 0 },
          sortField
        );

        expect(result.sql).toMatch(/^NOT \(EXISTS \(SELECT 1 FROM SceneTag st/);
        expect(result.count).toBeUndefined();
      }
    );

    // L9: above the inline limit an indexed sort's page reads the refs
    // list's junction rows by the tag index and walks the sort index; the
    // count and a sort with no index read the matched set
    const manyRefs = Array.from({ length: 65 }, (_, i) => ref(String(i + 1)));

    it("more than 64 refs under an indexed sort: the page reads the refs list, the count the matched set", async () => {
      const result = await tagClause(
        { refs: manyRefs, modifier: "INCLUDES", depth: 0 },
        "created_at"
      );

      expect(result.sql).toBe(
        "(s.id, s.stashInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM tags_refs r CROSS JOIN SceneTag st ON st.tagId = r.id AND st.tagInstanceId = r.inst UNION ALL SELECT sit.sceneId, sit.sceneInstanceId FROM tags_refs r CROSS JOIN SceneInheritedTag sit ON sit.tagId = r.id AND sit.tagInstanceId = r.inst)"
      );
      expect(result.ctes?.map((c) => c.name)).toEqual(["tags_refs"]);
      expect(result.count?.sql).toBe(
        "(s.id, s.stashInstanceId) IN (SELECT id, inst FROM tags_matched)"
      );
      expect(result.count?.ctes?.map((c) => c.name)).toEqual([
        "tags_refs",
        "tags_matched",
      ]);
    });

    it("more than 64 refs under a sort with no index: the matched set for both", async () => {
      const result = await tagClause(
        { refs: manyRefs, modifier: "INCLUDES", depth: 0 },
        "rating"
      );

      expect(result.sql).toBe(
        "(s.id, s.stashInstanceId) IN (SELECT id, inst FROM tags_matched)"
      );
      expect(result.count).toBeUndefined();
    });
  });

  describe("depth", () => {
    it("depth 0 loads no hierarchy", async () => {
      await tagClause({ refs: [ref("284")], modifier: "INCLUDES", depth: 0 });

      expect(mockPrisma.stashTag.findMany).not.toHaveBeenCalled();
    });

    it("a depth loads the involved instances' live tags once, whatever the number of refs", async () => {
      await tagClause({
        refs: [ref("284"), ref("313"), ref("284", "instance-2")],
        modifier: "INCLUDES_ALL",
        depth: 1,
      });

      expect(mockPrisma.stashTag.findMany).toHaveBeenCalledTimes(1);
      const args = mockPrisma.stashTag.findMany.mock.calls[0]?.[0];
      expect(args?.where).toEqual({
        stashInstanceId: { in: ["instance-1", "instance-2"] },
        deletedAt: null,
      });
    });

    it("INCLUDES_ALL with two values emits two AND-ed clauses, each with its own descendants", async () => {
      const result = await tagClause({
        refs: [ref("284"), ref("313")],
        modifier: "INCLUDES_ALL",
        depth: 1,
      });

      // Two AND-ed clauses, each matching a tag or its child on instance-1
      expect(result.sql).toMatch(/^\(.* AND .*\)$/s);
      expect(result.sql.match(/FROM SceneTag st/g)).toHaveLength(2);
      expect(result.sql).not.toContain(BARE_TERM);
      // The count's form (L9): the same two groups, each read from the tag index
      expect(
        result.count?.sql.match(
          /\(s\.id, s\.stashInstanceId\) IN \(SELECT st\.sceneId/g
        )
      ).toHaveLength(2);
      expect(result.count?.params).toEqual(result.params);
      expect(result.params).toEqual([
        "284",
        "instance-1",
        "284-child",
        "instance-1",
        "284",
        "instance-1",
        "284-child",
        "instance-1",
        "313",
        "instance-1",
        "313-child",
        "instance-1",
        "313",
        "instance-1",
        "313-child",
        "instance-1",
      ]);
    });
  });
});
