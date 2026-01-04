# API Types Design

## Overview

Add explicit TypeScript types for API request/response contracts across the peek-stash-browser server. This enables:

1. **Type safety** - Compile-time validation of request/response shapes
2. **Self-documenting APIs** - Types serve as living documentation
3. **Auto-generated docs** - Simple script can extract types to markdown

## Current State

### Route Structure

Routes are thin and delegate to controllers:
```typescript
// routes/library/scenes.ts
router.post("/scenes", requireCacheReady, authenticated(findScenes));
```

### Controller Signatures

Controllers use generic Express types with implicit shapes:
```typescript
export const findScenes = async (req: AuthenticatedRequest, res: Response) => {
  const { filter, scene_filter, ids } = req.body;  // implicit
  // ...
  res.json({ findScenes: { count, scenes } });     // implicit
}
```

### Existing Types

Strong types exist for entities (`NormalizedScene`, `PeekSceneFilter`, etc.) but not for API contracts.

## Proposed Design

### 1. Type Organization

Create `server/types/api/` directory with types per domain:

```
server/types/api/
├── index.ts           # Re-exports all API types
├── common.ts          # Shared types (pagination, errors)
├── library.ts         # Library endpoint types (scenes, performers, etc.)
├── auth.ts            # Auth endpoint types
├── playlists.ts       # Playlist endpoint types
├── carousels.ts       # Carousel endpoint types
├── ratings.ts         # Rating endpoint types
├── watchHistory.ts    # Watch history endpoint types
├── setup.ts           # Setup wizard endpoint types
└── user.ts            # User settings endpoint types
```

### 2. Type Pattern

Each endpoint gets a request and response type:

```typescript
// types/api/library.ts

import type { NormalizedScene, PeekSceneFilter } from "../index.js";
import type { PaginationFilter, PaginatedResponse } from "./common.js";

// POST /api/library/scenes
export interface FindScenesRequest {
  filter?: PaginationFilter;
  scene_filter?: PeekSceneFilter;
  ids?: string[];
}

export interface FindScenesResponse {
  findScenes: {
    count: number;
    scenes: NormalizedScene[];
  };
}

// GET /api/library/scenes/:id/similar
export interface FindSimilarScenesParams {
  id: string;
}

export interface FindSimilarScenesQuery {
  page?: string;
}

export interface FindSimilarScenesResponse {
  scenes: NormalizedScene[];
  count: number;
  page: number;
  perPage: number;
}
```

### 3. Common Types

```typescript
// types/api/common.ts

export interface PaginationFilter {
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: "ASC" | "DESC";
  q?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  items: T[];
  page?: number;
  perPage?: number;
}

export interface ApiError {
  error: string;
  details?: string;
  errorType?: string;
}

export interface ApiSuccess {
  success: true;
  message?: string;
}
```

### 4. Typed Request Helper

Extend Express types to use our API types:

```typescript
// types/api/express.ts

import type { Request, Response } from "express";
import type { RequestUser } from "../../middleware/auth.js";

export interface TypedRequest<
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown
> extends Request {
  body: TBody;
  params: TParams;
  query: TQuery;
  user?: RequestUser;
}

export interface TypedAuthRequest<
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown
> extends TypedRequest<TBody, TParams, TQuery> {
  user: RequestUser;  // Required, not optional
}

export interface TypedResponse<T> extends Response {
  json: (body: T) => this;
}
```

### 5. Controller Updates

Controllers become explicitly typed:

```typescript
// controllers/library/scenes.ts

import type { TypedAuthRequest, TypedResponse } from "../../types/api/express.js";
import type {
  FindScenesRequest,
  FindScenesResponse,
} from "../../types/api/library.js";

export const findScenes = async (
  req: TypedAuthRequest<FindScenesRequest>,
  res: TypedResponse<FindScenesResponse>
) => {
  // req.body is now typed as FindScenesRequest
  // res.json() expects FindScenesResponse
  const { filter, scene_filter, ids } = req.body;
  // ...
};
```

