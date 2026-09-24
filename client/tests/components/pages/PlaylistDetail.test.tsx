import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlaylistDetail from "@/components/pages/PlaylistDetail";
import type * as uiModule from "@/components/ui/index";

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockGetMyPermissions = vi.fn();

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
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
  SceneListItem: () => null,
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
