/**
 * RecommendationPreferences: how one user wants Recommended and similar
 * scenes tuned. Stored as JSON on `User.recommendationPreferences` (NULL
 * means the defaults).
 */
import { parseEntityRef } from "./instanceAwareId.js";

export const PERFORMER_GENDERS = [
  "FEMALE",
  "MALE",
  "TRANSGENDER_FEMALE",
  "TRANSGENDER_MALE",
  "INTERSEX",
  "NON_BINARY",
] as const;
export type PerformerGender = (typeof PERFORMER_GENDERS)[number];

export const NO_PARTNER_SCENES = ["normal", "less"] as const;
export const DISCOVERY_MODES = ["new", "balanced", "rewatch"] as const;

/** Most tags a user can ignore. */
export const MAX_IGNORED_TAGS = 200;

export interface RecommendationPreferences {
  /** "Performers I follow"; [] = everyone is a lead, no partner logic */
  leadGenders: PerformerGender[];
  /**
   * "Partners who matter"; disjoint from leadGenders. A performer of neither
   * list counts as a lead (half weight in Recommended, a Top Performer in
   * My Stats).
   */
  partnerGenders: PerformerGender[];
  /** "Scenes without a partner": "less" = less often unless every lead is a favorite */
  noPartnerScenes: (typeof NO_PARTNER_SCENES)[number];
  discovery: (typeof DISCOVERY_MODES)[number];
  /** "id:instanceId" (InstanceAwareId), at most MAX_IGNORED_TAGS */
  ignoredTagIds: string[];
}

export const DEFAULT_RECOMMENDATION_PREFERENCES: RecommendationPreferences = {
  leadGenders: [],
  partnerGenders: [],
  noPartnerScenes: "normal",
  discovery: "balanced",
  ignoredTagIds: [],
};

const isGender = (v: unknown): v is PerformerGender =>
  typeof v === "string" && (PERFORMER_GENDERS as readonly string[]).includes(v);

/** True for "id:instanceId" with both parts non-empty. */
const isInstanceTagId = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  const { id, instanceId } = parseEntityRef(v);
  return id !== "" && instanceId !== undefined && instanceId !== "";
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Keeps the entries that pass `keep`, first occurrence only. */
function distinct<T>(raw: unknown, keep: (v: unknown) => v is T): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const v of raw as unknown[]) {
    if (keep(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Stored JSON to a value: defaults for anything missing or malformed, never
 * throws.
 */
export function readRecommendationPreferences(
  raw: unknown
): RecommendationPreferences {
  const src = isRecord(raw) ? raw : {};
  const leadGenders = distinct(src.leadGenders, isGender);
  const partnerGenders =
    leadGenders.length === 0
      ? []
      : distinct(src.partnerGenders, isGender).filter(
          (g) => !leadGenders.includes(g)
        );
  return {
    leadGenders,
    partnerGenders,
    noPartnerScenes: NO_PARTNER_SCENES.includes(
      src.noPartnerScenes as "normal" | "less"
    )
      ? (src.noPartnerScenes as "normal" | "less")
      : DEFAULT_RECOMMENDATION_PREFERENCES.noPartnerScenes,
    discovery: DISCOVERY_MODES.includes(
      src.discovery as "new" | "balanced" | "rewatch"
    )
      ? (src.discovery as "new" | "balanced" | "rewatch")
      : DEFAULT_RECOMMENDATION_PREFERENCES.discovery,
    ignoredTagIds: distinct(src.ignoredTagIds, isInstanceTagId).slice(
      0,
      MAX_IGNORED_TAGS
    ),
  };
}

type Validation =
  | { ok: true; value: RecommendationPreferences }
  | { ok: false; error: string };

function genderList(raw: unknown, name: string): string | PerformerGender[] {
  if (!Array.isArray(raw)) return `${name} must be a list`;
  const out: PerformerGender[] = [];
  for (const v of raw as unknown[]) {
    if (!isGender(v)) return `${name} holds an unknown gender`;
    if (out.includes(v)) return `${name} holds a gender twice`;
    out.push(v);
  }
  return out;
}

/** A PUT body to a value, or the first thing wrong with it. */
export function validateRecommendationPreferences(raw: unknown): Validation {
  if (!isRecord(raw)) {
    return { ok: false, error: "recommendationPreferences must be an object" };
  }

  const leadGenders = genderList(raw.leadGenders, "leadGenders");
  if (typeof leadGenders === "string") return { ok: false, error: leadGenders };
  const partnerGenders = genderList(raw.partnerGenders, "partnerGenders");
  if (typeof partnerGenders === "string") {
    return { ok: false, error: partnerGenders };
  }
  if (partnerGenders.some((g) => leadGenders.includes(g))) {
    return {
      ok: false,
      error: "A gender cannot be both a lead and a partner",
    };
  }
  if (partnerGenders.length > 0 && leadGenders.length === 0) {
    return {
      ok: false,
      error: "partnerGenders needs at least one lead gender",
    };
  }

  const { noPartnerScenes, discovery, ignoredTagIds } = raw;
  if (noPartnerScenes !== "normal" && noPartnerScenes !== "less") {
    return { ok: false, error: "noPartnerScenes must be 'normal' or 'less'" };
  }
  if (
    discovery !== "new" &&
    discovery !== "balanced" &&
    discovery !== "rewatch"
  ) {
    return {
      ok: false,
      error: "discovery must be 'new', 'balanced' or 'rewatch'",
    };
  }

  if (!Array.isArray(ignoredTagIds)) {
    return { ok: false, error: "ignoredTagIds must be a list" };
  }
  if (ignoredTagIds.length > MAX_IGNORED_TAGS) {
    return {
      ok: false,
      error: `At most ${MAX_IGNORED_TAGS} tags can be ignored`,
    };
  }
  const tags: string[] = [];
  for (const v of ignoredTagIds as unknown[]) {
    if (!isInstanceTagId(v)) {
      return {
        ok: false,
        error: "ignoredTagIds entries must be 'id:instanceId'",
      };
    }
    if (tags.includes(v)) {
      return { ok: false, error: "ignoredTagIds holds a tag twice" };
    }
    tags.push(v);
  }

  return {
    ok: true,
    value: {
      leadGenders,
      partnerGenders,
      noPartnerScenes,
      discovery,
      ignoredTagIds: tags,
    },
  };
}
