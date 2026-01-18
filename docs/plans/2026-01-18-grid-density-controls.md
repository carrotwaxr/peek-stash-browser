# Grid Density Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add S/M/L density controls to card grids and surface density defaults in the view mode settings.

**Architecture:** Extend the existing zoom level pattern (used by Wall view) to Grid view. Add `gridDensity` state to `useFilterState`, URL params, and grid components. Add default density settings to the card display settings UI that appear below the view mode dropdown when Grid or Wall is selected.

**Tech Stack:** React, Tailwind CSS responsive classes, existing ZoomSlider component.

---

## Task 1: Add Grid Density Constants

**Files:**
- Modify: `client/src/constants/grids.js`

**Step 1: Add density-aware grid class constants**

Replace the existing constants with a density-aware structure:

```javascript
/** BREAKPOINTS
  sm	(640px)
  md	(768px)
  lg	(1024px)
  xl	(1280px)
  2xl	(1536px)
  3xl (1920px)
  4xl (2560px)
  5xl (3840px)
*/

/** STANDARD GRID DENSITY LEVELS
  Density: small (more columns), medium (current), large (fewer columns)
*/
export const STANDARD_GRID_DENSITIES = {
  small: "card-grid-responsive grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 3xl:grid-cols-6 4xl:grid-cols-8 5xl:grid-cols-12",
  medium: "card-grid-responsive grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-5 4xl:grid-cols-6 5xl:grid-cols-10",
  large: "card-grid-responsive grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4 5xl:grid-cols-6",
};

/** SCENE GRID DENSITY LEVELS */
export const SCENE_GRID_DENSITIES = {
  small: "card-grid-responsive grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-7 5xl:grid-cols-10",
  medium: "card-grid-responsive grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5 5xl:grid-cols-8",
  large: "card-grid-responsive grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4 5xl:grid-cols-5",
};

// Keep legacy exports for backwards compatibility during migration
export const STANDARD_GRID_CONTAINER_CLASSNAMES = STANDARD_GRID_DENSITIES.medium;
export const SCENE_GRID_CONTAINER_CLASSNAMES = SCENE_GRID_DENSITIES.medium;

/** Helper to get grid classes for a density level */
export const getGridClasses = (gridType, density = "medium") => {
  const densities = gridType === "scene" ? SCENE_GRID_DENSITIES : STANDARD_GRID_DENSITIES;
  return densities[density] || densities.medium;
};
```

**Step 2: Verify file saves correctly**

Run: `cat client/src/constants/grids.js`
Expected: File contains new density constants and helper function.

**Step 3: Commit**

```bash
git add client/src/constants/grids.js
git commit -m "$(cat <<'EOF'
Add grid density constants (S/M/L column configurations)

Adds STANDARD_GRID_DENSITIES and SCENE_GRID_DENSITIES with small/medium/large
variants. Keeps legacy exports for backwards compatibility.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add Default Density Settings to Entity Config

**Files:**
- Modify: `client/src/config/entityDisplayConfig.js`

**Step 1: Add density settings to config**

Add `defaultGridDensity` and `defaultWallZoom` to each entity type's `defaultSettings` and `availableSettings`:

For each entity in `ENTITY_DISPLAY_CONFIG`:
- Add to `defaultSettings`: `defaultGridDensity: "medium"` and `defaultWallZoom: "medium"`
- Add to `availableSettings` array (after `defaultViewMode`): `"defaultGridDensity"`, `"defaultWallZoom"`

Add to `SETTING_LABELS`:
```javascript
defaultGridDensity: "Default grid density",
defaultWallZoom: "Default wall size",
```

**Step 2: Verify changes**

Run: `grep -n "defaultGridDensity" client/src/config/entityDisplayConfig.js`
Expected: Multiple matches showing the new settings in each entity type.

**Step 3: Commit**

```bash
git add client/src/config/entityDisplayConfig.js
git commit -m "$(cat <<'EOF'
Add defaultGridDensity and defaultWallZoom to entity display config

Per-entity-type default density settings for Grid and Wall views.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Update BaseGrid to Accept Density Prop

**Files:**
- Modify: `client/src/components/ui/BaseGrid.jsx`

**Step 1: Update BaseGrid component**

```javascript
import { getGridClasses, SCENE_GRID_CONTAINER_CLASSNAMES, STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
// ... existing imports

export const BaseGrid = ({
  items,
  renderItem,
  gridType = "standard",
  density = "medium",  // NEW PROP
  loading = false,
  // ... rest of props
}) => {
  // Replace static class lookup with density-aware helper
  const gridClasses = getGridClasses(gridType, density);

  // ... rest of component unchanged
};
```

