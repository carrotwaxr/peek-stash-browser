import { useLocation } from "react-router-dom";
import {
  type AddScenesToPlaylistResponse,
  BULK_PLAYLIST_LIMIT,
  type GetSharedPlaylistsResponse,
  type GetUserPlaylistsResponse,
  type PlaylistSummary,
} from "@peek/shared-types";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouterWithQuery } from "@tests/helpers/MemoryRouterWithQuery";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as clientModule from "@/api/client";
import Playlists from "@/components/pages/Playlists";
import AddToPlaylistButton from "@/components/ui/AddToPlaylistButton";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import { showError, showSuccess } from "@/utils/toast";

const { mockApiGet, mockApiPost, mockApiDelete } = vi.hoisted(() => ({
  mockApiGet: vi.fn<(path: string) => Promise<unknown>>(),
  mockApiPost: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  mockApiDelete: vi.fn<(path: string) => Promise<unknown>>(),
}));

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof clientModule>()),
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiDelete: mockApiDelete,
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
}));

vi.mock("@/components/icons/index", () => ({
  ThemedIcon: () => null,
}));

function summary(id: number, name: string, items: number): PlaylistSummary {
  return {
    id,
    userId: 1,
    name,
    description: null,
    shuffle: false,
    repeat: "none",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    _count: { items },
    items: [],
    lastChangedAt: new Date(0).toISOString(),
    removableItems: 0,
  };
}

/** Shows the router's search string, so a test reads the URL */
function LocationProbe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

/** The playlists the page lists, in the order shown (grid titles or list rows) */
function shownNames(): string[] {
  return screen
    .getAllByRole("link")
    .filter((a) => a.getAttribute("href")?.startsWith("/playlist/"))
    .map((a) => a.textContent ?? "");
}

/** The last of several matches: the open menu or dialog renders after the page */
function lastOf<T>(items: T[]): T {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error("no match");
  return item;
}

let mineCount = 2;
let playlists: PlaylistSummary[] = [];
let shared: GetSharedPlaylistsResponse["playlists"] = [];

function serve() {
  mockApiGet.mockImplementation((path) => {
    if (path.startsWith("/playlists/shared")) {
      return Promise.resolve({
        playlists: shared,
      } satisfies GetSharedPlaylistsResponse);
    }
    return Promise.resolve({
      playlists: playlists.map((p) =>
        p.id === 1 ? summary(1, "Mine", mineCount) : p
      ),
    } satisfies GetUserPlaylistsResponse);
  });
}

