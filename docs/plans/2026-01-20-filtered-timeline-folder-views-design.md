# Filtered Timeline & Folder Views Design

**Date:** 2026-01-20
**Branch:** `fix/filtered-timeline-folder-views`

## Problem

When timeline or folder views appear on detail pages (e.g., PerformerDetail > Scenes tab), the permanent filters (like `performers: [id]`) correctly filter the *results*, but the timeline distribution and folder tag tree are fetched globally. This causes:

- **Timeline**: Shows date counts for ALL scenes, so clicking most dates shows "no scenes found"
- **Folder**: Shows ALL tags in the library, most of which are empty for that performer

## Solution

Pass the permanent filters to the backend endpoints so they return context-aware distributions and tag trees:

1. **Timeline**: `/api/timeline/:entityType/distribution` accepts optional filter params, joins through junction tables to count only matching entities
2. **Folder/Tags**: `/api/tags` accepts optional filter params, returns only tags that exist on matching scenes (plus their parent hierarchy)

## Backend Changes

### 1. Timeline Service (`server/services/TimelineService.ts`)

**Current behavior:** Queries `StashScene` (or gallery/image) directly, groups by date, returns counts.

**New behavior:** Accept optional filters object. When filters are present:

- Join through junction tables (`ScenePerformer`, `SceneTag`, `SceneGroup`, `GalleryPerformer`, `ImagePerformer`, etc.)
- Apply WHERE clauses based on filter type:
  - `performers: [id]` → JOIN `ScenePerformer` WHERE `performerId IN (...)`
  - `tags: [id]` → JOIN `SceneTag` WHERE `tagId IN (...)`
  - `studios: [id]` → WHERE `studioId IN (...)`
  - `groups: [id]` → JOIN `SceneGroup` WHERE `groupId IN (...)`
- Continue to respect user exclusions and date validity checks
- Return the same `{ period, count }[]` format

### 2. Tags Endpoint (`server/controllers/tags.ts` or similar)

**Current behavior:** Returns all tags from `StashTag`.

**New behavior:** Accept optional `sceneFilter` query param. When present:

- Find all scene IDs matching the filter (using same junction table logic)
- Get distinct tag IDs from `SceneTag` for those scenes
- Expand to include parent tags (walk `parentIds` field) to preserve hierarchy
- Return only those tags

## Frontend Changes

### 1. Timeline Distribution Fetching (`client/src/components/timeline/useTimelineState.js`)

**Current behavior:** Fetches `/api/timeline/${entityType}/distribution?granularity=${zoomLevel}`

**New behavior:**
- Accept a `filters` prop containing the permanent filters
- Serialize relevant filter fields into query params
- Fetch `/api/timeline/${entityType}/distribution?granularity=${zoomLevel}&performerId=123` (or similar)

### 2. Folder Tag Fetching (`client/src/hooks/useFolderViewTags.js`)

**Current behavior:** Fetches all tags with `per_page: -1`

**New behavior:**
- Accept a `filters` prop containing the permanent filters
- Pass filter params to the tags API
- Fetch only tags relevant to the filtered context

### 3. SceneSearch & Detail Pages

**Current behavior:** `SceneSearch` passes `permanentFilters` to filter results, but timeline/folder components don't receive them.

**New behavior:**
- `SceneSearch` passes `permanentFilters` down to `TimelineView` and `FolderView`
- These components pass filters to their respective data-fetching hooks
- No changes needed to detail pages themselves - they already pass `permanentFilters` to `SceneSearch`

## API Parameter Format

For simplicity, use flat query params rather than serializing the full filter object:

**Timeline endpoint:**
```
GET /api/timeline/scene/distribution?granularity=months&performerId=123
GET /api/timeline/scene/distribution?granularity=months&tagId=456
GET /api/timeline/scene/distribution?granularity=months&studioId=789
GET /api/timeline/scene/distribution?granularity=months&groupId=101
```

**Tags endpoint:**
```
GET /api/tags?scenePerformerId=123
GET /api/tags?sceneTagId=456
GET /api/tags?sceneStudioId=789
```

Multiple filters can be combined (AND logic):
```
GET /api/timeline/scene/distribution?granularity=months&performerId=123&studioId=789
```

## Files to Modify

| File | Changes |
|------|---------|
| `server/services/TimelineService.ts` | Add filter params, join through junction tables |
| `server/controllers/timelineController.ts` | Parse filter query params, pass to service |
| `server/controllers/tags.ts` | Add scene filter params, filter returned tags |
| `client/src/components/timeline/useTimelineState.js` | Accept filters prop, include in API call |
| `client/src/hooks/useFolderViewTags.js` | Accept filters prop, include in API call |
| `client/src/components/timeline/TimelineView.jsx` | Pass filters to hook |
| `client/src/components/folder/FolderView.jsx` | Pass filters to hook |
| `client/src/components/search/SceneSearch.jsx` | Pass permanentFilters to timeline/folder views |

## Scope

- Applies to all entity types: scenes, galleries, images
- Works on both detail pages (with permanent filters) and main search pages (no permanent filters = global view)
