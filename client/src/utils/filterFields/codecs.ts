/**
 * What each editor kind does with a panel row: the keys it holds, whether
 * it filters, its request criterion and how a stored one reads back, its
 * URL parameters and its chip.
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
 * A ref row with an `excludeKey` holds the ids it includes under its key and
 * those it excludes under the companion (`tagIds`, `tagIdsExclude`), and
 * sends `{ value, excludes }`. Under Has NONE every pick excludes, so the
 * excluded ids join `value` and a stored `<key>Modifier: EXCLUDES` keeps
 * meaning Has NONE; a key without the companion reads as includes. A row
 * offering Has none or Has any (IS_NULL, NOT_NULL) sends that alone, with no
 * ids, and writes only its modifier to the URL.
 *
 * A ref row on a `playlist` field (`source: "playlists"`) holds Peek
 * playlist ids: decimal strings in the state and the URL, never joined with
 * the page's `instance`, sent as numbers. A text row with a condition select
 * holds its modifier under `<key>Modifier`; "Has none" and "Has any", where
 * its field takes them, send no text.
 *
 * Imports only relative modules and `@peek/shared-types` (see `options.ts`).
 */
import type {
  EditorKind,
  EnumField,
  FieldSpec,
  NumberField,
  PanelField,
  PlaylistSpec,
  RefField,
  RefFieldModifier,
  RefModifier,
  RefSpec,
  TextField,
} from "@peek/shared-types";
import { makeCompositeKey, parseCompositeKey } from "../compositeKey";
import {
  UNITS,
  cmToFeetInches,
  cmToLengthInches,
  kgToLbs,
} from "../unitConversions";

/** The panel's filters: each row's key and companions, as the URL and presets hold them */
export type PanelState = Readonly<Record<string, unknown>>;

/**
 * An active filter's chip, in parts: "Tags: any of A, B, with sub-tags" is
 * the label `Tags`, the condition `any of`, the ids' names and the suffix
 * `, with sub-tags`
 */
export interface ChipParts {
  readonly label: string;
  readonly condition?: string;
  /** Values shown as they are */
  readonly values?: readonly string[];
  /** Entity refs, shown by name once resolved */
  readonly ids?: readonly string[];
  /** Entity refs excluded beside them ("not Redhead"), shown by name */
  readonly excludedIds?: readonly string[];
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
  /**
   * A stored criterion as the row's state, the inverse of `toCriterion`;
   * empty when the row cannot edit it, so the caller keeps it as stored
   */
  fromCriterion(field: F, spec: FieldSpec, criterion: unknown): PanelState;
  /** Sets the row's key and companions in the URL's parameters */
  writeUrl(field: F, state: PanelState, params: URLSearchParams): void;
  /** The row's state the URL names; nothing for a key it lacks */
  readUrl(field: F, params: URLSearchParams): PanelState;
  /**
   * The row's chip, or null when it does not filter. Body measures read in
   * `unitPreference` (the state is metric either way).
   */
  chip(
    field: F,
    spec: FieldSpec,
    state: PanelState,
    unitPreference?: string
  ): ChipParts | null;
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

/**
 * A ref field's criterion as the request carries it: the ids, those
 * excluded beside them, or a presence check with no ids
 */
export interface RefCriterion {
  value?: string[];
  excludes?: string[];
  modifier: RefFieldModifier;
  depth?: number;
}

/** A page's permanent criterion of a field, in the request's shape */
interface PermanentRef {
  value?: unknown;
  excludes?: unknown;
  modifier?: unknown;
  depth?: unknown;
}

const permanentOf = (value: unknown): PermanentRef =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PermanentRef)
    : {};

/** "Has none" and "Has any": a presence check, sent with no ids */
const PRESENCE_MODIFIERS = ["IS_NULL", "NOT_NULL"] as const;
type Presence = (typeof PRESENCE_MODIFIERS)[number];

const asPresence = (value: unknown): Presence | undefined =>
  PRESENCE_MODIFIERS.find((modifier) => modifier === value);

/**
 * The presence choice a ref row holds, when the row offers it ("Has none",
 * "Has any"); while one is set the picks are ignored: not sent, not written
 * to the URL, not on the chip
 */
const refPresenceOf = (
  field: RefField,
  state: PanelState
): Presence | undefined => {
  if (field.modifierKey === undefined) return undefined;
  const presence = asPresence(state[field.modifierKey]);
  return presence !== undefined &&
    field.modifiers.some((modifier) => modifier === presence)
    ? presence
    : undefined;
};

/** The ids a ref row excludes: its exclude companion's, none without one */
const excludedOf = (field: RefField | undefined, state: PanelState) =>
  field?.excludeKey === undefined ? [] : valuesOf(state[field.excludeKey]);

