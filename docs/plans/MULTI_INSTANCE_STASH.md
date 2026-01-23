# Multiple Stash Instances - Implementation Plan

**Status**: Design Complete (v3.5)
**Created**: 2025-11-25
**Last Updated**: 2026-01-22

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

### Phase 1: Database & Schema Foundation

All database changes upfront so subsequent phases have the schema they need.

1. **Create migration: multi-instance-schema**
   - Add `description` field to `StashInstance`
   - Create `UserStashInstance` join table (user ↔ instance selection)
   - Add `instanceId` to `WatchHistory` (with default for existing data)
   - Add `instanceId` to all rating tables (SceneRating, PerformerRating, etc.)
   - Add `instanceId` to `PlaylistItem` for cross-instance playlists
   - Update unique constraints to include `instanceId`
2. **Add `instanceId` to normalized types** (NormalizedScene, NormalizedPerformer, etc.)
3. **Update TypeScript interfaces** for API responses

### Phase 2: Backend Multi-Instance Support

1. **Remove single-instance enforcement** in StashInstanceManager
2. **Update StashCacheManager** to fetch from all enabled instances and merge
3. **Update cache key strategy** to use `instanceId:entityId` composite
4. **Add instance CRUD endpoints**:
   - `GET /api/setup/stash-instances` - List all (admin)
   - `POST /api/setup/stash-instance` - Create (admin)
   - `PUT /api/setup/stash-instance/:id` - Update (admin)
   - `DELETE /api/setup/stash-instance/:id` - Delete (admin)