## Implementation Scope: Library Routes First

Focus on the library routes as the highest-value target:

### Library Routes to Type

| Route | Method | Request Type | Response Type |
|-------|--------|--------------|---------------|
| `/library/scenes` | POST | `FindScenesRequest` | `FindScenesResponse` |
| `/library/scenes/:id` | PUT | `UpdateSceneRequest` | `UpdateSceneResponse` |
| `/library/scenes/:id/similar` | GET | params + query | `FindSimilarScenesResponse` |
| `/library/scenes/recommended` | GET | query | `GetRecommendedScenesResponse` |
| `/library/performers` | POST | `FindPerformersRequest` | `FindPerformersResponse` |
| `/library/performers/minimal` | POST | `FindPerformersMinimalRequest` | `FindPerformersMinimalResponse` |
| `/library/performers/:id` | PUT | `UpdatePerformerRequest` | `UpdatePerformerResponse` |
| `/library/studios` | POST | `FindStudiosRequest` | `FindStudiosResponse` |
| `/library/studios/minimal` | POST | `FindStudiosMinimalRequest` | `FindStudiosMinimalResponse` |
| `/library/tags` | POST | `FindTagsRequest` | `FindTagsResponse` |
| `/library/tags/minimal` | POST | `FindTagsMinimalRequest` | `FindTagsMinimalResponse` |
| `/library/galleries` | POST | `FindGalleriesRequest` | `FindGalleriesResponse` |
| `/library/galleries/:id` | GET | params | `FindGalleryByIdResponse` |
| `/library/galleries/:id/images` | GET | params + query | `GetGalleryImagesResponse` |
| `/library/galleries/minimal` | POST | `FindGalleriesMinimalRequest` | `FindGalleriesMinimalResponse` |
| `/library/groups` | POST | `FindGroupsRequest` | `FindGroupsResponse` |
| `/library/groups/minimal` | POST | `FindGroupsMinimalRequest` | `FindGroupsMinimalResponse` |
| `/library/images` | POST | `FindImagesRequest` | `FindImagesResponse` |

## Test Coverage Audit

### Current Test Coverage

The existing tests focus on **services and filter logic**, not HTTP contracts:

| Test File | What It Tests |
|-----------|---------------|
| `tests/filters/sceneFilters.test.ts` | `applyQuickSceneFilters()` function |
| `tests/filters/sceneFiltersExpensive.test.ts` | `applyExpensiveSceneFilters()` function |
| `tests/filters/performerFilters.test.ts` | Performer filter logic |
| `tests/filters/galleryFilters.test.ts` | Gallery filter logic |
| `tests/filters/groupFilters.test.ts` | Group filter logic |
| `tests/filters/studioFilters.test.ts` | Studio filter logic |
| `tests/filters/tagFilters.test.ts` | Tag filter logic |
| `tests/services/SceneQueryBuilder.test.ts` | SQL query builder |
| `services/__tests__/StashEntityService.test.ts` | Entity service |
| `services/__tests__/StashSyncService.*.test.ts` | Sync service |
| `tests/utils/codecDetection.test.ts` | Codec detection utility |

### Test Gap

**No HTTP-level integration tests exist.** This means:

1. Response shape changes could go undetected
2. No validation that routes return expected structures
3. Client/server contract is implicitly trusted

### Mitigation Strategy

Adding API types provides compile-time safety, but we should also add lightweight response shape tests:

```typescript
// tests/api/library.integration.test.ts

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../initializers/api.js";

describe("POST /api/library/scenes", () => {
  it("returns expected response shape", async () => {
    const res = await request(app)
      .post("/api/library/scenes")
      .set("Authorization", `Bearer ${testToken}`)
      .send({ filter: { page: 1, per_page: 10 } });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("findScenes");
    expect(res.body.findScenes).toHaveProperty("count");
    expect(res.body.findScenes).toHaveProperty("scenes");
    expect(Array.isArray(res.body.findScenes.scenes)).toBe(true);
  });
});
```

