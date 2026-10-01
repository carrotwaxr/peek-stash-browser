import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

// The columns the grid renders, set per test
const columnsMock = vi.hoisted(() => vi.fn<() => number>());
vi.mock("@/hooks/useRenderedColumns", () => ({
  useRenderedColumns: columnsMock,
}));

// A card stub naming whether it was told to preview on scroll
vi.mock("@/components/cards/ClipCard", () => ({
  default: ({
    clip,
    autoplayOnScroll,
  }: {
    clip: { id: string };
    autoplayOnScroll?: boolean;
  }) => (
    <div
      data-testid={`clip-${clip.id}`}
      data-autoplay={String(autoplayOnScroll)}
    />
  ),
}));

describe("ClipGrid", () => {
  beforeEach(() => {
    columnsMock.mockReturnValue(3);
  });

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

  it("a single-column grid has its cards preview as they scroll into view", () => {
    const clips = [{ id: "1", sceneId: "s", instanceId: "a" }];
    columnsMock.mockReturnValue(1);
    const { rerender } = render(
      <MemoryRouter>
        <ClipGrid clips={clips} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("clip-1")).toHaveAttribute(
      "data-autoplay",
      "true"
    );

    columnsMock.mockReturnValue(3);
    rerender(
      <MemoryRouter>
        <ClipGrid clips={clips} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("clip-1")).toHaveAttribute(
      "data-autoplay",
      "false"
    );
  });
});
