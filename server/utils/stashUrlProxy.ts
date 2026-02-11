/**
 * URL Proxy Utilities
 *
 * Handles converting Stash URLs to Peek proxy URLs to avoid exposing API keys
 * to the client. All Stash image/asset URLs are rewritten to go through Peek's
 * proxy endpoint.
 */
import type {
  Group,
  Performer,
  Scene,
  Studio,
  Tag,
} from "../graphql/types.js";
import { logger } from "./logger.js";

/**
 * Nested tag with image path (used in performers, studios, scenes, etc.)
 */
interface NestedTagWithImage {
  image_path?: string | null;
  [key: string]: unknown;
}

/**
 * Nested performer (partial performer data)
 */
interface NestedPerformer {
  [key: string]: unknown;
}

/**
 * Nested group (partial group data)
 */
interface NestedGroup {
  [key: string]: unknown;
}

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
export const transformPerformer = <T extends Partial<Performer>>(
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
      mutated.tags = performer.tags.map((t: NestedTagWithImage) => ({
        ...t,
        image_path: t.image_path
          ? appendApiKeyToUrl(t.image_path)
          : t.image_path,
      })) as T["tags"];
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
export const transformStudio = <T extends Partial<Studio>>(studio: T): T => {
  try {
    const mutated = {
      ...studio,
      image_path: studio.image_path
        ? appendApiKeyToUrl(studio.image_path)
        : studio.image_path,
    } as T;

    // Transform nested tags
    if (studio.tags && Array.isArray(studio.tags)) {
      mutated.tags = studio.tags.map((t: NestedTagWithImage) => ({
        ...t,
        image_path: t.image_path
          ? appendApiKeyToUrl(t.image_path)
          : t.image_path,
      })) as T["tags"];
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
export const transformTag = <T extends Partial<Tag>>(tag: T): T => {
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
export const transformScene = <T extends Partial<Scene>>(scene: T): T => {
  try {
    const mutated = {
      ...scene,
    } as T;

    // Transform paths object if present
    if (scene.paths) {
      mutated.paths = Object.entries(scene.paths).reduce(
        (acc, [key, val]) => {
          acc[key] = appendApiKeyToUrl(val as string);
          return acc;
        },
        {} as Record<string, string>
      ) as T["paths"];
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
      ) as T["sceneStreams"];
    }

    // Transform performers to add API key to image_path
    if (scene.performers && Array.isArray(scene.performers)) {
      mutated.performers = scene.performers.map((p: NestedPerformer) =>
        transformPerformer(p)
      ) as T["performers"];
    }

    // Transform tags to add API key to image_path
    if (scene.tags && Array.isArray(scene.tags)) {
      mutated.tags = scene.tags.map((t: NestedTagWithImage) =>
        transformTag(t)
      ) as T["tags"];
    }

    // Transform studio to add API key to image_path
    if (scene.studio) {
      mutated.studio = transformStudio(scene.studio) as T["studio"];
    }

    // Transform groups - flatten nested structure and add API keys to images
    if (scene.groups && Array.isArray(scene.groups)) {
      mutated.groups = scene.groups.map((g: NestedGroup) => {
        // Stash returns groups as: { group: { id, name, ... }, scene_index: 2 }
        // We need to flatten and transform, preserving scene_index
        const group = "group" in g ? g.group : g;
        const sceneIndex = "scene_index" in g ? g.scene_index : undefined;
        return {
          ...transformGroup(group as Partial<Group>),
          ...(sceneIndex !== undefined && { scene_index: sceneIndex }),
        };
      }) as T["groups"];
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
export const transformGroup = <T extends Partial<Group>>(group: T): T => {
  try {
    const mutated = {
      ...group,
    } as T;

    // Transform front and back image paths
    if (group.front_image_path) {
      mutated.front_image_path = appendApiKeyToUrl(
        group.front_image_path
      ) as T["front_image_path"];
    }
    if (group.back_image_path) {
      mutated.back_image_path = appendApiKeyToUrl(
        group.back_image_path
      ) as T["back_image_path"];
    }

    // Transform studio to add API key to image_path
    if (group.studio) {
      mutated.studio = transformStudio(group.studio) as T["studio"];
    }

    // Transform tags to add API key to image_path
    if (group.tags && Array.isArray(group.tags)) {
      mutated.tags = group.tags.map((t: NestedTagWithImage) =>
        transformTag(t)
      ) as T["tags"];
    }

    return mutated;
  } catch (error) {
    logger.error("Error transforming group", { error });
    return group; // Return original group if transformation fails
  }
};
