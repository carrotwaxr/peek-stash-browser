// shared/types/api/timeline.ts
/**
 * Timeline API Types
 *
 * Request and response types for /api/timeline/* endpoints.
 */
import type { ListRequestInput } from "../filters/index.js";

/** The bars' period: a year, a month, an ISO week (`2024-W12`) or a day */
export type TimelineGranularity = "years" | "months" | "weeks" | "days";

/** The lists a timeline counts, each on its own `date` */
export type TimelineEntityType = "scene" | "gallery" | "image";

// =============================================================================
// GET DATE DISTRIBUTION
// =============================================================================

/**
 * GET /api/timeline/:entityType/distribution: one entity parameter each
 * (`id` or `id:instanceId`), counted as the list request naming it
 * (INCLUDES); the POST takes the whole list request
 */
export interface GetDateDistributionParams extends Record<string, string> {
  entityType: string;
}

export interface GetDateDistributionQuery extends Record<
  string,
  string | string[] | undefined
> {
  granularity?: string;
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
  galleryId?: string;
}

// =============================================================================
// POST DATE DISTRIBUTION
// =============================================================================

/**
 * POST /api/timeline/:entityType/distribution: the list's own request
 * (`filter.q`, `<entity>_filter`, `ids`; its page and sort are not read)
 * plus the period. The bars count what the list shows.
 */
export type PostDateDistributionRequest<
  E extends TimelineEntityType = TimelineEntityType,
> = ListRequestInput<E> & {
  /** Default "months" */
  granularity?: TimelineGranularity;
};

export interface DateDistributionEntry {
  period: string;
  count: number;
}

export interface GetDateDistributionResponse {
  distribution: DateDistributionEntry[];
}
