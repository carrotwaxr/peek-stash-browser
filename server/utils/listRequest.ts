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
  DEFAULT_PLAYLIST_ITEM_SORT,
  DEFAULT_SORT,
  type DateSpec,
  type EnumSpec,
  FILTER_BODY_KEYS,
  type FieldSpec,
  LIST_FIELDS,
  type ListKind,
  MAX_REF_VALUES,
  MINIMAL_IDS_MAX,
  MINIMAL_PER_PAGE_MAX,
  type NumberSpec,
  PER_PAGE_MAX,
  PLAYLIST_ITEM_SORTS,
  PRESENCE_MODIFIERS,
  type PlaylistItemSort,
  type PlaylistSpec,
  type PresenceModifier,
  Q_MAX_LENGTH,
  RANGE_MODIFIERS,
  REF_MODIFIERS,
  type RangeModifier,
  type RefModifier,
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
  ClipListRequest,
  EnumCriterion,
  FilterRef,
  MinimalKind,
  MultiEnumFieldCriterion,
  MultiEnumModifier,
  ParsedClipFilter,
  ParsedFilter,
  ParsedListRequest,
  ParsedMinimalRequest,
  ParsedPlaylistItemSort,
  ParsedPlaylistItemsQuery,
  ParsedPlaylistsQuery,
  ParsedRecommendedQuery,
  ParsedSceneClipsQuery,
  ParsedSimilarScenesQuery,
  ParsedSort,
  PlaylistCriterion,
  RefCriterion,
  RefFieldCriterion,
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
  // An including criterion names the collection; EXCLUDES, "has none" and
  // "has any" name none
  const groups = criteria.groups as RefFieldCriterion | undefined;
  if (
    (groups?.modifier === "INCLUDES" || groups?.modifier === "INCLUDES_ALL") &&
    groups.refs.length > 0
  ) {
    return field;
  }
  problems.add(path, "Scene Number needs a collection filter");
  return undefined;
}

/**
 * Playlist order is a scene's position in one playlist, so the sort needs a
 * `playlists` criterion including exactly one. Without one the sort is a
 * problem at the sort's path (a 400 in reject mode) and the list keeps its
 * default.
 */
function requirePlaylistForPosition(
  field: SortField<"scene"> | undefined,
  criteria: ParsedFieldsResult["criteria"],
  path: string,
  problems: Problems
): SortField<"scene"> | undefined {
  if (field?.field !== "playlist_position") return field;
  const playlists = criteria.playlists as PlaylistCriterion | undefined;
  if (
    (playlists?.modifier === "INCLUDES" ||
      playlists?.modifier === "INCLUDES_ALL") &&
    playlists.ids.length === 1
  ) {
    return field;
  }
  problems.add(path, "Playlist order needs one playlist");
  return undefined;
}

/**
 * Sub-collection order is a collection's index in one parent collection, so
 * the sort needs an including `containing_groups` criterion to name it.
 * Without one the sort is a problem at the sort's path (a 400 in reject
 * mode) and the list keeps its default.
 */
function requireParentForSubGroupOrder(
  field: SortField<"group"> | undefined,
  criteria: ParsedFieldsResult["criteria"],
  path: string,
  problems: Problems
): SortField<"group"> | undefined {
  if (field?.field !== "sub_group_order") return field;
  const parents = criteria.containing_groups as RefFieldCriterion | undefined;
  if (
    (parents?.modifier === "INCLUDES" ||
      parents?.modifier === "INCLUDES_ALL") &&
    parents.refs.length > 0
  ) {
    return field;
  }
  problems.add(path, "Sub-collection order needs a parent collection filter");
  return undefined;
}

