# Cache Optimization Analysis

**Date**: 2025-10-24
**Purpose**: Identify unused GraphQL fields to optimize bandwidth and memory usage

---

## Executive Summary

After thorough code analysis of all UI components, server controllers, and utility functions, this document identifies fields that are **fetched from Stash but never used** in the Peek application. Removing these fields will:

- Reduce GraphQL response payload size
- Decrease memory usage in StashCacheManager
- Improve cache refresh performance
- Reduce bandwidth between Stash and Peek

---

## SCENES - Unused Fields

### Top-Level Scene Fields

| Field | Status | Notes |
|-------|--------|-------|
| `code` | ❌ UNUSED | Never referenced anywhere in codebase |
| `director` | ⚠️ KEEP | Not currently displayed but should be added to SceneDetails |
| `urls` | ❌ UNUSED | Array field, never accessed |

### Nested Objects

| Field | Status | Notes |
|-------|--------|-------|
| `galleries` | ⚠️ KEEP | Not used YET - galleries are organizational units for images (future feature) |
| `groups` | ⚠️ KEEP | Not used YET - groups are grouping units for scenes (future feature, replaces movies) |
| `movies` | ❌ UNUSED | Deprecated in favor of groups, safe to remove |

### Files Fields (files[0])

| Field | Status | Notes |
|-------|--------|-------|
| `files[0].id` | ❌ UNUSED | Never referenced |
| `files[0].fingerprints` | ❌ UNUSED | Array with type/value, never referenced |
| `files[0].created_at` | ❌ MAYBE | Scene has scene.created_at for sorting - is file-level needed? |
| `files[0].updated_at` | ❌ MAYBE | Scene has scene.updated_at for sorting - is file-level needed? |
| `files[0].mod_time` | ❌ UNUSED | Never referenced |

### Paths Fields

| Field | Status | Notes |
|-------|--------|-------|
| `paths.preview` | ⚠️ KEEP | Animated video preview (different from sprite) - may add later |
| `paths.stream` | ❌ UNUSED | Stash streaming URL - won't be needed, safe to remove |
| `paths.webp` | ⚠️ KEEP | Animated WebP preview format - may add as alternative to sprite later |

### Scene Fields USED (Keep These)

**Top-Level:**
- ✅ `id` - Used everywhere (keys, navigation, API calls)
- ✅ `title` - Used in UI components
- ✅ `date` - Used in SceneTitle, sorting/filtering
- ✅ `details` - Used in SceneDetails page
- ✅ `organized` - Used in SceneStats (checkmark icon)
- ✅ `o_counter` - Used in SceneStats, sync
- ✅ `play_count` - Used in SceneStats
- ✅ `rating100` - Used in sorting/filtering, sync
- ✅ `resume_time` - Used in watch history (server-side)
- ✅ `play_duration` - Used in filtering/sorting
- ✅ `created_at` - Used in sorting
- ✅ `updated_at` - Used in sorting

**Files (keep these):**
- ✅ `basename` - Fallback title in format.js
- ✅ `path` - Used for transcoding
- ✅ `duration` - Used extensively
- ✅ `width` / `height` - Used for resolution display
- ✅ `size` - Used for file size display
- ✅ `format` - Used in direct play detection
- ✅ `video_codec` - Used in direct play detection
- ✅ `audio_codec` - Used in direct play detection
- ✅ `frame_rate` - Used in sorting/filtering
- ✅ `bit_rate` - Used in sorting/filtering

**Paths (keep these):**
- ✅ `screenshot` - Used in thumbnails
- ✅ `sprite` - Used in SceneCardPreview
- ✅ `vtt` - Used in SceneCardPreview

**Nested (keep minimal):**
- ✅ `studio.id`, `studio.name` - Used in UI
- ✅ `performers` array with: `id`, `name`, `image_path`, `gender`
- ✅ `tags` array with: `id`, `name`, `image_path`

---

## SCENES - Nested Studio Fields (Excessive)

Currently fetching **10 studio fields** in nested scene.studio object. Only 2-3 are used in Scene context.

### Studio Fields in Scene Context

| Field | Status | Notes |
|-------|--------|-------|
| `studio.aliases` | ❌ UNUSED | Never used in Scene context |
| `studio.created_at` | ❌ UNUSED | Never used in Scene context |
| `studio.details` | ❌ UNUSED | Never used in Scene context |
| `studio.favorite` | ❌ UNUSED | Never used in Scene context |
| `studio.ignore_auto_tag` | ❌ UNUSED | Never used in Scene context |
| `studio.parent_studio` | ❌ UNUSED | Never used in Scene context (nested object with 2 more fields) |
| `studio.rating100` | ❌ UNUSED | Never used in Scene context |
| `studio.updated_at` | ❌ UNUSED | Never used in Scene context |
| `studio.url` | ❌ UNUSED | Never used in Scene context |
| `studio.id` | ✅ USED | Navigation links |
| `studio.name` | ✅ USED | Display in UI |

