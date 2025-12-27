# Content Exclusion Limit Fix

**Issue:** #200 (Part 2) - Tag exclusions capped at 500 items
**Date:** 2025-12-26
**Status:** Draft

## Problem

Content restriction exclusions configured in user settings are being truncated to 500 items. Users with extensive tag exclusions see excluded content appearing when browsing.

User logs show:
```
"computed 1531 exclusions in 9ms"
"Exclusion set truncated to 500 items"
"originalSize": 1531
```

This defeats the purpose of content restrictions for users with many exclusions.

## Root Cause Analysis

In `SceneQueryBuilder.buildExclusionFilter()`, there's a hardcoded limit:

```typescript
// SceneQueryBuilder.ts:96-114
private buildExclusionFilter(excludedIds: Set<string>): FilterClause {
  const ids = Array.from(excludedIds);

  if (ids.length <= 500) {
    // Direct IN clause for smaller sets
    const placeholders = ids.map(() => "?").join(", ");
    return {
      sql: `s.id NOT IN (${placeholders})`,
      params: ids,
    };
  }

  // For larger sets - TRUNCATES to 500!
  const placeholders = ids.slice(0, 500).map(() => "?").join(", ");
  logger.warn("Exclusion set truncated to 500 items", {
    originalSize: ids.length,
  });
  return {
    sql: `s.id NOT IN (${placeholders})`,
    params: ids.slice(0, 500),
  };
}
```

The comment mentions "consider pre-computing a materialized view" but no alternative is implemented.

## Solution Options

### Option A: Chunked NOT IN Clauses (Recommended)

Split the exclusion set into chunks and combine with AND:

```sql
WHERE s.id NOT IN (chunk1) AND s.id NOT IN (chunk2) AND ...
```

SQLite handles each chunk efficiently, and combining with AND maintains correct semantics.

### Option B: Temp Table with LEFT JOIN

Create a temporary table with excluded IDs and use a LEFT JOIN:

```sql
CREATE TEMP TABLE excluded_scenes (id TEXT);
INSERT INTO excluded_scenes VALUES (...);

SELECT ... FROM StashScene s
LEFT JOIN excluded_scenes e ON s.id = e.id
WHERE e.id IS NULL;
```

**Trade-off:** Adds complexity with temp table lifecycle management.

### Option C: Subquery with VALUES

Use a subquery with inline VALUES:

```sql
WHERE s.id NOT IN (SELECT id FROM (VALUES ('id1'), ('id2'), ...))
```

**Trade-off:** SQLite VALUES syntax has limits and this may not work well with very large sets.

## Design Decision

**Use Option A** - Chunked NOT IN clauses.

Rationale:
- Simple to implement
- No temp table management
- SQLite handles multiple NOT IN clauses efficiently
- Easy to understand and debug
- Chunk size of 500 is safe for SQLite parameter limits

## Implementation Plan

### 1. Update buildExclusionFilter method

```typescript
private buildExclusionFilter(excludedIds: Set<string>): FilterClause {
  if (!excludedIds || excludedIds.size === 0) {
    return { sql: "", params: [] };
  }

  const ids = Array.from(excludedIds);
  const CHUNK_SIZE = 500;

  if (ids.length <= CHUNK_SIZE) {
    // Single IN clause for small sets
    const placeholders = ids.map(() => "?").join(", ");
    return {
      sql: `s.id NOT IN (${placeholders})`,
      params: ids,
    };
  }

  // Chunk large sets into multiple NOT IN clauses
  const clauses: string[] = [];
  const allParams: string[] = [];

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    clauses.push(`s.id NOT IN (${placeholders})`);
    allParams.push(...chunk);
  }

  logger.debug("Large exclusion set chunked", {
    totalSize: ids.length,
    chunks: clauses.length,
  });

  return {
    sql: `(${clauses.join(" AND ")})`,
    params: allParams,
  };
}
```

### 2. Add integration test

Add a test case that verifies exclusion works with >500 items:

```typescript
it("should handle large exclusion sets (>500 items)", async () => {
  // Create 600 excluded scene IDs
  const excludedIds = new Set(
    Array.from({ length: 600 }, (_, i) => `excluded-${i}`)
  );

  const result = await sceneQueryBuilder.execute({
    userId: 1,
    excludedSceneIds: excludedIds,
    sort: "created_at",
    sortDirection: "DESC",
    page: 1,
    perPage: 10,
  });

  // Verify none of the excluded IDs appear in results
  for (const scene of result.scenes) {
    expect(excludedIds.has(scene.id)).toBe(false);
  }
});
```

## Files to Modify

- `server/services/SceneQueryBuilder.ts`
  - Update `buildExclusionFilter()` method
- `server/tests/services/SceneQueryBuilder.integration.test.ts`
  - Add test for large exclusion sets

## Performance Considerations

- Each chunk adds an AND clause, but SQLite query optimizer handles this efficiently
- Log at debug level to avoid spam in production
- Consider adding metrics to track exclusion set sizes in production

## Testing

1. Create user with >500 tag exclusions
2. Browse scenes and verify excluded content does not appear
3. Check logs for "Large exclusion set chunked" debug message
4. Verify query performance is acceptable (should be similar to current)

## Rollback Plan

If issues arise, revert to the original truncation behavior. The only risk is performance degradation with very large exclusion sets.
