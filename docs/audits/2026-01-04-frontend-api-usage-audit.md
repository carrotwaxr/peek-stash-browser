# Frontend API Usage Audit: Library Routes

**Date:** 2026-01-04
**Scope:** All library API routes and their frontend consumers

## Summary

| Category | Count |
|----------|-------|
| Library API Endpoints | 15 |
| Frontend Files Using Library API | 18 |
| Central API Service | `client/src/services/api.js` |

---

## Endpoint Usage Matrix

| Endpoint | Method | Primary Consumers |
|----------|--------|-------------------|
| `/api/library/scenes` | POST | SceneSearch, HomeCarousels, ContinueWatching |
| `/api/library/scenes/:id/similar` | GET | ScenesLikeThis, RecommendedSidebar |
| `/api/library/scenes/:id/recommended` | GET | Recommended page |
| `/api/library/performers` | POST | Performers page, SearchableSelect |
| `/api/library/performers/minimal` | POST | Filter dropdowns |
| `/api/library/studios` | POST | Studios page, HomeCarousels, SearchableSelect |
| `/api/library/studios/minimal` | POST | Filter dropdowns |
| `/api/library/tags` | POST | Tags page, HomeCarousels, SearchableSelect |
| `/api/library/tags/minimal` | POST | Filter dropdowns |
| `/api/library/groups` | POST | Groups page, SearchableSelect |
| `/api/library/groups/minimal` | POST | Filter dropdowns |
| `/api/library/groups/:id` | PUT | GroupDetail (rating/favorite) |
| `/api/library/galleries` | POST | Galleries page, SearchableSelect |
| `/api/library/galleries/:id/images` | GET | GalleryDetail |
| `/api/library/images` | POST | Images page, StudioDetail |

---

## Detailed Usage by Endpoint

### POST /api/library/scenes

**Purpose:** Search and fetch scenes with filtering and pagination

**Consumers:**

1. **`client/src/services/api.js:107`**
   - Function: `libraryApi.findScenes(params, signal)`
   - Central API method

2. **`client/src/hooks/useHomeCarouselQueries.js`**
   - `favoritePerformerScenes()` - Home carousel
   - `favoriteStudioScenes()` - Home carousel
   - `favoriteTagScenes()` - Home carousel
   - `highRatedScenes()` - Home carousel
   - `recentlyAddedScenes()` - Home carousel

3. **`client/src/components/scene-search/SceneSearch.jsx`**
   - Main scene browsing and search page

4. **`client/src/components/ui/ContinueWatchingCarousel.jsx:55`**
   - Fetch full scene data from watch history IDs

5. **`client/src/contexts/ScenePlayerContext.jsx:53`**
   - Load individual scene in player

---

### GET /api/library/scenes/:id/similar

**Purpose:** Fetch scenes similar to a given scene

**Consumers:**

1. **`client/src/components/ui/ScenesLikeThis.jsx:26`**
   - "Scenes Like This" section on scene detail

2. **`client/src/components/ui/RecommendedSidebar.jsx:25`**
   - Sidebar recommendations on scene detail

---

### GET /api/library/scenes/:id/recommended

**Purpose:** Personalized recommendations based on favorites/ratings

**Consumers:**

1. **`client/src/components/pages/Recommended.jsx:49`**
   - Main recommendations page

---

### POST /api/library/performers

**Purpose:** Search and fetch performers

**Consumers:**

1. **`client/src/services/api.js:117`**
   - `libraryApi.findPerformers(params, signal)`

2. **`client/src/components/pages/Performers.jsx:155`**
   - Performers listing and search

3. **`client/src/components/ui/SearchableSelect.jsx:57`**
   - Filter dropdown population

---

### POST /api/library/studios

**Purpose:** Search and fetch studios

**Consumers:**

1. **`client/src/services/api.js:127`**
   - `libraryApi.findStudios(params, signal)`

2. **`client/src/components/pages/Studios.jsx:130`**
   - Studios listing and search