5. **Add user instance selection endpoints** (for #321):
   - `GET /api/user/stash-instances` - Get user's selected instances
   - `PUT /api/user/stash-instances` - Update user's instance selection
6. **Trigger cache rebuild** after any instance change

### Phase 3: Entity Routing & Controllers

1. **Update all controllers** to handle composite entity references (`instanceId` + `entityId`)
2. **Update proxy controller** to route image requests to correct instance
3. **Update video controller** to stream from correct instance
4. **Update library controller** to filter by user's selected instances
5. **Update user data controllers** to include `instanceId` in all operations

### Phase 4: Deduplication System

1. **Fetch `stash_ids` arrays** from Stash for performers/studios/tags
2. **Implement deduplication logic**:
   - Match entities by `(endpoint, stash_id)` pairs
   - Designate primary instance for conflicts (lowest priority number)
3. **Surface conflicts to admin** in UI
4. **Handle entities without stash_ids** (keep separate, no auto-dedupe)

### Phase 5: UI Updates

1. **Update Server Settings > Stash Instances** for full CRUD:
   - List all instances with status indicators
   - Add Instance button with connection test
   - Edit instance (name, description, URL, API key)
   - Delete instance with confirmation
   - Enable/disable toggle per instance
   - Reorder by priority (drag-drop or arrows)
2. **Admin: View metadata conflicts** (deduplicated entities with mismatched data)
3. **Show instance badge** on entities (optional, admin toggle for debugging)

## Database Schema Changes

```prisma
// Already exists - ADD description field
model StashInstance {
  id          String   @id @default(uuid())
  name        String
  description String?  // NEW - helps users understand what content is on this instance
  url         String
  apiKey      String
  enabled     Boolean  @default(true)
  priority    Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  userSelections UserStashInstance[]
}

// NEW - tracks which instances each user wants to see content from
// Users select instances during first-login setup (#321) or in User Preferences
model UserStashInstance {
  id         Int           @id @default(autoincrement())
  userId     Int
  instanceId String
  user       User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  instance   StashInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  createdAt  DateTime      @default(now())

  @@unique([userId, instanceId])
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

### User Instance Selection Behavior

- **No rebuild needed** when user changes instance selection
- Server cache stores ALL instances' content (fetched during startup/sync)
- User filtering happens at query time based on `UserStashInstance` records
- If user has no `UserStashInstance` records, they see content from ALL enabled instances (default behavior)
- Admins manage which instances exist; users choose which ones they want to see

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

## Design Decisions (Resolved 2026-01-20)

### 1. Deduplication Strategy

**Decision**: Automatic with manual override capability.

**How it works**:
- Stash stores `stash_ids` as an array of `{endpoint, stash_id, updated_at}` per entity
- Each entry identifies the stash-box URL and the ID within that stash-box
- An entity can have multiple stash_ids from different stash-boxes

**Auto-deduplication rule**:
- If any `(endpoint, stash_id)` pair matches across instances → same entity
- Different stash-box endpoints with different IDs → no automatic deduplication
- Admin can manually link/merge entities that can't be auto-matched

**Example**:
```
Instance A performer: [{endpoint: "stashdb.org", stash_id: "abc-123"}]
Instance B performer: [{endpoint: "stashdb.org", stash_id: "abc-123"}]
→ Match! Same performer, auto-dedupe.

Instance A performer: [{endpoint: "stashdb.org", stash_id: "abc-123"}]
Instance B performer: [{endpoint: "private-box.local", stash_id: "xyz-789"}]
→ No match. Could be same person, but no proof. Admin can manually link.
```

### 2. Conflicting Metadata Handling

**Decision**: No automatic resolution in Peek. Surface conflicts, resolve in Stash.

**How it works**:
- When deduplicated entities have differing metadata, pick one deterministically (e.g., lowest instance priority number)
- Surface conflicts to admin in UI (show which entities have mismatched data)
- Admin resolves the conflict in Stash at the source
- Next sync picks up the corrected data

**Rationale**: Peek is a viewer, not a metadata management tool. Stash is the source of truth.

### 3. Performance / Cache Strategy

**Decision**: Admin-configurable sync interval with staggered refresh.

**How it works**:
- Admin can configure sync interval (default: hourly)
- Instances refresh in staggered fashion, not all at once
- Parallel fetching during sync for each instance
- Per-instance cache invalidation when needed

**Details**: Implementation detail to refine during development.

### 4. Instance Filtering in UI

**Decision**: Unified view only (no per-instance filtering).

**How it works**:
- Users select which instances to use during first-login setup (v3.3 feature)
- After setup, users see a merged library from their selected instances
- No filter option to show "only Instance A" in browse UI

**Future**: Could add as advanced/power-user feature if requested.

### 5. Playlist Scope

**Decision**: Global playlists (cross-instance).

**How it works**:
- Playlists can contain scenes from any instance
- Playlist items store `(instanceId, sceneId)` composite reference
- Fits the unified library experience

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

- v3.3 First-Login Setup Wizard (#321) - User instance selection happens here
- Testing with multiple actual Stash instances
- Understanding of stash-box `stash_ids` structure (researched - see Design Decisions)

## References

- [Stash GraphQL Schema](https://github.com/stashapp/stash/blob/develop/graphql/schema/schema.graphql)
- [StashDB Integration Docs](https://docs.stashapp.cc/)
- Commit 1: `291b428` - Single instance database storage

## Integration with #321 (User Instance Selection)

This feature provides the backend; #321 provides the UI for user instance selection.

**What this feature provides:**
- `UserStashInstance` table storing user ↔ instance associations
- `GET /api/user/stash-instances` - Get current user's selected instances
- `PUT /api/user/stash-instances` - Update user's instance selection
- Query-time filtering based on user's selections

**What #321 will implement:**
- First-login setup wizard step: "Select which Stash instances to see content from"
- User Preferences page: Instance selection management
- UI calls the endpoints above

**Behavior:**
- New users with no `UserStashInstance` records see ALL enabled instances (sensible default)
- Users can opt out of specific instances via setup wizard or preferences
- Changing selection takes effect immediately (no rebuild, just query-time filtering)
- If an instance is disabled by admin, it's hidden from all users regardless of selection
