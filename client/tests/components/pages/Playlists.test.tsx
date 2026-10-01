import type {
  AddScenesToPlaylistResponse,
  GetSharedPlaylistsResponse,
  GetUserPlaylistsResponse,
  PlaylistSummary,
} from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouterWithQuery } from "@tests/helpers/MemoryRouterWithQuery";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as clientModule from "@/api/client";
import Playlists from "@/components/pages/Playlists";
import AddToPlaylistButton from "@/components/ui/AddToPlaylistButton";
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
  };
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
});
