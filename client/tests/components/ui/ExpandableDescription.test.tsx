import { fireEvent, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpandableDescription } from "../../../src/components/ui/ExpandableDescription";

/** Stubs the box the browser would lay the clamped text out in */
function stubTextBox(scrollHeight: number, clientHeight: number) {
  const scroll = vi
    .spyOn(Element.prototype, "scrollHeight", "get")
    .mockReturnValue(scrollHeight);
  const client = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockReturnValue(clientHeight);
  return () => {
    scroll.mockRestore();
    client.mockRestore();
  };
}

describe("ExpandableDescription", () => {
  let restoreBox: (() => void) | null = null;

  afterEach(() => {
    restoreBox?.();
    restoreBox = null;
    vi.unstubAllGlobals();
  });

  it("shows the description clamped to maxLines", () => {
    render(<ExpandableDescription description="Long text" maxLines={2} />);

    expect(screen.getByText("Long text")).toHaveStyle({
      WebkitLineClamp: "2",
    });
  });

  it("a description that fits opens no popover on tap; a truncated one does", () => {
    restoreBox = stubTextBox(48, 48);
    const onCardClick = vi.fn();
    const { unmount } = render(
      <div onClick={onCardClick}>
        <ExpandableDescription description="Short text" />
      </div>
    );

    fireEvent.click(screen.getByText("Short text"));

    expect(screen.getAllByText("Short text")).toHaveLength(1);
    expect(screen.getByText("Short text").style.cursor).not.toBe("pointer");
    // The tap is not swallowed: it reaches the card
    expect(onCardClick).toHaveBeenCalledTimes(1);
    unmount();
    restoreBox();

    restoreBox = stubTextBox(120, 48);
    render(<ExpandableDescription description="Long text" />);

    fireEvent.click(screen.getByText("Long text"));

    expect(screen.getAllByText("Long text")).toHaveLength(2);
  });

  it("measures again when a pointer reaches it", () => {
    restoreBox = stubTextBox(48, 48);
    render(<ExpandableDescription description="Text" />);
    fireEvent.click(screen.getByText("Text"));
    expect(screen.getAllByText("Text")).toHaveLength(1);

    // The card got narrower: the text now overflows
    restoreBox();
    restoreBox = stubTextBox(120, 48);
    fireEvent.pointerEnter(screen.getByText("Text"));
    fireEvent.click(screen.getByText("Text"));

    expect(screen.getAllByText("Text")).toHaveLength(2);
  });

  it("creates no ResizeObserver: a grid holds hundreds of descriptions", () => {
    const resizeObserver = vi.fn();
    vi.stubGlobal("ResizeObserver", resizeObserver);

    render(<ExpandableDescription description="Text" />);

    expect(resizeObserver).not.toHaveBeenCalled();
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
