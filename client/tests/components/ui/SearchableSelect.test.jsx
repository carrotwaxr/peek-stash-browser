/**
 * SearchableSelect - fetchItemsByIds instance-scoped API calls
 *
 * Tests that when SearchableSelect resolves selected entity names from
 * composite "id:instanceId" keys, it groups values by instanceId and
 * passes instance_id in the entity-specific filter to avoid ambiguous
 * lookups on multi-instance setups.
 */
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks (available before vi.mock factory runs) ---

const {
  mockFindTags,
  mockFindPerformers,
  mockFindStudios,
  mockFindGroups,
  mockFindGalleries,
} = vi.hoisted(() => ({
  mockFindTags: vi.fn(),
  mockFindPerformers: vi.fn(),
  mockFindStudios: vi.fn(),
  mockFindGroups: vi.fn(),
  mockFindGalleries: vi.fn(),
}));

// Mock filterCache so localStorage is never hit
vi.mock("../../../src/utils/filterCache.js", () => ({
  getCache: vi.fn().mockReturnValue(null),
  setCache: vi.fn(),
}));

// Mock useDebounce to return value immediately (no delay)
vi.mock("../../../src/hooks/useDebounce.js", () => ({
  useDebouncedValue: (value) => value,
}));

vi.mock("../../../src/services/api.js", () => ({
  libraryApi: {
    findTags: mockFindTags,
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findPerformers: mockFindPerformers,
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudios: mockFindStudios,
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findGroups: mockFindGroups,
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
    findGalleries: mockFindGalleries,
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
}));

// Import after mocks are set up
import SearchableSelect from "../../../src/components/ui/SearchableSelect.jsx";

// --- Helpers ---

/** Default empty response for find* API methods */
const emptyTagsResponse = { findTags: { tags: [] } };
const emptyPerformersResponse = { findPerformers: { performers: [] } };

/** Creates a findTags response with given tags */
const makeTagsResponse = (tags) => ({
  findTags: { tags },
});

const makePerformersResponse = (performers) => ({
  findPerformers: { performers },
});

const makeStudiosResponse = (studios) => ({
  findStudios: { studios },
});

const makeGroupsResponse = (groups) => ({
  findGroups: { groups },
});

const makeGalleriesResponse = (galleries) => ({
  findGalleries: { galleries },
});

// --- Tests ---

describe("SearchableSelect fetchItemsByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all find* return empty
    mockFindTags.mockResolvedValue(emptyTagsResponse);
    mockFindPerformers.mockResolvedValue(emptyPerformersResponse);
    mockFindStudios.mockResolvedValue({ findStudios: { studios: [] } });
    mockFindGroups.mockResolvedValue({ findGroups: { groups: [] } });
    mockFindGalleries.mockResolvedValue({ findGalleries: { galleries: [] } });
  });

  it("passes instance filter when resolving composite key values", async () => {
    mockFindTags.mockResolvedValue(
      makeTagsResponse([{ id: "82", instanceId: "instance-abc", name: "Outdoor" }])
    );

    render(
      <SearchableSelect
        entityType="tags"
        value={["82:instance-abc"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindTags).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ["82"],
          tag_filter: { instance_id: "instance-abc" },
        })
      );
    });
  });

  it("groups multiple values by instanceId and makes separate calls", async () => {
    mockFindTags
      .mockResolvedValueOnce(
        makeTagsResponse([{ id: "82", instanceId: "inst-1", name: "Tag A" }])
      )
      .mockResolvedValueOnce(
        makeTagsResponse([{ id: "15", instanceId: "inst-2", name: "Tag B" }])
      );

    render(
      <SearchableSelect
        entityType="tags"
        value={["82:inst-1", "15:inst-2"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindTags).toHaveBeenCalledTimes(2);
    });

    // Verify each call was scoped to its instance
    const calls = mockFindTags.mock.calls;
    const callArgs = calls.map((c) => c[0]);

    expect(callArgs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ids: ["82"],
          tag_filter: { instance_id: "inst-1" },
        }),
        expect.objectContaining({
          ids: ["15"],
          tag_filter: { instance_id: "inst-2" },
        }),
      ])
    );
  });

  it("works with bare IDs (no instance) for backward compatibility", async () => {
    mockFindTags.mockResolvedValue(
      makeTagsResponse([{ id: "82", name: "Classic" }])
    );

    render(
      <SearchableSelect
        entityType="tags"
        value={["82"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindTags).toHaveBeenCalledWith(
        expect.objectContaining({ ids: ["82"] })
      );
    });

    // Should NOT have a tag_filter with instance_id
    const callArg = mockFindTags.mock.calls.find(
      (c) => c[0].ids && c[0].ids.includes("82")
    )?.[0];
    expect(callArg).toBeDefined();
    expect(callArg.tag_filter).toBeUndefined();
  });

  it("handles multiple IDs from same instance in one call", async () => {
    mockFindTags.mockResolvedValue(
      makeTagsResponse([
        { id: "82", instanceId: "inst-1", name: "Tag A" },
        { id: "15", instanceId: "inst-1", name: "Tag B" },
      ])
    );

    render(
      <SearchableSelect
        entityType="tags"
        value={["82:inst-1", "15:inst-1"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindTags).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: expect.arrayContaining(["82", "15"]),
          tag_filter: { instance_id: "inst-1" },
        })
      );
    });

    // Should only make ONE call for this instance group
    const instanceCalls = mockFindTags.mock.calls.filter(
      (c) => c[0].tag_filter?.instance_id === "inst-1"
    );
    expect(instanceCalls).toHaveLength(1);
  });

  it("works with performers entity type and instance filter", async () => {
    mockFindPerformers.mockResolvedValue(
      makePerformersResponse([{ id: "5", instanceId: "inst-x", name: "Jane" }])
    );

    render(
      <SearchableSelect
        entityType="performers"
        value={["5:inst-x"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindPerformers).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ["5"],
          performer_filter: { instance_id: "inst-x" },
        })
      );
    });
  });

  it("works with studios entity type and instance filter", async () => {
    mockFindStudios.mockResolvedValue(
      makeStudiosResponse([{ id: "3", instanceId: "inst-y", name: "Studio Z" }])
    );

    render(
      <SearchableSelect
        entityType="studios"
        value={["3:inst-y"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindStudios).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ["3"],
          studio_filter: { instance_id: "inst-y" },
        })
      );
    });
  });

  it("works with groups entity type and instance filter", async () => {
    mockFindGroups.mockResolvedValue(
      makeGroupsResponse([{ id: "7", instanceId: "inst-z", name: "Group G" }])
    );

    render(
      <SearchableSelect
        entityType="groups"
        value={["7:inst-z"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindGroups).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ["7"],
          group_filter: { instance_id: "inst-z" },
        })
      );
    });
  });

  it("works with galleries entity type and instance filter", async () => {
    mockFindGalleries.mockResolvedValue(
      makeGalleriesResponse([{ id: "10", instanceId: "inst-g", name: "Gallery X" }])
    );

    render(
      <SearchableSelect
        entityType="galleries"
        value={["10:inst-g"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindGalleries).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: ["10"],
          gallery_filter: { instance_id: "inst-g" },
        })
      );
    });
  });

  it("handles mixed bare and composite keys", async () => {
    // Two calls expected: one for inst-1 group, one for bare group
    mockFindTags
      .mockResolvedValueOnce(
        makeTagsResponse([{ id: "82", instanceId: "inst-1", name: "Tag A" }])
      )
      .mockResolvedValueOnce(
        makeTagsResponse([{ id: "99", name: "Tag C" }])
      );

    render(
      <SearchableSelect
        entityType="tags"
        value={["82:inst-1", "99"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindTags).toHaveBeenCalledTimes(2);
    });

    const calls = mockFindTags.mock.calls.map((c) => c[0]);

    // One call with instance filter
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ids: ["82"],
          tag_filter: { instance_id: "inst-1" },
        }),
      ])
    );

    // One call without instance filter (bare IDs)
    const bareCall = calls.find((c) => !c.tag_filter);
    expect(bareCall).toBeDefined();
    expect(bareCall.ids).toEqual(["99"]);
  });

  it("deduplicates IDs within the same instance group", async () => {
    mockFindTags.mockResolvedValue(
      makeTagsResponse([{ id: "82", instanceId: "inst-1", name: "Tag A" }])
    );

    render(
      <SearchableSelect
        entityType="tags"
        value={["82:inst-1", "82:inst-1"]}
        onChange={vi.fn()}
        multi
      />
    );

    await waitFor(() => {
      expect(mockFindTags).toHaveBeenCalled();
    });

    // Should deduplicate: only one "82" in the ids array
    const callArg = mockFindTags.mock.calls[0][0];
    expect(callArg.ids).toEqual(["82"]);
  });

  it("returns partial results when one instance group fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // inst-1 succeeds, inst-2 fails
    mockFindTags
      .mockResolvedValueOnce(
        makeTagsResponse([{ id: "82", instanceId: "inst-1", name: "Tag A" }])
      )
      .mockRejectedValueOnce(new Error("Instance unreachable"));

    const { container } = render(
      <SearchableSelect
        entityType="tags"
        value={["82:inst-1", "15:inst-2"]}
        onChange={vi.fn()}
        multi
      />
    );

    // Wait for the successful result to render as a chip
    await waitFor(() => {
      expect(mockFindTags).toHaveBeenCalledTimes(2);
    });

    // Should log the error for the failed group
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error fetching tags by IDs"),
        expect.any(Error)
      );
    });

    // The successful instance's tag should still render
    await waitFor(() => {
      const text = container.textContent;
      expect(text).toContain("Tag A");
    });

    consoleSpy.mockRestore();
  });

  it("returns empty array for unsupported entity type", async () => {
    render(
      <SearchableSelect
        entityType="unsupported"
        value={["1:inst-1"]}
        onChange={vi.fn()}
        multi
      />
    );

    // None of the API methods should be called
    await waitFor(() => {
      expect(mockFindTags).not.toHaveBeenCalled();
      expect(mockFindPerformers).not.toHaveBeenCalled();
      expect(mockFindStudios).not.toHaveBeenCalled();
    });
  });
});
