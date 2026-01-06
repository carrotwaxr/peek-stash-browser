# UI Component Refactor for 3.2.0

**Date:** 2026-01-05
**Status:** In Design
**Goal:** Improved UI consistency, maintainable/composable/DRY component structure, enhanced UI customization

## Overview

Refactor peek's card and grid components to support:
1. **UI Consistency** - Fix existing visual inconsistencies and bugs
2. **DRY Components** - Consolidate duplicated patterns
3. **Layout Flexibility** - Support multiple display modes per entity type (grid, list, compact)
4. **User Customization** - Per-entity card anatomy settings (show/hide elements)

**Scope:** All searchable entities will support alternative layouts and customization:
- Scenes
- Performers
- Galleries
- Groups (Collections)
- Studios
- Tags
- Images

---

## Current Architecture Audit

### Component Hierarchy

```
UI Display Components:
├── Base Components (Foundation)
│   ├── BaseCard.jsx - Composable card with render slots
│   ├── BaseGrid.jsx - Layout, pagination, loading/empty states
│   ├── EntitySearch.jsx - BaseGrid + search controls + data fetching
│   └── CardComponents.jsx - Shared primitives
│       ├── CardContainer
│       ├── CardImage (with lazy loading)
│       ├── CardTitle
│       ├── CardDescription
│       ├── CardIndicators
│       └── CardRatingRow
│
├── Entity Cards (7 types)
│   ├── SceneCard.jsx - ⚠️ Doesn't use BaseCard (special case)
│   ├── GalleryCard.jsx - Uses BaseCard
│   ├── GroupCard.jsx - Uses BaseCard
│   ├── PerformerCard.jsx - Uses BaseCard
│   ├── StudioCard.jsx - Uses BaseCard
│   ├── TagCard.jsx - Uses BaseCard
│   └── ImageCard.jsx - Uses BaseCard
│
├── Entity Grids (7 types)
│   ├── SceneGrid.jsx - Custom implementation (selection, TV navigation)
│   ├── GalleryGrid.jsx - Thin wrapper around EntitySearch
│   ├── GroupGrid.jsx - Thin wrapper around EntitySearch
│   ├── PerformerGrid.jsx - Thin wrapper around EntitySearch
│   ├── StudioGrid.jsx - Thin wrapper around EntitySearch
│   ├── TagGrid.jsx - Thin wrapper around EntitySearch
│   └── ImageGrid.jsx - Thin wrapper around EntitySearch
│
└── Special Display Patterns
    ├── SceneListItem.jsx - Row-based layout (playlists, watch history)
    ├── PaginatedImageGrid.jsx - Compact grid with lightbox
    ├── HiddenItemsPage.jsx - Custom card display
    └── PlaylistStatusCard.jsx - Thumbnail strip navigation
```

### Data Flow Pattern

```
EntitySearch (data fetching)
    ↓
BaseGrid (layout + states)
    ↓
Entity Grid Component (thin wrapper)
    ↓
Entity Card Component (visual display)
    ↓
BaseCard + CardComponents (primitives)
```

---

## What's Working Well

### 1. BaseCard Architecture ✅
- **Composable design** with render slots (`renderOverlay`, `renderImageContent`, `renderAfterTitle`)
- **Flexible display options** (`hideDescription`, `hideSubtitle`, `maxTitleLines`, etc.)
- **Consistent prop interface** across all entity cards (except SceneCard)
- **Good separation of concerns** - BaseCard handles layout, entity cards provide data mapping

### 2. EntitySearch Pattern ✅
- **Consistent search/filter/pagination** across all entity types
- **Centralized data fetching** via libraryApi
- **URL state sync** for shareable links
- **Locked filters** support for nested grids

### 3. CardComponents Primitives ✅
- **Lazy loading** built into CardImage with IntersectionObserver
- **Fixed heights** on CardTitle, CardDescription, CardIndicators for consistent card sizing
- **Tooltip integration** for truncated text
- **CardRatingRow** handles all interactive rating/favorite/O-counter logic

### 4. Grid System ✅
- **Responsive column calculations** via `useGridColumns` hook
- **Two grid types** - `scene` (wider, 16:9) and `standard` (taller, 2:3)
- **Consistent class names** in `constants/grids.js`

---

## Issues Identified

### 1. SceneCard Inconsistency ⚠️

**Problem:** SceneCard doesn't use BaseCard - it reimplements CardComponents inline.

**Current Implementation:**
```jsx
// SceneCard.jsx - Lines 290-450
<div className="...card-styles...">
  <CardImage>...</CardImage>
  <CardTitle>...</CardTitle>
  <CardDescription>...</CardDescription>
  <CardIndicators>...</CardIndicators>
  <CardRatingRow>...</CardRatingRow>
</div>
```

**Issues:**
- Duplicates CardContainer logic (styling, hover, focus)
- Has to manually manage selection state UI
- Can't benefit from BaseCard improvements
- Different prop interface than other cards

**Why it exists:** SceneCard has unique features:
- Selection checkbox overlay
- Video preview with sprite cycling
- Watch progress bar overlay
- Long-press gesture detection
- Inherited tags computation

### 2. Rating Controls Props Variance ⚠️

**Problem:** Inconsistent prop passing to `ratingControlsProps`.

