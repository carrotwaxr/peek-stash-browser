# Integration Test Expansion Plan

**Date:** 2026-01-04
**Branch:** `feature/expand-integration-test-coverage`
**Goal:** Comprehensive integration test coverage before 3.1.0 release

---

## Current State

- **76 tests passing** across 10 test files
- Basic CRUD operations covered
- Content restrictions well-tested (495 lines)
- Most entity filtering NOT tested

---

## UI Filter Options Available to Users

### Scene Filters (21+ options)
| Filter | Modifiers | Tested? |
|--------|-----------|---------|
| Title | text search | No |
| Details | text search | No |
| Performers | INCLUDES/INCLUDES_ALL/EXCLUDES | Basic only |
| Studio | INCLUDES/EXCLUDES + hierarchy | Basic only |
| Tags | INCLUDES/INCLUDES_ALL/EXCLUDES + hierarchy | Basic only |
| Collections/Groups | INCLUDES/INCLUDES_ALL/EXCLUDES | No |
| Rating | numeric range | No |
| O Count | numeric range | No |
| Duration | numeric range | No |
| Favorite Scenes | boolean | No |
| Favorite Performers | boolean (user-specific) | No |
| Favorite Studios | boolean (user-specific) | No |
| Favorite Tags | boolean (user-specific) | No |
| Scene Date | date range | No |
| Created Date | date range | No |
| Updated Date | date range | No |
| Last Played Date | date range | No |
| Resolution | with modifiers | No |
| Bitrate | numeric range | No |
| Framerate | numeric range | No |
| Orientation | LANDSCAPE/PORTRAIT/SQUARE | No |
| Video Codec | text search | No |
| Audio Codec | text search | No |
| Director | text search | No |
| Play Duration | numeric range | No |
| Play Count | numeric range | No |
| Performer Count | numeric range | No |
| Performer Age | numeric range (calculated) | No |
| Tag Count | numeric range | No |

### Performer Filters (16 options)
- Name, Tags, Gender, Rating, O Count, Scene Count, Favorite
- Age, Birth Year, Death Year, Career Length, Birthdate, Death Date
- Hair Color, Eye Color, Ethnicity, Breast Type, Measurements, Tattoos, Piercings, Height, Weight
- **Currently tested:** Basic pagination only

### Studio Filters (10 options)
- Name, Details, Tags, Rating, Scene Count, O Count, Play Count, Favorite, Created At, Updated At
- **Currently tested:** Basic pagination only

### Tag Filters (11 options)
- Name, Description, Rating, Scene Count, O Count, Play Count, Favorite
- Performers, Studios, Scenes, Collections
- **Currently tested:** Basic pagination only

### Gallery Filters (7 options)
- Title, Performers, Studios, Tags, Rating, Image Count, Favorite
- **Currently tested:** Basic pagination only

### Group Filters (13 options)
- Name, Synopsis, Director, Performers, Studio, Tags, Rating, Scene Count, Duration, Favorite
- Release Date, Created At, Updated At
- **Currently tested:** Basic pagination only

---

## 3.1.0-Beta Features Requiring Tests

1. **Pre-computed Exclusions System** - Exclusions computed at sync time, applied to queries
2. **Entity Soft-Delete** - Soft-deleted entities filtered from results
3. **Inherited Tag Support** - Denormalized inherited tags in scenes
4. **Gallery Inheritance** - Image-to-gallery inheritance
5. **Random Sort with Seed** - Stable pagination with deterministic randomization
6. **Cascading Exclusions** - Empty entity handling, cascade logic
7. **Incremental Hide/Unhide** - User-level entity hiding
8. **Full Sync Trigger** - After database migrations

---

## Priority Test List

### Phase 1: Critical (Blocks 3.1.0 Release)

