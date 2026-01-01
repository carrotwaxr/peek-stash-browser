/**
 * Unit Tests for EntityImageCountService
 *
 * Tests the inherited image count calculation for performers, studios, and tags.
 * Verifies that gallery-inherited images are properly counted.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

// Mock StashInstanceManager
vi.mock("../StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: () => ({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: () => [],
    loadFromDatabase: async () => undefined,
  },
}));

// Mock Prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashPerformer: {
      findMany: vi.fn(),
    },
    stashStudio: {
      findMany: vi.fn(),
    },
    stashTag: {
      findMany: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

// Mock StashEntityService
vi.mock("../StashEntityService.js", () => ({
  stashEntityService: {
    getAllImages: vi.fn(),
  },
}));

import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../StashEntityService.js";
import { entityImageCountService } from "../EntityImageCountService.js";

const getMock = (fn: unknown): Mock => fn as Mock;

describe("EntityImageCountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rebuildPerformerImageCounts", () => {
    it("counts direct performer-image associations", async () => {
      // Setup: Performer "p1" is directly tagged on images
      getMock(prisma.stashPerformer.findMany).mockResolvedValue([
        { id: "p1" },
      ]);

      getMock(stashEntityService.getAllImages).mockResolvedValue([
        {
          id: "img1",
          performers: [{ id: "p1" }],
          galleries: [],
        },
        {
          id: "img2",
          performers: [{ id: "p1" }],
          galleries: [],
        },
        {
          id: "img3",
          performers: [{ id: "p2" }], // Different performer
          galleries: [],
        },
      ]);

      getMock(prisma.$executeRawUnsafe).mockResolvedValue(undefined);

      await entityImageCountService.rebuildPerformerImageCounts();

      // Should update with count of 2 (img1 and img2)
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN 'p1' THEN 2")
      );
    });

    it("counts gallery-inherited performer associations", async () => {
      // Setup: Performer "p1" is tagged on a gallery, not directly on images
      getMock(prisma.stashPerformer.findMany).mockResolvedValue([
        { id: "p1" },
      ]);

      getMock(stashEntityService.getAllImages).mockResolvedValue([
        {
          id: "img1",
          performers: [], // No direct performers
          galleries: [
            {
              id: "g1",
              performers: [{ id: "p1" }], // Performer on gallery
            },
          ],
        },
        {
          id: "img2",
          performers: [],
          galleries: [
            {
              id: "g1",
              performers: [{ id: "p1" }],
            },
          ],
        },
      ]);

      getMock(prisma.$executeRawUnsafe).mockResolvedValue(undefined);

      await entityImageCountService.rebuildPerformerImageCounts();

      // Should count both images via gallery inheritance
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN 'p1' THEN 2")
      );
    });

    it("counts both direct and inherited associations without duplicates", async () => {
      // Setup: Performer on both image directly AND on the gallery
      getMock(prisma.stashPerformer.findMany).mockResolvedValue([
        { id: "p1" },
      ]);

      getMock(stashEntityService.getAllImages).mockResolvedValue([
        {
          id: "img1",
          performers: [{ id: "p1" }], // Direct
          galleries: [
            {
              id: "g1",
              performers: [{ id: "p1" }], // Also on gallery
            },
          ],
        },
        {
          id: "img2",
          performers: [], // Only via gallery
          galleries: [
            {
              id: "g1",
              performers: [{ id: "p1" }],
            },
          ],
        },
        {
          id: "img3",
          performers: [{ id: "p1" }], // Direct only
          galleries: [],
        },
      ]);

      getMock(prisma.$executeRawUnsafe).mockResolvedValue(undefined);

      await entityImageCountService.rebuildPerformerImageCounts();

      // Should count 3 images (no duplicates)
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN 'p1' THEN 3")
      );
    });

    it("handles performers with zero images", async () => {
      getMock(prisma.stashPerformer.findMany).mockResolvedValue([
        { id: "p1" },
        { id: "p2" },
      ]);

      getMock(stashEntityService.getAllImages).mockResolvedValue([
        {
          id: "img1",
          performers: [{ id: "p1" }],
          galleries: [],
        },
      ]);

      getMock(prisma.$executeRawUnsafe).mockResolvedValue(undefined);

      await entityImageCountService.rebuildPerformerImageCounts();

      // p1 should have 1, p2 should have 0
      const call = getMock(prisma.$executeRawUnsafe).mock.calls[0][0];
      expect(call).toContain("WHEN 'p1' THEN 1");
      expect(call).toContain("WHEN 'p2' THEN 0");
    });
  });

  describe("rebuildStudioImageCounts", () => {
    it("counts direct studio-image associations", async () => {
      getMock(prisma.stashStudio.findMany).mockResolvedValue([
        { id: "s1" },
      ]);

      getMock(stashEntityService.getAllImages).mockResolvedValue([
        {
          id: "img1",
          studioId: "s1",
          galleries: [],
        },
        {
          id: "img2",
          studioId: "s1",
          galleries: [],
        },
      ]);

      getMock(prisma.$executeRawUnsafe).mockResolvedValue(undefined);

      await entityImageCountService.rebuildStudioImageCounts();

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN 's1' THEN 2")
      );
    });

    it("counts gallery-inherited studio associations", async () => {
      getMock(prisma.stashStudio.findMany).mockResolvedValue([
        { id: "s1" },
      ]);

      getMock(stashEntityService.getAllImages).mockResolvedValue([
        {
          id: "img1",
          studioId: null, // No direct studio
          galleries: [
            {
              id: "g1",
              studioId: "s1", // Studio on gallery
            },
          ],
        },
        {
          id: "img2",
          studioId: null,
          galleries: [
            {
              id: "g1",
              studioId: "s1",
            },
          ],
        },
      ]);

      getMock(prisma.$executeRawUnsafe).mockResolvedValue(undefined);

      await entityImageCountService.rebuildStudioImageCounts();

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN 's1' THEN 2")
      );
    });
  });

  describe("rebuildTagImageCounts", () => {
    it("counts direct tag-image associations", async () => {
      getMock(prisma.stashTag.findMany).mockResolvedValue([
        { id: "t1" },
      ]);

      getMock(stashEntityService.getAllImages).mockResolvedValue([
        {
          id: "img1",
          tags: [{ id: "t1" }],
          galleries: [],
        },
        {
          id: "img2",
          tags: [{ id: "t1" }, { id: "t2" }],
          galleries: [],
        },
      ]);

      getMock(prisma.$executeRawUnsafe).mockResolvedValue(undefined);

      await entityImageCountService.rebuildTagImageCounts();

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN 't1' THEN 2")
      );
    });

    it("counts gallery-inherited tag associations", async () => {
      getMock(prisma.stashTag.findMany).mockResolvedValue([
        { id: "t1" },
      ]);

      getMock(stashEntityService.getAllImages).mockResolvedValue([
        {
          id: "img1",
          tags: [],
          galleries: [
            {
              id: "g1",
              tags: [{ id: "t1" }],
            },
          ],
        },
      ]);

      getMock(prisma.$executeRawUnsafe).mockResolvedValue(undefined);

      await entityImageCountService.rebuildTagImageCounts();

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN 't1' THEN 1")
      );
    });
  });

  describe("rebuildAllImageCounts", () => {
    it("rebuilds counts for all entity types", async () => {
      getMock(prisma.stashPerformer.findMany).mockResolvedValue([]);
      getMock(prisma.stashStudio.findMany).mockResolvedValue([]);
      getMock(prisma.stashTag.findMany).mockResolvedValue([]);
      getMock(stashEntityService.getAllImages).mockResolvedValue([]);

      await entityImageCountService.rebuildAllImageCounts();

      // getAllImages should be called once (shared across all entity types)
      expect(stashEntityService.getAllImages).toHaveBeenCalledTimes(1);

      // All entity types should be queried
      expect(prisma.stashPerformer.findMany).toHaveBeenCalled();
      expect(prisma.stashStudio.findMany).toHaveBeenCalled();
      expect(prisma.stashTag.findMany).toHaveBeenCalled();
    });
  });
});