**Step 2: Verify changes**

Run: `grep -n "density" client/src/components/ui/BaseGrid.jsx`
Expected: Shows density prop and usage.

**Step 3: Commit**

```bash
git add client/src/components/ui/BaseGrid.jsx
git commit -m "$(cat <<'EOF'
Add density prop to BaseGrid component

Accepts small/medium/large density, uses getGridClasses helper.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add gridDensity to useFilterState Hook

**Files:**
- Modify: `client/src/hooks/useFilterState.js`

**Step 1: Add gridDensity state and actions**

Add alongside existing `zoomLevel`:

1. Add state: `const [gridDensity, setGridDensityState] = useState("medium");`

2. Include in stateRef update: `stateRef.current = { filters, sort, pagination, searchText, viewMode, zoomLevel, gridDensity };`

3. Add to syncToUrlParams call object in each action

4. Add setGridDensity action (copy pattern from setZoomLevel):
```javascript
const setGridDensity = useCallback((density) => {
  setGridDensityState(density);
  syncToUrlParams({
    filters,
    sort,
    pagination,
    searchText,
    viewMode,
    zoomLevel,
    gridDensity: density,
  });
}, [filters, sort, pagination, searchText, viewMode, zoomLevel, syncToUrlParams]);
```

5. Add to return object: `gridDensity, setGridDensity`

6. Update initialize function to load gridDensity from URL/preset

7. Update loadPreset to handle gridDensity

**Step 2: Verify changes**

Run: `grep -n "gridDensity" client/src/hooks/useFilterState.js`
Expected: Multiple matches showing state, actions, and sync.

**Step 3: Commit**

```bash
git add client/src/hooks/useFilterState.js
git commit -m "$(cat <<'EOF'
Add gridDensity state to useFilterState hook

URL-synced grid density state with setGridDensity action.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update URL Params for gridDensity

**Files:**
- Modify: `client/src/utils/urlParams.js`

**Step 1: Add gridDensity to buildSearchParams**

In the function parameters, add `gridDensity`:
```javascript
export const buildSearchParams = ({
  searchText,
  sortField,
  sortDirection,
  currentPage,
  perPage,
  filters,
  filterOptions,
  viewMode,
  zoomLevel,
  gridDensity,  // NEW
}) => {
```

Add line to serialize:
```javascript
if (gridDensity && gridDensity !== "medium") params.set("grid_density", gridDensity);
```

**Step 2: Add gridDensity to parseSearchParams**

```javascript
export const parseSearchParams = (searchParams, filterOptions, defaults = {}) => {
  return {
    // ... existing fields
    gridDensity: searchParams.get("grid_density") || defaults.gridDensity || "medium",
    // ...
  };
};
```

**Step 3: Verify changes**

Run: `grep -n "gridDensity\|grid_density" client/src/utils/urlParams.js`
Expected: Shows both parameter name variants.

**Step 4: Commit**

```bash
git add client/src/utils/urlParams.js
git commit -m "$(cat <<'EOF'
Add gridDensity to URL params serialization

Syncs grid_density param to URL (omits if medium/default).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update SearchControls to Show Density Toggle for Grid

**Files:**
- Modify: `client/src/components/ui/SearchControls.jsx`

**Step 1: Add gridDensity to hook destructuring**

In the useFilterState destructure, add:
```javascript
gridDensity,
setGridDensity,
```

**Step 2: Add ZoomSlider for grid view**

After the existing wall zoom slider block (around line 807-815), add:

```javascript
{/* Grid Density Slider - Only shown in grid mode */}
{viewMode === "grid" && (
  <div
    data-tv-search-item="grid-density"
    ref={(el) => searchZoneNav.setItemRef(6, el)}
    className={searchZoneNav.isFocused(6) ? "keyboard-focus" : ""}
  >
    <ZoomSlider value={gridDensity} onChange={setGridDensity} />
  </div>
)}
```

**Step 3: Update children render prop**

Update the render prop call to include gridDensity:
```javascript
{typeof children === "function"
  ? children({ viewMode, zoomLevel, gridDensity, wallPlayback, sortField, sortDirection, onSort: handleSortChange })
  : children}
```

**Step 4: Verify changes**

Run: `grep -n "gridDensity" client/src/components/ui/SearchControls.jsx`
Expected: Shows destructuring, ZoomSlider usage, and render prop.

**Step 5: Commit**

```bash
git add client/src/components/ui/SearchControls.jsx
git commit -m "$(cat <<'EOF'
Show density toggle in SearchControls when grid view active

Renders ZoomSlider for grid density, passes to children render prop.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update ContextSettings to Show Default Density Below View Mode

