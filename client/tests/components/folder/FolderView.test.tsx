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

/** Renders the view at `url` with the owner's `path`, reporting clicks to `onPathChange` */
const renderFolder = ({
  url = "/",
  path = [],
  items = sampleItems,
  tags = sampleTags,
  onPathChange = vi.fn<(path: string[]) => void>(),
}: {
  url?: string;
  path?: string[];
  items?: Record<string, unknown>[];
  tags?: React.ComponentProps<typeof FolderView>["tags"];
  onPathChange?: (path: string[]) => void;
} = {}) =>
  render(
    <FolderView
      items={items}
      tags={tags}
      path={path}
      onPathChange={onPathChange}
      renderItem={(item) => (
        <div key={String(item.id)} data-testid={`item-${String(item.id)}`}>
          {String(item.id)}
        </div>
      )}
    />,
    { wrapper: createWrapper([url]) }
  );

/** The folder cards' names, in order */
const folderNames = () =>
  screen
    .getAllByRole("button")
    .map((btn) => btn.querySelector("h3")?.textContent)
    .filter((name) => name !== undefined);

const folderCard = (name: string) =>
  must(
    screen
      .getAllByRole("button")
      .find((btn) => btn.querySelector("h3")?.textContent === name),
    `the ${name} folder`
  );

describe("FolderView", () => {
  describe("folder navigation", () => {
    it("a folder click reports the path into it", () => {
      const onPathChange = vi.fn<(path: string[]) => void>();
      renderFolder({ onPathChange });

      fireEvent.click(folderCard("Photo"));

      expect(onPathChange).toHaveBeenLastCalledWith(["tag1"]);
    });

    it("the breadcrumb's All reports the root", () => {
      const onPathChange = vi.fn<(path: string[]) => void>();
      renderFolder({ path: ["tag1"], onPathChange });

      const breadcrumbNav = screen.getByRole("navigation", {
        name: /folder navigation/i,
      });
      fireEvent.click(within(breadcrumbNav).getByText("All"));

      expect(onPathChange).toHaveBeenLastCalledWith([]);
    });

    it("a nested folder click reports the deeper path", () => {
      const onPathChange = vi.fn<(path: string[]) => void>();
      renderFolder({
        path: ["tag1"],
        items: [{ id: "img1", tags: [{ id: "tag1" }, { id: "tag2" }] }],
        onPathChange,
      });

      fireEvent.click(folderCard("Color"));

      expect(onPathChange).toHaveBeenLastCalledWith(["tag1", "tag2"]);
    });
  });

  describe("instances", () => {
    it("a folder's path names the tag's instance", () => {
      const onPathChange = vi.fn<(path: string[]) => void>();
      renderFolder({
        tags: [
          { id: "5", instanceId: "a", name: "Five A", parents: [] },
          { id: "5", instanceId: "b", name: "Five B", parents: [] },
        ],
        items: [
          { id: "s1", instanceId: "a", tags: [{ id: "5" }] },
          { id: "s2", instanceId: "b", tags: [{ id: "5" }] },
        ],
        onPathChange,
      });

      fireEvent.click(folderCard("Five B"));

      expect(onPathChange).toHaveBeenLastCalledWith(["5:b"]);
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
    const renderAt = (url: string, tags: typeof bookmarkTags) =>
      renderFolder({
        url,
        path: (new URLSearchParams(url.split("?")[1]).get("folderPath") ?? "")
          .split(",")
          .filter(Boolean),
        items: [],
        tags,
      });

    it("a bookmarked folderPath of bare ids opens the same folders", () => {
      const onA = bookmarkTags.filter((t) => t.instanceId === "a");

      renderAt("/?folderPath=5", onA);

      expect(folderNames()).toEqual(["Six A"]);
      expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
      // Stored the new way from then on
      expect(must(capturedSearchParams).get("folderPath")).toBe("5:a");
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
