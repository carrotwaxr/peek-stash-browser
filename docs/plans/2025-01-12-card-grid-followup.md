# Card/Grid Refactor Follow-up Tasks

**Created:** 2025-01-12
**Status:** Pending
**Priority:** Low

Follow-up items identified during code review of the card/grid refactor.

## Background

The card/grid refactor (completed 2025-01-12) introduced:
- Three-layer card architecture: Primitives -> BaseCard -> Entity Cards
- Two-layer grid architecture: BaseGrid -> SearchableGrid/Entity Grids

Code review identified minor improvements that were not blockers for the initial refactor.

## Tasks

### 1. Complete Search Page Migration (Important)

**Current state:** Search pages (Galleries, Groups, Studios, Tags) still have inline grid implementations instead of using entity grids.

**Blocker:** TV navigation (`useGridPageTVNavigation`) needs to be integrated into SearchableGrid first.

**Files to migrate:**
- `client/src/components/pages/Galleries.jsx`
- `client/src/components/pages/Groups.jsx`
- `client/src/components/pages/Studios.jsx`
- `client/src/components/pages/Tags.jsx`

**Benefit:** Removes ~250 lines of duplicated code across 4 search pages.

**Steps:**
1. Add TV navigation support to SearchableGrid or entity grids
2. Add `isInitializing` state support to SearchableGrid for SyncProgressBanner
3. Migrate each search page to use its corresponding entity grid

---

### 2. Add entityTitle to Rating Controls (Nice to Have)

**Issue:** Entity cards don't pass `entityTitle` to ratingControlsProps, so rating dialogs show generic "Rate this [entity]" instead of "Rate Studio Name".

**Files to update:**
- `client/src/components/cards/PerformerCard.jsx` - add `entityTitle: performer.name`
- `client/src/components/cards/GalleryCard.jsx` - add `entityTitle: gallery.title`
- `client/src/components/cards/GroupCard.jsx` - add `entityTitle: group.name`
- `client/src/components/cards/StudioCard.jsx` - add `entityTitle: studio.name`
- `client/src/components/cards/TagCard.jsx` - add `entityTitle: tag.name`
- `client/src/components/cards/ImageCard.jsx` - add `entityTitle: image.title`

---

### 3. Add Defensive Rating Fallback (Nice to Have)

**Issue:** GalleryCard uses only `gallery.rating100` but old implementation had fallback to `gallery.rating`.

**File:** `client/src/components/cards/GalleryCard.jsx`

**Change:**
```jsx
// From
initialRating: gallery.rating100,

// To
initialRating: gallery.rating100 ?? gallery.rating,
```

---

### 4. Document Filter Merge Behavior (Nice to Have)

**Issue:** SearchableGrid uses shallow merge for filters which could cause issues if both `newQuery` and `lockedFilters` have nested filter objects.

**File:** `client/src/components/ui/SearchableGrid.jsx`

**Change:** Add explanatory comment:
```jsx
// Merge locked filters into query
// Note: Uses shallow merge. Assumes lockedFilters and newQuery
// use different filter keys (e.g., gallery_filter vs filter)
const mergedQuery = {
  ...newQuery,
  ...lockedFilters,
};
```

---

### 5. Verify Conditional Rating Controls (Design Question)

**Issue:** TagCard and ImageCard conditionally render rating controls based on `rating100 !== undefined`. This may cause height inconsistency if some cards show rating row and others don't.

**Question:** Should all entities always show rating controls (even when undefined/0)?

**Files:**
- `client/src/components/cards/TagCard.jsx`
- `client/src/components/cards/ImageCard.jsx`

**Action:** Verify with product requirements whether all entities should show rating controls consistently.
