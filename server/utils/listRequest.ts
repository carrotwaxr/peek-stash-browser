/**
 * The one validated parser for list, clip, minimal, carousel, similar and
 * recommended requests (item 38). It reads the shared contract
 * (`shared/types/filters`) and hands the query builders `ParsedListRequest`
 * and its kin (`types/parsedFilters.ts`): refs parsed into pairs at the
 * boundary, every modifier present and valid, the sort whitelisted, paging
 * clamped.
 *
 * Unknown or invalid input answers 400 with one issue per problem, naming
 * its path. Stored carousel rules parse leniently (`parseStoredSceneQuery`):
 * the user cannot fix them by resending, so what the parser ignores is
 * returned as `ignored` for the caller to log.
 */
import {
  CLIP_PARAMS,
  DEFAULT_SORT,
  type DateSpec,
  type EntityKind,
  type EnumSpec,
  FIELDS,
  FILTER_BODY_KEYS,
  type FieldSpec,
  type ListKind,
  MAX_REF_VALUES,
  MINIMAL_IDS_MAX,
  MINIMAL_PER_PAGE_MAX,
  type NumberSpec,
  PER_PAGE_MAX,
  PRESENCE_MODIFIERS,
  type PresenceModifier,
  Q_MAX_LENGTH,
  RANGE_MODIFIERS,
  type RangeModifier,
  type RefSpec,
  SCENE_FIELDS,
  SORTS,
  SORT_DIRECTIONS,
  type SortDirection,
  type SortOf,
  type TextSpec,
} from "@peek/shared-types/filters/index.js";
import { parseEntityRef } from "@peek/shared-types/instanceAwareId.js";
import { z } from "zod";
import { ValidationError } from "../middleware/errorHandler.js";
import type {
  ApiErrorIssue,
  MinimalCountFilter,
  MinimalScope,
} from "../types/api/index.js";
import type {
  EnumCriterion,
  FilterRef,
  MinimalKind,
  MultiEnumCriterion,
  ParsedClipFilter,
  ParsedClipQuery,
  ParsedFields,
  ParsedFilter,
  ParsedListRequest,
  ParsedMinimalRequest,
  ParsedPlaylistItemsQuery,
  ParsedPlaylistsQuery,
  ParsedRecommendedQuery,
  ParsedSceneClipsQuery,
  ParsedSimilarScenesQuery,
  ParsedSort,
  RefCriterion,
  TextCriterion,
} from "../types/parsedFilters.js";
import { shouldLogOnce } from "./logThrottle.js";
import { logger } from "./logger.js";
import { generateDailySeed } from "./seededRandom.js";
import { INSTANCE_ID_PATTERN } from "./stashMediaPath.js";

const PER_PAGE_DEFAULT = 40;
const CLIP_PER_PAGE_DEFAULT = 24;
const MINIMAL_PER_PAGE_DEFAULT = 50;
const RECOMMENDED_PER_PAGE_DEFAULT = 24;
const PLAYLIST_ITEMS_PER_PAGE_DEFAULT = 50;
/** A playlist page's most items */
const PLAYLIST_ITEMS_PER_PAGE_MAX = 100;
/** A random seed is reduced to this, as the list controllers always did */
const SEED_MODULUS = 1e8;
/** Stash ids are integers */
const ID_PATTERN = /^\d{1,20}$/;
const RANDOM_SEED_PATTERN = /^random_(\d{1,15})$/;
const INTEGER_PATTERN = /^\s*[+-]?\d+\s*$/;
/** How often one carousel logs the same ignored path */
const LOG_IGNORED_WINDOW_MS = 60 * 60 * 1000;

/** One piece of a stored rule the lenient parse ignored */
export interface IgnoredInput {
  readonly path: string;
  readonly reason: string;
}

/** A stored carousel query: the scene query, and what the lenient parse ignored */
export type ParsedStoredQuery = ParsedListRequest<"scene"> & {
  readonly ignored: readonly IgnoredInput[];
};

export interface ParseOptions {
  readonly userId: number;
}

export interface StoredQueryOptions {
  readonly userId: number;
  /** Default 1 */
  readonly page?: number;
  /** Default 40, held to 1..PER_PAGE_MAX */
  readonly perPage?: number;
  /** The seed a random sort uses; the daily seed when absent */
  readonly randomSeed?: number;
}

export type CarouselRequestOptions = StoredQueryOptions;

/** A carousel's rules, sort and direction as a create, update or preview request sends them */
export interface CarouselRequestInput {
  /** The scene filter; absent when an update leaves it as it is */
  readonly rules?: unknown;
  readonly sort?: unknown;
  readonly direction?: unknown;
}

/** Warns once an hour per carousel and path about stored rule input the parser ignored */
export function logIgnoredStoredRule(
  carouselId: string,
  ignored: readonly IgnoredInput[]
): void {
  for (const { path, reason } of ignored) {
    if (shouldLogOnce(`${carouselId} ${path}`, LOG_IGNORED_WINDOW_MS)) {
      logger.warn("Stored carousel rule ignored", {
        carouselId,
        path,
        reason,
      });
    }
  }
}

// =============================================================================
// PROBLEMS
// =============================================================================

/** The problems found so far: thrown as one 400, or returned as records for a stored rule */
class Problems {
  private readonly issues: ApiErrorIssue[] = [];

