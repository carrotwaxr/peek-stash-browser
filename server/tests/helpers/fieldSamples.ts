/**
 * One valid sample criterion per filter field, built from the shared spec
 * (`shared/types/filters/fields.ts`), for the query builders' field-table
 * tests: each field's clause runs once, and the test reads what it bound.
 *
 * `bound` lists the values the sample's clause must bind, in the order the
 * criterion gives them; a string stands for any parameter that contains it
 * (a LIKE pattern wraps the text), and a `{ day }` for the day's text or an
 * instant within two days of it (a day column binds the text, an instant
 * column the epoch milliseconds of the zoned bound).
 */
import type { FieldSpec } from "@peek/shared-types/filters/index.js";

export type Bound = string | number | { readonly day: string };

export interface FieldSample {
  readonly field: string;
  /** The parsed criterion, as the parser hands it to the builder */
  readonly criterion: unknown;
  /** What the clause binds from it, in order */
  readonly bound: readonly Bound[];
}

/** The ref ids the samples name, on the instance the tests allow */
export const SAMPLE_REF = { id: "5", instanceId: "inst-a" } as const;
export const SAMPLE_NUMBER = 7;
export const SAMPLE_TEXT = "needle";
export const SAMPLE_DAY = "2026-01-02";

/** The first of the spec's modifiers that is one of `preferred`, else its default */
function pick<M extends string>(
  modifiers: readonly M[],
  fallback: M,
  ...preferred: M[]
): M {
  return preferred.find((m) => modifiers.includes(m)) ?? fallback;
}

/** The sample criterion for one field, or null for the base's `instance_id` */
export function sampleFor(field: string, spec: FieldSpec): FieldSample | null {
  switch (spec.kind) {
    case "instance":
      return null;
    case "boolean":
      return { field, criterion: true, bound: [] };
    case "ref":
      return {
        field,
        criterion: {
          refs: [SAMPLE_REF],
          modifier: spec.defaultModifier,
          depth: spec.hierarchical ? -1 : 0,
        },
        bound: [SAMPLE_REF.id, SAMPLE_REF.instanceId],
      };
    case "playlist":
      return {
        field,
        criterion: { ids: [3], modifier: spec.defaultModifier },
        bound: [3],
      };
    case "number": {
      const modifier = pick(
        spec.modifiers,
        spec.defaultModifier,
        "GREATER_THAN"
      );
      return {
        field,
        criterion: { modifier, value: SAMPLE_NUMBER },
        bound: [SAMPLE_NUMBER],
      };
    }
    case "date": {
      const modifier = pick(
        spec.modifiers,
        spec.defaultModifier,
        "GREATER_THAN"
      );
      return {
        field,
        criterion: { modifier, value: SAMPLE_DAY },
        bound: [{ day: SAMPLE_DAY }],
      };
    }
    case "text": {
      const modifier = pick(spec.modifiers, spec.defaultModifier, "INCLUDES");
      return {
        field,
        criterion: { modifier, value: SAMPLE_TEXT },
        bound: [SAMPLE_TEXT],
      };
    }
    case "enum": {
      const value = spec.values[0];
      if (value === undefined) throw new Error(`${field} has no values`);
      return spec.multi
        ? {
            field,
            criterion: { modifier: "INCLUDES", values: [value] },
            bound: [value],
          }
        : {
            field,
            criterion: { modifier: spec.defaultModifier, value },
            bound: [value],
          };
    }
  }
}

/**
 * Other valid criteria for one field, for the branches the primary sample
 * leaves: a ref's other modifier and its presence checks, a number or text
 * field's "not set" or its other shape, a boolean's `false`, an enum's other
 * value. Each is a sample of its own (`label` names the modifier).
 */
