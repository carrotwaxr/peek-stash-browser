# Contextual Back Navigation

## Problem Statement

Back buttons on detail pages have inconsistent behavior:

1. **Inconsistent navigation targets** - Some use `navigate(-1)`, others use `location.state?.referrerUrl`, others hardcode URLs
2. **Generic button text** - All say "Back to {EntityType}" regardless of where user came from
3. **No context preservation** - User can't tell if they're returning to a filtered list, another detail page, or the base list

## Current State

| Page | Navigation Target | Button Text |
|------|-------------------|-------------|
| Scene | `referrerUrl` OR `navigate(-1)` | "Back to Scenes" |
| PerformerDetail | `referrerUrl` OR `/performers` | "Back to Performers" |
| StudioDetail | `referrerUrl` OR `/studios` | "Back to Studios" |
| TagDetail | `referrerUrl` OR `/tags` | "Back to Tags" |
| GalleryDetail | `referrerUrl` OR `/galleries` | "Back to Galleries" |
| GroupDetail | `referrerUrl` OR `/collections` | "Back to Collections" |
| PlaylistDetail | `/playlists` (hardcoded) | "Back to Playlists" |
| HiddenItemsPage | `/settings?section=user&tab=content` | "Back to Settings" |

## Proposed Solution

### Core Insight

