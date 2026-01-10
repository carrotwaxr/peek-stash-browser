/**
 * Gallery Schemas
 *
 * Zod schemas for gallery API responses.
 */
import { z } from "zod";
import { PerformerRefSchema, StudioRefSchema, TagRefSchema } from "./refs.js";
import { ProxyUrlSchema, TimestampSchema } from "./base.js";

/**
 * Full gallery response
 */
export const GallerySchema = z.object({
  // Core fields
  id: z.string(),
  title: z.string().nullable(),
  code: z.string().nullable(),
  details: z.string().nullable(),
  photographer: z.string().nullable(),
  date: z.string().nullable(),
  organized: z.boolean(),

  // Media
  cover: ProxyUrlSchema,
  paths: z.object({
    cover: ProxyUrlSchema,
  }).nullable(),

  // File info
  folder: z.object({
    path: z.string(),
  }).nullable(),
  files: z.array(z.object({
    path: z.string(),
  })),

  // Relationships
  studio: StudioRefSchema.nullable(),
  performers: z.array(PerformerRefSchema),
  tags: z.array(TagRefSchema),
  scenes: z.array(z.object({ id: z.string(), title: z.string().nullable() })),

  // Counts
  image_count: z.number().nullable(),

  // Stash ratings
  rating100: z.number().nullable(),

  // Timestamps
  created_at: TimestampSchema,
  updated_at: TimestampSchema,

  // User data (Peek-specific)
  rating: z.number().nullable(),
  favorite: z.boolean(),
});

/**
 * Gallery list response
 */
export const FindGalleriesResponseSchema = z.object({
  findGalleries: z.object({
    count: z.number(),
    galleries: z.array(GallerySchema),
  }),
});

// Type exports
export type Gallery = z.infer<typeof GallerySchema>;
export type FindGalleriesResponse = z.infer<typeof FindGalleriesResponseSchema>;
