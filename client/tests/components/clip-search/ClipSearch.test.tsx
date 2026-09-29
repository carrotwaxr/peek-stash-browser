/**
 * The Clips page sends what its filter panel builds: every parameter of
 * `buildClipFilter`, the tag, scene tag and performer modifiers included,
 * reaches `getClips` (item 38; the server's contract test maps the same
 * parameters, so a parameter the page dropped would pass there unseen).
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, waitFor } from "@testing-library/react";
import { createQueryWrapper, must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import ClipSearch from "@/components/clip-search/ClipSearch";
import type * as ui from "@/components/ui/index";
import { buildClipFilter } from "@/utils/filterConfig";

const { mockGetClips, panelQuery } = vi.hoisted(() => ({
  mockGetClips: vi.fn(),
  panelQuery: { current: {} as Record<string, unknown> },
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getClips: mockGetClips,
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

vi.mock("@/hooks/useTableColumns", () => ({
  useTableColumns: vi.fn(() => ({
    allColumns: [],
    visibleColumns: [],
    visibleColumnIds: [],
    columnOrder: [],
    toggleColumn: vi.fn(),
    hideColumn: vi.fn(),
    moveColumn: vi.fn(),
    getColumnConfig: vi.fn(() => ({})),
  })),
}));

vi.mock("@/hooks/useWallPlayback", () => ({
  useWallPlayback: vi.fn(() => ({
    wallPlayback: "static",
    updateWallPlayback: vi.fn(),
  })),
}));

// The panel, as SearchControls sends it: one query on mount (the page's
// handler changes identity every render, so the stub fires once)
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof ui>()),
  SearchControls: ({
    onQueryChange,
  }: {
    onQueryChange: (query: Record<string, unknown>) => void;
  }) => {
    const fired = React.useRef(false);
    React.useEffect(() => {
      if (fired.current) return;
      fired.current = true;
      onQueryChange(panelQuery.current);
    }, [onQueryChange]);
    return null;
  },
}));

describe("ClipSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClips.mockResolvedValue({ clips: [], total: 0 });
  });

  it("forwards every clip filter parameter, the modifiers included, to getClips", async () => {
    panelQuery.current = {
      filter: {
        direction: "ASC",
        page: 2,
        per_page: 48,
        q: "kiss",
        sort: "title",
      },
      clip_filter: buildClipFilter({
        tagIds: ["1:server-a"],
        tagIdsModifier: "INCLUDES_ALL",
        sceneTagIds: ["2:server-a"],
        sceneTagIdsModifier: "EXCLUDES",
        performerIds: ["3:server-a"],
        performerIdsModifier: "EXCLUDES",
        studioId: "4:server-a",
        isGenerated: "false",
      }),
    };

    render(
      <MemoryRouter>
        <ClipSearch permanentFilters={{ sceneId: "9:server-a" }} />
      </MemoryRouter>,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(mockGetClips).toHaveBeenCalled();
    });
    expect(must(mockGetClips.mock.calls[0])[0]).toEqual({
      page: 2,
      perPage: 48,
      sortBy: "title",
      sortDir: "asc",
      q: "kiss",
      tagIds: ["1:server-a"],
      tagIdsModifier: "INCLUDES_ALL",
      sceneTagIds: ["2:server-a"],
      sceneTagIdsModifier: "EXCLUDES",
      performerIds: ["3:server-a"],
      performerIdsModifier: "EXCLUDES",
      studioId: "4:server-a",
      isGenerated: false,
      sceneId: "9:server-a",
    });
  });

  it("asks for every clip when the panel picks All clips", async () => {
    panelQuery.current = {
      filter: { direction: "DESC", page: 1, per_page: 24, q: "" },
      clip_filter: buildClipFilter({ isGenerated: "all" }),
    };

    render(
      <MemoryRouter>
        <ClipSearch />
      </MemoryRouter>,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(mockGetClips).toHaveBeenCalled();
    });
    expect(must(mockGetClips.mock.calls[0])[0]).toEqual({
      page: 1,
      perPage: 24,
      sortBy: "stashCreatedAt",
      sortDir: "desc",
    });
  });
});
