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
import {
  getAvailableSettings,
  ENTITY_DISPLAY_CONFIG,
} from "../../../src/config/entityDisplayConfig.js";

describe("CardDisplaySettings", () => {
  // Default settings matching the new config structure
  const defaultSettings = {
    defaultViewMode: "grid",
    showCodeOnCard: true,
    showStudio: true,
    showDate: true,
    showDescriptionOnCard: true,
    showDescriptionOnDetail: true,
    showRelationshipIndicators: true,
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

    it("renders settings based on entity config", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      // Scene has showCodeOnCard
      expect(screen.getByLabelText(/Show studio code on cards/)).toBeInTheDocument();

      // Tag has fewer settings (no showRating, showFavorite, showOCounter)
      await user.click(screen.getByRole("button", { name: /Tag/i }));

      // Tag should have description and relationship indicators
      expect(screen.getByLabelText(/Show description on cards/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Show relationship indicators/)).toBeInTheDocument();

      // Tag should NOT have rating, favorite, o counter
      expect(screen.queryByLabelText(/Show rating/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Show favorite/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Show O counter/)).not.toBeInTheDocument();
    });

    it("renders performer settings correctly", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      // Switch to Performer
      await user.click(screen.getByRole("button", { name: /Performer/i }));

      // Should NOT have code toggle (scene-only)
      expect(screen.queryByLabelText(/Show studio code on cards/)).not.toBeInTheDocument();

      // Should have standard toggles
      expect(screen.getByLabelText(/Show description on cards/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Show description on detail page/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Show relationship indicators/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Show rating/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Show favorite/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Show O counter/)).toBeInTheDocument();
    });
  });

  describe("default view mode dropdown", () => {
    it("renders default view mode dropdown for scene", () => {
      render(<CardDisplaySettings />);

      // Scene should have a dropdown for default view mode
      const dropdown = screen.getByRole("combobox");
      expect(dropdown).toBeInTheDocument();
      expect(dropdown).toHaveValue("grid");
    });

    it("shows available view modes in dropdown", () => {
      render(<CardDisplaySettings />);

      const dropdown = screen.getByRole("combobox");
      const options = dropdown.querySelectorAll("option");

      // Scene has grid, wall, table, timeline, folder
      expect(options.length).toBe(5);
      expect(options[0]).toHaveValue("grid");
      expect(options[1]).toHaveValue("wall");
      expect(options[2]).toHaveValue("table");
      expect(options[3]).toHaveValue("timeline");
      expect(options[4]).toHaveValue("folder");
    });

    it("calls updateSettings when view mode changes", async () => {
      const user = userEvent.setup();
      render(<CardDisplaySettings />);

      const dropdown = screen.getByRole("combobox");
      await user.selectOptions(dropdown, "wall");

      expect(mockUpdateSettings).toHaveBeenCalledWith("scene", "defaultViewMode", "wall");
    });
  });

  describe("accessibility", () => {
    it("all toggles have accessible labels", () => {
      render(<CardDisplaySettings />);

      // Scene toggle settings exclude dropdown settings (defaultViewMode, defaultGridDensity, defaultWallZoom)
      const dropdownSettings = ["defaultViewMode", "defaultGridDensity", "defaultWallZoom"];
      const sceneToggleSettings = getAvailableSettings("scene").filter(
        (s) => !dropdownSettings.includes(s)
      );
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes.length).toBe(sceneToggleSettings.length);
    });

    it("accordion buttons are accessible", () => {
      render(<CardDisplaySettings />);

      // Buttons include: 8 entity type accordions (scene, performer, studio, tag, group, gallery, image, clip)
      // + 3 zoom slider buttons (smaller, reset, larger)
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(11);

      // Each button should have text content (zoom buttons may have empty text but have aria-labels)
      buttons.forEach((button) => {
        const hasContent = button.textContent || button.getAttribute("aria-label");
        expect(hasContent).toBeTruthy();
      });
    });
  });
});