**Recommendation**: Only fetch `id` and `name` for studio in Scene context. Saves ~8 fields per scene.

---

## SCENES - Nested Performer Fields (Excessive)

Currently fetching **23+ performer fields** in nested scene.performers array. Only 4 are used in Scene context.

### Performer Fields in Scene Context

| Field | Status | Notes |
|-------|--------|-------|
| `alias_list` | ❌ UNUSED | Never used in Scene context |
| `birthdate` | ❌ UNUSED | Never used in Scene context |
| `career_length` | ❌ UNUSED | Never used in Scene context |
| `circumcised` | ❌ UNUSED | Never used in Scene context |
| `country` | ❌ UNUSED | Never used in Scene context |
| `created_at` | ❌ UNUSED | Never used in Scene context |
| `death_date` | ❌ UNUSED | Never used in Scene context |
| `details` | ❌ UNUSED | Never used in Scene context |
| `disambiguation` | ❌ UNUSED | Never used in Scene context |
| `ethnicity` | ❌ UNUSED | Never used in Scene context |
| `eye_color` | ❌ UNUSED | Never used in Scene context |
| `fake_tits` | ❌ UNUSED | Never used in Scene context |
| `favorite` | ❌ UNUSED | Never used in Scene context |
| `hair_color` | ❌ UNUSED | Never used in Scene context |
| `height_cm` | ❌ UNUSED | Never used in Scene context |
| `measurements` | ❌ UNUSED | Never used in Scene context |
| `penis_length` | ❌ UNUSED | Never used in Scene context |
| `piercings` | ❌ UNUSED | Never used in Scene context |
| `rating100` | ❌ UNUSED | Never used in Scene context |
| `tattoos` | ❌ UNUSED | Never used in Scene context |
| `updated_at` | ❌ UNUSED | Never used in Scene context |
| `id` | ✅ USED | Navigation links |
| `name` | ✅ USED | Display in UI |
| `image_path` | ✅ USED | Avatar images |
| `gender` | ✅ USED | Gender icon display |

**Recommendation**: Only fetch `id`, `name`, `image_path`, `gender` for performers in Scene context. Saves ~20 fields per performer per scene.

---

## SCENES - Nested Tag Fields (Excessive)

Currently fetching **10 tag fields** in nested scene.tags array. Only 3 are used in Scene context.

### Tag Fields in Scene Context

| Field | Status | Notes |
|-------|--------|-------|
| `aliases` | ❌ UNUSED | Never used in Scene context |
| `child_count` | ❌ UNUSED | Never used in Scene context |
| `created_at` | ❌ UNUSED | Never used in Scene context |
| `description` | ❌ UNUSED | Never used in Scene context |
| `favorite` | ❌ UNUSED | Never used in Scene context |
| `ignore_auto_tag` | ❌ UNUSED | Never used in Scene context |
| `parent_count` | ❌ UNUSED | Never used in Scene context |
| `updated_at` | ❌ UNUSED | Never used in Scene context |
| `id` | ✅ USED | Navigation links |
| `name` | ✅ USED | Display in UI |
| `image_path` | ✅ USED | Tag icons |

**Recommendation**: Only fetch `id`, `name`, `image_path` for tags in Scene context. Saves ~7 fields per tag per scene.

---

## PERFORMERS - Unused Fields

### Standalone Performer Query (findPerformers)

Used in Performers list page and PerformerDetail page.

**CORRECTION**: Initial analysis was WRONG - PerformerDetail.jsx DOES display most fields.

