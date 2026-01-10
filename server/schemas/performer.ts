/**
 * Performer Schemas
 *
 * Zod schemas for performer API responses.
 */
import { z } from "zod";
import { TagRefSchema } from "./refs.js";
import { ProxyUrlSchema, TimestampSchema } from "./base.js";

/**
 * Full performer response
 */
export const PerformerSchema = z.object({
  // Core fields
  id: z.string(),
  name: z.string(),
  disambiguation: z.string().nullable(),
  gender: z.string().nullable(),

  // Profile
  birthdate: z.string().nullable(),
  death_date: z.string().nullable(),
  country: z.string().nullable(),
  ethnicity: z.string().nullable(),
  eye_color: z.string().nullable(),
  hair_color: z.string().nullable(),
  height_cm: z.number().nullable(),
  weight: z.number().nullable(),
  measurements: z.string().nullable(),
  fake_tits: z.string().nullable(),
  penis_length: z.number().nullable(),
  circumcised: z.string().nullable(),
  tattoos: z.string().nullable(),
  piercings: z.string().nullable(),
  career_length: z.string().nullable(),
  details: z.string().nullable(),

  // Media
  image_path: ProxyUrlSchema,

  // Lists
  aliases: z.array(z.string()).nullable(),
  urls: z.array(z.string()).nullable(),

  // Relationships
  tags: z.array(TagRefSchema),

  // Counts from Stash
  scene_count: z.number().nullable(),
  image_count: z.number().nullable(),
  gallery_count: z.number().nullable(),
  group_count: z.number().nullable(),
  performer_count: z.number().nullable(),
  o_counter: z.number().nullable(),

  // Stash ratings
  rating100: z.number().nullable(),

  // Timestamps
  created_at: TimestampSchema,
  updated_at: TimestampSchema,

  // User data (Peek-specific)
  rating: z.number().nullable(),
  favorite: z.boolean(),
  play_count: z.number(),
  last_played_at: TimestampSchema,
  last_o_at: TimestampSchema,
});

/**
 * Performer list response
 */
export const FindPerformersResponseSchema = z.object({
  findPerformers: z.object({
    count: z.number(),
    performers: z.array(PerformerSchema),
  }),
});

/**
 * Minimal performer (for dropdowns)
 */
export const PerformerMinimalSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Type exports
export type Performer = z.infer<typeof PerformerSchema>;
export type FindPerformersResponse = z.infer<typeof FindPerformersResponseSchema>;
export type PerformerMinimal = z.infer<typeof PerformerMinimalSchema>;
