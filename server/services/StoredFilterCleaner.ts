/**
 * Cleans what users saved against the filter contract (item 38; data
 * migration 009): filter presets, which hold the filter panel's state, and
 * custom carousels, which hold a scene filter as a request sends it.
 *
 * - A preset keeps its panel keys (`shared/types/filters/uiKeys.ts`) with
 *   their modifier, depth and exclude companions, and its list's contract fields
 *   (a page's permanent criterion saved in the request's shape: the folder
 *   view's tag, the timeline's date). A panel key or companion may carry a
 *   row prefix (`g1.`, `2.`, `g1.2.`; 9b's key grammar, read by
 *   `parseRowKey`), and the root's `match` and a group's `gN` ("all" or
 *   "any") stay; a contract field stays at the root only. Any other key goes,
 *   and so does a companion whose value its field refuses (the panel then
 *   shows the default). A multi row's lone value (beta.7's one gender)
 *   becomes a one-element list. `perPage` is held to PER_PAGE_MAX.
 * - A carousel's rules are parsed leniently with the scene contract, one key
 *   at a time: a key the parser drops (unknown, or a criterion it refuses,
 *   which the query ignores whole) goes; the rest stays as stored. Migration
 *   009 keeps them flat (`cleanCarouselRules`); `cleanCarouselTree` cleans a
 *   tree's rows the same way, one at a time, and turns a flat rule set into
 *   its root "all" tree.
 * - A sort outside the list becomes the default sort and direction (a
 *   carousel's is random, DESC); a direction outside ASC and DESC the
 *   default direction, and a lower-case one is upper-cased. A scene preset
 *   may also sort by Recommended's sorts (Recommended shares the scene
 *   Views).
 * - A bare id from before multi-instance support becomes `id:instance` when
 *   exactly one live entity of its type has it on an enabled instance;
 *   otherwise it stays bare and keeps matching that id on every server. A
 *   picker's excluded ids (`tagIdsExclude`, a criterion's `excludes`) are
 *   tied the same way.
 *
 * Everything else is kept as it is, in its place, so a clean of a clean
 * changes nothing. The cleaners are pure: a bare id's instance comes from a
 * lookup, which `bareRefLookupFor` builds from one query per entity type.
 */
import {
  DEFAULT_SORT,
  type EntityKind,
  type FieldSpec,
  LIST_FIELDS,
  LIST_KINDS,
  type ListKind,
  MATCHES,
  PANEL_FIELDS,
  PER_PAGE_MAX,
  type PanelField,
  RECOMMENDED_SORTS,
  ROOT_MATCH_KEY,
  SCENE_FIELDS,
  SORT_DIRECTIONS,
  type SortDirection,
  UI_KEYS,
  type UiKey,
  WHERE_LIMITS,
  parseRowKey,
} from "@peek/shared-types/filters/index.js";
import { makeEntityRef } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../prisma/singleton.js";
import {
  isListSort,
  parseFilterRef,
  parseStoredSceneQuery,
} from "../utils/listRequest.js";
import { isWhereShape, whereOfFlatFilter } from "../utils/whereTree.js";

/** What a new carousel sorts by when the request names nothing */
export const DEFAULT_CAROUSEL_SORT = "random";
export const DEFAULT_CAROUSEL_DIRECTION: SortDirection = "DESC";

/**
 * A bare id's instance: the one enabled instance holding a live entity of
 * `target` under `id`, else undefined
 */
export type BareRefLookup = (
  target: EntityKind,
  id: string
) => string | undefined;

/** Leaves every bare id bare */
const NO_LOOKUP: BareRefLookup = () => undefined;

