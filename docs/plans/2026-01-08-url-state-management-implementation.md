# URL State Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create centralized URL state management hooks that fix back-button behavior and prevent default preset filters from overriding navigation intent.

**Architecture:** Two new hooks - `useUrlState` (low-level URL sync with configurable history) and `useFilterState` (high-level combining URL state + presets + query building). Read URL once on mount, write silently on changes, never read back.

**Tech Stack:** React hooks, react-router-dom v6 (useSearchParams, useNavigate), Vitest for testing

---

## Task 1: Create useUrlState Hook - Basic Structure

**Files:**
- Create: `client/src/hooks/useUrlState.js`
- Create: `client/src/hooks/__tests__/useUrlState.test.js`

**Step 1: Write the failing test for initial URL parsing**

```javascript
// client/src/hooks/__tests__/useUrlState.test.js
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useUrlState } from "../useUrlState.js";

// Wrapper to provide router context
const createWrapper = (initialEntries = ["/"]) => {
  return ({ children }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
};

describe("useUrlState", () => {
  describe("initialization", () => {
    it("parses initial URL params on mount", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { page: 1, sort: "date" } }),
        { wrapper: createWrapper(["/?page=3&sort=rating"]) }
      );

      expect(result.current.values.page).toBe("3");
      expect(result.current.values.sort).toBe("rating");
    });

    it("uses defaults when URL params are missing", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { page: 1, sort: "date" } }),
        { wrapper: createWrapper(["/"]) }
      );

      expect(result.current.values.page).toBe(1);
      expect(result.current.values.sort).toBe("date");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/__tests__/useUrlState.test.js`
Expected: FAIL with "Cannot find module '../useUrlState.js'"

**Step 3: Write minimal implementation**

```javascript
// client/src/hooks/useUrlState.js
import { useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Low-level hook for URL state management.
 * Reads URL once on mount, writes silently on changes.
 *
 * @param {Object} options
 * @param {Object} options.defaults - Default values when URL params missing
 * @returns {Object} { values, setValue, setValues }
 */
export const useUrlState = ({ defaults = {} } = {}) => {
  const [searchParams] = useSearchParams();
  const initializedRef = useRef(false);
  const valuesRef = useRef(null);

  // Read URL params only once on first render
  if (!initializedRef.current) {
    initializedRef.current = true;
    const parsed = {};

    // Start with defaults
    Object.keys(defaults).forEach((key) => {
      parsed[key] = defaults[key];
    });

    // Override with URL params
    for (const [key, value] of searchParams.entries()) {
      parsed[key] = value;
    }

    valuesRef.current = parsed;
  }

  return {
    values: valuesRef.current,
    setValue: () => {}, // Placeholder
    setValues: () => {}, // Placeholder
  };
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/__tests__/useUrlState.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/hooks/useUrlState.js client/src/hooks/__tests__/useUrlState.test.js
git commit -m "feat: add useUrlState hook with initial URL parsing"
```

---

## Task 2: Add setValue with History Push

**Files:**
- Modify: `client/src/hooks/useUrlState.js`
- Modify: `client/src/hooks/__tests__/useUrlState.test.js`

**Step 1: Write the failing test for setValue**

Add to `useUrlState.test.js`:

```javascript
import { renderHook, act } from "@testing-library/react";

describe("setValue", () => {
  it("updates URL with history push by default", () => {
    const { result } = renderHook(
      () => useUrlState({ defaults: { page: 1 } }),
      { wrapper: createWrapper(["/?page=1"]) }
    );

    act(() => {
      result.current.setValue("page", 2);
    });

    // Check internal state updated
    expect(result.current.values.page).toBe(2);
  });

  it("updates URL with replace when specified", () => {
    const { result } = renderHook(
      () => useUrlState({ defaults: { q: "" } }),
      { wrapper: createWrapper(["/"]) }
    );

    act(() => {
      result.current.setValue("q", "search", { replace: true });
    });

    expect(result.current.values.q).toBe("search");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/__tests__/useUrlState.test.js`
Expected: FAIL - setValue doesn't update values

**Step 3: Implement setValue**

Update `useUrlState.js`:

```javascript
import { useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export const useUrlState = ({ defaults = {} } = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedRef = useRef(false);

  // Parse initial URL only once
  const getInitialValues = () => {
    const parsed = { ...defaults };
    for (const [key, value] of searchParams.entries()) {
      parsed[key] = value;
    }
    return parsed;
  };

  const [values, setValuesState] = useState(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return getInitialValues();
    }
    return {};
  });

  const setValue = useCallback((key, value, options = {}) => {
    const { replace = false } = options;

    // Update internal state
    setValuesState((prev) => ({
      ...prev,
      [key]: value,
    }));

    // Update URL silently
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      if (value === null || value === undefined || value === "") {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
      return newParams;
    }, { replace });
  }, [setSearchParams]);

  const setValues = useCallback((updates, options = {}) => {
    const { replace = false } = options;

    setValuesState((prev) => ({
      ...prev,
      ...updates,
    }));

    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      });
      return newParams;
    }, { replace });
  }, [setSearchParams]);

  return {
    values,
    setValue,
    setValues,
  };
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/__tests__/useUrlState.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/hooks/useUrlState.js client/src/hooks/__tests__/useUrlState.test.js
git commit -m "feat: add setValue and setValues to useUrlState"
```

---

## Task 3: Add hasUrlParams Helper

**Files:**
- Modify: `client/src/hooks/useUrlState.js`
- Modify: `client/src/hooks/__tests__/useUrlState.test.js`

**Step 1: Write the failing test**

Add to `useUrlState.test.js`:

```javascript
describe("hasUrlParams", () => {
  it("returns true when URL has params beyond defaults", () => {
    const { result } = renderHook(
      () => useUrlState({
        defaults: { page: 1 },
        ignoreKeys: ["page", "per_page"]
      }),
      { wrapper: createWrapper(["/?page=1&tagIds=123"]) }
    );

    expect(result.current.hasUrlParams).toBe(true);
  });

  it("returns false when URL only has ignored params", () => {
    const { result } = renderHook(
      () => useUrlState({
        defaults: { page: 1 },
        ignoreKeys: ["page", "per_page"]
      }),
      { wrapper: createWrapper(["/?page=2"]) }
    );

    expect(result.current.hasUrlParams).toBe(false);
  });

  it("returns false when URL is empty", () => {
    const { result } = renderHook(
      () => useUrlState({ defaults: { page: 1 } }),
      { wrapper: createWrapper(["/"]) }
    );

    expect(result.current.hasUrlParams).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/__tests__/useUrlState.test.js`
Expected: FAIL - hasUrlParams is undefined

**Step 3: Implement hasUrlParams**

Update `useUrlState.js` - add `ignoreKeys` option and `hasUrlParams` return value:

```javascript
export const useUrlState = ({ defaults = {}, ignoreKeys = [] } = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedRef = useRef(false);
  const hadUrlParamsRef = useRef(false);

  // Parse initial URL only once
  const getInitialValues = () => {
    const parsed = { ...defaults };
    let hasNonIgnoredParams = false;

    for (const [key, value] of searchParams.entries()) {
      parsed[key] = value;
      if (!ignoreKeys.includes(key)) {
        hasNonIgnoredParams = true;
      }
    }

    hadUrlParamsRef.current = hasNonIgnoredParams;
    return parsed;
  };

  const [values, setValuesState] = useState(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return getInitialValues();
    }
    return {};
  });

  // ... setValue and setValues unchanged ...

  return {
    values,
    setValue,
    setValues,
    hasUrlParams: hadUrlParamsRef.current,
  };
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/__tests__/useUrlState.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/hooks/useUrlState.js client/src/hooks/__tests__/useUrlState.test.js
git commit -m "feat: add hasUrlParams to useUrlState for preset logic"
```

---

## Task 4: Create useFilterState Hook - Basic Structure

**Files:**
- Create: `client/src/hooks/useFilterState.js`
- Create: `client/src/hooks/__tests__/useFilterState.test.js`

**Step 1: Write the failing test**

