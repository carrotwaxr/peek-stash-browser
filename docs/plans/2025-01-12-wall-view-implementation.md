# Wall View Implementation Plan

> **Status:** ✅ **COMPLETE** - PR #281 created 2026-01-12

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a justified gallery "Wall" view mode for Scenes, Galleries, and Images that mirrors Stash's SceneWallPanel behavior.

**Architecture:** New WallView component using react-photo-album for justified layout. View mode (grid/wall) and zoom level synced to URL and saved in filter presets. Entity-specific rendering via wallConfig. Global wallPlayback setting in user preferences.

**Tech Stack:** React, react-photo-album, Tailwind CSS, Prisma (SQLite), Express

---

## Task 1: Add react-photo-album dependency

**Files:**
- Modify: `client/package.json`

**Step 1: Install dependency**

Run:
```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser/client && npm install react-photo-album
```

Expected: Package added to dependencies

**Step 2: Verify installation**

Run:
```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser/client && npm ls react-photo-album
```

Expected: Shows react-photo-album version

**Step 3: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/package.json client/package-lock.json && git commit -m "chore: add react-photo-album dependency for wall view"
```

---

## Task 2: Add wallPlayback field to Prisma schema

**Files:**
- Modify: `server/prisma/schema.prisma:19-28`

**Step 1: Add wallPlayback field to User model**

Add after line 21 (`preferredPreviewQuality`):

```prisma
  wallPlayback            String? @default("autoplay") // "autoplay", "hover", "static" - Wall view preview behavior
```

**Step 2: Create migration**

Run:
```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser/server && npx prisma migrate dev --name add_wall_playback
```

Expected: Migration created and applied

**Step 3: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add server/prisma/ && git commit -m "feat: add wallPlayback user preference field"
```

---

## Task 3: Add wallPlayback to settings API

**Files:**
- Modify: `server/routes/user.js` (find GET/PUT /settings endpoints)

**Step 1: Find the settings endpoints**

Run:
```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && grep -n "settings" server/routes/user.js | head -20
```

**Step 2: Add wallPlayback to GET /settings response**

In the GET /settings handler, add `wallPlayback` to the returned settings object:

```javascript
wallPlayback: user.wallPlayback || "autoplay",
```

**Step 3: Add wallPlayback to PUT /settings handler**

In the PUT /settings handler, add `wallPlayback` to the update object:

```javascript
wallPlayback: body.wallPlayback,
```

**Step 4: Test the endpoint**

Run the server and verify the setting is returned and can be updated.

**Step 5: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add server/routes/user.js && git commit -m "feat: add wallPlayback to user settings API"
```

---

## Task 4: Add wallPlayback setting to PlaybackTab UI

**Files:**
- Modify: `client/src/components/settings/tabs/PlaybackTab.jsx`

**Step 1: Add state for wallPlayback**

After line 17 (`const [minimumPlayPercent, setMinimumPlayPercent] = useState(20);`), add:

```javascript
const [wallPlayback, setWallPlayback] = useState("autoplay");
```

**Step 2: Load wallPlayback in useEffect**

In the loadSettings function, after line 32, add:

```javascript
setWallPlayback(settings.wallPlayback || "autoplay");
```

**Step 3: Add wallPlayback to saveSettings**

In the api.put call (line 48-54), add `wallPlayback` to the request body:

```javascript
await api.put("/user/settings", {
  preferredQuality,
  preferredPlaybackMode,
  preferredPreviewQuality,
  enableCast,
  minimumPlayPercent,
  wallPlayback,
});
```

**Step 4: Add UI control for wallPlayback**

After the "Preferred Preview Quality" section (after line 145), add:

```jsx
{/* Wall View Playback */}
<div>
  <label
    htmlFor="wallPlayback"
    className="block text-sm font-medium mb-2"
    style={{ color: "var(--text-secondary)" }}
  >
    Wall View Playback
  </label>
  <select
    id="wallPlayback"
    value={wallPlayback}
    onChange={(e) => setWallPlayback(e.target.value)}
    className="w-full px-4 py-2 rounded-lg"
    style={{
      backgroundColor: "var(--bg-secondary)",
      border: "1px solid var(--border-color)",
      color: "var(--text-primary)",
    }}
  >
    <option value="autoplay">Autoplay All (Default)</option>
    <option value="hover">Play on Hover</option>
    <option value="static">Static Thumbnails</option>
  </select>
  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
    How scene previews behave in Wall view. Autoplay plays all visible
    previews simultaneously. Hover plays on mouse over. Static shows
    thumbnails only.
  </p>