/**
 * One ref field's criterion: the row's picks merged with a page's permanent
 * criterion of the same field (a collection page's `groups`). The modifier
 * is the panel's choice when the row offers it, else the permanent
 * criterion's, else the row's default, else the field's, each only if the
 * field takes it (a stale Has ALL on a one-studio field falls back), so
 * every criterion carries the modifier the panel shows. Depth, on a
 * hierarchical field only: the permanent criterion's, else the panel's.
 * The row's excluded ids go in `excludes` on an excludable field (an id
 * also picked stays a pick), and join `value` under EXCLUDES, where every
 * id already excludes. A presence choice the row offers, beside no
 * permanent ids, is sent alone.
 */
export function refCriterionOf(
  spec: RefSpec,
  row: RefField | undefined,
  state: PanelState,
  permanent?: unknown
): RefCriterion | undefined {
  const fixed = permanentOf(permanent);
  const takes = (candidate: unknown): candidate is RefFieldModifier =>
    spec.modifiers.some((modifier) => modifier === candidate);

  const presence = row === undefined ? undefined : refPresenceOf(row, state);
  if (
    presence !== undefined &&
    takes(presence) &&
    valuesOf(fixed.value).length === 0 &&
    valuesOf(fixed.excludes).length === 0
  ) {
    return { modifier: presence };
  }

  const picked = [
    ...new Set([
      ...valuesOf(fixed.value),
      ...valuesOf(row ? state[row.key] : undefined),
    ]),
  ];
  const excluded = spec.excludable
    ? [
        ...new Set([...valuesOf(fixed.excludes), ...excludedOf(row, state)]),
      ].filter((id) => !picked.includes(id))
    : [];
  if (picked.length === 0 && excluded.length === 0) return undefined;

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
    ]
      .filter((candidate) => asPresence(candidate) === undefined)
      .find(takes) ?? spec.defaultModifier;

  const depth = spec.hierarchical
    ? [
        fixed.depth,
        row?.hierarchyKey === undefined ? undefined : state[row.hierarchyKey],
      ].find(isWholeNumber)
    : undefined;
  const none = modifier === "EXCLUDES";
  const value = none ? [...picked, ...excluded] : picked;
  const excludes = none ? [] : excluded;
  return {
    value,
    ...(excludes.length === 0 ? {} : { excludes }),
    modifier,
    ...(depth === undefined ? {} : { depth }),
  };
}

/** A playlist field's criterion as the request carries it: Peek playlist ids */
export interface PlaylistCriterion {
  value: number[];
  modifier: RefModifier;
}

/** A Peek playlist id as the state holds it: a positive whole number's digits */
const PLAYLIST_ID = /^[1-9]\d*$/;

/**
 * A playlist row's criterion: its ids that spell a playlist id, as numbers
 * (an id the viewer can no longer read is sent too, and matches nothing);
 * the modifier the row's condition select holds when the field takes it,
 * else the row's default, else the field's. Undefined without an id.
 */
export function playlistCriterionOf(
  spec: PlaylistSpec,
  row: RefField,
  state: PanelState
): PlaylistCriterion | undefined {
  const value = [
    ...new Set(
      valuesOf(state[row.key])
        .filter((id) => PLAYLIST_ID.test(id))
        .map(Number)
    ),
  ];
  if (value.length === 0) return undefined;
  const takes = (candidate: unknown): candidate is RefModifier =>
    spec.modifiers.some((modifier) => modifier === candidate) &&
    row.modifiers.some((modifier) => modifier === candidate);
  const chosen =
    row.modifierKey === undefined ? undefined : state[row.modifierKey];
  const modifier =
    [row.modifiers.length > 1 ? chosen : undefined, row.defaultModifier].find(
      takes
    ) ?? spec.defaultModifier;
  return { value, modifier };
}

/** A row's key, then its modifier, depth and exclude companions */
const keysOf = (field: PanelField): readonly string[] =>
  [
    field.key,
    field.modifierKey,
    field.hierarchyKey,
    field.editor === "ref" ? field.excludeKey : undefined,
  ].filter((key): key is string => key !== undefined);

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

/** A range bound as a number, decimals kept (the inputs hold strings), else undefined */
const boundOf = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** A bound in the stored unit, without the float noise of the multiplication (1.1 Mbps is 1100000) */
const scaledBound = (bound: number, scale: number): number =>
  Number((bound * scale).toPrecision(12));

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
 * The presence choice a number row holds, if any. While one is set the
 * bounds are ignored: not sent, not written to the URL, not on the chip.
 */
const presenceOf = (field: NumberField, state: PanelState) =>
  field.modifierKey === undefined
    ? undefined
    : asPresence(state[field.modifierKey]);

/**
 * A number row's request criterion: the presence choice with no value, else
 * its range
 */
function numberRowCriterion(field: NumberField, state: PanelState) {
  const presence = presenceOf(field, state);
  return presence === undefined
    ? numberCriterion(
        normalizeNumber(field, state[field.key]),
        field.scale ?? 1
      )
    : { modifier: presence };
}

