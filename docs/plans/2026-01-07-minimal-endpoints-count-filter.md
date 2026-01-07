# Minimal Endpoints Count Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add count-based filtering to minimal endpoints so dropdowns only show entities with relevant content (e.g., performer dropdown in scene search only shows performers with scenes).

**Architecture:** Filter in-memory after loading from cache, using existing count fields from Stash entities.

**Tech Stack:** TypeScript, Express, React

---

## API Design

### New Type: MinimalCountFilter

```typescript
// server/types/api/common.ts
export interface MinimalCountFilter {
  min_scene_count?: number;
  min_gallery_count?: number;
  min_image_count?: number;
  min_performer_count?: number;
  min_group_count?: number;
}
```

### Updated Request Types

Each minimal endpoint adds optional `count_filter`:

```typescript
export interface FindPerformersMinimalRequest {
  filter?: PaginationFilter;
  count_filter?: MinimalCountFilter;
}
// Same for Studios, Tags, Galleries, Groups
```

### Available Filters by Entity

| Entity | Available count filters |
|--------|------------------------|
| Performer | scene, gallery, image, group |
| Studio | scene, gallery, image, performer, group |
| Tag | scene, gallery, image, performer, group |
| Gallery | image |
| Group | scene, performer |

### Filter Logic

- Multiple filters use OR logic (pass if ANY condition is true)
- Applied after exclusion filtering, before search/sort
- No filter = return all (backward compatible)

---

## Tasks

### Task 1: Add MinimalCountFilter type

**Files:**
- Modify: `server/types/api/common.ts`
- Modify: `server/types/api/library.ts`

**Steps:**
1. Add `MinimalCountFilter` interface to common.ts
2. Update all 5 minimal request types to include `count_filter?: MinimalCountFilter`
3. Export the new type from index.ts

### Task 2: Update findPerformersMinimal

**Files:**
- Modify: `server/controllers/library/performers.ts`

**Steps:**
1. Destructure `count_filter` from request body
2. After exclusion filtering, before search, add count filter logic
3. Filter performers where scene_count/gallery_count/image_count/group_count >= min values
4. Use OR logic if multiple filters provided

### Task 3: Update findStudiosMinimal

**Files:**
- Modify: `server/controllers/library/studios.ts`

**Steps:**
Same pattern as Task 2, but for studios (includes performer_count).

### Task 4: Update findTagsMinimal

**Files:**
- Modify: `server/controllers/library/tags.ts`

**Steps:**
Same pattern as Task 2, but for tags (includes performer_count, studio_count).

### Task 5: Update findGalleriesMinimal

**Files:**
- Modify: `server/controllers/library/galleries.ts`

**Steps:**
Same pattern as Task 2, but galleries only have image_count.

### Task 6: Update findGroupsMinimal

**Files:**
- Modify: `server/controllers/library/groups.ts`

**Steps:**
Same pattern as Task 2, but groups have scene_count and performer_count.

### Task 7: Add integration tests

**Files:**
- Create: `server/integration/api/minimal-endpoints-count-filter.integration.test.ts`

**Steps:**
1. Test each minimal endpoint with count_filter
2. Verify filtering works correctly
3. Verify backward compatibility (no filter = all results)
4. Verify OR logic for multiple filters

### Task 8: Update SearchableSelect component

**Files:**
- Modify: `client/src/components/ui/SearchableSelect.jsx`

**Steps:**
1. Add `countFilterContext` prop
2. Build count_filter based on context
3. Pass to API call

### Task 9: Update filter components to use countFilterContext

**Files:**
- Modify: Scene filter components
- Modify: Performer filter components
- Modify: Other entity filter components as needed

**Steps:**
1. Identify all SearchableSelect usages in filter contexts
2. Add appropriate countFilterContext prop
3. Test each dropdown shows filtered results

### Task 10: Run tests and verify

**Steps:**
1. Run unit tests
2. Run integration tests
3. Run TypeScript compilation
4. Manual verification of dropdowns

---

## Verification Checklist

- [ ] TypeScript compiles without errors
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Scene filters → performer dropdown shows only performers with scenes
- [ ] Scene filters → studio dropdown shows only studios with scenes
- [ ] Scene filters → tag dropdown shows only tags with scenes
- [ ] Performer filters → tag dropdown shows only tags with performers
- [ ] Backward compatibility: no count_filter returns all entities
