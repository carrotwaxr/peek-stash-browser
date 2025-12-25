# Images Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Images page that displays all images (standalone and gallery-associated) with filtering, sorting, and gallery-umbrella inheritance for metadata.

**Architecture:** Refactor existing images controller to query Peek's local SQLite database instead of Stash API. Use CTEs for efficient gallery-umbrella inheritance. Add new frontend page following the Galleries page pattern.

**Tech Stack:** TypeScript/Express backend, React frontend, SQLite with Prisma, existing CardGrid/Lightbox components.

---

## Task 1: Database Migration - Add Missing Fields

**Files:**
- Create: `server/prisma/migrations/2025XXXX_add_image_gallery_fields/migration.sql`
- Modify: `server/prisma/schema.prisma`

**Step 1: Create migration file**

Create `server/prisma/migrations/20251224100000_add_image_gallery_fields/migration.sql`:

```sql
-- Add missing fields to StashImage
ALTER TABLE "StashImage" ADD COLUMN "code" TEXT;
ALTER TABLE "StashImage" ADD COLUMN "details" TEXT;
ALTER TABLE "StashImage" ADD COLUMN "photographer" TEXT;
ALTER TABLE "StashImage" ADD COLUMN "urls" TEXT;

-- Add missing fields to StashGallery
ALTER TABLE "StashGallery" ADD COLUMN "photographer" TEXT;
ALTER TABLE "StashGallery" ADD COLUMN "urls" TEXT;

-- Performance indexes for gallery-umbrella queries
CREATE INDEX IF NOT EXISTS "ImageGallery_imageId_idx" ON "ImageGallery"("imageId");
CREATE INDEX IF NOT EXISTS "GalleryPerformer_galleryId_idx" ON "GalleryPerformer"("galleryId");
CREATE INDEX IF NOT EXISTS "GalleryTag_galleryId_idx" ON "GalleryTag"("galleryId");
CREATE INDEX IF NOT EXISTS "StashGallery_studioId_deletedAt_idx" ON "StashGallery"("studioId", "deletedAt");
CREATE INDEX IF NOT EXISTS "StashImage_title_idx" ON "StashImage"("title");
CREATE INDEX IF NOT EXISTS "StashImage_browse_idx" ON "StashImage"("deletedAt", "stashCreatedAt" DESC);
```

**Step 2: Update Prisma schema**

In `server/prisma/schema.prisma`, find the `StashImage` model and add:

```prisma
model StashImage {
  id              String    @id
  stashInstanceId String?
  title           String?
  code            String?       // NEW
  details         String?       // NEW
  photographer    String?       // NEW
  urls            String?       // NEW (JSON array)
  date            String?
  studioId        String?
  rating100       Int?
  oCounter        Int       @default(0)
  organized       Boolean   @default(false)
  filePath        String?
  width           Int?
  height          Int?
  fileSize        BigInt?
  pathThumbnail   String?
  pathPreview     String?
  pathImage       String?
  stashCreatedAt  DateTime?
  stashUpdatedAt  DateTime?
  syncedAt        DateTime  @default(now())
  deletedAt       DateTime?

  performers ImagePerformer[]
  tags       ImageTag[]
  galleries  ImageGallery[]

  @@index([studioId])
  @@index([date])
  @@index([rating100])
  @@index([stashUpdatedAt])
  @@index([deletedAt])
  @@index([title])
  @@index([deletedAt, stashCreatedAt(sort: Desc)])
}
```

Find the `StashGallery` model and add:

```prisma
model StashGallery {
  // ... existing fields ...
  photographer    String?       // NEW
  urls            String?       // NEW (JSON array)
  // ... rest of model ...
}
```

**Step 3: Run migration**

Run: `cd server && npx prisma migrate dev --name add_image_gallery_fields`

Expected: Migration applies successfully, Prisma client regenerated.

**Step 4: Commit**

```bash
git add server/prisma/migrations server/prisma/schema.prisma
git commit -m "feat: add missing image/gallery fields and performance indexes"
```

---

## Task 2: Update Sync Service - Image Fields

**Files:**
- Modify: `server/services/StashSyncService.ts:1840-1891`

**Step 1: Update processImagesBatch INSERT statement**

Find the `processImagesBatch` method around line 1840. Update the SQL INSERT to include new fields.

Change the values template from:

```typescript
return `(
  '${this.escape(image.id)}',
  ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
  ${this.escapeNullable(image.title)},
  ${this.escapeNullable(image.date)},
  // ... existing fields ...
)`;
```

To:

```typescript
return `(
  '${this.escape(image.id)}',
  ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
  ${this.escapeNullable(image.title)},
  ${this.escapeNullable(image.code)},
  ${this.escapeNullable(image.details)},
  ${this.escapeNullable(image.photographer)},
  ${this.escapeNullable(image.urls ? JSON.stringify(image.urls) : null)},
  ${this.escapeNullable(image.date)},
  // ... rest of existing fields ...
)`;
```

Update the INSERT column list to include: `code, details, photographer, urls`

Update the ON CONFLICT SET clause to include the new fields.

**Step 2: Verify sync fetches new fields**

Check that stashapp-api's `findImages` query includes `code`, `details`, `photographer`, `urls` fields. If not, this requires updating stashapp-api first.

**Step 3: Run tests**

Run: `cd server && npm test -- --grep "StashSyncService"`

Expected: Existing tests pass.

**Step 4: Commit**

```bash
git add server/services/StashSyncService.ts
git commit -m "feat: sync code, details, photographer, urls for images"
```

---

## Task 3: Update Sync Service - Gallery Fields

**Files:**
- Modify: `server/services/StashSyncService.ts` (processGalleriesBatch method)

**Step 1: Find processGalleriesBatch method**

Search for `processGalleriesBatch` in the file.

**Step 2: Update INSERT statement**

Add `photographer` and `urls` to the INSERT column list and values.

```typescript
${this.escapeNullable(gallery.photographer)},
${this.escapeNullable(gallery.urls ? JSON.stringify(gallery.urls) : null)},
```

**Step 3: Update ON CONFLICT clause**

Add the new fields to the SET clause.

**Step 4: Commit**

```bash
git add server/services/StashSyncService.ts
git commit -m "feat: sync photographer and urls for galleries"
```

---

## Task 4: Add Image Proxy Endpoint

**Files:**
- Modify: `server/controllers/proxy.ts`
- Modify: `server/routes/proxy.ts` (or wherever proxy routes are defined)

**Step 1: Add proxyImage controller function**

Add to `server/controllers/proxy.ts`:

```typescript
/**
 * Proxy image requests by image ID and type
 * GET /api/proxy/image/:imageId/:type
 * :type = "thumbnail" | "preview" | "image"
 */
export const proxyImage = async (req: Request, res: Response) => {
  const { imageId, type } = req.params;

  if (!imageId) {
    return res.status(400).json({ error: "Missing image ID" });
  }

  const validTypes = ["thumbnail", "preview", "image"];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid image type. Must be: thumbnail, preview, or image" });
  }

  // Get image from database
  const image = await prisma.stashImage.findFirst({
    where: { id: imageId, deletedAt: null },
  });

  if (!image) {
    return res.status(404).json({ error: "Image not found" });
  }

  // Get the appropriate path
  const pathMap: Record<string, string | null> = {
    thumbnail: image.pathThumbnail,
    preview: image.pathPreview,
    image: image.pathImage,
  };
  const stashPath = pathMap[type];

  if (!stashPath) {
    return res.status(404).json({ error: `Image ${type} path not available` });
  }

  let stashUrl: string;
  let apiKey: string;

  try {
    stashUrl = stashInstanceManager.getBaseUrl();
    apiKey = stashInstanceManager.getApiKey();
  } catch {
    logger.error("No Stash instance configured");
    return res.status(500).json({ error: "Stash configuration missing" });
  }

  // Acquire concurrency slot before making request
  await acquireConcurrencySlot();

  try {
    // Construct full Stash URL with API key
    const fullUrl = `${stashUrl}${stashPath}${stashPath.includes("?") ? "&" : "?"}apikey=${apiKey}`;

    logger.debug("Proxying image request", {
      imageId,
      type,
      url: fullUrl.replace(apiKey, "***"),
    });

    const urlObj = new URL(fullUrl);
    const httpModule = urlObj.protocol === "https:" ? https : http;
    const agent = getAgentForUrl(urlObj);

    const proxyReq = httpModule.get(fullUrl, { agent }, (proxyRes) => {
      if (proxyRes.headers["content-type"]) {
        res.setHeader("Content-Type", proxyRes.headers["content-type"]);
      }
      if (proxyRes.headers["content-length"]) {
        res.setHeader("Content-Length", proxyRes.headers["content-length"]);
      }
      // Cache images for 24 hours
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.status(proxyRes.statusCode || 200);
      proxyRes.pipe(res);
      proxyRes.on("end", releaseConcurrencySlot);
      proxyRes.on("error", releaseConcurrencySlot);
    });

    proxyReq.on("error", (error: Error) => {
      releaseConcurrencySlot();
      logger.error("Error proxying image", { imageId, type, error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: "Proxy request failed" });
      }
    });

    proxyReq.setTimeout(30000, () => {
      releaseConcurrencySlot();
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: "Proxy request timeout" });
      }
    });
  } catch (error) {
    releaseConcurrencySlot();
    logger.error("Error proxying image", { error });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
```

