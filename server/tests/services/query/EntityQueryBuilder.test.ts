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
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../../prisma/singleton.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
} from "../../../services/query/EntityQueryBuilder.js";
import type {
  ParsedFilter,
  ParsedListRequest,
} from "../../../types/parsedFilters.js";
import type { FilterClause } from "../../../utils/sqlClauses.js";
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
    tiebreak: (dir) => `s.id ${dir}`,
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

  protected filterClauses(
    filter: ParsedFilter<"scene">,
    q: string | undefined
  ): Promise<FilterClause[]> {
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
    dropped: [],
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
  return pieces.map((piece) => {
    const at = sql.indexOf(piece);
    expect(at, `${piece} in:\n${sql}`).toBeGreaterThanOrEqual(0);
    return at;
  });
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
      "ORDER BY COALESCE(sgi.sceneIndex, ?) ASC, s.id ASC",
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
    expect(page.sql).toContain("% 2147483647) DESC, s.id DESC");
  });

  it("the tiebreak follows the sort expression", async () => {
    await builder.execute({
      userId: 1,
      allowedInstanceIds: ["inst-a"],
      request: request({
        sort: { field: "created_at", direction: "ASC", seed: undefined },
      }),
    });

    expect(must(statements()[0]).sql).toContain(
      "ORDER BY s.stashCreatedAt ASC, s.id ASC"
    );
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
      "ORDER BY s.stashCreatedAt ASC, s.id ASC"
    );
  });

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
        2,
        0,
      ]);
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
});
