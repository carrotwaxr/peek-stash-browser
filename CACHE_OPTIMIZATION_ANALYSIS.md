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
| `director` | ❌ UNUSED | Defined in filter config but never displayed or used |
| `urls` | ❌ UNUSED | Array field, never accessed |

### Nested Objects

| Field | Status | Notes |
|-------|--------|-------|
| `galleries` | ❌ UNUSED | Array with id/title, never referenced |
| `groups` | ❌ UNUSED | Array with group.id/group.name, never referenced |
| `movies` | ❌ UNUSED | Array with movie.id/movie.name, never referenced |

### Files Fields (files[0])

| Field | Status | Notes |
|-------|--------|-------|
| `files[0].id` | ❌ UNUSED | Never referenced |
| `files[0].fingerprints` | ❌ UNUSED | Array with type/value, never referenced |
| `files[0].created_at` | ❌ UNUSED | Never referenced |
| `files[0].updated_at` | ❌ UNUSED | Never referenced |
| `files[0].mod_time` | ❌ UNUSED | Never referenced |

### Paths Fields

| Field | Status | Notes |
|-------|--------|-------|
| `paths.preview` | ❌ UNUSED | Never referenced |
| `paths.stream` | ❌ UNUSED | Peek uses custom transcoding, not Stash's stream URLs |
| `paths.webp` | ❌ UNUSED | Never referenced |

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

| Field | Status | Notes |
|-------|--------|-------|
| `circumcised` | ❌ UNUSED | Never displayed |
| `career_length` | ❌ UNUSED | Never displayed |
| `disambiguation` | ❌ UNUSED | Never displayed |
| `ethnicity` | ❌ UNUSED | Never displayed |
| `eye_color` | ❌ UNUSED | Never displayed |
| `fake_tits` | ❌ UNUSED | Never displayed |
| `hair_color` | ❌ UNUSED | Never displayed |
| `measurements` | ❌ UNUSED | Never displayed |
| `piercings` | ❌ UNUSED | Never displayed |
| `tattoos` | ❌ UNUSED | Never displayed |
| `gallery_count` | ❌ UNUSED | Never displayed |
| `group_count` | ❌ UNUSED | Never displayed |
| `image_count` | ❌ UNUSED | Never displayed |
| `movie_count` | ❌ UNUSED | Never displayed |
| `stash_ids` | ❌ UNUSED | Never displayed |

### Performer Fields USED (Keep These)

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
- ✅ `image_path` - Avatar image
- ✅ `url` - External link
- ✅ `instagram` - Social link
- ✅ `twitter` - Social link
- ✅ `scene_count` - Used in stats
- ✅ `o_counter` - Used in Peek stats
- ✅ `rating100` - Used in detail page
- ✅ `favorite` - Used in Peek
- ✅ `rating` - Used in Peek (our custom field)
- ✅ `play_count` - Used in Peek (our custom field)
- ✅ `tags` - Used in PerformerDetail
- ✅ `created_at` - Sorting
- ✅ `updated_at` - Sorting
- ✅ `urls` - Not accessed but might be useful

**Safe to remove**: 15 fields listed as unused above

---

## STUDIOS - Unused Fields

### Standalone Studio Query (findStudios)

Used in Studios list page and StudioDetail page.

| Field | Status | Notes |
|-------|--------|-------|
| `ignore_auto_tag` | ❌ UNUSED | Never displayed |
| `gallery_count` | ❌ UNUSED | Never displayed |
| `group_count` | ❌ UNUSED | Never displayed |
| `image_count` | ❌ UNUSED | Never displayed |
| `movie_count` | ❌ UNUSED | Never displayed |
| `stash_ids` | ❌ UNUSED | Never displayed |

### Studio Fields USED (Keep These)

- ✅ `id` - Primary key
- ✅ `name` - Display name
- ✅ `aliases` - Used in StudioDetail
- ✅ `child_studios` - Used in StudioDetail
- ✅ `created_at` - Sorting
- ✅ `details` - Used in StudioDetail
- ✅ `favorite` - Used in Peek
- ✅ `groups` - Used in StudioDetail
- ✅ `image_path` - Studio logo
- ✅ `movies` - Used in StudioDetail
- ✅ `parent_studio` - Used in StudioDetail
- ✅ `performer_count` - Sorting
- ✅ `rating100` - Used in detail page
- ✅ `scene_count` - Used in stats
- ✅ `tags` - Used in StudioDetail
- ✅ `updated_at` - Sorting
- ✅ `url` - External link
- ✅ `rating` - Used in Peek (our custom field)
- ✅ `o_counter` - Used in Peek (our custom field)
- ✅ `play_count` - Used in Peek (our custom field)

