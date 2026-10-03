import { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRovingFocus } from "@/hooks/useRovingFocus";

function Menu({
  orientation,
  loop,
}: {
  orientation?: "vertical" | "horizontal" | "both";
  loop?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useRovingFocus(ref, {
    itemSelector: '[role="option"]',
    ...(orientation ? { orientation } : {}),
    ...(loop === undefined ? {} : { loop }),
  });
  return (
    <div ref={ref} role="listbox" onKeyDown={onKeyDown}>
      <button role="option">One</button>
      <button role="option" disabled>
        Two
      </button>
      <button role="option" aria-disabled="true">
        Three
      </button>
      <button role="option">Four</button>
      <button role="option">Five</button>
    </div>
  );
}

const item = (name: string) => screen.getByRole("option", { name });

describe("useRovingFocus", () => {
  it("ArrowDown and ArrowUp move DOM focus between items and wrap", () => {
    render(<Menu />);
    item("One").focus();

    fireEvent.keyDown(item("One"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Four"));
    fireEvent.keyDown(item("Four"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Five"));
    // Past the end wraps to the first
    fireEvent.keyDown(item("Five"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("One"));
    // Before the start wraps to the last
    fireEvent.keyDown(item("One"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Five"));
    fireEvent.keyDown(item("Five"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Four"));
  });

  it("Home and End", () => {
    render(<Menu />);
    item("Four").focus();

    fireEvent.keyDown(item("Four"), { key: "End" });
    expect(document.activeElement).toBe(item("Five"));
    fireEvent.keyDown(item("Five"), { key: "Home" });
    expect(document.activeElement).toBe(item("One"));
  });

  it("disabled items are skipped", () => {
    render(<Menu />);
    item("One").focus();

    // Two is disabled, Three says so with aria-disabled
    fireEvent.keyDown(item("One"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Four"));
    fireEvent.keyDown(item("Four"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("One"));
  });

  it("the handled key calls preventDefault, so TVNavigator does not move", () => {
    render(<Menu />);
    item("One").focus();

    // fireEvent returns false when the event was cancelled
    expect(fireEvent.keyDown(item("One"), { key: "ArrowDown" })).toBe(false);
    expect(fireEvent.keyDown(item("Four"), { key: "Home" })).toBe(false);
    // A key it does not use is left alone
    expect(fireEvent.keyDown(item("Four"), { key: "a" })).toBe(true);
    expect(fireEvent.keyDown(item("Four"), { key: "ArrowLeft" })).toBe(true);
  });

  it("with loop off it stops at the ends", () => {
    render(<Menu loop={false} />);
    item("Five").focus();
    expect(fireEvent.keyDown(item("Five"), { key: "ArrowDown" })).toBe(false);
    expect(document.activeElement).toBe(item("Five"));
  });

  it("horizontal menus move with Left and Right only", () => {
    render(<Menu orientation="horizontal" />);
    item("One").focus();

    expect(fireEvent.keyDown(item("One"), { key: "ArrowDown" })).toBe(true);
    expect(document.activeElement).toBe(item("One"));
    fireEvent.keyDown(item("One"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(item("Four"));
  });
});
