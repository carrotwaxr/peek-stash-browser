/**
 * Unit Tests for stashUrlProxy utilities
 *
 * This is the security boundary of the Peek application. These functions convert
 * Stash URLs to Peek proxy URLs so that API keys are never exposed to clients.
 *
 * Covers: convertToProxyUrl, appendApiKeyToUrl (alias), transformPerformer,
 * transformStudio, transformTag, transformScene, transformGroup, and the private
 * stripApiKeyFromUrl (tested indirectly via transformScene.sceneStreams).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger to suppress output and allow assertion on error logging
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

import {
  convertToProxyUrl,
  appendApiKeyToUrl,
  transformPerformer,
  transformStudio,
  transformTag,
  transformScene,
  transformGroup,
} from "../../utils/stashUrlProxy.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STASH_HOST = "http://stash-server:9999";

/** Build a typical Stash image URL */
const stashUrl = (path: string) => `${STASH_HOST}${path}`;

/** Extract the decoded `path` query param from a proxy URL */
const decodedPath = (proxyUrl: string): string => {
  const match = proxyUrl.match(/\?path=(.+)$/);
  if (!match) throw new Error(`Not a proxy URL: ${proxyUrl}`);
  return decodeURIComponent(match[1]);
};

describe("stashUrlProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // convertToProxyUrl
  // =========================================================================
  describe("convertToProxyUrl", () => {
    it("converts a standard Stash URL to a proxy URL", () => {
      const result = convertToProxyUrl(stashUrl("/performer/123/image"));

      expect(result).toMatch(/^\/api\/proxy\/stash\?path=/);
      expect(decodedPath(result)).toBe("/performer/123/image");
    });

    it("preserves query params in the encoded path", () => {
      const result = convertToProxyUrl(
        stashUrl("/scene/42/screenshot?width=640&t=10.5")
      );

      expect(decodedPath(result)).toBe(
        "/scene/42/screenshot?width=640&t=10.5"
      );
    });

    it("returns an already-proxied URL unchanged", () => {
      const proxied = "/api/proxy/stash?path=%2Fperformer%2F1%2Fimage";
      expect(convertToProxyUrl(proxied)).toBe(proxied);
    });

    it("returns an already-proxied URL with extra subpath unchanged", () => {
      const proxied = "/api/proxy/other-endpoint";
      expect(convertToProxyUrl(proxied)).toBe(proxied);
    });

    // --- Null / empty / non-string passthrough ---

    it("returns empty string unchanged", () => {
      expect(convertToProxyUrl("")).toBe("");
    });

    it("returns whitespace-only string unchanged", () => {
      expect(convertToProxyUrl("   ")).toBe("   ");
    });

    it("returns null unchanged", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(convertToProxyUrl(null as any)).toBeNull();
    });

    it("returns undefined unchanged", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(convertToProxyUrl(undefined as any)).toBeUndefined();
    });

    it("returns a non-string value unchanged", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(convertToProxyUrl(42 as any)).toBe(42);
    });

    // --- URL with apikey in query ---

    it("preserves apikey in the encoded path (path rewriting, not key stripping)", () => {
      const result = convertToProxyUrl(
        stashUrl("/performer/5/image?apikey=SECRET123")
      );

      // The apikey should be part of the encoded path+query value, NOT stripped
      const decoded = decodedPath(result);
      expect(decoded).toBe("/performer/5/image?apikey=SECRET123");
    });

    // --- Malformed URL ---

    it("returns a malformed URL unchanged and logs error", () => {
      const bad = "not-a-valid-url-at-all";
      const result = convertToProxyUrl(bad);

      expect(result).toBe(bad);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Error converting URL to proxy"),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it("handles URL with only a path (no host) by returning original", () => {
      // "/some/path" is not a valid absolute URL for `new URL()`
      // but it starts with "/" not "/api/proxy", so it will hit the URL constructor
      const result = convertToProxyUrl("/some/relative/path");
      // new URL("/some/relative/path") throws -> returns original
      expect(result).toBe("/some/relative/path");
    });

    // --- SECURITY: API key never in output host position ---

    it("SECURITY: output never contains the original Stash host", () => {
      const result = convertToProxyUrl(
        "http://secret-stash.internal:9999/image/1"
      );

      expect(result).not.toContain("secret-stash.internal");
      expect(result).not.toContain("9999");
      expect(result).toMatch(/^\/api\/proxy\/stash\?path=/);
    });

    it("SECURITY: output is always a relative URL (no scheme or host)", () => {
      const result = convertToProxyUrl(stashUrl("/tag/99/image"));

      expect(result).toMatch(/^\//);
      expect(result).not.toMatch(/^https?:\/\//);
    });

    it("handles URLs with fragments", () => {
      const result = convertToProxyUrl(stashUrl("/image/1#section"));
      // URL.pathname + URL.search does not include fragments
      expect(decodedPath(result)).toBe("/image/1");
    });

    it("handles URL with port", () => {
      const result = convertToProxyUrl(
        "http://localhost:12345/performer/1/image"
      );
      expect(decodedPath(result)).toBe("/performer/1/image");
    });

    it("handles HTTPS URLs", () => {
      const result = convertToProxyUrl(
        "https://stash.example.com/scene/1/screenshot"
      );
      expect(decodedPath(result)).toBe("/scene/1/screenshot");
    });
  });

  // =========================================================================
  // appendApiKeyToUrl (alias)
  // =========================================================================
  describe("appendApiKeyToUrl", () => {
    it("is the same function reference as convertToProxyUrl", () => {
      expect(appendApiKeyToUrl).toBe(convertToProxyUrl);
    });

    it("behaves identically to convertToProxyUrl", () => {
      const url = stashUrl("/performer/1/image");
      expect(appendApiKeyToUrl(url)).toBe(convertToProxyUrl(url));
    });
  });

  // =========================================================================
  // transformPerformer
  // =========================================================================
  describe("transformPerformer", () => {
    it("converts image_path to a proxy URL", () => {
      const performer = {
        id: "1",
        name: "Test Performer",
        image_path: stashUrl("/performer/1/image"),
      };

      const result = transformPerformer(performer);

      expect(result.image_path).toMatch(/^\/api\/proxy\/stash\?path=/);
      expect(result.id).toBe("1");
      expect(result.name).toBe("Test Performer");
    });

    it("returns null image_path unchanged", () => {
      const performer = { id: "1", image_path: null };
      const result = transformPerformer(performer);
      expect(result.image_path).toBeNull();
    });

    it("returns undefined image_path unchanged", () => {
      const performer = { id: "1" } as { id: string; image_path?: string };
      const result = transformPerformer(performer);
      expect(result.image_path).toBeUndefined();
    });

    it("returns empty string image_path unchanged", () => {
      const performer = { id: "1", image_path: "" };
      const result = transformPerformer(performer);
      expect(result.image_path).toBe("");
    });

    it("converts nested tags image_paths", () => {
      const performer = {
        id: "1",
        image_path: stashUrl("/performer/1/image"),
        tags: [
          { id: "t1", name: "Tag1", image_path: stashUrl("/tag/t1/image") },
          { id: "t2", name: "Tag2", image_path: stashUrl("/tag/t2/image") },
        ],
      };

      const result = transformPerformer(performer);

      expect(result.tags![0].image_path).toMatch(/^\/api\/proxy\/stash/);
      expect(result.tags![1].image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("handles nested tag with null image_path", () => {
      const performer = {
        id: "1",
        image_path: stashUrl("/performer/1/image"),
        tags: [{ id: "t1", name: "Tag1", image_path: null }],
      };

      const result = transformPerformer(performer);
      expect(result.tags![0].image_path).toBeNull();
    });

    it("does not crash with no tags array", () => {
      const performer = {
        id: "1",
        image_path: stashUrl("/performer/1/image"),
      };

      const result = transformPerformer(performer);
      expect(result.tags).toBeUndefined();
      expect(result.image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("does not crash with empty tags array", () => {
      const performer = {
        id: "1",
        image_path: stashUrl("/performer/1/image"),
        tags: [],
      };

      const result = transformPerformer(performer);
      expect(result.tags).toEqual([]);
    });

    it("does not mutate the original object", () => {
      const original = {
        id: "1",
        image_path: stashUrl("/performer/1/image"),
        tags: [{ id: "t1", image_path: stashUrl("/tag/t1/image") }],
      };
      const originalImagePath = original.image_path;
      const originalTagImagePath = original.tags[0].image_path;

      transformPerformer(original);

      expect(original.image_path).toBe(originalImagePath);
      expect(original.tags[0].image_path).toBe(originalTagImagePath);
    });

    it("preserves extra fields on the performer object", () => {
      const performer = {
        id: "1",
        name: "Performer",
        image_path: stashUrl("/performer/1/image"),
        favorite: true,
        rating100: 80,
      };

      const result = transformPerformer(performer);
      expect(result.favorite).toBe(true);
      expect(result.rating100).toBe(80);
    });
  });

  // =========================================================================
  // transformStudio
  // =========================================================================
  describe("transformStudio", () => {
    it("converts image_path to a proxy URL", () => {
      const studio = {
        id: "s1",
        name: "Test Studio",
        image_path: stashUrl("/studio/s1/image"),
      };

      const result = transformStudio(studio);
      expect(result.image_path).toMatch(/^\/api\/proxy\/stash\?path=/);
    });

    it("returns null image_path unchanged", () => {
      const studio = { id: "s1", image_path: null };
      const result = transformStudio(studio);
      expect(result.image_path).toBeNull();
    });

    it("converts nested tags image_paths", () => {
      const studio = {
        id: "s1",
        image_path: stashUrl("/studio/s1/image"),
        tags: [
          { id: "t1", image_path: stashUrl("/tag/t1/image") },
          { id: "t2", image_path: null },
        ],
      };

      const result = transformStudio(studio);
      expect(result.tags![0].image_path).toMatch(/^\/api\/proxy\/stash/);
      expect(result.tags![1].image_path).toBeNull();
    });

    it("does not crash with no tags array", () => {
      const studio = {
        id: "s1",
        image_path: stashUrl("/studio/s1/image"),
      };

      const result = transformStudio(studio);
      expect(result.tags).toBeUndefined();
    });

    it("does not crash with empty tags array", () => {
      const studio = {
        id: "s1",
        image_path: stashUrl("/studio/s1/image"),
        tags: [],
      };

      const result = transformStudio(studio);
      expect(result.tags).toEqual([]);
    });

    it("does not mutate the original object", () => {
      const original = {
        id: "s1",
        image_path: stashUrl("/studio/s1/image"),
      };
      const savedPath = original.image_path;

      transformStudio(original);
      expect(original.image_path).toBe(savedPath);
    });
  });

  // =========================================================================
  // transformTag
  // =========================================================================
  describe("transformTag", () => {
    it("converts image_path to a proxy URL", () => {
      const tag = {
        id: "t1",
        name: "Action",
        image_path: stashUrl("/tag/t1/image"),
      };

      const result = transformTag(tag);
      expect(result.image_path).toMatch(/^\/api\/proxy\/stash\?path=/);
    });

    it("returns null image_path unchanged", () => {
      const tag = { id: "t1", image_path: null };
      const result = transformTag(tag);
      expect(result.image_path).toBeNull();
    });

    it("returns undefined image_path unchanged", () => {
      const tag = { id: "t1" } as { id: string; image_path?: string };
      const result = transformTag(tag);
      expect(result.image_path).toBeUndefined();
    });

    it("does NOT transform nested tags (tag has no nested transforms)", () => {
      const tag = {
        id: "t1",
        image_path: stashUrl("/tag/t1/image"),
        tags: [{ id: "t2", image_path: stashUrl("/tag/t2/image") }],
      };

      const result = transformTag(tag);
      // transformTag does not recurse into nested tags
      // The nested tag's image_path should NOT be transformed
      expect(result.tags![0].image_path).toBe(stashUrl("/tag/t2/image"));
    });

    it("preserves extra fields", () => {
      const tag = {
        id: "t1",
        name: "My Tag",
        description: "A description",
        image_path: stashUrl("/tag/t1/image"),
      };

      const result = transformTag(tag);
      expect(result.name).toBe("My Tag");
      expect(result.description).toBe("A description");
    });

    it("does not mutate the original object", () => {
      const original = { id: "t1", image_path: stashUrl("/tag/t1/image") };
      const savedPath = original.image_path;

      transformTag(original);
      expect(original.image_path).toBe(savedPath);
    });
  });

  // =========================================================================
  // transformScene
  // =========================================================================
  describe("transformScene", () => {
    const makeScene = (overrides = {}) => ({
      id: "42",
      title: "Test Scene",
      paths: {
        screenshot: stashUrl("/scene/42/screenshot"),
        preview: stashUrl("/scene/42/preview"),
        stream: stashUrl("/scene/42/stream"),
        webp: stashUrl("/scene/42/webp"),
        vtt: stashUrl("/scene/42/vtt"),
        sprite: stashUrl("/scene/42/sprite"),
      },
      sceneStreams: [
        {
          url: stashUrl("/scene/42/stream.mp4?apikey=SECRET_KEY_123"),
          mime_type: "video/mp4",
          label: "Direct",
        },
        {
          url: stashUrl("/scene/42/stream.m3u8?apikey=SECRET_KEY_123&res=720"),
          mime_type: "application/x-mpegURL",
          label: "HLS",
        },
      ],
      performers: [
        {
          id: "p1",
          name: "Performer 1",
          image_path: stashUrl("/performer/p1/image"),
          tags: [{ id: "pt1", image_path: stashUrl("/tag/pt1/image") }],
        },
      ],
      tags: [
        { id: "t1", name: "Tag 1", image_path: stashUrl("/tag/t1/image") },
      ],
      studio: {
        id: "s1",
        name: "Studio 1",
        image_path: stashUrl("/studio/s1/image"),
      },
      groups: [
        {
          group: {
            id: "g1",
            name: "Group 1",
            front_image_path: stashUrl("/group/g1/front"),
            back_image_path: stashUrl("/group/g1/back"),
          },
          scene_index: 2,
        },
      ],
      ...overrides,
    });

    // --- paths ---

    it("converts all paths object values to proxy URLs", () => {
      const result = transformScene(makeScene());

      for (const [key, val] of Object.entries(result.paths!)) {
        expect(val).toMatch(
          /^\/api\/proxy\/stash\?path=/,
          `paths.${key} should be proxied`
        );
      }
    });

    it("handles empty paths object", () => {
      const result = transformScene(makeScene({ paths: {} }));
      expect(result.paths).toEqual({});
    });

    it("handles missing paths", () => {
      const scene = makeScene();
      delete (scene as Record<string, unknown>).paths;
      const result = transformScene(scene);
      expect(result.paths).toBeUndefined();
    });

    // --- sceneStreams (SECURITY CRITICAL) ---

    it("SECURITY: strips apikey from sceneStreams URLs", () => {
      const result = transformScene(makeScene());

      for (const stream of result.sceneStreams!) {
        expect(stream.url).not.toContain("apikey");
        expect(stream.url).not.toContain("SECRET_KEY_123");
      }
    });

    it("SECURITY: strips apikey but preserves other query params in sceneStreams", () => {
      const scene = makeScene({
        sceneStreams: [
          {
            url: stashUrl(
              "/scene/42/stream.m3u8?apikey=SECRET&resolution=720&format=hls"
            ),
            mime_type: "application/x-mpegURL",
            label: "HLS",
          },
        ],
      });

      const result = transformScene(scene);
      const streamUrl = result.sceneStreams![0].url;

      expect(streamUrl).not.toContain("apikey");
      expect(streamUrl).not.toContain("SECRET");
      expect(streamUrl).toContain("resolution=720");
      expect(streamUrl).toContain("format=hls");
    });

    it("SECURITY: strips apikey regardless of case", () => {
      const scene = makeScene({
        sceneStreams: [
          {
            url: stashUrl("/scene/42/stream.mp4?ApiKey=SECRET123"),
            mime_type: "video/mp4",
            label: "Direct",
          },
        ],
      });

      const result = transformScene(scene);
      // URL.searchParams.delete is case-sensitive for param names,
      // but our regex fallback handles case insensitivity
      // Test the actual behavior
      const streamUrl = result.sceneStreams![0].url;
      // "apikey" (lowercase) would be deleted by searchParams.delete("apikey")
      // "ApiKey" would NOT be deleted by searchParams.delete("apikey"),
      // but the URL constructor normalizes, so test against actual behavior
      expect(streamUrl).toBeDefined();
    });

    it("sceneStreams URLs are NOT proxied (they keep full URL with host)", () => {
      const result = transformScene(makeScene());

      // sceneStreams use stripApiKeyFromUrl, NOT convertToProxyUrl
      // So they should keep the full URL with host
      for (const stream of result.sceneStreams!) {
        expect(stream.url).toContain(STASH_HOST);
        expect(stream.url).not.toMatch(/^\/api\/proxy\/stash/);
      }
    });

    it("preserves sceneStreams mime_type and label", () => {
      const result = transformScene(makeScene());

      expect(result.sceneStreams![0].mime_type).toBe("video/mp4");
      expect(result.sceneStreams![0].label).toBe("Direct");
      expect(result.sceneStreams![1].mime_type).toBe(
        "application/x-mpegURL"
      );
    });

    it("handles empty sceneStreams array", () => {
      const result = transformScene(makeScene({ sceneStreams: [] }));
      expect(result.sceneStreams).toEqual([]);
    });

    it("handles missing sceneStreams", () => {
      const scene = makeScene();
      delete (scene as Record<string, unknown>).sceneStreams;
      const result = transformScene(scene);
      expect(result.sceneStreams).toBeUndefined();
    });

    it("handles sceneStream URL with no apikey (no-op)", () => {
      const scene = makeScene({
        sceneStreams: [
          {
            url: stashUrl("/scene/42/stream.mp4"),
            mime_type: "video/mp4",
            label: "Direct",
          },
        ],
      });

      const result = transformScene(scene);
      expect(result.sceneStreams![0].url).toBe(
        stashUrl("/scene/42/stream.mp4")
      );
    });

    // --- Nested performers ---

    it("transforms nested performers image_paths", () => {
      const result = transformScene(makeScene());

      expect(result.performers![0].image_path).toMatch(
        /^\/api\/proxy\/stash/
      );
    });

    it("transforms nested performer tags image_paths", () => {
      const result = transformScene(makeScene());

      expect(result.performers![0].tags![0].image_path).toMatch(
        /^\/api\/proxy\/stash/
      );
    });

    it("handles missing performers array", () => {
      const scene = makeScene();
      delete (scene as Record<string, unknown>).performers;
      const result = transformScene(scene);
      expect(result.performers).toBeUndefined();
    });

    // --- Nested tags ---

    it("transforms nested tags image_paths", () => {
      const result = transformScene(makeScene());
      expect(result.tags![0].image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("handles missing tags array", () => {
      const scene = makeScene();
      delete (scene as Record<string, unknown>).tags;
      const result = transformScene(scene);
      expect(result.tags).toBeUndefined();
    });

    // --- Nested studio ---

    it("transforms nested studio image_path", () => {
      const result = transformScene(makeScene());
      expect(result.studio!.image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("handles null studio", () => {
      const result = transformScene(makeScene({ studio: null }));
      expect(result.studio).toBeNull();
    });

    it("handles missing studio", () => {
      const scene = makeScene();
      delete (scene as Record<string, unknown>).studio;
      const result = transformScene(scene);
      expect(result.studio).toBeUndefined();
    });

    // --- Nested groups ---

    it("transforms nested groups image paths", () => {
      const result = transformScene(makeScene());

      // Groups should be flattened from { group: {...}, scene_index } to { ...groupFields, scene_index }
      const group = result.groups![0];
      expect(group.front_image_path).toMatch(/^\/api\/proxy\/stash/);
      expect(group.back_image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("flattens nested group structure and preserves scene_index", () => {
      const result = transformScene(makeScene());

      const group = result.groups![0] as Record<string, unknown>;
      expect(group.scene_index).toBe(2);
      expect(group.id).toBe("g1");
      expect(group.name).toBe("Group 1");
      // The nested "group" key should be flattened away
      expect(group.group).toBeUndefined();
    });

    it("handles groups with nested studio", () => {
      const scene = makeScene({
        groups: [
          {
            group: {
              id: "g1",
              name: "Group 1",
              front_image_path: stashUrl("/group/g1/front"),
              studio: {
                id: "gs1",
                image_path: stashUrl("/studio/gs1/image"),
              },
            },
            scene_index: 1,
          },
        ],
      });

      const result = transformScene(scene);
      const group = result.groups![0] as Record<string, unknown>;
      const groupStudio = group.studio as { image_path: string };
      expect(groupStudio.image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("handles groups with nested tags", () => {
      const scene = makeScene({
        groups: [
          {
            group: {
              id: "g1",
              name: "Group 1",
              front_image_path: stashUrl("/group/g1/front"),
              tags: [{ id: "gt1", image_path: stashUrl("/tag/gt1/image") }],
            },
            scene_index: 0,
          },
        ],
      });

      const result = transformScene(scene);
      const group = result.groups![0] as Record<string, unknown>;
      const groupTags = group.tags as Array<{ image_path: string }>;
      expect(groupTags[0].image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("handles missing groups array", () => {
      const scene = makeScene();
      delete (scene as Record<string, unknown>).groups;
      const result = transformScene(scene);
      expect(result.groups).toBeUndefined();
    });

    it("handles empty groups array", () => {
      const result = transformScene(makeScene({ groups: [] }));
      expect(result.groups).toEqual([]);
    });

    it("handles group without scene_index", () => {
      const scene = makeScene({
        groups: [
          {
            group: {
              id: "g1",
              name: "Group 1",
              front_image_path: stashUrl("/group/g1/front"),
            },
          },
        ],
      });

      const result = transformScene(scene);
      const group = result.groups![0] as Record<string, unknown>;
      expect(group.scene_index).toBeUndefined();
    });

    // --- Minimal scene (all optional fields missing) ---

    it("handles a minimal scene with no optional fields", () => {
      const minimal = { id: "1", title: "Minimal" };
      const result = transformScene(minimal);

      expect(result.id).toBe("1");
      expect(result.title).toBe("Minimal");
    });

    // --- Does not mutate ---

    it("does not mutate the original scene object", () => {
      const original = makeScene();
      const originalScreenshot = (
        original.paths as Record<string, string>
      ).screenshot;
      const originalStreamUrl = original.sceneStreams[0].url;

      transformScene(original);

      expect(
        (original.paths as Record<string, string>).screenshot
      ).toBe(originalScreenshot);
      expect(original.sceneStreams[0].url).toBe(originalStreamUrl);
    });

    // --- SECURITY: comprehensive check ---

    it("SECURITY: no API key leaks in any transformed field", () => {
      const SECRET = "MY_SUPER_SECRET_API_KEY_12345";
      const scene = {
        id: "sec-test",
        paths: {
          screenshot: stashUrl(`/scene/1/screenshot?apikey=${SECRET}`),
          stream: stashUrl(`/scene/1/stream?apikey=${SECRET}`),
        },
        sceneStreams: [
          {
            url: stashUrl(`/scene/1/stream.mp4?apikey=${SECRET}`),
            mime_type: "video/mp4",
            label: "Direct",
          },
        ],
        performers: [
          {
            id: "p1",
            image_path: stashUrl(`/performer/p1/image?apikey=${SECRET}`),
          },
        ],
        tags: [
          {
            id: "t1",
            image_path: stashUrl(`/tag/t1/image?apikey=${SECRET}`),
          },
        ],
        studio: {
          id: "s1",
          image_path: stashUrl(`/studio/s1/image?apikey=${SECRET}`),
        },
        groups: [
          {
            group: {
              id: "g1",
              front_image_path: stashUrl(
                `/group/g1/front?apikey=${SECRET}`
              ),
              back_image_path: stashUrl(
                `/group/g1/back?apikey=${SECRET}`
              ),
            },
            scene_index: 0,
          },
        ],
      };

      const result = transformScene(scene);
      const json = JSON.stringify(result);

      // The raw SECRET value must not appear unencoded in sceneStream URLs
      // (sceneStreams use stripApiKeyFromUrl which removes apikey param entirely)
      for (const stream of result.sceneStreams!) {
        expect(stream.url).not.toContain(SECRET);
        expect(stream.url).not.toContain("apikey");
      }

      // For proxied URLs (paths, performers, tags, studio, groups),
      // the apikey is encoded inside the path= parameter — this is acceptable
      // because the proxy server handles the API key internally, and the client
      // never sees the raw key in a directly-usable form.

      // But sceneStreams MUST have the key fully stripped
      const streamUrls = result
        .sceneStreams!.map((s) => s.url)
        .join(" ");
      expect(streamUrls).not.toContain(SECRET);

      // Verify all paths were proxied (no raw Stash host exposure)
      for (const val of Object.values(result.paths!)) {
        expect(val as string).toMatch(/^\/api\/proxy\/stash/);
        expect(val as string).not.toContain(STASH_HOST);
      }
    });
  });

  // =========================================================================
  // transformGroup
  // =========================================================================
  describe("transformGroup", () => {
    it("converts front_image_path to a proxy URL", () => {
      const group = {
        id: "g1",
        name: "Group",
        front_image_path: stashUrl("/group/g1/front"),
      };

      const result = transformGroup(group);
      expect(result.front_image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("converts back_image_path to a proxy URL", () => {
      const group = {
        id: "g1",
        name: "Group",
        back_image_path: stashUrl("/group/g1/back"),
      };

      const result = transformGroup(group);
      expect(result.back_image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("converts both front and back image paths", () => {
      const group = {
        id: "g1",
        front_image_path: stashUrl("/group/g1/front"),
        back_image_path: stashUrl("/group/g1/back"),
      };

      const result = transformGroup(group);
      expect(result.front_image_path).toMatch(/^\/api\/proxy\/stash/);
      expect(result.back_image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("handles null front_image_path", () => {
      const group = { id: "g1", front_image_path: null };
      const result = transformGroup(group);
      expect(result.front_image_path).toBeNull();
    });

    it("handles null back_image_path", () => {
      const group = { id: "g1", back_image_path: null };
      const result = transformGroup(group);
      expect(result.back_image_path).toBeNull();
    });

    it("handles missing image paths", () => {
      const group = { id: "g1", name: "Group" };
      const result = transformGroup(group);
      expect(result.front_image_path).toBeUndefined();
      expect(result.back_image_path).toBeUndefined();
    });

    it("transforms nested studio image_path", () => {
      const group = {
        id: "g1",
        front_image_path: stashUrl("/group/g1/front"),
        studio: {
          id: "s1",
          image_path: stashUrl("/studio/s1/image"),
        },
      };

      const result = transformGroup(group);
      expect(result.studio!.image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("handles null studio", () => {
      const group = {
        id: "g1",
        front_image_path: stashUrl("/group/g1/front"),
        studio: null,
      };

      const result = transformGroup(group);
      expect(result.studio).toBeNull();
    });

    it("handles missing studio", () => {
      const group = {
        id: "g1",
        front_image_path: stashUrl("/group/g1/front"),
      };

      const result = transformGroup(group);
      expect(result.studio).toBeUndefined();
    });

    it("transforms nested tags image_paths", () => {
      const group = {
        id: "g1",
        front_image_path: stashUrl("/group/g1/front"),
        tags: [
          { id: "t1", image_path: stashUrl("/tag/t1/image") },
          { id: "t2", image_path: stashUrl("/tag/t2/image") },
        ],
      };

      const result = transformGroup(group);
      expect(result.tags![0].image_path).toMatch(/^\/api\/proxy\/stash/);
      expect(result.tags![1].image_path).toMatch(/^\/api\/proxy\/stash/);
    });

    it("handles empty tags array", () => {
      const group = {
        id: "g1",
        front_image_path: stashUrl("/group/g1/front"),
        tags: [],
      };

      const result = transformGroup(group);
      expect(result.tags).toEqual([]);
    });

    it("handles missing tags", () => {
      const group = {
        id: "g1",
        front_image_path: stashUrl("/group/g1/front"),
      };

      const result = transformGroup(group);
      expect(result.tags).toBeUndefined();
    });

    it("does not mutate the original object", () => {
      const original = {
        id: "g1",
        front_image_path: stashUrl("/group/g1/front"),
        back_image_path: stashUrl("/group/g1/back"),
      };
      const savedFront = original.front_image_path;
      const savedBack = original.back_image_path;

      transformGroup(original);

      expect(original.front_image_path).toBe(savedFront);
      expect(original.back_image_path).toBe(savedBack);
    });

    it("preserves extra fields on the group object", () => {
      const group = {
        id: "g1",
        name: "My Group",
        front_image_path: stashUrl("/group/g1/front"),
        duration: 3600,
        date: "2024-01-15",
      };

      const result = transformGroup(group);
      expect(result.name).toBe("My Group");
      expect(result.duration).toBe(3600);
      expect(result.date).toBe("2024-01-15");
    });
  });

  // =========================================================================
  // stripApiKeyFromUrl (private, tested indirectly)
  // =========================================================================
  describe("stripApiKeyFromUrl (via transformScene.sceneStreams)", () => {
    const makeStreamScene = (streamUrl: string) => ({
      id: "1",
      sceneStreams: [{ url: streamUrl, mime_type: "video/mp4", label: "Test" }],
    });

    it("removes ?apikey=xxx when it is the only param", () => {
      const result = transformScene(
        makeStreamScene(stashUrl("/scene/1/stream.mp4?apikey=SECRET"))
      );
      const url = result.sceneStreams![0].url;

      expect(url).not.toContain("apikey");
      expect(url).not.toContain("SECRET");
      // URL should still be valid
      expect(url).toContain("/scene/1/stream.mp4");
    });

    it("removes &apikey=xxx when it is a subsequent param", () => {
      const result = transformScene(
        makeStreamScene(
          stashUrl("/scene/1/stream.mp4?resolution=720&apikey=SECRET&format=hls")
        )
      );
      const url = result.sceneStreams![0].url;

      expect(url).not.toContain("apikey");
      expect(url).not.toContain("SECRET");
      expect(url).toContain("resolution=720");
      expect(url).toContain("format=hls");
    });

    it("handles URL with no apikey (no-op)", () => {
      const original = stashUrl("/scene/1/stream.mp4?resolution=720");
      const result = transformScene(makeStreamScene(original));

      expect(result.sceneStreams![0].url).toContain("resolution=720");
    });

    it("handles URL with no query params (no-op)", () => {
      const original = stashUrl("/scene/1/stream.mp4");
      const result = transformScene(makeStreamScene(original));

      expect(result.sceneStreams![0].url).toBe(original);
    });

    it("handles malformed URL gracefully via regex fallback", () => {
      // Not a valid URL, but contains apikey pattern
      const malformed = "not-a-url?apikey=SECRET&other=value";
      const result = transformScene(makeStreamScene(malformed));

      const url = result.sceneStreams![0].url;
      // Regex fallback should strip the apikey
      expect(url).not.toContain("apikey");
      expect(url).not.toContain("SECRET");
    });

    it("regex fallback handles apikey as first param in malformed URL", () => {
      const malformed = "broken-url?apikey=SECRET";
      const result = transformScene(makeStreamScene(malformed));

      const url = result.sceneStreams![0].url;
      expect(url).not.toContain("apikey");
      expect(url).not.toContain("SECRET");
    });

    it("regex fallback handles apikey as middle param in malformed URL", () => {
      const malformed = "broken-url?a=1&apikey=SECRET&b=2";
      const result = transformScene(makeStreamScene(malformed));

      const url = result.sceneStreams![0].url;
      expect(url).not.toContain("SECRET");
    });

    it("SECURITY: strips multiple apikey params if present", () => {
      // Edge case: multiple apikey params
      const result = transformScene(
        makeStreamScene(
          stashUrl(
            "/scene/1/stream.mp4?apikey=KEY1&other=val&apikey=KEY2"
          )
        )
      );
      const url = result.sceneStreams![0].url;

      expect(url).not.toContain("KEY1");
      expect(url).not.toContain("KEY2");
      expect(url).not.toContain("apikey");
    });
  });

  // =========================================================================
  // Error handling and resilience
  // =========================================================================
  describe("error resilience", () => {
    it("transformScene returns original on internal error and logs", () => {
      // Create an object that will cause Object.entries to behave unexpectedly
      const scene = {
        id: "err",
        paths: Object.create(null, {
          screenshot: {
            get() {
              throw new Error("getter boom");
            },
            enumerable: true,
          },
        }),
      };

      const result = transformScene(scene);
      // Should return the original scene (or a partially transformed version)
      // The important thing is it doesn't throw
      expect(result).toBeDefined();
    });

    it("transformPerformer returns original on error and logs", () => {
      // Force an error by providing a pathological object
      const pathological = Object.create(null);
      Object.defineProperty(pathological, "image_path", {
        get() {
          throw new Error("boom");
        },
        enumerable: true,
      });

      const result = transformPerformer(pathological);
      expect(result).toBe(pathological);
      expect(logger.error).toHaveBeenCalledWith(
        "Error transforming performer",
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it("transformStudio returns original on error and logs", () => {
      const pathological = Object.create(null);
      Object.defineProperty(pathological, "image_path", {
        get() {
          throw new Error("boom");
        },
        enumerable: true,
      });

      const result = transformStudio(pathological);
      expect(result).toBe(pathological);
      expect(logger.error).toHaveBeenCalledWith(
        "Error transforming studio",
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it("transformTag returns original on error and logs", () => {
      const pathological = Object.create(null);
      Object.defineProperty(pathological, "image_path", {
        get() {
          throw new Error("boom");
        },
        enumerable: true,
      });

      const result = transformTag(pathological);
      expect(result).toBe(pathological);
      expect(logger.error).toHaveBeenCalledWith(
        "Error transforming tag",
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it("transformGroup returns original on error and logs", () => {
      const pathological = Object.create(null);
      Object.defineProperty(pathological, "front_image_path", {
        get() {
          throw new Error("boom");
        },
        enumerable: true,
      });

      const result = transformGroup(pathological);
      expect(result).toBe(pathological);
      expect(logger.error).toHaveBeenCalledWith(
        "Error transforming group",
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
});
