# Cache Scalability Brainstorm

**Issues**: #135, #160
**Branch**: `feature/cache-scalability-investigation`
**Date**: 2025-12-08

## Problem Statement

Peek's cache initialization fails on large Stash libraries:
- **Issue #135**: 24k scenes - GraphQL 422 error on groups fetch with `per_page: -1`
- **Issue #160**: 104k scenes - Node.js `ERR_STRING_TOO_LONG` (~512MB string limit exceeded)

Both issues stem from the same root cause: **unbounded GraphQL queries that don't scale**.

## Current Architecture

### Data Flow
```
Stash Server (source of truth)
    │
    ▼ per_page: -1 (fetch ALL)
StashCacheManager (in-memory Maps)
    │
    ├──► FilteredEntityCacheService (per-user filtered views)
    │
    └──► 18+ files (controllers, services, middleware)
```

### Why the Cache Exists

1. **Performance**: Avoid repeated GraphQL queries for browsing/filtering
2. **URL Transformation**: Rewrite Stash URLs to Peek proxy URLs (hide API keys)
3. **User Restrictions**: Cascade filtering (hidden performers → hidden scenes)
4. **Aggregations**: "Most watched performer", "Top tags by play count"
5. **Multi-user Support**: Different users see different filtered content

### Current Memory Estimates
- ~3KB per scene (with nested performers, tags, studio, files, paths)
- ~1KB per performer/tag/studio
- 100k scenes ≈ 300MB just for scenes
- Total with galleries, groups, etc. ≈ 400-500MB for large libraries

### The Scaling Wall

| Scenes | Approximate JSON Size | Status |
|--------|----------------------|--------|
| 10,000 | ~30MB | Works fine |
| 25,000 | ~75MB | Works, slow startup |
| 50,000 | ~150MB | Edge case, may fail |
| 100,000 | ~300MB | Hits string limit, fails |

## Questions for Discussion

### Q1: What filtering patterns does Peek actually need?

Current usage patterns I observed:
- **Carousel**: Random scenes, filtered by user restrictions
- **Browse**: Paginated lists with sorting
- **Search**: Text search across titles/performers
- **Stats**: Aggregations like "top performers by watch time"

**Question**: Are there filtering patterns that *require* all data in memory? Or could most be satisfied with paginated queries to Stash?

### Q2: What's the acceptable trade-off between memory and features?

