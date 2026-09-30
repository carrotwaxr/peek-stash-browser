import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type * as routerModule from "react-router-dom";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlaylistDetail from "@/components/pages/PlaylistDetail";
import type * as uiModule from "@/components/ui/index";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn<(...args: unknown[]) => unknown>();
const mockApiDelete = vi.fn<(...args: unknown[]) => unknown>();
const mockGetMyPermissions = vi.fn();
const { mockNavigate, rowLinkStates } = vi.hoisted(() => ({
  mockNavigate: vi.fn<(...args: unknown[]) => void>(),
  rowLinkStates: [] as unknown[],
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof routerModule>()),
  useNavigate: () => mockNavigate,
}));

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
  duplicatePlaylist: vi.fn(),
  getMyPermissions: (...args: unknown[]) => mockGetMyPermissions(...args),
  getMyGroups: vi.fn(),
  getPlaylistShares: vi.fn(),
  updatePlaylistShares: vi.fn(),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("@/hooks/useNavigationState", () => ({
  useNavigationState: () => ({ goBack: vi.fn(), backButtonText: "Back" }),
}));
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
// ThemedIcon reads the theme; no ThemeProvider here (as in SetupWizard.test).
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof uiModule>()),
  // Only the row's own controls: its reorder handle and its buttons
  SceneListItem: ({
    dragHandle,
    actionButtons,
    linkState,
  }: {
    dragHandle?: ReactNode;
    actionButtons?: ReactNode;
    linkState?: unknown;
  }) => (
    <div
      data-testid="playlist-row"
      ref={() => {
        rowLinkStates.push(linkState);
      }}
    >
      {dragHandle}
      {actionButtons}
    </div>
  ),
}));

const sharedPlaylist = {
  playlist: {
    id: 5,
    name: "P",
    items: [
      {
        sceneId: "1",
        instanceId: "i",
        scene: { id: "1", instanceId: "i", title: "S" },
      },
    ],
    user: { username: "owner" },
  },
  isOwner: false,
  accessLevel: "shared",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/playlist/5"]}>
      <Routes>
        <Route path="/playlist/:playlistId" element={<PlaylistDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PlaylistDetail download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((endpoint: string) => {
      if (endpoint === "/playlists/5") return Promise.resolve(sharedPlaylist);
      return Promise.reject(new Error(`unexpected GET ${endpoint}`));
    });
    mockApiPost.mockResolvedValue({ download: { id: 1, status: "PENDING" } });
  });

  it("shows Download to a shared viewer with the playlist-download permission", async () => {
    mockGetMyPermissions.mockResolvedValue({
      permissions: { canDownloadPlaylists: true },
    });

    renderPage();

    expect(await screen.findByTitle("Download Playlist")).toBeInTheDocument();
  });

  it("hides Download from a shared viewer without it", async () => {
    mockGetMyPermissions.mockResolvedValue({
      permissions: { canDownloadPlaylists: false },
    });

    renderPage();

    await screen.findByTitle("Duplicate to My Playlists");
    await waitFor(() => expect(mockGetMyPermissions).toHaveBeenCalled());
    expect(screen.queryByTitle("Download Playlist")).not.toBeInTheDocument();
  });

  it("posts the playlist download", async () => {
    mockGetMyPermissions.mockResolvedValue({
      permissions: { canDownloadPlaylists: true },
    });

    renderPage();
    fireEvent.click(await screen.findByTitle("Download Playlist"));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/downloads/playlist/5");
    });
  });
});

/** The owner's playlist: scene 7 on server A, then scene 7 on server B */
const ownPlaylist = {
  playlist: {
    id: 5,
    name: "Mine",
    items: [
      {
        sceneId: "7",
        instanceId: "inst-a",
        scene: { id: "7", instanceId: "inst-a", title: "Seven on A" },
      },
      {
        sceneId: "7",
        instanceId: "inst-b",
        scene: { id: "7", instanceId: "inst-b", title: "Seven on B" },
      },
    ],
  },
  isOwner: true,
};

