// server/types/api/proxy.ts
/**
 * Proxy Controller Types
 *
 * Types for the internal HTTP proxy that forwards requests to Stash instances.
 */

import type { Response } from "express";

/**
 * Options for the shared proxy HTTP request helper
 */
export interface ProxyOptions {
  fullUrl: string;
  res: Response;
  label: string;
  defaultCacheControl: string;
  timeoutMs: number;
}
