# Design: SQLite Performance on Windows Docker

## Problem

SQLite queries in Peek took 8-18 seconds on Windows Docker Desktop, making the app unusable for development. Target was <500ms.

## Root Cause

Docker bind mounts on Windows go through WSL2's 9P filesystem protocol, which has extremely poor I/O performance for database workloads. SQLite's temp B-tree operations for sorting hit this especially hard.

**Benchmark results:**

| Storage Location | Query Time |
|-----------------|------------|
| Windows bind mount | 7,000-18,000 ms |
| Docker named volume | 55-115 ms |
| Container /tmp | 68 ms |

The 100x+ performance difference is entirely I/O, not query structure or Prisma overhead.

## Solution

Use Docker named volumes on Windows, bind mounts on Linux/Unraid.

**Files changed:**
- `docker-compose.yml` - Uses bind mount (production default, fast on Linux)
- `docker-compose.windows.yml` - Override that uses named volume for Windows dev

**Usage:**

```bash
# Linux/Unraid (production)
docker-compose up -d

# Windows (development)
docker-compose -f docker-compose.yml -f docker-compose.windows.yml up -d
```

## Why This Works

- **Linux/Unraid**: Bind mounts use native filesystem, no performance penalty
- **Windows**: Named volumes live in WSL2's ext4 filesystem, bypassing 9P protocol

## Migration for Windows Users

One-time setup to copy existing data into the named volume:

```bash
docker volume create peek-stash-browser_peek-data
docker run --rm \
  -v peek-stash-browser_peek-data:/data \
  -v "C:/Users/YOU/.peek-data:/source:ro" \
  alpine cp -av /source/. /data/
```

## Trade-offs

| Aspect | Bind Mount | Named Volume |
|--------|-----------|--------------|
| Performance (Windows) | Poor | Excellent |
| Performance (Linux) | Excellent | Excellent |
| File access | Direct folder access | Need `docker cp` |
| Backup | Simple file copy | Volume backup tools |
| Unraid compatibility | Native appdata path | Works but non-standard |

## Alternatives Considered

1. **SQLite PRAGMA tuning** - Would not help; problem is I/O layer, not SQLite config
2. **Replace Prisma with better-sqlite3** - Would not help; raw sqlite3 CLI had same issue
3. **PostgreSQL** - Overkill for single-user app, adds deployment complexity
4. **In-memory DB with periodic flush** - Risk of data loss, complex implementation

## Success Criteria

- [x] Queries complete in <500ms on Windows dev environment
- [x] No change required for Linux/Unraid production users
- [x] Existing data can be migrated