/** What a clean did, with no values: key names and counts */
export interface CleanReport {
  /** The keys that went: a preset's filter keys, a carousel's rule keys */
  readonly droppedKeys: readonly string[];
  /** The sort was not one of the list's: the default sort and direction replaced it */
  readonly sortReset: boolean;
  /** The direction was not ASC or DESC in any case (the default replaced it), or was lower-case */
  readonly directionFixed: boolean;
  /** A preset's per page was above PER_PAGE_MAX */
  readonly perPageCapped: boolean;
  /** Bare ids tied to their one instance */
  readonly refsRewritten: number;
  /** Bare ids no single live entity has, left bare */
  readonly refsLeftBare: number;
  /** A multi row's lone values made one-element lists */
  readonly valuesListed: number;
  /** A carousel's rules were not a tree: `cleanCarouselTree` stored them as one */
  readonly shapeConverted: boolean;
}

export interface Cleaned<T> {
  /** The cleaned value; the input itself when nothing changed */
  readonly value: T;
  readonly changed: boolean;
  readonly report: CleanReport;
}

/** A carousel's stored query */
export interface CarouselQuery {
  readonly rules: unknown;
  readonly sort: string;
  readonly direction: string;
}

/** One preset of a user's saved presets, as cleaned */
export interface PresetResult {
  /** The list it belongs to: the key it is saved under */
  readonly entity: string;
  readonly presetId: string | undefined;
  readonly changed: boolean;
  readonly report: CleanReport;
}

export interface CleanedPresets {
  /** The user's presets; the input itself when nothing changed */
  readonly value: unknown;
  readonly changed: boolean;
  readonly results: readonly PresetResult[];
}

class Tally {
  readonly droppedKeys: string[] = [];
  sortReset = false;
  directionFixed = false;
  perPageCapped = false;
  refsRewritten = 0;
  refsLeftBare = 0;
  valuesListed = 0;
  shapeConverted = false;

  get changed(): boolean {
    return (
      this.droppedKeys.length > 0 ||
      this.sortReset ||
      this.directionFixed ||
      this.perPageCapped ||
      this.refsRewritten > 0 ||
      this.valuesListed > 0 ||
      this.shapeConverted
    );
  }

  report(): CleanReport {
    return {
      droppedKeys: [...this.droppedKeys],
      sortReset: this.sortReset,
      directionFixed: this.directionFixed,
      perPageCapped: this.perPageCapped,
      refsRewritten: this.refsRewritten,
      refsLeftBare: this.refsLeftBare,
      valuesListed: this.valuesListed,
      shapeConverted: this.shapeConverted,
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The object with each value mapped, every key in its place.
 * `Object.fromEntries` defines own properties, so a stored `__proto__` key
 * stays data.
 */
function rebuild(
  input: Record<string, unknown>,
  map: (key: string, value: unknown) => unknown
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, map(key, value)])
  );
}

// =============================================================================
// BARE IDS
// =============================================================================

/**
 * One picked id, as `id:instance` when it is bare and the lookup names its
 * instance; anything else (an id with its instance, text that is no id, an
 * object) as it is
 */
function cleanRef(
  value: unknown,
  target: EntityKind,
  lookup: BareRefLookup,
  tally: Tally
): unknown {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : undefined;
  if (text === undefined) return value;
  const ref = parseFilterRef(text);
  if (ref === undefined || ref.instanceId !== undefined) return value;
  const instanceId = lookup(target, ref.id);
  if (instanceId === undefined) {
    tally.refsLeftBare++;
    return value;
  }
  tally.refsRewritten++;
  return makeEntityRef(ref.id, instanceId);
}

/** A picker's value: a list of ids or a single select's one id */
function cleanRefs(
  value: unknown,
  target: EntityKind,
  lookup: BareRefLookup,
  tally: Tally
): unknown {
  if (!Array.isArray(value)) return cleanRef(value, target, lookup, tally);
  const cleaned = value.map((item: unknown) =>
    cleanRef(item, target, lookup, tally)
  );
  return cleaned.some((item, i) => item !== value[i]) ? cleaned : value;
}

/** The ids a criterion holds: its values and the ones it excludes */
const REF_LISTS: readonly string[] = ["value", "excludes"];

/**
 * A ref criterion in the request's shape (`{ value, excludes, modifier,
 * depth }`): its values and its excludes tied alike
 */