Options range from:
- **Current**: Everything in memory (fast, feature-rich, doesn't scale)
- **Hybrid**: Metadata in memory, paginated queries for large result sets
- **Pass-through**: Cache only IDs, query Stash for everything (slow, scales infinitely)

**Question**: Which features would you sacrifice for scalability? Or is there a budget for more complex caching?

### Q3: Should Peek own its own entity database?

Currently Peek stores:
- User data (watch history, ratings, favorites)
- Path mappings, settings

It does NOT store Stash entities (scenes, performers, etc.) - only caches them.

**Question**: Would you consider syncing Stash entities to SQLite? This enables:
- Pagination at the database level
- SQL filtering/sorting
- Survives restarts without re-fetching
- Incremental updates via Stash webhooks

Trade-off: Adds complexity, data duplication, sync challenges

### Q4: What's the deployment model priority?

Current: Docker-only (FFmpeg dependency)

Future goal mentioned: Native binaries for Windows/Unix

**Question**: Does the caching solution need to support both? SQLite works everywhere. Redis would complicate native deployment.

---

## Solution Space

### Approach A: Paginated Fetching (Minimal Change)

**Idea**: Keep current architecture, but fetch in pages to avoid string limit.

```typescript
async function fetchAllScenes(): Promise<Scene[]> {
  const PAGE_SIZE = 5000;
  const allScenes: Scene[] = [];
  let page = 1;

  while (true) {
    const result = await stash.findScenesCompact({
      filter: { page, per_page: PAGE_SIZE }
    });
    allScenes.push(...result.findScenes.scenes);
    if (allScenes.length >= result.findScenes.count) break;
    page++;
  }
  return allScenes;
}
```

**Pros**:
- Minimal code changes
- Fixes the immediate crash
- No architecture change

**Cons**:
- Still loads everything into memory
- Memory still grows linearly with library size
- 104k scenes still needs ~300MB RAM for scenes alone

**Verdict**: Quick fix, not a real solution

---

### Approach B: SQLite Entity Cache (Full Sync)

**Idea**: Sync Stash entities to local SQLite database. Query database instead of in-memory Maps.

```
Stash Server
    │
    ▼ Paginated sync
SQLite Database (scenes, performers, studios, tags, galleries, groups)
    │
    ▼ Prisma queries
Controllers/Services
```

**Schema additions**:
```prisma
model CachedScene {
  id          String @id
  title       String?
  date        String?
  studioId    String?
  rating100   Int?
  duration    Int?
  // ... minimal fields for filtering/sorting
  rawData     String // JSON blob for full data
  lastSynced  DateTime

  @@index([studioId])
  @@index([date])
  @@index([rating100])
}
```

**Sync Strategy**:
- Initial: Paginated full sync (5000 at a time)
- Refresh: Incremental via `updated_at > lastSync` filter
- Stash webhooks: Real-time updates (optional enhancement)

**Query Strategy**:
- Browse: SQL pagination with sorting
- Filter: SQL WHERE clauses
- Full data: Fetch `rawData` JSON and deserialize

**Pros**:
- Unlimited scalability (SQLite handles millions of rows)
- Fast SQL queries with indexes
- Survives restarts
- Incremental sync possible
- Works for native binaries

**Cons**:
- Significant refactor
- Data duplication (Stash + Peek)
- Sync complexity (what if entities deleted in Stash?)
- Need to handle schema evolution

---

### Approach C: Hybrid Cache (Metadata in Memory, Full Data Lazy-Loaded)

**Idea**: Store minimal metadata in memory, fetch full data on-demand.

```typescript
interface SceneMetadata {
  id: string;
  title: string;
  date: string;
  studioId: string;
  performerIds: string[];
  tagIds: string[];
  rating100: number;
  // No nested objects, no files, no paths
}

// In-memory: ~500 bytes per scene instead of ~3KB
const sceneMetadata = new Map<string, SceneMetadata>();

// On-demand fetch for full data
async function getFullScene(id: string): Promise<NormalizedScene> {
  const meta = sceneMetadata.get(id);
  if (!meta) return null;

  // Fetch full data from Stash (or a local cache)
  const full = await stash.findScenes({ ids: [id] });
  return transformScene(full.findScenes.scenes[0]);
}
```

**Pros**:
- 80% memory reduction
- Most filtering works on metadata
- Preserves current architecture patterns

**Cons**:
- Increases latency for full scene views
- Complex to implement correctly
- Still linear memory growth (just slower)

---

### Approach D: Pass-through to Stash (No Cache)

**Idea**: Remove the cache entirely. Proxy all queries to Stash.

**Pros**:
- Simplest architecture
- No sync issues
- Stash handles all scalability

**Cons**:
- Loses user restrictions (can't filter without seeing all data)
- Every request hits Stash (slower)
- Can't aggregate stats across scenes
- URL transformation happens on every request

**Verdict**: Not viable - loses too many features

---

### Approach E: External Cache (Redis/Memcached)

**Idea**: Use Redis for distributed caching.

**Pros**:
- Battle-tested scalability
- Shared across instances
- LRU eviction built-in

**Cons**:
- New dependency (complicates native deployment)
- Overkill for single-user instances
- Still need to handle large data serialization

**Verdict**: Only makes sense for multi-node deployment, not the typical use case

---

## What Large Enterprise Apps Do

### Pattern 1: Database as Cache
- **Example**: Elasticsearch for search, PostgreSQL for source of truth
- **Relevance**: SQLite could serve as Peek's "search index"

### Pattern 2: Materialized Views
- **Example**: Pre-computed aggregations stored separately
- **Relevance**: Peek's FilteredEntityCacheService is already doing this per-user

### Pattern 3: Incremental Sync
- **Example**: CDC (Change Data Capture), webhooks
- **Relevance**: Stash has a GraphQL subscription API for real-time updates

### Pattern 4: Tiered Caching
- **Example**: L1 (in-memory, small, hot), L2 (disk, large, warm), L3 (remote, cold)
- **Relevance**: Memory → SQLite → Stash API

### Pattern 5: Pagination + Cursor-based Navigation
- **Example**: GraphQL connections with `after` cursor
- **Relevance**: Stash supports this, Peek could adopt it

---

## Recommendation Questions

Before I recommend a specific approach, I need clarity on:

1. **Scope of refactor acceptable?**
   - Quick fix (paginated fetch) vs. medium (hybrid) vs. large (SQLite sync)

2. **Feature preservation priority?**
   - User restrictions cascade filtering
   - Cross-scene aggregations (stats)
   - Fast browsing/search

3. **Stash API capabilities?**
   - Does Stash support filtering by `updated_at`? (for incremental sync)
   - Does Stash have webhook support? (for real-time sync)

4. **Testing strategy?**
   - Do we have access to a 100k+ scene library for testing?
   - Can we simulate with synthetic data?

---

## Decision: SQLite Entity Cache

After discussion, we've decided on **Approach B: SQLite Entity Cache** for the following reasons:

### Why SQLite?

1. **The pagination + filtering problem**: If we paginate from Stash then apply user restrictions, we get fewer results than requested (e.g., request 50, restrictions remove 10, return 40). This breaks pagination. We need the full dataset locally.

2. **Memory doesn't scale**: Current in-memory approach fails at ~50-100k scenes due to Node.js string limits and memory pressure.

3. **Minimal duplication**: ~50-100MB for 100k scenes (vs 500MB+ in Stash). We store only what Peek needs.

4. **Offline resilience**: Peek can serve browse requests even if Stash is temporarily unavailable.

5. **Native binary compatible**: SQLite works everywhere - no Redis/external dependencies.

### Sync Strategy

**Sync Triggers:**
| Trigger | Type | When |
|---------|------|------|
| Startup | Full/Incremental | Peek server starts (full if first run) |
| Scan complete | Incremental | Stash finishes scan (via WebSocket subscription) |
| Polling | Incremental | Every N minutes (configurable, default 60, range 5-120) |
| Manual | Full/Incremental | Admin triggers via UI |
| Plugin webhook | Incremental | Optional - if Stash plugin installed |

**Sync Types:**
- **Incremental**: Query entities where `updated_at > lastSyncTime`, upsert changes
- **Full**: Paginated fetch of everything, used on first run or recovery

**Optional Real-Time Enhancement:**
A simple Stash plugin can POST to Peek on entity changes, enabling near real-time sync.
This is optional - polling works without it, plugin makes it faster.

### Entity Handling

- **Soft delete**: Mark entities as deleted rather than hard-deleting
  - Preserves Peek-specific data (watch history, ratings) if entity is re-added
  - Allows user to see "X scenes were removed from Stash"
- **Orphan detection**: Periodic check for entities in Peek but not in Stash

### Key Features to Preserve

- ✅ User restrictions (cascade filtering)
- ✅ Stats/aggregations (computed from local DB)
- ✅ Fast browsing (SQL pagination with indexes)
- ⚠️ Offline resilience (partial - can browse cached data)

## Next Steps

1. Design the SQLite schema for cached entities
2. Create migration strategy from in-memory to SQLite
3. Implement incremental sync logic
4. Add scanCompleteSubscribe WebSocket listener
5. Update all 18+ dependent files to query SQLite instead of Maps
6. Test with synthetic 100k+ scene dataset

---

## Appendix: Memory Calculation Details

### Current Scene Object Size

```javascript
{
  id: "12345",                    // 5 bytes
  title: "Example Scene Title",   // ~30 bytes
  date: "2024-01-15",            // 10 bytes
  // ... base fields ~500 bytes

  performers: [                   // ~200 bytes each
    { id, name, image_path, gender, tags: [...] }
  ],
  tags: [                         // ~50 bytes each
    { id, name, image_path, favorite }
  ],
  studio: { id, name, tags: [...] },  // ~150 bytes
  files: [{                       // ~300 bytes each
    path, basename, duration, video_codec, audio_codec, ...
  }],
  paths: {                        // ~400 bytes
    preview, screenshot, sprite, vtt, webp, caption
  },
  sceneStreams: [...]            // ~150 bytes
}

// Total: ~2-4KB per scene depending on performers/tags
```

### Memory Projection Table

| Scenes | Minimal (500B) | Current (~3KB) | With Galleries |
|--------|----------------|----------------|----------------|
| 10,000 | 5 MB | 30 MB | 40 MB |
| 50,000 | 25 MB | 150 MB | 200 MB |
| 100,000 | 50 MB | 300 MB | 400 MB |
| 250,000 | 125 MB | 750 MB | 1 GB |
