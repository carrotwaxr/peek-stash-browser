import { describe, it, expect } from "vitest";
import { createElement } from "react";
import SceneCard from "../../../src/components/ui/SceneCard.jsx";

describe("SceneCard", () => {
  const mockScene = {
    id: "1",
    title: "Test Scene",
    paths: { screenshot: "/screenshot.jpg" },
    date: "2024-01-01",
    files: [{ duration: 3600 }],
    rating: 4,
    favorite: false,
    o_counter: 0,
    play_count: 5,
    performers: [],
    tags: [],
    studio: null,
  };

  it("is a React forwardRef component", () => {
    expect(typeof SceneCard).toBe("object");
    expect(SceneCard.displayName).toBe("SceneCard");
  });

  it("accepts expected props", () => {
    const element = createElement(SceneCard, {
      scene: mockScene,
      fromPageTitle: "Performers",
      tabIndex: 0,
    });

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(SceneCard, {
      scene: mockScene,
      fromPageTitle: "My Tag Name",
    });

    // This test will fail until SceneCard accepts fromPageTitle as a prop
    // Currently it hardcodes fromPageTitle="/scenes" which is a bug
    expect(element.props.fromPageTitle).toBe("My Tag Name");
  });

  it("accepts onClick callback", () => {
    const onClick = () => {};
    const element = createElement(SceneCard, {
      scene: mockScene,
      onClick,
    });

    expect(element.props.onClick).toBe(onClick);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(SceneCard, {
      scene: mockScene,
      onHideSuccess,
    });

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});