**Step 2: Add route**

Find the proxy routes file and add:

```typescript
router.get("/image/:imageId/:type", proxyImage);
```

**Step 3: Add prisma import**

Add at top of `proxy.ts`:

```typescript
import prisma from "../prisma/singleton.js";
```

**Step 4: Test manually**

Start server and test: `curl http://localhost:3000/api/proxy/image/123/thumbnail`

Expected: Returns 404 if image doesn't exist, or proxies image if it does.

**Step 5: Commit**

```bash
git add server/controllers/proxy.ts server/routes/proxy.ts
git commit -m "feat: add image proxy endpoint"
```

---

## Task 5: Refactor Images Controller - Database Queries

**Files:**
- Modify: `server/controllers/library/images.ts`

**Step 1: Add StashEntityService methods for images**

First, check if `StashEntityService` already has `getAllImages`, `getImage`, `getImagesByIds` methods. If not, add them following the pattern of `getAllGalleries`.

**Step 2: Rewrite findImages to use local database**

Replace the current implementation that queries Stash API with one that queries the local database using CTEs for gallery inheritance.

```typescript
import type { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { emptyEntityFilterService } from "../../services/EmptyEntityFilterService.js";
import { filteredEntityCacheService } from "../../services/FilteredEntityCacheService.js";
import { userRestrictionService } from "../../services/UserRestrictionService.js";
import { expandStudioIds, expandTagIds } from "../../utils/hierarchyUtils.js";
import { logger } from "../../utils/logger.js";
import { buildStashEntityUrl } from "../../utils/stashUrl.js";

// ... keep existing calculateEntityImageCount function ...

/**
 * Find images endpoint - queries local database with gallery-umbrella inheritance
 */
export const findImages = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { filter, image_filter, ids } = req.body;

    const sortField = filter?.sort || "title";
    const sortDirection = filter?.direction || "ASC";
    const page = filter?.page || 1;
    const perPage = filter?.per_page || 40;
    const searchQuery = filter?.q || "";

    // Step 1: Get all images from cache/database
    let images = await stashEntityService.getAllImages();

    if (images.length === 0) {
      logger.warn("Image cache not initialized, returning empty result");
      return res.json({
        findImages: {
          count: 0,
          images: [],
        },
      });
    }

    // Step 2: Merge with user data (ratings/favorites)
    images = await mergeImagesWithUserData(images, userId);

    // Step 3: Apply content restrictions
    const requestingUser = req.user;
    images = await userRestrictionService.filterImagesForUser(
      images,
      userId,
      requestingUser?.role === "ADMIN"
    );

    // Step 4: Apply search query
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      images = images.filter((img) => {
        const title = img.title || "";
        const details = img.details || "";
        const photographer = img.photographer || "";
        return (
          title.toLowerCase().includes(lowerQuery) ||
          details.toLowerCase().includes(lowerQuery) ||
          photographer.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Step 5: Apply filters with gallery-umbrella inheritance
    images = await applyImageFiltersWithInheritance(images, image_filter, ids);

    // Step 6: Sort
    images = sortImages(images, sortField, sortDirection);

    // Step 7: Paginate
    const total = images.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedImages = images.slice(startIndex, endIndex);

    // Step 8: Add stashUrl to each image
    const imagesWithStashUrl = paginatedImages.map((image) => ({
      ...image,
      stashUrl: buildStashEntityUrl("image", image.id),
    }));

    res.json({
      findImages: {
        count: total,
        images: imagesWithStashUrl,
      },
    });
  } catch (error) {
    logger.error("Error in findImages", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find images",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Apply image filters with gallery-umbrella inheritance
 */
async function applyImageFiltersWithInheritance(
  images: any[],
  filters: any,
  ids?: string[]
): Promise<any[]> {
  if (!filters && !ids) return images;

  let filtered = images;

  // Filter by IDs
  if (ids && Array.isArray(ids) && ids.length > 0) {
    const idSet = new Set(ids);
    filtered = filtered.filter((img) => idSet.has(img.id));
  }

  // Filter by favorite
  if (filters?.favorite !== undefined) {
    filtered = filtered.filter((img) => img.favorite === filters.favorite);
  }

  // Filter by rating100
  if (filters?.rating100) {
    const { modifier, value, value2 } = filters.rating100;
    filtered = filtered.filter((img) => {
      const rating = img.rating100 || 0;
      if (modifier === "GREATER_THAN") return rating > value;
      if (modifier === "LESS_THAN") return rating < value;
      if (modifier === "EQUALS") return rating === value;
      if (modifier === "NOT_EQUALS") return rating !== value;
      if (modifier === "BETWEEN") return rating >= value && rating <= value2;
      return true;
    });
  }

  // Filter by performers (with gallery inheritance)
  if (filters?.performers?.value) {
    const performerIds = new Set(filters.performers.value.map(String));
    filtered = filtered.filter((img) => {
      // Check direct performers
      if (img.performers?.some((p: any) => performerIds.has(String(p.id)))) {
        return true;
      }
      // Check gallery performers (inheritance)
      if (img.galleries?.some((g: any) =>
        g.performers?.some((p: any) => performerIds.has(String(p.id)))
      )) {
        return true;
      }
      return false;
    });
  }

  // Filter by tags (with gallery inheritance)
  if (filters?.tags?.value) {
    const expandedTagIds = new Set(
      await expandTagIds(
        filters.tags.value.map(String),
        filters.tags.depth ?? 0
      )
    );
    filtered = filtered.filter((img) => {
      // Check direct tags
      if (img.tags?.some((t: any) => expandedTagIds.has(String(t.id)))) {
        return true;
      }
      // Check gallery tags (inheritance)
      if (img.galleries?.some((g: any) =>
        g.tags?.some((t: any) => expandedTagIds.has(String(t.id)))
      )) {
        return true;
      }
      return false;
    });
  }

  // Filter by studios (with gallery inheritance)
  if (filters?.studios?.value) {
    const expandedStudioIds = new Set(
      await expandStudioIds(
        filters.studios.value.map(String),
        filters.studios.depth ?? 0
      )
    );
    filtered = filtered.filter((img) => {
      // Check direct studio
      if (img.studio && expandedStudioIds.has(String(img.studio.id))) {
        return true;
      }
      // Check gallery studio (inheritance)
      if (img.galleries?.some((g: any) =>
        g.studio && expandedStudioIds.has(String(g.studio.id))
      )) {
        return true;
      }
      return false;
    });
  }

  // Filter by specific galleries
  if (filters?.galleries?.value) {
    const galleryIds = new Set(filters.galleries.value.map(String));
    filtered = filtered.filter((img) =>
      img.galleries?.some((g: any) => galleryIds.has(String(g.id)))
    );
  }

  return filtered;
}

/**
 * Sort images
 */
function sortImages(images: any[], sortField: string, sortDirection: string): any[] {
  const direction = sortDirection === "DESC" ? -1 : 1;

  return images.sort((a, b) => {
    let aVal, bVal;

    switch (sortField) {
      case "title":
        aVal = (a.title || a.filePath || "").toLowerCase();
        bVal = (b.title || b.filePath || "").toLowerCase();
        break;
      case "date":
        aVal = a.date || "";
        bVal = b.date || "";
        break;
      case "rating":
      case "rating100":
        aVal = a.rating100 || 0;
        bVal = b.rating100 || 0;
        break;
      case "o_counter":
        aVal = a.oCounter || 0;
        bVal = b.oCounter || 0;
        break;
      case "filesize":
        aVal = Number(a.fileSize) || 0;
        bVal = Number(b.fileSize) || 0;
        break;
      case "path":
        aVal = (a.filePath || "").toLowerCase();
        bVal = (b.filePath || "").toLowerCase();
        break;
      case "created_at":
        aVal = a.stashCreatedAt || "";
        bVal = b.stashCreatedAt || "";
        break;
      case "updated_at":
        aVal = a.stashUpdatedAt || "";
        bVal = b.stashUpdatedAt || "";
        break;
      case "random":
        return Math.random() - 0.5;
      default:
        aVal = (a.title || "").toLowerCase();
        bVal = (b.title || "").toLowerCase();
    }

    if (aVal < bVal) return -1 * direction;
    if (aVal > bVal) return 1 * direction;
    return 0;
  });
}

/**
 * Merge images with user rating/favorite data
 */
async function mergeImagesWithUserData(images: any[], userId: number): Promise<any[]> {
  const ratings = await prisma.imageRating.findMany({ where: { userId } });

  const ratingMap = new Map(
    ratings.map((r) => [
      r.imageId,
      {
        rating: r.rating,
        rating100: r.rating,
        favorite: r.favorite,
      },
    ])
  );

  return images.map((image) => ({
    ...image,
    rating: null,
    rating100: null,
    favorite: false,
    ...ratingMap.get(image.id),
  }));
}
```

