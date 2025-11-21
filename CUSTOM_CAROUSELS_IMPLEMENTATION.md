# Custom Carousels Implementation Plan

## Overview

Allow users to create custom homepage carousels using a visual query builder. Users can define filter rules, sort order, and customize appearance (title, icon) to create personalized content collections.

## Design Philosophy

**Visual Query Builder** - Inspired by Plex Smart Collections and Jellyfin Smart Playlists, use a visual rule-based interface instead of JSON/code editing.

**DRY Architecture** - Share filter schema between Scene Search and Carousel Builder so new scene filters automatically work in both systems.

**Mobile-Friendly** - Full-page editor (not modal) for better mobile UX.

## UI/UX Design

### Carousel Settings Page (`/settings/carousels`)

**Layout:**
- List of all carousels (hardcoded + custom)
- Hardcoded carousels: Toggle visibility, reorder, cannot edit/delete
- Custom carousels: Toggle visibility, reorder, edit, delete
- "Create Custom Carousel" button (disabled if at 15 custom limit)
- Drag-and-drop reordering for all carousels

**Custom Carousel Cards:**
```
┌─────────────────────────────────────────┐
│ 🎬 My Favorite Action Scenes       [≡]  │
│ 3 rules • Sort: Random • 12 scenes      │
│ [Edit] [Preview] [Delete] [Toggle ●]    │
└─────────────────────────────────────────┘
```

### Carousel Builder Page (`/settings/carousels/new` or `/settings/carousels/:id/edit`)

**Header:**
- Title input field
- Icon selector (curated Lucide icon picker)
- Back button

**Query Builder:**
```
Match [Any ▾] of the following rules:
┌─────────────────────────────────────────┐
│ [Performers ▾] [includes ▾] [Select...] [×] │
│ [Rating ▾] [greater than ▾] [80____]   [×] │
│ [Tags ▾] [excludes ▾] [Select...]      [×] │
└─────────────────────────────────────────┘
[+ Add Rule]

Sort by: [Random ▾] [Descending ▾]
Limit: 12 scenes (fixed)

[Preview Results] [Save Carousel] [Cancel]
```

**Icon Selector:**
- Grid of ~50 curated Lucide icons relevant to media browsing
- Categories: Film, TV, Music, Gaming, Genres, Moods, etc.
- Selected icons: Film, Heart, Star, Flame, Zap, Trophy, Calendar, Clock, Eye, Play, etc.

**Preview Results:**
- Opens preview modal/section showing matching scenes
- Uses same SceneGrid component as Scene Search
- Shows count: "Found 847 scenes matching rules (showing 12)"

## Architecture

### Database Schema

```prisma
model UserCarousel {
  id        String   @id @default(uuid())
  userId    String
  title     String
  icon      String   // Lucide icon name (e.g., "Film", "Heart")
  enabled   Boolean  @default(true)
  order     Int      // Sort position among ALL carousels

  // Query definition
  matchMode String   @default("ANY") // "ANY" or "ALL"
  rules     Json     // Array of filter rules
  sort      String   @default("random")
  direction String   @default("DESC")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, order])
}
```

**Rules JSON Structure:**
```json
[
  {
    "field": "performers",
    "modifier": "INCLUDES",
    "value": ["performer-id-1", "performer-id-2"]
  },
  {
    "field": "rating100",
    "modifier": "GREATER_THAN",
    "value": 80
  },
  {
    "field": "tags",
    "modifier": "EXCLUDES",
    "value": ["tag-id-1"]
  }
]
```

### API Endpoints

**Carousel Management:**
- `GET /api/carousels` - List user's custom carousels
- `POST /api/carousels` - Create new carousel (max 15)
- `GET /api/carousels/:id` - Get single carousel
- `PUT /api/carousels/:id` - Update carousel
- `DELETE /api/carousels/:id` - Delete carousel
- `PUT /api/carousels/reorder` - Bulk update order (all carousels)

**Preview:**
- `POST /api/carousels/preview` - Preview results without saving
  - Body: `{ rules, matchMode, sort, direction }`
  - Returns: `{ count, scenes }` (paginated to 12)

### Shared Filter Schema

**Location:** `client/src/utils/filterSchema.js`

