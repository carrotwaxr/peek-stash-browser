# Folder View Design

**Date:** 2026-01-19
**Status:** Implemented
**Issue:** #223
**Goal:** Add a "Folder" view mode that lets users browse content by navigating through the tag hierarchy visually, similar to Fossify Gallery's folder browsing experience.

## Context

Users with large, organized collections want to navigate content by drilling down through a hierarchy rather than using filters/search. The current Tag Hierarchy view shows tags in a tree structure, but users want to browse *content* organized by tags - tapping through folders of thumbnails to reach their content.

### User Request (from #223)

> In a folder-based app like Fossify Gallery it's easy to just tap several times to find /Photos/Color/Category1/Category2/Performer1/. In Peek or Stash you could go into Images or Galleries > hunt for specific gallery or Performers > search for tags associated with the categories.

### How This Differs from Tag Hierarchy View

| Tag Hierarchy View | Folder View |
|-------------------|-------------|
| Shows *tags themselves* in a tree | Shows *content* organized by tag hierarchy |
| Purpose: manage/explore tag structure | Purpose: browse content via tag navigation |
| Lives on Tags page | Lives on Scenes, Galleries, Images pages |
| Output: tags | Output: scenes/galleries/images grouped by tags |

## Design

### Core Concept

Folder view is a **presentation layer** on top of the existing query/filter system:

```
User applies filters → API returns filtered content →
  → Folder view groups results by tag hierarchy →
    → Display: folders first (with counts), then leaf content
```

This means:
- No new API endpoints needed
- Reuses all existing filter/sort logic
- Folder view is purely client-side organization
- Works with any active filters (studio, performer, date range, etc.)
- Content with multiple tags appears in multiple folders (expected behavior)

### Entity Types

Folder view applies to:
- Scenes
- Galleries
- Images

### Hierarchy Source

Uses **tag hierarchy** (parent/child relationships from Stash), not filesystem paths.

**Root level:** All top-level tags (tags with no parent) + "Untagged" folder

**Untagged folder:** Contains content that has no tags. Displayed alongside top-level tag folders.

---

## Layout

### Desktop (Split-pane)

```
┌─────────────────────────────────────────────────────────────┐
│  Scenes    [Search...]  [Filters]  Grid | Wall | Folder    │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                           │
│  ▼ Root         │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│    ▼ Color      │  │     │ │     │ │     │ │     │        │
│        Cat1  ←  │  │Cat2 │ │Perf1│ │Scene│ │Scene│        │
│        Cat2     │  │ 📁  │ │ 📁  │ │ ▶️  │ │ ▶️  │        │
│      BW         │  └─────┘ └─────┘ └─────┘ └─────┘        │
│    Category     │                                           │
│    Performer    │  ┌─────┐ ┌─────┐ ┌─────┐                 │
│                 │  │Scene│ │Scene│ │Scene│                 │
│                 │  │ ▶️  │ │ ▶️  │ │ ▶️  │                 │
│                 │  └─────┘ └─────┘ └─────┘                 │
└─────────────────┴───────────────────────────────────────────┘
```

**Left panel:** Collapsible tree showing current position in hierarchy
- Highlights current location
- Click to jump to any level
- Can be collapsed to maximize content area

**Right panel:** Grid showing current level contents
- Child tag folders first (sorted alphabetically)
- Then leaf content (sorted by current sort setting)

### Mobile (Stacked)

```
┌─────────────────────────┐
│  Scenes         Folder ▼│
├─────────────────────────┤
│  Root > Color > Cat1    │  ← Breadcrumb (tappable)
├─────────────────────────┤
│  ┌─────────┐ ┌─────────┐│
│  │         │ │         ││
│  │  Cat2   │ │  Perf1  ││
│  │   📁 12 │ │   📁 8  ││
│  └─────────┘ └─────────┘│
│  ┌─────────┐ ┌─────────┐│
│  │         │ │         ││
│  │  Scene  │ │  Scene  ││
│  │    ▶️   │ │    ▶️   ││
│  └─────────┘ └─────────┘│
└─────────────────────────┘
```

**No tree sidebar** - takes too much space on mobile

**Breadcrumb navigation:**
- Shows path: `Root > Color > Cat1`
- Tap any segment to jump back to that level
- Tap "Root" to return to top level

**Grid:** Same mixed display - folders first, then content

---

## Folder Cards

### Appearance

Folder cards are visually distinct from content cards:

```
┌─────────────────┐
│                 │
│   [thumbnail]   │
│                 │
├─────────────────┤
│ 📁 Tag Name     │
│    24 items     │
└─────────────────┘
```

