# Remove stashapp-api Dependency

## Overview

Eliminate the external `stashapp-api` npm package dependency and bring GraphQL queries internal to peek-stash-browser. This improves maintainability by removing an intermediate package and enables fetching only the fields we actually need.

## Current State

peek-stash-browser depends on `stashapp-api@^0.4.0`, a package we authored that:
- Connects to Stash GraphQL via a `StashApp` singleton class
- Provides typed query methods (`findScenes`, `findPerformers`, etc.)
- Generates types via GraphQL introspection + codegen

### Current Usage (11 files)

**Core usage:**
- `StashInstanceManager.ts` - creates `StashApp.init()` instances
- `setup.ts` - tests connections during setup wizard
- `StashSyncService.ts` - all sync queries

**Type imports:**
- Entity types: `Scene`, `Performer`, `Studio`, `Tag`, `Gallery`, `Group`, `Image`
- Filter types: `SceneFilterType`, `PerformerFilterType`, etc.
- Enums: `CriterionModifier`, `GenderEnum`

### Problems

1. **Over-fetching**: stashapp-api queries return 50+ fields per entity; sync only needs ~15-20
2. **Extra maintenance**: separate package to version and publish
3. **Type coupling**: Peek's `NormalizedXxx` types extend Stash types, creating unwanted coupling
4. **Inflexibility**: can't customize queries per use case

## Target State

- GraphQL queries defined inline in peek-stash-browser
- Types generated via codegen from Stash schema (introspection)
- Lean queries fetching only needed fields
- No external package dependency

## Implementation Plan

### Phase 1: Bring GraphQL Internal (This Branch)

#### 1.1 Set Up Codegen Infrastructure

Add to `server/`:
```
server/
├── codegen.yml           # graphql-codegen config
├── schema.json           # introspected Stash schema (gitignored)
└── src/
    ├── graphql/
    │   ├── operations/   # .graphql query files
    │   └── generated/    # codegen output
```

Dependencies to add:
```json
{
  "devDependencies": {
    "@graphql-codegen/cli": "^5.0.0",
    "@graphql-codegen/typescript": "^4.0.0",
    "@graphql-codegen/typescript-operations": "^4.0.0",
    "@graphql-codegen/typescript-graphql-request": "^6.0.0",
    "graphql": "^16.8.0",
    "graphql-request": "^6.1.0"
  }
}
```

#### 1.2 Write Lean GraphQL Queries

Create minimal queries that fetch only what sync needs. Example for scenes:

```graphql
# server/src/graphql/operations/findScenes.graphql
query FindScenesForSync(
  $filter: FindFilterType
  $scene_filter: SceneFilterType
) {
  findScenes(filter: $filter, scene_filter: $scene_filter) {
    count
    scenes {
      id
      title
      code
      date
      details
      director
      rating100
      organized
      o_counter
      play_count
      play_duration
      created_at
      updated_at
      studio { id }
      performers { id }
      tags { id }
      groups {
        scene_index
        group { id }
      }
      galleries { id }
      files {
        path
        size
        duration
        bit_rate
        frame_rate
        width
        height
        video_codec
        audio_codec
      }
      paths {
        screenshot
        preview
        sprite
        vtt
        chapters_vtt
        stream
        caption
      }
      sceneStreams {
        url
        mime_type
        label
      }
    }
  }
}
```

Similar lean queries for: performers, studios, tags, groups, galleries, images.

#### 1.3 Create StashClient Class

Replace `StashApp` with a simple internal client:

```typescript
// server/src/graphql/StashClient.ts
import { GraphQLClient } from 'graphql-request';
import { getSdk } from './generated/graphql';

export interface StashClientConfig {
  url: string;
  apiKey?: string;
}

export class StashClient {
  private sdk: ReturnType<typeof getSdk>;

  constructor(config: StashClientConfig) {
    const client = new GraphQLClient(config.url, {
      headers: config.apiKey ? { ApiKey: config.apiKey } : {},
    });
    this.sdk = getSdk(client);
  }

  // Expose SDK methods directly
  findScenes = this.sdk.FindScenesForSync;
  findPerformers = this.sdk.FindPerformersForSync;
  // ... etc
}
```

#### 1.4 Update StashInstanceManager

```typescript
// Before
import { StashApp } from "stashapp-api";
private instances = new Map<string, StashApp>();

// After
import { StashClient } from "../graphql/StashClient";
private instances = new Map<string, StashClient>();
```

#### 1.5 Update StashSyncService

Minimal changes - the SDK method signatures will be similar:

```typescript
// Before
const result = await stash.findScenes({ ids: [entityId] });

// After (same pattern, just different import)
const result = await stash.findScenes({ ids: [entityId] });
```

#### 1.6 Update Type Imports

Replace stashapp-api type imports with generated types:

```typescript
// Before
import type { Scene, Performer } from "stashapp-api";

// After
import type {
  FindScenesForSyncQuery,
  FindPerformersForSyncQuery
} from "../graphql/generated/graphql";

// Extract entity types from query results
type SyncScene = FindScenesForSyncQuery['findScenes']['scenes'][0];
type SyncPerformer = FindPerformersForSyncQuery['findPerformers']['performers'][0];
```

#### 1.7 Remove stashapp-api Dependency

```bash
cd server
npm uninstall stashapp-api
```

#### 1.8 Add npm Scripts

```json
{
  "scripts": {
    "stash:update-schema": "graphql-codegen --config codegen.yml --introspect",
    "stash:codegen": "graphql-codegen --config codegen.yml",
    "stash:refresh": "npm run stash:update-schema && npm run stash:codegen"
  }
}
```

### Phase 2: Zod API Schemas (Future Branch)

See: [2026-01-10-zod-api-schemas-design.md](./2026-01-10-zod-api-schemas-design.md)

## Files to Modify

| File | Change |
|------|--------|
| `server/package.json` | Remove stashapp-api, add codegen deps |
| `server/codegen.yml` | New - codegen config |
| `server/src/graphql/operations/*.graphql` | New - lean query definitions |
| `server/src/graphql/StashClient.ts` | New - replaces StashApp |
| `server/services/StashInstanceManager.ts` | Use StashClient |
| `server/services/StashSyncService.ts` | Update type imports |
| `server/controllers/setup.ts` | Use StashClient |
| `server/types/entities.ts` | Remove stashapp-api imports |
| `server/types/filters.ts` | Inline filter types or import from generated |
| `server/utils/stashUrlProxy.ts` | Update type imports |
| `server/types/api/playlist.ts` | Update type imports |

## Testing Strategy

1. Run existing integration tests against real Stash instance
2. Verify sync produces identical database state
3. Test setup wizard connection testing
4. Verify API responses unchanged

## Rollback Plan

Keep stashapp-api in devDependencies temporarily. If issues arise, revert imports.

## Success Criteria

- [ ] No runtime dependency on stashapp-api
- [ ] All existing tests pass
- [ ] Sync produces identical results
- [ ] GraphQL queries fetch only needed fields (verify with network inspection)
- [ ] Types remain strict (no `any` escape hatches)
