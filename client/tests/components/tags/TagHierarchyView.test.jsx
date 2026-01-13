/**
 * TagHierarchyView Component Tests
 *
 * Tests for the tag hierarchy container component:
 * - Renders tree structure correctly
 * - Loading state
 * - Empty state
 * - Expand/collapse management
 * - Keyboard navigation
 * - Search filtering auto-expand
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TagHierarchyView from "../../../src/components/tags/TagHierarchyView.jsx";

// Wrapper to provide router context
const renderWithRouter = (ui) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// Mock tags with hierarchy - includes parents array for buildTagTree
const mockTags = [
  {
    id: "1",
    name: "Parent Tag",
    scene_count: 10,
    parents: [],
    children: [
      { id: "2", name: "Child 1" },
      { id: "3", name: "Child 2" },
    ],
  },
  {
    id: "2",
    name: "Child 1",
    scene_count: 5,
    parents: [{ id: "1", name: "Parent Tag" }],
    children: [],
  },
  {
    id: "3",
    name: "Child 2",
    scene_count: 3,
    parents: [{ id: "1", name: "Parent Tag" }],
    children: [{ id: "4", name: "Grandchild" }],
  },
  {
    id: "4",
    name: "Grandchild",
    scene_count: 1,
    parents: [{ id: "3", name: "Child 2" }],
    children: [],
  },
];

// Flat tags without parents (all root level)
const mockFlatTags = [
  { id: "10", name: "Alpha", scene_count: 5, parents: [], children: [] },
  { id: "11", name: "Beta", scene_count: 3, parents: [], children: [] },
  { id: "12", name: "Gamma", scene_count: 8, parents: [], children: [] },
];

describe("TagHierarchyView", () => {
  describe("rendering", () => {
    it("renders tree container with correct role", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockTags} isLoading={false} />
      );
      expect(screen.getByRole("tree")).toBeInTheDocument();
      expect(screen.getByRole("tree")).toHaveAttribute(
        "aria-label",
        "Tag hierarchy"
      );
    });

    it("renders root tags", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockTags} isLoading={false} />
      );
      // Parent Tag should be visible (it has no parents)
      expect(screen.getByText("Parent Tag")).toBeInTheDocument();
    });

    it("expands first level by default", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockTags} isLoading={false} />
      );
      // Root nodes should be expanded, showing their children
      expect(screen.getByText("Child 1")).toBeInTheDocument();
      expect(screen.getByText("Child 2")).toBeInTheDocument();
    });

    it("does not show grandchildren initially", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockTags} isLoading={false} />
      );
      // Grandchild should not be visible until Child 2 is expanded
      expect(screen.queryByText("Grandchild")).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("renders skeleton placeholders when loading", () => {
      renderWithRouter(
        <TagHierarchyView tags={[]} isLoading={true} />
      );
      // Should show animated placeholders
      const placeholders = document.querySelectorAll(".animate-pulse");
      expect(placeholders.length).toBeGreaterThan(0);
    });

    it("does not render tree when loading", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockTags} isLoading={true} />
      );
      expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders empty message when no tags", () => {
      renderWithRouter(
        <TagHierarchyView tags={[]} isLoading={false} />
      );
      expect(screen.getByText("No tags found")).toBeInTheDocument();
    });

    it("does not render tree when empty", () => {
      renderWithRouter(
        <TagHierarchyView tags={[]} isLoading={false} />
      );
      expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    });
  });

  describe("expand/collapse", () => {
    it("expands node when clicked", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockTags} isLoading={false} />
      );
      // Child 2 should be visible but Grandchild should not
      expect(screen.getByText("Child 2")).toBeInTheDocument();
      expect(screen.queryByText("Grandchild")).not.toBeInTheDocument();

      // Click on Child 2 to expand it
      fireEvent.click(screen.getByText("Child 2"));

      // Now Grandchild should be visible
      expect(screen.getByText("Grandchild")).toBeInTheDocument();
    });

    it("collapses node when clicked again", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockTags} isLoading={false} />
      );
      // First expand Child 2
      fireEvent.click(screen.getByText("Child 2"));
      expect(screen.getByText("Grandchild")).toBeInTheDocument();

      // Click again to collapse
      fireEvent.click(screen.getByText("Child 2"));
      expect(screen.queryByText("Grandchild")).not.toBeInTheDocument();
    });
  });

  describe("sorting", () => {
    it("sorts tags by name ascending by default", () => {
      renderWithRouter(
        <TagHierarchyView
          tags={mockFlatTags}
          isLoading={false}
          sortField="name"
          sortDirection="ASC"
        />
      );
      const items = screen.getAllByRole("treeitem");
      const names = items.map((item) =>
        item.querySelector(".font-medium")?.textContent
      );
      expect(names).toEqual(["Alpha", "Beta", "Gamma"]);
    });

    it("sorts tags by name descending when specified", () => {
      renderWithRouter(
        <TagHierarchyView
          tags={mockFlatTags}
          isLoading={false}
          sortField="name"
          sortDirection="DESC"
        />
      );
      const items = screen.getAllByRole("treeitem");
      const names = items.map((item) =>
        item.querySelector(".font-medium")?.textContent
      );
      expect(names).toEqual(["Gamma", "Beta", "Alpha"]);
    });

    it("sorts tags by scene count", () => {
      renderWithRouter(
        <TagHierarchyView
          tags={mockFlatTags}
          isLoading={false}
          sortField="scenes_count"
          sortDirection="DESC"
        />
      );
      const items = screen.getAllByRole("treeitem");
      const names = items.map((item) =>
        item.querySelector(".font-medium")?.textContent
      );
      // Gamma (8) > Alpha (5) > Beta (3)
      expect(names).toEqual(["Gamma", "Alpha", "Beta"]);
    });
  });

  describe("keyboard navigation", () => {
    it("navigates down with ArrowDown", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockFlatTags} isLoading={false} />
      );
      const tree = screen.getByRole("tree");

      // Initial focus should be on first item
      const items = screen.getAllByRole("treeitem");
      expect(items[0]).toHaveAttribute("aria-selected", "true");

      // Press ArrowDown
      fireEvent.keyDown(tree, { key: "ArrowDown" });

      // Second item should be focused
      expect(items[0]).toHaveAttribute("aria-selected", "false");
      expect(items[1]).toHaveAttribute("aria-selected", "true");
    });

    it("navigates up with ArrowUp", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockFlatTags} isLoading={false} />
      );
      const tree = screen.getByRole("tree");
      const items = screen.getAllByRole("treeitem");

      // Move to second item first
      fireEvent.keyDown(tree, { key: "ArrowDown" });
      expect(items[1]).toHaveAttribute("aria-selected", "true");

      // Press ArrowUp
      fireEvent.keyDown(tree, { key: "ArrowUp" });

      // First item should be focused again
      expect(items[0]).toHaveAttribute("aria-selected", "true");
    });

    it("expands node with ArrowRight", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockTags} isLoading={false} />
      );
      const tree = screen.getByRole("tree");

      // Click on Child 2 to focus it (which has children)
      fireEvent.click(screen.getByText("Child 2"));

      // Grandchild should not be visible yet (Child 2 starts collapsed at depth 1)
      // First collapse Parent Tag to test expansion
      fireEvent.click(screen.getByText("Parent Tag"));
      expect(screen.queryByText("Child 2")).not.toBeInTheDocument();

      // Now expand with ArrowRight
      fireEvent.keyDown(tree, { key: "ArrowRight" });
      expect(screen.getByText("Child 2")).toBeInTheDocument();
    });

    it("jumps to start with Home key", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockFlatTags} isLoading={false} />
      );
      const tree = screen.getByRole("tree");
      const items = screen.getAllByRole("treeitem");

      // Move to last item
      fireEvent.keyDown(tree, { key: "End" });
      expect(items[2]).toHaveAttribute("aria-selected", "true");

      // Press Home
      fireEvent.keyDown(tree, { key: "Home" });
      expect(items[0]).toHaveAttribute("aria-selected", "true");
    });

    it("jumps to end with End key", () => {
      renderWithRouter(
        <TagHierarchyView tags={mockFlatTags} isLoading={false} />
      );
      const tree = screen.getByRole("tree");
      const items = screen.getAllByRole("treeitem");

      // Initial focus on first item
      expect(items[0]).toHaveAttribute("aria-selected", "true");

      // Press End
      fireEvent.keyDown(tree, { key: "End" });
      expect(items[2]).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("search filtering", () => {
    it("filters to show matching tags", () => {
      renderWithRouter(
        <TagHierarchyView
          tags={mockFlatTags}
          isLoading={false}
          searchQuery="Beta"
        />
      );
      // Only Beta should be visible
      expect(screen.getByText("Beta")).toBeInTheDocument();
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
      expect(screen.queryByText("Gamma")).not.toBeInTheDocument();
    });

    it("shows empty state when no matches", () => {
      renderWithRouter(
        <TagHierarchyView
          tags={mockFlatTags}
          isLoading={false}
          searchQuery="NonExistent"
        />
      );
      expect(screen.getByText("No tags found")).toBeInTheDocument();
    });

    it("auto-expands ancestors to show matching child", () => {
      renderWithRouter(
        <TagHierarchyView
          tags={mockTags}
          isLoading={false}
          searchQuery="Grandchild"
        />
      );
      // Parent Tag and Child 2 should be auto-expanded to show Grandchild
      expect(screen.getByText("Grandchild")).toBeInTheDocument();
      // Ancestors should be visible (dimmed)
      expect(screen.getByText("Parent Tag")).toBeInTheDocument();
      expect(screen.getByText("Child 2")).toBeInTheDocument();
    });
  });
});
