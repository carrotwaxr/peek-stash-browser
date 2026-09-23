/**
 * The one place that says who exclusions apply to.
 * - Content restrictions (admin-set Show-only/Always-hide lists) apply to non-admin accounts only.
 *   Enforced at compute time: an admin's UserExcludedEntity rows never contain restriction output.
 * - Hidden items apply to everyone. Enforced by having no role check on any read path:
 *   every list, by-id, download and media check consults UserExcludedEntity for every user.
 */
export const RESTRICTABLE_ENTITY_TYPES = [
  "groups",
  "tags",
  "studios",
  "galleries",
] as const;
export type RestrictableEntityType = (typeof RESTRICTABLE_ENTITY_TYPES)[number];

export const RESTRICTION_MODES = ["INCLUDE", "EXCLUDE"] as const;
export type RestrictionMode = (typeof RESTRICTION_MODES)[number];

export function restrictionsApplyTo(role: string): boolean {
  return role !== "ADMIN";
}

/** Default for a row whose client omitted restrictEmpty (owner decision Q4). */
export function defaultRestrictEmpty(mode: RestrictionMode): boolean {
  return mode === "INCLUDE";
}
