# Issue #221: Density and Styling Fixes Design

**Date:** 2026-01-17
**Branch:** `fix/221-density-and-styling-bugs`
**GitHub Issue:** https://github.com/carrotwaxr/peek-stash-browser/issues/221

## Overview

This design addresses feedback from user @honeypotfields in issue #221 regarding card density, styling bugs, and new customization settings.

## Scope

| # | Issue | Type | Priority |
|---|-------|------|----------|
| 1 | View Toggle Active Styling Bug | Bug | High |
| 2 | Table View Gallery Images Not Showing | Bug | High |
| 3 | Card Density - Fixed Heights Bug | Bug | High |
| 4 | New Setting: Hide Relationship Indicators | Feature | Medium |
| 5 | New Setting: Hide Date | Feature | Medium |
| 6 | New Setting: Hide Studio Name | Feature | Medium |
| 7 | Default View Mode (per-entity) | Feature | Medium |
| 8 | Fullscreen Exit Behavior | Bug | Medium |

**Deferred:**
- Table View mobile column overlay (separate issue - responsive table design)

---

## Issue 1: View Toggle Active Styling Bug

**Problem:** Rapidly tapping Grid/Wall/Hierarchy/Table buttons can cause multiple buttons to appear highlighted, or none at all.

**Root Cause:** `ViewModeToggle` component uses inline styles with `value === mode.id` comparison. React state updates asynchronously, causing race conditions when users click rapidly.

**Solution:** Add local optimistic state to provide immediate visual feedback:

```jsx
// ViewModeToggle.jsx
const [localValue, setLocalValue] = useState(value);

useEffect(() => {
  setLocalValue(value); // sync when parent state settles
}, [value]);

const handleClick = (modeId) => {
  setLocalValue(modeId);  // immediate visual feedback
  onChange(modeId);        // trigger parent update
};

// Use localValue for styling comparison
backgroundColor: localValue === mode.id ? "var(--accent-primary)" : "transparent"
```

**Files:** `client/src/components/ui/ViewModeToggle.jsx`

---

## Issue 2: Table View Gallery Images Not Showing

**Problem:** Gallery cover images don't appear in Table View at all.

**Root Cause:** In `cellRenderers.jsx`, the gallery cover renderer expects:
```javascript
src={gallery.cover?.paths?.thumbnail || gallery.image_path}
```

But the backend sends `gallery.cover` as a direct string URL, not an object with nested `paths.thumbnail`.

**Solution:** Change the gallery cover cell renderer:

```javascript
cover: (gallery) => (
  <ThumbnailCell
    src={gallery.cover}
    alt={gallery.title}
    linkTo={`/gallery/${gallery.id}`}
    entityType="gallery"
  />
),
```

**Files:** `client/src/components/table/cellRenderers.jsx`

---

## Issue 3: Card Density - Fixed Heights Bug

**Problem:** Hiding card elements (ratings, favorites, etc.) doesn't reduce card size because components use fixed heights.

**Root Causes:**
1. `CardContainer`: `minHeight: "20rem"` (320px) prevents shrinking
2. `CardTitle` subtitle: `height: "1.25rem"` always reserves space even when hidden
3. `CardIndicators`: Fixed `height: "3.5rem"` even when empty
4. `CardRatingRow`: Fixed `height: "2rem"` even when all buttons hidden

**Solution:**

1. **CardContainer:** Remove `minHeight`. Grid container with `align-items: stretch` will ensure cards in same row have equal height (tallest card sets row height).

2. **CardTitle:** Only reserve subtitle height when subtitle is actually rendered.

3. **CardIndicators:** Don't render the wrapper div at all when `indicators` array is empty (currently in BaseCard: `{indicators.length > 0 && <CardIndicators ... />}` - but CardIndicators itself adds fixed height div).

4. **CardRatingRow:** When only EntityMenu remains (all buttons hidden), reduce height from `2rem` to `auto` or smaller value (~1.5rem).

**Files:**
- `client/src/components/ui/CardComponents.jsx`
- `client/src/components/ui/BaseCard.jsx`

---

## Issues 4-6: New Per-Entity Settings

**New settings to add:**

| Setting | Applicable Entities | Description |
|---------|---------------------|-------------|
| `showRelationshipIndicators` | All | Toggle count indicators (performers, tags, scenes, etc.) |
| `showDate` | scene, gallery, image | Toggle date in subtitle |
| `showStudio` | scene, gallery, image | Toggle studio name in subtitle |

**Implementation:**

1. **CardDisplaySettingsContext.jsx** - Add new default settings per entity type
2. **CardDisplaySettings.jsx** - Add toggle UI for new settings
3. **Card components** - Pass settings to subtitle builders and BaseCard
4. **Subtitle builder functions** - Conditionally include studio/date

