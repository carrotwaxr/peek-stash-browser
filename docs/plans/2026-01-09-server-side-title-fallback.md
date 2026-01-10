# Server-Side Title Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate title/name fallback logic at the API level so the server always returns computed display titles with fallback applied.

**Architecture:** Title fallbacks are computed in Query Builders at the SQL level (for correct sorting) and during row mapping. A shared utility function strips file extensions. The `title` field itself returns the computed value (no separate `displayTitle` field). Returns `null` only when all fallback options are exhausted.

**Tech Stack:** TypeScript, SQLite (via Prisma raw queries), existing Query Builder pattern

---

## Summary of Changes

| Entity | Current State | Target State |
|--------|---------------|--------------|
| Scenes | No fallback; client uses `getSceneTitle()` | Fallback to `filePath` basename (ext stripped) |
| Galleries | Has fallback but no ext stripping; sort ignores fallback | Add ext stripping; fix sort to use fallback |
| Images | Only COALESCE for sorting; client uses `getImageTitle()` | Fallback to `filePath` basename (ext stripped) |

---

### Task 1: Create shared title utility

**Files:**
- Create: `server/utils/titleUtils.ts`

**Step 1: Create the utility file**

```typescript
/**
 * Utilities for computing display titles with fallback logic.
 */

/**
 * Strip file extension from a filename.
 * @param filename - The filename (with or without extension)
 * @returns The filename without extension
 */
export function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

/**
 * Extract basename from a file path (handles both / and \ separators).
 * @param filePath - The full file path
 * @returns The basename (filename only)
 */
export function extractBasename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

/**
 * Get fallback title for a scene when no explicit title is set.
 * Uses file path basename with extension stripped.
 *
 * @param filePath - The scene's primary file path
 * @returns The fallback title or null if no path available
 */
export function getSceneFallbackTitle(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }
  const basename = extractBasename(filePath);
  return stripExtension(basename);
}

/**
 * Get fallback title for a gallery when no explicit title is set.
 * Uses file basename (for zip galleries) or folder path basename (for folder-based galleries).
 * Extensions are stripped from the result.
 *
 * @param folderPath - The gallery's folder path
 * @param fileBasename - The gallery's file basename (for zip galleries)
 * @returns The fallback title or null if neither is available
 */
export function getGalleryFallbackTitle(
  folderPath: string | null,
  fileBasename: string | null
): string | null {
  // Try file basename first (for zip galleries)
  if (fileBasename) {
    return stripExtension(fileBasename);
  }
  // Try folder path basename (for folder-based galleries)
  if (folderPath) {
    const basename = extractBasename(folderPath);
    return basename; // Folder names don't have extensions to strip
  }
  return null;
}

/**
 * Get fallback title for an image when no explicit title is set.
 * Uses file path basename with extension stripped.
 *
 * @param filePath - The image's file path
 * @returns The fallback title or null if no path available
 */
export function getImageFallbackTitle(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }
  const basename = extractBasename(filePath);
  return stripExtension(basename);
}
```

**Step 2: Commit**

```bash
git add server/utils/titleUtils.ts
git commit -m "feat: add shared title utility functions with extension stripping"
```

---

### Task 2: Update GalleryQueryBuilder to use new utility and fix sorting

**Files:**
- Modify: `server/services/GalleryQueryBuilder.ts`
- Delete: `server/utils/galleryUtils.ts` (after migration)

**Step 1: Update import in GalleryQueryBuilder**

Change line 11 from:
```typescript
import { getGalleryFallbackTitle } from "../utils/galleryUtils.js";
```
to:
```typescript
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
```

**Step 2: Fix sort clause to use fallback**

In `buildSortClause` method (around line 446-448), change:
```typescript
const sortMap: Record<string, string> = {
  // Gallery metadata - use COLLATE NOCASE for case-insensitive sorting
  title: `g.title COLLATE NOCASE ${dir}`,
```
to:
```typescript
const sortMap: Record<string, string> = {
  // Gallery metadata - use COALESCE for fallback title, COLLATE NOCASE for case-insensitive sorting
  title: `COALESCE(g.title, g.fileBasename, SUBSTR(g.folderPath, LENGTH(g.folderPath) - LENGTH(REPLACE(g.folderPath, '/', '')) + 1)) COLLATE NOCASE ${dir}`,
```

Note: The SUBSTR expression extracts the last path segment. SQLite doesn't have a basename function, so we compute it by finding the position after the last separator.

**Step 3: Delete old galleryUtils.ts**

```bash
rm server/utils/galleryUtils.ts
```

**Step 4: Commit**

```bash
git add server/services/GalleryQueryBuilder.ts server/utils/titleUtils.ts
git rm server/utils/galleryUtils.ts
git commit -m "refactor: migrate gallery fallback to titleUtils, add extension stripping, fix sort"
```

---

### Task 3: Update SceneQueryBuilder with title fallback

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Add import**

Add at the top with other imports (around line 10):
```typescript
import { getSceneFallbackTitle } from "../utils/titleUtils.js";
```

