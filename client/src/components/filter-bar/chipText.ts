/**
 * A filter chip's words, from its parts (`ChipParts`, the row codec's
 * `chip()`) and the names its ids resolved to.
 */
import type { Match } from "@peek/shared-types";
import type { ChipParts, FilterChip } from "../../utils/filterFields";

/** Names a chip looks up: the rest show as a count */
export const NAMES_SHOWN = 3;

/** Names a lookup resolved, and how many it did not return */
export type Resolved =
  | { readonly names: readonly string[]; readonly unavailable: number }
  | undefined;

/** Resolved names as a list: the first few, then how many more */
export function namesText(ids: readonly string[], resolved: Resolved): string {
  const listed = [
    ...(resolved?.names ?? []),
    ...(resolved !== undefined && resolved.unavailable > 0
      ? [`${resolved.unavailable} unavailable`]
      : []),
  ].join(", ");
  const more = ids.length - NAMES_SHOWN;
  return more > 0 ? `${listed} +${more} more` : listed;
}

/**
 * The chip's text, from its parts and the names its ids resolved to: the
 * picks with their condition, then the exclusions ("Tags: any of Blonde;
 * not Redhead")
 */
export function chipText(
  parts: ChipParts,
  resolved: Resolved,
  excludedResolved: Resolved
): string {
  const {
    label,
    condition,
    values,
    ids,
    excludedIds = [],
    suffix = "",
  } = parts;
  if (ids !== undefined) {
    // Names not known yet (loading, failed, or no lookup): how many
    if (
      (ids.length > 0 && resolved === undefined) ||
      (excludedIds.length > 0 && excludedResolved === undefined)
    ) {
      return `${label}: ${ids.length + excludedIds.length} selected`;
    }
    // A condition on nothing named reads as nonsense
    const named = (resolved?.names.length ?? 0) > 0 && condition !== undefined;
    const body = [
      ...(ids.length > 0
        ? [`${named ? `${condition} ` : ""}${namesText(ids, resolved)}`]
        : []),
      ...(excludedIds.length > 0
        ? [`not ${namesText(excludedIds, excludedResolved)}`]
        : []),
    ].join("; ");
    return `${label}: ${body}${suffix}`;
  }
  const body = [condition, ...(values ?? [])].filter(Boolean).join(" ");
  return body === "" ? label : `${label}: ${body}${suffix}`;
}

/**
 * A group's chip text from its match and its rows' field names, one per
 * row (a field twice is named twice): "Any of: Favorite Tags, Favorite
 * Performers". No values are looked up: the row view shows them.
 */
export function groupText(match: Match, labels: readonly string[]): string {
  const shown = labels.slice(0, NAMES_SHOWN).join(", ");
  const more = labels.length - NAMES_SHOWN;
  return `${match === "any" ? "Any of" : "All of"}: ${shown}${
    more > 0 ? ` +${more} more` : ""
  }`;
}

/** A detail page's own filters by name (`permanentFiltersMetadata`) */
export interface PermanentFiltersMetadata {
  performers?: Array<{ id: string; name: string }>;
  studios?: Array<{ id: string; name: string }>;
  tags?: Array<{ id: string; name: string }>;
  [key: string]: unknown;
}

/**
 * A detail page's own filters as chips: a plain label in the bar, no edit
 * and no remove, and the Advanced view's "Fixed by this page"
 */
export const permanentChipsOf = (
  metadata: PermanentFiltersMetadata
): FilterChip[] => [
  ...(metadata.performers ?? []).map((performer) => ({
    key: "performers",
    parts: { label: "Performer", values: [performer.name] },
  })),
  ...(metadata.studios ?? []).map((studio) => ({
    key: "studios",
    parts: { label: "Studio", values: [studio.name] },
  })),
  ...(metadata.tags ?? []).map((tag) => ({
    key: "tags",
    parts: { label: "Tag", values: [tag.name] },
  })),
];
