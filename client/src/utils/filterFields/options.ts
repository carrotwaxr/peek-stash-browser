/**
 * The filter panel's options, read from the shared field table
 * (`shared/types/filters/panel/`): one option per row, drawn by the control
 * its editor needs, with a section header before each run of a group.
 *
 * Imports only relative modules and `@peek/shared-types`: the server's
 * integration walk loads `filterConfig.ts`, which reads these.
 */
import {
  CLIP_FIELDS,
  type EditorKind,
  type EntityKind,
  FIELDS,
  type FieldSpec,
  type ListKind,
  type NumberField,
  PANEL_FIELDS,
  PANEL_GROUP_LABELS,
  type PanelField,
  type PanelGroup,
  type RefField,
  type RefFieldModifier,
  type TextField,
} from "@peek/shared-types";

/** Shared type for filter configuration objects used across filter UI, URL serialization, and filter chips */
export interface FilterOption {
  key: string;
  type: string;
  label?: string;
  multi?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  entityType?: string;
  options?: Array<{ value: string; label: string }>;
  modifierKey?: string;
  modifierOptions?: Array<{ value: string; label: string }>;
  defaultModifier?: string;
  hierarchyKey?: string;
  supportsHierarchy?: boolean;
  hierarchyLabel?: string;
  /**
   * A picker's companion holding the ids it excludes (`tagIdsExclude`):
   * each picked value then has an include or exclude toggle
   */
  excludeKey?: string;
  /**
   * A select that always holds one of its choices (Yes, No, Any): it draws
   * no blank option of its own
   */
  noBlank?: boolean;
  countFilterContext?: string;
  min?: number;
  max?: number;
  step?: number;
  /** A text option's most characters: its contract field's limit */
  maxLength?: number;
  valueUnit?: string;
  /**
   * An imperial viewer's body measure: the editor shows feet and inches,
   * lbs or inches and converts on input and display only. The state, URL,
   * presets and requests hold metric either way.
   */
  measure?: NonNullable<NumberField["measure"]>;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

/**
 * The state keys a row owns: its value, and its condition, sub-items and
 * exclude companions where it has them. A row's editor reads and writes
 * these and no others.
 */
export function rowKeysOf(
  option: Pick<
    FilterOption,
    "key" | "modifierKey" | "hierarchyKey" | "excludeKey"
  >
): string[] {
  return [
    option.key,
    option.modifierKey,
    option.hierarchyKey,
    option.excludeKey,
  ].filter((each): each is string => each !== undefined);
}

/** Each list's contract fields */
export const SPECS: Readonly<
  Record<ListKind, Readonly<Record<string, FieldSpec>>>
> = {
  ...FIELDS,
  clip: CLIP_FIELDS,
};

/** The option type that draws each editor */
const OPTION_TYPES: Readonly<Record<EditorKind, string>> = {
  ref: "searchable-select",
  number: "range",
  date: "date-range",
  text: "text",
  enum: "select",
  choice: "select",
  toggle: "checkbox",
};

/** A picker's entity, as the panel names it */
const ENTITY_TYPES: Readonly<Record<EntityKind, string>> = {
  scene: "scenes",
  performer: "performers",
  studio: "studios",
  tag: "tags",
  group: "groups",
  gallery: "galleries",
  image: "images",
};

/**
 * The condition select's words: "Has ANY of these", or "In ANY of these" for
 * collections; "Has none" and "Has any" (sent with no ids) where the row
 * offers them
 */
const REF_MODIFIER_LABELS = {
  has: {
    INCLUDES_ALL: "Has ALL of these",
    INCLUDES: "Has ANY of these",
    EXCLUDES: "Has NONE of these",
    IS_NULL: "Has none",
    NOT_NULL: "Has any",
  },
  in: {
    INCLUDES_ALL: "In ALL of these",
    INCLUDES: "In ANY of these",
    EXCLUDES: "NOT in these",
    IS_NULL: "In none",
    NOT_NULL: "In any",
  },
} as const satisfies Record<string, Record<RefFieldModifier, string>>;

/**
 * The condition select's words for a select of values (Resolution, Captions)
 * or a group of boxes (Gender)
 */
const ENUM_MODIFIER_LABELS: Readonly<Record<string, string>> = {
  INCLUDES: "Is ANY of these",
  EXCLUDES: "Is NONE of these",
  EQUALS: "Equals",
  NOT_EQUALS: "Not Equals",
  GREATER_THAN: "Greater Than",
  LESS_THAN: "Less Than",
  IS_NULL: "Has none",
  NOT_NULL: "Has any",
};

/**
 * The condition select's words for a text row that offers one (Path); "Has
 * none" and "Has any" (sent with no text) where its field takes them
 */
const TEXT_MODIFIER_LABELS: Readonly<Record<string, string>> = {
  INCLUDES: "Contains",
  EXCLUDES: "Excludes",
  EQUALS: "Equals",
  NOT_EQUALS: "Not equals",
  STARTS_WITH: "Starts with",
  IS_NULL: "Has none",
  NOT_NULL: "Has any",
};

/**
 * How an imperial viewer's editor shows a body measure: its unit in the
 * label and, but for Height (drawn as feet and inches), its display bounds.
 * What it holds is metric: the editor converts on input and display.
 */
const IMPERIAL_EDITORS: Readonly<
  Record<
    NonNullable<NumberField["measure"]>,
    {
      unit: string;
      type?: string;
      bounds?: { min: number; max: number };
    }
  >
> = {
  height: { unit: "ft/in", type: "imperial-height-range" },
  weight: { unit: "lbs", bounds: { min: 50, max: 500 } },
  length: { unit: "inches", bounds: { min: 1, max: 15 } },
};

const IMPERIAL = "imperial";

/** A section header opening a run of the group's rows */
const sectionHeader = (group: PanelGroup): FilterOption => ({
  type: "section-header",
  label: PANEL_GROUP_LABELS[group],
  key: `section-${group}`,
  collapsible: true,
  defaultOpen: group === "common",
});

/** The row's own key, label and control */
const head = (row: PanelField): FilterOption => ({
  key: row.key,
  label: row.label,
  type: OPTION_TYPES[row.editor],
});

const placeholderOf = (row: PanelField) =>
  row.placeholder === undefined ? {} : { placeholder: row.placeholder };

const companionsOf = (row: PanelField) => ({
  ...(row.modifierKey === undefined ? {} : { modifierKey: row.modifierKey }),
});

function refOption(row: RefField, spec: FieldSpec | undefined): FilterOption {
  const labels = REF_MODIFIER_LABELS[row.modifierLabels ?? "has"];
  return {
    ...head(row),
    // A playlist field picks from the viewer's playlists
    ...(spec?.kind === "ref"
      ? { entityType: ENTITY_TYPES[spec.target] }
      : spec?.kind === "playlist" || row.source === "playlists"
        ? { entityType: "playlists" }
        : {}),
    multi: row.multi,
    defaultValue: row.multi ? [] : "",
    ...placeholderOf(row),
    // One modifier offered: no condition select
    ...(row.modifiers.length > 1
      ? {
          modifierOptions: row.modifiers.map((value) => ({
            value,
            label: labels[value],
          })),
          ...companionsOf(row),
          ...(row.defaultModifier === undefined
            ? {}
            : { defaultModifier: row.defaultModifier }),
        }
      : {}),
    ...(row.hierarchyKey === undefined
      ? {}
      : {
          supportsHierarchy: true,
          hierarchyKey: row.hierarchyKey,
          ...(row.hierarchyLabel === undefined
            ? {}
            : { hierarchyLabel: row.hierarchyLabel }),
        }),
    ...(row.countContext === undefined
      ? {}
      : { countFilterContext: row.countContext }),
    ...(row.excludeKey === undefined ? {} : { excludeKey: row.excludeKey }),
  };
}

/**
 * The condition select of a number row whose contract field takes IS_NULL:
 * "Between" (the bounds, the default), then the field's "is not set" and
 * "is set" words. Read from the spec, so the fields the server opened are
 * exactly the ones offered. Nothing for a row with no `modifierKey`.
 */
function presenceOptions(
  row: NumberField,
  spec: FieldSpec | undefined
): Partial<FilterOption> {
  if (
    row.modifierKey === undefined ||
    spec?.kind !== "number" ||
    !(spec.modifiers as readonly string[]).includes("IS_NULL")
  ) {
    return {};
  }
  const words = row.presenceLabels ?? { isNull: "Not set", notNull: "Set" };
  return {
    modifierOptions: [
      { value: "BETWEEN", label: "Between" },
      { value: "IS_NULL", label: words.isNull },
      { value: "NOT_NULL", label: words.notNull },
    ],
    modifierKey: row.modifierKey,
    defaultModifier: "BETWEEN",
  };
}

function numberOption(
  row: NumberField,
  spec: FieldSpec | undefined,
  unitPreference: string
): FilterOption {
  const imperial =
    unitPreference === IMPERIAL && row.measure !== undefined
      ? IMPERIAL_EDITORS[row.measure]
      : undefined;
  const bounds = imperial?.bounds ?? row.bounds;
  return {
    key: row.key,
    label: imperial
      ? row.label.replace(/ \([^)]*\)$/, ` (${imperial.unit})`)
      : row.label,
    type: imperial?.type ?? OPTION_TYPES.number,
    defaultValue: {},
    min: bounds.min,
    max: bounds.max,
    ...(row.bounds.step === undefined || imperial?.bounds
      ? {}
      : { step: row.bounds.step }),
    ...(imperial === undefined ? {} : { measure: row.measure }),
    ...presenceOptions(row, spec),
  };
}

