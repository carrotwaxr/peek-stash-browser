// shared/types/filters/panel/types.ts
/**
 * The filter panel's field table: what each row of a list's panel edits,
 * the contract field it fills, its label, section and editor, and the
 * companion keys its modifier and depth ride in. One file per list holds
 * the rows; the panel's options, its URL keys, presets, chips and carousel
 * rules are read from them.
 */
import type {
  EnumModifier,
  RefFieldModifier,
  RefModifier,
} from "../criteria.js";

/** The panel's sections, in the order a list draws them */
export const PANEL_GROUPS = [
  "common",
  "entities",
  "dates",
  "video",
  "attributes",
  "other",
] as const;
export type PanelGroup = (typeof PANEL_GROUPS)[number];

/** The panel's section headings; only "common" opens by default */
export const PANEL_GROUP_LABELS: Readonly<Record<PanelGroup, string>> = {
  common: "Common Filters",
  entities: "Entity Filters",
  dates: "Date Ranges",
  video: "Video Properties",
  attributes: "Performer Attributes",
  other: "Other Filters",
};

/**
 * How a row is edited: an entity picker, a min/max range, a date range, a
 * text box, a select of values, a select of named choices, a checkbox
 */
export const EDITOR_KINDS = [
  "ref",
  "number",
  "date",
  "text",
  "enum",
  "choice",
  "toggle",
] as const;
export type EditorKind = (typeof EDITOR_KINDS)[number];

/** One value a select offers */
export interface Choice {
  readonly value: string;
  readonly label: string;
}

/** One choice of a `choice` row, with what it sends (undefined: nothing) */
export interface SendingChoice extends Choice {
  readonly sends: boolean | undefined;
}

/** Has ALL, ANY or NONE of these */
export const HAS_MODIFIERS = ["INCLUDES_ALL", "INCLUDES", "EXCLUDES"] as const;
/** A field the entity has one of (its studio): ANY or NONE */
export const HAS_ONE_MODIFIERS = ["INCLUDES", "EXCLUDES"] as const;
/** A picker with no condition select */
export const INCLUDES_ONLY = ["INCLUDES"] as const;

/** Where a picker counts its options (`count_filter`) */
export type CountContext =
  | "scenes"
  | "performers"
  | "studios"
  | "groups"
  | "galleries"
  | "images";

interface FieldBase<F extends string> {
  /** The panel's key: the URL, presets and carousel state name it */
  readonly key: string;
  /** The contract field it fills */
  readonly field: F;
  readonly label: string;
  readonly group: PanelGroup;
  readonly editor: EditorKind;
  readonly placeholder?: string;
  /** The companion key holding its modifier */
  readonly modifierKey?: string;
  /** The companion key holding its depth (include sub-tags, sub-studios) */
  readonly hierarchyKey?: string;
  /** 9b: may be pinned to the chip bar; default true */
  readonly pinnable?: boolean;
  /** 9b: pinned for a new user */
  readonly pinnedByDefault?: boolean;
  /** Offered as a carousel rule; scene fields only; default true */
  readonly carousel?: boolean;
}

export interface RefField<F extends string = string> extends FieldBase<F> {
  readonly editor: "ref";
  /** Picks several ids (a tag list's `studioId` is single over a multi field) */
  readonly multi: boolean;
  /**
   * The modifiers offered, a subset of the field's; one means no select.
   * IS_NULL and NOT_NULL ("Has none", "Has any"), where the field takes
   * them, are sent with no ids.
   */
  readonly modifiers: readonly RefFieldModifier[];
  readonly defaultModifier?: RefModifier;
  /** "Has ANY of these" or "In ANY of these" */
  readonly modifierLabels?: "has" | "in";
  /** The depth checkbox's label ("Include sub-tags") */
  readonly hierarchyLabel?: string;
  readonly countContext?: CountContext;
  /**
   * The companion key holding the ids it excludes (`tagIdsExclude`), on a
   * multi row whose field is `excludable`: each picked value then includes
   * or excludes (`{ value, excludes }`)
   */
  readonly excludeKey?: string;
}

export interface NumberField<F extends string = string> extends FieldBase<F> {
  readonly editor: "number";
  readonly bounds: {
    readonly min: number;
    readonly max: number;
    readonly step?: number;
  };
  /** Panel unit to the stored one: 60 (minutes), 1_000_000 (Mbps) */
  readonly scale?: number;
  readonly unit?: "minutes" | "Mbps" | "fps" | "years";
  /** Shown in the viewer's unit system */
  readonly measure?: "height" | "weight" | "length";
  /**
   * The words of the "is not set" and "is set" choices a field whose spec
   * takes IS_NULL offers ("Not rated" and "Rated"); "Not set" and "Set"
   * when absent. A row offering the choice also has a `modifierKey`.
   */
  readonly presenceLabels?: {
    readonly isNull: string;
    readonly notNull: string;
  };
}

export interface DateField<F extends string = string> extends FieldBase<F> {
  readonly editor: "date";
}

/** A text box; its most characters are the contract field's `maxLength` */
export interface TextField<F extends string = string> extends FieldBase<F> {
  readonly editor: "text";
}

export interface EnumField<F extends string = string> extends FieldBase<F> {
  readonly editor: "enum";
  readonly choices: readonly Choice[];
  /** The comparisons the condition select offers (Resolution) */
  readonly modifiers?: readonly EnumModifier[];
  readonly defaultModifier?: EnumModifier;
}

export interface ChoiceField<F extends string = string> extends FieldBase<F> {
  readonly editor: "choice";
  readonly choices: readonly SendingChoice[];
  readonly defaultValue: string;
}

/** A checkbox sending `true`; its placeholder is the box's text */
export interface ToggleField<F extends string = string> extends FieldBase<F> {
  readonly editor: "toggle";
}

export type PanelField<F extends string = string> =
  | RefField<F>
  | NumberField<F>
  | DateField<F>
  | TextField<F>
  | EnumField<F>
  | ChoiceField<F>
  | ToggleField<F>;
