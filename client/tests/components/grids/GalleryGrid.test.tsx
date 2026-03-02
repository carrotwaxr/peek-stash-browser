import { describe, it, expect } from "vitest";
import { GalleryGrid } from "../../../src/components/grids/index";

describe("GalleryGrid", () => {
  it("renders with default configuration", () => {
    const element = GalleryGrid({});

    expect(element).toBeDefined();
    expect(element.type.name).toBe("SearchableGrid");
    expect(element.props.entityType).toBe("gallery");
    expect(element.props.defaultSort).toBe("date");
  });

  it("supports locked filters for nested grids", () => {
    const lockedFilters = { performer_id: "456" };
    const element = GalleryGrid({
      lockedFilters,
      hideLockedFilters: true,
    });

    expect(element).toBeDefined();
    expect(element.props.lockedFilters).toEqual(lockedFilters);
    expect(element.props.hideLockedFilters).toBe(true);
  });

  it("accepts custom empty message", () => {
    const customMessage = "No galleries here";
    const element = GalleryGrid({
      emptyMessage: customMessage,
    });

    expect(element.props.emptyMessage).toBe(customMessage);
  });

  it("renders GalleryCard for each item", () => {
    const element = GalleryGrid({});
    const mockGallery = { id: "1", title: "Test Gallery" };

    const renderedCard = element.props.renderItem(mockGallery, 0, { onHideSuccess: () => {} });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.gallery).toEqual(mockGallery);
    expect(renderedCard.key).toBe("1");
  });
});
