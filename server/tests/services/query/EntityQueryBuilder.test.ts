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
import {
  type EntityKind,
  LIST_FIELDS,
  type ListKind,
  type SortDirection,
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
  FAVORITE_INLINE_LIMIT,
  type FieldClauses,
  type LeafContext,
  type QueryContext,
  type SortExpr,
  favoriteRefs,
  refOptionsOf,
} from "../../../services/query/EntityQueryBuilder.js";
import type {
  ClipListRequest,
  FilterRef,
  ParsedListRequest,
  ParsedWhereGroup,
} from "../../../types/parsedFilters.js";
import { pairsJson } from "../../../utils/entityRef.js";
import {
  type FilterClause,
  combine,
  noClause,
} from "../../../utils/sqlClauses.js";
import { alternatesOf, samplesOf } from "../../helpers/fieldSamples.js";
import {
  parsedClipRequest,
  parsedListRequest,
} from "../../helpers/fixtures.js";
import { must } from "../../helpers/must.js";
import { partialRow } from "../../helpers/prismaMock.js";
import { untrusted } from "../../helpers/untrusted.js";

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

  /**
   * The two fields the tests filter on; the rest of the scene's table is
   * left out, so a filter carrying them builds no clause
   */
  protected override readonly fieldClauses = {
    title: () => ({
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
    }),
    // A clause whose count reads the same rows in another shape (L9)
    details: () => ({
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
    }),
  } as Pick<
    FieldClauses<"scene">,
    "title" | "details"
  > as FieldClauses<"scene">;

  protected override searchClause(q: string, ctx: QueryContext): FilterClause {
    this.lastContext = ctx;
    return { sql: "s.title LIKE ?", params: [`%${q}%`] };
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

  /** One field of the clip's table; the rest build no clause */
  protected override readonly fieldClauses = {
    is_generated: (isGenerated: boolean): FilterClause => ({
      sql: "c.isGenerated = ?",
      params: [isGenerated ? 1 : 0],
    }),
  } as Pick<FieldClauses<"clip">, "is_generated"> as FieldClauses<"clip">;

  protected override searchClause(q: string): FilterClause {
    return { sql: "c.title LIKE ?", params: [q] };
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
          // The search clause is the hook that records the context
          q: "kiss",
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
        request: clipRequest({ filter: { is_generated: true } }),
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

  describe("ranked refs (Recommended)", () => {
    it("a ranked request with no refs reads no rows and counts 0", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0n }]);

      const result = await builder.execute({
        userId: 1,
        allowedInstanceIds: ["inst-a"],
        request: request(),
        ranked: [],
      });

      expect(result).toEqual({ items: [], total: 0 });
      const [page, count] = statements();
      for (const statement of [must(page), must(count)]) {
        // An empty ranked list never means "every row"
        expect(statement.sql).toContain(
          "WHERE s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?) AND 0"
        );
        expect(statement.sql).not.toContain("ranked_refs");
      }
    });

    it("a ranked request keeps the exclusion join and the allowed instances", async () => {
      const ranked = [
        { id: "7", instanceId: "inst-a" },
        { id: "3", instanceId: "inst-a" },
      ];

      await builder.execute({
        userId: 4,
        allowedInstanceIds: ["inst-a"],
        request: request(),
        ranked,
      });

      const [page, count] = statements();
      for (const statement of [must(page), must(count)]) {
        positions(statement.sql, [
          "WITH ranked_refs(id, inst, pos) AS MATERIALIZED",
          "LEFT JOIN UserExcludedEntity e",
          "JOIN ranked_refs k ON k.id = s.id AND k.inst = s.stashInstanceId",
          "WHERE s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?)",
        ]);
        expect(statement.params[0]).toBe(pairsJson(ranked));
      }
      expect(must(page).params).toEqual([
        pairsJson(ranked),
        "select:4",
        4,
        4,
        "inst-a",
        10,
        0,
      ]);
    });

    it("the Recommended sort reads the rank only within ranked refs: best first on DESC, and the default sort without them", async () => {
      mockPrisma.$queryRawUnsafe.mockReset();
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      const recommended = (direction: "ASC" | "DESC") =>
        request({
          sort: {
            field:
              untrusted<ParsedListRequest<"scene">["sort"]["field"]>(
                "recommended"
              ),
            direction,
            seed: undefined,
          },
        });
      const ranked = [{ id: "7", instanceId: "inst-a" }];
      const orderOf = async (
        direction: "ASC" | "DESC",
        refs: typeof ranked | undefined
      ) => {
        mockPrisma.$queryRawUnsafe.mockClear();
        await sceneQueryBuilder.execute({
          userId: 1,
          allowedInstanceIds: ["inst-a"],
          request: recommended(direction),
          ...(refs === undefined ? {} : { ranked: refs }),
        });
        const sql = must(statements()[0]).sql;
        return sql.slice(sql.indexOf("ORDER BY"), sql.indexOf("\nLIMIT"));
      };

      expect(await orderOf("DESC", ranked)).toBe(
        "ORDER BY k.pos ASC, s.id DESC, s.stashInstanceId DESC"
      );
      expect(await orderOf("ASC", ranked)).toBe(
        "ORDER BY k.pos DESC, s.id ASC, s.stashInstanceId ASC"
      );
      expect(await orderOf("DESC", undefined)).toBe(
        "ORDER BY s.stashCreatedAt DESC, s.id DESC, s.stashInstanceId DESC"
      );
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
    scenes: this.recorder("scenes"),
    tags: this.recorder("tags"),
    scene_tags: this.recorder("scene_tags"),
    performers: this.recorder("performers"),
    studios: this.recorder("studios"),
    is_generated: this.recorder("is_generated"),
    duration: this.recorder("duration"),
    created_at: this.recorder("created_at"),
    updated_at: this.recorder("updated_at"),
    title: this.recorder("title"),
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
          scene_tags: { ...refs, modifier: "INCLUDES" },
          scenes: { ...refs, modifier: "INCLUDES" },
        },
      }),
    });

    expect(table.calls).toEqual([
      "scenes:scenes:false",
      "scene_tags:scene_tags:false",
      "search",
    ]);
    const page = must(statements()[0]);
    positions(page.sql, ["c.scenes = ?", "c.scene_tags = ?", "c.title LIKE ?"]);
    expect(page.params.slice(-5)).toEqual([
      "scenes",
      "scene_tags",
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
      ranked: false,
      timeZone: "UTC",
      hasExclusionsOf: () => Promise.resolve(false),
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

describe("leavesOf: excludes beside a ref's values", () => {
  const a = (id: string) => ({ id, instanceId: "a" });
  const leaves = (filter: ParsedListRequest<"scene">["filter"]) =>
    sceneQueryBuilder["leavesOf"](filter);

  it("leavesOf splits a ref criterion with excludes into the field and its _not leaf", () => {
    expect(
      leaves({
        tags: {
          refs: [a("1")],
          modifier: "INCLUDES",
          depth: -1,
          excludes: [a("2")],
        },
      })
    ).toEqual([
      {
        field: "tags",
        name: "tags",
        criterion: { refs: [a("1")], modifier: "INCLUDES", depth: -1 },
      },
      {
        field: "tags",
        name: "tags_not",
        criterion: { refs: [a("2")], modifier: "EXCLUDES", depth: -1 },
      },
    ]);
  });

  it("excludes alone give the _not leaf only", () => {
    expect(
      leaves({
        performers: {
          refs: [],
          modifier: "INCLUDES",
          depth: 0,
          excludes: [a("2")],
        },
      })
    ).toEqual([
      {
        field: "performers",
        name: "performers_not",
        criterion: { refs: [a("2")], modifier: "EXCLUDES", depth: 0 },
      },
    ]);
  });

  it("a presence criterion keeps its leaf with no refs; a plain one is named by its field", () => {
    expect(
      leaves({
        studios: {
          refs: [],
          modifier: "NOT_NULL",
          depth: 0,
          excludes: [a("3")],
        },
        groups: { refs: [a("4")], modifier: "INCLUDES_ALL", depth: 0 },
      })
    ).toEqual([
      {
        field: "studios",
        name: "studios",
        criterion: { refs: [], modifier: "NOT_NULL", depth: 0 },
      },
      {
        field: "studios",
        name: "studios_not",
        criterion: { refs: [a("3")], modifier: "EXCLUDES", depth: 0 },
      },
      {
        field: "groups",
        name: "groups",
        criterion: { refs: [a("4")], modifier: "INCLUDES_ALL", depth: 0 },
      },
    ]);
  });

  it("the two leaves name their CTEs apart in one statement", async () => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0n }]);
    const refs = (from: number) =>
      Array.from({ length: 70 }, (_, i) => a(String(from + i)));

    await sceneQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: ["a"],
      request: parsedListRequest("scene", {
        filter: {
          performers: {
            refs: refs(1),
            modifier: "INCLUDES",
            depth: 0,
            excludes: refs(100),
          },
        },
        sort: { field: "rating", direction: "DESC", seed: undefined },
      }),
    });

    const page = must(statements()[0]).sql;
    // The excludes probe their refs per row: a refs CTE, no matched set
    for (const name of [
      "performers_refs",
      "performers_matched",
      "performers_not_refs",
    ]) {
      expect(page).toContain(`${name}(id, inst) AS MATERIALIZED`);
    }
    expect(page).toContain("IN (SELECT id, inst FROM performers_not_refs)");
  });
});

