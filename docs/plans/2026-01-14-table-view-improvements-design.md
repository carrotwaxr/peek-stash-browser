# Table/List View Improvements Design

## Overview

This document covers improvements to the Table/List view feature to ensure:
1. Correct default columns per entity type
2. Proper image aspect ratios in table cells
3. All sortable/displayable columns are available
4. Visual distinction between sorted column headers and title/name links

---

## 1. Default Columns Per Entity Type

### Performers
**Default visible (in order):** Image, Name, Gender, Age, Country, Ethnicity, Scenes

**Current `PERFORMER_COLUMNS` issues:**
- Rating and Favorite are visible by default but shouldn't be
- Gender, Age, Country, Ethnicity are hidden by default but should be visible
- Scenes (scenes_count) is hidden by default but should be visible

### Studios
**Default visible (in order):** Image, Name, Parent Studio, Scenes

**Current `STUDIO_COLUMNS` issues:**
- Rating is visible by default but shouldn't be
- Parent Studio is hidden by default but should be visible

### Tags
**Default visible (in order):** Image, Name, Scenes, Performers, Studios, Images

**Current `TAG_COLUMNS` issues:**
- Missing columns: Studios count, Images count
- performer_count is hidden but should be visible

### Groups
**Default visible (in order):** Image, Name, Date, Scenes, Performers, Tags

**Current `GROUP_COLUMNS` issues:**
- Rating is visible by default but shouldn't be
- Missing columns: Performers, Tags
- scene_count exists but needs to be visible

### Galleries
**Default visible (in order):** Cover (rename from Thumbnail), Title, Date, Studio, Images

**Current `GALLERY_COLUMNS` issues:**
- Thumbnail should be renamed to "Cover"
- Rating is visible by default but shouldn't be
- Studio is hidden but should be visible
- Cover image not displaying (renderer issue)

### Images
**Default visible (in order):** Image (rename from Thumbnail), Title, Studio, Performers, Tags, Resolution

**Current `IMAGE_COLUMNS` issues:**
- Thumbnail should be renamed to "Image"
- Rating is visible by default but shouldn't be
- Studio, Performers, Tags are hidden but should be visible
- Resolution is hidden but should be visible

---

## 2. Image Aspect Ratios in Table Cells

The `ThumbnailCell` component currently uses fixed dimensions (`w-16 h-10`). This needs to be entity-aware to match aspect ratios used elsewhere:

| Entity Type | Card Aspect Ratio | Table Cell Dimensions |
|-------------|-------------------|----------------------|
| Performer   | 2/3 (portrait)    | w-10 h-14 (portrait) |
| Gallery     | 2/3 (portrait)    | w-10 h-14 (portrait) |
| Group       | 2/3 (portrait)    | w-10 h-14 (portrait) |
| Scene       | 16/9 (landscape)  | w-16 h-10 (landscape) - current |
| Studio      | 16/9 (landscape)  | w-16 h-10 (landscape) - current |
| Tag         | 16/9 (landscape)  | w-16 h-10 (landscape) - current |
| Image       | variable          | w-10 h-10 (square)   |

**Implementation:** Create an entity-aware thumbnail component or pass entity type to `ThumbnailCell`.

---

## 3. Missing Columns & Sort Fields

### Columns to Add

**Scenes:**
- `created_at` - sortable, matches existing sort option

**Studios:**
- `gallery_count` - Galleries count (if sortable via API)
- `image_count` - Images count
- `performer_count` - Performers count
- `group_count` - Groups/Collections count

**Tags:**
- `studio_count` - Studios count (need to verify API support)
- `image_count` - Images count (need to verify API support)

**Groups:**
- `performers` - Multi-value cell showing performers in group
- `tags` - Multi-value cell showing tags

### Sort Field Mapping

Some columns need mapping to their sort field equivalents. The `COLUMN_SORT_FIELD_OVERRIDES` map handles this:

```javascript
const COLUMN_SORT_FIELD_OVERRIDES = {
  "performer:age": "birthdate",
  "performers:age": "birthdate",
  // Add any new mappings here
};
```

### Columns That Should Be Sortable (Currently Not)

Review each entity's sort options (`filterConfig.js`) and ensure corresponding columns exist:

**Scenes** - all sort options have columns except:
- `created_at` (missing column)
- `bitrate`, `framerate`, `last_o_at`, `last_played_at`, `performer_count`, `play_duration`, `tag_count`, `updated_at` (consider adding)

**Performers** - sort options vs columns:
- `career_length`, `height`, `measurements`, `penis_length`, `weight` (no columns)
- `created_at`, `updated_at`, `last_o_at`, `last_played_at`, `play_count` (no columns)

**Studios** - sort options vs columns:
- `created_at`, `updated_at`, `o_counter`, `play_count` (no columns)

**Tags** - sort options vs columns:
- `created_at`, `updated_at`, `o_counter`, `play_count` (no columns)

**Groups** - sort options vs columns:
- `created_at`, `updated_at` (no columns)

**Galleries** - sort options vs columns:
- `created_at`, `updated_at` (no columns)

**Images** - sort options vs columns:
- `created_at`, `updated_at`, `date` (no columns for created_at, updated_at)

---

## 4. Visual Distinction: Sorted Column Headers vs Title Links

### Current State
Both use `--accent-primary` (purple), making them visually indistinct.

### Solution: Use `--accent-secondary` for Sorted Column Headers

**TableHeader.jsx change:**
```javascript
style={{
  color: isSorted
    ? "var(--accent-secondary)"  // Changed from accent-primary
    : "var(--text-primary)",
  opacity: isSortable ? 1 : 0.7,
}}
```

This keeps Name/Title links as `--accent-primary` (the standard link color) while sorted column headers use `--accent-secondary` (pink in default theme), providing clear visual distinction.

---

## 5. Gallery Cover Image Not Displaying

The gallery thumbnail renderer references `gallery.cover?.paths?.thumbnail` but may not be receiving the cover data. Need to verify:
1. The GraphQL query includes cover image fields
2. The data path is correct

---

## Implementation Checklist

### Phase 1: Column Configuration Updates
- [ ] Update `PERFORMER_COLUMNS` order and defaults
- [ ] Update `STUDIO_COLUMNS` order and defaults
- [ ] Update `TAG_COLUMNS` order, defaults, and add missing columns
- [ ] Update `GROUP_COLUMNS` order, defaults, and add missing columns
- [ ] Update `GALLERY_COLUMNS` - rename Thumbnail to Cover, fix defaults
- [ ] Update `IMAGE_COLUMNS` - rename Thumbnail to Image, fix defaults
- [ ] Add `SCENE_COLUMNS` created_at column

### Phase 2: Cell Renderers
- [ ] Update `ThumbnailCell` to accept entity type and adjust aspect ratio
- [ ] Add renderers for new columns (studio_count, image_count, etc.)
- [ ] Fix gallery cover image renderer if needed
- [ ] Add group performers and tags renderers

### Phase 3: Visual Distinction
- [ ] Update `TableHeader.jsx` to use `--accent-secondary` for sorted columns

### Phase 4: Verify API Support
- [ ] Check if tag studio_count and image_count are available from API
- [ ] Check if additional sort fields need columns
- [ ] Verify gallery cover image data is being fetched

---

## Files to Modify

1. `client/src/config/tableColumns.js` - Column definitions
2. `client/src/components/table/cellRenderers.jsx` - Cell rendering
3. `client/src/components/table/TableHeader.jsx` - Sorted column styling
4. Potentially GraphQL queries if data is missing
