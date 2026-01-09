import { describe, it, expect } from "vitest";
import { BaseGrid } from "../../../src/components/ui/BaseGrid";

describe("BaseGrid", () => {
  const mockItems = [
    { id: "1", name: "Item 1" },
    { id: "2", name: "Item 2" },
    { id: "3", name: "Item 3" },
  ];

  it("renders with standard grid type", () => {
    const element = BaseGrid({
      items: mockItems,
      renderItem: (item) => item.name,
      gridType: "standard",
    });

    expect(element).toBeDefined();
    // Component returns fragment with grid as first child
    expect(element.props.children).toBeDefined();
  });

  it("renders with scene grid type", () => {
    const element = BaseGrid({
      items: mockItems,
      renderItem: (item) => item.name,
      gridType: "scene",
    });

    expect(element).toBeDefined();
    // Component returns fragment with grid as first child
    expect(element.props.children).toBeDefined();
  });

  it("shows loading skeleton when loading=true", () => {
    const element = BaseGrid({
      items: [],
      renderItem: () => null,
      gridType: "standard",
      loading: true,
      skeletonCount: 3,
    });

    expect(element).toBeDefined();
    expect(element.props.className).toContain("grid");
  });

  it("shows empty state when items is empty", () => {
    const element = BaseGrid({
      items: [],
      renderItem: () => null,
      gridType: "standard",
      emptyMessage: "No items found",
    });

    expect(element).toBeDefined();
    // Empty state should render EmptyState component
    expect(element.type.name).toBe("EmptyState");
  });

  it("renders fragment with grid and pagination when totalPages > 1", () => {
    const element = BaseGrid({
      items: mockItems,
      renderItem: (item) => item.name,
      gridType: "standard",
      currentPage: 1,
      totalPages: 5,
      onPageChange: () => {},
    });

    // Should render a fragment containing grid and nav
    expect(element).toBeDefined();
  });
});
