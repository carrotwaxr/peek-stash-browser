import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { GroupGrid } from "../../../src/components/grids/index";
import type { SearchableGridProps } from "../../../src/components/ui/SearchableGrid";

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

    const onHideSuccess = () => {};
    const renderedCard = element.props.renderItem(mockGroup, 0, {
      onHideSuccess,
    });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.group).toEqual(mockGroup);
    expect(renderedCard.key).toBe("1");
    // The grid's one hide handler, not a new closure per card
    expect(renderedCard).toHaveProperty("props.onHideSuccess", onHideSuccess);
  });

  it("keys each card by id and instance: the same id on two servers is two cards", () => {
    const element = GroupGrid({}) as ReactElement<SearchableGridProps>;
    const helpers = { onHideSuccess: () => {} };
    const keyOf = (instanceId: string, index: number) =>
      (
        element.props.renderItem(
          { id: "1", instanceId, name: instanceId },
          index,
          helpers
        ) as ReactElement
      ).key;

    expect(keyOf("inst-a", 0)).toBe("1:inst-a");
    expect(keyOf("inst-b", 1)).toBe("1:inst-b");
  });
});
