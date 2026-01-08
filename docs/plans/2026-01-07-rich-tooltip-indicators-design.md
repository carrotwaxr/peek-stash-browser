# Rich Tooltip Indicators Design

**Date:** 2026-01-07
**Branch:** feature/ui-relationship-consistency
**Status:** In Progress

## Problem Statement

Card indicators (performer count, tag count, etc.) have inconsistent behavior:
- SceneCard, ImageCard, GalleryCard have rich tooltips showing entity previews
- PerformerCard, TagCard, StudioCard, GroupCard only show counts or navigation links
- Users can't preview related entities without clicking through

## Goal

Make indicator tooltips consistent across all card types, with a configuration system that can later be user-customizable.

## Design Decisions

### 1. Indicator Behavior Types

Three behaviors for indicators:
- **`rich`** - Shows TooltipEntityGrid with entity previews (id, name, image)
- **`nav`** - Count only, clicking navigates to filtered list
- **`count`** - Count only, no interaction (for N/A relationships)

### 2. Entity-Specific Rules

**Always `nav` (too many items for tooltip):**
- Scenes indicators
- Images indicators

**Default `rich` (reasonable counts, valuable preview):**
- Performers indicators
- Tags indicators
- Studios indicators
- Groups indicators
- Galleries indicators

### 3. Indicator Behavior Config

```javascript
// client/src/config/indicatorBehaviors.js

/**
 * Indicator behavior configuration
 *
 * Future: This will be sourced from user settings in the database.
 * Users will be able to customize behavior per card type per relationship.
 *
 * Behaviors:
 * - 'rich': Show TooltipEntityGrid with entity previews
 * - 'nav': Count + click navigates to filtered list
 * - 'count': Count only, no interaction
 */

export const INDICATOR_BEHAVIORS = {
  // SceneCard indicators
  scene: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'count',  // N/A
    images: 'count',  // N/A
  },

  // ImageCard indicators
  image: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'count',  // N/A
    images: 'count',  // N/A
  },

  // GalleryCard indicators
  gallery: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'count',  // N/A
    scenes: 'nav',       // Too many
    images: 'nav',       // Too many
  },

  // PerformerCard indicators
  performer: {
    performers: 'count',  // N/A - no performer-to-performer
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',        // Too many
    images: 'nav',        // Too many
  },

  // TagCard indicators
  tag: {
    performers: 'rich',
    tags: 'count',        // N/A - no tag-to-tag on cards
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',        // Too many
    images: 'nav',        // Too many
  },

  // StudioCard indicators
  studio: {
    performers: 'nav',    // Too many for tooltip preview
    tags: 'rich',
    studios: 'count',     // N/A - parent/child handled separately
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',        // Too many
    images: 'nav',        // Too many
  },

  // GroupCard indicators
  group: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',       // Sub-groups
    galleries: 'rich',
    scenes: 'nav',        // Too many
    images: 'nav',        // Too many
  },
};

/**
 * Get indicator behavior for a card type and relationship
 */
export function getIndicatorBehavior(cardType, relationshipType) {
  return INDICATOR_BEHAVIORS[cardType]?.[relationshipType] ?? 'count';
}
```

### 4. TooltipEntityGrid Data Requirements

For rich tooltips, each entity type needs minimal fields:

| Entity Type | Required Fields | Image Field |
|-------------|-----------------|-------------|
| performer | id, name | image_path |
| tag | id, name | image_path |
| studio | id, name | image_path |
| group | id, name | front_image_path |
| gallery | id, title | cover |

### 5. API Response Changes

**PerformerQueryBuilder - Add to response:**
```typescript
// Currently returns:
tags: [{id, name}]  // Missing image_path

// Need to add:
tags: [{id, name, image_path}]
groups: [{id, name, front_image_path}]
galleries: [{id, title, cover}]
studios: [{id, name, image_path}]  // Studios performer has appeared with
```

**TagQueryBuilder - Add to response:**
```typescript
performers: [{id, name, image_path}]
studios: [{id, name, image_path}]
groups: [{id, name, front_image_path}]
galleries: [{id, title, cover}]
```

