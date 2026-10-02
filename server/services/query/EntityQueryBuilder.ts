/**
 * The base of the entity query builders (item 74): the seven entity lists
 * and clips.
 *
 * One list statement for every entity: `WITH <ctes> SELECT <columns> FROM
 * <table> <alias> <user joins> <other joins> <exclusion join> <extra joins>
 * <clause joins> <sort joins> WHERE <live> AND <not excluded> AND <extra
 * base conditions> AND <allowed instances> AND <clauses> ORDER BY <sort>,
 * <tiebreak>, <primary key> LIMIT ? OFFSET ?`, and its count as
 * `SELECT COUNT(*)` over the same WITH, FROM and WHERE, a clause's count
 * form (`FilterClause.count`) in its place. The parameters are bound in the text's order:
 * ctes, the select list, one user id per user join, the exclusion's user
 * id, extra joins, clause joins, sort joins, the WHERE, the sort, the page.
 *
 * The base owns what every list shares (server-sql.md, "Every list query"):
 * `deletedAt IS NULL`, the exclusion join with the instance, the allowed
 * instances (an empty list matches nothing), a detail page's one instance,
 * the `ids` filter as (id, instance) pairs, the random sort with its seed
 * bound, the primary key ending every order, the joined `COUNT(*)`. A
 * subclass declares its spec (table, alias,
 * user joins, columns, tiebreak), its filter clauses, its sort map, its row
 * transform and its relations.
 *
 * A builder's filter clauses are a table with one function per field
 * (`fieldClauses`) and a `searchClause`: the base reads the filter as
 * leaves, one criterion of one field each, builds each leaf's clause through
 * `clauseFor` in the table's order, and appends the search last. Every CTE a
 * clause adds is named from its leaf's name, unique in the statement
 * (`combine` refuses two of one name). A ref criterion's `excludes` become
 * a leaf of their own (`<field>_not`, EXCLUDES), so a field's clause never
 * sees them.
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
  RefFieldCriterion,
} from "../../types/parsedFilters.js";
import { entityKey } from "../../utils/entityRef.js";
import {
  type HierarchyKind,
  expandRefs,
  expandRefsEach,
} from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import {
  type ColumnTarget,
  type CombinedClauses,
  type FilterClause,
  type JunctionTarget,
  type SqlFragment,
  type SqlParam,
  allOf,
  combine,
  countForms,
  exclusionJoin,
  idClause,
  instanceClause,
  randomOrder,
  refClause,
  refPresenceClause,
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
  /**
   * The key the page is ordered by: the request's, or the default when the
   * sort map has no expression for it; "random" for the random sort. A
   * clause may take the shape that suits it (the scene tag filter, L8).
   */
  readonly sortField: string;
  /**
   * The viewer's IANA zone, which date filters on stored instants read
   * their days in (`buildInstantFilter`): the request's
   * (`X-Peek-Time-Zone`), "UTC" for a caller that passes none
   */
  readonly timeZone: string;
}

/** The fields a builder's own table covers: the parsed filter without the base's `ids` */
export type OwnFilterOf<K extends ListKind> = Omit<ListFilterOf<K>, "ids">;
export type FieldOf<K extends ListKind> = keyof OwnFilterOf<K> & string;

/** One criterion of one field: 9a has one per field the filter carries; 9b's tree has many */
export interface Leaf<K extends ListKind, F extends FieldOf<K> = FieldOf<K>> {
  readonly field: F;
  readonly criterion: NonNullable<OwnFilterOf<K>[F]>;
}

/**
 * A leaf with the name its clause's CTEs take, unique in the statement:
 * its field's, or `<field>_not` for a ref criterion's `excludes`
 */
export interface NamedLeaf<
  K extends ListKind,
  F extends FieldOf<K> = FieldOf<K>,
> extends Leaf<K, F> {
  readonly name: string;
}

/** Where a leaf's clause sits in the statement */
export interface LeafContext extends QueryContext {
  /** Unique in the statement; every CTE the clause adds is named from it (`tags`, `tags_refs`) */
  readonly name: string;
  /** Under an "any" group (9b): take the read-once shape whatever the sort. Always false in 9a. */
  readonly underAny: boolean;
  /**
   * Set by a builder's `leafContextFor` from the whole filter: the clip
   * list's, when no studio or scene criterion drives the statement
   */
  readonly lists?: boolean;
}