**Examples:**
```jsx
// GalleryCard - Missing initialOCounter
ratingControlsProps={{
  entityId: gallery.id,
  initialRating: gallery.rating100,
  initialFavorite: gallery.favorite || false,
  onHideSuccess,
}}

// PerformerCard - Includes initialOCounter
ratingControlsProps={{
  entityId: performer.id,
  initialRating: performer.rating,
  initialFavorite: performer.favorite || false,
  initialOCounter: performer.o_counter,
  onHideSuccess,
}}

// ImageCard - Conditional rendering
ratingControlsProps={
  image.rating100 !== undefined || image.favorite !== undefined || image.oCounter !== undefined
    ? { ... }
    : undefined
}
```

**Issues:**
- Some entities support O counter, some don't (based on server data availability)
- Inconsistent null checks
- Some use `rating`, others `rating100`

### 3. Indicator Structure Differences ⚠️

**Problem:** Scenes have rich tooltips, other entities simpler.

**Scene Example:**
```jsx
indicators={[{
  type: "PERFORMERS",
  count: scene.performers?.length,
  tooltipContent: <TooltipEntityGrid entities={scene.performers} />,
  onClick: () => navigate(`/performers?sceneId=${scene.id}`)
}]}
```

**Other Entity Example:**
```jsx
indicators={[{
  type: "SCENES",
  count: studio.scene_count,
  onClick: studio.scene_count > 0
    ? () => navigate(`/scenes?studioId=${studio.id}`)
    : undefined
}]}
```

**Difference:** Scenes render full entity grids in tooltips, others just show count text.

### 4. Date Formatting Inconsistency ⚠️

**Problem:** Different date handling patterns.

```jsx
// GalleryCard - Formats date
const galleryDate = gallery.date
  ? new Date(gallery.date).toLocaleDateString()
  : null;

// GroupCard - Uses raw date string
const subtitle = group.studio && group.date
  ? `${group.studio.name} • ${group.date}`
  : ...

// SceneCard - Uses formatRelativeTime utility
const date = scene.date ? formatRelativeTime(scene.date) : null;
```

**Should be:** Consistent date formatting utility across all cards.

### 5. Image Path Variance ⚠️

**Problem:** Different image path patterns per entity.

```jsx
// Scenes
scene.paths?.screenshot

// Performers
performer.image_path

// Galleries
gallery.paths?.cover

// Groups
group.front_image_path || group.back_image_path

// Images
image.paths?.thumbnail || image.paths?.image

// Studios
studio.image_path
```

**Cause:** Server API returns different structures per entity type (from Stash GraphQL schema).

### 6. SceneListItem for Playlists/History ⚠️

**Problem:** Separate row-based component for scenes only.

**Current State:**
- Used in `WatchHistory` and `PlaylistDetail` pages
- Shows horizontal layout: thumbnail | metadata
- Includes watch history stats, resume time, play count
- No equivalent for other entity types

**Future Need:** If we want list view for all entities, need unified solution.

---

## Technical Constraints

### Server API Types

Located in `server/types/`:
- `entities.ts` - Entity type definitions (Normalized types with Peek user data)
- `api/library.ts` - API response shapes
- `filters.ts` - Filter parameter types

**Entity Type Structure (from entities.ts):**

All entities extend base Stash types with Peek user data:

```typescript
// Common fields across ALL entities:
- rating: number | null        // 1-5 star rating
- favorite: boolean            // Favorite flag

// Scenes, Performers, Studios, Tags (aggregated metrics):
- o_counter: number           // Orgasm counter (scenes: direct, others: aggregated)
- play_count: number          // Play count (scenes: direct, others: aggregated)

// Scenes only (watch history):
- rating100: number | null    // 0-100 rating scale
- play_duration: number       // Total watch time
- resume_time: number         // Last playback position
- play_history: string[]      // Play timestamps
- o_history: Date[]          // Orgasm timestamps
- last_played_at: string | null
- last_o_at: string | null
- inheritedTagIds: string[]   // Tags from performers/studios
- inheritedTags: Tag[]        // Hydrated inherited tags

// Images only:
- rating100: number | null    // 0-100 rating scale
- oCounter: number           // Orgasm counter
- viewCount: number          // View count
- lastViewedAt: string | null

// Performers only (aggregated from scenes):
- last_played_at: string | null
- last_o_at: string | null
```

**Key Points:**
- Integration tests exist for all entity routes
- TypeScript types on route controllers ensure API contract
- Data shapes are stable and well-defined
- **Rating systems:** Scenes/Images use `rating100`, others use `rating`
- **O counters:** Only Scenes, Images, Performers, Studios, Tags support them
- **Galleries/Groups:** Simplest entities (rating + favorite only)

### Entity-Specific Behaviors

**Scenes:**
- Video preview (sprite cycling)
- Watch progress tracking
- Resume time
- Inherited tags from performers
- Selection mode for bulk actions

**Images:**
- Lightbox integration
- Gallery inheritance (metadata from parent galleries)
- Click handler for lightbox vs. navigation

**Performers:**
- Gender icon
- Physical stats (height, weight, measurements)
- O counter aggregation

**All Entities:**
- Rating (scenes/images use 100-point, others may vary)
- Favorite flag
- Hidden entities support
- Tag associations

---

## Current Component Features

### BaseCard Props Interface

