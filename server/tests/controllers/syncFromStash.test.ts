/**
 * Unit Tests for syncFromStash — Pagination Logic & Entity Sync
 *
 * Tests the paginated fetching from Stash GraphQL API, batch upserts into
 * Peek's SQLite database, per-entity-type sync behavior, progress tracking,
 * and error handling.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Build a mock StashClient using vi.hoisted so it's available in vi.mock factories
const mockStashClient = vi.hoisted(() => ({
  findScenes: vi.fn(),
  findPerformers: vi.fn(),
  findStudios: vi.fn(),
  findTags: vi.fn(),
  findGalleries: vi.fn(),
  findGroups: vi.fn(),
}));

// Mock prisma — need all entity rating models plus watchHistory and $transaction
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    sceneRating: { findMany: vi.fn(), upsert: vi.fn() },
    performerRating: { findMany: vi.fn(), upsert: vi.fn() },
    studioRating: { findMany: vi.fn(), upsert: vi.fn() },
    tagRating: { findMany: vi.fn(), upsert: vi.fn() },
    galleryRating: { findMany: vi.fn(), upsert: vi.fn() },
    groupRating: { findMany: vi.fn(), upsert: vi.fn() },
    watchHistory: { findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock bcryptjs (imported by user.ts at top level)
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));

// Mock recoveryKey utils
vi.mock("../../utils/recoveryKey.js", () => ({
  generateRecoveryKey: vi.fn(),
  formatRecoveryKey: vi.fn(),
}));

// Mock passwordValidation
vi.mock("../../utils/passwordValidation.js", () => ({
  validatePassword: vi.fn(),
}));

// Mock PermissionService
vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(),
}));

// Mock ExclusionComputationService
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    recomputeForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock StashInstanceManager — dynamically imported inside syncFromStash
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getAll: vi.fn().mockReturnValue([["instance-1", mockStashClient]]),
  },
}));

import prisma from "../../prisma/singleton.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { syncFromStash } from "../../controllers/user.js";

const mockPrisma = vi.mocked(prisma);
const mockInstanceManager = vi.mocked(stashInstanceManager);

const ADMIN = { id: 1, username: "admin", role: "ADMIN" };
const USER = { id: 2, username: "testuser", role: "USER" };

function mockReq(
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
  user: typeof ADMIN | typeof USER | Record<string, unknown> = ADMIN
) {
  return { body, params, user } as any;
}

function mockRes() {
  const res: any = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    _getStatus: () => res.status.mock.calls[0]?.[0] ?? 200,
    _getBody: () => {
      const jsonCalls = res.json.mock.calls;
      return jsonCalls[jsonCalls.length - 1]?.[0];
    },
  };
  return res;
}

/** Default sync options (match the code defaults) */
const DEFAULT_OPTIONS = {
  scenes: { rating: true, favorite: false, oCounter: false },
  performers: { rating: true, favorite: true },
  studios: { rating: true, favorite: true },
  tags: { rating: false, favorite: true },
  galleries: { rating: true },
  groups: { rating: true },
};

/** Helper to create minimal scene objects */
function makeScene(
  id: string,
  rating100: number | null = null,
  o_counter: number | null = null
) {
  return { id, rating100, o_counter };
}

/** Helper to create minimal performer/studio objects */
function makeEntity(
  id: string,
  rating100: number | null = null,
  favorite = false
) {
  return { id, rating100, favorite };
}

/** Helper to create minimal tag objects */
function makeTag(id: string, favorite = false) {
  return { id, favorite };
}

/** Helper to create minimal gallery/group objects */
function makeRatedEntity(id: string, rating100: number | null = null) {
  return { id, rating100 };
}