This is **optional for Phase 1** but recommended as a follow-up.

## Implementation Plan

### Phase 1: Type Infrastructure (this branch)

1. Create `types/api/` directory structure
2. Add `common.ts` with shared types
3. Add `express.ts` with typed request/response helpers
4. Add `library.ts` with all library endpoint types

### Phase 2: Controller Updates

1. Update library controllers to use typed request/response
2. Fix any type errors that surface (these are bugs!)
3. Run existing tests to ensure no regressions

### Phase 3: Remaining Endpoints

Apply same pattern to other route groups:
- Auth routes
- Playlist routes
- Carousel routes
- Rating routes
- Watch history routes
- Setup routes
- User routes

### Phase 4: Documentation Generator

Simple script to extract API types to markdown:
```
npm run generate-api-docs
```

Outputs `docs/development/api-reference.md` with:
- All routes listed
- Request/response types inline
- Auto-updated from type definitions

## DRY Considerations

### Reuse Existing Entity Types

Don't duplicate - import from existing type files:

```typescript
import type {
  NormalizedScene,
  NormalizedPerformer,
  PeekSceneFilter,
  PeekPerformerFilter,
} from "../index.js";
```

### Generic Response Wrappers

For consistent patterns like `{ success: true, entity: T }`:

```typescript
export type SuccessResponse<T extends string, V> = {
  success: true;
} & { [K in T]: V };

// Usage:
type UpdateSceneResponse = SuccessResponse<"scene", NormalizedScene>;
// Results in: { success: true; scene: NormalizedScene }
```

### Filter Types

Leverage existing filter types from `types/filters.ts` and `types/peekFilters.ts`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Type changes break client | High | Existing tests validate filter logic; add integration tests in Phase 4 |
| Large refactor scope | Medium | Phase by route group; library first as highest value |
| Type/runtime mismatch | Medium | TypeScript strict mode catches most issues |
| Migration complexity | Low | Controllers only need signature changes; logic unchanged |

## Success Criteria

1. All library controllers have typed request/response signatures
2. No new runtime errors introduced (existing tests pass)
3. TypeScript catches at least one latent bug during migration
4. Generated API docs reflect actual types

## Open Questions

1. **Should we validate request bodies at runtime?** (e.g., with Zod)
   - Pro: Catches malformed requests before they hit business logic
   - Con: Adds runtime overhead and complexity
   - Recommendation: Defer to Phase 4; types are enough for now

2. **Should response types be strict or permissive?**
   - Strict: `res.json()` only accepts exact type
   - Permissive: Allow additional fields
   - Recommendation: Start strict; loosen if needed

## Implementation Status

### Completed (Phase 1 - 2026-01-03)

- [x] Type infrastructure (`types/api/common.ts`, `types/api/express.ts`)
- [x] Library endpoint types (`types/api/library.ts`)
- [x] API types index (`types/api/index.ts`)
- [x] Scenes controller typed signatures
- [x] Performers controller typed signatures
- [x] Updated `authenticated()` helper for type compatibility

**Commits:**
- `feat(types): add common API types`
- `feat(types): add typed Express request/response helpers`
- `feat(types): add library API request/response types`
- `feat(types): add API types index`
- `feat(types): add typed signatures to scenes controller`
- `feat(types): add typed signatures to performers controller`
- `fix: remove unused imports from typed controllers`

**Bugs Found During Migration:**
- `ids` filter format needed normalization (was `string[]`, expected `{ value: string[], modifier: string }`)
- `groupIdForSort` needed parsing from string to number

### Remaining (Future Phases)

- [ ] Studios controller typed signatures
- [ ] Tags controller typed signatures
- [ ] Galleries controller typed signatures
- [ ] Groups controller typed signatures
- [ ] Images controller typed signatures
- [ ] Auth endpoints
- [ ] Playlist endpoints
- [ ] Carousel endpoints
- [ ] Rating endpoints
- [ ] Watch history endpoints
- [ ] Setup endpoints
- [ ] User endpoints
- [ ] API documentation generator script
