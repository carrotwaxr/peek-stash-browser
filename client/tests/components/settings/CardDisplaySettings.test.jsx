import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Use vi.hoisted to create mock functions that can be accessed in vi.mock
const { mockGetSettings, mockUpdateSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
}));

// Mock the CardDisplaySettingsContext
vi.mock("../../../src/contexts/CardDisplaySettingsContext.jsx", () => ({
  useCardDisplaySettings: () => ({
    getSettings: mockGetSettings,
    updateSettings: mockUpdateSettings,
    isLoading: false,
  }),
}));

// Mock toast notifications
vi.mock("../../../src/utils/toast.jsx", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// Import after mocks
import CardDisplaySettings from "../../../src/components/settings/CardDisplaySettings.jsx";
import { showSuccess, showError } from "../../../src/utils/toast.jsx";

describe("CardDisplaySettings", () => {
  const defaultSettings = {
    showCodeOnCard: true,
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRating: true,
    showFavorite: true,
    showOCounter: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockReturnValue(defaultSettings);
    mockUpdateSettings.mockResolvedValue(undefined);
  });

  describe("basic rendering", () => {
    it("renders the component title", () => {
      render(<CardDisplaySettings />);

      expect(screen.getByText("Card Display")).toBeInTheDocument();
    });

    it("renders the description text", () => {
      render(<CardDisplaySettings />);

      expect(
        screen.getByText(/Control what information appears on entity cards/)
      ).toBeInTheDocument();
    });

    it("renders all entity type accordion sections", () => {
      render(<CardDisplaySettings />);

      expect(screen.getByRole("button", { name: /Scene/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Performer/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Studio/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Gallery/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Group/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Tag/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Image/i })).toBeInTheDocument();
    });
  });

  describe("accordion behavior", () => {
    it("expands Scene section by default", () => {
      render(<CardDisplaySettings />);

      // Scene section should be expanded by default
      // The "Show studio code on cards" toggle should be visible (only in scene)
      expect(screen.getByLabelText(/Show studio code on cards/)).toBeInTheDocument();
    });

    it("collapses current section when clicking another entity", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      // Click on Performer
      await user.click(screen.getByRole("button", { name: /Performer/i }));

      // Scene-specific toggle should not be visible
      expect(screen.queryByLabelText(/Show studio code on cards/)).not.toBeInTheDocument();

      // Performer toggles should be visible
      expect(screen.getByLabelText(/Show description on cards/)).toBeInTheDocument();
    });

    it("toggles section expansion on click", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      // Scene is expanded - click to collapse
      await user.click(screen.getByRole("button", { name: /Scene/i }));

      // Scene toggles should no longer be visible
      expect(screen.queryByLabelText(/Show studio code on cards/)).not.toBeInTheDocument();

      // Click again to expand
      await user.click(screen.getByRole("button", { name: /Scene/i }));

      // Toggles should be visible again
      expect(screen.getByLabelText(/Show studio code on cards/)).toBeInTheDocument();
    });
  });

  describe("Scene-specific settings", () => {
    it("shows 'Show studio code' toggle only for scene", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      // Scene has code toggle
      expect(screen.getByLabelText(/Show studio code on cards/)).toBeInTheDocument();

      // Switch to Performer
      await user.click(screen.getByRole("button", { name: /Performer/i }));

      // Performer doesn't have code toggle
      expect(screen.queryByLabelText(/Show studio code on cards/)).not.toBeInTheDocument();
    });

    it("shows code toggle description", () => {
      render(<CardDisplaySettings />);

      expect(
        screen.getByText(/Display scene codes.*JAV codes.*in card subtitles/)
      ).toBeInTheDocument();
    });
  });

  describe("toggle behavior", () => {
    it("renders all toggles with correct initial state", () => {
      render(<CardDisplaySettings />);

      const codeToggle = screen.getByLabelText(/Show studio code on cards/);
      const descCardToggle = screen.getByLabelText(/Show description on cards/);
      const descDetailToggle = screen.getByLabelText(/Show description on detail page/);
      const ratingToggle = screen.getByLabelText(/Show rating/);
      const favoriteToggle = screen.getByLabelText(/Show favorite/);
      const oCounterToggle = screen.getByLabelText(/Show O counter/);

      expect(codeToggle).toBeChecked();
      expect(descCardToggle).toBeChecked();
      expect(descDetailToggle).toBeChecked();
      expect(ratingToggle).toBeChecked();
      expect(favoriteToggle).toBeChecked();
      expect(oCounterToggle).toBeChecked();
    });

    it("reflects disabled state from settings", () => {
      mockGetSettings.mockReturnValue({
        ...defaultSettings,
        showRating: false,
        showFavorite: false,
      });

      render(<CardDisplaySettings />);

      expect(screen.getByLabelText(/Show rating/)).not.toBeChecked();
      expect(screen.getByLabelText(/Show favorite/)).not.toBeChecked();
    });

    it("calls updateSettings when toggle is clicked", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      const ratingToggle = screen.getByLabelText(/Show rating/);
      await user.click(ratingToggle);

      expect(mockUpdateSettings).toHaveBeenCalledWith("scene", "showRating", false);
    });

    it("calls updateSettings with correct entity type", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      // Switch to Performer
      await user.click(screen.getByRole("button", { name: /Performer/i }));

      const favoriteToggle = screen.getByLabelText(/Show favorite/);
      await user.click(favoriteToggle);

      expect(mockUpdateSettings).toHaveBeenCalledWith("performer", "showFavorite", false);
    });

    it("shows success toast on successful update", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      const ratingToggle = screen.getByLabelText(/Show rating/);
      await user.click(ratingToggle);

      await waitFor(() => {
        expect(showSuccess).toHaveBeenCalledWith("Setting saved");
      });
    });

    it("shows error toast on failed update", async () => {
      mockUpdateSettings.mockRejectedValueOnce(new Error("Network error"));
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      const ratingToggle = screen.getByLabelText(/Show rating/);
      await user.click(ratingToggle);

      await waitFor(() => {
        expect(showError).toHaveBeenCalledWith("Failed to save setting");
      });
    });
  });

  describe("all entity types", () => {
    it("calls getSettings for each entity type when expanded", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      // Scene is expanded by default
      expect(mockGetSettings).toHaveBeenCalledWith("scene");

      // Expand Performer
      await user.click(screen.getByRole("button", { name: /Performer/i }));
      expect(mockGetSettings).toHaveBeenCalledWith("performer");

      // Expand Studio
      await user.click(screen.getByRole("button", { name: /Studio/i }));
      expect(mockGetSettings).toHaveBeenCalledWith("studio");
    });

    it("renders consistent toggles for non-scene entities", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      // Test each non-scene entity has the same toggles
      const nonSceneEntities = ["Performer", "Studio", "Gallery", "Group", "Tag", "Image"];

      for (const entity of nonSceneEntities) {
        await user.click(screen.getByRole("button", { name: new RegExp(entity, "i") }));

        // Should NOT have code toggle
        expect(screen.queryByLabelText(/Show studio code on cards/)).not.toBeInTheDocument();

        // Should have standard toggles
        expect(screen.getByLabelText(/Show description on cards/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Show description on detail page/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Show rating/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Show favorite/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Show O counter/)).toBeInTheDocument();
      }
    });
  });

  describe("accessibility", () => {
    it("all toggles have accessible labels", () => {
      render(<CardDisplaySettings />);

      // All toggles should be checkboxes with labels
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes.length).toBe(6); // 5 standard + 1 code toggle for scene
    });

    it("accordion buttons are accessible", () => {
      render(<CardDisplaySettings />);

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(7); // One for each entity type

      // Each button should have text content
      buttons.forEach((button) => {
        expect(button.textContent).toBeTruthy();
      });
    });
  });
});
