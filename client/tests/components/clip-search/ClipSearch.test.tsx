/**
 * The Clips page sends what its filter panel builds: every parameter of
 * `buildClipFilter`, the tag, scene tag and performer modifiers included,
 * reaches `getClips` (item 38; the server's contract test maps the same
 * parameters, so a parameter the page dropped would pass there unseen).
 * The wall cog's Preview Behavior saves the user's wall playback and the
 * wall plays by it at once (LG-10, item 52).
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import ClipSearch from "@/components/clip-search/ClipSearch";
import type * as ui from "@/components/ui/index";
import { buildClipFilter } from "@/utils/filterConfig";

const { mockGetClips, mockApiGet, mockApiPut, panelQuery, realControls } =
  vi.hoisted(() => ({
    mockGetClips: vi.fn(),
    mockApiGet: vi.fn(),
    mockApiPut: vi.fn(),
    panelQuery: { current: {} as Record<string, unknown> },
    // The wall-playback case renders the real SearchControls
    realControls: { current: false },
  }));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getClips: mockGetClips,
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

// happy-dom lays nothing out, so the album measures a zero width and renders
// no photo: lay each photo out at a fixed size through the wall's renderer
vi.mock("react-photo-album", () => ({
  RowsPhotoAlbum: ({
    photos,
    render,
  }: {
    photos: { key: string }[];
    render: {
      photo: (
        props: unknown,
        context: { photo: { key: string }; width: number; height: number }
      ) => React.ReactNode;
    };
  }) => (
    <div>
      {photos.map((photo) => (
        <React.Fragment key={photo.key}>
          {render.photo({}, { photo, width: 320, height: 180 })}
        </React.Fragment>
      ))}
    </div>
  ),
}));

// The real SearchControls' toolbar reads these
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({}),
    updateSettings: vi.fn(),
    isLoading: false,
  }),
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

// The panel, as SearchControls sends it: one query on mount (the page's
// handler changes identity every render, so the stub fires once)
vi.mock("@/components/ui/index", async (importOriginal) => {
  const actual = await importOriginal<typeof ui>();
  const PanelStub = ({
    onQueryChange,
  }: {
    onQueryChange?: ((query: Record<string, unknown>) => void) | undefined;
  }) => {
    const fired = React.useRef(false);
    React.useEffect(() => {
      if (fired.current) return;
      fired.current = true;
      onQueryChange?.(panelQuery.current);
    }, [onQueryChange]);
    return null;
  };
  return {
    ...actual,
    SearchControls: (
      props: React.ComponentProps<typeof actual.SearchControls>
    ) =>
      realControls.current ? (
        <actual.SearchControls {...props} />
      ) : (
        <PanelStub onQueryChange={props.onQueryChange} />
      ),
  };
});

describe("ClipSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realControls.current = false;
    mockGetClips.mockResolvedValue({ clips: [], total: 0 });
    mockApiGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/user/settings"
          ? userSettingsResponse({ wallPlayback: "static" })
          : { presets: {}, defaults: {} }
      )
    );
    mockApiPut.mockResolvedValue({ success: true });
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
      { wrapper: SignedInWithQuery }
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
      { wrapper: SignedInWithQuery }
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

  describe("wall playback", () => {
    const play = vi.fn(() => Promise.resolve());

    beforeEach(() => {
      realControls.current = true;
      vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
        () => {}
      );
      mockGetClips.mockResolvedValue({
        clips: [
          {
            id: "7",
            instanceId: "server-a",
            sceneId: "3",
            seconds: 12,
            title: "A clip",
            isGenerated: true,
            scene: { title: "A scene", files: [{ width: 1920, height: 1080 }] },
          },
        ],
        total: 1,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("choosing Play on Hover in the wall cog makes wall items play on hover", async () => {
      render(
        <MemoryRouter initialEntries={["/clips?view=wall"]}>
          <ClipSearch />
        </MemoryRouter>,
        { wrapper: SignedInWithQuery }
      );
      // Static: the wall shows no preview video
      await screen.findByText("A clip");
      expect(document.querySelector(".wall-item video")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "View settings" }));
      fireEvent.change(await screen.findByLabelText("Preview Behavior"), {
        target: { value: "hover" },
      });
      await waitFor(() =>
        expect(mockApiPut).toHaveBeenCalledWith("/user/settings", {
          wallPlayback: "hover",
        })
      );

      const item = must(
        await waitFor(() => {
          const video = document.querySelector(".wall-item video");
          expect(video).not.toBeNull();
          return video?.closest<HTMLElement>(".wall-item");
        }),
        "the wall item"
      );
      expect(play).not.toHaveBeenCalled();
      fireEvent.mouseEnter(item);
      await waitFor(() => expect(play).toHaveBeenCalled());
    });
  });
});