export function alternatesFor(
  field: string,
  spec: FieldSpec
): (FieldSample & { readonly label: string })[] {
  const make = (
    label: string,
    criterion: unknown,
    bound: readonly Bound[] = []
  ) => ({ field, label: `${field} ${label}`, criterion, bound });
  switch (spec.kind) {
    case "instance":
    case "playlist":
      return [];
    case "boolean":
      return [make("false", false)];
    case "ref": {
      const refs = [SAMPLE_REF];
      const depth = spec.hierarchical ? -1 : 0;
      const other = spec.modifiers.includes("INCLUDES_ALL")
        ? "INCLUDES_ALL"
        : "EXCLUDES";
      return [
        make(other, { refs, modifier: other, depth }, [
          SAMPLE_REF.id,
          SAMPLE_REF.instanceId,
        ]),
        ...PRESENCE.filter((m) => spec.modifiers.includes(m)).map((m) =>
          make(m, { refs: [], modifier: m, depth })
        ),
      ];
    }
    case "number":
    case "date": {
      const [lo, hi] =
        spec.kind === "number" ? [3, 9] : ["2026-01-02", "2026-03-04"];
      return [
        make("BETWEEN", { modifier: "BETWEEN", value: lo, value2: hi }, [
          spec.kind === "number" ? lo : { day: String(lo) },
          spec.kind === "number" ? hi : { day: String(hi) },
        ]),
        ...PRESENCE.filter((m) => spec.modifiers.includes(m)).map((m) =>
          make(m, { modifier: m })
        ),
      ];
    }
    case "text":
      return [
        make("EQUALS", { modifier: "EQUALS", value: SAMPLE_TEXT }, [
          SAMPLE_TEXT,
        ]),
        ...PRESENCE.filter((m) => spec.modifiers.includes(m)).map((m) =>
          make(m, { modifier: m })
        ),
      ];
    case "enum": {
      const last = spec.values[spec.values.length - 1];
      if (last === undefined) return [];
      return [
        spec.multi
          ? make(
              "INCLUDES",
              { modifier: "INCLUDES", values: [...spec.values] },
              [...spec.values]
            )
          : make("last", { modifier: spec.defaultModifier, value: last }, [
              last,
            ]),
        ...PRESENCE.filter((m) => spec.modifiers.includes(m)).map((m) =>
          make(m, { modifier: m })
        ),
      ];
    }
  }
}

const PRESENCE = ["IS_NULL", "NOT_NULL"] as const;

/** The alternates of every field of a table, as `[label, sample]` rows for `it.each` */
export function alternatesOf(
  fields: Readonly<Record<string, FieldSpec>>,
  /** The values a field's alternates bind when they are not their own (a favourite's ids) */
  bound: Readonly<Record<string, readonly Bound[]>> = {}
): [string, FieldSample][] {
  return Object.entries(fields).flatMap(([field, spec]) =>
    alternatesFor(field, spec).map((alt): [string, FieldSample] => [
      alt.label,
      { ...alt, bound: bound[field] ?? alt.bound },
    ])
  );
}

/** A sample for every field of a table but the base's, as `[field, sample]` rows for `it.each` */
export function samplesOf(
  fields: Readonly<Record<string, FieldSpec>>,
  /** The values a field's clause binds when they are not the sample's own (a favourite's ids) */
  bound: Readonly<Record<string, readonly Bound[]>> = {}
): [string, FieldSample][] {
  return Object.entries(fields).flatMap(([field, spec]) => {
    const sample = sampleFor(field, spec);
    if (sample === null) return [];
    return [[field, { ...sample, bound: bound[field] ?? sample.bound }]];
  });
}

/** The filter that carries a sample, as the builder takes it */
export function filterOf(sample: FieldSample): Record<string, unknown> {
  return { [sample.field]: sample.criterion };
}

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

/** Whether one parameter is the expected value */
function matches(param: unknown, want: Bound): boolean {
  if (typeof want === "object") {
    return (
      (typeof param === "string" && param.includes(want.day)) ||
      (typeof param === "number" &&
        Math.abs(param - Date.parse(want.day)) <= TWO_DAYS)
    );
  }
  return (
    param === want ||
    (typeof want === "string" &&
      typeof param === "string" &&
      param.includes(want))
  );
}

/**
 * The first expected value the parameters lack, or null when they hold
 * every one in order: a number as it is, a string as a parameter that
 * equals or contains it
 */
export function firstMissingBound(
  params: readonly unknown[],
  bound: readonly Bound[]
): Bound | null {
  let from = 0;
  for (const want of bound) {
    const at = params.findIndex(
      (param, i) => i >= from && matches(param, want)
    );
    if (at === -1) return want;
    from = at + 1;
  }
  return null;
}

/** The statement's WHERE, up to its ORDER BY */
export function whereOf(sql: string): string {
  return sql.slice(sql.indexOf("\nWHERE "), sql.indexOf("\nORDER BY"));
}
