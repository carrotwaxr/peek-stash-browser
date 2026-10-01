/**
 * The Images page on the list page shell: its states and views, its cards'
 * changes by image and instance, and the lightbox, which pages the list by
 * the list's own page size. The library API is mocked; the controls,
 * pagination, timeline and folder views are the real ones.
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
import Images from "@/components/pages/Images";
import { usePageTitle } from "@/hooks/usePageTitle";
import type * as toastModule from "@/utils/toast";
import { showError } from "@/utils/toast";

type Find = (params: Record<string, unknown>) => Promise<unknown>;

interface CardProps {
  image: Record<string, unknown>;
  onClick?: (image: Record<string, unknown>) => void;
  onHideSuccess?: (id: string, type: string, instanceId: string) => void;
  onOCounterChange?: (id: string, count: number, instanceId: string) => void;
}

const { api, apiGet, cardProps } = vi.hoisted(() => ({
  api: {
    findImages: vi.fn<Find>(),
    findTagTree: vi.fn<() => Promise<unknown>>(),
  },
  apiGet: vi.fn<(url: string) => Promise<unknown>>(),
  cardProps: vi.fn<(props: CardProps) => void>(),
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
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
}));
// Shows itself while the library is initializing (its own test covers when)
vi.mock("@/components/ui/LibraryInitializingBanner", () => ({
  default: () => <div data-testid="sync-banner" />,
}));
/** A card stub: the image's key and fields, and a click that opens it */
vi.mock("@/components/cards/index", () => ({
  ImageCard: (props: CardProps) => {
    cardProps(props);
    const { image } = props;
    return (
      <div
        data-testid="image-card"
        data-key={`${String(image.id)}:${String(image.instanceId)}`}
        data-o={String(image.oCounter)}
        data-rating={String(image.rating100)}
        data-favorite={String(image.favorite)}
      >
        <button onClick={() => props.onClick?.(image)}>
          Open {String(image.title)}
        </button>
      </div>
    );
  },
}));
/**
 * A lightbox stub: its images, a Next that at the last image asks for the
 * next page, and a zoom of its own state (lost if the lightbox remounts)
 */
vi.mock("@/components/ui/Lightbox", async () => {
  const { useState } = await import("react");
  const LightboxStub = (props: {
    isOpen: boolean;
    images: unknown[];
    initialIndex: number;
    onPageBoundary?: (direction: "next" | "prev") => boolean;
  }) => {
    const [zoom, setZoom] = useState(1);
    return (
      <div
        data-testid="lightbox"
        data-is-open={String(props.isOpen)}
        data-index={props.initialIndex}
        data-images={JSON.stringify(props.images)}
      >
        <div
          data-testid="lightbox-zoom"
          style={{ transform: `scale(${zoom})` }}
        />
        <button onClick={() => setZoom((z) => z * 2)}>Lightbox zoom in</button>
        <button
          onClick={() => {
            if (props.initialIndex === props.images.length - 1) {
              props.onPageBoundary?.("next");
            }
          }}
        >
          Lightbox next
        </button>
      </div>
    );
  };
  return { default: LightboxStub };
});
// The lightbox's failure toast and the dropped-image note
vi.mock("@/utils/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof toastModule>()),
  showError: vi.fn(),
  showInfo: vi.fn(),
}));
vi.mock("@/components/wall/WallView", () => ({
  default: (props: { items: unknown[]; playbackMode: string }) => (
    <div
      data-testid="wall-view"
      data-count={props.items.length}
      data-playback={props.playbackMode}
    />
  ),
}));
vi.mock("@/components/table/index", () => ({
  TableView: (props: { items: unknown[] }) => (
    <div data-testid="table-view" data-count={props.items.length} />
  ),
  ColumnConfigPopover: () => <div data-testid="column-config" />,
}));

type Image = Record<string, unknown> & { id: string };

const images = (rows: Image[], count = rows.length) => ({
  findImages: { count, images: rows },
});