3. **`client/src/hooks/useHomeCarouselQueries.js:13`**
   - Favorite studios carousel

4. **`client/src/components/ui/SearchableSelect.jsx:62`**
   - Filter dropdown population

---

### POST /api/library/tags

**Purpose:** Search and fetch tags

**Consumers:**

1. **`client/src/services/api.js:137`**
   - `libraryApi.findTags(params, signal)`

2. **`client/src/components/pages/Tags.jsx:128`**
   - Tags listing and search

3. **`client/src/hooks/useHomeCarouselQueries.js:44`**
   - Favorite tags carousel

4. **`client/src/components/ui/SearchableSelect.jsx:67`**
   - Filter dropdown population

---

### POST /api/library/groups

**Purpose:** Search collections/groups

**Consumers:**

1. **`client/src/services/api.js:256`**
   - `libraryApi.findGroups(params, signal)`

2. **`client/src/components/pages/Groups.jsx:131`**
   - Groups listing and search

3. **`client/src/components/ui/SearchableSelect.jsx:72`**
   - Filter dropdown population

---

### POST /api/library/galleries

**Purpose:** Search image galleries

**Consumers:**

1. **`client/src/services/api.js:220`**
   - `libraryApi.findGalleries(params, signal)`

2. **`client/src/components/pages/Galleries.jsx:127`**
   - Galleries listing and search

3. **`client/src/components/ui/SearchableSelect.jsx:77`**
   - Filter dropdown population

---

### GET /api/library/galleries/:id/images

**Purpose:** Fetch paginated images from a gallery

**Consumers:**

1. **`client/src/services/api.js:241`**
   - `libraryApi.getGalleryImages(galleryId, { page, per_page })`

2. **`client/src/components/pages/GalleryDetail.jsx:67`**
   - Gallery image grid with pagination

---

### POST /api/library/images

**Purpose:** Search images across galleries

**Consumers:**

1. **`client/src/services/api.js:298`**
   - `libraryApi.findImages(params, signal)`

2. **`client/src/components/pages/Images.jsx:200`**
   - Images listing and search

3. **`client/src/components/pages/StudioDetail.jsx:663`**
   - Studio's associated images

---

## Architecture Pattern

```
┌─────────────────────────────────────────────────────────┐
│                    Components                            │
│  (Pages, UI Components, Carousels)                      │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                  Hooks Layer                             │
│  (useHomeCarouselQueries, useCancellableQuery)          │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│               API Service Layer                          │
│  (client/src/services/api.js - libraryApi object)       │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                  Server API                              │
│  (POST/GET /api/library/*)                              │
└─────────────────────────────────────────────────────────┘
```

## Key Patterns

1. **Centralized API Service**: All library calls go through `libraryApi` in `api.js`
2. **AbortSignal Support**: All search endpoints support request cancellation
3. **Minimal Variants**: Each entity has a `/minimal` endpoint for dropdowns (ID + name only)
4. **Pagination**: All list endpoints support `page` and `per_page` parameters

## Entity Detail Pages

Each entity type has a detail page that fetches by ID:

| Entity | Page | API Method |
|--------|------|------------|
| Performer | PerformerDetail.jsx | `findPerformerById(id)` |
| Studio | StudioDetail.jsx | `findStudioById(id)` |
| Tag | TagDetail.jsx | `findTagById(id)` |
| Group | GroupDetail.jsx | `findGroupById(id)` |
| Gallery | GalleryDetail.jsx | `findGalleryById(id)` |

## Rating/Favorite Updates

Rating and favorite updates use the ratings API (`/api/ratings/*`), not library endpoints:

- `libraryApi.updateRating(entityType, id, rating)` → `/api/ratings/:entityType/:id`
- `libraryApi.updateFavorite(entityType, id, value)` → `/api/ratings/:entityType/:id/favorite`

Used in all detail pages (PerformerDetail, StudioDetail, TagDetail, GroupDetail, GalleryDetail).