1. **Scene Favorite Filters** (`scene-favorite-filters.integration.test.ts`)
   - `favorite` (scene favorite)
   - `performer_favorite` (scenes with user's favorite performers)
   - `studio_favorite` (scenes from user's favorite studios)
   - `tag_favorite` (scenes with user's favorite tags)

2. **Scene Date Filters** (`scene-date-filters.integration.test.ts`)
   - `date` (scene date range)
   - `created_at` (created date range)
   - `updated_at` (updated date range)
   - `last_played_at` (last played date range)

3. **Tag Hierarchy Filters** (`scene-tag-hierarchy.integration.test.ts`)
   - Tag depth parameter
   - Parent tag includes children
   - Inherited tag filtering

4. **Exclusion Application** (`exclusion-application.integration.test.ts`)
   - User exclusions filter out entities
   - Soft-deleted entities filtered
   - Cascade exclusions work correctly

5. **Random Sort Stability** (`random-sort.integration.test.ts`)
   - Same seed returns same order
   - Different seeds return different orders
   - Pagination stable with seed

6. **Combined Filters** (`combined-filters.integration.test.ts`)
   - Multiple filters simultaneously
   - Filter AND logic
   - Performance with complex queries

### Phase 2: High Priority (Before Release Candidate)

7. **Scene Numeric Filters** (`scene-numeric-filters.integration.test.ts`)
   - `rating100` with EQUALS, GREATER_THAN, LESS_THAN, BETWEEN
   - `o_counter` range
   - `play_count` range
   - `duration` range
   - `performer_count` range
   - `tag_count` range

8. **Scene Video Filters** (`scene-video-filters.integration.test.ts`)
   - `resolution` with modifiers
   - `bitrate` range
   - `framerate` range
   - `orientation` (LANDSCAPE/PORTRAIT/SQUARE)
   - `video_codec` text match
   - `audio_codec` text match

9. **Performer Age Filter** (`performer-age-filter.integration.test.ts`)
   - `performer_age` with age calculation from birthdate

10. **Text Search Filters** (`text-search.integration.test.ts`)
    - Scene title search
    - Scene details search
    - Performer name search
    - Studio name search

### Phase 3: Medium Priority (Before GA)

11. **Performer Filters** (`performer-filters.integration.test.ts`)
    - All 16 performer filter options
    - Gender filtering
    - Physical attribute filtering

12. **Gallery Filters** (`gallery-filters.integration.test.ts`)
    - All 7 gallery filter options
    - Performer/studio/tag filtering

13. **Group Filters** (`group-filters.integration.test.ts`)
    - All 13 group filter options
    - Director, synopsis search

14. **Studio Filters** (`studio-filters.integration.test.ts`)
    - All 10 studio filter options

15. **Tag Filters** (`tag-filters.integration.test.ts`)
    - All 11 tag filter options
    - Entity relationship counts

16. **Image Filters** (`image-filters.integration.test.ts`)
    - Basic image filtering via ImageQueryBuilder

17. **Sort Options** (`sort-options.integration.test.ts`)
    - All 20+ sort fields
    - ASC/DESC direction
    - Scene index with groups

18. **Pagination Edge Cases** (`pagination-edge-cases.integration.test.ts`)
    - Various per_page values (1, 10, 100, 1000)
    - Empty result sets
    - Last page handling
    - Beyond-range page numbers

### Phase 4: Enhancement (Post Release)

19. Performance testing with large datasets
20. Complex filter combinations (3+ filters)
21. Filter preset save/load
22. Unit preference conversions

---

## Test Entity Requirements

Need to add to `testEntities.ts`:
```typescript
export const TEST_ENTITIES = {
  // Existing
  sceneWithRelations: "31339",
  performerWithScenes: "443",
  studioWithScenes: "13",
  tagWithEntities: "74",
  groupWithScenes: "161",
  galleryWithImages: "803",

  // Need to add for filter testing
  sceneWithHighRating: "TBD",      // Scene with rating >= 80
  sceneWithLowRating: "TBD",       // Scene with rating <= 20
  sceneFromLastWeek: "TBD",        // Recently created scene
  sceneFromLastYear: "TBD",        // Older scene
  performerWithAge: "TBD",         // Performer with birthdate set
  tagParentWithChildren: "TBD",    // Tag with child tags
  tagChildOfParent: "TBD",         // Child tag
  landscapeScene: "TBD",           // Scene with landscape orientation
  portraitScene: "TBD",            // Scene with portrait orientation
  h264Scene: "TBD",                // Scene with H.264 codec
  hevcScene: "TBD",                // Scene with HEVC codec
};
```

---

## File Structure

```
server/integration/
├── api/
│   ├── auth.integration.test.ts          # Existing
│   ├── health.integration.test.ts        # Existing
│   ├── scenes.integration.test.ts        # Existing - basic
│   ├── performers.integration.test.ts    # Existing - basic
│   ├── studios.integration.test.ts       # Existing - basic
│   ├── tags.integration.test.ts          # Existing - basic
│   ├── groups.integration.test.ts        # Existing - basic
│   ├── galleries.integration.test.ts     # Existing - basic
│   ├── images.integration.test.ts        # Existing - basic
│   ├── content-restrictions.integration.test.ts  # Existing - comprehensive
│   │
│   │ # Phase 1 - Critical
│   ├── scene-favorite-filters.integration.test.ts
│   ├── scene-date-filters.integration.test.ts
│   ├── scene-tag-hierarchy.integration.test.ts
│   ├── exclusion-application.integration.test.ts
│   ├── random-sort.integration.test.ts
│   ├── combined-filters.integration.test.ts
│   │
│   │ # Phase 2 - High Priority
│   ├── scene-numeric-filters.integration.test.ts
│   ├── scene-video-filters.integration.test.ts
│   ├── performer-age-filter.integration.test.ts
│   ├── text-search.integration.test.ts
│   │
│   │ # Phase 3 - Medium Priority
│   ├── performer-filters.integration.test.ts
│   ├── gallery-filters.integration.test.ts
│   ├── group-filters.integration.test.ts
│   ├── studio-filters.integration.test.ts
│   ├── tag-filters.integration.test.ts
│   ├── image-filters.integration.test.ts
│   ├── sort-options.integration.test.ts
│   └── pagination-edge-cases.integration.test.ts
├── fixtures/
│   └── testEntities.ts                   # Needs expansion
└── helpers/
    ├── testClient.ts
    ├── config.ts
    ├── globalSetup.ts
    └── testSetup.ts
```

---

## API Request Format Reference

### Scene Filter Request
```typescript
{
  filter: {
    page: 1,
    per_page: 40,
    sort: "created_at",
    direction: "DESC"
  },
  scene_filter: {
    // Entity filters
    performers: { value: ["123"], modifier: "INCLUDES" },
    studios: { value: ["456"], modifier: "INCLUDES", depth: 2 },
    tags: { value: ["789"], modifier: "INCLUDES_ALL", depth: 3 },
    groups: { value: ["101"], modifier: "EXCLUDES" },

    // Boolean filters
    favorite: true,
    performer_favorite: true,
    studio_favorite: true,
    tag_favorite: true,

    // Numeric range filters
    rating100: { value: 80, modifier: "GREATER_THAN" },
    o_counter: { value: 1, value2: 10, modifier: "BETWEEN" },
    duration: { value: 600, modifier: "GREATER_THAN" },

    // Date range filters
    date: { value: "2024-01-01", value2: "2024-12-31", modifier: "BETWEEN" },
    created_at: { value: "2024-06-01", modifier: "GREATER_THAN" },

    // Video filters
    resolution: { value: "1080", modifier: "GREATER_THAN" },
    orientation: "LANDSCAPE",
    video_codec: { value: "hevc", modifier: "INCLUDES" }
  }
}
```

### Fetch by ID
```typescript
{
  ids: ["31339", "31340"]
}
```

---

## Notes

- Each test file should have `beforeAll` to login `adminClient`
- Use correct response format: `response.data.findScenes.scenes`
- Use correct request format: `{ filter: {...}, scene_filter: {...} }`
- Test both positive cases (filter returns expected) and negative cases (filter excludes expected)
- Run full suite after each new test file: `npm run test:integration`