**Step 3: Add findImageById endpoint**

```typescript
/**
 * Find single image by ID
 */
export const findImageById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const image = await stashEntityService.getImage(id);

    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    // Merge with user data
    const images = await mergeImagesWithUserData([image], userId);
    const mergedImage = images[0];

    res.json(mergedImage);
  } catch (error) {
    logger.error("Error in findImageById", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to find image",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
```

**Step 4: Commit**

```bash
git add server/controllers/library/images.ts
git commit -m "refactor: images controller to use local database with gallery inheritance"
```

---

## Task 6: Add StashEntityService Image Methods

**Files:**
- Modify: `server/services/StashEntityService.ts`

**Step 1: Add getAllImages method**

Find where `getAllGalleries` is defined and add similar methods for images:

```typescript
/**
 * Get all images from cache
 */
async getAllImages(): Promise<NormalizedImage[]> {
  const cached = await prisma.stashImage.findMany({
    where: { deletedAt: null },
    include: {
      performers: { include: { performer: true } },
      tags: { include: { tag: true } },
      galleries: { include: { gallery: true } },
    },
  });
  return cached.map(this.normalizeImage.bind(this));
}

/**
 * Get single image by ID
 */
async getImage(id: string): Promise<NormalizedImage | null> {
  const cached = await prisma.stashImage.findFirst({
    where: { id, deletedAt: null },
    include: {
      performers: { include: { performer: true } },
      tags: { include: { tag: true } },
      galleries: { include: { gallery: true } },
    },
  });
  return cached ? this.normalizeImage(cached) : null;
}

/**
 * Get images by IDs
 */
async getImagesByIds(ids: string[]): Promise<NormalizedImage[]> {
  const cached = await prisma.stashImage.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: {
      performers: { include: { performer: true } },
      tags: { include: { tag: true } },
      galleries: { include: { gallery: true } },
    },
  });
  return cached.map(this.normalizeImage.bind(this));
}

/**
 * Normalize image from database to API format
 */
private normalizeImage(dbImage: any): NormalizedImage {
  return {
    id: dbImage.id,
    title: dbImage.title,
    code: dbImage.code,
    details: dbImage.details,
    photographer: dbImage.photographer,
    urls: dbImage.urls ? JSON.parse(dbImage.urls) : [],
    date: dbImage.date,
    rating100: dbImage.rating100,
    o_counter: dbImage.oCounter,
    organized: dbImage.organized,
    file_path: dbImage.filePath,
    width: dbImage.width,
    height: dbImage.height,
    file_size: dbImage.fileSize ? Number(dbImage.fileSize) : null,
    paths: {
      thumbnail: dbImage.pathThumbnail,
      preview: dbImage.pathPreview,
      image: dbImage.pathImage,
    },
    created_at: dbImage.stashCreatedAt?.toISOString(),
    updated_at: dbImage.stashUpdatedAt?.toISOString(),
    studio: dbImage.studioId ? { id: dbImage.studioId } : null,
    performers: dbImage.performers?.map((ip: any) => ({
      id: ip.performer.id,
      name: ip.performer.name,
    })) || [],
    tags: dbImage.tags?.map((it: any) => ({
      id: it.tag.id,
      name: it.tag.name,
    })) || [],
    galleries: dbImage.galleries?.map((ig: any) => ({
      id: ig.gallery.id,
      title: ig.gallery.title,
    })) || [],
  };
}
```

