/**
 * Cleans what users saved against the filter contract (item 38; data
 * migration 009): filter presets, which hold the filter panel's state, and
 * custom carousels, which hold a scene filter as a request sends it.
 *
 * - A preset keeps its panel keys (`shared/types/filters/uiKeys.ts`) with
 *   their modifier, depth and exclude companions, and its list's contract fields
 *   (a page's permanent criterion saved in the request's shape: the folder
 *   view's tag, the timeline's date). Any other key goes, and so does a
 *   companion whose value its field refuses (the panel then shows the
 *   default). `perPage` is held to PER_PAGE_MAX.
 * - A carousel's rules are parsed leniently with the scene contract, one key
 *   at a time: a key the parser drops (unknown, or a criterion it refuses,
 *   which the query ignores whole) goes; the rest stays as stored.
 * - A sort outside the list becomes the default sort and direction (a
 *   carousel's is random, DESC); a direction outside ASC and DESC the
 *   default direction, and a lower-case one is upper-cased.
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
  PER_PAGE_MAX,
  SCENE_FIELDS,
  SORT_DIRECTIONS,
  type SortDirection,
  UI_KEYS,
  type UiKey,
} from "@peek/shared-types/filters/index.js";
import { makeEntityRef } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../prisma/singleton.js";
import {
  isListSort,
  parseFilterRef,
  parseStoredSceneQuery,
} from "../utils/listRequest.js";

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

  get changed(): boolean {
    return (
      this.droppedKeys.length > 0 ||
      this.sortReset ||
      this.directionFixed ||
      this.perPageCapped ||
      this.refsRewritten > 0
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
    const modifiers = new Map<string, FieldSpec>();
    const depths = new Map<string, FieldSpec>();
    const uiKeys: readonly UiKey[] = UI_KEYS[kind];
    for (const uiKey of uiKeys) {
      const spec = fields[uiKey.field];
      if (!spec) continue;
      panel.set(uiKey.key, spec);
      // A picker's excluded ids, cleaned like its picks
      if (uiKey.excludeKey) panel.set(uiKey.excludeKey, spec);
      if (uiKey.modifierKey) modifiers.set(uiKey.modifierKey, spec);
      if (uiKey.hierarchyKey) depths.set(uiKey.hierarchyKey, spec);
    }
    const keys: PresetKeys = {
      panel,
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

/** Whether a preset's filter key stays */
function keepsFilterKey(
  keys: PresetKeys,
  key: string,
  value: unknown
): boolean {
  if (keys.panel.has(key)) return true;
  const modifierOf = keys.modifiers.get(key);
  if (modifierOf) return takesModifier(modifierOf, value);
  const depthOf = keys.depths.get(key);
  if (depthOf) return takesDepth(depthOf, value);
  return keys.fields.has(key);
}

function cleanPresetFilters(
  keys: PresetKeys,
  filters: Record<string, unknown>,
  lookup: BareRefLookup,
  tally: Tally
): Record<string, unknown> {
  let changed = false;
  const entries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (!keepsFilterKey(keys, key, value)) {
      tally.droppedKeys.push(key);
      changed = true;
      continue;
    }
    const panel = keys.panel.get(key);
    const field = panel ?? keys.fields.get(key);
    let next = value;
    if (field?.kind === "ref") {
      next = panel
        ? cleanRefs(value, field.target, lookup, tally)
        : cleanRefCriterion(value, field.target, lookup, tally);
    }
    if (next !== value) changed = true;
    entries.push([key, next]);
  }
  // fromEntries defines own properties, so a stored `__proto__` key stays data
  return changed ? Object.fromEntries(entries) : filters;
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
    isListSort(list.kind, preset.sort),
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

  // The sort as the carousel runs it: Scene Number needs a collection rule
  const ignored = parseStoredSceneQuery(
    isPlainObject(cleanedRules) ? cleanedRules : {},
    sort,
    direction,
    { userId: 0 }
  ).ignored;
  const fixed = cleanSort(
    { sort, direction },
    { field: DEFAULT_CAROUSEL_SORT, direction: DEFAULT_CAROUSEL_DIRECTION },
    !ignored.some((problem) => problem.path === "sort"),
    tally
  );

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