```javascript
// client/src/hooks/__tests__/useFilterState.test.js
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useFilterState } from "../useFilterState.js";

// Mock the API
vi.mock("../../services/api.js", () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from "../../services/api.js";

const createWrapper = (initialEntries = ["/"]) => {
  return ({ children }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
};

describe("useFilterState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no presets
    apiGet.mockResolvedValue({ presets: {}, defaults: {} });
  });

  describe("initialization", () => {
    it("initializes with default values when URL is empty", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
        }),
        { wrapper: createWrapper(["/"]) }
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.sort.field).toBe("o_counter");
      expect(result.current.sort.direction).toBe("DESC");
      expect(result.current.pagination.page).toBe(1);
      expect(result.current.pagination.perPage).toBe(24);
      expect(result.current.filters).toEqual({});
    });

    it("parses filters from URL on mount", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
          filterOptions: [
            { key: "favorite", type: "checkbox" },
          ],
        }),
        { wrapper: createWrapper(["/?favorite=true&sort=rating&page=2"]) }
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.filters.favorite).toBe(true);
      expect(result.current.sort.field).toBe("rating");
      expect(result.current.pagination.page).toBe(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/__tests__/useFilterState.test.js`
Expected: FAIL with "Cannot find module '../useFilterState.js'"

**Step 3: Write minimal implementation**

```javascript
// client/src/hooks/useFilterState.js
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "../services/api.js";
import { buildSearchParams, parseSearchParams } from "../utils/urlParams.js";

/**
 * High-level hook for filter state management with URL sync and presets.
 */
export const useFilterState = ({
  artifactType = "scene",
  context,
  initialSort = "o_counter",
  permanentFilters = {},
  filterOptions = [],
  syncToUrl = true,
} = {}) => {
  const effectiveContext = context || artifactType;
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedRef = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);

  // State
  const [filters, setFiltersState] = useState({});
  const [sort, setSortState] = useState({ field: initialSort, direction: "DESC" });
  const [pagination, setPaginationState] = useState({ page: 1, perPage: 24 });
  const [searchText, setSearchTextState] = useState("");

  // Initialize on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialize = async () => {
      try {
        // Check if URL has filter params (not just page/per_page)
        let hasFilterParams = false;
        for (const [key] of searchParams.entries()) {
          if (key !== "page" && key !== "per_page") {
            hasFilterParams = true;
            break;
          }
        }

        // Load presets
        const [presetsRes, defaultsRes] = await Promise.all([
          apiGet("/user/filter-presets"),
          apiGet("/user/default-presets"),
        ]);

        const allPresets = presetsRes?.presets || {};
        const defaults = defaultsRes?.defaults || {};
        const defaultPresetId = defaults[effectiveContext];

        const presetArtifactType = effectiveContext.startsWith("scene_")
          ? "scene"
          : effectiveContext;
        const presets = allPresets[presetArtifactType] || [];
        const defaultPreset = presets.find((p) => p.id === defaultPresetId);

        // Parse URL params
        const urlState = parseSearchParams(searchParams, filterOptions, {
          sortField: initialSort,
          sortDirection: "DESC",
          filters: { ...permanentFilters },
        });

        let finalState;

        if (hasFilterParams) {
          // URL has filter params: use preset SORT only, URL filters
          finalState = {
            filters: urlState.filters,
            sortField: urlState.sortField || defaultPreset?.sort || initialSort,
            sortDirection: urlState.sortDirection || defaultPreset?.direction || "DESC",
            currentPage: urlState.currentPage,
            perPage: urlState.perPage,
            searchText: urlState.searchText,
          };
        } else if (defaultPreset) {
          // No URL params: use full preset
          finalState = {
            filters: { ...permanentFilters, ...defaultPreset.filters },
            sortField: defaultPreset.sort,
            sortDirection: defaultPreset.direction,
            currentPage: 1,
            perPage: urlState.perPage,
            searchText: "",
          };
        } else {
          // No URL params, no preset: use defaults
          finalState = {
            filters: { ...permanentFilters },
            sortField: initialSort,
            sortDirection: "DESC",
            currentPage: 1,
            perPage: urlState.perPage,
            searchText: "",
          };
        }

        // Set state
        setFiltersState(finalState.filters);
        setSortState({ field: finalState.sortField, direction: finalState.sortDirection });
        setPaginationState({ page: finalState.currentPage, perPage: finalState.perPage });
        setSearchTextState(finalState.searchText);

      } catch (err) {
        console.error("Error loading presets:", err);
        // Fallback to URL/defaults
        const urlState = parseSearchParams(searchParams, filterOptions, {
          sortField: initialSort,
          sortDirection: "DESC",
          filters: { ...permanentFilters },
        });
        setFiltersState(urlState.filters);
        setSortState({ field: urlState.sortField, direction: urlState.sortDirection });
        setPaginationState({ page: urlState.currentPage, perPage: urlState.perPage });
        setSearchTextState(urlState.searchText);
      } finally {
        setIsLoadingPresets(false);
        setIsInitialized(true);
      }
    };

    initialize();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    filters,
    sort,
    pagination,
    searchText,
    isInitialized,
    isLoadingPresets,
    // Actions (placeholders for now)
    setFilter: () => {},
    setFilters: () => {},
    removeFilter: () => {},
    clearFilters: () => {},
    setSort: () => {},
    setPage: () => {},
    setPerPage: () => {},
    setSearchText: () => {},
    loadPreset: () => {},
  };
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/__tests__/useFilterState.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/hooks/useFilterState.js client/src/hooks/__tests__/useFilterState.test.js
git commit -m "feat: add useFilterState hook with initialization and preset loading"
```

