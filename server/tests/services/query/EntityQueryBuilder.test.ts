/**
 * Unit tests for the base query builder (item 74).
 *
 * A fake subclass with one select parameter, one user join, one other
 * join, one clause join and one sort join pins the statement's shape and
 * the order its parameters are bound in: the text order, so a clause's `?`
 * meets its own value. The base owns the instance filter (an empty allowed
 * list matches nothing), the exclusion join, the joined count and the
 * random sort's bound seed.
 */
import type {
  EntityKind,
  SortDirection,
} from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../prisma/singleton.js";
import { clipQueryBuilder } from "../../../services/ClipQueryBuilder.js";
import { galleryQueryBuilder } from "../../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../../services/ImageQueryBuilder.js";
import { performerQueryBuilder } from "../../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../../services/TagQueryBuilder.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type FieldClauses,
  type LeafContext,
  type QueryContext,
  type SortExpr,
} from "../../../services/query/EntityQueryBuilder.js";
import type {
  ClipListRequest,
  ParsedFilter,
  ParsedListRequest,
} from "../../../types/parsedFilters.js";
import { type FilterClause, combine } from "../../../utils/sqlClauses.js";
import {
  parsedClipRequest,
  parsedListRequest,
} from "../../helpers/fixtures.js";
import { must } from "../../helpers/must.js";

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

