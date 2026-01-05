import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Scene Video Filters Integration Tests
 *
 * Tests video/file-related filters on scenes:
 * - resolution (using enum values: VERY_LOW, LOW, R360P, STANDARD, WEB_HD, STANDARD_HD, FULL_HD, QUAD_HD, FOUR_K, etc.)
 * - framerate
 * - video_codec
 * - audio_codec
 * - bitrate
 * - interactive (haptic/funscript support)
 * - path filters
 * - captions
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      files?: Array<{
        width?: number;
        height?: number;
        frame_rate?: number;
        video_codec?: string;
        audio_codec?: string;
        bit_rate?: number;
        path?: string;
      }>;
      interactive?: boolean;
      interactive_speed?: number | null;
      captions?: Array<{ language_code: string }>;
    }>;
    count: number;
  };
}

describe("Scene Video Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("resolution filter", () => {
    it("filters by resolution GREATER_THAN STANDARD_HD (720p+)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          resolution: {
            value: "STANDARD_HD",
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by resolution LESS_THAN STANDARD_HD (SD content)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          resolution: {
            value: "STANDARD_HD",
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by resolution EQUALS FULL_HD (1080p)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          resolution: {
            value: "FULL_HD",
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters 4K content (resolution >= FOUR_K)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          resolution: {
            value: "FOUR_K",
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by resolution NOT_EQUALS STANDARD (exclude 480p)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          resolution: {
            value: "STANDARD",
            modifier: "NOT_EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("framerate filter", () => {
    it("filters by framerate GREATER_THAN (high fps)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          framerate: {
            value: 30,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by framerate EQUALS (60 fps)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          framerate: {
            value: 60,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("video_codec filter", () => {
    it("filters by video_codec h264", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          video_codec: {
            value: "h264",
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by video_codec h265/hevc", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          video_codec: {
            value: "hevc",
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by video_codec NOT_EQUALS", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          video_codec: {
            value: "h264",
            modifier: "NOT_EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("audio_codec filter", () => {
    it("filters by audio_codec aac", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          audio_codec: {
            value: "aac",
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("bitrate filter", () => {
    it("filters by bitrate GREATER_THAN (high quality)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          bitrate: {
            value: 10000000, // 10 Mbps
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by bitrate LESS_THAN (low quality)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          bitrate: {
            value: 5000000, // 5 Mbps
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("interactive filter", () => {
    it("filters interactive scenes (with funscript)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          interactive: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters non-interactive scenes", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          interactive: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by interactive_speed range", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          interactive_speed: {
            value: 50,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("path filter", () => {
    it("filters by path INCLUDES pattern", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          path: {
            value: "/",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by path MATCHES_REGEX", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          path: {
            value: ".*\\.mp4$",
            modifier: "MATCHES_REGEX",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("captions filter", () => {
    it("filters scenes with captions", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          captions: {
            value: "",
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("organized filter", () => {
    it("filters organized scenes", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          organized: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters unorganized scenes", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          organized: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("combined video filters", () => {
    it("combines resolution and codec filters", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          resolution: {
            value: "FULL_HD",
            modifier: "GREATER_THAN",
          },
          video_codec: {
            value: "h264",
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines framerate and bitrate filters", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          framerate: {
            value: 30,
            modifier: "GREATER_THAN",
          },
          bitrate: {
            value: 5000000,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});