  add(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  addZod(prefix: string, error: z.ZodError): void {
    for (const issue of error.issues) {
      this.add(
        [prefix, ...issue.path.map(String)].filter((p) => p !== "").join("."),
        issue.message
      );
    }
  }

  /** Throws the 400 when any problem was found */
  finish(): void {
    if (this.issues.length === 0) return;
    throw new ValidationError("Invalid request", { issues: this.issues });
  }

  /** The problems as records: only a stored carousel rule, which cannot be resent, ignores them */
  ignored(): IgnoredInput[] {
    return this.issues.map(({ path, message }) => ({ path, reason: message }));
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathOf(prefix: string, key: string): string {
  return prefix === "" ? key : `${prefix}.${key}`;
}

/** The 400 for a request body that is not an object */
function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (isPlainObject(value)) return value;
  throw new ValidationError("Invalid request", {
    issues: [{ path, message: "Expected an object" }],
  });
}

/**
 * Walks an object's keys in the order they arrived: each known key goes to
 * its handler, an unknown key is a problem. Handlers live in a Map, so
 * `constructor` and `__proto__` are simply not members.
 */
function walk(
  input: Record<string, unknown>,
  prefix: string,
  handlers: ReadonlyMap<string, (raw: unknown, path: string) => void>,
  problems: Problems,
  unknownMessage: string
): void {
  for (const [key, raw] of Object.entries(input)) {
    const path = pathOf(prefix, key);
    const handler = handlers.get(key);
    if (handler) handler(raw, path);
    else problems.add(path, unknownMessage);
  }
}

// =============================================================================
// SCALARS
// =============================================================================

/** A number or a numeric string, truncated to an integer; absent when missing or invalid */
function parseInteger(
  raw: unknown,
  path: string,
  problems: Problems
): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === "string" && INTEGER_PATTERN.test(raw)) return Number(raw);
  problems.add(path, "Expected a number");
  return undefined;
}

function clampPage(page: number | undefined): number {
  return Math.max(1, page ?? 1);
}

function clampPerPage(
  perPage: number | undefined,
  fallback: number,
  max: number = PER_PAGE_MAX
): number {
  return Math.min(max, Math.max(1, perPage ?? fallback));
}

/** Trimmed search text; absent when missing, empty or too long */
function parseQ(
  raw: unknown,
  path: string,
  problems: Problems
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    problems.add(path, "Expected text");
    return undefined;
  }
  const q = raw.trim();
  if (q === "") return undefined;
  if (q.length > Q_MAX_LENGTH) {
    problems.add(path, `At most ${Q_MAX_LENGTH} characters`);
    return undefined;
  }
  return q;
}

function parseDirection(
  raw: unknown,
  path: string,
  problems: Problems
): SortDirection | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    const direction = raw.toUpperCase();
    if (SORT_DIRECTIONS.some((d) => d === direction)) {
      return direction as SortDirection;
    }
  }
  problems.add(path, "Expected ASC or DESC");
  return undefined;
}

const SORT_SETS = new Map<string, ReadonlySet<string>>(
  Object.entries(SORTS).map(([kind, sorts]) => [kind, new Set(sorts)])
);

interface SortField<K extends ListKind> {
  readonly field: SortOf<K>;
  readonly seed: number | undefined;
}

/** A member of the list's sort keys, or `random_<n>`; absent when missing or invalid */
function parseSortField<K extends ListKind>(
  kind: K,
  raw: unknown,
  path: string,
  problems: Problems
): SortField<K> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    const seeded = RANDOM_SEED_PATTERN.exec(raw);
    if (seeded?.[1] !== undefined) {
      const field: SortOf<ListKind> = "random";
      return { field, seed: Number(seeded[1]) % SEED_MODULUS };
    }
    if (SORT_SETS.get(kind)?.has(raw)) {
      return { field: raw as SortOf<K>, seed: undefined };
    }
  }
  problems.add(path, "Unknown sort");
  return undefined;
}

/** Whether `raw` is one of the list's sorts or `random_<n>`, as a request's sort is checked */
export function isListSort(kind: ListKind, raw: unknown): boolean {
  return parseSortField(kind, raw, "sort", new Problems()) !== undefined;
}

/** The sort with its defaults filled in: the list's default sort, the daily seed for random */
function resolveSort<K extends ListKind>(
  kind: K,
  field: SortField<K> | undefined,
  direction: SortDirection | undefined,
  userId: number,
  randomSeed?: number
): ParsedSort<K> {
  const fallback = DEFAULT_SORT[kind];
  const resolved: SortOf<K> = field?.field ?? fallback.field;
  const seed =
    resolved === "random"
      ? (field?.seed ?? randomSeed ?? generateDailySeed(userId))
      : undefined;
  return { field: resolved, direction: direction ?? fallback.direction, seed };
}

/**
 * Scene Number is a scene's number in one collection, so the sort needs an
 * including `groups` criterion to name it. Without one the sort is a problem
 * at the sort's path (a 400 in reject mode) and the list keeps its default.
 */
