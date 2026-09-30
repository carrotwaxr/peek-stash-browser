/**
 * The Tags page on the list page shell: its title, its error and
 * initializing states, its cards and its stale results. The list hook is
 * mocked; the controls and pagination are the real ones.
 */
import { fireEvent, screen } from "@testing-library/react";
import { renderListPage } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import type * as ApiHooks from "@/api/hooks";
import Tags from "@/components/pages/Tags";
import { usePageTitle } from "@/hooks/usePageTitle";

interface MockListResult {
  data: Record<string, unknown> | undefined;
  isPending: boolean;
  error: Error | null;
  isPlaceholderData: boolean;
  refetch: () => void;
}

interface MockTreeResult {
  data: { tags: unknown[] } | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const { mockList, mockTree, mockRefetchTree } = vi.hoisted(() => ({
  mockList: vi.fn<(params: unknown) => MockListResult>(),
  mockTree: vi.fn<(scope: unknown, enabled: boolean) => MockTreeResult>(),
  mockRefetchTree: vi.fn(),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiHooks>()),
  useTagList: (params: unknown) => mockList(params),
  useTagTree: (scope: unknown, enabled: boolean) => mockTree(scope, enabled),
}));
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({}),
  libraryApi: {},
}));
// Shows itself while the library is initializing (its own test covers when)
vi.mock("@/components/ui/LibraryInitializingBanner", () => ({
  default: () => <div data-testid="sync-banner" />,
}));
vi.mock("@/components/tags/index", () => ({
  TagHierarchyView: (props: { isLoading: boolean }) => (
    <div data-testid="hierarchy-view" data-loading={String(props.isLoading)} />
  ),
}));
vi.mock("@/components/cards/index", () => ({
  TagCard: (props: { tag: { name: string } }) => (
    <div data-testid="tag-card">{props.tag.name}</div>
  ),
}));

const result = (fields: Partial<MockListResult> = {}): MockListResult => ({
  data: undefined,
  isPending: false,
  error: null,
  isPlaceholderData: false,
  refetch: vi.fn(),
  ...fields,
});

const renderPage = (url = "/tags") =>
  renderListPage(<Tags />, { initialEntries: [url] });

const tree = (fields: Partial<MockTreeResult> = {}): MockTreeResult => ({
  data: undefined,
  isLoading: false,
  error: null,
  refetch: mockRefetchTree,
  ...fields,
});

describe("Tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockReturnValue(
      result({ data: { findTags: { tags: [], count: 0 } } })
    );
    mockTree.mockReturnValue(tree());
  });

  describe("Hierarchy view", () => {
    it("a failed tag-tree request shows the error with Retry, not a spinner", () => {
      mockTree.mockReturnValue(
        tree({ error: new ApiError("Tree failed", 500) })
      );

      renderPage("/tags?view=hierarchy");

      expect(screen.getByRole("alert")).toHaveTextContent("Tree failed");
      expect(screen.queryByTestId("hierarchy-view")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      expect(mockRefetchTree).toHaveBeenCalled();
    });

    it("an initializing 503 on the tree keeps the loading view, not the error", () => {
      mockTree.mockReturnValue(
        tree({ error: new ApiError("init", 503, { ready: false }) })
      );

      renderPage("/tags?view=hierarchy");

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId("hierarchy-view")).toHaveAttribute(
        "data-loading",
        "true"
      );
    });

    it("reads the compact tag tree only while the hierarchy view is open", () => {
      renderPage();

      // The grid view is open: the tree is not fetched
      expect(mockTree).not.toHaveBeenCalledWith(undefined, true);
      expect(screen.queryByTestId("hierarchy-view")).not.toBeInTheDocument();
    });

    it("the hierarchy view shows no page bar: the tree is the whole list", () => {
      mockList.mockReturnValue(
        result({ data: { findTags: { tags: [], count: 240 } } })
      );

      renderPage("/tags?view=hierarchy");

      expect(screen.getByTestId("hierarchy-view")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Next Page" })
      ).not.toBeInTheDocument();
    });
  });

  describe("Rendering", () => {
    it("sets page title to 'Tags'", () => {
      renderPage();
      expect(usePageTitle).toHaveBeenCalledWith("Tags");
    });

    it("shows the heading 'Tags' and its controls", () => {
      renderPage();
      expect(screen.getByRole("heading", { name: "Tags" })).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("shows ErrorMessage when error is present and not initializing", () => {
      mockList.mockReturnValue(
        result({ error: new ApiError("Something went wrong", 500) })
      );

      renderPage();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong"
      );
    });

    it("an initializing 503 shows the sync banner, not the error page", () => {
      mockList.mockReturnValue(
        result({ error: new ApiError("init", 503, { ready: false }) })
      );

      renderPage();
      expect(screen.getByTestId("sync-banner")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("renders loading skeletons when loading", () => {
      mockList.mockReturnValue(result({ isPending: true }));

      renderPage();
      expect(screen.getAllByTestId("list-skeleton").length).toBeGreaterThan(0);
    });
  });

  describe("Data State", () => {
    it("renders TagCard when data is present", () => {
      mockList.mockReturnValue(
        result({
          data: {
            findTags: {
              tags: [
                { id: "1", instanceId: "a", name: "Action" },
                { id: "2", instanceId: "a", name: "Comedy" },
              ],
              count: 2,
            },
          },
        })
      );

      renderPage();
      const cards = screen.getAllByTestId("tag-card");
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent("Action");
    });
  });

  describe("Stale results", () => {
    it("dims the results while the list shows placeholder data", () => {
      mockList.mockReturnValue(
        result({
          data: { findTags: { tags: [], count: 0 } },
          isPlaceholderData: true,
        })
      );

      renderPage();
      expect(screen.getByTestId("search-results")).toHaveAttribute(
        "aria-busy",
        "true"
      );
    });
  });
});
