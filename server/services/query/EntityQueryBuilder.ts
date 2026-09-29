/**
 * The base of the entity query builders (item 74): the seven entity lists
 * and clips.
 *
 * One list statement for every entity: `WITH <ctes> SELECT <columns> FROM
 * <table> <alias> <user joins> <other joins> <exclusion join> <extra joins>
 * <clause joins> <sort joins> WHERE <live> AND <not excluded> AND <extra
 * base conditions> AND <allowed instances> AND <clauses> ORDER BY <sort>,
 * <tiebreak> LIMIT ? OFFSET ?`, and its count as `SELECT COUNT(*)` over the
 * same WITH, FROM and WHERE. The parameters are bound in the text's order:
 * ctes, the select list, one user id per user join, the exclusion's user
 * id, extra joins, clause joins, sort joins, the WHERE, the sort, the page.
 *
 * The base owns what every list shares (server-sql.md, "Every list query"):
 * `deletedAt IS NULL`, the exclusion join with the instance, the allowed
 * instances (an empty list matches nothing), a detail page's one instance,
 * the `ids` filter as (id, instance) pairs, the random sort with its seed
 * bound, the joined `COUNT(*)`. A subclass declares its spec (table, alias,
 * user joins, columns, tiebreak), its filter clauses, its sort map, its row
 * transform and its relations.
 */
import type {
  ListKind,
  SortDirection,
} from "@peek/shared-types/filters/index.js";
import prisma from "../../prisma/singleton.js";
import type {
  ClipListRequest,
  FilterRef,
  ParsedListRequest,
  RefCriterion,
} from "../../types/parsedFilters.js";
import { logger } from "../../utils/logger.js";
import {
  type FilterClause,
  type SqlFragment,
  type SqlParam,
  combine,
  exclusionJoin,
  idClause,
  instanceClause,
  randomOrder,
  specificInstanceClause,
} from "../../utils/sqlClauses.js";

/** `UserExcludedEntity.entityType` */
export type ExclusionEntityType =
  | "scene"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery"
  | "image"
  | "clip";

/**
 * A per-user table LEFT JOINed on the entity's (id, instance) and the
 * viewer: `LEFT JOIN <table> <alias> ON <x>.id = <alias>.<entityIdCol> AND
 * <x>.stashInstanceId = <alias>.<instanceCol> AND <alias>.userId = ?`.
 * Each matches at most one row (a unique key), which keeps `COUNT(*)` exact.
 */
export interface UserJoin {
  readonly table: string;
  readonly alias: string;
  readonly entityIdCol: string;
  /** Default "instanceId" */
  readonly instanceCol?: string;
}

/** The request each list's builder takes: the parser's for the seven entity lists, and the clip list's */
export interface ListRequests {
  readonly scene: ParsedListRequest<"scene">;
  readonly performer: ParsedListRequest<"performer">;
  readonly studio: ParsedListRequest<"studio">;
  readonly tag: ParsedListRequest<"tag">;
  readonly group: ParsedListRequest<"group">;
  readonly gallery: ParsedListRequest<"gallery">;
  readonly image: ParsedListRequest<"image">;
  readonly clip: ClipListRequest;
}

/** A list's parsed filter */
export type ListFilterOf<K extends ListKind> = ListRequests[K]["filter"];

/** What the viewer and the request settle before the clauses are built */
export interface QueryContext {
  readonly userId: number;
  readonly applyExclusions: boolean;
  /** Enabled, selected and past their first sync; empty matches nothing */
  readonly allowedInstanceIds: readonly string[];
  /** A detail page's one instance */
  readonly specificInstanceId: string | undefined;
}

export interface EntitySpec {
  readonly table: string;
  readonly alias: string;
  readonly entityType: ExclusionEntityType;
  readonly userJoins: readonly UserJoin[];
  /**
   * Other joins the select list reads (a gallery's cover image, a clip's
   * scene and primary tag), after the user joins and binding no parameters.
   * Each is on a unique key, so the joined `COUNT(*)` stays exact; an INNER
   * JOIN drops the rows it does not match from the page and the count alike.
   */
  readonly joins?: readonly string[];
  /**
   * Joins that bind parameters or follow the context, after the exclusion
   * join (a clip's scene exclusions, with the viewer's id), each matching at
   * most one row or kept only when it matched none.
   */
  readonly extraJoins?: (ctx: QueryContext) => readonly SqlFragment[];
  /**
   * Conditions every row meets besides its own `deletedAt` and exclusion,
   * before the allowed instances (a clip's scene is live and not excluded).
   */
  readonly extraBaseWhere?: (ctx: QueryContext) => readonly FilterClause[];
  /** The select list; its params bind before the joins' */
  readonly selectColumns: (ctx: QueryContext) => SqlFragment;
  /** The sort key used when the request's key has no expression */
  readonly defaultSort: string;
  /** The stable order after the sort expression (`s.id DESC`) */
  readonly tiebreak: (direction: SortDirection, field: string) => string;
}