describe("favoriteRefs", () => {
  const ctx = { userId: 7, applyExclusions: true, allowedInstanceIds: ["a"] };
  const tagRows = (
    n: number
  ): Awaited<ReturnType<typeof prisma.tagRating.findMany>> =>
    Array.from({ length: n }, (_, i) =>
      partialRow({ instanceId: "a", tagId: String(i + 1) })
    );

  beforeEach(() => {
    // Earlier tests may leave queued answers
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.tagRating.findMany.mockReset();
    mockPrisma.userExcludedEntity.findMany.mockReset();
  });

  it("up to the limit, the favourites' exclusions are one lookup by their ids", async () => {
    mockPrisma.tagRating.findMany.mockResolvedValue(tagRows(3));
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([
      partialRow({ entityId: "2", instanceId: "" }),
    ]);

    expect(await favoriteRefs("tag", ctx)).toEqual([
      { id: "1", instanceId: "a" },
      { id: "3", instanceId: "a" },
    ]);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("above the limit, the favourites travel as one JSON parameter, not one per favourite", async () => {
    const n = FAVORITE_INLINE_LIMIT + 1;
    mockPrisma.tagRating.findMany.mockResolvedValue(tagRows(n));
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ id: "5", inst: "a" }]);

    expect(await favoriteRefs("tag", ctx)).toEqual([
      { id: "5", instanceId: "a" },
    ]);
    expect(mockPrisma.userExcludedEntity.findMany).not.toHaveBeenCalled();
    const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    expect(sql).toContain("json_each(?)");
    expect(sql).toContain("x.instanceId = ''");
    expect(params).toHaveLength(3);
    expect(must(params[0], "the pairs")).toBe(
      JSON.stringify(Array.from({ length: n }, (_, i) => [String(i + 1), "a"]))
    );
    expect(params.slice(1)).toEqual([7, "tag"]);
  });
});