**Structure:**
```javascript
export const SCENE_FILTERS = [
  {
    key: "performers",
    label: "Performers",
    type: "entity-multi",
    modifiers: ["INCLUDES", "INCLUDES_ALL", "EXCLUDES"],
    entityType: "performer",
    valueComponent: "PerformerPicker"
  },
  {
    key: "rating100",
    label: "Rating",
    type: "number",
    modifiers: ["GREATER_THAN", "LESS_THAN", "EQUALS", "NOT_EQUALS", "BETWEEN"],
    min: 0,
    max: 100,
    valueComponent: "NumberInput"
  },
  {
    key: "tags",
    label: "Tags",
    type: "entity-multi",
    modifiers: ["INCLUDES", "INCLUDES_ALL", "EXCLUDES"],
    entityType: "tag",
    valueComponent: "TagPicker"
  },
  // ... all other scene filters
];

export const SCENE_SORT_OPTIONS = [
  { value: "random", label: "Random" },
  { value: "created_at", label: "Created At" },
  { value: "rating100", label: "Rating" },
  { value: "date", label: "Date" },
  { value: "o_counter", label: "O Counter" },
  // ... all other sort options from filterConfig.js
];
```

**Migration from `filterConfig.js`:**
1. Extract filter definitions into structured schema
2. Add metadata for carousel builder (type, modifiers, value component)
3. Update Scene Search to consume shared schema (ensure no regressions)

### Frontend Components

**File Structure:**
```
client/src/components/
  carousel-builder/
    CarouselBuilder.jsx       - Main editor page
    CarouselList.jsx          - Settings list view
    FilterBuilder.jsx         - Rule builder container
    FilterRule.jsx            - Single rule editor
    FilterValueSelector.jsx   - Value input (switches based on filter type)
    IconPicker.jsx            - Lucide icon grid selector
    PreviewModal.jsx          - Preview results modal

  filter-components/          - Shared with Scene Search
    PerformerPicker.jsx
    TagPicker.jsx
    StudioPicker.jsx
    NumberInput.jsx
    DatePicker.jsx
```

**FilterBuilder Component:**
```jsx
<FilterBuilder
  rules={rules}
  matchMode={matchMode}
  onRulesChange={setRules}
  onMatchModeChange={setMatchMode}
/>
```

**FilterRule Component:**
```jsx
<FilterRule
  rule={rule}
  onChange={handleRuleChange}
  onRemove={handleRuleRemove}
  filterSchema={SCENE_FILTERS}
/>
```

**Icon Picker Component:**
- Grid of 50-60 curated Lucide icons
- Search/filter by name
- Selected icon highlighted
- Preview shows icon + carousel title

**Curated Icon List:**
```javascript
export const CAROUSEL_ICONS = [
  // Film & Video
  "Film", "Video", "Play", "PlayCircle", "Clapperboard",

  // Favorites & Collections
  "Heart", "Star", "Bookmark", "Award", "Trophy",

  // Time & Recency
  "Clock", "Calendar", "TrendingUp", "Zap", "Flame",

  // Moods & Genres
  "Smile", "Frown", "Angry", "Meh", "PartyPopper",

  // Discovery
  "Eye", "Sparkles", "Target", "Compass", "Search",

  // Quality & Rating
  "ThumbsUp", "Crown", "Shield", "Diamond", "Gem",

  // Media Types
  "Users", "User", "Building", "Tag", "Folder",

  // Additional
  "Camera", "Tv", "Monitor", "Smartphone", "Headphones"
];
```

### Homepage Integration

**Updated Flow:**

1. **Fetch All Carousels:**
```javascript
// Fetch hardcoded definitions
const hardcodedCarousels = CAROUSEL_DEFINITIONS;

// Fetch user's custom carousels
const customCarousels = await fetch('/api/carousels');

// Merge and sort by user preferences
const allCarousels = [...hardcodedCarousels, ...customCarousels]
  .map(def => ({
    ...def,
    preference: userCarouselPrefs[def.id] || { enabled: true, order: 999 }
  }))
  .filter(def => def.preference.enabled)
  .sort((a, b) => a.preference.order - b.preference.order);
```

