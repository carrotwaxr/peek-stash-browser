// client/src/components/ui/__tests__/Lightbox.test.jsx
import type { ReactNode } from "react";
import type { NormalizedImage } from "@peek/shared-types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost, getMyPermissions, libraryApi } from "@/api";
import Lightbox from "../../../src/components/ui/Lightbox";
import { useRatingHotkeys } from "../../../src/hooks/useRatingHotkeys";

// Mock the API
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({ settings: {} }),
  apiPost: vi.fn().mockResolvedValue({}),
  getMyPermissions: vi.fn().mockResolvedValue({ permissions: {} }),
  libraryApi: {
    updateRating: vi.fn().mockResolvedValue({}),
    updateFavorite: vi.fn().mockResolvedValue({}),
  },
  imageViewHistoryApi: {
    recordView: vi.fn().mockResolvedValue({}),
    incrementO: vi.fn().mockResolvedValue({}),
  },
}));

// Mock useFullscreen hook
vi.mock("../../../hooks/useFullscreen", () => ({
  useFullscreen: () => ({
    isFullscreen: false,
    toggleFullscreen: vi.fn(),
    supportsFullscreen: true,
  }),
}));

// Mock react-swipeable
vi.mock("react-swipeable", () => ({
  useSwipeable: () => ({}),
}));

