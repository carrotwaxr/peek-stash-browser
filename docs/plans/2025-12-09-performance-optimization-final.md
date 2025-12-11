# Brainstorm: Final Performance Optimization Pass

## Context

This branch (`feature/cache-scalability-investigation`) has made significant progress on SQLite performance. We need a final pass to ensure sub-second page loads throughout the app.

## Background Documents to Read

Before brainstorming, read these documents to understand the journey:

1. `docs/plans/2025-12-09-sqlite-performance-brainstorm.md` - Original problem statement
2. `docs/plans/2025-12-09-sqlite-performance-design.md` - Solution implemented (named volumes)
3. `docs/design/cache-scalability-brainstorm.md` - Earlier design exploration
4. `docs/design/cache-scalability-plan.md` - Original implementation plan

## Current State

**What's working:**
- Named Docker volumes fix Windows I/O bottleneck (100x improvement)
- SceneQueryBuilder pushes filtering/sorting to SQL (no more in-memory filtering)
- Basic scene browsing queries now ~350-500ms (was 8-18 seconds)

**What's not working:**
- Scene cards show "Unknown Scene" instead of filename fallback (fixed: added `basename` to files)
- Browser becomes non-responsive after loading several pages
- Images on cards load slowly or hang
- Some operations may still be hitting slow paths

## Key Files to Examine

**Query Layer:**
- `server/services/SceneQueryBuilder.ts` - SQL query builder for scenes
- `server/services/CachedEntityQueryService.ts` - Prisma-based queries (old path)
- `server/controllers/library/scenes.ts` - Scenes API endpoint

**Data Layer:**
- `server/prisma/schema.prisma` - Database schema and indexes
- `server/services/StashCacheManager.ts` - Sync from Stash

**Frontend:**
- `client/src/utils/format.js` - `getSceneTitle()` fallback logic
- `client/src/components/ui/CardComponents.jsx` - Scene card rendering
- `client/src/services/api.js` - API client

## Benchmark Script

Run the benchmark to establish baselines:
```bash
cd server
npx ts-node scripts/benchmark-performance.ts
```

Target: All operations <500ms

## Issues to Investigate

1. **Image loading performance**
   - Are proxy requests to Stash slow?
   - Is there connection pooling?
   - Are images being loaded inefficiently (all at once vs lazy)?

2. **Browser hanging after navigation**
   - Memory leak from keeping old data?
   - Too many concurrent requests?
   - React re-render storms?

3. **Query paths not using SQL builder**
   - Which endpoints still use old Prisma queries?
   - Carousel endpoint performance?
   - Performer/studio detail pages?

4. **Missing optimizations**
   - Connection pooling for SQLite?
   - PRAGMA settings for read-heavy workload?
   - Response caching for static data (studios, tags)?

## Success Criteria

- Scenes grid: <500ms to load 24 scenes
- Page navigation: <500ms to switch pages
- Detail pages: <500ms to load performer/studio with their scenes
- Carousel: <500ms to load home page carousels
- Image loading: Progressive, doesn't block UI
- Browser: Stays responsive during navigation

## Questions to Answer

1. What's causing the browser to become non-responsive?
2. Are there API endpoints that bypass the fast SQL path?
3. What frontend optimizations are needed (lazy loading, virtualization)?
4. Are there quick SQLite/Prisma tuning wins still available?
5. Is the image proxy a bottleneck?

## Deliverables

1. Root cause analysis of remaining performance issues
2. Prioritized list of fixes with effort estimates
3. Implementation plan for sub-second page loads
