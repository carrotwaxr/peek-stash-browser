# Filter Chip Interaction Improvements

## Overview

Two UX improvements to filter interactions:

1. **Clickable filter chips** - Clicking a filter chip opens the Filter Panel and highlights the corresponding filter control
2. **Clear All button in SearchableSelect** - Add a "Clear All" button to multi-select dropdowns

## Feature 1: Clickable Filter Chips

### Current Behavior
- Filter chips display active filters with an X button to remove
- Only the X button is interactive; the chip body does nothing

### New Behavior
- Clicking anywhere on a chip (except X) opens the Filter Panel
- The corresponding filter control scrolls into view
- A border-pulse animation highlights the control for 1.5 seconds
- If the filter is in a collapsed section, that section expands first

### Implementation

**ActiveFilterChips.jsx:**
- Add `onChipClick` prop that receives the filter key
- Make chip body clickable with `cursor-pointer`
- X button uses `stopPropagation` to prevent triggering chip click

**SearchControls.jsx:**
- Add state: `highlightedFilterKey` (string | null)
- Add handler `handleFilterChipClick(filterKey)`:
  1. Open filter panel
  2. Expand collapsed section if needed
  3. Set `highlightedFilterKey`
- Clear highlight after 1.5s via useEffect timeout
- Pass `highlightedFilterKey` to FilterPanel

**FilterControls.jsx (FilterPanel):**
- Accept `highlightedFilterKey` prop
- Store refs for each FilterControl by key
- When `highlightedFilterKey` changes:
  - Scroll the ref into view
  - Apply `filter-highlight` CSS class

**CSS Animation:**
```css
@keyframes filter-highlight-pulse {
  0% {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-primary);
  }
  100% {
    border-color: var(--border-color);
    box-shadow: none;
  }
}
.filter-highlight {
  animation: filter-highlight-pulse 1.5s ease-out;
}
```

## Feature 2: SearchableSelect Clear All Button

### Current Behavior
- Multi-select shows selected items as chips inside the trigger area
- Each chip has an X to remove that individual item
- No way to clear all selections at once without opening dropdown

### New Behavior
- A "Clear All" X button appears next to the chevron when there are selections
- Clicking it clears all selections without opening the dropdown
- Visually distinct from individual chip X buttons (slightly larger)

### Implementation

**SearchableSelect.jsx:**

New handler:
```javascript
const handleClearAll = (e) => {
  e.stopPropagation(); // Don't toggle dropdown
  onChange(multi ? [] : "");
};
```

Updated trigger layout:
- From: `[selected chips] [chevron]`
- To: `[selected chips] [clear-all X] [chevron]`

Clear button:
- Only visible when `selectedItems.length > 0`
- `LucideX` icon at size 16 (vs 14 for chip X buttons)
- Subtle gray color, darkens on hover
- `aria-label="Clear all selections"`

## Files to Modify

1. `client/src/components/ui/ActiveFilterChips.jsx` - Add click handler to chips
2. `client/src/components/ui/SearchControls.jsx` - Add highlight state and chip click handler
3. `client/src/components/ui/FilterControls.jsx` - Add highlight styling and scroll behavior
4. `client/src/components/ui/SearchableSelect.jsx` - Add Clear All button
5. `client/src/index.css` (or appropriate CSS file) - Add highlight animation
