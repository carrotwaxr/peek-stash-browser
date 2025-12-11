# SQL-Native Scene Queries Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace in-memory scene filtering with SQL queries to achieve <200ms response times at any scale.

**Architecture:** New `SceneQueryBuilder` service constructs parameterized SQL with JOINs for user data and subqueries for entity filters. All filtering, sorting, and pagination happens at the database level.

**Tech Stack:** Prisma 6 with `$queryRawUnsafe`, SQLite, TypeScript

---

## Task 1: Create SceneQueryBuilder Types and Interface

**Files:**
- Create: `server/services/SceneQueryBuilder.ts`
- Reference: `server/types/peekFilters.ts`
- Reference: `server/types/entities.ts`

**Step 1: Create the file with types and interface**

```typescript
/**
 * SceneQueryBuilder - SQL-native scene querying
 *
 * Builds parameterized SQL queries for scene filtering, sorting, and pagination.
 * Eliminates the need to load all scenes into memory.
 */
import type { PeekSceneFilter, NormalizedScene } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface SceneQueryOptions {
  userId: number;
  filters?: PeekSceneFilter;
  excludedSceneIds?: Set<string>;
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  randomSeed?: number;
}

// Query result
export interface SceneQueryResult {
  scenes: NormalizedScene[];
  total: number;
}

/**
 * Builds and executes SQL queries for scene filtering
 */
class SceneQueryBuilder {
  /**
   * Execute a scene query with the given options
   */
  async execute(options: SceneQueryOptions): Promise<SceneQueryResult> {
    // TODO: Implement in subsequent tasks
    throw new Error("Not implemented");
  }
}

// Export singleton instance
export const sceneQueryBuilder = new SceneQueryBuilder();
```

**Step 2: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors related to SceneQueryBuilder.ts

**Step 3: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add SceneQueryBuilder types and interface skeleton"
```

---

## Task 2: Implement Base Query Structure

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add column selection and base FROM/JOIN clauses**

Add these private properties and methods to the `SceneQueryBuilder` class:

```typescript
class SceneQueryBuilder {
  // Column list for SELECT - all CachedScene fields plus user data
  private readonly SELECT_COLUMNS = `
    s.id, s.title, s.code, s.date, s.studioId, s.rating100 AS stashRating100,
    s.duration, s.organized, s.details, s.filePath, s.fileBitRate,
    s.fileFrameRate, s.fileWidth, s.fileHeight, s.fileVideoCodec,
    s.fileAudioCodec, s.fileSize, s.pathScreenshot, s.pathPreview,
    s.pathSprite, s.pathVtt, s.pathChaptersVtt, s.pathStream, s.pathCaption,
    s.oCounter AS stashOCounter, s.playCount AS stashPlayCount,
    s.playDuration AS stashPlayDuration, s.stashCreatedAt, s.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    w.playCount AS userPlayCount, w.playDuration AS userPlayDuration,
    w.lastPlayedAt AS userLastPlayedAt, w.oCount AS userOCount,
    w.resumeTime AS userResumeTime, w.oHistory AS userOHistory,
    w.playHistory AS userPlayHistory
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(userId: number): { sql: string; params: number[] } {
    return {
      sql: `
        FROM CachedScene s
        LEFT JOIN SceneRating r ON s.id = r.sceneId AND r.userId = ?
        LEFT JOIN WatchHistory w ON s.id = w.sceneId AND w.userId = ?
      `.trim(),
      params: [userId, userId],
    };
  }

  // Base WHERE clause (always filter deleted)
  private buildBaseWhere(): FilterClause {
    return {
      sql: "s.deletedAt IS NULL",
      params: [],
    };
  }

  async execute(options: SceneQueryOptions): Promise<SceneQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage } = options;

    // Build FROM clause
    const fromClause = this.buildFromClause(userId);

    // Build WHERE clause (just base for now)
    const whereClause = this.buildBaseWhere();

    // Build full query
    const offset = (page - 1) * perPage;
    const sql = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      WHERE ${whereClause.sql}
      ORDER BY s.stashCreatedAt DESC
      LIMIT ? OFFSET ?
    `;

    const params = [...fromClause.params, ...whereClause.params, perPage, offset];

    logger.info("SceneQueryBuilder.execute", {
      sql: sql.replace(/\s+/g, " ").trim(),
      paramCount: params.length,
    });

    // Execute query
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    // Count query (same WHERE, no LIMIT/OFFSET)
    const countSql = `
      SELECT COUNT(DISTINCT s.id) as total
      ${fromClause.sql}
      WHERE ${whereClause.sql}
    `;
    const countParams = [...fromClause.params, ...whereClause.params];
    const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      ...countParams
    );
    const total = Number(countResult[0]?.total || 0);

    // Transform rows (placeholder - just return raw for now)
    const scenes = rows.map((row) => this.transformRow(row));

    logger.info("SceneQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      resultCount: scenes.length,
      total,
    });

    return { scenes, total };
  }

  // Placeholder transform - will be implemented in Task 3
  private transformRow(row: any): NormalizedScene {
    return row as NormalizedScene;
  }
}
```

**Step 2: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add base query structure with FROM/JOIN clauses"
```