function cleanRefCriterion(
  value: unknown,
  target: EntityKind,
  lookup: BareRefLookup,
  tally: Tally
): unknown {
  if (!isPlainObject(value)) return value;
  const cleaned = rebuild(value, (key, v) =>
    REF_LISTS.includes(key) ? cleanRefs(v, target, lookup, tally) : v
  );
  return REF_LISTS.some((key) => cleaned[key] !== value[key]) ? cleaned : value;
}

const ENTITY_TABLES: Readonly<Record<EntityKind, string>> = {
  scene: "StashScene",
  performer: "StashPerformer",
  studio: "StashStudio",
  tag: "StashTag",
  group: "StashGroup",
  gallery: "StashGallery",
  image: "StashImage",
};

/**
 * The bare ids that exactly one live entity of `entityType` has on an
 * enabled instance, each with that instance. An id on two servers, only on
 * a disabled one, or only soft-deleted is not in the map.
 */
export async function resolveBareRefs(
  entityType: EntityKind,
  ids: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; instanceId: string }>
  >(
    `SELECT x.id AS id, MIN(x.stashInstanceId) AS instanceId
     FROM json_each(?) j
     CROSS JOIN "${ENTITY_TABLES[entityType]}" x ON x.id = j.value
     JOIN "StashInstance" i ON i.id = x.stashInstanceId
     WHERE x.deletedAt IS NULL AND i.enabled = 1
     GROUP BY x.id
     HAVING COUNT(DISTINCT x.stashInstanceId) = 1`,
    JSON.stringify(distinct)
  );
  return new Map(rows.map((row) => [row.id, row.instanceId]));
}

/**
 * The lookup `clean` needs: `clean` runs once with a recording lookup to
 * learn which bare ids it asks for, then each entity type's ids are
 * resolved with one query. Run `clean` again with the result.
 */
export async function bareRefLookupFor(
  clean: (lookup: BareRefLookup) => unknown
): Promise<BareRefLookup> {
  const wanted = new Map<EntityKind, Set<string>>();
  clean((target, id) => {
    const ids = wanted.get(target) ?? new Set<string>();
    ids.add(id);
    wanted.set(target, ids);
    return undefined;
  });
  const resolved = new Map<EntityKind, ReadonlyMap<string, string>>();
  for (const [target, ids] of wanted) {
    resolved.set(target, await resolveBareRefs(target, [...ids]));
  }
  return (target, id) => resolved.get(target)?.get(id);
}

// =============================================================================
// SORTS
// =============================================================================

/**
 * Whether `raw` is a sort a View of the list may store: one of the list's
 * (`isListSort`), or for a scene View one of Recommended's, which shares the
 * scene Views
 */
export function isViewSort(kind: ListKind, raw: unknown): boolean {
  if (isListSort(kind, raw)) return true;
  if (kind !== "scene") return false;
  const recommended: readonly string[] = RECOMMENDED_SORTS;
  return typeof raw === "string" && recommended.includes(raw);
}

interface SortParts {
  readonly sort: unknown;
  readonly direction: unknown;
}

/**
 * A stored sort that is one of the list's stays, and its direction is
 * upper-cased or else becomes the default direction; any other sort becomes
 * the default sort with the default direction. A missing sort or direction
 * stays missing.
 */
function cleanSort(
  parts: SortParts,
  fallback: { readonly field: string; readonly direction: SortDirection },
  sortValid: boolean,
  tally: Tally
): SortParts {
  if (parts.sort !== undefined && parts.sort !== null && !sortValid) {
    tally.sortReset = true;
    return { sort: fallback.field, direction: fallback.direction };
  }
  if (typeof parts.direction === "string") {
    const upper = parts.direction.toUpperCase();
    if (SORT_DIRECTIONS.some((d) => d === upper)) {
      if (upper === parts.direction) return parts;
      tally.directionFixed = true;
      return { ...parts, direction: upper };
    }
  } else if (parts.direction === undefined || parts.direction === null) {
    return parts;
  }
  tally.directionFixed = true;
  return { ...parts, direction: fallback.direction };
}

