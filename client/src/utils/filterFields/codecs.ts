/**
 * What each editor kind does with a panel row: the keys it holds, whether
 * it filters, its request criterion, its URL parameters and (filled by
 * later tasks) its chip and how a stored criterion reads back.
 *
 * Body measures (Height, Weight, Penis Length) are metric in the state, the
 * URL, presets and requests; `normalize` reads them leniently (any finite
 * number, never clamped, a non-number dropped, the old feet-and-inches
 * height shape as centimetres). An imperial viewer's editors convert on
 * screen only.
 *
 * A multi `ref` or `enum` row reads a lone string as a one-element list
 * everywhere (`valuesOf`): a preset, default preset or carousel rule stored
 * while the field was single keeps its value once the field takes several.
 *
 * Imports only relative modules and `@peek/shared-types` (see `options.ts`).
 */
import type {
  EditorKind,
  FieldSpec,
  NumberField,
  PanelField,
  RefField,
  RefModifier,
  RefSpec,
} from "@peek/shared-types";
import { makeCompositeKey, parseCompositeKey } from "../compositeKey";

/** The panel's filters: each row's key and companions, as the URL and presets hold them */
export type PanelState = Readonly<Record<string, unknown>>;

/** An active filter's chip, in parts: "Tags: any of A, B (with sub-tags)" */
export interface ChipParts {
  readonly label: string;
  readonly condition?: string;
  /** Values shown as they are */
  readonly values?: readonly string[];
  /** Entity refs, shown by name once resolved */
  readonly ids?: readonly string[];
  readonly suffix?: string;
}

export interface FieldCodec<F extends PanelField> {
  /** Its panel keys: the key and its companions (removing a chip clears all) */
  keys(field: F): readonly string[];
  /** The state filters on this row */
  isActive(field: F, state: PanelState): boolean;
  /**
   * A stored or typed value as the row reads it: the identity for every
   * row but a body measure, whose value is read leniently. Every reader of
   * state calls it, since a default preset becomes state without `readUrl`.
   */
  normalize(field: F, value: unknown): unknown;
  toCriterion(field: F, spec: FieldSpec, state: PanelState): unknown;
  fromCriterion(field: F, spec: FieldSpec, criterion: unknown): PanelState;
  /** Sets the row's key and companions in the URL's parameters */
  writeUrl(field: F, state: PanelState, params: URLSearchParams): void;
  /** The row's state the URL names; nothing for a key it lacks */
  readUrl(field: F, params: URLSearchParams): PanelState;
  chip(field: F, spec: FieldSpec, state: PanelState): ChipParts | null;
}

/**
 * A row's values: a list's strings, a lone string as a one-element list,
 * numbers as their text (a stored bare id), blanks dropped
 */
export const valuesOf = (value: unknown): string[] =>
  (Array.isArray(value) ? (value as unknown[]) : [value])
    .filter(
      (each): each is string | number =>
        (typeof each === "string" && each !== "") ||
        (typeof each === "number" && Number.isFinite(each))
    )
    .map(String);

const isWholeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

/** A ref field's criterion as the request carries it */
export interface RefCriterion {
  value: string[];
  modifier: RefModifier;
  depth?: number;
}

/** A page's permanent criterion of a field, in the request's shape */
interface PermanentRef {
  value?: unknown;
  modifier?: unknown;
  depth?: unknown;
}

const permanentOf = (value: unknown): PermanentRef =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PermanentRef)
    : {};

/**
 * One ref field's criterion: the row's picks merged with a page's permanent
 * criterion of the same field (a collection page's `groups`). The modifier
 * is the panel's choice when the row offers it, else the permanent
 * criterion's, else the row's default, else the field's, each only if the
 * field takes it (a stale Has ALL on a one-studio field falls back), so
 * every criterion carries the modifier the panel shows. Depth, on a
 * hierarchical field only: the permanent criterion's, else the panel's.
 */