function requireCollectionForSceneIndex(
  field: SortField<"scene"> | undefined,
  criteria: ParsedFieldsResult["criteria"],
  path: string,
  problems: Problems
): SortField<"scene"> | undefined {
  if (field?.field !== "scene_index") return field;
  const groups = criteria.groups as RefCriterion | undefined;
  if (groups !== undefined && groups.modifier !== "EXCLUDES") return field;
  problems.add(path, "Scene Number needs a collection filter");
  return undefined;
}

function parseInstanceId(
  raw: unknown,
  path: string,
  problems: Problems
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && INSTANCE_ID_PATTERN.test(raw)) return raw;
  problems.add(path, "Expected an instance id");
  return undefined;
}

// =============================================================================
// CRITERIA
// =============================================================================

/** A parsed `id` or `id:instanceId`; undefined when it is neither */
export function parseFilterRef(raw: string): FilterRef | undefined {
  const { id, instanceId } = parseEntityRef(raw);
  if (!ID_PATTERN.test(id)) return undefined;
  if (instanceId !== undefined && !INSTANCE_ID_PATTERN.test(instanceId)) {
    return undefined;
  }
  return { id, instanceId };
}

const refValue = z.string().transform((raw, ctx): FilterRef => {
  const ref = parseFilterRef(raw);
  if (ref) return ref;
  ctx.addIssue({ code: "custom", message: "Expected an id or id:instanceId" });
  return z.NEVER;
});

const refList = z
  .array(refValue)
  .max(MAX_REF_VALUES, `At most ${MAX_REF_VALUES} values`);

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true, local: true });
const dateValue = z
  .string()
  .refine(
    (value) =>
      isoDate.safeParse(value).success || isoDateTime.safeParse(value).success,
    "Expected YYYY-MM-DD or an ISO date-time"
  );

const instanceIdValue = z
  .string()
  .regex(INSTANCE_ID_PATTERN, "Expected an instance id");

function isPresence(modifier: string): modifier is PresenceModifier {
  return PRESENCE_MODIFIERS.some((m) => m === modifier);
}

function isRange(modifier: string): modifier is RangeModifier {
  return RANGE_MODIFIERS.some((m) => m === modifier);
}

function refSchema(spec: RefSpec): z.ZodType<RefCriterion> {
  return z
    .strictObject({
      value: refList.min(1, "Required"),
      modifier: z.enum(spec.modifiers).nullish(),
      // Kept on hierarchical fields, ignored elsewhere
      depth: spec.hierarchical
        ? z.number().int().min(-1).nullish()
        : z.unknown().optional(),
    })
    .transform(
      ({ value, modifier, depth }): RefCriterion => ({
        refs: value,
        modifier: modifier ?? spec.defaultModifier,
        depth: spec.hierarchical && typeof depth === "number" ? depth : 0,
      })
    );
}

type RangeCriterion<V> =
  | {
      readonly modifier: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN";
      readonly value: V;
    }
  | { readonly modifier: RangeModifier; readonly value: V; readonly value2: V }
  | { readonly modifier: PresenceModifier };

/** Stash's criterion inputs require a value, so its callers send "" for none */
function blankAsNull(value: unknown): unknown {
  return value === "" ? null : value;
}

/** A number or date criterion: BETWEEN and NOT_BETWEEN need value2, IS_NULL and NOT_NULL no value */
function rangeSchema<V extends number | string>(
  spec: NumberSpec | DateSpec,
  valueSchema: z.ZodType<V>
): z.ZodType<RangeCriterion<V>> {
  return z
    .strictObject({
      modifier: z.enum(spec.modifiers).nullish(),
      value: z.preprocess(blankAsNull, valueSchema.nullish()),
      value2: z.preprocess(blankAsNull, valueSchema.nullish()),
    })
    .transform((c, ctx): RangeCriterion<V> => {
      const modifier = c.modifier ?? spec.defaultModifier;
      if (isPresence(modifier)) return { modifier };
      if (c.value === undefined || c.value === null) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Required" });
        return z.NEVER;
      }
      if (isRange(modifier)) {
        if (c.value2 === undefined || c.value2 === null) {
          ctx.addIssue({
            code: "custom",
            path: ["value2"],
            message: "Required with BETWEEN and NOT_BETWEEN",
          });
          return z.NEVER;
        }
        return { modifier, value: c.value, value2: c.value2 };
      }
      return { modifier, value: c.value };
    });
}

function textSchema(spec: TextSpec): z.ZodType<TextCriterion> {
  return z
    .strictObject({
      modifier: z.enum(spec.modifiers).nullish(),
      value: z.string().nullish(),
    })
    .transform((c, ctx): TextCriterion => {
      const modifier = c.modifier ?? spec.defaultModifier;
      if (isPresence(modifier)) return { modifier };
      const value = c.value?.trim() ?? "";
      if (value === "") {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Required" });
        return z.NEVER;
      }
      if (value.length > spec.maxLength) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: `At most ${spec.maxLength} characters`,
        });
        return z.NEVER;
      }
      return { modifier, value };
    });
}

