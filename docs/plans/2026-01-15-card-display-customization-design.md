# Card Display Customization Design

**Date:** 2026-01-15
**Version:** 3.2.0
**Status:** Approved

## Overview

This feature introduces card display customization for Peek 3.2.0, allowing users to control what information appears on entity cards and detail pages. Cards are the primary way users view content in Peek, so rather than introducing opinionated views, we give users granular control over card anatomy.

## Scope

Three main customization areas:

1. **Scene Code** - Toggle visibility of studio code (e.g., JAV codes) on Scene cards
2. **Description/Details** - Toggle visibility per entity type, with separate settings for cards vs detail pages
3. **Rating/Favorite/O Counter** - Toggle each control individually, per entity type, affecting both cards and detail pages

### Entity Types Covered

- Scene
- Performer
- Studio
- Gallery
- Group
- Tag
- Image

### What's NOT Customizable

- EntityMenu (3-dot menu) - Always visible for hide/action functionality
- Card indicators section - Out of scope for this phase
- Title/subtitle configuration - Out of scope for this phase

## Prerequisites

Before implementing the customization layer:

1. **Add description display to PerformerCard and ImageCard** - These currently hide descriptions; we need a uniform baseline
2. **Align skeleton loading heights** - Skeletons must match actual card anatomy for seamless loading transitions

## Data Model

### Database Schema

New field on User model in `schema.prisma`:

```prisma
cardDisplaySettings Json? // Stored as JSON object
```

### JSON Structure

```javascript
{
  scene: {
    showCodeOnCard: true,         // Scene-specific: studio code in subtitle
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRating: true,
    showFavorite: true,
    showOCounter: true
  },
  performer: {
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRating: true,
    showFavorite: true,
    showOCounter: true
  },
  studio: {
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRating: true,
    showFavorite: true,
    showOCounter: true
  },
  gallery: {
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRating: true,
    showFavorite: true,
    showOCounter: true
  },
  group: {
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRating: true,
    showFavorite: true,
    showOCounter: true
  },
  tag: {
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRating: true,
    showFavorite: true,
    showOCounter: true
  },
  image: {
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRating: true,
    showFavorite: true,
    showOCounter: true
  }
}
```

### Defaults

- All toggles default to `true` when not present (preserves current behavior)
- `showCodeOnCard` only exists for `scene` entity type

## Settings UI

### Settings Page (Customization Section)

Add a "Card Display" subsection under Customization with accordion/tabs per entity type:

```
Card Display
├── Scene
│   ├── [toggle] Show studio code on cards
│   ├── [toggle] Show description on cards
│   ├── [toggle] Show description on detail page
│   ├── [toggle] Show rating
│   ├── [toggle] Show favorite
│   └── [toggle] Show O counter
├── Performer
│   ├── [toggle] Show description on cards
│   ├── [toggle] Show description on detail page
│   ├── [toggle] Show rating
│   ├── [toggle] Show favorite
│   └── [toggle] Show O counter
├── Studio / Gallery / Group / Tag / Image
│   └── ... (same pattern as Performer)
```

### Quick Access (ContextSettings / Settings Cog)

Available on card grids and entity search pages. Shows only card-relevant toggles for the current entity type:

```
Card Display
├── [toggle] Show studio code (Scene only)
├── [toggle] Show description
├── [toggle] Show rating
├── [toggle] Show favorite
└── [toggle] Show O counter
```

Detail page toggles are only accessible via the main Settings page.

## Component Architecture

### useCardDisplaySettings Hook

```javascript
const { getSettings, updateSettings, isLoading } = useCardDisplaySettings();

// Get settings for an entity type (returns defaults if not set)
const sceneSettings = getSettings('scene');
// { showCodeOnCard: true, showDescriptionOnCard: true, ... }

// Update a specific setting
updateSettings('scene', 'showCodeOnCard', false);
```

Features:
- Fetches `cardDisplaySettings` from user API
- Caches in React context to avoid prop drilling
- Returns `true` defaults for missing settings
- Debounced persistence to API

### Card Component Integration

Each card reads from the hook and configures BaseCard:

```javascript
// In SceneCard.jsx
const { getSettings } = useCardDisplaySettings();
const settings = getSettings('scene');

// Build subtitle without code if disabled
const subtitle = buildSceneSubtitle(scene, { includeCode: settings.showCodeOnCard });

<BaseCard
  displayPreferences={{
    showDescription: settings.showDescriptionOnCard,
  }}
  ratingControlsProps={{
    ...existingProps,
    showRating: settings.showRating,
    showFavorite: settings.showFavorite,
    showOCounter: settings.showOCounter,
  }}
/>
```

### CardRatingRow Changes

Accept visibility props for individual controls:

```javascript
export const CardRatingRow = ({
  showRating = true,
  showFavorite = true,
  showOCounter = true,
  // ... existing props
}) => {
  return (
    <div className="flex justify-between items-center w-full my-1" style={{ height: "2rem" }}>
      {/* Left side: Rating badge */}
      {showRating && (
        <RatingBadge ... />
      )}

      {/* Right side: Controls + EntityMenu */}
      <div className="flex items-center gap-2">
        {showOCounter && <OCounterButton ... />}
        {showFavorite && <FavoriteButton ... />}
        <EntityMenu ... /> {/* Always visible */}
      </div>
    </div>
  );
};
```

