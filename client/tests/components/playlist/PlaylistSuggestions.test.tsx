/**
 * The Suggestions tab reads `GET /playlists/:id/suggestions?page=`, shows the
 * scenes in the scene grid, and adds a selection to the playlist through the
 * bulk route. The network is stubbed: what is under test is the requests the
 * tab sends and what it shows.
 */
import type { ComponentProps } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import type {
  GetPlaylistSuggestionsResponse,
  NormalizedScene,
} from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouterWithQuery } from "@tests/helpers/MemoryRouterWithQuery";
import { jsonResponse, requestsTo, stubApi } from "@tests/helpers/stubApi";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaylistSuggestions from "@/components/playlist/PlaylistSuggestions";
import type * as uiModule from "@/components/ui/index";
import type { SceneCard } from "@/components/ui/index";
import { showSuccess, showWarning } from "@/utils/toast";

type CardProps = ComponentProps<typeof SceneCard>;

vi.mock("@/components/ui/index", async (importOriginal) => {
  const actual = await importOriginal<typeof uiModule>();
  return {
    ...actual,
    SkeletonSceneCard: () => <div data-testid="skeleton" />,
    // A card is its title and its select box
    SceneCard: ({ scene, onToggleSelect, isSelected }: CardProps) => (
      <div data-testid="suggestion">
        <span>{scene.title}</span>
        <button
          type="button"
          title={`Select ${scene.title}`}
          aria-pressed={isSelected}
          onClick={() => onToggleSelect?.(scene)}
        />
      </div>
    ),
  };
});
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

const scene = (id: string, title = `Scene ${id}`) =>
  ({ id, instanceId: "i", title }) as NormalizedScene;

const answer = (
  scenes: NormalizedScene[],
  overrides: Partial<GetPlaylistSuggestionsResponse> = {}
): GetPlaylistSuggestionsResponse => ({
  scenes,
  count: scenes.length,
  page: 1,
  perPage: 24,
  ...overrides,
});

function SearchProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderTab(props: { playlistEmpty?: boolean } = {}, entry = "/p") {
  return render(
    <MemoryRouterWithQuery initialEntries={[entry]}>
      <Routes>
        <Route
          path="/p"
          element={
            <>
              <PlaylistSuggestions
                playlistId={5}
                playlistEmpty={props.playlistEmpty ?? false}
              />
              <SearchProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouterWithQuery>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaylistSuggestions", () => {
  it("shows the scenes the server suggests for page 1", async () => {
    const fetchMock = stubApi({
      "/playlists/5/suggestions": () =>
        jsonResponse(200, answer([scene("1"), scene("2")])),
    });
    renderTab();

    expect(await screen.findByText("Scene 1")).toBeInTheDocument();
    expect(screen.getByText("Scene 2")).toBeInTheDocument();
    expect(requestsTo(fetchMock, "/playlists/5/suggestions")).toEqual([
      "/api/playlists/5/suggestions?page=1",
    ]);
  });

  it("adds the selected scenes, toasts, clears the selection and drops them from the list", async () => {
    let added = false;
    const fetchMock = stubApi({
      "/playlists/5/suggestions": () =>
        jsonResponse(
          200,
          answer(added ? [scene("3")] : [scene("1"), scene("2"), scene("3")])
        ),
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

    await screen.findByText("Scene 1");
    fireEvent.click(screen.getByTitle("Select Scene 1"));
    fireEvent.click(screen.getByTitle("Select Scene 2"));
    fireEvent.click(
      screen.getByRole("button", { name: /Add 2 to this playlist/ })
    );

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith("Added 2 scenes to playlist!")
    );
    const post = fetchMock.mock.calls.find(
      ([url]) => url === "/api/playlists/5/items/bulk"
    );
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      scenes: [
        { sceneId: "1", instanceId: "i" },
        { sceneId: "2", instanceId: "i" },
      ],
    });
    // The playlist changed, so the suggestions are read again without them
    await waitFor(() =>
      expect(screen.queryByText("Scene 1")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Scene 3")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /to this playlist/ })
    ).not.toBeInTheDocument();
  });

  it("warns when some of the scenes were not added", async () => {
    stubApi({
      "/playlists/5/suggestions": () => jsonResponse(200, answer([scene("1")])),
      "/playlists/5/items/bulk": () =>
        jsonResponse(200, { added: 0, alreadyInPlaylist: 1, unavailable: 0 }),
    });
    renderTab();

    await screen.findByText("Scene 1");
    fireEvent.click(screen.getByTitle("Select Scene 1"));
    fireEvent.click(
      screen.getByRole("button", { name: /Add 1 to this playlist/ })
    );

    await waitFor(() => expect(showWarning).toHaveBeenCalled());
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("asks for a few scenes first when the playlist is empty", async () => {
    stubApi({
      "/playlists/5/suggestions": () => jsonResponse(200, answer([])),
    });
    renderTab({ playlistEmpty: true });

    expect(
      await screen.findByText("No suggestions yet: add a few scenes first")
    ).toBeInTheDocument();
  });

  it("says nothing else matches when a playlist with scenes gets none", async () => {
    stubApi({
      "/playlists/5/suggestions": () => jsonResponse(200, answer([])),
    });
    renderTab({ playlistEmpty: false });

    expect(
      await screen.findByText(
        "Nothing else matches this playlist's performers, tags and studios"
      )
    ).toBeInTheDocument();
  });

  it("pages through the URL's spage", async () => {
    const fetchMock = stubApi({
      "/playlists/5/suggestions": (url) => {
        const page = Number(new URL(url, "http://x").searchParams.get("page"));
        return jsonResponse(
          200,
          answer([scene(`p${page}`)], { count: 48, page })
        );
      },
    });
    renderTab({}, "/p?spage=2&tab=suggestions");

    expect(await screen.findByText("Scene p2")).toBeInTheDocument();
    expect(requestsTo(fetchMock, "/playlists/5/suggestions")).toEqual([
      "/api/playlists/5/suggestions?page=2",
    ]);

    fireEvent.click(
      must(
        screen.getAllByRole("button", { name: "Previous Page" })[0],
        "a previous-page button"
      )
    );

    expect(await screen.findByText("Scene p1")).toBeInTheDocument();
    const search = new URLSearchParams(
      screen.getByTestId("search").textContent ?? ""
    );
    expect(search.has("spage")).toBe(false);
    expect(search.get("tab")).toBe("suggestions");
  });
});