2. **Dynamic Query Building:**
```javascript
// For custom carousels, build query from rules
carouselQueries[customCarousel.id] = async () => {
  const filter = buildFilterFromRules({
    rules: customCarousel.rules,
    matchMode: customCarousel.matchMode,
    sort: customCarousel.sort,
    direction: customCarousel.direction,
    page: 1,
    per_page: 12
  });

  const response = await libraryApi.findScenes(filter);
  return response?.findScenes?.scenes || [];
};
```

3. **buildFilterFromRules Function:**
```javascript
function buildFilterFromRules({ rules, matchMode, sort, direction, page, per_page }) {
  const scene_filter = {};

  // Convert rules array to scene_filter object
  rules.forEach(rule => {
    scene_filter[rule.field] = {
      modifier: rule.modifier,
      value: rule.value,
      ...(rule.value2 && { value2: rule.value2 }) // For BETWEEN modifier
    };
  });

  // Add match mode (ANY/ALL) to filter
  // Backend interprets this for multi-rule combinations
  scene_filter._matchMode = matchMode;

  return {
    filter: {
      page,
      per_page,
      sort,
      direction
    },
    scene_filter
  };
}
```

### Backend Implementation

**Carousel Controller** (`server/controllers/carousel.ts`):

```typescript
// List user's carousels
export const listCarousels = async (req: AuthenticatedRequest, res: Response) => {
  const carousels = await prisma.userCarousel.findMany({
    where: { userId: req.user!.id },
    orderBy: { order: 'asc' }
  });
  res.json(carousels);
};

// Create carousel
export const createCarousel = async (req: AuthenticatedRequest, res: Response) => {
  const { title, icon, rules, matchMode, sort, direction } = req.body;

  // Check max limit (15)
  const count = await prisma.userCarousel.count({
    where: { userId: req.user!.id }
  });

  if (count >= 15) {
    return res.status(400).json({ error: 'Maximum 15 custom carousels allowed' });
  }

  // Get next order position
  const maxOrder = await prisma.userCarousel.findFirst({
    where: { userId: req.user!.id },
    orderBy: { order: 'desc' },
    select: { order: true }
  });

  const carousel = await prisma.userCarousel.create({
    data: {
      userId: req.user!.id,
      title,
      icon: icon || 'Film',
      rules,
      matchMode: matchMode || 'ANY',
      sort: sort || 'random',
      direction: direction || 'DESC',
      order: (maxOrder?.order ?? -1) + 1
    }
  });

  res.json(carousel);
};

// Preview carousel results
export const previewCarousel = async (req: AuthenticatedRequest, res: Response) => {
  const { rules, matchMode, sort, direction } = req.body;

  // Build filter from rules (same as homepage would)
  const filter = buildFilterFromRules({
    rules,
    matchMode,
    sort,
    direction,
    page: 1,
    per_page: 12
  });

  // Execute scene query (reuse existing findScenes controller)
  const result = await findScenesWithFilter(req.user!.id, filter);

  res.json({
    count: result.count,
    scenes: result.scenes
  });
};
```

**Scene Filter Updates** (`server/controllers/library/scenes.ts`):

Add support for `_matchMode` in `scene_filter`:

```typescript
// Current: ALL filters are AND-ed together
// Enhancement: Support ANY (OR) logic

if (scene_filter._matchMode === 'ANY') {
  // Match if ANY filter passes
  filteredScenes = allScenes.filter(scene => {
    return Object.entries(scene_filter)
      .filter(([key]) => key !== '_matchMode')
      .some(([filterKey, filterValue]) => {
        return applyFilter(scene, filterKey, filterValue);
      });
  });
} else {
  // Default: Match if ALL filters pass (existing logic)
  filteredScenes = applyAllFilters(allScenes, scene_filter);
}
```

### User Preference Storage

**Merged Carousel Preferences:**

Update `User.carouselPreferences` JSON structure:

```json
{
  "hardcoded-carousel-id": {
    "enabled": true,
    "order": 0
  },
  "custom-carousel-uuid-1": {
    "enabled": true,
    "order": 1
  },
  "custom-carousel-uuid-2": {
    "enabled": false,
    "order": 2
  }
}
```

**Reordering:**
- Single endpoint updates ALL carousel orders (hardcoded + custom)
- `PUT /api/user/settings/carousel-order`
- Body: `{ order: ["id1", "id2", "id3", ...] }`

## Implementation Phases

### Phase 1: Foundation (Database & API)