### Detail Page Integration

Detail pages read from the same hook:

```javascript
const { getSettings } = useCardDisplaySettings();
const settings = getSettings('scene');

{settings.showDescriptionOnDetail && <DescriptionSection ... />}
{settings.showRating && <RatingControl ... />}
{settings.showFavorite && <FavoriteButton ... />}
{settings.showOCounter && <OCounterButton ... />}
```

## Skeleton Loading

### Height Alignment

Skeletons must match actual card heights. Key fixed heights:
- Image: aspect ratio (16/9 or 2/3 depending on entity)
- Title: line height × max lines
- Description: line height × max lines (when shown)
- Indicators: 3.5rem
- Rating row: 2rem

Width is implicit from grid layout.

### Settings-Aware Skeletons

Skeletons respect user settings to prevent jarring transitions:

```javascript
const { getSettings } = useCardDisplaySettings();
const settings = getSettings('scene');

<SkeletonCard
  entityType="scene"
  showDescription={settings.showDescriptionOnCard}
  showRatingRow={settings.showRating || settings.showFavorite || settings.showOCounter}
/>
```

Since EntityMenu always shows, the rating row always renders - but skeleton contents adapt based on which controls are enabled.

## Behavior Notes

### Grid Alignment

Cards in a grid must have aligned anatomy (image edges, titles, descriptions align horizontally). When a section is toggled OFF:
- Space collapses entirely (cards become shorter)
- All cards of that entity type remain aligned with each other
- Grids are single-entity-type, so cross-entity alignment is not a concern

### PlaylistDetail Items

PlaylistDetail scene items follow the same settings as regular Scene cards.

### Scene Code Toggle

- Only affects the card subtitle (removes code from "CODE • 2024-01-15 • Studio Name")
- Scene detail page always shows the code in its dedicated location

## Implementation Order

### Phase 1: Foundation (Prerequisites)

1. Add description to PerformerCard and ImageCard
2. Audit and fix skeleton heights to match actual card anatomy

### Phase 2: Core Infrastructure

3. Database migration - Add `cardDisplaySettings` JSON field to User model
4. API endpoint - Extend user settings endpoints to handle `cardDisplaySettings`
5. Create `useCardDisplaySettings` hook with React context

### Phase 3: Card Customization

6. Scene code toggle - Implement `showCodeOnCard` for Scene cards
7. Description toggle (cards) - Implement `showDescriptionOnCard` for all entity types
8. Rating controls toggles - Implement `showRating`, `showFavorite`, `showOCounter` for all entity types

### Phase 4: Detail Page Integration

9. Description toggle (detail pages) - Implement `showDescriptionOnDetail`
10. Rating controls on detail pages - Hide controls based on same settings

### Phase 5: Settings UI

11. Settings page UI - Add Card Display subsection to Customization
12. ContextSettings integration - Add quick access to card grids
13. Search page settings cog - Add quick access to entity search pages

### Phase 6: Skeleton Adaptation

14. Update skeleton components to adapt to user's display settings

## File Changes

### New Files

- `client/src/hooks/useCardDisplaySettings.js` - Settings hook/context
- `server/prisma/migrations/XXXX_add_card_display_settings.sql` - Migration

### Modified Files

**Database/API:**
- `server/prisma/schema.prisma` - Add `cardDisplaySettings` field
- `server/src/routes/user.js` (or similar) - Handle new settings field

**Cards:**
- `client/src/components/ui/SceneCard.jsx` - Scene code toggle, pass display preferences
- `client/src/components/ui/BaseCard.jsx` - May need minor adjustments for control visibility
- `client/src/components/ui/CardComponents.jsx` - CardRatingRow visibility props
- `client/src/components/cards/PerformerCard.jsx` - Add description, integrate settings
- `client/src/components/cards/ImageCard.jsx` - Add description, integrate settings
- `client/src/components/cards/StudioCard.jsx` - Integrate settings
- `client/src/components/cards/GalleryCard.jsx` - Integrate settings
- `client/src/components/cards/GroupCard.jsx` - Integrate settings
- `client/src/components/cards/TagCard.jsx` - Integrate settings

**Detail Pages:**
- `client/src/components/pages/SceneDetails.jsx` - Respect settings
- `client/src/components/pages/PerformerDetails.jsx` - Respect settings
- `client/src/components/pages/StudioDetails.jsx` - Respect settings
- `client/src/components/pages/GalleryDetails.jsx` - Respect settings
- `client/src/components/pages/GroupDetails.jsx` - Respect settings
- `client/src/components/pages/TagDetails.jsx` - Respect settings
- `client/src/components/pages/ImageDetails.jsx` - Respect settings

**Skeletons:**
- `client/src/components/ui/SkeletonSceneCard.jsx` - Fix heights, respect settings
- (may need entity-specific skeletons or a configurable component)

**Settings UI:**
- `client/src/components/pages/Settings.jsx` (or Customization section) - Card Display UI
- `client/src/components/ui/ContextSettings.jsx` - Add card display options
