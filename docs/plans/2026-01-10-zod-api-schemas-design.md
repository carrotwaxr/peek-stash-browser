# Zod API Schemas for Peek

## Overview

Introduce Zod schemas as the source of truth for Peek's API responses. This creates predictable, composable type fragments derived from what we actually expose to clients, rather than inheriting bloated types from Stash.

## Goals

1. **Predictable API responses**: Define exactly what shape leaves the server
2. **Composable fragments**: Build complex types from reusable pieces
3. **Decouple from Stash types**: API types derived from our needs, not Stash's schema
4. **Runtime validation**: Catch transformation bugs before clients see malformed data
5. **Single source of truth**: Zod schemas define both runtime validation and TypeScript types

## Prerequisites

Complete Phase 1 first: [2026-01-10-remove-stashapp-api-design.md](./2026-01-10-remove-stashapp-api-design.md)

After Phase 1:
- Stash types are only used at sync boundary
- Prisma types are used for internal DB operations
- API response types are currently `NormalizedXxx` (extending old Stash types)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Peek Server                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Stash GraphQL ──► Sync Types ──► Prisma/SQLite                  │
│  (generated)       (internal)      (storage)                     │
│                                                                   │
│                                        │                          │
│                                        ▼                          │
│                                   Zod Schemas ◄── Source of Truth │
│                                        │                          │
│                                        ▼                          │
│                                   API Responses                   │
│                                   (validated)                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Schemas Are Composable

Build from small, reusable fragments:

```typescript
// Base reference types (id + display name)
const EntityRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const PerformerRefSchema = EntityRefSchema.extend({
  imagePath: z.string().nullable(),
  gender: z.string().nullable(),
});

const StudioRefSchema = EntityRefSchema.extend({
  imagePath: z.string().nullable(),
});

const TagRefSchema = EntityRefSchema;
```

### 2. Response Types Compose Fragments

```typescript
// Card view - minimal data for grid/list display
const SceneCardSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  date: z.string().nullable(),
  duration: z.number().nullable(),
  rating100: z.number().nullable(),
  pathScreenshot: z.string().nullable(),
  studio: StudioRefSchema.nullable(),
  performers: z.array(PerformerRefSchema),
});

// Detail view - extends card with additional fields
const SceneDetailSchema = SceneCardSchema.extend({
  details: z.string().nullable(),
  director: z.string().nullable(),
  code: z.string().nullable(),
  tags: z.array(TagRefSchema),
  files: z.array(FileInfoSchema),
  paths: ScenePathsSchema,
  // User-specific data
  userRating: z.number().nullable(),
  playCount: z.number(),
  isFavorite: z.boolean(),
});
```

### 3. Derive TypeScript Types from Schemas

```typescript
// Types are inferred, never manually defined
export type SceneCard = z.infer<typeof SceneCardSchema>;
export type SceneDetail = z.infer<typeof SceneDetailSchema>;
export type PerformerRef = z.infer<typeof PerformerRefSchema>;
```

### 4. Validate at API Boundary

```typescript
// In controller/route handler
export async function getScene(req: Request, res: Response) {
  const scene = await sceneService.getById(req.params.id);

  // Validate before sending - catches bugs in our code
  const validated = SceneDetailSchema.parse(scene);

  res.json(validated);
}
```

### 5. Use `.strip()` for Safety

Zod's `.strip()` removes extra fields, ensuring we never accidentally leak internal data:

```typescript
const SafeSceneSchema = SceneDetailSchema.strip();

// Even if scene object has extra fields, they won't be in response
const validated = SafeSceneSchema.parse(scene);
```

## Schema Organization

```
server/src/schemas/
├── index.ts              # Re-exports all schemas
├── base.ts               # Primitive/shared schemas
├── refs.ts               # EntityRef schemas (id + name patterns)
├── scene.ts              # Scene-related schemas
├── performer.ts          # Performer-related schemas
├── studio.ts             # Studio-related schemas
├── tag.ts                # Tag-related schemas
├── gallery.ts            # Gallery-related schemas
├── group.ts              # Group-related schemas
├── image.ts              # Image-related schemas
├── user.ts               # User preference/data schemas
└── api/                  # Request/response schemas per endpoint
    ├── scenes.ts
    ├── performers.ts
    └── ...
```

## Proposed Schemas

### Base Schemas

```typescript
// server/src/schemas/base.ts
import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  perPage: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TimestampSchema = z.string().datetime();
```

### Reference Schemas