function enumSchema(
  spec: EnumSpec
): z.ZodType<EnumCriterion<string> | MultiEnumCriterion<string>> {
  const modifier = z.enum(spec.modifiers).nullish();
  if (spec.multi) {
    return z
      .strictObject({
        modifier,
        value: z.array(z.enum(spec.values)).min(1, "Required"),
      })
      .transform(
        (c): MultiEnumCriterion<string> => ({
          modifier: "INCLUDES",
          values: c.value,
        })
      );
  }
  return z
    .strictObject({ modifier, value: z.enum(spec.values) })
    .transform((c, ctx): EnumCriterion<string> => {
      const resolved = c.modifier ?? spec.defaultModifier;
      if (resolved === "INCLUDES") {
        // Declared only on multi-valued enums
        ctx.addIssue({
          code: "custom",
          path: ["modifier"],
          message: "Invalid option",
        });
        return z.NEVER;
      }
      return { modifier: resolved, value: c.value };
    });
}

function buildSchema(spec: FieldSpec): z.ZodType {
  switch (spec.kind) {
    case "ref":
      return refSchema(spec);
    case "number":
      return rangeSchema(spec, z.number());
    case "date":
      return rangeSchema(spec, dateValue);
    case "text":
      return textSchema(spec);
    case "enum":
      return enumSchema(spec);
    case "boolean":
      return z.boolean();
    case "instance":
      return instanceIdValue;
  }
}

/** Field specs are module constants, so each builds its schema once */
const schemaCache = new WeakMap<FieldSpec, z.ZodType>();

function schemaFor(spec: FieldSpec): z.ZodType {
  let schema = schemaCache.get(spec);
  if (!schema) {
    schema = buildSchema(spec);
    schemaCache.set(spec, schema);
  }
  return schema;
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * A criterion that carries nothing (an unset panel option): no value, and no
 * presence modifier, which needs none. Omitted without a record.
 */
function isEmptyCriterion(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (!isPlainObject(raw)) return false;
  if (typeof raw.modifier === "string" && isPresence(raw.modifier)) {
    return false;
  }
  return isEmptyValue(raw.value) && isEmptyValue(raw.value2);
}

// =============================================================================
// FIELD TABLES
// =============================================================================

interface FieldEntry {
  readonly name: string;
  readonly spec: FieldSpec;
}

interface FieldTable {
  /** By request key: fields carried as `<entity>_filter.<key>` */
  readonly direct: ReadonlyMap<string, FieldEntry>;
  /** By parent key, then child key: fields carried as `<entity>_filter.<parent>.<child>` */
  readonly nested: ReadonlyMap<string, ReadonlyMap<string, FieldEntry>>;
}

const tableCache = new WeakMap<object, FieldTable>();

function tableOf(fields: Readonly<Record<string, FieldSpec>>): FieldTable {
  const cached = tableCache.get(fields);
  if (cached) return cached;
  const direct = new Map<string, FieldEntry>();
  const nested = new Map<string, Map<string, FieldEntry>>();
  for (const [name, spec] of Object.entries(fields)) {
    const entry: FieldEntry = { name, spec };
    if (spec.kind === "ref" && spec.path) {
      const [parent, child] = spec.path;
      let children = nested.get(parent);
      if (!children) {
        children = new Map();
        nested.set(parent, children);
      }
      children.set(child, entry);
    } else {
      direct.set(name, entry);
    }
  }
  const table: FieldTable = { direct, nested };
  tableCache.set(fields, table);
  return table;
}

interface ParsedFieldsResult {
  readonly criteria: Record<string, unknown>;
  readonly specificInstanceId: string | undefined;
}

/**
 * Parses an `<entity>_filter` object against its field table: one criterion
 * per known field, the instance field lifted out, unknown keys and failing
 * criteria as problems at their path.
 */
function parseFields(
  fields: Readonly<Record<string, FieldSpec>>,
  input: Record<string, unknown>,
  prefix: string,
  problems: Problems
): ParsedFieldsResult {
  const table = tableOf(fields);
  const criteria: Record<string, unknown> = {};
  let specificInstanceId: string | undefined;

  const parseOne = (entry: FieldEntry, raw: unknown, path: string): void => {
    if (isEmptyCriterion(raw)) return;
    const result = schemaFor(entry.spec).safeParse(raw);
    if (!result.success) {
      problems.addZod(path, result.error);
      return;
    }
    if (entry.spec.kind === "instance") {
      specificInstanceId = String(result.data);
    } else {
      criteria[entry.name] = result.data;
    }
  };

  for (const [key, raw] of Object.entries(input)) {
    const path = pathOf(prefix, key);
    const children = table.nested.get(key);
    if (children) {
      if (raw === undefined || raw === null) continue;
      if (!isPlainObject(raw)) {
        problems.add(path, "Expected an object");
        continue;
      }
      for (const [childKey, childRaw] of Object.entries(raw)) {
        const entry = children.get(childKey);
        const childPath = pathOf(path, childKey);
        if (entry) parseOne(entry, childRaw, childPath);
        else problems.add(childPath, "Unknown filter field");
      }
      continue;
    }
    const entry = table.direct.get(key);
    if (entry) parseOne(entry, raw, path);
    else problems.add(path, "Unknown filter field");
  }

  return { criteria, specificInstanceId };
}

/** Parses a top-level `ids` list; empty when missing, empty or invalid */
function parseIdList(
  raw: unknown,
  path: string,
  problems: Problems
): readonly FilterRef[] {
  if (raw === undefined || raw === null) return [];
  const result = refList.safeParse(raw);
  if (!result.success) {
    problems.addZod(path, result.error);
    return [];
  }
  return result.data;
}

/** Top-level ids join the filter's INCLUDES ids criterion, or become one */
function mergeIds(
  criteria: Record<string, unknown>,
  ids: readonly FilterRef[],
  filterKey: string,
  problems: Problems
): void {
  if (ids.length === 0) return;
  const existing = criteria.ids as RefCriterion | undefined;
  if (existing === undefined) {
    criteria.ids = { refs: ids, modifier: "INCLUDES", depth: 0 };
    return;
  }
  if (existing.modifier !== "INCLUDES") {
    problems.add("ids", `Conflicts with ${filterKey}.ids`);
    return;
  }
  const refs = [...existing.refs, ...ids];
  if (refs.length > MAX_REF_VALUES) {
    problems.add(
      "ids",
      `At most ${MAX_REF_VALUES} values with ${filterKey}.ids`
    );
    return;
  }
  criteria.ids = { ...existing, refs };
}

// =============================================================================
// LIST REQUESTS
// =============================================================================

interface PageState {
  page: number | undefined;
  perPage: number | undefined;
  q: string | undefined;
  direction: SortDirection | undefined;
  /** false: the page alone, no count */
  count: boolean | undefined;
}

/** `filter.count` as sent: a boolean; absent when missing or invalid */
function parseCountFlag(
  raw: unknown,
  path: string,
  problems: Problems
): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "boolean") return raw;
  problems.add(path, "Expected true or false");
  return undefined;
}

