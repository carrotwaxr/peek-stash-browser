/**
 * The codecs' keys and "is it filtering": a row holds its key and its
 * companions, and a multi ref or enum reads a lone string as one value, so
 * a filter stored while the field was single keeps filtering.
 */
import {
  type EditorKind,
  LIST_KINDS,
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
} from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import { CODECS, codecOf, valuesOf } from "@/utils/filterFields";

/** A list's panel row by key */
const field = (kind: ListKind, key: string): PanelField => {
  const rows: readonly PanelField[] = PANEL_FIELDS[kind];
  const row = rows.find((each) => each.key === key);
  if (!row) throw new Error(`No ${kind} row ${key}`);
  return row;
};

/** A list's panel row by key, edited as the editor says */
const rowOf = <K extends EditorKind>(
  kind: ListKind,
  key: string,
  editor: K
): Extract<PanelField, { editor: K }> => {
  const row = field(kind, key);
  if (row.editor !== editor) throw new Error(`${kind} ${key} is ${row.editor}`);
  return row as Extract<PanelField, { editor: K }>;
};

describe("codecs", () => {
  it("a row's keys are its key, then its modifier and depth companions", () => {
    expect(
      codecOf(field("scene", "tagIds")).keys(field("scene", "tagIds"))
    ).toEqual(["tagIds", "tagIdsModifier", "tagIdsDepth"]);
    expect(
      codecOf(field("scene", "resolution")).keys(field("scene", "resolution"))
    ).toEqual(["resolution", "resolutionModifier"]);
    expect(
      codecOf(field("scene", "title")).keys(field("scene", "title"))
    ).toEqual(["title"]);
  });

  it("every row's keys are the panel's UI key and companions", () => {
    for (const kind of LIST_KINDS) {
      for (const row of PANEL_FIELDS[kind] as readonly PanelField[]) {
        expect(codecOf(row).keys(row)[0]).toBe(row.key);
      }
    }
  });

  it("valuesOf reads a list, a lone string as one value and a stored number as its text", () => {
    expect(valuesOf(["1:a", "", "2:b"])).toEqual(["1:a", "2:b"]);
    expect(valuesOf("FEMALE")).toEqual(["FEMALE"]);
    expect(valuesOf(280)).toEqual(["280"]);
    expect(valuesOf("")).toEqual([]);
    expect(valuesOf(undefined)).toEqual([]);
    expect(valuesOf({ value: "x" })).toEqual([]);
    expect(valuesOf(Number.NaN)).toEqual([]);
  });

  it("a multi ref or enum filters with a lone string or a list", () => {
    const tags = rowOf("scene", "tagIds", "ref");
    const gender = rowOf("performer", "gender", "enum");

    expect(CODECS.ref.isActive(tags, { tagIds: "1:a" })).toBe(true);
    expect(CODECS.ref.isActive(tags, { tagIds: ["1:a"] })).toBe(true);
    expect(CODECS.ref.isActive(tags, { tagIds: [] })).toBe(false);
    expect(CODECS.ref.isActive(tags, { tagIdsModifier: "EXCLUDES" })).toBe(
      false
    );
    // The owner's default Performers preset
    expect(CODECS.enum.isActive(gender, { gender: "FEMALE" })).toBe(true);
    expect(CODECS.enum.isActive(gender, { gender: ["FEMALE", "MALE"] })).toBe(
      true
    );
    expect(CODECS.enum.isActive(gender, { gender: "" })).toBe(false);
  });

  it("a range or date range filters once a bound is set", () => {
    const rating = rowOf("scene", "rating", "number");
    const date = rowOf("scene", "date", "date");

    expect(CODECS.number.isActive(rating, { rating: { min: "0" } })).toBe(true);
    expect(CODECS.number.isActive(rating, { rating: { max: 40 } })).toBe(true);
    expect(CODECS.number.isActive(rating, { rating: { min: "" } })).toBe(false);
    expect(CODECS.number.isActive(rating, { rating: {} })).toBe(false);
    expect(CODECS.number.isActive(rating, {})).toBe(false);
    expect(CODECS.date.isActive(date, { date: { start: "2024-01-01" } })).toBe(
      true
    );
    expect(CODECS.date.isActive(date, { date: { end: "" } })).toBe(false);
  });

  it("text filters when not blank, a toggle when checked", () => {
    const title = rowOf("scene", "title", "text");
    const favorite = rowOf("scene", "favorite", "toggle");

    expect(CODECS.text.isActive(title, { title: "a" })).toBe(true);
    expect(CODECS.text.isActive(title, { title: "  " })).toBe(false);
    expect(CODECS.toggle.isActive(favorite, { favorite: true })).toBe(true);
    expect(CODECS.toggle.isActive(favorite, { favorite: "TRUE" })).toBe(true);
    expect(CODECS.toggle.isActive(favorite, { favorite: false })).toBe(false);
  });

  it("a choice filters only when it sends something", () => {
    const preview = rowOf("clip", "isGenerated", "choice");

    expect(CODECS.choice.isActive(preview, { isGenerated: "false" })).toBe(
      true
    );
    expect(CODECS.choice.isActive(preview, { isGenerated: "all" })).toBe(false);
    expect(CODECS.choice.isActive(preview, { isGenerated: "other" })).toBe(
      false
    );
  });

  it("the members later tasks fill say so", () => {
    const tags = rowOf("scene", "tagIds", "ref");

    expect(() => CODECS.ref.writeUrl(tags, {}, new URLSearchParams())).toThrow(
      "writeUrl: not yet"
    );
    expect(() =>
      CODECS.ref.readUrl(tags, new URLSearchParams(), {
        unitPreference: "metric",
      })
    ).toThrow("readUrl: not yet");
  });
});
