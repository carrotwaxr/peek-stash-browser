/**
 * Unit tests for the filter and sort contract in `shared/types/filters`
 * (item 38).
 *
 * The contract declares each list's filter fields (kind, modifiers, default
 * modifier, hierarchy), its sorts and default sort, and the filter-panel keys
 * that name those fields. The server's parser and the client's options both
 * read it, so these checks keep the tables consistent with themselves.
 */
import {
  CLIP_PARAMS,
  DEFAULT_SORT,
  FIELDS,
  type FieldSpec,
  LIST_KINDS,
  type ListKind,
  SORTS,
  UI_KEYS,
} from "@peek/shared-types/filters/index.js";
import { describe, expect, it } from "vitest";

const TABLES: Record<ListKind, Readonly<Record<string, FieldSpec>>> = {
  ...FIELDS,
  clip: CLIP_PARAMS,
};

/** Every field of every table, named `<list>.<field>` */
const allFields = (): [string, FieldSpec][] =>
  LIST_KINDS.flatMap((kind) =>
    Object.entries(TABLES[kind]).map(([name, spec]): [string, FieldSpec] => [
      `${kind}.${name}`,
      spec,
    ])
  );

describe("filter contract", () => {
  it("every default modifier is one of its field's modifiers", () => {
    const wrong = allFields().flatMap(([name, spec]) => {
      if (!("modifiers" in spec)) return [];
      const modifiers: readonly string[] = spec.modifiers;
      return modifiers.length > 0 && modifiers.includes(spec.defaultModifier)
        ? []
        : [name];
    });

    expect(wrong).toEqual([]);
  });

  it("single-valued ref fields offer no INCLUDES_ALL", () => {
    const wrong = allFields().flatMap(([name, spec]) => {
      if (spec.kind !== "ref" || !spec.single) return [];
      const modifiers: readonly string[] = spec.modifiers;
      return modifiers.includes("INCLUDES_ALL") ? [name] : [];
    });

    expect(wrong).toEqual([]);
  });

  it("each sort list has no duplicates and holds its default sort", () => {
    const wrong = LIST_KINDS.flatMap((kind) => {
      const sorts: readonly string[] = SORTS[kind];
      const problems: string[] = [];
      if (new Set(sorts).size !== sorts.length) {
        problems.push(`${kind}: duplicate sort`);
      }
      if (!sorts.includes(DEFAULT_SORT[kind].field)) {
        problems.push(`${kind}: default ${DEFAULT_SORT[kind].field} missing`);
      }
      return problems;
    });

    expect(wrong).toEqual([]);
  });

  it("every UI key names a field of its entity", () => {
    const wrong = LIST_KINDS.flatMap((kind) => {
      const fields = Object.keys(TABLES[kind]);
      return UI_KEYS[kind]
        .filter((uiKey) => !fields.includes(uiKey.field))
        .map((uiKey) => `${kind}.${uiKey.key} -> ${uiKey.field}`);
    });

    expect(wrong).toEqual([]);
  });
});