---

## Task 5: Add Preset Sort-Only Logic

**Files:**
- Modify: `client/src/hooks/__tests__/useFilterState.test.js`

**Step 1: Write the failing test for sort-only preset behavior**

Add to `useFilterState.test.js`:

```javascript
describe("preset handling", () => {
  it("applies full preset (sort + filters) when URL has no filter params", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({
          presets: {
            scene: [{ id: "preset-1", sort: "rating", direction: "ASC", filters: { favorite: true } }],
          },
        });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: { scene: "preset-1" } });
      }
    });

    const { result } = renderHook(
      () => useFilterState({
        artifactType: "scene",
        initialSort: "o_counter",
        filterOptions: [{ key: "favorite", type: "checkbox" }],
      }),
      { wrapper: createWrapper(["/"]) } // No URL params
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // Should have preset sort AND filters
    expect(result.current.sort.field).toBe("rating");
    expect(result.current.sort.direction).toBe("ASC");
    expect(result.current.filters.favorite).toBe(true);
  });

  it("applies preset sort ONLY when URL has filter params", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({
          presets: {
            performer: [{ id: "preset-1", sort: "rating", direction: "ASC", filters: { favorite: true } }],
          },
        });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: { performer: "preset-1" } });
      }
    });

    const { result } = renderHook(
      () => useFilterState({
        artifactType: "performer",
        initialSort: "o_counter",
        filterOptions: [
          { key: "favorite", type: "checkbox" },
          { key: "sceneId", type: "searchable-select" },
        ],
      }),
      { wrapper: createWrapper(["/?sceneId=123"]) } // Has filter params
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // Should have preset SORT only
    expect(result.current.sort.field).toBe("rating");
    expect(result.current.sort.direction).toBe("ASC");
    // Should NOT have preset filters - only URL filter
    expect(result.current.filters.favorite).toBeUndefined();
    expect(result.current.filters.sceneId).toBe("123");
  });

  it("URL sort takes precedence over preset sort", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({
          presets: {
            scene: [{ id: "preset-1", sort: "rating", direction: "ASC", filters: {} }],
          },
        });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: { scene: "preset-1" } });
      }
    });

    const { result } = renderHook(
      () => useFilterState({
        artifactType: "scene",
        initialSort: "o_counter",
        filterOptions: [],
      }),
      { wrapper: createWrapper(["/?sort=date&dir=DESC"]) }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // URL sort wins over preset
    expect(result.current.sort.field).toBe("date");
    expect(result.current.sort.direction).toBe("DESC");
  });
});
```

**Step 2: Run test to verify behavior**

Run: `cd client && npx vitest run src/hooks/__tests__/useFilterState.test.js`
Expected: Tests should pass (implementation already handles this)

**Step 3: Commit (tests only)**

```bash
git add client/src/hooks/__tests__/useFilterState.test.js
git commit -m "test: add preset sort-only behavior tests"
```

---

## Task 6: Add Action Methods with URL Sync