**Step 2: Add NormalizedImage type**

In `server/types/index.ts`, add:

```typescript
export interface NormalizedImage {
  id: string;
  title: string | null;
  code: string | null;
  details: string | null;
  photographer: string | null;
  urls: string[];
  date: string | null;
  rating100: number | null;
  o_counter: number;
  organized: boolean;
  file_path: string | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  paths: {
    thumbnail: string | null;
    preview: string | null;
    image: string | null;
  };
  created_at: string | null;
  updated_at: string | null;
  studio: { id: string } | null;
  performers: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  galleries: { id: string; title: string | null }[];
  // User data (merged)
  rating?: number | null;
  favorite?: boolean;
}
```

**Step 3: Commit**

```bash
git add server/services/StashEntityService.ts server/types/index.ts
git commit -m "feat: add image methods to StashEntityService"
```

---

## Task 7: Add Image Routes

**Files:**
- Modify: `server/routes/library/images.ts`

**Step 1: Add additional routes**

```typescript
import express from "express";
import { findImages, findImageById } from "../../controllers/library/images.js";
import { authenticateToken, requireCacheReady } from "../../middleware/auth.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// Find images (with filters, pagination, sorting)
router.post(
  "/images",
  authenticateToken,
  requireCacheReady,
  authenticated(findImages)
);

// Get single image by ID
router.get(
  "/images/:id",
  authenticateToken,
  requireCacheReady,
  authenticated(findImageById)
);

export default router;
```