</div>
```

**Step 5: Test in browser**

Navigate to Settings → Playback and verify the new setting appears and saves.

**Step 6: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/settings/tabs/PlaybackTab.jsx && git commit -m "feat: add wallPlayback setting to PlaybackTab UI"
```

---

## Task 5: Create wallConfig.js

**Files:**
- Create: `client/src/components/wall/wallConfig.js`

**Step 1: Create the wall directory**

Run:
```bash
mkdir -p c:/Users/carrotwaxr/code/peek-stash-browser/client/src/components/wall
```

**Step 2: Create wallConfig.js**

```javascript
/**
 * Entity-specific configuration for WallView rendering.
 * Keeps WallView and WallItem entity-agnostic.
 */

import { formatDistanceToNow } from "date-fns";

const formatDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
};

const formatResolution = (width, height) => {
  if (!width || !height) return null;
  return `${width}×${height}`;
};

export const wallConfig = {
  scene: {
    getImageUrl: (item) => item.paths?.screenshot,
    getPreviewUrl: (item) => item.paths?.preview,
    getAspectRatio: (item) => {
      const file = item.files?.[0];
      if (file?.width && file?.height) {
        return file.width / file.height;
      }
      return 16 / 9; // Default for scenes
    },
    getTitle: (item) => item.title || "Untitled",
    getSubtitle: (item) => {
      const parts = [];
      if (item.studio?.name) parts.push(item.studio.name);
      if (item.date) parts.push(formatDate(item.date));
      return parts.join(" • ");
    },
    getLinkPath: (item) => `/scene/${item.id}`,
    hasPreview: true,
  },

  gallery: {
    getImageUrl: (item) => item.cover?.paths?.thumbnail,
    getPreviewUrl: () => null,
    getAspectRatio: (item) => {
      const cover = item.cover;
      if (cover?.width && cover?.height) {
        return cover.width / cover.height;
      }
      return 4 / 3; // Default for galleries
    },
    getTitle: (item) => item.title || "Untitled Gallery",
    getSubtitle: (item) => `${item.image_count || 0} images`,
    getLinkPath: (item) => `/gallery/${item.id}`,
    hasPreview: false,
  },

  image: {
    getImageUrl: (item) => item.paths?.thumbnail,
    getPreviewUrl: () => null,
    getAspectRatio: (item) => {
      if (item.width && item.height) {
        return item.width / item.height;
      }
      return 1; // Default square for images
    },
    getTitle: (item) => item.title || item.files?.[0]?.basename || "Untitled",
    getSubtitle: (item) => formatResolution(item.width, item.height),
    getLinkPath: (item) => `/image/${item.id}`,
    hasPreview: false,
  },
};

// Zoom level configurations
export const ZOOM_LEVELS = {
  small: { targetRowHeight: 150, label: "S" },
  medium: { targetRowHeight: 220, label: "M" },
  large: { targetRowHeight: 320, label: "L" },
};

export const DEFAULT_ZOOM = "medium";
export const DEFAULT_VIEW_MODE = "grid";
```

**Step 3: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/wall/wallConfig.js && git commit -m "feat: add wallConfig with entity-specific configuration"
```

---

## Task 6: Create WallItem.jsx

**Files:**
- Create: `client/src/components/wall/WallItem.jsx`

**Step 1: Create WallItem component**

```jsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * Individual item in the WallView with hover overlay and optional video preview.
 */
