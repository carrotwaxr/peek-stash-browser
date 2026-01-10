/**
 * Studio Schemas
 *
 * Zod schemas for studio API responses.
 */
import { z } from "zod";
import { TagRefSchema } from "./refs.js";
import { ProxyUrlSchema, TimestampSchema } from "./base.js";

/**
 * Studio parent reference (minimal)
 */
export const StudioParentRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  image_path: z.string().nullable(),
});

/**
 * Full studio response
 */
export const StudioSchema = z.object({
  // Core fields
  id: z.string(),
  name: z.string(),
  details: z.string().nullable(),
  url: z.string().nullable(),
  ignore_auto_tag: z.boolean(),

  // Media
  image_path: ProxyUrlSchema,

  // Hierarchy
  parent_studio: StudioParentRefSchema.nullable(),
  child_studios: z.array(StudioParentRefSchema),

  // Relationships
  tags: z.array(TagRefSchema),

  // Counts from Stash
  scene_count: z.number().nullable(),
  image_count: z.number().nullable(),
  gallery_count: z.number().nullable(),
  performer_count: z.number().nullable(),
  group_count: z.number().nullable(),

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
 * Studio list response
 */
export const FindStudiosResponseSchema = z.object({
  findStudios: z.object({
    count: z.number(),
    studios: z.array(StudioSchema),
  }),
});

/**
 * Minimal studio (for dropdowns)
 */
export const StudioMinimalSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Type exports
export type Studio = z.infer<typeof StudioSchema>;
export type FindStudiosResponse = z.infer<typeof FindStudiosResponseSchema>;
export type StudioMinimal = z.infer<typeof StudioMinimalSchema>;
