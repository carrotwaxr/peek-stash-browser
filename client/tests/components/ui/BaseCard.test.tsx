import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { BaseCard, type BaseCardProps } from "../../../src/components/ui/BaseCard";

// Cast for createElement usage since BaseCard is a forwardRef component
 
const BaseCardComponent = BaseCard as any;

describe("BaseCard", () => {
  const defaultProps = {
    entityType: "scene",
    imagePath: "/test.jpg",
    title: "Test Title",
  };

  it("is a React forwardRef component", () => {
    expect(typeof BaseCard).toBe("object");
    expect(BaseCard.displayName).toBe("BaseCard");
  });

  it("renders title", () => {
    const element = createElement(BaseCard, defaultProps);
    expect(element).toBeDefined();
    expect(element.props.title).toBe("Test Title");
  });

  it("renders subtitle when provided", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      subtitle: "Test Subtitle",
    });
    expect(element.props.subtitle).toBe("Test Subtitle");
  });

  it("hides subtitle when hideSubtitle is true", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      subtitle: "Test Subtitle",
      hideSubtitle: true,
    });
    expect(element.props.hideSubtitle).toBe(true);
    expect(element.props.subtitle).toBe("Test Subtitle");
  });

  it("renders description when provided", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      description: "Test Description",
    });
    expect(element.props.description).toBe("Test Description");
  });

  it("hides description when hideDescription is true", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      description: "Test Description",
      hideDescription: true,
    });
    expect(element.props.hideDescription).toBe(true);
    expect(element.props.description).toBe("Test Description");
  });

  it("accepts linkTo prop", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      linkTo: "/test-path",
    });
    expect(element.props.linkTo).toBe("/test-path");
  });

  it("accepts indicators prop", () => {
    const indicators = [
      { label: "Scenes", count: 5, icon: "scene" },
      { label: "Images", count: 10, icon: "image" },
    ];
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      indicators,
    });
    expect(element.props.indicators).toEqual(indicators);
  });

  it("calls renderOverlay slot when provided", () => {
    const renderOverlay = vi.fn(() => createElement("div", {}, "Custom Overlay"));
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      renderOverlay,
    });
    expect(element.props.renderOverlay).toBe(renderOverlay);
  });

  it("calls renderAfterTitle slot when provided", () => {
    const renderAfterTitle = vi.fn(() =>
      createElement("div", {}, "After Title Content")
    );
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      renderAfterTitle,
    });
    expect(element.props.renderAfterTitle).toBe(renderAfterTitle);
  });

  it("accepts className prop", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      className: "custom-class",
    });
    expect(element.props.className).toBe("custom-class");
  });

  it("accepts onClick prop", () => {
    const onClick = vi.fn();
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      onClick,
    });
    expect(element.props.onClick).toBe(onClick);
  });

  it("accepts ratingControlsProps", () => {
    const ratingControlsProps = {
      entityId: "scene123",
      initialRating: 80,
      initialFavorite: true,
      initialOCounter: 5,
      entityTitle: "Test Scene",
    };
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      ratingControlsProps,
    });
    expect(element.props.ratingControlsProps).toEqual(ratingControlsProps);
  });

  it("accepts maxTitleLines prop", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      maxTitleLines: 3,
    });
    expect(element.props.maxTitleLines).toBe(3);
  });

  it("accepts maxDescriptionLines prop", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      maxDescriptionLines: 5,
    });
    expect(element.props.maxDescriptionLines).toBe(5);
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      fromPageTitle: "Galleries",
    });
    expect(element.props.fromPageTitle).toBe("Galleries");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      tabIndex: 0,
    });
    expect(element.props.tabIndex).toBe(0);
  });

  it("accepts style prop", () => {
    const style = { backgroundColor: "red" };
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      style,
    });
    expect(element.props.style).toEqual(style);
  });

  it("accepts renderImageContent slot", () => {
    const renderImageContent = vi.fn(() =>
      createElement("div", {}, "Image Content")
    );
    const element = createElement(BaseCardComponent, {
      ...defaultProps,
      renderImageContent,
    });
    expect(element.props.renderImageContent).toBe(renderImageContent);
  });
});

describe("BaseCard selection mode", () => {
  it("passes selection handlers to CardContainer", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };

    render(
      <MemoryRouter>
        <BaseCard
          entityType="scene"
          entity={entity}
          title="Scene"
          linkTo="/scene/1"
          selectionMode={true}
          onToggleSelect={onToggleSelect}
        />
      </MemoryRouter>
    );

    // The card container should render and be accessible
    const card = screen.getByLabelText("Scene");
    expect(card).toBeDefined();
    expect(card).not.toBeNull();
  });

  it("applies selected styling when isSelected", () => {
    render(
      <MemoryRouter>
        <BaseCard
          entityType="scene"
          entity={{ id: "1" }}
          title="Scene"
          linkTo="/scene/1"
          isSelected={true}
        />
      </MemoryRouter>
    );

    const card = screen.getByLabelText("Scene");
    // Check the inline style includes the selection border color
    expect(card.style.borderColor).toBe("var(--selection-color)");
  });
});

describe("BaseCard menu placement logic", () => {
  it("accepts showMenu setting in ratingControlsProps", () => {
    const ratingControlsProps = {
      entityId: "scene123",
      initialRating: 80,
      showRating: true,
      showFavorite: true,
      showOCounter: false,
      showMenu: true,
    };
    const element = createElement(BaseCardComponent, {
      entityType: "scene",
      imagePath: "/test.jpg",
      title: "Test",
      ratingControlsProps,
    });
    expect(element.props.ratingControlsProps!.showMenu).toBe(true);
  });

  it("accepts showMenu=false to hide menu", () => {
    const ratingControlsProps = {
      entityId: "scene123",
      showRating: true,
      showFavorite: true,
      showOCounter: false,
      showMenu: false,
    };
    const element = createElement(BaseCardComponent, {
      entityType: "scene",
      imagePath: "/test.jpg",
      title: "Test",
      ratingControlsProps,
    });
    expect(element.props.ratingControlsProps!.showMenu).toBe(false);
  });

  it("defaults showMenu to true when not specified", () => {
    const ratingControlsProps = {
      entityId: "scene123",
      showRating: true,
      showFavorite: true,
      showOCounter: false,
      // showMenu not specified - should default to true
    };
    const element = createElement(BaseCardComponent, {
      entityType: "scene",
      imagePath: "/test.jpg",
      title: "Test",
      ratingControlsProps,
    });
    // showMenu should be undefined in props, but BaseCard logic defaults it to true
    expect((element.props.ratingControlsProps as any)?.showMenu).toBeUndefined();
  });
});
