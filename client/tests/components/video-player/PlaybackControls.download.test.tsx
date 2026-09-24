import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlaybackControls from "@/components/video-player/PlaybackControls";

const mockApiPost = vi.fn();
const mockGetMyPermissions = vi.fn();

vi.mock("@/api", () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  getMyPermissions: (...args: unknown[]) => mockGetMyPermissions(...args),
  libraryApi: { updateRating: vi.fn(), updateFavorite: vi.fn() },
}));

vi.mock("@/contexts/ScenePlayerContext", () => ({
  useScenePlayer: () => ({
    scene: { id: "7", instanceId: "inst-b", title: "x" },
    sceneLoading: false,
    videoLoading: false,
    oCounter: 0,
    dispatch: vi.fn(),
  }),
}));

vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({
      showRating: false,
      showOCounter: false,
      showFavorite: false,
    }),
  }),
}));

vi.mock("@/hooks/useRatingHotkeys", () => ({ useRatingHotkeys: vi.fn() }));
// ThemedIcon reads the theme; no ThemeProvider here (as in SetupWizard.test).
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));

// These two need a QueryClient; the download button doesn't.
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/index")>()),
  OCounterButton: () => null,
  AddToPlaylistButton: () => null,
}));

describe("PlaybackControls download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyPermissions.mockResolvedValue({
      permissions: { canDownloadFiles: true },
    });
    mockApiPost.mockResolvedValue({ download: { id: 1, status: "PENDING" } });
  });

  it("sends the scene's instance with the download request", async () => {
    render(<PlaybackControls />);

    const buttons = await screen.findAllByTitle("Download");
    fireEvent.click(must(buttons[0]));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/downloads/scene/7", {
        instanceId: "inst-b",
      });
    });
  });
});