describe("Playlists page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mineCount = 2;
    playlists = [summary(1, "Mine", 2)];
    shared = [];
    serve();
  });

  it("shows each playlist with its count", async () => {
    render(
      <MemoryRouterWithQuery>
        <Playlists />
      </MemoryRouterWithQuery>
    );

    expect(await screen.findByText("Mine")).toBeTruthy();
    expect(screen.getByText("2 videos")).toBeTruthy();
  });

  it("shows the shared playlists on their tab", async () => {
    shared = [
      {
        id: 9,
        name: "Theirs",
        description: null,
        sceneCount: 1,
        owner: { id: 2, username: "bob" },
        sharedViaGroups: ["crew"],
        sharedAt: "2026-01-01",
        items: [],
      },
    ];
    render(
      <MemoryRouterWithQuery initialEntries={["/playlists?tab=shared"]}>
        <Playlists />
      </MemoryRouterWithQuery>
    );

    expect(await screen.findByText("Theirs")).toBeTruthy();
    expect(screen.getByText("by bob")).toBeTruthy();
    expect(screen.getByText("via crew")).toBeTruthy();
  });

  it.each([
    ["mine", "/playlists", "No playlists yet"],
    ["shared", "/playlists?tab=shared", "No shared playlists"],
  ])(
    "the empty %s tab shows an icon, not an emoji, in the shared empty state",
    async (_tab, url, title) => {
      playlists = [];
      shared = [];
      render(
        <MemoryRouterWithQuery initialEntries={[url]}>
          <Playlists />
        </MemoryRouterWithQuery>
      );

      const heading = await screen.findByRole("heading", { name: title });
      const box = must(heading.parentElement);

      expect(box.querySelector("svg")).not.toBeNull();
      expect(box.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  );

  it("after an add, the page's count updates without a reload", async () => {
    mockApiPost.mockImplementation(() => {
      mineCount = 3;
      return Promise.resolve({
        added: 1,
        alreadyInPlaylist: 0,
        unavailable: 0,
      } satisfies AddScenesToPlaylistResponse);
    });
    render(
      <MemoryRouterWithQuery>
        <Playlists />
        <AddToPlaylistButton scenes={[{ id: "1", instanceId: "inst-a" }]} />
      </MemoryRouterWithQuery>
    );
    await screen.findByText("2 videos");

    fireEvent.click(screen.getByTitle("Add to playlist"));
    // the page's own title and the menu's entry both read "Mine"
    await waitFor(() => expect(screen.getAllByText("Mine")).toHaveLength(2));
    fireEvent.click(lastOf(screen.getAllByText("Mine")));

    expect(await screen.findByText("3 videos")).toBeTruthy();
    expect(showSuccess).toHaveBeenCalledWith("Added to playlist!");
  });

  it("deleting a playlist deletes it and refreshes the list", async () => {
    mockApiDelete.mockImplementation(() => {
      playlists = [];
      return Promise.resolve({ success: true, message: "deleted" });
    });
    render(
      <MemoryRouterWithQuery>
        <Playlists />
      </MemoryRouterWithQuery>
    );
    await screen.findByText("Mine");

    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(screen.getAllByText("Delete")).toHaveLength(2));
    fireEvent.click(lastOf(screen.getAllByText("Delete")));

    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith("/playlists/1")
    );
    expect(await screen.findByText("No playlists yet")).toBeTruthy();
    expect(showSuccess).toHaveBeenCalledWith("Playlist deleted");
  });

  it("a failed delete shows the error", async () => {
    mockApiDelete.mockRejectedValue(new Error("nope"));
    render(
      <MemoryRouterWithQuery>
        <Playlists />
      </MemoryRouterWithQuery>
    );
    await screen.findByText("Mine");

    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(screen.getAllByText("Delete")).toHaveLength(2));
    fireEvent.click(lastOf(screen.getAllByText("Delete")));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Failed to delete playlist")
    );
  });

  it("creating a playlist posts it and shows it", async () => {
    mockApiPost.mockImplementation(() => {
      playlists = [...playlists, summary(5, "Fresh", 0)];
      return Promise.resolve({ playlist: summary(5, "Fresh", 0) });
    });
    render(
      <MemoryRouterWithQuery>
        <Playlists />
      </MemoryRouterWithQuery>
    );
    await screen.findByText("Mine");

    fireEvent.click(screen.getByText("+ New Playlist"));
    fireEvent.change(screen.getByLabelText("Playlist Name *"), {
      target: { value: "Fresh" },
    });
    fireEvent.click(screen.getByText("Create"));

    expect(await screen.findByText("Fresh")).toBeTruthy();
    expect(mockApiPost).toHaveBeenCalledWith("/playlists", {
      name: "Fresh",
      description: undefined,
    });
    expect(showSuccess).toHaveBeenCalledWith("Playlist created successfully!");
  });
  it("the create dialog has role dialog and closes on Escape", async () => {
    render(
      <ShortcutScopeProvider>
        <MemoryRouterWithQuery>
          <Playlists />
        </MemoryRouterWithQuery>
      </ShortcutScopeProvider>
    );

    fireEvent.click(await screen.findByText("+ New Playlist"));

    expect(
      screen.getByRole("dialog", { name: "Create New Playlist" })
    ).toBeTruthy();
    expect(screen.getByLabelText("Playlist Name *")).toHaveFocus();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  describe("sorting, searching and views", () => {
    beforeEach(() => {
      playlists = [
        {
          ...summary(11, "banana", 3),
          lastChangedAt: "2026-01-01T00:00:00.000Z",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          description: "a mix tape",
        },
        {
          ...summary(12, "Apple", 9),
          lastChangedAt: "2026-02-01T12:00:00.000Z",
          createdAt: new Date("2026-01-01T12:00:00.000Z"),
          removableItems: 4,
        },
        {
          ...summary(13, "cherry", 1),
          lastChangedAt: "2026-03-01T00:00:00.000Z",
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ];
    });

    function renderPage(url = "/playlists") {
      return render(
        <MemoryRouterWithQuery initialEntries={[url]}>
          <Playlists />
          <LocationProbe />
        </MemoryRouterWithQuery>
      );
    }

    it("defaults to Last changed, newest first, with nothing in the URL", async () => {
      renderPage();

      await screen.findByText("cherry");

      expect(shownNames()).toEqual(["cherry", "Apple", "banana"]);
      expect(screen.getByLabelText("Sort by")).toHaveValue("last_changed");
      expect(screen.getByTestId("search").textContent).toBe("");
    });

    it("choosing Name sorts by name and puts it in the URL", async () => {
      renderPage();
      await screen.findByText("cherry");

      fireEvent.change(screen.getByLabelText("Sort by"), {
        target: { value: "name" },
      });

      await waitFor(() =>
        expect(shownNames()).toEqual(["Apple", "banana", "cherry"])
      );
      expect(screen.getByTestId("search").textContent).toBe(
        "?sort=name&dir=ASC"
      );
    });

    it("the direction button flips the order", async () => {
      renderPage();
      await screen.findByText("cherry");

      fireEvent.click(
        screen.getByRole("button", { name: "Sort direction: descending" })
      );

      await waitFor(() =>
        expect(shownNames()).toEqual(["banana", "Apple", "cherry"])
      );
      expect(screen.getByTestId("search").textContent).toBe("?dir=ASC");
    });

    it("reads the sort from the URL", async () => {
      renderPage("/playlists?sort=videos&dir=DESC");
      await screen.findByText("cherry");

      expect(shownNames()).toEqual(["Apple", "banana", "cherry"]);
    });

    it("typing in search narrows the cards to the matching playlists", async () => {
      renderPage();
      await screen.findByText("cherry");

      fireEvent.change(screen.getByPlaceholderText("Search playlists..."), {
        target: { value: "MIX tape" },
      });

      await waitFor(() => expect(shownNames()).toEqual(["banana"]));
      expect(screen.getByTestId("search").textContent).toBe("?q=MIX+tape");
    });

    it("a search that matches nothing says so", async () => {
      renderPage("/playlists?q=zebra");

      expect(await screen.findByText("No playlists match")).toBeTruthy();
      expect(screen.getByPlaceholderText("Search playlists...")).toBeTruthy();
    });

    it("?view=list renders a table with the five columns", async () => {
      renderPage("/playlists?view=list");
      await screen.findByText("cherry");

      const table = screen.getByRole("table");
      const headers = within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent);

      // The first column holds each row's checkbox
      expect(headers).toEqual([
        "",
        "Name",
        "Videos",
        "Deleted from Stash",
        "Created",
        "Last changed",
      ]);
      const rows = within(table).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(3);
      // Apple: 9 videos, 4 deleted from Stash; the others show none
      const apple = within(must(rows[1])).getAllByRole("cell");
      expect(apple.map((c) => c.textContent)).toEqual([
        "",
        "Apple",
        "9",
        "4",
        "Jan 1, 2026",
        "Feb 1, 2026",
      ]);
      expect(
        must(within(must(rows[0])).getAllByRole("cell")[3]).textContent
      ).toBe("");
    });

    it("the view menu switches to the list and back, and the grid is the default", async () => {
      renderPage();
      await screen.findByText("cherry");
      expect(screen.queryByRole("table")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /View mode/ }));
      fireEvent.click(screen.getByRole("option", { name: "List view" }));

      expect(await screen.findByRole("table")).toBeTruthy();
      expect(screen.getByTestId("search").textContent).toBe("?view=list");

      fireEvent.click(screen.getByRole("button", { name: /View mode/ }));
      fireEvent.click(screen.getByRole("option", { name: "Grid view" }));

      await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
      expect(screen.getByTestId("search").textContent).toBe("");
    });

    it("keeps the Delete button on each card", async () => {
      renderPage();
      await screen.findByText("cherry");

      expect(screen.getAllByText("Delete")).toHaveLength(3);
    });

    describe("the Shared tab", () => {
      beforeEach(() => {
        shared = [
          {
            id: 7,
            name: "Zulu",
            description: null,
            sceneCount: 2,
            owner: { id: 2, username: "bob" },
            sharedViaGroups: ["crew"],
            sharedAt: "2026-01-05T00:00:00.000Z",
            items: [],
          },
          {
            id: 8,
            name: "Alpha",
            description: null,
            sceneCount: 5,
            owner: { id: 2, username: "bob" },
            sharedViaGroups: ["crew"],
            sharedAt: "2026-02-05T00:00:00.000Z",
            items: [],
          },
        ];
      });

      it("sorts by the same control, Last changed reading sharedAt", async () => {
        renderPage("/playlists?tab=shared");
        await screen.findByText("Alpha");

        expect(shownNames()).toEqual(["Alpha", "Zulu"]);

        fireEvent.change(screen.getByLabelText("Sort by"), {
          target: { value: "name" },
        });
        await waitFor(() => expect(shownNames()).toEqual(["Alpha", "Zulu"]));

        fireEvent.click(
          screen.getByRole("button", { name: "Sort direction: ascending" })
        );
        await waitFor(() => expect(shownNames()).toEqual(["Zulu", "Alpha"]));
      });

      it("lists them as a table with no Deleted from Stash column", async () => {
        renderPage("/playlists?tab=shared&view=list");
        await screen.findByText("Alpha");

        const headers = within(screen.getByRole("table"))
          .getAllByRole("columnheader")
          .map((h) => h.textContent);

        expect(headers).toEqual([
          "Name",
          "Shared by",
          "Videos",
          "Last changed",
        ]);
      });
    });
  });
});

