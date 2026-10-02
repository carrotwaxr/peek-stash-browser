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

  it("the member the chips fill says so", () => {
    const tags = rowOf("scene", "tagIds", "ref");

    expect(() => CODECS.ref.chip(tags, { kind: "ref" } as never, {})).toThrow(
      "chip: not yet"
    );
  });
});

describe("the URL members", () => {
  const write = (row: PanelField, state: Record<string, unknown>): string => {
    const params = new URLSearchParams();
    codecOf(row).writeUrl(row, state, params);
    return params.toString();
  };
  const read = (row: PanelField, query: string) =>
    codecOf(row).readUrl(row, new URLSearchParams(query));

  it("a multi ref writes a comma list and reads it back; a lone string is a list of one", () => {
    const tags = field("scene", "tagIds");

    expect(
      write(tags, { tagIds: ["1:a", "2:b"], tagIdsModifier: "EXCLUDES" })
    ).toBe("tagIds=1%3Aa%2C2%3Ab&tagIdsModifier=EXCLUDES");
    expect(write(tags, { tagIds: "1:a" })).toBe("tagIds=1%3Aa");
    expect(read(tags, "tagIds=1:a,2:b&tagIdsDepth=-1")).toEqual({
      tagIds: ["1:a", "2:b"],
      tagIdsDepth: -1,
    });
  });

  it("a card's singular param joins the page's instance", () => {
    expect(read(field("scene", "tagIds"), "tagId=5&instance=abc")).toEqual({
      tagIds: ["5:abc"],
    });
    expect(read(field("scene", "studioId"), "studioId=3&instance=abc")).toEqual(
      { studioId: "3:abc" }
    );
    // A value that names its instance keeps it
    expect(
      read(field("scene", "studioId"), "studioId=3:other&instance=abc")
    ).toEqual({ studioId: "3:other" });
  });

  it("a select with a condition writes both and reads both", () => {
    const resolution = field("scene", "resolution");

    expect(
      write(resolution, {
        resolution: "FULL_HD",
        resolutionModifier: "NOT_EQUALS",
      })
    ).toBe("resolution=FULL_HD&resolutionModifier=NOT_EQUALS");
    expect(
      read(resolution, "resolution=FULL_HD&resolutionModifier=NOT_EQUALS")
    ).toEqual({ resolution: "FULL_HD", resolutionModifier: "NOT_EQUALS" });
    expect(write(resolution, { resolutionModifier: "NOT_EQUALS" })).toBe("");
  });

  it("a range writes a bound that is a number or text, zero included", () => {
    const rating = field("scene", "rating");

    expect(write(rating, { rating: { min: 0, max: "" } })).toBe("rating_min=0");
    expect(write(rating, { rating: { max: "0" } })).toBe("rating_max=0");
    expect(write(rating, { rating: {} })).toBe("");
    expect(read(rating, "rating_min=60")).toEqual({ rating: { min: "60" } });
    expect(read(rating, "")).toEqual({});
  });

  it("a date range, a text, a toggle and a choice go through their own keys", () => {
    expect(
      write(field("scene", "date"), { date: { start: "2024-01-01" } })
    ).toBe("date_start=2024-01-01");
    expect(read(field("scene", "date"), "date_end=2024-02-01")).toEqual({
      date: { end: "2024-02-01" },
    });
    expect(write(field("scene", "title"), { title: "beach" })).toBe(
      "title=beach"
    );
    expect(read(field("scene", "title"), "title=beach")).toEqual({
      title: "beach",
    });
    expect(write(field("scene", "favorite"), { favorite: true })).toBe(
      "favorite=true"
    );
    expect(write(field("scene", "favorite"), { favorite: false })).toBe("");
    expect(read(field("scene", "favorite"), "favorite=true")).toEqual({
      favorite: true,
    });
    expect(write(field("clip", "isGenerated"), { isGenerated: "false" })).toBe(
      "isGenerated=false"
    );
  });

  it("a body measure reads leniently: a non-number is dropped, decimals and far values kept", () => {
    const weight = field("performer", "weight");

    expect(read(weight, "weight_min=abc")).toEqual({});
    expect(read(weight, "weight_min=abc&weight_max=80")).toEqual({
      weight: { max: "80" },
    });
    expect(read(weight, "weight_min=1e9")).toEqual({
      weight: { min: "1e9" },
    });
    expect(read(weight, "weight_min=68.5")).toEqual({
      weight: { min: "68.5" },
    });
    expect(write(weight, { weight: { min: "abc", max: 90 } })).toBe(
      "weight_max=90"
    );
  });

  it("only a body measure normalizes", () => {
    const rating = field("scene", "rating");
    const state = { min: "abc" };

    expect(codecOf(rating).normalize(rating, state)).toBe(state);
    expect(CODECS.text.normalize(rowOf("scene", "title", "text"), 5)).toBe(5);
  });
});
