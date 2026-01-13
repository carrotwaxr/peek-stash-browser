/**
 * TagTreeNode Component Tests
 *
 * Tests for the individual tree node in tag hierarchy view:
 * - Renders tag name and metadata correctly
 * - Expand/collapse behavior
 * - Click and double-click handlers
 * - Keyboard navigation
 * - Indicator display (counts, rating, favorite)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TagTreeNode from "../../../src/components/tags/TagTreeNode.jsx";

// Wrapper to provide router context
const renderWithRouter = (ui) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// Mock tag with children
const mockTagWithChildren = {
  id: "1",
  name: "Parent Tag",
  scene_count: 10,
  image_count: 5,
  performer_count: 3,
  children: [
    { id: "2", name: "Child 1", scene_count: 2, children: [] },
    { id: "3", name: "Child 2", scene_count: 3, children: [] },
  ],
};

// Mock tag without children
const mockTagLeaf = {
  id: "4",
  name: "Leaf Tag",
  scene_count: 5,
  children: [],
};

// Mock tag with rating and o-counter
const mockTagWithRating = {
  id: "5",
  name: "Rated Tag",
  scene_count: 8,
  rating100: 75,
  o_counter: 3,
  favorite: true,
  children: [],
};

describe("TagTreeNode", () => {
  describe("rendering", () => {
    it("renders tag name", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagLeaf} onToggle={() => {}} />
      );
      expect(screen.getByText("Leaf Tag")).toBeInTheDocument();
    });

    it("renders scene count indicator when > 0", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagLeaf} onToggle={() => {}} />
      );
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByTitle("5 scenes")).toBeInTheDocument();
    });

    it("renders image count indicator when > 0", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagWithChildren} onToggle={() => {}} />
      );
      expect(screen.getByTitle("5 images")).toBeInTheDocument();
    });

    it("renders performer count indicator when > 0", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagWithChildren} onToggle={() => {}} />
      );
      expect(screen.getByTitle("3 performers")).toBeInTheDocument();
    });

    it("renders rating badge with correct value", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagWithRating} onToggle={() => {}} />
      );
      // Rating 75 / 10 = 7.5
      expect(screen.getByText("7.5")).toBeInTheDocument();
      expect(screen.getByTitle("Rating: 7.5")).toBeInTheDocument();
    });

    it("renders o-counter indicator", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagWithRating} onToggle={() => {}} />
      );
      expect(screen.getByTitle("O-Counter: 3")).toBeInTheDocument();
    });

    it("renders favorite star when favorited", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagWithRating} onToggle={() => {}} />
      );
      expect(screen.getByTitle("Favorite")).toBeInTheDocument();
    });

    it("renders subtag count in subtitle when has children", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagWithChildren} onToggle={() => {}} />
      );
      expect(screen.getByText("2 subtags")).toBeInTheDocument();
    });

    it("renders expand chevron when has children", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagWithChildren} onToggle={() => {}} />
      );
      // The chevron should be present (by class or visibility)
      const treeitem = screen.getByRole("treeitem");
      expect(treeitem).toHaveAttribute("aria-expanded", "false");
    });

    it("does not render expand chevron for leaf nodes", () => {
      renderWithRouter(
        <TagTreeNode tag={mockTagLeaf} onToggle={() => {}} />
      );
      const treeitem = screen.getByRole("treeitem");
      expect(treeitem).not.toHaveAttribute("aria-expanded");
    });
  });

  describe("expand/collapse", () => {
    it("calls onToggle when clicked and has children", () => {
      const onToggle = vi.fn();
      renderWithRouter(
        <TagTreeNode tag={mockTagWithChildren} onToggle={onToggle} />
      );
      fireEvent.click(screen.getByRole("treeitem"));
      expect(onToggle).toHaveBeenCalledWith("1");
    });

    it("does not call onToggle when clicked on leaf node", () => {
      const onToggle = vi.fn();
      renderWithRouter(
        <TagTreeNode tag={mockTagLeaf} onToggle={onToggle} />
      );
      fireEvent.click(screen.getByRole("treeitem"));
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("renders children when expanded", () => {
      const expandedIds = new Set(["1"]);
      renderWithRouter(
        <TagTreeNode
          tag={mockTagWithChildren}
          isExpanded={true}
          expandedIds={expandedIds}
          onToggle={() => {}}
        />
      );
      expect(screen.getByText("Child 1")).toBeInTheDocument();
      expect(screen.getByText("Child 2")).toBeInTheDocument();
    });

    it("does not render children when collapsed", () => {
      renderWithRouter(
        <TagTreeNode
          tag={mockTagWithChildren}
          isExpanded={false}
          onToggle={() => {}}
        />
      );
      expect(screen.queryByText("Child 1")).not.toBeInTheDocument();
      expect(screen.queryByText("Child 2")).not.toBeInTheDocument();
    });

    it("sets aria-expanded correctly", () => {
      const { rerender } = renderWithRouter(
        <TagTreeNode
          tag={mockTagWithChildren}
          isExpanded={false}
          onToggle={() => {}}
        />
      );
      // Only one treeitem when collapsed (children not rendered)
      expect(screen.getByRole("treeitem")).toHaveAttribute("aria-expanded", "false");

      rerender(
        <MemoryRouter>
          <TagTreeNode
            tag={mockTagWithChildren}
            isExpanded={true}
            expandedIds={new Set(["1"])}
            onToggle={() => {}}
          />
        </MemoryRouter>
      );
      // When expanded, multiple treeitems exist - get the parent by its name
      const allTreeItems = screen.getAllByRole("treeitem");
      const parentItem = allTreeItems.find(item =>
        item.textContent.includes("Parent Tag")
      );
      expect(parentItem).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("focus and keyboard", () => {
    it("sets aria-selected when focused", () => {
      renderWithRouter(
        <TagTreeNode
          tag={mockTagLeaf}
          focusedId="4"
          onToggle={() => {}}
          onFocus={() => {}}
        />
      );
      expect(screen.getByRole("treeitem")).toHaveAttribute("aria-selected", "true");
    });

    it("sets tabIndex 0 when focused, -1 otherwise", () => {
      const { rerender } = renderWithRouter(
        <TagTreeNode
          tag={mockTagLeaf}
          focusedId="4"
          onToggle={() => {}}
          onFocus={() => {}}
        />
      );
      expect(screen.getByRole("treeitem")).toHaveAttribute("tabIndex", "0");

      rerender(
        <MemoryRouter>
          <TagTreeNode
            tag={mockTagLeaf}
            focusedId="other"
            onToggle={() => {}}
            onFocus={() => {}}
          />
        </MemoryRouter>
      );
      expect(screen.getByRole("treeitem")).toHaveAttribute("tabIndex", "-1");
    });

    it("calls onFocus when clicked", () => {
      const onFocus = vi.fn();
      renderWithRouter(
        <TagTreeNode
          tag={mockTagLeaf}
          onToggle={() => {}}
          onFocus={onFocus}
        />
      );
      fireEvent.click(screen.getByRole("treeitem"));
      expect(onFocus).toHaveBeenCalledWith("4");
    });
  });

  describe("ancestor dimming", () => {
    it("applies dimmed styling when isAncestorOnly is true", () => {
      renderWithRouter(
        <TagTreeNode
          tag={mockTagLeaf}
          isAncestorOnly={true}
          onToggle={() => {}}
        />
      );
      const treeitem = screen.getByRole("treeitem");
      expect(treeitem).toHaveClass("opacity-50");
    });

    it("does not apply dimmed styling when isAncestorOnly is false", () => {
      renderWithRouter(
        <TagTreeNode
          tag={mockTagLeaf}
          isAncestorOnly={false}
          onToggle={() => {}}
        />
      );
      const treeitem = screen.getByRole("treeitem");
      expect(treeitem).not.toHaveClass("opacity-50");
    });
  });

  describe("depth indentation", () => {
    it("applies margin based on depth", () => {
      renderWithRouter(
        <TagTreeNode
          tag={mockTagLeaf}
          depth={2}
          onToggle={() => {}}
        />
      );
      const treeitem = screen.getByRole("treeitem");
      expect(treeitem).toHaveStyle({ marginLeft: "48px" }); // 2 * 24px
    });
  });
});
