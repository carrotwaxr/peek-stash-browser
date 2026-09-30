import { fireEvent, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpandableDescription } from "../../../src/components/ui/ExpandableDescription";

describe("ExpandableDescription", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the description clamped to maxLines without measuring it", () => {
    const resizeObserver = vi.fn();
    vi.stubGlobal("ResizeObserver", resizeObserver);

    render(<ExpandableDescription description="Long text" maxLines={2} />);

    const text = screen.getByText("Long text");
    expect(text).toHaveStyle({ WebkitLineClamp: "2" });
    expect(resizeObserver).not.toHaveBeenCalled();
  });

  it("a click opens the whole description", () => {
    render(<ExpandableDescription description="Long text" />);

    fireEvent.click(screen.getByText("Long text"));

    expect(screen.getAllByText("Long text")).toHaveLength(2);
  });

  it("keeps its height with no description", () => {
    const { container } = render(
      <ExpandableDescription description={null} maxLines={3} />
    );

    const box = must(
      container.firstElementChild as HTMLElement | null,
      "the empty description's box"
    );
    expect(box.style.height).toBe("4.5rem");
  });
});