| Field | Status | Notes |
|-------|--------|-------|
| `circumcised` | ✅ USED | Displayed in PerformerDetail (line 371) |
| `career_length` | ✅ USED | Displayed in PerformerDetail (line 337) |
| `disambiguation` | ✅ USED | Displayed in PerformerDetail (line 395) |
| `ethnicity` | ✅ USED | Displayed in PerformerDetail (line 339) |
| `eye_color` | ✅ USED | Displayed in PerformerDetail (line 355) |
| `fake_tits` | ✅ USED | Displayed in PerformerDetail (line 366) |
| `hair_color` | ✅ USED | Displayed in PerformerDetail (line 356) |
| `measurements` | ✅ USED | Displayed in PerformerDetail (line 365) |
| `piercings` | ✅ USED | Displayed in PerformerDetail (line 389) |
| `tattoos` | ✅ USED | Displayed in PerformerDetail (line 388) |
| `gallery_count` | ⚠️ KEEP | Not displayed YET but should be added to PerformerDetail stats |
| `group_count` | ⚠️ KEEP | Not displayed YET but should be added to PerformerDetail stats |
| `image_count` | ⚠️ KEEP | Not displayed YET but should be added to PerformerDetail stats |
| `movie_count` | ⚠️ KEEP | Not displayed YET but should be added to PerformerDetail stats |
| `stash_ids` | ❌ UNUSED | Never displayed, likely won't need |

### Performer Fields - Complete List

**ALL USED OR NEEDED:**
- ✅ `id` - Primary key
- ✅ `name` - Display name
- ✅ `alias_list` - Used in PerformerDetail
- ✅ `birthdate` - Used for age calculation
- ✅ `death_date` - Used in PerformerDetail
- ✅ `details` - Used in PerformerDetail
- ✅ `gender` - Used for gender icon
- ✅ `height_cm` - Used in PerformerDetail stats
- ✅ `weight` - Used in PerformerDetail stats
- ✅ `penis_length` - Used in PerformerDetail stats
- ✅ `circumcised` - Used in PerformerDetail
- ✅ `career_length` - Used in PerformerDetail
- ✅ `country` - Used in PerformerDetail
- ✅ `ethnicity` - Used in PerformerDetail
- ✅ `eye_color` - Used in PerformerDetail
- ✅ `fake_tits` - Used in PerformerDetail
- ✅ `hair_color` - Used in PerformerDetail
- ✅ `measurements` - Used in PerformerDetail
- ✅ `piercings` - Used in PerformerDetail
- ✅ `tattoos` - Used in PerformerDetail
- ✅ `disambiguation` - Used in PerformerDetail
- ✅ `image_path` - Avatar image
- ✅ `url` - External link
- ✅ `instagram` - Social link
- ✅ `twitter` - Social link
- ✅ `urls` - May be useful for additional links
- ✅ `scene_count` - Used in stats
- ✅ `o_counter` - Used in Peek stats
- ✅ `rating100` - Used in detail page
- ✅ `favorite` - Used in Peek
- ✅ `rating` - Used in Peek (our custom field)
- ✅ `play_count` - Used in Peek (our custom field)
- ✅ `tags` - Used in PerformerDetail
- ✅ `created_at` - Sorting
- ✅ `updated_at` - Sorting
- ⚠️ `gallery_count` - Should add to UI
- ⚠️ `group_count` - Should add to UI
- ⚠️ `image_count` - Should add to UI
- ⚠️ `movie_count` - Should add to UI

**Safe to remove**: Only `stash_ids` (1 field)

---

## STUDIOS - Unused Fields

### Standalone Studio Query (findStudios)

Used in Studios list page and StudioDetail page.

| Field | Status | Notes |
|-------|--------|-------|
| `ignore_auto_tag` | ❌ UNUSED | Never displayed, safe to remove |
| `gallery_count` | ⚠️ KEEP | Not displayed YET but should be added to StudioDetail stats |
| `group_count` | ⚠️ KEEP | Not displayed YET but should be added to StudioDetail stats |
| `image_count` | ⚠️ KEEP | Not displayed YET but should be added to StudioDetail stats |
| `movie_count` | ⚠️ KEEP | Not displayed YET but should be added to StudioDetail stats |
| `stash_ids` | ❌ UNUSED | Never displayed, safe to remove |

### Studio Fields - Complete List

**ALL USED OR NEEDED:**
- ✅ `id` - Primary key
- ✅ `name` - Display name
- ✅ `aliases` - Used in StudioDetail
- ✅ `child_studios { id, name }` - Parent/child relationships (minimal fields, good)
- ✅ `created_at` - Sorting
- ✅ `details` - Used in StudioDetail
- ✅ `favorite` - Used in Peek
- ✅ `groups` - Used in StudioDetail
- ✅ `image_path` - Studio logo
- ✅ `movies` - Used in StudioDetail
- ✅ `parent_studio { id, name, image_path }` - BLOATED (currently 16 fields, trim to 3)
- ✅ `performer_count` - Sorting
- ✅ `rating100` - Used in detail page
- ✅ `scene_count` - Used in stats
- ✅ `tags` - Used in StudioDetail
- ✅ `updated_at` - Sorting
- ✅ `url` - External link
- ✅ `rating` - Used in Peek (our custom field)
- ✅ `o_counter` - Used in Peek (our custom field)
- ✅ `play_count` - Used in Peek (our custom field)
- ⚠️ `gallery_count` - Should add to UI
- ⚠️ `group_count` - Should add to UI
- ⚠️ `image_count` - Should add to UI
- ⚠️ `movie_count` - Should add to UI