**Tasks:**
1. Create `UserCarousel` Prisma model
2. Generate migration
3. Create carousel CRUD endpoints
4. Create preview endpoint
5. Add max carousel limit (15) validation

**Files:**
- `server/prisma/schema.prisma`
- `server/controllers/carousel.ts`
- `server/routes/carousel.ts`

### Phase 2: Shared Filter Schema (DRY)

**Tasks:**
6. Extract filter definitions from `filterConfig.js`
7. Create `filterSchema.js` with structured metadata
8. Update Scene Search to consume shared schema
9. Test Scene Search for regressions
10. Add unit tests for filter schema

**Files:**
- `client/src/utils/filterSchema.js`
- `client/src/components/scene-search/SceneSearch.jsx` (update)

### Phase 3: Carousel Builder UI

**Tasks:**
11. Create `IconPicker` component with curated Lucide icons
12. Create `FilterBuilder` component (rule container)
13. Create `FilterRule` component (single rule editor)
14. Create `FilterValueSelector` (switches on filter type)
15. Create `CarouselBuilder` page (main editor)
16. Add form validation and error handling
17. Wire up save/cancel/preview actions

**Files:**
- `client/src/components/carousel-builder/IconPicker.jsx`
- `client/src/components/carousel-builder/FilterBuilder.jsx`
- `client/src/components/carousel-builder/FilterRule.jsx`
- `client/src/components/carousel-builder/FilterValueSelector.jsx`
- `client/src/components/carousel-builder/CarouselBuilder.jsx`

### Phase 4: Carousel Management UI

**Tasks:**
18. Create `CarouselList` component (settings page)
19. Add drag-and-drop reordering (react-beautiful-dnd or @dnd-kit)
20. Add edit/delete/toggle actions
21. Add "Create Custom Carousel" button
22. Display carousel count (X/15)
23. Add confirmation modals for delete

**Files:**
- `client/src/components/carousel-builder/CarouselList.jsx`
- `client/src/components/pages/Settings.jsx` (add route)

### Phase 5: Homepage Integration

**Tasks:**
24. Update `CAROUSEL_DEFINITIONS` to include dynamic fetch
25. Fetch custom carousels from API
26. Merge hardcoded + custom carousels
27. Update `useHomeCarouselQueries` for dynamic query building
28. Add `buildFilterFromRules` utility function
29. Handle carousel loading/error states
30. Update carousel preference migration logic

**Files:**
- `client/src/constants/carousels.js` (update)
- `client/src/hooks/useHomeCarouselQueries.js` (update)
- `client/src/components/pages/Home.jsx` (update)
- `client/src/utils/carouselHelpers.js` (new)

### Phase 6: Backend Filter Enhancement

**Tasks:**
31. Add `_matchMode` support to scene filtering pipeline
32. Implement ANY (OR) logic for rules
33. Test with various rule combinations
34. Verify user restrictions still apply correctly
35. Test performance with expensive filters

**Files:**
- `server/controllers/library/scenes.ts` (update)

### Phase 7: Testing & Polish

**Tasks:**
36. Test carousel creation with all filter types
37. Test carousel editing and deletion
38. Test reordering (drag-and-drop)
39. Test preview functionality
40. Test max carousel limit enforcement
41. Test with user restrictions and hidden entities
42. Mobile responsiveness testing
43. Add loading states and error handling
44. Add empty states ("No custom carousels yet")

## Data Flow Examples

### Example 1: Creating "Best Action Scenes" Carousel

**User Actions:**
1. Goes to Settings → Carousels
2. Clicks "Create Custom Carousel"
3. Enters title: "Best Action Scenes"
4. Selects icon: "Zap"
5. Adds rules:
   - Tags includes "Action"
   - Rating greater than 80
6. Sets sort: "Rating" DESC
7. Clicks "Preview Results" → sees 847 matching scenes
8. Clicks "Save Carousel"

**Backend:**
```sql
INSERT INTO UserCarousel (
  id, userId, title, icon, rules, matchMode, sort, direction, order
) VALUES (
  'uuid-123',
  'user-456',
  'Best Action Scenes',
  'Zap',
  '[{"field":"tags","modifier":"INCLUDES","value":["tag-action"]},{"field":"rating100","modifier":"GREATER_THAN","value":80}]',
  'ALL',
  'rating100',
  'DESC',
  5
);
```