```typescript
// server/src/schemas/refs.ts
import { z } from 'zod';

// Minimal reference - just enough to link/display
export const EntityRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const PerformerRefSchema = EntityRefSchema.extend({
  imagePath: z.string().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'TRANSGENDER_MALE', 'TRANSGENDER_FEMALE',
                  'INTERSEX', 'NON_BINARY', 'OTHER']).nullable(),
});

export const StudioRefSchema = EntityRefSchema.extend({
  imagePath: z.string().nullable(),
});

export const TagRefSchema = EntityRefSchema.extend({
  imagePath: z.string().nullable(),
});

export const GroupRefSchema = EntityRefSchema.extend({
  frontImagePath: z.string().nullable(),
});

export const GalleryRefSchema = EntityRefSchema.extend({
  coverPath: z.string().nullable(),
  imageCount: z.number(),
});
```

### Scene Schemas

```typescript
// server/src/schemas/scene.ts
import { z } from 'zod';
import { PerformerRefSchema, StudioRefSchema, TagRefSchema,
         GroupRefSchema, GalleryRefSchema } from './refs';

export const SceneFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  duration: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  bitRate: z.number().nullable(),
  frameRate: z.number().nullable(),
  videoCodec: z.string().nullable(),
  audioCodec: z.string().nullable(),
});

export const ScenePathsSchema = z.object({
  screenshot: z.string().nullable(),
  preview: z.string().nullable(),
  sprite: z.string().nullable(),
  vtt: z.string().nullable(),
  stream: z.string().nullable(),
});

export const SceneStreamsSchema = z.array(z.object({
  url: z.string(),
  mimeType: z.string().nullable(),
  label: z.string().nullable(),
}));

// Card view - for grids and lists
export const SceneCardSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  date: z.string().nullable(),
  duration: z.number().nullable(),
  rating100: z.number().nullable(),
  organized: z.boolean(),
  pathScreenshot: z.string().nullable(),
  pathPreview: z.string().nullable(),
  studio: StudioRefSchema.nullable(),
  performers: z.array(PerformerRefSchema),
  tags: z.array(TagRefSchema),
  // User data
  userRating: z.number().nullable(),
  playCount: z.number(),
  isFavorite: z.boolean(),
  lastPlayedAt: z.string().nullable(),
});

// Detail view - full scene data
export const SceneDetailSchema = SceneCardSchema.extend({
  code: z.string().nullable(),
  details: z.string().nullable(),
  director: z.string().nullable(),
  oCounter: z.number(),
  playDuration: z.number(),
  groups: z.array(GroupRefSchema.extend({ sceneIndex: z.number().nullable() })),
  galleries: z.array(GalleryRefSchema),
  files: z.array(SceneFileSchema),
  paths: ScenePathsSchema,
  streams: SceneStreamsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Infer types
export type SceneCard = z.infer<typeof SceneCardSchema>;
export type SceneDetail = z.infer<typeof SceneDetailSchema>;
```

### Performer Schemas

```typescript
// server/src/schemas/performer.ts
import { z } from 'zod';
import { StudioRefSchema, TagRefSchema } from './refs';

export const PerformerCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  disambiguation: z.string().nullable(),
  gender: z.string().nullable(),
  imagePath: z.string().nullable(),
  favorite: z.boolean(),
  rating100: z.number().nullable(),
  sceneCount: z.number(),
  imageCount: z.number(),
  galleryCount: z.number(),
  // User data
  userRating: z.number().nullable(),
  isFavorite: z.boolean(),
});

export const PerformerDetailSchema = PerformerCardSchema.extend({
  birthdate: z.string().nullable(),
  deathDate: z.string().nullable(),
  country: z.string().nullable(),
  ethnicity: z.string().nullable(),
  eyeColor: z.string().nullable(),
  hairColor: z.string().nullable(),
  heightCm: z.number().nullable(),
  measurements: z.string().nullable(),
  details: z.string().nullable(),
  tattoos: z.string().nullable(),
  piercings: z.string().nullable(),
  aliases: z.array(z.string()),
  tags: z.array(TagRefSchema),
  // Aggregated stats
  studios: z.array(StudioRefSchema.extend({ sceneCount: z.number() })),
  totalPlayTime: z.number(),
  averageRating: z.number().nullable(),
});

export type PerformerCard = z.infer<typeof PerformerCardSchema>;
export type PerformerDetail = z.infer<typeof PerformerDetailSchema>;
```

## Migration Strategy

### Approach: Incremental, Endpoint by Endpoint

Don't rewrite everything at once. Migrate one endpoint at a time:

1. **Start with a simple endpoint** (e.g., `GET /api/tags`)
2. **Define the schema** for that endpoint's response
3. **Add validation** in the controller
4. **Update client types** if using shared types
5. **Repeat** for next endpoint

### Example Migration