/**
 * A number range as BETWEEN, inclusive: both bounds as `value` and `value2`,
 * a lone minimum as `value` alone and a lone maximum as `value2` alone;
 * decimals kept; undefined without a bound. `scale` converts the panel's unit
 * to the stored one (minutes to seconds, Mbps to bits per second).
 */
function numberCriterion(range: unknown, scale: number) {
  const { min: rawMin, max: rawMax } = rangeOf(range);
  const min = boundOf(rawMin);
  const max = boundOf(rawMax);
  if (min === undefined && max === undefined) return undefined;
  return {
    modifier: "BETWEEN",
    ...(min === undefined ? {} : { value: scaledBound(min, scale) }),
    ...(max === undefined ? {} : { value2: scaledBound(max, scale) }),
  };
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

/**
 * The modifiers a text row's condition select offers that its field takes;
 * none without a select (a `modifierKey` and more than one modifier)
 */
const textModifiersOf = (
  field: TextField,
  spec: FieldSpec
): readonly string[] =>
  field.modifierKey !== undefined &&
  field.modifiers !== undefined &&
  field.modifiers.length > 1 &&
  spec.kind === "text"
    ? field.modifiers.filter((modifier) =>
        (spec.modifiers as readonly string[]).includes(modifier)
      )
    : [];

/**
 * The presence choice a text row's condition select holds, when it offers
 * it ("Has none", "Has any"); while one is set the text is ignored
 */
const textPresenceOf = (
  field: TextField,
  state: PanelState
): Presence | undefined => {
  if (field.modifierKey === undefined) return undefined;
  const presence = asPresence(state[field.modifierKey]);
  return presence !== undefined &&
    field.modifiers !== undefined &&
    field.modifiers.length > 1 &&
    field.modifiers.some((modifier) => modifier === presence)
    ? presence
    : undefined;
};

/** What a text row with no condition chosen matches: a substring */
const TEXT_DEFAULT = "INCLUDES";

/**
 * What a text row matches with no condition chosen: its field's default
 * (a StashDB id is equal to one), a substring when the field says nothing
 */
const textDefaultOf = (spec: FieldSpec): string =>
  spec.kind === "text" ? spec.defaultModifier : TEXT_DEFAULT;

/**
 * A text row's modifier: the condition select's when the row offers it and
 * its field takes it, else a substring
 */
function textModifierOf(
  field: TextField,
  spec: FieldSpec,
  state: PanelState
): string {
  const chosen =
    field.modifierKey === undefined ? undefined : state[field.modifierKey];
  return (
    textModifiersOf(field, spec).find((modifier) => modifier === chosen) ??
    textDefaultOf(spec)
  );
}

/** A text row's trimmed text, "" for none */
const textOf = (field: TextField, state: PanelState): string => {
  const value = state[field.key];
  return typeof value === "string" ? value.trim() : "";
};

/** A text row's request criterion: its presence choice alone, else its text */
function textCriterion(
  field: TextField,
  spec: FieldSpec,
  state: PanelState
): { value?: string; modifier: string } | undefined {
  const modifier = textModifierOf(field, spec, state);
  if (asPresence(modifier) !== undefined) return { modifier };
  const text = textOf(field, state);
  return text === "" ? undefined : { value: text, modifier };
}

// ── Chips ─────────────────────────────────────────────────────────────────

/** The row's name on a chip: its label without the unit in brackets ("Rating (0-100)") */
const chipLabel = (field: PanelField): string =>
  field.label.replace(/ \([^)]*\)$/, "");

/** The condition select's words on a chip; presence reads as the select's words, lower-case */
const REF_CONDITIONS = {
  has: {
    INCLUDES_ALL: "all of",
    INCLUDES: "any of",
    EXCLUDES: "none of",
    IS_NULL: "has none",
    NOT_NULL: "has any",
  },
  in: {
    INCLUDES_ALL: "in all of",
    INCLUDES: "in any of",
    EXCLUDES: "not in",
    IS_NULL: "in none",
    NOT_NULL: "in any",
  },
} as const satisfies Record<string, Record<RefFieldModifier, string>>;

/** A text row's condition on a chip, when the row has a condition select */
const TEXT_CONDITIONS: Readonly<Record<string, string>> = {
  INCLUDES: "contains",
  EXCLUDES: "excludes",
  EQUALS: "equals",
  NOT_EQUALS: "not equals",
  STARTS_WITH: "starts with",
  IS_NULL: "has none",
  NOT_NULL: "has any",
};

const ENUM_CONDITIONS: Readonly<Record<string, string>> = {
  EQUALS: "is",
  NOT_EQUALS: "is not",
  GREATER_THAN: "higher than",
  LESS_THAN: "lower than",
};