describe("Playlists page selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playlists = [
      {
        ...summary(11, "Alpha", 20),
        removableItems: 10,
        lastChangedAt: "2026-04-01T00:00:00.000Z",
      },
      {
        ...summary(12, "Bravo", 8),
        removableItems: 3,
        lastChangedAt: "2026-03-01T00:00:00.000Z",
      },
      {
        ...summary(13, "Charlie", 5),
        removableItems: 1,
        lastChangedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        ...summary(14, "Delta", 2),
        lastChangedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    shared = [];
    serve();
  });

  function renderPage(url = "/playlists") {
    return render(
      <MemoryRouterWithQuery initialEntries={[url]}>
        <Playlists />
        <LocationProbe />
      </MemoryRouterWithQuery>
    );
  }

  const box = (name: string) =>
    screen.getByRole("checkbox", { name: `Select ${name}` });

  /** The ids a bulk call sent, in ascending order */
  function sentIds(path: string): number[] {
    const call = mockApiPost.mock.calls.find(([to]) => to === path);
    const body = must(call)[1] as { playlistIds: number[] };
    return [...body.playlistIds].sort((a, b) => a - b);
  }

  it("each card has a checkbox, and checking two shows the bar with Clean and Delete", async () => {
    renderPage();
    await screen.findByText("Alpha");
    expect(screen.queryByText("selected")).toBeNull();

    fireEvent.click(box("Alpha"));
    fireEvent.click(box("Bravo"));

    expect(await screen.findByText("selected")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clean" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Delete selected playlists" })
    ).toBeTruthy();
    expect(box("Alpha")).toBeChecked();
    expect(box("Charlie")).not.toBeChecked();
  });

  it("each list row has a checkbox and the header's selects every row", async () => {
    renderPage("/playlists?view=list");
    await screen.findByText("Alpha");

    fireEvent.click(box("Delta"));
    expect(screen.getByText("selected")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all playlists" })
    );
    for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
      expect(box(name)).toBeChecked();
    }

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all playlists" })
    );
    expect(screen.queryByText("selected")).toBeNull();
  });

  it("Select All selects every playlist the search shows", async () => {
    renderPage("/playlists?q=a");
    // "a" matches Alpha, Bravo, Charlie and Delta; narrow it to two
    fireEvent.change(
      await screen.findByPlaceholderText("Search playlists..."),
      {
        target: { value: "ha" },
      }
    );
    await waitFor(() => expect(shownNames()).toEqual(["Alpha", "Charlie"]));

    fireEvent.click(box("Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Select All (2)" }));

    expect(box("Charlie")).toBeChecked();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("Clean confirms the removable total, posts the ids, toasts and clears", async () => {
    mockApiPost.mockResolvedValue({ removed: 14, playlists: 3 });
    renderPage();
    await screen.findByText("Alpha");
    fireEvent.click(box("Alpha"));
    fireEvent.click(box("Bravo"));
    fireEvent.click(box("Charlie"));

    fireEvent.click(screen.getByRole("button", { name: "Clean" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Remove 14 items deleted from Stash from 3 playlists?"
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith(
        "Removed 14 items from 3 playlists"
      )
    );
    expect(sentIds("/playlists/clean")).toEqual([11, 12, 13]);
    await waitFor(() => expect(screen.queryByText("selected")).toBeNull());
    expect(box("Alpha")).not.toBeChecked();
  });

  it("Clean is disabled, and says why, when nothing in the selection is deleted from Stash", async () => {
    renderPage();
    await screen.findByText("Alpha");
    fireEvent.click(box("Delta"));

    const clean = screen.getByRole("button", { name: "Clean" });

    expect(clean).toBeDisabled();
    expect(clean).toHaveAttribute(
      "title",
      "Nothing deleted from Stash in the selection"
    );
  });

  it("a failed clean shows the error and keeps the selection", async () => {
    mockApiPost.mockRejectedValue(new Error("nope"));
    renderPage();
    await screen.findByText("Alpha");
    fireEvent.click(box("Alpha"));

    fireEvent.click(screen.getByRole("button", { name: "Clean" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Failed to clean the playlists")
    );
    expect(box("Alpha")).toBeChecked();
  });

  it("Delete confirms, posts to delete-many, toasts and clears", async () => {
    mockApiPost.mockResolvedValue({ deleted: 2 });
    renderPage();
    await screen.findByText("Alpha");
    fireEvent.click(box("Bravo"));
    fireEvent.click(box("Delta"));

    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected playlists" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Delete 2 playlists? This cannot be undone."
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith("Deleted 2 playlists")
    );
    expect(sentIds("/playlists/delete-many")).toEqual([12, 14]);
    await waitFor(() => expect(screen.queryByText("selected")).toBeNull());
  });

  describe("a selection past the bulk limit", () => {
    /** More playlists than one request may name */
    const TOTAL = 501;
    let inFlight = 0;
    let maxInFlight = 0;

    beforeEach(() => {
      playlists = Array.from({ length: TOTAL }, (_, i) => ({
        ...summary(100 + i, `Playlist ${i}`, 3),
        removableItems: 1,
      }));
      inFlight = 0;
      maxInFlight = 0;
      mockApiPost.mockImplementation(async (path, body) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        const { playlistIds } = body as { playlistIds: number[] };
        return path === "/playlists/clean"
          ? { removed: playlistIds.length, playlists: playlistIds.length }
          : { deleted: playlistIds.length };
      });
    });

    /** The ids each call to `path` sent */
    const batches = (path: string) =>
      mockApiPost.mock.calls
        .filter(([to]) => to === path)
        .map(([, body]) => (body as { playlistIds: number[] }).playlistIds);

    async function selectAll() {
      renderPage("/playlists?view=list");
      await screen.findByText("Playlist 0");
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Select all playlists" })
      );
    }

    it("Clean sends the ids in batches of the limit, in turn, and toasts the summed totals once", async () => {
      await selectAll();

      fireEvent.click(screen.getByRole("button", { name: "Clean" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

      await waitFor(() =>
        expect(showSuccess).toHaveBeenCalledWith(
          "Removed 501 items from 501 playlists"
        )
      );
      const sent = batches("/playlists/clean");
      expect(sent.map((ids) => ids.length)).toEqual([BULK_PLAYLIST_LIMIT, 1]);
      expect(new Set(sent.flat()).size).toBe(TOTAL);
      expect(maxInFlight).toBe(1);
      expect(showSuccess).toHaveBeenCalledTimes(1);
      expect(showError).not.toHaveBeenCalled();
    });

    it("Delete sends the ids in batches of the limit, in turn, and toasts the summed total once", async () => {
      await selectAll();

      fireEvent.click(
        screen.getByRole("button", { name: "Delete selected playlists" })
      );
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() =>
        expect(showSuccess).toHaveBeenCalledWith("Deleted 501 playlists")
      );
      const sent = batches("/playlists/delete-many");
      expect(sent.map((ids) => ids.length)).toEqual([BULK_PLAYLIST_LIMIT, 1]);
      expect(new Set(sent.flat()).size).toBe(TOTAL);
      expect(maxInFlight).toBe(1);
      expect(showSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("the Shared tab has no checkboxes", async () => {
    shared = [
      {
        id: 7,
        name: "Zulu",
        description: null,
        sceneCount: 2,
        owner: { id: 2, username: "bob" },
        sharedViaGroups: ["crew"],
        sharedAt: "2026-01-05T00:00:00.000Z",
        items: [],
      },
    ];
    renderPage("/playlists?tab=shared");
    await screen.findByText("Zulu");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    cleanup();
    renderPage("/playlists?tab=shared&view=list");
    await screen.findByText("Zulu");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("changing the search, the sort or the tab clears the selection", async () => {
    renderPage();
    await screen.findByText("Alpha");

    fireEvent.click(box("Alpha"));
    fireEvent.change(screen.getByPlaceholderText("Search playlists..."), {
      target: { value: "a" },
    });
    await waitFor(() => expect(screen.queryByText("selected")).toBeNull());

    fireEvent.click(box("Alpha"));
    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "name" },
    });
    await waitFor(() => expect(screen.queryByText("selected")).toBeNull());

    fireEvent.click(box("Alpha"));
    fireEvent.click(
      screen.getByRole("button", { name: "Sort direction: ascending" })
    );
    await waitFor(() => expect(screen.queryByText("selected")).toBeNull());

    fireEvent.click(box("Alpha"));
    fireEvent.click(screen.getByRole("button", { name: /Shared with Me/ }));
    await screen.findByText("No shared playlists");
    fireEvent.click(screen.getByRole("button", { name: /My Playlists/ }));
    await screen.findByText("Alpha");
    expect(screen.queryByText("selected")).toBeNull();
    expect(box("Alpha")).not.toBeChecked();
  });
});
