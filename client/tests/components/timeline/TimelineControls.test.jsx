// client/tests/components/timeline/TimelineControls.test.jsx
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import TimelineControls from "../../../src/components/timeline/TimelineControls.jsx";

describe("TimelineControls", () => {
  const defaultProps = {
    zoomLevel: "months",
    onZoomLevelChange: vi.fn(),
    zoomLevels: ["years", "months", "weeks", "days"],
  };

  it("renders all zoom level buttons", () => {
    const element = createElement(TimelineControls, defaultProps);

    expect(element).toBeDefined();
    expect(element.props.zoomLevel).toBe("months");
    expect(element.props.zoomLevels).toHaveLength(4);
  });

  it("accepts onZoomLevelChange callback", () => {
    const onZoomLevelChange = vi.fn();
    const element = createElement(TimelineControls, {
      ...defaultProps,
      onZoomLevelChange,
    });

    expect(element.props.onZoomLevelChange).toBe(onZoomLevelChange);
  });

  it("accepts custom className", () => {
    const element = createElement(TimelineControls, {
      ...defaultProps,
      className: "custom-class",
    });

    expect(element.props.className).toBe("custom-class");
  });
});