const WallItem = ({
  item,
  config,
  width,
  height,
  playbackMode = "autoplay", // "autoplay" | "hover" | "static"
  onClick,
}) => {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimeoutRef = useRef(null);

  const imageUrl = config.getImageUrl(item);
  const previewUrl = config.getPreviewUrl(item);
  const title = config.getTitle(item);
  const subtitle = config.getSubtitle(item);
  const linkPath = config.getLinkPath(item);
  const hasPreview = config.hasPreview && previewUrl;

  // Intersection Observer for autoplay mode
  useEffect(() => {
    if (playbackMode !== "autoplay" || !hasPreview) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [playbackMode, hasPreview]);

  // Video playback control
  useEffect(() => {
    if (!videoRef.current || !hasPreview) return;

    const shouldPlay =
      playbackMode === "autoplay"
        ? isInView
        : playbackMode === "hover"
          ? isHovering
          : false;

    if (shouldPlay) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [playbackMode, isInView, isHovering, hasPreview]);

  // Overlay show delay (500ms)
  useEffect(() => {
    if (isHovering) {
      overlayTimeoutRef.current = setTimeout(() => {
        setShowOverlay(true);
      }, 500);
    } else {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
      setShowOverlay(false);
    }

    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, [isHovering]);

  const handleClick = (e) => {
    if (onClick) {
      e.preventDefault();
      onClick(item);
    }
  };

  return (
    <Link
      ref={containerRef}
      to={linkPath}
      onClick={handleClick}
      className="wall-item relative block overflow-hidden"
      style={{ width, height }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Background image */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      )}

      {/* Video preview (for scenes) */}
      {hasPreview && playbackMode !== "static" && (
        <video
          ref={videoRef}
          src={previewUrl}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          preload="none"
        />
      )}

      {/* Gradient overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none transition-opacity duration-300"
        style={{
          height: "100px",
          background: "linear-gradient(transparent, rgba(0, 0, 0, 0.7))",
          opacity: showOverlay ? 1 : 0,
        }}
      />

      {/* Text overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300"
        style={{ opacity: showOverlay ? 1 : 0 }}
      >
        <h3
          className="text-sm font-medium truncate"
          style={{ color: "white" }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            className="text-xs truncate mt-0.5"
            style={{ color: "rgba(255, 255, 255, 0.7)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </Link>
  );
};

export default WallItem;
```

**Step 2: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/wall/WallItem.jsx && git commit -m "feat: add WallItem component with hover overlay and video preview"
```

---

## Task 7: Create WallView.jsx

**Files:**
- Create: `client/src/components/wall/WallView.jsx`

**Step 1: Create WallView component**

```jsx
import { useMemo } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import WallItem from "./WallItem.jsx";
import { wallConfig, ZOOM_LEVELS, DEFAULT_ZOOM } from "./wallConfig.js";

/**
 * Justified gallery view using react-photo-album.
 * Renders items in rows with preserved aspect ratios.
 */
const WallView = ({
  items = [],
  entityType = "scene",
  zoomLevel = DEFAULT_ZOOM,
  playbackMode = "autoplay",
  onItemClick,
  loading = false,
  emptyMessage = "No items found",
}) => {
  const config = wallConfig[entityType];
  const { targetRowHeight } = ZOOM_LEVELS[zoomLevel] || ZOOM_LEVELS[DEFAULT_ZOOM];

  // Transform items to photo album format
  const photos = useMemo(() => {
    if (!items || !config) return [];

    return items.map((item) => {
      const aspectRatio = config.getAspectRatio(item);
      // react-photo-album needs width/height, we use aspect ratio to derive them
      const baseHeight = targetRowHeight;
      const baseWidth = baseHeight * aspectRatio;

      return {
        src: config.getImageUrl(item) || "",
        width: baseWidth,
        height: baseHeight,
        key: item.id,
        // Pass original item for rendering
        _item: item,
      };
    });
  }, [items, config, targetRowHeight]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: "var(--accent-primary)" }}
        />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
            {entityType === "scene" ? "🎬" : entityType === "gallery" ? "🖼️" : "📷"}
          </div>
          <h3
            className="text-xl font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {emptyMessage}
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div className="wall-view">
      <RowsPhotoAlbum
        photos={photos}
        targetRowHeight={targetRowHeight}
        rowConstraints={{ maxPhotos: 8 }}
        spacing={4}
        render={{
          photo: ({ photo, width, height }) => (
            <WallItem
              key={photo.key}
              item={photo._item}
              config={config}
              width={width}
              height={height}
              playbackMode={playbackMode}
              onClick={onItemClick}
            />
          ),
        }}
      />
    </div>
  );
};

export default WallView;
```

**Step 2: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/wall/WallView.jsx && git commit -m "feat: add WallView component with justified layout"
```

---

## Task 8: Create ViewModeToggle.jsx

**Files:**
- Create: `client/src/components/ui/ViewModeToggle.jsx`

**Step 1: Create ViewModeToggle component**

```jsx
import { LucideGrid2X2, LucideSquare } from "lucide-react";

/**
 * Toggle between Grid and Wall view modes.
 */
const ViewModeToggle = ({ value = "grid", onChange, className = "" }) => {
  const modes = [
    { id: "grid", icon: LucideGrid2X2, label: "Grid view" },
    { id: "wall", icon: LucideSquare, label: "Wall view" },
  ];

  return (
    <div
      className={`inline-flex rounded-lg overflow-hidden ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {modes.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className="px-3 py-1.5 transition-colors"
          style={{
            backgroundColor: value === id ? "var(--accent-primary)" : "transparent",
            color: value === id ? "white" : "var(--text-secondary)",
          }}
          title={label}
          aria-label={label}
          aria-pressed={value === id}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
};

export default ViewModeToggle;
```

**Step 2: Export from ui index**

Add to `client/src/components/ui/index.js`:

```javascript
export { default as ViewModeToggle } from "./ViewModeToggle.jsx";
```

**Step 3: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/ui/ViewModeToggle.jsx client/src/components/ui/index.js && git commit -m "feat: add ViewModeToggle component"
```

---

## Task 9: Create ZoomSlider.jsx

**Files:**
- Create: `client/src/components/ui/ZoomSlider.jsx`

**Step 1: Create ZoomSlider component**

```jsx
import { ZOOM_LEVELS } from "../wall/wallConfig.js";

/**
 * 3-level zoom control for Wall view (S/M/L).
 */
const ZoomSlider = ({ value = "medium", onChange, className = "" }) => {
  const levels = Object.entries(ZOOM_LEVELS);

  return (
    <div
      className={`inline-flex rounded-lg overflow-hidden ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {levels.map(([id, { label }]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className="px-2.5 py-1.5 text-xs font-medium transition-colors min-w-[28px]"
          style={{
            backgroundColor: value === id ? "var(--accent-primary)" : "transparent",
            color: value === id ? "white" : "var(--text-secondary)",
          }}
          title={`${label} size`}
          aria-label={`${label} size`}
          aria-pressed={value === id}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default ZoomSlider;
```

**Step 2: Export from ui index**

Add to `client/src/components/ui/index.js`:

```javascript
export { default as ZoomSlider } from "./ZoomSlider.jsx";
```

**Step 3: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/ui/ZoomSlider.jsx client/src/components/ui/index.js && git commit -m "feat: add ZoomSlider component"
```

---

## Task 10: Add view/zoom to URL params utility

**Files:**
- Modify: `client/src/utils/urlParams.js`

**Step 1: Add view and zoom to buildSearchParams**

In the `buildSearchParams` function (around line 160), add parameters for view and zoom:

After `if (perPage !== 24) params.set("per_page", perPage.toString());` add:

```javascript
if (viewMode && viewMode !== "grid") params.set("view", viewMode);
if (zoomLevel && zoomLevel !== "medium") params.set("zoom", zoomLevel);
```

Update the function signature to accept these new params:

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
}) => {
```

**Step 2: Add view and zoom to parseSearchParams**

In the `parseSearchParams` function (around line 188), add:

```javascript
viewMode: searchParams.get("view") || defaults.viewMode || "grid",
zoomLevel: searchParams.get("zoom") || defaults.zoomLevel || "medium",
```

**Step 3: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/utils/urlParams.js && git commit -m "feat: add view and zoom to URL params utility"
```

---

## Task 11: Add view/zoom state to useFilterState hook

**Files:**
- Modify: `client/src/hooks/useFilterState.js`

**Step 1: Add state for viewMode and zoomLevel**

After line 29 (`const [searchText, setSearchTextState] = useState("");`), add:

```javascript
const [viewMode, setViewModeState] = useState("grid");
const [zoomLevel, setZoomLevelState] = useState("medium");
```

**Step 2: Parse view/zoom from URL in initialize**

In the initialize function, update the `urlState` parsing (around line 64) and set the state.

In `finalState`, add:
```javascript
viewMode: urlState.viewMode,
zoomLevel: urlState.zoomLevel,
```

After setting other state (around line 112), add:
```javascript
setViewModeState(finalState.viewMode);
setZoomLevelState(finalState.zoomLevel);
```

**Step 3: Update stateRef**

Update line 146 to include viewMode and zoomLevel:

```javascript
stateRef.current = { filters, sort, pagination, searchText, viewMode, zoomLevel };
```

**Step 4: Update syncToUrlParams**

Update the syncToUrlParams function to include viewMode and zoomLevel in the params call:

```javascript
const params = buildSearchParams({
  searchText: state.searchText,
  sortField: state.sort.field,
  sortDirection: state.sort.direction,
  currentPage: state.pagination.page,
  perPage: state.pagination.perPage,
  filters: state.filters,
  filterOptions,
  viewMode: state.viewMode,
  zoomLevel: state.zoomLevel,
});
```

**Step 5: Add setViewMode and setZoomLevel actions**

Add new action functions:

```javascript
const setViewMode = useCallback((mode) => {
  setViewModeState(mode);
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  syncToUrlParams({
    filters,
    sort,
    pagination: { ...pagination, page: 1 },
    searchText,
    viewMode: mode,
    zoomLevel,
  });
}, [filters, sort, pagination, searchText, zoomLevel, syncToUrlParams]);

const setZoomLevel = useCallback((level) => {
  setZoomLevelState(level);
  syncToUrlParams({
    filters,
    sort,
    pagination,
    searchText,
    viewMode,
    zoomLevel: level,
  });
}, [filters, sort, pagination, searchText, viewMode, syncToUrlParams]);
```

**Step 6: Update loadPreset to handle view/zoom**

In the loadPreset callback, add handling for view and zoom from preset:

```javascript
const loadPreset = useCallback((preset) => {
  const newFilters = { ...permanentFilters, ...preset.filters };
  const newViewMode = preset.viewMode || "grid";
  const newZoomLevel = preset.zoomLevel || "medium";

  setFiltersState(newFilters);
  setSortState({ field: preset.sort, direction: preset.direction });
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  setViewModeState(newViewMode);
  setZoomLevelState(newZoomLevel);

  syncToUrlParams({
    filters: newFilters,
    sort: { field: preset.sort, direction: preset.direction },
    pagination: { ...pagination, page: 1 },
    searchText,
    viewMode: newViewMode,
    zoomLevel: newZoomLevel,
  });
}, [permanentFilters, pagination, searchText, syncToUrlParams]);
```

**Step 7: Return new values and actions**

Update the return statement to include:

```javascript
return {
  filters,
  sort,
  pagination,
  searchText,
  viewMode,
  zoomLevel,
  isInitialized,
  isLoadingPresets,
  // Actions
  setFilter,
  setFilters,
  removeFilter,
  clearFilters,
  setSort,
  setPage,
  setPerPage,
  setSearchText,
  setViewMode,
  setZoomLevel,
  loadPreset,
};
```

**Step 8: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/hooks/useFilterState.js && git commit -m "feat: add viewMode and zoomLevel to useFilterState hook"
```

---

## Task 12: Add view/zoom to FilterPresets save/load

**Files:**
- Modify: `client/src/components/ui/FilterPresets.jsx`

**Step 1: Update FilterPresets props**

Add `currentViewMode` and `currentZoomLevel` to the component props (around line 43):

```javascript
const FilterPresets = ({
  artifactType,
  context,
  currentFilters,
  permanentFilters = {},
  currentSort,
  currentDirection,
  currentViewMode = "grid",
  currentZoomLevel = "medium",
  onLoadPreset,
}) => {
```

**Step 2: Save viewMode and zoomLevel in handleSavePreset**

In the apiPost call (around line 109), add the new fields:

```javascript
await apiPost("/user/filter-presets", {
  artifactType,
  context: effectiveContext,
  name: presetName,
  filters: filtersToSave,
  sort: currentSort,
  direction: currentDirection,
  viewMode: currentViewMode,
  zoomLevel: currentZoomLevel,
  setAsDefault,
});
```

**Step 3: Load viewMode and zoomLevel in handleLoadPreset**

In the handleLoadPreset callback (around line 136), add the new fields:

```javascript
onLoadPreset({
  filters: mergedFilters,
  sort: preset.sort,
  direction: preset.direction,
  viewMode: preset.viewMode || "grid",
  zoomLevel: preset.zoomLevel || "medium",
});
```

**Step 4: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/ui/FilterPresets.jsx && git commit -m "feat: add viewMode and zoomLevel to filter presets"
```

---

## Task 13: Add ViewModeToggle and ZoomSlider to SearchControls

**Files:**
- Modify: `client/src/components/ui/SearchControls.jsx`

**Step 1: Import new components**

Add imports at top of file:

```javascript
import ViewModeToggle from "./ViewModeToggle.jsx";
import ZoomSlider from "./ZoomSlider.jsx";
```

**Step 2: Add props for view mode support**

Add new props to the component (around line 84):

```javascript
const SearchControls = ({
  artifactType = "scene",
  context,
  children,
  initialSort = "o_counter",
  onQueryChange,
  onPerPageStateChange,
  paginationHandlerRef,
  permanentFilters = {},
  permanentFiltersMetadata = {},
  totalPages,
  totalCount,
  syncToUrl = true,
  // View mode props
  supportsWallView = false,
  wallPlayback = "autoplay",
  // TV Mode props
  tvSearchZoneActive = false,
  tvTopPaginationZoneActive = false,
  tvBottomPaginationZoneActive = false,
}) => {
```

**Step 3: Get viewMode and zoomLevel from useFilterState**

Update the destructuring from useFilterState (around line 218):

```javascript
const {
  filters,
  sort,
  pagination,
  searchText,
  viewMode,
  zoomLevel,
  isInitialized,
  isLoadingPresets,
  setFilters: setFiltersAction,
  removeFilter: removeFilterAction,
  clearFilters: clearFiltersAction,
  setSort: setSortAction,
  setPage,
  setPerPage: setPerPageAction,
  setSearchText: setSearchTextAction,
  setViewMode,
  setZoomLevel,
  loadPreset,
} = useFilterState({
  artifactType,
  context: effectiveContext,
  initialSort,
  permanentFilters,
  filterOptions,
  syncToUrl,
});
```

**Step 4: Add handlers for view mode and zoom**

Add handler functions:

```javascript
const handleViewModeChange = useCallback((mode) => {
  setViewMode(mode);
  // Also trigger query change to refresh with new view
  const query = {
    filter: {
      direction: sortDirection,
      page: 1,
      per_page: perPage,
      q: searchText,
      sort: getSortWithSeed(sortField),
    },
    ...buildFilter(artifactType, filters, unitPreference),
  };
  onQueryChange(query);
}, [setViewMode, sortDirection, perPage, searchText, sortField, filters, artifactType, unitPreference, onQueryChange, getSortWithSeed]);

const handleZoomChange = useCallback((level) => {
  setZoomLevel(level);
}, [setZoomLevel]);
```

**Step 5: Pass viewMode/zoomLevel to FilterPresets**

Update the FilterPresets component usage (around line 728):

```jsx
<FilterPresets
  artifactType={artifactType}
  context={effectiveContext}
  currentFilters={filters}
  currentSort={sortField}
  currentDirection={sortDirection}
  currentViewMode={viewMode}
  currentZoomLevel={zoomLevel}
  permanentFilters={permanentFilters}
  onLoadPreset={handleLoadPreset}
/>
```

**Step 6: Add ViewModeToggle and ZoomSlider to toolbar**

After the FilterPresets section (around line 742), add:

```jsx
{/* View Mode Toggle - Only for supported artifact types */}
{supportsWallView && (
  <ViewModeToggle
    value={viewMode}
    onChange={handleViewModeChange}
  />
)}

{/* Zoom Slider - Only shown in wall mode */}
{supportsWallView && viewMode === "wall" && (
  <ZoomSlider
    value={zoomLevel}
    onChange={handleZoomChange}
  />
)}
```

**Step 7: Expose viewMode, zoomLevel, and wallPlayback via children render prop or context**

For pages to access viewMode/zoomLevel, we need to pass them down. The cleanest approach is to add a render prop pattern.

Update the children rendering section to pass props:

```jsx
{typeof children === "function"
  ? children({ viewMode, zoomLevel, wallPlayback })
  : children}
```

**Step 8: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/ui/SearchControls.jsx && git commit -m "feat: add ViewModeToggle and ZoomSlider to SearchControls"
```

---

## Task 14: Create useWallPlayback hook

**Files:**
- Create: `client/src/hooks/useWallPlayback.js`

**Step 1: Create the hook**

```javascript
import { useEffect, useState } from "react";
import { apiGet } from "../services/api.js";

/**
 * Hook to get the user's wallPlayback preference.
 * Returns "autoplay" | "hover" | "static"
 */
export const useWallPlayback = () => {
  const [wallPlayback, setWallPlayback] = useState("autoplay");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSetting = async () => {
      try {
        const response = await apiGet("/user/settings");
        setWallPlayback(response.settings?.wallPlayback || "autoplay");
      } catch {
        // Default to autoplay on error
        setWallPlayback("autoplay");
      } finally {
        setLoading(false);
      }
    };

    loadSetting();
  }, []);

  return { wallPlayback, loading };
};
```

**Step 2: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/hooks/useWallPlayback.js && git commit -m "feat: add useWallPlayback hook"
```

---

## Task 15: Integrate WallView into SceneSearch page

**Files:**
- Modify: `client/src/components/scene-search/SceneSearch.jsx`

**Step 1: Import WallView and useWallPlayback**

Add imports:

```javascript
import WallView from "../wall/WallView.jsx";
import { useWallPlayback } from "../../hooks/useWallPlayback.js";
```

**Step 2: Get wallPlayback setting**

Inside the component, add:

```javascript
const { wallPlayback } = useWallPlayback();
```

**Step 3: Update SearchControls to enable wall view**

Add `supportsWallView={true}` and `wallPlayback={wallPlayback}` to SearchControls.

**Step 4: Use render prop to get viewMode/zoomLevel**

Wrap the grid rendering in the children function:

```jsx
<SearchControls
  artifactType="scene"
  // ... other props
  supportsWallView={true}
  wallPlayback={wallPlayback}
>
  {({ viewMode, zoomLevel }) => (
    viewMode === "wall" ? (
      <WallView
        items={scenes}
        entityType="scene"
        zoomLevel={zoomLevel}
        playbackMode={wallPlayback}
        onItemClick={handleSceneClick}
        loading={loading}
        emptyMessage="No scenes found"
      />
    ) : (
      <SceneGrid
        scenes={scenes}
        loading={loading}
        error={error}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        onSceneClick={handleSceneClick}
        // ... other props
      />
    )
  )}
</SearchControls>
```

**Step 5: Test in browser**

Navigate to /scenes and verify:
- View toggle appears in toolbar
- Clicking Wall shows justified layout
- Zoom slider appears in wall mode
- Previews autoplay based on setting

**Step 6: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/scene-search/SceneSearch.jsx && git commit -m "feat: integrate WallView into SceneSearch page"
```

---

## Task 16: Integrate WallView into GallerySearch and ImageSearch

**Files:**
- Modify: `client/src/pages/GallerySearch.jsx` (or wherever gallery search lives)
- Modify: `client/src/pages/ImageSearch.jsx` (or wherever image search lives)

**Step 1: Find the gallery and image search pages**

Run:
```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && find client/src -name "*Gallery*" -o -name "*Image*" | grep -E "\.(jsx|tsx)$" | head -20
```

**Step 2: Apply same pattern as SceneSearch**

For each page:
1. Import WallView and useWallPlayback
2. Add supportsWallView={true} to SearchControls
3. Use render prop to conditionally render WallView or existing grid
4. Pass entityType="gallery" or entityType="image" to WallView

**Step 3: Test in browser**

Navigate to /galleries and /images and verify wall view works.

**Step 4: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src && git commit -m "feat: integrate WallView into GallerySearch and ImageSearch"
```

---

## Task 17: Integrate WallView into detail page tabs

**Files:**
- Modify: `client/src/components/pages/PerformerDetail.jsx`
- Modify: `client/src/components/pages/StudioDetail.jsx`
- Modify: `client/src/components/pages/TagDetail.jsx`
- Modify: `client/src/components/pages/GroupDetail.jsx`
- Modify: `client/src/components/pages/GalleryDetail.jsx`

**Step 1: For each detail page, locate scene/gallery/image tabs**

Each page uses SearchControls for these tabs. Apply the same pattern:
1. Add supportsWallView={true} for scene/gallery/image tabs
2. Use render prop to conditionally render WallView

**Step 2: PerformerDetail - scenes, galleries, images tabs**

Import WallView and useWallPlayback, then update each relevant tab.

**Step 3: StudioDetail - scenes, galleries tabs**

Same pattern.

**Step 4: TagDetail - scenes, galleries, images tabs**

Same pattern.

**Step 5: GroupDetail - scenes tab**

Same pattern.

**Step 6: GalleryDetail - images view**

The image display in GalleryDetail may use a different pattern (lightbox). Check if it uses SearchControls and apply if appropriate.

**Step 7: Test all detail pages**

Navigate to each detail page type and verify wall view works on relevant tabs.

**Step 8: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/pages && git commit -m "feat: integrate WallView into detail page tabs"
```

---

## Task 18: Export wall components from index

**Files:**
- Create: `client/src/components/wall/index.js`

**Step 1: Create index file**

```javascript
export { default as WallView } from "./WallView.jsx";
export { default as WallItem } from "./WallItem.jsx";
export { wallConfig, ZOOM_LEVELS, DEFAULT_ZOOM, DEFAULT_VIEW_MODE } from "./wallConfig.js";
```

**Step 2: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src/components/wall/index.js && git commit -m "chore: add wall components index export"
```

---

## Task 19: Add wall view CSS refinements

**Files:**
- Modify: `client/src/index.css` (or appropriate global CSS file)

**Step 1: Add wall view styles**

```css
/* Wall View */
.wall-view {
  width: 100%;
}

.wall-item {
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.wall-item:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.wall-item video {
  transition: opacity 0.3s ease;
}
```

**Step 2: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add client/src && git commit -m "style: add wall view CSS refinements"
```

---

## Task 20: Final testing and cleanup

**Step 1: Run the full application**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && docker-compose -f docker-compose.yml -f docker-compose.windows.yml up
```

**Step 2: Test checklist**

- [ ] Scene Search: Grid/Wall toggle works, zoom slider appears in wall mode
- [ ] Gallery Search: Grid/Wall toggle works
- [ ] Image Search: Grid/Wall toggle works
- [ ] Performer Detail tabs: Wall view on scenes, galleries, images
- [ ] Studio Detail tabs: Wall view on scenes, galleries
- [ ] Tag Detail tabs: Wall view on scenes, galleries, images
- [ ] Group Detail tabs: Wall view on scenes
- [ ] Gallery Detail: Wall view on images (if applicable)
- [ ] Settings: wallPlayback setting saves and affects preview behavior
- [ ] Presets: view/zoom saved in presets, loaded correctly
- [ ] URL sync: view/zoom params in URL, back/forward navigation works

**Step 3: Run linting**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser/client && npm run lint
```

Fix any lint errors.

**Step 4: Final commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser && git add . && git commit -m "feat: complete wall view implementation"
```

---

## Summary

This implementation plan adds:
- Wall view with justified layout via react-photo-album
- 3 zoom levels (S/M/L)
- Global wallPlayback setting (autoplay/hover/static)
- URL sync for view mode and zoom
- Preset integration for view/zoom
- Support for scenes, galleries, and images across all search pages and detail page tabs
