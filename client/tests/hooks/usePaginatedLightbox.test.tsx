import { type ReactNode, useCallback, useMemo } from "react";
import {
  type Location,
  NavigationType,
  Router,
  type To,
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createRouterWrapper, must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type PageChangeOptions,
  usePaginatedLightbox,
} from "../../src/hooks/usePaginatedLightbox";
import { showError, showInfo } from "../../src/utils/toast";

vi.mock("../../src/utils/toast", () => ({
  showError: vi.fn(),
  showInfo: vi.fn(),
}));

type Options = Parameters<typeof usePaginatedLightbox>[0];

/** The hook in a router, with the address and the last navigation's kind */
const renderLightbox = (initialProps: Options, entry = "/images") =>
  renderHook(
    (props: Options) => ({
      lightbox: usePaginatedLightbox(props),
      location: useLocation(),
      navigationType: useNavigationType(),
      navigate: useNavigate(),
    }),
    { initialProps, wrapper: createRouterWrapper([entry]) }
  );

type Rendered = ReturnType<typeof renderLightbox>["result"];

const imageParam = (result: Rendered) =>
  new URLSearchParams(result.current.location.search).get("image");

/** Page `n` of `perPage` images on one instance, ids counting from 1 */
const pageOf = (n: number, perPage = 10, instanceId = "inst-a") =>
  Array.from({ length: perPage }, (_, i) => ({
    id: String((n - 1) * perPage + i + 1),
    instanceId,
  }));

/**
 * The hook as a page uses it: the page is the URL's `page` (a replace when
 * the lightbox asks for one) and the images are that page's, 3 pages of 10
 */
const renderUrlPagedLightbox = (entries: string[]) =>
  renderHook(
    () => {
      const [searchParams, setSearchParams] = useSearchParams();
      const page = Number(searchParams.get("page") ?? "1");
      const onExternalPageChange = useCallback(
        (next: number, options?: PageChangeOptions) =>
          setSearchParams(
            (prev) => {
              const params = new URLSearchParams(prev);
              params.set("page", String(next));
              return params;
            },
            { replace: options?.replace === true }
          ),
        [setSearchParams]
      );
      const images = useMemo(() => pageOf(page), [page]);
      return {
        lightbox: usePaginatedLightbox({
          perPage: 10,
          totalCount: 30,
          externalPage: page,
          onExternalPageChange,
          images,
        }),
        location: useLocation(),
        navigationType: useNavigationType(),
        navigate: useNavigate(),
      };
    },
    { wrapper: createRouterWrapper(entries) }
  );

type UrlPaged = ReturnType<typeof renderUrlPagedLightbox>["result"];

const search = (result: UrlPaged) =>
  new URLSearchParams(result.current.location.search);

