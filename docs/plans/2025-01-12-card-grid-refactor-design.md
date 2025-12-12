# Card & Grid Component Refactor Design

## Overview

Refactor the card and grid system to reduce duplication, improve consistency, and enable full-featured nested grids.

## Goals

- Reduce duplication/drift risk across all card types
- Improve developer velocity for adding new entity types
- Maintain visual consistency with type-specific variants
- Keep SceneCard's full feature set (selection, sprites, TV mode, progress)
- Nested grids = full search pages with locked parent filter
- Design for future list item compatibility (don't implement yet)

## Architecture

### Three-Layer Card System

```
Primitives (ui/CardComponents.jsx)
    └── CardContainer, CardImage, CardTitle, CardDescription,
        CardIndicators, CardRatingRow, CardOverlay, useLazyLoad

BaseCard (ui/BaseCard.jsx)
    └── Composes primitives, provides render slots for customization

Entity Cards (components/cards/)
    └── SceneCard, PerformerCard, GalleryCard, GroupCard,
        StudioCard, TagCard, ImageCard
```

### Two-Layer Grid System

```
BaseGrid (ui/BaseGrid.jsx)
    └── Layout, responsive columns, pagination, loading/empty states

SearchableGrid (ui/SearchableGrid.jsx)
    └── BaseGrid + search controls + data fetching + locked filters

Entity Grids (components/grids/)
    └── SceneGrid, PerformerGrid, GalleryGrid, GroupGrid,
        StudioGrid, TagGrid, ImageGrid
```

## Component Specifications

### Primitives (ui/CardComponents.jsx)

Existing components to keep:
- `CardContainer` - Wrapper (Link or div)
- `CardImage` - Image with aspect ratio, unified lazy loading
- `CardTitle` - Title + optional subtitle
- `CardDescription` - Clamped description text
- `CardIndicators` - Row of icon+count badges
- `CardRatingRow` - Rating, O-counter, favorite, menu

New component:
- `CardOverlay` - Positioned overlay for progress bars, selection checkboxes

Remove:
- `LazyImage` - fold into CardImage
- `CardDefaultImage` - fold into CardImage

### BaseCard (ui/BaseCard.jsx)

```typescript
interface BaseCardProps {
  // Data
  entityType: EntityType;
  imagePath: string;
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  linkTo?: string;

  // Indicators & Rating
  indicators?: IndicatorConfig[];
  ratingControlsProps?: RatingControlsProps;

  // Display options
  hideDescription?: boolean;
  hideSubtitle?: boolean;
  maxTitleLines?: number;
  maxDescriptionLines?: number;

  // Customization slots
  renderOverlay?: () => ReactNode;
  renderImageContent?: () => ReactNode;
  renderAfterTitle?: () => ReactNode;

  // Events & behavior
  onClick?: (e) => void;
  onLongPress?: () => void;
  className?: string;
}
```

### Entity Cards (components/cards/)

| Component | Complexity | Type-Specific Behavior |
|-----------|------------|------------------------|
| SceneCard | Complex | Selection mode, sprite preview, progress bar, TV mode, long-press |
| PerformerCard | Thin | Gender icon after title, performer indicators |
| GalleryCard | Thin | Image count indicator |
| GroupCard | Thin | Scene count, performer count |
| StudioCard | Thin | Scene count, child studio indicators |
| TagCard | Thin | Scene/performer/gallery counts |
| ImageCard | Thin | Resolution indicator, gallery link |

### BaseGrid (ui/BaseGrid.jsx)

```typescript
interface BaseGridProps {
  items: any[];
  renderItem: (item, index) => ReactNode;
  gridType: 'scene' | 'standard';
  loading?: boolean;
  error?: Error;
  emptyMessage?: string;
  emptyDescription?: string;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  skeletonCount?: number;
  renderSkeleton?: () => ReactNode;
}
```

### SearchableGrid (ui/SearchableGrid.jsx)

```typescript
interface SearchableGridProps {
  entityType: EntityType;
  lockedFilters?: FilterObject;
  hideLockedFilters?: boolean;
  gridType?: 'scene' | 'standard';
  renderItem: (item) => ReactNode;
  defaultSort?: SortConfig;
  defaultFilters?: FilterObject;
  onResultsChange?: (results) => void;
}
```

### Entity Grids (components/grids/)

SceneGrid includes selection mode and bulk actions.
All others are thin wrappers around SearchableGrid.

## Usage Examples

### Main search page

```jsx
<SceneGrid />
```

### Nested grid on detail page

```jsx
<SceneGrid
  lockedFilters={{ performer_id: performer.id }}
  hideLockedFilters
/>
```

### Multiple nested grids

```jsx
// PerformerDetail.jsx
<Tabs>
  <Tab label="Scenes">
    <SceneGrid lockedFilters={{ performer_id: id }} hideLockedFilters />
  </Tab>
  <Tab label="Groups">
    <GroupGrid lockedFilters={{ performer_id: id }} hideLockedFilters />
  </Tab>
  <Tab label="Galleries">
    <GalleryGrid lockedFilters={{ performer_id: id }} hideLockedFilters />
  </Tab>
</Tabs>
```

## File Structure

```
client/src/
  components/
    cards/
      SceneCard.jsx
      PerformerCard.jsx
      GalleryCard.jsx
      GroupCard.jsx
      StudioCard.jsx
      TagCard.jsx
      ImageCard.jsx
      index.js

    grids/
      SceneGrid.jsx
      PerformerGrid.jsx
      GalleryGrid.jsx
      GroupGrid.jsx
      StudioGrid.jsx
      TagGrid.jsx
      ImageGrid.jsx
      index.js

    ui/
      CardComponents.jsx
      BaseCard.jsx
      BaseGrid.jsx
      SearchableGrid.jsx
      useEntityImageAspectRatio.js

  constants/
    grids.js
```

## Migration Plan

### Files to DELETE
- `ui/GridCard.jsx` - Replaced by BaseCard
- `ui/EntityGrid.jsx` - Replaced by components/grids/*
- `scene-search/SceneGrid.jsx` - Moved to components/grids/

### Files to MOVE
- `ui/SceneCard.jsx` → `components/cards/SceneCard.jsx`
- `ui/PerformerCard.jsx` → `components/cards/PerformerCard.jsx`

### Files to CREATE
- `ui/BaseCard.jsx`
- `ui/BaseGrid.jsx`
- `ui/SearchableGrid.jsx`
- `components/cards/GalleryCard.jsx`
- `components/cards/GroupCard.jsx`
- `components/cards/StudioCard.jsx`
- `components/cards/TagCard.jsx`
- `components/cards/ImageCard.jsx`
- `components/cards/index.js`
- `components/grids/SceneGrid.jsx`
- `components/grids/PerformerGrid.jsx`
- `components/grids/GalleryGrid.jsx`
- `components/grids/GroupGrid.jsx`
- `components/grids/StudioGrid.jsx`
- `components/grids/TagGrid.jsx`
- `components/grids/ImageGrid.jsx`
- `components/grids/index.js`

### Files to REFACTOR
- `ui/CardComponents.jsx` - Remove LazyImage/CardDefaultImage, add CardOverlay

### Pages to UPDATE
- Scenes, Performers, Galleries, Groups, Studios, Tags, Images (search pages)
- PerformerDetail, StudioDetail, TagDetail, GroupDetail, GalleryDetail (detail pages)
