// client/src/components/ui/__tests__/Lightbox.test.jsx
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Lightbox from "../../../src/components/ui/Lightbox.jsx";

// Mock the API
vi.mock("../../../services/api.js", () => ({
  libraryApi: {
    updateRating: vi.fn().mockResolvedValue({}),
    updateFavorite: vi.fn().mockResolvedValue({}),
  },
  imageViewHistoryApi: {
    recordView: vi.fn().mockResolvedValue({}),
  },
}));

// Mock useFullscreen hook
vi.mock("../../../hooks/useFullscreen.js", () => ({
  useFullscreen: () => ({
    isFullscreen: false,
    toggleFullscreen: vi.fn(),
    supportsFullscreen: true,
  }),
}));

// Mock useRatingHotkeys hook
vi.mock("../../../hooks/useRatingHotkeys.js", () => ({
  useRatingHotkeys: vi.fn(),
}));

// Mock react-swipeable
vi.mock("react-swipeable", () => ({
  useSwipeable: () => ({}),
}));

// Helper to create mock images
const createMockImages = (page, perPage = 10) => {
  return Array.from({ length: perPage }, (_, i) => ({
    id: `page${page}-image${i}`,
    paths: {
      image: `http://example.com/page${page}/image${i}.jpg`,
      thumbnail: `http://example.com/page${page}/thumb${i}.jpg`,
    },
    title: `Page ${page} Image ${i}`,
  }));
};