export function refCriterionOf(
  spec: RefSpec,
  row: RefField | undefined,
  state: PanelState,
  permanent?: unknown
): RefCriterion | undefined {
  const fixed = permanentOf(permanent);
  const value = [
    ...new Set([
      ...valuesOf(fixed.value),
      ...valuesOf(row ? state[row.key] : undefined),
    ]),
  ];
  if (value.length === 0) return undefined;

  const takes = (candidate: unknown): candidate is RefModifier =>
    spec.modifiers.some((modifier) => modifier === candidate);
  const chosen =
    row?.modifierKey === undefined ? undefined : state[row.modifierKey];
  // A row with one modifier has no condition select
  const offered =
    row !== undefined &&
    row.modifiers.length > 1 &&
    row.modifiers.some((modifier) => modifier === chosen);
  const modifier =
    [
      offered ? chosen : undefined,
      fixed.modifier,
      row !== undefined && row.modifiers.length > 1
        ? row.defaultModifier
        : undefined,
    ].find(takes) ?? spec.defaultModifier;

  const depth = spec.hierarchical
    ? [
        fixed.depth,
        row?.hierarchyKey === undefined ? undefined : state[row.hierarchyKey],
      ].find(isWholeNumber)
    : undefined;
  return depth === undefined ? { value, modifier } : { value, modifier, depth };
}

/** A row's key, then its modifier and depth companions */
const keysOf = (field: PanelField): readonly string[] =>
  [field.key, field.modifierKey, field.hierarchyKey].filter(
    (key): key is string => key !== undefined
  );

/** A range or date range with a bound set */
const hasBound = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).some(
    (bound) => bound !== undefined && bound !== null && bound !== ""
  );

/** A range control's bounds, or none */
const rangeOf = (value: unknown): { min?: unknown; max?: unknown } =>
  typeof value === "object" && value !== null ? value : {};

/** A range bound as a whole number (the inputs hold strings), else undefined */
const wholeOf = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : typeof value === "string"
        ? parseInt(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** A bound as the URL and the editors hold it: a finite number, or text with something in it */
const isBound = (value: unknown): value is string | number =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && value !== "");

/** A bound that is a finite number (a number or its text), else undefined; kept as it was typed */
const finiteBound = (value: unknown): string | number | undefined =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value)))
    ? value
    : undefined;

/** The old feet-and-inches height of a bound, as centimetres to two decimals; undefined when blank */
const legacyHeightCm = (feet: unknown, inches: unknown): number | undefined => {
  const whole = (value: unknown) =>
    finiteBound(value) === undefined ? 0 : Number(value);
  const total = whole(feet) * 12 + whole(inches);
  return total > 0 ? Math.round(total * 2.54 * 100) / 100 : undefined;
};

/**
 * A body measure's range as the state holds it, read leniently: any finite
 * number, decimals kept, however far outside the editor's bounds; a
 * non-number dropped; the old `{ feetMin, inchesMin, feetMax, inchesMax }`
 * height shape read as centimetres. Undefined when no bound is left.
 */
function normalizeMeasure(
  measure: NonNullable<NumberField["measure"]>,
  value: unknown
): { min?: string | number; max?: string | number } | undefined {
  const range = rangeOf(value) as Record<string, unknown>;
  const legacy = measure === "height";
  const min =
    finiteBound(range.min) ??
    (legacy ? legacyHeightCm(range.feetMin, range.inchesMin) : undefined);
  const max =
    finiteBound(range.max) ??
    (legacy ? legacyHeightCm(range.feetMax, range.inchesMax) : undefined);
  if (min === undefined && max === undefined) return undefined;
  return {
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  };
}

/** A number row's value as the row reads it */
const normalizeNumber = (field: NumberField, value: unknown): unknown =>
  field.measure === undefined ? value : normalizeMeasure(field.measure, value);

/**
 * A number range: both bounds BETWEEN them; one bound GREATER_THAN min - 1
 * or LESS_THAN max + 1, so a lone whole bound is inclusive (S13 revisits
 * the encoding); undefined without a bound. `scale` converts the panel's
 * unit to the stored one (minutes to seconds, Mbps to bits per second).
 */
function numberCriterion(range: unknown, scale: number) {
  const { min: rawMin, max: rawMax } = rangeOf(range);
  const min = wholeOf(rawMin);
  const max = wholeOf(rawMax);
  if (min !== undefined && max !== undefined) {
    return { modifier: "BETWEEN", value: min * scale, value2: max * scale };
  }
  if (min !== undefined) {
    return { modifier: "GREATER_THAN", value: min * scale - 1 };
  }
  if (max !== undefined) {
    return { modifier: "LESS_THAN", value: max * scale + 1 };
  }
  return undefined;
}

