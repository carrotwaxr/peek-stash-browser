import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipEntityGrid } from "@/components/ui/TooltipEntityGrid";

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

const performers = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    instanceId: "inst-a",
    name: `Performer ${i + 1}`,
  }));

const renderGrid = (count: number, total?: number) =>
  render(
    <MemoryRouter>
      <TooltipEntityGrid
        entityType="performer"
        entities={performers(count)}
        title="Performers"
        total={total}
      />
    </MemoryRouter>
  );

describe("TooltipEntityGrid", () => {
  it("shows 'and 3 more' when total exceeds the list", () => {
    renderGrid(12, 15);

    expect(screen.getAllByRole("link")).toHaveLength(12);
    expect(screen.getByText("and 3 more")).toBeInTheDocument();
  });

  it("shows no 'more' line when the list holds the total", () => {
    renderGrid(4, 4);

    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it("shows no 'more' line without a total", () => {
    renderGrid(4);

    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });
});
