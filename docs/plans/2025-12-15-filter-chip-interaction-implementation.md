# Filter Chip Interaction Improvements - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add clickable filter chips that highlight their corresponding filter control, and add a "Clear All" button to SearchableSelect dropdowns.

**Architecture:** Two independent features: (1) Filter chips get click handlers that open the filter panel, expand collapsed sections, scroll to the control, and apply a pulse animation. (2) SearchableSelect gets a clear-all button in the trigger area.

**Tech Stack:** React, Tailwind CSS, Lucide React icons, Vitest for testing

---

## Task 1: Add CSS Animation for Filter Highlight

**Files:**
- Modify: `client/src/index.css`

**Step 1: Add the highlight pulse animation**

Add at the end of `client/src/index.css`:

```css
/* Filter control highlight animation - used when clicking filter chips */
@keyframes filter-highlight-pulse {
  0% {
    box-shadow: 0 0 0 3px var(--accent-primary);
  }
  100% {
    box-shadow: none;
  }
}

.filter-highlight {
  animation: filter-highlight-pulse 1.5s ease-out;
  border-radius: 0.375rem;
}
```

**Step 2: Verify the CSS is valid**

Run: `cd client && npm run build`
Expected: Build succeeds without CSS errors

**Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "feat: add filter highlight pulse animation"
```

---

## Task 2: Add Clear All Button to SearchableSelect

**Files:**
- Modify: `client/src/components/ui/SearchableSelect.jsx`
- Create: `client/src/components/ui/__tests__/SearchableSelect.test.jsx`

**Step 2.1: Write the failing test for clear all functionality**

Create `client/src/components/ui/__tests__/SearchableSelect.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SearchableSelect from "../SearchableSelect";

// Mock the API
vi.mock("../../../services/api.js", () => ({
  libraryApi: {
    findPerformers: vi.fn().mockResolvedValue({ findPerformers: { performers: [] } }),
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
  },
}));

// Mock the filter cache
vi.mock("../../../utils/filterCache.js", () => ({
  getCache: vi.fn().mockReturnValue(null),
  setCache: vi.fn(),
}));

describe("SearchableSelect", () => {
  it("is defined as a component", () => {
    expect(SearchableSelect).toBeDefined();
    expect(typeof SearchableSelect).toBe("function");
  });

  describe("Clear All button", () => {
    it("shows clear all button when there are selections in multi mode", async () => {
      const onChange = vi.fn();
      render(
        <SearchableSelect
          entityType="performers"
          value={["1", "2"]}
          onChange={onChange}
          multi={true}
          placeholder="Select performers"
        />
      );

      // Wait for component to load selected items
      // The clear all button should be visible
      const clearButton = await screen.findByLabelText("Clear all selections");
      expect(clearButton).toBeInTheDocument();
    });

    it("does not show clear all button when no selections", () => {
      const onChange = vi.fn();
      render(
        <SearchableSelect
          entityType="performers"
          value={[]}
          onChange={onChange}
          multi={true}
          placeholder="Select performers"
        />
      );

      const clearButton = screen.queryByLabelText("Clear all selections");
      expect(clearButton).not.toBeInTheDocument();
    });

    it("calls onChange with empty array when clear all is clicked in multi mode", async () => {
      const onChange = vi.fn();
      render(
        <SearchableSelect
          entityType="performers"
          value={["1", "2"]}
          onChange={onChange}
          multi={true}
          placeholder="Select performers"
        />
      );

      const clearButton = await screen.findByLabelText("Clear all selections");
      fireEvent.click(clearButton);

      expect(onChange).toHaveBeenCalledWith([]);
    });

    it("does not open dropdown when clear all is clicked", async () => {
      const onChange = vi.fn();
      render(
        <SearchableSelect
          entityType="performers"
          value={["1", "2"]}
          onChange={onChange}
          multi={true}
          placeholder="Select performers"
        />
      );

      const clearButton = await screen.findByLabelText("Clear all selections");
      fireEvent.click(clearButton);

      // Dropdown search input should not be visible
      const searchInput = screen.queryByPlaceholderText("Search performers...");
      expect(searchInput).not.toBeInTheDocument();
    });
  });
});
```

**Step 2.2: Run test to verify it fails**

Run: `cd client && npm run test:run -- src/components/ui/__tests__/SearchableSelect.test.jsx`
Expected: FAIL - "Clear all selections" button not found

**Step 2.3: Implement the clear all button in SearchableSelect**

In `client/src/components/ui/SearchableSelect.jsx`, make these changes:

1. Add the `handleClearAll` function after `handleRemove` (around line 272):

```javascript
const handleClearAll = (e) => {
  e.stopPropagation(); // Don't toggle dropdown
  onChange(multi ? [] : "");
};
```

2. Update the trigger area JSX (starting around line 281). Replace the existing return statement's outer div content with:

Find this section (lines ~281-336):
```jsx
return (
  <div ref={dropdownRef} className="relative w-full">
    {/* Selected items display / Trigger button */}
    <div
      onClick={() => setIsOpen(!isOpen)}
      className="w-full pl-3 pr-[2px] py-2 rounded-md cursor-pointer border text-sm flex items-center justify-between gap-2"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        color: "var(--text-primary)",
      }}
    >
      <div className="flex flex-wrap gap-1 flex-1">
        {selectedItems.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>{placeholder}</span>
        ) : multi ? (
          selectedItems.map((item) => (
            ...
          ))
        ) : (
          ...
        )}
      </div>
      <LucideChevronDown
        ...
      />
    </div>
