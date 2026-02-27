# Prisma + SQLite Reference Patterns

Detailed code examples and patterns for common scenarios. Referenced from the main SKILL.md.

## Advanced Query Patterns

### Relation Filters (query parents based on children)
```typescript
// Users who have at least one published post
const users = await prisma.user.findMany({
  where: { posts: { some: { published: true } } }
})

// Users where ALL posts are published
const users = await prisma.user.findMany({
  where: { posts: { every: { published: true } } }
})

// Users with NO posts
const users = await prisma.user.findMany({
  where: { posts: { none: {} } }
})
```

### Nested Writes (implicit transactions)
```typescript
// Create parent + children atomically
const user = await prisma.user.create({
  data: {
    email: 'alice@example.com',
    posts: { create: [{ title: 'Post 1' }, { title: 'Post 2' }] },
    profile: { create: { bio: 'Hello!' } }
  }
})

// connectOrCreate — find or create a relation target
const post = await prisma.post.create({
  data: {
    title: 'New Post',
    author: {
      connectOrCreate: {
        where: { email: 'alice@example.com' },
        create: { email: 'alice@example.com', name: 'Alice' }
      }
    }
  }
})
```

### CTEs (Common Table Expressions)
SQLite fully supports `WITH RECURSIVE` for hierarchical queries:
```typescript
const tree = await prisma.$queryRaw`
  WITH RECURSIVE category_tree AS (
    SELECT id, name, parentId, 0 as depth
    FROM Category WHERE id = ${rootId}
    UNION ALL
    SELECT c.id, c.name, c.parentId, ct.depth + 1
    FROM Category c
    JOIN category_tree ct ON c.parentId = ct.id
  )
  SELECT * FROM category_tree ORDER BY depth, name
`
```

### Dynamic Prisma.sql for Complex Filters
```typescript
import { Prisma } from '@prisma/client'

const conditions: Prisma.Sql[] = []
if (status) conditions.push(Prisma.sql`status = ${status}`)
if (minAge) conditions.push(Prisma.sql`age >= ${minAge}`)
if (name) conditions.push(Prisma.sql`name LIKE ${'%' + name + '%'}`)

const whereClause = conditions.length > 0
  ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
  : Prisma.empty

const users = await prisma.$queryRaw`SELECT * FROM User ${whereClause}`
```

### JOIN-Based Exclusion (avoiding parameter limits)
SQLite has a 999 parameter limit. For large `NOT IN` sets, use a JOIN pattern:
```typescript
// BAD: breaks with >999 excluded IDs
WHERE id NOT IN (${excludedIds.join(',')})

// GOOD: pre-computed exclusion table
const results = await prisma.$queryRaw`
  SELECT s.*
  FROM StashScene s
  LEFT JOIN UserExcludedEntity e
    ON e.userId = ${userId}
    AND e.entityType = 'scene'
    AND e.entityId = s.id
  WHERE e.id IS NULL
    AND s.deletedAt IS NULL
`
```

### Upsert Pattern for Stats/Counters
```typescript
await prisma.userStats.upsert({
  where: { userId_entityId: { userId, entityId } },
  update: {
    playCount: { increment: 1 },
    lastPlayedAt: new Date(),
  },
  create: {
    userId,
    entityId,
    playCount: 1,
    lastPlayedAt: new Date(),
  },
})
```

### Parallel Count + Data Fetch
```typescript
const [total, items] = await Promise.all([
  prisma.item.count({ where: filters }),
  prisma.item.findMany({ where: filters, skip: offset, take: limit, orderBy }),
])
return { items, total, page, totalPages: Math.ceil(total / limit) }
```

## Copy-Table Migration Pattern

For schema changes SQLite's `ALTER TABLE` cannot handle (changing PKs, modifying column types, adding constraints):

```sql
-- Disable FK checks during migration
PRAGMA foreign_keys=OFF;

-- 1. Create the new table with desired schema
CREATE TABLE "User_new" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id", "instanceId"),
    CONSTRAINT "User_instanceId_fkey" FOREIGN KEY ("instanceId")
      REFERENCES "Instance"("id") ON DELETE CASCADE
);

-- 2. Copy data (with any transformations)
INSERT INTO "User_new" ("id", "instanceId", "email", "name", "createdAt")
SELECT "id", COALESCE("instanceId", 'default'), "email", "name", "createdAt"
FROM "User";

-- 3. Drop old table
DROP TABLE "User";

-- 4. Rename new table
ALTER TABLE "User_new" RENAME TO "User";

-- 5. Recreate indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_instanceId_idx" ON "User"("instanceId");

-- 6. Recreate FTS triggers if this table has FTS
-- (see FTS section in SKILL.md)

-- Re-enable FK checks
PRAGMA foreign_keys=ON;

-- Verify integrity
PRAGMA foreign_key_check;
```

