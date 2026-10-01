// server/types/api/proxy.ts
/**
 * Proxy Controller Types
 *
 * Types for the internal HTTP proxy that forwards requests to Stash instances.
 */
import type { Response } from "express";
import type { OutgoingHttpHeaders } from "http";

/**
 * Options for the shared proxy HTTP request helper
 */
export interface ProxyOptions {
  fullUrl: string;
  res: Response;
  label: string;
  defaultCacheControl: string;
  timeoutMs: number;
  /** Headers sent to Stash: the browser's `Range` and `If-Range`, when it sent them */
  requestHeaders: OutgoingHttpHeaders;
  /** The browser's HEAD goes to Stash as HEAD, so no body is fetched */
  method: "GET" | "HEAD";
}