/**
 * A ref row's chip: its ids to be named, its condition and whether it takes
 * sub-entities ("Tags: any of A; not B, with sub-tags"); excludes alone read
 * "Tags: not B"; a presence choice "Studios: has none"
 */
function refChip(
  field: RefField,
  spec: FieldSpec,
  state: PanelState
): ChipParts | null {
  const words: Readonly<Record<string, string>> =
    REF_CONDITIONS[field.modifierLabels ?? "has"];
  const label = chipLabel(field);
  if (spec.kind === "playlist") {
    const playlists = playlistCriterionOf(spec, field, state);
    if (playlists === undefined) return null;
    const condition =
      field.modifiers.length > 1 ? words[playlists.modifier] : undefined;
    return {
      label,
      ...(condition === undefined ? {} : { condition }),
      ids: playlists.value.map(String),
    };
  }
  if (spec.kind !== "ref") return null;
  const criterion = refCriterionOf(spec, field, state);
  if (criterion === undefined) return null;
  const presence = asPresence(criterion.modifier);
  if (presence !== undefined) {
    return { label, values: [words[presence] ?? presence.toLowerCase()] };
  }
  const ids = criterion.value ?? [];
  const excludedIds = criterion.excludes ?? [];
  // One modifier offered: no condition select, so no condition to name
  const condition =
    field.modifiers.length > 1 && ids.length > 0
      ? words[criterion.modifier]
      : undefined;
  const withDescendants =
    criterion.depth !== undefined && criterion.depth !== 0;
  return {
    label,
    ...(condition === undefined ? {} : { condition }),
    ids,
    ...(excludedIds.length === 0 ? {} : { excludedIds }),
    ...(withDescendants
      ? {
          suffix: `, with ${(field.hierarchyLabel ?? "sub-items").replace(/^Include /i, "")}`,
        }
      : {}),
  };
}

/** A range's lone or both bounds in words: "40 to 80", "at least 40", "at most 40" */
function rangeParts(
  low: string | undefined,
  high: string | undefined,
  unit = ""
): Pick<ChipParts, "condition" | "values"> {
  if (low !== undefined && high !== undefined) {
    return { values: [`${low} to ${high}${unit}`] };
  }
  return low !== undefined
    ? { condition: "at least", values: [`${low}${unit}`] }
    : { condition: "at most", values: [`${high ?? ""}${unit}`] };
}

/** A bound's text, or undefined when it holds none */
const boundText = (value: unknown): string | undefined =>
  isBound(value) ? String(value) : undefined;

/**
 * A body measure's metric bound as the viewer reads it: its number and the
 * unit after the range. An imperial height reads as feet and inches, each
 * bound with its own unit (`5 ft 10 in`); a value that is no number shows
 * as it is.
 */
function measureBound(
  measure: NonNullable<NumberField["measure"]>,
  value: string,
  unitPreference: string
): { text: string; unit: string } {
  const metric = Number(value);
  const imperial = unitPreference === UNITS.IMPERIAL;
  if (!Number.isFinite(metric)) return { text: value, unit: "" };
  switch (measure) {
    case "height": {
      if (!imperial) return { text: value, unit: " cm" };
      const { feet, inches } = cmToFeetInches(metric);
      return { text: `${feet} ft ${inches} in`, unit: "" };
    }
    case "weight":
      return imperial
        ? { text: String(kgToLbs(metric)), unit: " lbs" }
        : { text: value, unit: " kg" };
    case "length":
      return imperial
        ? { text: String(cmToLengthInches(metric)), unit: " in" }
        : { text: value, unit: " cm" };
  }
}

/** A number row's chip: its range in the viewer's unit */
function numberChip(
  field: NumberField,
  state: PanelState,
  unitPreference: string
): ChipParts | null {
  const presence = presenceOf(field, state);
  if (presence !== undefined) {
    const words = field.presenceLabels ?? { isNull: "Not set", notNull: "Set" };
    const word = presence === "IS_NULL" ? words.isNull : words.notNull;
    return { label: chipLabel(field), values: [word.toLowerCase()] };
  }
  const { min, max } = rangeOf(normalizeNumber(field, state[field.key]));
  const low = boundText(min);
  const high = boundText(max);
  if (low === undefined && high === undefined) return null;
  const label = chipLabel(field);
  if (field.measure !== undefined) {
    const { measure } = field;
    const shown = [low, high].map((bound) =>
      bound === undefined
        ? undefined
        : measureBound(measure, bound, unitPreference)
    );
    return {
      label,
      ...rangeParts(
        shown[0]?.text,
        shown[1]?.text,
        (shown[0] ?? shown[1])?.unit
      ),
    };
  }
  return {
    label,
    ...rangeParts(low, high, field.unit === undefined ? "" : ` ${field.unit}`),
  };
}