**Files:**
- Modify: `client/src/components/ui/ContextSettings.jsx`

**Step 1: Import ZoomSlider and density config**

```javascript
import ZoomSlider from "./ZoomSlider.jsx";
import { getViewModes } from "../../config/entityDisplayConfig.js";
```

**Step 2: Add density control below view mode dropdown**

After the defaultViewMode select (around line 262-263), add:

```javascript
{/* Default Density - shown for Grid or Wall view modes */}
{(cardSettings?.defaultViewMode === "grid" || cardSettings?.defaultViewMode === "wall") && (
  <div className="mt-2">
    <label
      className="block text-xs font-medium mb-1"
      style={{ color: "var(--text-secondary)" }}
    >
      {cardSettings?.defaultViewMode === "grid" ? "Default Grid Density" : "Default Wall Size"}
    </label>
    <ZoomSlider
      value={
        cardSettings?.defaultViewMode === "grid"
          ? (cardSettings?.defaultGridDensity || "medium")
          : (cardSettings?.defaultWallZoom || "medium")
      }
      onChange={(density) =>
        handleCardSettingChange(
          cardSettings?.defaultViewMode === "grid" ? "defaultGridDensity" : "defaultWallZoom",
          density
        )
      }
    />
  </div>
)}
```

**Step 3: Verify changes**

Run: `grep -n "defaultGridDensity\|defaultWallZoom" client/src/components/ui/ContextSettings.jsx`
Expected: Shows the conditional density control.

**Step 4: Commit**

```bash
git add client/src/components/ui/ContextSettings.jsx
git commit -m "$(cat <<'EOF'
Show default density control below view mode in ContextSettings

Renders ZoomSlider when Grid or Wall is the default view mode.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update CardDisplaySettings for Default Density

**Files:**
- Modify: `client/src/components/settings/CardDisplaySettings.jsx`

**Step 1: Import ZoomSlider**

```javascript
import ZoomSlider from "../ui/ZoomSlider.jsx";
```

**Step 2: Add density control in EntitySettingsSection**

After the Dropdown for defaultViewMode (around line 91), add:

```javascript
{/* Default Density - shown for Grid or Wall view modes */}
{(settings.defaultViewMode === "grid" || settings.defaultViewMode === "wall") && (
  <div className="mt-2">
    <label className="flex flex-col gap-1">
      <span style={{ color: "var(--text-primary)" }}>
        {settings.defaultViewMode === "grid" ? "Default Grid Density" : "Default Wall Size"}
      </span>
      <ZoomSlider
        value={
          settings.defaultViewMode === "grid"
            ? (settings.defaultGridDensity || "medium")
            : (settings.defaultWallZoom || "medium")
        }
        onChange={(density) =>
          handleChange(
            settings.defaultViewMode === "grid" ? "defaultGridDensity" : "defaultWallZoom",
            density
          )
        }
      />
    </label>
  </div>
)}
```

**Step 3: Verify changes**

Run: `grep -n "ZoomSlider\|defaultGridDensity" client/src/components/settings/CardDisplaySettings.jsx`
Expected: Shows import and usage.

**Step 4: Commit**

```bash
git add client/src/components/settings/CardDisplaySettings.jsx
git commit -m "$(cat <<'EOF'
Show default density control in CardDisplaySettings page

Renders ZoomSlider below view mode dropdown for Grid/Wall modes.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update SceneGrid to Use Density

**Files:**
- Modify: `client/src/components/scene-search/SceneGrid.jsx`

**Step 1: Update imports**

```javascript
import { getGridClasses } from "../../constants/grids.js";
```

Remove or keep the SCENE_GRID_CONTAINER_CLASSNAMES import (still used as fallback).

**Step 2: Add density prop and use it**

Add to component props:
```javascript
const SceneGrid = ({
  scenes,
  density = "medium",  // NEW PROP
  loading = false,
  // ... rest
}) => {
```

Replace hardcoded classnames with dynamic:
```javascript
const gridClasses = getGridClasses("scene", density);
```

Use `gridClasses` in both the loading skeleton div and the main grid div.

**Step 3: Verify changes**

Run: `grep -n "density\|getGridClasses" client/src/components/scene-search/SceneGrid.jsx`
Expected: Shows prop and usage.

**Step 4: Commit**

