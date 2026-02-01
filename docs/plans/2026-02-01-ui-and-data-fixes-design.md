# UI/UX and Data/Backend Fixes Design

**Date:** 2026-02-01
**Status:** Draft

## Overview

Two branches addressing user-reported issues and improvements. Branch 1 focuses on UI/UX fixes, Branch 2 on data/backend issues.

---

## Branch 1: UI/UX Issues

### 1.1 Entity Select Dropdown Refactor

**Problem:**
- Wrong entity data appears when switching between filter dropdowns (performers showing in tags)
- Flicker on initial load (placeholder shows before names load)
- Cache keys don't account for `countFilterContext`

**Root Cause:** `SearchableSelect.jsx` doesn't reset `options` state when `entityType` changes. Old data from previous entity type displays until a search triggers a fresh load.

**Fix:**

**SearchableSelect.jsx:**
- Add useEffect to clear `options` when `entityType` or `countFilterContext` changes
- Add `isLoadingInitial` state to show spinner instead of placeholder during load
- Update options-loading condition to account for loading state

**filterCache.js:**
- Update getCache/setCache to accept optional context parameter
- Build cache keys dynamically: `entityType` or `entityType_context`

**Files:**
- `client/src/components/ui/SearchableSelect.jsx`
- `client/src/utils/filterCache.js`

---

### 1.2 Carousel Card Height Consistency

**Problem:** Cards in carousels have inconsistent heights when metadata is missing.

**Root Cause:** Carousel uses flexbox with no height constraints. Grid views use CSS Grid which auto-aligns row heights.

**Fix:** Change carousel from flexbox to CSS Grid with horizontal flow.

```jsx
// Before
<div className="flex gap-4 overflow-x-auto ...">

// After
<div className="grid grid-flow-col auto-cols-[280px] gap-4 overflow-x-auto ...">
```

**Files:**
- `client/src/components/ui/SceneCarousel.jsx`

---

### 1.3 Per Page Free-Typing

**Problem:** Per Page control is a dropdown with fixed options. Users want to type custom values.

**Fix:**
- Replace `<select>` with editable number input
- Validation: min 1, max 500, positive integers only
- Submit on Enter or blur (debounced)
- Optional: preset quick-select buttons for common values

**Files:**
- `client/src/components/ui/Pagination.jsx`

---

### 1.4 Per Page Value in Presets

**Problem:** Filter presets don't save the perPage value.

**Fix:**
- Add `perPage` to preset object when saving
- Apply `perPage` when loading preset (call `onPerPageChange`)
- Backward compatible: old presets without perPage continue to work

**Files:**
- `client/src/components/ui/FilterPresets.jsx`

---

## Branch 2: Data/Backend Issues

### 2.1 Content Restriction Option Missing

**Problem:** Content Restrictions button was removed when UserEditModal replaced inline buttons.

**Fix:** Add Content Restrictions section to UserEditModal.

```jsx
// Add to UserEditModal.jsx
import ContentRestrictionsModal from "./ContentRestrictionsModal.jsx";

// Add state
const [showContentRestrictionsModal, setShowContentRestrictionsModal] = useState(false);

// Add Section 5: Content Restrictions (after Account Actions)
// - Brief description
// - Button to open modal
// - Render modal when open
```

**Files:**
- `client/src/components/settings/UserEditModal.jsx`

---

### 2.2 Clips Count Mismatch (Investigation)

**Problem:** User sees 847 clips but server shows 9489 synced.

**Analysis:**
- Default filter `isGenerated=true` hides ungenerated clips
- feederbox's markergen plugin triggers async preview generation
- Incremental sync doesn't re-probe clips (Stash doesn't update `updated_at` on preview generation)

**Actions:**
1. Verify with user: Are previews actually generated in Stash?
2. Verify placeholder hash is still accurate for current Stash versions
3. Consider adding "Re-probe ungenerated clips" option

**Files (potential):**
- `server/services/ClipPreviewProber.ts` - verify/update placeholder hash
- `server/services/StashSyncService.ts` - add re-probe option

---

### 2.3 Stats Page Ordering

**Problem:** Top lists display o-count and play count but order by percentileRank (composite engagement score). Users see items ordered "incorrectly" relative to displayed values.

**Fix:**
1. Display the engagement/percentile score so users understand the ranking
2. Add sort toggle: Engagement / O-Count / Play Count

**Files:**
- `client/src/components/pages/UserStats/components/TopList.jsx` - display score, add toggle
- `server/services/UserStatsAggregationService.ts` - support sort parameter

---

### 2.4 Playlist Items on Scene Merges

**Problem:** MergeReconciliationService handles WatchHistory and SceneRating but not PlaylistItem. Playlist items become orphaned when source scene is deleted.

**Fix:** Add PlaylistItem handling to `transferUserData()`:

```typescript
// Find playlist items pointing to source scene
const playlistItems = await prisma.playlistItem.findMany({
  where: { sceneId: sourceSceneId }
});

for (const item of playlistItems) {
  // Check if target already in playlist
  const existing = await prisma.playlistItem.findFirst({
    where: { playlistId: item.playlistId, sceneId: targetSceneId }
  });

  if (existing) {
    // Delete orphaned item (target already present)
    await prisma.playlistItem.delete({ where: { id: item.id } });
  } else {
    // Update to point to target
    await prisma.playlistItem.update({
      where: { id: item.id },
      data: { sceneId: targetSceneId, instanceId: targetInstanceId }
    });
  }
}
```

**Files:**
- `server/services/MergeReconciliationService.ts`

---

### 2.5 Video Tag Images

**Problem:** feederbox's tag-import plugin stores video files (.mp4, .webm) as tag images. Peek renders with `<img>` which can't play videos.

**Fix:** Create MediaImage component that detects video content and renders appropriately.

```jsx
// MediaImage.jsx
const MediaImage = ({ src, alt, className, ...props }) => {
  const [isVideo, setIsVideo] = useState(false);
  const [error, setError] = useState(false);

  const handleError = async () => {
    // Check Content-Type via HEAD request
    try {
      const res = await fetch(src, { method: 'HEAD' });
      const contentType = res.headers.get('Content-Type');
      if (contentType?.startsWith('video/')) {
        setIsVideo(true);
        return;
      }
    } catch {}
    setError(true);
  };

  if (isVideo) {
    return <video src={src} autoPlay loop muted className={className} {...props} />;
  }

  if (error) {
    return <FallbackPlaceholder />;
  }

  return <img src={src} alt={alt} className={className} onError={handleError} {...props} />;
};
```

**Files:**
- Create: `client/src/components/ui/MediaImage.jsx`
- Update: Tag card components to use MediaImage

---

## Implementation Order

**Branch 1 (UI/UX):**
1. Dropdown refactor (most impactful bug fix)
2. Carousel heights
3. Per Page free-typing
4. Per Page in presets

**Branch 2 (Data/Backend):**
1. Content Restriction option (quick fix)
2. Playlist items on merge
3. Stats page ordering
4. Video tag images
5. Clips count (investigation, may defer)