```

Replace the closing section (after the `</div>` that wraps selected items, before `<LucideChevronDown>`) with:

```jsx
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {selectedItems.length > 0 && (
          <Button
            onClick={handleClearAll}
            variant="tertiary"
            className="hover:opacity-70 !p-1 !border-0"
            aria-label="Clear all selections"
            title="Clear all"
            icon={<LucideX size={16} style={{ color: "var(--text-muted)" }} />}
          />
        )}
        <LucideChevronDown
          size={14}
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            color: "var(--text-muted)",
          }}
        />
      </div>
```

**Step 2.4: Run test to verify it passes**

Run: `cd client && npm run test:run -- src/components/ui/__tests__/SearchableSelect.test.jsx`
Expected: PASS

**Step 2.5: Commit**

```bash
git add client/src/components/ui/SearchableSelect.jsx client/src/components/ui/__tests__/SearchableSelect.test.jsx
git commit -m "feat: add clear all button to SearchableSelect"
```

---

## Task 3: Add onChipClick Prop to ActiveFilterChips

**Files:**
- Modify: `client/src/components/ui/ActiveFilterChips.jsx`
- Create: `client/src/components/ui/__tests__/ActiveFilterChips.test.jsx`

**Step 3.1: Write failing test for chip click behavior**

Create `client/src/components/ui/__tests__/ActiveFilterChips.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActiveFilterChips from "../ActiveFilterChips";

const mockFilterOptions = [
  { key: "rating", label: "Rating", type: "range" },
  { key: "favorite", label: "Favorite", type: "checkbox" },
  { key: "performers", label: "Performers", type: "searchable-select" },
];

