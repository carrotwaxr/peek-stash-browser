// shared/types/api/stats.ts
/**
 * Stats API Types
 *
 * Request and response types for /api/stats endpoints.
 * These are public (unauthenticated) endpoints.
 */

// =============================================================================
// GET STATS
// =============================================================================

/** GET /api/stats */
export interface StatsSystemInfo {
  platform: string;
  arch: string;
  cpuCount: number;
  uptime: string;
  uptimeSeconds: number;
  totalMemory: string;
  freeMemory: string;
  usedMemory: string;
  memoryUsagePercent: string;
}

export interface StatsProcessInfo {
  heapUsed: string;
  heapTotal: string;
  heapUsedPercent: string;
  external: string;
  rss: string;
  arrayBuffers: string;
}

export interface StatsCacheInfo {
  isInitialized: boolean;
  isRefreshing: boolean;
  lastRefreshed: string | null;
  counts: {
    scenes: number;
    performers: number;
    studios: number;
    tags: number;
    galleries: number;
    groups: number;
    images: number;
    clips: number;
    ungeneratedClips: number;
  };
  estimatedSize: string;
}

export interface StatsDatabaseInfo {
  size: string;
  sizeBytes: number;
  path: string;
}

export interface GetStatsResponse {
  system: StatsSystemInfo;
  process: StatsProcessInfo;
  cache: StatsCacheInfo;
  database: StatsDatabaseInfo;
}

// =============================================================================
// REFRESH CACHE
// =============================================================================

/** POST /api/stats/refresh-cache */
export interface RefreshCacheResponse {
  success: boolean;
  message: string;
  error?: string;
}
