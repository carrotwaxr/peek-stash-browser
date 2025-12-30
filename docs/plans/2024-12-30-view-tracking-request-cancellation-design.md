# View Tracking & Request Cancellation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix duplicate image view tracking in React Strict Mode and add request cancellation for search pages.

**Architecture:** Two independent fixes: (1) Replace immediate view tracking with 3-second dwell timer in Lightbox; (2) Create `useCancellableQuery` hook with AbortController support, update API layer to pass signals, refactor 7 search pages to use the hook.

**Tech Stack:** React hooks, AbortController, fetch API

---

## Task 1: Fix Dwell-Time View Tracking in Lightbox

**Files:**
- Modify: `client/src/components/ui/Lightbox.jsx:21` (add ref)
- Modify: `client/src/components/ui/Lightbox.jsx:209-218` (replace effect)

**Step 1: Add viewTimerRef**

After line 21 (`const intervalRef = useRef(null);`), add:

```javascript
const viewTimerRef = useRef(null);
```

**Step 2: Replace the view tracking useEffect**

Find this effect (around lines 209-218):

```javascript
// Track image view when image changes in lightbox
useEffect(() => {
  const currentImage = images[currentIndex];
  if (!currentImage?.id || !isOpen) return;

  // Record the view (fire and forget - don't block UI)
  imageViewHistoryApi.recordView(currentImage.id).catch((err) => {
    console.error("Failed to record image view:", err);
  });
}, [currentIndex, images, isOpen]);
```

Replace with:

```javascript
// Track image view with 3-second dwell time
// Only records if user views image for 3+ seconds (filters rapid navigation)
useEffect(() => {
  const currentImage = images[currentIndex];

  // Clear any existing timer
  if (viewTimerRef.current) {
    clearTimeout(viewTimerRef.current);
    viewTimerRef.current = null;
  }

  if (!currentImage?.id || !isOpen) return;

  // Start 3-second dwell timer
  viewTimerRef.current = setTimeout(() => {
    imageViewHistoryApi.recordView(currentImage.id).catch((err) => {
      console.error("Failed to record image view:", err);
    });
    viewTimerRef.current = null;
  }, 3000);

  // Cleanup on navigation/close
  return () => {
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }
  };
}, [currentIndex, images, isOpen]);
```

**Step 3: Test manually**

- Open lightbox, navigate quickly through images → Network tab should show no view API calls
- Open lightbox, stay on image for 4 seconds → Network tab should show exactly 1 view call
- In dev mode (Strict Mode), verify no duplicate calls

**Step 4: Commit**

```bash
git add client/src/components/ui/Lightbox.jsx
git commit -m "fix: use 3-second dwell time for image view tracking"
```

---

## Task 2: Create useCancellableQuery Hook

**Files:**
- Create: `client/src/hooks/useCancellableQuery.js`

**Step 1: Create the hook file**

Create `client/src/hooks/useCancellableQuery.js`:

```javascript
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth.js";

/**
 * Hook for making cancellable API queries with automatic state management.
 * Aborts previous in-flight requests when a new query is executed.
 *
 * @param {Object} options
 * @param {boolean} options.initialLoading - Initial loading state (default: true)
 * @returns {Object} { data, isLoading, error, execute, setData, initMessage }
 */
export function useCancellableQuery({ initialLoading = true } = {}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState(null);
  const [initMessage, setInitMessage] = useState(null);
  const abortControllerRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  /**
   * Execute a query function with automatic cancellation of previous requests.
   * @param {Function} queryFn - Async function that receives AbortSignal and returns data
   * @param {Object} options
   * @param {number} options.retryCount - Current retry count for initializing state (internal use)
   */
  const execute = useCallback(
    async (queryFn, { retryCount = 0 } = {}) => {
      // Don't make API calls if not authenticated or still checking auth
      if (isAuthLoading || !isAuthenticated) {
        setIsLoading(false);
        return;
      }

      // Clear any pending retry
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setIsLoading(true);
        setError(null);
        setInitMessage(null);

        const result = await queryFn(controller.signal);

        // Only update state if not aborted
        if (!controller.signal.aborted) {
          setData(result);
          setIsLoading(false);
        }
      } catch (err) {
        // Swallow AbortError - request was intentionally cancelled
        if (err.name === "AbortError") {
          return;
        }

        // Only update state if not aborted
        if (!controller.signal.aborted) {
          // Handle server initializing state with retry
          if (err.isInitializing && retryCount < 60) {
            setInitMessage("Server is syncing library, please wait...");
            retryTimeoutRef.current = setTimeout(() => {
              execute(queryFn, { retryCount: retryCount + 1 });
            }, 5000);
            return;
          }

          setError(err);
          setIsLoading(false);
        }
      }
    },
    [isAuthLoading, isAuthenticated]
  );

  /**
   * Reset the query state
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setData(null);
    setIsLoading(false);
    setError(null);
    setInitMessage(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    initMessage,
    execute,
    setData,
    reset,
  };
}
```