**Safe to remove**: `ignore_auto_tag`, `stash_ids` (2 fields)
**Bloat to trim**: `parent_studio` currently fetches 16 fields, trim to 3 (id, name, image_path)

---

## TAGS - Unused Fields

### Standalone Tag Query (findTags)

Used in Tags list page and TagDetail page.

| Field | Status | Notes |
|-------|--------|-------|
| `gallery_count` | ⚠️ KEEP | Not displayed YET but should be added to TagDetail |
| `group_count` | ⚠️ KEEP | Not displayed YET but should be added to TagDetail |
| `image_count` | ⚠️ KEEP | Not displayed YET but should be added to TagDetail |
| `movie_count` | ⚠️ KEEP | Not displayed YET but should be added to TagDetail |
| `scene_marker_count` | ⚠️ KEEP | Not displayed YET but should be added to TagDetail |
| `sort_name` | ❌ UNUSED | Never displayed, safe to remove |
| `studio_count` | ⚠️ KEEP | Not displayed YET but should be added to TagDetail |
| `child_count` | ❌ MISSING | Not in query - should ADD for parent/child relationships |

### Tag Fields - Complete List

**ALL USED OR NEEDED:**
- ✅ `id` - Primary key
- ✅ `name` - Display name
- ✅ `aliases` - Used in TagDetail
- ✅ `created_at` - Sorting
- ✅ `description` - Used in TagDetail
- ✅ `favorite` - Used in Peek
- ✅ `image_path` - Tag icon
- ✅ `parent_count` - Used (parents array)
- ✅ `parents { id, name }` - Parent relationships
- ✅ `performer_count` - Sorting
- ✅ `scene_count` - Used in stats
- ✅ `updated_at` - Sorting
- ✅ `rating` - Used in Peek (our custom field)
- ✅ `o_counter` - Used in Peek (our custom field)
- ✅ `play_count` - Used in Peek (our custom field)
- ⚠️ `gallery_count` - Should add to UI
- ⚠️ `group_count` - Should add to UI
- ⚠️ `image_count` - Should add to UI
- ⚠️ `movie_count` - Should add to UI
- ⚠️ `scene_marker_count` - Should add to UI
- ⚠️ `studio_count` - Should add to UI
- ❌ **MISSING**: `children { id, name }` - Should ADD for parent/child relationships
- ❌ **MISSING**: `child_count` - Should ADD for parent/child relationships

**Safe to remove**: Only `sort_name` (1 field)

---

## Summary of Removable Fields (REVISED)

### Scenes (Direct Removals)
- **Top-level**: 2 fields (`code`, `urls`) - director now KEPT
- **Nested arrays**: 1 array (`movies`) - galleries/groups now KEPT for future
- **Files**: 3 fields (`id`, `fingerprints`, `mod_time`) - created_at/updated_at may be kept
- **Paths**: 1 field (`paths.stream`) - preview/webp kept for future

**Total savings per scene**: ~7 direct fields + movies array

### Scenes (Nested Trimming - STILL HIGH IMPACT)
- **Studio in Scene**: Remove 8 of 10 fields (keep id, name)
- **Performers in Scene**: Remove 20 of 24 fields per performer (keep id, name, image_path, gender)
- **Tags in Scene**: Remove 7 of 10 fields per tag (keep id, name, image_path)

**Example**: A scene with 3 performers and 5 tags currently fetches:
- Studio: 10 fields (need 2) = 8 wasted
- Performers: 72 fields (need 12) = 60 wasted
- Tags: 50 fields (need 15) = 35 wasted
- **Total waste**: 103 fields for this one scene! (UNCHANGED - still big win)

### Performers (Standalone) - MAJOR CORRECTION
- **Removable**: 1 field (`stash_ids`)
- **Keep**: 39 fields (almost all used or needed)
- **Initial analysis was WRONG** - PerformerDetail displays most fields

### Studios (Standalone)
- **Removable**: 2 fields (`ignore_auto_tag`, `stash_ids`)
- **Trim bloat**: `parent_studio` from 16 fields to 3 (id, name, image_path) - saves 13 fields
- **Keep**: 23 fields (need to add count fields to UI)