// =============================================================================
// PRESETS
// =============================================================================

interface PresetKeys {
  /** Panel keys and exclude companions, with the field each fills */
  readonly panel: ReadonlyMap<string, FieldSpec>;
  /** Each panel key and companion, with the panel key of its row */
  readonly rowOf: ReadonlyMap<string, string>;
  /** The panel keys of multi rows, whose value is a list */
  readonly multi: ReadonlySet<string>;
  /** Modifier companions, with their field */
  readonly modifiers: ReadonlyMap<string, FieldSpec>;
  /** Depth companions, with their field */
  readonly depths: ReadonlyMap<string, FieldSpec>;
  /** The list's contract fields, where a page's permanent criteria ride */
  readonly fields: ReadonlyMap<string, FieldSpec>;
}

const fieldsOf = (kind: ListKind): Readonly<Record<string, FieldSpec>> =>
  LIST_FIELDS[kind];

/** By the key presets are saved under; a Map, so `__proto__` is no member */
const PRESET_KEYS = new Map<string, { kind: ListKind; keys: PresetKeys }>(
  LIST_KINDS.map((kind) => {
    const fields = fieldsOf(kind);
    const panel = new Map<string, FieldSpec>();
    const rowOf = new Map<string, string>();
    const modifiers = new Map<string, FieldSpec>();
    const depths = new Map<string, FieldSpec>();
    const uiKeys: readonly UiKey[] = UI_KEYS[kind];
    for (const uiKey of uiKeys) {
      const spec = fields[uiKey.field];
      if (!spec) continue;
      panel.set(uiKey.key, spec);
      rowOf.set(uiKey.key, uiKey.key);
      // A picker's excluded ids, cleaned like its picks
      if (uiKey.excludeKey) {
        panel.set(uiKey.excludeKey, spec);
        rowOf.set(uiKey.excludeKey, uiKey.key);
      }
      if (uiKey.modifierKey) {
        modifiers.set(uiKey.modifierKey, spec);
        rowOf.set(uiKey.modifierKey, uiKey.key);
      }
      if (uiKey.hierarchyKey) {
        depths.set(uiKey.hierarchyKey, spec);
        rowOf.set(uiKey.hierarchyKey, uiKey.key);
      }
    }
    const rows: readonly PanelField[] = PANEL_FIELDS[kind];
    const multi = new Set(
      rows
        .filter(
          (row) =>
            (row.editor === "ref" || row.editor === "enum") &&
            row.multi === true
        )
        .map((row) => row.key)
    );
    const keys: PresetKeys = {
      panel,
      rowOf,
      multi,
      modifiers,
      depths,
      fields: new Map(Object.entries(fields)),
    };
    return [kind, { kind, keys }];
  })
);

/** A modifier companion's value its field takes; null and absence mean none */
function takesModifier(spec: FieldSpec, value: unknown): boolean {
  if (value === null || !("modifiers" in spec)) return true;
  const modifiers: readonly string[] = spec.modifiers;
  return modifiers.some((modifier) => modifier === value);
}

/** A depth companion's value: a whole number from -1 on a hierarchical field */
function takesDepth(spec: FieldSpec, value: unknown): boolean {
  if (value === null || spec.kind !== "ref" || !spec.hierarchical) return true;
  return typeof value === "number" && Number.isInteger(value) && value >= -1;
}

/** A group's match key, `g1` to `g99` (only `g1` to `g5` are groups) */
const GROUP_KEY = /^g(\d+)$/;

/** A filter key's place in the state, read with the key grammar */
export type FilterKeyRole =
  /** The root's `match` or a group's `gN` declaration */
  | { readonly kind: "match"; readonly group: number }
  /** A panel key or companion of a row; `row` is the row's panel key */
  | {
      readonly kind: "row";
      readonly group: number;
      readonly occurrence: number;
      readonly key: string;
      readonly row: string;
    }
  /** A contract field at the root: a page's permanent criterion */
  | { readonly kind: "permanent" }
  /** A contract field under a row prefix: permanent criteria are root only */
  | { readonly kind: "prefixedPermanent" }
  /** Not a key of the list, or outside the grammar (`g6.`, `21.`) */
  | { readonly kind: "unknown" };