/** A date row's chip: "from 2020-01-01", "until 2020-12-31" or both */
function dateChip(field: PanelField, state: PanelState): ChipParts | null {
  const { start, end } = rangeOf(state[field.key]) as {
    start?: unknown;
    end?: unknown;
  };
  const from = dayOf(start);
  const to = dayOf(end);
  const label = chipLabel(field);
  if (from !== undefined && to !== undefined) {
    return { label, values: [`${from} to ${to}`] };
  }
  if (from !== undefined) return { label, condition: "from", values: [from] };
  if (to !== undefined) return { label, condition: "until", values: [to] };
  return null;
}

/** A select's chip: its choices' labels, and the comparison when the row has a condition select */
function enumChip(
  field: EnumField,
  spec: FieldSpec,
  state: PanelState
): ChipParts | null {
  const stored = valuesOf(state[field.key]);
  if (stored.length === 0) return null;
  const values = stored.map(
    (value) =>
      field.choices.find((choice) => choice.value === value)?.label ?? value
  );
  const chosen = field.modifierKey && state[field.modifierKey];
  const modifier =
    field.modifierKey === undefined
      ? undefined
      : enumModifierOf(
          field.modifiers,
          chosen,
          field.defaultModifier ??
            (spec.kind === "enum" || spec.kind === "text"
              ? spec.defaultModifier
              : "EQUALS")
        );
  const condition =
    modifier === undefined ? undefined : ENUM_CONDITIONS[modifier];
  return {
    label: chipLabel(field),
    ...(condition === undefined ? {} : { condition }),
    values,
  };
}

// ── Stored criteria read back ─────────────────────────────────────────────

/**
 * A stored criterion's parts, or undefined when it is no object or carries
 * a key the row cannot edit (a later task's `excludes`), so the caller
 * keeps it as stored
 */
