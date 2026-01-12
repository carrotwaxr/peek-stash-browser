# View Mode Options Brainstorm

**Date:** 2025-01-11
**Status:** Ideation
**Goal:** Research and brainstorm alternative display modes for search results and detail page tabs beyond the current card-based view.

## Context

Currently, peek uses a card-based grid layout for all search results and entity listings. Users have filter/sort controls but no way to change _how_ results are displayed. This document captures ideas for additional view modes to give users more customization options.

**Design principles:**
- User customizability is the primary goal
- Keep implementation DRY across entity types
- Support both video and image content

---

## Core View Types (High Value)

### 1. Grid (Current Cards)
What peek has now - visual-first with thumbnails, ratings, indicators. Good baseline that works for all entity types.

### 2. List/Table View
- Compact rows with columns: thumbnail (small), title, studio, date, duration, rating, tags
- Sortable columns by clicking headers
- High density - 20-50+ items visible at once
- Great for scanning metadata quickly, bulk operations
- **Reference:** Spotify's compact library view, file manager details view

### 3. Compact/Dense Grid
- Same grid layout but smaller cards - maybe 50-60% size
- Fewer details shown (title + thumbnail only, no description/indicators)
- Middle ground between full cards and list view
- **Reference:** iOS Photos pinch-to-zoom, Spotify grid sizing

### 4. Wall/Mosaic View
- Edge-to-edge thumbnails with no gaps or minimal gaps
- Title/info appears on hover only
- Maximum visual density for browsing by "vibe"
- Stash already has this - familiar to users
- **Reference:** Pinterest masonry, Unsplash, Stash wall view

---

## Comparison & Curation Views

### 5. Filmstrip + Detail
- Horizontal strip of thumbnails at bottom
- Large preview/detail of selected item above
- Good for sequential browsing through results
- **Reference:** Lightroom loupe + filmstrip

### 6. Compare View
- Side-by-side view of 2-4 selected items
- Synchronized zoom/pan for images
- Useful for: "which performer photo is better?", "which scene version?"
- **Reference:** Lightroom compare view

### 7. Survey View
- Show only currently selected items in a focused grid
- Remove items from survey with X button to narrow down
- Good for curation workflows: "pick the best 3 from these 20"
- **Reference:** Lightroom survey view

---

## Information-Dense Views

### 8. Metadata Table
- Full spreadsheet-style view
- All available metadata as columns (user picks which to show)
- Inline editing potential
- Best for: bulk tagging, data cleanup, finding missing metadata
- **Reference:** Excel, Airtable, database admin tools

### 9. Timeline/Calendar View
- Items plotted on a date axis (release date, date added, etc.)
- Visual clustering shows activity patterns
- **Reference:** Google Photos, macOS Photos memories

### 10. Statistics/Analytics View
- Not a browse view per se, but aggregate view
- Charts: ratings distribution, tags frequency, studios breakdown
- Could be a dashboard or a "view mode" for search results

---

## Specialized Views

### 11. Preview/Theater Mode
- One large item at a time, full-width
- Arrow keys or swipe to navigate
- Minimal chrome, maximum content
- Good for: "watching" through search results like a slideshow

### 12. Split Pane
- Two independent browse panels side by side
- Drag items between them
- Useful for: comparing folders, organizing into collections
- **Reference:** file managers, Total Commander

### 13. Hierarchy/Tree View (for Tags)
- Tree structure showing parent/child relationships
- Expandable nodes
- Could also work for Studios (parent studio -> sub-studios)
- Note: This is somewhat separate from general search result display

---

## Thumbnail Variants (Modifiers)

These could be toggles that apply to Grid/Wall modes rather than separate view modes:

### 14. Aspect Ratio Options
- Square crops (uniform grid, Instagram-style)
- Original aspect (masonry/variable height)
- Fixed 16:9 (current default for scenes)

### 15. Preview Behavior Options
- Static thumbnail
- Sprite animation on hover
- Video preview on hover
- Animated WebP

### 16. Info Overlay Options
- Clean (no overlays)
- Minimal (duration/resolution badges only)
- Full (title, studio, indicators)

---

## Implementation Considerations

To keep things DRY:

| Concept | Approach |
|---------|----------|
| **View mode component** | Single `<ResultsView mode={mode} items={items} />` that switches renderer |
| **Item renderer** | Each mode has a renderer, but they share the same data shape |
| **Column/field config** | Entity-type-specific field definitions, views pick which to display |
| **User preference storage** | Per-entity-type makes most sense (e.g., List for scenes, Grid for performers) |
| **View switcher UI** | Icon buttons in the existing filter/sort toolbar area |

---

## Questions to Answer

1. **Which 3-4 views for v1?** Recommendation: Grid (current), List/Table, Compact Grid, Wall
2. **Should view preference be global or per-entity-type?**
3. **Which views don't fit peek's use case?** (Timeline might be overkill)
4. **How do modifiers (aspect ratio, preview behavior) interact with view modes?**

---

## Research Sources

- [Lightroom view modes](https://lightroomkillertips.com/grid-loupe-compare-survey-view-one-use/)
- [Cards vs Tables UX patterns](https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards)
- [Gallery UI patterns](https://mobbin.com/glossary/gallery)
- [Adobe Lightroom Classic documentation](https://helpx.adobe.com/lightroom-classic/help/view-photos.html)
- [NN/g List Thumbnails](https://www.nngroup.com/articles/mobile-list-thumbnail/)
