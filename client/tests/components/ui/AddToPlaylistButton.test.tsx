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
import AddToPlaylistButton from "@/components/ui/AddToPlaylistButton";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import { showError, showSuccess, showWarning } from "@/utils/toast";

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn<(path: string) => Promise<unknown>>(),
  mockApiPost: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
}));

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof clientModule>()),
  apiGet: mockApiGet,
  apiPost: mockApiPost,
}));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
}));

vi.mock("@/components/icons/index", () => ({
  ThemedIcon: () => null,
}));

function summary(
  id: number,
  name: string,
  containsScene?: boolean
): PlaylistSummary {
  return {
    id,
    userId: 1,
    name,
    description: null,
    shuffle: false,
    repeat: "none",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    containsScene,
    _count: { items: 4 },
    items: [],
  };
}

function bulk(
  added: number,
  alreadyInPlaylist = 0,
  unavailable = 0
): AddScenesToPlaylistResponse {
  return { added, alreadyInPlaylist, unavailable };
}

const MINE = summary(1, "Mine");
const OTHER = summary(2, "Other");

function serve(
  playlists: PlaylistSummary[],
  shared: GetSharedPlaylistsResponse["playlists"] = []
) {
  mockApiGet.mockImplementation((path) => {
    if (path.startsWith("/playlists/shared")) {
      return Promise.resolve({
        playlists: shared,
      } satisfies GetSharedPlaylistsResponse);
    }
    return Promise.resolve({
      playlists,
    } satisfies GetUserPlaylistsResponse);
  });
}

function renderButton(
  props: Partial<Parameters<typeof AddToPlaylistButton>[0]>
) {
  return render(
    <MemoryRouterWithQuery>
      <AddToPlaylistButton
        scenes={[{ id: "1", instanceId: "inst-a" }]}
        {...props}
      />
    </MemoryRouterWithQuery>
  );
}

const scenes5 = ["1", "2", "3", "4", "5"].map((id) => ({
  id,
  instanceId: "inst-a",
}));

