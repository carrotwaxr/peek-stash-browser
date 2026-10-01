/**
 * Centralized entity link generation for multi-instance support.
 *
 * When multiple Stash instances are configured, entity links include
 * the instance ID as a query parameter to disambiguate entities with
 * the same ID across different instances.
 */
import { makeCompositeKey } from "./compositeKey";
import {
  CLIP_FILTER_OPTIONS,
  type FilterOption,
  GALLERY_FILTER_OPTIONS,
  GROUP_FILTER_OPTIONS,
  IMAGE_FILTER_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  STUDIO_FILTER_OPTIONS,
  TAG_FILTER_OPTIONS,
} from "./filterConfig";
import { IMAGE_PARAM, entityParamFor } from "./urlParams";

const ENTITY_PATHS: Record<string, string> = {
  performer: "/performer",
  scene: "/scene",
  studio: "/studio",
  tag: "/tag",
  group: "/collection",
  gallery: "/gallery",
};

/**
 * Generate a path for an entity detail page.
 *
 * @param {string} entityType - Type of entity (performer, scene, studio, tag, group, gallery); an image has no page, see getImagePath
 * @param {Object|string} entity - Entity object with id and instanceId, or just the id string
 * @param {boolean} hasMultipleInstances - Whether multiple Stash instances are configured
 * @returns {string} The path to the entity detail page
 */
interface EntityLike {
  id?: string | number;
  instanceId?: string;
}

export function getEntityPath(
  entityType: string,
  entity: EntityLike | string,
  hasMultipleInstances: boolean
) {
  const basePath = ENTITY_PATHS[entityType];
  if (!basePath) {
    console.warn(`Unknown entity type: ${entityType}`);
    return "#";
  }

  const id = typeof entity === "string" ? entity : entity?.id;
  // An entity without an id has no page
  if (id == null) return "#";
  const base = `${basePath}/${id}`;

  if (
    hasMultipleInstances &&
    typeof entity !== "string" &&
    entity?.instanceId
  ) {
    return `${base}?instance=${encodeURIComponent(entity.instanceId)}`;
  }
  return base;
}

/**
 * The link to one image: images have no page of their own, so it opens the
 * Images page with the image in its viewer (the list's `image` param, the
 * image's "id:instanceId"; two servers can hold the same id, so the instance
 * is always named). "#" for an image without an id.
 *
 * @param {Object} image - Image with id and instanceId
 * @returns {string} The path of the Images page showing the image
 */
export function getImagePath(image: EntityLike): string {
  if (image.id == null) return "#";
  const key = makeCompositeKey(String(image.id), image.instanceId);
  return `/images?${IMAGE_PARAM}=${encodeURIComponent(key)}`;
}

/**
 * Adds the entity's instance to a list link when there are several servers;
 * the list page joins it with the link's entity param into "id:instance".
 */
function appendInstanceParam(
  url: string,
  entity: EntityLike,
  hasMultipleInstances: boolean
) {
  if (hasMultipleInstances && entity.instanceId) {
    return `${url}&instance=${encodeURIComponent(entity.instanceId)}`;
  }
  return url;
}

/** The list pages a card's count can open, with the filters each declares */
const LIST_PAGE_FILTERS = {
  "/scenes": SCENE_FILTER_OPTIONS,
  "/performers": PERFORMER_FILTER_OPTIONS,
  "/studios": STUDIO_FILTER_OPTIONS,
  "/tags": TAG_FILTER_OPTIONS,
  "/collections": GROUP_FILTER_OPTIONS,
  "/galleries": GALLERY_FILTER_OPTIONS,
  "/images": IMAGE_FILTER_OPTIONS,
  // The clip's own tags: a tag page's Markers statistic
  "/clips": CLIP_FILTER_OPTIONS,
} satisfies Record<string, readonly FilterOption[]>;

type ListPage = keyof typeof LIST_PAGE_FILTERS;

/** An entity type as the filter options name it (`entityType`) */
type FilterEntityType =
  | "scenes"
  | "performers"
  | "studios"
  | "tags"
  | "groups"
  | "galleries";

/**
 * The link a card's count opens: the list page filtered to one entity through
 * the page's own filter for that entity type, in the singular param the page
 * reads (`/scenes?tagId=5` for the Scenes page's `tagIds`), with the entity's
 * instance when there are several servers. Undefined when the page has no
 * filter for that type, so a count never opens an unfiltered list.
 *
 * @param listPage - The list page to open
 * @param entityType - The card's entity type, as the filter options name it
 * @param entity - The card's entity, with its instance
 * @param hasMultipleInstances - Whether multiple Stash instances are configured
 */
export function getFilteredListPath(
  listPage: ListPage,
  entityType: FilterEntityType,
  entity: EntityLike,
  hasMultipleInstances: boolean
): string | undefined {
  const options: readonly FilterOption[] = LIST_PAGE_FILTERS[listPage];
  const option = options.find(
    (each) =>
      each.type === "searchable-select" && each.entityType === entityType
  );
  if (!option || entity.id == null) return undefined;
  return appendInstanceParam(
    `${listPage}?${entityParamFor(option.key)}=${encodeURIComponent(String(entity.id))}`,
    entity,
    hasMultipleInstances
  );
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
export function getScenePathWithTime(
  scene: EntityLike | string,
  time: number,
  hasMultipleInstances: boolean
) {
  const id = typeof scene === "string" ? scene : scene?.id;
  // A scene without an id has no page
  if (id == null) return "#";
  const base = `/scene/${id}`;
  const timeParam = `t=${Math.floor(time)}`;

  if (hasMultipleInstances && typeof scene !== "string" && scene?.instanceId) {
    return `${base}?instance=${encodeURIComponent(scene.instanceId)}&${timeParam}`;
  }
  return `${base}?${timeParam}`;
}
