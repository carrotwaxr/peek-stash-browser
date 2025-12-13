import { describe, it, expect } from "vitest";
import { TagGrid } from "../index";

describe("TagGrid", () => {
  it("renders with default configuration", () => {
    const element = TagGrid({});

    expect(element).toBeDefined();
    expect(element.type.name).toBe("SearchableGrid");
    expect(element.props.entityType).toBe("tag");
    expect(element.props.gridType).toBe("standard");
    expect(element.props.defaultSort).toBe("name");
  });

  it("supports locked filters for nested grids", () => {
    const lockedFilters = { studio_id: "202" };
    const element = TagGrid({
      lockedFilters,
      hideLockedFilters: true,
    });

    expect(element).toBeDefined();
    expect(element.props.lockedFilters).toEqual(lockedFilters);
    expect(element.props.hideLockedFilters).toBe(true);
  });

  it("accepts custom empty message", () => {
    const customMessage = "No tags here";
    const element = TagGrid({
      emptyMessage: customMessage,
    });

    expect(element.props.emptyMessage).toBe(customMessage);
  });

  it("renders TagCard for each item", () => {
    const element = TagGrid({});
    const mockTag = { id: "1", name: "Test Tag" };

    const renderedCard = element.props.renderItem(mockTag, 0, { onHideSuccess: () => {} });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.tag).toEqual(mockTag);
    expect(renderedCard.key).toBe("1");
  });
});
