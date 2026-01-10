/**
 * Tag Schemas
 *
 * Zod schemas for tag API responses.
 */
import { z } from "zod";
import { ProxyUrlSchema, TimestampSchema } from "./base.js";

/**
 * Tag parent reference (minimal)
 */
export const TagParentRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * Full tag response
 */
export const TagSchema = z.object({
  // Core fields
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  ignore_auto_tag: z.boolean(),

  // Media
  image_path: ProxyUrlSchema,

  // Hierarchy
  parents: z.array(TagParentRefSchema),
  children: z.array(TagParentRefSchema),

  // Counts from Stash
  scene_count: z.number().nullable(),
  image_count: z.number().nullable(),
  gallery_count: z.number().nullable(),
  performer_count: z.number().nullable(),
  studio_count: z.number().nullable(),
  group_count: z.number().nullable(),

  // Peek computed counts
  scene_count_via_performers: z.number(),

  // Stash ratings
  rating100: z.number().nullable(),

  // Timestamps
  created_at: TimestampSchema,
  updated_at: TimestampSchema,

  // User data (Peek-specific)
  rating: z.number().nullable(),
  favorite: z.boolean(),
  o_counter: z.number(),
  play_count: z.number(),
});

/**
 * Tag list response
 */
export const FindTagsResponseSchema = z.object({
  findTags: z.object({
    count: z.number(),
    tags: z.array(TagSchema),
  }),
});

/**
 * Minimal tag (for dropdowns)
 */
export const TagMinimalSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Type exports
export type Tag = z.infer<typeof TagSchema>;
export type FindTagsResponse = z.infer<typeof FindTagsResponseSchema>;
export type TagMinimal = z.infer<typeof TagMinimalSchema>;
