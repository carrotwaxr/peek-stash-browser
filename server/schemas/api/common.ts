/**
 * Common API Response Schemas
 *
 * Shared response patterns for API endpoints.
 */
import { z } from "zod";

/**
 * Standard error response
 */
export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.string().optional(),
  errorType: z.string().optional(),
});

/**
 * Standard success response
 */
export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

/**
 * Cache not ready response (503)
 */
export const CacheNotReadyResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  ready: z.literal(false),
});

/**
 * Pagination metadata in responses
 */
export const PaginationMetaSchema = z.object({
  page: z.number(),
  per_page: z.number(),
  total: z.number(),
  total_pages: z.number(),
});

// Type exports
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type ApiSuccessResponse = z.infer<typeof ApiSuccessResponseSchema>;
export type CacheNotReadyResponse = z.infer<typeof CacheNotReadyResponseSchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