Before:
```typescript
// controller
export async function getScene(req, res) {
  const scene = await sceneService.getById(req.params.id);
  res.json(scene); // Returns NormalizedScene with 50+ fields
}
```

After:
```typescript
// controller
import { SceneDetailSchema } from '../schemas/scene';

export async function getScene(req, res) {
  const scene = await sceneService.getById(req.params.id);

  // Transform to API shape and validate
  const response = SceneDetailSchema.strip().parse({
    id: scene.id,
    title: scene.title,
    // ... explicit mapping
    userRating: scene.userRating,
    isFavorite: scene.isFavorite,
  });

  res.json(response);
}
```

### Helper: Transform Functions

Create transform functions to map DB entities to API shapes:

```typescript
// server/src/transforms/scene.ts
import { SceneCard, SceneCardSchema } from '../schemas/scene';
import { PrismaScene } from '../prisma/types';

export function toSceneCard(scene: PrismaSceneWithRelations): SceneCard {
  return SceneCardSchema.parse({
    id: scene.id,
    title: scene.title,
    date: scene.date,
    duration: scene.duration,
    rating100: scene.rating100,
    organized: scene.organized,
    pathScreenshot: scene.pathScreenshot,
    studio: scene.studio ? {
      id: scene.studio.id,
      name: scene.studio.name,
      imagePath: scene.studio.imagePath,
    } : null,
    performers: scene.performers.map(p => ({
      id: p.id,
      name: p.name,
      imagePath: p.imagePath,
      gender: p.gender,
    })),
    tags: scene.tags.map(t => ({
      id: t.id,
      name: t.name,
    })),
    userRating: scene.userRating?.rating ?? null,
    playCount: scene.playHistory?.length ?? 0,
    isFavorite: scene.favorite?.isFavorite ?? false,
    lastPlayedAt: scene.playHistory?.[0]?.playedAt ?? null,
  });
}
```

## Endpoint Priority

Suggested order for migration (high-traffic/high-value first):

1. `GET /api/scenes` and `GET /api/scenes/:id`
2. `GET /api/performers` and `GET /api/performers/:id`
3. `GET /api/tags` and `GET /api/studios`
4. `GET /api/galleries` and `GET /api/images`
5. `GET /api/groups`
6. Playlist endpoints
7. User preference endpoints
8. Stats/dashboard endpoints

## Testing

### Unit Tests for Schemas

```typescript
import { SceneCardSchema } from '../schemas/scene';

describe('SceneCardSchema', () => {
  it('validates a correct scene card', () => {
    const valid = {
      id: '123',
      title: 'Test Scene',
      // ... all required fields
    };
    expect(() => SceneCardSchema.parse(valid)).not.toThrow();
  });

  it('strips extra fields', () => {
    const withExtra = {
      id: '123',
      title: 'Test',
      // ... required fields
      internalField: 'should be removed',
    };
    const result = SceneCardSchema.strip().parse(withExtra);
    expect(result).not.toHaveProperty('internalField');
  });

  it('rejects invalid data', () => {
    const invalid = { id: 123 }; // id should be string
    expect(() => SceneCardSchema.parse(invalid)).toThrow();
  });
});
```

### Integration Tests

Verify endpoints return valid shapes:

```typescript
describe('GET /api/scenes/:id', () => {
  it('returns valid SceneDetail shape', async () => {
    const res = await request(app).get('/api/scenes/123');
    expect(() => SceneDetailSchema.parse(res.body)).not.toThrow();
  });
});
```

## Dependencies

```json
{
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

Zod has no runtime dependencies and is ~50KB minified.

## Success Criteria

- [ ] All API endpoints validated with Zod schemas
- [ ] No `NormalizedXxx` types extending Stash types
- [ ] TypeScript types derived from Zod schemas (`z.infer`)
- [ ] Transform functions for DB → API shape
- [ ] Extra fields stripped (no data leakage)
- [ ] Existing client functionality unchanged
- [ ] Test coverage for all schemas

## Future Considerations

### Client-Side Validation

Same schemas could be shared with client for request validation:

```typescript
// shared/schemas/api.ts - if using monorepo
export { SceneCardSchema, SceneDetailSchema } from './scene';
```

### OpenAPI Generation

Zod schemas can generate OpenAPI specs via `zod-to-openapi`:

```typescript
import { generateOpenAPI } from 'zod-to-openapi';
// Auto-generate API documentation from schemas
```

### Error Messages

Zod provides detailed error messages for debugging:

```typescript
try {
  SceneDetailSchema.parse(data);
} catch (e) {
  if (e instanceof z.ZodError) {
    console.error(e.issues); // Detailed path + message for each error
  }
}
```
