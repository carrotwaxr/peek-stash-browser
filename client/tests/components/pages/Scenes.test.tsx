import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useInitialFocus } from "@/hooks/useFocusTrap";

// Mock hooks
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/hooks/useFocusTrap", () => ({ useInitialFocus: vi.fn() }));

// Mock SceneSearch component
vi.mock("@/components/scene-search/SceneSearch", () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="scene-search"
      data-context={props.context}
      data-title={props.title}
      data-initial-sort={props.initialSort}
      data-subtitle={props.subtitle}
      data-from-page-title={props.fromPageTitle}
    >
      {props.title as string}
    </div>
  ),
}));

import Scenes from "@/components/pages/Scenes";

describe("Scenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders without crashing", () => {
      render(<Scenes />);
      expect(screen.getByTestId("scene-search")).toBeInTheDocument();
    });

    it("sets page title to 'Scenes'", () => {
      render(<Scenes />);
      expect(usePageTitle).toHaveBeenCalledWith("Scenes");
    });

    it("renders SceneSearch with correct context prop", () => {
      render(<Scenes />);
      const sceneSearch = screen.getByTestId("scene-search");
      expect(sceneSearch).toHaveAttribute("data-context", "scene");
    });

    it("renders SceneSearch with correct title", () => {
      render(<Scenes />);
      const sceneSearch = screen.getByTestId("scene-search");
      expect(sceneSearch).toHaveAttribute("data-title", "All Scenes");
    });

    it("renders SceneSearch with correct initialSort", () => {
      render(<Scenes />);
      const sceneSearch = screen.getByTestId("scene-search");
      expect(sceneSearch).toHaveAttribute("data-initial-sort", "created_at");
    });

    it("uses useInitialFocus hook", () => {
      render(<Scenes />);
      expect(useInitialFocus).toHaveBeenCalledWith(
        expect.any(Object),
        '[tabindex="0"]',
        true
      );
    });
  });
});