const pageOf = (params: Record<string, unknown>) =>
  (params.filter as { page: number }).page;

const renderPage = (url = "/images") =>
  renderListPage(<Images />, { initialEntries: [url] });

const cards = () => screen.queryAllByTestId("image-card");

/** The open image the URL names */
const imageParam = (router: { state: { location: { search: string } } }) =>
  new URLSearchParams(router.state.location.search).get("image");

const twoImages = () =>
  api.findImages.mockResolvedValue(
    images([
      { id: "1", instanceId: "a", title: "First", paths: {}, tags: [] },
      { id: "2", instanceId: "a", title: "Second", paths: {}, tags: [] },
    ])
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.findImages.mockResolvedValue(images([]));
  api.findTagTree.mockResolvedValue({ tags: [] });
  apiGet.mockResolvedValue({ distribution: [] });
});

describe("Images", () => {
  describe("Rendering", () => {
    it("sets page title to 'Images'", () => {
      renderPage();
      expect(usePageTitle).toHaveBeenCalledWith("Images");
    });

    it("shows the heading, its subtitle and the controls", () => {
      renderPage();
      expect(
        screen.getByRole("heading", { name: "Images" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("Browse all images in your library")
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
      api.findImages.mockRejectedValue(
        new ApiError("Something went wrong", 500)
      );
      renderPage();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Something went wrong"
      );
    });

    it("an initializing 503 shows the sync banner, not the error page", async () => {
      api.findImages.mockRejectedValue(
        new ApiError("init", 503, { ready: false })
      );
      renderPage();
      await waitFor(() => expect(api.findImages).toHaveBeenCalled());
      expect(screen.getByTestId("sync-banner")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("grid view shows skeletons, not cards, while loading", async () => {
      api.findImages.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(await screen.findAllByTestId("list-skeleton")).toHaveLength(24);
      expect(cards()).toHaveLength(0);
    });

    it("renders a card per image and the lightbox", async () => {
      twoImages();
      renderPage();
      await waitFor(() => expect(cards()).toHaveLength(2));
      expect(must(cards()[0])).toHaveTextContent("First");
      expect(screen.getByTestId("lightbox")).toBeInTheDocument();
    });

    it("shows 'No images found' when nothing matches", async () => {
      renderPage("/images?q=zzz");
      expect(await screen.findByText("No images found")).toBeInTheDocument();
    });
  });

  describe("Views and lightbox sources", () => {
    it("table view lists the page's images", async () => {
      twoImages();
      renderPage("/images?view=table");
      await waitFor(() =>
        expect(screen.getByTestId("table-view")).toHaveAttribute(
          "data-count",
          "2"
        )
      );
      expect(cards()).toHaveLength(0);
    });

    it("wall view gets the images and the wall playback mode", async () => {
      twoImages();
      renderPage("/images?view=wall");
      await waitFor(() =>
        expect(screen.getByTestId("wall-view")).toHaveAttribute(
          "data-count",
          "2"
        )
      );
      expect(screen.getByTestId("wall-view")).toHaveAttribute(
        "data-playback",
        "autoplay"
      );
    });

    it("timeline view renders a card per image of the period", async () => {
      twoImages();
      apiGet.mockResolvedValue({
        distribution: [{ period: "2024-05", count: 2 }],
      });
      renderPage("/images?view=timeline&timeline_period=2024-05");
      await waitFor(() => expect(cards()).toHaveLength(2));
      expect(
        (api.findImages.mock.lastCall?.[0] as { image_filter: unknown })
          .image_filter
      ).toMatchObject({
        date: {
          modifier: "BETWEEN",
          value: "2024-05-01",
          value2: "2024-05-31",
        },
      });
    });

    it("folder view renders a card per image in the open folder", async () => {
      api.findTagTree.mockResolvedValue({
        tags: [{ id: "5", instanceId: "a", name: "Five", parents: [] }],
      });
      api.findImages.mockResolvedValue(
        images([
          { id: "1", instanceId: "a", title: "First", tags: [{ id: "5" }] },
          { id: "2", instanceId: "a", title: "Second", tags: [{ id: "5" }] },
        ])
      );
      renderPage("/images?view=folder&folderPath=5:a");
      await waitFor(() => expect(cards()).toHaveLength(2));
      expect(
        (api.findImages.mock.lastCall?.[0] as { image_filter: unknown })
          .image_filter
      ).toMatchObject({ tags: { value: ["5:a"] } });
    });

    it("the lightbox asks for an image from the instance it lives on", async () => {
      api.findImages.mockResolvedValue(
        images([
          { id: "7", instanceId: "inst a", oCounter: 3 },
          { id: "8" },
          {
            id: "9",
            instanceId: "b",
            paths: { image: "/full", preview: "/pv", thumbnail: "/th" },
          },
        ])
      );
      renderPage();
      await waitFor(() => expect(cards()).toHaveLength(3));
      const sources = JSON.parse(
        screen.getByTestId("lightbox").getAttribute("data-images") ?? "[]"
      ) as { paths: Record<string, string | undefined>; oCounter: number }[];
      expect(sources[0]?.paths).toEqual({
        image: "/api/proxy/image/7/image?instanceId=inst%20a",
        thumbnail: "/api/proxy/image/7/thumbnail?instanceId=inst%20a",
      });
      expect(sources[0]?.oCounter).toBe(3);
      // No instance known: the path carries none, never an empty one
      expect(sources[1]?.paths.image).toBe("/api/proxy/image/8/image");
      expect(sources[1]?.paths.thumbnail).toBe("/api/proxy/image/8/thumbnail");
      expect(sources[1]?.oCounter).toBe(0);
      // Paths the server sent are kept as they are
      expect(sources[2]?.paths).toEqual({
        image: "/full",
        preview: "/pv",
        thumbnail: "/th",
      });
    });
  });

  describe("The lightbox", () => {
    it("every card gets the page's one click handler, not a closure per card", async () => {
      twoImages();
      renderPage();
      await waitFor(() => expect(cards()).toHaveLength(2));
      const handlers = new Set(
        cardProps.mock.calls.map((call) => call[0].onClick)
      );
      expect(handlers.size).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
      const lightbox = screen.getByTestId("lightbox");
      expect(lightbox).toHaveAttribute("data-is-open", "true");
      expect(lightbox).toHaveAttribute("data-index", "1");
    });

    it("with a default preset of 48 per page, Next on the 40th of 40 images does not open an empty page 2", async () => {
      const forty = Array.from({ length: 40 }, (_, i) => ({
        id: String(i + 1),
        instanceId: "a",
        title: `Image ${i + 1}`,
      }));
      api.findImages.mockImplementation((params) =>
        Promise.resolve(images(pageOf(params) === 1 ? forty : [], 40))
      );
      const { router } = renderListPage(<Images />, {
        initialEntries: ["/images"],
        presets: {
          image: [
            {
              id: "big",
              name: "Big pages",
              filters: {},
              sort: "created_at",
              direction: "DESC",
              perPage: 48,
            },
          ],
        },
        defaultPresets: { image: "big" },
      });
      await waitFor(() => expect(cards()).toHaveLength(40));

      fireEvent.click(screen.getByRole("button", { name: "Open Image 40" }));
      const lightbox = screen.getByTestId("lightbox");
      expect(lightbox).toHaveAttribute("data-index", "39");
      fireEvent.click(
        within(lightbox).getByRole("button", { name: "Lightbox next" })
      );

      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(router.state.location.search).not.toContain("page=2");
      expect(
        api.findImages.mock.calls.map((call) => pageOf(call[0]))
      ).not.toContain(2);
    });

    it("Next on the last image of a full page opens the next page by replace", async () => {
      const page = (n: number) =>
        Array.from({ length: 24 }, (_, i) => ({
          id: String((n - 1) * 24 + i + 1),
          instanceId: "a",
          title: `Image ${(n - 1) * 24 + i + 1}`,
        }));
      api.findImages.mockImplementation((params) =>
        Promise.resolve(images(page(pageOf(params)), 48))
      );
      const { router } = renderPage();
      await waitFor(() => expect(cards()).toHaveLength(24));

      fireEvent.click(screen.getByRole("button", { name: "Open Image 24" }));
      fireEvent.click(
        within(screen.getByTestId("lightbox")).getByRole("button", {
          name: "Lightbox next",
        })
      );

      await waitFor(() =>
        expect(router.state.location.search).toContain("page=2")
      );
      expect(router.state.historyAction).toBe("REPLACE");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Open Image 25" })
        ).toBeInTheDocument()
      );
      // The lightbox stays open on the new page's first image, which the
      // URL names in place of page 1's last
      expect(screen.getByTestId("lightbox")).toHaveAttribute("data-index", "0");
      expect(screen.getByTestId("lightbox")).toHaveAttribute(
        "data-is-open",
        "true"
      );
      await waitFor(() => expect(imageParam(router)).toBe("25:a"));
      expect(router.state.historyAction).toBe("REPLACE");
    });

    it("a failed next page returns the lightbox to the image it showed, on its page", async () => {
      const first = Array.from({ length: 24 }, (_, i) => ({
        id: String(i + 1),
        instanceId: "a",
        title: `Image ${i + 1}`,
      }));
      api.findImages.mockImplementation((params) =>
        pageOf(params) === 1
          ? Promise.resolve(images(first, 48))
          : Promise.reject(new Error("The server is down"))
      );
      const { router } = renderPage();
      await waitFor(() => expect(cards()).toHaveLength(24));

      fireEvent.click(screen.getByRole("button", { name: "Open Image 24" }));
      fireEvent.click(
        within(screen.getByTestId("lightbox")).getByRole("button", {
          name: "Lightbox next",
        })
      );
      await waitFor(() =>
        expect(
          api.findImages.mock.calls.map((call) => pageOf(call[0]))
        ).toContain(2)
      );

      await waitFor(() =>
        expect(
          new URLSearchParams(router.state.location.search).get("page")
        ).toBeNull()
      );
      await waitFor(() => expect(cards()).toHaveLength(24));
      const lightbox = screen.getByTestId("lightbox");
      expect(lightbox).toHaveAttribute("data-is-open", "true");
      expect(lightbox).toHaveAttribute("data-index", "23");
      expect(imageParam(router)).toBe("24:a");
    });

    it("a lightbox crossing to a page that fails never renders the error page, keeps the same Lightbox element (zoom kept), returns to the image it left and toasts", async () => {
      const first = Array.from({ length: 24 }, (_, i) => ({
        id: String(i + 1),
        instanceId: "a",
        title: `Image ${i + 1}`,
      }));
      let failPage2: (error: Error) => void = () => {};
      api.findImages.mockImplementation((params) =>
        pageOf(params) === 1
          ? Promise.resolve(images(first, 48))
          : new Promise((_, reject) => {
              failPage2 = reject;
            })
      );
      const { router } = renderPage();
      await waitFor(() => expect(cards()).toHaveLength(24));

      fireEvent.click(screen.getByRole("button", { name: "Open Image 24" }));
      const lightbox = screen.getByTestId("lightbox");
      fireEvent.click(
        within(lightbox).getByRole("button", { name: "Lightbox zoom in" })
      );
      expect(screen.getByTestId("lightbox-zoom").style.transform).toBe(
        "scale(2)"
      );
      fireEvent.click(
        within(lightbox).getByRole("button", { name: "Lightbox next" })
      );
      await waitFor(() =>
        expect(
          api.findImages.mock.calls.map((call) => pageOf(call[0]))
        ).toContain(2)
      );

      // Record any error page shown while the failure settles
      let errorPageShown = false;
      const observer = new MutationObserver(() => {
        if (screen.queryByRole("alert")) errorPageShown = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });
      await act(async () => {
        failPage2(new Error("The server is down"));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      await waitFor(() =>
        expect(
          new URLSearchParams(router.state.location.search).get("page")
        ).toBeNull()
      );
      await waitFor(() => expect(cards()).toHaveLength(24));
      observer.disconnect();

      expect(errorPageShown).toBe(false);
      expect(screen.getByTestId("lightbox")).toBe(lightbox);
      expect(screen.getByTestId("lightbox-zoom").style.transform).toBe(
        "scale(2)"
      );
      expect(lightbox).toHaveAttribute("data-is-open", "true");
      expect(lightbox).toHaveAttribute("data-index", "23");
      expect(imageParam(router)).toBe("24:a");
      expect(vi.mocked(showError)).toHaveBeenCalledWith(
        expect.stringContaining("The server is down")
      );
    });

    it("with the lightbox closed, a failed page still shows the error page", async () => {
      api.findImages.mockImplementation((params) =>
        pageOf(params) === 1
          ? Promise.resolve(images([{ id: "1", instanceId: "a" }], 48))
          : Promise.reject(new ApiError("Page two is down", 500))
      );
      const { router } = renderPage();
      await waitFor(() => expect(cards()).toHaveLength(1));

      await act(async () => {
        await router.navigate("/images?page=2");
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Page two is down"
      );
    });

    it("opening an image names it in the URL and Back closes the lightbox", async () => {
      twoImages();
      const { router } = renderPage("/images?page=1");
      await waitFor(() => expect(cards()).toHaveLength(2));

      fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
      await waitFor(() => expect(imageParam(router)).toBe("2:a"));
      expect(router.state.historyAction).toBe("PUSH");

      await act(async () => {
        await router.navigate(-1);
      });
      expect(screen.getByTestId("lightbox")).toHaveAttribute(
        "data-is-open",
        "false"
      );
      expect(router.state.location.pathname).toBe("/images");
      expect(router.state.location.search).toBe("?page=1");
    });

    it("an address naming an image opens the lightbox on it", async () => {
      twoImages();
      renderPage("/images?image=2%3Aa");

      await waitFor(() =>
        expect(screen.getByTestId("lightbox")).toHaveAttribute(
          "data-is-open",
          "true"
        )
      );
      expect(screen.getByTestId("lightbox")).toHaveAttribute("data-index", "1");
    });
  });

  describe("Changes from a card", () => {
    /** Two images with one id, one on each server */
    const sharedId = () =>
      api.findImages.mockResolvedValue(
        images([
          { id: "5", instanceId: "a", title: "On A", oCounter: 0 },
          { id: "5", instanceId: "b", title: "On B", oCounter: 0 },
        ])
      );

    const card = (key: string) =>
      must(
        cards().find((el) => el.getAttribute("data-key") === key),
        `the card ${key}`
      );

    /** The props the last card rendered with */
    const lastCard = () => must(cardProps.mock.lastCall, "a card")[0];

    it("an O change reaches only the image on that instance", async () => {
      sharedId();
      renderPage();
      await waitFor(() => expect(cards()).toHaveLength(2));

      act(() =>
        must(lastCard().onOCounterChange, "onOCounterChange")("5", 4, "b")
      );
      await waitFor(() => expect(card("5:b")).toHaveAttribute("data-o", "4"));
      expect(card("5:a")).toHaveAttribute("data-o", "0");
    });

    it("a hide drops only the image on that instance", async () => {
      sharedId();
      renderPage();
      await waitFor(() => expect(cards()).toHaveLength(2));

      act(() =>
        must(lastCard().onHideSuccess, "onHideSuccess")("5", "image", "a")
      );

      await waitFor(() => expect(cards()).toHaveLength(1));
      expect(card("5:b")).toBeInTheDocument();
      expect(
        screen.getAllByText("Showing 1-1 of 1 records").length
      ).toBeGreaterThan(0);
    });
  });
});
