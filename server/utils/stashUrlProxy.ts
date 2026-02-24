/**
 * URL Proxy Utilities
 *
 * Handles converting Stash URLs to Peek proxy URLs to avoid exposing API keys
 * to the client. All Stash image/asset URLs are rewritten to go through Peek's
 * proxy endpoint.
 */
import { logger } from "./logger.js";

/**
 * Structural constraint for entities with image_path (performers, studios, tags).
 * Only constrains the fields actually accessed by transform functions.
 * No index signature — concrete interfaces (PerformerRef, StudioRef, etc.)
 * don't have index signatures, so requiring one here would break compatibility.
 */
type HasImagePath = {
  image_path?: string | null;
  tags?: Array<{ image_path?: string | null }>;
};

/**
 * Structural constraint for group-like objects.
 * Constrained to fields actually accessed by `transformGroup`.
 */
type GroupLike = {
  front_image_path?: string | null;
  back_image_path?: string | null;
  studio?: HasImagePath | null;
  tags?: Array<{ image_path?: string | null }>;
};

/**
 * Structural constraint for scene-like objects.
 * Constrained to fields actually accessed by `transformScene`.
 * `paths` is typed as `object` because `ScenePaths` is a concrete interface
 * without an index signature; `Object.entries()` accepts `{}` via its second overload.
 */
type SceneLike = {
  paths?: object;
  sceneStreams?: Array<{ url: string; mime_type?: string | null; label?: string | null }>;
  performers?: Array<HasImagePath>;
  tags?: Array<{ image_path?: string | null }>;
  studio?: HasImagePath | null;
  groups?: Array<{ group?: GroupLike; scene_index?: number | null }>;
};

/**
 * Convert Stash URLs to Peek proxy URLs to avoid exposing API keys
 * Original: http://stash:9999/image/123?foo=bar
 * Proxied: /api/proxy/stash?path=/image/123?foo=bar
 */