```jsx
{
  // Data
  entityType: string
  imagePath: string
  title: string | ReactNode
  subtitle: string
  description: string
  linkTo: string

  // Indicators & Rating
  indicators: Array<{
    type: string
    count?: number
    label?: string
    tooltipContent?: ReactNode | string
    onClick?: () => void
  }>
  ratingControlsProps: {
    entityType: string
    entityId: string
    initialRating: number
    initialFavorite: boolean
    initialOCounter?: number
    entityTitle: string
    onHideSuccess?: (id, type) => void
    onOCounterChange?: (id, count) => void
    onRatingChange?: (id, rating) => void
    onFavoriteChange?: (id, favorite) => void
  }

  // Display options
  hideDescription: boolean
  hideSubtitle: boolean
  maxTitleLines: number (default: 2)
  maxDescriptionLines: number (default: 3)
  objectFit: 'cover' | 'contain' (default: 'contain')

  // Customization slots
  renderOverlay: () => ReactNode
  renderImageContent: () => ReactNode
  renderAfterTitle: () => ReactNode

  // Events & behavior
  onClick: (e) => void
  className: string
  referrerUrl: string
  tabIndex: number
  style: object
}
```

### CardComponents Features

**CardImage:**
- Lazy loading via IntersectionObserver
- Aspect ratio support
- Placeholder icons per entity type
- Loading shimmer
- Error handling
- Children rendered as overlay

**CardTitle:**
- Line clamping (configurable)
- Fixed height based on line count
- Tooltip for long titles
- Optional subtitle with reserved space

**CardDescription:**
- Line clamping (configurable)
- Fixed height (maintains card consistency)
- Tooltip for long descriptions
- Returns empty div if no description (preserves layout)

**CardIndicators:**
- Fixed height container (3.5rem)
- Renders `CardCountIndicators` component
- Supports tooltips (text or rich ReactNode)
- Supports onClick navigation
- Icon + count display

**CardRatingRow:**
- Fixed height (2rem)
- Rating badge (clickable to open slider dialog)
- O Counter button (interactive for scenes/images)
- Favorite button
- EntityMenu (hide option)
- Handles all state management internally
- Callbacks for parent state updates

---

## Next Steps

1. ✅ Complete audit
2. ✅ Document findings
3. ⏳ Identify visual bugs
4. ⏳ Research API types in detail
5. ⏳ Design composable architecture for multiple layouts
6. ⏳ Create implementation plan

---

## Design Decisions

1. ✅ **Layout scope:** All searchable entities will support alternative layouts
2. ✅ **Layout types:**
   - **Phase 1 (This branch):** Grid only, but build extensibility for future layouts
   - **Future layouts:** Compact Grid, List, entity-specific views (e.g., Tag hierarchy)
   - **Architecture:** Pluggable layout system where entities can have custom layouts
3. ✅ **Storage:** User settings database (synced across devices)
4. ✅ **Customization granularity (Phase 1):**
   - Show/hide description (per entity type)
   - Future: subtitle, indicators, density presets
5. ✅ **SceneCard migration:** Migrate to BaseCard architecture
   - Use render slots for selection checkbox, video preview, progress bar
   - Maintain all existing features (long-press, keyboard nav, etc.)
   - Unified card system across all entities

---

## Proposed Component Architecture

### Overview

Build a **flexible, composable card system** that supports:
1. Multiple layout modes (grid, list, compact, custom) via pluggable renderers
2. Per-entity UI customization (stored in user settings)
3. Consistent visual treatment across all entity types
4. Entity-specific features without breaking abstraction

### Architecture Philosophy

**Separation of Concerns:**
- **Data fetching** - EntitySearch (knows about API, filtering, pagination)
- **Layout rendering** - LayoutRenderer (knows about spacing, columns, arrangement)
- **Entity presentation** - Entity Cards (know about entity structure, not layout)
- **Visual primitives** - CardComponents (know about UI, not entities)
- **User preferences** - Zustand store + database (persisted state)

**Component Layering Strategy:**
```
Page Component (e.g., Scenes.jsx)
    └── EntityGrid (e.g., SceneGrid.jsx) - Entity-specific wrapper
            └── EntitySearch - Data fetching + search/filter UI
                    └── SearchResults - Layout mode controller (NEW)
                            └── LayoutRenderer - Grid/List/Compact renderer (NEW)
                                    └── Entity Card (e.g., SceneCard.jsx)
                                            └── BaseCard - Shared card structure
                                                    └── CardComponents - Primitives
```

### Component Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ User Settings Layer (Global State)                              │
│                                                                  │
│  useEntityDisplayPreferences('scene')                            │
│      ↓                                                           │
│  Zustand Store { scene: { showDescription: false } }            │
│      ↓                                                           │
│  Database EntityDisplayPreferences table                         │
└──────────────────────────────────────────────────────────────────┘
                              ↓ preferences object
┌──────────────────────────────────────────────────────────────────┐
│ Page Layer (e.g., /scenes)                                       │
│                                                                  │
│  <SceneGrid />  // Thin wrapper, just passes entity type         │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Data Layer (EntitySearch)                                      │
│                                                                  │
│  Responsibilities:                                               │
│  • API calls via libraryApi.findScenes()                         │
│  • Filter/sort state management                                  │
│  • Pagination logic                                              │
│  • URL sync (query params)                                       │
│  • Loading/error states                                          │
│                                                                  │
│  Passes down:                                                    │
│  • items[] - fetched entities                                    │
│  • onHideSuccess - callback to remove from local state           │
└──────────────────────────────────────────────────────────────────┘
                              ↓ renderItem prop