// Helper to create mock images
const createMockImages = (page: number, perPage = 10) => {
  return Array.from({ length: perPage }, (_, i) => ({
    id: `page${page}-image${i}`,
    paths: {
      image: `http://example.com/page${page}/image${i}.jpg`,
      thumbnail: `http://example.com/page${page}/thumb${i}.jpg`,
    },
    title: `Page ${page} Image ${i}`,
  })) as any[];
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
      const renderLog: any[] = [];
      const RenderTracker = ({
        images,
        initialIndex,
        isPageTransitioning,
        ...props
      }: any) => {
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
      const imageContainer = container.querySelector(
        ".w-\\[90vw\\]"
      ) as HTMLElement;
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

      const getImgSrc = () =>
        container.querySelector("img")?.getAttribute("src");

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
      const imageContainer = container.querySelector(
        ".w-\\[90vw\\]"
      ) as HTMLElement;
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

      const getImgSrc = () =>
        container.querySelector("img")?.getAttribute("src");
      const getVisibility = () =>
        container.querySelector<HTMLElement>(".w-\\[90vw\\]")?.style.visibility;

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

      // Post-transition: container stays hidden until image loads (prevents flicker)
      expect(getVisibility()).toBe("hidden");
      expect(getImgSrc()).toBe("http://example.com/page2/image0.jpg");

      // Simulate image load — now the container becomes visible
      const img = container.querySelector("img")!;
      fireEvent.load(img);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(getVisibility()).toBe("visible");
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

      const img = container.querySelector("img")!;

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

      const img = container.querySelector("img")!;
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
      expect(img.getAttribute("src")).toBe(
        "http://example.com/page2/image0.jpg"
      );

      // With the fix, opacity should be "0" because imageLoaded was reset
      // when the image ID changed from page1-image0 to page2-image0
      expect(img.style.opacity).toBe("0");

      // Simulate the new image loading
      fireEvent.load(img);
      expect(img.style.opacity).toBe("1");
    });
  });

  describe("fullscreen exit behavior", () => {
    it("exits fullscreen when close button is clicked", () => {
      const exitFullscreen = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(document, "fullscreenElement", {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.exitFullscreen = exitFullscreen;

      const onClose = vi.fn();
      render(
        <Lightbox
          images={[{ id: "1", paths: { image: "/test.jpg" } }] as any}
          isOpen={true}
          onClose={onClose}
          {...({ supportsFullscreen: true } as any)}
        />
      );

      const closeButton = screen.getByLabelText("Close lightbox");
      fireEvent.click(closeButton);

      expect(exitFullscreen).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("keyboard", () => {
    const image: NormalizedImage = {
      id: "img-1",
      instanceId: "inst-1",
      title: "Image one",
      code: null,
      details: null,
      photographer: null,
      urls: [],
      date: null,
      studio: null,
      studioId: null,
      rating100: null,
      o_counter: 0,
      organized: false,
      filePath: null,
      width: null,
      height: null,
      fileSize: null,
      files: [],
      paths: { thumbnail: "/t.jpg", preview: "/p.jpg", image: "/i.jpg" },
      performers: [],
      tags: [],
      galleries: [],
      created_at: null,
      updated_at: null,
    };

    /** A performer page: its own r-then-number rating hotkeys. */
    const PerformerPage = ({ children }: { children: ReactNode }) => {
      useRatingHotkeys({
        setRating: (rating) =>
          void libraryApi.updateRating("performer", "p-1", rating, "inst-1"),
      });
      return <>{children}</>;
    };

    const press = (key: string) => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key });
    };

    it("r then 4 with the lightbox open over a performer page rates the image once and the performer never", async () => {
      render(
        <PerformerPage>
          <Lightbox images={[image]} isOpen={true} onClose={vi.fn()} />
        </PerformerPage>
      );

      press("r");
      press("4");
      await act(async () => {
        await Promise.resolve();
      });

      expect(libraryApi.updateRating).toHaveBeenCalledTimes(1);
      expect(libraryApi.updateRating).toHaveBeenCalledWith(
        "image",
        "img-1",
        80,
        "inst-1"
      );
    });

    it("is a modal dialog that holds focus while open", () => {
      render(<Lightbox images={[image]} isOpen={true} onClose={vi.fn()} />);

      const dialog = screen.getByRole("dialog", { name: "Image viewer" });
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it("Escape closes it and the arrows page through its images", () => {
      const onClose = vi.fn();
      const second: NormalizedImage = {
        ...image,
        id: "img-2",
        paths: { thumbnail: "/t2.jpg", preview: "/p2.jpg", image: "/i2.jpg" },
      };
      render(
        <Lightbox images={[image, second]} isOpen={true} onClose={onClose} />
      );
      const src = () =>
        screen.getByRole("img", { name: "Image one" }).getAttribute("src");

      press("ArrowRight");
      expect(src()).toBe("/i2.jpg");
      press("ArrowLeft");
      expect(src()).toBe("/i.jpg");

      press("Escape");
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("media element", () => {
    it("an mp4 image entry renders a video, not an img", () => {
      const images = createMockImages(1, 1) as NormalizedImage[];
      images[0] = {
        ...images[0],
        filePath: "/data/clip.mp4",
      } as NormalizedImage;
      const { container } = render(
        <Lightbox
          images={images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector("video");
      expect(video).not.toBeNull();
      expect(video?.getAttribute("src")).toBe(images[0].paths.image);
      expect(video?.hasAttribute("controls")).toBe(true);
      expect(video?.getAttribute("tabindex")).toBe("-1");
      expect(container.querySelector("img")).toBeNull();
    });

    it("an img fills the frame with object-contain", () => {
      const images = createMockImages(1, 1) as NormalizedImage[];
      const { container } = render(
        <Lightbox
          images={images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const img = container.querySelector("img");
      expect(img?.className).toContain("w-full");
      expect(img?.className).toContain("h-full");
      expect(img?.className).toContain("object-contain");
    });

    it("a video entry becomes visible on loadeddata", () => {
      const images = createMockImages(1, 1) as NormalizedImage[];
      images[0] = {
        ...images[0],
        filePath: "/data/clip.webm",
      } as NormalizedImage;
      const { container } = render(
        <Lightbox
          images={images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector("video");
      if (!video) throw new Error("no video element");
      expect(video.style.opacity).toBe("0");
      fireEvent.loadedData(video);
      expect(video.style.opacity).toBe("1");
    });

    it("a video entry becomes visible on error", () => {
      const images = createMockImages(1, 1) as NormalizedImage[];
      images[0] = {
        ...images[0],
        filePath: "/data/clip.webm",
      } as NormalizedImage;
      const { container } = render(
        <Lightbox
          images={images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector("video");
      if (!video) throw new Error("no video element");
      fireEvent.error(video);
      expect(video.style.opacity).toBe("1");
    });
  });

  describe("prefetch", () => {
    const created: Array<{
      src: string;
      decoding: string;
      fetchPriority: string;
    }> = [];
    const RealImage = globalThis.Image;

    beforeEach(() => {
      created.length = 0;
      class FakeImage {
        src = "";
        decoding = "";
        fetchPriority = "";
        constructor() {
          created.push(this);
        }
      }
      globalThis.Image = FakeImage as unknown as typeof Image;
    });

    afterEach(() => {
      globalThis.Image = RealImage;
      vi.unstubAllGlobals();
    });

    it("prefetch creates Image objects for the neighbours' URLs and calls no fetch", () => {
      const fetchSpy = vi.fn().mockResolvedValue({});
      vi.stubGlobal("fetch", fetchSpy);
      const current = createMockImages(1, 1) as NormalizedImage[];
      const next = createMockImages(2, 2) as NormalizedImage[];
      render(
        <Lightbox
          images={current}
          prefetchImages={next}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(created.map((i) => i.src)).toEqual([
        next[0]?.paths.image,
        next[1]?.paths.image,
      ]);
      expect(created.every((i) => i.decoding === "async")).toBe(true);
      expect(created.every((i) => i.fetchPriority === "low")).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("prefetch skips video entries, whose file is the whole mp4", () => {
      const current = createMockImages(1, 1) as NormalizedImage[];
      const next = createMockImages(2, 2) as NormalizedImage[];
      const photo = must(next[0], "the photo");
      const video = {
        ...must(next[1], "the video"),
        filePath: "/data/clip.mp4",
      } as NormalizedImage;
      render(
        <Lightbox
          images={current}
          prefetchImages={[photo, video]}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(created.map((i) => i.src)).toEqual([photo.paths.image]);
    });

    it("closing clears the prefetch images' src", () => {
      const current = createMockImages(1, 1) as NormalizedImage[];
      const next = createMockImages(2, 2) as NormalizedImage[];
      const { rerender } = render(
        <Lightbox
          images={current}
          prefetchImages={next}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );
      expect(created.length).toBe(2);

      rerender(
        <Lightbox
          images={current}
          prefetchImages={next}
          initialIndex={0}
          isOpen={false}
          onClose={vi.fn()}
        />
      );

      expect(created.map((i) => i.src)).toEqual(["", ""]);
    });
  });

  describe("download", () => {
    const realLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { href: "" },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: realLocation,
      });
    });

    const renderOpen = () => {
      const base = createMockImages(1, 2) as NormalizedImage[];
      const images = base.map((image, i) => ({
        ...image,
        id: `img-${i}`,
        instanceId: "inst-b",
      }));
      render(
        <Lightbox
          images={images}
          initialIndex={0}
          isOpen={true}
          onClose={vi.fn()}
        />
      );
    };

    it("the Download button shows only with Can Download Files", async () => {
      vi.mocked(getMyPermissions).mockResolvedValue({
        permissions: { canDownloadFiles: false },
      });
      renderOpen();
      await waitFor(() => expect(getMyPermissions).toHaveBeenCalled());
      expect(screen.queryByLabelText("Download image")).toBeNull();
    });

    it("shows the Download button with Can Download Files", async () => {
      vi.mocked(getMyPermissions).mockResolvedValue({
        permissions: { canDownloadFiles: true },
      });
      renderOpen();
      expect(await screen.findByLabelText("Download image")).toBeTruthy();
    });

    it("Download posts the image's instance and navigates to the file", async () => {
      vi.mocked(getMyPermissions).mockResolvedValue({
        permissions: { canDownloadFiles: true },
      });
      vi.mocked(apiPost).mockResolvedValue({
        download: { id: 31, status: "COMPLETED" },
      });
      renderOpen();

      fireEvent.click(await screen.findByLabelText("Download image"));

      await waitFor(() => {
        expect(window.location.href).toBe("/api/downloads/31/file");
      });
      expect(apiPost).toHaveBeenCalledWith("/downloads/image/img-0", {
        instanceId: "inst-b",
      });
    });
  });
});