**Step 2: Commit**

```bash
git add server/routes/library/images.ts
git commit -m "feat: add image routes"
```

---

## Task 8: Add Navigation Item

**Files:**
- Modify: `client/src/constants/navigation.js`

**Step 1: Add Images nav item after Galleries**

Find the `NAV_DEFINITIONS` array and add after the galleries entry:

```javascript
{
  key: "images",
  name: "Images",
  path: "/images",
  icon: "image",
  description: "Browse all images in your library",
},
```

**Step 2: Update Sidebar getCurrentPage**

In `client/src/components/ui/Sidebar.jsx`, find `getCurrentPage` function and add:

```javascript
if (path.startsWith("/images")) return "Images";
```

**Step 3: Commit**

```bash
git add client/src/constants/navigation.js client/src/components/ui/Sidebar.jsx
git commit -m "feat: add Images to navigation"
```

---

## Task 9: Create Images Page Component

**Files:**
- Create: `client/src/components/pages/Images.jsx`

**Step 1: Create the Images page**

Follow the Galleries.jsx pattern:

```jsx
import { useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { libraryApi } from "../../services/api.js";
import { ImageCard } from "../cards/index.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";

const getImages = async (query) => {
  const params = {
    filter: {
      page: query.page || 1,
      per_page: query.per_page || 24,
      sort: query.sort || "title",
      direction: query.direction || "ASC",
      q: query.q || "",
    },
    image_filter: {},
  };

  // Add filters
  if (query.performers?.length) {
    params.image_filter.performers = { value: query.performers };
  }
  if (query.tags?.length) {
    params.image_filter.tags = { value: query.tags };
  }
  if (query.studios?.length) {
    params.image_filter.studios = { value: query.studios };
  }
  if (query.galleries?.length) {
    params.image_filter.galleries = { value: query.galleries };
  }
  if (query.favorite !== undefined) {
    params.image_filter.favorite = query.favorite;
  }
  if (query.rating100) {
    params.image_filter.rating100 = query.rating100;
  }

  const result = await libraryApi.findImages(params);
  return {
    images: result?.findImages?.images || [],
    count: result?.findImages?.count || 0,
  };
};

const Images = () => {
  usePageTitle("Images");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const columns = useGridColumns("images");

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [initMessage, setInitMessage] = useState(null);

  const handleQueryChange = async (newQuery, retryCount = 0) => {
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    if (lastQuery && deepEqual(newQuery, lastQuery)) {
      return;
    }

    try {
      setIsLoading(true);
      setLastQuery(newQuery);
      setError(null);
      setInitMessage(null);
      const result = await getImages(newQuery);
      setData(result);
      setIsLoading(false);
    } catch (err) {
      if (err.isInitializing && retryCount < 60) {
        setInitMessage("Server is syncing library, please wait...");
        setTimeout(() => {
          handleQueryChange(newQuery, retryCount + 1);
        }, 5000);
        return;
      }
      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  const currentImages = data?.images || [];
  const totalCount = data?.count || 0;

  const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // TV Navigation
  const {
    isTVMode,
    _tvNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentImages,
    columns,
    onNavigate: (item) => {
      // Open lightbox instead of navigating
      // TODO: Implement lightbox opening
    },
    gridRef,
    currentPage: parseInt(searchParams.get("page")) || 1,
    totalPages,
    navigate,
    location,
  });

  useInitialFocus(pageRef, ".search-input");

  return (
    <PageLayout ref={pageRef}>
      <SyncProgressBanner />

      <div className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
        <PageHeader
          title="Images"
          count={totalCount}
          isLoading={isLoading}
        />

        <SearchControls
          entityType="image"
          onQueryChange={handleQueryChange}
          sortOptions={[
            { value: "title", label: "Title" },
            { value: "date", label: "Date" },
            { value: "rating", label: "Rating" },
            { value: "path", label: "Path" },
            { value: "filesize", label: "File Size" },
            { value: "created_at", label: "Created" },
            { value: "updated_at", label: "Updated" },
            { value: "random", label: "Random" },
          ]}
          defaultSort="title"
          filterTypes={["performers", "tags", "studios", "galleries", "favorite", "rating"]}
          {...searchControlsProps}
        />

        {initMessage && (
          <div className="text-center py-8 text-muted-foreground">
            {initMessage}
          </div>
        )}

        {error && <ErrorMessage message={error} />}

        {!error && !initMessage && (
          <div
            ref={gridRef}
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {currentImages.map((image, index) => (
              <ImageCard
                key={image.id}
                image={image}
                {...gridItemProps(index)}
              />
            ))}
          </div>
        )}

        {!isLoading && currentImages.length === 0 && !error && (
          <div className="text-center py-8 text-muted-foreground">
            No images found
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default Images;
```