**StudioQueryBuilder - Add to response:**
```typescript
performers: [{id, name, image_path}]
tags: [{id, name, image_path}]
groups: [{id, name, front_image_path}]
galleries: [{id, title, cover}]
```

**GroupQueryBuilder - Add to response:**
```typescript
performers: [{id, name, image_path}]
tags: [{id, name, image_path}]
studios: [{id, name, image_path}]
galleries: [{id, title, cover}]
```

### 6. Current State Analysis

**Cards with rich tooltips (already working):**
- SceneCard: performers, groups, tags, galleries
- ImageCard: performers, tags, galleries (via inheritance)
- GalleryCard: performers, tags, scenes

**Cards needing updates:**
- PerformerCard: All 6 indicators are count-only
- TagCard: All 7 indicators are nav-only or count
- StudioCard: All 6 indicators are nav-only or count
- GroupCard: All 4 indicators are nav-only

**Existing indicators by card:**

| Card | Indicators Present |
|------|-------------------|
| SceneCard | PLAY_COUNT, PERFORMERS, GROUPS, GALLERIES, TAGS |
| ImageCard | PERFORMERS, TAGS, GALLERIES, resolution |
| GalleryCard | PERFORMERS, TAGS, SCENES, IMAGES |
| PerformerCard | PLAY_COUNT, SCENES, GROUPS, IMAGES, GALLERIES, TAGS |
| TagCard | PLAY_COUNT, SCENES, IMAGES, GALLERIES, GROUPS, STUDIOS, PERFORMERS |
| StudioCard | PLAY_COUNT, SCENES, IMAGES, GALLERIES, PERFORMERS, TAGS |
| GroupCard | SCENES, GROUPS, PERFORMERS, TAGS |

## Implementation Plan

### Phase 1: Tests First
1. Write integration tests that verify API responses include required fields for rich tooltips
2. Tests should check: performers have tags with image_path, groups, galleries, studios
3. Tests should check: tags have performers, studios, groups, galleries
4. Tests should check: studios have performers, tags, groups, galleries
5. Tests should check: groups have performers, tags, studios, galleries

### Phase 2: Server Changes
1. Update PerformerQueryBuilder.populateRelations() to include image_path on tags
2. Add groups, galleries, studios relations to performer response
3. Update TagQueryBuilder to include performers, studios, groups, galleries
4. Update StudioQueryBuilder to include performers, tags, groups, galleries
5. Update GroupQueryBuilder to include performers, tags, studios, galleries

### Phase 3: Client Config
1. Create indicatorBehaviors.js config file
2. Export getIndicatorBehavior() helper function

### Phase 4: Client Card Updates
1. Update PerformerCard to use config and TooltipEntityGrid
2. Update TagCard to use config and TooltipEntityGrid
3. Update StudioCard to use config and TooltipEntityGrid
4. Update GroupCard to use config and TooltipEntityGrid

### Phase 5: Verification
1. Run all integration tests
2. Run client unit tests
3. Manual verification of tooltip behavior on each card type

## Future Enhancement: User Settings

When implementing user settings:

1. Add database table for user indicator preferences
2. API endpoint to get/set preferences
3. Replace hardcoded INDICATOR_BEHAVIORS with user settings
4. Add settings UI for customization
5. Settings structure mirrors config: cardType -> relationshipType -> behavior

## Files to Modify

**Server:**
- server/services/PerformerQueryBuilder.ts
- server/services/TagQueryBuilder.ts
- server/services/StudioQueryBuilder.ts
- server/services/GroupQueryBuilder.ts
- server/integration/api/performers.integration.test.ts
- server/integration/api/tags.integration.test.ts
- server/integration/api/studios.integration.test.ts
- server/integration/api/groups.integration.test.ts

**Client:**
- client/src/config/indicatorBehaviors.js (new)
- client/src/components/cards/PerformerCard.jsx
- client/src/components/cards/TagCard.jsx
- client/src/components/cards/StudioCard.jsx
- client/src/components/cards/GroupCard.jsx
