# ImageQueryBuilder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the memory-intensive `getAllImages()` pattern with SQL-native querying that filters, sorts, and paginates at the database level.

**Architecture:** Create `ImageQueryBuilder` service mirroring `SceneQueryBuilder`. It builds parameterized SQL queries with JOINs to `ImageRating`, `ImageViewHistory`, and `UserExcludedEntity` tables. The controller calls `imageQueryBuilder.execute()` which returns only the requested page of results.

**Tech Stack:** TypeScript, Prisma raw SQL (`$queryRawUnsafe`), SQLite

---

## Context

### The Problem
The current `findImages` controller in `server/controllers/library/images.ts`:
1. Loads ALL images via `stashEntityService.getAllImages()` (line 296)
2. Filters in JavaScript (~100 lines of in-memory logic)
3. Sorts in JavaScript (~70 lines)
4. Paginates in JavaScript

With 50k+ images, this causes memory spikes and slow responses.

### The Solution
`ImageQueryBuilder` will:
- Query `StashImage` directly via SQL
- JOIN to `ImageRating` and `ImageViewHistory` for user data
- JOIN to `UserExcludedEntity` for exclusion filtering
- Use subqueries on `ImagePerformer`, `ImageTag` for filter conditions
- Return only the paginated page

### Key Differences from SceneQueryBuilder
1. **User data tables**: `ImageRating` and `ImageViewHistory` (not `SceneRating` and `WatchHistory`)
2. **Simpler tag filtering**: No `inheritedTagIds` column - just query `ImageTag` junction table
3. **No groups filter**: Images don't have groups
4. **Gallery filter**: Images can be filtered by gallery membership

---

## Task 1: Create ImageQueryBuilder with Basic Structure

**Files:**
- Create: `server/services/ImageQueryBuilder.ts`
- Test: `server/services/__tests__/ImageQueryBuilder.test.ts`

**Step 1: Write the failing test**

Create `server/services/__tests__/ImageQueryBuilder.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { imageQueryBuilder } from "../ImageQueryBuilder.js";
import prisma from "../../prisma/singleton.js";

describe("ImageQueryBuilder", () => {
  const testUserId = 9999;

  beforeEach(async () => {
    // Create test user
    await prisma.user.create({
      data: { id: testUserId, username: "test-iqb", password: "test" },
    });

    // Create test images
    await prisma.stashImage.createMany({
      data: [
        { id: "img-1", title: "Image One", stashCreatedAt: new Date("2024-01-01") },
        { id: "img-2", title: "Image Two", stashCreatedAt: new Date("2024-01-02") },
        { id: "img-3", title: "Image Three", stashCreatedAt: new Date("2024-01-03") },
      ],
    });
  });

  afterEach(async () => {
    await prisma.stashImage.deleteMany({ where: { id: { startsWith: "img-" } } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  describe("execute", () => {
    it("returns paginated images with total count", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 2,
      });

      expect(result.total).toBe(3);
      expect(result.images).toHaveLength(2);
      expect(result.images[0].id).toBe("img-3"); // Most recent first
    });

    it("respects page parameter", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "created_at",
        sortDirection: "DESC",
        page: 2,
        perPage: 2,
      });

      expect(result.total).toBe(3);
      expect(result.images).toHaveLength(1);
      expect(result.images[0].id).toBe("img-1"); // Third image on page 2
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: FAIL with "Cannot find module '../ImageQueryBuilder.js'"

**Step 3: Write minimal implementation**

Create `server/services/ImageQueryBuilder.ts`:

```typescript
/**
 * ImageQueryBuilder - SQL-native image querying
 *
 * Builds parameterized SQL queries for image filtering, sorting, and pagination.
 * Eliminates the need to load all images into memory.
 */
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface ImageQueryOptions {
  userId: number;
  filters?: ImageFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  randomSeed?: number;
}

// Image filter type
export interface ImageFilter {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
  rating100?: { value: number; value2?: number; modifier: string };
  o_counter?: { value: number; value2?: number; modifier: string };
  performers?: { value: string[]; modifier?: string };
  tags?: { value: string[]; modifier?: string; depth?: number };
  studios?: { value: string[]; modifier?: string; depth?: number };
  galleries?: { value: string[]; modifier?: string };
  q?: string; // Search query
}

// Query result
export interface ImageQueryResult {
  images: any[];
  total: number;
}

