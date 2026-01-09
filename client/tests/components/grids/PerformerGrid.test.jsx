import { describe, it, expect } from "vitest";
import { PerformerGrid } from "../../../src/components/grids/index";

describe("PerformerGrid", () => {
  it("renders with default configuration", () => {
    const element = PerformerGrid({});

    expect(element).toBeDefined();
    expect(element.type.name).toBe("SearchableGrid");
    expect(element.props.entityType).toBe("performer");
    expect(element.props.gridType).toBe("standard");
    expect(element.props.defaultSort).toBe("o_counter");
  });

  it("supports locked filters for nested grids", () => {
    const lockedFilters = { studio_id: "123" };
    const element = PerformerGrid({
      lockedFilters,
      hideLockedFilters: true,
    });

    expect(element).toBeDefined();
    expect(element.props.lockedFilters).toEqual(lockedFilters);
    expect(element.props.hideLockedFilters).toBe(true);
  });

  it("accepts custom empty message", () => {
    const customMessage = "No performers here";
    const element = PerformerGrid({
      emptyMessage: customMessage,
    });

    expect(element.props.emptyMessage).toBe(customMessage);
  });

  it("renders PerformerCard for each item", () => {
    const element = PerformerGrid({});
    const mockPerformer = { id: "1", name: "Test" };

    const renderedCard = element.props.renderItem(mockPerformer, 0, { onHideSuccess: () => {} });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.performer).toEqual(mockPerformer);
    expect(renderedCard.key).toBe("1");
  });
});
