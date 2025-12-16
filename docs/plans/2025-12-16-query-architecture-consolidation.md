# Query Architecture Consolidation

## Problem

Scene queries return inconsistent objects depending on which code path is used:

- `SceneQueryBuilder.execute()` returns scenes with full relations (performers, tags, studio, groups, galleries)
- `StashEntityService.getAllScenes()` returns scenes with empty relation arrays
- Various `getAllScenesWith*()` variants return partial relation data (IDs only)

This causes bugs like Similar Scenes and Recommended Scenes cards not displaying performer/tag indicators.

## Goal

Single query architecture where every scene object returned has consistent shape with populated relations. DRY principle - one path, one place for bugs.

## Design

### Phase 1: Lightweight Scoring Query

Create a new method for scoring operations that returns minimal data needed:

```typescript
// New method in StashEntityService
async getScenesForScoring(): Promise<SceneScoringData[]> {
  // Returns: { id, performerIds, tagIds, studioId, oCounter, date }
  // Single efficient query joining scene + junction tables
  // No full entity hydration - just IDs for scoring
}
```

This supports Similar Scenes and Recommended Scenes which need to score all scenes but only need IDs for the scoring logic.

### Phase 2: Consolidate to SceneQueryBuilder

All scene queries that return `NormalizedScene[]` go through `SceneQueryBuilder`, which already has `populateRelations()`.

**Methods to remove from StashEntityService:**
- `getAllScenes()`
- `getAllScenesWithTags()`
- `getAllScenesWithPerformers()`
- `getAllScenesWithPerformersAndTags()`
- `getScenesPaginated()`

**Methods to keep/modify:**
- `getScenesByIds()` - Keep, but have it use SceneQueryBuilder internally
- `getScenesByIdsWithRelations()` - Remove, redundant after consolidation

### Phase 3: Update All Callers

#### Similar Scenes (`scenes.ts:1235`)
**Before:** Load all scenes, score in memory, paginate
**After:**
1. Call `getScenesForScoring()` for lightweight scoring data
2. Score and sort to get top N scene IDs
3. Call `SceneQueryBuilder.execute({ filters: { ids } })` for final results

#### Recommended Scenes (`scenes.ts:1472`)
**Before:** Load all scenes, score in memory, paginate
**After:** Same pattern as Similar Scenes

#### Standard Carousels (`carousel.ts:402`)
**Before:** `getAllScenes()` then filter/sort in memory
**After:** `SceneQueryBuilder.execute()` with appropriate filters

#### Scenes Browse Fallback (`scenes.ts:994`)
**Before:** `getAllScenes()` when SQL query builder disabled
**After:** Always use `SceneQueryBuilder.execute()`

#### Entity Visibility Filtering (`tags.ts`, `performers.ts`, `studios.ts`)
**Before:** `getAllScenes*()` to check which entities have visible scenes
**After:** New dedicated method `getVisibleEntityIds(userId, entityType)` that queries junction tables directly - doesn't need full scene data

### SceneQueryBuilder Enhancements

Add support for:
- Unpaginated mode (for getting all matching IDs)
- ID-only mode (returns just scene IDs, no hydration)

```typescript
interface SceneQueryOptions {
  // ... existing options
  returnIdsOnly?: boolean;  // Skip hydration, return string[]
  unpaginated?: boolean;    // Return all matches, no LIMIT
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Scene Query Requests                         │
├─────────────────────────────────────────────────────────────────┤
│  Browse  │  Similar  │  Recommended  │  Carousels  │  Details   │
└────┬─────┴─────┬─────┴───────┬───────┴──────┬──────┴─────┬──────┘
     │           │             │              │            │
     │           ▼             ▼              │            │
     │    ┌─────────────────────────┐        │            │
     │    │ getScenesForScoring()   │        │            │
     │    │ (lightweight IDs only)  │        │            │
     │    └───────────┬─────────────┘        │            │
     │                │                      │            │
     │                ▼                      │            │
     │         Score & Get IDs              │            │
     │                │                      │            │
     ▼                ▼                      ▼            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SceneQueryBuilder.execute()                   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Build WHERE  │→ │ Execute SQL  │→ │ populateRelations()    │ │
│  │ clauses      │  │ query        │  │ (batch load relations) │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    NormalizedScene[] with
                    consistent relations
```

## Migration Checklist