/** `POST /api/library/<entities>`: paging, sort, search, top-level ids and the entity's filter */
export function parseListRequest<E extends EntityKind>(
  entity: E,
  body: unknown,
  options: ParseOptions
): ParsedListRequest<E> {
  const input = requireObject(body, "body");
  const problems = new Problems();
  const filterKey: string = FILTER_BODY_KEYS[entity];

  const state: PageState = {
    page: undefined,
    perPage: undefined,
    q: undefined,
    direction: undefined,
    count: undefined,
  };
  let sortField: SortField<E> | undefined;
  let fields: ParsedFieldsResult = {
    criteria: {},
    specificInstanceId: undefined,
  };
  let ids: readonly FilterRef[] = [];

  const pageHandlers = new Map<string, (raw: unknown, path: string) => void>([
    ["page", (raw, path) => (state.page = parseInteger(raw, path, problems))],
    [
      "per_page",
      (raw, path) => (state.perPage = parseInteger(raw, path, problems)),
    ],
    [
      "sort",
      (raw, path) => (sortField = parseSortField(entity, raw, path, problems)),
    ],
    [
      "direction",
      (raw, path) => (state.direction = parseDirection(raw, path, problems)),
    ],
    ["q", (raw, path) => (state.q = parseQ(raw, path, problems))],
    [
      "count",
      (raw, path) => (state.count = parseCountFlag(raw, path, problems)),
    ],
  ]);

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    [
      "filter",
      (raw, path) => {
        if (raw === undefined || raw === null) return;
        if (!isPlainObject(raw)) {
          problems.add(path, "Expected an object");
          return;
        }
        walk(raw, path, pageHandlers, problems, "Unknown request field");
      },
    ],
    ["ids", (raw, path) => (ids = parseIdList(raw, path, problems))],
    [
      filterKey,
      (raw, path) => {
        if (raw === undefined || raw === null) return;
        if (!isPlainObject(raw)) {
          problems.add(path, "Expected an object");
          return;
        }
        fields = parseFields(FIELDS[entity], raw, path, problems);
      },
    ],
  ]);

  walk(input, "", handlers, problems, "Unknown request field");
  mergeIds(fields.criteria, ids, filterKey, problems);
  if (entity === "scene") {
    sortField = requireCollectionForSceneIndex(
      sortField as SortField<"scene"> | undefined,
      fields.criteria,
      "filter.sort",
      problems
    ) as typeof sortField;
  }

  problems.finish();

  return {
    page: clampPage(state.page),
    perPage: clampPerPage(state.perPage, PER_PAGE_DEFAULT),
    q: state.q,
    sort: resolveSort(entity, sortField, state.direction, options.userId),
    // The one boundary cast: each criterion was validated by its field's schema
    filter: fields.criteria as ParsedFilter<E>,
    specificInstanceId: fields.specificInstanceId,
    ...(state.count === undefined ? {} : { count: state.count }),
  };
}

/**
 * The one entity a by-id lookup names (a detail page's request): the ref of
 * an INCLUDES `ids` criterion with exactly one value. A bare ref can match
 * that id on several instances, which the list controllers answer with the
 * ambiguous-lookup 400 unless `instance_id` names one.
 */
export function singleIdRef(
  ids: RefCriterion | undefined
): FilterRef | undefined {
  if (ids?.modifier !== "INCLUDES" || ids.refs.length !== 1) return undefined;
  return ids.refs[0];
}

// =============================================================================
// CAROUSELS
// =============================================================================

/** A carousel's rules, sort and direction, each read at its own path */
interface CarouselParts {
  readonly fields: ParsedFieldsResult;
  readonly sortField: SortField<"scene"> | undefined;
  readonly direction: SortDirection | undefined;
}

