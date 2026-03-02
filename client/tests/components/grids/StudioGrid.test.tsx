import { describe, it, expect } from "vitest";
import { StudioGrid } from "../../../src/components/grids/index";

describe("StudioGrid", () => {
  it("renders with default configuration", () => {
    const element = StudioGrid({});

    expect(element).toBeDefined();
    expect(element.type.name).toBe("SearchableGrid");
    expect(element.props.entityType).toBe("studio");
    expect(element.props.defaultSort).toBe("name");
  });

  it("supports locked filters for nested grids", () => {
    const lockedFilters = { tag_id: "101" };
    const element = StudioGrid({
      lockedFilters,
      hideLockedFilters: true,
    });

    expect(element).toBeDefined();
    expect(element.props.lockedFilters).toEqual(lockedFilters);
    expect(element.props.hideLockedFilters).toBe(true);
  });

  it("accepts custom empty message", () => {
    const customMessage = "No studios here";
    const element = StudioGrid({
      emptyMessage: customMessage,
    });

    expect(element.props.emptyMessage).toBe(customMessage);
  });

  it("renders StudioCard for each item", () => {
    const element = StudioGrid({});
    const mockStudio = { id: "1", name: "Test Studio" };

    const renderedCard = element.props.renderItem(mockStudio, 0, { onHideSuccess: () => {} });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.studio).toEqual(mockStudio);
    expect(renderedCard.key).toBe("1");
  });
});
