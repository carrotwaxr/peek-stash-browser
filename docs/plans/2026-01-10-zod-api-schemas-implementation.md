# Zod API Schemas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce Zod schemas as source of truth for Peek's API responses, decoupling from Stash types.

**Architecture:** Create composable Zod schemas in `server/schemas/`, transform DB entities to validated API shapes, migrate endpoints incrementally.

**Tech Stack:** Zod ^3.22, TypeScript, Express

---

## Task 1: Install Zod Dependency

**Files:**
- Modify: `server/package.json`

**Step 1: Install zod**

```bash
cd server && npm install zod
```

**Step 2: Verify installation**

Run: `npm list zod`
Expected: `zod@3.x.x`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zod dependency"
```

---

## Task 2: Create Schema Directory Structure

**Files:**
- Create: `server/schemas/index.ts`
- Create: `server/schemas/base.ts`
- Create: `server/schemas/refs.ts`

**Step 1: Create schemas directory and base schemas**

Create `server/schemas/base.ts`:
```typescript
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
```

**Step 2: Create reference schemas**

Create `server/schemas/refs.ts`:
```typescript
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
```

**Step 3: Create index re-export**

Create `server/schemas/index.ts`:
```typescript
/**
 * Schema Index
 *
 * Re-exports all Zod schemas for API validation.
 */

// Base schemas
export * from "./base.js";

// Reference schemas
export * from "./refs.js";
```

**Step 4: Commit**

```bash
git add server/schemas/
git commit -m "feat: add base and reference Zod schemas"
```

---

## Task 3: Create Scene Schemas

**Files:**
- Create: `server/schemas/scene.ts`
- Modify: `server/schemas/index.ts`

**Step 1: Create scene schemas**

Create `server/schemas/scene.ts`:
```typescript
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
```

**Step 2: Update index**

Add to `server/schemas/index.ts`:
```typescript
// Scene schemas
export * from "./scene.js";
```

**Step 3: Commit**

```bash
git add server/schemas/
git commit -m "feat: add scene Zod schemas"
```

---

## Task 4: Create Performer Schemas

**Files:**
- Create: `server/schemas/performer.ts`
- Modify: `server/schemas/index.ts`

**Step 1: Create performer schemas**

Create `server/schemas/performer.ts`:
```typescript
/**
 * Performer Schemas
 *
 * Zod schemas for performer API responses.
 */
import { z } from "zod";
import { StudioRefSchema, TagRefSchema } from "./refs.js";
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
```

**Step 2: Update index**

Add to `server/schemas/index.ts`:
```typescript
// Performer schemas
export * from "./performer.js";
```

**Step 3: Commit**

```bash
git add server/schemas/
git commit -m "feat: add performer Zod schemas"
```

---

## Task 5: Create Tag and Studio Schemas

**Files:**
- Create: `server/schemas/tag.ts`
- Create: `server/schemas/studio.ts`
- Modify: `server/schemas/index.ts`

**Step 1: Create tag schemas**

Create `server/schemas/tag.ts`:
```typescript
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
```

**Step 2: Create studio schemas**

Create `server/schemas/studio.ts`:
```typescript
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
```

**Step 3: Update index**

Add to `server/schemas/index.ts`:
```typescript
// Tag schemas
export * from "./tag.js";

// Studio schemas
export * from "./studio.js";
```

**Step 4: Commit**

```bash
git add server/schemas/
git commit -m "feat: add tag and studio Zod schemas"
```

---

## Task 6: Create Gallery and Image Schemas

**Files:**
- Create: `server/schemas/gallery.ts`
- Create: `server/schemas/image.ts`
- Modify: `server/schemas/index.ts`

**Step 1: Create gallery schemas**

Create `server/schemas/gallery.ts`:
```typescript
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
```

**Step 2: Create image schemas**

Create `server/schemas/image.ts`:
```typescript
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
  rating100: z.number().nullable(),
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
```

**Step 3: Update index**

Add to `server/schemas/index.ts`:
```typescript
// Gallery schemas
export * from "./gallery.js";

// Image schemas
export * from "./image.js";
```

**Step 4: Commit**

```bash
git add server/schemas/
git commit -m "feat: add gallery and image Zod schemas"
```

---

## Task 7: Create Group Schemas

**Files:**
- Create: `server/schemas/group.ts`
- Modify: `server/schemas/index.ts`

**Step 1: Create group schemas**

Create `server/schemas/group.ts`:
```typescript
/**
 * Group Schemas
 *
 * Zod schemas for group API responses.
 */