/**
 * A text row's condition select: the modifiers it offers that its field
 * takes, Contains first when offered, which the select shows untouched.
 * Nothing for a row offering one modifier or none, or without a
 * `modifierKey`.
 */
function textConditionOf(
  row: TextField,
  spec: FieldSpec | undefined
): Partial<FilterOption> {
  if (spec?.kind !== "text" || row.modifierKey === undefined) return {};
  const taken: readonly string[] = spec.modifiers;
  const offered = (row.modifiers ?? []).filter((modifier) =>
    taken.includes(modifier)
  );
  if (offered.length < 2) return {};
  return {
    modifierOptions: offered.map((value) => ({
      value,
      label: TEXT_MODIFIER_LABELS[value] ?? value,
    })),
    modifierKey: row.modifierKey,
    defaultModifier: offered.includes("INCLUDES")
      ? "INCLUDES"
      : (offered[0] ?? "INCLUDES"),
  };
}

/** One row's option */
function optionOf(
  row: PanelField,
  spec: FieldSpec | undefined,
  unitPreference: string
): FilterOption {
  switch (row.editor) {
    case "ref":
      return refOption(row, spec);
    case "number":
      return numberOption(row, spec, unitPreference);
    case "date":
      return { ...head(row), defaultValue: {} };
    case "text":
      return {
        ...head(row),
        defaultValue: "",
        ...placeholderOf(row),
        // An input holds what the server takes (a longer value is a 400)
        ...(spec?.kind === "text" ? { maxLength: spec.maxLength } : {}),
        ...textConditionOf(row, spec),
      };
    case "enum":
      return {
        ...head(row),
        // A multi row (Orientation) is drawn as a group of checkboxes
        defaultValue: row.multi === true ? [] : "",
        ...(row.multi === true ? { multi: true } : {}),
        options: row.choices.map(({ value, label }) => ({ value, label })),
        ...placeholderOf(row),
        ...(row.modifiers === undefined || row.modifiers.length < 2
          ? {}
          : {
              modifierOptions: row.modifiers.map((value) => ({
                value,
                label: ENUM_MODIFIER_LABELS[value] ?? value,
              })),
              ...companionsOf(row),
              ...(row.defaultModifier === undefined
                ? {}
                : { defaultModifier: row.defaultModifier }),
            }),
      };
    case "choice":
      return {
        ...head(row),
        defaultValue: row.defaultValue,
        options: row.choices.map(({ value, label }) => ({ value, label })),
        ...placeholderOf(row),
        // The default is a choice that sends nothing (Any): no blank option
        ...(row.choices.some(
          (choice) =>
            choice.value === row.defaultValue && choice.sends === undefined
        )
          ? { noBlank: true }
          : {}),
      };
    case "toggle":
      return { ...head(row), defaultValue: false, ...placeholderOf(row) };
  }
}

/**
 * A list's panel options: each row's option, a section header before each
 * run of a group (only Common opens by default). For an imperial viewer the
 * body measures show their imperial label and bounds; the editor converts.
 */
export function filterOptionsOf(
  kind: ListKind,
  unitPreference = "metric"
): FilterOption[] {
  const rows: readonly PanelField[] = PANEL_FIELDS[kind];
  const specs = SPECS[kind];
  return rows.flatMap((row, index) => {
    const option = optionOf(row, specs[row.field], unitPreference);
    return index === 0 || rows[index - 1]?.group !== row.group
      ? [sectionHeader(row.group), option]
      : [option];
  });
}
