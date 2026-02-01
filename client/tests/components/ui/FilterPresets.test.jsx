/**
 * FilterPresets Component Tests
 *
 * Tests user interactions with preset management:
 * - Loading saved presets
 * - Saving new presets
 * - Setting default presets
 * - Deleting presets
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import FilterPresets from "../../../src/components/ui/FilterPresets.jsx";

// Mock the API module
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiDelete = vi.fn();

vi.mock("../../../src/services/api.js", () => ({
  apiGet: (...args) => mockApiGet(...args),
  apiPost: (...args) => mockApiPost(...args),
  apiPut: (...args) => mockApiPut(...args),
  apiDelete: (...args) => mockApiDelete(...args),
}));

// Mock window.confirm for delete confirmation
const originalConfirm = window.confirm;

describe("FilterPresets", () => {
  const defaultProps = {
    artifactType: "scene",
    context: "scene",
    currentFilters: { favorite: true },
    permanentFilters: {},
    currentSort: "o_counter",
    currentDirection: "DESC",
    onLoadPreset: vi.fn(),
  };

  const mockPresets = [
    { id: "preset-1", name: "Favorites", filters: { favorite: true }, sort: "rating", direction: "DESC" },
    { id: "preset-2", name: "Recent", filters: {}, sort: "created_at", direction: "DESC" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);

    // Default API responses
    mockApiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({ presets: { scene: mockPresets } });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: {} });
      }
      return Promise.resolve({});
    });
    mockApiPost.mockResolvedValue({});
    mockApiPut.mockResolvedValue({});
    mockApiDelete.mockResolvedValue({});
  });

  afterAll(() => {
    window.confirm = originalConfirm;
  });

  describe("Rendering", () => {
    it("renders Load Preset and Save Preset buttons", async () => {
      render(<FilterPresets {...defaultProps} />);

      expect(screen.getByText("Load Preset")).toBeInTheDocument();
      expect(screen.getByText("Save Preset")).toBeInTheDocument();
    });

    it("fetches presets on mount", async () => {
      render(<FilterPresets {...defaultProps} />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith("/user/filter-presets");
        expect(mockApiGet).toHaveBeenCalledWith("/user/default-presets");
      });
    });
  });

  describe("Load Preset Dropdown", () => {
    it("opens dropdown when Load Preset clicked", async () => {
      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      const loadButton = screen.getByText("Load Preset").closest("button");
      await user.click(loadButton);

      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
        expect(screen.getByText("Recent")).toBeInTheDocument();
      });
    });

    it("shows 'No saved presets' when empty", async () => {
      mockApiGet.mockImplementation((url) => {
        if (url === "/user/filter-presets") {
          return Promise.resolve({ presets: { scene: [] } });
        }
        return Promise.resolve({ defaults: {} });
      });

      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      const loadButton = screen.getByText("Load Preset").closest("button");
      await user.click(loadButton);

      await waitFor(() => {
        expect(screen.getByText("No saved presets")).toBeInTheDocument();
      });
    });

    it("calls onLoadPreset when preset is clicked", async () => {
      const user = userEvent.setup();
      const onLoadPreset = vi.fn();
      render(<FilterPresets {...defaultProps} onLoadPreset={onLoadPreset} />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      // Open dropdown
      const loadButton = screen.getByText("Load Preset").closest("button");
      await user.click(loadButton);

      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
      });

      // Click on preset
      await user.click(screen.getByText("Favorites"));

      expect(onLoadPreset).toHaveBeenCalledWith({
        filters: { favorite: true },
        sort: "rating",
        direction: "DESC",
        viewMode: "grid",
        zoomLevel: "medium",
        gridDensity: "medium",
        tableColumns: null,
        perPage: null,
      });
    });

    it("merges permanent filters when loading preset", async () => {
      const user = userEvent.setup();
      const onLoadPreset = vi.fn();
      render(
        <FilterPresets
          {...defaultProps}
          permanentFilters={{ studioId: "studio-123" }}
          onLoadPreset={onLoadPreset}
        />
      );

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      // Open dropdown
      const loadButton = screen.getByText("Load Preset").closest("button");
      await user.click(loadButton);

      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
      });

      // Click on preset
      await user.click(screen.getByText("Favorites"));

      // Should include both preset filters and permanent filters
      expect(onLoadPreset).toHaveBeenCalledWith({
        filters: { favorite: true, studioId: "studio-123" },
        sort: "rating",
        direction: "DESC",
        viewMode: "grid",
        zoomLevel: "medium",
        gridDensity: "medium",
        tableColumns: null,
        perPage: null,
      });
    });

    it("closes dropdown when preset is loaded", async () => {
      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      // Open dropdown
      const loadButton = screen.getByText("Load Preset").closest("button");
      await user.click(loadButton);

      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
      });

      // Click on preset
      await user.click(screen.getByText("Favorites"));

      // Dropdown should close (preset name no longer visible in dropdown)
      await waitFor(() => {
        expect(screen.queryByText("Recent")).not.toBeInTheDocument();
      });
    });
  });

  describe("Save Preset Dialog", () => {
    it("opens save dialog when Save Preset clicked", async () => {
      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      const saveButton = screen.getByText("Save Preset").closest("button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText("Save Filter Preset")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter preset name...")).toBeInTheDocument();
      });
    });

    it("disables save button when name is empty", async () => {
      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      // Open save dialog
      await user.click(screen.getByText("Save Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Save Filter Preset")).toBeInTheDocument();
      });

      // Save button should be disabled when name is empty
      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).toBeDisabled();
    });

    it("saves preset with name and closes dialog", async () => {
      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      // Open save dialog
      await user.click(screen.getByText("Save Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Save Filter Preset")).toBeInTheDocument();
      });

      // Enter preset name
      await user.type(screen.getByPlaceholderText("Enter preset name..."), "My Preset");

      // Save
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith("/user/filter-presets", {
          artifactType: "scene",
          context: "scene",
          name: "My Preset",
          filters: { favorite: true },
          sort: "o_counter",
          direction: "DESC",
          viewMode: "grid",
          zoomLevel: "medium",
          gridDensity: "medium",
          tableColumns: null,
          perPage: 24,
          setAsDefault: false,
        });
      });

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText("Save Filter Preset")).not.toBeInTheDocument();
      });
    });

    it("strips permanent filters when saving", async () => {
      const user = userEvent.setup();
      render(
        <FilterPresets
          {...defaultProps}
          currentFilters={{ favorite: true, studioId: "studio-123" }}
          permanentFilters={{ studioId: "studio-123" }}
        />
      );

      // Open save dialog
      await user.click(screen.getByText("Save Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Save Filter Preset")).toBeInTheDocument();
      });

      // Enter preset name
      await user.type(screen.getByPlaceholderText("Enter preset name..."), "My Preset");

      // Save
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        // Should not include studioId (permanent filter)
        expect(mockApiPost).toHaveBeenCalledWith("/user/filter-presets", expect.objectContaining({
          filters: { favorite: true }, // studioId stripped out
        }));
      });
    });

    it("can set preset as default", async () => {
      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      // Open save dialog
      await user.click(screen.getByText("Save Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Save Filter Preset")).toBeInTheDocument();
      });

      // Enter preset name
      await user.type(screen.getByPlaceholderText("Enter preset name..."), "Default Preset");

      // Check "Set as default"
      await user.click(screen.getByRole("checkbox"));

      // Save
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith("/user/filter-presets", expect.objectContaining({
          setAsDefault: true,
        }));
      });
    });

    it("closes dialog on Cancel", async () => {
      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      // Open save dialog
      await user.click(screen.getByText("Save Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Save Filter Preset")).toBeInTheDocument();
      });

      // Click Cancel
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText("Save Filter Preset")).not.toBeInTheDocument();
      });
    });
  });

  describe("Delete Preset", () => {
    it("deletes preset after confirmation", async () => {
      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      // Open dropdown
      await user.click(screen.getByText("Load Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
      });

      // Find and click delete button for first preset
      const deleteButtons = screen.getAllByTitle("Delete preset");
      await user.click(deleteButtons[0]);

      expect(window.confirm).toHaveBeenCalledWith('Delete preset "Favorites"?');

      await waitFor(() => {
        expect(mockApiDelete).toHaveBeenCalledWith("/user/filter-presets/scene/preset-1");
      });
    });

    it("does not delete when confirmation cancelled", async () => {
      window.confirm = vi.fn(() => false);

      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      // Open dropdown
      await user.click(screen.getByText("Load Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
      });

      // Find and click delete button
      const deleteButtons = screen.getAllByTitle("Delete preset");
      await user.click(deleteButtons[0]);

      expect(window.confirm).toHaveBeenCalled();
      expect(mockApiDelete).not.toHaveBeenCalled();
    });
  });

  describe("Default Preset", () => {
    it("shows star indicator for default preset", async () => {
      mockApiGet.mockImplementation((url) => {
        if (url === "/user/filter-presets") {
          return Promise.resolve({ presets: { scene: mockPresets } });
        }
        if (url === "/user/default-presets") {
          return Promise.resolve({ defaults: { scene: "preset-1" } });
        }
        return Promise.resolve({});
      });

      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      // Open dropdown
      await user.click(screen.getByText("Load Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
      });

      // Should have star buttons (one for each preset)
      const starButtons = screen.getAllByTitle(/default/i);
      expect(starButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("toggles default status when star clicked", async () => {
      mockApiGet.mockImplementation((url) => {
        if (url === "/user/filter-presets") {
          return Promise.resolve({ presets: { scene: mockPresets } });
        }
        if (url === "/user/default-presets") {
          return Promise.resolve({ defaults: {} });
        }
        return Promise.resolve({});
      });

      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      // Open dropdown
      await user.click(screen.getByText("Load Preset").closest("button"));

      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
      });

      // Click star to set as default
      const starButtons = screen.getAllByTitle("Set as default");
      await user.click(starButtons[0]);

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith("/user/default-preset", {
          context: "scene",
          presetId: "preset-1",
        });
      });
    });
  });

  describe("Context-specific behavior", () => {
    it("uses scene presets for scene_performer context", async () => {
      mockApiGet.mockImplementation((url) => {
        if (url === "/user/filter-presets") {
          return Promise.resolve({ presets: { scene: mockPresets } });
        }
        if (url === "/user/default-presets") {
          return Promise.resolve({ defaults: { scene_performer: "preset-1" } });
        }
        return Promise.resolve({});
      });

      const user = userEvent.setup();
      render(<FilterPresets {...defaultProps} context="scene_performer" />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      // Open dropdown
      await user.click(screen.getByText("Load Preset").closest("button"));

      // Should still show scene presets
      await waitFor(() => {
        expect(screen.getByText("Favorites")).toBeInTheDocument();
      });
    });
  });
});
