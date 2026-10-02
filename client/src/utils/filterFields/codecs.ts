/**
 * What each editor kind does with a panel row: the keys it holds, whether
 * it filters, and (filled by later tasks) its request criterion, its URL
 * parameters, its chip and how a stored criterion reads back.
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
import { feetInchesToCm, inchesToCm, lbsToKg } from "../unitConversions";

/** The panel's filters: each row's key and companions, as the URL and presets hold them */
export type PanelState = Readonly<Record<string, unknown>>;

/** What a request is built with besides the state */
export interface BuildContext {
  /** The viewer's units ("metric" or "imperial") */
  readonly unitPreference: string;
}

/** What the URL is read with besides its parameters */
export interface UrlContext {
  /** The viewer's units ("metric" or "imperial") */
  readonly unitPreference: string;
}

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
  toCriterion(
    field: F,
    spec: FieldSpec,
    state: PanelState,
    ctx: BuildContext
  ): unknown;
  fromCriterion(field: F, spec: FieldSpec, criterion: unknown): PanelState;
  writeUrl(field: F, state: PanelState, params: URLSearchParams): void;
  readUrl(field: F, params: URLSearchParams, ctx: UrlContext): PanelState;
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

/** A decimal bound (penis length in inches), else undefined */
const decimalOf = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * An imperial viewer's body measure in metric: Height from the feet and
 * inches editor, Weight from lbs, Penis Length from inches (with decimals).
 * C5 moves the conversion into the editors and removes this.
 */
function metricMeasure(
  measure: NonNullable<NumberField["measure"]>,
  value: unknown
): unknown {
  const range = rangeOf(value);
  if (measure === "height") {
    const height = range as {
      feetMin?: unknown;
      inchesMin?: unknown;
      feetMax?: unknown;
      inchesMax?: unknown;
    };
    const cm: { min?: number; max?: number } = {};
    const minFeet = wholeOf(height.feetMin) ?? 0;
    const minInches = wholeOf(height.inchesMin) ?? 0;
    if (minFeet || minInches) cm.min = feetInchesToCm(minFeet, minInches);
    const maxFeet = wholeOf(height.feetMax) ?? 0;
    const maxInches = wholeOf(height.inchesMax) ?? 0;
    if (maxFeet || maxInches) cm.max = feetInchesToCm(maxFeet, maxInches);
    return cm.min !== undefined || cm.max !== undefined
      ? { ...range, ...cm }
      : value;
  }
  const bound = measure === "weight" ? wholeOf : decimalOf;
  const toMetric = measure === "weight" ? lbsToKg : inchesToCm;
  const min = bound(range.min);
  const max = bound(range.max);
  return min || max
    ? {
        ...range,
        ...(min ? { min: toMetric(min) } : {}),
        ...(max ? { max: toMetric(max) } : {}),
      }
    : value;
}

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

/** A member a later task fills */
const notYet = (member: string) => (): never => {
  throw new Error(`${member}: not yet`);
};

/** The members C4 to C7 fill, throwing until then */
const pending = {
  fromCriterion: notYet("fromCriterion"),
  writeUrl: notYet("writeUrl"),
  readUrl: notYet("readUrl"),
  chip: notYet("chip"),
};

type CodecOf<K extends EditorKind> = FieldCodec<
  Extract<PanelField, { editor: K }>
>;

export const CODECS: { readonly [K in EditorKind]: CodecOf<K> } = {
  ref: {
    keys: keysOf,
    isActive: (field, state) => valuesOf(state[field.key]).length > 0,
    toCriterion: (field, spec, state) =>
      spec.kind === "ref" ? refCriterionOf(spec, field, state) : undefined,
    ...pending,
  },
  number: {
    keys: keysOf,
    isActive: (field, state) => hasBound(state[field.key]),
    toCriterion: (field, _spec, state, ctx) =>
      numberCriterion(
        ctx.unitPreference === "imperial" && field.measure !== undefined
          ? metricMeasure(field.measure, state[field.key])
          : state[field.key],
        field.scale ?? 1
      ),
    ...pending,
  },
  date: {
    keys: keysOf,
    isActive: (field, state) => hasBound(state[field.key]),
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