/** A stored filter key's role in the list `kind`'s state */
export function filterKeyRole(kind: ListKind, raw: string): FilterKeyRole {
  const list = PRESET_KEYS.get(kind);
  return list ? roleOf(list.keys, raw) : { kind: "unknown" };
}

function roleOf(keys: PresetKeys, raw: string): FilterKeyRole {
  if (raw === ROOT_MATCH_KEY) return { kind: "match", group: 0 };
  const group = GROUP_KEY.exec(raw)?.[1];
  if (group !== undefined) {
    const number = Number(group);
    return number >= 1 && number <= WHERE_LIMITS.groups
      ? { kind: "match", group: number }
      : { kind: "unknown" };
  }
  const parsed = parseRowKey(raw);
  if (!parsed) return { kind: "unknown" };
  const row = keys.rowOf.get(parsed.key);
  if (row !== undefined) return { kind: "row", ...parsed, row };
  if (!keys.fields.has(parsed.key)) return { kind: "unknown" };
  return parsed.group === 0 && parsed.occurrence === 1
    ? { kind: "permanent" }
    : { kind: "prefixedPermanent" };
}

/** A group's or the root's match: "all" or "any" */
export function isMatchValue(value: unknown): boolean {
  return MATCHES.some((match) => match === value);
}

/** Whether a preset's filter key stays */
function keepsFilterKey(
  keys: PresetKeys,
  rawKey: string,
  value: unknown
): boolean {
  const role = roleOf(keys, rawKey);
  if (role.kind === "match") return isMatchValue(value);
  if (role.kind === "permanent") return true;
  if (role.kind !== "row") return false;
  const { key } = role;
  if (keys.panel.has(key)) return true;
  const modifierOf = keys.modifiers.get(key);
  if (modifierOf) return takesModifier(modifierOf, value);
  const depthOf = keys.depths.get(key);
  if (depthOf) return takesDepth(depthOf, value);
  return false;
}

/** A multi row's value: a lone string or number becomes a one-element list */
function listedValue(value: unknown, tally: Tally): unknown {
  if (typeof value !== "string" && typeof value !== "number") return value;
  if (value === "") return value;
  tally.valuesListed++;
  return [value];
}

function cleanPresetFilters(
  keys: PresetKeys,
  filters: Record<string, unknown>,
  lookup: BareRefLookup,
  tally: Tally
): Record<string, unknown> {
  let changed = false;
  const entries: [string, unknown][] = [];
  for (const [rawKey, value] of Object.entries(filters)) {
    if (!keepsFilterKey(keys, rawKey, value)) {
      tally.droppedKeys.push(rawKey);
      changed = true;
      continue;
    }
    // a root key reads as itself; a prefixed one by its base key
    const key = parseRowKey(rawKey)?.key ?? rawKey;
    const panel = keys.panel.get(key);
    const field = panel ?? keys.fields.get(key);
    let next = keys.multi.has(key) ? listedValue(value, tally) : value;
    if (field?.kind === "ref") {
      next = panel
        ? cleanRefs(next, field.target, lookup, tally)
        : cleanRefCriterion(next, field.target, lookup, tally);
    }
    if (next !== value) changed = true;
    entries.push([rawKey, next]);
  }
  // fromEntries defines own properties, so a stored `__proto__` key stays data
  return changed ? Object.fromEntries(entries) : filters;
}

/**
 * One View's filters (the flat prefixed state) cleaned as a stored preset's
 * are: unknown keys and refused companions go, bare ids are tied through
 * `lookup`, a multi row's lone value becomes a list
 */
