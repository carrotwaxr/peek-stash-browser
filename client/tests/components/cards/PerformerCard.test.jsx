import { describe, it, expect } from "vitest";
import { createElement } from "react";
import PerformerCard from "../../../src/components/cards/PerformerCard.jsx";

describe("PerformerCard", () => {
  const mockPerformer = {
    id: "1",
    name: "Test Performer",
    gender: "FEMALE",
    image_path: "/test.jpg",
    scene_count: 10,
    group_count: 2,
    image_count: 5,
    gallery_count: 3,
    play_count: 15,
    tags: [{ id: "1", name: "Tag 1" }],
    o_counter: 5,
    rating100: 80,
    favorite: true,
  };

  it("is a React forwardRef component", () => {
    expect(typeof PerformerCard).toBe("object");
    expect(PerformerCard.displayName).toBe("PerformerCard");
  });

  it("accepts expected props", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
      fromPageTitle: "Performers",
      tabIndex: 0,
    });

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
    });

    expect(element.props.performer).toBe(mockPerformer);
  });

  it("passes correct link path", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
    });

    expect(element.props.performer.id).toBe("1");
  });

  it("passes performer with all data", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
    });

    const performer = element.props.performer;
    expect(performer.name).toBe("Test Performer");
    expect(performer.gender).toBe("FEMALE");
    expect(performer.scene_count).toBe(10);
    expect(performer.play_count).toBe(15);
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
      fromPageTitle: "Performers",
    });

    expect(element.props.fromPageTitle).toBe("Performers");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
      tabIndex: 5,
    });

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
      onHideSuccess,
    });

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});
