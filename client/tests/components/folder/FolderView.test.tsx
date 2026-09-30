/**
 * The folder view (item 57, #398): folders from the tag tree above the
 * list's page, which inside a folder holds the folder's own items, paged by
 * the list; at the root, folders only and no list request. The page cases
 * render Galleries with the library API mocked.
 */
import { MemoryRouter, useSearchParams } from "react-router-dom";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { must, renderListPage } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Galleries from "@/components/pages/Galleries";
import FolderView from "../../../src/components/folder/FolderView";

type Find = (params: Record<string, unknown>) => Promise<unknown>;

const { api } = vi.hoisted(() => ({
  api: {
    findGalleries: vi.fn<Find>(),
    findTagTree: vi.fn<() => Promise<unknown>>(),
  },
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/api/library", () => ({ libraryApi: api }));
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({ distribution: [] }),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({}),
  apiDelete: vi.fn().mockResolvedValue({}),
  libraryApi: {
    ...api,
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/components/ui/LibraryInitializingBanner", () => ({
  default: () => null,
}));
vi.mock("@/components/cards/index", () => ({
  GalleryCard: (props: { gallery: { title: string } }) => (
    <div data-testid="gallery-card">{props.gallery.title}</div>
  ),
}));

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

const IMAGES = { one: "image", many: "images" };

// Sample data for tests
const sampleTags = [
  { id: "tag1", name: "Photo", parents: [], image_count: 2 },
  { id: "tag2", name: "Color", parents: [{ id: "tag1" }], image_count: 1 },
];

const sampleItems = [{ id: "img1" }, { id: "img2" }];

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
      itemCount={items.length}
      tags={tags}
      countField="image_count"
      entityLabel={IMAGES}
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
        items: [{ id: "img1" }],
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
          {
            id: "5",
            instanceId: "a",
            name: "Five A",
            parents: [],
            image_count: 1,
          },
          {
            id: "5",
            instanceId: "b",
            name: "Five B",
            parents: [],
            image_count: 1,
          },
        ],
        items: [],
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
        image_count: 1,
      },
      { id: "5", instanceId: "b", name: "Five B", parents: [] },
      {
        id: "7",
        instanceId: "b",
        name: "Seven B",
        parents: [{ id: "5" }],
        image_count: 1,
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
          image_count: 1,
        },
      ];
      const items = [{ id: "img2", instanceId: "a" }];

      // The URL names no folder: the path prop is the one shown
      render(
        <FolderView
          items={items}
          itemCount={items.length}
          tags={tags}
          countField="image_count"
          entityLabel={IMAGES}
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
          itemCount={0}
          tags={[{ id: "5", instanceId: "a", name: "Five", parents: [] }]}
          countField="image_count"
          entityLabel={IMAGES}
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

  describe("folders and items", () => {
    it("a folder card shows its own count for the page's type", () => {
      renderFolder();

      expect(
        within(folderCard("Photo")).getByLabelText("2 images")
      ).toHaveTextContent("2");
    });

    it("inside a folder, its sub-folders come first, then the page's items with their count", () => {
      renderFolder({ path: ["tag1"] });

      expect(folderNames()).toEqual(["Color"]);
      expect(screen.getByTestId("item-img1")).toBeInTheDocument();
      expect(screen.getByText("2 images in this folder")).toBeInTheDocument();
    });

    it("an empty folder says nothing is directly in it", () => {
      renderFolder({ path: ["tag1"], items: [] });

      expect(
        screen.getByText("No images directly in Photo")
      ).toBeInTheDocument();
    });

    it("at the root the view lists folders only", () => {
      renderFolder();

      expect(folderNames()).toEqual(["Photo"]);
      expect(screen.queryByTestId("item-img1")).not.toBeInTheDocument();
    });
  });

  describe("on a list page", () => {
    const TREE = {
      tags: [
        {
          id: "5",
          instanceId: "a",
          name: "Five",
          parents: [],
          gallery_count: 30,
        },
        {
          id: "6",
          instanceId: "a",
          name: "Six",
          parents: [{ id: "5" }],
          gallery_count: 4,
        },
      ],
    };
    const galleryRows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: String(i + 1),
        instanceId: "a",
        title: `Gallery ${i + 1}`,
        tags: [],
      }));

    beforeEach(() => {
      vi.clearAllMocks();
      api.findTagTree.mockResolvedValue(TREE);
      api.findGalleries.mockResolvedValue({
        findGalleries: { count: 30, galleries: galleryRows(24) },
      });
    });

    it("inside a folder, 24 items per page are the folder's own items and the pagination counts them only", async () => {
      renderListPage(<Galleries />, {
        initialEntries: ["/galleries?view=folder&folderPath=5:a"],
      });

      expect(await screen.findAllByTestId("gallery-card")).toHaveLength(24);
      // The folder's own galleries: its tag, not its sub-tags
      const params = must(api.findGalleries.mock.calls.at(-1))[0] as {
        filter: { per_page?: number };
        gallery_filter: Record<string, unknown>;
      };
      expect(params.gallery_filter.tags).toEqual({
        value: ["5:a"],
        modifier: "INCLUDES",
        depth: 0,
      });
      expect(params.filter.per_page).toBe(24);
      // The sub-folder above them, with its own count
      expect(folderNames()).toEqual(["Six"]);
      expect(
        within(folderCard("Six")).getByLabelText("4 galleries")
      ).toBeInTheDocument();
      expect(
        screen.getByText("30 galleries in this folder")
      ).toBeInTheDocument();
      expect(
        screen.getAllByText("Showing 1-24 of 30 records").length
      ).toBeGreaterThan(0);
    });

    it("opening Untagged lists untagged items with a working page count", async () => {
      api.findTagTree.mockResolvedValue({ ...TREE, untagged: 30 });
      // A tag filter from the panel would leave Untagged empty: it is dropped
      renderListPage(<Galleries />, {
        initialEntries: ["/galleries?view=folder&tagIds=5:a"],
      });

      // At the root, Untagged sits after the tag folders with the page's count
      await waitFor(() => expect(folderNames()).toEqual(["Five", "Untagged"]));
      // The tree counts the page's type only
      expect(api.findTagTree).toHaveBeenCalledWith(
        { untagged: "gallery" },
        expect.anything()
      );
      expect(
        within(folderCard("Untagged")).getByLabelText("30 galleries")
      ).toBeInTheDocument();
      expect(api.findGalleries).not.toHaveBeenCalled();

      fireEvent.click(folderCard("Untagged"));

      expect(await screen.findAllByTestId("gallery-card")).toHaveLength(24);
      const params = must(api.findGalleries.mock.calls.at(-1))[0] as {
        gallery_filter: Record<string, unknown>;
      };
      expect(params.gallery_filter).toEqual({
        tag_count: { value: 0, modifier: "EQUALS" },
      });
      expect(
        screen.getByText("30 galleries in this folder")
      ).toBeInTheDocument();
      expect(
        screen.getAllByText("Showing 1-24 of 30 records").length
      ).toBeGreaterThan(0);
      // No tag folder inside Untagged
      expect(folderNames()).toEqual([]);
    });

    it("the root shows no Untagged folder when nothing of the page's type is untagged", async () => {
      api.findTagTree.mockResolvedValue({ ...TREE, untagged: 0 });
      renderListPage(<Galleries />, {
        initialEntries: ["/galleries?view=folder"],
      });

      await waitFor(() => expect(folderNames()).toEqual(["Five"]));
    });

    it("at the root no list request is made", async () => {
      renderListPage(<Galleries />, {
        initialEntries: ["/galleries?view=folder"],
      });

      await waitFor(() => expect(folderNames()).toEqual(["Five"]));
      expect(
        within(folderCard("Five")).getByLabelText("30 galleries")
      ).toBeInTheDocument();
      expect(api.findGalleries).not.toHaveBeenCalled();
      expect(screen.queryByText(/Showing \d/)).not.toBeInTheDocument();
      expect(screen.queryByTestId("gallery-card")).not.toBeInTheDocument();
    });
  });
});