import { z } from "zod";
import { StudioRefSchema, TagRefSchema } from "./refs.js";
import { ProxyUrlSchema, TimestampSchema } from "./base.js";

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

  // Containing group (if sub-group)
  containing_groups: z.array(z.object({
    group: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })),
  sub_groups: z.array(z.object({
    group: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })),

  // Counts
  scene_count: z.number().nullable(),

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
```

**Step 2: Update index**

Add to `server/schemas/index.ts`:
```typescript
// Group schemas
export * from "./group.js";
```

**Step 3: Commit**

```bash
git add server/schemas/
git commit -m "feat: add group Zod schemas"
```

---

## Task 8: Create API Response Schemas

**Files:**
- Create: `server/schemas/api/common.ts`
- Create: `server/schemas/api/index.ts`
- Modify: `server/schemas/index.ts`

**Step 1: Create common API response schemas**

Create `server/schemas/api/common.ts`:
```typescript
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
```

**Step 2: Create API index**

Create `server/schemas/api/index.ts`:
```typescript
/**
 * API Schema Index
 *
 * Re-exports all API-specific schemas.
 */
export * from "./common.js";
```

**Step 3: Update main index**

Add to `server/schemas/index.ts`:
```typescript
// API response schemas
export * from "./api/index.js";
```

**Step 4: Commit**

```bash
git add server/schemas/
git commit -m "feat: add common API response schemas"
```

---

## Task 9: Create Schema Test File

**Files:**
- Create: `server/tests/schemas/schemas.test.ts`

**Step 1: Create comprehensive schema tests**

Create `server/tests/schemas/schemas.test.ts`:
```typescript
/**
 * Schema Tests
 *
 * Verify Zod schemas accept valid data and reject invalid data.
 */
import { describe, it, expect } from "vitest";
import {
  SceneSchema,
  PerformerSchema,
  TagSchema,
  StudioSchema,
  GallerySchema,
  ImageSchema,
  GroupSchema,
  PerformerRefSchema,
  StudioRefSchema,
  TagRefSchema,
} from "../../schemas/index.js";