function partsOf(
  criterion: unknown,
  allowed: readonly string[]
): Record<string, unknown> | undefined {
  if (
    typeof criterion !== "object" ||
    criterion === null ||
    Array.isArray(criterion)
  ) {
    return undefined;
  }
  return Object.keys(criterion).every((key) => allowed.includes(key))
    ? (criterion as Record<string, unknown>)
    : undefined;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A stored bound in the panel's unit, undefined when it is no finite number */
const unscaled = (value: unknown, scale: number): number | undefined =>
  isFiniteNumber(value) ? value / scale : undefined;

/**
 * A stored number criterion as the range control holds it, in the panel's
 * unit: BETWEEN its two values, or one of them (`value` alone a min, `value2`
 * alone a max); the old lone bounds back to the bound typed (GREATER_THAN v
 * is a min of v + 1, LESS_THAN v a max of v - 1); undefined for any other
 * shape.
 */
function rangeFromCriterion(
  criterion: unknown,
  scale: number
): { min?: number; max?: number } | undefined {
  const parts = partsOf(criterion, ["modifier", "value", "value2"]);
  if (parts === undefined) return undefined;
  const { modifier, value, value2 } = parts;
  if (modifier === "BETWEEN") {
    const low = value === undefined ? undefined : unscaled(value, scale);
    const high = value2 === undefined ? undefined : unscaled(value2, scale);
    if (
      (value !== undefined && low === undefined) ||
      (value2 !== undefined && high === undefined)
    ) {
      return undefined;
    }
    if (low === undefined && high === undefined) return undefined;
    return {
      ...(low === undefined ? {} : { min: low }),
      ...(high === undefined ? {} : { max: high }),
    };
  }
  if (!isFiniteNumber(value) || value2 !== undefined) return undefined;
  if (modifier === "GREATER_THAN") return { min: (value + 1) / scale };
  if (modifier === "LESS_THAN") return { max: (value - 1) / scale };
  return undefined;
}

/** The timestamp fields; every other date field holds a calendar date */
const TIMESTAMP_FIELDS: readonly string[] = [
  "created_at",
  "updated_at",
  "last_played_at",
];

/** The day after a `YYYY-MM-DD` day; anything else as it was */
function nextDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * A stored date criterion as the date range control holds it: BETWEEN its
 * two days, or one of them (`value` alone a start, `value2` alone an end); the
 * old lone bounds, GREATER_THAN a start (a calendar date matched from the day
 * after, so its start is the next day; a timestamp matched most of that day,
 * so its start is the day itself) and LESS_THAN an end; undefined for any
 * other shape.
 */
function dateRangeFromCriterion(
  criterion: unknown,
  contractField: string
): { start?: string; end?: string } | undefined {
  const parts = partsOf(criterion, ["modifier", "value", "value2"]);
  if (parts === undefined) return undefined;
  const from = parts.value === undefined ? undefined : dayOf(parts.value);
  const to = parts.value2 === undefined ? undefined : dayOf(parts.value2);
  if (parts.modifier === "BETWEEN") {
    if (
      (parts.value !== undefined && from === undefined) ||
      (parts.value2 !== undefined && to === undefined) ||
      (from === undefined && to === undefined)
    ) {
      return undefined;
    }
    return {
      ...(from === undefined ? {} : { start: from }),
      ...(to === undefined ? {} : { end: to }),
    };
  }
  if (from === undefined || parts.value2 !== undefined) return undefined;
  if (parts.modifier === "GREATER_THAN") {
    return {
      start: TIMESTAMP_FIELDS.includes(contractField) ? from : nextDay(from),
    };
  }
  if (parts.modifier === "LESS_THAN") return { end: from };
  return undefined;
}

/**
 * A stored ref criterion as the row edits it: its ids as stored (a bare id
 * stays bare, a lone id is a one-element list), its `excludes` under the
 * exclude companion, the modifier when the row offers it and the depth when
 * the row takes one; a presence check the row offers as its choice alone.
 * Nothing when the row cannot edit it: no ids, a modifier it does not
 * offer, several ids on a one-pick row, a depth it does not take, excludes
 * on a row without the companion.
 */
function refFromCriterion(
  field: RefField,
  spec: FieldSpec,
  criterion: unknown
): PanelState {
  if (spec.kind === "playlist") {
    return playlistFromCriterion(field, spec, criterion);
  }
  const parts = partsOf(criterion, ["value", "excludes", "modifier", "depth"]);
  if (parts === undefined || spec.kind !== "ref") return {};
  const modifier = parts.modifier ?? spec.defaultModifier;
  const offered = field.modifiers.some((each) => each === modifier);
  const presence = asPresence(modifier);
  if (presence !== undefined) {
    return offered && field.modifierKey !== undefined
      ? { [field.modifierKey]: presence }
      : {};
  }
  const ids = valuesOf(parts.value);
  const excluded = valuesOf(parts.excludes);
  const { depth } = parts;
  const takesDepth =
    depth === undefined ||
    (field.hierarchyKey !== undefined && isWholeNumber(depth));
  if (
    (ids.length === 0 && excluded.length === 0) ||
    (excluded.length > 0 && field.excludeKey === undefined) ||
    !offered ||
    !takesDepth ||
    (!field.multi && ids.length > 1)
  ) {
    return {};
  }
  return {
    ...(ids.length === 0 ? {} : { [field.key]: field.multi ? ids : ids[0] }),
    ...(field.excludeKey === undefined || excluded.length === 0
      ? {}
      : { [field.excludeKey]: excluded }),
    ...(field.modifierKey === undefined
      ? {}
      : { [field.modifierKey]: modifier }),
    ...(field.hierarchyKey === undefined || depth === undefined
      ? {}
      : { [field.hierarchyKey]: depth }),
  };
}

/**
 * A stored playlist criterion as the row edits it: its ids as decimal
 * strings and its modifier when the row offers it. Nothing for an id that
 * is no positive whole number, a modifier the row does not offer, or no ids.
 */
function playlistFromCriterion(
  field: RefField,
  spec: PlaylistSpec,
  criterion: unknown
): PanelState {
  const parts = partsOf(criterion, ["value", "modifier"]);
  if (parts === undefined || !Array.isArray(parts.value)) return {};
  const ids = (parts.value as unknown[]).map((id) =>
    typeof id === "number" && Number.isInteger(id) && id > 0
      ? String(id)
      : undefined
  );
  const modifier = parts.modifier ?? spec.defaultModifier;
  const offered = field.modifiers.some((each) => each === modifier);
  if (
    ids.length === 0 ||
    ids.some((id) => id === undefined) ||
    !offered ||
    (!field.multi && ids.length > 1)
  ) {
    return {};
  }
  const values = ids.filter((id): id is string => id !== undefined);
  return {
    [field.key]: field.multi ? values : values[0],
    ...(field.modifierKey === undefined
      ? {}
      : { [field.modifierKey]: modifier }),
  };
}

/**
 * A stored select criterion as the row edits it: one value the row offers,
 * with its modifier when the row has a condition select (else the modifier
 * the row sends). Nothing for a value or modifier the row cannot show.
 */
function enumFromCriterion(
  field: EnumField,
  spec: FieldSpec,
  criterion: unknown
): PanelState {
  const parts = partsOf(criterion, ["value", "modifier"]);
  if (parts === undefined) return {};
  const values = valuesOf(parts.value);
  const [value] = values;
  if (
    values.length !== 1 ||
    value === undefined ||
    !field.choices.some((choice) => choice.value === value)
  ) {
    return {};
  }
  if (spec.kind === "enum" && spec.multi) {
    // A list matching any of them sends no modifier
    return parts.modifier === undefined ? { [field.key]: value } : {};
  }
  if (spec.kind !== "enum" && spec.kind !== "text") return {};
  const sent = field.defaultModifier ?? spec.defaultModifier;
  const modifier = parts.modifier ?? spec.defaultModifier;
  // What `toCriterion` can send: the row's condition select's (a values
  // field falls back to the field's), else the one it always sends
  const offered: readonly string[] =
    field.modifierKey === undefined
      ? [sent]
      : (field.modifiers ?? (spec.kind === "enum" ? spec.modifiers : [sent]));
  if (typeof modifier !== "string" || !offered.includes(modifier)) return {};
  return {
    [field.key]: value,
    ...(field.modifierKey === undefined
      ? {}
      : { [field.modifierKey]: modifier }),
  };
}

/**
 * A stored text criterion: text with something in it, under a substring or
 * a condition the row offers (with that condition when the row has a select),
 * or a presence check the row offers alone; else nothing
 */
function textFromCriterion(
  field: TextField,
  spec: FieldSpec,
  criterion: unknown
): PanelState {
  const parts = partsOf(criterion, ["value", "modifier"]);
  if (parts === undefined || spec.kind !== "text") return {};
  const { value } = parts;
  const modifier = parts.modifier ?? spec.defaultModifier;
  const offered = textModifiersOf(field, spec);
  const withModifier =
    field.modifierKey === undefined || offered.length === 0
      ? {}
      : { [field.modifierKey]: modifier };
  if (typeof modifier !== "string") return {};
  if (asPresence(modifier) !== undefined) {
    return offered.includes(modifier) && (value === undefined || value === null)
      ? withModifier
      : {};
  }
  const known = offered.length > 0 ? offered : [textDefaultOf(spec)];
  return typeof value === "string" &&
    value.trim() !== "" &&
    known.includes(modifier)
    ? { [field.key]: value, ...withModifier }
    : {};
}

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
    // Its picks, its exclusions, or a presence choice it offers
    isActive: (field, state) =>
      refPresenceOf(field, state) !== undefined ||
      valuesOf(state[field.key]).length > 0 ||
      excludedOf(field, state).length > 0,
    toCriterion: (field, spec, state) =>
      spec.kind === "ref"
        ? refCriterionOf(spec, field, state)
        : spec.kind === "playlist"
          ? playlistCriterionOf(spec, field, state)
          : undefined,
    // A presence choice writes its modifier alone. Else a list of ids
    // joined with commas (a lone string is a one-element list), or one id;
    // the excluded ids the same way under the exclude companion; then the
    // modifier and depth when either list has an id or the key is set
    writeUrl: (field, state, params) => {
      const presence = refPresenceOf(field, state);
      if (presence !== undefined && field.modifierKey !== undefined) {
        params.set(field.modifierKey, presence);
        return;
      }
      const value = state[field.key];
      const excluded = excludedOf(field, state);
      if (isUnset(value) && excluded.length === 0) return;
      if (field.multi) {
        const ids = valuesOf(value);
        if (ids.length > 0) params.set(field.key, ids.join(","));
      } else if (value) {
        setParam(params, field.key, value);
      }
      if (field.excludeKey !== undefined && excluded.length > 0) {
        params.set(field.excludeKey, excluded.join(","));
      }
      writeCompanions(field, state, params);
    },
    // A card's count links with one entity and its instance
    // (/scenes?performerId=82&instance=abc-123 reads performerIds:
    // ["82:abc-123"]); it wins over the row's own list. A list's refs each
    // name their own instance, the excluded ones too. Playlist ids are
    // Peek's, never joined with an instance
    readUrl: urlReader((field, params) => {
      const one = params.get(entityParamFor(field.key));
      const value = params.get(field.key);
      const excluded =
        field.excludeKey === undefined ? null : params.get(field.excludeKey);
      const excludes =
        field.excludeKey === undefined || excluded === null
          ? {}
          : { [field.excludeKey]: excluded.split(",").filter(Boolean) };
      if (one) {
        const ref =
          field.source === "playlists"
            ? one
            : entityRefFromParam(one, params.get("instance"));
        return { [field.key]: field.multi ? [ref] : ref, ...excludes };
      }
      if (value === null) return excludes;
      return {
        [field.key]: field.multi ? value.split(",").filter(Boolean) : value,
        ...excludes,
      };
    }),
    fromCriterion: refFromCriterion,
    chip: (field, spec, state) => refChip(field, spec, state),
  },
  number: {
    keys: keysOf,
    normalize: normalizeNumber,
    isActive: (field, state) =>
      presenceOf(field, state) !== undefined ||
      hasBound(normalizeNumber(field, state[field.key])),
    toCriterion: (field, _spec, state) => numberRowCriterion(field, state),
    // A presence choice writes alone; else a bound that is a number or
    // text writes, zero included
    writeUrl: (field, state, params) => {
      const presence = presenceOf(field, state);
      if (presence !== undefined && field.modifierKey !== undefined) {
        params.set(field.modifierKey, presence);
        return;
      }
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
      const presence =
        field.modifierKey === undefined
          ? undefined
          : asPresence(params.get(field.modifierKey));
      return {
        ...(read === undefined || Object.keys(read).length === 0
          ? {}
          : { [field.key]: read }),
        ...(presence === undefined || field.modifierKey === undefined
          ? {}
          : { [field.modifierKey]: presence }),
      };
    },
    // In the panel's unit; a body measure read leniently; a presence
    // criterion as its choice
    fromCriterion: (field, _spec, criterion) => {
      const parts = partsOf(criterion, ["modifier"]);
      const presence = asPresence(parts?.modifier);
      if (presence !== undefined && field.modifierKey !== undefined) {
        return { [field.modifierKey]: presence };
      }
      const range = rangeFromCriterion(criterion, field.scale ?? 1);
      const read =
        range === undefined ? undefined : normalizeNumber(field, range);
      return read === undefined ? {} : { [field.key]: read };
    },
    chip: (field, _spec, state, unitPreference = UNITS.METRIC) =>
      numberChip(field, state, unitPreference),
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
    // BETWEEN, inclusive: both days, or a start alone as `value` and an end
    // alone as `value2`
    toCriterion: (field, _spec, state) => {
      const range = state[field.key];
      const { start, end } =
        typeof range === "object" && range !== null
          ? (range as { start?: unknown; end?: unknown })
          : {};
      const from = dayOf(start);
      const to = dayOf(end);
      if (from === undefined && to === undefined) return undefined;
      return {
        modifier: "BETWEEN",
        ...(from === undefined ? {} : { value: from }),
        ...(to === undefined ? {} : { value2: to }),
      };
    },
    fromCriterion: (field, _spec, criterion) => {
      const range = dateRangeFromCriterion(criterion, field.field);
      return range === undefined ? {} : { [field.key]: range };
    },
    chip: (field, _spec, state) => dateChip(field, state),
  },
  text: {
    keys: keysOf,
    normalize: identity,
    // A presence choice the row offers writes its modifier alone; else the
    // text, then the condition beside it
    writeUrl: (field, state, params) => {
      const presence = textPresenceOf(field, state);
      if (presence !== undefined && field.modifierKey !== undefined) {
        params.set(field.modifierKey, presence);
        return;
      }
      const value = state[field.key];
      if (isUnset(value) || !value) return;
      setParam(params, field.key, value);
      writeCompanions(field, state, params);
    },
    readUrl: urlReader((field, params) =>
      params.has(field.key) ? { [field.key]: params.get(field.key) } : {}
    ),
    // A blank search sends nothing; a presence choice filters alone
    isActive: (field, state) =>
      textPresenceOf(field, state) !== undefined || textOf(field, state) !== "",
    // The trimmed text, as a substring unless the row's condition says
    // otherwise; a presence choice with no text
    toCriterion: textCriterion,
    fromCriterion: textFromCriterion,
    // "Title: "beach"" without a condition select; with one, its condition
    // ("Path: starts with /media/new", "Details: has none")
    chip: (field, spec, state) => {
      const criterion = textCriterion(field, spec, state);
      if (criterion === undefined) return null;
      const label = chipLabel(field);
      const { modifier, value } = criterion;
      if (value === undefined) {
        return {
          label,
          values: [TEXT_CONDITIONS[modifier] ?? modifier.toLowerCase()],
        };
      }
      if (textModifiersOf(field, spec).length === 0) {
        return { label, values: [`"${value}"`] };
      }
      return {
        label,
        condition: TEXT_CONDITIONS[modifier] ?? modifier.toLowerCase(),
        values: [value],
      };
    },
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
    fromCriterion: enumFromCriterion,
    chip: (field, spec, state) => enumChip(field, spec, state),
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
    // The choice that sends the stored value
    fromCriterion: (field, _spec, criterion) => {
      const choice = field.choices.find(
        (each) => each.sends !== undefined && each.sends === criterion
      );
      return choice === undefined ? {} : { [field.key]: choice.value };
    },
    chip: (field, _spec, state) => {
      const value = state[field.key];
      const text = typeof value === "boolean" ? String(value) : value;
      const choice = field.choices.find(
        (each) => each.value === text && each.sends !== undefined
      );
      return choice === undefined
        ? null
        : { label: chipLabel(field), values: [choice.label] };
    },
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
    fromCriterion: (field, _spec, criterion) =>
      criterion === true ? { [field.key]: true } : {},
    chip: (field, _spec, state) =>
      state[field.key] === true || state[field.key] === "TRUE"
        ? { label: field.label }
        : null,
  },
};

/** A row's codec, whatever its editor */
export const codecOf = (field: PanelField): FieldCodec<PanelField> =>
  CODECS[field.editor] as FieldCodec<PanelField>;
