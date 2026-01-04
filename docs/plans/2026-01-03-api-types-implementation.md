# API Types Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add explicit TypeScript types for API request/response contracts to enable compile-time safety and self-documenting endpoints.

**Architecture:** Create `server/types/api/` directory with typed request/response interfaces. Extend Express Request/Response types with generics. Update library controllers to use typed signatures.

**Tech Stack:** TypeScript strict mode, Express.js types

---

## Task 1: Create Common API Types

**Files:**
- Create: `server/types/api/common.ts`

**Step 1: Create the common types file**

```typescript
// server/types/api/common.ts
/**
 * Common API Types
 *
 * Shared types used across all API endpoints.
 */

/**
 * Standard pagination filter accepted by most list endpoints
 */
export interface PaginationFilter {
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: "ASC" | "DESC";
  q?: string;
}

/**
 * Standard error response
 */
export interface ApiErrorResponse {
  error: string;
  details?: string;
  errorType?: string;
}

/**
 * Standard success response with optional message
 */
export interface ApiSuccessResponse {
  success: true;
  message?: string;
}

/**
 * Cache not ready response (503)
 */
export interface CacheNotReadyResponse {
  error: string;
  message: string;
  ready: false;
}
```

**Step 2: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors related to common.ts

**Step 3: Commit**

```bash
git add server/types/api/common.ts
git commit -m "feat(types): add common API types"
```

---

## Task 2: Create Typed Express Helpers

**Files:**
- Create: `server/types/api/express.ts`

**Step 1: Create typed Express request/response interfaces**

```typescript
// server/types/api/express.ts
/**
 * Typed Express Request/Response Helpers
 *
 * Extends Express types to provide type safety for API handlers.
 */
import type { Request, Response } from "express";
import type { RequestUser } from "../../middleware/auth.js";

/**
 * Typed request with body, params, and query generics
 */
export interface TypedRequest<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, string>,
  TQuery extends Record<string, string | string[] | undefined> = Record<string, string | undefined>
> extends Request {
  body: TBody;
  params: TParams;
  query: TQuery;
  user?: RequestUser;
}

/**
 * Typed request that requires authentication
 * user is guaranteed to exist
 */
export interface TypedAuthRequest<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, string>,
  TQuery extends Record<string, string | string[] | undefined> = Record<string, string | undefined>
> extends TypedRequest<TBody, TParams, TQuery> {
  user: RequestUser;
}

/**
 * Typed response with json body generic
 * Note: Express Response.json returns Response, not the body type
 */
export type TypedResponse<T> = Response<T>;
```

**Step 2: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors related to express.ts

**Step 3: Commit**

```bash
git add server/types/api/express.ts
git commit -m "feat(types): add typed Express request/response helpers"
```

---

## Task 3: Create Library Scenes API Types

**Files:**
- Create: `server/types/api/library.ts`

**Step 1: Create library API types for scenes**

