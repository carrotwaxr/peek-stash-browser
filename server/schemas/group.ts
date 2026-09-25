/**
 * Group Schemas
 *
 * Zod schemas for group API responses.
 */
import { z } from "zod";
import { ProxyUrlSchema, TimestampSchema } from "./base.js";
import { StudioRefSchema, TagRefSchema } from "./refs.js";

/**
 * One link of the collection hierarchy: the group at the other end, on the
 * same instance, and Stash's description of the link
 */
const GroupRelationRefSchema = z.object({
  group: z.object({
    id: z.string(),
    name: z.string(),
    instanceId: z.string(),
  }),
  description: z.string().nullable(),
});

/**
 * Full group response
 */
export const GroupSchema = z.object({
  // Core fields
  id: z.string(),
  name: z.string(),
  aliases: z.string().nullable(),
  director: z.string().nullable(),
  description: z.string().nullable(),
  date: z.string().nullable(),
  duration: z.number().nullable(),

  // Media
  front_image_path: ProxyUrlSchema,
  back_image_path: ProxyUrlSchema,

  // Relationships
  studio: StudioRefSchema.nullable(),
  tags: z.array(TagRefSchema),

  // The collection hierarchy, on the detail request only: the groups this
  // one is in and its sub-groups, each with the link's description
  containing_groups: z.array(GroupRelationRefSchema).optional(),
  sub_groups: z.array(GroupRelationRefSchema).optional(),

  // Counts
  scene_count: z.number().nullable(),
  sub_group_count: z.number(),

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
 * Group list response
 */
export const FindGroupsResponseSchema = z.object({
  findGroups: z.object({
    count: z.number(),
    groups: z.array(GroupSchema),
  }),
});

/**
 * Minimal group (for dropdowns)
 */
export const GroupMinimalSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Type exports
export type Group = z.infer<typeof GroupSchema>;
export type FindGroupsResponse = z.infer<typeof FindGroupsResponseSchema>;
export type GroupMinimal = z.infer<typeof GroupMinimalSchema>;