**Step 2: Commit**

```bash
git add client/src/hooks/useCancellableQuery.js
git commit -m "feat: add useCancellableQuery hook with AbortController support"
```

---

## Task 3: Add Signal Support to API Layer

**Files:**
- Modify: `client/src/services/api.js:11-51` (apiFetch function)
- Modify: `client/src/services/api.js:101-103` (findScenes)
- Modify: `client/src/services/api.js:111-113` (findPerformers)
- Modify: `client/src/services/api.js:121-123` (findStudios)
- Modify: `client/src/services/api.js:131-133` (findTags)
- Modify: `client/src/services/api.js:214-216` (findGalleries)
- Modify: `client/src/services/api.js:242-244` (findGroups)
- Modify: `client/src/services/api.js:284-286` (findImages)

**Step 1: Update apiFetch to handle AbortError**

Find the `apiFetch` function. After line 22 (`const response = await fetch(url, config);`), wrap the response handling to catch AbortError early. Update the entire function:

```javascript
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    // Re-throw AbortError so it can be caught by useCancellableQuery
    if (err.name === "AbortError") {
      throw err;
    }
    throw err;
  }

  if (!response.ok) {
    // Try to parse error response body
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: `HTTP error! status: ${response.status}` };
    }

    // Create error with additional metadata
    const error = new Error(
      errorData.error ||
        errorData.message ||
        `HTTP error! status: ${response.status}`
    );
    error.status = response.status;
    error.data = errorData;

    // Special handling for 503 - server initializing
    if (response.status === 503 && errorData.ready === false) {
      error.isInitializing = true;
    }

    throw error;
  }

  return await response.json();
}
```

**Step 2: Update libraryApi methods to accept signal**

Update each find method to accept and pass the signal. Replace each method:

`findScenes`:
```javascript
findScenes: (params = {}, signal) => {
  return apiFetch("/library/scenes", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
},
```

`findPerformers`:
```javascript
findPerformers: (params = {}, signal) => {
  return apiFetch("/library/performers", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
},
```

`findStudios`:
```javascript
findStudios: (params = {}, signal) => {
  return apiFetch("/library/studios", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
},
```

`findTags`:
```javascript
findTags: (params = {}, signal) => {
  return apiFetch("/library/tags", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
},
```

`findGalleries`:
```javascript
findGalleries: (params = {}, signal) => {
  return apiFetch("/library/galleries", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
},
```

`findGroups`:
```javascript
findGroups: (params = {}, signal) => {
  return apiFetch("/library/groups", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
},
```

`findImages`:
```javascript
findImages: (params = {}, signal) => {
  return apiFetch("/library/images", {
    method: "POST",
    body: JSON.stringify(params),
    signal,
  });
},
```

**Step 3: Commit**

```bash
git add client/src/services/api.js
git commit -m "feat: add AbortController signal support to library API methods"
```

---

## Task 4: Refactor Images.jsx to Use useCancellableQuery

**Files:**
- Modify: `client/src/components/pages/Images.jsx`

**Step 1: Update imports**

Replace:
```javascript
import { useRef, useState } from "react";
```

With:
```javascript
import { useCallback, useRef } from "react";
```

Add import for the hook:
```javascript
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
```

**Step 2: Replace state declarations**

Remove these lines:
```javascript
const [lastQuery, setLastQuery] = useState(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const [data, setData] = useState(null);
const [initMessage, setInitMessage] = useState(null);
```

Replace with:
```javascript
const { data, isLoading, error, initMessage, execute, setData } = useCancellableQuery();
```

**Step 3: Replace handleQueryChange**

Remove the entire `handleQueryChange` function and replace with:

```javascript
const handleQueryChange = useCallback(
  (newQuery) => {
    execute((signal) => getImages(newQuery, signal));
  },
  [execute]
);
```

**Step 4: Update getImages to accept signal**

Change:
```javascript
const getImages = async (query) => {
  const response = await libraryApi.findImages(query);
```

To:
```javascript
const getImages = async (query, signal) => {
  const response = await libraryApi.findImages(query, signal);
```

**Step 5: Verify the error conditional still works**

The existing code `if (error && !initMessage)` should still work since `initMessage` comes from the hook.

**Step 6: Test manually**

- Go to Images page, rapidly change filters → should see cancelled requests in Network tab
- Ensure images load correctly