With the recent URL state management refactor (#266), `navigate(-1)` is now always correct:
- If user came from a filtered list, those filters are in the URL - back restores them
- If user came from a list with default preset (no URL params), back goes to base URL which re-applies preset
- If user came from another detail page, back goes there

### Design

1. **Standardize all back buttons to `navigate(-1)`**
2. **Store page title in navigation state when navigating away**
3. **Back buttons read from state to show contextual text**
4. **Graceful fallback to "Back" when no state available**

### Implementation

#### 1. Enhance usePageTitle to expose current title

```javascript
// Current
export const usePageTitle = (title = "") => {
  useEffect(() => {
    document.title = title ? `${title} - Peek` : "Peek";
  }, [title]);
};

// Proposed - also store in ref for navigation to access
export const usePageTitle = (title = "") => {
  const titleRef = useRef(title);

  useEffect(() => {
    titleRef.current = title;
    document.title = title ? `${title} - Peek` : "Peek";
  }, [title]);

  return { currentTitle: titleRef };
};
```

#### 2. Create useNavigationState hook

```javascript
export const useNavigationState = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get the title of the page we came from
  const fromPageTitle = location.state?.fromPageTitle;

  // Navigate with current page title in state
  const navigateWithTitle = useCallback((to, options = {}) => {
    const currentTitle = getCurrentPageTitle(); // Read from document.title or context
    navigate(to, {
      ...options,
      state: {
        ...options.state,
        fromPageTitle: currentTitle,
      },
    });
  }, [navigate]);

  // Go back with context
  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Generate back button text
  const backButtonText = fromPageTitle
    ? `Back to ${fromPageTitle}`
    : "Back";

  return {
    fromPageTitle,
    backButtonText,
    navigateWithTitle,
    goBack,
  };
};
```

#### 3. Update navigation calls site-wide

All `navigate()` calls that go to pages with back buttons need to use `navigateWithTitle()`:

```javascript
// Before
navigate(`/performer/${id}`);

// After
navigateWithTitle(`/performer/${id}`);
```

#### 4. Update back buttons

```javascript
// Before
<Button onClick={() => navigate(location.state?.referrerUrl || "/performers")}>
  Back to Performers
</Button>

// After
const { goBack, backButtonText } = useNavigationState();
<Button onClick={goBack}>
  {backButtonText}
</Button>
```

### Page Titles (for consistency)

| Page Type | usePageTitle Value | Back Button Would Show |
|-----------|-------------------|----------------------|
| **List Pages** | | |
| Home | `"Home"` | "Back to Home" |
| Scenes | `"Scenes"` | "Back to Scenes" |
| Performers | `"Performers"` | "Back to Performers" |
| Tags | `"Tags"` | "Back to Tags" |
| Studios | `"Studios"` | "Back to Studios" |
| Galleries | `"Galleries"` | "Back to Galleries" |
| Images | `"Images"` | "Back to Images" |
| Groups | `"Collections"` | "Back to Collections" |
| Playlists | `"Playlists"` | "Back to Playlists" |
| Watch History | `"Watch History"` | "Back to Watch History" |
| Recommended | `"Recommended"` | "Back to Recommended" |
| Settings | `"Settings"` | "Back to Settings" |
| **Detail Pages** | | |
| Scene | `displayTitle` (title OR filename OR "Scene") | "Back to {Scene Title}" |
| Performer | `performer?.name \|\| "Performer"` | "Back to {Performer Name}" |
| Tag | `tag?.name \|\| "Tag"` | "Back to {Tag Name}" |
| Studio | `studio?.name \|\| "Studio"` | "Back to {Studio Name}" |
| Gallery | `galleryTitle(gallery)` | "Back to {Gallery Title}" |
| Group | `group?.name \|\| "Collection"` | "Back to {Group Name}" |
| Playlist | `playlist?.name \|\| "Playlist"` | "Back to {Playlist Name}" |

### Changes Required

1. **Update Home page** - Change `usePageTitle()` to `usePageTitle("Home")`
2. **Create useNavigationState hook** - New hook in `client/src/hooks/`
3. **Update all navigate() calls** - Use `navigateWithTitle()` for detail page navigation
4. **Update all back buttons** - Use `goBack()` and `backButtonText`
5. **Remove referrerUrl logic** - No longer needed

### Migration Scope

Files requiring changes:

**Navigation sources (need navigateWithTitle):**
- `components/cards/*.jsx` - Card clicks to detail pages
- `components/pages/*.jsx` - List pages with onItemSelect
- `components/ui/SceneCard.jsx` - Indicator navigations
- `components/scene-search/SceneSearch.jsx` - Scene navigation
- `components/ui/ContinueWatchingCarousel.jsx` - Scene navigation
- `components/ui/RecommendedSidebar.jsx` - Scene navigation

**Back buttons (need useNavigationState):**
- `components/pages/Scene.jsx`
- `components/pages/PerformerDetail.jsx`
- `components/pages/StudioDetail.jsx`
- `components/pages/TagDetail.jsx`
- `components/pages/GalleryDetail.jsx`
- `components/pages/GroupDetail.jsx`
- `components/pages/PlaylistDetail.jsx`
- `components/pages/HiddenItemsPage.jsx`

## Known Issue: Title Fallback Inconsistency

**Finding:** Title/name fallback logic is handled differently across entity types:

| Entity | Fallback Location | Fallback Logic |
|--------|------------------|----------------|
| Scene | Frontend (`Scene.jsx:36`) | `title \|\| files[0].basename \|\| "Scene"` |
| Gallery | Frontend (`utils/gallery.js`) | `title \|\| files[0].basename \|\| folder.path \|\| "Untitled Gallery"` |
| Performer | Frontend (`PerformerDetail.jsx:41`) | `name \|\| "Performer"` |
| Tag | Frontend (`TagDetail.jsx:53`) | `name \|\| "Tag"` |
| Studio | Frontend (`StudioDetail.jsx:59`) | `name \|\| "Studio"` |
| Group | Frontend (`GroupDetail.jsx:35`) | `name \|\| "Collection"` |
| Playlist | Frontend (`PlaylistDetail.jsx:51`) | `name \|\| "Playlist"` |
| Image | **Server** (`ImageQueryBuilder.ts:347`) | `COALESCE(title, filePath)` for sorting |

**Recommendation:** This inconsistency should be addressed in a follow-up branch. Options:
1. Move all fallback logic to the server (API always returns display-ready titles)
2. Create a shared frontend utility for each entity type (like `galleryTitle`)
3. Accept current state as intentional (API returns raw data, frontend formats)

For this feature, we use whatever `usePageTitle` receives, which already handles fallbacks.

## Testing

### Manual Test Scenarios

1. Navigate Scenes → Scene detail → Back button shows "Back to Scenes"
2. Navigate Performer detail → Scene detail → Back button shows "Back to {Performer Name}"
3. Navigate filtered list (/tags?favorite=true) → Tag detail → Back restores filters
4. Deep link directly to detail page → Back button shows just "Back"
5. Browser back button works identically to Back button click

### Unit Tests

- `useNavigationState` returns correct `backButtonText` with/without state
- `navigateWithTitle` includes `fromPageTitle` in state
- Fallback to "Back" when `fromPageTitle` is missing