describe("ActiveFilterChips", () => {
  it("is defined as a component", () => {
    expect(ActiveFilterChips).toBeDefined();
    expect(typeof ActiveFilterChips).toBe("function");
  });

  describe("chip click behavior", () => {
    it("calls onChipClick with filter key when chip body is clicked", () => {
      const onRemoveFilter = vi.fn();
      const onChipClick = vi.fn();

      render(
        <ActiveFilterChips
          filters={{ favorite: true }}
          filterOptions={mockFilterOptions}
          onRemoveFilter={onRemoveFilter}
          onChipClick={onChipClick}
        />
      );

      // Click the chip body (the text part)
      const chipText = screen.getByText("Favorite");
      fireEvent.click(chipText);

      expect(onChipClick).toHaveBeenCalledWith("favorite");
      expect(onRemoveFilter).not.toHaveBeenCalled();
    });

    it("calls onRemoveFilter when X button is clicked, not onChipClick", () => {
      const onRemoveFilter = vi.fn();
      const onChipClick = vi.fn();

      render(
        <ActiveFilterChips
          filters={{ favorite: true }}
          filterOptions={mockFilterOptions}
          onRemoveFilter={onRemoveFilter}
          onChipClick={onChipClick}
        />
      );

      // Click the remove button
      const removeButton = screen.getByLabelText("Remove filter: Favorite");
      fireEvent.click(removeButton);

      expect(onRemoveFilter).toHaveBeenCalledWith("favorite");
      expect(onChipClick).not.toHaveBeenCalled();
    });

    it("does not call onChipClick for permanent filter chips", () => {
      const onRemoveFilter = vi.fn();
      const onChipClick = vi.fn();

      render(
        <ActiveFilterChips
          filters={{}}
          filterOptions={mockFilterOptions}
          onRemoveFilter={onRemoveFilter}
          onChipClick={onChipClick}
          permanentFilters={{ performers: ["1"] }}
          permanentFiltersMetadata={{ performers: [{ id: "1", name: "Test Performer" }] }}
        />
      );

      // Click the permanent chip
      const chipText = screen.getByText("Performer: Test Performer");
      fireEvent.click(chipText);

      expect(onChipClick).not.toHaveBeenCalled();
    });

    it("shows pointer cursor on clickable chips", () => {
      render(
        <ActiveFilterChips
          filters={{ favorite: true }}
          filterOptions={mockFilterOptions}
          onRemoveFilter={vi.fn()}
          onChipClick={vi.fn()}
        />
      );

      const chip = screen.getByText("Favorite").closest("div");
      expect(chip).toHaveClass("cursor-pointer");
    });
  });
});
```

**Step 3.2: Run test to verify it fails**

Run: `cd client && npm run test:run -- src/components/ui/__tests__/ActiveFilterChips.test.jsx`
Expected: FAIL - onChipClick not called / cursor-pointer class not found

**Step 3.3: Implement chip click handler in ActiveFilterChips**

In `client/src/components/ui/ActiveFilterChips.jsx`:

1. Add `onChipClick` to the props (around line 14):

```jsx
const ActiveFilterChips = ({
  filters,
  filterOptions,
  onRemoveFilter,
  onChipClick,
  permanentFilters = {},
  permanentFiltersMetadata = {},
}) => {
```

2. Update the JSDoc to include the new prop (around line 4):

```jsx
/**
 * Display active filters as removable chips/badges
 *
 * @param {Object} props
 * @param {Object} props.filters - Current filter values
 * @param {Array} props.filterOptions - Filter configuration from filterConfig.js
 * @param {Function} props.onRemoveFilter - Callback when a filter is removed
 * @param {Function} props.onChipClick - Callback when a chip body is clicked (receives filter key)
 * @param {Object} props.permanentFilters - Filters that can't be removed
 * @param {Object} props.permanentFiltersMetadata - Display names for permanent filters
 */
```

3. Update the chip rendering (around line 156-185). Replace the chip `<div>` with:

```jsx
{allChips.map((chip) => (
  <div
    key={chip.key}
    onClick={() => !chip.isPermanent && onChipClick?.(chip.key)}
    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${
      !chip.isPermanent ? "cursor-pointer hover:opacity-80" : ""
    }`}
    style={{
      backgroundColor: chip.isPermanent
        ? "var(--bg-tertiary)"
        : "var(--bg-secondary)",
      borderColor: chip.isPermanent
        ? "var(--border-color)"
        : "var(--accent-primary)",
      color: chip.isPermanent
        ? "var(--text-secondary)"
        : "var(--text-primary)",
      opacity: chip.isPermanent ? 0.7 : 1,
    }}
  >
    <span>{chip.label}</span>
    {!chip.isPermanent && (
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onRemoveFilter(chip.key);
        }}
        variant="tertiary"
        className="hover:opacity-70 !p-0 !border-0"
        aria-label={`Remove filter: ${chip.label}`}
        title={`Remove filter: ${chip.label}`}
        icon={<LucideX className="w-3.5 h-3.5" />}
      />
    )}
  </div>
))}
```

**Step 3.4: Run test to verify it passes**

Run: `cd client && npm run test:run -- src/components/ui/__tests__/ActiveFilterChips.test.jsx`
Expected: PASS

**Step 3.5: Commit**

```bash
git add client/src/components/ui/ActiveFilterChips.jsx client/src/components/ui/__tests__/ActiveFilterChips.test.jsx
git commit -m "feat: add onChipClick prop to ActiveFilterChips"
```

---

## Task 4: Add Highlight Support to FilterPanel

**Files:**
- Modify: `client/src/components/ui/FilterControls.jsx`

**Step 4.1: Update FilterPanel to accept highlight props**

In `client/src/components/ui/FilterControls.jsx`, update the `FilterPanel` component (around line 431):

1. Add new props to FilterPanel:

```jsx
export const FilterPanel = ({
  children,
  onClear,
  hasActiveFilters,
  isOpen,
  onToggle,
  onSubmit,
  highlightedFilterKey,
  filterRefs,
}) => {
```

2. Add useEffect for scroll and highlight behavior. Add this inside FilterPanel, before the `if (!isOpen)` check:

```jsx
// Scroll to highlighted filter when it changes
useEffect(() => {
  if (highlightedFilterKey && filterRefs?.current?.[highlightedFilterKey]) {
    const element = filterRefs.current[highlightedFilterKey];

    // Small delay to ensure panel is rendered
    setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }
}, [highlightedFilterKey, filterRefs]);
```

3. Add the useEffect import at the top of the file if not already present:

```jsx
import { useEffect } from "react";
```

**Step 4.2: Update FilterControl to accept ref and highlight class**

Update `FilterControl` component (around line 50) to forward a ref and apply highlight class:

1. Import `forwardRef` at the top:

```jsx
import { forwardRef, useEffect } from "react";
```

2. Wrap FilterControl with forwardRef and add highlight styling:

```jsx
export const FilterControl = forwardRef(({
  type = "select",
  label,
  value,
  onChange,
  options = [],
  placeholder = "",
  min,
  max,
  entityType,
  multi,
  modifierOptions,
  modifierValue,
  onModifierChange,
  supportsHierarchy = false,
  hierarchyLabel = "Include children",
  hierarchyValue,
  onHierarchyChange,
  isHighlighted = false,
}, ref) => {
  // ... existing code ...

  return (
    <div
      ref={ref}
      className={`flex flex-col ${isHighlighted ? "filter-highlight" : ""}`}
    >
      {/* ... rest of the component */}
    </div>
  );
});

FilterControl.displayName = "FilterControl";
```

**Step 4.3: Verify changes compile**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 4.4: Commit**

```bash
git add client/src/components/ui/FilterControls.jsx
git commit -m "feat: add highlight support to FilterPanel and FilterControl"
```

---

## Task 5: Wire Up Chip Click in SearchControls

**Files:**
- Modify: `client/src/components/ui/SearchControls.jsx`

**Step 5.1: Add state and refs for highlighting**

In `client/src/components/ui/SearchControls.jsx`:

1. Add `useRef` to the imports if not already there (line 1):

```jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

2. Add state for highlighted filter key (around line 99, after other useState calls):

```jsx
const [highlightedFilterKey, setHighlightedFilterKey] = useState(null);
const filterRefs = useRef({});
```

3. Add useEffect to clear highlight after animation (add after other useEffects, around line 400):

```jsx
// Clear highlight after animation completes
useEffect(() => {
  if (highlightedFilterKey) {
    const timer = setTimeout(() => {
      setHighlightedFilterKey(null);
    }, 1500);
    return () => clearTimeout(timer);
  }
}, [highlightedFilterKey]);
```

**Step 5.2: Add handler for chip clicks**

Add this handler after `handleRemoveFilter` (around line 486):

```jsx
// Handle clicking on a filter chip to highlight that filter
const handleFilterChipClick = useCallback(
  (filterKey) => {
    // Open filter panel if not already open
    setIsFilterPanelOpen(true);

    // Find which section this filter belongs to
    let sectionKey = null;
    for (let i = 0; i < filterOptions.length; i++) {
      if (filterOptions[i].type === "section-header") {
        sectionKey = filterOptions[i].key;
      } else if (filterOptions[i].key === filterKey) {
        break;
      }
    }

    // Expand the section if it's collapsed
    if (sectionKey && collapsedSections[sectionKey]) {
      setCollapsedSections((prev) => ({
        ...prev,
        [sectionKey]: false,
      }));
    }

    // Set the highlighted filter key (triggers scroll and animation)
    setHighlightedFilterKey(filterKey);
  },
  [filterOptions, collapsedSections]
);
```

**Step 5.3: Pass onChipClick to ActiveFilterChips**

Update the `ActiveFilterChips` component usage (around line 796):

```jsx
{/* Active Filter Chips */}
<ActiveFilterChips
  filters={filters}
  filterOptions={filterOptions}
  onRemoveFilter={handleRemoveFilter}
  onChipClick={handleFilterChipClick}
  permanentFilters={permanentFilters}
  permanentFiltersMetadata={permanentFiltersMetadata}
/>
```

**Step 5.4: Pass highlight props to FilterPanel**

Update the `FilterPanel` component usage (around line 831):

```jsx
{/* Filter Panel */}
<FilterPanel
  isOpen={isFilterPanelOpen}
  onToggle={handleToggleFilterPanel}
  onClear={clearFilters}
  onSubmit={handleFilterSubmit}
  hasActiveFilters={hasActiveFilters}
  highlightedFilterKey={highlightedFilterKey}
  filterRefs={filterRefs}
>
```

**Step 5.5: Pass ref and isHighlighted to each FilterControl**

Update the FilterControl rendering in the map (around line 923-945):

```jsx
return (
  <FilterControl
    key={`FilterControl-${key}`}
    ref={(el) => {
      if (el) filterRefs.current[key] = el;
    }}
    isHighlighted={highlightedFilterKey === key}
    onChange={(value) => handleFilterChange(key, value)}
    value={filters[key] || defaultValue}
    type={type}
    modifierOptions={modifierOptions}
    modifierValue={filters[modifierKey] || defaultModifier}
    onModifierChange={(value) =>
      modifierKey && handleFilterChange(modifierKey, value)
    }
    supportsHierarchy={supportsHierarchy}
    hierarchyLabel={hierarchyLabel}
    hierarchyValue={hierarchyKey ? filters[hierarchyKey] : undefined}
    onHierarchyChange={
      hierarchyKey
        ? (value) => handleFilterChange(hierarchyKey, value)
        : undefined
    }
    {...filterProps}
  />
);
```

**Step 5.6: Verify changes compile and app works**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 5.7: Commit**

```bash
git add client/src/components/ui/SearchControls.jsx
git commit -m "feat: wire up filter chip click to highlight filter controls"
```

---

## Task 6: Manual Testing and Final Verification

**Step 6.1: Run all tests**

Run: `cd client && npm run test:run`
Expected: All tests pass

**Step 6.2: Run linting**

Run: `cd client && npm run lint`
Expected: No errors

**Step 6.3: Build for production**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 6.4: Manual testing checklist**

Start the dev server and verify:

1. **SearchableSelect Clear All:**
   - [ ] Clear button appears when items are selected
   - [ ] Clear button disappears when no selections
   - [ ] Clicking clear removes all selections
   - [ ] Dropdown does not open when clear is clicked

2. **Filter Chip Click:**
   - [ ] Clicking a filter chip opens the filter panel
   - [ ] The corresponding filter control scrolls into view
   - [ ] A pulse animation highlights the control
   - [ ] Animation fades after ~1.5 seconds
   - [ ] Clicking the X still removes the filter (doesn't trigger chip click)
   - [ ] Permanent filter chips are not clickable

3. **Collapsed Sections:**
   - [ ] Clicking a chip for a filter in a collapsed section expands that section
   - [ ] Then scrolls to and highlights the filter

**Step 6.5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues from manual testing"
```
