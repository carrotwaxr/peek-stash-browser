/**
 * The Clips page on the list page shell: it sends what its filter panel
 * builds, every parameter of `buildClipFilter` with the modifiers, as
 * `getClips` takes it (item 38; the server's contract test maps the same
 * parameters, so a parameter the page dropped would pass there unseen); a
 * page change keeps the current clips on screen, dimmed, until the next
 * page arrives; the wall cog's Preview Behavior saves the user's wall
 * playback and the wall plays by it at once (LG-10, item 52).
 */
import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { must, renderListPage } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import ClipSearch from "@/components/clip-search/ClipSearch";

const { mockGetClips, mockApiPut } = vi.hoisted(() => ({
  mockGetClips: vi.fn<(options: unknown) => Promise<unknown>>(),
  mockApiPut: vi.fn<(url: string, body: unknown) => Promise<unknown>>(),
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getClips: mockGetClips,
  apiGet: vi.fn(() => Promise.resolve({})),
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

// The table shows the clip columns as the app defines them
vi.mock("@/hooks/useTableColumns", async () => {
  const { CLIP_COLUMNS } = await import("@/config/tableColumns");
  return {
    useTableColumns: vi.fn(() => ({
      allColumns: CLIP_COLUMNS,
      visibleColumns: CLIP_COLUMNS,
      visibleColumnIds: CLIP_COLUMNS.map((column) => column.id),
      columnOrder: CLIP_COLUMNS.map((column) => column.id),
      toggleColumn: vi.fn(),
      hideColumn: vi.fn(),
      moveColumn: vi.fn(),
      getColumnConfig: vi.fn(() => ({})),
    })),
  };
});

/** A clip row as the list answers it */
const clip = (id: string, title: string) => ({
  id,
  instanceId: "server-a",
  sceneId: "3",
  seconds: 12,
  title,
  isGenerated: true,
  scene: { title: "A scene", files: [{ width: 1920, height: 1080 }] },
});

const renderClips = (url = "/clips", element = <ClipSearch />) =>
  renderListPage(element, { initialEntries: [url] });

describe("ClipSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClips.mockResolvedValue({ clips: [], total: 0 });
    mockApiPut.mockResolvedValue({ success: true });
  });

  it("forwards every clip filter parameter, the modifiers included, to getClips", async () => {
    const url =
      "/clips?page=2&per_page=48&q=kiss&sort=title&dir=ASC" +
      "&tagIds=1:server-a&tagIdsModifier=INCLUDES_ALL" +
      "&sceneTagIds=2:server-a&sceneTagIdsModifier=EXCLUDES" +
      "&performerIds=3:server-a&performerIdsModifier=EXCLUDES" +
      "&studioId=4:server-a&isGenerated=false";

    renderClips(
      url,
      <ClipSearch permanentFilters={{ sceneId: "9:server-a" }} />
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
    renderClips("/clips?isGenerated=all");

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

  it("page 2 keeps page 1's clips on screen, dimmed, until it loads", async () => {
    let answerPage2: (value: unknown) => void = () => {};
    mockGetClips.mockImplementation((options) =>
      (options as { page: number }).page === 2
        ? new Promise((resolve) => {
            answerPage2 = resolve;
          })
        : Promise.resolve({ clips: [clip("1", "First page clip")], total: 48 })
    );

    renderClips();
    expect(await screen.findByText("First page clip")).toBeInTheDocument();

    fireEvent.click(
      must(screen.getAllByRole("button", { name: "Next Page" })[0])
    );

    // Page 2 is on its way: page 1's clips stay, dimmed and busy
    await waitFor(() =>
      expect(screen.getByTestId("search-results")).toHaveAttribute(
        "aria-busy",
        "true"
      )
    );
    expect(screen.getByText("First page clip")).toBeInTheDocument();

    await act(async () => {
      answerPage2({ clips: [clip("2", "Second page clip")], total: 48 });
      await Promise.resolve();
    });
    expect(await screen.findByText("Second page clip")).toBeInTheDocument();
    expect(screen.queryByText("First page clip")).not.toBeInTheDocument();
    expect(screen.getByTestId("search-results")).not.toHaveAttribute(
      "aria-busy"
    );
  });

  it("shows 'No clips found' when nothing matches", async () => {
    renderClips("/clips?q=zzz");
    expect(await screen.findByText("No clips found")).toBeInTheDocument();
  });

  describe("table headers", () => {
    beforeEach(() => {
      mockGetClips.mockResolvedValue({
        clips: [clip("7", "A clip")],
        total: 1,
      });
    });

    const lastCall = () =>
      must(mockGetClips.mock.calls[mockGetClips.mock.calls.length - 1])[0];
    const header = (name: string) =>
      must(
        screen
          .getAllByRole("columnheader")
          .find((th) => th.textContent === name),
        `the ${name} header`
      );

    it("clicking Start Time sorts by seconds; clicking it again flips the direction", async () => {
      renderClips("/clips?view=table");
      await screen.findByText("A clip");

      fireEvent.click(header("Start Time"));
      await waitFor(() =>
        expect(lastCall()).toMatchObject({
          sortBy: "seconds",
          sortDir: "desc",
        })
      );

      fireEvent.click(header("Start Time"));
      await waitFor(() =>
        expect(lastCall()).toMatchObject({ sortBy: "seconds", sortDir: "asc" })
      );
    });

    it("clicking Title sorts by title", async () => {
      renderClips("/clips?view=table");
      await screen.findByText("A clip");

      fireEvent.click(header("Title"));
      await waitFor(() =>
        expect(lastCall()).toMatchObject({ sortBy: "title", sortDir: "desc" })
      );
    });

    it("clicking Duration sorts by duration", async () => {
      renderClips("/clips?view=table");
      await screen.findByText("A clip");

      fireEvent.click(header("Duration"));
      await waitFor(() =>
        expect(lastCall()).toMatchObject({
          sortBy: "duration",
          sortDir: "desc",
        })
      );
    });

    it("the arrow marks the active sort", async () => {
      renderClips("/clips?view=table&sort=seconds&dir=ASC");
      await screen.findByText("A clip");

      expect(header("Start Time").querySelector("svg")).not.toBeNull();
      expect(header("Title").querySelector("svg")).toBeNull();
    });
  });

  describe("wall playback", () => {
    const play = vi.fn(() => Promise.resolve());

    beforeEach(() => {
      vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
        () => {}
      );
      mockGetClips.mockResolvedValue({
        clips: [clip("7", "A clip")],
        total: 1,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("choosing Play on Hover in the wall cog makes wall items play on hover", async () => {
      renderListPage(<ClipSearch />, {
        initialEntries: ["/clips?view=wall"],
        userSettings: { wallPlayback: "static" },
      });
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
