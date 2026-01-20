# Filtered Timeline & Folder Views Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make timeline and folder views respect permanent filters on detail pages, showing only relevant date distributions and tags for the filtered context.

**Architecture:** Extend backend endpoints to accept filter parameters, then pass permanent filters from SceneSearch down to TimelineView and FolderView components which forward them to their data-fetching hooks.

**Tech Stack:** TypeScript (server), React/JavaScript (client), Prisma raw SQL queries, Express REST API

---

## Task 1: Extend TimelineService to Accept Filters

**Files:**
- Modify: `server/services/TimelineService.ts`

**Step 1: Add filter types**

Add new interface for timeline filters after the existing interfaces (around line 14):

```typescript
export interface TimelineFilters {
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
}
```

**Step 2: Update buildDistributionQuery signature**

Change `buildDistributionQuery` method signature (line 38) to accept filters:

```typescript
buildDistributionQuery(
  entityType: TimelineEntityType,
  userId: number,
  granularity: Granularity,
  filters?: TimelineFilters
): QueryClause {
```

**Step 3: Add join clauses for scene filters**

Inside `buildDistributionQuery`, add logic to build JOIN clauses based on filters. After getting `config` and `format` (around line 44), add:

```typescript
const joins: string[] = [];
const whereConditions: string[] = [];
let paramIndex = 2; // userId is param 1

if (entityType === "scene") {
  if (filters?.performerId) {
    joins.push(`INNER JOIN ScenePerformer sp ON sp.sceneId = ${config.alias}.id`);
    whereConditions.push(`sp.performerId = ?`);
  }
  if (filters?.tagId) {
    joins.push(`INNER JOIN SceneTag st ON st.sceneId = ${config.alias}.id`);
    whereConditions.push(`st.tagId = ?`);
  }
  if (filters?.studioId) {
    whereConditions.push(`${config.alias}.studioId = ?`);
  }
  if (filters?.groupId) {
    joins.push(`INNER JOIN SceneGroup sg ON sg.sceneId = ${config.alias}.id`);
    whereConditions.push(`sg.groupId = ?`);
  }
} else if (entityType === "gallery") {
  if (filters?.performerId) {
    joins.push(`INNER JOIN GalleryPerformer gp ON gp.galleryId = ${config.alias}.id`);
    whereConditions.push(`gp.performerId = ?`);
  }
  if (filters?.tagId) {
    joins.push(`INNER JOIN GalleryTag gt ON gt.galleryId = ${config.alias}.id`);
    whereConditions.push(`gt.tagId = ?`);
  }
  if (filters?.studioId) {
    whereConditions.push(`${config.alias}.studioId = ?`);
  }
} else if (entityType === "image") {
  if (filters?.performerId) {
    joins.push(`INNER JOIN ImagePerformer ip ON ip.imageId = ${config.alias}.id`);
    whereConditions.push(`ip.performerId = ?`);
  }
  if (filters?.tagId) {
    joins.push(`INNER JOIN ImageTag it ON it.imageId = ${config.alias}.id`);
    whereConditions.push(`it.tagId = ?`);
  }
  if (filters?.studioId) {
    whereConditions.push(`${config.alias}.studioId = ?`);
  }
}

const joinClause = joins.length > 0 ? joins.join("\n      ") : "";
const extraWhere = whereConditions.length > 0 ? `AND ${whereConditions.join(" AND ")}` : "";
```

**Step 4: Update SQL query to use joins and extra conditions**

Replace the SQL template (lines 48-62) with:

```typescript
const sql = `
  SELECT
    strftime('${format}', ${config.dateField}) as period,
    COUNT(DISTINCT ${config.alias}.id) as count
  FROM ${config.table} ${config.alias}
  ${joinClause}
  LEFT JOIN UserExcludedEntity e
    ON e.userId = ? AND e.entityType = '${entityType}' AND e.entityId = ${config.alias}.id
  WHERE ${config.alias}.deletedAt IS NULL
    AND e.id IS NULL
    AND ${config.dateField} IS NOT NULL
    AND ${config.dateField} LIKE '____-__-__'
    ${extraWhere}
  GROUP BY period
  HAVING period IS NOT NULL AND period NOT LIKE '-%'
  ORDER BY period ASC
`.trim();
```

**Step 5: Build params array with filter values**

Replace the return statement (line 64) with:

```typescript
const params: (string | number)[] = [userId];
if (filters?.performerId) params.push(filters.performerId);
if (filters?.tagId) params.push(filters.tagId);
if (filters?.studioId) params.push(filters.studioId);
if (filters?.groupId) params.push(filters.groupId);

return { sql, params };
```

