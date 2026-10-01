import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createAuthValue, must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as hooksModule from "@/api/hooks";
import type * as uiModule from "@/components/ui/index";
import PlaybackControls from "@/components/video-player/PlaybackControls";
import { AuthContext } from "@/contexts/AuthContextProvider";

const mockDispatch = vi.fn(
  (_action: { type: string; payload?: unknown }) => {}
);
let mockOCounter = 2;

vi.mock("@/api", () => ({
  apiPost: vi.fn(),
  getMyPermissions: () => Promise.resolve({ permissions: {} }),
  libraryApi: { updateRating: vi.fn(), updateFavorite: vi.fn() },
}));

const mockDecrement = vi.fn((_vars: { sceneId: string; instanceId: string }) =>
  Promise.resolve({ success: true as const, oCount: 1 })
);
vi.mock("@/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof hooksModule>()),
  useDecrementOCounter: () => ({
    mutateAsync: mockDecrement,
    isPending: false,
  }),
}));

vi.mock("@/contexts/ScenePlayerContext", () => ({
  useScenePlayer: () => ({
    scene: { id: "7", instanceId: "inst-b", title: "A scene" },
    sceneLoading: false,
    oCounter: mockOCounter,
    dispatch: mockDispatch,
  }),
}));

vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({
      showRating: false,
      showOCounter: true,
      showFavorite: false,
    }),
  }),
}));

vi.mock("@/hooks/useRatingHotkeys", () => ({ useRatingHotkeys: vi.fn() }));
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));

// The O button itself is OCounterButton's own test's subject
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof uiModule>()),
  OCounterButton: ({ initialCount }: { initialCount?: number }) => (
    <span data-testid="o-counter">{initialCount}</span>
  ),
  AddToPlaylistButton: () => null,
}));

describe("PlaybackControls Remove last O", () => {
  beforeEach(() => {
    mockOCounter = 2;
    mockDispatch.mockClear();
    mockDecrement.mockClear();
  });

  it("the scene page offers Remove last O beside the O counter", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider
          value={createAuthValue({ isAuthenticated: true })}
        >
          <PlaybackControls />
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    // One per layout; each sits beside an O counter
    const menus = screen.getAllByLabelText("More options");
    expect(menus).toHaveLength(screen.getAllByTestId("o-counter").length);
    fireEvent.click(must(menus[0]));
    // Only that item: no Hide on the scene page
    expect(screen.queryByText("Hide Scene")).toBeNull();
    fireEvent.click(screen.getByText("Remove last O"));

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SET_O_COUNTER",
        payload: 1,
      })
    );
    expect(mockDecrement).toHaveBeenCalledWith({
      sceneId: "7",
      instanceId: "inst-b",
    });
  });

  it("at 0 Os the scene page shows no menu", () => {
    mockOCounter = 0;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider
          value={createAuthValue({ isAuthenticated: true })}
        >
          <PlaybackControls />
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    expect(screen.getAllByTestId("o-counter").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("More options")).toBeNull();
  });
});
