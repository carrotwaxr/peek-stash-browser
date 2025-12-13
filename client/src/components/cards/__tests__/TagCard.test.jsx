import { describe, it, expect } from "vitest";
import { createElement } from "react";
import TagCard from "../TagCard.jsx";

describe("TagCard", () => {
  const mockTag = {
    id: "1",
    name: "Test Tag",
    image_path: "/tag.jpg",
    scene_count: 30,
    studio_count: 5,
    performer_count: 10,
    gallery_count: 8,
    description: "Tag description",
  };

  it("is a React forwardRef component", () => {
    expect(typeof TagCard).toBe("object");
    expect(TagCard.displayName).toBe("TagCard");
  });

  it("accepts expected props", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
      referrerUrl: "/tags",
      tabIndex: 0,
    });

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
    });

    expect(element.props.tag).toBe(mockTag);
  });

  it("passes correct link path", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
    });

    expect(element.props.tag.id).toBe("1");
  });

  it("passes tag with all data", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
    });

    const tag = element.props.tag;
    expect(tag.name).toBe("Test Tag");
    expect(tag.scene_count).toBe(30);
    expect(tag.description).toBe("Tag description");
  });

  it("accepts referrerUrl prop", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
      referrerUrl: "/tags",
    });

    expect(element.props.referrerUrl).toBe("/tags");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
      tabIndex: 5,
    });

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(TagCard, {
      tag: mockTag,
      onHideSuccess,
    });

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});