/**
 * A scene-shaped builder on three fields, for the where tree: each clause
 * is plain text with one CTE named from its leaf, and records its leaf's
 * name and whether it sits under an any group. `favorite: false` builds no
 * clause, as a favourite filter with no favourites does.
 */
class TreeBuilder extends EntityQueryBuilder<FakeRow, FakeEntity, "scene"> {
  protected readonly spec: EntitySpec = {
    table: "StashScene",
    alias: "s",
    entityType: "scene",
    userJoins: [],
    selectColumns: () => ({ sql: "s.id, s.stashInstanceId", params: [] }),
    defaultSort: "created_at",
  };

  readonly calls: string[] = [];

  private named(field: string, ctx: LeafContext, clause: FilterClause) {
    this.calls.push(`${field}:${ctx.name}:${String(ctx.underAny)}`);
    return {
      ...clause,
      ctes: [
        {
          name: ctx.name,
          sql: `${ctx.name}(id) AS MATERIALIZED (SELECT 1)`,
          params: [],
        },
      ],
    };
  }

  protected override readonly fieldClauses = {
    tags: (c: { refs: readonly FilterRef[]; modifier: string }, ctx) =>
      this.named("tags", ctx, {
        sql: `tags_${c.modifier}(?)`,
        params: [c.refs.map((r) => r.id).join(",")],
      }),
    favorite: (on: boolean, ctx) =>
      on
        ? this.named("favorite", ctx, { sql: "r.favorite = 1", params: [] })
        : noClause(),
    organized: (on: boolean, ctx) =>
      this.named("organized", ctx, {
        sql: "s.organized = ?",
        params: [on ? 1 : 0],
      }),
  } as Pick<
    FieldClauses<"scene">,
    "tags" | "favorite" | "organized"
  > as FieldClauses<"scene">;

