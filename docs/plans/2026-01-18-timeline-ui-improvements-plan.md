# Timeline UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve timeline UX with reorganized header, wider spacing, edge navigation, and working selection filtering.

**Architecture:** Modify existing timeline components, add new edge navigation component, wire up date filter callback to parent.

**Tech Stack:** React, CSS custom properties, date-fns

---

### Task 1: Fix Selection → Results Connection (Bug Fix)

This is the most critical fix - clicking bars should filter results.

**Files:**
- Modify: `client/src/components/timeline/TimelineView.jsx`
- Modify: `client/src/components/scene-search/SceneSearch.jsx`
- Modify: `client/src/components/pages/Galleries.jsx`
- Modify: `client/src/components/pages/Images.jsx`

**Step 1: Write failing test for onDateFilterChange callback**

In `client/tests/components/timeline/TimelineView.test.jsx`, add:

```javascript
describe("Date Filter Callback", () => {
  it("calls onDateFilterChange when period is selected", async () => {
    const onDateFilterChange = vi.fn();
    // ... render with onDateFilterChange prop
    // ... click a bar
    // ... expect onDateFilterChange to have been called with { start, end }
  });

  it("calls onDateFilterChange with null when selection is cleared", async () => {
    const onDateFilterChange = vi.fn();
    // ... render with selected period and onDateFilterChange
    // ... click same bar to deselect
    // ... expect onDateFilterChange to have been called with null
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run tests/components/timeline/TimelineView.test.jsx`
Expected: FAIL - onDateFilterChange prop doesn't exist

**Step 3: Add onDateFilterChange prop to TimelineView**

In `TimelineView.jsx`:
- Add `onDateFilterChange` prop
- Add `useEffect` that calls `onDateFilterChange` when `selectedPeriod` changes
- Pass `{ start: selectedPeriod.start, end: selectedPeriod.end }` or `null`

**Step 4: Run test to verify it passes**

**Step 5: Wire up SceneSearch to use onDateFilterChange**

In `SceneSearch.jsx`:
- Add state for timeline date filter
- Pass `onDateFilterChange` to TimelineView
- Merge timeline filter into query filters

**Step 6: Wire up Galleries.jsx and Images.jsx similarly**

**Step 7: Commit**

```bash
git add -A && git commit -m "feat(timeline): wire up selection to filter results"
```

---

### Task 2: Increase Bar Spacing

**Files:**
- Modify: `client/src/components/timeline/TimelineStrip.jsx`
- Modify: `client/tests/components/timeline/TimelineStrip.test.jsx`

**Step 1: Write test for zoom-level-specific bar widths**

```javascript
describe("Bar Spacing", () => {
  it("uses wider spacing for months zoom level", () => {
    const { container } = render(<TimelineStrip {...defaultProps} zoomLevel="months" />);
    const barContainer = container.querySelector('[class*="min-w-"]');
    // Check for larger min-width class
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Add BAR_WIDTHS constant and apply zoom-level-specific widths**

```javascript
const BAR_WIDTHS = {
  years: "min-w-[48px]",
  months: "min-w-[56px]",
  weeks: "min-w-[48px]",
  days: "min-w-[40px]",
};
```

Apply in the bar container div.

**Step 4: Run tests to verify pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(timeline): increase bar spacing based on zoom level"
```

---

### Task 3: Add Visible Range Tracking

**Files:**
- Modify: `client/src/components/timeline/TimelineStrip.jsx`

**Step 1: Write test for onVisibleRangeChange callback**

```javascript
it("reports visible range on scroll", () => {
  const onVisibleRangeChange = vi.fn();
  render(<TimelineStrip {...defaultProps} onVisibleRangeChange={onVisibleRangeChange} />);
  // Simulate scroll or initial render
  expect(onVisibleRangeChange).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement visible range tracking**

- Add `onVisibleRangeChange` prop
- Use scroll event listener on container
- Calculate first/last visible bar indices based on scrollLeft and bar width
- Call `onVisibleRangeChange({ firstPeriod, lastPeriod })` on scroll and mount

**Step 4: Run tests to verify pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(timeline): track visible range for header display"
```

---

### Task 4: Reorganize Header Bar

**Files:**
- Modify: `client/src/components/timeline/TimelineView.jsx`

**Step 1: Write test for new header layout**

```javascript
it("displays visible range on left and controls on right", () => {
  render(<TimelineView entityType="scene" ... />);
  const header = screen.getByRole("banner") || container.querySelector('[class*="header"]');
  // Check that range text appears before controls in DOM order
});
```

**Step 2: Run test to verify it fails**

**Step 3: Restructure header in TimelineView**

- Add state for `visibleRange`
- Pass `onVisibleRangeChange` to TimelineStrip
- Render: `[VisibleRange] -----spacer----- [ZoomControls]`
- Format visible range as "Jan 1970 — Nov 1991"

**Step 4: Run tests to verify pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(timeline): reorganize header with range on left, controls on right"
```

---

### Task 5: Add Edge Navigation Overlays

**Files:**
- Create: `client/src/components/timeline/TimelineEdgeNav.jsx`
- Modify: `client/src/components/timeline/TimelineStrip.jsx`
- Create: `client/tests/components/timeline/TimelineEdgeNav.test.jsx`

**Step 1: Write tests for TimelineEdgeNav component**

```javascript
describe("TimelineEdgeNav", () => {
  it("renders left arrow with label when not at start", () => {});
  it("renders right arrow with label when not at end", () => {});
  it("hides left overlay when at start", () => {});
  it("hides right overlay when at end", () => {});
  it("calls onScrollLeft when left button clicked", () => {});
  it("calls onScrollRight when right button clicked", () => {});
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement TimelineEdgeNav component**

- Props: `atStart`, `atEnd`, `leftLabel`, `rightLabel`, `onScrollLeft`, `onScrollRight`
- Render gradient overlays with buttons
- Use CSS gradient: `linear-gradient(to right, var(--bg-primary), transparent)`
- Style similar to table scroll indicators but with arrows and labels

**Step 4: Integrate into TimelineStrip**

- Track scroll position to determine atStart/atEnd
- Calculate labels from distribution data
- Wire up scroll handlers to scroll by viewport width

**Step 5: Run tests to verify pass**

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(timeline): add edge navigation overlays"
```

---

### Task 6: Update TimelineStrip Tests

**Files:**
- Modify: `client/tests/components/timeline/TimelineStrip.test.jsx`

**Step 1: Review and update any broken tests**

After all changes, ensure:
- All existing tests still pass or are updated
- New functionality is covered

**Step 2: Run full test suite**

```bash
cd /home/carrot/code/peek-stash-browser/client && npm test -- --run tests/components/timeline/
```

**Step 3: Fix any failures**

**Step 4: Commit**

```bash
git add -A && git commit -m "test(timeline): update tests for UI improvements"
```

---

### Task 7: Final Integration Testing

**Step 1: Run all timeline tests**

```bash
npm test -- --run tests/components/timeline/
```

**Step 2: Manual verification**

- Open browser to timeline view
- Verify bars are properly spaced
- Verify header shows range on left, controls on right
- Verify edge overlays appear/hide correctly
- Verify clicking a bar filters the results
- Verify scrolling updates the range display

**Step 3: Fix any issues found**

**Step 4: Final commit if needed**
