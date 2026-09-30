import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { GalleryGrid } from "../../../src/components/grids/index";
import type { SearchableGridProps } from "../../../src/components/ui/SearchableGrid";

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

    const onHideSuccess = () => {};
    const renderedCard = element.props.renderItem(mockGallery, 0, {
      onHideSuccess,
    });

    expect(renderedCard).toBeDefined();
    expect(renderedCard.props.gallery).toEqual(mockGallery);
    expect(renderedCard.key).toBe("1");
    // The grid's one hide handler, not a new closure per card
    expect(renderedCard).toHaveProperty("props.onHideSuccess", onHideSuccess);
  });

  it("keys each card by id and instance: the same id on two servers is two cards", () => {
    const element = GalleryGrid({}) as ReactElement<SearchableGridProps>;
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