describe("Lightbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("basic rendering", () => {
    it("renders image when open", () => {
      const images = createMockImages(1, 5);
      render(
        <Lightbox
          images={images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const img = screen.getByRole("img");
      expect(img.getAttribute("src")).toBe(images[0].paths.image);
    });

    it("does not render when closed", () => {
      const images = createMockImages(1, 5);
      const { container } = render(
        <Lightbox
          images={images}
          initialIndex={0}
          isOpen={false}
          onClose={vi.fn()}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("page transition flicker bug investigation", () => {
    /**
     * This test investigates the flicker bug where:
     * 1. User is on last image of page 1 (index 99)
     * 2. Clicks "next" to go to page 2
     * 3. Loading UI appears
     * 4. FLICKER: First image of page 1 briefly appears
     * 5. First image of page 2 correctly loads
     *
     * The hypothesis is that when isPageTransitioning becomes false,
     * there's a frame where old page 1 images are still in the images prop
     * with currentIndex=0.
     */

    it("should track state changes during page transition", () => {
      const page1Images = createMockImages(1, 10);
      const page2Images = createMockImages(2, 10);

      // Track all render states
      const renderLog = [];
      const RenderTracker = ({ images, initialIndex, isPageTransitioning, ...props }) => {
        // Log every render's key values
        renderLog.push({
          timestamp: Date.now(),
          initialIndex,
          isPageTransitioning,
          firstImageId: images[0]?.id,
          imageAtIndex0: images[0]?.paths?.image,
          imagesCount: images.length,
        });

        return (
          <Lightbox
            images={images}
            initialIndex={initialIndex}
            isPageTransitioning={isPageTransitioning}
            {...props}
          />
        );
      };

      const { rerender } = render(
        <RenderTracker
          images={page1Images}
          initialIndex={9} // Last image of page 1
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false}
          totalCount={20}
          pageOffset={0}
        />
      );

      // Initial state: viewing last image of page 1
      expect(renderLog[renderLog.length - 1]).toMatchObject({
        initialIndex: 9,
        isPageTransitioning: false,
        firstImageId: "page1-image0",
      });

      // Step 1: User clicks "next" - hook sets isPageTransitioning=true and initialIndex=0
      // But images are still page 1 images
      rerender(
        <RenderTracker
          images={page1Images} // Still page 1!
          initialIndex={0} // Changed to 0 for first image of next page
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={true} // Loading state
          totalCount={20}
          pageOffset={0}
        />
      );

      // Should be transitioning with index 0 but page 1 images
      // This is OK because isPageTransitioning=true hides the image
      expect(renderLog[renderLog.length - 1]).toMatchObject({
        initialIndex: 0,
        isPageTransitioning: true,
        firstImageId: "page1-image0", // Still page 1 data
      });

      // Step 2: API returns - images update to page 2, THEN isPageTransitioning becomes false
      // This simulates what GalleryDetail does:
      //   setImages(page2Images);
      //   lightbox.consumePendingLightboxIndex(); // sets isPageTransitioning=false

      // In React, these could be batched or could cause separate renders.
      // Let's simulate what happens if they're NOT batched (worst case):

      // First: images update, but isPageTransitioning is still true (from different component)
      rerender(
        <RenderTracker
          images={page2Images} // NEW page 2 images
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={true} // Still transitioning
          totalCount={20}
          pageOffset={10}
        />
      );

      expect(renderLog[renderLog.length - 1]).toMatchObject({
        initialIndex: 0,
        isPageTransitioning: true,
        firstImageId: "page2-image0", // Page 2 now
      });

      // Then: isPageTransitioning becomes false
      rerender(
        <RenderTracker
          images={page2Images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false} // Transition complete
          totalCount={20}
          pageOffset={10}
        />
      );

      expect(renderLog[renderLog.length - 1]).toMatchObject({
        initialIndex: 0,
        isPageTransitioning: false,
        firstImageId: "page2-image0",
      });

      // If the above sequence is correct, there should be no flicker
      // because page 2 images arrive before isPageTransitioning becomes false.
    });

    it("should hide image container when isPageTransitioning is true", () => {
      const images = createMockImages(1, 10);

      const { container, rerender } = render(
        <Lightbox
          images={images}
          initialIndex={9}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false}
          totalCount={20}
          pageOffset={0}
        />
      );

      // Find the image container div (has visibility style)
      const imageContainer = container.querySelector(".max-w-\\[90vw\\]");
      expect(imageContainer.style.visibility).toBe("visible");

      // Now transition
      rerender(
        <Lightbox
          images={images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={true}
          totalCount={20}
          pageOffset={0}
        />
      );

      expect(imageContainer.style.visibility).toBe("hidden");
    });

    it("tracks currentIndex sync with initialIndex prop", async () => {
      const page1Images = createMockImages(1, 10);

      // We need to track what the img src is at each render
      const imgSrcLog = [];

      const { container, rerender } = render(
        <Lightbox
          images={page1Images}
          initialIndex={9}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false}
          totalCount={20}
          pageOffset={0}
        />
      );

      const getImgSrc = () => container.querySelector("img")?.getAttribute("src");

      imgSrcLog.push({ step: "initial", src: getImgSrc() });
      expect(getImgSrc()).toBe("http://example.com/page1/image9.jpg");

      // Simulate clicking next - initialIndex changes to 0, transitioning starts
      rerender(
        <Lightbox
          images={page1Images}
          initialIndex={0} // Now pointing to index 0
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={true}
          totalCount={20}
          pageOffset={0}
        />
      );

      imgSrcLog.push({ step: "after initialIndex change", src: getImgSrc() });

      // The useEffect that syncs currentIndex from initialIndex runs after render
      // So on the FIRST render after initialIndex changes, currentIndex might lag

      // Wait for useEffect to run
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      imgSrcLog.push({ step: "after useEffect", src: getImgSrc() });

      // Now the image src should be page1/image0.jpg
      // BUT the container should be hidden due to isPageTransitioning=true
      expect(getImgSrc()).toBe("http://example.com/page1/image0.jpg");

      // Verify container is hidden
      const imageContainer = container.querySelector(".max-w-\\[90vw\\]");
      expect(imageContainer.style.visibility).toBe("hidden");
    });

    it("exposes the potential race condition - images update BEFORE consuming pending navigation", async () => {
      /**
       * This test simulates a race condition where:
       * 1. images prop updates to page 2
       * 2. BUT isPageTransitioning is still false (hasn't been set yet)
       *
       * This shouldn't happen in normal flow because handlePageBoundary
       * sets isPageTransitioning=true before the API call.
       * But let's verify the current implementation handles this.
       */
      const page1Images = createMockImages(1, 10);
      const page2Images = createMockImages(2, 10);

      const { container, rerender } = render(
        <Lightbox
          images={page1Images}
          initialIndex={9}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false}
          totalCount={20}
          pageOffset={0}
        />
      );

      const getImgSrc = () => container.querySelector("img")?.getAttribute("src");
      const getVisibility = () =>
        container.querySelector(".max-w-\\[90vw\\]")?.style.visibility;

      expect(getImgSrc()).toBe("http://example.com/page1/image9.jpg");

      // Step 1: handlePageBoundary sets isPageTransitioning=true and initialIndex=0
      rerender(
        <Lightbox
          images={page1Images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={true}
          totalCount={20}
          pageOffset={0}
        />
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Hidden during transition
      expect(getVisibility()).toBe("hidden");

      // Step 2: setImages(page2Images) runs, then consumePendingLightboxIndex()
      // These happen in the same function but may cause separate renders
      rerender(
        <Lightbox
          images={page2Images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false} // consumePendingLightboxIndex() called
          totalCount={20}
          pageOffset={10}
        />
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Should show page 2 image 0
      expect(getVisibility()).toBe("visible");
      expect(getImgSrc()).toBe("http://example.com/page2/image0.jpg");
    });
  });

  describe("imageLoaded state during transitions", () => {
    it("resets imageLoaded when initialIndex changes", async () => {
      const images = createMockImages(1, 10);

      const { container, rerender } = render(
        <Lightbox
          images={images}
          initialIndex={5}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false}
        />
      );

      const img = container.querySelector("img");

      // Simulate image load
      fireEvent.load(img);

      // Image should be opaque after load
      expect(img.style.opacity).toBe("1");

      // Change initialIndex - this should reset imageLoaded to false
      rerender(
        <Lightbox
          images={images}
          initialIndex={6}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false}
        />
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // After initialIndex change, imageLoaded should be false, so opacity should be 0
      expect(img.style.opacity).toBe("0");
    });

    it("resets imageLoaded when images prop changes (prevents flicker on page transitions)", async () => {
      /**
       * This test verifies the fix for the page transition flicker bug:
       * 1. isPageTransitioning=true, initialIndex=0, images=page1
       * 2. useEffect resets imageLoaded=false
       * 3. img starts loading page1/image0.jpg
       * 4. img fires onLoad, sets imageLoaded=true
       * 5. images update to page2
       * 6. NEW: imageLoaded is reset because current image ID changed
       * 7. isPageTransitioning becomes false
       * 8. img shows loading state (opacity 0) until new image loads
       */

      const page1Images = createMockImages(1, 10);
      const page2Images = createMockImages(2, 10);

      const { container, rerender } = render(
        <Lightbox
          images={page1Images}
          initialIndex={9}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false}
        />
      );

      const img = container.querySelector("img");
      fireEvent.load(img);
      expect(img.style.opacity).toBe("1");

      // Start transition - initialIndex goes to 0
      rerender(
        <Lightbox
          images={page1Images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={true}
        />
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // imageLoaded should be reset because initialIndex changed
      expect(img.style.opacity).toBe("0");

      // Now simulate: the WRONG image (page1/image0) loads while we're transitioning
      fireEvent.load(img);
      expect(img.style.opacity).toBe("1");

      // Images update to page2, transition ends
      rerender(
        <Lightbox
          images={page2Images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
          isPageTransitioning={false}
        />
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // FIXED: imageLoaded is now reset when images change, even if initialIndex stays 0
      // The img src has changed to page2/image0.jpg
      expect(img.getAttribute("src")).toBe("http://example.com/page2/image0.jpg");

      // With the fix, opacity should be "0" because imageLoaded was reset
      // when the image ID changed from page1-image0 to page2-image0
      expect(img.style.opacity).toBe("0");

      // Simulate the new image loading
      fireEvent.load(img);
      expect(img.style.opacity).toBe("1");
    });
  });
});