export const convertToProxyUrl = (url: string): string => {
  try {
    // Skip null, undefined, or empty values
    if (!url || typeof url !== "string" || url.trim() === "") {
      return url;
    }

    // Skip URLs that are already proxy URLs (relative paths starting with /api/proxy)
    if (url.startsWith("/api/proxy")) {
      return url;
    }

    const urlObj = new URL(url);

    // Extract the path and query string from the Stash URL
    const pathWithQuery = urlObj.pathname + urlObj.search;

    // Construct Peek proxy URL
    // This assumes Peek is accessed via the same host as the client
    // The client will use relative URLs which work in both dev and production
    const proxyUrl = `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;

    return proxyUrl;
  } catch (urlError) {
    logger.error(`Error converting URL to proxy: ${url}`, { error: urlError });
    return url; // Return original URL if parsing fails
  }
};

// Alias for backward compatibility
export const appendApiKeyToUrl = convertToProxyUrl;

/**
 * Transform performer to add API key to image_path
 * Works with both full Performer objects and nested PerformerCompact/PerformerFull
 */
export const transformPerformer = <T extends HasImagePath>(
  performer: T
): T => {
  try {
    const mutated = {
      ...performer,
      image_path: performer.image_path
        ? appendApiKeyToUrl(performer.image_path)
        : performer.image_path,
    } as T;

    // Transform nested tags
    if (performer.tags && Array.isArray(performer.tags)) {
      mutated.tags = performer.tags.map((t: { image_path?: string | null }) => ({
        ...t,
        image_path: t.image_path
          ? appendApiKeyToUrl(t.image_path)
          : t.image_path,
      }));
    }

    return mutated;
  } catch (error) {
    logger.error("Error transforming performer", { error });
    return performer;
  }
};

/**
 * Transform studio to add API key to image_path
 * Works with both full Studio objects and nested StudioCompact/StudioFull
 */
export const transformStudio = <T extends HasImagePath>(studio: T): T => {
  try {
    const mutated = {
      ...studio,
      image_path: studio.image_path
        ? appendApiKeyToUrl(studio.image_path)
        : studio.image_path,
    } as T;

    // Transform nested tags
    if (studio.tags && Array.isArray(studio.tags)) {
      mutated.tags = studio.tags.map((t: { image_path?: string | null }) => ({
        ...t,
        image_path: t.image_path
          ? appendApiKeyToUrl(t.image_path)
          : t.image_path,
      }));
    }

    return mutated;
  } catch (error) {
    logger.error("Error transforming studio", { error });
    return studio;
  }
};

/**
 * Transform tag to add API key to image_path
 * Works with both full Tag objects and nested NestedTag
 */
export const transformTag = <T extends HasImagePath>(tag: T): T => {
  try {
    return {
      ...tag,
      image_path: tag.image_path
        ? appendApiKeyToUrl(tag.image_path)
        : tag.image_path,
    } as T;
  } catch (error) {
    logger.error("Error transforming tag", { error });
    return tag;
  }
};

/**
 * Strip API key from a Stash URL
 * Stash includes apikey in query params, we don't want to expose this to the client
 */
const stripApiKeyFromUrl = (url: string): string => {
  try {
    if (!url || typeof url !== "string") return url;

    const urlObj = new URL(url);
    urlObj.searchParams.delete("apikey");

    return urlObj.toString();
  } catch {
    // If URL parsing fails, try simple regex removal
    return url.replace(/[?&]apikey=[^&]+/gi, "");
  }
};

/**
 * Transform complete scene object to add API keys to all image/video URLs
 * Works with both full Scene objects and compact Scene variants
 */
export const transformScene = <T extends SceneLike>(scene: T): T => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutated: any = { ...scene };

    // Transform paths object if present
    if (scene.paths) {
      mutated.paths = Object.entries(scene.paths).reduce(
        (acc, [key, val]) => {
          acc[key] = appendApiKeyToUrl(val as string);
          return acc;
        },
        {} as Record<string, string>
      );
    }

    // Transform sceneStreams to strip API keys from URLs
    // The client will use Peek's proxy endpoint which will re-add the API key
    if (
      scene.sceneStreams &&
      Array.isArray(scene.sceneStreams) &&
      scene.sceneStreams.length > 0
    ) {
      mutated.sceneStreams = scene.sceneStreams.map(
        (stream: { url: string; mime_type?: string | null; label?: string | null }) => ({
          ...stream,
          url: stripApiKeyFromUrl(stream.url),
        })
      );
    }

    // Transform performers to add API key to image_path
    if (scene.performers && Array.isArray(scene.performers)) {
      mutated.performers = scene.performers.map((p: HasImagePath) =>
        transformPerformer(p)
      );
    }

    // Transform tags to add API key to image_path
    if (scene.tags && Array.isArray(scene.tags)) {
      mutated.tags = scene.tags.map((t: { image_path?: string | null }) =>
        transformTag(t)
      );
    }

    // Transform studio to add API key to image_path
    if (scene.studio) {
      mutated.studio = transformStudio(scene.studio);
    }

    // Transform groups - flatten nested structure and add API keys to images
    if (scene.groups && Array.isArray(scene.groups)) {
      mutated.groups = scene.groups.map((g) => {
        // Stash returns groups as: { group: { id, name, ... }, scene_index: 2 }
        // We need to flatten and transform, preserving scene_index
        const group = "group" in g ? g.group : g;
        const sceneIndex = "scene_index" in g ? g.scene_index : undefined;
        return {
          ...transformGroup(group as GroupLike),
          ...(sceneIndex !== undefined && { scene_index: sceneIndex }),
        };
      });
    }

    return mutated;
  } catch (error) {
    logger.error("Error transforming scene", { error });
    return scene; // Return original scene if transformation fails
  }
};

/**
 * Transform group to add API keys to image URLs
 * Works with both full Group objects and nested NestedGroup
 */
export const transformGroup = <T extends GroupLike>(group: T): T => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutated: any = { ...group };

    // Transform front and back image paths
    if (group.front_image_path) {
      mutated.front_image_path = appendApiKeyToUrl(group.front_image_path);
    }
    if (group.back_image_path) {
      mutated.back_image_path = appendApiKeyToUrl(group.back_image_path);
    }

    // Transform studio to add API key to image_path
    if (group.studio) {
      mutated.studio = transformStudio(group.studio);
    }

    // Transform tags to add API key to image_path
    if (group.tags && Array.isArray(group.tags)) {
      mutated.tags = group.tags.map((t: { image_path?: string | null }) =>
        transformTag(t)
      );
    }

    return mutated;
  } catch (error) {
    logger.error("Error transforming group", { error });
    return group; // Return original group if transformation fails
  }
};