describe("AddToPlaylistButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serve([MINE, OTHER]);
    mockApiPost.mockResolvedValue(bulk(1));
  });

  it("adding 5 scenes is one POST /items/bulk; the toast reports added, already there and unavailable", async () => {
    mockApiPost.mockResolvedValue(bulk(3, 1, 1));
    const onSuccess = vi.fn();
    renderButton({ scenes: scenes5, onSuccess });

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("Mine"));

    await waitFor(() =>
      expect(showWarning).toHaveBeenCalledWith(
        "Added 3 scenes, 1 already in playlist, 1 unavailable"
      )
    );
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith("/playlists/1/items/bulk", {
      scenes: scenes5.map((s) => ({
        sceneId: s.id,
        instanceId: s.instanceId,
      })),
    });
    expect(showError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("each scene keeps its own instance in the bulk body", async () => {
    renderButton({
      scenes: [
        { id: "1", instanceId: "inst-a" },
        { id: "1", instanceId: "inst-b" },
      ],
    });

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("Mine"));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    expect(mockApiPost).toHaveBeenCalledWith("/playlists/1/items/bulk", {
      scenes: [
        { sceneId: "1", instanceId: "inst-a" },
        { sceneId: "1", instanceId: "inst-b" },
      ],
    });
  });

  it("when every scene is added it is a success, not a warning", async () => {
    mockApiPost.mockResolvedValue(bulk(5));
    renderButton({ scenes: scenes5 });

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("Mine"));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith("Added 5 scenes to playlist!")
    );
    expect(showWarning).not.toHaveBeenCalled();
  });

  it("when nothing is added it says why and does not call onSuccess", async () => {
    mockApiPost.mockResolvedValue(bulk(0, 5, 0));
    const onSuccess = vi.fn();
    renderButton({ scenes: scenes5, onSuccess });

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("Mine"));

    await waitFor(() =>
      expect(showWarning).toHaveBeenCalledWith("All scenes already in playlist")
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("a 404 for the whole request (playlist gone) shows the error and adds nothing", async () => {
    const { ApiError } = await import("@/api/client");
    mockApiPost.mockRejectedValue(new ApiError("Playlist not found", 404));
    const onSuccess = vi.fn();
    renderButton({ scenes: scenes5, onSuccess });

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("Mine"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Failed to add to playlist")
    );
    expect(showSuccess).not.toHaveBeenCalled();
    expect(showWarning).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a string id", ["1"]],
    ["a number id", [1]],
  ])(
    "the menu leaves out the excluded playlist when given %s (PM-22)",
    async (_label, excludePlaylistIds) => {
      renderButton({ excludePlaylistIds });

      fireEvent.click(screen.getByTitle("Add to playlist"));

      expect(await screen.findByText("Other")).toBeTruthy();
      expect(screen.queryByText("Mine")).toBeNull();
    }
  );

  it("disabled disables the button", () => {
    renderButton({ disabled: true });

    const button = screen.getByTitle("Add to playlist");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("reads no playlists until the menu opens", async () => {
    renderButton({});
    expect(mockApiGet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Add to playlist"));
    await screen.findByText("Mine");
    expect(mockApiGet).toHaveBeenCalled();
  });

  it("the menu of one scene marks the playlists already holding it, and choosing one says so without a request", async () => {
    serve([summary(1, "Mine", true), summary(2, "Other", false)]);
    renderButton({});

    fireEvent.click(screen.getByTitle("Add to playlist"));
    const entry = await screen.findByText("Mine");

    expect(mockApiGet).toHaveBeenCalledWith(
      `/playlists?containsScene=${encodeURIComponent("1:inst-a")}`
    );
    expect(screen.getByText("already added")).toBeTruthy();
    expect(screen.getAllByText("already added")).toHaveLength(1);
    fireEvent.click(entry);
    expect(showWarning).toHaveBeenCalledWith("Scene already in playlist");
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("the menu of several scenes asks for the plain list", async () => {
    renderButton({ scenes: scenes5 });

    fireEvent.click(screen.getByTitle("Add to playlist"));
    await screen.findByText("Mine");

    expect(mockApiGet).toHaveBeenCalledWith("/playlists");
  });

  it("lists shared playlists with a shared tag", async () => {
    serve(
      [MINE],
      [
        {
          id: 9,
          name: "Theirs",
          description: null,
          sceneCount: 7,
          owner: { id: 2, username: "bob" },
          sharedViaGroups: ["g"],
          sharedAt: "2026-01-01",
          items: [],
        },
      ]
    );
    renderButton({});

    fireEvent.click(screen.getByTitle("Add to playlist"));

    expect(await screen.findByText("Theirs")).toBeTruthy();
    expect(screen.getByText("shared")).toBeTruthy();
    expect(screen.getByText("7 videos")).toBeTruthy();
  });

  it("creating a playlist and adding is one create and one bulk add", async () => {
    mockApiPost.mockImplementation((path) =>
      Promise.resolve(
        path === "/playlists" ? { playlist: summary(9, "New") } : bulk(5)
      )
    );
    renderButton({ scenes: scenes5 });

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("+ Create New Playlist"));
    fireEvent.change(screen.getByLabelText("Playlist Name *"), {
      target: { value: "New" },
    });
    fireEvent.click(screen.getByText("Create & Add"));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith(
        "Playlist created and 5 scenes added!"
      )
    );
    expect(mockApiPost).toHaveBeenCalledTimes(2);
    expect(mockApiPost).toHaveBeenNthCalledWith(1, "/playlists", {
      name: "New",
      description: undefined,
    });
    expect(mockApiPost).toHaveBeenNthCalledWith(2, "/playlists/9/items/bulk", {
      scenes: scenes5.map((s) => ({
        sceneId: s.id,
        instanceId: s.instanceId,
      })),
    });
  });

  it("a playlist that was created but could not be filled says so", async () => {
    const { ApiError } = await import("@/api/client");
    mockApiPost.mockImplementation((path) =>
      path === "/playlists"
        ? Promise.resolve({ playlist: summary(9, "New") })
        : Promise.reject(new ApiError("boom", 500))
    );
    renderButton({});

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("+ Create New Playlist"));
    fireEvent.change(screen.getByLabelText("Playlist Name *"), {
      target: { value: "New" },
    });
    fireEvent.click(screen.getByText("Create & Add"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith(
        "Playlist created, but adding to it failed"
      )
    );
    expect(showSuccess).not.toHaveBeenCalled();
  });
  it("the create dialog has role dialog and closes on Escape", async () => {
    render(
      <ShortcutScopeProvider>
        <MemoryRouterWithQuery>
          <AddToPlaylistButton scenes={[{ id: "1", instanceId: "inst-a" }]} />
        </MemoryRouterWithQuery>
      </ShortcutScopeProvider>
    );

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("+ Create New Playlist"));

    expect(
      screen.getByRole("dialog", { name: "Create New Playlist" })
    ).toBeTruthy();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the create dialog opened from a card does not navigate the card on a backdrop click", async () => {
    const onCardClick = vi.fn();
    const onCardMouseDown = vi.fn();
    render(
      <ShortcutScopeProvider>
        <MemoryRouterWithQuery>
          <div onClick={onCardClick} onMouseDown={onCardMouseDown}>
            <AddToPlaylistButton scenes={[{ id: "1", instanceId: "inst-a" }]} />
          </div>
        </MemoryRouterWithQuery>
      </ShortcutScopeProvider>
    );
    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("+ Create New Playlist"));
    onCardClick.mockClear();
    onCardMouseDown.mockClear();

    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onCardClick).not.toHaveBeenCalled();
    expect(onCardMouseDown).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
