# Custom Carousels Implementation Plan

## Overview

Allow users to create custom homepage carousels using a visual query builder. Users can define filter rules, sort order, and customize appearance (title, icon) to create personalized content collections.

## Design Philosophy

**Visual Query Builder** - Inspired by Plex Smart Collections and Jellyfin Smart Playlists, use a visual rule-based interface instead of JSON/code editing.

**DRY Architecture** - Extend existing `filterConfig.js` with metadata needed for carousel builder. Scene Search and Carousel Builder share the same filter definitions, so new filters automatically work in both systems.

**Scene Search Parity** - The carousel builder should support ALL filter capabilities from Scene Search. Users should be able to reproduce any Scene Search query as a carousel.

**Mobile-Friendly** - Full-page editor (not modal) for better mobile UX. Up/down buttons for reordering (not drag-and-drop).

## UI/UX Design

### Carousel Settings Page (existing `/settings` page, Carousels section)

**Layout:**
- List of all carousels (hardcoded + custom)
- Hardcoded carousels: Toggle visibility, reorder (up/down buttons), cannot edit/delete
- Custom carousels: Toggle visibility, reorder, edit, delete
- "Create Custom Carousel" button (disabled if at 15 custom limit)
- Shows count: "X/15 custom carousels"

**Custom Carousel Cards:**
```
┌─────────────────────────────────────────────────────┐
│ [↑][↓] 🎬 My Favorite Action Scenes            [👁] │
│        3 rules • Sort: Random                       │
│        [Edit] [Delete]                              │
│        ⚠️ Query failed - click Edit to fix (if broken)
└─────────────────────────────────────────────────────┘
```

### Carousel Builder Page (`/settings/carousels/new` or `/settings/carousels/:id/edit`)

**Header:**
- Back button
- Title input field
- Icon selector (curated Lucide icon picker)

**Query Builder:**
```
Filter Rules (ALL must match):
┌─────────────────────────────────────────────────────┐
│ [Performers ▾] [includes ▾] [Select...]         [×] │
│ [Rating ▾] [greater than ▾] [80____]            [×] │
│ [Tags ▾] [excludes ▾] [Select...]               [×] │
└─────────────────────────────────────────────────────┘
[+ Add Rule]

Sort by: [Random ▾] [Descending ▾]
Limit: 12 scenes (fixed, not editable)

[Preview Results] [Save Carousel] [Cancel]
```

**Validation:**
- Preview must succeed before Save is enabled
- At least one rule required
- Title required (non-empty)

**Icon Selector:**
- Grid of ~50 curated Lucide icons relevant to media browsing
- Search/filter by name
- Selected icon highlighted

**Preview Results:**
- Inline section (not modal) showing matching scenes
- Uses same SceneCard component as Scene Search
- Shows: "Showing 12 scenes" (no total count query)

## Architecture

### Database Schema

```prisma
model UserCarousel {
  id        String   @id @default(uuid())
  userId    Int
  title     String
  icon      String   @default("Film")  // Lucide icon name

  // Query definition (matches Scene Search filter format)
  rules     Json     // Scene filter object (same format as buildSceneFilter output)
  sort      String   @default("random")
  direction String   @default("DESC")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

**Rules JSON Structure:**
Stored in the same format as `buildSceneFilter()` output, making it directly usable:
```json
{
  "tags": {
    "value": ["tag-id-1", "tag-id-2"],
    "modifier": "INCLUDES"
  },
  "rating100": {
    "value": 79,
    "modifier": "GREATER_THAN"
  },
  "performers": {
    "value": ["performer-id-1"],
    "modifier": "INCLUDES"
  }
}
```

This is the same format used by Scene Search, so no conversion needed.

### ID Strategy

- **Hardcoded carousels**: Use `fetchKey` strings (e.g., `"continueWatching"`, `"highRatedScenes"`)
- **Custom carousels**: Use UUID prefixed with `"custom-"` (e.g., `"custom-a1b2c3d4-e5f6-..."`)
- **`User.carouselPreferences`**: Single source of truth for order/visibility of ALL carousels
  ```json
  [
    { "id": "continueWatching", "enabled": true, "order": 0 },
    { "id": "custom-uuid-123", "enabled": true, "order": 1 },
    { "id": "highRatedScenes", "enabled": false, "order": 2 }
  ]
  ```

### API Endpoints

**Carousel CRUD:**
- `GET /api/carousels` - List user's custom carousels
- `POST /api/carousels` - Create new carousel (max 15 enforced)
- `GET /api/carousels/:id` - Get single carousel
- `PUT /api/carousels/:id` - Update carousel
- `DELETE /api/carousels/:id` - Delete carousel

**Preview:**
- `POST /api/carousels/preview` - Preview results without saving
  - Body: `{ rules, sort, direction }`
  - Returns: `{ scenes: [...] }` (12 scenes)

### Extending filterConfig.js (DRY Approach)

Instead of creating a new `filterSchema.js`, extend existing `SCENE_FILTER_OPTIONS` with metadata for the carousel builder:

```javascript
// Add to each filter option in SCENE_FILTER_OPTIONS:
{
  key: "performerIds",
  label: "Performers",
  type: "searchable-select",
  entityType: "performers",
  multi: true,
  defaultValue: [],
  placeholder: "Select performers...",
  modifierOptions: MULTI_MODIFIER_OPTIONS,
  modifierKey: "performerIdsModifier",
  defaultModifier: "INCLUDES",

  // NEW: Carousel builder metadata
  carouselSupported: true,  // Include in carousel builder
  carouselLabel: "Performers",  // Display name in rule dropdown
}
```

**Helper function to get carousel-compatible filters:**
```javascript
export const getCarouselFilters = () =>
  SCENE_FILTER_OPTIONS.filter(f => f.carouselSupported !== false && f.type !== 'section-header');
