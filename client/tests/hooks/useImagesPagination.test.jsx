// client/src/hooks/__tests__/useImagesPagination.test.jsx
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useImagesPagination } from "../../src/hooks/useImagesPagination.js";

describe("useImagesPagination", () => {
  const createMockFetchImages = (images = [], count = 0) => {
    return vi.fn().mockResolvedValue({ images, count });
  };

  describe("basic functionality", () => {
    it("fetches images on mount", async () => {
      const mockImages = [{ id: "1" }, { id: "2" }];
      const fetchImages = createMockFetchImages(mockImages, 2);

      const { result } = renderHook(() =>
        useImagesPagination({
          fetchImages,
          perPage: 10,
        })
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
          useImagesPagination({
            fetchImages,
            perPage: 10,
            dependencies: [dep],
          }),
        { initialProps: { dep: "value1" } }
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

      const { result } = renderHook(() =>
        useImagesPagination({
          fetchImages,
          perPage: 10,
        })
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

      const { result } = renderHook(() =>
        useImagesPagination({
          fetchImages,
          perPage: 10,
          externalPage: 5,
          onExternalPageChange: vi.fn(),
        })
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
        { initialProps: { externalPage: 1 } }
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

      const { result } = renderHook(() =>
        useImagesPagination({
          fetchImages,
          perPage: 10,
          externalPage: 1,
          onExternalPageChange,
        })
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

    it("exposes lightbox handlers for pagination integration", async () => {
      const fetchImages = createMockFetchImages([], 100);

      const { result } = renderHook(() =>
        useImagesPagination({
          fetchImages,
          perPage: 10,
        })
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

      const { result } = renderHook(() =>
        useImagesPagination({
          fetchImages,
          perPage: 10,
        })
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
