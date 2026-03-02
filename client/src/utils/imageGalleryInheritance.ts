/**
 * Utility functions for inheriting metadata from galleries to images.
 * Images can inherit performers, tags, and studio from their parent galleries
 * when the image itself doesn't have those properties set.
 */

/**
 * Merge unique entities by ID, preferring entities from the first array
 * @param {Array} primary - Primary entities (from image itself)
 * @param {Array} inherited - Inherited entities (from galleries)
 * @returns {Array} Merged array with unique entities by ID
 */
function mergeEntitiesById(primary = [], inherited = []) {
  const seen = new Set();
  const result = [];

  // Add primary entities first
  for (const entity of primary) {
    if (entity?.id && !seen.has(entity.id)) {
      seen.add(entity.id);
      result.push(entity);
    }
  }

  // Add inherited entities that aren't already present
  for (const entity of inherited) {
    if (entity?.id && !seen.has(entity.id)) {
      seen.add(entity.id);
      result.push(entity);
    }
  }

  return result;
}

/**
 * Get inherited performers from all galleries
 * @param {Array} galleries - Array of gallery objects
 * @returns {Array} All performers from galleries (deduplicated)
 */
function getInheritedPerformers(galleries = []) {
  const allPerformers = [];
  for (const gallery of galleries) {
    if (gallery?.performers) {
      allPerformers.push(...gallery.performers);
    }
  }
  return mergeEntitiesById([], allPerformers);
}

/**
 * Get inherited tags from all galleries
 * @param {Array} galleries - Array of gallery objects
 * @returns {Array} All tags from galleries (deduplicated)
 */
function getInheritedTags(galleries = []) {
  const allTags = [];
  for (const gallery of galleries) {
    if (gallery?.tags) {
      allTags.push(...gallery.tags);
    }
  }
  return mergeEntitiesById([], allTags);
}

/**
 * Get inherited studio from galleries (first gallery's studio wins)
 * @param {Array} galleries - Array of gallery objects
 * @returns {Object|null} Studio object or null
 */
function getInheritedStudio(galleries = []) {
  for (const gallery of galleries) {
    if (gallery?.studio) {
      return gallery.studio;
    }
    // Some galleries store studioId instead of studio object
    if (gallery?.studioId) {
      return { id: gallery.studioId, name: gallery.studioName || null };
    }
  }
  return null;
}

/**
 * Get inherited date from galleries (first gallery's date wins)
 * @param {Array} galleries - Array of gallery objects
 * @returns {string|null} Date string or null
 */
function getInheritedDate(galleries = []) {
  for (const gallery of galleries) {
    if (gallery?.date) {
      return gallery.date;
    }
  }
  return null;
}

/**
 * Get inherited details from galleries (first gallery's details wins)
 * @param {Array} galleries - Array of gallery objects
 * @returns {string|null} Details string or null
 */
function getInheritedDetails(galleries = []) {
  for (const gallery of galleries) {
    if (gallery?.details) {
      return gallery.details;
    }
  }
  return null;
}

/**
 * Get inherited photographer from galleries (first gallery's photographer wins)
 * @param {Array} galleries - Array of gallery objects
 * @returns {string|null} Photographer string or null
 */
function getInheritedPhotographer(galleries = []) {
  for (const gallery of galleries) {
    if (gallery?.photographer) {
      return gallery.photographer;
    }
  }
  return null;
}

/**
 * Merge URLs from image and galleries (deduplicated)
 * @param {Array} imageUrls - URLs from image itself
 * @param {Array} galleries - Array of gallery objects
 * @returns {Array} Merged array of unique URLs
 */
function mergeUrls(imageUrls = [], galleries = []) {
  const seen = new Set();
  const result = [];

  // Add image URLs first
  for (const url of imageUrls) {
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }

  // Add gallery URLs
  for (const gallery of galleries) {
    for (const url of gallery?.urls || []) {
      if (url && !seen.has(url)) {
        seen.add(url);
        result.push(url);
      }
    }
  }

  return result;
}

/**
 * Get effective metadata for an image, inheriting from galleries where needed.
 *
 * Inheritance rules:
 * - Performers: Merge image performers with gallery performers (deduplicated)
 * - Tags: Merge image tags with gallery tags (deduplicated)
 * - Studio: Use image studio if set, otherwise inherit from first gallery with a studio
 * - Date: Use image date if set, otherwise inherit from first gallery with a date
 * - Details: Use image details if set, otherwise inherit from first gallery with details
 * - Photographer: Use image photographer if set, otherwise inherit from first gallery with photographer
 * - URLs: Merge image URLs with gallery URLs (deduplicated)
 *
 * @param {Object} image - Image object with optional galleries array
 * @returns {Object} Object containing effective metadata fields
 */
export function getEffectiveImageMetadata(image) {
  if (!image) {
    return {
      effectivePerformers: [],
      effectiveTags: [],
      effectiveStudio: null,
      effectiveDate: null,
      effectiveDetails: null,
      effectivePhotographer: null,
      effectiveUrls: [],
    };
  }

  const galleries = image.galleries || [];

  // Merge performers: image's own + inherited from galleries
  const effectivePerformers = mergeEntitiesById(
    image.performers || [],
    getInheritedPerformers(galleries)
  );

  // Merge tags: image's own + inherited from galleries
  const effectiveTags = mergeEntitiesById(
    image.tags || [],
    getInheritedTags(galleries)
  );

  // Studio: prefer image's own, fallback to gallery's
  const effectiveStudio = image.studio || getInheritedStudio(galleries);

  // Date: prefer image's own, fallback to gallery's
  const effectiveDate = image.date || getInheritedDate(galleries);

  // Details: prefer image's own, fallback to gallery's
  const effectiveDetails = image.details || getInheritedDetails(galleries);

  // Photographer: prefer image's own, fallback to gallery's
  const effectivePhotographer = image.photographer || getInheritedPhotographer(galleries);

  // URLs: merge image URLs with gallery URLs
  const effectiveUrls = mergeUrls(image.urls || [], galleries);

  return {
    effectivePerformers,
    effectiveTags,
    effectiveStudio,
    effectiveDate,
    effectiveDetails,
    effectivePhotographer,
    effectiveUrls,
  };
}

/**
 * Enrich an image object with effective metadata fields.
 * Adds all effective* fields to the image.
 *
 * @param {Object} image - Image object
 * @returns {Object} Image with added effective* fields
 */
export function enrichImageWithInheritedMetadata(image) {
  if (!image) return image;

  const {
    effectivePerformers,
    effectiveTags,
    effectiveStudio,
    effectiveDate,
    effectiveDetails,
    effectivePhotographer,
    effectiveUrls,
  } = getEffectiveImageMetadata(image);

  return {
    ...image,
    effectivePerformers,
    effectiveTags,
    effectiveStudio,
    effectiveDate,
    effectiveDetails,
    effectivePhotographer,
    effectiveUrls,
  };
}

/**
 * Get image title with fallback chain: title → filename from filePath → Image {id}
 * @param {Object} image - Image object
 * @returns {string|null} Title string or null
 */
export function getImageTitle(image) {
  if (image?.title) return image.title;
  if (image?.filePath) {
    // Extract filename from path (handles both / and \ separators)
    const parts = image.filePath.split(/[\\/]/);
    return parts[parts.length - 1];
  }
  return image?.id ? `Image ${image.id}` : null;
}