  protected override searchClause(q: string): FilterClause {
    return { sql: "s.title LIKE ?", params: [q] };
  }

  protected sortMap(dir: "ASC" | "DESC"): Record<string, SortExpr> {
    return { created_at: { sql: `s.stashCreatedAt ${dir}`, params: [] } };
  }

  protected transformRow(row: FakeRow): FakeEntity {
    return { id: row.id, instanceId: row.stashInstanceId };
  }

  protected populateRelations(): Promise<void> {
    return Promise.resolve();
  }
}

/** The text between WHERE and ORDER BY */
function whereText(sql: string): string {
  const from = sql.indexOf("\nWHERE ") + "\nWHERE ".length;
  const to = sql.indexOf("\nORDER BY");
  return sql.slice(from, to === -1 ? undefined : to);
}

/** The names of a statement's CTEs, in order */
function cteNames(sql: string): string[] {
  return [...sql.matchAll(/(?:WITH |,\n)(\w+)\(/g)].map((m) => must(m[1]));
}

describe("the where tree", () => {
  const BASE =
    "s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?)";
  const tags = (
    modifier: "INCLUDES" | "EXCLUDES",
    ids: string[],
    excludes?: string[]
  ) =>
    ({
      field: "tags",
      criterion: {
        refs: ids.map((id) => ({ id, instanceId: "a" })),
        modifier,
        depth: 0,
        ...(excludes
          ? { excludes: excludes.map((id) => ({ id, instanceId: "a" })) }
          : {}),
      },
    }) as const;
  const favorite = (on: boolean) =>
    ({ field: "favorite", criterion: on }) as const;
  const organized = { field: "organized", criterion: true } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  async function pageOf(
    tree: TreeBuilder,
    overrides: Partial<ParsedListRequest<"scene">>
  ): Promise<string> {
    mockPrisma.$queryRawUnsafe.mockClear();
    await tree.execute({
      userId: 5,
      allowedInstanceIds: ["a"],
      request: request(overrides),
    });
    return must(statements()[0]).sql;
  }

  it("a where of root rows gives the filter object's statement but the CTE names", async () => {
    const tree = new TreeBuilder();
    const flat = await pageOf(tree, {
      filter: { favorite: true, organized: true },
    });
    const where = await pageOf(tree, {
      where: { match: "all", rules: [favorite(true), organized] },
    });

    expect(whereText(where)).toBe(whereText(flat));
    expect(whereText(where)).toBe(
      `${BASE} AND r.favorite = 1 AND s.organized = ?`
    );
    expect(cteNames(flat)).toEqual(["favorite", "organized"]);
    expect(cteNames(where)).toEqual(["w0_favorite", "w1_organized"]);
    expect(tree.calls.slice(-2)).toEqual([
      "favorite:w0_favorite:false",
      "organized:w1_organized:false",
    ]);
  });

  it("an any group is one OR clause after the base clauses, between the filter and the search", async () => {
    const tree = new TreeBuilder();
    const page = await pageOf(tree, {
      q: "kiss",
      filter: { organized: true },
      where: { match: "any", rules: [favorite(true), tags("INCLUDES", ["1"])] },
    });

    // The exclusion and the instances are never inside the parentheses
    // (invariants 3 and 11)
    expect(whereText(page)).toBe(
      `${BASE} AND s.organized = ? AND (r.favorite = 1 OR tags_INCLUDES(?)) AND s.title LIKE ?`
    );
    expect(tree.calls).toEqual([
      "organized:organized:false",
      "favorite:w0_favorite:true",
      "tags:w1_tags:true",
    ]);
  });

  it("the ranked clause stays outside an any group", async () => {
    const tree = new TreeBuilder();
    await tree.execute({
      userId: 5,
      allowedInstanceIds: ["a"],
      request: request({
        where: {
          match: "any",
          rules: [favorite(true), tags("INCLUDES", ["1"])],
        },
      }),
      ranked: [{ id: "1", instanceId: "a" }],
    });
    const page = must(statements()[0]).sql;

    // The ranked join restricts the FROM and the group ORs only its rows
    positions(page, [
      "WITH ranked_refs(id, inst, pos)",
      "JOIN ranked_refs k ON k.id = s.id AND k.inst = s.stashInstanceId",
      `WHERE ${BASE} AND (r.favorite = 1 OR tags_INCLUDES(?))`,
    ]);
    expect(whereText(page)).toBe(
      `${BASE} AND (r.favorite = 1 OR tags_INCLUDES(?))`
    );
    expect(cteNames(page)).toEqual(["ranked_refs", "w0_favorite", "w1_tags"]);
  });

  it("a leaf's excludes stay one disjunct under any", async () => {
    const tree = new TreeBuilder();
    const page = await pageOf(tree, {
      where: {
        match: "any",
        rules: [tags("INCLUDES", ["1"], ["2"]), favorite(true)],
      },
    });

    expect(whereText(page)).toBe(
      `${BASE} AND ((tags_INCLUDES(?) AND tags_EXCLUDES(?)) OR r.favorite = 1)`
    );
    expect(cteNames(page)).toEqual(["w0_tags", "w0_tags_not", "w1_favorite"]);
  });

  it("a group that compiles to nothing is no clause; an any group with a TRUE child is no clause; a one-rule group is its rule without parentheses", async () => {
    const tree = new TreeBuilder();
    const where = (
      ...rules: ParsedWhereGroup<"scene">["rules"]
    ): ParsedWhereGroup<"scene"> => ({ match: "all", rules });

    expect(
      whereText(
        await pageOf(tree, {
          where: where({ match: "all", rules: [favorite(false)] }),
        })
      )
    ).toBe(BASE);
    expect(
      whereText(
        await pageOf(tree, {
          where: where({ match: "any", rules: [favorite(false), organized] }),
        })
      )
    ).toBe(BASE);
    expect(
      whereText(
        await pageOf(tree, {
          where: { match: "any", rules: [favorite(false), organized] },
        })
      )
    ).toBe(BASE);
    expect(
      whereText(
        await pageOf(tree, {
          where: where({ match: "any", rules: [organized] }),
        })
      )
    ).toBe(`${BASE} AND s.organized = ?`);
    expect(
      whereText(
        await pageOf(tree, { where: { match: "any", rules: [organized] } })
      )
    ).toBe(`${BASE} AND s.organized = ?`);
  });

  it("a group keeps its children's count forms", async () => {
    const tag = (id: string) => ({
      field: "tags" as const,
      criterion: {
        refs: [{ id, instanceId: "a" }],
        modifier: "INCLUDES" as const,
        depth: 0,
      },
    });
    await sceneQueryBuilder.execute({
      userId: 5,
      allowedInstanceIds: ["a"],
      request: parsedListRequest("scene", {
        sort: { field: "created_at", direction: "DESC", seed: undefined },
        where: {
          match: "all",
          rules: [{ match: "all", rules: [tag("1"), tag("2")] }],
        },
      }),
    });

    const [page, count] = statements();
    // The page walks the sort index and probes each scene's tags; the count
    // reads every match from the tag index
    expect(must(page).sql).toContain(
      "EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id"
    );
    expect(must(count).sql).toContain("SELECT COUNT(*) AS total");
    expect(whereText(must(count).sql)).toContain(
      "(s.id, s.stashInstanceId) IN (SELECT st.sceneId, st.sceneInstanceId FROM SceneTag st WHERE ((st.tagId = ? AND st.tagInstanceId = ?))"
    );
    expect(whereText(must(count).sql)).not.toContain(
      "EXISTS (SELECT 1 FROM SceneTag"
    );
  });

  it("every leaf under any takes the read-once shape", async () => {
    const ctx: LeafContext = {
      userId: 5,
      applyExclusions: true,
      allowedInstanceIds: ["a"],
      specificInstanceId: undefined,
      sortField: "created_at",
      ranked: false,
      timeZone: "UTC",
      hasExclusionsOf: () => Promise.resolve(false),
      name: "w0_tags",
      underAny: false,
    };
    expect(refOptionsOf({ ...ctx, underAny: true })).toEqual({
      name: "w0_tags",
      allowedInstanceIds: ["a"],
      sortedByIndex: false,
    });
    expect(refOptionsOf(ctx)).toEqual({
      name: "w0_tags",
      allowedInstanceIds: ["a"],
    });

    const performers = {
      field: "performers" as const,
      criterion: {
        refs: [{ id: "9", instanceId: "a" }],
        modifier: "INCLUDES" as const,
        depth: 0,
      },
    };
    const pageFor = async (match: "all" | "any") => {
      mockPrisma.$queryRawUnsafe.mockClear();
      await sceneQueryBuilder.execute({
        userId: 5,
        allowedInstanceIds: ["a"],
        request: parsedListRequest("scene", {
          sort: { field: "created_at", direction: "DESC", seed: undefined },
          where: { match, rules: [performers] },
        }),
      });
      return whereText(must(statements()[0]).sql);
    };

    expect(await pageFor("any")).toContain(
      "(s.id, s.stashInstanceId) IN (SELECT sp.sceneId, sp.sceneInstanceId FROM ScenePerformer sp WHERE ((sp.performerId = ? AND sp.performerInstanceId = ?)))"
    );
    expect(await pageFor("all")).toContain(
      "EXISTS (SELECT 1 FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND ((sp.performerId = ? AND sp.performerInstanceId = ?)))"
    );
  });
});

describe("no field clause joins", () => {
  const BUILDERS = {
    scene: sceneQueryBuilder,
    performer: performerQueryBuilder,
    studio: studioQueryBuilder,
    tag: tagQueryBuilder,
    group: groupQueryBuilder,
    gallery: galleryQueryBuilder,
    image: imageQueryBuilder,
    clip: clipQueryBuilder,
  } as const;

  /** Each builder's field samples and alternates, as `[label, kind, sample]` rows */
  const rows = (Object.keys(BUILDERS) as ListKind[]).flatMap((kind) =>
    [...samplesOf(LIST_FIELDS[kind]), ...alternatesOf(LIST_FIELDS[kind])]
      // `ids` is the base's, no field clause
      .filter(([, sample]) => sample.field !== "ids")
      .map(([label, sample]) => [`${kind} ${label}`, kind, sample] as const)
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([
      partialRow({ tagId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.studioRating.findMany.mockResolvedValue([
      partialRow({ studioId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.performerRating.findMany.mockResolvedValue([
      partialRow({ performerId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.findFirst.mockResolvedValue(null);
    // The hierarchies a depth expands through: none beyond the refs
    mockPrisma.stashTag.findMany.mockResolvedValue([]);
    mockPrisma.stashStudio.findMany.mockResolvedValue([]);
    mockPrisma.groupRelation.findMany.mockResolvedValue([]);
  });

  // `anyOf` refuses a clause that joins, so every field may sit in an any group
  it.each(rows)(
    "%s builds a clause without a join",
    async (_label, kind, sample) => {
      for (const underAny of [false, true]) {
        const clause = await BUILDERS[kind].clauseFor(
          // Each sample is a valid criterion of its own field
          { field: sample.field, criterion: sample.criterion } as never,
          {
            userId: 5,
            applyExclusions: true,
            allowedInstanceIds: ["inst-a"],
            specificInstanceId: undefined,
            sortField: "created_at",
            ranked: false,
            timeZone: "UTC",
            hasExclusionsOf: () => Promise.resolve(true),
            name: `w0_${sample.field}`,
            underAny,
          }
        );
        expect(clause.joins).toBeUndefined();
      }
    }
  );
});
