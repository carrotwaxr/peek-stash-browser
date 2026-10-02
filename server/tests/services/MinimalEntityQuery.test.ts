/**
 * The entity pickers' statement and rows (services/MinimalEntityQuery.ts).
 * The same statements run against SQLite in
 * integration/services/MinimalEntityQuery.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import type { MinimalEntityQueryRow } from "../../types/internal/queryRows.js";
import type { MinimalKind } from "../../types/parsedFilters.js";
import { disambiguateEntityNames } from "../../utils/entityInstanceId.js";
import { parseMinimalRequest } from "../../utils/listRequest.js";
import { galleryNameSql } from "../../utils/sqlClauses.js";
import { jsonListArm } from "../../utils/sqlHelpers.js";
import { must } from "../helpers/must.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/entityInstanceId.js", () => ({
  disambiguateEntityNames: vi.fn(),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockDisambiguate = vi.mocked(disambiguateEntityNames);

const USER = 7;
const AS_USER = { id: USER, role: "USER" };
const AS_ADMIN = { id: USER, role: "ADMIN" };

/**
 * One picker request. `instanceIds` is the list the route's
 * `requirePickerReady` put on the request: the viewer's allowed instances,
 * or with an admin's scope every enabled, synced one.
 */
function find(
  entity: MinimalKind,
  body: object,
  viewer = AS_USER,
  instanceIds: readonly string[] = ["a", "b"]
) {
  return findMinimalEntities(
    viewer,
    parseMinimalRequest(entity, body, { userId: USER }),
    instanceIds
  );
}

/** The one statement sent, with its parameters */
function statement(): { sql: string; params: unknown[] } {
  expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
  return { sql, params };
}

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;

function row(fields: Partial<MinimalEntityQueryRow>): MinimalEntityQueryRow {
  return { id: "1", instanceId: "a", name: "Name", ...fields };
}