describe("Reference Schemas", () => {
  describe("PerformerRefSchema", () => {
    it("validates correct performer ref", () => {
      const valid = {
        id: "123",
        name: "Test Performer",
        image_path: "/api/proxy/stash?path=/performer/123",
        gender: "FEMALE",
        disambiguation: null,
      };
      expect(() => PerformerRefSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing required fields", () => {
      const invalid = { id: "123" };
      expect(() => PerformerRefSchema.parse(invalid)).toThrow();
    });
  });

  describe("StudioRefSchema", () => {
    it("validates correct studio ref", () => {
      const valid = {
        id: "456",
        name: "Test Studio",
        image_path: null,
      };
      expect(() => StudioRefSchema.parse(valid)).not.toThrow();
    });
  });

  describe("TagRefSchema", () => {
    it("validates correct tag ref", () => {
      const valid = {
        id: "789",
        name: "Test Tag",
        image_path: "/api/proxy/stash?path=/tag/789",
      };
      expect(() => TagRefSchema.parse(valid)).not.toThrow();
    });
  });
});

describe("Entity Schemas", () => {
  describe("SceneSchema", () => {
    const validScene = {
      id: "1",
      title: "Test Scene",
      code: "TEST001",
      details: "Description",
      director: "Director",
      date: "2024-01-15",
      duration: 1800,
      organized: true,
      rating100: 80,
      paths: {
        screenshot: "/api/proxy/stash?path=/screenshot/1",
        preview: null,
        sprite: null,
        vtt: null,
        stream: null,
        webp: null,
        funscript: null,
        caption: null,
        interactive_heatmap: null,
      },
      sceneStreams: [],
      studio: { id: "1", name: "Studio", image_path: null },
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
      files: [],
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
      rating: 4,
      favorite: true,
      o_counter: 5,
      play_count: 10,
      play_duration: 3600,
      resume_time: 500,
      play_history: [],
      o_history: [],
      last_played_at: "2024-01-15T10:00:00Z",
      last_o_at: null,
    };

    it("validates complete scene", () => {
      expect(() => SceneSchema.parse(validScene)).not.toThrow();
    });

    it("validates scene with null optional fields", () => {
      const sceneWithNulls = {
        ...validScene,
        title: null,
        code: null,
        studio: null,
        paths: null,
      };
      expect(() => SceneSchema.parse(sceneWithNulls)).not.toThrow();
    });

    it("rejects scene with wrong type", () => {
      const invalid = { ...validScene, id: 123 };
      expect(() => SceneSchema.parse(invalid)).toThrow();
    });
  });

  describe("PerformerSchema", () => {
    const validPerformer = {
      id: "1",
      name: "Test Performer",
      disambiguation: null,
      gender: "FEMALE",
      birthdate: "1990-01-01",
      death_date: null,
      country: "US",
      ethnicity: null,
      eye_color: "Brown",
      hair_color: "Black",
      height_cm: 165,
      weight: null,
      measurements: "34-24-36",
      fake_tits: null,
      penis_length: null,
      circumcised: null,
      tattoos: "Left arm",
      piercings: null,
      career_length: "2010-",
      details: "Bio here",
      image_path: "/api/proxy/stash?path=/performer/1",
      aliases: ["Alias 1"],
      urls: ["https://example.com"],
      tags: [],
      scene_count: 50,
      image_count: 100,
      gallery_count: 10,
      group_count: 5,
      performer_count: null,
      o_counter: 25,
      rating100: 90,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
      rating: 5,
      favorite: true,
      play_count: 100,
      last_played_at: "2024-01-15T00:00:00Z",
      last_o_at: null,
    };

    it("validates complete performer", () => {
      expect(() => PerformerSchema.parse(validPerformer)).not.toThrow();
    });
  });

  describe("TagSchema", () => {
    const validTag = {
      id: "1",
      name: "Test Tag",
      description: "Tag description",
      ignore_auto_tag: false,
      image_path: null,
      parents: [],
      children: [{ id: "2", name: "Child Tag" }],
      scene_count: 100,
      image_count: 50,
      gallery_count: 10,
      performer_count: 5,
      studio_count: 2,
      group_count: 1,
      scene_count_via_performers: 150,
      rating100: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
      rating: null,
      favorite: false,
      o_counter: 0,
      play_count: 0,
    };

    it("validates complete tag", () => {
      expect(() => TagSchema.parse(validTag)).not.toThrow();
    });
  });
});

describe("Schema stripping", () => {
  it("SceneSchema.strip() removes extra fields", () => {
    const sceneWithExtra = {
      id: "1",
      title: "Test",
      code: null,
      details: null,
      director: null,
      date: null,
      duration: null,
      organized: false,
      rating100: null,
      paths: null,
      sceneStreams: [],
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
      files: [],
      created_at: null,
      updated_at: null,
      rating: null,
      favorite: false,
      o_counter: 0,
      play_count: 0,
      play_duration: 0,
      resume_time: 0,
      play_history: [],
      o_history: [],
      last_played_at: null,
      last_o_at: null,
      // Extra field that should be stripped
      internalSecret: "should-not-appear",
    };

    const result = SceneSchema.strip().parse(sceneWithExtra);
    expect(result).not.toHaveProperty("internalSecret");
    expect(result.id).toBe("1");
  });
});
```

**Step 2: Run tests**

Run: `npm run test:run -- tests/schemas/schemas.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add server/tests/schemas/
git commit -m "test: add schema validation tests"
```

---

## Task 10: Build and Test

**Files:**
- None (verification only)

**Step 1: Run TypeScript build**

Run: `cd server && npm run build`
Expected: Build succeeds with no errors

**Step 2: Run linter**

Run: `npm run lint`
Expected: No new errors (pre-existing warnings OK)

**Step 3: Run all tests**

Run: `npm run test:run`
Expected: All tests pass including new schema tests

**Step 4: Commit any fixes if needed**

---

## Task 11: Create Schema Validation Utility

**Files:**
- Create: `server/utils/schemaValidation.ts`

**Step 1: Create validation utility**

Create `server/utils/schemaValidation.ts`:
```typescript
/**
 * Schema Validation Utilities
 *
 * Helpers for validating API responses with Zod schemas.
 */
import { z, ZodSchema, ZodError } from "zod";
import { logger } from "./logger.js";

/**
 * Validate and strip extra fields from data
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param context - Context for error logging (e.g., "scene response")
 * @returns Validated and stripped data
 * @throws ZodError if validation fails
 */
export function validateResponse<T extends ZodSchema>(
  schema: T,
  data: unknown,
  context: string
): z.infer<T> {
  try {
    return schema.strip().parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      logger.error(`Schema validation failed for ${context}`, {
        issues: error.issues.map(i => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }
    throw error;
  }
}

/**
 * Safely validate data, returning null on failure instead of throwing
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param context - Context for error logging
 * @returns Validated data or null if validation fails
 */
export function safeValidateResponse<T extends ZodSchema>(
  schema: T,
  data: unknown,
  context: string
): z.infer<T> | null {
  try {
    return validateResponse(schema, data, context);
  } catch {
    return null;
  }
}

/**
 * Validate an array of items, filtering out invalid ones
 *
 * @param schema - Zod schema for individual items
 * @param items - Array of items to validate
 * @param context - Context for error logging
 * @returns Array of valid items (invalid items logged and filtered)
 */
export function validateArrayResponse<T extends ZodSchema>(
  schema: T,
  items: unknown[],
  context: string
): z.infer<T>[] {
  const validItems: z.infer<T>[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      validItems.push(schema.strip().parse(items[i]));
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn(`Invalid item at index ${i} in ${context}`, {
          issues: error.issues.map(i => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }
    }
  }

  return validItems;
}
```

**Step 2: Commit**

```bash
git add server/utils/schemaValidation.ts
git commit -m "feat: add schema validation utility functions"
```

---

## Task 12: Add Schema Documentation

**Files:**
- Create: `server/schemas/README.md`

**Step 1: Create documentation**

Create `server/schemas/README.md`:
```markdown
# Zod Schemas

This directory contains Zod schemas that define the shape of Peek's API responses.

## Philosophy

1. **Schemas are the source of truth** - TypeScript types are derived from schemas using `z.infer<T>`
2. **Composable fragments** - Build complex types from reusable pieces (refs → entities → responses)
3. **Runtime validation** - Catch transformation bugs before clients see malformed data
4. **Extra field stripping** - Use `.strip()` to ensure we never leak internal data

## Directory Structure

```
schemas/
├── index.ts          # Main re-export barrel
├── base.ts           # Primitives (dates, timestamps, pagination)
├── refs.ts           # EntityRef schemas (id + name + minimal fields)
├── scene.ts          # Scene entity schemas
├── performer.ts      # Performer entity schemas
├── tag.ts            # Tag entity schemas
├── studio.ts         # Studio entity schemas
├── gallery.ts        # Gallery entity schemas
├── image.ts          # Image entity schemas
├── group.ts          # Group entity schemas
└── api/              # API response wrappers
    ├── index.ts
    └── common.ts     # Error/success responses
```

## Usage

### Basic Validation

```typescript
import { SceneSchema } from "../schemas/index.js";
import { validateResponse } from "../utils/schemaValidation.js";

// In controller
const validatedScene = validateResponse(SceneSchema, scene, "scene response");
res.json(validatedScene);
```

### Type Inference

```typescript
import { SceneSchema } from "../schemas/index.js";
import type { Scene } from "../schemas/index.js";

// Type is inferred from schema
const scene: Scene = SceneSchema.parse(data);
```

### Stripping Extra Fields

```typescript
// Ensure no internal fields leak to client
const safeScene = SceneSchema.strip().parse(scene);
```

## Migration Strategy

Schemas are being adopted incrementally. Current status:
- [ ] `/api/library/scenes` - Schema defined, not yet validated at runtime
- [ ] `/api/library/performers` - Schema defined, not yet validated at runtime
- [ ] Other endpoints - Pending

To enable validation for an endpoint:
1. Import the appropriate schema
2. Use `validateResponse()` before `res.json()`
3. Test with invalid data to ensure errors are logged

## Adding New Schemas

1. Create schema file in `schemas/` directory
2. Export from `schemas/index.ts`
3. Add tests in `tests/schemas/schemas.test.ts`
4. Document any non-obvious field meanings
```

**Step 2: Commit**

```bash
git add server/schemas/README.md
git commit -m "docs: add schema documentation"
```

---

## Task 13: Final Build and Test

**Files:**
- None (verification only)

**Step 1: Clean build**

```bash
cd server
rm -rf dist
npm run build
```

Expected: Build succeeds

**Step 2: Run all unit tests**

Run: `npm run test:run`
Expected: All tests pass

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Create final summary commit if any cleanup needed**

---

## Verification Checklist

After completing all tasks:

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] `server/schemas/` directory contains:
  - `index.ts` (barrel export)
  - `base.ts` (primitives)
  - `refs.ts` (reference schemas)
  - `scene.ts`, `performer.ts`, `tag.ts`, `studio.ts`, `gallery.ts`, `image.ts`, `group.ts`
  - `api/common.ts`, `api/index.ts`
  - `README.md`
- [ ] `server/utils/schemaValidation.ts` exists
- [ ] `server/tests/schemas/schemas.test.ts` exists and passes
- [ ] Zod is in `package.json` dependencies

## Future Work

This implementation creates the schema infrastructure. Future tasks:
1. Enable runtime validation in controllers (endpoint by endpoint)
2. Create transform functions (`toSceneCard()`, `toPerformerDetail()`, etc.)
3. Migrate types/api/*.ts to use Zod-inferred types
4. Consider client-side schema sharing (monorepo)
5. Consider OpenAPI generation from schemas
