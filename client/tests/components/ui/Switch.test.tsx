import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Switch from "@/components/ui/Switch";

describe("Switch", () => {
  it("the track shows a focus ring while the input has keyboard focus", () => {
    render(<Switch checked={false} aria-label="Enable thing" />);

    const input = screen.getByRole("checkbox", { name: "Enable thing" });
    // The track is the input's next sibling; the sr-only input is a `peer`
    expect(input).toHaveClass("peer");
    const track = input.nextElementSibling;
    expect(track?.className).toContain("peer-focus-visible:ring-2");
  });
});
