/**
 * The filter panel's options and sorts follow the shared contract
 * (`shared/types/filters`, item 38): every filter key is a UI key of its
 * entity with the same modifier and hierarchy companions, every UI key is
 * offered, and every sort is one the server accepts.
 */
import {
  CLIP_FIELDS,
  FIELDS,
  type FieldSpec,
  LIST_KINDS,
  type ListKind,
  RECOMMENDED_SORTS,
  SORTS,
  UI_KEYS,
} from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import {
  CLIP_FILTER_OPTIONS,
  CLIP_SORT_OPTIONS,
  type FilterOption,
  GALLERY_FILTER_OPTIONS,
  GALLERY_SORT_OPTIONS,
  GROUP_FILTER_OPTIONS,
  GROUP_SORT_OPTIONS,
  IMAGE_FILTER_OPTIONS,
  IMAGE_SORT_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  PERFORMER_SORT_OPTIONS,
  RECOMMENDED_SORT_OPTIONS,
  SCENE_FILTER_OPTIONS,
  SCENE_SORT_OPTIONS,
  STUDIO_FILTER_OPTIONS,
  STUDIO_SORT_OPTIONS,
  TAG_FILTER_OPTIONS,
  TAG_SORT_OPTIONS,
} from "@/utils/filterConfig";

const FILTER_OPTIONS: Record<ListKind, readonly FilterOption[]> = {
  scene: SCENE_FILTER_OPTIONS,
  performer: PERFORMER_FILTER_OPTIONS,
  studio: STUDIO_FILTER_OPTIONS,
  tag: TAG_FILTER_OPTIONS,
  group: GROUP_FILTER_OPTIONS,
  gallery: GALLERY_FILTER_OPTIONS,
  image: IMAGE_FILTER_OPTIONS,
  clip: CLIP_FILTER_OPTIONS,
};

const SORT_OPTIONS: Record<ListKind, readonly { value: string }[]> = {
  scene: SCENE_SORT_OPTIONS,
  performer: PERFORMER_SORT_OPTIONS,
  studio: STUDIO_SORT_OPTIONS,
  tag: TAG_SORT_OPTIONS,
  group: GROUP_SORT_OPTIONS,
  gallery: GALLERY_SORT_OPTIONS,
  image: IMAGE_SORT_OPTIONS,
  clip: CLIP_SORT_OPTIONS,
};

/** A filter key with its companions, as a comparable line */
const describeKey = (key: {
  key: string;
  modifierKey?: string;
  hierarchyKey?: string;
}) =>
  `${key.key} modifier=${key.modifierKey ?? "-"} hierarchy=${key.hierarchyKey ?? "-"}`;

describe("client filter options and the shared contract", () => {
  it.each(LIST_KINDS)(
    "every %s filter option key, modifierKey and hierarchyKey is a UI key of its entity, and every UI key is used",
    (kind) => {
      const fromOptions = FILTER_OPTIONS[kind]
        .filter((option) => option.type !== "section-header")
        .map(describeKey)
        .sort();
      const fromContract = UI_KEYS[kind].map(describeKey).sort();

      expect(fromOptions).toEqual(fromContract);
    }
  );

  it.each(LIST_KINDS)(
    "every %s option offers only modifiers its field takes, and defaults to one of them",
    (kind) => {
      const fields: Readonly<Record<string, FieldSpec>> =
        kind === "clip" ? CLIP_FIELDS : FIELDS[kind];
      const refused = FILTER_OPTIONS[kind].flatMap((option) => {
        const uiKey = UI_KEYS[kind].find((key) => key.key === option.key);
        const spec = uiKey ? fields[uiKey.field] : undefined;
        if (!spec || !("modifiers" in spec)) return [];
        const taken: readonly string[] = spec.modifiers;
        return [
          ...(option.modifierOptions ?? []).map((choice) => choice.value),
          ...(option.defaultModifier ? [option.defaultModifier] : []),
        ]
          .filter((modifier) => !taken.includes(modifier))
          .map((modifier) => `${option.key} ${modifier}`);
      });

      expect(refused).toEqual([]);
    }
  );

  it.each(LIST_KINDS)(
    "every %s sort option value is in its entity's sort list",
    (kind) => {
      const sorts: readonly string[] = SORTS[kind];
      const unknown = SORT_OPTIONS[kind]
        .map((option) => option.value)
        .filter((value) => !sorts.includes(value));

      expect(unknown).toEqual([]);
    }
  );

  it.each(LIST_KINDS)(
    "every %s text option carries its contract field's maxLength",
    (kind) => {
      const fields: Readonly<Record<string, FieldSpec>> =
        kind === "clip" ? CLIP_FIELDS : FIELDS[kind];
      const texts = FILTER_OPTIONS[kind].filter(
        (option) => option.type === "text"
      );
      const limits = texts.map((option) => {
        const uiKey = UI_KEYS[kind].find((key) => key.key === option.key);
        const spec = uiKey ? fields[uiKey.field] : undefined;
        return {
          key: option.key,
          maxLength: option.maxLength,
          contract: spec?.kind === "text" ? spec.maxLength : undefined,
        };
      });

      expect(limits.filter((limit) => limit.contract === undefined)).toEqual(
        []
      );
      expect(
        limits.filter((limit) => limit.maxLength !== limit.contract)
      ).toEqual([]);
    }
  );

  it("the Recommended sort options name every Recommended sort once, `Recommended` first", () => {
    const values = RECOMMENDED_SORT_OPTIONS.map((option) => option.value);

    expect(RECOMMENDED_SORT_OPTIONS[0]).toEqual({
      value: "recommended",
      label: "Recommended",
    });
    const sorts: readonly string[] = RECOMMENDED_SORTS;

    expect(values.filter((value) => !sorts.includes(value))).toEqual([]);
    expect(values.slice(1)).toEqual(
      SCENE_SORT_OPTIONS.map((option) => option.value)
    );
    expect(new Set(values).size).toBe(values.length);
  });
});