/** One field's clause: the criterion's WHERE fragment, named from the leaf */
export type FieldClause<C> = (
  criterion: C,
  ctx: LeafContext
) => FilterClause | Promise<FilterClause>;

/** A builder's clause per field of its filter, every field but the base's `ids` */
export type FieldClauses<K extends ListKind> = {
  readonly [F in FieldOf<K>]-?: FieldClause<NonNullable<OwnFilterOf<K>[F]>>;
};

export interface EntitySpec {
  readonly table: string;
  readonly alias: string;
  readonly entityType: ExclusionEntityType;
  readonly userJoins: readonly UserJoin[];
  /**
   * Other joins the select list reads (a gallery's cover image, a clip's
   * scene), after the user joins and binding no parameters.
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
  /**
   * Terms between the sort expression and the primary key, for the sort
   * keys whose equal values should list by something the viewer sees first
   * (by name after a count); none when absent or undefined. The base ends
   * every order with the key.
   */
  readonly tiebreak?: (field: string) => string | undefined;
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
  /** The viewer's IANA zone (`req.timeZone`); default "UTC" */
  readonly timeZone?: string;
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
  /** null when the request asked for no count (`count: false`) */
  total: number | null;
}

/** The seed of a random sort no request set (the parser always sets one) */
export const DEFAULT_RANDOM_SEED = 12345;

/** The entity a ref's junction names, for "has any" and "has none" */
export interface RelatedTable {
  /** Keyed by `id` and `stashInstanceId`, soft-deleted through `deletedAt` */
  readonly table: string;
  readonly entityType: ExclusionEntityType;
}

/**
 * IS_NULL ("has none") or NOT_NULL ("has any") of a ref relation
 * (`refPresenceClause`). With `related`, a junction row counts only when
 * the entity it names is live and, with the viewer's exclusions applied,
 * not excluded for them: a relation filter follows only rows the viewer
 * can see.
 */
export function refPresence(
  target: JunctionTarget | ColumnTarget,
  modifier: "IS_NULL" | "NOT_NULL",
  ctx: QueryContext,
  opts: {
    readonly related?: RelatedTable | undefined;
    readonly inheritedJunction?: JunctionTarget | undefined;
  } = {}
): FilterClause {
  return refPresenceClause(target, modifier === "NOT_NULL", {
    ...(opts.inheritedJunction
      ? { inheritedJunction: opts.inheritedJunction }
      : {}),
    ...(opts.related
      ? {
          liveRef: {
            ...opts.related,
            userId: ctx.applyExclusions ? ctx.userId : null,
          },
        }
      : {}),
  });
}

/**
 * A plain ref field's clause: its ids through `refClause`, its CTEs named
 * from the leaf, or "has none" and "has any" through `refPresence`
 */
export function refFieldClause(
  target: JunctionTarget | ColumnTarget,
  criterion: RefFieldCriterion,
  ctx: LeafContext,
  related?: RelatedTable
): FilterClause {
  if (criterion.modifier === "IS_NULL" || criterion.modifier === "NOT_NULL") {
    return refPresence(target, criterion.modifier, ctx, { related });
  }
  return refClause(target, criterion.refs, criterion.modifier, {
    name: ctx.name,
    allowedInstanceIds: ctx.allowedInstanceIds,
  });
}

/**
 * A hierarchical ref filter (tags, studios): the refs with their
 * descendants to the criterion's depth, matched as (id, instance) pairs
 * through `refClause`; "has none" and "has any" through `refPresence`,
 * whatever the depth. Every ref keeps its instance through the expansion
 * (`utils/hierarchyUtils.ts`): a bare ref means every allowed instance.
 * INCLUDES_ALL is one clause per selected ref, each with its own
 * descendants, AND-ed: an entity holding any descendant of each chosen
 * ref matches, not one holding every descendant (QUERIES-08). With
 * `sortedByIndex` the clause is the page's shape for it, and its count form
 * (`FilterClause.count`) the shape for reading every match in no order
 * (`sortedByIndex: false`, L9); the refs are expanded once for both.
 */
