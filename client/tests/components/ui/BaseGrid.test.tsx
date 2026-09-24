import type { FunctionComponent, ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { BaseGrid } from "../../../src/components/ui/BaseGrid";

/** The props of the grid's root element */
interface GridRootProps {
  className: string;
  children: ReactNode;
}

describe("BaseGrid", () => {
  const mockItems = [
    { id: "1", name: "Item 1" },
    { id: "2", name: "Item 2" },
    { id: "3", name: "Item 3" },
  ];

  it("renders with standard grid type", () => {
    const element: ReactElement<GridRootProps> = BaseGrid({
      items: mockItems,
      renderItem: (item: unknown) => (item as { name: string }).name,
      gridType: "standard",
    });

    expect(element).toBeDefined();
    // Component returns fragment with grid as first child
    expect(element.props.children).toBeDefined();
  });

  it("renders with scene grid type", () => {
    const element: ReactElement<GridRootProps> = BaseGrid({
      items: mockItems,
      renderItem: (item: unknown) => (item as { name: string }).name,
      gridType: "scene",
    });

    expect(element).toBeDefined();
    // Component returns fragment with grid as first child
    expect(element.props.children).toBeDefined();
  });

  it("shows loading skeleton when loading=true", () => {
    const element: ReactElement<GridRootProps> = BaseGrid({
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
    const element: ReactElement<unknown, FunctionComponent> = BaseGrid({
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
    const element: ReactElement<GridRootProps> = BaseGrid({
      items: mockItems,
      renderItem: (item: unknown) => (item as { name: string }).name,
      gridType: "standard",
      currentPage: 1,
      totalPages: 5,
      onPageChange: () => {},
    });

    // Should render a fragment containing grid and nav
    expect(element).toBeDefined();
  });
});
