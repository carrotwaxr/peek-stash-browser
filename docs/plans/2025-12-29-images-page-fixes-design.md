# Images Page Fixes Design

## Overview

Fixes and enhancements for the Images page feature discovered during testing.

## Issues Identified

| # | Issue | Root Cause | Fix Type |
|---|-------|-----------|----------|
| 1 | Lightbox doesn't load full-size image | Images.jsx maps to `src` but Lightbox expects `paths.image` | Bug fix |
| 2 | Favorite not persisting for images | API exists but need to verify call is made correctly | Bug fix |
| 3 | O Counter not clickable on ImageCard | `CardRatingRow` only allows interactive O counter for scenes | Feature add |
| 4 | O Counter missing from Lightbox | Lightbox doesn't have O counter controls | Feature add |
| 5 | Image view history | New feature - track when images are viewed in lightbox | Feature add |

## Fix Details

### Fix 1: Lightbox Full-Size Image Not Loading

**Problem:** In `Images.jsx` line 167-176, images are mapped with `src` property but Lightbox expects `paths.image`:

```javascript
// Current (wrong)
images={currentImages.map((img) => ({
  src: img.paths?.image || `/api/proxy/image/${img.id}/image`,
  ...
}))}

// Lightbox expects (line 214)
const imageSrc = currentImage?.paths?.image || currentImage?.paths?.preview;
```

**Fix:** Change the mapping to use `paths` object structure that Lightbox expects.

### Fix 2: Favorite Not Persisting

**Problem:** The backend code is correct - `ImageRating` stores per-user favorites. Need to verify the Lightbox API call succeeds and data refreshes properly.

**Investigation:** Check if `libraryApi.updateFavorite("image", ...)` is called correctly and if Images page state updates after Lightbox interaction.

### Fix 3: O Counter on ImageCard (Clickable)

**Current state:** `CardRatingRow` only allows interactive O counter for scenes (line 511: `const isScene = entityType === "scene"`).

**Required changes:**
1. Create `ImageViewHistory` model in schema (similar to `WatchHistory`)
2. Add `incrementImageOCounter` endpoint in a new `imageViewHistory.ts` controller
3. Update `CardRatingRow` to allow interactive O counter for images
4. Pass `initialOCounter` to ImageCard's `ratingControlsProps`

### Fix 4: O Counter in Lightbox

**Current state:** Lightbox has Rating and Favorite controls but no O Counter.

**Required changes:**
1. Add `OCounterButton` component to Lightbox controls
2. Wire up the increment API call
3. Update parent state via `onImagesUpdate` callback

### Fix 5: Image View History

**New feature:** Track when images are viewed in lightbox, similar to scene play history.

**Schema addition:**
```prisma
model ImageViewHistory {
  id        Int      @id @default(autoincrement())
  userId    Int
  imageId   String

  viewCount   Int  @default(0)
  viewHistory Json @default("[]") // Array of timestamps
  oCount      Int  @default(0)
  oHistory    Json @default("[]")

  lastViewedAt DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, imageId])
  @@index([userId])
  @@index([imageId])
}
```

**Behavior:**
- `viewCount`/`viewHistory`: Incremented when image is viewed in Lightbox (automatic)
- `oCount`/`oHistory`: Incremented when user clicks O counter (manual)
- Optional sync to Stash for O counter if user has `syncToStash` enabled

## Data Flow

### Per-User Data Model
All image interaction data (rating, favorite, O counter, view history) is stored per-user in Peek:
- `ImageRating`: rating, favorite (existing)
- `ImageViewHistory`: viewCount, viewHistory, oCount, oHistory (new)

### Stash Sync (Optional)
When user has `syncToStash` enabled:
- Rating: Syncs to Stash via `imageUpdate`
- O Counter: Syncs to Stash via `imageIncrementO`
- Favorite: Peek-only (Stash doesn't support favorite for images)
- View History: Peek-only

## Files to Modify

### Backend
- `server/prisma/schema.prisma` - Add ImageViewHistory model
- `server/controllers/imageViewHistory.ts` - New controller for O counter and view tracking
- `server/routes/imageViewHistory.ts` - New routes
- `server/routes/index.ts` - Register new routes

### Frontend
- `client/src/components/pages/Images.jsx` - Fix Lightbox image mapping
- `client/src/components/ui/Lightbox.jsx` - Add O counter control
- `client/src/components/ui/CardComponents.jsx` - Allow interactive O counter for images
- `client/src/components/cards/ImageCard.jsx` - Pass O counter to ratingControlsProps
- `client/src/services/api.js` - Add image O counter API methods
