import type { MouseEvent, ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CardDescription,
  CardImage,
  CardOverlay,
  CardTitle,
} from "../../../src/components/ui/CardComponents";

/** The props of the overlay's root element */
interface OverlayRootProps {
  className: string;
  children: ReactNode;
}

describe("CardOverlay", () => {
  it("renders children in positioned overlay", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "bottom-left",
      children: "Test Content",
    });

    // Check that the component renders with children
    expect(element).toBeDefined();
    expect(element.props.children).toBe("Test Content");
  });

  it("applies correct position classes for bottom-left", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "bottom-left",
      children: "Content",
    });

    expect(element.props.className).toContain("absolute");
    expect(element.props.className).toContain("bottom-0");
    expect(element.props.className).toContain("left-0");
  });

  it("applies correct position classes for top-left", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "top-left",
      children: "Content",
    });

    expect(element.props.className).toContain("absolute");
    expect(element.props.className).toContain("top-0");
    expect(element.props.className).toContain("left-0");
  });

  it("applies correct position classes for bottom-right", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "bottom-right",
      children: "Content",
    });

    expect(element.props.className).toContain("absolute");
    expect(element.props.className).toContain("bottom-0");
    expect(element.props.className).toContain("right-0");
  });

  it("applies correct position classes for full", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "full",
      children: "Content",
    });

    expect(element.props.className).toContain("absolute");
    expect(element.props.className).toContain("inset-0");
  });

  it("applies additional className when provided", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "bottom-left",
      children: "Content",
      className: "custom-class",
    });

    expect(element.props.className).toContain("custom-class");
  });
});

describe("CardImage", () => {
  it("is a React component function", () => {
    expect(typeof CardImage).toBe("function");
  });

  it("has expected parameter signature", () => {
    // CardImage should accept these props in its signature
    // We verify it's a function that can be stringified without errors
    expect(() => {
      CardImage.toString();
    }).not.toThrow();

    // Verify function contains expected parameters
    const funcString = CardImage.toString();
    expect(funcString).toContain("src");
    expect(funcString).toContain("alt");
    expect(funcString).toContain("aspectRatio");
    expect(funcString).toContain("entityType");
    expect(funcString).toContain("onClick");
  });

  it("calls onClickOverride when clicking Link", () => {
    const onClickOverride = vi.fn((e: MouseEvent) => {
      e.preventDefault();
    });

    render(
      <MemoryRouter>
        <CardImage
          src="/test.jpg"
          linkTo="/scene/1"
          onClickOverride={onClickOverride}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("link"));
    expect(onClickOverride).toHaveBeenCalled();
  });
});

describe("CardDescription", () => {
  it("uses ExpandableDescription internally", () => {
    // CardDescription should delegate to ExpandableDescription
    const funcString = CardDescription.toString();
    expect(funcString).toContain("ExpandableDescription");
  });
});

describe("CardTitle", () => {
  it("calls onClickOverride when clicking title Link", () => {
    const onClickOverride = vi.fn((e: MouseEvent) => {
      e.preventDefault();
    });

    render(
      <MemoryRouter>
        <CardTitle
          title="Test Title"
          linkTo="/scene/1"
          onClickOverride={onClickOverride}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Test Title"));
    expect(onClickOverride).toHaveBeenCalled();
  });

  it("calls onClickOverride when clicking subtitle Link", () => {
    const onClickOverride = vi.fn((e: MouseEvent) => {
      e.preventDefault();
    });

    render(
      <MemoryRouter>
        <CardTitle
          title="Test Title"
          subtitle="Test Subtitle"
          linkTo="/scene/1"
          onClickOverride={onClickOverride}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Test Subtitle"));
    expect(onClickOverride).toHaveBeenCalled();
  });
});
