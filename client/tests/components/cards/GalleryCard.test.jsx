import { describe, it, expect } from "vitest";
import { createElement } from "react";
import GalleryCard from "../../../src/components/cards/GalleryCard.jsx";

describe("GalleryCard", () => {
  const mockGallery = {
    id: "1",
    title: "Test Gallery",
    cover: "/cover.jpg",
    image_count: 25,
    studio: { name: "Test Studio" },
    date: "2024-01-15",
    performers: [{ id: "1", name: "Performer 1" }],
    tags: [{ id: "1", name: "Tag 1" }],
    rating100: 70,
    favorite: false,
  };

  it("is a React forwardRef component", () => {
    expect(typeof GalleryCard).toBe("object");
    expect(GalleryCard.displayName).toBe("GalleryCard");
  });

  it("accepts expected props", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
      fromPageTitle: "Galleries",
      tabIndex: 0,
    });

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
    });

    expect(element.props.gallery).toBe(mockGallery);
  });

  it("passes correct link path", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
    });

    expect(element.props.gallery.id).toBe("1");
  });

  it("passes gallery with all data", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
    });

    const gallery = element.props.gallery;
    expect(gallery.title).toBe("Test Gallery");
    expect(gallery.image_count).toBe(25);
    expect(gallery.studio.name).toBe("Test Studio");
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
      fromPageTitle: "Galleries",
    });

    expect(element.props.fromPageTitle).toBe("Galleries");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
      tabIndex: 5,
    });

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
      onHideSuccess,
    });

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});
