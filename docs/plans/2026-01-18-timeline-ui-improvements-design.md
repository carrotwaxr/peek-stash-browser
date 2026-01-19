# Timeline UI Improvements Design

## Summary

Improve the timeline component UX with:
1. Reorganized header bar (viewport range on left, zoom controls on right)
2. Wider bar spacing to reduce visual density
3. Edge navigation overlays with labeled scroll buttons
4. Fix selection → results connection so clicking bars filters content

## Design Details

### 1. Header Bar Redesign

**Current:** Zoom controls on left, selected period info on right.

**New layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Jan 1970 — Nov 1991                     [Years][Months][Weeks][Days] │
└─────────────────────────────────────────────────────────────────┘
```

- **Left:** Visible viewport range (updates live while scrolling)
- **Right:** Zoom level button group (moved from left)
- Single row, full width, accordion-collapsed styling
- Compute visible range by detecting which bars are in viewport using IntersectionObserver or scroll position + bar widths

### 2. Bar Spacing & Density

**Problem:** Too many bars visible at once (1970-2001 = 31 years of months on 1080p).

**Solution:** Increase minimum bar width based on zoom level:
- Years: 48px
- Months: 56px
- Weeks: 48px
- Days: 40px

This reduces months view from ~372 potential bars to ~19 visible at once on 1080p, requiring horizontal scroll to see more.

### 3. Edge Navigation Overlays

```
┌──────────────────────────────────────────────────────────────────┐
│  ← 1965-1969    │  [bars visible in viewport]  │    2002+ →     │
│  (faded overlay)│                              │  (faded overlay)│
└──────────────────────────────────────────────────────────────────┘
```

- **Left overlay:** Gradient fade (solid → transparent), button shows what's before
- **Right overlay:** Same, shows what's after
- **Click:** Scrolls by one viewport width in that direction
- **Edge behavior:** Overlay hidden when at start/end (no fade, no button)
- **Styling:** Semi-transparent theme background, history timeline aesthetic

### 4. Selection → Results Connection (Bug Fix)

**Problem:** `TimelineView` receives `items` from parent but the parent (`SceneSearch`) doesn't know when timeline selection changes.

**Solution:**
1. Add `onDateFilterChange` callback prop to `TimelineView`
2. When `selectedPeriod` changes, call `onDateFilterChange({ start, end })`
3. Parent incorporates date filter into its query

**Data flow:**
```
User clicks bar → selectPeriod() → selectedPeriod updates →
  → onDateFilterChange({ start: "2024-01-01", end: "2024-01-31" }) →
  → SceneSearch adds date filter to query → new results fetched
```

## Files to Modify

### TimelineStrip.jsx
- Increase `min-w-[28px]` to zoom-level-specific widths
- Add scroll position tracking for visible range
- Add edge detection for overlay visibility
- Export visible range via callback

### TimelineView.jsx
- Restructure header: range display left, controls right
- Add edge navigation overlay components
- Add `onDateFilterChange` prop
- Call `onDateFilterChange` when `selectedPeriod` changes

### SceneSearch.jsx (and Galleries.jsx, Images.jsx)
- Handle `onDateFilterChange` callback
- Merge timeline date filter with existing filters
- Re-fetch when date filter changes

### New: TimelineEdgeNav.jsx (optional)
- Encapsulate edge overlay logic
- Gradient background, arrow button, label
- Click handler for page scroll

## Implementation Notes

- Use `useRef` + scroll event listener for live viewport range updates
- Debounce is NOT needed per user preference (live updates)
- Edge labels should show contextual info (e.g., "← 1965-1969" or "← Earlier" if range is large)
- Match table view's scrollable indicator styling but with arrows and labels
