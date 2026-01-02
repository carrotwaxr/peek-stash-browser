# Image Gallery Inheritance

**Branch:** `feature/image-gallery-inheritance`
**Status:** Design Complete
**Complexity:** Medium

---

## Problem Statement

Images in Stash can exist within Galleries, and in many workflows the Gallery serves as the "container" with metadata that logically applies to all its images. For example:
- A Gallery titled "Beach Shoot 2024" has performers, tags, studio, date, photographer
- The individual images inside have no metadata — just filenames

Currently, Peek stores Images with only their directly-assigned metadata. This means:
- Images with no direct metadata appear "empty" in the UI
- Filtering by performer/tag/studio misses images that should match via their Gallery
- Content restrictions don't cascade properly from Gallery metadata to Images

**Goal:** During sync, inherit metadata from Gallery to Image when the Image has none.

---

## Solution Overview

**Inheritance Rules:**

During sync, for each Image in a Gallery, copy these fields from Gallery → Image **only if the Image has none**:

| Field | Inherit? | Notes |
|-------|----------|-------|
| Performers | Yes | Copy Gallery's performers if Image has no performers |
| Tags | Yes | Copy Gallery's tags if Image has no tags |
| Studio | Yes | Copy Gallery's studio if Image has no studio |
| Date | Yes | Copy Gallery's date if Image has no date |
| Photographer | Yes | Copy Gallery's photographer if Image has no photographer |
| Details | Yes | Copy Gallery's details if Image has no details |
| Title | **No** | Each image keeps its own name |

**When inheritance happens:**
- During initial full sync
- During incremental sync when an Image or its Gallery is updated
- NOT at query time — this is a denormalization at sync time

**Storage approach:**
- Inherited values are stored directly on the `StashImage` record
- No separate "inherited" flag — we treat them as the image's effective values
- If user later adds metadata directly in Stash, next sync overwrites with direct values

---

## Implementation Details

### File: `server/services/StashSyncService.ts`

The sync service already processes Images. We need to add a post-processing step after Images are synced but Galleries are available.

```typescript
// After syncing images, apply gallery inheritance
async function applyGalleryInheritance(images: StashImage[], galleries: Map<string, StashGallery>): Promise<void> {
  for (const image of images) {
    // Get galleries this image belongs to (via ImageGallery junction)
    const imageGalleries = await prisma.imageGallery.findMany({
      where: { imageId: image.id },
      include: { gallery: true }
    });

    if (imageGalleries.length === 0) continue;

    // Use first gallery for inheritance (images rarely span multiple galleries)
    const gallery = imageGalleries[0].gallery;

    const updates: Partial<StashImage> = {};

    // Inherit scalar fields if image has none
    if (!image.studioId && gallery.studioId) updates.studioId = gallery.studioId;
    if (!image.date && gallery.date) updates.date = gallery.date;
    if (!image.photographer && gallery.photographer) updates.photographer = gallery.photographer;
    if (!image.details && gallery.details) updates.details = gallery.details;

    // Apply scalar updates
    if (Object.keys(updates).length > 0) {
      await prisma.stashImage.update({ where: { id: image.id }, data: updates });
    }

    // Inherit performers if image has none
    const imagePerformers = await prisma.imagePerformer.count({ where: { imageId: image.id } });
    if (imagePerformers === 0) {
      const galleryPerformers = await prisma.galleryPerformer.findMany({ where: { galleryId: gallery.id } });
      await prisma.imagePerformer.createMany({
        data: galleryPerformers.map(gp => ({ imageId: image.id, performerId: gp.performerId })),
        skipDuplicates: true
      });
    }

    // Inherit tags if image has none
    const imageTags = await prisma.imageTag.count({ where: { imageId: image.id } });
    if (imageTags === 0) {
      const galleryTags = await prisma.galleryTag.findMany({ where: { galleryId: gallery.id } });
      await prisma.imageTag.createMany({
        data: galleryTags.map(gt => ({ imageId: image.id, tagId: gt.tagId })),
        skipDuplicates: true
      });
    }
  }
}
```

**Sync order matters:** Galleries must be synced before Images, or inheritance must run as a separate pass after both are complete.

---

## Testing & Acceptance Criteria

### Manual Testing

1. **Basic inheritance:**
   - In Stash, create a Gallery with performers, tags, studio, date, photographer, details
   - Add images to the Gallery that have no metadata
   - Run Peek sync
   - Verify images now show the Gallery's performers, tags, studio, date, photographer, details
   - Verify image titles are NOT overwritten (each keeps its filename/title)

2. **Partial inheritance:**
   - In Stash, create an Image with its own performer but no tags
   - Add it to a Gallery that has both performers and tags
   - Run sync
   - Verify Image keeps its own performer (not overwritten)
   - Verify Image inherits Gallery's tags

3. **Filtering works:**
   - Filter images by a performer that's only on the Gallery (not directly on images)
   - Verify inherited images appear in results

4. **Restriction cascade:**
   - Create a Gallery with a restricted tag
   - Add images with no direct tags
   - Verify images inherit the tag and are properly restricted

5. **Re-sync behavior:**
   - Add metadata directly to an Image in Stash
   - Run sync
   - Verify direct metadata overwrites previously inherited values

### Edge Cases

- Image in multiple galleries (use first gallery — rare case)
- Image not in any gallery (no inheritance, keep as-is)
- Gallery with no metadata (nothing to inherit)

---

## Files Changed

- `server/services/StashSyncService.ts` — Add `applyGalleryInheritance()` function, call after image sync

---

## Related Documentation

- [Technical Overview](../development/technical-overview.md) — Documents Image Gallery Inheritance under "Pseudo-Relationships"