```

### Frontend Components

**File Structure:**
```
client/src/components/
  carousel-builder/
    CarouselBuilder.jsx       - Main editor page (full-page)
    CarouselPreview.jsx       - Preview results section
    IconPicker.jsx            - Lucide icon grid selector
    RuleBuilder.jsx           - Container for filter rules
    RuleRow.jsx               - Single rule editor row

  settings/
    CarouselSettings.jsx      - Update existing to handle custom carousels
```

**Reuse existing filter components:**
- `SearchableSelect` - For entity pickers (performers, tags, studios, groups)
- Range inputs, date pickers, etc. from Scene Search

### Homepage Integration

**Updated Home.jsx flow:**

1. Fetch user settings (includes `carouselPreferences`)
2. Fetch custom carousels from `/api/carousels`
3. Merge hardcoded + custom carousel definitions
4. Sort by user preferences
5. Filter to enabled only
6. Render each carousel, handling errors gracefully

```javascript
// For custom carousels, query function is built dynamically:
const buildCustomCarouselQuery = (carousel) => async () => {
  try {
    const response = await libraryApi.findScenes({
      filter: {
        page: 1,
        per_page: 12,
        sort: carousel.sort,
        direction: carousel.direction,
      },
      scene_filter: carousel.rules,
    });
    return { scenes: response?.findScenes?.scenes || [], error: null };
  } catch (error) {
    return { scenes: [], error: error.message };
  }
};
```

**Error handling on homepage:**
- If a custom carousel query fails, show friendly error card:
  ```
  ┌─────────────────────────────────────────────────────┐
  │ ⚠️ "My Action Scenes" couldn't load                 │
  │ The query may need to be updated.                   │
  │ [Edit Carousel]                                     │
  └─────────────────────────────────────────────────────┘
  ```

### Preference Migration

Update `migrateCarouselPreferences()` in `carousels.js`:
- Keep existing logic for hardcoded carousels
- Preserve custom carousel preferences (don't remove unknown IDs that start with "custom-")
- Clean up preferences for deleted custom carousels (carousel no longer exists in DB)

## Implementation Phases

### Phase 1: Database & API Foundation

**Tasks:**
1. Add `UserCarousel` model to Prisma schema
2. Add `userCarousels` relation to User model
3. Generate and run migration
4. Create `server/controllers/carousel.ts` with CRUD operations
5. Create `server/routes/carousel.ts` and wire up routes
6. Add preview endpoint
7. Add max 15 carousel limit validation
8. Add unit tests for carousel controller

**Files:**
- `server/prisma/schema.prisma`
- `server/controllers/carousel.ts` (new)
- `server/routes/carousel.ts` (new)
- `server/api.ts` (add routes)

### Phase 2: Filter Schema Extension (DRY)

**Tasks:**
9. Add `carouselSupported` flag to all `SCENE_FILTER_OPTIONS` entries
10. Add `getCarouselFilters()` helper function
11. Clean up dead carousel metadata in `CarouselSettings.jsx` (longScenes, highBitrateScenes, barelyLegalScenes)
12. Add unit tests for filter schema helpers
13. Verify Scene Search still works (regression test)

**Files:**
- `client/src/utils/filterConfig.js` (extend)
- `client/src/components/settings/CarouselSettings.jsx` (cleanup)

### Phase 3: Carousel Builder UI

**Tasks:**
14. Create `IconPicker.jsx` with curated Lucide icon list
15. Create `RuleRow.jsx` - single filter rule editor
16. Create `RuleBuilder.jsx` - container managing multiple rules
17. Create `CarouselPreview.jsx` - preview results display
18. Create `CarouselBuilder.jsx` - main full-page editor
19. Add route `/settings/carousels/new` and `/settings/carousels/:id/edit`
20. Wire up Preview button (must succeed to enable Save)
21. Wire up Save/Cancel actions
22. Add form validation (title required, at least one rule)

**Files:**
- `client/src/components/carousel-builder/IconPicker.jsx` (new)
- `client/src/components/carousel-builder/RuleRow.jsx` (new)
- `client/src/components/carousel-builder/RuleBuilder.jsx` (new)
- `client/src/components/carousel-builder/CarouselPreview.jsx` (new)
- `client/src/components/carousel-builder/CarouselBuilder.jsx` (new)
- `client/src/App.jsx` (add routes)

### Phase 4: Carousel Management UI

**Tasks:**
23. Update `CarouselSettings.jsx` to fetch and display custom carousels
24. Add Edit/Delete buttons for custom carousels
25. Add "Create Custom Carousel" button with count (X/15)
26. Add delete confirmation modal
27. Add broken carousel indicator (warning icon + "Edit to fix")
28. Integrate custom carousel IDs into reorder/toggle logic
29. Update preference save to include custom carousel IDs

**Files:**
- `client/src/components/settings/CarouselSettings.jsx` (major update)

### Phase 5: Homepage Integration

**Tasks:**
30. Fetch custom carousels in `Home.jsx`
31. Merge hardcoded + custom carousels
32. Build dynamic query functions for custom carousels
33. Add error state rendering for failed carousels
34. Update `migrateCarouselPreferences()` to handle custom carousel IDs
35. Add "Edit Carousel" link from error state
36. Test carousel rendering with various rule combinations

**Files:**
- `client/src/components/pages/Home.jsx` (update)
- `client/src/constants/carousels.js` (update migration)
- `client/src/hooks/useHomeCarouselQueries.js` (may need updates)

### Phase 6: Testing & Polish

**Tasks:**
37. Test carousel creation with all filter types
38. Test carousel editing and deletion
39. Test reordering (up/down buttons)
40. Test preview functionality
41. Test max 15 carousel limit enforcement
42. Test with user content restrictions
43. Test with hidden entities
44. Test broken carousel handling (delete referenced entity)
45. Mobile responsiveness testing
46. Add loading states
47. Add empty states ("No custom carousels yet")
48. Final regression test on Scene Search

## Error Handling Strategy

### Builder Errors
- **Preview fails**: Show error message, keep Save disabled
- **Save fails**: Show error toast, don't navigate away
- **Invalid rules**: Validation prevents save

### Homepage Errors
- **Query fails**: Show friendly error card with "Edit Carousel" link
- **Carousel deleted but in preferences**: Clean up on next preference save

### Settings Errors
- **Broken carousel**: Show warning icon, "Query failed - Edit to fix"
- **Load fails**: Show error message, retry button

## Curated Icon List

```javascript
export const CAROUSEL_ICONS = [
  // Film & Video
  "Film", "Video", "Play", "PlayCircle", "Clapperboard", "Tv", "Monitor",

  // Favorites & Collections
  "Heart", "Star", "Bookmark", "Award", "Trophy", "Crown", "Gem",

  // Time & Recency
  "Clock", "Calendar", "TrendingUp", "Zap", "Flame", "Hourglass",

  // Discovery & Search
  "Eye", "Sparkles", "Target", "Compass", "Search", "Filter",

  // Quality & Rating
  "ThumbsUp", "ThumbsDown", "Shield", "Diamond", "Medal",

  // People & Groups
  "Users", "User", "UserCheck", "UsersRound",

  // Organization
  "Building", "Tag", "Folder", "FolderHeart", "Library", "Layers",

  // Misc Media
  "Camera", "Headphones", "Music", "Mic", "Radio",

  // Actions & States
  "Check", "X", "AlertCircle", "Info", "HelpCircle",

  // Fun & Mood
  "Smile", "PartyPopper", "Gift", "Cake", "Sun", "Moon"
];
```

## Testing Checklist

### Carousel Builder
- [ ] Create carousel with single rule
- [ ] Create carousel with multiple rules (all filter types)
- [ ] Test each filter type works correctly
- [ ] Test each modifier works correctly
- [ ] Preview shows correct results
- [ ] Save disabled until preview succeeds
- [ ] Edit existing carousel loads correctly
- [ ] Cancel returns without saving
- [ ] Icon picker works
- [ ] Title validation (required)
- [ ] Sort/direction options work

### Carousel Management
- [ ] List shows hardcoded + custom carousels
- [ ] Reorder with up/down buttons works
- [ ] Toggle visibility works
- [ ] Edit button navigates to builder
- [ ] Delete button shows confirmation
- [ ] Delete removes carousel
- [ ] Max 15 limit enforced
- [ ] Broken carousel shows warning

### Homepage
- [ ] Custom carousels render correctly
- [ ] Random sort shows different scenes on refresh
- [ ] Error state shows for broken carousels
- [ ] "Edit Carousel" link works from error state
- [ ] Disabled carousels don't show
- [ ] Order matches user preferences

### Regression Tests
- [ ] Scene Search still works with all filters
- [ ] Hardcoded carousels still work
- [ ] Existing carousel preferences preserved
- [ ] Content restrictions apply to custom carousels
- [ ] Hidden entities excluded from custom carousels

### Mobile
- [ ] Builder UI responsive
- [ ] Icon picker usable on mobile
- [ ] Rule rows don't overflow
- [ ] Preview scrollable

---

**Document Created:** 2025-01-21
**Document Updated:** 2025-01-26
**Implementation Status:** Planning Phase - Refined
**Key Decisions:**
- ALL mode only (matches Scene Search behavior)
- Expose all Scene Search filters
- Up/down buttons for reordering (not drag-and-drop)
- Preview must succeed before save enabled
- Graceful error handling on homepage