/** One sort key's ORDER BY expression, with the direction in it, and any join it needs */
export interface SortExpr {
  readonly sql: string;
  readonly params: SqlParam[];
  readonly joins?: readonly SqlFragment[];
}

export interface ListQueryOptions<K extends ListKind> {
  readonly userId: number;
  readonly allowedInstanceIds: readonly string[];
  readonly request: ListRequests[K];
  /** Default true: the viewer's precomputed exclusions apply */
  readonly applyExclusions?: boolean;
}

export interface ByRefsOptions {
  readonly userId: number;
  /** A bare ref (instance undefined) matches its id on every allowed instance */
  readonly refs: readonly FilterRef[];
  readonly allowedInstanceIds: readonly string[];
  /** Default true */
  readonly applyExclusions?: boolean;
}

export interface ListResult<Entity> {
  items: Entity[];
  total: number;
}

/** The seed of a random sort no request set (the parser always sets one) */
export const DEFAULT_RANDOM_SEED = 12345;

/**
 * The refs with their descendants to `depth` (0: none), for a hierarchical
 * ref filter (tags, studios). Expansion works on bare ids (C9 keeps the
 * instance through it): the selected refs keep their instance, and a
 * descendant matches its id on every instance.
 */
export async function expandRefs(
  refs: readonly FilterRef[],
  depth: number,
  expand: (ids: string[], depth: number) => Promise<string[]>
): Promise<readonly FilterRef[]> {
  if (depth === 0) return refs;
  const own = new Set(refs.map((ref) => ref.id));
  const expanded = await expand(
    refs.map((ref) => ref.id),
    depth
  );
  return [
    ...refs,
    ...expanded
      .filter((id) => !own.has(id))
      .map((id): FilterRef => ({ id, instanceId: undefined })),
  ];
}

/** A statement's parts, built once for the page and the count */
interface Built {
  /** The WITH block with its trailing newline, or "" */
  readonly with: string;
  readonly withParams: SqlParam[];
  readonly select: SqlFragment;
  readonly from: string;
  readonly fromParams: SqlParam[];
  readonly where: string;
  readonly whereParams: SqlParam[];
  readonly order: string;
  readonly orderParams: SqlParam[];
  readonly clauseCount: number;
}

/** A row statement's ORDER BY and page (none: every row), or nothing for a count */
interface Paging {
  readonly order: string;
  readonly params: SqlParam[];
  readonly page:
    | { readonly perPage: number; readonly offset: number }
    | undefined;
}

export abstract class EntityQueryBuilder<Row, Entity, K extends ListKind> {
  protected abstract readonly spec: EntitySpec;

  /** The sort expressions by key; `random` is the base's */
  protected abstract sortMap(
    direction: SortDirection,
    filter: ListFilterOf<K>
  ): Record<string, SortExpr>;

  /** The entity's own filter clauses; `ids` is the base's */
  protected abstract filterClauses(
    filter: ListFilterOf<K>,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]>;

  protected abstract transformRow(row: Row): Entity;

  protected abstract populateRelations(
    entities: Entity[],
    ctx: QueryContext
  ): Promise<void>;

  /** One page and its total, as the viewer sees the library (invariant 3) */
  async execute(options: ListQueryOptions<K>): Promise<ListResult<Entity>> {
    const startTime = Date.now();
    const { request } = options;
    const ctx = this.context(options, request.specificInstanceId);

    const built = await this.build(ctx, request);
    const { perPage, page } = request;
    const paging: Paging = {
      order: built.order,
      params: built.orderParams,
      page: { perPage, offset: (page - 1) * perPage },
    };

    logger.debug("EntityQueryBuilder.execute", {
      entity: this.spec.entityType,
      clauseCount: built.clauseCount,
      applyExclusions: ctx.applyExclusions,
      sort: request.sort.field,
      direction: request.sort.direction,
    });

    const queryStart = Date.now();
    const rows = await this.pageRows(built, paging);
    const queryMs = Date.now() - queryStart;

    const countStart = Date.now();
    const countRows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
      this.statement(built, undefined),
      ...this.params(built, undefined)
    );
    const total = Number(countRows[0]?.total ?? 0n);
    const countMs = Date.now() - countStart;

