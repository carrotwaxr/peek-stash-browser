# Brainstorm: Peek SQLite Performance Architecture

## Project Overview

**Peek Stash Browser** is a web application for browsing and streaming media from Stash (a self-hosted media organizer). It runs as a Docker container with:
- **Frontend**: React 19, Vite
- **Backend**: Node.js/Express, TypeScript, Prisma 6, SQLite
- **Video**: FFmpeg for HLS transcoding

## The Scaling Journey So Far

**Original problem**: Peek cached all Stash entities in-memory using JavaScript Maps. This failed at ~50k scenes due to Node.js string limits (~512MB) when parsing GraphQL responses.

**Solution implemented**: SQLite entity cache that syncs from Stash:
- Paginated sync fetches entities in batches of 5000
- Stores scenes, performers, tags, studios in normalized tables with junction tables
- SceneQueryBuilder generates raw SQL to push filtering/sorting/pagination to the database
- Has proper indexes on all filterable/sortable columns

**Current state**:
- Sync works correctly - 22k scenes stored in SQLite
- SQL queries are correct (verified via EXPLAIN QUERY PLAN - uses indexes)
- **But queries take 8-18 seconds** instead of <500ms

## The Performance Problem

Server logs show the raw SQLite query time is the bottleneck:

```
SceneQueryBuilder.execute complete {
  "queryTimeMs": 18641,
  "breakdown": {
    "queryMs": 18574,  // <-- The SQL query itself takes 18 seconds
    "countMs": 31,
    "transformMs": 1,
    "relationsMs": 35
  }
}
```

This isn't Node.js processing overhead - it's SQLite I/O.

## Architecture Details

**Database location**: SQLite file on a Windows Docker bind mount
```yaml
# docker-compose.yml
volumes:
  - ${PEEK_DATA_DIR:-C:/Users/charl/.peek-data}:/app/data  # Contains peek-stash-browser.db
```

**ORM**: Prisma 6 with `$queryRawUnsafe` for the SceneQueryBuilder

**Comparison point**: Stash itself runs Go + SQLite in Docker with bind mounts and queries are fast. Key differences:
- Go uses mattn/go-sqlite3 (CGO native bindings)
- Prisma uses a separate Rust-based query engine binary
- Stash queries their own schema; Peek queries a synced copy

## What Needs Brainstorming

1. **Root cause confirmation**: Is this definitively a bind mount I/O issue, or could Prisma/query structure be contributing?

2. **Prisma alternatives**: Would better-sqlite3 (synchronous native bindings) perform better? Trade-offs?

3. **SQLite tuning**: PRAGMA settings that could help:
   - WAL mode vs journal mode
   - Cache size
   - mmap_size
   - synchronous settings

4. **Volume/storage alternatives**:
   - Docker named volumes vs bind mounts
   - SQLite in a tmpfs with periodic flush to disk
   - Database file inside container (loses persistence)
   - Run Node server natively on Windows instead of Docker

5. **Architecture alternatives**:
   - Client-server database (PostgreSQL) instead of embedded SQLite
   - In-memory cache backed by SQLite (query memory, persist to disk)
   - LRU cache layer in front of SQLite
   - Different query patterns (denormalized tables, materialized views)

6. **Hybrid approaches**:
   - Keep scene IDs + minimal metadata in memory, full data in SQLite
   - Pre-compute filtered result sets
   - Background refresh instead of on-demand queries

## Constraints

- **Must work in Docker**: FFmpeg dependency requires it
- **Must scale to 100k+ scenes**: The original in-memory approach hit a wall at 50k
- **Must survive restarts**: Can't re-sync 100k scenes from Stash every startup (takes 10+ minutes)
- **Single-user deployment typical**: Multi-node/Redis overkill for most users
- **Developer runs Windows**: Production likely Linux, but dev experience matters

## Key Files to Reference

- `server/services/SceneQueryBuilder.ts` - Raw SQL query builder (1000+ lines)
- `server/services/CachedEntityQueryService.ts` - Prisma-based entity queries
- `server/prisma/schema.prisma` - Database schema with indexes
- `docker-compose.yml` - Volume configuration
- `docs/design/cache-scalability-brainstorm.md` - Original design exploration
- `docs/design/cache-scalability-plan.md` - Implementation plan we followed

## Success Criteria

- Scene browse/carousel queries complete in <500ms for 100k scene library
- Stable architecture we can build features on without performance anxiety
- Clear understanding of trade-offs for chosen approach

## Questions to Answer

1. What's the most likely root cause of the 8-18 second query times?
2. What's the fastest path to acceptable performance with minimal architectural change?
3. If we need bigger changes, what's the right long-term architecture?
4. Are there quick wins (PRAGMA settings, connection pooling) worth trying first?
