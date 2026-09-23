---
paths:
  - "client/src/**"
---

# Client

## Data

- List pages fetch through the TanStack Query hooks in `src/api/hooks/`, keyed by `src/api/queryKeys.ts`; entity keys include the instanceId. Detail pages, cards and the lightbox still call `libraryApi` directly: the migration stopped after the list hooks, and the detail and rating/favorite hooks have no callers yet.
- `src/api/client.ts` holds `apiFetch`. A 401 or 403 redirects to login, except for `AUTH_SILENT_ENDPOINTS`, which throw instead so a background ping can't interrupt playback. Add new fire-and-forget endpoints there.
- A cancelled request rejects with `AbortError`. Callers ignore it rather than showing an error.
- The hooks don't wait for auth themselves; `ProtectedRoute` holds back rendering until auth resolves. A component outside it gates its own queries.
- Entity references in URLs and filter values are `"id:instanceId"`, built by `src/utils/compositeKey.ts`; a bare id means no instance was known.

## useFilterState

It reads the URL once on mount and afterwards only writes it; reading it back again loops. The debounced search reads current state through `stateRef` to avoid stale closures. Precedence between a saved preset and the URL has caused bugs: URL filters win only when the URL has params other than `page` and `per_page`; sort and direction still come from the preset unless the URL names them; a URL `per_page` always wins.

## Structure

- Provider order in `App.tsx`: Theme, Auth, QueryClient, Config, UnitPreference, TVMode, CardDisplaySettings. Config fetches need auth, and the theme's CSS variables must exist before anything renders.
- Colors come from theme CSS variables (`var(--bg-card)`, `var(--accent-primary)`), not Tailwind palette classes; the few palette classes left are status colors. The `visual-style` skill has the full system.
- `src/utils/filterConfig.ts` (3,600+ lines) defines every entity's filter options, so a change there reaches every search page.
