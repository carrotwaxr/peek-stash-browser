import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Use vi.hoisted to create mock functions that can be accessed in vi.mock
const { mockGet, mockPut } = vi.hoisted(() => {
  return {
    mockGet: vi.fn(),
    mockPut: vi.fn(),
  };
});

// Mock axios.create
vi.mock("axios", () => ({
  default: {
    create: () => ({
      get: mockGet,
      put: mockPut,
    }),
  },
}));

// Import after mock setup
import { CardDisplaySettingsProvider, useCardDisplaySettings } from "../../src/contexts/CardDisplaySettingsContext.jsx";

describe("useCardDisplaySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock - empty settings
    mockGet.mockResolvedValue({
      data: { settings: { cardDisplaySettings: null } },
    });
    mockPut.mockResolvedValue({ data: { success: true } });
  });

  describe("without provider", () => {
    it("throws error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        renderHook(() => useCardDisplaySettings());
      }).toThrow("useCardDisplaySettings must be used within CardDisplaySettingsProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("with provider", () => {
    const wrapper = ({ children }) => (
      <CardDisplaySettingsProvider>{children}</CardDisplaySettingsProvider>
    );

    it("initially shows loading state then loads", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for load to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("provides getSettings function", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.getSettings).toBe("function");
    });

    it("provides updateSettings function", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.updateSettings).toBe("function");
    });
  });

  describe("getSettings", () => {
    const wrapper = ({ children }) => (
      <CardDisplaySettingsProvider>{children}</CardDisplaySettingsProvider>
    );

    it("returns default settings for scene entity type", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const settings = result.current.getSettings("scene");

      expect(settings).toEqual({
        showCodeOnCard: true,
        showDescriptionOnCard: true,
        showDescriptionOnDetail: true,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
      });
    });

    it("returns default settings for performer entity type (no showCodeOnCard)", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const settings = result.current.getSettings("performer");

      expect(settings).toEqual({
        showDescriptionOnCard: true,
        showDescriptionOnDetail: true,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
      });
      expect(settings.showCodeOnCard).toBeUndefined();
    });

    it("merges user settings with defaults", async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          settings: {
            cardDisplaySettings: {
              scene: {
                showCodeOnCard: false,
                showRating: false,
              },
            },
          },
        },
      });

      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

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
      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

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
    const wrapper = ({ children }) => (
      <CardDisplaySettingsProvider>{children}</CardDisplaySettingsProvider>
    );

    it("performs optimistic update", async () => {
      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

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
        data: {
          settings: {
            cardDisplaySettings: {
              performer: { showRating: false },
            },
          },
        },
      });

      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

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
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

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
    const wrapper = ({ children }) => (
      <CardDisplaySettingsProvider>{children}</CardDisplaySettingsProvider>
    );

    it("handles API load failure gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGet.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

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
        data: { settings: { cardDisplaySettings: null } },
      });

      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fall back to defaults
      const settings = result.current.getSettings("scene");
      expect(settings.showRating).toBe(true);
    });

    it("handles undefined cardDisplaySettings from API", async () => {
      mockGet.mockResolvedValueOnce({
        data: { settings: {} },
      });

      const { result } = renderHook(() => useCardDisplaySettings(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fall back to defaults
      const settings = result.current.getSettings("performer");
      expect(settings.showFavorite).toBe(true);
    });
  });
});