/** Rules that are undefined were not sent: no criteria */
function parseCarouselParts(
  rules: Record<string, unknown> | undefined,
  sort: unknown,
  direction: unknown,
  problems: Problems
): CarouselParts {
  const fields = rules
    ? parseFields(SCENE_FIELDS, rules, "rules", problems)
    : { criteria: {}, specificInstanceId: undefined };
  return {
    fields,
    sortField: requireCollectionForSceneIndex(
      parseSortField("scene", sort, "sort", problems),
      fields.criteria,
      "sort",
      problems
    ),
    direction: parseDirection(direction, "direction", problems),
  };
}

/** The carousel's parts as the scene query the builder runs */
function carouselQuery(
  parts: CarouselParts,
  options: StoredQueryOptions
): ParsedListRequest<"scene"> {
  return {
    page: clampPage(options.page),
    perPage: clampPerPage(options.perPage, PER_PAGE_DEFAULT),
    q: undefined,
    sort: resolveSort(
      "scene",
      parts.sortField,
      parts.direction,
      options.userId,
      options.randomSeed
    ),
    // The boundary cast: each criterion was validated by its field's schema
    filter: parts.fields.criteria as ParsedFilter<"scene">,
    specificInstanceId: parts.fields.specificInstanceId,
  };
}

/**
 * A carousel's stored rules, sort and direction: the scene filter parsed
 * leniently, with the page the caller wants. What it ignored comes back as
 * `ignored`, for the caller to log; a stored rule cannot be resent.
 */
export function parseStoredSceneQuery(
  rules: unknown,
  sort: string,
  direction: string,
  options: StoredQueryOptions
): ParsedStoredQuery {
  const problems = new Problems();
  const object = isPlainObject(rules) ? rules : undefined;
  if (!object) problems.add("rules", "Expected an object");
  const parts = parseCarouselParts(object, sort, direction, problems);
  return { ...carouselQuery(parts, options), ignored: problems.ignored() };
}

/**
 * `POST /api/carousels`, `PUT /api/carousels/:id` and `POST
 * /api/carousels/preview`: the rules, sort and direction checked against
 * the scene contract as a scene list request is, with the carousel's page.
 * A part not sent stays out (no criteria, the scene default sort). Rules
 * that are not an object are a 400, as on the scene list.
 */
export function parseCarouselRequest(
  input: CarouselRequestInput,
  options: CarouselRequestOptions
): ParsedListRequest<"scene"> {
  const rules =
    input.rules === undefined ? undefined : requireObject(input.rules, "rules");
  const problems = new Problems();
  const parts = parseCarouselParts(
    rules,
    input.sort,
    input.direction,
    problems
  );
  problems.finish();
  return carouselQuery(parts, options);
}

// =============================================================================
// CLIPS
// =============================================================================

/** The `<param>Modifier` companions of the ref parameters with a choice of modifier */
const CLIP_MODIFIER_KEYS = new Map<string, RefSpec>(
  Object.entries(CLIP_PARAMS).flatMap(([key, spec]) =>
    spec.kind === "ref" && spec.modifiers.length > 1
      ? [[`${key}Modifier`, spec]]
      : []
  )
);

/** One query value: a repeated parameter arrives as an array and is invalid */
function queryString(
  raw: unknown,
  path: string,
  problems: Problems
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") return raw;
  problems.add(path, "Expected one value");
  return undefined;
}

/** "true" or "false" as a query value; absent when missing or invalid */
function parseBooleanText(
  raw: unknown,
  path: string,
  problems: Problems
): boolean | undefined {
  const text = queryString(raw, path, problems);
  if (text === undefined) return undefined;
  if (text === "true" || text === "false") return text === "true";
  problems.add(path, "Expected true or false");
  return undefined;
}

/** A comma-separated ref list with its modifier from `<key>Modifier`; absent when empty or invalid */
function parseClipRefs(
  key: string,
  spec: RefSpec,
  raw: unknown,
  query: Record<string, unknown>,
  problems: Problems
): RefCriterion | undefined {
  const text = queryString(raw, key, problems);
  if (text === undefined) return undefined;
  const values = text
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  if (values.length === 0) return undefined;

  let modifier = spec.defaultModifier;
  if (spec.modifiers.length > 1) {
    const modifierKey = `${key}Modifier`;
    const rawModifier = query[modifierKey];
    if (rawModifier !== undefined && rawModifier !== null) {
      const chosen = spec.modifiers.find((m) => m === rawModifier);
      if (chosen === undefined) {
        // An invalid modifier drops the whole criterion
        problems.add(modifierKey, "Invalid modifier");
        return undefined;
      }
      modifier = chosen;
    }
  }

  const result = refList.safeParse(values);
  if (!result.success) {
    problems.addZod(key, result.error);
    return undefined;
  }
  return { refs: result.data, modifier, depth: 0 };
}