/**
 * Builds and executes SQL queries for image filtering
 */
class ImageQueryBuilder {
  // Column list for SELECT - all StashImage fields plus user data
  private readonly SELECT_COLUMNS = `
    i.id, i.title, i.code, i.details, i.photographer, i.urls, i.date,
    i.studioId, i.rating100 AS stashRating100, i.oCounter AS stashOCounter,
    i.organized, i.filePath, i.width, i.height, i.fileSize,
    i.pathThumbnail, i.pathPreview, i.pathImage,
    i.stashCreatedAt, i.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    v.viewCount AS userViewCount, v.oCount AS userOCount,
    v.lastViewedAt AS userLastViewedAt
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(
    userId: number,
    applyExclusions: boolean = true
  ): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashImage i
        LEFT JOIN ImageRating r ON i.id = r.imageId AND r.userId = ?
        LEFT JOIN ImageViewHistory v ON i.id = v.imageId AND v.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'image' AND e.entityId = i.id`,
        params: [userId, userId, userId],
      };
    }

    return {
      sql: baseJoins,
      params: [userId, userId],
    };
  }

  // Base WHERE clause (always filter deleted, optionally filter excluded)
  private buildBaseWhere(applyExclusions: boolean = true): FilterClause {
    if (applyExclusions) {
      return {
        sql: "i.deletedAt IS NULL AND e.id IS NULL",
        params: [],
      };
    }
    return {
      sql: "i.deletedAt IS NULL",
      params: [],
    };
  }

  // Build sort clause
  private buildSortClause(sort: string, dir: "ASC" | "DESC"): string {
    const sortMap: Record<string, string> = {
      title: `COALESCE(i.title, i.filePath) ${dir}`,
      date: `i.date ${dir}`,
      rating: `COALESCE(r.rating, i.rating100, 0) ${dir}`,
      rating100: `COALESCE(r.rating, i.rating100, 0) ${dir}`,
      o_counter: `COALESCE(v.oCount, i.oCounter, 0) ${dir}`,
      filesize: `COALESCE(i.fileSize, 0) ${dir}`,
      path: `i.filePath ${dir}`,
      created_at: `i.stashCreatedAt ${dir}`,
      updated_at: `i.stashUpdatedAt ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["created_at"];
    return `${sortExpr}, i.id ${dir}`;
  }

  async execute(options: ImageQueryOptions): Promise<ImageQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, applyExclusions = true, filters } = options;

    // Build FROM clause with optional exclusion JOIN
    const fromClause = this.buildFromClause(userId, applyExclusions);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere(applyExclusions)];

    // Combine WHERE clauses
    const whereSQL = whereClauses
      .map((c) => c.sql)
      .filter(Boolean)
      .join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build sort
    const sortClause = this.buildSortClause(
      options.sort,
      options.sortDirection
    );

    // Calculate offset
    const offset = (page - 1) * perPage;

    // Build main query
    const sql = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      WHERE ${whereSQL}
      ORDER BY ${sortClause}
      LIMIT ? OFFSET ?
    `;

    const params = [...fromClause.params, ...whereParams, perPage, offset];

    logger.debug("ImageQueryBuilder.execute", {
      whereClauseCount: whereClauses.length,
      applyExclusions,
      sort: options.sort,
      paramCount: params.length,
    });

    // Execute query
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT i.id) as total
      ${fromClause.sql}
      WHERE ${whereSQL}
    `;
    const countParams = [...fromClause.params, ...whereParams];
    const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      ...countParams
    );
    const total = Number(countResult[0]?.total || 0);

    const duration = Date.now() - startTime;
    logger.debug("ImageQueryBuilder.execute completed", {
      total,
      returned: rows.length,
      durationMs: duration,
    });

    return { images: rows, total };
  }
}

// Export singleton instance
export const imageQueryBuilder = new ImageQueryBuilder();
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ImageQueryBuilder.ts server/services/__tests__/ImageQueryBuilder.test.ts
git commit -m "feat: add ImageQueryBuilder with basic pagination"
```

---

## Task 2: Add User Data Filters (favorite, rating, o_counter)

**Files:**
- Modify: `server/services/ImageQueryBuilder.ts`
- Modify: `server/services/__tests__/ImageQueryBuilder.test.ts`

**Step 1: Write the failing tests**

Add to `server/services/__tests__/ImageQueryBuilder.test.ts`:

```typescript
  describe("user data filters", () => {
    beforeEach(async () => {
      // Add user ratings
      await prisma.imageRating.createMany({
        data: [
          { userId: testUserId, imageId: "img-1", rating: 80, favorite: true },
          { userId: testUserId, imageId: "img-2", rating: 40, favorite: false },
        ],
      });
      // Add view history
      await prisma.imageViewHistory.createMany({
        data: [
          { userId: testUserId, imageId: "img-1", oCount: 5, viewCount: 10 },
          { userId: testUserId, imageId: "img-3", oCount: 2, viewCount: 3 },
        ],
      });
    });

    afterEach(async () => {
      await prisma.imageRating.deleteMany({ where: { userId: testUserId } });
      await prisma.imageViewHistory.deleteMany({ where: { userId: testUserId } });
    });

    it("filters by favorite", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { favorite: true },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });

    it("filters by rating100 GREATER_THAN", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { rating100: { value: 50, modifier: "GREATER_THAN" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });

    it("filters by o_counter GREATER_THAN", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { o_counter: { value: 3, modifier: "GREATER_THAN" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: FAIL - filters not implemented

**Step 3: Add filter implementations**

Add these methods to `ImageQueryBuilder` class in `server/services/ImageQueryBuilder.ts`:

```typescript
  // Build favorite filter
  private buildFavoriteFilter(favorite: boolean | undefined): FilterClause {
    if (favorite === undefined) {
      return { sql: "", params: [] };
    }
    return {
      sql: favorite ? "r.favorite = 1" : "(r.favorite = 0 OR r.favorite IS NULL)",
      params: [],
    };
  }

  // Build rating filter
  private buildRatingFilter(
    filter: { value: number; value2?: number; modifier: string } | undefined
  ): FilterClause {
    if (!filter) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier } = filter;
    const ratingExpr = "COALESCE(r.rating, i.rating100, 0)";

    switch (modifier) {
      case "GREATER_THAN":
        return { sql: `${ratingExpr} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${ratingExpr} < ?`, params: [value] };
      case "EQUALS":
        return { sql: `${ratingExpr} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${ratingExpr} != ?`, params: [value] };
      case "BETWEEN":
        return { sql: `${ratingExpr} BETWEEN ? AND ?`, params: [value, value2 ?? value] };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build o_counter filter
  private buildOCounterFilter(
    filter: { value: number; value2?: number; modifier: string } | undefined
  ): FilterClause {
    if (!filter) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier } = filter;
    const oExpr = "COALESCE(v.oCount, i.oCounter, 0)";

    switch (modifier) {
      case "GREATER_THAN":
        return { sql: `${oExpr} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${oExpr} < ?`, params: [value] };
      case "EQUALS":
        return { sql: `${oExpr} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${oExpr} != ?`, params: [value] };
      case "BETWEEN":
        return { sql: `${oExpr} BETWEEN ? AND ?`, params: [value, value2 ?? value] };
      default:
        return { sql: "", params: [] };
    }
  }
```

Update the `execute` method to use these filters:

```typescript
    // Add user data filters
    if (filters?.favorite !== undefined) {
      const favoriteFilter = this.buildFavoriteFilter(filters.favorite);
      if (favoriteFilter.sql) whereClauses.push(favoriteFilter);
    }

    if (filters?.rating100) {
      const ratingFilter = this.buildRatingFilter(filters.rating100);
      if (ratingFilter.sql) whereClauses.push(ratingFilter);
    }

    if (filters?.o_counter) {
      const oCounterFilter = this.buildOCounterFilter(filters.o_counter);
      if (oCounterFilter.sql) whereClauses.push(oCounterFilter);
    }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ImageQueryBuilder.ts server/services/__tests__/ImageQueryBuilder.test.ts
git commit -m "feat: add user data filters to ImageQueryBuilder"
```

---

## Task 3: Add Entity Filters (performers, tags, studios, galleries)

**Files:**
- Modify: `server/services/ImageQueryBuilder.ts`
- Modify: `server/services/__tests__/ImageQueryBuilder.test.ts`

**Step 1: Write the failing tests**

Add to test file:

```typescript
  describe("entity filters", () => {
    beforeEach(async () => {
      // Create performers
      await prisma.stashPerformer.createMany({
        data: [
          { id: "perf-1", name: "Performer One" },
          { id: "perf-2", name: "Performer Two" },
        ],
      });
      // Create tags
      await prisma.stashTag.createMany({
        data: [
          { id: "tag-1", name: "Tag One" },
          { id: "tag-2", name: "Tag Two" },
        ],
      });
      // Create studio
      await prisma.stashStudio.create({
        data: { id: "studio-1", name: "Studio One" },
      });
      // Create gallery
      await prisma.stashGallery.create({
        data: { id: "gallery-1", title: "Gallery One" },
      });

      // Link performers to images
      await prisma.imagePerformer.createMany({
        data: [
          { imageId: "img-1", performerId: "perf-1" },
          { imageId: "img-2", performerId: "perf-2" },
        ],
      });
      // Link tags to images
      await prisma.imageTag.createMany({
        data: [
          { imageId: "img-1", tagId: "tag-1" },
          { imageId: "img-2", tagId: "tag-2" },
        ],
      });
      // Set studio on image
      await prisma.stashImage.update({
        where: { id: "img-1" },
        data: { studioId: "studio-1" },
      });
      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: "img-1", galleryId: "gallery-1" },
      });
    });

    afterEach(async () => {
      await prisma.imageGallery.deleteMany({});
      await prisma.imagePerformer.deleteMany({});
      await prisma.imageTag.deleteMany({});
      await prisma.stashGallery.deleteMany({ where: { id: "gallery-1" } });
      await prisma.stashStudio.deleteMany({ where: { id: "studio-1" } });
      await prisma.stashTag.deleteMany({ where: { id: { startsWith: "tag-" } } });
      await prisma.stashPerformer.deleteMany({ where: { id: { startsWith: "perf-" } } });
    });

    it("filters by performer INCLUDES", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { performers: { value: ["perf-1"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });

    it("filters by tag INCLUDES", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { tags: { value: ["tag-2"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-2");
    });

    it("filters by studio INCLUDES", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { studios: { value: ["studio-1"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });

    it("filters by gallery INCLUDES", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { galleries: { value: ["gallery-1"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-1");
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: FAIL - entity filters not implemented

**Step 3: Add entity filter implementations**

Add these methods to `ImageQueryBuilder`:

```typescript
  // Build performer filter
  private buildPerformerFilter(
    filter: { value?: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `i.id IN (SELECT imageId FROM ImagePerformer WHERE performerId IN (${placeholders}))`,
          params: ids,
        };
      case "INCLUDES_ALL":
        return {
          sql: `i.id IN (
            SELECT imageId FROM ImagePerformer
            WHERE performerId IN (${placeholders})
            GROUP BY imageId
            HAVING COUNT(DISTINCT performerId) = ?
          )`,
          params: [...ids, ids.length],
        };
      case "EXCLUDES":
        return {
          sql: `i.id NOT IN (SELECT imageId FROM ImagePerformer WHERE performerId IN (${placeholders}))`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build tag filter
  private buildTagFilter(
    filter: { value?: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `i.id IN (SELECT imageId FROM ImageTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };
      case "INCLUDES_ALL":
        return {
          sql: `i.id IN (
            SELECT imageId FROM ImageTag
            WHERE tagId IN (${placeholders})
            GROUP BY imageId
            HAVING COUNT(DISTINCT tagId) = ?
          )`,
          params: [...ids, ids.length],
        };
      case "EXCLUDES":
        return {
          sql: `i.id NOT IN (SELECT imageId FROM ImageTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build studio filter
  private buildStudioFilter(
    filter: { value?: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `i.studioId IN (${placeholders})`,
          params: ids,
        };
      case "EXCLUDES":
        return {
          sql: `(i.studioId IS NULL OR i.studioId NOT IN (${placeholders}))`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build gallery filter
  private buildGalleryFilter(
    filter: { value?: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `i.id IN (SELECT imageId FROM ImageGallery WHERE galleryId IN (${placeholders}))`,
          params: ids,
        };
      case "EXCLUDES":
        return {
          sql: `i.id NOT IN (SELECT imageId FROM ImageGallery WHERE galleryId IN (${placeholders}))`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }
```

Update `execute` to use entity filters:

```typescript
    // Add entity filters
    if (filters?.performers) {
      const performerFilter = this.buildPerformerFilter(filters.performers);
      if (performerFilter.sql) whereClauses.push(performerFilter);
    }

    if (filters?.tags) {
      const tagFilter = this.buildTagFilter(filters.tags);
      if (tagFilter.sql) whereClauses.push(tagFilter);
    }

    if (filters?.studios) {
      const studioFilter = this.buildStudioFilter(filters.studios);
      if (studioFilter.sql) whereClauses.push(studioFilter);
    }

    if (filters?.galleries) {
      const galleryFilter = this.buildGalleryFilter(filters.galleries);
      if (galleryFilter.sql) whereClauses.push(galleryFilter);
    }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ImageQueryBuilder.ts server/services/__tests__/ImageQueryBuilder.test.ts
git commit -m "feat: add entity filters to ImageQueryBuilder"
```

---

## Task 4: Add Search Query and ID Filters

**Files:**
- Modify: `server/services/ImageQueryBuilder.ts`
- Modify: `server/services/__tests__/ImageQueryBuilder.test.ts`

**Step 1: Write the failing tests**

Add to test file:

```typescript
  describe("search and ID filters", () => {
    it("filters by search query", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { q: "Two" },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(1);
      expect(result.images[0].id).toBe("img-2");
    });

    it("filters by IDs", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        filters: { ids: { value: ["img-1", "img-3"], modifier: "INCLUDES" } },
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(2);
      expect(result.images.map((i: any) => i.id).sort()).toEqual(["img-1", "img-3"].sort());
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: FAIL

**Step 3: Add implementations**

Add to `ImageQueryBuilder`:

```typescript
  // Build search query filter
  private buildSearchFilter(q: string | undefined): FilterClause {
    if (!q || q.trim() === "") {
      return { sql: "", params: [] };
    }

    const searchTerm = `%${q.trim()}%`;
    return {
      sql: `(
        i.title LIKE ? OR
        i.details LIKE ? OR
        i.photographer LIKE ? OR
        i.filePath LIKE ?
      )`,
      params: [searchTerm, searchTerm, searchTerm, searchTerm],
    };
  }

  // Build ID filter
  private buildIdFilter(
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
          sql: `i.id IN (${placeholders})`,
          params: ids,
        };
      case "EXCLUDES":
        return {
          sql: `i.id NOT IN (${placeholders})`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }
```

Update `execute` to use these filters:

```typescript
    // Add search filter
    if (filters?.q) {
      const searchFilter = this.buildSearchFilter(filters.q);
      if (searchFilter.sql) whereClauses.push(searchFilter);
    }

    // Add ID filter
    if (filters?.ids) {
      const idFilter = this.buildIdFilter(filters.ids);
      if (idFilter.sql) whereClauses.push(idFilter);
    }
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ImageQueryBuilder.ts server/services/__tests__/ImageQueryBuilder.test.ts
git commit -m "feat: add search and ID filters to ImageQueryBuilder"
```

---

## Task 5: Add Random Sort with Seed

**Files:**
- Modify: `server/services/ImageQueryBuilder.ts`
- Modify: `server/services/__tests__/ImageQueryBuilder.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
  describe("random sort", () => {
    it("returns stable random order with seed", async () => {
      const result1 = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "random",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        randomSeed: 12345,
      });

      const result2 = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "random",
        sortDirection: "ASC",
        page: 1,
        perPage: 10,
        randomSeed: 12345,
      });

      // Same seed should produce same order
      expect(result1.images.map((i: any) => i.id)).toEqual(
        result2.images.map((i: any) => i.id)
      );
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: FAIL

**Step 3: Update sort clause to handle random**

Update `buildSortClause` method:

```typescript
  // Build sort clause
  private buildSortClause(
    sort: string,
    dir: "ASC" | "DESC",
    randomSeed?: number
  ): string {
    // Handle random sort with seed
    if (sort === "random" && randomSeed !== undefined) {
      // Use deterministic random based on seed and id
      // Formula: (id_numeric * seed) % large_prime gives stable ordering
      return `((CAST(i.id AS INTEGER) * ${randomSeed}) % 2147483647) ${dir}, i.id ${dir}`;
    }

    const sortMap: Record<string, string> = {
      title: `COALESCE(i.title, i.filePath) ${dir}`,
      date: `i.date ${dir}`,
      rating: `COALESCE(r.rating, i.rating100, 0) ${dir}`,
      rating100: `COALESCE(r.rating, i.rating100, 0) ${dir}`,
      o_counter: `COALESCE(v.oCount, i.oCounter, 0) ${dir}`,
      filesize: `COALESCE(i.fileSize, 0) ${dir}`,
      path: `i.filePath ${dir}`,
      created_at: `i.stashCreatedAt ${dir}`,
      updated_at: `i.stashUpdatedAt ${dir}`,
      random: `RANDOM()`, // Fallback for random without seed
    };

    const sortExpr = sortMap[sort] || sortMap["created_at"];
    return `${sortExpr}, i.id ${dir}`;
  }
```

Update the call in `execute`:

```typescript
    const sortClause = this.buildSortClause(
      options.sort,
      options.sortDirection,
      options.randomSeed
    );
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ImageQueryBuilder.ts server/services/__tests__/ImageQueryBuilder.test.ts
git commit -m "feat: add random sort with seed to ImageQueryBuilder"
```

---

## Task 6: Add Exclusion Filtering Test

**Files:**
- Modify: `server/services/__tests__/ImageQueryBuilder.test.ts`

**Step 1: Write the test**

Add to test file:

```typescript
  describe("exclusion filtering", () => {
    beforeEach(async () => {
      // Exclude img-2 for the test user
      await prisma.userExcludedEntity.create({
        data: {
          userId: testUserId,
          entityType: "image",
          entityId: "img-2",
          reason: "hidden",
        },
      });
    });

    afterEach(async () => {
      await prisma.userExcludedEntity.deleteMany({ where: { userId: testUserId } });
    });

    it("excludes images when applyExclusions is true (default)", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(2);
      expect(result.images.map((i: any) => i.id)).not.toContain("img-2");
    });

    it("includes all images when applyExclusions is false", async () => {
      const result = await imageQueryBuilder.execute({
        userId: testUserId,
        applyExclusions: false,
        sort: "created_at",
        sortDirection: "DESC",
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(3);
      expect(result.images.map((i: any) => i.id)).toContain("img-2");
    });
  });
```

**Step 2: Run test to verify it passes**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: PASS (exclusion logic already implemented in Task 1)

**Step 3: Commit**

```bash
git add server/services/__tests__/ImageQueryBuilder.test.ts
git commit -m "test: add exclusion filtering tests for ImageQueryBuilder"
```

---

## Task 7: Add getByIds Helper Method

**Files:**
- Modify: `server/services/ImageQueryBuilder.ts`
- Modify: `server/services/__tests__/ImageQueryBuilder.test.ts`

**Step 1: Write the failing test**

Add to test file:

```typescript
  describe("getByIds", () => {
    it("returns images by IDs with user data", async () => {
      await prisma.imageRating.create({
        data: { userId: testUserId, imageId: "img-1", rating: 90, favorite: true },
      });

      const result = await imageQueryBuilder.getByIds({
        userId: testUserId,
        ids: ["img-1", "img-3"],
      });

      expect(result.images).toHaveLength(2);

      const img1 = result.images.find((i: any) => i.id === "img-1");
      expect(img1.userRating).toBe(90);
      expect(img1.userFavorite).toBe(1); // SQLite returns 1 for true
    });

    afterEach(async () => {
      await prisma.imageRating.deleteMany({ where: { userId: testUserId } });
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: FAIL - getByIds not defined

**Step 3: Add getByIds method**

Add to `ImageQueryBuilder`:

```typescript
  /**
   * Get images by IDs with user data
   */
  async getByIds(options: { userId: number; ids: string[] }): Promise<ImageQueryResult> {
    const { userId, ids } = options;

    if (ids.length === 0) {
      return { images: [], total: 0 };
    }

    return this.execute({
      userId,
      filters: { ids: { value: ids, modifier: "INCLUDES" } },
      applyExclusions: false, // IDs explicitly requested, don't filter
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: ids.length,
    });
  }
```

Also export the options type:

```typescript
export interface ImageByIdsOptions {
  userId: number;
  ids: string[];
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ImageQueryBuilder.ts server/services/__tests__/ImageQueryBuilder.test.ts
git commit -m "feat: add getByIds helper to ImageQueryBuilder"
```

---

## Task 8: Update Images Controller to Use ImageQueryBuilder

**Files:**
- Modify: `server/controllers/library/images.ts`

**Step 1: Update findImages to use ImageQueryBuilder**

Replace the entire `findImages` function in `server/controllers/library/images.ts`:

```typescript
import { imageQueryBuilder, type ImageFilter } from "../../services/ImageQueryBuilder.js";

/**
 * Find images endpoint - uses SQL-native ImageQueryBuilder
 */
export const findImages = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.id;
    const requestingUser = req.user;
    const { filter, image_filter, ids } = req.body;

    const sortFieldRaw = filter?.sort || "title";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Parse random_<seed> format
    let randomSeed: number | undefined;
    let sortField = sortFieldRaw;

    if (sortFieldRaw.startsWith("random_")) {
      const seedStr = sortFieldRaw.slice(7);
      const parsedSeed = parseInt(seedStr, 10);
      if (!isNaN(parsedSeed)) {
        randomSeed = parsedSeed % 1e8;
        sortField = "random";
      }
    } else if (sortFieldRaw === "random") {
      randomSeed = (userId + Date.now()) % 1e8;
    }

    // Build filter object from request
    const filters: ImageFilter = {};

    if (searchQuery) {
      filters.q = searchQuery;
    }

    if (ids && Array.isArray(ids) && ids.length > 0) {
      filters.ids = { value: ids, modifier: "INCLUDES" };
    }

    if (image_filter?.favorite !== undefined) {
      filters.favorite = image_filter.favorite;
    }

    if (image_filter?.rating100) {
      filters.rating100 = image_filter.rating100;
    }

    if (image_filter?.o_counter) {
      filters.o_counter = image_filter.o_counter;
    }

    if (image_filter?.performers?.value) {
      filters.performers = {
        value: image_filter.performers.value.map(String),
        modifier: image_filter.performers.modifier || "INCLUDES",
      };
    }

    if (image_filter?.tags?.value) {
      filters.tags = {
        value: image_filter.tags.value.map(String),
        modifier: image_filter.tags.modifier || "INCLUDES",
      };
    }

    if (image_filter?.studios?.value) {
      filters.studios = {
        value: image_filter.studios.value.map(String),
        modifier: image_filter.studios.modifier || "INCLUDES",
      };
    }

    if (image_filter?.galleries?.value) {
      filters.galleries = {
        value: image_filter.galleries.value.map(String),
        modifier: image_filter.galleries.modifier || "INCLUDES",
      };
    }

    // Admins skip exclusions
    const applyExclusions = requestingUser?.role !== "ADMIN";

    // Execute query
    const result = await imageQueryBuilder.execute({
      userId,
      filters,
      applyExclusions,
      sort: sortField,
      sortDirection: sortDirection.toUpperCase() as "ASC" | "DESC",
      page,
      perPage,
      randomSeed,
    });

    // Add stashUrl to each image
    const imagesWithStashUrl = result.images.map((image) => ({
      ...image,
      stashUrl: buildStashEntityUrl("image", image.id),
    }));

    const totalTime = Date.now() - startTime;
    logger.debug("findImages completed", {
      totalTime: `${totalTime}ms`,
      totalImages: result.total,
      returnedImages: imagesWithStashUrl.length,
      page,
      perPage,
    });

    res.json({
      findImages: {
        count: result.total,
        images: imagesWithStashUrl,
      },
    });
  } catch (error) {
    logger.error("Error in findImages", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find images",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
```

**Step 2: Remove unused imports and functions**

Remove these from `images.ts`:
- `stashEntityService` import (if no longer used by findImageById)
- `entityExclusionHelper` import
- `expandStudioIds`, `expandTagIds` imports
- `mergeImagesWithUserData` function
- `applyImageFiltersWithInheritance` function
- `sortImages` function

Keep `findImageById` as-is for now (single image lookup can stay simple).

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 4: Manual verification**

Start the server and test the images page:
1. Navigate to images page
2. Apply filters (performer, tag, studio)
3. Test sorting options
4. Test random sort with pagination

**Step 5: Commit**

```bash
git add server/controllers/library/images.ts
git commit -m "refactor: replace in-memory filtering with ImageQueryBuilder"
```

---

## Task 9: Hydrate Related Entities (performers, tags, galleries, studio)

**Files:**
- Modify: `server/services/ImageQueryBuilder.ts`

**Step 1: Add hydration method**

The raw SQL returns flat data. We need to hydrate related entities for the API response.

Add to `ImageQueryBuilder`:

```typescript
  /**
   * Hydrate image rows with related entities
   */
  private async hydrateImages(rows: any[]): Promise<any[]> {
    if (rows.length === 0) return [];

    const imageIds = rows.map((r) => r.id);

    // Fetch all related data in parallel
    const [performers, tags, galleries, studios] = await Promise.all([
      prisma.imagePerformer.findMany({
        where: { imageId: { in: imageIds } },
        include: { performer: true },
      }),
      prisma.imageTag.findMany({
        where: { imageId: { in: imageIds } },
        include: { tag: true },
      }),
      prisma.imageGallery.findMany({
        where: { imageId: { in: imageIds } },
        include: { gallery: true },
      }),
      prisma.stashStudio.findMany({
        where: { id: { in: rows.map((r) => r.studioId).filter(Boolean) } },
      }),
    ]);

    // Build lookup maps
    const performersByImage = new Map<string, any[]>();
    for (const ip of performers) {
      if (!performersByImage.has(ip.imageId)) {
        performersByImage.set(ip.imageId, []);
      }
      performersByImage.get(ip.imageId)!.push(ip.performer);
    }

    const tagsByImage = new Map<string, any[]>();
    for (const it of tags) {
      if (!tagsByImage.has(it.imageId)) {
        tagsByImage.set(it.imageId, []);
      }
      tagsByImage.get(it.imageId)!.push(it.tag);
    }

    const galleriesByImage = new Map<string, any[]>();
    for (const ig of galleries) {
      if (!galleriesByImage.has(ig.imageId)) {
        galleriesByImage.set(ig.imageId, []);
      }
      galleriesByImage.get(ig.imageId)!.push(ig.gallery);
    }

    const studiosById = new Map(studios.map((s) => [s.id, s]));

    // Hydrate each row
    return rows.map((row) => ({
      ...row,
      performers: performersByImage.get(row.id) || [],
      tags: tagsByImage.get(row.id) || [],
      galleries: galleriesByImage.get(row.id) || [],
      studio: row.studioId ? studiosById.get(row.studioId) : null,
    }));
  }
```

Update `execute` to use hydration:

```typescript
    // Execute query
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    // Hydrate with related entities
    const hydratedImages = await this.hydrateImages(rows);

    // ... count query ...

    return { images: hydratedImages, total };
```

**Step 2: Run tests**

Run: `npm test -- server/services/__tests__/ImageQueryBuilder.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add server/services/ImageQueryBuilder.ts
git commit -m "feat: add entity hydration to ImageQueryBuilder"
```

---

## Task 10: Final Integration Test and Cleanup

**Files:**
- Test: `server/tests/controllers/images.integration.test.ts` (create)

**Step 1: Create integration test**

Create `server/tests/controllers/images.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../../app.js";
import prisma from "../../prisma/singleton.js";

describe("Images API Integration", () => {
  const testUserId = 8888;
  let authToken: string;

  beforeEach(async () => {
    // Create test user and get token
    await prisma.user.create({
      data: { id: testUserId, username: "img-test", password: "test" },
    });
    // Create test images
    await prisma.stashImage.createMany({
      data: [
        { id: "int-img-1", title: "Test Image One", stashCreatedAt: new Date() },
        { id: "int-img-2", title: "Test Image Two", stashCreatedAt: new Date() },
      ],
    });
  });

  afterEach(async () => {
    await prisma.stashImage.deleteMany({ where: { id: { startsWith: "int-img-" } } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it("returns paginated images", async () => {
    const response = await request(app)
      .post("/api/library/images")
      .send({
        filter: { page: 1, per_page: 10, sort: "created_at", direction: "DESC" },
      });

    expect(response.status).toBe(200);
    expect(response.body.findImages).toBeDefined();
    expect(response.body.findImages.count).toBeGreaterThanOrEqual(2);
  });
});
```

**Step 2: Run integration tests**

Run: `npm run test:integration -- server/tests/controllers/images.integration.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `npm test && npm run lint && npm run build`
Expected: All pass

**Step 4: Final commit**

```bash
git add server/tests/controllers/images.integration.test.ts
git commit -m "test: add images API integration tests"
```

---

Plan complete and saved to `docs/plans/2026-01-02-image-query-builder.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