export function cleanViewFilters(
  kind: ListKind,
  filters: Record<string, unknown>,
  lookup: BareRefLookup = NO_LOOKUP
): Cleaned<Record<string, unknown>> {
  const tally = new Tally();
  const list = PRESET_KEYS.get(kind);
  if (!list) return { value: filters, changed: false, report: tally.report() };
  const value = cleanPresetFilters(list.keys, filters, lookup, tally);
  return { value, changed: tally.changed, report: tally.report() };
}

/**
 * One saved preset of the list `entity` (the key it is saved under). A
 * preset of a list the contract does not know, or one that is not an
 * object, is left as it is.
 */
export function cleanPresetState(
  entity: string,
  preset: unknown,
  lookup: BareRefLookup = NO_LOOKUP
): Cleaned<unknown> {
  const tally = new Tally();
  const list = PRESET_KEYS.get(entity);
  if (!list || !isPlainObject(preset)) {
    return { value: preset, changed: false, report: tally.report() };
  }

  const filters = isPlainObject(preset.filters)
    ? cleanPresetFilters(list.keys, preset.filters, lookup, tally)
    : preset.filters;
  const sort = cleanSort(
    { sort: preset.sort, direction: preset.direction },
    DEFAULT_SORT[list.kind],
    isViewSort(list.kind, preset.sort),
    tally
  );
  const perPage =
    typeof preset.perPage === "number" && preset.perPage > PER_PAGE_MAX
      ? PER_PAGE_MAX
      : preset.perPage;
  if (perPage !== preset.perPage) tally.perPageCapped = true;

  if (!tally.changed) {
    return { value: preset, changed: false, report: tally.report() };
  }
  const replaced = new Map<string, unknown>([
    ["filters", filters],
    ["sort", sort.sort],
    ["direction", sort.direction],
    ["perPage", perPage],
  ]);
  const value = rebuild(preset, (key, v) =>
    replaced.has(key) ? replaced.get(key) : v
  );
  // A reset sort brings its direction even to a preset saved without one
  if (tally.sortReset && !("direction" in value)) {
    value.direction = sort.direction;
  }
  return { value, changed: true, report: tally.report() };
}

/**
 * A user's saved presets (`User.filterPresets`: each list's presets under
 * its key), each cleaned by `cleanPresetState`
 */
export function cleanFilterPresets(
  presets: unknown,
  lookup: BareRefLookup = NO_LOOKUP
): CleanedPresets {
  if (!isPlainObject(presets)) {
    return { value: presets, changed: false, results: [] };
  }
  const results: PresetResult[] = [];
  const value = rebuild(presets, (entity, stored) => {
    if (!Array.isArray(stored)) return stored;
    const list: readonly unknown[] = stored;
    const cleaned = list.map((preset) => {
      const result = cleanPresetState(entity, preset, lookup);
      const presetId =
        isPlainObject(preset) && typeof preset.id === "string"
          ? preset.id
          : undefined;
      results.push({
        entity,
        presetId,
        changed: result.changed,
        report: result.report,
      });
      return result.value;
    });
    return cleaned.some((preset, i) => preset !== list[i]) ? cleaned : list;
  });
  const changed = results.some((result) => result.changed);
  return { value: changed ? value : presets, changed, results };
}

// =============================================================================
// CAROUSELS
// =============================================================================

const SCENE_FIELD_SPECS: ReadonlyMap<string, FieldSpec> = new Map(
  Object.entries(SCENE_FIELDS)
);

/**
 * The sort as the carousel runs it (Scene Number needs a collection rule at
 * the top level), fixed as `cleanSort` fixes it
 */
function cleanCarouselSort(
  rules: unknown,
  sort: string,
  direction: string,
  tally: Tally
): SortParts {
  const ignored = parseStoredSceneQuery(
    isPlainObject(rules) ? rules : {},
    sort,
    direction,
    { userId: 0 }
  ).ignored;
  return cleanSort(
    { sort, direction },
    { field: DEFAULT_CAROUSEL_SORT, direction: DEFAULT_CAROUSEL_DIRECTION },
    !ignored.some((problem) => problem.path === "sort"),
    tally
  );
}