**Thumbnail source (in order of preference):**
1. Tag's image from Stash (if set)
2. First item's thumbnail within that tag (recursive)
3. Generic folder placeholder

**Count:** Shows recursive total of all content within that tag and its children (so users know there's content somewhere down the tree)

### Interaction

- **Tap/click:** Drill down into that tag (update breadcrumb, show children)
- **Long-press/right-click:** Could show context menu (future: "Open in new tab", "Pin to home")

---

## Sorting & Display

### Sort Order

1. **Folders first** (sorted alphabetically by tag name)
2. **Content second** (sorted by current page sort setting: date, name, rating, etc.)

### Empty States

- **Tag with children but no direct content:** Show only child folders, no empty message
- **Tag with no children and no content:** Hide from view (filtered out)
- **No content matches filters:** Show "No results" as normal

### Filter Interaction

Folder view respects all active filters:
- If studio filter "Vixen" is active, only Vixen content appears
- Folders with no matching content are hidden
- Counts reflect filtered totals

Example: User has 100 scenes tagged "Color", but only 10 are from Vixen. With Vixen filter active, "Color" folder shows "10 items".

---

## Navigation

### Desktop

- Click folder → drill down
- Click tree item → jump to that level
- Click breadcrumb → jump to that level
- Browser back button → works naturally (URL includes current path)

### Mobile

- Tap folder → drill down
- Tap breadcrumb segment → jump to that level
- Swipe right → go up one level (optional, nice-to-have)
- Browser back button → works naturally

### URL Structure

Include current path in URL for bookmarking/sharing:

```
/scenes?view=folder&path=color,cat1,performer1
```

Or using tag IDs for stability:
```
/scenes?view=folder&path=123,456,789
```

---

## Implementation Considerations

### Data Requirements

Need tag hierarchy data loaded:
- Already available via StashCacheManager
- Tags include `parent_id` for hierarchy
- May need to ensure all tag relationships are cached

### Client-side Grouping

```typescript
interface FolderNode {
  tag: Tag | null;  // null for "Untagged" pseudo-folder
  children: FolderNode[];
  content: (Scene | Gallery | Image)[];
  totalCount: number;  // recursive count
}

function buildFolderTree(
  items: ContentItem[],
  tags: Tag[],
  currentPath: string[]
): FolderNode
```

### Performance

- Large result sets: May need virtualization for the grid
- Deep hierarchies: Lazy-load children? Or pre-compute full tree?
- Many tags: Consider pagination of folders at each level?

### Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 768px | Mobile: breadcrumb + grid, no sidebar |
| >= 768px | Desktop: collapsible sidebar + grid |

Sidebar default state:
- Desktop wide (>1200px): sidebar open
- Desktop narrow (768-1200px): sidebar collapsed by default

---

## View Mode Integration

### Selector UI

Add "Folder" to existing view mode selector:

```
Grid | Wall | Table | Folder
 □     □      □       📁
```

### Persistence

View mode preference stored per entity type (existing pattern):
- `viewMode.scenes = 'folder'`
- `viewMode.galleries = 'grid'`
- etc.

### Density

Folder view should respect the existing density setting (S/M/L) for both folder cards and content cards.

---

## Out of Scope (Future Enhancements)

1. **Filesystem path navigation** - This design only uses tag hierarchy
2. **Folder→Tag import tool** - Separate tagManager plugin feature
3. **Pinning tags to homepage** - Could be a separate feature
4. **Custom folder ordering** - Alphabetical only for now
5. **Multi-select across folders** - Complex interaction, defer

---

## Design Decisions

1. **Mobile swipe gesture:** No swipe-right gesture. Breadcrumb navigation only. Swipe-right conflicts with browser back gesture on mobile, and breadcrumb is the established pattern (Google Drive, Files app).

2. **Folder thumbnail caching:** Compute thumbnails when building the folder tree, store on the FolderNode object. One-time cost per tree build, not per-card render. Optimize later if needed for large libraries.

3. **URL path format:** Use tag IDs (`?path=123,456,789`) for stability. Tag names break if renamed. Breadcrumb displays human-readable names regardless of URL format.

---

## References

- Issue #223 - Original request
- [Fossify Gallery](https://github.com/FossifyOrg/Gallery) - UX reference for folder grid navigation
- [docs/plans/2025-01-11-view-mode-options-brainstorm.md](./2025-01-11-view-mode-options-brainstorm.md) - View modes overview