```typescript
// server/types/api/library.ts
/**
 * Library API Types
 *
 * Request and response types for /api/library/* endpoints.
 */
import type {
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
  NormalizedGallery,
  NormalizedGroup,
  PeekSceneFilter,
  PeekPerformerFilter,
  PeekStudioFilter,
  PeekTagFilter,
  PeekGalleryFilter,
  PeekGroupFilter,
} from "../index.js";
import type { PaginationFilter, ApiErrorResponse } from "./common.js";

// =============================================================================
// SCENES
// =============================================================================

/**
 * POST /api/library/scenes - Find scenes with filters
 */
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

/**
 * GET /api/library/scenes/:id/similar - Find similar scenes
 */
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

/**
 * GET /api/library/scenes/recommended - Get recommended scenes
 */
export interface GetRecommendedScenesQuery {
  page?: string;
  per_page?: string;
}

export interface GetRecommendedScenesResponse {
  scenes: NormalizedScene[];
  count: number;
  page: number;
  perPage: number;
  message?: string;
  criteria?: {
    favoritePerformers: number;
    highlyRatedPerformers: number;
    favoriteStudios: number;
    highlyRatedStudios: number;
    favoriteTags: number;
    highlyRatedTags: number;
    favoriteScenes: number;
    highlyRatedScenes: number;
  };
}

/**
 * PUT /api/library/scenes/:id - Update scene
 */
export interface UpdateSceneParams {
  id: string;
}

export interface UpdateSceneRequest {
  title?: string;
  details?: string;
  date?: string;
  rating100?: number;
  studio_id?: string;
  performer_ids?: string[];
  tag_ids?: string[];
  [key: string]: unknown; // Allow pass-through to Stash API
}

export interface UpdateSceneResponse {
  success: true;
  scene: NormalizedScene;
}

// =============================================================================
// PERFORMERS
// =============================================================================

/**
 * POST /api/library/performers - Find performers with filters
 */
export interface FindPerformersRequest {
  filter?: PaginationFilter;
  performer_filter?: PeekPerformerFilter;
  ids?: string[];
}

export interface FindPerformersResponse {
  findPerformers: {
    count: number;
    performers: NormalizedPerformer[];
  };
}

/**
 * POST /api/library/performers/minimal - Get minimal performer data
 */
export interface FindPerformersMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindPerformersMinimalResponse {
  performers: Array<{ id: string; name: string }>;
}

/**
 * PUT /api/library/performers/:id - Update performer
 */
export interface UpdatePerformerParams {
  id: string;
}

export interface UpdatePerformerRequest {
  name?: string;
  details?: string;
  [key: string]: unknown;
}

export interface UpdatePerformerResponse {
  success: true;
  performer: NormalizedPerformer;
}

// =============================================================================
// STUDIOS
// =============================================================================

/**
 * POST /api/library/studios - Find studios with filters
 */
export interface FindStudiosRequest {
  filter?: PaginationFilter;
  studio_filter?: PeekStudioFilter;
  ids?: string[];
}

export interface FindStudiosResponse {
  findStudios: {
    count: number;
    studios: NormalizedStudio[];
  };
}

/**
 * POST /api/library/studios/minimal - Get minimal studio data
 */
export interface FindStudiosMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindStudiosMinimalResponse {
  studios: Array<{ id: string; name: string }>;
}

// =============================================================================
// TAGS
// =============================================================================

/**
 * POST /api/library/tags - Find tags with filters
 */
export interface FindTagsRequest {
  filter?: PaginationFilter;
  tag_filter?: PeekTagFilter;
  ids?: string[];
}

export interface FindTagsResponse {
  findTags: {
    count: number;
    tags: NormalizedTag[];
  };
}

/**
 * POST /api/library/tags/minimal - Get minimal tag data
 */
export interface FindTagsMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindTagsMinimalResponse {
  tags: Array<{ id: string; name: string }>;
}

// =============================================================================
// GALLERIES
// =============================================================================

/**
 * POST /api/library/galleries - Find galleries with filters
 */
export interface FindGalleriesRequest {
  filter?: PaginationFilter;
  gallery_filter?: PeekGalleryFilter;
  ids?: string[];
}

export interface FindGalleriesResponse {
  findGalleries: {
    count: number;
    galleries: NormalizedGallery[];
  };
}

/**
 * GET /api/library/galleries/:id - Get single gallery
 */
export interface GetGalleryParams {
  id: string;
}

export interface GetGalleryResponse {
  gallery: NormalizedGallery | null;
}

/**
 * GET /api/library/galleries/:id/images - Get gallery images
 */
export interface GetGalleryImagesParams {
  id: string;
}

export interface GetGalleryImagesQuery {
  page?: string;
  per_page?: string;
}

export interface GetGalleryImagesResponse {
  images: Array<{
    id: string;
    title?: string;
    files?: Array<{ width?: number; height?: number }>;
    paths?: { thumbnail?: string };
  }>;
  count: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * POST /api/library/galleries/minimal - Get minimal gallery data
 */
export interface FindGalleriesMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindGalleriesMinimalResponse {
  galleries: Array<{ id: string; title: string }>;
}

// =============================================================================
// GROUPS
// =============================================================================

/**
 * POST /api/library/groups - Find groups with filters
 */
export interface FindGroupsRequest {
  filter?: PaginationFilter;
  group_filter?: PeekGroupFilter;
  ids?: string[];
}

export interface FindGroupsResponse {
  findGroups: {
    count: number;
    groups: NormalizedGroup[];
  };
}

/**
 * POST /api/library/groups/minimal - Get minimal group data
 */
export interface FindGroupsMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindGroupsMinimalResponse {
  groups: Array<{ id: string; name: string }>;
}

// =============================================================================
// IMAGES
// =============================================================================

/**
 * POST /api/library/images - Find images with filters
 */
export interface FindImagesRequest {
  filter?: PaginationFilter;
  image_filter?: Record<string, unknown>; // TODO: Add PeekImageFilter
  ids?: string[];
}

export interface FindImagesResponse {
  findImages: {
    count: number;
    images: Array<{
      id: string;
      title?: string;
      rating100?: number;
      favorite?: boolean;
      o_counter?: number;
      files?: Array<{ width?: number; height?: number }>;
      paths?: { thumbnail?: string };
      galleries?: Array<{ id: string; title?: string }>;
      performers?: Array<{ id: string; name: string }>;
      studio?: { id: string; name: string } | null;
      tags?: Array<{ id: string; name: string }>;
    }>;
  };
}
```