export async function hierarchicalRefClause(
  kind: HierarchyKind,
  target: JunctionTarget | ColumnTarget,
  criterion: RefFieldCriterion,
  ctx: QueryContext,
  opts: {
    name: string;
    inheritedJunction?: JunctionTarget;
    sortedByIndex?: boolean;
    /** For presence: the entity the junction names */
    related?: RelatedTable;
  }
): Promise<FilterClause> {
  const { sortedByIndex, related, ...rest } = opts;
  if (criterion.modifier === "IS_NULL" || criterion.modifier === "NOT_NULL") {
    return refPresence(target, criterion.modifier, ctx, {
      related,
      inheritedJunction: opts.inheritedJunction,
    });
  }
  const options = { ...rest, allowedInstanceIds: ctx.allowedInstanceIds };
  let clauseFor: (sorted: boolean | undefined) => FilterClause;
  if (criterion.modifier === "INCLUDES_ALL") {
    const groups = await expandRefsEach(
      kind,
      criterion.refs,
      criterion.depth,
      ctx.allowedInstanceIds
    );
    clauseFor = (sorted) =>
      allOf(
        groups.map((group, i) =>
          refClause(target, group, "INCLUDES", {
            ...options,
            ...(sorted === undefined ? {} : { sortedByIndex: sorted }),
            name: `${opts.name}_${i}`,
          })
        )
      );
  } else {
    const { modifier } = criterion;
    const refs = await expandRefs(
      kind,
      criterion.refs,
      criterion.depth,
      ctx.allowedInstanceIds
    );
    clauseFor = (sorted) =>
      refClause(target, refs, modifier, {
        ...options,
        ...(sorted === undefined ? {} : { sortedByIndex: sorted }),
      });
  }
  const page = clauseFor(sortedByIndex);
  if (sortedByIndex !== true) return page;
  const count = clauseFor(false);
  return JSON.stringify(count) === JSON.stringify(page)
    ? page
    : { ...page, count };
}

/** A ref criterion carrying `excludes` */
function hasExcludes(
  criterion: unknown
): criterion is RefFieldCriterion & { excludes: readonly FilterRef[] } {
  return (
    typeof criterion === "object" &&
    criterion !== null &&
    "refs" in criterion &&
    "excludes" in criterion &&
    Array.isArray(criterion.excludes)
  );
}

/**
 * A leaf whose ref criterion carries `excludes`, as the leaves its clauses
 * read (resolution 3; 9b's compiler splits each leaf of its tree the same
 * way): the criterion without them, named as the leaf and left out when it
 * names no id and is no presence check, then `<name>_not`, EXCLUDES of the
 * excludes to the same depth, so a hierarchical field excludes their
 * descendants too (Stash's CombineExcludes). Any other leaf is itself.
 */
export function splitExcludes<K extends ListKind>(
  leaf: NamedLeaf<K>
): NamedLeaf<K>[] {
  const criterion: unknown = leaf.criterion;
  if (!hasExcludes(criterion)) return [leaf];
  const { excludes, ...own } = criterion;
  const presence = own.modifier === "IS_NULL" || own.modifier === "NOT_NULL";
  const not: RefCriterion = {
    refs: excludes,
    modifier: "EXCLUDES",
    depth: own.depth,
  };
  // The one cast: the leaf's criterion without `excludes`, and an EXCLUDES
  // of them, are criteria of the leaf's own ref field, which TypeScript
  // cannot tie to the generic field
  const ofField = (c: RefFieldCriterion) =>
    c as unknown as Leaf<K>["criterion"];
  return [
    ...(own.refs.length > 0 || presence
      ? [{ ...leaf, criterion: ofField(own) }]
      : []),
    ...(excludes.length > 0
      ? [{ ...leaf, name: `${leaf.name}_not`, criterion: ofField(not) }]
      : []),
  ];
}

/**
 * The viewer's favourites of one kind on the allowed instances, as refs with
 * their instance (a favourite on one instance never stands for the same id
 * on another). Only the viewer's own rows are read. With the viewer's
 * exclusions applied, a favourite the viewer has excluded or hidden is
 * dropped (`UserExcludedEntity`, with no instance or the ref's own), so a
 * hidden entity never makes a scene match. Empty when nothing is left: the
 * caller settles that case, since `refClause` reads no refs as no filter.
 */
