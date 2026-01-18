# Post-Login Landing Page Preference

**Issue:** https://github.com/carrotwaxr/peek-stash-browser/issues/290
**Date:** 2026-01-17

## Summary

Add a user preference to configure which page to land on after login. Currently, users always land on the Home page (carousels). This feature lets users choose any entity page as their landing destination, with an optional "random" mode to pick from multiple selections.

## Requirements

- New setting under User Preferences → Navigation
- Single-select by default (pick one landing page)
- "Random one of" toggle enables multi-select mode
- When random mode is enabled, minimum 2 pages must be selected
- Saved redirect URLs (from route guards) take priority over the preference
- Default to Home for backwards compatibility

## Data Model

### Prisma Schema Change

Add to User model:

```prisma
landingPagePreference  Json?  @default("{\"pages\":[\"home\"],\"randomize\":false}")
```

### TypeScript Interface

```typescript
interface LandingPagePreference {
  pages: string[];    // Page keys, e.g., ["home"] or ["scenes", "performers"]
  randomize: boolean; // false = use pages[0], true = pick random from array
}
```

### Valid Page Keys

| Key | Label | Path |
|-----|-------|------|
| `home` | Home | `/` |
| `scenes` | Scenes | `/scenes` |
| `performers` | Performers | `/performers` |
| `studios` | Studios | `/studios` |
| `tags` | Tags | `/tags` |
| `collections` | Collections | `/collections` |
| `galleries` | Galleries | `/galleries` |
| `images` | Images | `/images` |
| `playlists` | Playlists | `/playlists` |
| `recommended` | Recommended | `/recommended` |
| `watch-history` | Watch History | `/watch-history` |
| `user-stats` | User Stats | `/user-stats` |

## UI Design

### Location

Settings → User Preferences → Navigation tab

### Layout

```
Landing Page After Login
─────────────────────────────────────

□ Random one of selected pages

○ Home
○ Scenes
○ Performers
○ Studios
○ Tags
○ Collections
○ Galleries
○ Images
○ Playlists
○ Recommended
○ Watch History
○ User Stats
```

### Behavior

**When "Random" toggle is OFF:**
- Radio button selection (single choice)
- One page must be selected

**When "Random" toggle is ON:**
- Checkbox selection (multi-select)
- Minimum 2 pages must be selected
- Validation error if fewer than 2: "Select at least 2 pages for random mode"

### Display Order

Fixed logical grouping (not alphabetical, not user-configurable):
1. Home
2. Scenes
3. Performers
4. Studios
5. Tags
6. Collections
7. Galleries
8. Images
9. Playlists
10. Recommended
11. Watch History
12. User Stats

## Post-Login Navigation Flow

### Current Flow (Login.jsx)

```javascript
const savedUrl = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
if (savedUrl) {
  sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  navigate(savedUrl);
} else {
  navigate("/");
}
```

### New Flow

```javascript
const savedUrl = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
if (savedUrl) {
  sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  navigate(savedUrl);
} else {
  const destination = getLandingPage(user.landingPagePreference);
  navigate(destination);
}
```

### Helper Functions

```javascript
const PAGE_KEY_TO_PATH = {
  home: "/",
  scenes: "/scenes",
  performers: "/performers",
  studios: "/studios",
  tags: "/tags",
  collections: "/collections",
  galleries: "/galleries",
  images: "/images",
  playlists: "/playlists",
  recommended: "/recommended",
  "watch-history": "/watch-history",
  "user-stats": "/user-stats",
};

function getLandingPage(preference) {
  // Default fallback
  if (!preference || !preference.pages?.length) {
    return "/";
  }

  if (preference.randomize && preference.pages.length > 1) {
    const randomIndex = Math.floor(Math.random() * preference.pages.length);
    return PAGE_KEY_TO_PATH[preference.pages[randomIndex]] || "/";
  }

  return PAGE_KEY_TO_PATH[preference.pages[0]] || "/";
}
```

### Priority Order

1. Saved redirect URL in sessionStorage (from route guards when user was redirected to login)
2. User's landing page preference
3. Default to "/" (Home)

## API Changes

No new endpoints required. Uses existing settings infrastructure:

- `GET /api/user/settings` — returns `landingPagePreference` field
- `PUT /api/user/settings` — accepts `landingPagePreference` updates

## Files to Modify

### Database
- `server/prisma/schema.prisma` — add `landingPagePreference` field

### Server
- `server/controllers/user.ts` — include field in settings get/put

### Client
- `client/src/components/pages/Login.jsx` — implement new navigation logic
- `client/src/components/settings/tabs/NavigationTab.jsx` — add landing page UI
- `client/src/constants/navigation.js` — add `LANDING_PAGE_OPTIONS` constant

## Migration

Existing users without the preference get the default `{ pages: ["home"], randomize: false }`, preserving current behavior.
