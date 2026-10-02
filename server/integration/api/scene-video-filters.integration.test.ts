import type { Resolution } from "@peek/shared-types/filters/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import type {
  EnumCriterion,
  ParsedFilter,
  TextCriterion,
} from "../../types/parsedFilters.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { expectRefused } from "../helpers/refused.js";
import { adminClient } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Scene Video Filters Integration Tests
 *
 * Tests video/file-related filters on scenes:
 * - resolution (using enum values: VERY_LOW, LOW, R360P, STANDARD, WEB_HD, STANDARD_HD, FULL_HD, QUAD_HD, FOUR_K, etc.)
 * - framerate
 * - video_codec
 * - audio_codec
 * - bitrate
 * - organized
 * - director (seeded), and the 7K and Huge resolutions (seeded)
 * - Stash's interactive, path and captions filters, which Peek refuses (400)
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
      organized?: boolean;
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
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            resolution: {
              value: "STANDARD_HD",
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by resolution LESS_THAN STANDARD_HD (SD content)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            resolution: {
              value: "STANDARD_HD",
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by resolution EQUALS FULL_HD (1080p)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            resolution: {
              value: "FULL_HD",
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters 4K content (resolution >= FOUR_K)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            resolution: {
              value: "FOUR_K",
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by resolution NOT_EQUALS STANDARD (exclude 480p)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            resolution: {
              value: "STANDARD",
              modifier: "NOT_EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("framerate filter", () => {
    it("filters by framerate GREATER_THAN (high fps)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            framerate: {
              value: 30,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by framerate EQUALS (60 fps)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            framerate: {
              value: 60,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("video_codec filter", () => {
    it("filters by video_codec h264", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            video_codec: {
              value: "h264",
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by video_codec h265/hevc", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            video_codec: {
              value: "hevc",
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by video_codec NOT_EQUALS", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            video_codec: {
              value: "h264",
              modifier: "NOT_EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("audio_codec filter", () => {
    it("filters by audio_codec aac", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            audio_codec: {
              value: "aac",
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("bitrate filter", () => {
    it("filters by bitrate GREATER_THAN (high quality)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            bitrate: {
              value: 10000000, // 10 Mbps
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by bitrate LESS_THAN (low quality)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            bitrate: {
              value: 5000000, // 5 Mbps
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("Stash scene filters Peek does not apply", () => {
    // The request parser refuses them rather than ignore them: no builder
    // has a clause for interactive, interactive_speed, path or captions
    it.each([
      { path: "scene_filter.interactive", criterion: { interactive: true } },
      {
        path: "scene_filter.interactive_speed",
        criterion: {
          interactive_speed: { value: 50, modifier: "GREATER_THAN" },
        },
      },
      {
        path: "scene_filter.path",
        criterion: { path: { value: "/", modifier: "INCLUDES" } },
      },
      {
        path: "scene_filter.captions",
        criterion: { captions: { value: "", modifier: "NOT_NULL" } },
      },
    ])("$path answers 400 naming it", async ({ path, criterion }) => {
      const response = await adminClient.post("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: criterion,
      });

      expectRefused(response, [path]);
    });
  });

  describe("organized filter", () => {
    const listed = async (organized?: boolean) => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: organized === undefined ? {} : { organized },
        }
      );
      expect(response.ok).toBe(true);
      return response.data.findScenes;
    };

    it("filters organized scenes", async () => {
      const { scenes, count } = await listed(true);

      expect(count).toBeGreaterThan(0);
      expect(scenes.map((scene) => scene.organized)).toEqual(
        scenes.map(() => true)
      );
    });

    it("filters unorganized scenes", async () => {
      const { scenes, count } = await listed(false);

      expect(count).toBeGreaterThan(0);
      expect(scenes.map((scene) => scene.organized)).toEqual(
        scenes.map(() => false)
      );
    });

    it("organized and unorganized scenes add up to the whole library", async () => {
      const [all, organized, unorganized] = await Promise.all([
        listed(),
        listed(true),
        listed(false),
      ]);

      expect(organized.count + unorganized.count).toBe(all.count);
    });
  });

  describe("combined video filters", () => {
    it("combines resolution and codec filters", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
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
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines framerate and bitrate filters", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
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
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});

/**
 * The scene director filter and the resolution ranges, on seeded scenes. A
 * resolution is Stash's range on the file's shorter side, so a portrait
 * 1080 by 1920 file is 1080p, and a file with no size never matches.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - sv-a: 7893001 3584p directed by "Jane Smith", 7893002 6144p by
 *   "SMITHERS", 7893003 4320p by "Bob Jones", 7893004 2160p with no director,
 *   7893005 a portrait 1080 by 1920 file and 7893006 a file with no size,
 *   both directed by "Zed Quinn"
 * - sv-b: 7893001 1080p directed by "Ann Smith"
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Scene director and 7K / Huge resolutions (seeded)", () => {
  const A = "sv-a";
  const B = "sv-b";

  const scene = (
    id: string,
    instance: string,
    fileHeight: number | null,
    director: string | null,
    fileWidth: number | null = fileHeight === null ? null : fileHeight * 2
  ) => ({
    id,
    stashInstanceId: instance,
    title: `SV ${id} ${instance}`,
    fileWidth,
    fileHeight,
    director,
  });

  async function removeRows(): Promise<void> {
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
  }

  /** The scenes a filter lists, as sorted "id:instance" keys */
  async function listed(filter: ParsedFilter<"scene">): Promise<string[]> {
    const { items, total } = await sceneQueryBuilder.execute({
      userId: 0,
      applyExclusions: false,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("scene", { perPage: 50, filter }),
    });
    expect(total).toBe(items.length);
    return items.map((s) => `${s.id}:${s.instanceId}`).sort();
  }

  const resolution = (
    modifier: EnumCriterion<Resolution>["modifier"],
    value: Resolution
  ) => listed({ resolution: { modifier, value } });
  const director = (criterion: TextCriterion) =>
    listed({ director: criterion });

  beforeAll(async () => {
    await removeRows();
    await prisma.stashScene.createMany({
      data: [
        scene("7893001", A, 3584, "Jane Smith"),
        scene("7893002", A, 6144, "SMITHERS"),
        scene("7893003", A, 4320, "Bob Jones"),
        scene("7893004", A, 2160, null),
        scene("7893001", B, 1080, "Ann Smith"),
        scene("7893005", A, 1920, "Zed Quinn", 1080),
        scene("7893006", A, null, "Zed Quinn"),
      ],
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("resolution SEVEN_K EQUALS matches a 3584p scene", async () => {
    expect(await resolution("EQUALS", "SEVEN_K")).toEqual(["7893001:sv-a"]);
  });

  it("resolution HUGE EQUALS matches a 6144p scene", async () => {
    expect(await resolution("EQUALS", "HUGE")).toEqual(["7893002:sv-a"]);
  });

  it("a 1080x1920 portrait file is 1080p, not VR_HD", async () => {
    expect(await resolution("EQUALS", "FULL_HD")).toEqual([
      "7893001:sv-b",
      "7893005:sv-a",
    ]);
    expect(await resolution("EQUALS", "VR_HD")).toEqual([]);
  });

  it("an overlapping range matches as Stash does", async () => {
    // 2160p is inside FOUR_K (1920 to 2559) but past VR_HD (1920 to 2159)
    expect(await resolution("EQUALS", "FOUR_K")).toEqual(["7893004:sv-a"]);
  });

  it("the resolutions compare with the other ranges", async () => {
    expect(await resolution("GREATER_THAN", "SEVEN_K")).toEqual([
      "7893002:sv-a",
      "7893003:sv-a",
    ]);
    expect(await resolution("LESS_THAN", "HUGE")).toEqual([
      "7893001:sv-a",
      "7893001:sv-b",
      "7893003:sv-a",
      "7893004:sv-a",
      "7893005:sv-a",
    ]);
  });

  it("NOT_EQUALS lists the files outside the range, never one with no size", async () => {
    expect(await resolution("NOT_EQUALS", "SEVEN_K")).toEqual([
      "7893001:sv-b",
      "7893002:sv-a",
      "7893003:sv-a",
      "7893004:sv-a",
      "7893005:sv-a",
    ]);
  });

  it("scene director INCLUDES Smith, ignoring case", async () => {
    expect(await director({ modifier: "INCLUDES", value: "Smith" })).toEqual([
      "7893001:sv-a",
      "7893001:sv-b",
      "7893002:sv-a",
    ]);
  });

  it("scene director EXCLUDES keeps scenes without a director, and EQUALS matches the whole name", async () => {
    expect(await director({ modifier: "EXCLUDES", value: "smith" })).toEqual([
      "7893003:sv-a",
      "7893004:sv-a",
      "7893005:sv-a",
      "7893006:sv-a",
    ]);
    expect(await director({ modifier: "EQUALS", value: "jane smith" })).toEqual(
      ["7893001:sv-a"]
    );
    expect(await director({ modifier: "IS_NULL" })).toEqual(["7893004:sv-a"]);
  });
});
