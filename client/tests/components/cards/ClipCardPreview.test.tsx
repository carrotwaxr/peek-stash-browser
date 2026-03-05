import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import ClipCardPreview from "../../../src/components/cards/ClipCardPreview";
import type { Clip } from "../../../src/components/cards/ClipCard";

vi.mock("../../../src/api", () => ({
  getClipPreviewUrl: (id: string) => `/api/proxy/clip/${id}/preview`,
}));

// Mock IntersectionObserver — triggers on observe() to avoid TDZ issue
let intersectionCallback: IntersectionObserverCallback;
beforeEach(() => {
  const mockIntersectionObserver = vi.fn((callback: IntersectionObserverCallback) => {
    intersectionCallback = callback;
    return {
      observe: vi.fn(() => {
        // Trigger intersection asynchronously after observer is assigned
        queueMicrotask(() => {
          intersectionCallback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver
          );
        });
      }),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    };
  });
  vi.stubGlobal("IntersectionObserver", mockIntersectionObserver);
});

const baseClip: Clip = {
  id: "1",
  title: "Test Clip",
  seconds: 120,
  endSeconds: 180,
  sceneId: "scene-1",
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
    expect(img).toHaveAttribute("src", "/api/proxy/stash?path=%2Fmarker-screenshot.jpg");
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
});
