import { forwardRef, useEffect } from "react";
import {
  type FilterOption,
  type PanelState,
  rowKeysOf,
  valuesOf,
} from "../../utils/filterFields";
import { FilterControl, type FilterControlProps } from "./FilterControls";

export interface FieldEditorProps {
  /** The row's option as `filterOptionsOf(kind, unitPreference)` draws it */
  readonly option: FilterOption;
  /** The row's own state: its key and companions (modifier, depth, exclude), unprefixed */
  readonly state: PanelState;
  /** The row's next state, whole (the caller replaces the row's keys with it) */
  readonly onChange: (next: PanelState) => void;
  /** The id of the first control (default `filter-<key>`), for a chip or a row to move focus to */
  readonly controlId?: string;
  readonly autoFocus?: boolean;
  /** The label stays for assistive technology only, where the surface names the field itself */
  readonly hideLabel?: boolean;
  /** B3: a ref row opens its list at once (a chip's editor) */
  readonly openPicker?: boolean;
}

/** Nothing to show: the option's default stands in */
const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === "" || value === false;

/**
 * A typed bound: a number, decimals kept unless the field steps in whole
 * units; nothing for a blank or a non-number
 */
const boundOf = (
  value: unknown,
  step: number | undefined
): number | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  if (text.trim() === "") return undefined;
  const bound = Number(text);
  if (!Number.isFinite(bound)) return undefined;
  return step !== undefined && Number.isInteger(step)
    ? Math.trunc(bound)
    : bound;
};

/** A range as the row holds it: numeric bounds, a blank one absent */
const rangeOf = (value: unknown, step: number | undefined): PanelState => {
  const range = (
    typeof value === "object" && value !== null ? value : {}
  ) as Record<string, unknown>;
  const min = boundOf(range["min"], step);
  const max = boundOf(range["max"], step);
  return {
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  };
};

/** A date range as the row holds it: a cleared date absent */
const datesOf = (value: unknown): PanelState => {
  const range = (
    typeof value === "object" && value !== null ? value : {}
  ) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(range).filter(
      ([, each]) => each !== undefined && each !== ""
    )
  );
};

/**
 * The value a control hands back, as the row holds it. A plain range keeps
 * decimals unless its option steps in whole units; a body measure (the
 * imperial editors) already holds metric text.
 */
const rowValueOf = (option: FilterOption, value: unknown): unknown => {
  if (option.type === "range" && option.measure === undefined) {
    return rangeOf(value, option.step);
  }
  if (option.type === "date-range") return datesOf(value);
  return value;
};

/**
 * The editor of one filter row's value: the control its option needs, with
 * its condition, sub-items and include-or-exclude picks. It reads the row's
 * keys from `state` and hands the row's next state back whole, so a panel
 * draft, a chip, a carousel rule or a row editor all replace the row with
 * it. Keys of other rows in `state` are neither read nor returned.
 */
const FieldEditor = forwardRef<HTMLDivElement, FieldEditorProps>(
  (
    {
      option,
      state,
      onChange,
      controlId,
      autoFocus = false,
      hideLabel = false,
      openPicker = false,
    },
    ref
  ) => {
    const id = controlId ?? `filter-${option.key}`;
    const { modifierKey, hierarchyKey, excludeKey } = option;

    useEffect(() => {
      if (autoFocus) document.getElementById(id)?.focus();
    }, [autoFocus, id]);

    /** The row's state with these keys replaced; a blank value or companion leaves the row */
    const change = (partial: PanelState) => {
      const owned = new Set(rowKeysOf(option));
      const merged = {
        ...Object.fromEntries(
          Object.entries(state).filter(([key]) => owned.has(key))
        ),
        ...partial,
      };
      onChange(
        Object.fromEntries(
          Object.entries(merged).filter(
            ([key, each]) =>
              each !== undefined &&
              each !== "" &&
              !(key === excludeKey && valuesOf(each).length === 0)
          )
        )
      );
    };

    const stored = state[option.key];
    const modifier = modifierKey === undefined ? undefined : state[modifierKey];
    const modifierValue =
      (typeof modifier === "string" ? modifier : undefined) ??
      option.defaultModifier;
    const depth = hierarchyKey === undefined ? undefined : state[hierarchyKey];

    const props: FilterControlProps = {
      type: option.type as FilterControlProps["type"],
      label: option.label ?? option.key,
      controlId: id,
      hideLabel,
      openPicker,
      value: isBlank(stored) ? option.defaultValue : stored,
      onChange: (value) => change({ [option.key]: rowValueOf(option, value) }),
      ...(option.options === undefined ? {} : { options: option.options }),
      ...(option.placeholder === undefined
        ? {}
        : { placeholder: option.placeholder }),
      ...(option.maxLength === undefined
        ? {}
        : { maxLength: option.maxLength }),
      ...(option.min === undefined ? {} : { min: option.min }),
      ...(option.max === undefined ? {} : { max: option.max }),
      ...(option.measure === undefined ? {} : { measure: option.measure }),
      ...(option.entityType === undefined
        ? {}
        : { entityType: option.entityType }),
      ...(option.multi === undefined ? {} : { multi: option.multi }),
      ...(option.noBlank === undefined ? {} : { noBlank: option.noBlank }),
      ...(option.countFilterContext === undefined
        ? {}
        : { countFilterContext: option.countFilterContext }),
      ...(option.modifierOptions === undefined
        ? {}
        : { modifierOptions: option.modifierOptions }),
      // Untouched, the option's default: the modifier the request carries
      ...(modifierValue === undefined ? {} : { modifierValue }),
      onModifierChange: (value) => {
        if (modifierKey !== undefined) change({ [modifierKey]: value });
      },
      supportsHierarchy: option.supportsHierarchy ?? false,
      ...(option.hierarchyLabel === undefined
        ? {}
        : { hierarchyLabel: option.hierarchyLabel }),
      hierarchyValue: typeof depth === "number" ? depth : undefined,
      ...(hierarchyKey === undefined
        ? {}
        : {
            onHierarchyChange: (value: number | undefined) =>
              change({ [hierarchyKey]: value }),
          }),
      // A picker whose field takes exclusions: its excluded values ride in
      // the exclude companion
      ...(excludeKey === undefined
        ? {}
        : {
            excluded: valuesOf(state[excludeKey]),
            onSelectionChange: (included: string[], excluded: string[]) =>
              change({ [option.key]: included, [excludeKey]: excluded }),
          }),
    };

    return <FilterControl ref={ref} {...props} />;
  }
);

FieldEditor.displayName = "FieldEditor";

export default FieldEditor;
