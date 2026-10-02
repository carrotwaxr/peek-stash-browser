/**
 * The shared panel field table (`shared/types/filters/panel/`): one row per
 * filter the panel offers, checked against the list's contract fields, so
 * the panel, URL, presets and carousels that read it cannot offer what the
 * server's parser refuses.
 */
import {
  BREAST_TYPES,
  CLIP_PARAMS,
  ETHNICITIES,
  EYE_COLORS,
  type EditorKind,
  FIELDS,
  type FieldKind,
  type FieldSpec,
  HAIR_COLORS,
  LIST_KINDS,
  type ListKind,
  PANEL_FIELDS,
  PANEL_GROUPS,
  PANEL_GROUP_LABELS,
  type PanelField,
  RESOLUTIONS,
} from "@peek/shared-types";
import { describe, expect, it } from "vitest";

const TABLES: Record<ListKind, Readonly<Record<string, FieldSpec>>> = {
  ...FIELDS,
  clip: CLIP_PARAMS,
};

const panelOf = (kind: ListKind): readonly PanelField[] => PANEL_FIELDS[kind];

/** The editors each contract kind may be offered with */
const EDITORS_FOR: Readonly<Record<FieldKind, readonly EditorKind[]>> = {
  ref: ["ref"],
  // No panel row offers playlists yet (F18, F22)
  playlist: [],
  number: ["number"],
  date: ["date"],
  // A performer attribute Stash stores as free text is picked from a list
  text: ["text", "enum"],
  enum: ["enum", "choice"],
  boolean: ["toggle", "choice"],
  instance: [],
};

/** The value lists of the free-text attributes the panel offers as a select */
const FREE_TEXT_VALUES: Readonly<Record<string, readonly string[]>> = {
  ethnicity: ETHNICITIES,
  hair_color: HAIR_COLORS,
  eye_color: EYE_COLORS,
  fake_tits: BREAST_TYPES,
};

