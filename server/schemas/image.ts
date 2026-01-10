/**
 * Image Schemas
 *
 * Zod schemas for image API responses.
 */
import { z } from "zod";
import { PerformerRefSchema, StudioRefSchema, TagRefSchema, GalleryRefSchema } from "./refs.js";
import { ProxyUrlSchema, TimestampSchema } from "./base.js";

/**
 * Image file info
 */
export const ImageFileSchema = z.object({
  path: z.string(),
  size: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});

/**
 * Image paths for media access
 */
export const ImagePathsSchema = z.object({
  thumbnail: ProxyUrlSchema,
  preview: ProxyUrlSchema,
  image: ProxyUrlSchema,
});

/**
 * Full image response
 */
export const ImageSchema = z.object({
  // Core fields
  id: z.string(),
  title: z.string().nullable(),
  code: z.string().nullable(),
  details: z.string().nullable(),
  photographer: z.string().nullable(),
  date: z.string().nullable(),
  organized: z.boolean(),

  // Media paths
  paths: ImagePathsSchema.nullable(),

  // File info
  files: z.array(ImageFileSchema),

  // Visual
  visual_files: z.array(z.object({
    width: z.number().nullable(),
    height: z.number().nullable(),
  })),

  // Relationships
  studio: StudioRefSchema.nullable(),
  performers: z.array(PerformerRefSchema),
  tags: z.array(TagRefSchema),
  galleries: z.array(GalleryRefSchema),

  // Stash ratings & counters
  rating100: z.number().nullable(),
  o_counter: z.number().nullable(),

  // Timestamps
  created_at: TimestampSchema,
  updated_at: TimestampSchema,

  // User data (Peek-specific)
  rating: z.number().nullable(),
  favorite: z.boolean(),
  oCounter: z.number(),
  viewCount: z.number(),
  lastViewedAt: TimestampSchema,
});

/**
 * Image list response
 */
export const FindImagesResponseSchema = z.object({
  findImages: z.object({
    count: z.number(),
    images: z.array(ImageSchema),
  }),
});

// Type exports
export type ImageFile = z.infer<typeof ImageFileSchema>;
export type ImagePaths = z.infer<typeof ImagePathsSchema>;
export type Image = z.infer<typeof ImageSchema>;
export type FindImagesResponse = z.infer<typeof FindImagesResponseSchema>;
