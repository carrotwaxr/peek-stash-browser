/**
 * The Galleries page on the list page shell: its title, its states and
 * cards, and its timeline and folder views, whose period and folder live in
 * the URL. The library API is mocked; the controls, pagination, timeline and
 * folder views are the real ones.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { must, renderListPage } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import type * as ApiHooks from "@/api/hooks";
import Galleries from "@/components/pages/Galleries";
import { usePageTitle } from "@/hooks/usePageTitle";

type Find = (params: Record<string, unknown>) => Promise<unknown>;

const { api, apiGet, listParams } = vi.hoisted(() => ({
  api: {
    findGalleries: vi.fn<Find>(),
    findTagTree: vi.fn<() => Promise<unknown>>(),
  },
  apiGet: vi.fn<(url: string) => Promise<unknown>>(),
  /** Every request the page's list hook was given, render by render */
  listParams: vi.fn<(params: unknown) => void>(),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/api/library", () => ({ libraryApi: api }));
vi.mock("@/api", () => ({
  apiGet,
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
vi.mock("@/api/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiHooks>();
  return {
    ...actual,
    useGalleryList: (...args: Parameters<typeof actual.useGalleryList>) => {
      listParams(args[0]);
      return actual.useGalleryList(...args);
    },
  };
});
// Shows itself while the library is initializing (its own test covers when)
vi.mock("@/components/ui/LibraryInitializingBanner", () => ({
  default: () => <div data-testid="sync-banner" />,
}));
vi.mock("@/components/cards/index", () => ({
  GalleryCard: (props: { gallery: { title: string } }) => (
    <div data-testid="gallery-card">{props.gallery.title}</div>
  ),
}));

const galleries = (
  rows: { id: string; title: string }[],
  count = rows.length
) => ({
  findGalleries: {
    count,
    galleries: rows.map((row) => ({ ...row, instanceId: "a", tags: [] })),
  },
});

type GalleryFilter = Record<string, unknown>;
const galleryFilterOf = (params: unknown): GalleryFilter =>
  (params as { gallery_filter?: GalleryFilter }).gallery_filter ?? {};

/** The requests the API was sent, oldest first */
const sentFilters = () =>
  api.findGalleries.mock.calls.map((call) => galleryFilterOf(call[0]));

const renderPage = (url = "/galleries") =>
  renderListPage(<Galleries />, { initialEntries: [url] });

beforeEach(() => {
  vi.clearAllMocks();
  api.findGalleries.mockResolvedValue(galleries([]));
  api.findTagTree.mockResolvedValue({ tags: [] });
  apiGet.mockResolvedValue({ distribution: [] });
});

describe("Galleries", () => {
  describe("Rendering", () => {
    it("sets page title to 'Galleries'", () => {
      renderPage();
      expect(usePageTitle).toHaveBeenCalledWith("Galleries");
    });

    it("shows the heading, its subtitle and the controls", () => {
      renderPage();
      expect(
        screen.getByRole("heading", { name: "Galleries" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("Browse image galleries in your library")
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });

    it("offers the grid, wall, table, timeline and folder views", () => {
      renderPage();
      fireEvent.click(
        screen.getByRole("button", { name: "View mode: Grid view" })
      );
      expect(
        within(screen.getByRole("listbox", { name: "View modes" }))
          .getAllByRole("option")
          .map((option) => option.getAttribute("aria-label"))
      ).toEqual([
        "Grid view",
        "Wall view",
        "Table view",
        "Timeline view",
        "Folder view",
      ]);
    });
  });

  describe("States", () => {
    it("shows the error when the list fails, not while initializing", async () => {
      api.findGalleries.mockRejectedValue(
        new ApiError("Something went wrong", 500)
      );
      renderPage();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Something went wrong"
      );
    });

    it("an initializing 503 shows the sync banner, not the error page", async () => {
      api.findGalleries.mockRejectedValue(
        new ApiError("init", 503, { ready: false })
      );
      renderPage();
      await waitFor(() => expect(api.findGalleries).toHaveBeenCalled());
      expect(screen.getByTestId("sync-banner")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });

    it("shows skeletons while loading, then a card per gallery", async () => {
      let answer: (value: unknown) => void = () => {};
      api.findGalleries.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      renderPage();
      expect(
        (await screen.findAllByTestId("list-skeleton")).length
      ).toBeGreaterThan(0);

      await act(async () => {
        answer(
          galleries([
            { id: "1", title: "Test Gallery" },
            { id: "2", title: "Another Gallery" },
          ])
        );
        await Promise.resolve();
      });
      const cards = await screen.findAllByTestId("gallery-card");
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent("Test Gallery");
    });

    it("shows 'No galleries found' when nothing matches", async () => {
      renderPage("/galleries?q=zzz");
      expect(await screen.findByText("No galleries found")).toBeInTheDocument();
    });
  });

  describe("Folder view", () => {
    it("Back from a folder to the grid drops the folder's tag from the request", async () => {
      api.findTagTree.mockResolvedValue({
        tags: [{ id: "5", instanceId: "a", name: "Five", parents: [] }],
      });
      const { router } = renderListPage(<Galleries />, {
        initialEntries: ["/galleries", "/galleries?view=folder&folderPath=5:a"],
      });

      // Inside the folder: its tag is in the request
      await waitFor(() =>
        expect(sentFilters().at(-1)?.tags).toMatchObject({ value: ["5:a"] })
      );

      listParams.mockClear();
      await act(() => router.navigate(-1));
      await waitFor(() => expect(sentFilters().at(-1)?.tags).toBeUndefined());

      // Not one render after Back asked for the folder's tag
      const afterBack = listParams.mock.calls
        .map((call) => call[0])
        .filter((params) => params !== null)
        .map(galleryFilterOf);
      expect(afterBack.length).toBeGreaterThan(0);
      expect(afterBack.filter((filter) => filter.tags !== undefined)).toEqual(
        []
      );
    });
  });

  describe("Timeline view", () => {
    it("the timeline's period survives a sort change and reaches the request as a date filter", async () => {
      apiGet.mockResolvedValue({
        distribution: [{ period: "2024-05", count: 3 }],
      });
      const { router } = renderPage(
        "/galleries?view=timeline&timeline_period=2024-05"
      );

      const may = {
        modifier: "BETWEEN",
        value: "2024-05-01",
        value2: "2024-05-31",
      };
      await waitFor(() => expect(sentFilters().at(-1)?.date).toEqual(may));

      // The sort's direction button
      fireEvent.click(
        must(
          document.querySelector<HTMLButtonElement>(
            '[data-tv-search-item="sort-direction"] button'
          )
        )
      );

      await waitFor(() =>
        expect(router.state.location.search).toContain("dir=ASC")
      );
      expect(router.state.location.search).toContain("timeline_period=2024-05");
      await waitFor(() =>
        expect(
          (api.findGalleries.mock.lastCall?.[0] as { filter: unknown }).filter
        ).toMatchObject({ direction: "ASC" })
      );
      expect(sentFilters().at(-1)?.date).toEqual(may);
    });

    it("the timeline sends no list request until its period is chosen", async () => {
      let answer: (value: unknown) => void = () => {};
      apiGet.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      const { router } = renderPage("/galleries?view=timeline");

      // The distribution is still loading: no period, no request
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(api.findGalleries).not.toHaveBeenCalled();

      // The latest period is chosen for the user, into the URL by replace
      await act(async () => {
        answer({ distribution: [{ period: "2024-05", count: 3 }] });
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(router.state.location.search).toContain(
          "timeline_period=2024-05"
        )
      );
      expect(router.state.historyAction).toBe("REPLACE");
      await waitFor(() => expect(api.findGalleries).toHaveBeenCalledTimes(1));
      expect(sentFilters()[0]?.date).toEqual({
        modifier: "BETWEEN",
        value: "2024-05-01",
        value2: "2024-05-31",
      });
    });
  });
});
