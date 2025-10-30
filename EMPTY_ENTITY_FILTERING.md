# Empty Entity Filtering Implementation Analysis

## Overview

Implement filtering to hide entities with no content from **regular users** (admin users continue to see everything). This applies after user content restrictions have been applied.

**"Content"** is defined as: **Scenes** or **Images**

## Requirements by Entity Type

### 1. Groups
**Hide if**: Has no Scenes

**Challenge**: Groups have parent/child relationships via `containing_groups` and `sub_groups`
- Must trace the entire tree
- Remove "dead branches" (if a parent has no scenes, but all children are removed, remove the parent too)

**Available Data**:
```graphql
scene_count: Int
sub_group_count: Int
containing_groups: [GroupRelationship]  # Parents
sub_groups: [GroupRelationship]         # Children
```

**Algorithm**:
1. Mark groups with `scene_count > 0` as "has content"
2. For groups with `scene_count === 0`:
   - Check if any child groups have content (recursive)
   - If any child has content, keep this group (it's a valid parent)
   - Otherwise, mark for removal
3. After first pass, check parents:
   - If all children removed, remove parent too
4. Repeat until stable (no more removals)

### 2. Galleries
**Hide if**: Has no Images

**Simple case** - no hierarchical relationships

**Available Data**:
```graphql
image_count: Int
```

**Algorithm**:
```typescript
galleries = galleries.filter(g => g.image_count > 0);
```

### 3. Performers
**Hide if ALL of these are true**:
- No Scenes (`scene_count === 0`)
- No Images (`image_count === 0`)
- Not in a Group that has Scenes (`group_count === 0` OR all groups they're in have no scenes)
- No Gallery with images (`gallery_count === 0` OR all galleries have no images)

**Available Data**:
```graphql
scene_count: Int
image_count: Int
gallery_count: Int
group_count: Int
```

**Challenge**: The counts don't tell us if the Groups/Galleries have content
- Need to cross-reference with already-filtered groups/galleries

**Algorithm**:
1. Filter groups and galleries first (prerequisites)
2. For each performer:
   - If `scene_count > 0` → keep
   - If `image_count > 0` → keep
   - If in any visible group (cross-reference) → keep
   - If has any visible gallery (cross-reference) → keep
   - Otherwise → remove

**Note**: This requires fetching performer's groups/galleries to check if they're in the filtered lists

### 4. Studios
**Hide if ALL of these are true**:
- No Scenes (`scene_count === 0`)
- No Groups containing Scenes (all groups are filtered out)
- No Images (`image_count === 0`)
- No Galleries containing images (all galleries are filtered out)

**Available Data**:
```graphql
scene_count: Int
group_count: Int
groups: [Group]
gallery_count: Int
image_count: Int
parent_studio: Studio
child_studios: [Studio]
```

**Challenge**: Similar to Performers - need to check if groups/galleries have content
- Also has parent/child studio relationships (but less critical than Group trees)

**Algorithm**:
1. Filter groups and galleries first (prerequisites)
2. For each studio:
   - If `scene_count > 0` → keep
   - If `image_count > 0` → keep
   - If has any visible group → keep
   - If has any visible gallery → keep
   - Otherwise → remove
3. Optionally handle parent/child relationships (if parent removed, should children move up?)

### 5. Tags
**Most complex** - parent/child relationships AND can be attached to many entity types

**Hide if**: Has no attachments to any visible entities

**Available Data**:
```graphql
scene_count: Int
image_count: Int
gallery_count: Int
group_count: Int
performer_count: Int
studio_count: Int
parent_count: Int
parents: [Tag]
child_count: Int
children: [Tag]
```

**Challenge**:
- All the counts include entities that might be filtered out
- Need to check if tag is attached to any *visible* entities
- Must trace parent/child tree similar to Groups

**Algorithm** (complex):
1. Filter all other entities first (scenes, images, galleries, groups, performers, studios)
2. For each tag:
   - Check if attached to any visible scenes (requires scene lookup)
   - Check if attached to any visible images (requires image lookup)
   - Check if attached to any visible galleries
   - Check if attached to any visible groups
   - Check if attached to any visible performers
   - Check if attached to any visible studios
   - If any attachment exists → mark as "has content"
3. Tree traversal:
   - If tag has content → keep it and all ancestors
   - If tag has no content but has children with content → keep (it's a valid parent)
   - Otherwise → remove
4. Repeat until stable

## Implementation Architecture

### Current Structure

```typescript
// In library controller (library.ts)
export const findPerformers = async (req, res) => {
  // 1. Get from cache
  let performers = stashCacheManager.getAllPerformers();

  // 2. Merge user data
  performers = await mergePerformersWithUserData(performers, userId);

  // 3. Apply search
  if (searchQuery) { /* filter */ }

  // 4. Apply filters
  performers = applyPerformerFilters(performers, mergedFilter);

  // 4.5. Apply content restrictions (user-based)
  if (user.role !== 'ADMIN') {
    performers = await userRestrictionService.filterPerformersForUser(performers, userId);
  }

  // 5. Sort
  // 6. Paginate
};
```

**Where to add empty entity filtering**: After step 4.5 (user restrictions)

### Proposed Solution

#### Option A: Extend UserRestrictionService (Recommended)

**Add new methods**:
```typescript
class UserRestrictionService {
  /**
   * Filter entities with no content (non-admin only)
   * Applies AFTER user content restrictions
   */
  async filterEmptyPerformers(performers: any[]): Promise<any[]>
  async filterEmptyStudios(studios: any[]): Promise<any[]>
  async filterEmptyGroups(groups: any[]): Promise<any[]>
  async filterEmptyGalleries(galleries: any[]): Promise<any[]>
  async filterEmptyTags(tags: any[]): Promise<any[]>
}
```

**Pros**:
- Logical extension of existing service
- All filtering logic in one place
- Easy to toggle on/off per user

**Cons**:
- Service is getting large
- "Content restriction" vs "empty filtering" are conceptually different

#### Option B: Create EmptyEntityFilterService

**New service**:
```typescript
class EmptyEntityFilterService {
  /**
   * Filter out entities with no content
   * Requires: StashCacheManager for lookups
   */
  filterEmptyPerformers(performers: any[], visibleGroups: Set<string>, visibleGalleries: Set<string>): any[]
  filterEmptyStudios(studios: any[], visibleGroups: Set<string>, visibleGalleries: Set<string>): any[]
  filterEmptyGroups(groups: any[]): any[]
  filterEmptyGalleries(galleries: any[]): any[]
  filterEmptyTags(tags: any[], visibleEntities: VisibleEntitySets): any[]
}
```

**Pros**:
- Separation of concerns
- Clearer purpose
- Easier to test in isolation

**Cons**:
- Another service to manage
- Requires coordination between services

**Recommendation**: **Option B** - Create separate service for clarity

### Implementation Order (Dependencies)

**Critical**: Must filter in this order due to dependencies:

1. **Galleries** (no dependencies)
   ```typescript
   galleries = galleries.filter(g => g.image_count > 0);
   ```

2. **Groups** (no dependencies, but complex tree traversal)
   ```typescript
   groups = filterEmptyGroups(groups); // Recursive tree pruning
   ```

3. **Studios** (depends on groups, galleries)
   ```typescript
   studios = filterEmptyStudios(studios, visibleGroups, visibleGalleries);
   ```

4. **Performers** (depends on groups, galleries)
   ```typescript
   performers = filterEmptyPerformers(performers, visibleGroups, visibleGalleries);
   ```

5. **Tags** (depends on ALL other entities)
   ```typescript
   tags = filterEmptyTags(tags, {
     scenes: visibleScenes,
     images: visibleImages,
     galleries: visibleGalleries,
     groups: visibleGroups,
     performers: visiblePerformers,
     studios: visibleStudios,
   });
   ```

### Data Requirements

**Problem**: Some filtering requires checking if entities are attached to visible entities

**Example**: Performer has `gallery_count = 3`, but are those galleries visible (have images)?

**Solutions**:

**Option A: Fetch full data from cache**
- For performers, fetch their galleries from cache and check `image_count`
- For tags, fetch all related entities and check visibility
- **Pros**: Accurate
- **Cons**: Performance (N+1 lookups)

**Option B: Pre-compute visibility sets**
- After filtering each entity type, create a `Set<string>` of visible IDs
- Pass these sets to subsequent filters
- **Pros**: O(1) lookups
- **Cons**: Requires specific order of operations

**Option C: Add to cache metadata**
- Cache manager computes "has content" flags during initial load
- Simplifies filtering logic
- **Pros**: Fast, simple
- **Cons**: Requires cache rebuild, couples cache to business logic

**Recommendation**: **Option B** - Pre-compute visibility sets

## Performance Considerations

### Complexity Analysis

**Galleries**: O(n) - simple filter
**Groups**: O(n * d) - where d = tree depth, usually small
**Studios**: O(n * (g + f)) - where g = avg groups per studio, f = avg galleries
**Performers**: O(n * (g + f)) - similar to studios
**Tags**: O(n * (s + i + g + f + p + st)) - check all entity types

**Worst case**: Large library with deep hierarchies
- 50,000 scenes
- 10,000 performers
- 5,000 tags with deep trees
- Filtering could take 100-500ms per request

### Optimization Strategies

1. **Cache filtered results per user**
   - Key: `userId + entityType + filterHash`
   - TTL: Until cache invalidation
   - **Benefit**: Sub-millisecond responses for repeat requests

2. **Lazy loading for tags**
   - Don't filter tags until user specifically requests them
   - Most users never browse tag list
   - **Benefit**: Saves 50-200ms on initial load

3. **Background pre-computation**
   - When cache loads, pre-compute "has content" for all entities
   - Store in memory alongside entity data
   - **Benefit**: Real-time filtering becomes simple boolean check

4. **Minimal data endpoints already optimized**
   - `/api/library/performers/minimal` returns only `id + name`
   - Filtering these is much faster
   - Consider separate filtering logic for minimal vs full data

## Edge Cases & Considerations

### 1. Empty States
**Problem**: User with heavy restrictions sees empty lists everywhere

**Solution**:
- Show message: "No [entity] found. Contact admin to adjust content restrictions."
- Don't hide nav items (confusing UX)
- Track in analytics to identify over-restricted users

### 2. Group Tree Complexity
**Problem**: Deep group hierarchies (e.g., franchises > series > seasons > episodes)

**Example**:
```
Marvel Universe (no scenes, but has children)
  ├─ MCU Phase 1 (no scenes, but has children)
  │   ├─ Iron Man Series (has scenes!) ✓
  │   └─ Thor Series (no scenes, remove)
  └─ MCU Phase 2 (all children removed, so remove this too)
```

**Solution**: Recursive algorithm with bottom-up pruning

### 3. Tag Tree Complexity
**Problem**: Tags can form DAGs (directed acyclic graphs), not just trees
- A tag can have multiple parents
- Removing one parent doesn't remove the tag

**Example**:
```
"Outdoor" ← "Beach"
"Water"   ← "Beach"
```
If "Outdoor" is removed, "Beach" still has "Water" as parent

**Solution**: Don't remove tags with ANY valid parent

### 4. Performance on Large Libraries
**Problem**: Library with 100,000+ scenes, 20,000+ performers

**Solution**:
- Implement caching strategy (Option 3 from Performance section)
- Consider pagination during filtering (filter in chunks)
- Add metrics/logging to identify slow queries

### 5. Real-time Updates
**Problem**: User adds a scene while browsing, performer suddenly appears in list

**Solution**:
- Acceptable behavior (cache is eventually consistent)
- Cache invalidation already handles this
- No special handling needed

## Testing Strategy

### Unit Tests

1. **Gallery filtering** - simple case
2. **Group tree pruning** - various tree structures
3. **Performer cross-references** - with/without visible groups/galleries
4. **Tag DAG traversal** - complex parent/child relationships
5. **Edge cases** - empty inputs, single entity, all entities removed

### Integration Tests

1. **End-to-end filtering** - Full user journey
2. **Performance** - Large datasets (10k+ entities)
3. **Admin bypass** - Admins see everything
4. **Regular user** - Filtering applied correctly

### Test Data Scenarios

**Scenario 1: Deep Group Hierarchy**
```
Group A (0 scenes)
  ├─ Group B (0 scenes)
  │   └─ Group C (5 scenes) ✓ Keep C, B, A
  └─ Group D (0 scenes)      ✗ Remove D
```

**Scenario 2: Performer with No Direct Content**
```
Performer: "John Doe"
- scene_count: 0
- image_count: 0
- BUT: In "Group C" which has scenes
- Result: Keep (visible through group)
```

**Scenario 3: Tag Tree Pruning**
```
"Genre" (attached to nothing, but has children)
  ├─ "Action" (attached to 10 visible scenes) ✓
  └─ "Drama" (attached to 0 scenes, no children) ✗
Result: Keep "Genre" (has valid child), Keep "Action", Remove "Drama"
```

## Implementation Phases

### Phase 1: Simple Cases (2-3 days)
- Implement gallery filtering
- Add to all entity endpoints
- Add admin bypass check
- Unit tests

**Deliverable**: Galleries with no images hidden for regular users

### Phase 2: Performers & Studios (3-4 days)
- Implement performer filtering with cross-references
- Implement studio filtering
- Add visibility set pre-computation
- Integration tests

**Deliverable**: Empty performers and studios hidden

### Phase 3: Group Tree Pruning (3-4 days)
- Implement recursive group filtering
- Handle parent/child relationships
- Test various tree structures
- Edge case handling

**Deliverable**: Dead group branches removed

### Phase 4: Tag DAG Traversal (4-5 days)
- Implement tag filtering with all entity checks
- Handle parent/child relationships (DAG not tree)
- Optimize performance (this will be the slowest)
- Comprehensive testing

**Deliverable**: Empty tags hidden

### Phase 5: Performance & Caching (2-3 days)
- Implement caching strategy
- Add performance metrics
- Optimize slow queries
- Load testing

**Deliverable**: <100ms response times even for large libraries

**Total Estimate: 14-19 days**

## Risks & Unknowns

### High Risk
1. **Performance degradation** - Tag filtering could be very slow
2. **Complex edge cases** - Group/tag trees might have unexpected structures
3. **User confusion** - "Why can't I see this performer I know exists?"

### Medium Risk
1. **Cache invalidation** - Filtered results need to be recomputed on cache update
2. **Pagination conflicts** - Filtering after pagination breaks counts
3. **Search integration** - Search results might include hidden entities

### Mitigation
- Implement in phases, validate performance at each step
- Add comprehensive logging to debug edge cases
- Clear user messaging about content restrictions
- Document behavior in user guide

## Questions to Clarify

1. **Tag filtering message got cut off** - You mentioned "trace and trim th..." - did you mean "trace and trim the tree"?

2. **Performer in multiple groups** - If a performer is in 5 groups, and only 1 has scenes, should they be visible?
   - **Assumption**: Yes (they have content through at least one group)

3. **Studio parent/child relationships** - Should we prune studio trees like we do with groups?
   - **Assumption**: Less critical, but probably yes for consistency

4. **Performance vs. accuracy** - For tags, checking attachments to all entity types is expensive. Acceptable to have slower tag list endpoint?
   - **Recommendation**: Yes, tags are less frequently accessed than scenes/performers

5. **Caching strategy** - Should we cache filtered results per user, or recompute each time?
   - **Recommendation**: Cache with TTL tied to Stash cache invalidation

6. **Minimal endpoints** - Should `/api/library/performers/minimal` also filter empties?
   - **Recommendation**: Yes, for consistency

## Next Steps

1. **Confirm requirements** - User clarifies any ambiguities above
2. **Choose architecture** - Option A (extend UserRestrictionService) or Option B (new service)?
3. **Start with Phase 1** - Implement simple gallery filtering as proof of concept
4. **Iterate** - Build out remaining phases based on feedback

---

**Last Updated**: 2025-10-30
**Status**: Requirements gathering complete, awaiting confirmation to proceed
