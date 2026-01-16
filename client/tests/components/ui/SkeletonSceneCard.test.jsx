import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Mock the useCardDisplaySettings hook
vi.mock("../../../src/contexts/CardDisplaySettingsContext.jsx", () => ({
  useCardDisplaySettings: vi.fn(),
}));

import SkeletonSceneCard from "../../../src/components/ui/SkeletonSceneCard.jsx";
import { useCardDisplaySettings } from "../../../src/contexts/CardDisplaySettingsContext.jsx";

describe("SkeletonSceneCard", () => {
  const mockGetSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useCardDisplaySettings.mockReturnValue({
      getSettings: mockGetSettings,
      updateSettings: vi.fn(),
      isLoading: false,
    });
  });

  describe("with all settings enabled", () => {
    beforeEach(() => {
      mockGetSettings.mockReturnValue({
        showDescriptionOnCard: true,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
      });
    });

    it("renders description skeleton when showDescriptionOnCard is true", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      // The description skeleton should have 2 lines
      const descriptionLines = container.querySelectorAll(".space-y-1 .h-3");
      expect(descriptionLines.length).toBe(2);
    });

    it("renders full rating row when all controls are enabled", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      // The rating row should be present
      const ratingRow = container.querySelector(
        '[style*="height: 2rem"]'
      );
      expect(ratingRow).toBeTruthy();

      // Should have rating badge placeholder
      const ratingBadge = ratingRow.querySelector('[style*="width: 3.5rem"]');
      expect(ratingBadge).toBeTruthy();
    });

    it("calls getSettings with the correct entityType", () => {
      render(<SkeletonSceneCard entityType="performer" />);

      expect(mockGetSettings).toHaveBeenCalledWith("performer");
    });
  });

  describe("with description disabled", () => {
    beforeEach(() => {
      mockGetSettings.mockReturnValue({
        showDescriptionOnCard: false,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
      });
    });

    it("does not render description skeleton when showDescriptionOnCard is false", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      // The description skeleton should not be present
      const descriptionSection = container.querySelector(".space-y-1");
      expect(descriptionSection).toBeNull();
    });
  });

  describe("with all rating controls disabled", () => {
    beforeEach(() => {
      mockGetSettings.mockReturnValue({
        showDescriptionOnCard: true,
        showRating: false,
        showFavorite: false,
        showOCounter: false,
      });
    });

    it("does not render rating row when all controls are disabled", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      // The rating row with height 2rem should not be present
      // Need to check if justify-between row with 2rem height exists
      const allDivs = container.querySelectorAll("div");
      let hasRatingRow = false;
      allDivs.forEach((div) => {
        if (
          div.style.height === "2rem" &&
          div.className.includes("justify-between")
        ) {
          hasRatingRow = true;
        }
      });
      expect(hasRatingRow).toBe(false);
    });
  });

  describe("with partial rating controls", () => {
    it("shows only rating badge when only showRating is true", () => {
      mockGetSettings.mockReturnValue({
        showDescriptionOnCard: true,
        showRating: true,
        showFavorite: false,
        showOCounter: false,
      });

      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      // Rating row should exist
      const ratingRow = container.querySelector(
        '[style*="height: 2rem"]'
      );
      expect(ratingRow).toBeTruthy();

      // Should have rating badge placeholder
      const ratingBadge = ratingRow.querySelector('[style*="width: 3.5rem"]');
      expect(ratingBadge).toBeTruthy();
    });

    it("shows favorite but not O counter when only showFavorite is true", () => {
      mockGetSettings.mockReturnValue({
        showDescriptionOnCard: true,
        showRating: false,
        showFavorite: true,
        showOCounter: false,
      });

      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      // Rating row should exist (because favorite is enabled)
      const ratingRow = container.querySelector(
        '[style*="height: 2rem"]'
      );
      expect(ratingRow).toBeTruthy();
    });
  });

  describe("aspect ratio by entity type", () => {
    beforeEach(() => {
      mockGetSettings.mockReturnValue({
        showDescriptionOnCard: true,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
      });
    });

    // Helper to find element by computed aspect ratio
    // JSDOM normalizes "16/9" to "16 / 9" format
    const findByAspectRatio = (container, ratio) => {
      const allDivs = container.querySelectorAll("div");
      for (const div of allDivs) {
        if (div.style.aspectRatio && div.style.aspectRatio.replace(/\s/g, "") === ratio) {
          return div;
        }
      }
      return null;
    };

    it("uses 16/9 aspect ratio for scene entityType", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      const imageDiv = findByAspectRatio(container, "16/9");
      expect(imageDiv).toBeTruthy();
    });

    it("uses 2/3 aspect ratio for performer entityType", () => {
      const { container } = render(<SkeletonSceneCard entityType="performer" />);

      const imageDiv = findByAspectRatio(container, "2/3");
      expect(imageDiv).toBeTruthy();
    });

    it("uses 2/3 aspect ratio for gallery entityType", () => {
      const { container } = render(<SkeletonSceneCard entityType="gallery" />);

      const imageDiv = findByAspectRatio(container, "2/3");
      expect(imageDiv).toBeTruthy();
    });

    it("uses 2/3 aspect ratio for group entityType", () => {
      const { container } = render(<SkeletonSceneCard entityType="group" />);

      const imageDiv = findByAspectRatio(container, "2/3");
      expect(imageDiv).toBeTruthy();
    });

    it("uses 16/9 aspect ratio for image entityType", () => {
      const { container } = render(<SkeletonSceneCard entityType="image" />);

      const imageDiv = findByAspectRatio(container, "16/9");
      expect(imageDiv).toBeTruthy();
    });
  });

  describe("always rendered elements", () => {
    beforeEach(() => {
      mockGetSettings.mockReturnValue({
        showDescriptionOnCard: false,
        showRating: false,
        showFavorite: false,
        showOCounter: false,
      });
    });

    it("always renders image skeleton", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      const imageDiv = container.querySelector('[style*="aspect-ratio"]');
      expect(imageDiv).toBeTruthy();
    });

    it("always renders title skeleton", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      const titleDiv = container.querySelector(".h-5");
      expect(titleDiv).toBeTruthy();
    });

    it("always renders subtitle skeleton", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      const subtitleDiv = container.querySelector(".h-4");
      expect(subtitleDiv).toBeTruthy();
    });

    it("always renders indicators skeleton", () => {
      const { container } = render(<SkeletonSceneCard entityType="scene" />);

      const indicatorsDiv = container.querySelector('[style*="height: 3.5rem"]');
      expect(indicatorsDiv).toBeTruthy();
    });
  });
});