**Step 6: Update getDistribution to pass filters**

Update `getDistribution` method signature (line 67) and call:

```typescript
async getDistribution(
  entityType: TimelineEntityType,
  userId: number,
  granularity: Granularity,
  filters?: TimelineFilters
): Promise<DistributionItem[]> {
  const { sql, params } = this.buildDistributionQuery(entityType, userId, granularity, filters);
  // ... rest unchanged
}
```

**Step 7: Verify no TypeScript errors**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add server/services/TimelineService.ts
git commit -m "feat(timeline): add filter support to TimelineService"
```

---

## Task 2: Update Timeline Controller to Parse Filter Params

**Files:**
- Modify: `server/controllers/timelineController.ts`

**Step 1: Import TimelineFilters type**

Update import (line 4) to include the new type:

```typescript
import { timelineService, type Granularity, type TimelineEntityType, type TimelineFilters } from "../services/TimelineService.js";
```

**Step 2: Parse filter query params**

In `getDateDistribution`, after extracting `granularity` (line 15), add:

```typescript
// Parse optional filter params
const filters: TimelineFilters = {};
if (req.query.performerId) filters.performerId = req.query.performerId as string;
if (req.query.tagId) filters.tagId = req.query.tagId as string;
if (req.query.studioId) filters.studioId = req.query.studioId as string;
if (req.query.groupId) filters.groupId = req.query.groupId as string;
```

**Step 3: Pass filters to service**

Update the service call (lines 29-33) to include filters:

```typescript
const distribution = await timelineService.getDistribution(
  entityType as TimelineEntityType,
  userId,
  granularity as Granularity,
  Object.keys(filters).length > 0 ? filters : undefined
);
```

**Step 4: Verify no TypeScript errors**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/controllers/timelineController.ts
git commit -m "feat(timeline): parse filter query params in controller"
```

---

## Task 3: Add Tags Endpoint for Filtered Tag Fetching

**Files:**
- Modify: `server/controllers/library/tags.ts`
- Modify: `server/routes/library/tags.ts`

**Step 1: Add new endpoint function in tags controller**

Add after `findTagsMinimal` function (around line 572):

```typescript
/**
 * Get tags that exist on scenes matching the given filters.
 * Used by folder view to show only relevant tags.
 */
export const findTagsForScenes = async (
  req: TypedAuthRequest<{ performerId?: string; tagId?: string; studioId?: string; groupId?: string }>,
  res: TypedResponse<{ tags: Array<{ id: string; name: string; parent_ids?: string[] }> } | ApiErrorResponse>
) => {
  try {
    const { performerId, tagId, studioId, groupId } = req.body;
    const userId = req.user?.id;
    const requestingUser = req.user;

    // Build query to find distinct tag IDs from matching scenes
    let sceneTagQuery = `
      SELECT DISTINCT st.tagId
      FROM SceneTag st
      INNER JOIN StashScene s ON s.id = st.sceneId
      LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id
      WHERE s.deletedAt IS NULL AND e.id IS NULL
    `;
    const params: (string | number)[] = [userId!];

    if (performerId) {
      sceneTagQuery += ` AND EXISTS (SELECT 1 FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.performerId = ?)`;
      params.push(performerId);
    }
    if (tagId) {
      sceneTagQuery += ` AND EXISTS (SELECT 1 FROM SceneTag st2 WHERE st2.sceneId = s.id AND st2.tagId = ?)`;
      params.push(tagId);
    }
    if (studioId) {
      sceneTagQuery += ` AND s.studioId = ?`;
      params.push(studioId);
    }
    if (groupId) {
      sceneTagQuery += ` AND EXISTS (SELECT 1 FROM SceneGroup sg WHERE sg.sceneId = s.id AND sg.groupId = ?)`;
      params.push(groupId);
    }

    const tagIdResults = await prisma.$queryRawUnsafe<Array<{ tagId: string }>>(sceneTagQuery, ...params);
    const tagIds = new Set(tagIdResults.map(r => r.tagId));

    if (tagIds.size === 0) {
      return res.json({ tags: [] });
    }

    // Get all tags to build hierarchy
    let allTags = await stashEntityService.getAllTags();

    // Apply exclusions for non-admins
    if (requestingUser?.role !== "ADMIN") {
      allTags = await entityExclusionHelper.filterExcluded(allTags, userId, "tag");
    }

    // Expand to include parent tags for hierarchy
    const expandedTagIds = new Set(tagIds);
    const tagMap = new Map(allTags.map(t => [t.id, t]));

    // Walk up parent chains
    for (const tagId of tagIds) {
      const tag = tagMap.get(tagId);
      if (tag?.parent_ids) {
        for (const parentId of tag.parent_ids) {
          expandedTagIds.add(parentId);
          // Also add grandparents, etc.
          let parent = tagMap.get(parentId);
          while (parent?.parent_ids) {
            for (const gpId of parent.parent_ids) {
              expandedTagIds.add(gpId);
            }
            // Get first parent to continue chain (tags can have multiple parents)
            parent = parent.parent_ids[0] ? tagMap.get(parent.parent_ids[0]) : undefined;
          }
        }
      }
    }

    // Filter to only expanded tags
    const filteredTags = allTags
      .filter(t => expandedTagIds.has(t.id))
      .map(t => ({ id: t.id, name: t.name, parent_ids: t.parent_ids }));

    res.json({ tags: filteredTags });
  } catch (error) {
    logger.error("Error in findTagsForScenes", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find tags for scenes",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
```