┌──────────────────────────────────────────────────────────────────┐
│ Layout Controller (SearchResults) - NEW COMPONENT                │
│                                                                  │
│  const { layoutType } = useEntityDisplayPreferences(entityType) │
│                                                                  │
│  return (                                                        │
│    <LayoutRenderer                                               │
│      layoutType={layoutType}  // 'grid' | 'list' | 'compact'    │
│      items={items}                                               │
│      renderItem={(item) => <SceneCard scene={item} ... />}       │
│    />                                                            │
│  )                                                               │
└──────────────────────────────────────────────────────────────────┘
                              ↓ layoutType switch
┌──────────────────────────────────────────────────────────────────┐
│ Layout Renderer (NEW COMPONENT)                                  │
│                                                                  │
│  switch (layoutType) {                                           │
│    case 'grid':                                                  │
│      return <GridLayout items={items} renderItem={renderItem} />│
│    case 'list':                                                  │
│      return <ListLayout items={items} renderItem={renderItem} />│
│    case 'compact':                                               │
│      return <CompactLayout ... />                               │
│  }                                                               │
│                                                                  │
│  Each layout knows ONLY about spacing/columns/arrangement        │
└──────────────────────────────────────────────────────────────────┘
                              ↓ calls renderItem(item)
┌──────────────────────────────────────────────────────────────────┐
│ Entity Card Layer (SceneCard, PerformerCard, etc.)               │
│                                                                  │
│  const { preferences } = useEntityDisplayPreferences('scene')    │
│                                                                  │
│  Responsibilities:                                               │
│  • Map entity data to card props (title, subtitle, indicators)  │
│  • Entity-specific behavior (scene selection, gestures)         │
│  • Compute derived data (allTags, indicators)                   │
│  • Build render slot content (overlays, previews)               │
│                                                                  │
│  return (                                                        │
│    <BaseCard                                                     │
│      title={getSceneTitle(scene)}                               │
│      displayPreferences={preferences}                            │
│      renderOverlay={() => <SelectionCheckbox />}                 │
│      renderImageContent={() => <VideoPreview />}                 │
│    />                                                            │
│  )                                                               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Base Card (Shared Structure)                                     │
│                                                                  │
│  Responsibilities:                                               │
│  • Consistent card anatomy (image → title → desc → indicators)  │
│  • Respect display preferences (conditionally render sections)  │
│  • Provide render slots for entity-specific content             │
│  • Backwards compatible with existing hideDescription prop      │
│                                                                  │
│  const shouldShow = hideDescription ? false :                    │
│                     displayPreferences.showDescription ?? true   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Card Primitives (CardComponents.jsx)                             │
│                                                                  │
│  • CardContainer - wrapper, hover, focus, link behavior          │
│  • CardImage - lazy loading, aspect ratio, placeholders          │
│  • CardTitle - line clamping, tooltips, fixed height             │
│  • CardDescription - line clamping, tooltips, fixed height       │
│  • CardIndicators - count badges with tooltips                   │
│  • CardRatingRow - rating, favorite, O counter, hide menu        │
│                                                                  │
│  Pure presentational, no entity logic                            │
└──────────────────────────────────────────────────────────────────┘
```

### Detailed Component Implementations

#### SearchResults Component (NEW)

**Location:** `client/src/components/ui/SearchResults.jsx`

This component replaces the current BaseGrid. It's layout-agnostic and delegates rendering to LayoutRenderer.

```jsx
import { LayoutRenderer } from './LayoutRenderer.jsx';
import { useEntityDisplayPreferences } from '../../hooks/useEntityDisplayPreferences.js';
import EmptyState from './EmptyState.jsx';
import Pagination from './Pagination.jsx';

/**
 * SearchResults - Layout-agnostic results renderer
 *
 * Responsibilities:
 * - Read user's layout preference
 * - Handle loading/empty/error states
 * - Delegate actual rendering to LayoutRenderer
 * - Manage pagination UI
 *
 * @param {Object} props
 * @param {string} props.entityType - Entity type for preferences lookup
 * @param {Array} props.items - Items to render
 * @param {Function} props.renderItem - Function to render each item
 * @param {boolean} props.loading - Loading state
 * @param {Error} props.error - Error object
 * @param {string} props.emptyMessage - Empty state message
 * @param {number} props.currentPage - Current page
 * @param {number} props.totalPages - Total pages
 * @param {Function} props.onPageChange - Page change handler
 * @param {Function} props.renderSkeleton - Custom skeleton renderer
 * @param {number} props.skeletonCount - Skeleton count while loading
 */
