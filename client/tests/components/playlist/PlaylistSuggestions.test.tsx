/**
 * The Suggestions tab is the scene list (`EntityListPage`) within the
 * scenes a playlist suggests: `POST /playlists/:id/suggestions` with the
 * list's request, its views, page size, sort ("Best match" first), search,
 * filters, Views and count, and the bulk bar's "Add N to this playlist".
 *
 * The network is stubbed: what is under test is the requests the tab sends
 * and what it shows. The controls, pagination and grid are the real ones,
 * the scene card a stub.
 */
import { Route, Routes, useLocation } from "react-router-dom";
import { defaultPinsOf } from "@peek/shared-types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { matchMediaQueries } from "@tests/helpers/matchMedia";
import {
  type ApiStub,
  jsonResponse,
  requestsTo,
  stubApi,
} from "@tests/helpers/stubApi";
import { must, renderListPage } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaylistSuggestions from "@/components/playlist/PlaylistSuggestions";
import { SHEET_QUERY } from "@/hooks/useFilterSurface";
import { showSuccess, showWarning } from "@/utils/toast";

vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

/** A scene card stub: its title and a select box */
vi.mock("@/components/ui/SceneCard", () => ({
  default: (props: {
    scene: { id: string; instanceId: string; title: string };
    onToggleSelect?: (scene: unknown) => void;
    isSelected?: boolean;
  }) => (
    <div data-testid="scene-card">
      {props.scene.title}
      <button
        type="button"
        title={`Select ${props.scene.title}`}
        aria-pressed={props.isSelected}
        onClick={() => props.onToggleSelect?.(props.scene)}
      />
    </div>
  ),
}));
vi.mock("@/hooks/useHideBulkAction", () => ({
  useHideBulkAction: () => ({
    hideDialogOpen: false,
    isHiding: false,
    handleHideClick: vi.fn(),
    handleHideConfirm: vi.fn(),
    closeHideDialog: vi.fn(),
  }),
}));
vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
}));

const LIST = "/playlists/5/suggestions";
const COUNT = "/playlists/5/suggestions/count";
const NOTICE = "Filtering within this playlist's top 500 suggestions";

type Row = { id: string; instanceId: string; title: string };
type Body = {
  filter: Record<string, unknown>;
  scene_filter?: Record<string, unknown>;
  where?: { match: string; rules: readonly Record<string, unknown>[] };
};

const rowsOf = (prefix: string, n = 2): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    instanceId: "a",
    title: `${prefix}-${i}`,
  }));

const answer = (rows: readonly Row[], count: number | null, page = 1) =>
  jsonResponse(200, { scenes: rows, count, page, perPage: 24 });

const bodyOf = (init?: RequestInit): Body =>
  JSON.parse(typeof init?.body === "string" ? init.body : "null") as Body;

/** The bodies a route was sent, oldest first */
const sentTo = (fetchMock: ApiStub, path = LIST): Body[] =>
  fetchMock.mock.calls
    .filter(([url]) => url.replace(/^\/api/, "").split("?")[0] === path)
    .map(([, init]) => bodyOf(init));

const lastSent = (fetchMock: ApiStub) =>
  must(sentTo(fetchMock).at(-1), "a suggestions request");

/** The server: rows `p<page>-<n>` and a total, null when not asked */
const pagedServer =
  (total: number, perPageRows = 2) =>
  (_url: string, init?: RequestInit) => {
    const { filter } = bodyOf(init);
    const page = filter.page as number;
    return answer(
      rowsOf(`p${page}`, perPageRows),
      filter.count === false ? null : total,
      page
    );
  };

function SearchProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

