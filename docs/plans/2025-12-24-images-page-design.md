# Images Page Design

**Issue**: #193 - Browse standalone images outside of galleries
**Date**: 2025-12-24

## Overview

Add an Images page to Peek that displays ALL images in the library (both standalone and gallery-associated), with full filtering, sorting, and the ability to view images in a lightbox. Gallery metadata acts as an "umbrella" over its images - images inherit their gallery's performers, tags, and studio for filtering purposes.

## Key Design Decisions

1. **Gallery-umbrella inheritance**: Images inherit performers, tags, and studio from their parent galleries. If an image is in multiple galleries, it matches filters if ANY gallery matches (union approach).

2. **Data storage**: All image metadata synced to Peek's database (already implemented). Image files streamed/proxied from Stash.

3. **Image proxy**: Same pattern as video streaming - `/api/proxy/image/:imageId/:type` hides Stash API key from client.

4. **Navigation**: "Images" appears after "Galleries" in sidebar, respecting user hide/reorder preferences.

5. **Image viewing**: Clicking an image opens the existing Lightbox component (reused from GalleryDetail).

6. **Query architecture**: Query-time JOINs using CTEs for gallery inheritance, with proper indexes for million-image scale.

7. **Multi-gallery conflict resolution**: Union approach - image matches if ANY of its galleries match the filter criteria.

## Database Schema Changes

New migration adds missing fields and performance indexes:

```sql
-- StashImage additions
ALTER TABLE StashImage ADD COLUMN code TEXT;
ALTER TABLE StashImage ADD COLUMN details TEXT;
ALTER TABLE StashImage ADD COLUMN photographer TEXT;
ALTER TABLE StashImage ADD COLUMN urls TEXT;  -- JSON array

-- StashGallery additions
ALTER TABLE StashGallery ADD COLUMN photographer TEXT;
ALTER TABLE StashGallery ADD COLUMN urls TEXT;  -- JSON array

-- Performance indexes for gallery-umbrella queries
CREATE INDEX IF NOT EXISTS ImageGallery_imageId_idx ON ImageGallery(imageId);
CREATE INDEX IF NOT EXISTS GalleryPerformer_galleryId_idx ON GalleryPerformer(galleryId);
CREATE INDEX IF NOT EXISTS GalleryTag_galleryId_idx ON GalleryTag(galleryId);
CREATE INDEX IF NOT EXISTS StashGallery_studioId_deletedAt_idx ON StashGallery(studioId, deletedAt);
```

Update Prisma schema to match.

## Sync Service Updates

### processImagesBatch

Add new fields to the INSERT statement:

```typescript
// Fields to add:
code, details, photographer, urls

// Values:
${this.escapeNullable(image.code)},
${this.escapeNullable(image.details)},
${this.escapeNullable(image.photographer)},
${this.escapeNullable(image.urls ? JSON.stringify(image.urls) : null)}
```

### processGalleriesBatch

Add `photographer` and `urls` fields similarly.

### stashapp-api

Ensure GraphQL queries request: `code`, `details`, `photographer`, `urls` for both images and galleries.

## Image Proxy Endpoint

**Route**: `GET /api/proxy/image/:imageId/:type`

**File**: `server/routes/proxy/images.ts`

```typescript
router.get('/image/:imageId/:type', authenticated, async (req, res) => {
  const { imageId, type } = req.params;

  // Validate type
  if (!['thumbnail', 'preview', 'image'].includes(type)) {
    return res.status(400).json({ error: 'Invalid image type' });
  }

  // Get image from database
  const image = await prisma.stashImage.findFirst({
    where: { id: imageId, deletedAt: null }
  });

  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  // Get the appropriate path
  const pathField = type === 'thumbnail' ? 'pathThumbnail'
                  : type === 'preview' ? 'pathPreview'
                  : 'pathImage';
  const stashUrl = image[pathField];

  if (!stashUrl) {
    return res.status(404).json({ error: 'Image path not available' });
  }

  // Proxy the request to Stash (reuse existing proxy utility)
  await proxyStashRequest(stashUrl, req, res);
});
```

## Images Controller

**File**: `server/controllers/library/images.ts`

### Query Architecture with Gallery Inheritance

Uses CTEs (Common Table Expressions) for efficient gallery-umbrella inheritance:

```typescript
const buildImageQuery = (filters, sort, pagination) => {
  return `
    WITH effective_performers AS (
      -- Direct image performers
      SELECT imageId, performerId FROM ImagePerformer
      UNION
      -- Inherited from galleries
      SELECT ig.imageId, gp.performerId
      FROM ImageGallery ig
      JOIN GalleryPerformer gp ON ig.galleryId = gp.galleryId
    ),
    effective_tags AS (
      -- Direct image tags
      SELECT imageId, tagId FROM ImageTag
      UNION
      -- Inherited from galleries
      SELECT ig.imageId, gt.tagId
      FROM ImageGallery ig
      JOIN GalleryTag gt ON ig.galleryId = gt.galleryId
    ),
    effective_studios AS (
      -- Direct image studio
      SELECT id as imageId, studioId FROM StashImage WHERE studioId IS NOT NULL
      UNION
      -- Inherited from galleries (if image has no studio)
      SELECT ig.imageId, g.studioId
      FROM ImageGallery ig
      JOIN StashGallery g ON ig.galleryId = g.id
      WHERE g.studioId IS NOT NULL
    )
    SELECT DISTINCT i.*
    FROM StashImage i
    WHERE i.deletedAt IS NULL
      ${performerFilter ? 'AND i.id IN (SELECT imageId FROM effective_performers WHERE performerId IN (?))' : ''}
      ${tagFilter ? 'AND i.id IN (SELECT imageId FROM effective_tags WHERE tagId IN (?))' : ''}
      ${studioFilter ? 'AND i.id IN (SELECT imageId FROM effective_studios WHERE studioId IN (?))' : ''}
    ORDER BY ${sortColumn} ${sortDirection}
    LIMIT ? OFFSET ?
  `;
};
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/library/images` | POST | Find images with filters/sort/pagination |
| `/api/library/images/:id` | GET | Get single image with hydrated relationships |
| `/api/library/images/minimal` | POST | Minimal list for dropdowns |
| `/api/library/images/:id/rating` | POST | Set user rating (existing) |
| `/api/library/images/:id/favorite` | POST | Toggle favorite (existing) |

### Filter Support

Matching Stash's ImageFilterType:

| Filter | Type | Description |
|--------|------|-------------|
| `title` | text | Search title |
| `code` | text | Search code |
| `details` | text | Search details |
| `photographer` | text | Search photographer |
| `rating100` | numeric | User rating comparison |
| `o_counter` | numeric | O-counter comparison |
| `date` | date | Date range filter |
| `created_at` | timestamp | Creation time filter |
| `updated_at` | timestamp | Update time filter |
| `performers` | multi-select | Filter by performers (with gallery inheritance) |
| `tags` | multi-select | Filter by tags (with gallery inheritance) |
| `studios` | hierarchical | Filter by studio (with gallery inheritance) |
| `galleries` | multi-select | Filter to specific galleries |
| `organized` | boolean | Organized status |
| `resolution` | enum | Resolution filter |
| `orientation` | enum | Portrait/landscape/square |
| `favorite` | boolean | User favorites |

### Sort Options

| Sort Field | Description |
|------------|-------------|
| `title` | Alphabetical by title |
| `date` | By date field |
| `rating` | By user rating |
| `path` | By file path |
| `filesize` | By file size |
| `o_counter` | By o-counter |
| `created_at` | By creation time |
| `updated_at` | By update time |
| `random` | Random order |
| `tag_count` | By number of tags |
| `performer_count` | By number of performers |

## Frontend

### Navigation

Add "Images" to sidebar after "Galleries". Respects existing user preferences for hiding/reordering menu items.

### Images Page

**File**: `client/src/components/pages/Images.jsx`

Components:
- Grid view using existing `CardGrid` component
- Filter bar with chips for performers, tags, studios, galleries
- Sort dropdown matching Stash's options
- Search box for text search
- Pagination

### Image Card

Displays:
- Thumbnail image (via proxy endpoint)
- Title (or filename if no title)
- Resolution badge
- Rating stars (if rated)
- Favorite indicator
- Gallery indicator icon (if image belongs to a gallery)

### Lightbox Integration

Clicking an image opens the existing Lightbox component from GalleryDetail. Future enhancements will add metadata display in pillarbox/letterbox spaces.

### API Integration

```javascript
// client/src/services/api.js
findImages: async (params) => apiPost('/library/images', params),
getImage: async (id) => apiGet(`/library/images/${id}`),
getImageUrl: (imageId, type = 'thumbnail') => `/api/proxy/image/${imageId}/${type}`,
```

## Entity Detail Page Integration

### Performer, Studio, Tag Detail Pages

Add "Images" tab/section showing images associated with that entity (respecting gallery-umbrella inheritance).

- Uses `findImages` API with entity filter pre-applied
- Shows grid of thumbnails
- Clicking opens lightbox

### GalleryDetail Page

Refactor `getGalleryImages` endpoint to query Peek's database instead of Stash API directly. Continue using existing lightbox component.

## Content Restrictions

Following existing patterns:

- **Tag-based restrictions**: Images respect INCLUDE/EXCLUDE rules, including inherited gallery tags
- **Hidden entities**: Images with hidden performers/tags/studios or in hidden galleries are filtered
- **Empty entity filtering**: Soft-deleted images hidden from non-admins
- **Admin bypass**: Admins skip content restrictions but still see hidden entity filtering

## Implementation Phases

### Phase 1: Database & Sync
1. Create migration for new fields and indexes
2. Update Prisma schema
3. Update sync service for new fields
4. Update stashapp-api if needed

### Phase 2: Backend API
1. Create image proxy endpoint
2. Create images controller with CTE queries
3. Add routes
4. Refactor GalleryDetail to use local DB

### Phase 3: Frontend
1. Add Images to navigation
2. Create Images page with grid/filters/sort
3. Integrate lightbox
4. Add Images tab to entity detail pages

### Phase 4: Polish
1. Test with large datasets
2. Optimize queries if needed
3. Add any missing filter/sort options