export const SearchResults = ({
  entityType,
  items,
  renderItem,
  loading = false,
  error,
  emptyMessage = "No items found",
  emptyDescription,
  currentPage,
  totalPages,
  onPageChange,
  renderSkeleton,
  skeletonCount = 24,
}) => {
  // Get user's layout preference for this entity type
  const { preferences } = useEntityDisplayPreferences(entityType);
  const layoutType = preferences.layoutType || 'grid'; // default to grid

  // Loading state - LayoutRenderer handles skeleton rendering
  if (loading) {
    return (
      <LayoutRenderer
        layoutType={layoutType}
        entityType={entityType}
        items={[]} // empty, will render skeletons
        renderItem={renderItem}
        renderSkeleton={renderSkeleton}
        skeletonCount={skeletonCount}
        loading={true}
      />
    );
  }

  // Error state
  if (error) {
    return (
      <EmptyState
        title="Error loading items"
        description={error.message || "An error occurred"}
      />
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
  }

  // Results
  return (
    <>
      <LayoutRenderer
        layoutType={layoutType}
        entityType={entityType}
        items={items}
        renderItem={renderItem}
        loading={false}
      />

      {/* Pagination - common across all layouts */}
      {totalPages > 1 && onPageChange && (
        <nav role="navigation" aria-label="Pagination" className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </nav>
      )}
    </>
  );
};
```

#### LayoutRenderer Component (NEW)

**Location:** `client/src/components/ui/LayoutRenderer.jsx`

Pure layout component - doesn't know about entities, just spacing and arrangement.

```jsx
import { GridLayout } from './layouts/GridLayout.jsx';
import { ListLayout } from './layouts/ListLayout.jsx';
import { CompactGridLayout } from './layouts/CompactGridLayout.jsx';

/**
 * LayoutRenderer - Pluggable layout system
 *
 * Responsibilities:
 * - Route to correct layout based on layoutType
 * - Each layout is pure - only knows about spacing/columns
 * - Extensible - easy to add new layouts
 *
 * @param {Object} props
 * @param {'grid'|'list'|'compact'} props.layoutType - Layout mode
 * @param {string} props.entityType - For grid type selection ('scene' vs 'standard')
 * @param {Array} props.items - Items to render
 * @param {Function} props.renderItem - Render function for each item
 * @param {boolean} props.loading - Loading state
 * @param {Function} props.renderSkeleton - Custom skeleton renderer
 * @param {number} props.skeletonCount - Number of skeletons
 */
export const LayoutRenderer = ({
  layoutType,
  entityType,
  items,
  renderItem,
  loading = false,
  renderSkeleton,
  skeletonCount = 24,
}) => {
  // Route to appropriate layout
  switch (layoutType) {
    case 'list':
      return (
        <ListLayout
          items={items}
          renderItem={renderItem}
          loading={loading}
          renderSkeleton={renderSkeleton}
          skeletonCount={skeletonCount}
        />
      );

    case 'compact':
      return (
        <CompactGridLayout
          items={items}
          renderItem={renderItem}
          loading={loading}
          renderSkeleton={renderSkeleton}
          skeletonCount={skeletonCount}
        />
      );

    case 'grid':
    default:
      return (
        <GridLayout
          entityType={entityType}
          items={items}
          renderItem={renderItem}
          loading={loading}
          renderSkeleton={renderSkeleton}
          skeletonCount={skeletonCount}
        />
      );
  }
};
```

#### GridLayout Component (NEW)

**Location:** `client/src/components/ui/layouts/GridLayout.jsx`

Extracted from current BaseGrid - pure layout logic.

```jsx
import { SCENE_GRID_CONTAINER_CLASSNAMES, STANDARD_GRID_CONTAINER_CLASSNAMES } from '../../../constants/grids.js';

/**
 * GridLayout - Responsive grid layout
 *
 * Pure layout component - only knows about:
 * - Grid classes (responsive columns)
 * - Skeleton rendering while loading
 *
 * Doesn't know about:
 * - Entities
 * - Data fetching
 * - Pagination (handled by SearchResults)
 */
export const GridLayout = ({
  entityType,
  items,
  renderItem,
  loading = false,
  renderSkeleton,
  skeletonCount = 24,
}) => {
  // Determine grid type based on entity
  const gridClasses = entityType === 'scene'
    ? SCENE_GRID_CONTAINER_CLASSNAMES
    : STANDARD_GRID_CONTAINER_CLASSNAMES;

  // Default skeleton renderer
  const defaultRenderSkeleton = () => (
    <div
      className="rounded-lg animate-pulse"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        height: entityType === 'scene' ? "20rem" : "24rem",
      }}
    />
  );

  const skeletonRenderer = renderSkeleton || defaultRenderSkeleton;

  // Loading state - render skeletons
  if (loading) {
    return (
      <div className={gridClasses}>
        {[...Array(skeletonCount)].map((_, i) => (
          <div key={i}>{skeletonRenderer()}</div>
        ))}
      </div>
    );
  }

  // Render actual items
  return (
    <div className={gridClasses}>
      {items.map((item, index) => renderItem(item, index))}
    </div>
  );
};
```

#### ListLayout Component (NEW - Future)

**Location:** `client/src/components/ui/layouts/ListLayout.jsx`

```jsx
/**
 * ListLayout - Horizontal row layout
 *
 * Similar to current SceneListItem, but generic for all entities.
 * Each item is a full-width row: [thumbnail | metadata | actions]
 */