vi.mock("../../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);

interface FakeRow {
  id: string;
  stashInstanceId: string;
}
interface FakeEntity {
  id: string;
  instanceId: string;
}

/** A scene-shaped builder whose every part binds a recognisable value */
class FakeBuilder extends EntityQueryBuilder<FakeRow, FakeEntity, "scene"> {
  protected readonly spec: EntitySpec = {
    table: "StashScene",
    alias: "s",
    entityType: "scene",
    userJoins: [{ table: "SceneRating", alias: "r", entityIdCol: "sceneId" }],
    joins: [
      "LEFT JOIN Other o ON o.id = s.otherId AND o.stashInstanceId = s.stashInstanceId",
    ],
    selectColumns: (ctx) => ({
      sql: "s.id, s.stashInstanceId, (SELECT COUNT(*) FROM Sub WHERE Sub.userId = ?) AS n",
      params: [`select:${ctx.userId}`],
    }),
    defaultSort: "created_at",
  };

  protected sortMap(dir: "ASC" | "DESC"): Record<string, SortExpr> {
    return {
      created_at: { sql: `s.stashCreatedAt ${dir}`, params: [] },
      scene_index: {
        sql: `COALESCE(sgi.sceneIndex, ?) ${dir}`,
        params: ["sort-param"],
        joins: [
          {
            sql: "LEFT JOIN SceneGroup sgi ON sgi.sceneId = s.id AND sgi.groupId = ?",
            params: ["sort-join-param"],
          },
        ],
      },
    };
  }

  protected override legacyFilterClauses(
    filter: ParsedFilter<"scene">,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    this.lastContext = ctx;
    const clauses: FilterClause[] = [];
    if (filter.title) {
      clauses.push({
        sql: "s.title = ?",
        params: ["where-param"],
        ctes: [
          {
            name: "c",
            sql: "c(id) AS MATERIALIZED (SELECT ?)",
            params: ["cte-param"],
          },
        ],
        joins: [
          {
            sql: "JOIN c ON c.id = s.id AND ? = 1",
            params: ["clause-join-param"],
          },
        ],
      });
    }
    if (filter.details) {
      // A clause whose count reads the same rows in another shape (L9)
      clauses.push({
        sql: "s.details = ?",
        params: ["page-form"],
        count: {
          sql: "s.id IN (SELECT id FROM cc WHERE ? = 1)",
          params: ["count-form"],
          ctes: [
            {
              name: "cc",
              sql: "cc(id) AS MATERIALIZED (SELECT ?)",
              params: ["count-cte"],
            },
          ],
        },
      });
    }
    if (q !== undefined) {
      clauses.push({ sql: "s.title LIKE ?", params: [`%${q}%`] });
    }
    return Promise.resolve(clauses);
  }

  protected transformRow(row: FakeRow): FakeEntity {
    return { id: row.id, instanceId: row.stashInstanceId };
  }

  protected populateRelations(): Promise<void> {
    return Promise.resolve();
  }

  /** The context of the last run, for the tests that check what reached the hooks */
  lastContext: QueryContext | undefined;
}

const builder = new FakeBuilder();

/**
 * The fake builder with a tiebreak on every key but its default, as the
 * name-sorted lists have one on every key but the name
 */
class TiebreakBuilder extends FakeBuilder {
  protected override readonly spec: EntitySpec = {
    table: "StashScene",
    alias: "s",
    entityType: "scene",
    userJoins: [],
    selectColumns: () => ({ sql: "s.id, s.stashInstanceId", params: [] }),
    defaultSort: "created_at",
    tiebreak: (field) => (field === "created_at" ? undefined : "s.title ASC"),
  };
}

const tiebroken = new TiebreakBuilder();

/**
 * A clip-shaped builder: a parent row joined on a unique key, the parent's
 * own exclusion join with the viewer's id, and the parent's conditions.
 */
class NestedBuilder extends EntityQueryBuilder<FakeRow, FakeEntity, "clip"> {
  protected readonly spec: EntitySpec = {
    table: "StashClip",
    alias: "c",
    entityType: "clip",
    userJoins: [],
    joins: [
      "INNER JOIN StashScene s ON c.sceneId = s.id AND c.sceneInstanceId = s.stashInstanceId",
    ],
    extraJoins: (ctx) =>
      ctx.applyExclusions
        ? [
            {
              sql: "LEFT JOIN UserExcludedEntity es ON es.userId = ? AND es.entityId = c.sceneId",
              params: [`extra:${ctx.userId}`],
            },
          ]
        : [],
    extraBaseWhere: (ctx) => [
      { sql: "s.deletedAt IS NULL", params: [] },
      ...(ctx.applyExclusions ? [{ sql: "es.id IS NULL", params: [] }] : []),
    ],
    selectColumns: () => ({ sql: "c.id, c.stashInstanceId", params: [] }),
    defaultSort: "stashCreatedAt",
  };

  protected sortMap(dir: "ASC" | "DESC"): Record<string, SortExpr> {
    return {
      stashCreatedAt: { sql: `c.stashCreatedAt ${dir}`, params: [] },
      seconds: { sql: `c.seconds ${dir}`, params: [] },
    };
  }

  protected override legacyFilterClauses(
    filter: ClipListRequest["filter"]
  ): Promise<FilterClause[]> {
    return Promise.resolve(
      filter.isGenerated === undefined
        ? []
        : [{ sql: "c.isGenerated = ?", params: [filter.isGenerated ? 1 : 0] }]
    );
  }

  protected transformRow(row: FakeRow): FakeEntity {
    return { id: row.id, instanceId: row.stashInstanceId };
  }

  protected populateRelations(): Promise<void> {
    return Promise.resolve();
  }

  /** Every row of the request, no page and no count */
  all(request: ClipListRequest): Promise<FakeEntity[]> {
    return this.readAll({
      userId: 5,
      allowedInstanceIds: ["inst-a"],
      request,
    });
  }
}

const nested = new NestedBuilder();

function clipRequest(
  overrides: Partial<ClipListRequest> = {}
): ClipListRequest {
  return {
    page: 2,
    perPage: 10,
    q: undefined,
    sort: { field: "seconds", direction: "ASC", seed: undefined },
    filter: {},
    specificInstanceId: undefined,
    ...overrides,
  };
}

function request(
  overrides: Partial<ParsedListRequest<"scene">> = {}
): ParsedListRequest<"scene"> {
  return {
    page: 1,
    perPage: 10,
    q: undefined,
    sort: { field: "created_at", direction: "DESC", seed: undefined },
    filter: {},
    specificInstanceId: undefined,
    ...overrides,
  };
}

/** The statements run, each as its SQL and its bound parameters */
function statements(): { sql: string; params: unknown[] }[] {
  return mockPrisma.$queryRawUnsafe.mock.calls.map(([sql, ...params]) => ({
    sql,
    params,
  }));
}

/** The character positions of the pieces, which must rise */
function positions(sql: string, pieces: string[]): number[] {
  const at = pieces.map((piece) => {
    const found = sql.indexOf(piece);
    expect(found, `${piece} in:\n${sql}`).toBeGreaterThanOrEqual(0);
    return found;
  });
  expect(at, `the pieces in order in:\n${sql}`).toEqual(
    [...at].sort((a, b) => a - b)
  );
  return at;
}

describe("EntityQueryBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: "1", stashInstanceId: "inst-a" }])
      .mockResolvedValueOnce([{ total: 1n }]);
  });

  it("execute binds params in the order ctes, select, user joins, exclusion, clause joins, sort joins, where, sort, limit, offset", async () => {
    const result = await builder.execute({
      userId: 7,
      allowedInstanceIds: ["inst-a", "inst-b"],
      request: request({
        page: 3,
        perPage: 20,
        sort: { field: "scene_index", direction: "ASC", seed: undefined },
        filter: { title: { modifier: "EQUALS", value: "x" } },
      }),
    });

    const page = must(statements()[0]);
    positions(page.sql, [
      "WITH c(id) AS MATERIALIZED (SELECT ?)",
      "SELECT s.id, s.stashInstanceId, (SELECT COUNT(*) FROM Sub WHERE Sub.userId = ?) AS n",
      "FROM StashScene s",
      "LEFT JOIN SceneRating r ON s.id = r.sceneId AND s.stashInstanceId = r.instanceId AND r.userId = ?",
      "LEFT JOIN Other o ON o.id = s.otherId AND o.stashInstanceId = s.stashInstanceId",
      "LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id AND (e.instanceId = '' OR e.instanceId = s.stashInstanceId)",
      "JOIN c ON c.id = s.id AND ? = 1",
      "LEFT JOIN SceneGroup sgi ON sgi.sceneId = s.id AND sgi.groupId = ?",
      "WHERE s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?, ?) AND s.title = ?",
      "ORDER BY COALESCE(sgi.sceneIndex, ?) ASC, s.id ASC, s.stashInstanceId ASC",
      "LIMIT ? OFFSET ?",
    ]);
    expect(page.params).toEqual([
      "cte-param",
      "select:7",
      7,
      7,
      "clause-join-param",
      "sort-join-param",
      "inst-a",
      "inst-b",
      "where-param",
      "sort-param",
      20,
      40,
    ]);
    expect(result).toEqual({
      items: [{ id: "1", instanceId: "inst-a" }],
      total: 1,
    });
  });

  it("the count query is the joined COUNT(*) with the same WITH, FROM and WHERE, and there is no unjoined count", async () => {
    await builder.execute({
      userId: 7,
      allowedInstanceIds: ["inst-a"],
      request: request({
        sort: { field: "scene_index", direction: "ASC", seed: undefined },
        filter: { title: { modifier: "EQUALS", value: "x" } },
      }),
    });

    const [page, count] = statements();
    expect(statements()).toHaveLength(2);
    const pageFrom = must(page).sql.slice(
      must(page).sql.indexOf("FROM StashScene s"),
      must(page).sql.indexOf("ORDER BY")
    );
    expect(must(count).sql).toContain("SELECT COUNT(*) AS total");
    expect(must(count).sql).toContain("WITH c(id) AS MATERIALIZED (SELECT ?)");
    expect(must(count).sql).toContain(pageFrom.trim());
    expect(must(count).sql).not.toContain("ORDER BY");
    expect(must(count).sql).not.toContain("LIMIT");
    // The same values, without the select list's, the sort's and the page's
    expect(must(count).params).toEqual([
      "cte-param",
      7,
      7,
      "clause-join-param",
      "sort-join-param",
      "inst-a",
      "where-param",
    ]);
  });

  it("a clause's count form is the count statement's: the page binds the clause, the count its count form with its CTE", async () => {
    await builder.execute({
      userId: 1,
      allowedInstanceIds: ["inst-a"],
      request: request({
        filter: { details: { modifier: "EQUALS", value: "x" } },
      }),
    });

    const [page, count] = statements();
    expect(must(page).sql).toContain("s.details = ?");
    expect(must(page).sql).not.toContain("cc");
    expect(must(page).params).toContain("page-form");
    expect(must(page).params).not.toContain("count-form");

    expect(must(count).sql).toMatch(
      /^WITH cc\(id\) AS MATERIALIZED \(SELECT \?\)\nSELECT COUNT\(\*\) AS total\n/
    );
    expect(must(count).sql).toContain(
      "s.id IN (SELECT id FROM cc WHERE ? = 1)"
    );
    expect(must(count).sql).not.toContain("s.details = ?");
    expect(must(count).params).toEqual([
      "count-cte",
      1,
      1,
      "inst-a",
      "count-form",
    ]);
  });

  it("count runs execute's count statement alone and answers its total as a number", async () => {
    const options = {
      userId: 7,
      allowedInstanceIds: ["inst-a"],
      request: request({
        filter: {
          title: { modifier: "EQUALS", value: "x" },
          details: { modifier: "EQUALS", value: "y" },
        },
      }),
    } as const;
    await builder.execute(options);
    const [, executed] = statements();

    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ total: 42n }]);
    const total = await builder.count(options);

    expect(total).toBe(42);
    expect(statements()).toEqual([must(executed)]);
    expect(must(statements()[0]).sql).toMatch(/SELECT COUNT\(\*\) AS total/);
  });

  it("count false runs one statement: the page, and answers a null total", async () => {
    // Only the page is read: queue its rows alone
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: "1", stashInstanceId: "inst-a" },
    ]);
    const result = await builder.execute({
      userId: 7,
      allowedInstanceIds: ["inst-a"],
      request: request({ count: false }),
    });

    expect(statements()).toHaveLength(1);
    expect(must(statements()[0]).sql).not.toMatch(/COUNT\(\*\) AS total/);
    expect(must(statements()[0]).sql).toContain("LIMIT ? OFFSET ?");
    expect(result).toEqual({
      items: [{ id: "1", instanceId: "inst-a" }],
      total: null,
    });
  });

  it("count true runs the page and the count, as absent does", async () => {
    const result = await builder.execute({
      userId: 7,
      allowedInstanceIds: ["inst-a"],
      request: request({ count: true }),
    });

    expect(statements()).toHaveLength(2);
    expect(result.total).toBe(1);
  });

  it("count (a detail page's tab counts) counts even for a request that says count false", async () => {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ total: 9n }]);
    const total = await builder.count({
      userId: 7,
      allowedInstanceIds: ["inst-a"],
      request: request({ count: false }),
    });

    expect(total).toBe(9);
    expect(statements()).toHaveLength(1);
    expect(must(statements()[0]).sql).toMatch(/SELECT COUNT\(\*\) AS total/);
  });

  it("count answers 0 when the statement returns no row", async () => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    expect(
      await builder.count({
        userId: 1,
        allowedInstanceIds: ["inst-a"],
        request: request(),
      })
    ).toBe(0);
  });

  it("random sort binds the seed three times and interpolates nothing", async () => {
    await builder.execute({
      userId: 1,
      allowedInstanceIds: ["inst-a"],
      request: request({
        sort: { field: "random", direction: "DESC", seed: 98765432 },
      }),
    });

    const page = must(statements()[0]);
    expect(page.sql).not.toContain("98765432");
    expect(page.sql.match(/s\.id \+ \?/g)).toHaveLength(3);
    expect(page.params.filter((p) => p === 98765432)).toHaveLength(3);
    expect(page.sql).toContain(
      "% 2147483647) DESC, s.id DESC, s.stashInstanceId DESC"
    );
  });

  it("the primary key follows the sort expression", async () => {
    await builder.execute({
      userId: 1,
      allowedInstanceIds: ["inst-a"],
      request: request({
        sort: { field: "created_at", direction: "ASC", seed: undefined },
      }),
    });

    expect(must(statements()[0]).sql).toContain(
      "ORDER BY s.stashCreatedAt ASC, s.id ASC, s.stashInstanceId ASC"
    );
  });

  it("a direction other than ASC sorts DESC and never reaches the text", async () => {
    await builder.execute({
      userId: 1,
      allowedInstanceIds: ["inst-a"],
      request: request({
        sort: {
          field: "created_at",
          direction: "ASC, (SELECT 1)" as never,
          seed: undefined,
        },
      }),
    });

    const { sql } = must(statements()[0]);
    expect(sql).toContain(
      "ORDER BY s.stashCreatedAt DESC, s.id DESC, s.stashInstanceId DESC"
    );
    expect(sql).not.toContain("SELECT 1");
  });

  it("a sort the map lacks falls back to the default sort", async () => {
    await builder.execute({
      userId: 1,
      allowedInstanceIds: ["inst-a"],
      request: request({
        sort: { field: "last_o_at", direction: "ASC", seed: undefined },
      }),
    });

    expect(must(statements()[0]).sql).toContain(
      "ORDER BY s.stashCreatedAt ASC, s.id ASC, s.stashInstanceId ASC"
    );
  });

  it.each([
    // The map's key keeps its own tiebreak
    ["scene_index", "COALESCE(sgi.sceneIndex, ?) ASC, s.title ASC"],
    // A key the map lacks orders as the default sort, with the default's
    // tiebreak (none), not the requested key's
    ["last_o_at", "s.stashCreatedAt ASC"],
  ] as const)(
    "the tiebreak follows the key the page is ordered by (%s)",
    async (field, terms) => {
      await tiebroken.execute({
        userId: 1,
        allowedInstanceIds: ["inst-a"],
        request: request({
          sort: { field, direction: "ASC", seed: undefined },
        }),
      });

      expect(must(statements()[0]).sql).toContain(
        `ORDER BY ${terms}, s.id ASC, s.stashInstanceId ASC\n`
      );
    }
  );

  // L8: a clause can take the shape that suits the page's order (the scene
  // tag filter reads SceneTag by its tag index when the sort has no index)
  it.each([
    ["created_at", "created_at"],
    ["scene_index", "scene_index"],
    ["random", "random"],
    ["last_o_at", "created_at"],
  ])(
    "the clauses' context names the key the page is ordered by (%s: %s)",
    async (field, sortField) => {
      await builder.execute({
        userId: 1,
        allowedInstanceIds: ["inst-a"],
        request: request({
          sort: { field, direction: "DESC", seed: 7 },
        } as Partial<ParsedListRequest<"scene">>),
      });

      expect(builder.lastContext?.sortField).toBe(sortField);
    }
  );

  it("applyExclusions false drops the exclusion join and `e.id IS NULL` only", async () => {
    await builder.execute({
      userId: 7,
      allowedInstanceIds: ["inst-a"],
      applyExclusions: false,
      request: request(),
    });

    const page = must(statements()[0]);
    expect(page.sql).not.toContain("UserExcludedEntity");
    expect(page.sql).not.toContain("e.id IS NULL");
    expect(page.sql).toContain("LEFT JOIN SceneRating r");
    expect(page.sql).toContain(
      "WHERE s.deletedAt IS NULL AND s.stashInstanceId IN (?)"
    );
    expect(page.params).toEqual(["select:7", 7, "inst-a", 10, 0]);
  });

  it("an empty allowed list matches nothing", async () => {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0n }]);

    const result = await builder.execute({
      userId: 1,
      allowedInstanceIds: [],
      request: request(),
    });

    expect(result).toEqual({ items: [], total: 0 });
    const page = must(statements()[0]);
    expect(page.sql).toContain(
      "WHERE s.deletedAt IS NULL AND e.id IS NULL AND 1 = 0"
    );
    expect(page.sql).not.toContain("stashInstanceId IN");
    expect(page.sql).not.toContain("IS NULL)");
  });

  it("a specific instance narrows the list to it", async () => {
    await builder.execute({
      userId: 1,
      allowedInstanceIds: ["inst-a", "inst-b"],
      request: request({ specificInstanceId: "inst-b" }),
    });

    const page = must(statements()[0]);
    expect(page.sql).toContain(
      "s.stashInstanceId IN (?, ?) AND s.stashInstanceId = ?"
    );
    expect(page.params.slice(3, 6)).toEqual(["inst-a", "inst-b", "inst-b"]);
  });

  it("the search text reaches the subclass's clauses", async () => {
    await builder.execute({
      userId: 1,
      allowedInstanceIds: ["inst-a"],
      request: request({ q: "needle" }),
    });

    const page = must(statements()[0]);
    expect(page.sql).toContain("s.title LIKE ?");
    expect(page.params).toContain("%needle%");
  });

  describe("extra joins and base conditions (a clip's scene)", () => {
    it("the extra joins follow the exclusion join with their params after its user id, and the extra conditions precede the allowed instances", async () => {
      await nested.execute({
        userId: 5,
        allowedInstanceIds: ["inst-a"],
        request: clipRequest({ filter: { isGenerated: true } }),
      });

      const [page, count] = statements();
      positions(must(page).sql, [
        "FROM StashClip c",
        "INNER JOIN StashScene s ON c.sceneId = s.id",
        "LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'clip' AND e.entityId = c.id AND (e.instanceId = '' OR e.instanceId = c.stashInstanceId)",
        "LEFT JOIN UserExcludedEntity es ON es.userId = ? AND es.entityId = c.sceneId",
        "WHERE c.deletedAt IS NULL AND e.id IS NULL AND s.deletedAt IS NULL AND es.id IS NULL AND c.stashInstanceId IN (?) AND c.isGenerated = ?",
        "ORDER BY c.seconds ASC, c.id ASC, c.stashInstanceId ASC",
      ]);
      expect(must(page).params).toEqual([5, "extra:5", "inst-a", 1, 10, 10]);
      expect(must(count).sql).toContain(
        "LEFT JOIN UserExcludedEntity es ON es.userId = ?"
      );
      expect(must(count).params).toEqual([5, "extra:5", "inst-a", 1]);
    });

    it("the context reaches them: without exclusions neither exclusion join is left", async () => {
      await nested.execute({
        userId: 5,
        allowedInstanceIds: ["inst-a"],
        applyExclusions: false,
        request: clipRequest(),
      });

      const page = must(statements()[0]);
      expect(page.sql).not.toContain("UserExcludedEntity");
      expect(page.sql).toContain(
        "WHERE c.deletedAt IS NULL AND s.deletedAt IS NULL AND c.stashInstanceId IN (?)"
      );
      expect(page.params).toEqual(["inst-a", 10, 10]);
    });
  });

  describe("readAll", () => {
    it("runs one statement in the request's order with no page and no count", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { id: "1", stashInstanceId: "inst-a" },
        { id: "2", stashInstanceId: "inst-a" },
      ]);

      const items = await nested.all(
        clipRequest({ specificInstanceId: "inst-a" })
      );

      expect(items).toEqual([
        { id: "1", instanceId: "inst-a" },
        { id: "2", instanceId: "inst-a" },
      ]);
      expect(statements()).toHaveLength(1);
      const page = must(statements()[0]);
      expect(page.sql).toMatch(
        /ORDER BY c\.seconds ASC, c\.id ASC, c\.stashInstanceId ASC$/
      );
      expect(page.sql).not.toContain("LIMIT");
      expect(page.sql).toContain("c.stashInstanceId = ?");
      expect(page.params).toEqual([5, "extra:5", "inst-a", "inst-a"]);
    });
  });

  describe("getByRefs", () => {
    it("reads exactly the (id, instance) pairs, with the exclusion join and the allowed instances, and counts nothing", async () => {
      const items = await builder.getByRefs({
        userId: 3,
        refs: [
          { id: "7", instanceId: "inst-a" },
          { id: "8", instanceId: "inst-a" },
        ],
        allowedInstanceIds: ["inst-a", "inst-b"],
      });

      expect(items).toEqual([{ id: "1", instanceId: "inst-a" }]);
      expect(statements()).toHaveLength(1);
      const page = must(statements()[0]);
      expect(page.sql).toContain("LEFT JOIN UserExcludedEntity e");
      expect(page.sql).toContain("e.id IS NULL");
      expect(page.sql).toContain(
        "((s.id = ? AND s.stashInstanceId = ?) OR (s.id = ? AND s.stashInstanceId = ?))"
      );
      expect(page.sql).not.toContain("s.id IN (");
      expect(page.params).toEqual([
        "select:3",
        3,
        3,
        "inst-a",
        "inst-b",
        "7",
        "inst-a",
        "8",
        "inst-a",
      ]);
      expect(page.sql).not.toContain("LIMIT");
    });

    it("a bare ref matches its id on every allowed instance", async () => {
      await builder.getByRefs({
        userId: 3,
        refs: [{ id: "7", instanceId: undefined }],
        allowedInstanceIds: ["inst-a", "inst-b"],
      });

      const page = must(statements()[0]);
      expect(page.sql).toContain(
        "s.stashInstanceId IN (?, ?) AND ((s.id = ?))"
      );
      // The refs bound the result: a bare ref matches one row per allowed
      // instance, which a LIMIT of refs.length would cut
      expect(page.sql).not.toContain("LIMIT");
      expect(page.params.slice(-1)).toEqual(["7"]);
    });

    it("runs no query for no refs", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();

      const items = await builder.getByRefs({
        userId: 3,
        refs: [],
        allowedInstanceIds: ["inst-a"],
      });

      expect(items).toEqual([]);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  /**
   * Rows equal on every other ORDER BY term (one name twice, one id on two
   * servers, one random value, NULLs) come back in whatever order SQLite
   * reads them, which can differ between a page's statement and the next
   * one's: only the primary key last makes the order total, so paging never
   * repeats or skips a row.
   */
  describe("the order ends with the primary key", () => {
    const options = { userId: 1, allowedInstanceIds: ["inst-a"] };
    const seed = 7;

    /** A list's sort, as the parser hands it over */
    function sortOf<E extends EntityKind>(
      entity: E,
      field: ParsedListRequest<E>["sort"]["field"],
      direction: SortDirection
    ): ParsedListRequest<E> {
      return parsedListRequest(entity, {
        sort: { field, direction, seed },
      });
    }

    type OrderCase = readonly [
      label: string,
      alias: string,
      run: (direction: SortDirection) => Promise<unknown>,
    ];

    /** Each builder with sorts that reach each shape of its order */
    const CASES: OrderCase[] = [
      ...(
        [
          "created_at",
          "date",
          "title",
          "rating",
          "last_o_at",
          "random",
        ] as const
      ).map(
        (field): OrderCase => [
          `scenes by ${field}`,
          "s",
          (direction) =>
            sceneQueryBuilder.execute({
              ...options,
              request: sortOf("scene", field, direction),
            }),
        ]
      ),
      ...(["name", "scene_count", "birthdate", "random"] as const).map(
        (field): OrderCase => [
          `performers by ${field}`,
          "p",
          (direction) =>
            performerQueryBuilder.execute({
              ...options,
              request: sortOf("performer", field, direction),
            }),
        ]
      ),
      ...(["name", "scene_count", "random"] as const).map(
        (field): OrderCase => [
          `studios by ${field}`,
          "s",
          (direction) =>
            studioQueryBuilder.execute({
              ...options,
              request: sortOf("studio", field, direction),
            }),
        ]
      ),
      ...(["name", "scene_count", "random"] as const).map(
        (field): OrderCase => [
          `tags by ${field}`,
          "t",
          (direction) =>
            tagQueryBuilder.execute({
              ...options,
              request: sortOf("tag", field, direction),
            }),
        ]
      ),
      ...(["name", "scene_count", "random"] as const).map(
        (field): OrderCase => [
          `groups by ${field}`,
          "g",
          (direction) =>
            groupQueryBuilder.execute({
              ...options,
              request: sortOf("group", field, direction),
            }),
        ]
      ),
      ...(["title", "date", "random"] as const).map(
        (field): OrderCase => [
          `galleries by ${field}`,
          "g",
          (direction) =>
            galleryQueryBuilder.execute({
              ...options,
              request: sortOf("gallery", field, direction),
            }),
        ]
      ),
      ...(["created_at", "title", "random"] as const).map(
        (field): OrderCase => [
          `images by ${field}`,
          "i",
          (direction) =>
            imageQueryBuilder.execute({
              ...options,
              request: sortOf("image", field, direction),
            }),
        ]
      ),
      ...(["stashCreatedAt", "seconds", "random"] as const).map(
        (field): OrderCase => [
          `clips by ${field}`,
          "c",
          (direction) =>
            clipQueryBuilder.execute({
              ...options,
              request: parsedClipRequest({
                sort: { field, direction, seed },
              }),
            }),
        ]
      ),
    ];

    /** The page statement's ORDER BY terms, without the page */
    function order(): string {
      const { sql } = must(statements()[0]);
      const at = sql.indexOf("\nORDER BY ");
      expect(at, sql).toBeGreaterThanOrEqual(0);
      return sql
        .slice(at + "\nORDER BY ".length)
        .replace(/\nLIMIT \? OFFSET \?$/, "");
    }

    /** Ends with `x.id <dir>, x.stashInstanceId <dir>`, with no other `x.id <dir>` term */
    function expectKeyLast(
      alias: string,
      direction: SortDirection,
      terms: string
    ): void {
      const key = `${alias}.id ${direction}, ${alias}.stashInstanceId ${direction}`;
      expect(terms.endsWith(`, ${key}`), terms).toBe(true);
      expect(terms.split(`${alias}.id ${direction}`), terms).toHaveLength(2);
    }

    beforeEach(() => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it.each(
      CASES.flatMap(([label, alias, run]) =>
        (["ASC", "DESC"] as const).map((direction) => ({
          label: `${label} ${direction}`,
          alias,
          run,
          direction,
        }))
      )
    )("$label", async ({ alias, run, direction }) => {
      await run(direction);

      expectKeyLast(alias, direction, order());
    });

    it("a tiebreak stays between the sort and the key (performers by scene count, then name)", async () => {
      await performerQueryBuilder.execute({
        ...options,
        request: sortOf("performer", "scene_count", "DESC"),
      });

      expect(order()).toBe(
        "MAX(p.sceneCount - COALESCE(d.scenes, 0), 0) DESC, p.name COLLATE NOCASE ASC, p.id DESC, p.stashInstanceId DESC"
      );
    });

    it("getByRefs orders by the default sort and the key", async () => {
      await sceneQueryBuilder.getByRefs({
        ...options,
        refs: [{ id: "7", instanceId: undefined }],
      });

      expect(order()).toBe(
        "s.stashCreatedAt DESC, s.id DESC, s.stashInstanceId DESC"
      );
    });

    it("readAll (a scene's clips) orders by its sort and the key", async () => {
      await clipQueryBuilder.getClipsForScene({
        ...options,
        scene: { id: "7", instanceId: "inst-a" },
        includeUngenerated: true,
      });

      expect(order()).toBe("c.seconds ASC, c.id ASC, c.stashInstanceId ASC");
    });
  });
});

/**
 * A clip-shaped builder on a field table (the smallest list, six fields):
 * each field's clause records its call, so the order the base builds them
 * in shows
 */
class TableBuilder extends EntityQueryBuilder<FakeRow, FakeEntity, "clip"> {
  protected readonly spec: EntitySpec = {
    table: "StashClip",
    alias: "c",
    entityType: "clip",
    userJoins: [],
    selectColumns: () => ({ sql: "c.id, c.stashInstanceId", params: [] }),
    defaultSort: "stashCreatedAt",
  };

  /** Each call: the field (or "search") with the context's name and underAny */
  readonly calls: string[] = [];

  private recorder =
    (field: string) =>
    (_criterion: unknown, ctx: LeafContext): FilterClause => {
      this.calls.push(`${field}:${ctx.name}:${String(ctx.underAny)}`);
      return { sql: `c.${field} = ?`, params: [field] };
    };

  protected override readonly fieldClauses: FieldClauses<"clip"> = {
    sceneId: this.recorder("sceneId"),
    tagIds: this.recorder("tagIds"),
    sceneTagIds: this.recorder("sceneTagIds"),
    performerIds: this.recorder("performerIds"),
    studioId: this.recorder("studioId"),
    isGenerated: this.recorder("isGenerated"),
  };

  protected override searchClause(q: string): FilterClause {
    this.calls.push("search");
    return { sql: "c.title LIKE ?", params: [q] };
  }

  protected sortMap(dir: "ASC" | "DESC"): Record<string, SortExpr> {
    return { stashCreatedAt: { sql: `c.stashCreatedAt ${dir}`, params: [] } };
  }

  protected transformRow(row: FakeRow): FakeEntity {
    return { id: row.id, instanceId: row.stashInstanceId };
  }

  protected populateRelations(): Promise<void> {
    return Promise.resolve();
  }
}

describe("the field clause table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0n }]);
  });

  it("builds one clause per field the filter carries, in the table's order, then the search", async () => {
    const table = new TableBuilder();
    const refs = { refs: [{ id: "1", instanceId: "inst-a" }], depth: 0 };

    await table.execute({
      userId: 5,
      allowedInstanceIds: ["inst-a"],
      request: clipRequest({
        q: "kiss",
        filter: {
          sceneTagIds: { ...refs, modifier: "INCLUDES" },
          sceneId: { ...refs, modifier: "INCLUDES" },
        },
      }),
    });

    expect(table.calls).toEqual([
      "sceneId:sceneId:false",
      "sceneTagIds:sceneTagIds:false",
      "search",
    ]);
    const page = must(statements()[0]);
    positions(page.sql, [
      "c.sceneId = ?",
      "c.sceneTagIds = ?",
      "c.title LIKE ?",
    ]);
    expect(page.params.slice(-5)).toEqual([
      "sceneId",
      "sceneTagIds",
      "kiss",
      10,
      10,
    ]);
  });

  it("clauseFor names a leaf's CTEs from its name", async () => {
    // Under the rating sort (no index) the 70 refs take the matched set, a
    // refs CTE and a matched CTE each
    const refs = Array.from({ length: 70 }, (_, i) => ({
      id: String(i + 1),
      instanceId: "inst-a",
    }));
    const leaf = {
      field: "tags",
      criterion: { refs, modifier: "INCLUDES", depth: 0 },
    } as const;
    const ctx = (name: string): LeafContext => ({
      userId: 1,
      applyExclusions: true,
      allowedInstanceIds: ["inst-a"],
      specificInstanceId: undefined,
      sortField: "rating",
      name,
      underAny: false,
    });

    const a = await sceneQueryBuilder.clauseFor(leaf, ctx("tags_a"));
    const b = await sceneQueryBuilder.clauseFor(leaf, ctx("tags_b"));

    expect((a.ctes ?? []).map((c) => c.name)).toEqual([
      "tags_a_refs",
      "tags_a_matched",
    ]);
    expect((b.ctes ?? []).map((c) => c.name)).toEqual([
      "tags_b_refs",
      "tags_b_matched",
    ]);
    expect(combine([a, b]).ctes.map((c) => c.name)).toEqual([
      "tags_a_refs",
      "tags_a_matched",
      "tags_b_refs",
      "tags_b_matched",
    ]);
  });
});