describe("findMinimalEntities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockDisambiguate.mockImplementation((entities) => entities);
  });

  it("sends nothing and lists nothing without an allowed instance", async () => {
    await expect(find("performer", {}, AS_USER, [])).resolves.toEqual([]);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("lists from the instances it is given, reading no list itself", async () => {
    await find("performer", {}, AS_USER, ["inst-x"]);

    const { sql, params } = statement();
    expect(sql).toContain("x.stashInstanceId IN (?)");
    expect(params).toEqual([USER, "performer", "inst-x", 50]);
  });

  it("reads one page in name order: exclusion join with the instance, live, allowed instances", async () => {
    await find("studio", { filter: { per_page: 20 } });

    const { sql, params } = statement();
    expect(sql).toContain("FROM StashStudio x");
    expect(sql).toContain(
      "LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = ? AND e.entityId = x.id"
    );
    expect(sql).toContain(
      "(e.instanceId = '' OR e.instanceId = x.stashInstanceId)"
    );
    expect(sql).toContain("x.deletedAt IS NULL");
    expect(sql).toContain("e.id IS NULL");
    expect(sql).toContain("x.stashInstanceId IN (?, ?)");
    expect(sql).toContain(
      "ORDER BY name COLLATE NOCASE, x.id, x.stashInstanceId\nLIMIT ?"
    );
    expect(sql).not.toContain("LIKE");
    expect(params).toEqual([USER, "studio", "a", "b", 20]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it.each([
    ["performer", ["x.name"], ["x.aliasList"]],
    ["studio", ["x.name"], ["x.aliases"]],
    ["tag", ["x.name"], ["x.aliases"]],
    ["group", ["x.name", "x.aliases"], []],
  ] as const)(
    "q matches the %s's name and aliases only, escaped, an alias list one alias at a time",
    async (entity, columns, lists) => {
      await find(entity, { filter: { q: "50%_off" } });

      const { sql, params } = statement();
      expect(sql).toContain(
        `(${[
          ...columns.map((c) => `${c} LIKE ? ESCAPE '\\'`),
          ...lists.map((l) => jsonListArm(l)),
        ].join(" OR ")})`
      );
      expect(sql).not.toContain("details");
      expect(sql).not.toContain("description");
      expect(params.filter((p) => p === "%50\\%\\_off%")).toHaveLength(
        columns.length + lists.length
      );
      expect(placeholders(sql)).toBe(params.length);
    }
  );

  it("a gallery is searched and ordered by its shown name", async () => {
    await find("gallery", { filter: { q: "comic" } });

    const { sql } = statement();
    expect(sql).toContain("COALESCE(NULLIF(x.title, ''),");
    expect(sql).toContain("x.title, x.fileBasename, x.folderPath");
    expect(sql).toContain(`${galleryNameSql("x")} LIKE ? ESCAPE '\\'`);
  });

  it("every word of q must match: one group per word, a quoted phrase one group", async () => {
    await find("performer", { filter: { q: '"anna b" pov' } });

    const { sql, params } = statement();
    expect(sql.match(/x\.name LIKE \? ESCAPE/g)).toHaveLength(2);
    expect(sql).toContain(") AND (x.name LIKE ?");
    expect(params.filter((p) => p === "%anna b%")).toHaveLength(2);
    expect(params.filter((p) => p === "%pov%")).toHaveLength(2);
    expect(sql).not.toContain("LOWER(");
    expect(placeholders(sql)).toBe(params.length);
  });

  it("blank q adds no search", async () => {
    await find("tag", { filter: { q: "  " } });

    const { sql } = statement();
    expect(sql).not.toContain("LIKE");
    expect(placeholders(sql)).toBe(statement().params.length);
  });

  it("count minimums are OR-ed over the type's own counts; one the type lacks filters nothing", async () => {
    await find("group", {
      count_filter: {
        min_scene_count: 1,
        min_image_count: 2,
        min_performer_count: 3,
      },
    });
    const { sql, params } = statement();
    expect(sql).toContain("(x.sceneCount >= ? OR x.performerCount >= ?)");
    expect(sql).not.toContain("imageCount");
    expect(params).toEqual([USER, "group", "a", "b", 1, 3, 50]);

    mockPrisma.$queryRawUnsafe.mockClear();
    await find("gallery", { count_filter: { min_scene_count: 1 } });
    expect(statement().sql).not.toContain(">= ?");
  });

  it("ids match (id, instance) pairs, a bare id its id on every allowed instance", async () => {
    await find("tag", { ids: ["12:a", "13"] });

    const { sql, params } = statement();
    expect(sql).toContain(
      "((x.id = ? AND x.stashInstanceId = ?) OR (x.id = ?))"
    );
    expect(params).toEqual([USER, "tag", "a", "b", "12", "a", "13", 50]);
  });

  it("answers id, instance and name, disambiguated; a gallery is named by title, file, then folder", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      row({ id: "1", name: "Titled", title: "Titled" }),
      row({
        id: "2",
        name: "Comic",
        title: "",
        fileBasename: "Comic.cbz",
        folderPath: "/lib/Folder",
      }),
      row({ id: "3", name: "Folder", title: null, folderPath: "/lib/Folder" }),
      row({ id: "4", name: null }),
    ]);
    mockDisambiguate.mockImplementation((entities) =>
      entities.map((e) => ({ ...e, name: `${e.name}!` }))
    );

    const rows = await find("gallery", {});

    expect(mockDisambiguate).toHaveBeenCalledWith([
      { id: "1", instanceId: "a", name: "Titled" },
      { id: "2", instanceId: "a", name: "Comic" },
      { id: "3", instanceId: "a", name: "Folder" },
      { id: "4", instanceId: "a", name: "" },
    ]);
    expect(rows.map((r) => r.name)).toEqual([
      "Titled!",
      "Comic!",
      "Folder!",
      "!",
    ]);
  });

  it("a performer is named by its name column", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      row({ id: "5", instanceId: "b", name: "Alpha" }),
    ]);

    await expect(find("performer", {})).resolves.toEqual([
      { id: "5", instanceId: "b", name: "Alpha" },
    ]);
  });
  describe("scope allEnabled (the Content Restrictions editor)", () => {
    it("with scope the statement has no exclusion join", async () => {
      // requirePickerReady resolved every enabled, synced instance
      await find("tag", { scope: "allEnabled" }, AS_ADMIN, ["a", "b", "c"]);

      const { sql, params } = statement();
      expect(sql).not.toContain("UserExcludedEntity");
      expect(sql).not.toContain("e.id IS NULL");
      expect(sql).not.toContain("e.instanceId");
      expect(sql).toContain("FROM StashTag x\nWHERE x.deletedAt IS NULL");
      expect(sql).toContain("x.stashInstanceId IN (?, ?, ?)");
      expect(params).toEqual(["a", "b", "c", 50]);
      expect(placeholders(sql)).toBe(params.length);
    });

    it("with scope every other clause stays, its params in order", async () => {
      const request = {
        ids: ["12:a", "13"],
        filter: { q: "50%", per_page: 20 },
        count_filter: { min_scene_count: 1 },
      };

      await find("tag", request, AS_ADMIN);
      const own = statement();
      mockPrisma.$queryRawUnsafe.mockClear();
      await find("tag", { ...request, scope: "allEnabled" }, AS_ADMIN);
      const scoped = statement();

      // The same statement without the join, its two params and e.id IS NULL
      expect(scoped.sql).toBe(
        own.sql
          .replace(
            "\nLEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = ? AND e.entityId = x.id\n  AND (e.instanceId = '' OR e.instanceId = x.stashInstanceId)",
            ""
          )
          .replace("\n  AND e.id IS NULL", "")
      );
      expect(own.params.slice(0, 2)).toEqual([USER, "tag"]);
      expect(scoped.params).toEqual(own.params.slice(2));
      expect(scoped.params).toEqual([
        "a",
        "b",
        "%50\\%%",
        "%50\\%%",
        1,
        "12",
        "a",
        "13",
        20,
      ]);
      expect(placeholders(scoped.sql)).toBe(scoped.params.length);
    });

    it("sends nothing and lists nothing when no enabled instance has synced", async () => {
      await expect(
        find("studio", { scope: "allEnabled" }, AS_ADMIN, [])
      ).resolves.toEqual([]);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("an admin without the scope keeps their own exclusions", async () => {
      await find("tag", {}, AS_ADMIN, ["a"]);

      expect(statement().params).toEqual([USER, "tag", "a", 50]);
    });

    it("a USER sending it is refused with ForbiddenError before any read", async () => {
      await expect(find("tag", { scope: "allEnabled" })).rejects.toThrow(
        ForbiddenError
      );
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