describe("panel field table", () => {
  it("every panel field fills a contract field of its list and its editor fits the field's kind", () => {
    const wrong = LIST_KINDS.flatMap((kind) =>
      panelOf(kind).flatMap((field) => {
        const spec = TABLES[kind][field.field];
        if (!spec) return [`${kind}.${field.key}: no field ${field.field}`];
        return EDITORS_FOR[spec.kind].includes(field.editor)
          ? []
          : [`${kind}.${field.key}: ${field.editor} on ${spec.kind}`];
      })
    );

    expect(wrong).toEqual([]);
  });

  it("panel keys are unique per list", () => {
    const wrong = LIST_KINDS.flatMap((kind) => {
      const keys = panelOf(kind).map((field) => field.key);
      return keys.filter((key, index) => keys.indexOf(key) !== index);
    });

    expect(wrong).toEqual([]);
  });

  it("companion keys are unique per list and never collide with a panel key or a contract field name", () => {
    const wrong = LIST_KINDS.flatMap((kind) => {
      const panel = panelOf(kind);
      const keys = new Set(panel.map((field) => field.key));
      const fieldNames = new Set(Object.keys(TABLES[kind]));
      const companions = panel.flatMap((field) =>
        [field.modifierKey, field.hierarchyKey].filter(
          (key): key is string => key !== undefined
        )
      );
      return companions
        .filter(
          (key, index) =>
            companions.indexOf(key) !== index ||
            keys.has(key) ||
            fieldNames.has(key)
        )
        .map((key) => `${kind}.${key}`);
    });

    expect(wrong).toEqual([]);
  });

  it("a ref field names a hierarchyKey only when its spec is hierarchical, and a modifierKey only when it offers more than one modifier", () => {
    const wrong = LIST_KINDS.flatMap((kind) =>
      panelOf(kind).flatMap((field) => {
        if (field.editor !== "ref") return [];
        const spec = TABLES[kind][field.field];
        if (spec?.kind !== "ref") return [`${kind}.${field.key}: not a ref`];
        const problems: string[] = [];
        if (field.hierarchyKey && !spec.hierarchical) {
          problems.push("hierarchyKey without a hierarchical spec");
        }
        if (field.hierarchyKey && !field.hierarchyLabel) {
          problems.push("hierarchyKey without a label");
        }
        if ((field.modifierKey !== undefined) !== field.modifiers.length > 1) {
          problems.push("modifierKey and modifier count disagree");
        }
        if (field.modifierKey && !field.modifierLabels) {
          problems.push("modifierKey without modifierLabels");
        }
        return problems.map((problem) => `${kind}.${field.key}: ${problem}`);
      })
    );

    expect(wrong).toEqual([]);
  });

  it("every offered modifier is one its field takes, and the default is offered", () => {
    const wrong = LIST_KINDS.flatMap((kind) =>
      panelOf(kind).flatMap((field) => {
        if (field.editor !== "ref" && field.editor !== "enum") return [];
        const spec = TABLES[kind][field.field];
        const taken: readonly string[] =
          spec && "modifiers" in spec ? spec.modifiers : [];
        const offered: readonly string[] = field.modifiers ?? [];
        return [
          ...offered.filter((modifier) => !taken.includes(modifier)),
          ...(field.defaultModifier && !offered.includes(field.defaultModifier)
            ? [`default ${field.defaultModifier}`]
            : []),
        ].map((modifier) => `${kind}.${field.key} ${modifier}`);
      })
    );

    expect(wrong).toEqual([]);
  });

  it("an enum field with a modifierKey offers more than one modifier", () => {
    const wrong = LIST_KINDS.flatMap((kind) =>
      panelOf(kind).flatMap((field) =>
        field.editor === "enum" &&
        (field.modifierKey !== undefined) !== (field.modifiers?.length ?? 0) > 1
          ? [`${kind}.${field.key}`]
          : []
      )
    );

    expect(wrong).toEqual([]);
  });

  it("every enum choice is a value of the contract's enum", () => {
    const wrong = LIST_KINDS.flatMap((kind) =>
      panelOf(kind).flatMap((field) => {
        if (field.editor !== "enum") return [];
        const spec = TABLES[kind][field.field];
        const values: readonly string[] | undefined =
          spec?.kind === "enum" ? spec.values : FREE_TEXT_VALUES[field.field];
        if (!values) return [`${kind}.${field.key}: no value list`];
        return field.choices
          .filter((choice) => !values.includes(choice.value))
          .map((choice) => `${kind}.${field.key} ${choice.value}`);
      })
    );

    expect(wrong).toEqual([]);
  });

  it("the resolution choices cover every resolution but VR_HD, as Stash's own panel does", () => {
    const resolution = PANEL_FIELDS.scene.find(
      (field) => field.key === "resolution"
    );
    const offered =
      resolution?.editor === "enum"
        ? resolution.choices.map((choice) => choice.value)
        : [];

    expect(offered).toEqual(
      RESOLUTIONS.filter((resolution) => resolution !== "VR_HD")
    );
  });

  it("a choice field sends a value of its kind and defaults to one of its choices", () => {
    const wrong = LIST_KINDS.flatMap((kind) =>
      panelOf(kind).flatMap((field) => {
        if (field.editor !== "choice") return [];
        const spec = TABLES[kind][field.field];
        const problems = field.choices
          .filter((choice) =>
            spec?.kind === "boolean"
              ? choice.sends !== undefined && typeof choice.sends !== "boolean"
              : true
          )
          .map((choice) => `sends ${String(choice.sends)}`);
        if (
          !field.choices.some((choice) => choice.value === field.defaultValue)
        ) {
          problems.push(`default ${field.defaultValue}`);
        }
        return problems.map((problem) => `${kind}.${field.key} ${problem}`);
      })
    );

    expect(wrong).toEqual([]);
  });

  it("every field has a label and a group, and each list's groups appear in one run each", () => {
    const wrong = LIST_KINDS.flatMap((kind) => {
      const panel = panelOf(kind);
      const problems = panel
        .filter(
          (field) =>
            field.label.trim() === "" || !PANEL_GROUPS.includes(field.group)
        )
        .map((field) => `${kind}.${field.key}: label or group`);
      const runs = panel
        .map((field) => field.group)
        .filter((group, index, groups) => group !== groups[index - 1]);
      const repeated = runs.filter(
        (group, index) => runs.indexOf(group) !== index
      );
      return [
        ...problems,
        ...repeated.map((group) => `${kind}: ${group} in two runs`),
      ];
    });

    expect(wrong).toEqual([]);
    expect(PANEL_GROUPS.map((group) => PANEL_GROUP_LABELS[group])).toEqual([
      "Common Filters",
      "Entity Filters",
      "Date Ranges",
      "Video Properties",
      "Performer Attributes",
      "Other Filters",
    ]);
  });

  it("only scene fields carry the carousel flag (carousels are scene rules)", () => {
    const wrong = LIST_KINDS.filter((kind) => kind !== "scene").flatMap(
      (kind) =>
        panelOf(kind)
          .filter((field) => field.carousel !== undefined)
          .map((field) => `${kind}.${field.key}`)
    );

    expect(wrong).toEqual([]);
  });

  it("each list's pins for a new user (9b) are pinnable", () => {
    const pinned = Object.fromEntries(
      LIST_KINDS.map((kind) => [
        kind,
        panelOf(kind)
          .filter((field) => field.pinnedByDefault)
          .map((field) => field.key),
      ])
    );
    const unpinnable = LIST_KINDS.flatMap((kind) =>
      panelOf(kind)
        .filter((field) => field.pinnedByDefault && field.pinnable === false)
        .map((field) => `${kind}.${field.key}`)
    );

    expect(unpinnable).toEqual([]);
    expect(pinned).toEqual({
      scene: ["performerIds", "tagIds", "rating"],
      performer: ["tagIds", "gender", "rating"],
      studio: ["tagIds", "rating"],
      tag: ["rating"],
      group: ["tagIds", "rating"],
      gallery: ["tagIds", "rating"],
      image: ["tagIds", "rating"],
      clip: ["tagIds"],
    });
  });
});