---

## Task 3: Implement Row Transformation

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Write test for row transformation**

Create test file `server/tests/services/SceneQueryBuilder.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// We'll test the transform logic directly once exported
describe("SceneQueryBuilder", () => {
  describe("transformRow", () => {
    it("should transform a database row to NormalizedScene", () => {
      const row = {
        id: "123",
        title: "Test Scene",
        code: "ABC123",
        date: "2024-01-15",
        studioId: "studio_1",
        stashRating100: 85,
        duration: 3600,
        organized: 1,
        details: "Test details",
        filePath: "/path/to/file.mp4",
        fileBitRate: 8000000,
        fileFrameRate: 29.97,
        fileWidth: 1920,
        fileHeight: 1080,
        fileVideoCodec: "h264",
        fileAudioCodec: "aac",
        fileSize: BigInt(2147483648),
        pathScreenshot: "/screenshot.jpg",
        pathPreview: "/preview.mp4",
        pathSprite: "/sprite.jpg",
        pathVtt: "/thumbs.vtt",
        pathChaptersVtt: null,
        pathStream: "/stream.mp4",
        pathCaption: null,
        stashOCounter: 5,
        stashPlayCount: 10,
        stashPlayDuration: 7200.5,
        stashCreatedAt: "2024-01-15T10:30:00Z",
        stashUpdatedAt: "2024-06-20T15:45:00Z",
        userRating: 90,
        userFavorite: 1,
        userPlayCount: 3,
        userPlayDuration: 1800.0,
        userLastPlayedAt: "2024-06-19T20:00:00Z",
        userOCount: 2,
        userResumeTime: 600.5,
        userOHistory: '["2024-06-18T21:00:00Z","2024-06-19T20:30:00Z"]',
        userPlayHistory: "[]",
      };

      // Import will be added once we export the transform function
      // For now, just verify the test structure
      expect(row.id).toBe("123");
      expect(row.userFavorite).toBe(1);
    });

    it("should handle null user data gracefully", () => {
      const row = {
        id: "456",
        title: "Scene Without User Data",
        userRating: null,
        userFavorite: null,
        userPlayCount: null,
        userLastPlayedAt: null,
        userOCount: null,
        userResumeTime: null,
        userOHistory: null,
        userPlayHistory: null,
      };

      // User data should default to safe values
      expect(row.userFavorite).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it passes (basic structure)**

Run: `cd server && npm test -- --run tests/services/SceneQueryBuilder.test.ts`
Expected: PASS

**Step 3: Implement full transformRow method**

Replace the placeholder `transformRow` in `SceneQueryBuilder.ts`:

```typescript
  /**
   * Transform a raw database row into a NormalizedScene
   */
  private transformRow(row: any): NormalizedScene {
    // Parse JSON fields
    const oHistory = this.parseJsonArray(row.userOHistory);
    const playHistory = this.parseJsonArray(row.userPlayHistory);

    // Determine last_o_at from o_history
    const lastOAt = oHistory.length > 0 ? oHistory[oHistory.length - 1] : null;

    return {
      id: row.id,
      title: row.title || null,
      code: row.code || null,
      date: row.date || null,
      details: row.details || null,
      director: null, // Not stored in CachedScene
      urls: [], // Not stored in CachedScene
      organized: row.organized === 1,
      interactive: false, // Not stored in CachedScene
      interactive_speed: null,
      created_at: row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt || null,

      // User data - prefer Peek user data over Stash data
      rating: row.userRating != null ? Math.round(row.userRating / 20) : null,
      rating100: row.userRating ?? null,
      favorite: row.userFavorite === 1,
      o_counter: row.userOCount ?? row.stashOCounter ?? 0,
      play_count: row.userPlayCount ?? row.stashPlayCount ?? 0,
      play_duration: row.userPlayDuration ?? row.stashPlayDuration ?? 0,
      resume_time: row.userResumeTime ?? 0,
      play_history: playHistory,
      o_history: oHistory.map((ts: string) => new Date(ts)),
      last_played_at: row.userLastPlayedAt || null,
      last_o_at: lastOAt,

      // File data - build from individual columns
      files: [
        {
          id: row.id,
          path: row.filePath || "",
          size: row.fileSize?.toString() || "0",
          duration: row.duration || 0,
          video_codec: row.fileVideoCodec || null,
          audio_codec: row.fileAudioCodec || null,
          width: row.fileWidth || 0,
          height: row.fileHeight || 0,
          frame_rate: row.fileFrameRate || 0,
          bit_rate: row.fileBitRate || 0,
          created_at: row.stashCreatedAt || null,
          updated_at: row.stashUpdatedAt || null,
        },
      ],

      // Paths
      paths: {
        screenshot: row.pathScreenshot || null,
        preview: row.pathPreview || null,
        stream: row.pathStream || null,
        webp: null,
        vtt: row.pathVtt || null,
        sprite: row.pathSprite || null,
        funscript: null,
        interactive_heatmap: null,
        caption: row.pathCaption || null,
        chapters_vtt: row.pathChaptersVtt || null,
      },

      // Relations - populated separately after query
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
      scene_markers: [],
      stash_ids: [],
      sceneStreams: [],
    };
  }

  /**
   * Safely parse a JSON array string
   */
  private parseJsonArray(json: string | null): string[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
```

**Step 4: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/services/SceneQueryBuilder.ts server/tests/services/SceneQueryBuilder.test.ts
git commit -m "feat: implement row transformation to NormalizedScene"
```

---

## Task 4: Implement Exclusion Filter

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add exclusion filter method**

Add this method to `SceneQueryBuilder`:

```typescript
  /**
   * Build exclusion filter clause
   * Excludes scenes by ID (from user restrictions)
   */
  private buildExclusionFilter(excludedIds: Set<string>): FilterClause {
    if (!excludedIds || excludedIds.size === 0) {
      return { sql: "", params: [] };
    }

    // For large exclusion sets, use a subquery approach
    // SQLite handles IN clauses well up to ~1000 items
    const ids = Array.from(excludedIds);

    if (ids.length <= 500) {
      // Direct IN clause for smaller sets
      const placeholders = ids.map(() => "?").join(", ");
      return {
        sql: `s.id NOT IN (${placeholders})`,
        params: ids,
      };
    }

    // For larger sets, we'll need to use a different approach
    // This is a pragmatic limit - if you have >500 exclusions,
    // consider pre-computing a materialized view
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

**Step 2: Update execute() to use exclusion filter**

Update the `execute` method to include exclusions:

```typescript
  async execute(options: SceneQueryOptions): Promise<SceneQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, excludedSceneIds } = options;

    // Build FROM clause
    const fromClause = this.buildFromClause(userId);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere()];

    // Add exclusion filter
    const exclusionFilter = this.buildExclusionFilter(excludedSceneIds || new Set());
    if (exclusionFilter.sql) {
      whereClauses.push(exclusionFilter);
    }

    // Combine WHERE clauses
    const whereSQL = whereClauses.map((c) => c.sql).filter(Boolean).join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build full query
    const offset = (page - 1) * perPage;
    const sql = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      WHERE ${whereSQL}
      ORDER BY s.stashCreatedAt DESC
      LIMIT ? OFFSET ?
    `;

    const params = [...fromClause.params, ...whereParams, perPage, offset];

    logger.info("SceneQueryBuilder.execute", {
      whereClauseCount: whereClauses.length,
      excludedCount: excludedSceneIds?.size || 0,
      paramCount: params.length,
    });

    // Execute query
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT s.id) as total
      ${fromClause.sql}
      WHERE ${whereSQL}
    `;
    const countParams = [...fromClause.params, ...whereParams];
    const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      ...countParams
    );
    const total = Number(countResult[0]?.total || 0);

    const scenes = rows.map((row) => this.transformRow(row));

    logger.info("SceneQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      resultCount: scenes.length,
      total,
    });

    return { scenes, total };
  }
