import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Use vi.hoisted to create mock functions that can be accessed in vi.mock
const { mockGetSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
}));

// Mock the CardDisplaySettingsContext
vi.mock("../../../src/contexts/CardDisplaySettingsContext.jsx", () => ({
  useCardDisplaySettings: () => ({
    getSettings: mockGetSettings,
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

// Mock useTVMode
vi.mock("../../../src/hooks/useTVMode.js", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

// Mock useAuth
vi.mock("../../../src/hooks/useAuth.js", () => ({
  useAuth: () => ({
    user: { id: "1", username: "testuser" },
    isAuthenticated: true,
  }),
}));

// Mock SceneCardPreview to avoid its dependencies
vi.mock("../../../src/components/ui/SceneCardPreview.jsx", () => ({
  default: ({ duration, resolution }) => (
    <div data-testid="scene-preview">
      {duration && <span>{duration}</span>}
      {resolution && <span>{resolution}</span>}
    </div>
  ),
}));

// Import after mocks
import SceneCard from "../../../src/components/ui/SceneCard.jsx";

describe("SceneCard respects card display settings", () => {
  const mockScene = {
    id: "scene-123",
    title: "Test Scene Title",
    code: "SCENE-CODE-001",
    paths: { screenshot: "/screenshot.jpg" },
    date: "2024-01-15",
    files: [{ duration: 3600, width: 1920, height: 1080 }],
    rating: 80,
    favorite: true,
    o_counter: 5,
    play_count: 10,
    performers: [{ id: "p1", name: "Jane Doe" }],
    tags: [{ id: "t1", name: "Tag1" }],
    studio: { id: "s1", name: "Test Studio" },
    details: "This is a test scene description that should be visible.",
  };

  const wrapper = ({ children }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all settings enabled
    mockGetSettings.mockReturnValue({
      showCodeOnCard: true,
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
    });
  });

  describe("showCodeOnCard setting", () => {
    it("shows scene code in subtitle when showCodeOnCard is true", () => {
      render(<SceneCard scene={mockScene} />, { wrapper });

      // Scene code should appear in the subtitle
      expect(screen.getByText(/SCENE-CODE-001/)).toBeInTheDocument();
    });

    it("hides scene code in subtitle when showCodeOnCard is false", () => {
      mockGetSettings.mockReturnValue({
        showCodeOnCard: false,
        showDescriptionOnCard: true,
        showDescriptionOnDetail: true,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
        showStudio: true,
        showDate: true,
        showRelationshipIndicators: true,
      });

      render(<SceneCard scene={mockScene} />, { wrapper });

      // Scene code should NOT appear
      expect(screen.queryByText(/SCENE-CODE-001/)).not.toBeInTheDocument();

      // But studio should still appear
      expect(screen.getByText(/Test Studio/)).toBeInTheDocument();
    });
  });

  describe("showDescriptionOnCard setting", () => {
    it("shows description when showDescriptionOnCard is true", () => {
      render(<SceneCard scene={mockScene} />, { wrapper });

      // Description should appear
      expect(screen.getByText(/test scene description/i)).toBeInTheDocument();
    });

    it("hides description when showDescriptionOnCard is false", () => {
      mockGetSettings.mockReturnValue({
        showCodeOnCard: true,
        showDescriptionOnCard: false,
        showDescriptionOnDetail: true,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
        showStudio: true,
        showDate: true,
        showRelationshipIndicators: true,
      });

      render(<SceneCard scene={mockScene} />, { wrapper });

      // Description should NOT appear
      expect(screen.queryByText(/test scene description/i)).not.toBeInTheDocument();
    });
  });

  describe("subtitle construction", () => {
    it("shows studio name in subtitle", () => {
      render(<SceneCard scene={mockScene} />, { wrapper });

      expect(screen.getByText(/Test Studio/)).toBeInTheDocument();
    });

    it("builds correct subtitle with all parts when code is shown", () => {
      render(<SceneCard scene={mockScene} />, { wrapper });

      // All parts should be present separated by bullet
      const subtitle = screen.getByText(/Test Studio.*SCENE-CODE-001/);
      expect(subtitle).toBeInTheDocument();
    });

    it("builds correct subtitle without code when code is hidden", () => {
      mockGetSettings.mockReturnValue({
        showCodeOnCard: false,
        showDescriptionOnCard: true,
        showDescriptionOnDetail: true,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
        showStudio: true,
        showDate: true,
        showRelationshipIndicators: true,
      });

      render(<SceneCard scene={mockScene} />, { wrapper });

      // Studio should be present but not code
      expect(screen.getByText(/Test Studio/)).toBeInTheDocument();
      expect(screen.queryByText(/SCENE-CODE-001/)).not.toBeInTheDocument();
    });
  });

  describe("rating controls settings", () => {
    it("passes showRating to BaseCard ratingControlsProps", () => {
      const { container } = render(<SceneCard scene={mockScene} />, { wrapper });

      // When showRating is true, the rating badge should be present
      // Look for a rating-related element
      expect(container.innerHTML).toMatch(/rating|star|★/i);
    });

    it("passes showFavorite to BaseCard ratingControlsProps", () => {
      const { container } = render(<SceneCard scene={mockScene} />, { wrapper });

      // When showFavorite is true, the favorite button should be present
      expect(container.innerHTML).toMatch(/favorite|heart/i);
    });

    it("passes showOCounter to BaseCard ratingControlsProps", () => {
      render(<SceneCard scene={mockScene} />, { wrapper });

      // When showOCounter is true, the O counter should be present
      // The component shows the count
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  describe("always renders core elements", () => {
    it("always renders title", () => {
      render(<SceneCard scene={mockScene} />, { wrapper });

      expect(screen.getByText("Test Scene Title")).toBeInTheDocument();
    });

    it("always renders image container", () => {
      const { container } = render(<SceneCard scene={mockScene} />, { wrapper });

      // Check for aspect ratio styling (16/9 for scenes)
      const imageContainer = container.querySelector('[style*="aspect-ratio"]');
      expect(imageContainer).toBeTruthy();
    });

    it("always renders indicators", () => {
      render(<SceneCard scene={mockScene} />, { wrapper });

      // Play count indicator should be visible
      expect(screen.getByText("10")).toBeInTheDocument();
    });
  });

  describe("scene without optional data", () => {
    it("handles scene without code gracefully", () => {
      const sceneWithoutCode = { ...mockScene, code: null };

      render(<SceneCard scene={sceneWithoutCode} />, { wrapper });

      // Should render without error, showing studio and date
      expect(screen.getByText(/Test Studio/)).toBeInTheDocument();
    });

    it("handles scene without studio gracefully", () => {
      const sceneWithoutStudio = { ...mockScene, studio: null, code: "SCENE-CODE-001" };

      render(<SceneCard scene={sceneWithoutStudio} />, { wrapper });

      // Should render code when studio is missing
      expect(screen.getByText(/SCENE-CODE-001/)).toBeInTheDocument();
    });

    it("handles scene without description gracefully", () => {
      const sceneWithoutDetails = { ...mockScene, details: null };

      mockGetSettings.mockReturnValue({
        showCodeOnCard: true,
        showDescriptionOnCard: true,
        showDescriptionOnDetail: true,
        showRating: true,
        showFavorite: true,
        showOCounter: true,
        showStudio: true,
        showDate: true,
        showRelationshipIndicators: true,
      });

      render(<SceneCard scene={sceneWithoutDetails} />, { wrapper });

      // Should render without error
      expect(screen.getByText("Test Scene Title")).toBeInTheDocument();
    });
  });
});
