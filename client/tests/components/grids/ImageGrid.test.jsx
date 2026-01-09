import { describe, it, expect } from "vitest";
import { ImageGrid } from "../../../src/components/grids/index";

describe("ImageGrid", () => {
  it("renders with default configuration", () => {
    const element = ImageGrid({});

    expect(element).toBeDefined();
    expect(element.type.name).toBe("SearchableGrid");
    expect(element.props.entityType).toBe("image");
    expect(element.props.gridType).toBe("standard");
    expect(element.props.defaultSort).toBe("date");
  });

  it("supports locked filters for nested grids", () => {
    const lockedFilters = { gallery_id: "303" };
    const element = ImageGrid({
      lockedFilters,
      hideLockedFilters: true,
    });

    expect(element).toBeDefined();
    expect(element.props.lockedFilters).toEqual(lockedFilters);
    expect(element.props.hideLockedFilters).toBe(true);
  });

  it("accepts custom empty message", () => {
    const customMessage = "No images here";
    const element = ImageGrid({
      emptyMessage: customMessage,
    });

    expect(element.props.emptyMessage).toBe(customMessage);
  });

  it("renders ImageCard for each item", () => {
    const element = ImageGrid({});
    const mockImage = { id: "1", title: "Test Image" };

    const renderedCard = element.props.renderItem(mockImage, 0, { onHideSuccess: () => {} });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.image).toEqual(mockImage);
    expect(renderedCard.key).toBe("1");
  });
});