export const ListLayout = ({
  items,
  renderItem,
  loading = false,
  renderSkeleton,
  skeletonCount = 12,
}) => {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(skeletonCount)].map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg animate-pulse"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.id || index}>
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
};
```

### How EntitySearch Changes

**Current EntitySearch:**
```jsx
// Currently returns BaseGrid directly
return (
  <SearchControls ...>
    <BaseGrid
      items={data}
      renderItem={(item, index) => renderItem(item, index, { onHideSuccess })}
      gridType={gridType}
      loading={isLoading}
      error={error}
      ...
    />
  </SearchControls>
);
```

**New EntitySearch (Phase 1 - Grid only):**
```jsx
// Phase 1: Use SearchResults instead of BaseGrid
return (
  <SearchControls ...>
    <SearchResults
      entityType={entityType}  // NEW - needed for preferences
      items={data}
      renderItem={(item, index) => renderItem(item, index, { onHideSuccess })}
      loading={isLoading}
      error={error}
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={onPageChange}
      ...
    />
  </SearchControls>
);
```

**Future EntitySearch (Phase 2 - Multiple layouts):**
```jsx
// Phase 2: SearchResults reads layoutType preference and renders accordingly
// No code changes needed - SearchResults handles it internally
return (
  <SearchControls ...>
    <SearchResults
      entityType={entityType}
      items={data}
      renderItem={(item, index) => renderItem(item, index, { onHideSuccess })}
      // ... SearchResults now switches between grid/list/compact automatically
    />
  </SearchControls>
);
```

### Code Sharing & DRY Principles

**1. All Entity Cards Share BaseCard**
```jsx
// SceneCard, PerformerCard, GalleryCard, etc. all do this:
return (
  <BaseCard
    entityType="scene"
    imagePath={...}
    title={...}
    displayPreferences={preferences}  // All read from same hook
    // Entity-specific customization via render slots
    renderOverlay={() => <SceneSpecificOverlay />}
  />
);
```

**2. All Grids Share EntitySearch**
```jsx
// PerformerGrid.jsx - minimal wrapper
const PerformerGrid = (props) => (
  <EntitySearch
    entityType="performer"
    renderItem={(performer, _, { onHideSuccess }) => (
      <PerformerCard performer={performer} onHideSuccess={onHideSuccess} />
    )}
    {...props}
  />
);
```

**3. Layout Logic Extracted**
- GridLayout = ONLY grid classes + skeleton rendering
- ListLayout = ONLY row spacing + skeleton rendering
- No entity knowledge, no data fetching, no preferences

**4. Preferences Centralized**
- One Zustand store for ALL entity preferences
- One database table for ALL entity preferences
- One hook `useEntityDisplayPreferences(entityType)` for ALL entities

### Migration Path (Phase 1)

**Step 1:** Replace BaseGrid with SearchResults (grid-only)
```jsx
// Before
<BaseGrid items={items} renderItem={renderItem} gridType="scene" />

// After
<SearchResults
  entityType="scene"
  items={items}
  renderItem={renderItem}
  // SearchResults internally uses GridLayout only (for now)
/>
```

**Step 2:** Add display preferences to cards
```jsx
// Before
<SceneCard scene={scene} hideDescription={false} />

// After
const { preferences } = useEntityDisplayPreferences('scene');
<SceneCard scene={scene} displayPreferences={preferences} />
```

**Why This Works:**
- SearchResults defaults to `layoutType='grid'` if not in preferences
- BaseCard defaults to `showDescription=true` if not in preferences
- Existing `hideDescription` prop overrides preferences (backwards compat)
- Zero visual changes until user changes preferences

### New Components & Services

#### 1. User Display Preferences (Database Schema)

**New Prisma Model:**
```prisma
model EntityDisplayPreferences {
  id          String   @id @default(cuid())
  userId      String
  entityType  String   // 'scene' | 'performer' | 'gallery' | etc.

  // Phase 1 settings
  showDescription Boolean @default(true)

  // Future settings (add in later phases)
  // showSubtitle    Boolean @default(true)
  // layoutType      String  @default("grid") // 'grid' | 'list' | 'compact'
  // cardDensity     String  @default("normal") // 'compact' | 'normal' | 'detailed'

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, entityType])
  @@index([userId])
}
```

#### 2. React Hook: `useEntityDisplayPreferences`

**Location:** `client/src/hooks/useEntityDisplayPreferences.js`

```javascript
import { create } from 'zustand';
import { apiGet, apiPost } from '../services/api';

// Zustand store for caching preferences
const usePreferencesStore = create((set) => ({
  preferences: {}, // { scene: { showDescription: true }, performer: { ... } }
  isLoaded: false,

  setPreferences: (prefs) => set({ preferences: prefs, isLoaded: true }),

  updatePreference: (entityType, updates) => set((state) => ({
    preferences: {
      ...state.preferences,
      [entityType]: { ...state.preferences[entityType], ...updates }
    }
  }))
}));

