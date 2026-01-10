/**
 * Entity Reference Schemas
 *
 * Minimal reference types for embedding in other entities.
 * These represent "just enough" data to display and link.
 */
import { z } from "zod";

/**
 * Base entity reference - id + name
 */
export const EntityRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * Performer reference for embedding in scenes/galleries
 */
export const PerformerRefSchema = EntityRefSchema.extend({
  image_path: z.string().nullable(),
  gender: z.string().nullable(),
  disambiguation: z.string().nullable(),
});

/**
 * Studio reference for embedding
 */
export const StudioRefSchema = EntityRefSchema.extend({
  image_path: z.string().nullable(),
});

/**
 * Tag reference for embedding
 */
export const TagRefSchema = EntityRefSchema.extend({
  image_path: z.string().nullable(),
});

/**
 * Group reference for embedding in scenes
 */
export const GroupRefSchema = EntityRefSchema.extend({
  front_image_path: z.string().nullable(),
});

/**
 * Gallery reference for embedding
 */
export const GalleryRefSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  cover: z.string().nullable(),
  image_count: z.number().nullable(),
});

// Type exports
export type EntityRef = z.infer<typeof EntityRefSchema>;
export type PerformerRef = z.infer<typeof PerformerRefSchema>;
export type StudioRef = z.infer<typeof StudioRefSchema>;
export type TagRef = z.infer<typeof TagRefSchema>;
export type GroupRef = z.infer<typeof GroupRefSchema>;
export type GalleryRef = z.infer<typeof GalleryRefSchema>;
