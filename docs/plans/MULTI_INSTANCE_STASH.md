# Multiple Stash Instances - Implementation Plan

**Status**: Deferred
**Created**: 2025-11-25
**Last Updated**: 2025-11-25

## Overview

This document outlines the implementation plan for supporting multiple Stash server instances in Peek, allowing users to aggregate content from multiple Stash libraries into a unified browsing experience.

## Current State (Commit 1 Complete)

- `StashInstance` model exists in database with UUID primary key
- `StashInstanceManager` service manages connections
- Single instance enforcement in place (`configs.length > 1` throws error)
- Auto-migration from env vars to database on first startup
- Setup wizard allows configuring first Stash instance
- Server Settings shows current instance (read-only)

## Key Challenges

### 1. Entity ID Collisions

Stash uses auto-increment integer IDs per-instance. Scene ID `123` from Instance A is completely different from Scene ID `123` from Instance B.

**Options:**
- **Composite key**: Store `instanceId` + `sceneId` as separate columns (cleaner, preferred)
- **Prefixed ID**: Concatenate as `{instanceId}_{sceneId}` string (simpler but messier)

**Decision**: Use separate `instanceId` column for cleaner database architecture.

### 2. Entity Deduplication

The same performer/studio/tag may exist across multiple Stash instances:
- Same performer with different local IDs
- StashDB integration provides a common identifier (`stash_ids` field)
- Need strategy to merge or deduplicate entities

**Considerations:**
- StashDB IDs can serve as deduplication key
- If same StashDB ID exists on multiple instances, which one "wins"?
- May need a "primary" instance concept for conflict resolution
- Performers without StashDB IDs cannot be deduplicated automatically

### 3. Filtering Across Instances

Current filtering assumes single instance:
- Tag filters reference tag IDs
- Performer filters reference performer IDs
- How do we filter when same logical entity has different IDs per instance?

**Options:**
- Filter by StashDB ID where available
- Filter by name matching (fuzzy, less reliable)
- Keep filters instance-scoped (simpler but less unified)

### 4. Affected Entity Types

All Stash entities need instance tracking:
- Scenes
- Performers
- Studios
- Tags
- Galleries
- Groups
- Images

Each needs `instanceId` added to normalized types and cache storage.

### 5. Proxy and Streaming

Must route requests to correct instance:
- Image proxy needs to know which instance to fetch from
- Video streaming needs to use correct instance's file paths
- Already have `getBaseUrl(instanceId)` and `getApiKey(instanceId)` methods

### 6. User Data Mapping

Current user data (ratings, watch history, favorites) uses Stash entity IDs:
- `WatchHistory.sceneId` references a scene
- `SceneRating.sceneId` references a scene
- Need composite key or migration strategy

## Implementation Phases

### Phase 1: Backend Multi-Instance Support

1. **Remove single-instance enforcement** in StashInstanceManager
2. **Add `instanceId` to normalized types** (NormalizedScene, NormalizedPerformer, etc.)
3. **Update StashCacheManager** to fetch from all instances and merge
4. **Update cache key strategy** to use `instanceId:entityId` composite
5. **Add instance CRUD endpoints**:
   - `GET /api/setup/stash-instances` - List all
   - `POST /api/setup/stash-instance` - Create (admin only)
   - `PUT /api/setup/stash-instance/:id` - Update
   - `DELETE /api/setup/stash-instance/:id` - Delete
6. **Trigger cache rebuild** after any instance change

### Phase 2: Entity Identification Refactor

1. **Update all controllers** to handle composite entity references
2. **Update proxy controller** to route to correct instance
3. **Update video controller** to stream from correct instance
4. **Update user data tables** to include instanceId in composite keys
5. **Create migration** for existing user data

### Phase 3: Deduplication System

1. **Research StashDB ID availability** in Stash GraphQL schema
2. **Implement deduplication logic**:
   - Fetch StashDB IDs for all entities
   - Group entities by StashDB ID
   - Designate primary instance for conflicts
3. **Update UI** to show deduplicated entities
4. **Handle entities without StashDB IDs** (keep separate)

### Phase 4: UI Updates

1. **Update StashInstanceSection** for full CRUD:
   - List all instances with status indicators
   - Add Instance button with connection test
   - Edit instance (name, URL, API key)
   - Delete instance with confirmation
   - Enable/disable toggle per instance
2. **Update filters** to work across instances
3. **Show instance badge** on entities (optional, for debugging)

## Database Schema Changes

```prisma
// Already exists
model StashInstance {
  id        String   @id @default(uuid())
  name      String
  url       String
  apiKey    String
  enabled   Boolean  @default(true)
  priority  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// Needs update - add instanceId to composite unique
model WatchHistory {
  id          Int      @id @default(autoincrement())
  userId      Int
  instanceId  String   // NEW
  sceneId     String
  // ... other fields

  @@unique([userId, instanceId, sceneId])
}

model SceneRating {
  id          Int      @id @default(autoincrement())
  userId      Int
  instanceId  String   // NEW
  sceneId     String
  // ... other fields

  @@unique([userId, instanceId, sceneId])
}

// Similar changes for PerformerRating, StudioRating, etc.
```

## Normalized Type Changes

```typescript
interface NormalizedScene {
  id: string;
  instanceId: string;  // NEW - which Stash instance this came from
  // ... existing fields
}

interface NormalizedPerformer {
  id: string;
  instanceId: string;  // NEW
  stashDbId?: string;  // NEW - for deduplication
  // ... existing fields
}
```

## API Response Changes

Entities returned from API will include `instanceId`:

```json
{
  "id": "12345",
  "instanceId": "8dcbd5b1-73c1-4d1c-b3ce-0924c336e59f",
  "title": "Scene Title",
  ...
}
```

## Open Questions

1. **Should deduplication be automatic or user-controlled?**
   - Automatic based on StashDB ID?
   - Let users manually merge entities?

2. **How to handle conflicting metadata?**
   - Same performer, different bios on different instances
   - Which instance's data takes precedence?

3. **Performance impact of multi-instance cache?**
   - Cache size doubles/triples with multiple instances
   - Refresh time increases proportionally

4. **Should users be able to filter by instance?**
   - "Show only scenes from Instance A"
   - Useful for debugging, maybe not for regular use

## Alternatives Considered

### Alternative 1: Single Stash Instance Only
Keep the current single-instance design. Users with multiple Stash servers would need to consolidate into one Stash instance.

**Pros**: Simpler, no ID collision issues
**Cons**: Limits use cases, some users have legitimate multi-instance setups

### Alternative 2: Instance-Scoped Everything
Keep instances completely separate - user switches between instances like switching accounts.

**Pros**: No collision issues, simpler implementation
**Cons**: No unified library view, poor UX for users who want to see everything together

### Alternative 3: External Aggregation
Recommend users use Stash's built-in library merging features instead.

**Pros**: No Peek changes needed
**Cons**: May not exist, shifts burden to user

## Estimated Effort

- **Phase 1**: 1-2 days
- **Phase 2**: 2-3 days
- **Phase 3**: 2-3 days
- **Phase 4**: 1-2 days

**Total**: ~1 week of focused development

## Dependencies

- Understanding of StashDB ID structure in Stash GraphQL
- Testing with multiple actual Stash instances
- User feedback on deduplication preferences

## References

- [Stash GraphQL Schema](https://github.com/stashapp/stash/blob/develop/graphql/schema/schema.graphql)
- [StashDB Integration Docs](https://docs.stashapp.cc/)
- Commit 1: `291b428` - Single instance database storage