## Adding Columns Safely

### Nullable column (simple)
```sql
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
```

### Column with default
```sql
ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
```

### Non-nullable column on existing table (two-step)
```sql
-- Step 1: Add as nullable
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;

-- Step 2: Backfill
UPDATE "User" SET "displayName" = "name" WHERE "displayName" IS NULL;

-- Note: SQLite cannot ALTER COLUMN to NOT NULL after creation
-- If NOT NULL is critical, use the copy-table pattern
```

## Partial and Expression Indexes

These can't be declared in schema.prisma — add via manual migration:

```sql
-- Partial index: only index active users (smaller, faster)
CREATE INDEX "idx_User_active_email"
  ON "User"("email")
  WHERE "deletedAt" IS NULL;

-- Expression index: case-insensitive lookups
CREATE INDEX "idx_User_lower_email"
  ON "User"(LOWER("email"));

-- Composite with sort for common browse queries
CREATE INDEX "idx_Scene_browse"
  ON "StashScene"("deletedAt", "stashCreatedAt" DESC);
```

## JSON Field Patterns

SQLite stores JSON as TEXT. Query with SQLite's JSON functions (3.38+):

```typescript
// Extract a JSON field value
const results = await prisma.$queryRaw`
  SELECT id, json_extract(preferences, '$.theme') as theme
  FROM User
  WHERE json_extract(preferences, '$.darkMode') = true
`

// Query into JSON arrays
const results = await prisma.$queryRaw`
  SELECT u.id, j.value as tag
  FROM User u, json_each(u.tags) j
  WHERE j.value = ${searchTag}
`
```

**Prisma-level:** Use `Json` type. Default empty arrays with `@default("[]")`. Always validate JSON shape at application level since SQLite has no JSON schema enforcement.

## Database Initialization Template

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function initializeDatabase() {
  // Set PRAGMAs (must run on every connection)
  await prisma.$executeRaw`PRAGMA journal_mode = WAL`
  await prisma.$executeRaw`PRAGMA synchronous = NORMAL`
  await prisma.$executeRaw`PRAGMA foreign_keys = ON`
  await prisma.$executeRaw`PRAGMA busy_timeout = 5000`
  await prisma.$executeRaw`PRAGMA temp_store = MEMORY`
  await prisma.$executeRaw`PRAGMA cache_size = -64000`
  await prisma.$executeRaw`PRAGMA mmap_size = 268435456`

  // Run PRAGMA optimize on startup
  await prisma.$executeRaw`PRAGMA optimize = 0x10002`
}

// Graceful shutdown
async function shutdown() {
  await prisma.$executeRaw`PRAGMA optimize`  // Run before close
  await prisma.$disconnect()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export default prisma
```

## Seeded Random Ordering

SQLite's `RANDOM()` can overflow on multiplication. Use modular arithmetic for deterministic random sorting with a seed:

```typescript
const results = await prisma.$queryRaw`
  SELECT *
  FROM StashScene s
  WHERE s.deletedAt IS NULL
  ORDER BY (ABS((${seed} * 3266489917 + s.rowid * 277803737) % 4294967291) + 1) / 4294967291.0
  LIMIT ${limit}
`
```

## BigInt Serialization

JSON.stringify does not support BigInt. Convert before API responses:

```typescript
function serializeRecord<T extends Record<string, unknown>>(record: T): T {
  const result = { ...record }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'bigint') {
      (result as any)[key] = value.toString()
    }
  }
  return result
}
```

## Monitoring & Diagnostics

### Check index usage for a query
```typescript
const plan = await prisma.$queryRaw`
  EXPLAIN QUERY PLAN
  SELECT * FROM "StashScene"
  WHERE "deletedAt" IS NULL
  ORDER BY "stashCreatedAt" DESC
  LIMIT 20
`
// Look for USING INDEX — SCAN TABLE means full scan
```

### Check database size and waste
```typescript
const [pageCount] = await prisma.$queryRaw`PRAGMA page_count`
const [pageSize] = await prisma.$queryRaw`PRAGMA page_size`
const [freePages] = await prisma.$queryRaw`PRAGMA freelist_count`

const totalSize = pageCount.page_count * pageSize.page_size
const wastedSpace = freePages.freelist_count * pageSize.page_size
const wastedPercent = (wastedSpace / totalSize * 100).toFixed(1)
// VACUUM if wasted > 20%
```

### List all indexes
```typescript
const indexes = await prisma.$queryRaw`
  SELECT name, tbl_name, sql
  FROM sqlite_master
  WHERE type = 'index'
  ORDER BY tbl_name, name
`
```

### Check WAL file status
```typescript
const walInfo = await prisma.$queryRaw`PRAGMA wal_checkpoint(PASSIVE)`
// Returns: busy, log (pages in WAL), checkpointed (pages written back)
```
