/**
 * Base Schemas
 *
 * Primitive and shared schemas used across all entity types.
 */
import { z } from "zod";

/**
 * Pagination response metadata
 */
export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  perPage: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/**
 * Date string in YYYY-MM-DD format
 */
export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

/**
 * ISO timestamp string
 */
export const TimestampSchema = z.string().datetime().nullable();

/**
 * Proxy URL path (starts with /api/proxy or is null)
 */
export const ProxyUrlSchema = z.string().nullable();

// Type exports
export type Pagination = z.infer<typeof PaginationSchema>;
