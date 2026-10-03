// shared/types/filters/tree.ts
/**
 * The where tree a list request carries beside its `<entity>_filter`: the
 * user's rows as AND/OR groups, the key grammar of the flat state a URL or a
 * View holds, and the rule that merges two rows of one field.
 */
import type { FieldSpec } from "./criteria.js";
import type { FieldSpecOf, ListKind } from "./fields.js";
import { MAX_REF_VALUES } from "./fields.js";
import type { CriterionInput } from "./wire.js";

export const MATCHES = ["all", "any"] as const;
export type Match = (typeof MATCHES)[number];

/**
 * The root plus one level of groups; 20 rows, 5 groups, and 2000 values
 * across the tree (`refs`: every ref, playlist id and enum value a row names,
 * its excludes included)
 */
export const WHERE_LIMITS = {
  depth: 2,
  rows: 20,
  groups: 5,
  refs: 2000,
} as const;

/** Fields a row may name: every contract field but the page's own (`ids`, `instance_id`) */
export type WhereField<E extends ListKind> = Exclude<
  keyof FieldSpecOf<E> & string,
  "ids" | "instance_id"
>;

/** One row: a field and its criterion as `<entity>_filter` would carry it (ids as "id:instanceId") */
export type WhereLeaf<E extends ListKind> = {
  [F in WhereField<E>]: {
    readonly field: F;
    readonly criterion: CriterionInput<Extract<FieldSpecOf<E>[F], FieldSpec>>;
  };
}[WhereField<E>];

export interface WhereGroup<E extends ListKind> {
  readonly match: Match;
  /** Leaves; the root's may also be groups (depth 2), a group's only leaves */
  readonly rules: readonly WhereNode<E>[];
}
export type WhereNode<E extends ListKind> = WhereLeaf<E> | WhereGroup<E>;

export const isWhereGroup = (node: unknown): node is WhereGroup<ListKind> =>
  typeof node === "object" &&
  node !== null &&
  "rules" in node &&
  Array.isArray(node.rules) &&
  "match" in node;

// =============================================================================
// SAME-FIELD MERGE
// =============================================================================

/** The most values a merged leaf may name: the field's own cap */
export function anyMergeCap(spec: FieldSpec): number {
  return spec.kind === "playlist" ? spec.maxValues : MAX_REF_VALUES;
}

/**
 * The key under which two leaves of one "any" container merge into one
 * INCLUDES over the union of their values; undefined when the leaf never
 * merges. A leaf merges when its spec is a ref, playlist or multi-enum field,
 * it reads "any of its values" (INCLUDES, or INCLUDES_ALL with exactly one
 * value; a missing modifier is the field's default), it has no `excludes`, and
 * the key is the field plus its depth (absent is 0). A caller checks the
 * union against `anyMergeCap(spec)` and keeps the leaves apart when it passes.
 */
export function anyMergeKey(
  field: string,
  spec: FieldSpec,
  criterion: {
    readonly modifier?: string | null;
    readonly depth?: number | null;
    readonly excludes?: readonly unknown[] | null;
    readonly valueCount: number;
  }
): string | undefined {
  const mergeable =
    spec.kind === "ref" ||
    spec.kind === "playlist" ||
    (spec.kind === "enum" && spec.multi);
  if (!mergeable) return undefined;
  if (criterion.excludes && criterion.excludes.length > 0) return undefined;
  const modifier = criterion.modifier ?? spec.defaultModifier;
  const readsAny =
    modifier === "INCLUDES" ||
    (modifier === "INCLUDES_ALL" && criterion.valueCount === 1);
  if (!readsAny) return undefined;
  return `${field}@${criterion.depth ?? 0}`;
}

// =============================================================================
// KEY GRAMMAR
// =============================================================================

/*
 * One flat filter state whose keys may carry a row prefix:
 *
 *   <key>   := [ "g" G "." ] [ N "." ] <panel key or companion>
 *   G       := 1..5    a group (WHERE_LIMITS.groups)
 *   N       := 2..20   the Nth row of that panel key in its container (the first has no N)
 *   "g" G   := "all" | "any"   the group's match
 *   "match" := "any"           the root's match (absent: all)
 */

/** The root's match key */
export const ROOT_MATCH_KEY = "match";

export interface RowKey {
  /** 0 is the root */
  readonly group: number;
  /** 1 is the first */
  readonly occurrence: number;
  readonly key: string;
}

/** G: 1 to 5, no leading zero; N: 2 to 20, no leading zero */
const ROW_KEY = /^(?:g([1-5])\.)?(?:([2-9]|1\d|20)\.)?(.+)$/;

/** Reads a state key's prefixes; undefined for "match", "gN" and out-of-range prefixes */
export function parseRowKey(raw: string): RowKey | undefined {
  if (raw === ROOT_MATCH_KEY) return undefined;
  const found = ROW_KEY.exec(raw);
  if (!found) return undefined;
  const [, group, occurrence, key] = found;
  if (key === undefined || /^g\d+$/.test(raw)) return undefined;
  // a base key that still looks like a prefix ("g6.x", "21.x", "1.x", "g0.x") is not a row key
  if (/^(?:g\d+|\d+)\./.test(key)) return undefined;
  return {
    group: group === undefined ? 0 : Number(group),
    occurrence: occurrence === undefined ? 1 : Number(occurrence),
    key,
  };
}

/** The key of a row's panel key: `rowKeyOf(1, 2, "tagIds")` is `g1.2.tagIds` */
export function rowKeyOf(
  group: number,
  occurrence: number,
  key: string
): string {
  return `${group > 0 ? `g${group}.` : ""}${occurrence > 1 ? `${occurrence}.` : ""}${key}`;
}

/** A group's match key: `g1` */
export function groupKeyOf(group: number): string {
  return `g${group}`;
}
