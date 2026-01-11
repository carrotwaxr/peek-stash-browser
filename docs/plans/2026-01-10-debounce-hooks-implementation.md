# Debounce Hooks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create reusable `useDebouncedValue` and `useDebouncedCallback` hooks and refactor 4 components to use them, eliminating ~50 lines of duplicated debounce logic.

**Architecture:** Two hooks in a single file - `useDebouncedValue` for reactive value watching, `useDebouncedCallback` for imperative event handler debouncing. Each component refactored to use the appropriate hook based on its pattern.

**Tech Stack:** React hooks (useState, useEffect, useRef, useCallback)

---

### Task 1: Create useDebounce.js Hook File

**Files:**
- Create: `client/src/hooks/useDebounce.js`

**Step 1: Create the hook file with both exports**

```js
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Returns a debounced version of a value.
 * The returned value only updates after the specified delay
 * has passed without the input value changing.
 *
 * @param {any} value - The value to debounce
 * @param {number} delay - Debounce delay in milliseconds (default: 300)
 * @returns {any} The debounced value
 *
 * @example
 * const debouncedSearch = useDebouncedValue(searchTerm, 300);
 * useEffect(() => { loadOptions(debouncedSearch); }, [debouncedSearch]);
 */
export const useDebouncedValue = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Returns a debounced version of a callback function.
 * The callback only executes after the specified delay has passed
 * without the function being called again.
 *
 * @param {Function} callback - The function to debounce
 * @param {number} delay - Debounce delay in milliseconds (default: 300)
 * @returns {Function} The debounced function
 *
 * @example
 * const debouncedSave = useDebouncedCallback((value) => saveRating(value), 300);
 * const handleChange = (e) => { setValue(e.target.value); debouncedSave(e.target.value); };
 */
export const useDebouncedCallback = (callback, delay = 300) => {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // Keep callback ref fresh to avoid stale closures
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay]
  );
};
```

**Step 2: Verify file was created correctly**

Run: `head -20 client/src/hooks/useDebounce.js`

**Step 3: Commit**

```bash
git add client/src/hooks/useDebounce.js
git commit -m "feat: add useDebouncedValue and useDebouncedCallback hooks"
```

---

### Task 2: Refactor SearchableSelect.jsx

**Files:**
- Modify: `client/src/components/ui/SearchableSelect.jsx`

**Step 1: Update imports**

Change line 1 from:
```js
import { useCallback, useEffect, useRef, useState } from "react";
```

To:
```js
import { useCallback, useEffect, useState } from "react";
```

Add after line 4:
```js
import { useDebouncedValue } from "../../hooks/useDebounce.js";
```

**Step 2: Remove debounceTimerRef declaration**

Delete line 44:
```js
const debounceTimerRef = useRef(null);
```

**Step 3: Add debouncedSearchTerm hook**

After `const searchInputRef = useRef(null);` (around line 43), add:
```js
const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
```

**Step 4: Replace the debounced search useEffect**

Replace lines 221-239 (the debounce useEffect):
```js
  // Debounced search
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      loadOptions(searchTerm);
    }, 300);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm, loadOptions]);
```

With:
```js
  // Debounced search - triggers loadOptions after 300ms of no typing
  useEffect(() => {
    loadOptions(debouncedSearchTerm);
  }, [debouncedSearchTerm, loadOptions]);
```

**Step 5: Run linting**

Run: `cd client && npm run lint -- --no-warn 2>&1 | grep -E "(error|SearchableSelect)"`
Expected: No errors for SearchableSelect.jsx

**Step 6: Commit**

```bash
git add client/src/components/ui/SearchableSelect.jsx
git commit -m "refactor: use useDebouncedValue in SearchableSelect"
```

---

### Task 3: Refactor SearchInput.jsx

**Files:**
- Modify: `client/src/components/ui/SearchInput.jsx`

**Step 1: Update imports**

Change lines 1-5 from:
```js
/**
 * Reusable search input component with debouncing
 */
import { useEffect, useState } from "react";
import Button from "./Button.jsx";
```

To:
```js
/**
 * Reusable search input component with debouncing
 */
import { useEffect, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebounce.js";
import Button from "./Button.jsx";
```

**Step 2: Add debouncedQuery hook**

After line 16 (`const [query, setQuery] = useState(value || "");`), add:
```js
const debouncedQuery = useDebouncedValue(query, debounceMs);
```

**Step 3: Replace the debounce useEffect**

Replace lines 26-40:
```js
  useEffect(() => {
    if (!query.trim()) {
      onSearch?.("");
      return;
    }

    const timeoutId = setTimeout(() => {
      onSearch?.(query);
      if (clearOnSearch) {
        setQuery("");
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [query, onSearch, debounceMs, clearOnSearch]);
```

With:
```js
  useEffect(() => {
    onSearch?.(debouncedQuery);
    if (clearOnSearch && debouncedQuery) {
      setQuery("");
    }
  }, [debouncedQuery, onSearch, clearOnSearch]);
```

**Step 4: Run linting**

Run: `cd client && npm run lint -- --no-warn 2>&1 | grep -E "(error|SearchInput)"`
Expected: No errors for SearchInput.jsx

**Step 5: Commit**

```bash
git add client/src/components/ui/SearchInput.jsx
git commit -m "refactor: use useDebouncedValue in SearchInput"
```

---

### Task 4: Refactor RatingSlider.jsx