**Step 2: Commit**

```bash
git add client/src/components/pages/Images.jsx
git commit -m "feat: create Images page component"
```

---

## Task 10: Create ImageCard Component

**Files:**
- Create: `client/src/components/cards/ImageCard.jsx`
- Modify: `client/src/components/cards/index.js`

**Step 1: Create ImageCard component**

```jsx
import { useState } from "react";
import { ThemedIcon } from "../icons/index.js";
import { RatingDisplay } from "../ui/index.js";

/**
 * Get proxied image URL
 */
const getImageUrl = (imageId, type = "thumbnail") => {
  return `/api/proxy/image/${imageId}/${type}`;
};

/**
 * Format resolution string
 */
const formatResolution = (width, height) => {
  if (!width || !height) return null;
  if (height >= 2160) return "4K";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  return `${width}x${height}`;
};

const ImageCard = ({ image, onClick, ...props }) => {
  const [imageError, setImageError] = useState(false);

  const handleClick = () => {
    if (onClick) {
      onClick(image);
    }
  };

  const resolution = formatResolution(image.width, image.height);
  const hasGallery = image.galleries?.length > 0;

  return (
    <div
      className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-card cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary"
      onClick={handleClick}
      tabIndex={0}
      {...props}
    >
      {/* Image */}
      {!imageError ? (
        <img
          src={getImageUrl(image.id, "thumbnail")}
          alt={image.title || "Image"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <ThemedIcon name="image" className="h-12 w-12 text-muted-foreground" />
        </div>
      )}

      {/* Overlay with info */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="text-sm font-medium text-white line-clamp-2">
            {image.title || "Untitled"}
          </h3>
        </div>
      </div>

      {/* Badges */}
      <div className="absolute top-2 left-2 flex gap-1">
        {resolution && (
          <span className="px-1.5 py-0.5 text-xs font-medium bg-black/60 text-white rounded">
            {resolution}
          </span>
        )}
        {hasGallery && (
          <span className="px-1.5 py-0.5 bg-black/60 text-white rounded">
            <ThemedIcon name="gallery-vertical" className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* Favorite indicator */}
      {image.favorite && (
        <div className="absolute top-2 right-2">
          <ThemedIcon name="heart" className="h-4 w-4 text-red-500 fill-red-500" />
        </div>
      )}

      {/* Rating */}
      {image.rating100 > 0 && (
        <div className="absolute bottom-2 right-2">
          <RatingDisplay rating={image.rating100} size="sm" />
        </div>
      )}
    </div>
  );
};

export default ImageCard;
```

**Step 2: Export from index**

Add to `client/src/components/cards/index.js`:

```javascript
export { default as ImageCard } from "./ImageCard.jsx";
```

**Step 3: Commit**

```bash
git add client/src/components/cards/ImageCard.jsx client/src/components/cards/index.js
git commit -m "feat: create ImageCard component"
```

---

## Task 11: Add Route to App

**Files:**
- Modify: `client/src/App.jsx`

**Step 1: Import Images page**

Add import:

```javascript
import Images from "./components/pages/Images.jsx";
```

**Step 2: Add route**

Find where routes are defined and add after Galleries:

```jsx
<Route path="/images" element={<Images />} />
```

**Step 3: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: add Images route to App"
```

---

## Task 12: Integrate Lightbox with Images Page

**Files:**
- Modify: `client/src/components/pages/Images.jsx`

**Step 1: Import Lightbox**

Check how GalleryDetail uses Lightbox and import the same component.

**Step 2: Add lightbox state**

```jsx
const [lightboxOpen, setLightboxOpen] = useState(false);
const [lightboxIndex, setLightboxIndex] = useState(0);

