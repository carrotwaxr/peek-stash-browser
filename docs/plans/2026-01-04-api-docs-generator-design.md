# API Documentation Generator Design

## Overview

Generate `docs/development/api-reference.md` from TypeScript source files, auto-updated via `npm run generate-api-docs`. Published to GitHub Pages alongside existing mkdocs documentation.

## Goals

1. Document all API routes with method, path, and authentication requirements
2. Show request/response types extracted from TypeScript
3. Link to controller source files
4. Auto-generate on CI before mkdocs build

## Data Flow

```
server/routes/**/*.ts ──┐
                        ├──▶ TypeScript Compiler API ──▶ Merged endpoint data ──▶ Markdown
server/types/api/*.ts ──┘
```

**Matching strategy:**
1. Parse route files to get `{ method, path, controllerName }`
2. Follow imports to controller files
3. Extract type parameters from controller signatures (`TypedAuthRequest<T>`, `TypedResponse<T>`)
4. Resolve those types from `types/api/*.ts`
5. Render to markdown

## Output Format

Single file: `docs/development/api-reference.md`

Each endpoint documented as:

```markdown
### POST /api/library/scenes

Find scenes with filtering and pagination.

**Authentication:** Required

**Request Body:**
```typescript
interface FindScenesRequest {
  filter?: PaginationFilter;
  scene_filter?: PeekSceneFilter;
  ids?: string[];
}
```

**Response:**
```typescript
interface FindScenesResponse {
  findScenes: {
    count: number;
    scenes: NormalizedScene[];
  };
}
```

**Controller:** `findScenes` in `controllers/library/scenes.ts`
```

### Grouping

Endpoints grouped by domain:
- Library (scenes, performers, studios, tags, galleries, groups, images)
- Authentication
- Playlists
- Carousels
- Ratings
- Watch History
- Image View History
- Setup
- User Settings
- Sync

## Script Details

**Location:** `server/scripts/generate-api-docs.ts`

**npm script:**
```json
{
  "scripts": {
    "generate-api-docs": "npx tsx scripts/generate-api-docs.ts"
  }
}
```

**Why TypeScript Compiler API:** Already compiling TS at build time; compiler gives accurate type resolution for imports, generics, and union types.

## CI Integration

Add to `.github/workflows/docs.yml` before mkdocs build:
```yaml
- name: Generate API docs
  run: cd server && npm run generate-api-docs
```

Update `mkdocs.yml` nav:
```yaml
nav:
  - Development:
      - Technical Overview: development/technical-overview.md
      - API Reference: development/api-reference.md
      - Regression Testing Guide: development/regression-testing.md
```

## Edge Cases

**Untyped controllers:** Show `Request Body: unknown` / `Response: unknown` - visible gaps encourage typing.

**Excluded routes:** Skip `video.ts` (streaming endpoints, not JSON APIs) via hardcoded skip list.

**Nested routers:** Parse mount hierarchy from `server/initializers/api.ts` to build full paths like `/api/library/scenes`.

**Complex types:** Show type name with link to source file rather than inlining large definitions like `NormalizedScene`.

## Not In Scope

- UI consumer mapping (one-time manual audit)
- Runtime request validation
- OpenAPI/Swagger output format

## Success Criteria

1. `npm run generate-api-docs` produces valid markdown
2. All typed endpoints show request/response types
3. Untyped endpoints show `unknown` (not silent)
4. CI publishes to GitHub Pages on merge to main
