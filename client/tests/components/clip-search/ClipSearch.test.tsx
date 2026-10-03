/**
 * The Clips page on the list page shell: it posts what its filter panel
 * builds, every field of `buildClipFilter` with the modifiers in
 * `clip_filter`, as `findClips` takes it (item 38, F16; the server's
 * contract test maps the same fields, so a field the page dropped would
 * pass there unseen); a
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

const { mockFindClips, mockApiPut } = vi.hoisted(() => ({
  mockFindClips: vi.fn<(options: unknown) => Promise<unknown>>(),
  mockApiPut: vi.fn<(url: string, body: unknown) => Promise<unknown>>(),
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  findClips: mockFindClips,
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
    mockFindClips.mockResolvedValue({ clips: [], total: 0 });
    mockApiPut.mockResolvedValue({ success: true });
  });

  it("posts every clip filter field, the modifiers included, with the page's scene, to findClips", async () => {
    const url =
      "/clips?page=2&per_page=48&q=kiss&sort=title&dir=ASC" +
      "&tagIds=1:server-a&tagIdsModifier=INCLUDES_ALL" +
      "&sceneTagIds=2:server-a&sceneTagIdsModifier=EXCLUDES" +
      "&performerIds=3:server-a&performerIdsModifier=EXCLUDES" +
      "&studioId=4:server-a&isGenerated=false";

    renderClips(
      url,
      <ClipSearch
        permanentFilters={{
          scenes: { value: ["9:server-a"], modifier: "INCLUDES" },
        }}
      />
    );

    await waitFor(() => {
      expect(mockFindClips).toHaveBeenCalled();
    });
    expect(must(mockFindClips.mock.calls[0])[0]).toEqual({
      filter: {
        page: 2,
        per_page: 48,
        q: "kiss",
        sort: "title",
        direction: "ASC",
      },
      // The page's scene in the filter object, the user's rows in where
      clip_filter: {
        scenes: { value: ["9:server-a"], modifier: "INCLUDES" },
      },
      where: {
        match: "all",
        rules: [
          {
            field: "tags",
            criterion: { value: ["1:server-a"], modifier: "INCLUDES_ALL" },
          },
          {
            field: "scene_tags",
            criterion: { value: ["2:server-a"], modifier: "EXCLUDES" },
          },
          {
            field: "performers",
            criterion: { value: ["3:server-a"], modifier: "EXCLUDES" },
          },
          {
            field: "studios",
            criterion: { value: ["4:server-a"], modifier: "INCLUDES" },
          },
          { field: "is_generated", criterion: false },
        ],
      },
    });
  });

  it("a Tags row on Clips is sent in where, beside the default preview filter", async () => {
    renderClips("/clips?tagIds=1:server-a&tagIdsModifier=INCLUDES");

    await waitFor(() => {
      expect(mockFindClips).toHaveBeenCalled();
    });
    expect(must(mockFindClips.mock.calls[0])[0]).toEqual({
      filter: {
        page: 1,
        per_page: 24,
        q: "",
        sort: "stashCreatedAt",
        direction: "DESC",
      },
      clip_filter: { is_generated: true },
      where: {
        match: "all",
        rules: [
          {
            field: "tags",
            criterion: { value: ["1:server-a"], modifier: "INCLUDES" },
          },
        ],
      },
    });
  });

  it("asks for every clip when the panel picks All clips", async () => {
    renderClips("/clips?isGenerated=all");

    await waitFor(() => {
      expect(mockFindClips).toHaveBeenCalled();
    });
    expect(must(mockFindClips.mock.calls[0])[0]).toEqual({
      filter: {
        page: 1,
        per_page: 24,
        q: "",
        sort: "stashCreatedAt",
        direction: "DESC",
      },
      clip_filter: {},
    });
  });

  it("page 2 keeps page 1's clips on screen, dimmed, until it loads", async () => {
    let answerPage2: (value: unknown) => void = () => {};
    mockFindClips.mockImplementation((options) =>
      (options as { filter: { page: number } }).filter.page === 2
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
      mockFindClips.mockResolvedValue({
        clips: [clip("7", "A clip")],
        total: 1,
      });
    });

    const lastCall = () =>
      must(mockFindClips.mock.calls[mockFindClips.mock.calls.length - 1])[0];
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
          filter: { sort: "seconds", direction: "DESC" },
        })
      );

      fireEvent.click(header("Start Time"));
      await waitFor(() =>
        expect(lastCall()).toMatchObject({
          filter: { sort: "seconds", direction: "ASC" },
        })
      );
    });

    it("clicking Title sorts by title", async () => {
      renderClips("/clips?view=table");
      await screen.findByText("A clip");

      fireEvent.click(header("Title"));
      await waitFor(() =>
        expect(lastCall()).toMatchObject({
          filter: { sort: "title", direction: "DESC" },
        })
      );
    });

    it("clicking Duration sorts by duration", async () => {
      renderClips("/clips?view=table");
      await screen.findByText("A clip");

      fireEvent.click(header("Duration"));
      await waitFor(() =>
        expect(lastCall()).toMatchObject({
          filter: { sort: "duration", direction: "DESC" },
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
      mockFindClips.mockResolvedValue({
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