export const useEntityDisplayPreferences = (entityType) => {
  const { preferences, isLoaded, updatePreference } = usePreferencesStore();
  const [isSaving, setIsSaving] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    if (!isLoaded) {
      loadPreferences();
    }
  }, [isLoaded]);

  const loadPreferences = async () => {
    try {
      const data = await apiGet('/api/display-preferences');
      usePreferencesStore.getState().setPreferences(data);
    } catch (error) {
      console.error('Failed to load display preferences:', error);
    }
  };

  const updatePreferences = async (updates) => {
    setIsSaving(true);
    try {
      await apiPost(`/api/display-preferences/${entityType}`, updates);
      updatePreference(entityType, updates);
    } catch (error) {
      console.error('Failed to save display preferences:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Default preferences if not set
  const defaultPrefs = {
    showDescription: true
  };

  return {
    preferences: preferences[entityType] || defaultPrefs,
    updatePreferences,
    isSaving,
    isLoaded
  };
};
```

#### 3. Enhanced BaseCard

**Changes to `client/src/components/ui/BaseCard.jsx`:**

```jsx
export const BaseCard = forwardRef((
  {
    // Data
    entityType,
    imagePath,
    title,
    subtitle,
    description,
    linkTo,

    // Display preferences (NEW)
    displayPreferences = {},

    // Indicators & Rating
    indicators = [],
    ratingControlsProps,

    // Display options (keep for backwards compat)
    hideDescription = false,
    hideSubtitle = false,
    maxTitleLines = 2,
    maxDescriptionLines = 3,
    objectFit = "contain",

    // Customization slots
    renderOverlay,
    renderImageContent,
    renderAfterTitle,

    // Events & behavior
    onClick,
    className = "",
    referrerUrl,
    tabIndex,
    style,
    ...rest
  },
  ref
) => {
  const aspectRatio = useEntityImageAspectRatio(entityType);

  // Merge display preferences with explicit props (props take precedence)
  const shouldShowDescription = hideDescription === true
    ? false
    : (displayPreferences.showDescription ?? true);

  return (
    <CardContainer
      ref={ref}
      entityType={entityType}
      linkTo={linkTo}
      onClick={onClick}
      referrerUrl={referrerUrl}
      className={className}
      tabIndex={tabIndex}
      style={style}
      {...rest}
    >
      {/* Image Section */}
      <CardImage
        src={imagePath}
        alt={typeof title === "string" ? title : ""}
        aspectRatio={aspectRatio}
        entityType={entityType}
        objectFit={objectFit}
      >
        {renderImageContent?.()}
        {renderOverlay?.()}
      </CardImage>

      {/* Title Section */}
      <CardTitle
        title={title}
        subtitle={hideSubtitle ? null : subtitle}
        maxTitleLines={maxTitleLines}
      />

      {/* After Title Slot */}
      {renderAfterTitle?.()}

      {/* Description - now respects display preferences */}
      {shouldShowDescription && (
        <CardDescription
          description={description}
          maxLines={maxDescriptionLines}
        />
      )}

      {/* Indicators */}
      {indicators.length > 0 && <CardIndicators indicators={indicators} />}

      {/* Rating Controls */}
      {ratingControlsProps && (
        <CardRatingRow entityType={entityType} {...ratingControlsProps} />
      )}
    </CardContainer>
  );
});
```

#### 4. Migrate SceneCard to BaseCard

**New implementation of `client/src/components/ui/SceneCard.jsx`:**

```jsx
const SceneCard = forwardRef((
  {
    scene,
    onClick,
    onFocus,
    tabIndex = -1,
    className = "",
    isSelected = false,
    onToggleSelect,
    selectionMode = false,
    autoplayOnScroll = false,
    hideRatingControls = false,
    onHideSuccess,
    displayPreferences = {}, // NEW: from useEntityDisplayPreferences
  },
  ref
) => {
  const { isTVMode } = useTVMode();
  const navigate = useNavigate();
  const aspectRatio = useEntityImageAspectRatio("scene");

  // All existing state and handlers...
  const [isLongPressing, setIsLongPressing] = useState(false);
  // ... (keep all gesture detection logic)

  const title = getSceneTitle(scene);
  const description = getSceneDescription(scene);
  const subtitle = buildSceneSubtitle(scene); // Extract to utility
  const allTags = computeAllTags(scene); // Extract to utility
  const indicators = buildSceneIndicators(scene, allTags, navigate); // Extract to utility

  // Selection checkbox overlay
  const renderOverlay = () => (
    <div className="absolute top-2 left-2 z-20">
      <button
        onClick={handleCheckboxClick}
        className="w-8 h-8 sm:w-6 sm:h-6 rounded border-2 flex items-center justify-center transition-all"
        style={{
          backgroundColor: isSelected ? "var(--selection-color)" : "rgba(0, 0, 0, 0.5)",
          borderColor: isSelected ? "var(--selection-color)" : "rgba(255, 255, 255, 0.7)",
        }}
        aria-label={isSelected ? "Deselect scene" : "Select scene"}
      >
        {isSelected && <CheckmarkIcon />}
      </button>
    </div>
  );

  // Video preview + progress bar
  const renderImageContent = () => (
    <>
      <SceneCardPreview
        scene={scene}
        autoplayOnScroll={autoplayOnScroll}
        cycleInterval={600}
        spriteCount={10}
        duration={duration}
        resolution={resolution}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

      {/* Watch progress bar */}
      {scene.resumeTime && scene.files?.[0]?.duration && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 pointer-events-none">
          <div
            className="h-full transition-all pointer-events-none"
            style={{
              width: `${Math.min(100, (scene.resumeTime / scene.files[0].duration) * 100)}%`,
              backgroundColor: "var(--status-success)",
            }}
          />
        </div>
      )}
    </>
  );

  return (
    <BaseCard
      ref={ref}
      entityType="scene"
      imagePath={scene.paths?.screenshot}
      title={title}
      subtitle={subtitle}
      description={description}
      indicators={indicators}
      displayPreferences={displayPreferences} // NEW

      // Scene-specific render slots
      renderOverlay={renderOverlay}
      renderImageContent={renderImageContent}

      // Rating controls
      ratingControlsProps={!hideRatingControls && {
        entityType: "scene",
        entityId: scene.id,
        initialRating: scene.rating,
        initialFavorite: scene.favorite || false,
        initialOCounter: scene.o_counter,
        entityTitle: title,
        onHideSuccess,
      }}

      // Custom styling for selection
      className={`${isSelected ? "scene-card-selected" : ""} ${className}`}
      style={{
        borderColor: isSelected ? "var(--selection-color)" : "var(--border-color)",
        borderWidth: isSelected ? "2px" : "1px",
      }}

      // Events - wrapped to handle selection mode
      onClick={(e) => {
        // ... existing click handling logic
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      tabIndex={isTVMode ? tabIndex : -1}
    />
  );
});
```

### Refactoring Plan

#### Phase 1: Foundation (This Branch)

**1. Database & API**
- [ ] Add `EntityDisplayPreferences` Prisma model
- [ ] Create migration
- [ ] Add API endpoints (`GET /api/display-preferences`, `POST /api/display-preferences/:entityType`)
- [ ] Add integration tests

**2. Client Hooks & State**
- [ ] Create `useEntityDisplayPreferences` hook with Zustand store
- [ ] Add API service methods

**3. BaseCard Enhancement**
- [ ] Add `displayPreferences` prop to BaseCard
- [ ] Update description rendering logic to respect preferences
- [ ] Ensure backwards compatibility (existing hideDescription prop)

**4. Entity Card Updates**
- [ ] Update each entity card to pass `displayPreferences` to BaseCard
- [ ] Add `useEntityDisplayPreferences` to each grid component

**5. SceneCard Migration**
- [ ] Extract utilities: `buildSceneSubtitle`, `computeAllTags`, `buildSceneIndicators`
- [ ] Rewrite SceneCard to use BaseCard
- [ ] Test all scene-specific features (selection, gestures, preview, progress)
- [ ] Update tests

**6. Settings UI**
- [ ] Add "Display Preferences" section to user settings
- [ ] Per-entity toggles for "Show descriptions"
- [ ] Save/load from API

#### Phase 2: Extended Customization (Future)

**7. Additional Preferences**
- [ ] Show/hide subtitle
- [ ] Show/hide specific indicators
- [ ] Card density presets

**8. Alternative Layouts**
- [ ] Layout renderer abstraction
- [ ] List layout implementation
- [ ] Compact grid layout
- [ ] Entity-specific layouts (tag hierarchy, etc.)

---

## Benefits of This Approach

### 1. DRY & Maintainable
- **Single source of truth:** BaseCard for all entity cards
- **No duplication:** SceneCard no longer reimplements CardComponents
- **Consistent behavior:** Rating, favorite, hide all work identically

### 2. Extensible
- **Pluggable layouts:** Easy to add list/compact/custom layouts
- **Flexible preferences:** Database schema ready for future settings
- **Entity-specific features:** Render slots allow customization without breaking abstraction

### 3. User-Friendly
- **Personalization:** Per-entity display preferences
- **Synced across devices:** Database storage
- **Discoverable:** Settings UI makes customization obvious

### 4. Performance
- **Cached preferences:** Zustand store prevents repeated API calls
- **Lazy loading:** Existing CardImage lazy loading preserved
- **Optimistic updates:** UI updates immediately, API saves in background

### 5. Type-Safe
- **Server types:** Prisma schema generates TypeScript types
- **API contract:** Integration tests ensure correctness
- **Component props:** Clear interfaces for all cards

---

## Migration Strategy

### Backwards Compatibility

During migration, ensure:
1. **Existing cards continue to work** - `hideDescription` prop still respected
2. **No visual changes** - Default preferences match current behavior
3. **Progressive enhancement** - Preferences optional, graceful degradation

### Testing Strategy

**Unit Tests:**
- BaseCard with displayPreferences prop
- useEntityDisplayPreferences hook
- API endpoints

**Integration Tests:**
- Full preference save/load flow
- Multiple entity types
- Preference changes reflected in UI

**Manual Testing:**
- SceneCard selection mode
- SceneCard gestures (long-press, touch)
- SceneCard keyboard navigation
- Video preview autoplay
- All entity card types render correctly

---

## File Changes Summary

### New Files
- `server/prisma/migrations/YYYYMMDD_add_entity_display_preferences.sql`
- `server/controllers/displayPreferences.ts`
- `server/routes/displayPreferences.ts`
- `client/src/hooks/useEntityDisplayPreferences.js`
- `client/src/components/settings/DisplayPreferencesSection.jsx`

### Modified Files
- `server/types/api/displayPreferences.ts` (new)
- `client/src/components/ui/BaseCard.jsx` (add displayPreferences prop)
- `client/src/components/ui/SceneCard.jsx` (major refactor to use BaseCard)
- `client/src/components/cards/*.jsx` (all 6 entity cards - pass displayPreferences)
- `client/src/components/grids/*.jsx` (all 6 grids - use hook)
- `client/src/components/scene-search/SceneGrid.jsx` (use hook)
- `client/src/components/pages/Settings.jsx` (add display preferences section)

### Utilities to Extract
- `client/src/utils/sceneCard.js` - Scene-specific card utilities
  - `buildSceneSubtitle(scene)`
  - `computeAllTags(scene)`
  - `buildSceneIndicators(scene, allTags, navigate)`

---

## Revision History

- **2026-01-05:** Complete design document with detailed architecture
  - Completed component inventory (7 entity types, special patterns)
  - Identified 6 major inconsistencies with code examples
  - Documented current architecture and data flow
  - Established scope (all searchable entities)
  - Designed pluggable layout system (SearchResults → LayoutRenderer → GridLayout/ListLayout)
  - Created detailed component implementations with React patterns
  - Designed user preferences system (Zustand + database)
  - Created implementation plan with detailed checklist (6 phases)
  - Explained code sharing and DRY principles
  - Ready for implementation