/** A date range control's day, or undefined when unset */
const dayOf = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** A select's modifier when the row offers it, else the row's default, else the field's */
const enumModifierOf = (
  modifiers: readonly string[] | undefined,
  chosen: unknown,
  fallback: string
): string => modifiers?.find((modifier) => modifier === chosen) ?? fallback;

/** A row's value as it is */
const identity = (_field: PanelField, value: unknown): unknown => value;

/** A member a later task fills */
const notYet = (member: string) => (): never => {
  throw new Error(`${member}: not yet`);
};

/** The members C6 and C7 fill, throwing until then */
const pending = {
  fromCriterion: notYet("fromCriterion"),
  chip: notYet("chip"),
};

// ── The URL ───────────────────────────────────────────────────────────────

/**
 * Sets a value that has a URL form (a string, number or boolean). Any other
 * value would be written as "[object Object]" or "null", so it is left out.
 */
const setParam = (params: URLSearchParams, key: string, value: unknown) => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    params.set(key, String(value));
  }
};

/** The forms a range or date row takes in the URL (`rating_min`, `date_start`) */
export const RANGE_SUFFIXES = ["_min", "_max", "_start", "_end"] as const;

/**
 * The URL param that sets an entity filter to one entity: the row's key in
 * the singular (`tagIds` reads `tagId`; `studioId` and `sceneId` read
 * themselves). With the page's `instance` param it becomes "id:instance".
 * Card counts link to a list with it (`getFilteredListPath`).
 */
export const entityParamFor = (key: string) =>
  key.endsWith("Ids") ? key.slice(0, -1) : key;

/**
 * One entity from a singular param: joined with the page's `instance` param
 * into "id:instance", unless the value names its instance already (a
 * single-select filter's own value on a detail page, whose `instance` is the
 * page's entity).
 */
const entityRefFromParam = (value: string, instance: string | null) =>
  parseCompositeKey(value).instanceId === undefined
    ? makeCompositeKey(value, instance)
    : value;

/**
 * Every URL key a row owns: its key and companions, the singular form a
 * card count links with and the range and date forms of its key
 */
export const urlKeysOf = (field: PanelField): readonly string[] => {
  const [key, ...companions] = codecOf(field).keys(field);
  return [
    ...new Set([
      field.key,
      entityParamFor(field.key),
      ...(key === undefined ? [] : companions),
      ...RANGE_SUFFIXES.map((suffix) => field.key + suffix),
    ]),
  ];
};

/** A value the URL leaves out: nothing, a blank or an unchecked box */
const isUnset = (value: unknown) =>
  value === undefined || value === "" || value === false;

/** Writes the row's modifier and depth companions beside its value */
function writeCompanions(
  field: PanelField,
  state: PanelState,
  params: URLSearchParams
) {
  const modifier =
    field.modifierKey === undefined ? undefined : state[field.modifierKey];
  if (field.modifierKey !== undefined && modifier) {
    setParam(params, field.modifierKey, modifier);
  }
  const depth =
    field.hierarchyKey === undefined ? undefined : state[field.hierarchyKey];
  if (field.hierarchyKey !== undefined && depth !== undefined) {
    setParam(params, field.hierarchyKey, depth);
  }
}

/** Reads the row's modifier and depth companions, whenever the URL names them */
function readCompanions(field: PanelField, params: URLSearchParams) {
  const read: Record<string, unknown> = {};
  const modifier =
    field.modifierKey === undefined ? null : params.get(field.modifierKey);
  if (field.modifierKey !== undefined && modifier !== null) {
    read[field.modifierKey] = modifier;
  }
  const depth =
    field.hierarchyKey === undefined ? null : params.get(field.hierarchyKey);
  if (field.hierarchyKey !== undefined && depth !== null) {
    read[field.hierarchyKey] = parseInt(depth, 10);
  }
  return read;
}

/**
 * A row's URL writer: the value's own form, then the companions when the
 * row has a value at all (a blank, an unset box or nothing writes nothing)
 */
function urlWriter<F extends PanelField>(
  writeValue: (field: F, value: unknown, params: URLSearchParams) => void
): FieldCodec<F>["writeUrl"] {
  return (field, state, params) => {
    const value = state[field.key];
    if (isUnset(value)) return;
    writeValue(field, value, params);
    writeCompanions(field, state, params);
  };
}