**Settings UI example (Scenes):**
```
Scene Cards
├── Default View Mode: [Grid ▼]
├── Show Description on Card
├── Show Description on Detail
├── Show Code on Card
├── Show Studio ← NEW
├── Show Date ← NEW
├── Show Relationship Indicators ← NEW
├── Show Rating
├── Show Favorite
└── Show O-Counter
```

**Files:**
- `client/src/contexts/CardDisplaySettingsContext.jsx`
- `client/src/components/settings/CardDisplaySettings.jsx`
- `client/src/components/cards/SceneCard.jsx` (and other card components)
- Subtitle builder utilities

---

## Issue 7: Default View Mode (Per-Entity)

**Problem:** Users must manually select preferred view mode each page visit.

**Solution:** Add `defaultViewMode` setting per entity type.

**Shared Config Structure:**

Create a DRY config that defines per-entity:
- Available view modes
- Default view mode
- Which settings apply to that entity

```javascript
// client/src/config/entityDisplayConfig.js
export const ENTITY_DISPLAY_CONFIG = {
  scene: {
    viewModes: ["grid", "wall", "table"],
    defaultViewMode: "grid",
    settings: {
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showCodeOnCard: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    }
  },
  gallery: {
    viewModes: ["grid", "wall", "table"],
    defaultViewMode: "grid",
    settings: {
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    }
  },
  image: {
    viewModes: ["grid", "wall"],
    defaultViewMode: "grid",
    settings: {
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    }
  },
  performer: {
    viewModes: ["grid", "wall", "table"],
    defaultViewMode: "grid",
    settings: {
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    }
  },
  studio: {
    viewModes: ["grid", "wall", "table"],
    defaultViewMode: "grid",
    settings: {
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    }
  },
  tag: {
    viewModes: ["grid", "table", "hierarchy"],
    defaultViewMode: "grid",
    settings: {
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
    }
  },
  group: {
    viewModes: ["grid", "wall", "table"],
    defaultViewMode: "grid",
    settings: {
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    }
  },
};
```

**Integration:**
- `CardDisplaySettingsContext.jsx` uses config for defaults
- `CardDisplaySettings.jsx` uses config to render appropriate toggles per entity
- Page components use config to determine available view modes and load default

**Files:**
- `client/src/config/entityDisplayConfig.js` (NEW)
- `client/src/contexts/CardDisplaySettingsContext.jsx`
- `client/src/components/settings/CardDisplaySettings.jsx`
- Page components (Scenes.jsx, Galleries.jsx, etc.)
- `client/src/hooks/useFilterState.js`

---

## Issue 8: Fullscreen Exit Behavior

**Problem:** Closing lightbox (X button, swipe down) doesn't exit browser fullscreen mode.

**Solution:** When handling close actions, exit fullscreen first:

```javascript
const handleClose = () => {
  // Exit browser fullscreen if active
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
  // Then close lightbox
  onClose();
};
```

Apply to all close triggers:
- X button click
- Swipe down gesture
- Escape key press

**Files:** Lightbox component (location TBD during implementation)

---

## File Impact Summary

| File | Changes |
|------|---------|
| `client/src/components/ui/ViewModeToggle.jsx` | Add local optimistic state |
| `client/src/components/table/cellRenderers.jsx` | Fix gallery cover renderer |
| `client/src/components/ui/CardComponents.jsx` | Remove fixed heights, conditional rendering |
| `client/src/components/ui/BaseCard.jsx` | Pass through new settings |
| `client/src/config/entityDisplayConfig.js` | NEW - shared entity config |
| `client/src/contexts/CardDisplaySettingsContext.jsx` | Add new settings, use shared config |
| `client/src/components/settings/CardDisplaySettings.jsx` | Add new toggles, use shared config |
| `client/src/components/cards/*.jsx` | Pass new settings to subtitle builders |
| `client/src/components/pages/*.jsx` | Load default view mode from settings |
| `client/src/hooks/useFilterState.js` | Accept default view mode parameter |
| Lightbox component | Exit fullscreen on close |

---

## Implementation Order

1. **Bug fixes first:**
   - View Toggle styling (isolated, quick fix)
   - Table View gallery images (one-line fix)
   - Fullscreen exit behavior (isolated fix)

2. **Card density fix:**
   - Requires testing to ensure grid layout still works properly

3. **New shared config:**
   - Create `entityDisplayConfig.js`
   - Foundation for features below

4. **New settings (can be done together):**
   - Add to context and settings UI
   - Wire up to card components

5. **Default view mode:**
   - Add to settings UI
   - Integrate with page components and useFilterState