export async function favoriteRefs(
  kind: "tag" | "studio" | "performer",
  ctx: Pick<QueryContext, "userId" | "applyExclusions" | "allowedInstanceIds">
): Promise<FilterRef[]> {
  if (ctx.allowedInstanceIds.length === 0) return [];
  const where = {
    userId: ctx.userId,
    favorite: true,
    instanceId: { in: [...ctx.allowedInstanceIds] },
  };
  let refs: FilterRef[];
  if (kind === "tag") {
    const rows = await prisma.tagRating.findMany({
      where,
      select: { instanceId: true, tagId: true },
    });
    refs = rows.map((r) => ({ id: r.tagId, instanceId: r.instanceId }));
  } else if (kind === "studio") {
    const rows = await prisma.studioRating.findMany({
      where,
      select: { instanceId: true, studioId: true },
    });
    refs = rows.map((r) => ({ id: r.studioId, instanceId: r.instanceId }));
  } else {
    const rows = await prisma.performerRating.findMany({
      where,
      select: { instanceId: true, performerId: true },
    });
    refs = rows.map((r) => ({ id: r.performerId, instanceId: r.instanceId }));
  }
  if (!ctx.applyExclusions || refs.length === 0) return refs;

  const excluded = await prisma.userExcludedEntity.findMany({
    where: {
      userId: ctx.userId,
      entityType: kind,
      entityId: { in: refs.map((r) => r.id) },
    },
    select: { entityId: true, instanceId: true },
  });
  const hidden = new Set(
    excluded.map((e) => entityKey(e.entityId, e.instanceId))
  );
  return refs.filter(
    (r) =>
      !hidden.has(entityKey(r.id, "")) &&
      !hidden.has(entityKey(r.id, r.instanceId ?? ""))
  );
}

/** A statement's WITH, FROM and WHERE, with their parameters */
interface StatementParts {
  /** The WITH block with its trailing newline, or "" */
  readonly with: string;
  readonly withParams: SqlParam[];
  readonly from: string;
  readonly fromParams: SqlParam[];
  readonly where: string;
  readonly whereParams: SqlParam[];
}

/** A statement's parts, built once for the page and the count */
interface Built extends StatementParts {
  readonly select: SqlFragment;
  readonly order: string;
  readonly orderParams: SqlParam[];
  readonly clauseCount: number;
  /**
   * The count's parts: the page's, with each clause's count form
   * (`FilterClause.count`) in its place (L9)
   */
  readonly count: StatementParts;
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

  /**
   * The sort expressions by key; `random` is the base's. The context tells
   * a count sort whether the viewer's excluded links apply (B13b); its
   * keys never depend on it.
   */
  protected abstract sortMap(
    direction: SortDirection,
    filter: ListFilterOf<K>,
    ctx: QueryContext
  ): Record<string, SortExpr>;

  /**
   * The entity's own filter clauses, one function per field in the order
   * the statement ANDs them; `ids` is the base's
   */
  protected abstract readonly fieldClauses: FieldClauses<K>;

  /** The search text's clause (`q`), after the field clauses */
  protected abstract searchClause(q: string, ctx: QueryContext): FilterClause;

  /**
   * The context a leaf's clause reads, for facts of the whole filter a
   * single field cannot see (the clip list's `lists`); the leaf's own
   * context by default
   */
  protected leafContextFor(
    _filter: ListFilterOf<K>,
    ctx: LeafContext
  ): LeafContext {
    return ctx;
  }

  protected abstract transformRow(row: Row): Entity;

  /**
   * The filter's leaves: one per field it carries, in the table's key
   * order (a field left undefined carries none), named by the field; a ref
   * criterion with `excludes` gives two (`splitExcludes`)
   */
  protected leavesOf(filter: ListFilterOf<K>): NamedLeaf<K>[] {
    const own: OwnFilterOf<K> = filter;
    const fields = Object.keys(this.fieldClauses) as FieldOf<K>[];
    return fields.flatMap((field) => {
      const criterion = own[field];
      // The parser sends no null; a field left undefined carries no leaf
      return criterion === undefined || criterion === null
        ? []
        : splitExcludes<K>({ field, name: field, criterion });
    });
  }

