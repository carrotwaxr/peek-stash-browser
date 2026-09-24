/**
 * Unit Tests for EntityAccessService
 *
 * The SQL itself runs against real SQLite in
 * integration/services/EntityAccessService.integration.test.ts. These tests
 * pin the query shape: every value bound, the table chosen from a fixed map,
 * the clip's scene checks, and the short-circuits that skip the query.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type AccessEntityType,
  canUserAccessEntity,
  entityRefKey,
  getVisibleEntityKeys,
  keepVisibleConditions,
  resolveAccessibleInstanceId,
  resolveVisibleApartFromOwnHides,
} from "../../services/EntityAccessService.js";

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
  },
}));

const mockQuery = vi.mocked(prisma.$queryRawUnsafe);

/** The SQL text and bound params of the nth query call. */
function call(n = 0): { sql: string; params: unknown[] } {
  const [sql, ...params] = mockQuery.mock.calls[n] as [string, ...unknown[]];
  return { sql, params };
}

describe("EntityAccessService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([] as never);
  });

  describe("canUserAccessEntity", () => {
    it("returns true when the access query returns a row", async () => {
      mockQuery.mockResolvedValueOnce([{ ok: 1 }] as never);
      await expect(
        canUserAccessEntity(7, "scene", "42", "inst-a")
      ).resolves.toBe(true);
    });

    it("returns false when the access query returns no row", async () => {
      await expect(
        canUserAccessEntity(7, "scene", "42", "inst-a")
      ).resolves.toBe(false);
    });

    it("binds the id, instance, user and type as parameters", async () => {
      const id = "1' OR '1'='1";
      await canUserAccessEntity(7, "scene", id, "inst-a");

      const { sql, params } = call();
      expect(sql).not.toContain(id);
      expect(sql).not.toContain("inst-a");
      expect(params).toEqual([id, "inst-a", 7, 7, 7, "scene"]);
    });

    const TABLES: [AccessEntityType, string][] = [
      ["scene", "StashScene"],
      ["performer", "StashPerformer"],
      ["studio", "StashStudio"],
      ["tag", "StashTag"],
      ["group", "StashGroup"],
      ["gallery", "StashGallery"],
      ["image", "StashImage"],
      ["clip", "StashClip"],
    ];

    it.each(TABLES)(
      "reads the table for each entity type (%s)",
      async (entityType, table) => {
        await canUserAccessEntity(7, entityType, "42", "inst-a");

        const { sql, params } = call();
        expect(sql).toContain(`FROM ${table} x`);
        if (entityType === "clip") {
          expect(sql).toContain("JOIN StashScene cs");
          expect(sql).toContain("es.entityType = 'scene'");
          expect(params).toEqual(["42", "inst-a", 7, 7, 7, "clip", 7]);
        } else {
          expect(sql).not.toContain("JOIN StashScene cs");
          expect(params).toEqual(["42", "inst-a", 7, 7, 7, entityType]);
        }
      }
    );

    it("returns false without a query for an empty id or instance", async () => {
      await expect(canUserAccessEntity(7, "scene", "", "inst-a")).resolves.toBe(
        false
      );
      await expect(canUserAccessEntity(7, "scene", "42", "")).resolves.toBe(
        false
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("throws for an unknown entity type", async () => {
      await expect(
        canUserAccessEntity(7, "movie" as AccessEntityType, "42", "inst-a")
      ).rejects.toThrow("Unknown entity type: movie");
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("throws when the query fails, never allowing access", async () => {
      mockQuery.mockRejectedValueOnce(new Error("database is locked"));
      await expect(
        canUserAccessEntity(7, "scene", "42", "inst-a")
      ).rejects.toThrow("database is locked");
    });
  });

  describe("getVisibleEntityKeys", () => {
    it("returns an empty set without a query for no refs", async () => {
      await expect(getVisibleEntityKeys(7, "scene", [])).resolves.toEqual(
        new Set()
      );
      await expect(
        getVisibleEntityKeys(7, "scene", [
          { id: "", instanceId: "A" },
          { id: "1", instanceId: "" },
        ])
      ).resolves.toEqual(new Set());
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("sends the refs as one deduplicated JSON parameter", async () => {
      await getVisibleEntityKeys(7, "scene", [
        { id: "1", instanceId: "A" },
        { id: "1", instanceId: "A" },
        { id: "2", instanceId: "B" },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const { sql, params } = call();
      expect(sql).toContain("json_each(?)");
      expect(sql).toContain("FROM json_each(?) j");
      expect(params).toEqual(['[["1","A"],["2","B"]]', 7, 7, 7, "scene"]);
    });

    it("binds the extra user id for clips", async () => {
      await getVisibleEntityKeys(7, "clip", [{ id: "1", instanceId: "A" }]);

      const { sql, params } = call();
      expect(sql).toContain("JOIN StashClip x");
      expect(sql).toContain("JOIN StashScene cs");
      expect(params).toEqual(['[["1","A"]]', 7, 7, 7, "clip", 7]);
    });

    it('keys the result as id + "\\0" + instanceId', async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "1", instanceId: "A" },
        { id: "2", instanceId: "B" },
      ] as never);

      const keys = await getVisibleEntityKeys(7, "scene", [
        { id: "1", instanceId: "A" },
        { id: "2", instanceId: "B" },
        { id: "3", instanceId: "A" },
      ]);

      expect(keys).toEqual(new Set(["1\0A", "2\0B"]));
      expect(entityRefKey("1", "A")).toBe("1\0A");
    });
  });

  describe("resolveAccessibleInstanceId", () => {
    it("uses the request's instance without guessing", async () => {
      mockQuery.mockResolvedValueOnce([{ ok: 1 }] as never);

      await expect(
        resolveAccessibleInstanceId(7, "scene", "42", "inst-a")
      ).resolves.toBe("inst-a");

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const { sql, params } = call();
      expect(sql).toContain("x.stashInstanceId = ?");
      expect(sql).not.toContain("ORDER BY");
      expect(params).toEqual(["42", "inst-a", 7, 7, 7, "scene"]);
    });

    it("without a request instance, picks the first instance where the user can see the entity", async () => {
      mockQuery.mockResolvedValueOnce([{ instanceId: "inst-b" }] as never);

      await expect(
        resolveAccessibleInstanceId(7, "scene", "42", undefined)
      ).resolves.toBe("inst-b");

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const { sql, params } = call();
      expect(sql).not.toContain("x.stashInstanceId = ?");
      expect(sql).toContain("ORDER BY si.priority, x.stashInstanceId");
      expect(params).toEqual(["42", 7, 7, 7, "scene"]);
    });

    it("returns null when the entity is not visible", async () => {
      await expect(
        resolveAccessibleInstanceId(7, "scene", "42", "inst-a")
      ).resolves.toBeNull();
      await expect(
        resolveAccessibleInstanceId(7, "scene", "42", undefined)
      ).resolves.toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe("resolveVisibleApartFromOwnHides", () => {
    it("returns [] without a query for no refs", async () => {
      await expect(
        resolveVisibleApartFromOwnHides(7, "scene", [])
      ).resolves.toEqual(new Map());
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("binds the refs as one JSON parameter first, then the access params", async () => {
      await resolveVisibleApartFromOwnHides(7, "tag", [
        { id: "1", instanceId: "A" },
        { id: "2", instanceId: "" },
        { id: "1", instanceId: "A" },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const { sql, params } = call();
      expect(params).toEqual([
        JSON.stringify([
          ["1", "A"],
          ["2", ""],
        ]),
        7,
        7,
        7,
        "tag",
      ]);
      expect(sql).toContain("FROM json_each(?) j");
      expect(sql).toContain("FROM StashTag x");
      expect(sql).toContain("r.inst = '' OR x.stashInstanceId = r.inst");
      expect(sql).toContain("ORDER BY si.priority, x.stashInstanceId");
    });

    it("ignores only the user's own hides: any other exclusion row still excludes", async () => {
      await resolveVisibleApartFromOwnHides(7, "scene", [
        { id: "1", instanceId: "A" },
      ]);
      const { sql } = call();
      expect(sql).toContain("NOT EXISTS (SELECT 1 FROM UserExcludedEntity e");
      expect(sql).toContain("AND e.reason <> 'hidden'");
      expect(sql).toContain("x.deletedAt IS NULL");
      expect(sql).toContain("si.enabled = 1");
      expect(sql).toContain("FROM UserStashInstance usi");
    });

    it("maps each ref as passed in to its resolved instance, and drops the unresolved", async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "1", requested: "A", instanceId: "A" },
        { id: "2", requested: "", instanceId: "B" },
        { id: "3", requested: "A", instanceId: null },
      ] as never);

      const resolved = await resolveVisibleApartFromOwnHides(7, "scene", [
        { id: "1", instanceId: "A" },
        { id: "2", instanceId: "" },
        { id: "3", instanceId: "A" },
      ]);

      expect(resolved).toEqual(
        new Map([
          [entityRefKey("1", "A"), "A"],
          [entityRefKey("2", ""), "B"],
        ])
      );
    });
  });

  describe("keepVisibleConditions", () => {
    it("keeps the conditions whose ref is visible, in order", async () => {
      mockQuery.mockResolvedValueOnce([{ id: "2", instanceId: "B" }] as never);

      const kept = await keepVisibleConditions(7, "tag", [
        { id: "1", stashInstanceId: "A" },
        { id: "2", stashInstanceId: "B" },
      ]);

      expect(kept).toEqual([{ id: "2", stashInstanceId: "B" }]);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(call().params).toEqual([
        JSON.stringify([
          ["1", "A"],
          ["2", "B"],
        ]),
        7,
        7,
        7,
        "tag",
      ]);
    });

    it("returns [] without a query for []", async () => {
      await expect(keepVisibleConditions(7, "tag", [])).resolves.toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