describe("PlaylistDetail items on two servers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((endpoint: string) => {
      if (endpoint === "/playlists/5") return Promise.resolve(ownPlaylist);
      return Promise.reject(new Error(`unexpected GET ${endpoint}`));
    });
    mockGetMyPermissions.mockResolvedValue({ permissions: {} });
    mockApiPut.mockResolvedValue({ success: true });
    mockApiDelete.mockResolvedValue({ success: true });
  });

  it("remove and reorder send each item's instance", async () => {
    renderPage();

    // Save the order as it is: each item names its instance
    await screen.findAllByTestId("playlist-row");
    fireEvent.click(screen.getByTitle("Reorder Scenes"));
    fireEvent.click(screen.getByTitle("Save Order"));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith("/playlists/5/reorder", {
        items: [
          { sceneId: "7", instanceId: "inst-a", position: 0 },
          { sceneId: "7", instanceId: "inst-b", position: 1 },
        ],
      });
    });

    // Remove the second row: scene 7 on B
    const rows = await screen.findAllByTestId("playlist-row");
    expect(rows).toHaveLength(2);
    fireEvent.click(
      within(must(rows[1], "second row")).getByRole("button", {
        name: "Remove",
      })
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove",
      })
    );

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/playlists/5/items/7?instanceId=inst-b"
      );
    });
    // Only B's row left the list
    await waitFor(() => {
      expect(screen.getAllByTestId("playlist-row")).toHaveLength(1);
    });
  });

  it("reorder moves two items sharing a scene id by their instances", async () => {
    renderPage();

    await screen.findAllByTestId("playlist-row");
    fireEvent.click(screen.getByTitle("Reorder Scenes"));
    const rows = screen.getAllByTestId("playlist-row");
    fireEvent.click(
      within(must(rows[1], "second row")).getByTitle("Move to top")
    );
    fireEvent.click(screen.getByTitle("Save Order"));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith("/playlists/5/reorder", {
        items: [
          { sceneId: "7", instanceId: "inst-b", position: 0 },
          { sceneId: "7", instanceId: "inst-a", position: 1 },
        ],
      });
    });
  });
  it("Play and a row link pass the same slim entries", async () => {
    const full = (id: string, instanceId: string) => ({
      id,
      instanceId,
      title: `Seven on ${instanceId}`,
      files: [{ path: `/m/${id}.mp4`, basename: `${id}.mp4`, duration: 90 }],
      paths: { screenshot: `/s/${instanceId}`, preview: "/p", sprite: "/x" },
      studio: { id: "9", name: "Studio" },
      performers: [{ id: "1", name: "Someone" }],
      tags: [{ id: "2", name: "A tag" }],
      sceneStreams: [{ url: "/stream" }],
    });
    mockApiGet.mockImplementation((endpoint: string) => {
      if (endpoint === "/playlists/5")
        return Promise.resolve({
          playlist: {
            id: 5,
            name: "Mine",
            items: [
              {
                sceneId: "7",
                instanceId: "inst-a",
                scene: full("7", "inst-a"),
              },
              {
                sceneId: "7",
                instanceId: "inst-b",
                scene: full("7", "inst-b"),
              },
            ],
          },
          isOwner: true,
        });
      return Promise.reject(new Error(`unexpected GET ${endpoint}`));
    });
    rowLinkStates.length = 0;
    renderPage();
    await screen.findAllByTestId("playlist-row");

    fireEvent.click(screen.getByTitle("Play Playlist"));

    const [, options] = must(mockNavigate.mock.calls.at(-1)) as [
      string,
      { state: { playlist: { scenes: unknown[] } } },
    ];
    const expected = [
      {
        sceneId: "7",
        instanceId: "inst-a",
        position: 0,
        scene: {
          title: "Seven on inst-a",
          paths: { screenshot: "/s/inst-a" },
          files: [{ duration: 90, basename: "7.mp4" }],
          studio: { name: "Studio" },
        },
      },
      {
        sceneId: "7",
        instanceId: "inst-b",
        position: 1,
        scene: {
          title: "Seven on inst-b",
          paths: { screenshot: "/s/inst-b" },
          files: [{ duration: 90, basename: "7.mp4" }],
          studio: { name: "Studio" },
        },
      },
    ];
    expect(options.state.playlist.scenes).toEqual(expected);

    // The second row's link carries the same entries, at its own index
    const rowState = must(rowLinkStates.at(-1)) as {
      playlist: { scenes: unknown[]; currentIndex: number };
    };
    expect(rowState.playlist.scenes).toEqual(expected);
    expect(rowState.playlist.currentIndex).toBe(1);
  });
});