/** A row's URL reader: the value's own form, then the companions */
function urlReader<F extends PanelField>(
  readValue: (field: F, params: URLSearchParams) => PanelState
): FieldCodec<F>["readUrl"] {
  return (field, params) => ({
    ...readValue(field, params),
    ...readCompanions(field, params),
  });
}

/** A range's bound as the URL writes it: a number, or text with something in it */
const boundParam = (value: unknown): string | undefined =>
  isBound(value) ? String(value) : undefined;

/** A key's value text when the URL has some */
const textParam = (params: URLSearchParams, key: string) => {
  const value = params.get(key);
  return value === null || value === "" ? undefined : value;
};

type CodecOf<K extends EditorKind> = FieldCodec<
  Extract<PanelField, { editor: K }>
>;

export const CODECS: { readonly [K in EditorKind]: CodecOf<K> } = {
  ref: {
    keys: keysOf,
    normalize: identity,
    isActive: (field, state) => valuesOf(state[field.key]).length > 0,
    toCriterion: (field, spec, state) =>
      spec.kind === "ref" ? refCriterionOf(spec, field, state) : undefined,
    // A list of ids joined with commas (a lone string is a one-element
    // list), or one id
    writeUrl: urlWriter((field, value, params) => {
      if (field.multi) {
        const ids = valuesOf(value);
        if (ids.length > 0) params.set(field.key, ids.join(","));
      } else if (value) {
        setParam(params, field.key, value);
      }
    }),
    // A card's count links with one entity and its instance
    // (/scenes?performerId=82&instance=abc-123 reads performerIds:
    // ["82:abc-123"]); it wins over the row's own list. A list's refs each
    // name their own instance
    readUrl: urlReader((field, params) => {
      const one = params.get(entityParamFor(field.key));
      const value = params.get(field.key);
      if (one) {
        const ref = entityRefFromParam(one, params.get("instance"));
        return { [field.key]: field.multi ? [ref] : ref };
      }
      if (value === null) return {};
      return {
        [field.key]: field.multi ? value.split(",").filter(Boolean) : value,
      };
    }),
    ...pending,
  },
  number: {
    keys: keysOf,
    normalize: normalizeNumber,
    isActive: (field, state) =>
      hasBound(normalizeNumber(field, state[field.key])),
    toCriterion: (field, _spec, state) =>
      numberCriterion(
        normalizeNumber(field, state[field.key]),
        field.scale ?? 1
      ),
    // A bound that is a number or text writes, zero included
    writeUrl: (field, state, params) => {
      const { min, max } = rangeOf(normalizeNumber(field, state[field.key]));
      const low = boundParam(min);
      const high = boundParam(max);
      if (low !== undefined) params.set(`${field.key}_min`, low);
      if (high !== undefined) params.set(`${field.key}_max`, high);
    },
    readUrl: (field, params) => {
      const min = textParam(params, `${field.key}_min`);
      const max = textParam(params, `${field.key}_max`);
      const range = {
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      };
      const read =
        field.measure === undefined
          ? range
          : normalizeMeasure(field.measure, range);
      return read === undefined || Object.keys(read).length === 0
        ? {}
        : { [field.key]: read };
    },
    ...pending,
  },
  date: {
    keys: keysOf,
    normalize: identity,
    isActive: (field, state) => hasBound(state[field.key]),
    writeUrl: (field, state, params) => {
      const { start, end } = rangeOf(state[field.key]) as {
        start?: unknown;
        end?: unknown;
      };
      if (typeof start === "string" && start !== "") {
        params.set(`${field.key}_start`, start);
      }
      if (typeof end === "string" && end !== "") {
        params.set(`${field.key}_end`, end);
      }
    },
    readUrl: (field, params) => {
      const start = textParam(params, `${field.key}_start`);
      const end = textParam(params, `${field.key}_end`);
      return start === undefined && end === undefined
        ? {}
        : {
            [field.key]: {
              ...(start === undefined ? {} : { start }),
              ...(end === undefined ? {} : { end }),
            },
          };
    },
    // Both BETWEEN them, a start alone GREATER_THAN it, an end alone
    // LESS_THAN it (S13 revisits the encoding)
    toCriterion: (field, _spec, state) => {
      const range = state[field.key];
      const { start, end } =
        typeof range === "object" && range !== null
          ? (range as { start?: unknown; end?: unknown })
          : {};
      const from = dayOf(start);
      const to = dayOf(end);
      if (from !== undefined && to !== undefined) {
        return { modifier: "BETWEEN", value: from, value2: to };
      }
      if (from !== undefined) return { modifier: "GREATER_THAN", value: from };
      if (to !== undefined) return { modifier: "LESS_THAN", value: to };
      return undefined;
    },
    ...pending,
  },
  text: {
    keys: keysOf,
    normalize: identity,
    writeUrl: urlWriter((field, value, params) => {
      if (value) setParam(params, field.key, value);
    }),
    readUrl: urlReader((field, params) =>
      params.has(field.key) ? { [field.key]: params.get(field.key) } : {}
    ),
    // A blank search sends nothing
    isActive: (field, state) => {
      const value = state[field.key];
      return typeof value === "string" && value.trim() !== "";
    },
    // The trimmed text as a substring
    toCriterion: (field, _spec, state) => {
      const value = state[field.key];
      const text = typeof value === "string" ? value.trim() : "";
      return text === "" ? undefined : { value: text, modifier: "INCLUDES" };
    },
    ...pending,
  },
  enum: {
    keys: keysOf,
    normalize: identity,
    writeUrl: urlWriter((field, value, params) => {
      if (value) setParam(params, field.key, value);
    }),
    readUrl: urlReader((field, params) =>
      params.has(field.key) ? { [field.key]: params.get(field.key) } : {}
    ),
    isActive: (field, state) => valuesOf(state[field.key]).length > 0,
    // A field of values sends those it takes (several: a list matching any
    // of them); a free-text field (hair colour) its value, compared whole
    toCriterion: (field, spec, state) => {
      const chosen = field.modifierKey && state[field.modifierKey];
      if (spec.kind === "text") {
        const [value] = valuesOf(state[field.key]);
        return value === undefined
          ? undefined
          : {
              value,
              modifier: enumModifierOf(
                field.modifiers,
                chosen,
                field.defaultModifier ?? spec.defaultModifier
              ),
            };
      }
      if (spec.kind !== "enum") return undefined;
      const values = valuesOf(state[field.key]).filter((value) =>
        spec.values.includes(value)
      );
      if (spec.multi) return values.length > 0 ? { value: values } : undefined;
      const [value] = values;
      return value === undefined
        ? undefined
        : {
            value,
            modifier: enumModifierOf(
              field.modifiers ?? spec.modifiers,
              chosen,
              field.defaultModifier ?? spec.defaultModifier
            ),
          };
    },
    ...pending,
  },
  choice: {
    keys: keysOf,
    normalize: identity,
    writeUrl: urlWriter((field, value, params) => {
      if (value) setParam(params, field.key, value);
    }),
    readUrl: urlReader((field, params) =>
      params.has(field.key) ? { [field.key]: params.get(field.key) } : {}
    ),
    // A choice that sends nothing ("All clips") does not filter
    isActive: (field, state) =>
      field.choices.some(
        (choice) =>
          choice.value === state[field.key] && choice.sends !== undefined
      ),
    // What the chosen choice sends; an unknown or missing value is the
    // row's default choice
    toCriterion: (field, _spec, state) => {
      const value = state[field.key];
      const text = typeof value === "boolean" ? String(value) : value;
      const choice =
        field.choices.find((each) => each.value === text) ??
        field.choices.find((each) => each.value === field.defaultValue);
      return choice?.sends;
    },
    ...pending,
  },
  toggle: {
    keys: keysOf,
    normalize: identity,
    writeUrl: urlWriter((field, value, params) => {
      if (value === true) params.set(field.key, "true");
    }),
    readUrl: urlReader((field, params) =>
      params.has(field.key)
        ? { [field.key]: params.get(field.key) === "true" }
        : {}
    ),
    // A checkbox, or a boolean from the URL ("TRUE")
    isActive: (field, state) =>
      state[field.key] === true || state[field.key] === "TRUE",
    toCriterion: (field, _spec, state) =>
      state[field.key] === true || state[field.key] === "TRUE"
        ? true
        : undefined,
    ...pending,
  },
};

/** A row's codec, whatever its editor */
export const codecOf = (field: PanelField): FieldCodec<PanelField> =>
  CODECS[field.editor] as FieldCodec<PanelField>;
