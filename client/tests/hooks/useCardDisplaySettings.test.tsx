import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createAuthValue } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultSettings } from "../../src/config/entityDisplayConfig";
import {
  AuthContext,
  type AuthContextValue,
} from "../../src/contexts/AuthContextProvider";
// Import after mock setup
import {
  CardDisplaySettingsProvider,
  useCardDisplaySettings,
} from "../../src/contexts/CardDisplaySettingsContext";

// Use vi.hoisted to create mock functions that can be accessed in vi.mock
const { mockGet, mockPut } = vi.hoisted(() => {
  return {
    mockGet: vi.fn(),
    mockPut: vi.fn(),
  };
});

// Mock the typed API client
vi.mock("../../src/api", () => ({
  apiGet: (...args: unknown[]) => mockGet(...args),
  apiPut: (...args: unknown[]) => mockPut(...args),
}));

// The provider loads settings only for a signed-in user (useAuth).
const signedIn = createAuthValue({ isAuthenticated: true });

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider value={signedIn}>
    <CardDisplaySettingsProvider>{children}</CardDisplaySettingsProvider>
  </AuthContext.Provider>
);

/** Renders the hook under a provider whose auth state can change. */
function renderWithAuth(initialAuth: AuthContextValue) {
  let auth = initialAuth;
  const authWrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={auth}>
      <CardDisplaySettingsProvider>{children}</CardDisplaySettingsProvider>
    </AuthContext.Provider>
  );
  const view = renderHook(() => useCardDisplaySettings(), {
    wrapper: authWrapper,
  });
  return {
    ...view,
    setAuth: (next: AuthContextValue) => {
      auth = next;
      view.rerender();
    },
  };
}

describe("useCardDisplaySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock - empty settings (apiGet returns body directly, no .data wrapper)
    mockGet.mockResolvedValue({ settings: { cardDisplaySettings: null } });
    mockPut.mockResolvedValue({ success: true });
  });

  describe("without provider", () => {
    it("throws error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useCardDisplaySettings());
      }).toThrow(
        "useCardDisplaySettings must be used within CardDisplaySettingsProvider"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("with provider", () => {
    it("initially shows loading state then loads", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for load to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("provides getSettings function", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.getSettings).toBe("function");
    });

    it("provides updateSettings function", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.updateSettings).toBe("function");
    });
  });

  describe("auth", () => {
    const userSettings = {
      settings: { cardDisplaySettings: { scene: { showRating: false } } },
    };

    it("does not ask for user settings while signed out", async () => {
      mockGet.mockResolvedValue(userSettings);
      const { result } = renderWithAuth(
        createAuthValue({ isAuthenticated: false, isLoading: false })
      );

      // Let any request the mount started settle before checking.
      await act(async () => {});
      expect(mockGet).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.getSettings("scene")).toEqual(
        getDefaultSettings("scene")
      );
    });

    it("loads user settings once the user signs in", async () => {
      mockGet.mockResolvedValue(userSettings);
      const { result, setAuth } = renderWithAuth(
        createAuthValue({ isAuthenticated: false, isLoading: false })
      );

      setAuth(createAuthValue({ isAuthenticated: true, isLoading: false }));

      await waitFor(() => {
        expect(result.current.getSettings("scene").showRating).toBe(false);
      });
      expect(result.current.isLoading).toBe(false);
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith("/user/settings");
    });

    it("stays loading without a request while auth is loading", async () => {
      const { result } = renderWithAuth(
        createAuthValue({ isAuthenticated: false, isLoading: true })
      );

      await act(async () => {});
      expect(mockGet).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("getSettings", () => {
    it("returns default settings for scene entity type", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const settings = result.current.getSettings("scene");

      // Should match defaults from shared config
      expect(settings).toEqual(getDefaultSettings("scene"));
    });

    it("returns default settings for performer entity type (no showCodeOnCard)", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const settings = result.current.getSettings("performer");

      // Should match defaults from shared config
      expect(settings).toEqual(getDefaultSettings("performer"));
      // Performer doesn't have showCodeOnCard setting
      expect(settings.showCodeOnCard).toBeUndefined();
    });

    it("merges user settings with defaults", async () => {
      mockGet.mockResolvedValueOnce({
        settings: {
          cardDisplaySettings: {
            scene: {
              showCodeOnCard: false,
              showRating: false,
            },
          },
        },
      });

      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const settings = result.current.getSettings("scene");

      // User overrides
      expect(settings.showCodeOnCard).toBe(false);
      expect(settings.showRating).toBe(false);
      // Defaults for non-overridden settings
      expect(settings.showDescriptionOnCard).toBe(true);
      expect(settings.showDescriptionOnDetail).toBe(true);
      expect(settings.showFavorite).toBe(true);
      expect(settings.showOCounter).toBe(true);
    });

    it("returns different defaults for different entity types", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const sceneSettings = result.current.getSettings("scene");
      const performerSettings = result.current.getSettings("performer");
      const studioSettings = result.current.getSettings("studio");

      // Scene has showCodeOnCard
      expect(sceneSettings.showCodeOnCard).toBe(true);

      // Other entities don't have showCodeOnCard
      expect(performerSettings.showCodeOnCard).toBeUndefined();
      expect(studioSettings.showCodeOnCard).toBeUndefined();
    });
  });

  describe("updateSettings", () => {
    it("performs optimistic update", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initial state - defaults
      expect(result.current.getSettings("scene").showRating).toBe(true);

      // Update
      await act(async () => {
        await result.current.updateSettings("scene", "showRating", false);
      });

      // Should immediately reflect change (optimistic)
      expect(result.current.getSettings("scene").showRating).toBe(false);
    });

    it("calls API with merged settings", async () => {
      mockGet.mockResolvedValueOnce({
        settings: {
          cardDisplaySettings: {
            performer: { showRating: false },
          },
        },
      });

      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateSettings("scene", "showFavorite", false);
      });

      // Should send complete merged settings
      expect(mockPut).toHaveBeenCalledWith("/user/settings", {
        cardDisplaySettings: {
          performer: { showRating: false },
          scene: { showFavorite: false },
        },
      });
    });

    it("reverts on API error", async () => {
      mockPut.mockRejectedValueOnce(new Error("Network error"));
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initial state
      expect(result.current.getSettings("scene").showRating).toBe(true);

      // Attempt update that will fail
      await act(async () => {
        try {
          await result.current.updateSettings("scene", "showRating", false);
        } catch {
          // Expected to throw
        }
      });

      // Should revert to original state
      expect(result.current.getSettings("scene").showRating).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe("error handling", () => {
    it("handles API load failure gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockGet.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should still provide defaults even on error
      const settings = result.current.getSettings("scene");
      expect(settings.showRating).toBe(true);

      consoleSpy.mockRestore();
    });

    it("handles null cardDisplaySettings from API", async () => {
      mockGet.mockResolvedValueOnce({
        settings: { cardDisplaySettings: null },
      });

      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fall back to defaults
      const settings = result.current.getSettings("scene");
      expect(settings.showRating).toBe(true);
    });

    it("handles undefined cardDisplaySettings from API", async () => {
      mockGet.mockResolvedValueOnce({
        settings: {},
      });

      const { result } = renderHook(() => useCardDisplaySettings(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fall back to defaults
      const settings = result.current.getSettings("performer");
      expect(settings.showFavorite).toBe(true);
    });
  });
});