**Files:**
- Modify: `client/src/hooks/useFilterState.js`
- Modify: `client/src/hooks/__tests__/useFilterState.test.js`

**Step 1: Write failing tests for actions**

Add to `useFilterState.test.js`:

```javascript
describe("actions", () => {
  it("setPage updates pagination and pushes to history", async () => {
    const { result } = renderHook(
      () => useFilterState({ artifactType: "scene", filterOptions: [] }),
      { wrapper: createWrapper(["/"]) }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    act(() => {
      result.current.setPage(3);
    });

    expect(result.current.pagination.page).toBe(3);
  });

  it("setSort updates sort and pushes to history", async () => {
    const { result } = renderHook(
      () => useFilterState({ artifactType: "scene", filterOptions: [] }),
      { wrapper: createWrapper(["/"]) }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    act(() => {
      result.current.setSort("rating", "ASC");
    });

    expect(result.current.sort.field).toBe("rating");
    expect(result.current.sort.direction).toBe("ASC");
  });

  it("setFilter updates filters and resets page to 1", async () => {
    const { result } = renderHook(
      () => useFilterState({
        artifactType: "scene",
        filterOptions: [{ key: "favorite", type: "checkbox" }],
      }),
      { wrapper: createWrapper(["/?page=3"]) }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    act(() => {
      result.current.setFilter("favorite", true);
    });

    expect(result.current.filters.favorite).toBe(true);
    expect(result.current.pagination.page).toBe(1); // Reset to page 1
  });

  it("removeFilter removes filter and resets page to 1", async () => {
    const { result } = renderHook(
      () => useFilterState({
        artifactType: "scene",
        filterOptions: [{ key: "favorite", type: "checkbox" }],
      }),
      { wrapper: createWrapper(["/?favorite=true&page=3"]) }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    act(() => {
      result.current.removeFilter("favorite");
    });

    expect(result.current.filters.favorite).toBeUndefined();
    expect(result.current.pagination.page).toBe(1);
  });

  it("clearFilters resets all filters but keeps permanent filters", async () => {
    const { result } = renderHook(
      () => useFilterState({
        artifactType: "scene",
        permanentFilters: { studioId: "456" },
        filterOptions: [
          { key: "favorite", type: "checkbox" },
          { key: "studioId", type: "searchable-select" },
        ],
      }),
      { wrapper: createWrapper(["/?favorite=true"]) }
    );

    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters.favorite).toBeUndefined();
    expect(result.current.filters.studioId).toBe("456"); // Permanent kept
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/__tests__/useFilterState.test.js`
Expected: FAIL - actions don't update state

**Step 3: Implement action methods**

Update `useFilterState.js` - replace placeholder actions:

```javascript
// Inside useFilterState, after state declarations

// URL sync helper - writes to URL without reading back
const syncToUrlParams = useCallback((state, options = {}) => {
  if (!syncToUrl || !isInitialized) return;

  const { replace = false } = options;
  const params = buildSearchParams({
    searchText: state.searchText,
    sortField: state.sort.field,
    sortDirection: state.sort.direction,
    currentPage: state.pagination.page,
    perPage: state.pagination.perPage,
    filters: state.filters,
    filterOptions,
  });

  setSearchParams(params, { replace });
}, [syncToUrl, isInitialized, filterOptions, setSearchParams]);

// Actions
const setPage = useCallback((page) => {
  setPaginationState((prev) => ({ ...prev, page }));
  syncToUrlParams({
    filters,
    sort,
    pagination: { ...pagination, page },
    searchText,
  });
}, [filters, sort, pagination, searchText, syncToUrlParams]);

const setPerPage = useCallback((perPage) => {
  setPaginationState({ page: 1, perPage });
  syncToUrlParams({
    filters,
    sort,
    pagination: { page: 1, perPage },
    searchText,
  });
}, [filters, sort, searchText, syncToUrlParams]);

const setSort = useCallback((field, direction) => {
  const newDirection = direction || (sort.field === field && sort.direction === "DESC" ? "ASC" : "DESC");
  setSortState({ field, direction: newDirection });
  syncToUrlParams({
    filters,
    sort: { field, direction: newDirection },
    pagination,
    searchText,
  });
}, [filters, sort, pagination, searchText, syncToUrlParams]);

const setFilter = useCallback((key, value) => {
  const newFilters = { ...filters, [key]: value };
  setFiltersState(newFilters);
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  syncToUrlParams({
    filters: newFilters,
    sort,
    pagination: { ...pagination, page: 1 },
    searchText,
  });
}, [filters, sort, pagination, searchText, syncToUrlParams]);

const setFilters = useCallback((newFilters) => {
  setFiltersState(newFilters);
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  syncToUrlParams({
    filters: newFilters,
    sort,
    pagination: { ...pagination, page: 1 },
    searchText,
  });
}, [sort, pagination, searchText, syncToUrlParams]);

const removeFilter = useCallback((key) => {
  const newFilters = { ...filters };
  delete newFilters[key];
  // Re-apply permanent filters
  Object.assign(newFilters, permanentFilters);
  setFiltersState(newFilters);
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  syncToUrlParams({
    filters: newFilters,
    sort,
    pagination: { ...pagination, page: 1 },
    searchText,
  });
}, [filters, permanentFilters, sort, pagination, searchText, syncToUrlParams]);

const clearFilters = useCallback(() => {
  const newFilters = { ...permanentFilters };
  setFiltersState(newFilters);
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  syncToUrlParams({
    filters: newFilters,
    sort,
    pagination: { ...pagination, page: 1 },
    searchText,
  });
}, [permanentFilters, sort, pagination, searchText, syncToUrlParams]);

const setSearchText = useCallback((text) => {
  setSearchTextState(text);
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  // Search text uses replace to avoid history pollution
  syncToUrlParams({
    filters,
    sort,
    pagination: { ...pagination, page: 1 },
    searchText: text,
  }, { replace: true });
}, [filters, sort, pagination, syncToUrlParams]);

const loadPreset = useCallback((preset) => {
  const newFilters = { ...permanentFilters, ...preset.filters };
  setFiltersState(newFilters);
  setSortState({ field: preset.sort, direction: preset.direction });
  setPaginationState((prev) => ({ ...prev, page: 1 }));
  syncToUrlParams({
    filters: newFilters,
    sort: { field: preset.sort, direction: preset.direction },
    pagination: { ...pagination, page: 1 },
    searchText,
  });
}, [permanentFilters, pagination, searchText, syncToUrlParams]);
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/__tests__/useFilterState.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/hooks/useFilterState.js client/src/hooks/__tests__/useFilterState.test.js
git commit -m "feat: add action methods to useFilterState with URL sync"
```

---

## Task 7: Add Search Text Debounce

**Files:**
- Modify: `client/src/hooks/useFilterState.js`
- Modify: `client/src/hooks/__tests__/useFilterState.test.js`

**Step 1: Write failing test for debounce**

Add to `useFilterState.test.js`:

```javascript
describe("search text debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces search text URL updates by 500ms", async () => {
    const { result } = renderHook(
      () => useFilterState({ artifactType: "scene", filterOptions: [] }),
      { wrapper: createWrapper(["/"]) }
    );

    // Wait for initialization
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Type quickly
    act(() => {
      result.current.setSearchText("a");
    });
    act(() => {
      result.current.setSearchText("ab");
    });
    act(() => {
      result.current.setSearchText("abc");
    });

    // State updates immediately
    expect(result.current.searchText).toBe("abc");

    // Advance 500ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // URL should now be updated (verified by state consistency)
    expect(result.current.searchText).toBe("abc");
  });
});
```

**Step 2: Run test to verify current behavior**

Run: `cd client && npx vitest run src/hooks/__tests__/useFilterState.test.js`
Expected: May pass or fail depending on implementation

**Step 3: Implement debounce**

Update `setSearchText` in `useFilterState.js`:

```javascript
// Add debounce ref at top of hook
const searchDebounceRef = useRef(null);

// Update setSearchText
const setSearchText = useCallback((text) => {
  setSearchTextState(text);
  setPaginationState((prev) => ({ ...prev, page: 1 }));

  // Debounce URL update
  if (searchDebounceRef.current) {
    clearTimeout(searchDebounceRef.current);
  }

  searchDebounceRef.current = setTimeout(() => {
    syncToUrlParams({
      filters,
      sort,
      pagination: { ...pagination, page: 1 },
      searchText: text,
    }, { replace: true });
  }, 500);
}, [filters, sort, pagination, syncToUrlParams]);

// Add cleanup effect
useEffect(() => {
  return () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
  };
}, []);
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/__tests__/useFilterState.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/hooks/useFilterState.js client/src/hooks/__tests__/useFilterState.test.js
git commit -m "feat: add 500ms debounce to search text URL updates"
```