**Step 2: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors related to library.ts

**Step 3: Commit**

```bash
git add server/types/api/library.ts
git commit -m "feat(types): add library API request/response types"
```

---

## Task 4: Create API Types Index

**Files:**
- Create: `server/types/api/index.ts`

**Step 1: Create index file that re-exports all API types**

```typescript
// server/types/api/index.ts
/**
 * API Types Index
 *
 * Re-exports all API request/response types for easy importing.
 *
 * Usage:
 *   import type { FindScenesRequest, FindScenesResponse } from "../types/api/index.js";
 */

// Common types
export type {
  PaginationFilter,
  ApiErrorResponse,
  ApiSuccessResponse,
  CacheNotReadyResponse,
} from "./common.js";

// Express typed helpers
export type {
  TypedRequest,
  TypedAuthRequest,
  TypedResponse,
} from "./express.js";

// Library endpoint types
export type {
  // Scenes
  FindScenesRequest,
  FindScenesResponse,
  FindSimilarScenesParams,
  FindSimilarScenesQuery,
  FindSimilarScenesResponse,
  GetRecommendedScenesQuery,
  GetRecommendedScenesResponse,
  UpdateSceneParams,
  UpdateSceneRequest,
  UpdateSceneResponse,
  // Performers
  FindPerformersRequest,
  FindPerformersResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  UpdatePerformerParams,
  UpdatePerformerRequest,
  UpdatePerformerResponse,
  // Studios
  FindStudiosRequest,
  FindStudiosResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  // Tags
  FindTagsRequest,
  FindTagsResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  // Galleries
  FindGalleriesRequest,
  FindGalleriesResponse,
  GetGalleryParams,
  GetGalleryResponse,
  GetGalleryImagesParams,
  GetGalleryImagesQuery,
  GetGalleryImagesResponse,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  // Groups
  FindGroupsRequest,
  FindGroupsResponse,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  // Images
  FindImagesRequest,
  FindImagesResponse,
} from "./library.js";
```

