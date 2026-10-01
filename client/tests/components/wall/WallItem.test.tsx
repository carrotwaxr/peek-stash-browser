import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WallItem from "../../../src/components/wall/WallItem";
import { PreviewSlotProvider } from "../../../src/components/wall/previewSlots";
import {
  MOUSE_QUERIES,
  TOUCH_QUERIES,
  matchMediaQueries,
} from "../../helpers/matchMedia";

vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

const config = {
  getImageUrl: () => "/shot.jpg",
  getPreviewUrl: () => null,
  getTitle: () => "A clip",
  getSubtitle: () => null,
  hasPreview: false,
};

const renderItem = () =>
  render(
    <MemoryRouter>
      <WallItem
        item={{ id: "c1", instanceId: "i1", sceneId: "s1", seconds: 3 }}
        config={config}
        entityType="clip"
        width={200}
        height={120}
        playbackMode="static"
      />
    </MemoryRouter>
  );

describe("WallItem", () => {
  it("an image that fails to load removes the spinner", () => {
    const { container } = renderItem();
    expect(container.querySelector(".animate-spin")).not.toBeNull();

    fireEvent.error(screen.getByRole("img"));

    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("an image that loads removes the spinner", () => {
    const { container } = renderItem();
    fireEvent.load(screen.getByRole("img"));
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});

describe("WallItem link", () => {
  it("an image tile opens the image in the Images page's viewer", () => {
    render(
      <MemoryRouter>
        <WallItem
          item={{ id: "7", instanceId: "i1" }}
          config={config}
          entityType="image"
          width={200}
          height={120}
          playbackMode="static"
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/images?image=7%3Ai1"
    );
  });

  it("a tile on a list that names its own link (the Images list keeping its state) uses it", () => {
    render(
      <MemoryRouter>
        <WallItem
          item={{ id: "7", instanceId: "i1" }}
          config={config}
          entityType="image"
          width={200}
          height={120}
          playbackMode="static"
          itemPath={(item) => `/images?page=3&image=${String(item.id)}`}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/images?page=3&image=7"
    );
  });
});

describe("WallItem preview slots", () => {
  const previewConfig = {
    ...config,
    getPreviewUrl: (item: Record<string, unknown>) =>
      `/preview/${String(item.id)}.mp4`,
    getTitle: (item: Record<string, unknown>) => String(item.id),
    hasPreview: true,
  };

  const tile = (id: string) => (
    <WallItem
      key={id}
      item={{ id, instanceId: "i1" }}
      config={previewConfig}
      entityType="scene"
      width={200}
      height={120}
      playbackMode="hover"
    />
  );

  const renderTiles = (max: number) =>
    render(
      <MemoryRouter>
        <PreviewSlotProvider max={max}>
          {tile("a")}
          {tile("b")}
        </PreviewSlotProvider>
      </MemoryRouter>
    );

  const videos = (container: HTMLElement): HTMLVideoElement[] =>
    Array.from(container.querySelectorAll("video"));

  const link = (container: HTMLElement, index: number): Element => {
    const el = container.querySelectorAll("a")[index];
    if (!el) throw new Error(`no tile ${index}`);
    return el;
  };

  const stubMedia = () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => {});
    return { play, pause, load };
  };

  it("a tile that has no slot yet has no src", () => {
    stubMedia();
    const { container } = renderTiles(1);
    expect(videos(container).every((v) => !v.hasAttribute("src"))).toBe(true);
  });

  it("a tile that loses its slot has no src, and the next waiting tile gets it", () => {
    const { pause, load } = stubMedia();
    const { container } = renderTiles(1);

    fireEvent.mouseEnter(link(container, 0));
    fireEvent.mouseEnter(link(container, 1));
    const [first, second] = videos(container);
    expect(first?.getAttribute("src")).toBe("/preview/a.mp4");
    expect(second?.hasAttribute("src")).toBe(false);

    fireEvent.mouseLeave(link(container, 0));

    expect(first?.hasAttribute("src")).toBe(false);
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
    expect(second?.getAttribute("src")).toBe("/preview/b.mp4");
  });

  it("a tile that regains a slot gets its src back", () => {
    stubMedia();
    const { container } = renderTiles(1);
    const [first] = videos(container);

    fireEvent.mouseEnter(link(container, 0));
    fireEvent.mouseLeave(link(container, 0));
    expect(first?.hasAttribute("src")).toBe(false);

    fireEvent.mouseEnter(link(container, 0));
    expect(first?.getAttribute("src")).toBe("/preview/a.mp4");
  });
});

describe("WallItem title overlay", () => {
  let restoreMedia: (() => void) | null = null;
  afterEach(() => {
    restoreMedia?.();
    restoreMedia = null;
    vi.useRealTimers();
  });

  const titleBox = (container: HTMLElement) =>
    container.querySelector("h3")?.parentElement as HTMLElement;

  it("on touch the wall title shows without hover", () => {
    restoreMedia = matchMediaQueries(TOUCH_QUERIES);
    const { container } = renderItem();

    expect(screen.getByText("A clip")).toBeInTheDocument();
    expect(titleBox(container).style.opacity).toBe("1");
  });

  it("with a mouse the title waits 500 ms after the pointer enters", () => {
    restoreMedia = matchMediaQueries(MOUSE_QUERIES);
    vi.useFakeTimers();
    const { container } = renderItem();
    const link = container.querySelector("a") as HTMLElement;
    expect(titleBox(container).style.opacity).toBe("0");

    fireEvent.mouseEnter(link);
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(titleBox(container).style.opacity).toBe("0");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(titleBox(container).style.opacity).toBe("1");

    fireEvent.mouseLeave(link);
    expect(titleBox(container).style.opacity).toBe("0");
  });
});
