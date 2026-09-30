import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { StudioGrid } from "../../../src/components/grids/index";
import type { SearchableGridProps } from "../../../src/components/ui/SearchableGrid";

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

    const onHideSuccess = () => {};
    const renderedCard = element.props.renderItem(mockStudio, 0, {
      onHideSuccess,
    });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.studio).toEqual(mockStudio);
    expect(renderedCard.key).toBe("1");
    // The grid's one hide handler, not a new closure per card
    expect(renderedCard).toHaveProperty("props.onHideSuccess", onHideSuccess);
  });

  it("keys each card by id and instance: the same id on two servers is two cards", () => {
    const element = StudioGrid({}) as ReactElement<SearchableGridProps>;
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
