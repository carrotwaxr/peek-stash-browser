import { act, renderHook, waitFor } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { createRouterWrapper, must } from "@tests/testUtils";
import { describe, expect, it, vi } from "vitest";
import { useImagesPagination } from "../../src/hooks/useImagesPagination";

vi.mock("../../src/utils/toast", () => ({ showError: vi.fn() }));

type PaginationOptions = Parameters<typeof useImagesPagination>[0];

/**
 * Options without an external page, so the hook keeps the page itself. The
 * type requires an external page; these tests cover the hook without one.
 */
const withoutExternalPage = (
  options: Omit<PaginationOptions, "externalPage" | "onExternalPageChange">
) => untrusted<PaginationOptions>(options);

describe("useImagesPagination", () => {
  const createMockFetchImages = (images: unknown[] = [], count = 0) => {
    return vi.fn().mockResolvedValue({ images, count });
  };

  describe("basic functionality", () => {
    it("fetches images on mount", async () => {
      const mockImages = [{ id: "1" }, { id: "2" }];
      const fetchImages = createMockFetchImages(mockImages, 2);

      const { result } = renderHook(
        () =>
          useImagesPagination(
            withoutExternalPage({
              fetchImages,
              perPage: 10,
            })
          ),
        { wrapper: createRouterWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchImages).toHaveBeenCalledWith(1, 10);
      expect(result.current.images).toEqual(mockImages);
      expect(result.current.totalCount).toBe(2);
    });

    it("re-fetches when dependencies change", async () => {
      const fetchImages = createMockFetchImages([], 0);

      const { rerender } = renderHook(
        ({ dep }) =>
          useImagesPagination(
            withoutExternalPage({
              fetchImages,
              perPage: 10,
              dependencies: [dep],
            })
          ),
        { initialProps: { dep: "value1" }, wrapper: createRouterWrapper() }
      );

      await waitFor(() => {
        expect(fetchImages).toHaveBeenCalledTimes(1);
      });

      rerender({ dep: "value2" });

      await waitFor(() => {
        expect(fetchImages).toHaveBeenCalledTimes(2);
      });
    });

    it("handles fetch error gracefully", async () => {
      const fetchError = new Error("Fetch failed");
      const fetchImages = vi.fn().mockRejectedValue(fetchError);

      const { result } = renderHook(
        () =>
          useImagesPagination(
            withoutExternalPage({
              fetchImages,
              perPage: 10,
            })
          ),
        { wrapper: createRouterWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(fetchError);
      expect(result.current.images).toEqual([]);
    });
  });

  describe("external page state", () => {
    it("uses externalPage when provided", async () => {
      const fetchImages = createMockFetchImages([], 100);

      const { result } = renderHook(
        () =>
          useImagesPagination({
            fetchImages,
            perPage: 10,
            externalPage: 5,
            onExternalPageChange: vi.fn(),
          }),
        { wrapper: createRouterWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fetch page 5
      expect(fetchImages).toHaveBeenCalledWith(5, 10);
      expect(result.current.lightbox.currentPage).toBe(5);
    });

    it("re-fetches when externalPage changes", async () => {
      const fetchImages = createMockFetchImages([], 100);
      const onExternalPageChange = vi.fn();

      const { rerender } = renderHook(
        ({ externalPage }) =>
          useImagesPagination({
            fetchImages,
            perPage: 10,
            externalPage,
            onExternalPageChange,
          }),
        { initialProps: { externalPage: 1 }, wrapper: createRouterWrapper() }
      );

      await waitFor(() => {
        expect(fetchImages).toHaveBeenCalledWith(1, 10);
      });

      rerender({ externalPage: 3 });

      await waitFor(() => {
        expect(fetchImages).toHaveBeenCalledWith(3, 10);
      });
    });

    it("calls onExternalPageChange when page changes via lightbox", async () => {
      const fetchImages = createMockFetchImages([], 100);
      const onExternalPageChange = vi.fn();

      const { result } = renderHook(
        () =>
          useImagesPagination({
            fetchImages,
            perPage: 10,
            externalPage: 1,
            onExternalPageChange,
          }),
        { wrapper: createRouterWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Change page via lightbox.setCurrentPage
      act(() => {
        result.current.lightbox.setCurrentPage(3);
      });

      expect(onExternalPageChange).toHaveBeenCalledWith(3);
    });

    it("a failed page during a lightbox crossing ends the transition and returns to the page shown", async () => {
      const fetchImages = vi.fn((page: number) =>
        page === 1
          ? Promise.resolve({
              images: Array.from({ length: 10 }, (_, i) => ({
                id: String(i + 1),
                instanceId: "a",
              })),
              count: 30,
            })
          : Promise.reject(new Error("The server is down"))
      );
      const onExternalPageChange = vi.fn();
      const { result, rerender } = renderHook(
        ({ externalPage }) =>
          useImagesPagination({
            fetchImages,
            perPage: 10,
            externalPage,
            onExternalPageChange,
          }),
        { initialProps: { externalPage: 1 }, wrapper: createRouterWrapper() }
      );
      await waitFor(() => {
        expect(result.current.images).toHaveLength(10);
      });

      act(() => {
        result.current.lightbox.openLightbox(9);
      });
      act(() => {
        result.current.lightbox.onPageBoundary("next");
      });
      expect(onExternalPageChange).toHaveBeenLastCalledWith(2, {
        replace: true,
      });
      rerender({ externalPage: 2 });

      await waitFor(() => {
        expect(result.current.lightbox.isPageTransitioning).toBe(false);
      });
      expect(onExternalPageChange).toHaveBeenLastCalledWith(1, {
        replace: true,
      });
      expect(result.current.lightbox.lightboxOpen).toBe(true);
      expect(result.current.lightbox.lightboxIndex).toBe(9);
    });

    it("a page fetch that resolves after a newer one is ignored", async () => {
      type Page = { images: { id: string }[]; count: number };
      const resolvers = new Map<number, (page: Page) => void>();
      const fetchImages = vi.fn(
        (page: number) =>
          new Promise<Page>((resolve) => {
            resolvers.set(page, resolve);
          })
      );

      const { result, rerender } = renderHook(
        ({ externalPage }) =>
          useImagesPagination({
            fetchImages,
            perPage: 10,
            externalPage,
            onExternalPageChange: vi.fn(),
          }),
        { initialProps: { externalPage: 2 }, wrapper: createRouterWrapper() }
      );
      rerender({ externalPage: 3 });
      await waitFor(() => {
        expect(resolvers.size).toBe(2);
      });

      // Page 3 answers first, then the slower page 2
      await act(async () => {
        must(
          resolvers.get(3),
          "page 3's fetch"
        )({
          images: [{ id: "p3" }],
          count: 30,
        });
        await Promise.resolve();
      });
      await act(async () => {
        must(
          resolvers.get(2),
          "page 2's fetch"
        )({
          images: [{ id: "p2" }],
          count: 30,
        });
        await Promise.resolve();
      });

      expect(result.current.images).toEqual([{ id: "p3" }]);
      expect(result.current.isLoading).toBe(false);
    });

    it("exposes lightbox handlers for pagination integration", async () => {
      const fetchImages = createMockFetchImages([], 100);

      const { result } = renderHook(
        () =>
          useImagesPagination(
            withoutExternalPage({
              fetchImages,
              perPage: 10,
            })
          ),
        { wrapper: createRouterWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify lightbox object has expected properties
      expect(result.current.lightbox).toHaveProperty("currentPage");
      expect(result.current.lightbox).toHaveProperty("totalPages");
      expect(result.current.lightbox).toHaveProperty("setCurrentPage");
      expect(result.current.lightbox).toHaveProperty("openLightbox");
      expect(result.current.lightbox).toHaveProperty("closeLightbox");
      expect(result.current.lightbox).toHaveProperty("onPageBoundary");
    });
  });

  describe("setImages callback", () => {
    it("allows updating images via setImages", async () => {
      const mockImages = [{ id: "1", rating: 0 }];
      const fetchImages = createMockFetchImages(mockImages, 1);

      const { result } = renderHook(
        () =>
          useImagesPagination(
            withoutExternalPage({
              fetchImages,
              perPage: 10,
            })
          ),
        { wrapper: createRouterWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Update images (e.g., after rating change in lightbox)
      const updatedImages = [{ id: "1", rating: 5 }];
      act(() => {
        result.current.setImages(updatedImages);
      });

      expect(result.current.images).toEqual(updatedImages);
    });
  });
});