**Step 7: Commit**

```bash
git add client/src/components/pages/Images.jsx
git commit -m "refactor: use useCancellableQuery in Images page"
```

---

## Task 5: Refactor Performers.jsx to Use useCancellableQuery

**Files:**
- Modify: `client/src/components/pages/Performers.jsx`

**Step 1: Update imports**

Replace:
```javascript
import { useRef, useState } from "react";
```

With:
```javascript
import { useCallback, useRef } from "react";
```

Add import:
```javascript
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
```

**Step 2: Replace state declarations**

Remove:
```javascript
const [lastQuery, setLastQuery] = useState(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const [data, setData] = useState(null);
const [initMessage, setInitMessage] = useState(null);
```

Replace with:
```javascript
const { data, isLoading, error, initMessage, execute } = useCancellableQuery();
```

**Step 3: Replace handleQueryChange**

Remove the entire function and replace with:

```javascript
const handleQueryChange = useCallback(
  (newQuery) => {
    execute((signal) => getPerformers(newQuery, signal));
  },
  [execute]
);
```

**Step 4: Update getPerformers to accept signal**

Change:
```javascript
const getPerformers = async (query) => {
  const response = await libraryApi.findPerformers(query);
```

To:
```javascript
const getPerformers = async (query, signal) => {
  const response = await libraryApi.findPerformers(query, signal);
```

**Step 5: Commit**

```bash
git add client/src/components/pages/Performers.jsx
git commit -m "refactor: use useCancellableQuery in Performers page"
```

---

## Task 6: Refactor Studios.jsx to Use useCancellableQuery

**Files:**
- Modify: `client/src/components/pages/Studios.jsx`

**Step 1: Update imports**

Replace:
```javascript
import { useRef, useState } from "react";
```

With:
```javascript
import { useCallback, useRef } from "react";
```

Add import:
```javascript
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
```

**Step 2: Replace state declarations**

Remove:
```javascript
const [lastQuery, setLastQuery] = useState(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const [data, setData] = useState(null);
const [initMessage, setInitMessage] = useState(null);
```

Replace with:
```javascript
const { data, isLoading, error, initMessage, execute } = useCancellableQuery();
```

**Step 3: Replace handleQueryChange**

Remove and replace with:

```javascript
const handleQueryChange = useCallback(
  (newQuery) => {
    execute((signal) => getStudios(newQuery, signal));
  },
  [execute]
);
```

**Step 4: Update getStudios to accept signal**

Change:
```javascript
const getStudios = async (query) => {
  const response = await libraryApi.findStudios(query);
```

To:
```javascript
const getStudios = async (query, signal) => {
  const response = await libraryApi.findStudios(query, signal);
```

**Step 5: Commit**

```bash
git add client/src/components/pages/Studios.jsx
git commit -m "refactor: use useCancellableQuery in Studios page"
```

---

## Task 7: Refactor Tags.jsx to Use useCancellableQuery

**Files:**
- Modify: `client/src/components/pages/Tags.jsx`

**Step 1: Update imports**

Replace:
```javascript
import { useRef, useState } from "react";
```

With:
```javascript
import { useCallback, useRef } from "react";
```

Add import:
```javascript
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
```

**Step 2: Replace state declarations**

Remove:
```javascript
const [lastQuery, setLastQuery] = useState(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const [data, setData] = useState(null);
const [initMessage, setInitMessage] = useState(null);
```

Replace with:
```javascript
const { data, isLoading, error, initMessage, execute } = useCancellableQuery();
```

**Step 3: Replace handleQueryChange**

Remove and replace with:

```javascript
const handleQueryChange = useCallback(
  (newQuery) => {
    execute((signal) => getTags(newQuery, signal));
  },
  [execute]
);
```

**Step 4: Update getTags to accept signal**

Change:
```javascript
const getTags = async (query) => {
  const response = await libraryApi.findTags(query);
```

To:
```javascript
const getTags = async (query, signal) => {
  const response = await libraryApi.findTags(query, signal);
```

**Step 5: Commit**

```bash
git add client/src/components/pages/Tags.jsx
git commit -m "refactor: use useCancellableQuery in Tags page"
```

---

## Task 8: Refactor Groups.jsx to Use useCancellableQuery

**Files:**
- Modify: `client/src/components/pages/Groups.jsx`

**Step 1: Update imports**

Replace:
```javascript
import { useRef, useState } from "react";
```

With:
```javascript
import { useCallback, useRef } from "react";
```

Add import:
```javascript
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
```

**Step 2: Replace state declarations**

Remove:
```javascript
const [lastQuery, setLastQuery] = useState(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const [data, setData] = useState(null);
const [initMessage, setInitMessage] = useState(null);
```