/** `GET /api/clips`: query strings coerced, refs as comma lists, every clip when `isGenerated` is absent */
export function parseClipQuery(
  query: unknown,
  options: ParseOptions
): ParsedClipQuery {
  const input = requireObject(query, "query");
  const problems = new Problems();

  const state: PageState = {
    page: undefined,
    perPage: undefined,
    q: undefined,
    direction: undefined,
    count: undefined,
  };
  let sortField: SortField<"clip"> | undefined;
  let specificInstanceId: string | undefined;
  let isGenerated: boolean | undefined;
  const criteria: Record<string, RefCriterion> = {};

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    ["page", (raw, path) => (state.page = parseInteger(raw, path, problems))],
    [
      "perPage",
      (raw, path) => (state.perPage = parseInteger(raw, path, problems)),
    ],
    [
      "sortBy",
      (raw, path) => (sortField = parseSortField("clip", raw, path, problems)),
    ],
    [
      "sortDir",
      (raw, path) => (state.direction = parseDirection(raw, path, problems)),
    ],
    ["q", (raw, path) => (state.q = parseQ(raw, path, problems))],
    [
      "count",
      (raw, path) => (state.count = parseBooleanText(raw, path, problems)),
    ],
  ]);
  for (const [key, spec] of Object.entries(CLIP_PARAMS)) {
    switch (spec.kind) {
      case "instance":
        handlers.set(key, (raw, path) => {
          specificInstanceId = parseInstanceId(raw, path, problems);
        });
        break;
      case "boolean":
        handlers.set(key, (raw, path) => {
          isGenerated = parseBooleanText(raw, path, problems) ?? isGenerated;
        });
        break;
      case "ref":
        handlers.set(key, (raw) => {
          const criterion = parseClipRefs(key, spec, raw, input, problems);
          if (criterion) criteria[key] = criterion;
        });
        break;
    }
  }
  for (const modifierKey of CLIP_MODIFIER_KEYS.keys()) {
    // Read with its parameter
    handlers.set(modifierKey, () => undefined);
  }

  walk(input, "", handlers, problems, "Unknown query parameter");

  const filter: ParsedClipFilter = {
    // The boundary cast: each criterion was validated by its parameter's spec
    ...(criteria as ParsedFields<typeof CLIP_PARAMS>),
    ...(isGenerated === undefined ? {} : { isGenerated }),
  };
  problems.finish();

  return {
    page: clampPage(state.page),
    perPage: clampPerPage(state.perPage, CLIP_PER_PAGE_DEFAULT),
    q: state.q,
    sort: resolveSort("clip", sortField, state.direction, options.userId),
    filter,
    specificInstanceId,
    ...(state.count === undefined ? {} : { count: state.count }),
  };
}

/** A path parameter holding a Stash id: a 400 otherwise */
export function parseStashId(raw: unknown, path: string): string {
  if (typeof raw === "string" && ID_PATTERN.test(raw)) return raw;
  throw new ValidationError("Invalid request", {
    issues: [{ path, message: "Expected an id" }],
  });
}

/** `GET /api/scenes/:id/clips`: the scene on its instance (required), and whether clips without a preview come too */
export function parseSceneClipsRequest(
  sceneId: unknown,
  query: unknown,
  _options: ParseOptions
): ParsedSceneClipsQuery {
  const id = parseStashId(sceneId, "id");
  const input = requireObject(query, "query");
  const problems = new Problems();
  let includeUngenerated: boolean | undefined;
  let instanceId: string | undefined;

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    [
      "includeUngenerated",
      (raw, path) => {
        includeUngenerated = parseBooleanText(raw, path, problems);
      },
    ],
    [
      "instanceId",
      (raw, path) => {
        instanceId = parseInstanceId(raw, path, problems);
      },
    ],
  ]);
  walk(input, "", handlers, problems, "Unknown query parameter");

  if (!("instanceId" in input)) problems.add("instanceId", "Required");

  problems.finish();

  return {
    sceneId: id,
    includeUngenerated: includeUngenerated ?? false,
    // finish() threw when the parameter was absent or invalid
    instanceId: instanceId ?? "",
  };
}

// =============================================================================
// SIMILAR AND RECOMMENDED SCENES
// =============================================================================

/** `GET /api/library/scenes/:id/similar`: the seed scene, its instance and the page */
export function parseSimilarScenesRequest(
  sceneId: unknown,
  query: unknown,
  _options: ParseOptions
): ParsedSimilarScenesQuery {
  const id = parseStashId(sceneId, "id");
  const input = requireObject(query, "query");
  const problems = new Problems();
  let page: number | undefined;
  let instanceId: string | undefined;

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    ["page", (raw, path) => (page = parseInteger(raw, path, problems))],
    [
      "instanceId",
      (raw, path) => {
        instanceId = parseInstanceId(raw, path, problems);
      },
    ],
  ]);
  walk(input, "", handlers, problems, "Unknown query parameter");

  if (!("instanceId" in input)) problems.add("instanceId", "Required");

  problems.finish();

  return {
    sceneId: id,
    page: clampPage(page),
    // finish() threw when the parameter was absent or invalid
    instanceId: instanceId ?? "",
  };
}

/** `GET /api/library/scenes/recommended`: the page and page size */
export function parseRecommendedRequest(
  query: unknown,
  _options: ParseOptions
): ParsedRecommendedQuery {
  const input = requireObject(query, "query");
  const problems = new Problems();
  let page: number | undefined;
  let perPage: number | undefined;

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    ["page", (raw, path) => (page = parseInteger(raw, path, problems))],
    ["per_page", (raw, path) => (perPage = parseInteger(raw, path, problems))],
  ]);
  walk(input, "", handlers, problems, "Unknown query parameter");

  problems.finish();

  return {
    page: clampPage(page),
    perPage: clampPerPage(perPage, RECOMMENDED_PER_PAGE_DEFAULT),
  };
}

// =============================================================================
// PLAYLIST ITEMS
// =============================================================================

