/**
 * The filter panel's options, read from the shared field table
 * (`shared/types/filters/panel/`): one option per row, drawn by the control
 * its editor needs, with a section header before each run of a group.
 *
 * Imports only relative modules and `@peek/shared-types`: the server's
 * integration walk loads `filterConfig.ts`, which reads these.
 */
import {
  CLIP_PARAMS,
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
  countFilterContext?: string;
  min?: number;
  max?: number;
  step?: number;
  /** A text option's most characters: its contract field's limit */
  maxLength?: number;
  valueUnit?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

/** Each list's contract fields (clips: their GET parameters) */
const SPECS: Readonly<Record<ListKind, Readonly<Record<string, FieldSpec>>>> = {
  ...FIELDS,
  clip: CLIP_PARAMS,
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

/** The condition select's words: "Has ANY of these", or "In ANY of these" for collections */
const REF_MODIFIER_LABELS = {
  has: {
    INCLUDES_ALL: "Has ALL of these",
    INCLUDES: "Has ANY of these",
    EXCLUDES: "Has NONE of these",
  },
  in: {
    INCLUDES_ALL: "In ALL of these",
    INCLUDES: "In ANY of these",
    EXCLUDES: "NOT in these",
  },
} as const;

/** The condition select's words for a select of values (Resolution) */
const ENUM_MODIFIER_LABELS: Readonly<Record<string, string>> = {
  EQUALS: "Equals",
  NOT_EQUALS: "Not Equals",
  GREATER_THAN: "Greater Than",
  LESS_THAN: "Less Than",
};

/**
 * How an imperial viewer's editor shows a body measure: its unit in the
 * label and, but for Height (drawn as feet and inches over the cm bounds),
 * its own bounds
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
    ...(spec?.kind === "ref" ? { entityType: ENTITY_TYPES[spec.target] } : {}),
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
  };
}

function numberOption(row: NumberField, unitPreference: string): FilterOption {
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
      return numberOption(row, unitPreference);
    case "date":
      return { ...head(row), defaultValue: {} };
    case "text":
      return {
        ...head(row),
        defaultValue: "",
        ...placeholderOf(row),
        // An input holds what the server takes (a longer value is a 400)
        ...(spec?.kind === "text" ? { maxLength: spec.maxLength } : {}),
      };
    case "enum":
      return {
        ...head(row),
        defaultValue: "",
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
