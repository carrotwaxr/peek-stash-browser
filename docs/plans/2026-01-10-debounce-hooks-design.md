# Debounce Hooks Consolidation

## Problem

The codebase has 5 components with manual debounce logic using `setTimeout` + `useRef` patterns. This creates:
- Code duplication (~50 lines of boilerplate)
- Inconsistent patterns (3 different implementations)
- Risk of bugs from incorrect cleanup

## Solution

Create two reusable hooks in `client/src/hooks/useDebounce.js`:

### useDebouncedValue

Returns a debounced version of a value. Best for reactive patterns where you watch a value and respond to changes.

```js
const debouncedSearch = useDebouncedValue(searchTerm, 300);
useEffect(() => { loadOptions(debouncedSearch); }, [debouncedSearch]);
```

### useDebouncedCallback

Returns a debounced function. Best for imperative patterns where you need to transform data in an event handler.

```js
const debouncedSave = useDebouncedCallback((value) => saveRating(value), 300);
const handleChange = (e) => { setValue(e.target.value); debouncedSave(e.target.value); };
```

## Components to Update

| Component | Hook to Use | Current Delay |
|-----------|-------------|---------------|
| SearchableSelect.jsx | useDebouncedValue | 300ms |
| SearchInput.jsx | useDebouncedValue | 300ms (configurable) |
| RatingSlider.jsx | useDebouncedCallback | 300ms |
| RatingSliderDialog.jsx | useDebouncedCallback | 300ms |

## Not Changing

- `useFilterState.js` - 500ms debounce for URL syncing (different concern, not API calls)

## Implementation

1. Create `useDebounce.js` with both hooks
2. Refactor SearchableSelect to use useDebouncedValue
3. Refactor SearchInput to use useDebouncedValue
4. Refactor RatingSlider to use useDebouncedCallback
5. Refactor RatingSliderDialog to use useDebouncedCallback
6. Run linting and manual testing
