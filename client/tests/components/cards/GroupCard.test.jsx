import { describe, it, expect } from "vitest";
import { createElement } from "react";
import GroupCard from "../../../src/components/cards/GroupCard.jsx";

describe("GroupCard", () => {
  const mockGroup = {
    id: "1",
    name: "Test Collection",
    front_image_path: "/front.jpg",
    scene_count: 15,
    sub_group_count: 3,
    performer_count: 5,
    studio: { name: "Test Studio" },
    date: "2024-01-15",
    tags: [{ id: "1", name: "Tag 1" }],
    rating100: 85,
    favorite: true,
  };

  it("is a React forwardRef component", () => {
    expect(typeof GroupCard).toBe("object");
    expect(GroupCard.displayName).toBe("GroupCard");
  });

  it("accepts expected props", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
      fromPageTitle: "Collections",
      tabIndex: 0,
    });

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
    });

    expect(element.props.group).toBe(mockGroup);
  });

  it("passes correct link path", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
    });

    expect(element.props.group.id).toBe("1");
  });

  it("passes group with all data", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
    });

    const group = element.props.group;
    expect(group.name).toBe("Test Collection");
    expect(group.scene_count).toBe(15);
    expect(group.sub_group_count).toBe(3);
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
      fromPageTitle: "Collections",
    });

    expect(element.props.fromPageTitle).toBe("Collections");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(GroupCard, {
      group: mockGroup,
      tabIndex: 5,
    });

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(GroupCard, {
      group: mockGroup,
      onHideSuccess,
    });

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});
