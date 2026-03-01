// server/types/api/timeline.ts
/**
 * Timeline API Types
 *
 * Request and response types for /api/timeline/* endpoints.
 */

// =============================================================================
// GET DATE DISTRIBUTION
// =============================================================================

/** GET /api/timeline/:entityType/distribution */
export interface GetDateDistributionParams extends Record<string, string> {
  entityType: string;
}

export interface GetDateDistributionQuery extends Record<string, string | string[] | undefined> {
  granularity?: string;
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
}

export interface DateDistributionEntry {
  period: string;
  count: number;
}

export interface GetDateDistributionResponse {
  distribution: DateDistributionEntry[];
}