describe("usePaginatedLightbox", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("internal page state", () => {
    it("uses internal page state when externalPage is not provided", () => {
      const { result } = renderLightbox({ perPage: 10, totalCount: 100 });

      expect(result.current.lightbox.currentPage).toBe(1);
      expect(result.current.lightbox.totalPages).toBe(10);
    });

    it("allows changing page via setCurrentPage when using internal state", () => {
      const { result } = renderLightbox({ perPage: 10, totalCount: 100 });

      act(() => {
        result.current.lightbox.setCurrentPage(5);
      });

      expect(result.current.lightbox.currentPage).toBe(5);
    });
  });

  describe("external page state", () => {
    it("uses externalPage when provided", () => {
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 3,
        onExternalPageChange: vi.fn(),
      });

      expect(result.current.lightbox.currentPage).toBe(3);
    });

    it("calls onExternalPageChange when setCurrentPage is called with external state", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 1,
        onExternalPageChange,
      });

      act(() => {
        result.current.lightbox.setCurrentPage(5);
      });

      expect(onExternalPageChange).toHaveBeenCalledWith(5);
    });

    it("updates currentPage when externalPage prop changes", () => {
      const onExternalPageChange = vi.fn();
      const props = {
        perPage: 10,
        totalCount: 100,
        externalPage: 1,
        onExternalPageChange,
      };
      const { result, rerender } = renderLightbox(props);

      expect(result.current.lightbox.currentPage).toBe(1);

      rerender({ ...props, externalPage: 7 });

      expect(result.current.lightbox.currentPage).toBe(7);
    });

    it("calls both onExternalPageChange and onPageChange when both are provided", () => {
      const onExternalPageChange = vi.fn();
      const onPageChange = vi.fn();
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 1,
        onExternalPageChange,
        onPageChange,
      });

      act(() => {
        result.current.lightbox.setCurrentPage(3);
      });

      expect(onExternalPageChange).toHaveBeenCalledWith(3);
      expect(onPageChange).toHaveBeenCalledWith(3);
    });
  });

  describe("page boundary handling", () => {
    it("navigates to next page when crossing forward boundary", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 1,
        onExternalPageChange,
      });

      let handled = false;
      act(() => {
        handled = result.current.lightbox.onPageBoundary("next");
      });

      expect(handled).toBe(true);
      expect(onExternalPageChange).toHaveBeenCalledWith(2, { replace: true });
      expect(result.current.lightbox.isPageTransitioning).toBe(true);
    });

    it("navigates to previous page when crossing backward boundary", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 5,
        onExternalPageChange,
      });

      let handled = false;
      act(() => {
        handled = result.current.lightbox.onPageBoundary("prev");
      });

      expect(handled).toBe(true);
      expect(onExternalPageChange).toHaveBeenCalledWith(4, { replace: true });
      expect(result.current.lightbox.isPageTransitioning).toBe(true);
    });

    it("returns false and does not navigate at first page boundary going backward", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 1,
        onExternalPageChange,
      });

      let handled = true;
      act(() => {
        handled = result.current.lightbox.onPageBoundary("prev");
      });

      expect(handled).toBe(false);
      expect(onExternalPageChange).not.toHaveBeenCalled();
    });

    it("returns false and does not navigate at last page boundary going forward", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 10, // last page
        onExternalPageChange,
      });

      let handled = true;
      act(() => {
        handled = result.current.lightbox.onPageBoundary("next");
      });

      expect(handled).toBe(false);
      expect(onExternalPageChange).not.toHaveBeenCalled();
    });

    it("onPageBoundary is a no-op when there is only one page", () => {
      const { result } = renderLightbox({ perPage: 10, totalCount: 5 });

      expect(result.current.lightbox.onPageBoundary("next")).toBe(false);
    });

    it("a boundary crossing does not scroll the grid", () => {
      const scrollTo = vi
        .spyOn(window, "scrollTo")
        .mockImplementation(() => undefined);
      const scrollIntoView = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => undefined);
      const onExternalPageChange = vi.fn();
      const props = {
        perPage: 10,
        totalCount: 30,
        externalPage: 2,
        onExternalPageChange,
        images: pageOf(2),
      };
      const { result, rerender } = renderLightbox(props, "/images?page=2");

      act(() => {
        result.current.lightbox.openLightbox(9);
      });
      act(() => {
        result.current.lightbox.onPageBoundary("next");
      });
      rerender({ ...props, externalPage: 3, images: pageOf(3) });
      act(() => {
        result.current.lightbox.consumePendingLightboxIndex();
      });
      act(() => {
        result.current.lightbox.onPageBoundary("prev");
      });

      // The page is replaced, not pushed: no new history entry, and the
      // grid behind the lightbox keeps its place
      expect(onExternalPageChange.mock.calls).toEqual([
        [3, { replace: true }],
        [2, { replace: true }],
      ]);
      expect(scrollTo).not.toHaveBeenCalled();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe("the open image in the URL", () => {
    it("opening image 3 pushes image=<key>; browsing replaces it; closing removes it", () => {
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 10,
        images: pageOf(1),
      });

      act(() => {
        result.current.lightbox.openLightbox(3);
      });
      expect(result.current.lightbox.lightboxOpen).toBe(true);
      expect(result.current.lightbox.lightboxIndex).toBe(3);
      expect(imageParam(result)).toBe("4:inst-a");
      expect(result.current.navigationType).toBe("PUSH");

      // The lightbox reports its index on open: the same image writes nothing
      act(() => {
        result.current.lightbox.onIndexChange(3);
      });
      expect(result.current.navigationType).toBe("PUSH");

      act(() => {
        result.current.lightbox.onIndexChange(4);
      });
      expect(imageParam(result)).toBe("5:inst-a");
      expect(result.current.navigationType).toBe("REPLACE");
      expect(result.current.lightbox.lightboxOpen).toBe(true);

      act(() => {
        result.current.lightbox.closeLightbox();
      });
      expect(result.current.lightbox.lightboxOpen).toBe(false);
      expect(imageParam(result)).toBeNull();
      // Opened by its own push, it closes by going back over that entry
      expect(result.current.navigationType).toBe("POP");
    });

    it("Back closes the lightbox and stays on the page", () => {
      const { result } = renderLightbox(
        { perPage: 10, totalCount: 10, images: pageOf(1) },
        "/images?sort=title"
      );

      act(() => {
        result.current.lightbox.openLightbox(3);
      });
      act(() => {
        result.current.lightbox.onIndexChange(6);
      });
      act(() => {
        void result.current.navigate(-1);
      });

      expect(result.current.lightbox.lightboxOpen).toBe(false);
      expect(result.current.location.pathname).toBe("/images");
      expect(result.current.location.search).toBe("?sort=title");
    });

    it("a Back that lands before the open's own entry rendered still closes it", () => {
      // BrowserRouter renders a navigation as a transition, so a Back can
      // land before the open's own entry was ever rendered; the pop then
      // brings a new location object for the entry the hook already saw
      const entry = (): Location => ({
        pathname: "/images",
        search: "?sort=title",
        hash: "",
        state: null,
        key: "k0",
      });
      const navigator = {
        createHref: (to: To) => (typeof to === "string" ? to : "/images"),
        go: vi.fn(),
        push: vi.fn(),
        replace: vi.fn(),
      };
      let shown = { location: entry(), type: NavigationType.Push };
      const { result, rerender } = renderHook(
        () => usePaginatedLightbox({ perPage: 10, images: pageOf(1) }),
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <Router
              location={shown.location}
              navigationType={shown.type}
              navigator={navigator}
            >
              {children}
            </Router>
          ),
        }
      );

      act(() => {
        result.current.openLightbox(3);
      });
      expect(navigator.push).toHaveBeenCalledTimes(1);
      expect(result.current.lightboxOpen).toBe(true);

      shown = { location: entry(), type: NavigationType.Pop };
      rerender();

      expect(result.current.lightboxOpen).toBe(false);
    });

    it("a reload with image=<key> opens the lightbox on that image", () => {
      const props = { perPage: 10, totalCount: 20, externalPage: 2 };
      const { result, rerender } = renderLightbox(
        { ...props, images: [], ready: false },
        "/images?page=2&image=13%3Ainst-b"
      );
      expect(result.current.lightbox.lightboxOpen).toBe(false);

      // Two servers hold id 13: the address names the one on inst-b
      const images = [
        ...pageOf(2).slice(0, 5),
        { id: "13", instanceId: "inst-b" },
      ];
      rerender({ ...props, images, ready: false });
      expect(result.current.lightbox.lightboxOpen).toBe(false);

      rerender({ ...props, images, ready: true });
      expect(result.current.lightbox.lightboxOpen).toBe(true);
      expect(result.current.lightbox.lightboxIndex).toBe(5);
      expect(imageParam(result)).toBe("13:inst-b");
    });

    it("an image param not among the loaded page's images, once ready, is removed with a replace and an info toast says the image is not on this page", () => {
      vi.mocked(showInfo).mockClear();
      const { result } = renderLightbox(
        { perPage: 10, totalCount: 20, images: pageOf(1), ready: true },
        "/images?sort=title&image=99%3Ainst-a"
      );

      expect(result.current.lightbox.lightboxOpen).toBe(false);
      expect(imageParam(result)).toBeNull();
      expect(result.current.location.search).toBe("?sort=title");
      expect(result.current.navigationType).toBe("REPLACE");
      expect(vi.mocked(showInfo)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(showInfo)).toHaveBeenCalledWith(
        "That image isn't on this page of the list."
      );
    });

    it("an image param not on the loaded page opens the viewer on that image alone after one by-id read", async () => {
      vi.mocked(showInfo).mockClear();
      const solo = { id: "25", instanceId: "inst-a" };
      const fetchImage = vi.fn().mockResolvedValue(solo);
      const { result } = renderLightbox(
        {
          perPage: 10,
          totalCount: 30,
          externalPage: 1,
          onExternalPageChange: vi.fn(),
          images: pageOf(1),
          ready: true,
          fetchImage,
        },
        "/images?image=25%3Ainst-a"
      );

      await waitFor(() =>
        expect(result.current.lightbox.lightboxOpen).toBe(true)
      );
      expect(fetchImage).toHaveBeenCalledTimes(1);
      expect(must(fetchImage.mock.calls[0], "the read")[0]).toBe("25:inst-a");
      expect(result.current.lightbox.soloImage).toEqual(solo);
      expect(result.current.lightbox.lightboxIndex).toBe(0);
      expect(imageParam(result)).toBe("25:inst-a");

      // Alone: no crossing into the list, and the page's first image is
      // never named for it
      expect(result.current.lightbox.onPageBoundary("next")).toBe(false);
      act(() => {
        result.current.lightbox.onIndexChange(0);
      });
      expect(imageParam(result)).toBe("25:inst-a");
      expect(vi.mocked(showInfo)).not.toHaveBeenCalled();

      // Closing (opened from its address) removes the param by replace
      act(() => {
        result.current.lightbox.closeLightbox();
      });
      expect(result.current.lightbox.lightboxOpen).toBe(false);
      expect(result.current.lightbox.soloImage).toBeNull();
      expect(imageParam(result)).toBeNull();
      expect(result.current.navigationType).toBe("REPLACE");
    });

    it("an image param the by-id read does not find is removed with a replace and says the image is no longer available", async () => {
      vi.mocked(showError).mockClear();
      vi.mocked(showInfo).mockClear();
      const fetchImage = vi.fn().mockResolvedValue(null);
      const { result } = renderLightbox(
        {
          perPage: 10,
          totalCount: 30,
          images: pageOf(1),
          ready: true,
          fetchImage,
        },
        "/images?sort=title&image=99%3Ainst-a"
      );

      await waitFor(() => expect(imageParam(result)).toBeNull());
      expect(fetchImage).toHaveBeenCalledTimes(1);
      expect(result.current.location.search).toBe("?sort=title");
      expect(result.current.navigationType).toBe("REPLACE");
      expect(result.current.lightbox.lightboxOpen).toBe(false);
      expect(vi.mocked(showError)).toHaveBeenCalledWith(
        "That image is no longer available"
      );
      expect(vi.mocked(showInfo)).not.toHaveBeenCalled();
    });

    it("while not ready it waits: an image param not among the images is kept", () => {
      vi.mocked(showInfo).mockClear();
      const props = { perPage: 10, totalCount: 20, externalPage: 2 };
      const { result, rerender } = renderLightbox(
        { ...props, images: [], ready: false },
        "/images?page=2&image=13%3Ainst-a"
      );
      rerender({ ...props, images: pageOf(1), ready: false });

      expect(imageParam(result)).toBe("13:inst-a");
      expect(result.current.lightbox.lightboxOpen).toBe(false);
      expect(vi.mocked(showInfo)).not.toHaveBeenCalled();
    });

    it("with the page loading (placeholder rows of the last page) it does not drop the param", () => {
      vi.mocked(showInfo).mockClear();
      const props = { perPage: 10, totalCount: 20, externalPage: 2 };
      // The list shows the last page's rows while page 2 loads: not ready
      const { result, rerender } = renderLightbox(
        { ...props, images: pageOf(1), ready: false },
        "/images?page=2&image=13%3Ainst-a"
      );
      expect(imageParam(result)).toBe("13:inst-a");
      expect(vi.mocked(showInfo)).not.toHaveBeenCalled();

      rerender({ ...props, images: pageOf(2), ready: true });
      expect(result.current.lightbox.lightboxOpen).toBe(true);
      expect(result.current.lightbox.lightboxIndex).toBe(2);
      expect(imageParam(result)).toBe("13:inst-a");
      expect(vi.mocked(showInfo)).not.toHaveBeenCalled();
    });

    it("holding Right across a boundary lands on the new page's first image", () => {
      const onExternalPageChange = vi.fn();
      const props = {
        perPage: 10,
        totalCount: 30,
        externalPage: 1,
        onExternalPageChange,
        images: pageOf(1),
      };
      const { result, rerender } = renderLightbox(props);

      act(() => {
        result.current.lightbox.openLightbox(9);
      });
      act(() => {
        result.current.lightbox.onPageBoundary("next");
      });
      rerender({ ...props, externalPage: 2 });

      // Key repeat while page 2 loads moves the lightbox within page 1's
      // images: none of them is written as the open image
      act(() => {
        result.current.lightbox.onIndexChange(1);
      });
      expect(imageParam(result)).toBe("10:inst-a");

      const transitionKey = result.current.lightbox.transitionKey;
      rerender({ ...props, externalPage: 2, images: pageOf(2) });
      act(() => {
        result.current.lightbox.consumePendingLightboxIndex();
      });

      // The lightbox is reset to the first image even though its index is
      // already 0 from the crossing
      expect(result.current.lightbox.lightboxIndex).toBe(0);
      expect(result.current.lightbox.transitionKey).toBeGreaterThan(
        transitionKey
      );
      expect(result.current.lightbox.isPageTransitioning).toBe(false);
      expect(result.current.lightbox.lightboxOpen).toBe(true);
      expect(imageParam(result)).toBe("11:inst-a");
      expect(result.current.navigationType).toBe("REPLACE");
    });
  });

  describe("closing leaves no dead Back step", () => {
    it("closing a lightbox opened from the grid goes back: one more Back leaves the list", () => {
      const { result } = renderUrlPagedLightbox(["/other", "/images"]);

      act(() => {
        result.current.lightbox.openLightbox(3);
      });
      act(() => {
        result.current.lightbox.onIndexChange(4);
      });
      act(() => {
        result.current.lightbox.closeLightbox();
      });
      expect(result.current.lightbox.lightboxOpen).toBe(false);
      expect(result.current.location.pathname).toBe("/images");
      expect(search(result).get("image")).toBeNull();

      act(() => {
        void result.current.navigate(-1);
      });
      expect(result.current.location.pathname).toBe("/other");
    });

    it("closing after a boundary crossing shows the last image's page", () => {
      const { result } = renderUrlPagedLightbox(["/other", "/images"]);

      act(() => {
        result.current.lightbox.openLightbox(9);
      });
      act(() => {
        result.current.lightbox.onPageBoundary("next");
      });
      act(() => {
        result.current.lightbox.consumePendingLightboxIndex();
      });
      expect(search(result).get("image")).toBe("11:inst-a");

      act(() => {
        result.current.lightbox.closeLightbox();
      });
      expect(result.current.location.pathname).toBe("/images");
      expect(search(result).get("page")).toBe("2");
      expect(search(result).get("image")).toBeNull();
      expect(result.current.lightbox.lightboxOpen).toBe(false);

      act(() => {
        void result.current.navigate(-1);
      });
      expect(result.current.location.pathname).toBe("/other");
    });

    it("Back after a boundary crossing also shows the last image's page", () => {
      const { result } = renderUrlPagedLightbox(["/other", "/images"]);

      act(() => {
        result.current.lightbox.openLightbox(9);
      });
      act(() => {
        result.current.lightbox.onPageBoundary("next");
      });
      act(() => {
        result.current.lightbox.consumePendingLightboxIndex();
      });
      act(() => {
        void result.current.navigate(-1);
      });

      expect(result.current.lightbox.lightboxOpen).toBe(false);
      expect(result.current.location.pathname).toBe("/images");
      expect(search(result).get("page")).toBe("2");
      expect(search(result).get("image")).toBeNull();
    });

    it("a lightbox opened from its address closes by replace", () => {
      const { result } = renderUrlPagedLightbox([
        "/other",
        "/images?image=4%3Ainst-a",
      ]);
      expect(result.current.lightbox.lightboxOpen).toBe(true);

      act(() => {
        result.current.lightbox.closeLightbox();
      });
      expect(result.current.location.pathname).toBe("/images");
      expect(search(result).get("image")).toBeNull();
      expect(result.current.navigationType).toBe("REPLACE");

      act(() => {
        void result.current.navigate(-1);
      });
      expect(result.current.location.pathname).toBe("/other");
    });
  });

  describe("a failed page during a crossing", () => {
    it("returns to the last image shown and its page, and says why", () => {
      const { result } = renderUrlPagedLightbox(["/images"]);

      act(() => {
        result.current.lightbox.openLightbox(9);
      });
      act(() => {
        result.current.lightbox.onPageBoundary("next");
      });
      expect(search(result).get("page")).toBe("2");
      const transitionKey = result.current.lightbox.transitionKey;

      let failed = false;
      act(() => {
        failed = result.current.lightbox.failPendingPage(
          new Error("The server is down")
        );
      });

      expect(failed).toBe(true);
      expect(result.current.lightbox.isPageTransitioning).toBe(false);
      expect(result.current.lightbox.lightboxOpen).toBe(true);
      expect(result.current.lightbox.lightboxIndex).toBe(9);
      expect(result.current.lightbox.transitionKey).toBeGreaterThan(
        transitionKey
      );
      expect(search(result).get("page")).toBe("1");
      expect(search(result).get("image")).toBe("10:inst-a");
      expect(result.current.navigationType).toBe("REPLACE");
      expect(vi.mocked(showError)).toHaveBeenCalledTimes(1);
      expect(
        String(must(vi.mocked(showError).mock.calls[0], "the toast")[0])
      ).toContain("The server is down");

      // Nothing was pending any more: a later failure is not the crossing's
      act(() => {
        failed = result.current.lightbox.failPendingPage(new Error("again"));
      });
      expect(failed).toBe(false);
      expect(vi.mocked(showError)).toHaveBeenCalledTimes(1);
    });
  });

  describe("lightbox state", () => {
    it("opens lightbox at specified index", () => {
      const { result } = renderLightbox({ perPage: 10, totalCount: 100 });

      expect(result.current.lightbox.lightboxOpen).toBe(false);

      act(() => {
        result.current.lightbox.openLightbox(5);
      });

      expect(result.current.lightbox.lightboxOpen).toBe(true);
      expect(result.current.lightbox.lightboxIndex).toBe(5);
      expect(result.current.lightbox.lightboxAutoPlay).toBe(false);
    });

    it("opens lightbox with autoPlay when specified", () => {
      const { result } = renderLightbox({ perPage: 10, totalCount: 100 });

      act(() => {
        result.current.lightbox.openLightbox(3, true);
      });

      expect(result.current.lightbox.lightboxAutoPlay).toBe(true);
    });

    it("closes lightbox", () => {
      const { result } = renderLightbox({ perPage: 10, totalCount: 100 });

      act(() => {
        result.current.lightbox.openLightbox(5);
      });
      expect(result.current.lightbox.lightboxOpen).toBe(true);

      act(() => {
        result.current.lightbox.closeLightbox();
      });
      expect(result.current.lightbox.lightboxOpen).toBe(false);
    });
  });

  describe("pending navigation", () => {
    it("consumePendingLightboxIndex returns null when no pending navigation", () => {
      const { result } = renderLightbox({ perPage: 10, totalCount: 100 });

      let pendingIndex: number | null = -1;
      act(() => {
        pendingIndex = result.current.lightbox.consumePendingLightboxIndex();
      });

      expect(pendingIndex).toBeNull();
    });

    it("consumePendingLightboxIndex returns target index after page boundary navigation", () => {
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 1,
        onExternalPageChange: vi.fn(),
      });

      act(() => {
        result.current.lightbox.onPageBoundary("next");
      });

      expect(result.current.lightbox.isPageTransitioning).toBe(true);

      let pendingIndex: number | null = null;
      act(() => {
        pendingIndex = result.current.lightbox.consumePendingLightboxIndex();
      });

      expect(pendingIndex).toBe(0); // First image of next page
      expect(result.current.lightbox.isPageTransitioning).toBe(false);
    });

    it("sets lightbox index to last image when navigating backward", () => {
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 5,
        onExternalPageChange: vi.fn(),
      });

      act(() => {
        result.current.lightbox.onPageBoundary("prev");
      });

      let pendingIndex: number | null = null;
      act(() => {
        pendingIndex = result.current.lightbox.consumePendingLightboxIndex();
      });

      expect(pendingIndex).toBe(9); // Last image of previous page (perPage - 1)
    });

    it("clears pending navigation after consumption", () => {
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 1,
        onExternalPageChange: vi.fn(),
      });

      act(() => {
        result.current.lightbox.onPageBoundary("next");
      });
      act(() => {
        result.current.lightbox.consumePendingLightboxIndex();
      });

      let secondPendingIndex: number | null = -1;
      act(() => {
        secondPendingIndex =
          result.current.lightbox.consumePendingLightboxIndex();
      });

      expect(secondPendingIndex).toBeNull();
    });
  });

  describe("pageOffset calculation", () => {
    it("calculates correct pageOffset based on current page and perPage", () => {
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 3,
        onExternalPageChange: vi.fn(),
      });

      // Page 3, perPage 10 -> offset should be (3-1) * 10 = 20
      expect(result.current.lightbox.pageOffset).toBe(20);
    });

    it("pageOffset is 0 for first page", () => {
      const { result } = renderLightbox({
        perPage: 10,
        totalCount: 100,
        externalPage: 1,
        onExternalPageChange: vi.fn(),
      });

      expect(result.current.lightbox.pageOffset).toBe(0);
    });
  });
});