### StashEntityService Changes
- [ ] Add `getScenesForScoring()` method
- [ ] Add `getVisibleSceneIdsByEntity()` for entity filtering
- [ ] Deprecate `getAllScenes()` and variants
- [ ] Update `getScenesByIds()` to use SceneQueryBuilder

### SceneQueryBuilder Changes
- [ ] Add `returnIdsOnly` option
- [ ] Add `unpaginated` option
- [ ] Ensure all relation types populated (verify galleries, groups)

### Controller Updates
- [ ] `scenes.ts` - findSimilarScenes
- [ ] `scenes.ts` - getRecommendedScenes
- [ ] `scenes.ts` - findScenes fallback path
- [ ] `carousel.ts` - executeCarouselQuery standard path
- [ ] `carousel.ts` - custom carousel path (verify already correct)
- [ ] `tags.ts` - enhanceTagsWithPerformerScenes
- [ ] `tags.ts` - getTagsWithFilters visibility check
- [ ] `tags.ts` - getTag scene/group counts
- [ ] `tags.ts` - related tags visibility check
- [ ] `performers.ts` - getPerformersWithFilters visibility check
- [ ] `performers.ts` - getPerformer visibility check
- [ ] `studios.ts` - getStudiosWithFilters visibility check
- [ ] `studios.ts` - getStudio visibility check

### Testing
- [ ] Similar Scenes shows performer/tag indicators on cards
- [ ] Recommended Scenes shows performer/tag indicators on cards
- [ ] Homepage carousels show indicators
- [ ] Scenes browse works with all filter combinations
- [ ] Entity pages (performers, tags, studios) filter correctly for non-admin users
- [ ] Performance acceptable (measure query times)

## Risks & Mitigations

**Risk:** Regression in filtering behavior
**Mitigation:** Comprehensive manual testing of all entity pages with non-admin user

**Risk:** Performance degradation from additional relation loading
**Mitigation:** `getScenesForScoring()` keeps scoring lightweight; only final page of results gets full hydration

**Risk:** Edge cases in SceneQueryBuilder not covered
**Mitigation:** Existing integration tests + add new tests for ID-only and unpaginated modes

## UI Impact Assessment

### SceneCard.jsx Data Requirements

The frontend expects these fields on every scene object:

| Field | Used For | Currently Broken? |
|-------|----------|-------------------|
| `scene.performers` | Count indicator + tooltip grid | Yes - empty array |
| `scene.performers[].tags` | Squashed tags calculation | Yes - empty |
| `scene.groups` | Count indicator + tooltip grid | Yes - empty array |
| `scene.galleries` | Count indicator + tooltip grid | Yes - empty array |
| `scene.tags` | Count indicator + tooltip grid | Yes - empty array |
| `scene.studio` | Subtitle display | Yes - null |
| `scene.studio.name` | Studio name in subtitle | Yes - null |
| `scene.studio.tags` | Squashed tags calculation | Yes - null |
| `scene.paths.*` | Thumbnails, previews | No - works |
| `scene.files[0].*` | Duration, resolution | No - works |
| `scene.rating/favorite/o_counter` | Rating row | No - works |
| `scene.play_count` | Play count indicator | No - works |
| `scene.resumeTime` | Progress bar | No - works |

### Affected UI Components

| Component | Data Source | Issue |
|-----------|-------------|-------|
| ScenesLikeThis.jsx | `/api/library/scenes/:id/similar` | Missing relation data |
| RecommendedSidebar.jsx | `/api/library/scenes/:id/similar` | Missing studio data |
| SceneCard.jsx | Various endpoints | Shows "0" for all entity counts |
| Home.jsx carousels | Standard carousel endpoints | Missing relation data |

### Verification

**No UI code changes needed.** The frontend already expects full scene objects with relations. The consolidation will fix the backend to return complete data.

After implementation, verify:
- [ ] Scene cards show correct performer counts (not 0)
- [ ] Scene cards show correct tag counts (not 0)
- [ ] Scene cards show correct group counts (not 0)
- [ ] Scene cards show correct gallery counts (not 0)
- [ ] Hovering indicators shows entity tooltip grids
- [ ] Studio name appears in card subtitles
- [ ] Similar Scenes section displays full card data
- [ ] Recommended sidebar shows studio names

## Out of Scope (Future Work)

- Tag hierarchy normalization (`parentIds` JSON → `TagRelation` table)
- Alias normalization (performer/tag aliases → separate tables)
- Studio hierarchy improvements
