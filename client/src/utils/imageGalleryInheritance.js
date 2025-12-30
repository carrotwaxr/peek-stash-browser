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
 * Get effective metadata for an image, inheriting from galleries where needed.
 *
 * Inheritance rules:
 * - Performers: Merge image performers with gallery performers (deduplicated)
 * - Tags: Merge image tags with gallery tags (deduplicated)
 * - Studio: Use image studio if set, otherwise inherit from first gallery with a studio
 *
 * @param {Object} image - Image object with optional galleries array
 * @returns {Object} Object containing effectivePerformers, effectiveTags, effectiveStudio
 */
export function getEffectiveImageMetadata(image) {
  if (!image) {
    return {
      effectivePerformers: [],
      effectiveTags: [],
      effectiveStudio: null,
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

  return {
    effectivePerformers,
    effectiveTags,
    effectiveStudio,
  };
}

/**
 * Enrich an image object with effective metadata fields.
 * Adds effectivePerformers, effectiveTags, effectiveStudio to the image.
 *
 * @param {Object} image - Image object
 * @returns {Object} Image with added effective* fields
 */
export function enrichImageWithInheritedMetadata(image) {
  if (!image) return image;

  const { effectivePerformers, effectiveTags, effectiveStudio } =
    getEffectiveImageMetadata(image);

  return {
    ...image,
    effectivePerformers,
    effectiveTags,
    effectiveStudio,
  };
}
