/**
 * Unit Tests for SceneQueryBuilder tag filtering with composite keys
 *
 * Bug #424: the carousel tag filter received composite keys
 * ("284:instance-1") and used them as bare tagId values. The parser now
 * hands the builder (id, instance) pairs, and the tag clause matches each
 * as a pair on the SceneTag junction and the inherited list; a bare ref
 * matches its id on every instance. With a depth, INCLUDES_ALL is one
 * clause per selected tag with its own descendants (QUERIES-08).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
// Import after mocks
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import type { QueryContext } from "../../services/query/EntityQueryBuilder.js";
import type { RefCriterion } from "../../types/parsedFilters.js";
import { expandTagIds } from "../../utils/hierarchyUtils.js";

// Mock prisma (required by SceneQueryBuilder import)
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
    stashScene: { count: vi.fn() },
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock hierarchyUtils: expandTagIds passes the ids through at depth 0 and
// adds one child per id ("<id>-child") otherwise
vi.mock("../../utils/hierarchyUtils.js", () => ({
  expandTagIds: vi.fn((ids: string[], depth: number) =>
    Promise.resolve(
      depth === 0 ? ids : [...ids, ...ids.map((id) => `${id}-child`)]
    )
  ),
  expandStudioIds: vi.fn((ids: string[]) => Promise.resolve(ids)),
}));

const CTX: QueryContext = {
  userId: 1,
  applyExclusions: true,
  allowedInstanceIds: ["instance-1", "instance-2"],
  specificInstanceId: undefined,
};

const ref = (id: string, instanceId = "instance-1") => ({ id, instanceId });
const bare = (id: string) => ({ id, instanceId: undefined });

const tagClause = (criterion: RefCriterion) =>
  sceneQueryBuilder["tagClause"](criterion, CTX);

describe("SceneQueryBuilder tag clause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it("a bare ref binds its id alone, so it matches every instance", async () => {
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
    });
  });

  describe("SQL structure", () => {
    it("generates SceneTag EXISTS subquery and the inherited json_each arm for INCLUDES", async () => {
      const result = await tagClause({
        refs: [ref("284")],
        modifier: "INCLUDES",
        depth: 0,
      });

      expect(result.sql).toContain("EXISTS (SELECT 1 FROM SceneTag st");
      expect(result.sql).toContain("json_each(s.inheritedTagIds)");
      expect(result.sql).toContain("je.value = ? AND s.stashInstanceId = ?");
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
  });

  describe("depth", () => {
    it("depth 0 expands nothing", async () => {
      await tagClause({ refs: [ref("284")], modifier: "INCLUDES", depth: 0 });

      expect(expandTagIds).not.toHaveBeenCalled();
    });

    it("a depth adds the descendants as bare refs and keeps the selected refs' instances", async () => {
      const result = await tagClause({
        refs: [ref("284")],
        modifier: "INCLUDES",
        depth: -1,
      });

      expect(expandTagIds).toHaveBeenCalledWith(["284"], -1);
      expect(result.sql).toContain(
        "(st.tagId = ? AND st.tagInstanceId = ?) OR (st.tagId = ?)"
      );
      expect(result.params.slice(0, 3)).toEqual([
        "284",
        "instance-1",
        "284-child",
      ]);
    });

    it("INCLUDES_ALL with a depth is one clause per selected tag, each with its own descendants", async () => {
      const result = await tagClause({
        refs: [ref("284"), ref("313")],
        modifier: "INCLUDES_ALL",
        depth: 1,
      });

      expect(expandTagIds).toHaveBeenCalledTimes(2);
      expect(expandTagIds).toHaveBeenCalledWith(["284"], 1);
      expect(expandTagIds).toHaveBeenCalledWith(["313"], 1);
      // Two AND-ed clauses, each matching a tag or its child
      expect(result.sql.match(/FROM SceneTag st/g)).toHaveLength(2);
      expect(result.params).toEqual([
        "284",
        "instance-1",
        "284-child",
        "284",
        "instance-1",
        "284-child",
        "313",
        "instance-1",
        "313-child",
        "313",
        "instance-1",
        "313-child",
      ]);
    });
  });
});
