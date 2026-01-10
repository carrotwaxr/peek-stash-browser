/**
 * Scene Schemas
 *
 * Zod schemas for scene API responses.
 */
import { z } from "zod";
import { PerformerRefSchema, StudioRefSchema, TagRefSchema, GroupRefSchema, GalleryRefSchema } from "./refs.js";
import { ProxyUrlSchema, TimestampSchema } from "./base.js";

/**
 * Scene file information
 */
export const SceneFileSchema = z.object({
  id: z.string(),
  path: z.string(),
  size: z.number(),
  duration: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  bit_rate: z.number().nullable(),
  frame_rate: z.number().nullable(),
  video_codec: z.string().nullable(),
  audio_codec: z.string().nullable(),
});

/**
 * Scene paths for media access
 */
export const ScenePathsSchema = z.object({
  screenshot: ProxyUrlSchema,
  preview: ProxyUrlSchema,
  sprite: ProxyUrlSchema,
  vtt: ProxyUrlSchema,
  stream: ProxyUrlSchema,
  webp: ProxyUrlSchema,
  funscript: ProxyUrlSchema,
  caption: ProxyUrlSchema,
  interactive_heatmap: ProxyUrlSchema,
});

/**
 * Scene stream option
 */
export const SceneStreamSchema = z.object({
  url: z.string(),
  mime_type: z.string().nullable(),
  label: z.string().nullable(),
});

/**
 * Group with scene index (for scene's groups array)
 */
export const SceneGroupSchema = GroupRefSchema.extend({
  scene_index: z.number().nullable(),
});

/**
 * Full scene response - used for browse and detail
 */
export const SceneSchema = z.object({
  // Core fields
  id: z.string(),
  title: z.string().nullable(),
  code: z.string().nullable(),
  details: z.string().nullable(),
  director: z.string().nullable(),
  date: z.string().nullable(),

  // Technical fields
  duration: z.number().nullable(),
  organized: z.boolean(),

  // Stash ratings (from server)
  rating100: z.number().nullable(),

  // Media paths
  paths: ScenePathsSchema.nullable(),

  // Streams
  sceneStreams: z.array(SceneStreamSchema),

  // Relationships
  studio: StudioRefSchema.nullable(),
  performers: z.array(PerformerRefSchema),
  tags: z.array(TagRefSchema),
  groups: z.array(SceneGroupSchema),
  galleries: z.array(GalleryRefSchema),

  // Files
  files: z.array(SceneFileSchema),

  // Timestamps
  created_at: TimestampSchema,
  updated_at: TimestampSchema,

  // User data (Peek-specific)
  rating: z.number().nullable(),
  favorite: z.boolean(),
  o_counter: z.number(),
  play_count: z.number(),
  play_duration: z.number(),
  resume_time: z.number(),
  play_history: z.array(z.string()),
  o_history: z.array(z.coerce.date()),
  last_played_at: TimestampSchema,
  last_o_at: TimestampSchema,

  // Inherited tags
  inheritedTagIds: z.array(z.string()).optional(),
  inheritedTags: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});

/**
 * Scene list response
 */
export const FindScenesResponseSchema = z.object({
  findScenes: z.object({
    count: z.number(),
    scenes: z.array(SceneSchema),
  }),
});

// Type exports
export type SceneFile = z.infer<typeof SceneFileSchema>;
export type ScenePaths = z.infer<typeof ScenePathsSchema>;
export type SceneStream = z.infer<typeof SceneStreamSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type FindScenesResponse = z.infer<typeof FindScenesResponseSchema>;
