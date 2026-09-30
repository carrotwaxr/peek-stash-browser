import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClipGrid from "@/components/clip-search/ClipGrid";

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

describe("ClipGrid", () => {
  it("an empty list shows EmptyState with the page's message", () => {
    render(
      <MemoryRouter>
        <ClipGrid
          clips={[]}
          emptyMessage="No clips found"
          emptyDescription="Try adjusting your search filters"
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "No clips found | Try adjusting your search filters"
    );
  });
});