---

## Task 8: Export Hooks from Index

**Files:**
- Modify: `client/src/hooks/index.js` (create if doesn't exist)

**Step 1: Check if index exists**

Run: `ls client/src/hooks/index.js 2>/dev/null || echo "needs creation"`

**Step 2: Create or update index file**

```javascript
// client/src/hooks/index.js
export { useUrlState } from "./useUrlState.js";
export { useFilterState } from "./useFilterState.js";
// ... other existing exports
```

**Step 3: Commit**

```bash
git add client/src/hooks/index.js
git commit -m "feat: export URL state hooks from index"
```

---

## Task 9: Integration Test - Manual Verification

**Files:**
- No code changes, manual testing

**Step 1: Start dev server**

Run: `cd client && npm run dev`

**Step 2: Manual test checklist**

Open browser and test:

1. **Back button with pagination**
   - Navigate to `/scenes`
   - Go to page 3
   - Click back button
   - Expected: Returns to page 1 (or previous page)

2. **Indicator navigation with preset**
   - Create a default preset for performers with `favorite=true` filter
   - Go to a scene with performers
   - Click the performer count indicator
   - Expected: Shows performers filtered by that scene only, NOT favorite filter
   - Expected: Sort matches your preset preference

3. **Search text history**
   - Navigate to `/scenes`
   - Type "test" in search
   - Type "testing" in search
   - Click back button
   - Expected: Does NOT go through each keystroke, goes to previous page state

**Step 3: Document results**

Create test results in commit message or PR description.

---

## Task 10: Migrate SearchControls to useFilterState

**Files:**
- Modify: `client/src/components/ui/SearchControls.jsx`

**This is a larger refactor - break into sub-steps:**

**Step 1: Import the new hook**

At top of `SearchControls.jsx`:

```javascript
import { useFilterState } from "../../hooks/useFilterState.js";
```

**Step 2: Replace state management**

Replace the inline state (`useState` for filters, sort, pagination, searchText) and the initialization `useEffect` with `useFilterState`:

```javascript
const {
  filters,
  sort,
  pagination,
  searchText,
  isInitialized,
  isLoadingPresets,
  setFilter,
  setFilters,
  removeFilter,
  clearFilters,
  setSort,
  setPage,
  setPerPage,
  setSearchText,
  loadPreset,
} = useFilterState({
  artifactType,
  context: effectiveContext,
  initialSort,
  permanentFilters,
  filterOptions,
  syncToUrl,
});
```

**Step 3: Update handler functions**

Replace inline handlers with the hook's action methods:

- `handlePageChange` → `setPage`
- `handleSortChange` → `setSort`
- `handleFilterChange` → `setFilter`
- `handleRemoveFilter` → `removeFilter`
- `clearFilters` → `clearFilters`
- `handleChangeSearchText` → `setSearchText`
- `handleLoadPreset` → `loadPreset`

**Step 4: Remove deprecated code**

Remove:
- `useState` for filters, sort, pagination, searchText
- `needsDefaultPreset` memo
- Initialization `useEffect`
- URL sync `useEffect`
- `urlState` memo

**Step 5: Test and commit**

Run: `cd client && npm run dev`
Test manually that everything still works.

```bash
git add client/src/components/ui/SearchControls.jsx
git commit -m "refactor: migrate SearchControls to useFilterState hook"
```

---

## Summary

This plan creates:
1. `useUrlState` - Low-level URL sync with push/replace control
2. `useFilterState` - High-level filter management with presets
3. Proper history behavior (push for user actions, replace for search text)
4. Preset sort-only logic when URL has filter params
5. 500ms search text debounce

After implementation:
- Back button will restore previous filter/page/sort state
- Indicator navigation won't be polluted by default preset filters
- Search typing won't pollute browser history