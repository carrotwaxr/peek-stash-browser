/**
 * The panel's options are read from the shared field table: they must be
 * today's options exactly (the `options.json` goldens, key order included),
 * each row drawn by the control its editor needs, under its section's
 * header, and only the body measures change for an imperial viewer.
 */
import {
  type EditorKind,
  LIST_KINDS,
  type ListKind,
  PANEL_FIELDS,
  PANEL_GROUP_LABELS,
  type PanelField,
} from "@peek/shared-types";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { type FilterOption, filterOptionsOf } from "@/utils/filterFields";
import { untrusted } from "../../helpers/untrusted";

const goldenDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../__golden__"
);

interface OptionsGolden {
  options: FilterOption[];
  imperialOptions: FilterOption[] | "same as the metric options";
}

const goldenOf = (kind: ListKind) =>
  untrusted<OptionsGolden>(
    JSON.parse(readFileSync(resolve(goldenDir, kind, "options.json"), "utf8"))
  );

/** As the golden writes it, so a key out of order is a difference */
const text = (value: unknown) => JSON.stringify(value, null, 2);

const TYPE_OF: Readonly<Record<EditorKind, string>> = {
  ref: "searchable-select",
  number: "range",
  date: "date-range",
  text: "text",
  enum: "select",
  choice: "select",
  toggle: "checkbox",
};

describe("filterOptionsOf", () => {
  it.each(LIST_KINDS)(
    "filterOptionsOf(kind) gives the panel today's options: %s",
    (kind) => {
      const golden = goldenOf(kind);

      expect(text(filterOptionsOf(kind))).toBe(text(golden.options));
      expect(text(filterOptionsOf(kind, "imperial"))).toBe(
        text(
          golden.imperialOptions === "same as the metric options"
            ? golden.options
            : golden.imperialOptions
        )
      );
    }
  );

  it.each(LIST_KINDS)(
    "a field's FilterOption type follows its editor: %s",
    (kind) => {
      const rows: readonly PanelField[] = PANEL_FIELDS[kind];
      const expected = rows.flatMap((row, index) => {
        const opensRun = index === 0 || rows[index - 1]?.group !== row.group;
        const header = {
          key: `section-${row.group}`,
          type: "section-header",
          label: PANEL_GROUP_LABELS[row.group],
          collapsible: true,
          defaultOpen: row.group === "common",
        };
        const option = { key: row.key, type: TYPE_OF[row.editor] };
        return opensRun ? [header, option] : [option];
      });

      const options = filterOptionsOf(kind).map((option) =>
        option.type === "section-header"
          ? {
              key: option.key,
              type: option.type,
              label: option.label,
              collapsible: option.collapsible,
              defaultOpen: option.defaultOpen,
            }
          : { key: option.key, type: option.type }
      );
      expect(options).toEqual(expected);
    }
  );

  it("the imperial options convert only the measure fields", () => {
    const metric = filterOptionsOf("performer");
    const imperial = filterOptionsOf("performer", "imperial");
    const byKey = new Map(imperial.map((option) => [option.key, option]));

    expect(byKey.get("height")).toMatchObject({
      type: "imperial-height-range",
      label: "Height (ft/in)",
      min: 100,
      max: 250,
    });
    expect(byKey.get("weight")).toMatchObject({
      type: "range",
      label: "Weight (lbs)",
      min: 50,
      max: 500,
    });
    expect(byKey.get("penisLength")).toMatchObject({
      type: "range",
      label: "Penis Length (inches)",
      min: 1,
      max: 15,
    });
    const measures = new Set(["height", "weight", "penisLength"]);
    expect(imperial.filter((option) => !measures.has(option.key))).toEqual(
      metric.filter((option) => !measures.has(option.key))
    );
  });

  it("an unknown unit preference is metric", () => {
    expect(filterOptionsOf("performer", "")).toEqual(
      filterOptionsOf("performer")
    );
  });
});