  /**
   * A leaf's clause, from its field's function in the table (looked up as
   * own data, never through the prototype, as `sortExpr` does)
   */
  async clauseFor(leaf: Leaf<K>, ctx: LeafContext): Promise<FilterClause> {
    const table = this.fieldClauses;
    if (!Object.prototype.hasOwnProperty.call(table, leaf.field)) {
      throw new Error(`No filter clause for ${leaf.field}`);
    }
    // The one cast of the correlated union: a leaf's criterion is its own
    // field's, which TypeScript cannot tie to `table[leaf.field]`
    const clause = table[leaf.field] as FieldClause<Leaf<K>["criterion"]>;
    return clause(leaf.criterion, ctx);
  }

  /**
   * The filter's clauses: each leaf's, named from its field, in the table's
   * order, then the search's
   */
  private async clausesOf(
    filter: ListFilterOf<K>,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const clauses: FilterClause[] = [];
    for (const leaf of this.leavesOf(filter)) {
      const leafCtx = this.leafContextFor(filter, {
        ...ctx,
        name: leaf.name,
        underAny: false,
      });
      clauses.push(await this.clauseFor(leaf, leafCtx));
    }
    if (q !== undefined) clauses.push(this.searchClause(q, ctx));
    return clauses;
  }

  protected abstract populateRelations(
    entities: Entity[],
    ctx: QueryContext
  ): Promise<void>;

  /**
   * One page and its total, as the viewer sees the library (invariant 3).
   * A request with `count: false` reads the page alone and answers a null
   * total: a page change of a list whose total the client already holds.
   */
  async execute(options: ListQueryOptions<K>): Promise<ListResult<Entity>> {
    const startTime = Date.now();
    const { request } = options;
    const ctx = this.context(options, request);

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
    const total = request.count === false ? null : await this.countRows(built);
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
   * The total the request's list shows the viewer, as `execute` counts it,
   * without reading a page: the count statement only (a detail page's tab
   * counts, B19). The request's page and sort are not read, except for the
   * shape a clause takes for its count. It counts whatever the request's
   * `count` flag says.
   */
  async count(options: ListQueryOptions<K>): Promise<number> {
    const { request } = options;
    const ctx = this.context(options, request);
    return this.countRows(await this.build(ctx, request));
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

    const request = this.emptyRequest(refs.length);
    const ctx = this.context(options, request);
    const built = await this.build(ctx, request, refs);
    const paging: Paging = {
      order: built.order,
      params: built.orderParams,
      // No LIMIT: the refs bound the result, and a bare ref matches one row
      // per allowed instance, so refs.length would cut a wanted row
      page: undefined,
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
    const ctx = this.context(options, request);
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

  /** The joined `COUNT(*)` of a built statement */
  private async countRows(built: Built): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
      this.statement(built, undefined),
      ...this.params(built, undefined)
    );
    return Number(rows[0]?.total ?? 0n);
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
      timeZone?: string;
    },
    request: ListRequests[K]
  ): QueryContext {
    // The sort map's keys do not depend on the sort field, so the key is
    // settled with the default in its place
    const ctx: QueryContext = {
      userId: options.userId,
      applyExclusions: options.applyExclusions ?? true,
      allowedInstanceIds: options.allowedInstanceIds,
      specificInstanceId: request.specificInstanceId,
      sortField: this.spec.defaultSort,
      timeZone: options.timeZone ?? "UTC",
    };
    return { ...ctx, sortField: this.sortKey(request, ctx) };
  }

  /**
   * The key the page is ordered by: "random", a key of the sort map, or the
   * default sort for a key the map lacks (looked up as own data, never
   * through the prototype: the parser whitelists the key, this is defence
   * in depth).
   */
  private sortKey(request: ListRequests[K], ctx: QueryContext): string {
    const { field, direction } = request.sort;
    if (field === "random") return field;
    const map = this.sortMap(
      direction === "ASC" ? "ASC" : "DESC",
      request.filter,
      ctx
    );
    return Object.prototype.hasOwnProperty.call(map, field)
      ? field
      : this.spec.defaultSort;
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
    const userJoins = this.userJoinFragments(ctx.userId);
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
      ...(await this.clausesOf(request.filter, request.q, ctx)),
    ];