**Files:**
- Modify: `client/src/components/ui/RatingSlider.jsx`

**Step 1: Update imports**

Change line 1 from:
```js
import { useEffect, useRef, useState } from "react";
```

To:
```js
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "../../hooks/useDebounce.js";
```

**Step 2: Remove debounceTimerRef and cleanup effect**

Delete line 18:
```js
const debounceTimerRef = useRef(null);
```

Delete lines 24-31 (the cleanup useEffect):
```js
  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
```

**Step 3: Add debouncedOnChange hook**

After the `useEffect` that syncs `value` from `rating` prop (around line 20-22), add:
```js
  const debouncedOnChange = useDebouncedCallback((newValue) => {
    const ratingValue = Math.round(newValue * 10);
    onChange(ratingValue === 0 ? null : ratingValue);
  }, 300);
```

**Step 4: Simplify handleChange**

Replace the handleChange function (lines 48-62):
```js
  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value);
    setValue(newValue);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer to call onChange after 300ms of no changes
    debounceTimerRef.current = setTimeout(() => {
      const ratingValue = Math.round(newValue * 10); // Convert back to 0-100
      // If user drags to 0, treat as clearing the rating
      onChange(ratingValue === 0 ? null : ratingValue);
    }, 300);
  };
```

With:
```js
  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value);
    setValue(newValue);
    debouncedOnChange(newValue);
  };
```

**Step 5: Run linting**

Run: `cd client && npm run lint -- --no-warn 2>&1 | grep -E "(error|RatingSlider)"`
Expected: No errors for RatingSlider.jsx

**Step 6: Commit**

```bash
git add client/src/components/ui/RatingSlider.jsx
git commit -m "refactor: use useDebouncedCallback in RatingSlider"
```

---

### Task 5: Refactor RatingSliderDialog.jsx

**Files:**
- Modify: `client/src/components/ui/RatingSliderDialog.jsx`

**Step 1: Update imports**

Change line 1 from:
```js
import { useEffect, useRef, useState } from "react";
```

To:
```js
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "../../hooks/useDebounce.js";
```

Note: We keep `useRef` because this component uses `popoverRef` for click-outside detection.

**Step 2: Remove debounceTimerRef declaration**

Delete line 31:
```js
const debounceTimerRef = useRef(null);
```

**Step 3: Remove cleanup effect**

Delete lines 117-124:
```js
  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
```

**Step 4: Add debouncedOnSave hook**

After the position calculation useEffect (around line 83), add:
```js
  const debouncedOnSave = useDebouncedCallback((newValue) => {
    const ratingValue = Math.round(newValue * 10);
    onSave(ratingValue === 0 ? null : ratingValue);
  }, 300);
```

**Step 5: Simplify handleChange**

Replace the handleChange function (lines 143-157):
```js
  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value);
    setValue(newValue);

    // Debounced auto-save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const ratingValue = Math.round(newValue * 10); // Convert back to 0-100
      // If user drags to 0, treat as clearing the rating
      onSave(ratingValue === 0 ? null : ratingValue);
    }, 300);
  };
```

With:
```js
  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value);
    setValue(newValue);
    debouncedOnSave(newValue);
  };
```

**Step 6: Run linting**

Run: `cd client && npm run lint -- --no-warn 2>&1 | grep -E "(error|RatingSliderDialog)"`
Expected: No errors for RatingSliderDialog.jsx

**Step 7: Commit**

```bash
git add client/src/components/ui/RatingSliderDialog.jsx
git commit -m "refactor: use useDebouncedCallback in RatingSliderDialog"
```

---

### Task 6: Final Verification

**Step 1: Run full linting**

Run: `cd client && npm run lint`
Expected: Only pre-existing warnings (6 warnings about missing deps in unrelated files)

**Step 2: Verify no regressions in debounce patterns**

Run: `grep -r "debounceTimerRef" client/src/components/ui/`
Expected: No matches (all manual debounce refs removed from refactored files)

**Step 3: Verify hook is used in all refactored files**

Run: `grep -l "useDebounce" client/src/components/ui/*.jsx`
Expected output:
```
client/src/components/ui/RatingSlider.jsx
client/src/components/ui/RatingSliderDialog.jsx
client/src/components/ui/SearchableSelect.jsx
client/src/components/ui/SearchInput.jsx
```

**Step 4: Final commit (if any uncommitted changes)**

```bash
git status
# If clean, proceed. If not, commit remaining changes.
```

---

## Testing Checklist (Manual)

After implementation, manually verify:

1. **SearchableSelect**: Type in a performer/tag/studio search - results should appear after ~300ms pause, not on every keystroke
2. **SearchInput**: Same behavior for the general search input
3. **RatingSlider**: Drag the slider on a detail page - rating should save after ~300ms pause
4. **RatingSliderDialog**: Same behavior when rating from a card popup

---

## Summary

| Task | Component | Hook Used | Lines Removed | Lines Added |
|------|-----------|-----------|---------------|-------------|
| 1 | useDebounce.js | - | 0 | 58 |
| 2 | SearchableSelect | useDebouncedValue | 19 | 4 |
| 3 | SearchInput | useDebouncedValue | 14 | 5 |
| 4 | RatingSlider | useDebouncedCallback | 20 | 6 |
| 5 | RatingSliderDialog | useDebouncedCallback | 17 | 6 |

**Net change:** +58 (new hook) - 70 (removed boilerplate) + 21 (new usage) = +9 lines with significantly improved maintainability
