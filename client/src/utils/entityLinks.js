/**
 * Centralized entity link generation for multi-instance support.
 *
 * When multiple Stash instances are configured, entity links include
 * the instance ID as a query parameter to disambiguate entities with
 * the same ID across different instances.
 */

const ENTITY_PATHS = {
  performer: '/performer',
  scene: '/scene',
  studio: '/studio',
  tag: '/tag',
  group: '/collection',
  gallery: '/gallery',
  image: '/image',
};

/**
 * Generate a path for an entity detail page.
 *
 * @param {string} entityType - Type of entity (performer, scene, studio, tag, group, gallery, image)
 * @param {Object|string} entity - Entity object with id and instanceId, or just the id string
 * @param {boolean} hasMultipleInstances - Whether multiple Stash instances are configured
 * @returns {string} The path to the entity detail page
 */
export function getEntityPath(entityType, entity, hasMultipleInstances) {
  const basePath = ENTITY_PATHS[entityType];
  if (!basePath) {
    console.warn(`Unknown entity type: ${entityType}`);
    return '#';
  }

  const id = entity?.id || entity;
  const base = `${basePath}/${id}`;

  if (hasMultipleInstances && entity?.instanceId) {
    return `${base}?instance=${encodeURIComponent(entity.instanceId)}`;
  }
  return base;
}

/**
 * Generate a path for a scene detail page with a timestamp.
 * Used for clips and resume points.
 *
 * @param {Object|string} scene - Scene object with id and instanceId, or just the id string
 * @param {number} time - Timestamp in seconds
 * @param {boolean} hasMultipleInstances - Whether multiple Stash instances are configured
 * @returns {string} The path to the scene at the specified time
 */
/**
 * Append instance query parameter to a filter URL for multi-instance disambiguation.
 * Used by card indicator click handlers that navigate to filtered list views
 * (e.g., /scenes?performerId=2&instance=abc-123).
 *
 * @param {string} url - Base URL with existing query params (e.g., "/scenes?performerId=2")
 * @param {Object} entity - Entity object with instanceId
 * @param {boolean} hasMultipleInstances - Whether multiple Stash instances are configured
 * @returns {string} URL with instance param appended if needed
 */
export function appendInstanceParam(url, entity, hasMultipleInstances) {
  if (hasMultipleInstances && entity?.instanceId) {
    return `${url}&instance=${encodeURIComponent(entity.instanceId)}`;
  }
  return url;
}

export function getScenePathWithTime(scene, time, hasMultipleInstances) {
  const id = scene?.id || scene;
  const base = `/scene/${id}`;
  const timeParam = `t=${Math.floor(time)}`;

  if (hasMultipleInstances && scene?.instanceId) {
    return `${base}?instance=${encodeURIComponent(scene.instanceId)}&${timeParam}`;
  }
  return `${base}?${timeParam}`;
}