**Homepage Rendering:**
```javascript
const customCarousel = {
  id: 'uuid-123',
  title: 'Best Action Scenes',
  icon: 'Zap',
  fetchKey: 'custom-uuid-123' // Generated
};

carouselQueries['custom-uuid-123'] = async () => {
  const filter = {
    filter: { page: 1, per_page: 12, sort: 'rating100', direction: 'DESC' },
    scene_filter: {
      tags: { modifier: 'INCLUDES', value: ['tag-action'] },
      rating100: { modifier: 'GREATER_THAN', value: 80 },
      _matchMode: 'ALL'
    }
  };

  const response = await libraryApi.findScenes(filter);
  return response?.findScenes?.scenes || [];
};
```

### Example 2: Editing Existing Carousel

**User Actions:**
1. Goes to Settings → Carousels
2. Clicks "Edit" on "Best Action Scenes"
3. Changes icon to "Flame"
4. Adds rule: O Counter greater than 0
5. Changes sort to "Random"
6. Clicks "Save"

**API Call:**
```
PUT /api/carousels/uuid-123
Body: {
  title: "Best Action Scenes",
  icon: "Flame",
  rules: [
    { field: "tags", modifier: "INCLUDES", value: ["tag-action"] },
    { field: "rating100", modifier: "GREATER_THAN", value: 80 },
    { field: "o_counter", modifier: "GREATER_THAN", value: 0 }
  ],
  matchMode: "ALL",
  sort: "random",
  direction: "DESC"
}
```

## Key Design Decisions

### 1. Separate Hardcoded vs Custom Carousels
- Hardcoded carousels cannot be edited/deleted (only toggle visibility)
- Custom carousels fully editable
- Both share same order/visibility preference system

### 2. Fixed 12-Scene Limit
- Keeps homepage consistent and performant
- Matches existing carousel behavior
- Users can click carousel to see full search results

### 3. Random Sort Default
- Provides discovery and variety
- Different scenes shown each page load
- Users can override with any sort option

### 4. Full-Page Builder (Not Modal)
- Better mobile UX with more space
- Easier to manage complex rule sets
- Follows settings pattern (full-page editors)

### 5. Curated Icon Set
- ~50-60 relevant Lucide icons
- Prevents overwhelming choice
- Ensures icons make sense for media context

### 6. Manual Preview (Not Auto)
- Reduces API calls during editing
- User controls when to test query
- Shows full count + sample results

### 7. 15 Carousel Maximum
- Prevents homepage from becoming overwhelming
- Encourages thoughtful curation
- Can be increased if needed

## Future Enhancements

**Phase 2 Features (Not in Initial Release):**
- Carousel templates (pre-built popular queries)
- Duplicate carousel
- Export/import carousel JSON
- Carousel analytics (views, clicks)
- Scheduled carousels (time-based visibility)
- Shared carousels between users (admin-created)

## Testing Checklist

- [ ] Create carousel with single rule
- [ ] Create carousel with multiple rules (ANY mode)
- [ ] Create carousel with multiple rules (ALL mode)
- [ ] Test all filter types (entity, number, date, boolean)
- [ ] Test all modifiers (INCLUDES, EXCLUDES, GREATER_THAN, etc.)
- [ ] Edit existing carousel
- [ ] Delete carousel
- [ ] Reorder carousels (drag-and-drop)
- [ ] Toggle carousel visibility
- [ ] Test max 15 carousel limit
- [ ] Preview carousel results
- [ ] Test random sort
- [ ] Test with user restrictions
- [ ] Test with hidden entities
- [ ] Test mobile responsiveness
- [ ] Test carousel on homepage
- [ ] Test empty states
- [ ] Test error handling
- [ ] Test icon picker
- [ ] Verify Scene Search still works (no regressions)

## Success Metrics

- Users can create custom carousels without coding
- Filter changes in Scene Search automatically work in carousel builder
- Homepage loads efficiently with custom carousels
- Mobile-friendly carousel builder
- User restrictions and hidden entities respected in custom carousels

---

**Document Created:** 2025-01-21
**Implementation Status:** Planning Phase
**Estimated Effort:** Large (2-3 weeks full-time)