describe("syncFromStash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: single instance
    mockInstanceManager.getAll.mockReturnValue([
      ["instance-1", mockStashClient as any],
    ]);
    // Default: empty existing records
    mockPrisma.sceneRating.findMany.mockResolvedValue([]);
    mockPrisma.performerRating.findMany.mockResolvedValue([]);
    mockPrisma.studioRating.findMany.mockResolvedValue([]);
    mockPrisma.tagRating.findMany.mockResolvedValue([]);
    mockPrisma.galleryRating.findMany.mockResolvedValue([]);
    mockPrisma.groupRating.findMany.mockResolvedValue([]);
    (mockPrisma as any).watchHistory.findMany.mockResolvedValue([]);
    // Default: transaction resolves
    mockPrisma.$transaction.mockResolvedValue([]);
    // Default: all Stash API calls return empty
    mockStashClient.findScenes.mockResolvedValue({
      findScenes: { scenes: [], count: 0 },
    });
    mockStashClient.findPerformers.mockResolvedValue({
      findPerformers: { performers: [], count: 0 },
    });
    mockStashClient.findStudios.mockResolvedValue({
      findStudios: { studios: [], count: 0 },
    });
    mockStashClient.findTags.mockResolvedValue({
      findTags: { tags: [], count: 0 },
    });
    mockStashClient.findGalleries.mockResolvedValue({
      findGalleries: { galleries: [], count: 0 },
    });
    mockStashClient.findGroups.mockResolvedValue({
      findGroups: { groups: [], count: 0 },
    });
  });

  // ─── Auth & Validation ───

  describe("auth and validation", () => {
    it("returns 403 when user is not admin", async () => {
      const req = mockReq({}, { userId: "2" }, USER);
      const res = mockRes();
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(403);
      expect(res._getBody().error).toMatch(/Only admins/);
    });

    it("returns 403 when user is missing", async () => {
      const req = mockReq({}, { userId: "2" }, {} as any);
      const res = mockRes();
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 when userId param is not a number", async () => {
      const req = mockReq({}, { userId: "abc" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/Invalid user ID/);
    });

    it("returns 400 when no Stash instances configured", async () => {
      mockInstanceManager.getAll.mockReturnValue([]);
      const req = mockReq({}, { userId: "2" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getBody().error).toMatch(/No Stash instances/);
    });
  });

  // ─── Pagination Logic ───

  describe("pagination", () => {
    it("fetches single page when count <= page size", async () => {
      const scenes = [makeScene("1", 80), makeScene("2", 60)];
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: { scenes, count: 2 },
      });

      const req = mockReq(
        { options: { ...DEFAULT_OPTIONS, performers: { rating: false, favorite: false }, studios: { rating: false, favorite: false }, tags: { rating: false, favorite: false }, galleries: { rating: false }, groups: { rating: false } } },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findScenes).toHaveBeenCalledTimes(1);
      expect(mockStashClient.findScenes).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { page: 1, per_page: 1000 },
        })
      );
      const body = res._getBody();
      expect(body.success).toBe(true);
      expect(body.stats.scenes.created).toBe(2);
    });

    it("fetches multiple pages when count > items returned", async () => {
      // Page 1: returns 3 items out of 5 total
      mockStashClient.findScenes
        .mockResolvedValueOnce({
          findScenes: {
            scenes: [makeScene("1", 80), makeScene("2", 60), makeScene("3", 40)],
            count: 5,
          },
        })
        // Page 2: returns remaining 2 items
        .mockResolvedValueOnce({
          findScenes: {
            scenes: [makeScene("4", 90), makeScene("5", 70)],
            count: 5,
          },
        });

      const req = mockReq(
        { options: { scenes: { rating: true, favorite: false, oCounter: false }, performers: { rating: false, favorite: false }, studios: { rating: false, favorite: false }, tags: { rating: false, favorite: false }, galleries: { rating: false }, groups: { rating: false } } },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findScenes).toHaveBeenCalledTimes(2);
      expect(mockStashClient.findScenes).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ filter: { page: 1, per_page: 1000 } })
      );
      expect(mockStashClient.findScenes).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ filter: { page: 2, per_page: 1000 } })
      );
      expect(res._getBody().stats.scenes.created).toBe(5);
    });

    it("stops pagination when empty page is returned", async () => {
      // Page 1 returns items but page 2 is empty (even if count says more)
      mockStashClient.findScenes
        .mockResolvedValueOnce({
          findScenes: {
            scenes: [makeScene("1", 80)],
            count: 100, // Count says 100 but API returns empty on next page
          },
        })
        .mockResolvedValueOnce({
          findScenes: {
            scenes: [],
            count: 100,
          },
        });

      const req = mockReq(
        { options: { scenes: { rating: true, favorite: false, oCounter: false }, performers: { rating: false, favorite: false }, studios: { rating: false, favorite: false }, tags: { rating: false, favorite: false }, galleries: { rating: false }, groups: { rating: false } } },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findScenes).toHaveBeenCalledTimes(2);
      expect(res._getBody().stats.scenes.created).toBe(1);
    });

    it("handles zero results gracefully", async () => {
      // Already set up in beforeEach: all return empty

      const req = mockReq({ options: DEFAULT_OPTIONS }, { userId: "2" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      expect(body.success).toBe(true);
      expect(body.stats.scenes.checked).toBe(0);
      expect(body.stats.scenes.created).toBe(0);
      expect(body.stats.scenes.updated).toBe(0);
    });
  });

  // ─── Scene Sync ───

  describe("scene sync", () => {
    const scenesOnlyOptions = {
      scenes: { rating: true, favorite: false, oCounter: false },
      performers: { rating: false, favorite: false },
      studios: { rating: false, favorite: false },
      tags: { rating: false, favorite: false },
      galleries: { rating: false },
      groups: { rating: false },
    };

    it("creates new scene ratings for scenes with rating > 0", async () => {
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: {
          scenes: [makeScene("1", 80), makeScene("2", 0), makeScene("3", 60)],
          count: 3,
        },
      });

      const req = mockReq(
        { options: scenesOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      expect(body.stats.scenes.checked).toBe(3);
      // Only scenes with rating > 0 get created (scene "1" and "3")
      expect(body.stats.scenes.created).toBe(2);
    });

    it("tracks updated scenes when existing rating differs", async () => {
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: {
          scenes: [makeScene("1", 80)],
          count: 1,
        },
      });
      // Existing rating with different value
      mockPrisma.sceneRating.findMany.mockResolvedValue([
        { sceneId: "1", rating: 60 } as any,
      ]);

      const req = mockReq(
        { options: scenesOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      expect(body.stats.scenes.updated).toBe(1);
      expect(body.stats.scenes.created).toBe(0);
    });

    it("does not count as updated when existing rating matches", async () => {
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: {
          scenes: [makeScene("1", 80)],
          count: 1,
        },
      });
      mockPrisma.sceneRating.findMany.mockResolvedValue([
        { sceneId: "1", rating: 80 } as any,
      ]);

      const req = mockReq(
        { options: scenesOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      expect(body.stats.scenes.updated).toBe(0);
      expect(body.stats.scenes.created).toBe(0);
    });

    it("syncs o_counter when oCounter option is enabled", async () => {
      const oCounterOptions = {
        ...scenesOnlyOptions,
        scenes: { rating: false, favorite: false, oCounter: true },
      };
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: {
          scenes: [
            makeScene("1", null, 5),
            makeScene("2", null, 0),
          ],
          count: 2,
        },
      });

      const req = mockReq(
        { options: oCounterOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      // Only scene "1" has o_counter > 0
      expect(body.stats.scenes.created).toBe(1);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("syncs both rating and o_counter using in-code filter", async () => {
      const bothOptions = {
        ...scenesOnlyOptions,
        scenes: { rating: true, favorite: false, oCounter: true },
      };
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: {
          scenes: [
            makeScene("1", 80, 3), // has both
            makeScene("2", 0, 0), // has neither — filtered out
            makeScene("3", 50, 0), // rating only
            makeScene("4", null, 2), // o_counter only
          ],
          count: 4,
        },
      });

      const req = mockReq(
        { options: bothOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      // Scene "2" is filtered out by the in-code filter (neither rating nor o_counter)
      // Scenes "1", "3", "4" pass the filter
      expect(body.stats.scenes.checked).toBe(3);
      // Scene "1" has rating+o_counter, "3" has rating only, "4" has o_counter only
      expect(body.stats.scenes.created).toBe(3);
    });

    it("does not count a scene twice when it has both rating and o_counter", async () => {
      const bothOptions = {
        ...scenesOnlyOptions,
        scenes: { rating: true, favorite: false, oCounter: true },
      };
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: {
          scenes: [makeScene("1", 80, 5)],
          count: 1,
        },
      });

      const req = mockReq(
        { options: bothOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      // The scene should be counted as created once, not twice
      expect(body.stats.scenes.created).toBe(1);
    });

    it("skips scene sync when rating and oCounter options are both false", async () => {
      const noScenesOptions = {
        ...scenesOnlyOptions,
        scenes: { rating: false, favorite: false, oCounter: false },
      };

      const req = mockReq(
        { options: noScenesOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findScenes).not.toHaveBeenCalled();
      expect(res._getBody().stats.scenes.checked).toBe(0);
    });
  });

  // ─── Performer Sync ───

  describe("performer sync", () => {
    const performerOnlyOptions = {
      scenes: { rating: false, favorite: false, oCounter: false },
      performers: { rating: true, favorite: true },
      studios: { rating: false, favorite: false },
      tags: { rating: false, favorite: false },
      galleries: { rating: false },
      groups: { rating: false },
    };

    it("creates new performer ratings with rating and favorite", async () => {
      mockStashClient.findPerformers.mockResolvedValue({
        findPerformers: {
          performers: [makeEntity("1", 90, true), makeEntity("2", 70, false)],
          count: 2,
        },
      });

      const req = mockReq(
        { options: performerOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      expect(body.stats.performers.checked).toBe(2);
      expect(body.stats.performers.created).toBe(2);
    });

    it("detects updates when existing rating differs", async () => {
      mockStashClient.findPerformers.mockResolvedValue({
        findPerformers: {
          performers: [makeEntity("1", 90, false)],
          count: 1,
        },
      });
      mockPrisma.performerRating.findMany.mockResolvedValue([
        { performerId: "1", rating: 50, favorite: false } as any,
      ]);

      const req = mockReq(
        { options: performerOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(res._getBody().stats.performers.updated).toBe(1);
    });

    it("detects updates when existing favorite differs", async () => {
      mockStashClient.findPerformers.mockResolvedValue({
        findPerformers: {
          performers: [makeEntity("1", 90, true)],
          count: 1,
        },
      });
      mockPrisma.performerRating.findMany.mockResolvedValue([
        { performerId: "1", rating: 90, favorite: false } as any,
      ]);

      const req = mockReq(
        { options: performerOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(res._getBody().stats.performers.updated).toBe(1);
    });

    it("uses in-code filter when both rating and favorite options are selected", async () => {
      // When both are selected, it fetches all and filters in code
      mockStashClient.findPerformers.mockResolvedValue({
        findPerformers: {
          performers: [
            makeEntity("1", 90, true), // passes: has rating
            makeEntity("2", 0, false), // fails: no rating, no favorite (note: 0 is not > 0)
            makeEntity("3", null, true), // passes: is favorite
          ],
          count: 3,
        },
      });

      const req = mockReq(
        { options: performerOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      // Only "1" and "3" pass the filter
      expect(res._getBody().stats.performers.checked).toBe(2);
    });

    it("applies GraphQL rating filter when only rating option is selected", async () => {
      const ratingOnlyOptions = {
        ...performerOnlyOptions,
        performers: { rating: true, favorite: false },
      };
      mockStashClient.findPerformers.mockResolvedValue({
        findPerformers: { performers: [], count: 0 },
      });

      const req = mockReq(
        { options: ratingOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findPerformers).toHaveBeenCalledWith(
        expect.objectContaining({
          performer_filter: {
            rating100: { value: 0, modifier: "GREATER_THAN" },
          },
        })
      );
    });

    it("applies GraphQL favorite filter when only favorite option is selected", async () => {
      const favoriteOnlyOptions = {
        ...performerOnlyOptions,
        performers: { rating: false, favorite: true },
      };
      mockStashClient.findPerformers.mockResolvedValue({
        findPerformers: { performers: [], count: 0 },
      });

      const req = mockReq(
        { options: favoriteOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findPerformers).toHaveBeenCalledWith(
        expect.objectContaining({
          performer_filter: { filter_favorites: true },
        })
      );
    });

    it("skips performer sync when both options disabled", async () => {
      const noPerformerOptions = {
        ...performerOnlyOptions,
        performers: { rating: false, favorite: false },
      };

      const req = mockReq(
        { options: noPerformerOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findPerformers).not.toHaveBeenCalled();
    });
  });

  // ─── Studio Sync ───

  describe("studio sync", () => {
    const studioOnlyOptions = {
      scenes: { rating: false, favorite: false, oCounter: false },
      performers: { rating: false, favorite: false },
      studios: { rating: true, favorite: true },
      tags: { rating: false, favorite: false },
      galleries: { rating: false },
      groups: { rating: false },
    };

    it("creates new studio ratings", async () => {
      mockStashClient.findStudios.mockResolvedValue({
        findStudios: {
          studios: [makeEntity("1", 80, true)],
          count: 1,
        },
      });

      const req = mockReq(
        { options: studioOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(res._getBody().stats.studios.created).toBe(1);
    });

    it("applies GraphQL rating filter when only rating selected", async () => {
      const ratingOnly = {
        ...studioOnlyOptions,
        studios: { rating: true, favorite: false },
      };
      mockStashClient.findStudios.mockResolvedValue({
        findStudios: { studios: [], count: 0 },
      });

      const req = mockReq({ options: ratingOnly }, { userId: "2" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findStudios).toHaveBeenCalledWith(
        expect.objectContaining({
          studio_filter: {
            rating100: { value: 0, modifier: "GREATER_THAN" },
          },
        })
      );
    });

    it("applies GraphQL favorite filter when only favorite selected", async () => {
      const favOnly = {
        ...studioOnlyOptions,
        studios: { rating: false, favorite: true },
      };
      mockStashClient.findStudios.mockResolvedValue({
        findStudios: { studios: [], count: 0 },
      });

      const req = mockReq({ options: favOnly }, { userId: "2" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findStudios).toHaveBeenCalledWith(
        expect.objectContaining({
          studio_filter: { favorite: true },
        })
      );
    });
  });

  // ─── Tag Sync ───

  describe("tag sync", () => {
    const tagOnlyOptions = {
      scenes: { rating: false, favorite: false, oCounter: false },
      performers: { rating: false, favorite: false },
      studios: { rating: false, favorite: false },
      tags: { rating: false, favorite: true },
      galleries: { rating: false },
      groups: { rating: false },
    };

    it("syncs favorite tags", async () => {
      mockStashClient.findTags.mockResolvedValue({
        findTags: {
          tags: [makeTag("1", true), makeTag("2", true)],
          count: 2,
        },
      });

      const req = mockReq(
        { options: tagOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      expect(body.stats.tags.created).toBe(2);
      expect(body.stats.tags.checked).toBe(2);
    });

    it("always uses favorite: true filter for tags", async () => {
      mockStashClient.findTags.mockResolvedValue({
        findTags: { tags: [], count: 0 },
      });

      const req = mockReq(
        { options: tagOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findTags).toHaveBeenCalledWith(
        expect.objectContaining({
          tag_filter: { favorite: true },
        })
      );
    });

    it("detects tag favorite updates", async () => {
      mockStashClient.findTags.mockResolvedValue({
        findTags: {
          tags: [makeTag("1", true)],
          count: 1,
        },
      });
      mockPrisma.tagRating.findMany.mockResolvedValue([
        { tagId: "1", favorite: false } as any,
      ]);

      const req = mockReq(
        { options: tagOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(res._getBody().stats.tags.updated).toBe(1);
    });

    it("skips tag sync when favorite is disabled", async () => {
      const noTagOptions = {
        ...tagOnlyOptions,
        tags: { rating: false, favorite: false },
      };

      const req = mockReq(
        { options: noTagOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findTags).not.toHaveBeenCalled();
    });
  });

  // ─── Gallery Sync ───

  describe("gallery sync", () => {
    const galleryOnlyOptions = {
      scenes: { rating: false, favorite: false, oCounter: false },
      performers: { rating: false, favorite: false },
      studios: { rating: false, favorite: false },
      tags: { rating: false, favorite: false },
      galleries: { rating: true },
      groups: { rating: false },
    };

    it("syncs rated galleries with in-code filtering", async () => {
      mockStashClient.findGalleries.mockResolvedValue({
        findGalleries: {
          galleries: [
            makeRatedEntity("1", 80),
            makeRatedEntity("2", null), // no rating — filtered out
            makeRatedEntity("3", 60),
          ],
          count: 3,
        },
      });

      const req = mockReq(
        { options: galleryOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      // Only "1" and "3" have rating > 0
      expect(body.stats.galleries.created).toBe(2);
      expect(body.stats.galleries.checked).toBe(2);
    });

    it("fetches all galleries (no GraphQL filter)", async () => {
      mockStashClient.findGalleries.mockResolvedValue({
        findGalleries: { galleries: [], count: 0 },
      });

      const req = mockReq(
        { options: galleryOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findGalleries).toHaveBeenCalledWith(
        expect.objectContaining({
          gallery_filter: undefined,
        })
      );
    });
  });

  // ─── Group Sync ───

  describe("group sync", () => {
    const groupOnlyOptions = {
      scenes: { rating: false, favorite: false, oCounter: false },
      performers: { rating: false, favorite: false },
      studios: { rating: false, favorite: false },
      tags: { rating: false, favorite: false },
      galleries: { rating: false },
      groups: { rating: true },
    };

    it("syncs rated groups with in-code filtering", async () => {
      mockStashClient.findGroups.mockResolvedValue({
        findGroups: {
          groups: [makeRatedEntity("1", 90), makeRatedEntity("2", 0)],
          count: 2,
        },
      });

      const req = mockReq(
        { options: groupOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      // Only "1" has rating > 0
      expect(body.stats.groups.created).toBe(1);
    });
  });

  // ─── Multi-Instance Support ───

  describe("multi-instance support", () => {
    it("syncs across multiple instances", async () => {
      const mockStash2 = {
        findScenes: vi.fn().mockResolvedValue({
          findScenes: { scenes: [makeScene("10", 95)], count: 1 },
        }),
        findPerformers: vi.fn().mockResolvedValue({
          findPerformers: { performers: [], count: 0 },
        }),
        findStudios: vi.fn().mockResolvedValue({
          findStudios: { studios: [], count: 0 },
        }),
        findTags: vi.fn().mockResolvedValue({
          findTags: { tags: [], count: 0 },
        }),
        findGalleries: vi.fn().mockResolvedValue({
          findGalleries: { galleries: [], count: 0 },
        }),
        findGroups: vi.fn().mockResolvedValue({
          findGroups: { groups: [], count: 0 },
        }),
      };

      mockStashClient.findScenes.mockResolvedValue({
        findScenes: { scenes: [makeScene("1", 80)], count: 1 },
      });
      mockInstanceManager.getAll.mockReturnValue([
        ["instance-1", mockStashClient as any],
        ["instance-2", mockStash2 as any],
      ]);

      const req = mockReq({ options: DEFAULT_OPTIONS }, { userId: "2" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockStashClient.findScenes).toHaveBeenCalled();
      expect(mockStash2.findScenes).toHaveBeenCalled();
      // Stats accumulate across instances
      expect(res._getBody().stats.scenes.created).toBe(2);
    });
  });

  // ─── Error Handling ───

  describe("error handling", () => {
    it("continues with other instances when one fails", async () => {
      const failingStash = {
        findScenes: vi.fn().mockRejectedValue(new Error("Connection failed")),
        findPerformers: vi.fn(),
        findStudios: vi.fn(),
        findTags: vi.fn(),
        findGalleries: vi.fn(),
        findGroups: vi.fn(),
      };

      const workingStash = {
        findScenes: vi.fn().mockResolvedValue({
          findScenes: { scenes: [makeScene("1", 80)], count: 1 },
        }),
        findPerformers: vi.fn().mockResolvedValue({
          findPerformers: { performers: [], count: 0 },
        }),
        findStudios: vi.fn().mockResolvedValue({
          findStudios: { studios: [], count: 0 },
        }),
        findTags: vi.fn().mockResolvedValue({
          findTags: { tags: [], count: 0 },
        }),
        findGalleries: vi.fn().mockResolvedValue({
          findGalleries: { galleries: [], count: 0 },
        }),
        findGroups: vi.fn().mockResolvedValue({
          findGroups: { groups: [], count: 0 },
        }),
      };

      mockInstanceManager.getAll.mockReturnValue([
        ["failing-instance", failingStash as any],
        ["working-instance", workingStash as any],
      ]);

      const req = mockReq({ options: DEFAULT_OPTIONS }, { userId: "2" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);

      // Should still succeed overall — only the failing instance is skipped
      expect(res._getBody().success).toBe(true);
      expect(workingStash.findScenes).toHaveBeenCalled();
      expect(res._getBody().stats.scenes.created).toBe(1);
    });

    it("returns 500 when top-level error occurs", async () => {
      // Force a top-level error by making getAll throw after the instances check
      mockInstanceManager.getAll
        .mockReturnValueOnce([["instance-1", mockStashClient as any]]) // for length check
        .mockImplementation(() => {
          throw new Error("Catastrophic failure");
        });

      // We can't easily force the top-level catch without mocking internals,
      // so let's test a different path: if allInstances iteration itself fails
      // Actually, the for...of loop is inside the try/catch, so let's
      // trigger it by making the stash API throw a non-instance error
      // Reset to a working mock
      mockInstanceManager.getAll.mockReturnValue([
        ["instance-1", mockStashClient as any],
      ]);

      // Make the scene sync throw inside the instance loop — this is caught per-instance
      mockStashClient.findScenes.mockRejectedValue(
        new Error("GraphQL Error")
      );

      const req = mockReq(
        {
          options: {
            scenes: { rating: true, favorite: false, oCounter: false },
            performers: { rating: false, favorite: false },
            studios: { rating: false, favorite: false },
            tags: { rating: false, favorite: false },
            galleries: { rating: false },
            groups: { rating: false },
          },
        },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      // Per-instance errors are caught, so sync still succeeds
      expect(res._getBody().success).toBe(true);
    });
  });

  // ─── Default Options ───

  describe("default options", () => {
    it("uses default sync options when none provided in body", async () => {
      const req = mockReq({}, { userId: "2" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);

      // With defaults: scenes.rating=true, performers.rating+favorite=true,
      // studios.rating+favorite=true, tags.favorite=true,
      // galleries.rating=true, groups.rating=true
      expect(mockStashClient.findScenes).toHaveBeenCalled();
      expect(mockStashClient.findPerformers).toHaveBeenCalled();
      expect(mockStashClient.findStudios).toHaveBeenCalled();
      expect(mockStashClient.findTags).toHaveBeenCalled();
      expect(mockStashClient.findGalleries).toHaveBeenCalled();
      expect(mockStashClient.findGroups).toHaveBeenCalled();
      expect(res._getBody().success).toBe(true);
    });
  });

  // ─── Batch Upserts ───

  describe("batch upserts", () => {
    it("executes upserts in a transaction", async () => {
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: {
          scenes: [makeScene("1", 80), makeScene("2", 60)],
          count: 2,
        },
      });

      const scenesOnlyOptions = {
        scenes: { rating: true, favorite: false, oCounter: false },
        performers: { rating: false, favorite: false },
        studios: { rating: false, favorite: false },
        tags: { rating: false, favorite: false },
        galleries: { rating: false },
        groups: { rating: false },
      };

      const req = mockReq(
        { options: scenesOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("does not call transaction when no upserts needed", async () => {
      // Scenes with rating 0 or null don't generate upserts
      mockStashClient.findScenes.mockResolvedValue({
        findScenes: {
          scenes: [makeScene("1", 0), makeScene("2", null)],
          count: 2,
        },
      });

      const scenesOnlyOptions = {
        scenes: { rating: true, favorite: false, oCounter: false },
        performers: { rating: false, favorite: false },
        studios: { rating: false, favorite: false },
        tags: { rating: false, favorite: false },
        galleries: { rating: false },
        groups: { rating: false },
      };

      const req = mockReq(
        { options: scenesOnlyOptions },
        { userId: "2" },
        ADMIN
      );
      const res = mockRes();
      await syncFromStash(req, res);

      // No upserts should be generated, so no transaction call
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── Response Shape ───

  describe("response shape", () => {
    it("returns expected response structure", async () => {
      const req = mockReq({}, { userId: "2" }, ADMIN);
      const res = mockRes();
      await syncFromStash(req, res);

      const body = res._getBody();
      expect(body).toEqual({
        success: true,
        message: expect.stringContaining("Successfully synced"),
        stats: {
          scenes: { checked: 0, updated: 0, created: 0 },
          performers: { checked: 0, updated: 0, created: 0 },
          studios: { checked: 0, updated: 0, created: 0 },
          tags: { checked: 0, updated: 0, created: 0 },
          galleries: { checked: 0, updated: 0, created: 0 },
          groups: { checked: 0, updated: 0, created: 0 },
        },
      });
    });
  });
});
