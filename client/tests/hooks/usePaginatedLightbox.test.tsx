import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { act, renderHook } from "@testing-library/react";
import { createRouterWrapper } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePaginatedLightbox } from "../../src/hooks/usePaginatedLightbox";

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
      expect(result.current.navigationType).toBe("REPLACE");
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
