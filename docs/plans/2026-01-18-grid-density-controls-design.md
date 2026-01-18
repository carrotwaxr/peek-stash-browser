# Grid Density Controls Design

## Summary

Add density controls (S/M/L) to the card grid view, matching the existing Wall view zoom functionality. Also surface density/zoom settings in the Default View Mode settings UI so users can set their preferred defaults.

## Problem

1. When setting Default View Mode to "Wall" in settings, users can't set their preferred zoom level (S/M/L) - it always defaults to Medium
2. Grid view has no density control - users can't adjust how many cards appear per row

## Solution

### 1. Grid Density Control in Search Controls

Add an S/M/L toggle (reusing `ZoomSlider` component) that appears when Grid view is active:

- **Small**: More columns, smaller cards
- **Medium**: Current default column counts
- **Large**: Fewer columns, larger cards

Column counts by density:

**Standard Grid (performers, studios, tags):**

| Breakpoint | Small | Medium | Large |
|------------|-------|--------|-------|
| < 640px    | 2     | 1      | 1     |
| 640-1023px | 3     | 2      | 2     |
| 1024-1919px| 4     | 3      | 2     |
| 1920-2559px| 6     | 5      | 3     |
| 2560-3839px| 8     | 6      | 4     |
| 3840px+    | 12    | 10     | 6     |

**Scene Grid:**

| Breakpoint | Small | Medium | Large |
|------------|-------|--------|-------|
| < 768px    | 2     | 1      | 1     |
| 768-1279px | 3     | 2      | 2     |
| 1280-1919px| 4     | 3      | 2     |
| 1920-2559px| 5     | 4      | 3     |
| 2560-3839px| 7     | 5      | 4     |
| 3840px+    | 10    | 8      | 5     |

### 2. Default Density Settings

In both the Settings page and ContextSettings popover, when a view mode with density options (Grid or Wall) is selected:

- A secondary S/M/L control appears **below** the view mode dropdown
- Label: "Default Density"
- Sets the default density for that view mode per entity type

### 3. URL State

Grid density syncs to URL as `grid_density=small|medium|large` (parallel to existing `zoom_level` for Wall).

## Files to Modify

1. **`constants/grids.js`** - Add density variants (S/M/L class strings for both grid types)

2. **`config/entityDisplayConfig.js`** - Add `defaultGridDensity` and `defaultWallZoom` to available settings and defaults

3. **`components/ui/BaseGrid.jsx`** - Accept `density` prop, select appropriate class string

4. **`hooks/useFilterState.js`** - Add `gridDensity` state with URL sync

5. **`components/ui/SearchControls.jsx`** - Render ZoomSlider when `viewMode === "grid"`

6. **`components/ui/ContextSettings.jsx`** - Show density toggle below view mode dropdown when Grid or Wall selected

7. **`components/settings/CardDisplaySettings.jsx`** - Same density toggle below view mode dropdown

8. **Search page components** - Pass `gridDensity` to their grid components

## Implementation Notes

- Reuse existing `ZoomSlider` component for all density toggles
- No new components needed
- Density defaults to user's saved preference, falling back to "medium"
- Per-entity-type settings (scenes can have different default than performers)