**Step 2: Add import for stashEntityService if not present**

Check imports at top of file - `stashEntityService` should already be imported.

**Step 3: Add route in tags.ts**

In `server/routes/library/tags.ts`, add import for the new function (line 4):

```typescript
import {
  findTags,
  findTagsMinimal,
  findTagsForScenes,
  updateTag,
} from "../../controllers/library/tags.js";
```

**Step 4: Add route definition**

After the `/tags/minimal` route (around line 19), add:

```typescript
// Tags filtered by scene criteria (for folder view)
router.post("/tags/for-scenes", requireCacheReady, authenticated(findTagsForScenes));
```

**Step 5: Verify no TypeScript errors**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/controllers/library/tags.ts server/routes/library/tags.ts
git commit -m "feat(tags): add endpoint for filtered tag fetching"
```

---

## Task 4: Update useTimelineState Hook to Accept and Use Filters

**Files:**
- Modify: `client/src/components/timeline/useTimelineState.js`

**Step 1: Add filters to hook parameters**

Update the hook function signature (line 71) to accept filters:

```javascript
export function useTimelineState({ entityType, autoSelectRecent = false, initialPeriod = null, filters = null }) {
```

**Step 2: Build query string with filters**

Update the `fetchDistribution` function inside the useEffect (around line 117) to include filter params:

```javascript
async function fetchDistribution() {
  setIsLoading(true);
  setError(null);

  try {
    // Build query params
    const params = new URLSearchParams({ granularity: zoomLevel });
    if (filters?.performerId) params.set("performerId", filters.performerId);
    if (filters?.tagId) params.set("tagId", filters.tagId);
    if (filters?.studioId) params.set("studioId", filters.studioId);
    if (filters?.groupId) params.set("groupId", filters.groupId);

    const response = await apiGet(
      `/timeline/${entityType}/distribution?${params.toString()}`
    );
    // ... rest unchanged
```

**Step 3: Add filters to useEffect dependencies**

Update the dependency array (line 153) to include filters:

```javascript
}, [entityType, zoomLevel, autoSelectRecent, filters]);
```

**Step 4: Memoize filters to prevent unnecessary refetches**

Add a memoized filter key at the top of the hook (after the state declarations, around line 94):

```javascript
// Memoize filter key to prevent unnecessary refetches
const filterKey = useMemo(() => {
  if (!filters) return null;
  return JSON.stringify(filters);
}, [filters]);
```

Then use `filterKey` in the dependency array instead of `filters`:

```javascript
}, [entityType, zoomLevel, autoSelectRecent, filterKey]);
```

**Step 5: Commit**

```bash
git add client/src/components/timeline/useTimelineState.js
git commit -m "feat(timeline): add filter support to useTimelineState hook"
```

---

## Task 5: Update useFolderViewTags Hook to Accept and Use Filters

**Files:**
- Modify: `client/src/hooks/useFolderViewTags.js`

**Step 1: Update hook signature to accept filters**

Change the function signature (line 9) to accept filters:

```javascript
export function useFolderViewTags(isActive, filters = null) {
```

**Step 2: Import libraryApi POST method**

Update the import to also include a method for POST requests. Check if `libraryApi` already has a suitable method. Looking at the code, it uses `libraryApi.findTags` which is POST-based. We need to add a new method or use fetch directly.

Add at the top of the file, after existing imports:

```javascript
import { apiPost } from "../services/api.js";
```

**Step 3: Update fetchTags to use filtered endpoint when filters present**

Replace the `fetchTags` function (lines 18-33) with:

```javascript
const fetchTags = async () => {
  setIsLoading(true);
  setError(null);

  try {
    let fetchedTags;

    // Use filtered endpoint if filters are provided
    if (filters && (filters.performerId || filters.tagId || filters.studioId || filters.groupId)) {
      const result = await apiPost("/library/tags/for-scenes", {
        performerId: filters.performerId,
        tagId: filters.tagId,
        studioId: filters.studioId,
        groupId: filters.groupId,
      });
      fetchedTags = result?.tags || [];
    } else {
      // Fetch all tags (existing behavior)
      const result = await libraryApi.findTags({
        filter: {
          per_page: -1,
          sort: "name",
          direction: "ASC",
        },
      });
      fetchedTags = result?.findTags?.tags || [];
    }

    setTags(fetchedTags);
    fetchedRef.current = true;
  } catch (err) {
    console.error("Failed to fetch tags for folder view:", err);
    setError(err);
  } finally {
    setIsLoading(false);
  }
};
```

**Step 4: Reset fetchedRef when filters change**

We need to refetch when filters change. Update the useEffect to:

```javascript
useEffect(() => {
  // Reset fetched flag if filters change
  if (filters) {
    fetchedRef.current = false;
  }

  if (!isActive || fetchedRef.current) return;

  const fetchTags = async () => {
    // ... fetchTags implementation from Step 3
  };

  fetchTags();
}, [isActive, filters]);
```

**Step 5: Use a stable filter key for comparison**

To properly detect filter changes, add memoization:

```javascript
// Add at top of hook
const filterKey = useMemo(() => {
  if (!filters) return null;
  return JSON.stringify(filters);
}, [filters]);

// Add a ref to track last filter key
const lastFilterKeyRef = useRef(null);
```

Then update the useEffect:

```javascript
useEffect(() => {
  // Reset fetched flag if filters change
  if (filterKey !== lastFilterKeyRef.current) {
    fetchedRef.current = false;
    lastFilterKeyRef.current = filterKey;
  }

  if (!isActive || fetchedRef.current) return;
  // ... rest of fetchTags
}, [isActive, filterKey]);
```

**Step 6: Commit**

```bash
git add client/src/hooks/useFolderViewTags.js
git commit -m "feat(folder): add filter support to useFolderViewTags hook"
```

---

## Task 6: Update TimelineView to Accept and Pass Filters

**Files:**
- Modify: `client/src/components/timeline/TimelineView.jsx`

**Step 1: Add filters prop**

Update the component props (line 11) to include filters:

```javascript
function TimelineView({
  entityType,
  items = [],
  renderItem,
  onItemClick,
  onDateFilterChange,
  onPeriodChange,
  initialPeriod = null,
  loading = false,
  emptyMessage = "No items found",
  gridDensity = "medium",
  className = "",
  filters = null, // New prop for permanent filters
}) {
```

**Step 2: Pass filters to useTimelineState**

Update the hook call (line 24-33) to pass filters:

```javascript
const {
  zoomLevel,
  setZoomLevel,
  selectedPeriod,
  selectPeriod,
  distribution,
  maxCount,
  isLoading: distributionLoading,
  ZOOM_LEVELS,
} = useTimelineState({ entityType, autoSelectRecent: !initialPeriod, initialPeriod, filters });
```

**Step 3: Commit**

```bash
git add client/src/components/timeline/TimelineView.jsx
git commit -m "feat(timeline): pass filters prop to useTimelineState"
```

---

## Task 7: Update FolderView to Accept and Pass Filters

**Files:**
- Modify: `client/src/components/folder/FolderView.jsx`

**Step 1: Add filters prop**

Update the component props (line 15) to include filters:

```javascript
const FolderView = ({
  items,
  tags,
  renderItem,
  gridDensity = "medium",
  loading = false,
  emptyMessage = "No items found",
  onFolderPathChange,
  filters = null, // New prop for permanent filters
}) => {
```

Note: FolderView receives tags as a prop from SceneSearch, so we don't need to change FolderView itself to fetch tags. The filtering happens in useFolderViewTags which is called in SceneSearch.

**Step 2: Commit**

```bash
git add client/src/components/folder/FolderView.jsx
git commit -m "feat(folder): add filters prop to FolderView"
```

---

## Task 8: Update SceneSearch to Pass Filters to Timeline and Folder Views

**Files:**
- Modify: `client/src/components/scene-search/SceneSearch.jsx`

**Step 1: Extract filter values from permanentFilters**

Add a helper to extract filter IDs from permanentFilters. After the `contextSettings` useMemo (around line 123), add:

```javascript
// Extract filter IDs for timeline/folder views
const viewFilters = useMemo(() => {
  const filters = {};

  // Extract performer ID
  if (permanentFilters.performers?.value?.length > 0) {
    filters.performerId = String(permanentFilters.performers.value[0]);
  }

  // Extract tag ID
  if (permanentFilters.tags?.value?.length > 0) {
    filters.tagId = String(permanentFilters.tags.value[0]);
  }

  // Extract studio ID
  if (permanentFilters.studios?.value?.length > 0) {
    filters.studioId = String(permanentFilters.studios.value[0]);
  }

  // Extract group ID
  if (permanentFilters.groups?.value?.length > 0) {
    filters.groupId = String(permanentFilters.groups.value[0]);
  }

  return Object.keys(filters).length > 0 ? filters : null;
}, [permanentFilters]);
```

**Step 2: Pass filters to useFolderViewTags**

Update the useFolderViewTags call (lines 89-91) to pass filters:

```javascript
const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
  currentViewMode === "folder",
  viewFilters
);
```

**Step 3: Pass filters to TimelineView**

Update the TimelineView component (lines 274-294) to include the filters prop:

```javascript
<TimelineView
  entityType="scene"
  items={currentScenes}
  renderItem={(scene) => (
    <SceneCard
      key={scene.id}
      scene={scene}
      onHideSuccess={handleHideSuccess}
      fromPageTitle={fromPageTitle}
      tabIndex={0}
    />
  )}
  onItemClick={handleSceneClick}
  onDateFilterChange={setTimelineDateFilter}
  onPeriodChange={setTimelinePeriod}
  initialPeriod={timelinePeriod}
  loading={isLoading}
  emptyMessage="No scenes found for this time period"
  gridDensity={gridDensity}
  filters={viewFilters}
/>
```

**Step 4: Pass filters to FolderView**

Update the FolderView component (lines 295-312) to include the filters prop:

```javascript
<FolderView
  items={currentScenes}
  tags={folderTags}
  gridDensity={gridDensity}
  loading={isLoading || tagsLoading}
  emptyMessage="No scenes found"
  onFolderPathChange={setFolderTagFilter}
  filters={viewFilters}
  renderItem={(scene) => (
    <SceneCard
      key={scene.id}
      scene={scene}
      onHideSuccess={handleHideSuccess}
      fromPageTitle={fromPageTitle}
      tabIndex={0}
    />
  )}
/>
```

**Step 5: Verify no lint errors**

Run: `cd client && npm run lint`
Expected: No errors (or only unrelated warnings)

**Step 6: Commit**

```bash
git add client/src/components/scene-search/SceneSearch.jsx
git commit -m "feat(search): pass permanent filters to timeline and folder views"
```

---

## Task 9: Manual Testing

**Step 1: Start development environment**

Run: `docker-compose up --build -d`

**Step 2: Test timeline on performer detail page**

1. Navigate to a performer detail page (e.g., `/performer/123`)
2. Click the Scenes tab
3. Switch to Timeline view
4. Verify the timeline shows only dates where that performer has scenes
5. Click a date - should show scenes for that performer on that date

**Step 3: Test folder on performer detail page**

1. On the same performer detail page
2. Switch to Folder view
3. Verify only tags that appear on that performer's scenes are shown
4. Navigate into a folder - scenes should be filtered by both performer AND tag

**Step 4: Test timeline on tag detail page**

1. Navigate to a tag detail page (e.g., `/tag/456`)
2. Click the Scenes tab
3. Switch to Timeline view
4. Verify the timeline shows only dates where scenes with that tag exist

**Step 5: Test folder on tag detail page**

1. On the same tag detail page
2. Switch to Folder view
3. Verify only relevant tags are shown in the tree

**Step 6: Test on main scenes page (no filters)**

1. Navigate to `/scenes`
2. Switch to Timeline view - should show all dates (global)
3. Switch to Folder view - should show all tags (global)

**Step 7: Commit any fixes if needed**

---

## Task 10: Final Verification and Cleanup

**Step 1: Run linting**

Run: `cd client && npm run lint && cd ../server && npm run lint`
Expected: No errors

**Step 2: Run TypeScript checks**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit final changes**

```bash
git add -A
git commit -m "chore: fix any lint/type errors from timeline/folder filter implementation"
```

**Step 4: Push branch**

```bash
git push -u origin fix/filtered-timeline-folder-views
```
