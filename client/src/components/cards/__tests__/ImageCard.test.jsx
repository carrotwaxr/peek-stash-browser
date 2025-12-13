import { describe, it, expect } from "vitest";
import { createElement } from "react";
import ImageCard from "../ImageCard.jsx";

describe("ImageCard", () => {
  const mockImage = {
    id: "1",
    title: "Test Image",
    paths: { thumbnail: "/thumb.jpg", image: "/full.jpg" },
  };

  it("is a React forwardRef component", () => {
    expect(typeof ImageCard).toBe("object");
    expect(ImageCard.displayName).toBe("ImageCard");
  });

  it("accepts expected props", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
      referrerUrl: "/images",
      tabIndex: 0,
    });

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
    });

    expect(element.props.image).toBe(mockImage);
  });

  it("passes correct link path", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
    });

    expect(element.props.image.id).toBe("1");
  });

  it("passes image with all data", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
    });

    const image = element.props.image;
    expect(image.title).toBe("Test Image");
    expect(image.paths.thumbnail).toBe("/thumb.jpg");
  });

  it("uses fallback title when no title provided", () => {
    const imageNoTitle = { ...mockImage, title: null };
    const element = createElement(ImageCard, {
      image: imageNoTitle,
    });

    expect(element.props.image.id).toBe("1");
  });

  it("accepts referrerUrl prop", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
      referrerUrl: "/images",
    });

    expect(element.props.referrerUrl).toBe("/images");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(ImageCard, {
      image: mockImage,
      tabIndex: 5,
    });

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(ImageCard, {
      image: mockImage,
      onHideSuccess,
    });

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});