**Step 2: Update transformRow to apply fallback**

In `transformRow` method (around line 1495), change:
```typescript
title: row.title || null,
```
to:
```typescript
title: row.title || getSceneFallbackTitle(row.filePath),
```

**Step 3: Fix sort clause to use fallback**

In `buildSortClause` method (around line 1111), change:
```typescript
title: `s.title ${dir}`,
```
to:
```typescript
title: `COALESCE(s.title, REPLACE(REPLACE(s.filePath, RTRIM(s.filePath, REPLACE(s.filePath, '/', '')), ''), RTRIM(REPLACE(REPLACE(s.filePath, RTRIM(s.filePath, REPLACE(s.filePath, '/', '')), ''), RTRIM(REPLACE(REPLACE(s.filePath, RTRIM(s.filePath, REPLACE(s.filePath, '/', '')), ''), '.', ''), '.'), '')) ${dir}`,
```

Actually, the SQL for stripping extension and extracting basename is complex. Let's use a simpler approach - just COALESCE with filePath for sorting (the extension will affect sort order slightly but it's acceptable):

```typescript
title: `COALESCE(s.title, s.filePath) COLLATE NOCASE ${dir}`,
```

**Step 4: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "feat: add title fallback to SceneQueryBuilder using filePath basename"
```

---

### Task 4: Update ImageQueryBuilder with title fallback

**Files:**
- Modify: `server/services/ImageQueryBuilder.ts`

**Step 1: Add import**

Add at the top with other imports (around line 8):
```typescript
import { getImageFallbackTitle } from "../utils/titleUtils.js";
```

**Step 2: Update row transformation to apply fallback**

In the `execute` method, the row transformation happens around line 543. We need to add title fallback there.

Find the `transformedRows` mapping (around line 543):
```typescript
const transformedRows = rows.map((row) => ({
  ...row,
  fileSize: row.fileSize != null ? Number(row.fileSize) : null,
  pathThumbnail: this.transformUrl(row.pathThumbnail),
  pathPreview: this.transformUrl(row.pathPreview),
  pathImage: this.transformUrl(row.pathImage),
}));
```

Change to:
```typescript
const transformedRows = rows.map((row) => ({
  ...row,
  title: row.title || getImageFallbackTitle(row.filePath),
  fileSize: row.fileSize != null ? Number(row.fileSize) : null,
  pathThumbnail: this.transformUrl(row.pathThumbnail),
  pathPreview: this.transformUrl(row.pathPreview),
  pathImage: this.transformUrl(row.pathImage),
}));
```

**Step 3: Verify sort clause already uses COALESCE (no change needed)**

The sort clause at line 347 already has:
```typescript
title: `COALESCE(i.title, i.filePath) ${dir}`,
```

This is already correct for sorting purposes.

**Step 4: Commit**

```bash
git add server/services/ImageQueryBuilder.ts
git commit -m "feat: add title fallback to ImageQueryBuilder using filePath basename"
```

---

### Task 5: Update related query builders that return galleries

The gallery fallback function is also used in other query builders when they return nested galleries. Check these files:

**Files to check:**
- `server/services/GroupQueryBuilder.ts` (line 812)
- `server/services/StudioQueryBuilder.ts` (line 647)
- `server/services/PerformerQueryBuilder.ts` (line 1116)
- `server/services/TagQueryBuilder.ts` (line 849)

**Step 1: Update imports in each file**

In each file that imports from `galleryUtils.js`, change:
```typescript
import { getGalleryFallbackTitle } from "../utils/galleryUtils.js";
```
to:
```typescript
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
```

**Step 2: Commit**

```bash
git add server/services/GroupQueryBuilder.ts server/services/StudioQueryBuilder.ts server/services/PerformerQueryBuilder.ts server/services/TagQueryBuilder.ts
git commit -m "refactor: update gallery fallback imports to use titleUtils"
```

---

### Task 6: Verify and test

**Step 1: Run TypeScript compilation**

```bash
cd server && npm run build
```

Expected: No type errors.

**Step 2: Run linting**

```bash
cd server && npm run lint
```

Expected: No lint errors.

**Step 3: Run existing integration tests**

```bash
cd server && npm run test:integration
```

Expected: All tests pass.

**Step 4: Manual verification**

Start the server and verify:
1. Scenes with null titles show filename (without extension) in the UI
2. Galleries with null titles show folder/zip name (without extension) in the UI
3. Images with null titles show filename (without extension) in the UI
4. Sorting by title works correctly for entities without explicit titles

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```

---

## Notes

- The client-side fallback functions (`getSceneTitle`, `galleryTitle`, `getImageTitle`) remain as defensive fallbacks but should rarely be used now
- Extension stripping uses regex `/\.[^/.]+$/` which handles files with multiple dots correctly (e.g., `video.part1.mp4` → `video.part1`)
- SQL sorting uses COALESCE with the raw path for simplicity; the JS-side transformation does the proper basename extraction and extension stripping
