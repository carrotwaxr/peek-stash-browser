// shared/types/filters/criteria.ts
/**
 * Filter criteria: the kinds of list filter field, the modifiers each kind
 * understands, and the constructors the field tables in `fields.ts` are
 * written with.
 *
 * Plain data plus types, with no dependency: the server builds its request
 * validator from these descriptors, and the client imports them for a few KB.
 */

/** The seven lists whose filters arrive as an `<entity>_filter` object */
export const ENTITY_KINDS = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

// =============================================================================
// MODIFIERS
// =============================================================================

/** Ref fields: has any, has all, has none of these ids */
export const REF_MODIFIERS = ["INCLUDES", "INCLUDES_ALL", "EXCLUDES"] as const;
export type RefModifier = (typeof REF_MODIFIERS)[number];

/** A ref field whose row has at most one value: has all of two means nothing */
export const SINGLE_REF_MODIFIERS = ["INCLUDES", "EXCLUDES"] as const;

export const COMPARISON_MODIFIERS = [
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
] as const;

/**
 * A range: BETWEEN takes either side alone (at least, at most; a date's side
 * includes its own day); NOT_BETWEEN needs both `value` and `value2`
 */
export const RANGE_MODIFIERS = ["BETWEEN", "NOT_BETWEEN"] as const;
export type RangeModifier = (typeof RANGE_MODIFIERS)[number];

/** Need no value */
export const PRESENCE_MODIFIERS = ["IS_NULL", "NOT_NULL"] as const;
export type PresenceModifier = (typeof PRESENCE_MODIFIERS)[number];

export const NUMBER_MODIFIERS = [
  ...COMPARISON_MODIFIERS,
  ...RANGE_MODIFIERS,
  ...PRESENCE_MODIFIERS,
] as const;
export type NumberModifier = (typeof NUMBER_MODIFIERS)[number];

/**
 * A number a row may lack (a rating, a height): the comparisons, the ranges,
 * and IS_NULL and NOT_NULL for "not set" and "is set". A comparison never
 * matches a row without a value.
 */
export const NULLABLE_NUMBER_MODIFIERS = [
  ...COMPARISON_MODIFIERS,
  ...RANGE_MODIFIERS,
  ...PRESENCE_MODIFIERS,
] as const;

/**
 * Values are YYYY-MM-DD dates or ISO date-times. A day is a whole day:
 * EQUALS is in it, GREATER_THAN after it, LESS_THAN before it, BETWEEN
 * includes both ends and takes one side alone. Stash's text dates compare
 * as days (a year or month is its first day); its created and updated times
 * and the viewer's last play read the day in the viewer's time zone (the
 * `X-Peek-Time-Zone` header, UTC without one). A row without a date
 * matches only IS_NULL.
 */
export const DATE_MODIFIERS = NUMBER_MODIFIERS;
export type DateModifier = NumberModifier;

/** INCLUDES and EXCLUDES match a substring, EQUALS the whole text; all ignore case */
export const TEXT_MODIFIERS = [
  "INCLUDES",
  "EXCLUDES",
  "EQUALS",
  "NOT_EQUALS",
  ...PRESENCE_MODIFIERS,
] as const;
export type TextModifier = (typeof TEXT_MODIFIERS)[number];

/**
 * An enum's value compared (GREATER_THAN and LESS_THAN only where the values
 * are ordered, as resolutions are); a multi-valued enum criterion matches any
 * of its values (INCLUDES)
 */
export const ENUM_MODIFIERS = [...COMPARISON_MODIFIERS, "INCLUDES"] as const;
export type EnumModifier = (typeof ENUM_MODIFIERS)[number];

// =============================================================================
// ENUM VALUES
// =============================================================================

/** Stash's ResolutionEnum, smallest first */
export const RESOLUTIONS = [
  "VERY_LOW",
  "LOW",
  "R360P",
  "STANDARD",
  "WEB_HD",
  "STANDARD_HD",
  "FULL_HD",
  "QUAD_HD",
  "VR_HD",
  "FOUR_K",
  "FIVE_K",
  "SIX_K",
  "SEVEN_K",
  "EIGHT_K",
  "HUGE",
] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** Stash's OrientationEnum */
export const ORIENTATIONS = ["LANDSCAPE", "PORTRAIT", "SQUARE"] as const;

/** Stash's GenderEnum */
export const GENDERS = [
  "MALE",
  "FEMALE",
  "TRANSGENDER_MALE",
  "TRANSGENDER_FEMALE",
  "INTERSEX",
  "NON_BINARY",
] as const;