/**
 * `GET /api/playlists/:id`: a page of the items the viewer can see, or
 * every item when neither `page` nor `per_page` is sent (the playlist page
 * reads them all until it pages)
 */
export function parsePlaylistItemsRequest(
  query: unknown,
  _options: ParseOptions
): ParsedPlaylistItemsQuery {
  const input = requireObject(query, "query");
  const problems = new Problems();
  let page: number | undefined;
  let perPage: number | undefined;

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    ["page", (raw, path) => (page = parseInteger(raw, path, problems))],
    ["per_page", (raw, path) => (perPage = parseInteger(raw, path, problems))],
  ]);
  walk(input, "", handlers, problems, "Unknown query parameter");
  problems.finish();

  return {
    paging:
      page === undefined && perPage === undefined
        ? undefined
        : {
            page: clampPage(page),
            perPage: clampPerPage(
              perPage,
              PLAYLIST_ITEMS_PER_PAGE_DEFAULT,
              PLAYLIST_ITEMS_PER_PAGE_MAX
            ),
          },
  };
}

/**
 * `GET /api/playlists` and `GET /api/playlists/shared`: `containsScene` is
 * a scene as `"id:instanceId"`; a bare id is refused, since the answer is
 * about one scene on one server
 */
export function parsePlaylistsQuery(
  query: unknown,
  _options: ParseOptions
): ParsedPlaylistsQuery {
  const input = requireObject(query, "query");
  const problems = new Problems();
  let containsScene: ParsedPlaylistsQuery["containsScene"];

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    [
      "containsScene",
      (raw, path) => {
        const ref = typeof raw === "string" ? parseFilterRef(raw) : undefined;
        if (ref?.instanceId === undefined) {
          problems.add(path, "Expected id:instanceId");
          return;
        }
        containsScene = { id: ref.id, instanceId: ref.instanceId };
      },
    ],
  ]);
  walk(input, "", handlers, problems, "Unknown query parameter");
  problems.finish();

  return { containsScene };
}

// =============================================================================
// MINIMAL
// =============================================================================

const COUNT_FILTER_KEYS: readonly (keyof MinimalCountFilter)[] = [
  "min_scene_count",
  "min_gallery_count",
  "min_image_count",
  "min_performer_count",
  "min_group_count",
];

const minimalIdList = z
  .array(refValue)
  .max(MINIMAL_IDS_MAX, `At most ${MINIMAL_IDS_MAX} values`);

/**
 * `POST /api/library/<entities>/minimal` (the entity pickers): search text,
 * a page size, ids, count minimums and a scope; always name order, one page.
 * `ids` names what the request looks up and `scope` the instances it looks
 * in, so a bad one is a 400. Whether the user may send the
 * scope is the query's check (findMinimalEntities: admins only).
 */
export function parseMinimalRequest<E extends MinimalKind>(
  entity: E,
  body: unknown,
  _options: ParseOptions
): ParsedMinimalRequest<E> {
  const input = requireObject(body, "body");
  const problems = new Problems();

  let q: string | undefined;
  let perPage: number | undefined;
  let ids: readonly FilterRef[] | undefined;
  let countFilter: MinimalCountFilter | undefined;
  let scope: MinimalScope | undefined;

  const pageHandlers = new Map<string, (raw: unknown, path: string) => void>([
    ["per_page", (raw, path) => (perPage = parseInteger(raw, path, problems))],
    ["q", (raw, path) => (q = parseQ(raw, path, problems))],
  ]);

  const countHandlers = new Map<string, (raw: unknown, path: string) => void>(
    COUNT_FILTER_KEYS.map((key) => [
      key,
      (raw, path) => {
        if (raw === undefined || raw === null) return;
        if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
          countFilter = { ...countFilter, [key]: raw };
        } else {
          problems.add(path, "Expected a count");
        }
      },
    ])
  );

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    [
      "filter",
      (raw, path) => {
        if (raw === undefined || raw === null) return;
        if (!isPlainObject(raw)) {
          problems.add(path, "Expected an object");
          return;
        }
        walk(raw, path, pageHandlers, problems, "Unknown request field");
      },
    ],
    [
      "ids",
      (raw, path) => {
        if (raw === undefined || raw === null) return;
        const result = minimalIdList.safeParse(raw);
        if (!result.success) {
          problems.addZod(path, result.error);
          return;
        }
        if (result.data.length > 0) ids = result.data;
      },
    ],
    [
      "count_filter",
      (raw, path) => {
        if (raw === undefined || raw === null) return;
        if (!isPlainObject(raw)) {
          problems.add(path, "Expected an object");
          return;
        }
        walk(raw, path, countHandlers, problems, "Unknown count filter");
      },
    ],
    [
      "scope",
      (raw, path) => {
        if (raw === undefined || raw === null) return;
        if (raw === "allEnabled") {
          scope = raw;
        } else {
          problems.add(path, 'Expected "allEnabled"');
        }
      },
    ],
  ]);

  walk(input, "", handlers, problems, "Unknown request field");

  problems.finish();

  return {
    entity,
    q,
    perPage: clampPerPage(
      perPage,
      MINIMAL_PER_PAGE_DEFAULT,
      MINIMAL_PER_PAGE_MAX
    ),
    ids,
    countFilter,
    scope,
  };
}
