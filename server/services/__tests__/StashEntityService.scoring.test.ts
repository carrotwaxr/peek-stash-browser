import { describe, it, expect, beforeEach, vi } from "vitest";
import prisma from "../../prisma/singleton.js";

// Mock prisma before importing the service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
  },
}));

// Import after mocking
import { stashEntityService } from "../StashEntityService.js";

describe("StashEntityService.getScenesForScoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return lightweight scoring data for all scenes", async () => {
    const mockRows = [
      {
        id: "scene-1",
        studioId: "studio-1",
        oCounter: 5,
        date: "2024-01-15",
        performerIds: "perf-1,perf-2",
        tagIds: "tag-1,tag-2,tag-3",
      },
      {
        id: "scene-2",
        studioId: null,
        oCounter: 0,
        date: null,
        performerIds: "",
        tagIds: "tag-1",
      },
    ];

    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(mockRows);

    const result = await stashEntityService.getScenesForScoring();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "scene-1",
      studioId: "studio-1",
      performerIds: ["perf-1", "perf-2"],
      tagIds: ["tag-1", "tag-2", "tag-3"],
      oCounter: 5,
      date: "2024-01-15",
    });
    expect(result[1]).toEqual({
      id: "scene-2",
      studioId: null,
      performerIds: [],
      tagIds: ["tag-1"],
      oCounter: 0,
      date: null,
    });
  });

  it("should return empty array when no scenes exist", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);

    const result = await stashEntityService.getScenesForScoring();

    expect(result).toEqual([]);
  });
});
