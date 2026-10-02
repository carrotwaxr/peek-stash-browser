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
import type { EditorKind, FieldSpec, PanelField } from "@peek/shared-types";

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

/** A member a later task fills */
const notYet = (member: string) => (): never => {
  throw new Error(`${member}: not yet`);
};

/** The members C4 to C7 fill, throwing until then */
const pending = {
  toCriterion: notYet("toCriterion"),
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
    ...pending,
  },
  number: {
    keys: keysOf,
    isActive: (field, state) => hasBound(state[field.key]),
    ...pending,
  },
  date: {
    keys: keysOf,
    isActive: (field, state) => hasBound(state[field.key]),
    ...pending,
  },
  text: {
    keys: keysOf,
    // A blank search sends nothing
    isActive: (field, state) => {
      const value = state[field.key];
      return typeof value === "string" && value.trim() !== "";
    },
    ...pending,
  },
  enum: {
    keys: keysOf,
    isActive: (field, state) => valuesOf(state[field.key]).length > 0,
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
    ...pending,
  },
  toggle: {
    keys: keysOf,
    // A checkbox, or a boolean from the URL ("TRUE")
    isActive: (field, state) =>
      state[field.key] === true || state[field.key] === "TRUE",
    ...pending,
  },
};

/** A row's codec, whatever its editor */
export const codecOf = (field: PanelField): FieldCodec<PanelField> =>
  CODECS[field.editor] as FieldCodec<PanelField>;