```bash
git add client/src/components/scene-search/SceneGrid.jsx
git commit -m "$(cat <<'EOF'
Add density prop to SceneGrid component

Uses getGridClasses helper for density-aware column layout.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update SceneSearch to Pass Density to Grid

**Files:**
- Modify: `client/src/components/scene-search/SceneSearch.jsx`

**Step 1: Pass gridDensity to SceneGrid**

In the render prop callback, add gridDensity:

```javascript
{({ viewMode, zoomLevel, gridDensity, wallPlayback, sortField, sortDirection, onSort }) =>
  // ... existing code ...
  : (
    <SceneGrid
      scenes={currentScenes || []}
      density={gridDensity}  // NEW PROP
      loading={isLoading}
      // ... rest
    />
  )
}
```

**Step 2: Verify changes**

Run: `grep -n "gridDensity" client/src/components/scene-search/SceneSearch.jsx`
Expected: Shows destructuring and prop passing.

**Step 3: Commit**

```bash
git add client/src/components/scene-search/SceneSearch.jsx
git commit -m "$(cat <<'EOF'
Pass gridDensity to SceneGrid in SceneSearch

Connects SearchControls density state to grid rendering.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update Other Search Pages (PerformerSearch, etc.)

**Files:**
- Modify: All other search pages that use grids

**Step 1: Identify all search pages using grids**

Run: `grep -rn "BaseGrid\|Grid.*density" client/src/components/`

Common pages to update:
- `client/src/components/performer-search/PerformerSearch.jsx`
- `client/src/components/performer-search/PerformerGrid.jsx`
- `client/src/components/studio-search/StudioSearch.jsx`
- `client/src/components/studio-search/StudioGrid.jsx`
- `client/src/components/tag-search/TagSearch.jsx`
- `client/src/components/tag-search/TagGrid.jsx`
- `client/src/components/gallery-search/GallerySearch.jsx`
- `client/src/components/gallery-search/GalleryGrid.jsx`
- `client/src/components/group-search/GroupSearch.jsx`
- `client/src/components/group-search/GroupGrid.jsx`
- `client/src/components/image-search/ImageSearch.jsx`
- `client/src/components/image-search/ImageGrid.jsx`

**Step 2: For each Grid component**

Add `density` prop and use `getGridClasses()` helper (same pattern as SceneGrid).

**Step 3: For each Search component**

Pass `gridDensity` from render prop to Grid component.

**Step 4: Verify all updates**

Run: `grep -rn "density.*=" client/src/components/*-search/*.jsx | grep -v node_modules`
Expected: Shows density prop in all grid components.

**Step 5: Commit**

```bash
git add client/src/components/*-search/*.jsx
git commit -m "$(cat <<'EOF'
Add density support to all entity grid components

PerformerGrid, StudioGrid, TagGrid, GalleryGrid, GroupGrid, ImageGrid
all now accept density prop and use getGridClasses helper.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Test and Verify

**Step 1: Run the development server**

```bash
cd client && npm run dev
```

**Step 2: Manual testing checklist**

1. Open Scenes page → verify S/M/L toggle appears in grid view
2. Click S → verify more columns appear
3. Click L → verify fewer columns appear
4. Switch to Wall view → verify ZoomSlider still works
5. Refresh page → verify density persists in URL
6. Open Settings → Card Display → Scene → select Grid as default view mode
7. Verify density toggle appears below the dropdown
8. Change density → verify it saves
9. Go back to Scenes page → verify new default density is applied
10. Repeat for Performers, Studios, Tags, etc.

**Step 3: Check for console errors**

Open browser DevTools, verify no React errors or warnings related to the changes.

---

## Task 13: Final Commit

**Step 1: Review all changes**

```bash
git status
git diff --stat main
```

**Step 2: Create summary commit if needed**

If any files were missed or need cleanup, commit them now.

**Step 3: Push branch**

```bash
git push -u origin feature/grid-density-controls
```

---

## Files Summary

| File | Change |
|------|--------|
| `client/src/constants/grids.js` | Add density variants, getGridClasses helper |
| `client/src/config/entityDisplayConfig.js` | Add defaultGridDensity, defaultWallZoom settings |
| `client/src/components/ui/BaseGrid.jsx` | Add density prop |
| `client/src/hooks/useFilterState.js` | Add gridDensity state and actions |
| `client/src/utils/urlParams.js` | Add gridDensity to URL serialization |
| `client/src/components/ui/SearchControls.jsx` | Show ZoomSlider for grid view |
| `client/src/components/ui/ContextSettings.jsx` | Show density below view mode dropdown |
| `client/src/components/settings/CardDisplaySettings.jsx` | Show density below view mode dropdown |
| `client/src/components/scene-search/SceneGrid.jsx` | Add density prop |
| `client/src/components/scene-search/SceneSearch.jsx` | Pass gridDensity to SceneGrid |
| `client/src/components/*-search/*Grid.jsx` | Add density prop (all entity grids) |
| `client/src/components/*-search/*Search.jsx` | Pass gridDensity (all entity searches) |
