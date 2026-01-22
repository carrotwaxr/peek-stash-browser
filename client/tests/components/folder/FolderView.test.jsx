// client/tests/components/folder/FolderView.test.jsx
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import FolderView from "../../../src/components/folder/FolderView.jsx";

// Helper to capture URL search params
let capturedSearchParams = null;
const SearchParamsCapture = ({ children }) => {
  const [searchParams] = useSearchParams();
  capturedSearchParams = searchParams;
  return children;
};

// Wrapper to provide router context with initial URL
const createWrapper = (initialEntries = ["/"]) => {
  return ({ children }) => (
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
    it("resets page to 1 when navigating into a folder", async () => {
      // Start on page 5
      const Wrapper = createWrapper(["/?page=5"]);
      const onFolderPathChange = vi.fn();

      render(
        <FolderView
          items={sampleItems}
          tags={sampleTags}
          renderItem={(item) => <div key={item.id} data-testid={`item-${item.id}`}>{item.id}</div>}
          onFolderPathChange={onFolderPathChange}
        />,
        { wrapper: Wrapper }
      );

      // Verify we start on page 5
      expect(capturedSearchParams.get("page")).toBe("5");

      // Find and click the "Photo" folder card (has h3 with folder name)
      // The folder card has an h3 inside it, so we find that and click its parent button
      const folderCards = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("h3")?.textContent === "Photo"
      );
      expect(folderCards.length).toBeGreaterThan(0);
      fireEvent.click(folderCards[0]);

      // After navigating into a folder, page should be reset (deleted = page 1)
      expect(capturedSearchParams.get("page")).toBeNull();
    });

    it("resets page to 1 when navigating out of a folder via breadcrumb", async () => {
      // Start inside a folder on page 3
      const Wrapper = createWrapper(["/?folderPath=tag1&page=3"]);
      const onFolderPathChange = vi.fn();

      render(
        <FolderView
          items={sampleItems}
          tags={sampleTags}
          renderItem={(item) => <div key={item.id} data-testid={`item-${item.id}`}>{item.id}</div>}
          onFolderPathChange={onFolderPathChange}
        />,
        { wrapper: Wrapper }
      );

      // Verify we start on page 3 inside tag1
      expect(capturedSearchParams.get("page")).toBe("3");
      expect(capturedSearchParams.get("folderPath")).toBe("tag1");

      // Find the breadcrumb nav and click "All" (root) within it
      const breadcrumbNav = screen.getByRole("navigation", { name: /folder navigation/i });
      const allContentBreadcrumb = within(breadcrumbNav).getByText("All");
      fireEvent.click(allContentBreadcrumb);

      // After navigating, page should be reset
      expect(capturedSearchParams.get("page")).toBeNull();
    });

    it("resets page when clicking deeper into nested folders", async () => {
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
          renderItem={(item) => <div key={item.id} data-testid={`item-${item.id}`}>{item.id}</div>}
          onFolderPathChange={onFolderPathChange}
        />,
        { wrapper: Wrapper }
      );

      // Verify we start on page 2
      expect(capturedSearchParams.get("page")).toBe("2");

      // Find and click the "Color" folder card (has h3 with folder name)
      const folderCards = screen.getAllByRole("button").filter(
        (btn) => btn.querySelector("h3")?.textContent === "Color"
      );
      expect(folderCards.length).toBeGreaterThan(0);
      fireEvent.click(folderCards[0]);

      // After navigating deeper, page should be reset
      expect(capturedSearchParams.get("page")).toBeNull();
      // And folderPath should be updated
      expect(capturedSearchParams.get("folderPath")).toBe("tag1,tag2");
    });
  });
});
