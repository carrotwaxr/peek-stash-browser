import { act } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Clip } from "../../../src/components/cards/ClipCard";
import ClipCardPreview from "../../../src/components/cards/ClipCardPreview";

vi.mock("../../../src/api", () => ({
  getClipPreviewUrl: (id: string) => `/api/proxy/clip/${id}/preview`,
}));

// Mock IntersectionObserver — triggers on observe() to avoid TDZ issue
let intersectionCallback: IntersectionObserverCallback;
beforeEach(() => {
  const mockIntersectionObserver = vi.fn(
    (callback: IntersectionObserverCallback) => {
      intersectionCallback = callback;
      return {
        observe: vi.fn((target: Element) => {
          // Trigger intersection asynchronously after observer is assigned
          queueMicrotask(() => {
            intersectionCallback(
              [
                {
                  isIntersecting: true,
                  intersectionRatio: 1,
                  target,
                } as IntersectionObserverEntry,
              ],
              {} as IntersectionObserver
            );
          });
        }),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      };
    }
  );
  vi.stubGlobal("IntersectionObserver", mockIntersectionObserver);
});

/** Spies on the media element, restored after each test */
const mediaSpies: { mockRestore: () => void }[] = [];

afterEach(() => {
  mediaSpies.forEach((spy) => spy.mockRestore());
  mediaSpies.length = 0;
});

const baseClip: Clip = {
  id: "1",
  title: "Test Clip",
  seconds: 120,
  endSeconds: 180,
  sceneId: "scene-1",
  instanceId: "inst-a",
  isGenerated: true,
  primaryTag: { id: "tag-1", name: "Action" },
  tags: [],
  scene: { title: "Test Scene", pathScreenshot: "/scene-cover.jpg" },
};

describe("ClipCardPreview", () => {
  it("uses marker screenshot when available", async () => {
    const clip: Clip = {
      ...baseClip,
      screenshotUrl: "/api/proxy/stash?path=%2Fmarker-screenshot.jpg",
    };
    const { container } = render(<ClipCardPreview clip={clip} />);
    // Flush microtask for IntersectionObserver
    await act(() => Promise.resolve());
    const img = container.querySelector("img");
    expect(img).toHaveAttribute(
      "src",
      "/api/proxy/stash?path=%2Fmarker-screenshot.jpg"
    );
  });

  it("falls back to scene cover when no marker screenshot", async () => {
    const clip: Clip = { ...baseClip, screenshotUrl: null };
    const { container } = render(<ClipCardPreview clip={clip} />);
    await act(() => Promise.resolve());
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/scene-cover.jpg");
  });

  it("falls back to scene cover when screenshotUrl is undefined", async () => {
    const clip: Clip = { ...baseClip };
    const { container } = render(<ClipCardPreview clip={clip} />);
    await act(() => Promise.resolve());
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/scene-cover.jpg");
  });

  it("shows no preview placeholder when neither screenshot exists", async () => {
    const clip: Clip = {
      ...baseClip,
      screenshotUrl: null,
      scene: { title: "Test Scene", pathScreenshot: null },
    };
    const { container } = render(<ClipCardPreview clip={clip} />);
    await act(() => Promise.resolve());
    const img = container.querySelector("img");
    expect(img).toBeNull();
    expect(container.textContent).toContain("No preview");
  });

  it("leaving the card clears the video's src before unmount", async () => {
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => {});
    mediaSpies.push(pause, load);
    const { container, rerender } = render(
      <ClipCardPreview clip={baseClip} autoplayOnScroll />
    );
    await act(() => Promise.resolve());
    const video = container.querySelector("video");
    expect(video).not.toBeNull();

    // Out of view: the preview unmounts
    rerender(<ClipCardPreview clip={baseClip} />);

    expect(container.querySelector("video")).toBeNull();
    expect(video?.hasAttribute("src")).toBe(false);
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });

  it("with autoplayOnScroll, a clip card in view plays its preview without hover", async () => {
    const { container } = render(
      <ClipCardPreview clip={baseClip} autoplayOnScroll />
    );
    await act(() => Promise.resolve());

    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "/api/proxy/clip/1/preview"
    );
  });

  it("without autoplayOnScroll, a clip card in view stays a still on a device that cannot hover", async () => {
    const { container } = render(<ClipCardPreview clip={baseClip} />);
    await act(() => Promise.resolve());

    expect(container.querySelector("video")).toBeNull();
  });
});
