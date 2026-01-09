// client/src/hooks/__tests__/usePaginatedLightbox.test.jsx
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { usePaginatedLightbox } from "../../src/hooks/usePaginatedLightbox.js";

describe("usePaginatedLightbox", () => {
  describe("internal page state", () => {
    it("uses internal page state when externalPage is not provided", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
        })
      );

      expect(result.current.currentPage).toBe(1);
      expect(result.current.totalPages).toBe(10);
    });

    it("allows changing page via setCurrentPage when using internal state", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
        })
      );

      act(() => {
        result.current.setCurrentPage(5);
      });

      expect(result.current.currentPage).toBe(5);
    });
  });

  describe("external page state", () => {
    it("uses externalPage when provided", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 3,
          onExternalPageChange: vi.fn(),
        })
      );

      expect(result.current.currentPage).toBe(3);
    });

    it("calls onExternalPageChange when setCurrentPage is called with external state", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 1,
          onExternalPageChange,
        })
      );

      act(() => {
        result.current.setCurrentPage(5);
      });

      expect(onExternalPageChange).toHaveBeenCalledWith(5);
    });

    it("updates currentPage when externalPage prop changes", () => {
      const onExternalPageChange = vi.fn();
      const { result, rerender } = renderHook(
        ({ externalPage }) =>
          usePaginatedLightbox({
            perPage: 10,
            totalCount: 100,
            externalPage,
            onExternalPageChange,
          }),
        { initialProps: { externalPage: 1 } }
      );

      expect(result.current.currentPage).toBe(1);

      rerender({ externalPage: 7 });

      expect(result.current.currentPage).toBe(7);
    });

    it("calls both onExternalPageChange and onPageChange when both are provided", () => {
      const onExternalPageChange = vi.fn();
      const onPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 1,
          onExternalPageChange,
          onPageChange,
        })
      );

      act(() => {
        result.current.setCurrentPage(3);
      });

      expect(onExternalPageChange).toHaveBeenCalledWith(3);
      expect(onPageChange).toHaveBeenCalledWith(3);
    });
  });

  describe("page boundary handling", () => {
    it("navigates to next page when crossing forward boundary", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 1,
          onExternalPageChange,
        })
      );

      let handled;
      act(() => {
        handled = result.current.onPageBoundary("next");
      });

      expect(handled).toBe(true);
      expect(onExternalPageChange).toHaveBeenCalledWith(2);
      expect(result.current.isPageTransitioning).toBe(true);
    });

    it("navigates to previous page when crossing backward boundary", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 5,
          onExternalPageChange,
        })
      );

      let handled;
      act(() => {
        handled = result.current.onPageBoundary("prev");
      });

      expect(handled).toBe(true);
      expect(onExternalPageChange).toHaveBeenCalledWith(4);
      expect(result.current.isPageTransitioning).toBe(true);
    });

    it("returns false and does not navigate at first page boundary going backward", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 1,
          onExternalPageChange,
        })
      );

      let handled;
      act(() => {
        handled = result.current.onPageBoundary("prev");
      });

      expect(handled).toBe(false);
      expect(onExternalPageChange).not.toHaveBeenCalled();
    });

    it("returns false and does not navigate at last page boundary going forward", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 10, // last page
          onExternalPageChange,
        })
      );

      let handled;
      act(() => {
        handled = result.current.onPageBoundary("next");
      });

      expect(handled).toBe(false);
      expect(onExternalPageChange).not.toHaveBeenCalled();
    });

    it("onPageBoundary is undefined when there is only one page", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 5, // only 1 page
        })
      );

      expect(result.current.onPageBoundary).toBeUndefined();
    });
  });

  describe("lightbox state", () => {
    it("opens lightbox at specified index", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
        })
      );

      expect(result.current.lightboxOpen).toBe(false);

      act(() => {
        result.current.openLightbox(5);
      });

      expect(result.current.lightboxOpen).toBe(true);
      expect(result.current.lightboxIndex).toBe(5);
      expect(result.current.lightboxAutoPlay).toBe(false);
    });

    it("opens lightbox with autoPlay when specified", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
        })
      );

      act(() => {
        result.current.openLightbox(3, true);
      });

      expect(result.current.lightboxAutoPlay).toBe(true);
    });

    it("closes lightbox", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
        })
      );

      act(() => {
        result.current.openLightbox(5);
      });
      expect(result.current.lightboxOpen).toBe(true);

      act(() => {
        result.current.closeLightbox();
      });
      expect(result.current.lightboxOpen).toBe(false);
    });
  });

  describe("pending navigation", () => {
    it("consumePendingLightboxIndex returns null when no pending navigation", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
        })
      );

      let pendingIndex;
      act(() => {
        pendingIndex = result.current.consumePendingLightboxIndex();
      });

      expect(pendingIndex).toBeNull();
    });

    it("consumePendingLightboxIndex returns target index after page boundary navigation", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 1,
          onExternalPageChange,
        })
      );

      // Trigger page boundary navigation (forward)
      act(() => {
        result.current.onPageBoundary("next");
      });

      expect(result.current.isPageTransitioning).toBe(true);

      // Consume the pending navigation
      let pendingIndex;
      act(() => {
        pendingIndex = result.current.consumePendingLightboxIndex();
      });

      expect(pendingIndex).toBe(0); // First image of next page
      expect(result.current.isPageTransitioning).toBe(false);
    });

    it("sets lightbox index to last image when navigating backward", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 5,
          onExternalPageChange,
        })
      );

      // Trigger page boundary navigation (backward)
      act(() => {
        result.current.onPageBoundary("prev");
      });

      // Consume the pending navigation
      let pendingIndex;
      act(() => {
        pendingIndex = result.current.consumePendingLightboxIndex();
      });

      expect(pendingIndex).toBe(9); // Last image of previous page (perPage - 1)
    });

    it("clears pending navigation after consumption", () => {
      const onExternalPageChange = vi.fn();
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 1,
          onExternalPageChange,
        })
      );

      // Trigger page boundary navigation
      act(() => {
        result.current.onPageBoundary("next");
      });

      // Consume once
      act(() => {
        result.current.consumePendingLightboxIndex();
      });

      // Second consumption should return null
      let secondPendingIndex;
      act(() => {
        secondPendingIndex = result.current.consumePendingLightboxIndex();
      });

      expect(secondPendingIndex).toBeNull();
    });
  });

  describe("pageOffset calculation", () => {
    it("calculates correct pageOffset based on current page and perPage", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 3,
          onExternalPageChange: vi.fn(),
        })
      );

      // Page 3, perPage 10 -> offset should be (3-1) * 10 = 20
      expect(result.current.pageOffset).toBe(20);
    });

    it("pageOffset is 0 for first page", () => {
      const { result } = renderHook(() =>
        usePaginatedLightbox({
          perPage: 10,
          totalCount: 100,
          externalPage: 1,
          onExternalPageChange: vi.fn(),
        })
      );

      expect(result.current.pageOffset).toBe(0);
    });
  });
});
