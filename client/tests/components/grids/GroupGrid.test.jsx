import { describe, it, expect } from "vitest";
import { GroupGrid } from "../../../src/components/grids/index";

describe("GroupGrid", () => {
  it("renders with default configuration", () => {
    const element = GroupGrid({});

    expect(element).toBeDefined();
    expect(element.type.name).toBe("SearchableGrid");
    expect(element.props.entityType).toBe("group");
    expect(element.props.defaultSort).toBe("name");
  });

  it("supports locked filters for nested grids", () => {
    const lockedFilters = { performer_id: "789" };
    const element = GroupGrid({
      lockedFilters,
      hideLockedFilters: true,
    });

    expect(element).toBeDefined();
    expect(element.props.lockedFilters).toEqual(lockedFilters);
    expect(element.props.hideLockedFilters).toBe(true);
  });

  it("accepts custom empty message", () => {
    const customMessage = "No collections here";
    const element = GroupGrid({
      emptyMessage: customMessage,
    });

    expect(element.props.emptyMessage).toBe(customMessage);
  });

  it("renders GroupCard for each item", () => {
    const element = GroupGrid({});
    const mockGroup = { id: "1", name: "Test Collection" };

    const renderedCard = element.props.renderItem(mockGroup, 0, { onHideSuccess: () => {} });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.group).toEqual(mockGroup);
    expect(renderedCard.key).toBe("1");
  });
});