Replace with:
```javascript
const { data, isLoading, error, initMessage, execute } = useCancellableQuery();
```

**Step 3: Replace handleQueryChange**

Remove and replace with:

```javascript
const handleQueryChange = useCallback(
  (newQuery) => {
    execute((signal) => getGroups(newQuery, signal));
  },
  [execute]
);
```

**Step 4: Update getGroups to accept signal**

Change:
```javascript
const getGroups = async (query) => {
  const response = await libraryApi.findGroups(query);
```

To:
```javascript
const getGroups = async (query, signal) => {
  const response = await libraryApi.findGroups(query, signal);
```

**Step 5: Commit**

```bash
git add client/src/components/pages/Groups.jsx
git commit -m "refactor: use useCancellableQuery in Groups page"
```

---

## Task 9: Refactor Galleries.jsx to Use useCancellableQuery

**Files:**
- Modify: `client/src/components/pages/Galleries.jsx`

**Step 1: Update imports**

Replace:
```javascript
import { useRef, useState } from "react";
```

With:
```javascript
import { useCallback, useRef } from "react";
```

Add import:
```javascript
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
```

**Step 2: Replace state declarations**

Remove:
```javascript
const [lastQuery, setLastQuery] = useState(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const [data, setData] = useState(null);
const [initMessage, setInitMessage] = useState(null);
```

Replace with:
```javascript
const { data, isLoading, error, initMessage, execute } = useCancellableQuery();
```

**Step 3: Replace handleQueryChange**

Remove and replace with:

```javascript
const handleQueryChange = useCallback(
  (newQuery) => {
    execute((signal) => getGalleries(newQuery, signal));
  },
  [execute]
);
```

**Step 4: Update getGalleries to accept signal**

Change:
```javascript
const getGalleries = async (query) => {
  const response = await libraryApi.findGalleries(query);
```

To:
```javascript
const getGalleries = async (query, signal) => {
  const response = await libraryApi.findGalleries(query, signal);
```

**Step 5: Commit**

```bash
git add client/src/components/pages/Galleries.jsx
git commit -m "refactor: use useCancellableQuery in Galleries page"
```

---

## Task 10: Refactor SceneSearch.jsx to Use useCancellableQuery

**Files:**
- Modify: `client/src/components/scene-search/SceneSearch.jsx`

**Step 1: Update imports**

Replace:
```javascript
import { useState } from "react";
```

With:
```javascript
import { useCallback } from "react";
```

Add import:
```javascript
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
```

**Step 2: Replace state declarations**

Remove:
```javascript
const [lastQuery, setLastQuery] = useState(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const [data, setData] = useState(null);
const [initMessage, setInitMessage] = useState(null);
```

Replace with:
```javascript
const { data, isLoading, error, initMessage, execute, setData } = useCancellableQuery();
```

Note: SceneSearch needs `setData` for `handleHideSuccess`.

**Step 3: Replace handleQueryChange**

Remove the entire function and replace with:

```javascript
const handleQueryChange = useCallback(
  (newQuery) => {
    execute((signal) => getScenes(newQuery, signal));
  },
  [execute]
);
```

**Step 4: Update getScenes to accept signal**

Change:
```javascript
const getScenes = async (query) => {
  const response = await libraryApi.findScenes(query);
```

To:
```javascript
const getScenes = async (query, signal) => {
  const response = await libraryApi.findScenes(query, signal);
```

**Step 5: Commit**

```bash
git add client/src/components/scene-search/SceneSearch.jsx
git commit -m "refactor: use useCancellableQuery in SceneSearch"
```

---

## Task 11: Run Linting and Fix Any Issues

**Step 1: Run linting**

```bash
cd client && npm run lint
```

**Step 2: Fix any issues**

Address any linting errors that appear.

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: address linting issues"
```

---

## Task 12: Manual Testing Verification

**Test View Tracking:**
1. Open Images page, click an image to open lightbox
2. Navigate quickly through images (arrow keys or buttons)
3. Open Network tab, filter by "view" - should see NO requests for quick navigation
4. Stay on one image for 4+ seconds
5. Should see exactly 1 `/api/image-view-history/view` request
6. Navigate to new image, wait 4+ seconds → another view request
7. In React dev mode (Strict Mode), verify no duplicate requests

**Test Request Cancellation:**
1. Go to any search page (Images, Performers, etc.)
2. Open Network tab
3. Type in search box rapidly (e.g., "test")
4. Should see previous requests cancelled (status "cancelled" or greyed out)
5. Only final request should complete
6. Change filters/pagination rapidly → same cancellation behavior
7. Result should show data from final query, no flicker
