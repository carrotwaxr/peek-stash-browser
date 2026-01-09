import { describe, it, expect } from "vitest";
import { createElement } from "react";
import StudioCard from "../../../src/components/cards/StudioCard.jsx";

describe("StudioCard", () => {
  const mockStudio = {
    id: "1",
    name: "Test Studio",
    image_path: "/studio.jpg",
    scene_count: 50,
    tags: [{ id: "1", name: "Tag 1" }],
    details: "Studio description",
    rating100: 90,
    favorite: false,
  };

  it("is a React forwardRef component", () => {
    expect(typeof StudioCard).toBe("object");
    expect(StudioCard.displayName).toBe("StudioCard");
  });

  it("accepts expected props", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
      fromPageTitle: "Studios",
      tabIndex: 0,
    });

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
    });

    expect(element.props.studio).toBe(mockStudio);
  });

  it("passes correct link path", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
    });

    expect(element.props.studio.id).toBe("1");
  });

  it("passes studio with all data", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
    });

    const studio = element.props.studio;
    expect(studio.name).toBe("Test Studio");
    expect(studio.scene_count).toBe(50);
    expect(studio.details).toBe("Studio description");
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
      fromPageTitle: "Studios",
    });

    expect(element.props.fromPageTitle).toBe("Studios");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
      tabIndex: 5,
    });

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(StudioCard, {
      studio: mockStudio,
      onHideSuccess,
    });

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});
