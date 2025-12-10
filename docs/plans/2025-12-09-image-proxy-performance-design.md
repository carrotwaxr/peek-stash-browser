# Design: Image Proxy Performance

## Problem

After fixing SQLite query performance (350-500ms), the app still becomes unresponsive when browsing scenes. Network requests pile up in pending/stalled state, and scene cards never finish loading their images.

## Root Cause

When a page of 24 scene cards loads:
1. All 24 cards render immediately
2. Each card has an `<img>` for the screenshot (plus sprites/previews on hover)
3. Browser queues all 24 image requests quickly (`loading="lazy"` only defers slightly)
4. All 24 requests hit Peek's proxy simultaneously
5. Proxy opens 24 separate TCP connections to Stash
6. Stash gets overwhelmed, responses slow dramatically
7. Browser's 6-connection-per-host limit causes additional stalling
8. Cards never finish loading

## Solution

Three-part fix targeting both backend and frontend:

### 1. Backend: Connection Pooling

**Problem:** Each proxy request creates a new TCP connection with full handshake overhead.

**Solution:** Use HTTP agents with keep-alive connection pooling.

```typescript
// server/controllers/proxy.ts

import http from "http";
import https from "https";

// Reusable agents with connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 6,
  keepAliveMsecs: 30000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 6,
  keepAliveMsecs: 30000
});

// In proxy handlers:
const agent = urlObj.protocol === "https:" ? httpsAgent : httpAgent;
httpModule.get(fullUrl, { agent }, (proxyRes) => { ... });
```

### 2. Backend: Concurrency Limiting

**Problem:** Unlimited concurrent requests overwhelm Stash.

**Solution:** Add a semaphore to limit concurrent outbound requests.

```typescript
// server/controllers/proxy.ts

const MAX_CONCURRENT_REQUESTS = 4;
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>(resolve => requestQueue.push(resolve));
  }
  activeRequests++;
  try {
    return await fn();
  } finally {
    activeRequests--;
    const next = requestQueue.shift();
    if (next) next();
  }
}

// Wrap proxy logic:
export const proxyStashMedia = async (req: Request, res: Response) => {
  await withConcurrencyLimit(async () => {
    // existing proxy logic
  });
};
```

### 3. Frontend: True Lazy Loading

**Problem:** `loading="lazy"` on `<img>` doesn't prevent browser from queuing all images.

**Solution:** Only set `src` when card enters viewport using IntersectionObserver.

```jsx
// client/src/components/ui/SceneCardPreview.jsx

const [shouldLoadScreenshot, setShouldLoadScreenshot] = useState(false);

useEffect(() => {
  if (!containerElement) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoadScreenshot(true);
        observer.disconnect();
      }
    },
    { rootMargin: "200px" } // Load slightly before visible
  );
  observer.observe(containerElement);
  return () => observer.disconnect();
}, [containerElement]);

// Render - only set src when ready
<img
  src={shouldLoadScreenshot ? scene?.paths?.screenshot : undefined}
  alt={scene?.title || "Scene"}
  className="w-full h-full object-contain"
  style={{ backgroundColor: "var(--bg-secondary)" }}
/>
```

## Files to Modify

| File | Change |
|------|--------|
| `server/controllers/proxy.ts` | Add connection pooling agents, concurrency limiter |
| `client/src/components/ui/SceneCardPreview.jsx` | IntersectionObserver for screenshot lazy loading |

## Implementation Order

1. Backend changes first (immediate improvement)
2. Frontend changes second (further reduces load)

## Not Doing (YAGNI)

- **Server-side disk cache**: Browser cache with `Cache-Control: immutable, max-age=1year` is sufficient. Stash images are essentially immutable.
- **Virtualization**: Overkill for 24 cards per page. Would add complexity without proportional benefit.
- **Priority queuing**: Simple FIFO queue is sufficient. No need to prioritize certain image types.

## Expected Results

- Initial page load: 4 concurrent requests max instead of 24
- Scrolling: Progressive loading as cards enter viewport
- Repeat visits: Browser cache serves images instantly
- Stash load: Dramatically reduced, no more overwhelming

## Success Criteria

- Scene grid loads without hanging
- Network tab shows controlled request flow (not 24 pending)
- Cards load progressively as user scrolls
- No browser unresponsiveness during navigation