### Tags (Standalone)
- **Removable**: 1 field (`sort_name`)
- **Add missing**: `children { id, name }` and `child_count` for parent/child relationships
- **Keep**: 22 fields (need to add count fields to UI)

---

## Estimated Impact (REVISED)

### Memory Savings - Scenes
Assuming average scene with 3 performers, 5 tags, 1 studio:
- **Per scene before**: ~150-200 fields
- **Per scene after trimming nested**: ~50-60 fields
- **Savings**: Still ~60-65% reduction in field count per scene

**Main savings come from nested object trimming (unchanged):**
- Scene nested trimming: ~103 wasted fields per average scene
- Scene direct removals: ~6 fields per scene

### Memory Savings - Standalone Queries (REVISED DOWN)
- **Performers**: Only 1 field removable (stash_ids) - minimal impact
- **Studios**: Only 2 fields removable (ignore_auto_tag, stash_ids) - minimal impact
- **Tags**: Only 1 field removable (sort_name) - minimal impact

**Reality Check**: Standalone performer/studio/tag queries won't see much optimization since most fields ARE used.

### Bandwidth Savings (Cache Refresh) - REVISED
For a library with 1000 scenes:
- Current payload: Estimated 15-20 MB
- Optimized payload (nested trimming only): Estimated 6-8 MB
- **Savings**: ~50-60% reduction (mostly from Scene nested trimming)

**Key Insight**: The BIG win is still from trimming nested objects in Scenes. Direct field removal gives minimal gains.

### Performance Impact
- Faster cache refreshes (less Scene data to transfer)
- Lower memory footprint in Node.js (mostly Scenes)
- Faster JSON parsing/serialization (mostly Scenes)
- Standalone queries (Performers/Studios/Tags) already efficient

---

## Recommendations

### Phase 1: Quick Wins (Scenes Direct Fields)
Remove these from `findScenes.graphql`:
- code
- urls
- movies { movie { id, name } } (deprecated in favor of groups)
- files[0].id
- files[0].fingerprints { type, value }
- files[0].mod_time
- paths.stream (won't be needed)

**Keep but add to UI**:
- director (add to SceneDetails card)

**Keep for future features** (comment in code):
- galleries { id, title } (future: image organization)
- groups { group { id, name } } (future: scene grouping)
- paths.preview (future: animated video previews)
- paths.webp (future: WebP animated previews)
- files[0].created_at, files[0].updated_at (may be useful vs scene-level timestamps)

**Effort**: Low (remove lines from GraphQL, add comments)
**Impact**: Small (~5% savings - only 7 fields removed)

### Phase 2: High Impact (Nested Trimming)
Trim nested objects in `findScenes.graphql`:

**Studio** - Only keep:
```graphql
studio {
  id
  name
}
```

**Performers** - Only keep:
```graphql
performers {
  id
  name
  image_path
  gender
}
```

**Tags** - Only keep:
```graphql
tags {
  id
  name
  image_path
}
```

**Effort**: Low (remove lines from GraphQL)
**Impact**: HIGH (~50-60% savings)

### Phase 3: Standalone Queries
Update standalone query files to remove unused fields and add missing relationships:

**findPerformers.graphql**:
- Remove: stash_ids (1 field)
- Add to UI: gallery_count, group_count, image_count, movie_count

**findStudios.graphql**:
- Remove: ignore_auto_tag, stash_ids (2 fields)
- Trim: parent_studio from 16 fields to 3 (id, name, image_path) - saves 13 fields
- Add to UI: gallery_count, group_count, image_count

**findTags.graphql**:
- Remove: sort_name (1 field)
- Add: children { id, name }, child_count (for parent/child relationships)
- Add to UI: gallery_count, group_count, image_count, movie_count, scene_marker_count, studio_count

**Effort**: Low
**Impact**: Small (~5% for Studios with parent_studio trimming, <2% for others)

---

## Next Steps

1. **Review this document** - Confirm all fields marked as unused are truly not needed
2. **Update stashapp-api** - Modify GraphQL query files
3. **Regenerate types** - Run `npm run codegen` in stashapp-api
4. **Publish new version** - Bump version and publish to npm
5. **Update Peek** - Install new stashapp-api version
6. **Test thoroughly** - Ensure no UI regressions
7. **Measure impact** - Check memory usage and cache refresh time improvements

---

**Analysis completed**: 2025-10-24
**Analyzed by**: Claude Code (Sonnet 4.5)