/** Whether the lenient scene parser drops this one rule */
function dropsRule(key: string, value: unknown): boolean {
  const parsed = parseStoredSceneQuery(
    Object.fromEntries([[key, value]]),
    DEFAULT_SORT.scene.field,
    DEFAULT_SORT.scene.direction,
    { userId: 0 }
  );
  return parsed.ignored.length > 0;
}

/**
 * A carousel's stored rules, sort and direction. Rules that are not an
 * object are left as they are (they filter nothing); the sort and direction
 * are still fixed.
 */
export function cleanCarouselRules(
  rules: unknown,
  sort: string,
  direction: string,
  lookup: BareRefLookup = NO_LOOKUP
): Cleaned<CarouselQuery> {
  const tally = new Tally();

  let cleanedRules = rules;
  if (isPlainObject(rules)) {
    let changed = false;
    const entries: [string, unknown][] = [];
    for (const [key, value] of Object.entries(rules)) {
      if (dropsRule(key, value)) {
        tally.droppedKeys.push(key);
        changed = true;
        continue;
      }
      const spec = SCENE_FIELD_SPECS.get(key);
      const next =
        spec?.kind === "ref"
          ? cleanRefCriterion(value, spec.target, lookup, tally)
          : value;
      if (next !== value) changed = true;
      entries.push([key, next]);
    }
    if (changed) cleanedRules = Object.fromEntries(entries);
  }

  const fixed = cleanCarouselSort(cleanedRules, sort, direction, tally);

  if (!tally.changed) {
    return {
      value: { rules, sort, direction },
      changed: false,
      report: tally.report(),
    };
  }
  return {
    value: {
      rules: cleanedRules,
      sort: String(fixed.sort),
      direction: String(fixed.direction),
    },
    changed: true,
    report: tally.report(),
  };
}

const EMPTY_TREE: Readonly<Record<string, unknown>> = {
  match: "all",
  rules: [],
};

/** An own key, never one the prototype holds */
function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** A stored node that is a group, as the parser tells one from a row */
function isGroupNode(node: Record<string, unknown>): boolean {
  return hasOwn(node, "rules") || hasOwn(node, "match");
}

/** What a dropped node is reported as: its field, else its path */
function droppedName(node: unknown, path: string): string {
  return isPlainObject(node) && typeof node.field === "string"
    ? node.field
    : path;
}

/** The keys a row may have */
const ROW_KEYS: ReadonlySet<string> = new Set(["field", "criterion"]);

/**
 * Whether the lenient parser keeps this one row: it drops a row with a
 * problem (an unknown field, a criterion it refuses, which the query
 * ignores whole) and keeps an empty one, as it keeps an empty flat key
 */
function keepsRow(row: Record<string, unknown>): boolean {
  const parsed = parseStoredSceneQuery(
    { match: "all", rules: [row] },
    DEFAULT_SORT.scene.field,
    DEFAULT_SORT.scene.direction,
    { userId: 0 }
  );
  return parsed.ignored.length === 0;
}

/**
 * One row as the parser keeps it: a key other than `field` and
 * `criterion` goes (the parser ignores it), the row goes when the parser
 * drops it, and a ref row's bare ids are tied. Undefined when it goes; the
 * input itself when nothing changed.
 */
function cleanTreeRow(
  node: unknown,
  path: string,
  lookup: BareRefLookup,
  tally: Tally
): unknown {
  if (!isPlainObject(node)) {
    tally.droppedKeys.push(path);
    return undefined;
  }
  const extra = Object.keys(node).filter((key) => !ROW_KEYS.has(key));
  for (const key of extra) tally.droppedKeys.push(`${path}.${key}`);
  const row =
    extra.length === 0
      ? node
      : Object.fromEntries(
          Object.entries(node).filter(([key]) => ROW_KEYS.has(key))
        );
  if (!keepsRow(row)) {
    tally.droppedKeys.push(droppedName(row, path));
    return undefined;
  }
  const spec =
    typeof row.field === "string"
      ? SCENE_FIELD_SPECS.get(row.field)
      : undefined;
  if (spec?.kind !== "ref") return row;
  const criterion = cleanRefCriterion(
    row.criterion,
    spec.target,
    lookup,
    tally
  );
  return criterion === row.criterion ? row : { ...row, criterion };
}