const handleImageClick = (image) => {
  const index = currentImages.findIndex((img) => img.id === image.id);
  setLightboxIndex(index);
  setLightboxOpen(true);
};
```

**Step 3: Add Lightbox component**

```jsx
{lightboxOpen && (
  <Lightbox
    images={currentImages.map((img) => ({
      id: img.id,
      src: getImageUrl(img.id, "image"),
      thumbnail: getImageUrl(img.id, "thumbnail"),
      title: img.title,
    }))}
    initialIndex={lightboxIndex}
    onClose={() => setLightboxOpen(false)}
  />
)}
```

**Step 4: Pass onClick to ImageCard**

```jsx
<ImageCard
  key={image.id}
  image={image}
  onClick={handleImageClick}
  {...gridItemProps(index)}
/>
```

**Step 5: Commit**

```bash
git add client/src/components/pages/Images.jsx
git commit -m "feat: integrate lightbox with Images page"
```

---

## Task 13: Refactor GalleryDetail to Use Local Database

**Files:**
- Modify: `server/controllers/library/galleries.ts:600-669`

**Step 1: Update getGalleryImages**

Replace the Stash API query with a local database query:

```typescript
export const getGalleryImages = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { galleryId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Query images from local database
    const images = await prisma.stashImage.findMany({
      where: {
        deletedAt: null,
        galleries: {
          some: { galleryId },
        },
      },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { filePath: "asc" },
    });

    // Transform to API format
    const transformedImages = images.map((image) => ({
      id: image.id,
      title: image.title,
      paths: {
        thumbnail: `/api/proxy/image/${image.id}/thumbnail`,
        preview: `/api/proxy/image/${image.id}/preview`,
        image: `/api/proxy/image/${image.id}/image`,
      },
      width: image.width,
      height: image.height,
      rating100: image.rating100,
      o_counter: image.oCounter,
      performers: image.performers.map((ip) => ({
        id: ip.performer.id,
        name: ip.performer.name,
      })),
      tags: image.tags.map((it) => ({
        id: it.tag.id,
        name: it.tag.name,
      })),
    }));

    // Merge with user data
    const mergedImages = await mergeImagesWithUserData(transformedImages, userId);

    res.json({
      images: mergedImages,
      count: mergedImages.length,
    });
  } catch (error) {
    logger.error("Error fetching gallery images", {
      galleryId: req.params.galleryId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({
      error: "Failed to fetch gallery images",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
```

**Step 2: Commit**

```bash
git add server/controllers/library/galleries.ts
git commit -m "refactor: GalleryDetail images to use local database"
```

---

## Task 14: Add Images Tab to Entity Detail Pages

**Files:**
- Modify: `client/src/components/pages/PerformerDetail.jsx`
- Modify: `client/src/components/pages/StudioDetail.jsx`
- Modify: `client/src/components/pages/TagDetail.jsx`

**Step 1: Check existing tab implementation**

Look at how Galleries tab is implemented on these pages.

**Step 2: Add Images tab**

Follow the same pattern - add "Images" to the tabs array and render an images grid when that tab is selected, using the same `findImages` API with the appropriate entity filter.

**Step 3: Commit**

```bash
git add client/src/components/pages/PerformerDetail.jsx client/src/components/pages/StudioDetail.jsx client/src/components/pages/TagDetail.jsx
git commit -m "feat: add Images tab to entity detail pages"
```

---

## Task 15: Test and Verify

**Step 1: Run server tests**

Run: `cd server && npm test`

Expected: All tests pass.

**Step 2: Run client build**

Run: `cd client && npm run build`

Expected: Build succeeds with no errors.

**Step 3: Run linting**

Run: `cd server && npm run lint && cd ../client && npm run lint`

Expected: No linting errors.

**Step 4: Manual testing**

1. Start the server and client
2. Navigate to Images page
3. Verify images load
4. Test filters (performers, tags, studios, galleries)
5. Test sorting options
6. Click an image to verify lightbox opens
7. Navigate to Performer/Studio/Tag detail pages
8. Verify Images tab appears and works

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and testing"
```

---

## Summary

This plan implements the Images page feature in 15 tasks:

1. Database migration for new fields
2. Sync service update for images
3. Sync service update for galleries
4. Image proxy endpoint
5. Images controller refactor
6. StashEntityService image methods
7. Image routes
8. Navigation item
9. Images page component
10. ImageCard component
11. App route
12. Lightbox integration
13. GalleryDetail refactor
14. Entity detail page tabs
15. Testing and verification

Each task is a small, focused change that can be completed and committed independently.
