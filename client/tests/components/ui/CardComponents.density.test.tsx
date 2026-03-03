// client/tests/components/ui/CardComponents.density.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { CardContainer, CardTitle, CardIndicators, CardRatingRow } from "../../../src/components/ui/CardComponents";

// Mock hooks used by CardRatingRow
vi.mock("../../../src/hooks/useHiddenEntities", () => ({
  useHiddenEntities: () => ({
    hideEntity: vi.fn(),
    hideConfirmationDisabled: false,
  }),
}));

describe("CardComponents density", () => {
  describe("CardContainer", () => {
    it("does not have fixed minHeight", () => {
      render(<CardContainer>Content</CardContainer>);
      const container = screen.getByLabelText("Card");
      expect(container.style.minHeight).toBe("");
    });
  });

  describe("CardTitle", () => {
    it("does not reserve height when subtitle is null", () => {
      const { container } = render(
        <MemoryRouter>
          <CardTitle title="Test" subtitle={null} />
        </MemoryRouter>
      );
      // Should not render subtitle element at all
      const subtitles = container.querySelectorAll("h4");
      expect(subtitles).toHaveLength(0);
    });

    it("renders subtitle when provided", () => {
      render(
        <MemoryRouter>
          <CardTitle title="Test" subtitle="Studio Name" />
        </MemoryRouter>
      );
      expect(screen.getByText("Studio Name")).toBeInTheDocument();
    });
  });

  describe("CardIndicators", () => {
    it("does not render wrapper when indicators is empty", () => {
      const { container } = render(<CardIndicators indicators={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("does not render wrapper when indicators is null", () => {
      const { container } = render(<CardIndicators indicators={undefined} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("CardRatingRow", () => {
    it("uses compact height when only menu is visible", () => {
      render(
        <CardRatingRow
          entityType="scene"
          entityId="123"
          initialRating={null}
          initialFavorite={false}
          initialOCounter={null}
          showRating={false}
          showFavorite={false}
          showOCounter={false}
        />
      );
      const menuButton = screen.getByRole("button", { name: /more options/i });
      // Find the row container (parent of parent - button > div.relative > div.flex > div.flex (row))
      const row = menuButton.closest("div.flex.justify-between");
      // Row should exist and be more compact (1.5rem instead of 2rem)
      expect(row).toBeInTheDocument();
      expect((row as HTMLElement).style.height).toBe("1.5rem");
    });
  });
});
