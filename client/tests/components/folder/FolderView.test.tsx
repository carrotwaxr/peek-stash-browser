// client/tests/components/folder/FolderView.test.jsx
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { describe, expect, it, vi } from "vitest";
import FolderView from "../../../src/components/folder/FolderView";

// Helper to capture URL search params
let capturedSearchParams: URLSearchParams | null = null;
const SearchParamsCapture = ({ children }: { children: React.ReactNode }) => {
  const [searchParams] = useSearchParams();
  capturedSearchParams = searchParams;
  return children;
};

// Wrapper to provide router context with initial URL
const createWrapper = (initialEntries = ["/"]) => {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>
      <SearchParamsCapture>{children}</SearchParamsCapture>
    </MemoryRouter>
  );
};

// Sample data for tests
const sampleTags = [
  { id: "tag1", name: "Photo", parents: [], children: [{ id: "tag2" }] },
  { id: "tag2", name: "Color", parents: [{ id: "tag1" }], children: [] },
];

const sampleItems = [
  { id: "img1", tags: [{ id: "tag1" }, { id: "tag2" }] },
  { id: "img2", tags: [{ id: "tag1" }] },
];

describe("FolderView", () => {
  describe("pagination state on folder navigation", () => {
    it("resets page to 1 when navigating into a folder", () => {
      // Start on page 5
      const Wrapper = createWrapper(["/?page=5"]);
      const onFolderPathChange = vi.fn();

      render(
        <FolderView
          items={sampleItems}
          tags={sampleTags}
          renderItem={(item) => (
            <div key={String(item.id)} data-testid={`item-${String(item.id)}`}>
              {String(item.id)}
            </div>
          )}
          onFolderPathChange={onFolderPathChange}
        />,
        { wrapper: Wrapper }
      );

      // Verify we start on page 5
      expect(must(capturedSearchParams).get("page")).toBe("5");

      // Find and click the "Photo" folder card (has h3 with folder name)
      // The folder card has an h3 inside it, so we find that and click its parent button
      const folderCards = screen
        .getAllByRole("button")
        .filter((btn) => btn.querySelector("h3")?.textContent === "Photo");
      expect(folderCards.length).toBeGreaterThan(0);
      fireEvent.click(must(folderCards[0]));

      // After navigating into a folder, page should be reset (deleted = page 1)
      expect(must(capturedSearchParams).get("page")).toBeNull();
    });

    it("resets page to 1 when navigating out of a folder via breadcrumb", () => {
      // Start inside a folder on page 3
      const Wrapper = createWrapper(["/?folderPath=tag1&page=3"]);
      const onFolderPathChange = vi.fn();

      render(
        <FolderView
          items={sampleItems}
          tags={sampleTags}
          renderItem={(item) => (
            <div key={String(item.id)} data-testid={`item-${String(item.id)}`}>
              {String(item.id)}
            </div>
          )}
          onFolderPathChange={onFolderPathChange}
        />,
        { wrapper: Wrapper }
      );

      // Verify we start on page 3 inside tag1
      expect(must(capturedSearchParams).get("page")).toBe("3");
      expect(must(capturedSearchParams).get("folderPath")).toBe("tag1");

      // Find the breadcrumb nav and click "All" (root) within it
      const breadcrumbNav = screen.getByRole("navigation", {
        name: /folder navigation/i,
      });
      const allContentBreadcrumb = within(breadcrumbNav).getByText("All");
      fireEvent.click(allContentBreadcrumb);

      // After navigating, page should be reset
      expect(must(capturedSearchParams).get("page")).toBeNull();
    });

    it("resets page when clicking deeper into nested folders", () => {
      // Start inside Photo folder on page 2
      const Wrapper = createWrapper(["/?folderPath=tag1&page=2"]);
      const onFolderPathChange = vi.fn();

      // Items that will create a "Color" subfolder inside Photo
      const itemsWithSubfolder = [
        { id: "img1", tags: [{ id: "tag1" }, { id: "tag2" }] },
      ];

      render(
        <FolderView
          items={itemsWithSubfolder}
          tags={sampleTags}
          renderItem={(item) => (
            <div key={String(item.id)} data-testid={`item-${String(item.id)}`}>
              {String(item.id)}
            </div>
          )}
          onFolderPathChange={onFolderPathChange}
        />,
        { wrapper: Wrapper }
      );

      // Verify we start on page 2
      expect(must(capturedSearchParams).get("page")).toBe("2");

      // Find and click the "Color" folder card (has h3 with folder name)
      const folderCards = screen
        .getAllByRole("button")
        .filter((btn) => btn.querySelector("h3")?.textContent === "Color");
      expect(folderCards.length).toBeGreaterThan(0);
      fireEvent.click(must(folderCards[0]));

      // After navigating deeper, page should be reset
      expect(must(capturedSearchParams).get("page")).toBeNull();
      // And folderPath should be updated
      expect(must(capturedSearchParams).get("folderPath")).toBe("tag1,tag2");
    });
  });

  describe("instances", () => {
    it("a folder's path and the tag it passes on name the tag's instance", () => {
      const Wrapper = createWrapper(["/"]);
      const onFolderPathChange = vi.fn();
      const tags = [
        { id: "5", instanceId: "a", name: "Five A", parents: [] },
        { id: "5", instanceId: "b", name: "Five B", parents: [] },
      ];
      const items = [
        { id: "s1", instanceId: "a", tags: [{ id: "5" }] },
        { id: "s2", instanceId: "b", tags: [{ id: "5" }] },
      ];

      render(
        <FolderView
          items={items}
          tags={tags}
          renderItem={(item) => (
            <div key={String(item.id)}>{String(item.id)}</div>
          )}
          onFolderPathChange={onFolderPathChange}
        />,
        { wrapper: Wrapper }
      );

      const folderCard = screen
        .getAllByRole("button")
        .find((btn) => btn.querySelector("h3")?.textContent === "Five B");
      fireEvent.click(must(folderCard));

      expect(must(capturedSearchParams).get("folderPath")).toBe("5:b");
      expect(onFolderPathChange).toHaveBeenLastCalledWith("5:b");
    });

    // Tag 5 on A (with child 6) and on B (with child 7)
    const bookmarkTags = [
      { id: "5", instanceId: "a", name: "Five A", parents: [] },
      {
        id: "6",
        instanceId: "a",
        name: "Six A",
        parents: [{ id: "5" }],
        scene_count: 1,
      },
      { id: "5", instanceId: "b", name: "Five B", parents: [] },
      {
        id: "7",
        instanceId: "b",
        name: "Seven B",
        parents: [{ id: "5" }],
        scene_count: 1,
      },
    ];
    const folderNames = () =>
      screen
        .getAllByRole("button")
        .map((btn) => btn.querySelector("h3")?.textContent)
        .filter((name) => name !== undefined);
    const renderAt = (
      url: string,
      tags: typeof bookmarkTags,
      onFolderPathChange = vi.fn()
    ) =>
      render(
        <FolderView
          items={[]}
          tags={tags}
          renderItem={(item) => (
            <div key={String(item.id)}>{String(item.id)}</div>
          )}
          onFolderPathChange={onFolderPathChange}
        />,
        { wrapper: createWrapper([url]) }
      );

    it("a bookmarked folderPath of bare ids opens the same folders", () => {
      const onFolderPathChange = vi.fn();
      const onA = bookmarkTags.filter((t) => t.instanceId === "a");

      renderAt("/?folderPath=5", onA, onFolderPathChange);

      expect(folderNames()).toEqual(["Six A"]);
      expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
      // Stored the new way from then on
      expect(must(capturedSearchParams).get("folderPath")).toBe("5:a");
      expect(onFolderPathChange).toHaveBeenLastCalledWith("5:a");
    });

    it("a bare id present on two instances follows the page's instance", () => {
      renderAt("/?instance=b&folderPath=5", bookmarkTags);

      expect(folderNames()).toEqual(["Seven B"]);
      expect(must(capturedSearchParams).get("folderPath")).toBe("5:b");
      expect(must(capturedSearchParams).get("instance")).toBe("b");
    });

    it("without the page's instance, a bare id on two instances opens the first instance's tag", () => {
      renderAt("/?folderPath=5", bookmarkTags);

      expect(folderNames()).toEqual(["Six A"]);
      expect(must(capturedSearchParams).get("folderPath")).toBe("5:a");
    });
  });

  describe("controlled", () => {
    it("a controlled path renders its folders and reports a click through onPathChange", () => {
      const onPathChange = vi.fn();
      const tags = [
        { id: "1", instanceId: "a", name: "Root", parents: [] },
        { id: "2", instanceId: "a", name: "Child", parents: [{ id: "1" }] },
        {
          id: "3",
          instanceId: "a",
          name: "Grandchild",
          parents: [{ id: "2" }],
        },
      ];
      const items = [
        { id: "img1", instanceId: "a", tags: [{ id: "3" }] },
        { id: "img2", instanceId: "a", tags: [{ id: "1" }] },
      ];

      // The URL names no folder: the path prop is the one shown
      render(
        <FolderView
          items={items}
          tags={tags}
          path={["1:a"]}
          onPathChange={onPathChange}
          renderItem={(item) => (
            <div key={String(item.id)}>{String(item.id)}</div>
          )}
        />,
        { wrapper: createWrapper(["/?page=4"]) }
      );

      const folderCards = screen
        .getAllByRole("button")
        .filter((btn) => btn.querySelector("h3") !== null);
      expect(
        folderCards.map((btn) => btn.querySelector("h3")?.textContent)
      ).toEqual(["Child"]);

      fireEvent.click(must(folderCards[0]));

      expect(onPathChange).toHaveBeenCalledTimes(1);
      expect(onPathChange).toHaveBeenLastCalledWith(["1:a", "2:a"]);
      // The owner writes the URL: the view leaves it alone
      expect(must(capturedSearchParams).get("folderPath")).toBeNull();
      expect(must(capturedSearchParams).get("page")).toBe("4");
    });

    it("a controlled path of bare ids is stored as tag keys by replace", () => {
      const onPathChange = vi.fn();
      render(
        <FolderView
          items={[]}
          tags={[{ id: "5", instanceId: "a", name: "Five", parents: [] }]}
          path={["5"]}
          onPathChange={onPathChange}
          renderItem={() => null}
        />,
        { wrapper: createWrapper(["/?folderPath=5"]) }
      );

      expect(must(capturedSearchParams).get("folderPath")).toBe("5:a");
      expect(onPathChange).not.toHaveBeenCalled();
    });
  });
});
