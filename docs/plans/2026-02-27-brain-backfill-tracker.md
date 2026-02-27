# Brain Backfill Tracker

**Status**: Complete
**Date**: 2026-02-27
**Parent**: Brain Integration (Development Quality Initiative Phase 5)

## Purpose

Systematically populate the brain with knowledge about the existing codebase. This is a medium-lived effort — work through each area until the codebase is covered, then incremental updates flow naturally through the lifecycle (post-implementation, post-merge, bug-fix writes).

## Approach

For each area:
1. Deep-read the key files
2. Write memories capturing: what it does, how it works, known gotchas, key relationships
3. Optionally write missing tests while the code is fresh in context (pairs with Phase 4 testing expansion)
4. Tag consistently per the taxonomy in the brain integration design doc

Can be done as standalone sessions or bundled with other work touching that area.

## Areas

Priority order based on bug history, complexity, and how often each area is touched:

| # | Area | Key Files | Priority | Status |
|---|------|-----------|----------|--------|
| 1 | Video proxy & HLS rewriting | `server/controllers/video.ts`, `server/controllers/proxy.ts` | Critical | **Done** (10 memories) |
| 2 | Exclusions & content restrictions | `server/services/ExclusionComputationService.ts`, related middleware | Critical | **Done** (5 memories, 18 tests added) |
| 3 | Multi-instance routing & composite keys | `server/services/StashInstanceManager.ts`, all `@@id` models | Critical | **Done** (5 memories, 6 tests added) |
| 4 | StashSyncService & entity caching | `server/services/StashSyncService.ts`, `StashEntityService.ts` | High | **Done** (5 memories, 24 tests added) |
| 5 | Query builders | `server/services/SceneQueryBuilder.ts`, `PerformerQueryBuilder.ts`, etc. | High | **Done** (5 memories, 37 tests added) |
| 6 | Authentication & route guards | `server/middleware/auth.ts`, JWT flow, proxy auth | Medium | **Done** (5 memories, 19 tests added) |
| 7 | Playlist system & sharing | `server/controllers/playlist.ts`, `PlaylistShare` model | Medium | **Done** (5 memories, 28 tests added) |
| 8 | Stats, rankings, user activity | `server/services/UserStatsService.ts`, `RankingComputeService.ts` | Medium | **Done** (5 memories, 12 tests added) |
| 9 | Setup wizard & instance management | `server/controllers/setup.ts`, setup flow | Low | **Done** (5 memories, 33 tests added) |
| 10 | Client-side patterns | Routing, data-fetching hooks, component conventions, Tailwind patterns | Low | **Done** (5 memories, 45 tests added) |

## Per-Area Checklist

For each area, store memories covering:

- [ ] **Architecture**: What it does, how the pieces fit together, data flow
- [ ] **Gotchas**: Known pitfalls, surprising behavior, things that have broken before
- [ ] **Patterns**: Established conventions specific to this area
- [ ] **Relationships**: How this area connects to other areas (e.g., "query builders depend on composite key pattern from multi-instance")
- [ ] **Testing**: What's tested, what's not, how to test effectively

## Follow-Up: Enable Consolidation

Once the memory count grows significantly (100+ memories), consider enabling mcp-memory-service's autonomous consolidation feature:

```env
MCP_CONSOLIDATION_ENABLED=true
MCP_DECAY_ENABLED=true
MCP_RETENTION_CRITICAL=365
MCP_RETENTION_STANDARD=90
MCP_RETENTION_TEMPORARY=14
MCP_SCHEDULE_WEEKLY=SUN 03:00
```

This will automatically cluster similar memories, compress redundant entries, and archive stale ones. Requires HTTP mode (`memory server --http`) to be running for the scheduler.

**When to evaluate**: After completing 4-5 areas from the backfill list, assess whether memory sprawl is becoming a retrieval problem. If search results return too many low-value hits, consolidation is warranted.

## Notes

- This is not a single ticket — it's a recurring activity tracked by this checklist
- Areas can be done in any order; priority is a suggestion based on impact
- Pairing with test coverage work is encouraged but not required
- Each area takes roughly one focused session to cover thoroughly
