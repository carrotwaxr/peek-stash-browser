import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WallView from "@/components/wall/WallView";

// The shared empty state, as a stub naming what it was given
vi.mock("@/components/ui/EmptyState", () => ({
  default: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <div data-testid="empty-state">
      {title}
      {description ? ` | ${description}` : ""}
    </div>
  ),
}));

describe("WallView", () => {
  it("an empty list shows EmptyState with the page's message", () => {
    render(
      <MemoryRouter>
        <WallView
          items={[]}
          entityType="scene"
          emptyMessage="No scenes found"
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "No scenes found"
    );
  });
});