const renderTab = (
  url = "/playlist/5?tab=suggestions",
  options: { playlistEmpty?: boolean } & Omit<
    NonNullable<Parameters<typeof renderListPage>[1]>,
    "initialEntries"
  > = {}
) => {
  const { playlistEmpty = false, ...rest } = options;
  return renderListPage(
    <Routes>
      <Route
        path="/playlist/:playlistId"
        element={
          <>
            <PlaylistSuggestions playlistId={5} playlistEmpty={playlistEmpty} />
            <SearchProbe />
          </>
        }
      />
    </Routes>,
    { initialEntries: [url], ...rest }
  );
};

const search = () =>
  new URLSearchParams(screen.getByTestId("search").textContent ?? "");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaylistSuggestions", () => {
  it("asks `POST /playlists/5/suggestions` for page 1 of 24, best match first, no filter", async () => {
    const fetchMock = stubApi({ [LIST]: pagedServer(2) });

    renderTab();

    expect(await screen.findByText("p1-0")).toBeInTheDocument();
    expect(must(fetchMock.mock.calls[0])[1]?.method).toBe("POST");
    expect(sentTo(fetchMock)).toEqual([
      {
        filter: {
          page: 1,
          per_page: 24,
          q: "",
          sort: "recommended",
          direction: "DESC",
        },
        scene_filter: {},
      },
    ]);
  });

  it("offers Grid, Wall and Table; not Timeline or Folder", async () => {
    stubApi({ [LIST]: pagedServer(2) });

    renderTab();
    await screen.findByText("p1-0");

    fireEvent.click(screen.getByRole("button", { name: /^View mode/ }));
    const names = within(screen.getByRole("listbox", { name: "View modes" }))
      .getAllByRole("option")
      .map((option) => option.getAttribute("aria-label"));
    expect(names).toEqual(["Grid view", "Wall view", "Table view"]);
  });

  it("shows the page size control, and reads the URL's page and page size", async () => {
    const fetchMock = stubApi({ [LIST]: pagedServer(120) });

    renderTab("/playlist/5?tab=suggestions&page=2&per_page=48");

    expect(await screen.findByText("p2-0")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Per Page:").length).toBeGreaterThan(0);
    expect(lastSent(fetchMock).filter).toMatchObject({
      page: 2,
      per_page: 48,
    });
  });

  it("the sort menu lists Best match first; choosing Title sends `sort: title`", async () => {
    const fetchMock = stubApi({ [LIST]: pagedServer(2) });

    renderTab();
    await screen.findByText("p1-0");

    const sortBy = screen.getByRole("combobox", { name: "Sort by" });
    const options = Array.from((sortBy as HTMLSelectElement).options);
    expect(must(options[0]).textContent).toBe("Best match");
    expect((sortBy as HTMLSelectElement).value).toBe("recommended");

    fireEvent.change(sortBy, { target: { value: "title" } });

    await waitFor(() =>
      expect(lastSent(fetchMock).filter).toMatchObject({ sort: "title" })
    );
    expect(search().get("sort")).toBe("title");
    expect(search().get("tab")).toBe("suggestions");
  });

  it("a filter goes in `where` and shows that it narrows the suggestions only", async () => {
    const fetchMock = stubApi({ [LIST]: pagedServer(2) });

    renderTab(undefined, { pins: { scene: defaultPinsOf("scene") } });
    await screen.findByText("p1-0");
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Unwatched" }));

    await waitFor(() =>
      expect(
        lastSent(fetchMock).where?.rules.map((rule) => rule.field)
      ).toEqual(["watched"])
    );
    expect(screen.getByText(NOTICE)).toHaveAttribute("role", "status");
  });

  it("a filter that matches nothing says so", async () => {
    stubApi({ [LIST]: () => answer([], 0) });

    renderTab("/playlist/5?tab=suggestions&q=nothing");

    expect(
      await screen.findByText("No suggestions match these filters")
    ).toBeInTheDocument();
  });

  it("the filter sheet counts at `/playlists/5/suggestions/count`", async () => {
    const restore = matchMediaQueries([SHEET_QUERY]);
    try {
      const fetchMock = stubApi({
        [LIST]: pagedServer(2),
        [COUNT]: () => jsonResponse(200, { count: 2 }),
      });

      renderTab();
      await screen.findByText("p1-0");
      fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

      await waitFor(() => expect(requestsTo(fetchMock, COUNT)).toHaveLength(1));
      expect(requestsTo(fetchMock, "/library/scenes/count")).toEqual([]);
    } finally {
      restore();
    }
  });

  it("the Views menu uses the `scene_playlist_suggestions` context", async () => {
    const fetchMock = stubApi({ [LIST]: pagedServer(2) });

    renderTab(undefined, {
      presets: {
        scene: [
          {
            id: "sugg",
            name: "By date",
            filters: {},
            sort: "date",
            direction: "ASC",
          },
        ],
      },
      defaultPresets: { scene_playlist_suggestions: "sugg" },
    });
    await screen.findByText("p1-0");

    expect(lastSent(fetchMock).filter).toMatchObject({
      sort: "date",
      direction: "ASC",
    });
    fireEvent.click(screen.getByRole("button", { name: /^Views/ }));
    expect(
      screen.getByText(
        "Stop using as default for Playlist pages (Suggestions tab)"
      )
    ).toBeInTheDocument();
  });

  it("adds the selected scenes, toasts, clears the selection and drops them from the list", async () => {
    let added = false;
    const fetchMock = stubApi({
      [LIST]: () =>
        added ? answer(rowsOf("left", 1), 1) : answer(rowsOf("s", 3), 3),
      "/playlists/5/items/bulk": () => {
        added = true;
        return jsonResponse(200, {
          added: 2,
          alreadyInPlaylist: 0,
          unavailable: 0,
        });
      },
    });
    renderTab();

    await screen.findByText("s-0");
    fireEvent.click(screen.getByTitle("Select s-0"));
    fireEvent.click(screen.getByTitle("Select s-1"));
    fireEvent.click(
      screen.getByRole("button", { name: /Add 2 to this playlist/ })
    );

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith("Added 2 scenes to playlist!")
    );
    const post = must(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/playlists/5/items/bulk"
      ),
      "the bulk add"
    );
    expect(JSON.parse(post[1]?.body as string)).toEqual({
      scenes: [
        { sceneId: "s-0", instanceId: "a" },
        { sceneId: "s-1", instanceId: "a" },
      ],
    });
    // The playlist changed, so the suggestions are read again without them
    expect(await screen.findByText("left-0")).toBeInTheDocument();
    expect(screen.queryByText("s-0")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /to this playlist/ })
    ).not.toBeInTheDocument();
  });

  it("warns when some of the scenes were not added", async () => {
    stubApi({
      [LIST]: () => answer(rowsOf("s", 1), 1),
      "/playlists/5/items/bulk": () =>
        jsonResponse(200, { added: 0, alreadyInPlaylist: 1, unavailable: 0 }),
    });
    renderTab();

    await screen.findByText("s-0");
    fireEvent.click(screen.getByTitle("Select s-0"));
    fireEvent.click(
      screen.getByRole("button", { name: /Add 1 to this playlist/ })
    );

    await waitFor(() =>
      expect(showWarning).toHaveBeenCalledWith(
        "No scenes added: 1 already in playlist"
      )
    );
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("asks for a few scenes first when the playlist is empty", async () => {
    stubApi({ [LIST]: () => answer([], 0) });

    renderTab(undefined, { playlistEmpty: true });

    expect(
      await screen.findByText("No suggestions yet: add a few scenes first")
    ).toBeInTheDocument();
  });

  it("says nothing else matches when a playlist with scenes gets none", async () => {
    stubApi({ [LIST]: () => answer([], 0) });

    renderTab();

    expect(
      await screen.findByText(
        "Nothing else matches this playlist's performers, tags and studios"
      )
    ).toBeInTheDocument();
  });
});