// Stash stores these four as free text; Peek compares them ignoring case and
// offers these values.
export const ETHNICITIES = [
  "CAUCASIAN",
  "BLACK",
  "ASIAN",
  "INDIAN",
  "LATIN",
  "MIDDLE_EASTERN",
  "MIXED",
  "OTHER",
] as const;
export const HAIR_COLORS = [
  "BLONDE",
  "BRUNETTE",
  "BLACK",
  "RED",
  "AUBURN",
  "GREY",
  "BALD",
  "VARIOUS",
  "OTHER",
] as const;
export const EYE_COLORS = [
  "BROWN",
  "BLUE",
  "GREEN",
  "GREY",
  "HAZEL",
  "OTHER",
] as const;
/** Stash's `fake_tits` */
export const BREAST_TYPES = ["Fake", "Natural"] as const;

// =============================================================================
// FIELD SPECS
// =============================================================================

export const FIELD_KINDS = [
  "ref",
  "number",
  "date",
  "text",
  "enum",
  "boolean",
  "instance",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** Ids of another entity, sent as `"id:instanceId"` (a bare id matches every instance) */
export interface RefSpec<
  T extends EntityKind = EntityKind,
  M extends RefModifier = RefModifier,
  H extends boolean = boolean,
  S extends boolean = boolean,
> {
  readonly kind: "ref";
  /** The entity the ids name */
  readonly target: T;
  readonly modifiers: readonly M[];
  /** What a missing or null modifier means */
  readonly defaultModifier: M;
  /** Takes a depth: -1 adds every descendant, n that many levels */
  readonly hierarchical: H;
  /** The row has at most one (a scene's studio), so no INCLUDES_ALL */
  readonly single: S;
  /**
   * Where the request carries it when that is not `<entity>_filter.<field>`:
   * `["scenes_filter", "id"]` is `tag_filter.scenes_filter.id`
   */
  readonly path?: readonly [string, string];
}

export interface NumberSpec<M extends NumberModifier = NumberModifier> {
  readonly kind: "number";
  readonly modifiers: readonly M[];
  readonly defaultModifier: M;
}

export interface DateSpec<M extends DateModifier = DateModifier> {
  readonly kind: "date";
  readonly modifiers: readonly M[];
  readonly defaultModifier: M;
}

export interface TextSpec<M extends TextModifier = TextModifier> {
  readonly kind: "text";
  readonly modifiers: readonly M[];
  readonly defaultModifier: M;
  /** Most characters a trimmed value may have */
  readonly maxLength: number;
}

/** What a text value may have unless the field says otherwise */
export const TEXT_MAX_LENGTH = 500;

export interface EnumSpec<
  V extends string = string,
  M extends EnumModifier = EnumModifier,
  Multi extends boolean = boolean,
> {
  readonly kind: "enum";
  readonly values: readonly V[];
  readonly modifiers: readonly M[];
  readonly defaultModifier: M;
  /** The criterion's value is a list, any of which matches */
  readonly multi: Multi;
}

/** `true` or `false`, with no modifier */
export interface BooleanSpec {
  readonly kind: "boolean";
}

/** One Stash instance's id: narrows the list to that instance */
export interface InstanceSpec {
  readonly kind: "instance";
}

export type FieldSpec =
  | RefSpec
  | NumberSpec
  | DateSpec
  | TextSpec
  | EnumSpec
  | BooleanSpec
  | InstanceSpec;

// =============================================================================
// CONSTRUCTORS
// =============================================================================

type NoOptions = Record<never, never>;

/** The modifiers an options object names, else the fallback */
type ModifiersOf<O, Fallback> = O extends {
  readonly modifiers: readonly (infer M)[];
}
  ? M
  : Fallback;

type Flag<O, K extends string> = O extends { readonly [P in K]: true }
  ? true
  : false;

interface RefOptions {
  readonly modifiers?: readonly RefModifier[];
  readonly defaultModifier?: RefModifier;
  readonly hierarchical?: boolean;
  readonly single?: boolean;
  readonly path?: readonly [string, string];
}

type RefModifiersOf<O> = Extract<
  ModifiersOf<
    O,
    O extends { readonly single: true }
      ? (typeof SINGLE_REF_MODIFIERS)[number]
      : RefModifier
  >,
  RefModifier
>;

type RefSpecOf<T extends EntityKind, O> = RefSpec<
  T,
  RefModifiersOf<O>,
  Flag<O, "hierarchical">,
  Flag<O, "single">
> &
  (O extends { readonly path: infer P extends readonly [string, string] }
    ? { readonly path: P }
    : unknown);

/**
 * A ref field. By default any of INCLUDES, INCLUDES_ALL and EXCLUDES
 * (INCLUDES and EXCLUDES when single), INCLUDES when the modifier is missing.
 */
export function ref<
  const T extends EntityKind,
  const O extends RefOptions = NoOptions,
>(target: T, options?: O): RefSpecOf<T, O> {
  const single = options?.single ?? false;
  const spec: RefSpec = {
    kind: "ref",
    target,
    modifiers:
      options?.modifiers ?? (single ? SINGLE_REF_MODIFIERS : REF_MODIFIERS),
    defaultModifier: options?.defaultModifier ?? "INCLUDES",
    hierarchical: options?.hierarchical ?? false,
    single,
    ...(options?.path ? { path: options.path } : {}),
  };
  return spec as RefSpecOf<T, O>;
}

interface ScalarOptions<M extends string> {
  readonly modifiers?: readonly M[];
  readonly defaultModifier?: M;
}

/** The six comparisons every number field takes */
const NUMBER_FIELD_MODIFIERS = [
  ...COMPARISON_MODIFIERS,
  ...RANGE_MODIFIERS,
] as const;

/**
 * A number field: the four comparisons, BETWEEN and NOT_BETWEEN by default,
 * GREATER_THAN when the modifier is missing
 */
export function num<const O extends ScalarOptions<NumberModifier> = NoOptions>(
  options?: O
): NumberSpec<
  Extract<
    ModifiersOf<O, (typeof NUMBER_FIELD_MODIFIERS)[number]>,
    NumberModifier
  >
> {
  const spec: NumberSpec = {
    kind: "number",
    modifiers: options?.modifiers ?? NUMBER_FIELD_MODIFIERS,
    defaultModifier: options?.defaultModifier ?? "GREATER_THAN",
  };
  return spec as NumberSpec<
    Extract<
      ModifiersOf<O, (typeof NUMBER_FIELD_MODIFIERS)[number]>,
      NumberModifier
    >
  >;
}

/** A date field: every date modifier, GREATER_THAN when the modifier is missing */
export function date<const O extends ScalarOptions<DateModifier> = NoOptions>(
  options?: O
): DateSpec<Extract<ModifiersOf<O, DateModifier>, DateModifier>> {
  const spec: DateSpec = {
    kind: "date",
    modifiers: options?.modifiers ?? DATE_MODIFIERS,
    defaultModifier: options?.defaultModifier ?? "GREATER_THAN",
  };
  return spec as DateSpec<Extract<ModifiersOf<O, DateModifier>, DateModifier>>;
}

interface TextOptions extends ScalarOptions<TextModifier> {
  readonly maxLength?: number;
}

/**
 * A text field: every text modifier, INCLUDES when the modifier is missing,
 * up to TEXT_MAX_LENGTH characters
 */
export function text<const O extends TextOptions = NoOptions>(
  options?: O
): TextSpec<Extract<ModifiersOf<O, TextModifier>, TextModifier>> {
  const spec: TextSpec = {
    kind: "text",
    modifiers: options?.modifiers ?? TEXT_MODIFIERS,
    defaultModifier: options?.defaultModifier ?? "INCLUDES",
    maxLength: options?.maxLength ?? TEXT_MAX_LENGTH,
  };
  return spec as TextSpec<Extract<ModifiersOf<O, TextModifier>, TextModifier>>;
}

interface EnumOptions extends ScalarOptions<EnumModifier> {
  readonly multi?: boolean;
}

type EnumModifiersOf<O> = Extract<
  ModifiersOf<
    O,
    O extends { readonly multi: true } ? "INCLUDES" : "EQUALS" | "NOT_EQUALS"
  >,
  EnumModifier
>;

/**
 * An enum field. One value compared with EQUALS or NOT_EQUALS by default
 * (EQUALS when the modifier is missing); a multi-valued one takes a list and
 * matches any of it (INCLUDES).
 */
export function enumOf<
  const V extends string,
  const O extends EnumOptions = NoOptions,
>(
  values: readonly V[],
  options?: O
): EnumSpec<V, EnumModifiersOf<O>, Flag<O, "multi">> {
  const multi = options?.multi ?? false;
  const spec: EnumSpec = {
    kind: "enum",
    values,
    modifiers:
      options?.modifiers ?? (multi ? ["INCLUDES"] : ["EQUALS", "NOT_EQUALS"]),
    defaultModifier:
      options?.defaultModifier ?? (multi ? "INCLUDES" : "EQUALS"),
    multi,
  };
  return spec as EnumSpec<V, EnumModifiersOf<O>, Flag<O, "multi">>;
}

export function bool(): BooleanSpec {
  return { kind: "boolean" };
}

export function instance(): InstanceSpec {
  return { kind: "instance" };
}