    const { field, seed } = request.sort;
    // Defence in depth, as for the key: the parser sends ASC or DESC, and
    // anything else never reaches ORDER BY (item 3)
    const direction: SortDirection =
      request.sort.direction === "ASC" ? "ASC" : "DESC";
    const sortExpr = this.sortExpr(field, direction, seed, request.filter, ctx);
    // The primary key last makes the order total: rows equal on every other
    // term (one name twice, one id on two servers, one random value, NULLs)
    // keep one order in every page's statement, so paging never repeats or
    // skips a row. The tiebreak follows the key the page is ordered by, the
    // default sort's for a key the map lacks.
    const order = [
      sortExpr.sql,
      spec.tiebreak?.(ctx.sortField),
      `${x}.id ${direction}`,
      `${x}.stashInstanceId ${direction}`,
    ]
      .filter((term) => term !== undefined)
      .join(", ");

    const partsOf = (combined: CombinedClauses): StatementParts => ({
      with:
        combined.ctes.length > 0
          ? `WITH ${combined.ctes.map((c) => c.sql).join(",\n")}\n`
          : "",
      withParams: combined.ctes.flatMap((c) => c.params),
      from: [
        `FROM ${spec.table} ${x}`,
        ...userJoins.map((j) => j.sql),
        ...(spec.joins ?? []),
        ...(ownExclusions === "" ? [] : [ownExclusions]),
        ...extraJoins.map((j) => j.sql),
        ...combined.joins.map((j) => j.sql),
        ...(sortExpr.joins ?? []).map((j) => j.sql),
      ].join("\n"),
      fromParams: [
        ...userJoins.flatMap((j) => j.params),
        ...(ctx.applyExclusions ? [ctx.userId] : []),
        ...extraJoins.flatMap((j) => j.params),
        ...combined.joins.flatMap((j) => j.params),
        ...(sortExpr.joins ?? []).flatMap((j) => j.params),
      ],
      where: combined.where,
      whereParams: combined.params,
    });
    const page = partsOf(combine(clauses));
    const count = clauses.some((c) => c.count !== undefined)
      ? partsOf(combine(countForms(clauses)))
      : page;

    return {
      ...page,
      select,
      order,
      orderParams: sortExpr.params,
      clauseCount: clauses.length,
      count,
    };
  }

  /**
   * The spec's per-user joins on the entity's alias, each bound to the
   * viewer, as the list statement writes them
   */
  protected userJoinFragments(userId: number): SqlFragment[] {
    const x = this.spec.alias;
    return this.spec.userJoins.map((join) => ({
      sql: `LEFT JOIN ${join.table} ${join.alias} ON ${x}.id = ${join.alias}.${join.entityIdCol} AND ${x}.stashInstanceId = ${join.alias}.${join.instanceCol ?? "instanceId"} AND ${join.alias}.userId = ?`,
      params: [userId],
    }));
  }

  /**
   * One sort key's expression with the direction in it, and its joins: the
   * random order with its seed bound (the default seed when none), else the
   * sort map's expression, the default sort's for a key the map lacks
   */
  protected sortExpr(
    field: string,
    direction: SortDirection,
    seed: number | undefined,
    filter: ListFilterOf<K>,
    ctx: QueryContext
  ): SortExpr {
    if (field === "random") {
      const bound = Number.isSafeInteger(seed)
        ? (seed as number)
        : DEFAULT_RANDOM_SEED;
      const random = randomOrder(this.spec.alias, bound);
      return { sql: `${random.sql} ${direction}`, params: random.params };
    }
    const map = this.sortMap(direction, filter, ctx);
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
    const parts = paging === undefined ? built.count : built;
    return `${parts.with}${select}\n${parts.from}\nWHERE ${parts.where}${tail}`;
  }

  private params(built: Built, paging: Paging | undefined): SqlParam[] {
    const parts = paging === undefined ? built.count : built;
    return [
      ...parts.withParams,
      ...(paging === undefined ? [] : built.select.params),
      ...parts.fromParams,
      ...parts.whereParams,
      ...(paging === undefined ? [] : paging.params),
      ...(paging?.page === undefined
        ? []
        : [paging.page.perPage, paging.page.offset]),
    ];
  }
}