/** A scene sort that reads a criterion (Scene Number, Playlist order), checked against it */
function requireSortContext(
  field: SortField<"scene"> | undefined,
  criteria: ParsedFieldsResult["criteria"],
  path: string,
  problems: Problems
): SortField<"scene"> | undefined {
  return requirePlaylistForPosition(
    requireCollectionForSceneIndex(field, criteria, path, problems),
    criteria,
    path,
    problems
  );
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

/**
 * A ref criterion. IS_NULL and NOT_NULL (where the field offers them) need
 * no value and ignore one. `excludes` (where the field is excludable) stay
 * beside the values on the one criterion, which the base builder splits; an
 * EXCLUDES modifier takes them into its own list. Otherwise value or
 * excludes must name an id, and together at most MAX_REF_VALUES.
 */
function refSchema(spec: RefSpec): z.ZodType<RefFieldCriterion> {
  return z
    .strictObject({
      value: refList.nullish(),
      modifier: z.enum(spec.modifiers).nullish(),
      // Kept on hierarchical fields, ignored elsewhere
      depth: spec.hierarchical
        ? z.number().int().min(-1).nullish()
        : z.unknown().optional(),
      excludes: spec.excludable
        ? refList.nullish()
        : z.never("Not taken by this field").optional(),
    })
    .transform((c, ctx): RefFieldCriterion => {
      const modifier = c.modifier ?? spec.defaultModifier;
      const depth =
        spec.hierarchical && typeof c.depth === "number" ? c.depth : 0;
      const value = c.value ?? [];
      const excludes = c.excludes ?? [];
      const withExcludes = excludes.length > 0 ? { excludes } : {};
      if (isPresence(modifier)) {
        return { refs: [], modifier, depth, ...withExcludes };
      }
      if (value.length === 0 && excludes.length === 0) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Required" });
        return z.NEVER;
      }
      if (value.length + excludes.length > MAX_REF_VALUES) {
        ctx.addIssue({
          code: "custom",
          path: ["excludes"],
          message: `At most ${MAX_REF_VALUES} values with value`,
        });
        return z.NEVER;
      }
      if (modifier === "EXCLUDES") {
        return { refs: [...value, ...excludes], modifier, depth };
      }
      return { refs: value, modifier, depth, ...withExcludes };
    });
}

/**
 * Peek playlist ids: positive integers, at most the field's maxValues,
 * duplicates dropped. Takes no presence check.
 */
function playlistSchema(spec: PlaylistSpec): z.ZodType<PlaylistCriterion> {
  return z
    .strictObject({
      value: z
        .array(z.number().int().positive())
        .max(spec.maxValues, `At most ${spec.maxValues} values`)
        .nullish(),
      modifier: z.enum(spec.modifiers).nullish(),
    })
    .transform((c, ctx): PlaylistCriterion => {
      const ids = [...new Set(c.value ?? [])];
      if (ids.length === 0) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Required" });
        return z.NEVER;
      }
      return { ids, modifier: c.modifier ?? spec.defaultModifier };
    });
}

type RangeCriterion<V> =
  | {
      readonly modifier: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN";
      readonly value: V;
    }
  | { readonly modifier: RangeModifier; readonly value: V; readonly value2: V }
  | {
      readonly modifier: "BETWEEN";
      readonly value: V | undefined;
      readonly value2: V | undefined;
    }
  | { readonly modifier: PresenceModifier };

/** Stash's criterion inputs require a value, so its callers send "" for none */
function blankAsNull(value: unknown): unknown {
  return value === "" ? null : value;
}

/**
 * A number or date criterion. IS_NULL and NOT_NULL need no value;
 * NOT_BETWEEN needs value and value2; BETWEEN needs either side (value
 * alone is at least it, value2 alone at most it; a date's side includes its
 * own day).
 */
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
      const value = c.value ?? undefined;
      const value2 = c.value2 ?? undefined;
      if (modifier === "BETWEEN") {
        if (value === undefined && value2 === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["value"],
            message: "Required: value, value2 or both with BETWEEN",
          });
          return z.NEVER;
        }
        return { modifier, value, value2 };
      }
      if (value === undefined) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Required" });
        return z.NEVER;
      }
      if (isRange(modifier)) {
        if (value2 === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["value2"],
            message: "Required with NOT_BETWEEN",
          });
          return z.NEVER;
        }
        return { modifier, value, value2 };
      }
      return { modifier, value };
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

/**
 * What a multi-valued enum read from a request sent while its field took one
 * value (beta.7's Gender): EQUALS is INCLUDES, and NOT_EQUALS EXCLUDES where
 * the field offers it
 */
function legacyEnumModifiers(spec: EnumSpec): Map<string, MultiEnumModifier> {
  const offered: readonly string[] = spec.modifiers;
  const legacy = new Map<string, MultiEnumModifier>();
  if (offered.includes("INCLUDES")) legacy.set("EQUALS", "INCLUDES");
  if (offered.includes("EXCLUDES")) legacy.set("NOT_EQUALS", "EXCLUDES");
  return legacy;
}