    const items = rows.map((row) => this.transformRow(row));
    const relationsStart = Date.now();
    await this.populateRelations(items, ctx);

    logger.debug("EntityQueryBuilder.execute complete", {
      entity: this.spec.entityType,
      totalMs: Date.now() - startTime,
      breakdown: { queryMs, countMs, relationsMs: Date.now() - relationsStart },
      resultCount: items.length,
      total,
    });

    return { items, total };
  }

  /**
   * The entities named by (id, instance) refs, with the viewer's exclusions
   * and allowed instances applied as on every list (invariant 3), in no
   * particular order: the caller reorders by entityKey. No count runs. A
   * page of refs at a time (A8 reads 250).
   */
  async getByRefs(options: ByRefsOptions): Promise<Entity[]> {
    const { refs } = options;
    if (refs.length === 0) return [];

    const ctx = this.context(options, undefined);
    const request = this.emptyRequest(refs.length);
    const built = await this.build(ctx, request, refs);
    const paging: Paging = {
      order: built.order,
      params: built.orderParams,
      page: { perPage: refs.length, offset: 0 },
    };
    const rows = await this.pageRows(built, paging);
    const items = rows.map((row) => this.transformRow(row));
    await this.populateRelations(items, ctx);
    return items;
  }

  /**
   * Every row the request matches, in its order, with no page and no count:
   * for a set its filter bounds (a scene's clips). The request's page is
   * not read.
   */
  protected async readAll(options: ListQueryOptions<K>): Promise<Entity[]> {
    const { request } = options;
    const ctx = this.context(options, request.specificInstanceId);
    const built = await this.build(ctx, request);
    const rows = await this.pageRows(built, {
      order: built.order,
      params: built.orderParams,
      page: undefined,
    });
    const items = rows.map((row) => this.transformRow(row));
    await this.populateRelations(items, ctx);
    return items;
  }

  /** One page of raw rows, as SQLite returns them */
  private async pageRows(built: Built, paging: Paging): Promise<Row[]> {
    return prisma.$queryRawUnsafe<Row[]>(
      this.statement(built, paging),
      ...this.params(built, paging)
    );
  }

  private context(
    options: {
      userId: number;
      allowedInstanceIds: readonly string[];
      applyExclusions?: boolean;
    },
    specificInstanceId: string | undefined
  ): QueryContext {
    return {
      userId: options.userId,
      applyExclusions: options.applyExclusions ?? true,
      allowedInstanceIds: options.allowedInstanceIds,
      specificInstanceId,
    };
  }

  /** A request with no filter, for a by-ref read */
  private emptyRequest(perPage: number): ListRequests[K] {
    // The default sort key is a member of the list's sort keys, and every
    // filter field is optional
    return {
      page: 1,
      perPage,
      q: undefined,
      sort: {
        field: this.spec.defaultSort,
        direction: "DESC",
        seed: undefined,
      },
      filter: {},
      specificInstanceId: undefined,
      dropped: [],
    } as unknown as ListRequests[K];
  }

  /** The statement's parts, built once for the page and the count */
  private async build(
    ctx: QueryContext,
    request: ListRequests[K],
    refs?: readonly FilterRef[]
  ): Promise<Built> {
    const { spec } = this;
    const x = spec.alias;

    const select = spec.selectColumns(ctx);
    const userJoins = spec.userJoins.map(
      (join) =>
        `LEFT JOIN ${join.table} ${join.alias} ON ${x}.id = ${join.alias}.${join.entityIdCol} AND ${x}.stashInstanceId = ${join.alias}.${join.instanceCol ?? "instanceId"} AND ${join.alias}.userId = ?`
    );
    const ownExclusions = ctx.applyExclusions
      ? exclusionJoin("e", spec.entityType, `${x}.id`, `${x}.stashInstanceId`)
      : "";
    const extraJoins = spec.extraJoins?.(ctx) ?? [];

    // The base clauses, then the entity's own
    const idsCriterion = (request.filter as { ids?: RefCriterion }).ids;
    const idRefs = refs ?? idsCriterion?.refs ?? [];
    const idModifier =
      refs !== undefined || idsCriterion === undefined
        ? "INCLUDES"
        : idsCriterion.modifier === "EXCLUDES"
          ? "EXCLUDES"
          : "INCLUDES";
    const clauses: FilterClause[] = [
      { sql: `${x}.deletedAt IS NULL`, params: [] },
      ...(ctx.applyExclusions ? [{ sql: "e.id IS NULL", params: [] }] : []),
      ...(spec.extraBaseWhere?.(ctx) ?? []),
      instanceClause(x, ctx.allowedInstanceIds),
      specificInstanceClause(x, ctx.specificInstanceId),
      ...(idRefs.length > 0
        ? [
            idClause(x, idRefs, idModifier, {
              allowedInstanceIds: ctx.allowedInstanceIds,
            }),
          ]
        : []),
      ...(await this.filterClauses(request.filter, request.q, ctx)),
    ];
    const combined = combine(clauses);

    const { field, seed } = request.sort;
    // Defence in depth, as for the key: the parser sends ASC or DESC, and
    // anything else never reaches ORDER BY (item 3)
    const direction: SortDirection =
      request.sort.direction === "ASC" ? "ASC" : "DESC";
    const sortExpr = this.sortExpr(field, direction, seed, request.filter);
    const order = `${sortExpr.sql}, ${spec.tiebreak(direction, field)}`;

    const from = [
      `FROM ${spec.table} ${x}`,
      ...userJoins,
      ...(spec.joins ?? []),
      ...(ownExclusions === "" ? [] : [ownExclusions]),
      ...extraJoins.map((j) => j.sql),
      ...combined.joins.map((j) => j.sql),
      ...(sortExpr.joins ?? []).map((j) => j.sql),
    ].join("\n");
    const fromParams: SqlParam[] = [
      ...spec.userJoins.map(() => ctx.userId),
      ...(ctx.applyExclusions ? [ctx.userId] : []),
      ...extraJoins.flatMap((j) => j.params),
      ...combined.joins.flatMap((j) => j.params),
      ...(sortExpr.joins ?? []).flatMap((j) => j.params),
    ];

    return {
      with:
        combined.ctes.length > 0
          ? `WITH ${combined.ctes.map((c) => c.sql).join(",\n")}\n`
          : "",
      withParams: combined.ctes.flatMap((c) => c.params),
      select,
      from,
      fromParams,
      where: combined.where,
      whereParams: combined.params,
      order,
      orderParams: sortExpr.params,
      clauseCount: clauses.length,
    };
  }

  private sortExpr(
    field: string,
    direction: SortDirection,
    seed: number | undefined,
    filter: ListFilterOf<K>
  ): SortExpr {
    if (field === "random") {
      const bound = Number.isSafeInteger(seed)
        ? (seed as number)
        : DEFAULT_RANDOM_SEED;
      const random = randomOrder(this.spec.alias, bound);
      return { sql: `${random.sql} ${direction}`, params: random.params };
    }
    const map = this.sortMap(direction, filter);
    // Defence in depth: the parser whitelists the key, and the map is looked
    // up as own data, never through the prototype
    const own = Object.prototype.hasOwnProperty.call(map, field)
      ? map[field]
      : undefined;
    const expr = own ?? map[this.spec.defaultSort];
    if (expr === undefined) {
      throw new Error(`No sort expression for ${this.spec.defaultSort}`);
    }
    return expr;
  }

  private statement(built: Built, paging: Paging | undefined): string {
    const select =
      paging === undefined
        ? "SELECT COUNT(*) AS total"
        : `SELECT ${built.select.sql}`;
    const tail =
      paging === undefined
        ? ""
        : `\nORDER BY ${paging.order}${paging.page === undefined ? "" : "\nLIMIT ? OFFSET ?"}`;
    return `${built.with}${select}\n${built.from}\nWHERE ${built.where}${tail}`;
  }

  private params(built: Built, paging: Paging | undefined): SqlParam[] {
    return [
      ...built.withParams,
      ...(paging === undefined ? [] : built.select.params),
      ...built.fromParams,
      ...built.whereParams,
      ...(paging === undefined ? [] : paging.params),
      ...(paging?.page === undefined
        ? []
        : [paging.page.perPage, paging.page.offset]),
    ];
  }
}
