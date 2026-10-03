/**
 * A filter chip's words, from its parts (`ChipParts`, the row codec's
 * `chip()`) and the names its ids resolved to.
 */
import type { ChipParts } from "../../utils/filterFields";

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