/**
 * An enum criterion. A multi-valued one matches any of its values or, where
 * the field offers EXCLUDES, none of them; with IS_NULL or NOT_NULL (where
 * the field offers them) it needs no value and ignores one. It also reads a
 * lone value as a list, and EQUALS and NOT_EQUALS as `legacyEnumModifiers`
 * says.
 */
function enumSchema(
  spec: EnumSpec
): z.ZodType<
  EnumCriterion<string> | MultiEnumFieldCriterion<string, MultiEnumModifier>
> {
  if (spec.multi) {
    const legacy = legacyEnumModifiers(spec);
    const value = z.enum(spec.values);
    return z
      .strictObject({
        modifier: z.enum([...spec.modifiers, ...legacy.keys()]).nullish(),
        value: z.union([value, z.array(value)]).nullish(),
      })
      .transform(
        (c, ctx): MultiEnumFieldCriterion<string, MultiEnumModifier> => {
          const resolved = c.modifier ?? spec.defaultModifier;
          if (isPresence(resolved)) return { modifier: resolved };
          const values =
            c.value === null || c.value === undefined
              ? []
              : typeof c.value === "string"
                ? [c.value]
                : c.value;
          if (values.length === 0) {
            ctx.addIssue({
              code: "custom",
              path: ["value"],
              message: "Required",
            });
            return z.NEVER;
          }
          const modifier =
            legacy.get(resolved) ??
            (resolved === "EXCLUDES" ? "EXCLUDES" : "INCLUDES");
          return { modifier, values };
        }
      );
  }
  return z
    .strictObject({
      modifier: z.enum(spec.modifiers).nullish(),
      value: z.enum(spec.values),
    })
    .transform((c, ctx): EnumCriterion<string> => {
      const resolved = c.modifier ?? spec.defaultModifier;
      if (
        resolved === "INCLUDES" ||
        resolved === "EXCLUDES" ||
        isPresence(resolved)
      ) {
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
    case "playlist":
      return playlistSchema(spec);
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
 * A criterion that carries nothing (an unset panel option): no value, no
 * excludes, and no presence modifier, which needs none. Omitted without a
 * record.
 */
function isEmptyCriterion(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (!isPlainObject(raw)) return false;
  if (typeof raw.modifier === "string" && isPresence(raw.modifier)) {
    return false;
  }
  return (
    isEmptyValue(raw.value) &&
    isEmptyValue(raw.value2) &&
    isEmptyValue(raw.excludes)
  );
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

/**
 * `POST /api/library/<entities>` and `POST /api/library/clips`: paging,
 * sort, search, top-level ids (not for clips) and the list's filter
 */
export function parseListRequest<E extends ListKind>(
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
    // Clips take no top-level ids: their filter has no `ids` field
    ...(entity === "clip"
      ? []
      : [
          [
            "ids",
            (raw: unknown, path: string) =>
              (ids = parseIdList(raw, path, problems)),
          ] as const,
        ]),
    [
      filterKey,
      (raw, path) => {
        if (raw === undefined || raw === null) return;
        if (!isPlainObject(raw)) {
          problems.add(path, "Expected an object");
          return;
        }
        fields = parseFields(LIST_FIELDS[entity], raw, path, problems);
      },
    ],
  ]);

  walk(input, "", handlers, problems, "Unknown request field");
  mergeIds(fields.criteria, ids, filterKey, problems);
  if (entity === "scene") {
    sortField = requireSortContext(
      sortField as SortField<"scene"> | undefined,
      fields.criteria,
      "filter.sort",
      problems
    ) as typeof sortField;
  }

  if (entity === "group") {
    sortField = requireParentForSubGroupOrder(
      sortField as SortField<"group"> | undefined,
      fields.criteria,
      "filter.sort",
      problems
    ) as typeof sortField;
  }

  problems.finish();

  return {
    page: clampPage(state.page),
    perPage: clampPerPage(
      state.perPage,
      entity === "clip" ? CLIP_PER_PAGE_DEFAULT : PER_PAGE_DEFAULT
    ),
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
    sortField: requireSortContext(
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

/**
 * `GET /api/clips`'s ref parameters, kept for old links and callers: each
 * fills its `clip_filter` field (lead decision 5) with the modifiers the
 * GET always took. A list is one comma-separated value; one with a choice
 * of modifier takes it from `<param>Modifier`. No depth: the body's.
 */
const CLIP_QUERY_REFS = new Map<
  string,
  { readonly field: string; readonly modifiers: readonly RefModifier[] }
>([
  ["sceneId", { field: "scenes", modifiers: ["INCLUDES"] }],
  ["tagIds", { field: "tags", modifiers: REF_MODIFIERS }],
  ["sceneTagIds", { field: "scene_tags", modifiers: REF_MODIFIERS }],
  ["performerIds", { field: "performers", modifiers: REF_MODIFIERS }],
  ["studioId", { field: "studios", modifiers: ["INCLUDES"] }],
]);

/** The `<param>Modifier` companions of the ref parameters with a choice of modifier */
const CLIP_MODIFIER_KEYS = new Set(
  [...CLIP_QUERY_REFS].flatMap(([key, { modifiers }]) =>
    modifiers.length > 1 ? [`${key}Modifier`] : []
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
  modifiers: readonly RefModifier[],
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

  let modifier: RefModifier = "INCLUDES";
  if (modifiers.length > 1) {
    const modifierKey = `${key}Modifier`;
    const rawModifier = query[modifierKey];
    if (rawModifier !== undefined && rawModifier !== null) {
      const chosen = modifiers.find((m) => m === rawModifier);
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

/**
 * `GET /api/clips`, the lenient reader of today's query parameters: query
 * strings coerced, refs as comma lists, each parameter read onto its
 * `clip_filter` field, so the GET lists what the same body would. Every
 * clip when `isGenerated` is absent.
 */
export function parseClipQuery(
  query: unknown,
  options: ParseOptions
): ClipListRequest {
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
    [
      "instanceId",
      (raw, path) => {
        specificInstanceId = parseInstanceId(raw, path, problems);
      },
    ],
    [
      "isGenerated",
      (raw, path) => {
        isGenerated = parseBooleanText(raw, path, problems) ?? isGenerated;
      },
    ],
  ]);
  for (const [key, { field, modifiers }] of CLIP_QUERY_REFS) {
    handlers.set(key, (raw) => {
      const criterion = parseClipRefs(key, modifiers, raw, input, problems);
      if (criterion) criteria[field] = criterion;
    });
  }
  for (const modifierKey of CLIP_MODIFIER_KEYS) {
    // Read with its parameter
    handlers.set(modifierKey, () => undefined);
  }

  walk(input, "", handlers, problems, "Unknown query parameter");

  const filter: ParsedClipFilter = {
    // The boundary cast: each criterion was validated against its field
    ...(criteria as ParsedClipFilter),
    ...(isGenerated === undefined ? {} : { is_generated: isGenerated }),
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

const PLAYLIST_ITEM_SORT_SET: ReadonlySet<string> = new Set(
  PLAYLIST_ITEM_SORTS
);

/** The sorts that read in the playlist's own terms; ASC when no direction is sent */
const PLAYLIST_OWN_SORTS: ReadonlySet<PlaylistItemSort> = new Set([
  "position",
  "added_at",
]);

/**
 * A playlist item sort: a member of `PLAYLIST_ITEM_SORTS`, or
 * `random_<n>` (seed n % 1e8, as the lists read it); absent when missing or
 * invalid. `scene_index` is not one (a playlist has no collection), nor
 * `playlist_position` (the playlist's own order is `position`).
 */
function parsePlaylistSort(
  raw: unknown,
  path: string,
  problems: Problems
): { field: PlaylistItemSort; seed: number | undefined } | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    const seeded = RANDOM_SEED_PATTERN.exec(raw);
    if (seeded?.[1] !== undefined) {
      return { field: "random", seed: Number(seeded[1]) % SEED_MODULUS };
    }
    if (PLAYLIST_ITEM_SORT_SET.has(raw)) {
      return { field: raw as PlaylistItemSort, seed: undefined };
    }
  }
  problems.add(path, "Unknown sort");
  return undefined;
}

/**
 * The sort a playlist item request reads: the playlist's order when none is
 * sent; without a direction, `position` and `added_at` read ASC and a scene
 * sort the scene list's default; a bare `random` takes the user's daily seed
 */
function playlistItemSort(
  sortField: ReturnType<typeof parsePlaylistSort>,
  direction: SortDirection | undefined,
  options: ParseOptions
): ParsedPlaylistItemSort {
  const field = sortField?.field ?? DEFAULT_PLAYLIST_ITEM_SORT.field;
  return {
    field,
    direction:
      direction ??
      (PLAYLIST_OWN_SORTS.has(field)
        ? DEFAULT_PLAYLIST_ITEM_SORT.direction
        : DEFAULT_SORT.scene.direction),
    seed:
      field === "random"
        ? (sortField?.seed ?? generateDailySeed(options.userId))
        : undefined,
  };
}

/**
 * `GET /api/playlists/:id`: a page of the items the viewer can see, in the
 * request's sort: the playlist's order (`position`, the default), when each
 * item was added (`added_at`), or any scene sort as the Scenes page sorts.
 * Without a direction, `position` and `added_at` read ASC and a scene sort
 * the scene list's default; a bare `random` takes the user's daily seed, so
 * the answer can always name `random_<seed>`. It always pages: page 1 of 50
 * when the request names none.
 */
export function parsePlaylistItemsRequest(
  query: unknown,
  options: ParseOptions
): ParsedPlaylistItemsQuery {
  const input = requireObject(query, "query");
  const problems = new Problems();
  let page: number | undefined;
  let perPage: number | undefined;
  let sortField: ReturnType<typeof parsePlaylistSort>;
  let direction: SortDirection | undefined;

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    ["page", (raw, path) => (page = parseInteger(raw, path, problems))],
    ["per_page", (raw, path) => (perPage = parseInteger(raw, path, problems))],
    [
      "sort",
      (raw, path) => (sortField = parsePlaylistSort(raw, path, problems)),
    ],
    [
      "direction",
      (raw, path) => (direction = parseDirection(raw, path, problems)),
    ],
  ]);
  walk(input, "", handlers, problems, "Unknown query parameter");
  problems.finish();

  return {
    paging: {
      page: clampPage(page),
      perPage: clampPerPage(
        perPage,
        PLAYLIST_ITEMS_PER_PAGE_DEFAULT,
        PLAYLIST_ITEMS_PER_PAGE_MAX
      ),
    },
    sort: playlistItemSort(sortField, direction, options),
  };
}

/**
 * `GET /api/playlists/:id/queue`: the play queue's order, the `sort` and
 * `direction` the item page reads (as `parsePlaylistItemsRequest` reads
 * them); no paging, since the queue is every visible item
 */
export function parsePlaylistQueueRequest(
  query: unknown,
  options: ParseOptions
): ParsedPlaylistItemSort {
  const input = requireObject(query, "query");
  const problems = new Problems();
  let sortField: ReturnType<typeof parsePlaylistSort>;
  let direction: SortDirection | undefined;

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    [
      "sort",
      (raw, path) => (sortField = parsePlaylistSort(raw, path, problems)),
    ],
    [
      "direction",
      (raw, path) => (direction = parseDirection(raw, path, problems)),
    ],
  ]);
  walk(input, "", handlers, problems, "Unknown query parameter");
  problems.finish();

  return playlistItemSort(sortField, direction, options);
}

/**
 * `POST /api/playlists/:id/sort`: the view sort to save as the playlist's
 * order, the `sort` and `direction` the page read (both required; a random
 * one as `random_<seed>`, so the save stores the order the page showed)
 */
export function parseSortPlaylistRequest(
  body: unknown,
  options: ParseOptions
): ParsedPlaylistItemSort {
  const input = requireObject(body, "body");
  const problems = new Problems();
  let sortField: ReturnType<typeof parsePlaylistSort>;
  let direction: SortDirection | undefined;

  const handlers = new Map<string, (raw: unknown, path: string) => void>([
    [
      "sort",
      (raw, path) => (sortField = parsePlaylistSort(raw, path, problems)),
    ],
    [
      "direction",
      (raw, path) => (direction = parseDirection(raw, path, problems)),
    ],
  ]);
  walk(input, "", handlers, problems, "Unknown request field");
  for (const key of ["sort", "direction"]) {
    if (input[key] === undefined || input[key] === null) {
      problems.add(key, "Required");
    }
  }
  problems.finish();

  return playlistItemSort(sortField, direction, options);
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
 * a page size, ids, count minimums and a scope (never for scenes, which no
 * restriction names); always name order, one page.
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
        if (raw === "allEnabled" && entity === "scene") {
          // The Content Restrictions editor restricts no scenes
          problems.add(path, "Scenes are listed for the user only");
        } else if (raw === "allEnabled") {
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