**Safe to remove**: 6 fields listed as unused above

---

## TAGS - Unused Fields

### Standalone Tag Query (findTags)

Used in Tags list page and TagDetail page.

| Field | Status | Notes |
|-------|--------|-------|
| `gallery_count` | ❌ UNUSED | Never displayed |
| `group_count` | ❌ UNUSED | Never displayed |
| `image_count` | ❌ UNUSED | Never displayed |
| `movie_count` | ❌ UNUSED | Never displayed |
| `scene_marker_count` | ❌ UNUSED | Never displayed |
| `sort_name` | ❌ UNUSED | Never displayed |
| `studio_count` | ❌ UNUSED | Never displayed |
| `child_count` | ❌ MAYBE USED | Defined in GraphQL, used in TagDetail (children array) |

### Tag Fields USED (Keep These)

- ✅ `id` - Primary key
- ✅ `name` - Display name
- ✅ `aliases` - Used in TagDetail
- ✅ `created_at` - Sorting
- ✅ `description` - Used in TagDetail
- ✅ `favorite` - Used in Peek
- ✅ `image_path` - Tag icon
- ✅ `parent_count` - Potentially used (parents array)
- ✅ `parents` - Used in TagDetail
- ✅ `performer_count` - Sorting
- ✅ `scene_count` - Used in stats
- ✅ `updated_at` - Sorting
- ✅ `rating` - Used in Peek (our custom field)
- ✅ `o_counter` - Used in Peek (our custom field)
- ✅ `play_count` - Used in Peek (our custom field)

**Note**: `children` is accessed but not in GraphQL query. Might need to add it or it's returned automatically.

**Safe to remove**: 7 fields listed as unused above

---

## Summary of Removable Fields

### Scenes (Direct Removals)
- **Top-level**: 3 fields (`code`, `director`, `urls`)
- **Nested arrays**: 3 arrays (`galleries`, `groups`, `movies`)
- **Files**: 5 fields per file
- **Paths**: 3 fields

**Total savings per scene**: ~14 direct fields + nested array data

### Scenes (Nested Trimming - HIGH IMPACT)
- **Studio in Scene**: Remove 8 of 10 fields
- **Performers in Scene**: Remove 20 of 24 fields per performer
- **Tags in Scene**: Remove 7 of 10 fields per tag

**Example**: A scene with 3 performers and 5 tags currently fetches:
- Studio: 10 fields (need 2) = 8 wasted
- Performers: 72 fields (need 12) = 60 wasted
- Tags: 50 fields (need 15) = 35 wasted
- **Total waste**: 103 fields for this one scene!

### Performers (Standalone)
- **Removable**: 15 fields
- **Keep**: 23 fields + our custom fields

### Studios (Standalone)
- **Removable**: 6 fields
- **Keep**: 19 fields + our custom fields

### Tags (Standalone)
- **Removable**: 7 fields
- **Keep**: 15 fields + our custom fields

---

## Estimated Impact

### Memory Savings
Assuming average scene with 3 performers, 5 tags, 1 studio:
- **Per scene before**: ~150-200 fields
- **Per scene after**: ~50-60 fields
- **Savings**: 65-70% reduction in field count per scene

### Bandwidth Savings (Cache Refresh)
For a library with 1000 scenes:
- Current payload: Estimated 15-20 MB
- Optimized payload: Estimated 5-7 MB
- **Savings**: ~60-70% reduction in GraphQL response size

### Performance Impact
- Faster cache refreshes (less data to transfer)
- Lower memory footprint in Node.js
- Faster JSON parsing/serialization
- Better cache locality

---

## Recommendations

### Phase 1: Quick Wins (Scenes Direct Fields)
Remove these from `findScenes.graphql`:
- code
- director
- urls
- galleries { id, title }
- groups { group { id, name } }
- movies { movie { id, name } }
- files[0].id
- files[0].fingerprints { type, value }
- files[0].created_at
- files[0].updated_at
- files[0].mod_time
- paths.preview
- paths.stream
- paths.webp

**Effort**: Low (remove lines from GraphQL)
**Impact**: Medium (~10-15% savings)

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
Update `findPerformers.graphql`, `findStudios.graphql`, `findTags.graphql` to remove unused count fields.

**Effort**: Low
**Impact**: Small (~5-10% savings for those queries)

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