**Step 2: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/types/api/index.ts
git commit -m "feat(types): add API types index"
```

---

## Task 5: Update Scenes Controller with Typed Signatures

**Files:**
- Modify: `server/controllers/library/scenes.ts`

**Step 1: Add imports for new types**

At the top of the file, after existing imports, add:

```typescript
import type {
  TypedAuthRequest,
  TypedResponse,
  FindScenesRequest,
  FindScenesResponse,
  FindSimilarScenesParams,
  FindSimilarScenesQuery,
  FindSimilarScenesResponse,
  GetRecommendedScenesQuery,
  GetRecommendedScenesResponse,
  UpdateSceneParams,
  UpdateSceneRequest,
  UpdateSceneResponse,
  ApiErrorResponse,
} from "../../types/api/index.js";
```

**Step 2: Update findScenes signature**

Change:
```typescript
export const findScenes = async (req: AuthenticatedRequest, res: Response) => {
```

To:
```typescript
export const findScenes = async (
  req: TypedAuthRequest<FindScenesRequest>,
  res: TypedResponse<FindScenesResponse | ApiErrorResponse>
) => {
```

**Step 3: Update findSimilarScenes signature**

Change:
```typescript
export const findSimilarScenes = async (
  req: AuthenticatedRequest,
  res: Response
) => {
```

To:
```typescript
export const findSimilarScenes = async (
  req: TypedAuthRequest<unknown, FindSimilarScenesParams, FindSimilarScenesQuery>,
  res: TypedResponse<FindSimilarScenesResponse | ApiErrorResponse>
) => {
```

**Step 4: Update getRecommendedScenes signature**

Change:
```typescript
export const getRecommendedScenes = async (
  req: AuthenticatedRequest,
  res: Response
) => {
```

To:
```typescript
export const getRecommendedScenes = async (
  req: TypedAuthRequest<unknown, Record<string, string>, GetRecommendedScenesQuery>,
  res: TypedResponse<GetRecommendedScenesResponse | ApiErrorResponse>
) => {
```

**Step 5: Update updateScene signature**

Change:
```typescript
export const updateScene = async (req: AuthenticatedRequest, res: Response) => {
```

To:
```typescript
export const updateScene = async (
  req: TypedAuthRequest<UpdateSceneRequest, UpdateSceneParams>,
  res: TypedResponse<UpdateSceneResponse | ApiErrorResponse>
) => {
```

**Step 6: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors (or type errors that reveal bugs to fix)

**Step 7: Run existing tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 8: Commit**

```bash
git add server/controllers/library/scenes.ts
git commit -m "feat(types): add typed signatures to scenes controller"
```

---

## Task 6: Update Performers Controller with Typed Signatures

**Files:**
- Modify: `server/controllers/library/performers.ts`

**Step 1: Add imports for new types**

At the top of the file, after existing imports, add:

```typescript
import type {
  TypedAuthRequest,
  TypedResponse,
  FindPerformersRequest,
  FindPerformersResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  UpdatePerformerParams,
  UpdatePerformerRequest,
  UpdatePerformerResponse,
  ApiErrorResponse,
} from "../../types/api/index.js";
```

**Step 2: Update findPerformers signature**

Change:
```typescript
export const findPerformers = async (
  req: AuthenticatedRequest,
  res: Response
) => {
```

To:
```typescript
export const findPerformers = async (
  req: TypedAuthRequest<FindPerformersRequest>,
  res: TypedResponse<FindPerformersResponse | ApiErrorResponse>
) => {
```

**Step 3: Update findPerformersMinimal signature**

Change:
```typescript
export const findPerformersMinimal = async (
  req: AuthenticatedRequest,
  res: Response
) => {
```

To:
```typescript
export const findPerformersMinimal = async (
  req: TypedAuthRequest<FindPerformersMinimalRequest>,
  res: TypedResponse<FindPerformersMinimalResponse | ApiErrorResponse>
) => {
```

**Step 4: Update updatePerformer signature**

Change:
```typescript
export const updatePerformer = async (
  req: AuthenticatedRequest,
  res: Response
) => {
```

To:
```typescript
export const updatePerformer = async (
  req: TypedAuthRequest<UpdatePerformerRequest, UpdatePerformerParams>,
  res: TypedResponse<UpdatePerformerResponse | ApiErrorResponse>
) => {
```

**Step 5: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Run existing tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add server/controllers/library/performers.ts
git commit -m "feat(types): add typed signatures to performers controller"
```

---

## Task 7: Update routeHelpers authenticated() Wrapper

**Files:**
- Modify: `server/utils/routeHelpers.ts`

**Step 1: Read current file**

Read the file to understand current implementation.

**Step 2: Update to support generic typed handlers**

The `authenticated()` wrapper should preserve type information. Update it to use generics:

```typescript
import type { Response, NextFunction } from "express";
import type { TypedAuthRequest } from "../types/api/index.js";

/**
 * Wrapper for authenticated route handlers
 * Ensures TypeScript knows req.user exists
 */
export function authenticated<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, string>,
  TQuery extends Record<string, string | string[] | undefined> = Record<string, string | undefined>
>(
  handler: (
    req: TypedAuthRequest<TBody, TParams, TQuery>,
    res: Response,
    next: NextFunction
  ) => Promise<void> | void
) {
  return handler as (
    req: TypedAuthRequest<TBody, TParams, TQuery>,
    res: Response,
    next: NextFunction
  ) => Promise<void> | void;
}
```

**Step 3: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/utils/routeHelpers.ts
git commit -m "refactor(types): update authenticated() helper to preserve type info"
```

---

## Task 8: Verify All Tests Pass

**Files:**
- None (verification only)

**Step 1: Run full test suite**

Run: `cd server && npm test`
Expected: All tests pass

**Step 2: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run linter**

Run: `cd server && npm run lint`
Expected: No errors (or only pre-existing ones)

---

## Task 9: Update Design Doc Status

**Files:**
- Modify: `docs/plans/2026-01-03-api-types-design.md`

**Step 1: Add implementation status**

Add a section at the end of the design doc:

```markdown
## Implementation Status

### Completed (Phase 1)
- [x] Type infrastructure (`types/api/common.ts`, `types/api/express.ts`)
- [x] Library endpoint types (`types/api/library.ts`)
- [x] Scenes controller typed signatures
- [x] Performers controller typed signatures
- [x] Updated `authenticated()` helper

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
```

**Step 2: Commit**

```bash
git add docs/plans/2026-01-03-api-types-design.md
git commit -m "docs: update API types design with implementation status"
```

---

## Summary

After completing all tasks:

1. **New files created:**
   - `server/types/api/common.ts` - Shared API types
   - `server/types/api/express.ts` - Typed Express helpers
   - `server/types/api/library.ts` - Library endpoint types
   - `server/types/api/index.ts` - Re-exports

2. **Files modified:**
   - `server/controllers/library/scenes.ts` - Typed signatures
   - `server/controllers/library/performers.ts` - Typed signatures
   - `server/utils/routeHelpers.ts` - Generic authenticated() helper
   - `docs/plans/2026-01-03-api-types-design.md` - Status update

3. **Verification:**
   - All existing tests pass
   - TypeScript compiles without errors
   - Linter passes

4. **Next steps (future work):**
   - Apply same pattern to remaining controllers
   - Add remaining endpoint types (auth, playlists, etc.)
   - Create documentation generator script