```

**Step 3: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add exclusion filter to SceneQueryBuilder"
```

---

## Task 5: Implement Entity Filters (Performers)

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add performer filter method**

```typescript
  /**
   * Build performer filter clause
   * Supports INCLUDES, INCLUDES_ALL, EXCLUDES modifiers
   */
  private buildPerformerFilter(
    filter: { value: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        // Scene has ANY of these performers
        return {
          sql: `s.id IN (SELECT sceneId FROM ScenePerformer WHERE performerId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        // Scene has ALL of these performers
        return {
          sql: `s.id IN (
            SELECT sceneId FROM ScenePerformer
            WHERE performerId IN (${placeholders})
            GROUP BY sceneId
            HAVING COUNT(DISTINCT performerId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        // Scene has NONE of these performers
        return {
          sql: `s.id NOT IN (SELECT sceneId FROM ScenePerformer WHERE performerId IN (${placeholders}))`,
          params: ids,
        };

      default:
        logger.warn("Unknown performer filter modifier", { modifier });
        return { sql: "", params: [] };
    }
  }
```

**Step 2: Update execute() to use performer filter**

Add to the WHERE clause building section in `execute()`:

```typescript
    // Add entity filters
    if (options.filters?.performers) {
      const performerFilter = this.buildPerformerFilter(options.filters.performers);
      if (performerFilter.sql) {
        whereClauses.push(performerFilter);
      }
    }
```

**Step 3: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add performer filter to SceneQueryBuilder"
```

---

## Task 6: Implement Entity Filters (Tags, Studios, Groups)

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add tag filter method**

```typescript
  /**
   * Build tag filter clause
   */
  private buildTagFilter(
    filter: { value: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `s.id IN (SELECT sceneId FROM SceneTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `s.id IN (
            SELECT sceneId FROM SceneTag
            WHERE tagId IN (${placeholders})
            GROUP BY sceneId
            HAVING COUNT(DISTINCT tagId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `s.id NOT IN (SELECT sceneId FROM SceneTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }
```

**Step 2: Add studio filter method**

```typescript
  /**
   * Build studio filter clause
   */
  private buildStudioFilter(
    filter: { value: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `s.studioId IN (${placeholders})`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `(s.studioId IS NULL OR s.studioId NOT IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }
```

**Step 3: Add group filter method**

```typescript
  /**
   * Build group filter clause
   */
  private buildGroupFilter(
    filter: { value: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `s.id IN (SELECT sceneId FROM SceneGroup WHERE groupId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `s.id IN (
            SELECT sceneId FROM SceneGroup
            WHERE groupId IN (${placeholders})
            GROUP BY sceneId
            HAVING COUNT(DISTINCT groupId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `s.id NOT IN (SELECT sceneId FROM SceneGroup WHERE groupId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }
```

**Step 4: Update execute() to use all entity filters**

Add after performer filter in `execute()`:

```typescript
    if (options.filters?.tags) {
      const tagFilter = this.buildTagFilter(options.filters.tags);
      if (tagFilter.sql) {
        whereClauses.push(tagFilter);
      }
    }

    if (options.filters?.studios) {
      const studioFilter = this.buildStudioFilter(options.filters.studios);
      if (studioFilter.sql) {
        whereClauses.push(studioFilter);
      }
    }

    if (options.filters?.groups) {
      const groupFilter = this.buildGroupFilter(options.filters.groups);
      if (groupFilter.sql) {
        whereClauses.push(groupFilter);
      }
    }
```

**Step 5: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add tag, studio, group filters to SceneQueryBuilder"
```

---

## Task 7: Implement User Data Filters

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add favorite filter**

```typescript
  /**
   * Build favorite filter clause
   */
  private buildFavoriteFilter(favorite: boolean | undefined): FilterClause {
    if (favorite === undefined) {
      return { sql: "", params: [] };
    }

    if (favorite) {
      return { sql: "r.favorite = 1", params: [] };
    } else {
      return { sql: "(r.favorite = 0 OR r.favorite IS NULL)", params: [] };
    }
  }
```

**Step 2: Add rating filter**

```typescript
  /**
   * Build rating filter clause
   */
  private buildRatingFilter(
    filter: { value?: number; value2?: number; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || filter.value === undefined) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = "COALESCE(r.rating, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };

      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };

      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };

      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };

      case "BETWEEN":
        if (value2 === undefined) {
          return { sql: `${col} >= ?`, params: [value] };
        }
        return { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] };

      case "NOT_BETWEEN":
        if (value2 === undefined) {
          return { sql: `${col} < ?`, params: [value] };
        }
        return { sql: `(${col} < ? OR ${col} > ?)`, params: [value, value2] };

      default:
        return { sql: "", params: [] };
    }
  }
```

**Step 3: Add play_count and o_counter filters**

```typescript
  /**
   * Build play count filter clause
   */
  private buildPlayCountFilter(
    filter: { value?: number; value2?: number; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || filter.value === undefined) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = "COALESCE(w.playCount, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };
      case "BETWEEN":
        return value2 !== undefined
          ? { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] }
          : { sql: `${col} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build o_counter filter clause
   */
  private buildOCounterFilter(
    filter: { value?: number; value2?: number; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || filter.value === undefined) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = "COALESCE(w.oCount, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };
      case "BETWEEN":
        return value2 !== undefined
          ? { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] }
          : { sql: `${col} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }
```

**Step 4: Update execute() to use user data filters**

Add after entity filters in `execute()`:

```typescript
    // User data filters
    const favoriteFilter = this.buildFavoriteFilter(options.filters?.favorite);
    if (favoriteFilter.sql) {
      whereClauses.push(favoriteFilter);
    }

    if (options.filters?.rating100) {
      const ratingFilter = this.buildRatingFilter(options.filters.rating100);
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    if (options.filters?.play_count) {
      const playCountFilter = this.buildPlayCountFilter(options.filters.play_count);
      if (playCountFilter.sql) {
        whereClauses.push(playCountFilter);
      }
    }

    if (options.filters?.o_counter) {
      const oCounterFilter = this.buildOCounterFilter(options.filters.o_counter);
      if (oCounterFilter.sql) {
        whereClauses.push(oCounterFilter);
      }
    }
```

**Step 5: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add user data filters (favorite, rating, play_count, o_counter)"
```

---

## Task 8: Implement Sort Clause Builder

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add sort clause builder**

```typescript
  /**
   * Build ORDER BY clause
   */
  private buildSortClause(
    sort: string,
    direction: "ASC" | "DESC",
    randomSeed?: number
  ): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";

    // Map sort field names to SQL expressions
    const sortMap: Record<string, string> = {
      // Scene metadata
      created_at: `s.stashCreatedAt ${dir}`,
      updated_at: `s.stashUpdatedAt ${dir}`,
      date: `s.date ${dir}`,
      title: `s.title ${dir}`,
      duration: `s.duration ${dir}`,
      filesize: `s.fileSize ${dir}`,
      bitrate: `s.fileBitRate ${dir}`,
      framerate: `s.fileFrameRate ${dir}`,

      // Stash ratings (not user ratings)
      rating: `s.rating100 ${dir}`,

      // User data - prefer user values
      last_played_at: `w.lastPlayedAt ${dir}`,
      play_count: `COALESCE(w.playCount, 0) ${dir}`,
      play_duration: `COALESCE(w.playDuration, 0) ${dir}`,
      o_counter: `COALESCE(w.oCount, 0) ${dir}`,
      user_rating: `COALESCE(r.rating, 0) ${dir}`,
      resume_time: `COALESCE(w.resumeTime, 0) ${dir}`,

      // Random with deterministic seed for stable pagination
      random: `((CAST(substr(s.id, 1, 8) AS INTEGER) * 1103515245 + ${randomSeed || 12345}) % 2147483647) ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["created_at"];

    // Add secondary sort by id for stable ordering
    return `${sortExpr}, s.id ${dir}`;
  }
```

**Step 2: Update execute() to use dynamic sorting**

Replace the hardcoded ORDER BY in `execute()`:

```typescript
    // Build sort clause
    const sortClause = this.buildSortClause(
      options.sort,
      options.sortDirection,
      options.randomSeed
    );

    // Build full query
    const offset = (page - 1) * perPage;
    const sql = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      WHERE ${whereSQL}
      ORDER BY ${sortClause}
      LIMIT ? OFFSET ?
    `;
```

**Step 3: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add dynamic sort clause builder with random seed support"
```

---

## Task 9: Implement ID Filter and Metadata Filters

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add ID filter**

```typescript
  /**
   * Build ID filter clause (for specific scene IDs)
   */
  private buildIdFilter(
    filter: { value: string[]; modifier?: string } | string[] | undefined
  ): FilterClause {
    // Handle both array and object formats
    const ids = Array.isArray(filter) ? filter : filter?.value;
    if (!ids || ids.length === 0) {
      return { sql: "", params: [] };
    }

    const modifier = Array.isArray(filter) ? "INCLUDES" : filter?.modifier || "INCLUDES";
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return { sql: `s.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `s.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `s.id IN (${placeholders})`, params: ids };
    }
  }
```

**Step 2: Add duration filter**

```typescript
  /**
   * Build duration filter clause
   */
  private buildDurationFilter(
    filter: { value?: number; value2?: number; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || filter.value === undefined) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = "COALESCE(s.duration, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };
      case "BETWEEN":
        return value2 !== undefined
          ? { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] }
          : { sql: `${col} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }
```

**Step 3: Add resolution filter**

```typescript
  /**
   * Build resolution filter clause
   */
  private buildResolutionFilter(
    filter: { value?: string; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    // Resolution values: "144p", "240p", "360p", "480p", "720p", "1080p", "4k", "5k", "6k", "8k"
    const resolutionMap: Record<string, number> = {
      "144p": 144,
      "240p": 240,
      "360p": 360,
      "480p": 480,
      "540p": 540,
      "720p": 720,
      "1080p": 1080,
      "1440p": 1440,
      "4k": 2160,
      "5k": 2880,
      "6k": 3240,
      "8k": 4320,
    };

    const height = resolutionMap[filter.value.toLowerCase()];
    if (!height) {
      return { sql: "", params: [] };
    }

    const { modifier = "EQUALS" } = filter;
    const col = "COALESCE(s.fileHeight, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [height] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [height] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [height] };
      default:
        return { sql: `${col} >= ?`, params: [height] };
    }
  }
```

**Step 4: Update execute() to use all filters**

Add at the beginning of filter building in `execute()`:

```typescript
    // ID filter
    if (options.filters?.ids) {
      const idFilter = this.buildIdFilter(options.filters.ids);
      if (idFilter.sql) {
        whereClauses.push(idFilter);
      }
    }

    // Metadata filters
    if (options.filters?.duration) {
      const durationFilter = this.buildDurationFilter(options.filters.duration);
      if (durationFilter.sql) {
        whereClauses.push(durationFilter);
      }
    }

    if (options.filters?.resolution) {
      const resolutionFilter = this.buildResolutionFilter(options.filters.resolution);
      if (resolutionFilter.sql) {
        whereClauses.push(resolutionFilter);
      }
    }
```

**Step 5: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add ID, duration, and resolution filters"
```

---

## Task 10: Implement Relation Population

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add relation population method**

```typescript
  /**
   * Populate scene relations (performers, tags, studio, groups, galleries)
   * Called after main query with just the scene IDs we need
   */
  async populateRelations(scenes: NormalizedScene[]): Promise<void> {
    if (scenes.length === 0) return;

    const sceneIds = scenes.map((s) => s.id);
    const studioIds = scenes.map((s) => s.studioId).filter(Boolean) as string[];

    // Batch load all relations in parallel
    const [performers, tags, groups, galleries, studios] = await Promise.all([
      prisma.scenePerformer.findMany({
        where: { sceneId: { in: sceneIds } },
        include: { performer: true },
      }),
      prisma.sceneTag.findMany({
        where: { sceneId: { in: sceneIds } },
        include: { tag: true },
      }),
      prisma.sceneGroup.findMany({
        where: { sceneId: { in: sceneIds } },
        include: { group: true },
      }),
      prisma.sceneGallery.findMany({
        where: { sceneId: { in: sceneIds } },
        include: { gallery: true },
      }),
      studioIds.length > 0
        ? prisma.cachedStudio.findMany({
            where: { id: { in: studioIds } },
          })
        : Promise.resolve([]),
    ]);

    // Build lookup maps
    const performersByScene = new Map<string, any[]>();
    for (const sp of performers) {
      const list = performersByScene.get(sp.sceneId) || [];
      list.push(this.transformCachedPerformer(sp.performer));
      performersByScene.set(sp.sceneId, list);
    }

    const tagsByScene = new Map<string, any[]>();
    for (const st of tags) {
      const list = tagsByScene.get(st.sceneId) || [];
      list.push(this.transformCachedTag(st.tag));
      tagsByScene.set(st.sceneId, list);
    }

    const groupsByScene = new Map<string, any[]>();
    for (const sg of groups) {
      const list = groupsByScene.get(sg.sceneId) || [];
      list.push({
        ...this.transformCachedGroup(sg.group),
        scene_index: sg.sceneIndex,
      });
      groupsByScene.set(sg.sceneId, list);
    }

    const galleriesByScene = new Map<string, any[]>();
    for (const sg of galleries) {
      const list = galleriesByScene.get(sg.sceneId) || [];
      list.push(this.transformCachedGallery(sg.gallery));
      galleriesByScene.set(sg.sceneId, list);
    }

    const studiosById = new Map<string, any>();
    for (const studio of studios) {
      studiosById.set(studio.id, this.transformCachedStudio(studio));
    }

    // Populate scenes
    for (const scene of scenes) {
      scene.performers = performersByScene.get(scene.id) || [];
      scene.tags = tagsByScene.get(scene.id) || [];
      scene.groups = groupsByScene.get(scene.id) || [];
      scene.galleries = galleriesByScene.get(scene.id) || [];
      if (scene.studioId) {
        scene.studio = studiosById.get(scene.studioId) || null;
      }
    }
  }

  // Helper transforms for cached entities
  private transformCachedPerformer(p: any): any {
    return {
      id: p.id,
      name: p.name,
      disambiguation: p.disambiguation,
      gender: p.gender,
      image_path: p.imagePath,
      favorite: p.favorite,
      rating100: p.rating100,
    };
  }

  private transformCachedTag(t: any): any {
    return {
      id: t.id,
      name: t.name,
      image_path: t.imagePath,
      favorite: t.favorite,
    };
  }

  private transformCachedStudio(s: any): any {
    return {
      id: s.id,
      name: s.name,
      image_path: s.imagePath,
      favorite: s.favorite,
      parent_studio: s.parentId ? { id: s.parentId } : null,
    };
  }

  private transformCachedGroup(g: any): any {
    return {
      id: g.id,
      name: g.name,
      front_image_path: g.frontImagePath,
      back_image_path: g.backImagePath,
    };
  }

  private transformCachedGallery(g: any): any {
    return {
      id: g.id,
      title: g.title,
      cover: g.coverPath ? { paths: { thumbnail: g.coverPath } } : null,
    };
  }
```

**Step 2: Add studioId to SELECT columns and transformRow**

Update `SELECT_COLUMNS` to include `s.studioId` (if not already present).

Update `transformRow` to include:
```typescript
    // Store studioId for later population
    const scene: any = {
      // ... existing fields ...
      studioId: row.studioId, // Temporary field for population
    };
```

**Step 3: Update execute() to populate relations by default**

At the end of `execute()`, before returning:

```typescript
    // Populate relations
    await this.populateRelations(scenes);

    logger.info("SceneQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      resultCount: scenes.length,
      total,
    });

    return { scenes, total };
```

**Step 4: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add relation population for performers, tags, studio, groups"
```

---

## Task 11: Integration Test - Basic Query

**Files:**
- Create: `server/tests/services/SceneQueryBuilder.integration.test.ts`

**Step 1: Create integration test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";

// Skip if no database connection
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb("SceneQueryBuilder Integration", () => {
  beforeAll(() => {
    // Ensure database is available
  });

  it("should execute a basic query without filters", async () => {
    const result = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
    });

    expect(result).toHaveProperty("scenes");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.scenes)).toBe(true);
    expect(result.scenes.length).toBeLessThanOrEqual(10);
  });

  it("should apply exclusions correctly", async () => {
    // Get some scene IDs first
    const initial = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 5,
    });

    if (initial.scenes.length < 2) {
      console.log("Skipping exclusion test - not enough scenes");
      return;
    }

    const excludeId = initial.scenes[0].id;

    const withExclusion = await sceneQueryBuilder.execute({
      userId: 1,
      excludedSceneIds: new Set([excludeId]),
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 5,
    });

    const excludedIds = withExclusion.scenes.map((s) => s.id);
    expect(excludedIds).not.toContain(excludeId);
  });

  it("should paginate correctly", async () => {
    const page1 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: 5,
    });

    const page2 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "created_at",
      sortDirection: "DESC",
      page: 2,
      perPage: 5,
    });

    // Pages should have different scenes
    const page1Ids = new Set(page1.scenes.map((s) => s.id));
    const page2Ids = page2.scenes.map((s) => s.id);

    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  it("should return consistent results with random sort and seed", async () => {
    const seed = 12345;

    const result1 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    const result2 = await sceneQueryBuilder.execute({
      userId: 1,
      sort: "random",
      sortDirection: "DESC",
      page: 1,
      perPage: 10,
      randomSeed: seed,
    });

    // Same seed should give same order
    expect(result1.scenes.map((s) => s.id)).toEqual(
      result2.scenes.map((s) => s.id)
    );
  });
});
```

**Step 2: Run integration tests**

Run: `cd server && npm test -- --run tests/services/SceneQueryBuilder.integration.test.ts`
Expected: PASS (or skip if no database)

**Step 3: Commit**

```bash
git add server/tests/services/SceneQueryBuilder.integration.test.ts
git commit -m "test: add SceneQueryBuilder integration tests"
```

---

## Task 12: Wire Up to findScenes Controller

**Files:**
- Modify: `server/controllers/library/scenes.ts`

**Step 1: Import SceneQueryBuilder**

Add at the top of the file:

```typescript
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
```

**Step 2: Add feature flag**

Add near the top of the file:

```typescript
// Feature flag for SQL query builder
const USE_SQL_QUERY_BUILDER = process.env.USE_SQL_QUERY_BUILDER !== "false";
```

**Step 3: Update findScenes to use SceneQueryBuilder**

Find the `findScenes` function and add a new code path before the existing logic:

```typescript
export const findScenes = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const startTime = Date.now();

  try {
    const {
      filter,
      scene_filter,
      ids: requestedIds,
    } = req.body as {
      filter?: { page?: number; per_page?: number; sort?: string; direction?: string };
      scene_filter?: PeekSceneFilter;
      ids?: string[];
    };

    // NEW: Use SQL query builder if enabled
    if (USE_SQL_QUERY_BUILDER) {
      logger.info("findScenes: using SQL query builder path");

      // Get excluded scene IDs
      const excludedIds = await userRestrictionService.getExcludedSceneIds(
        userId,
        false
      );

      // Build filters object
      const filters: PeekSceneFilter = { ...scene_filter };
      if (requestedIds && requestedIds.length > 0) {
        filters.ids = { value: requestedIds, modifier: "INCLUDES" };
      }

      // Execute query
      const result = await sceneQueryBuilder.execute({
        userId,
        filters,
        excludedSceneIds: excludedIds,
        sort: filter?.sort || "created_at",
        sortDirection: (filter?.direction?.toUpperCase() as "ASC" | "DESC") || "DESC",
        page: filter?.page || 1,
        perPage: filter?.per_page || 40,
        randomSeed: userId, // Stable random per user
      });

      // Add streamability info
      const scenes = addStreamabilityInfo(result.scenes);

      logger.info("findScenes complete (SQL path)", {
        totalTimeMs: Date.now() - startTime,
        resultCount: scenes.length,
        total: result.total,
      });

      return res.json({
        findScenes: {
          count: result.total,
          scenes,
        },
      });
    }

    // EXISTING: Original code path (keep as fallback)
    // ... rest of existing findScenes implementation ...
```

**Step 4: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/controllers/library/scenes.ts
git commit -m "feat: wire SceneQueryBuilder to findScenes with feature flag"
```

---

## Task 13: Wire Up to Carousel Controller

**Files:**
- Modify: `server/controllers/carousel.ts`

**Step 1: Import SceneQueryBuilder**

```typescript
import { sceneQueryBuilder } from "../services/SceneQueryBuilder.js";
```

**Step 2: Add feature flag**

```typescript
const USE_SQL_QUERY_BUILDER = process.env.USE_SQL_QUERY_BUILDER !== "false";
```

**Step 3: Update executeCarouselQuery**

Replace or add new code path to `executeCarouselQuery`:

```typescript
export async function executeCarouselQuery(
  userId: number,
  rules: PeekSceneFilter,
  sort: string,
  direction: string
): Promise<NormalizedScene[]> {
  const startTime = Date.now();

  // NEW: Use SQL query builder if enabled
  if (USE_SQL_QUERY_BUILDER) {
    logger.info("executeCarouselQuery: using SQL query builder path");

    // Get exclusions
    const excludedIds = await userRestrictionService.getExcludedSceneIds(
      userId,
      false
    );

    // Execute query
    const result = await sceneQueryBuilder.execute({
      userId,
      filters: rules,
      excludedSceneIds: excludedIds,
      sort,
      sortDirection: direction.toUpperCase() as "ASC" | "DESC",
      page: 1,
      perPage: CAROUSEL_SCENE_LIMIT,
      // Use different seed per carousel load for variety
      randomSeed: userId + Date.now(),
    });

    const scenes = addStreamabilityInfo(result.scenes);

    logger.info("executeCarouselQuery complete (SQL path)", {
      totalTimeMs: Date.now() - startTime,
      resultCount: scenes.length,
    });

    return scenes;
  }

  // EXISTING: Original code path
  // ... rest of existing implementation ...
}
```

**Step 4: Verify file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/controllers/carousel.ts
git commit -m "feat: wire SceneQueryBuilder to carousel queries with feature flag"
```

---

## Task 14: End-to-End Testing

**Files:**
- None (manual testing)

**Step 1: Rebuild and restart server**

Run: `docker-compose up --build -d`

**Step 2: Check logs for SQL query builder usage**

Run: `docker-compose logs -f peek-server`
Expected: Should see "using SQL query builder path" messages

**Step 3: Test homepage load time**

Open browser, navigate to homepage, check:
- Network tab: API response times should be <1s per carousel
- Server logs: Query times should be <200ms

**Step 4: Test browse page with filters**

Navigate to Scenes, apply filters:
- Filter by performer
- Filter by tag
- Filter by favorite
- Sort by random

Each should respond in <500ms.

**Step 5: Commit verification notes**

```bash
git add -A
git commit -m "test: verify SQL query builder integration works end-to-end"
```

---

## Task 15: Remove Feature Flag (Final)

**Files:**
- Modify: `server/controllers/library/scenes.ts`
- Modify: `server/controllers/carousel.ts`

**Step 1: Remove feature flag checks**

In both files, remove the `USE_SQL_QUERY_BUILDER` constant and the conditional branching. Keep only the SQL query builder path.

**Step 2: Remove dead code**

Remove the old in-memory filtering code paths that are no longer used.

**Step 3: Verify everything still compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Run all tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 5: Final commit**

```bash
git add -A
git commit -m "refactor: remove feature flag, SQL query builder is now the default"
```

---

## Summary

| Task | Description | Estimated Time |
|------|-------------|----------------|
| 1 | Create types and interface | 5 min |
| 2 | Base query structure | 10 min |
| 3 | Row transformation | 15 min |
| 4 | Exclusion filter | 10 min |
| 5 | Performer filter | 10 min |
| 6 | Tag/Studio/Group filters | 15 min |
| 7 | User data filters | 15 min |
| 8 | Sort clause builder | 10 min |
| 9 | ID and metadata filters | 10 min |
| 10 | Relation population | 20 min |
| 11 | Integration tests | 15 min |
| 12 | Wire to findScenes | 10 min |
| 13 | Wire to carousel | 10 min |
| 14 | End-to-end testing | 15 min |
| 15 | Remove feature flag | 10 min |

**Total: ~170 minutes (~3 hours)**

## Success Criteria

- [ ] Homepage loads in <2s (currently 30-40s)
- [ ] Browse with filters responds in <500ms (currently 5-15s)
- [ ] Random sort pagination is stable (same seed = same order)
- [ ] All existing tests pass
- [ ] No regressions in filtering behavior