/**
 * A group (the root when `isRoot`) as the parser keeps it: its match "all"
 * or "any" (else the parser drops it whole, rows and all), only `match` and
 * `rules`, each row cleaned, a group only at the root, and a group left
 * with no row gone. Undefined when it goes; the input itself when nothing
 * changed.
 */
function cleanTreeGroup(
  group: Readonly<Record<string, unknown>>,
  path: string,
  isRoot: boolean,
  lookup: BareRefLookup,
  tally: Tally
): Readonly<Record<string, unknown>> | undefined {
  const { match, rules } = group;
  if ((match !== "all" && match !== "any") || !Array.isArray(rules)) {
    tally.droppedKeys.push(path);
    return undefined;
  }
  const extra = Object.keys(group).filter(
    (key) => key !== "match" && key !== "rules"
  );
  for (const key of extra) tally.droppedKeys.push(`${path}.${key}`);

  const items: readonly unknown[] = rules;
  const cleaned: unknown[] = [];
  items.forEach((node, index) => {
    const nodePath = `${path}.rules[${index}]`;
    if (!isPlainObject(node) || !isGroupNode(node)) {
      const row = cleanTreeRow(node, nodePath, lookup, tally);
      if (row !== undefined) cleaned.push(row);
      return;
    }
    if (!isRoot) {
      // Groups nest one level: the parser drops a group in a group
      tally.droppedKeys.push(nodePath);
      return;
    }
    const inner = cleanTreeGroup(node, nodePath, false, lookup, tally);
    if (inner === undefined) return;
    const innerRules = inner.rules;
    if (Array.isArray(innerRules) && innerRules.length > 0) {
      cleaned.push(inner);
    } else {
      tally.droppedKeys.push(nodePath);
    }
  });

  const same =
    extra.length === 0 &&
    cleaned.length === items.length &&
    cleaned.every((node, i) => node === items[i]);
  return same ? group : { match, rules: cleaned };
}

/**
 * A carousel's stored rules, sort and direction, as the tree it stores
 * (data migration 012): rules of either shape go in, a tree always comes
 * out. A flat rule set becomes its root "all" tree (`shapeConverted`, so
 * it is rewritten even with nothing else to clean); its `ids` and
 * `instance_id` cannot be rows and are dropped. Each row is cleaned as
 * `cleanCarouselRules` cleans a key: a row the lenient parser drops goes,
 * and a ref row's bare ids are tied to their one instance. A group the
 * parser drops goes whole, and so does a group left with no row. Rules of
 * neither shape (which filter nothing) become the empty tree. A clean of a
 * clean changes nothing.
 */
export function cleanCarouselTree(
  rules: unknown,
  sort: string,
  direction: string,
  lookup: BareRefLookup = NO_LOOKUP
): Cleaned<CarouselQuery> {
  const tally = new Tally();

  let tree: Readonly<Record<string, unknown>>;
  if (isWhereShape(rules)) {
    tree = rules;
  } else {
    tally.shapeConverted = true;
    tree = isPlainObject(rules) ? { ...whereOfFlatFilter(rules) } : EMPTY_TREE;
    if (isPlainObject(rules)) {
      for (const key of ["ids", "instance_id"]) {
        if (hasOwn(rules, key)) tally.droppedKeys.push(key);
      }
    }
  }
  const cleaned =
    cleanTreeGroup(tree, "rules", true, lookup, tally) ?? EMPTY_TREE;
  const fixed = cleanCarouselSort(cleaned, sort, direction, tally);

  if (!tally.changed) {
    return {
      value: { rules, sort, direction },
      changed: false,
      report: tally.report(),
    };
  }
  return {
    value: {
      rules: cleaned,
      sort: String(fixed.sort),
      direction: String(fixed.direction),
    },
    changed: true,
    report: tally.report(),
  };
}
