import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SceneListItem from "@/components/ui/SceneListItem";

const thumbnailRenders = vi.fn<(sceneId: string) => void>();

vi.mock("@/components/scene/index", () => ({
  SceneThumbnail: ({ scene }: { scene: NormalizedScene | null }) => {
    thumbnailRenders(scene?.id ?? "none");
    return <div data-testid="thumbnail" />;
  },
  SceneTitle: () => <div />,
  SceneStats: () => <div />,
  SceneMetadata: () => <div />,
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

const makeScene = (id: string) =>
  ({
    id,
    instanceId: "inst-1",
    title: `Scene ${id}`,
    files: [],
  }) as unknown as NormalizedScene;

const WIDTH_QUERY = "(max-width: 767px)";

describe("SceneListItem", () => {
  afterEach(() => {
    thumbnailRenders.mockClear();
  });

  it("100 rows add one resize/media listener, not 100", () => {
    const original = window.matchMedia;
    const changeListeners: string[] = [];
    // Swapped by hand and put back: spying on setup's matchMedia mock and
    // restoring the spy would leave it with no implementation
    window.matchMedia = (query: string) => {
      const list = original(query);
      const add = list.addEventListener.bind(list);
      list.addEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) => {
        if (type === "change") changeListeners.push(query);
        add(type, listener, options);
      };
      return list;
    };
    const resizeSpy = vi.spyOn(window, "addEventListener");

    const scenes = Array.from({ length: 100 }, (_, i) => makeScene(String(i)));
    const { unmount } = render(
      <MemoryRouter>
        {scenes.map((scene) => (
          <SceneListItem key={scene.id} scene={scene} />
        ))}
      </MemoryRouter>
    );

    const resizeListeners = resizeSpy.mock.calls.filter(
      ([type]) => type === "resize"
    ).length;
    const widthListeners = changeListeners.filter(
      (query) => query === WIDTH_QUERY
    ).length;
    unmount();
    window.matchMedia = original;
    resizeSpy.mockRestore();

    expect(resizeListeners + widthListeners).toBe(1);
  });

  it("a row whose props are unchanged does not re-render when its parent does", () => {
    const scene = makeScene("7");
    const watchHistory = { playCount: 1 };
    let bump: () => void = () => {};

    const Parent = () => {
      const [, setTick] = useState(0);
      bump = () => setTick((tick) => tick + 1);
      return (
        <MemoryRouter>
          <SceneListItem scene={scene} watchHistory={watchHistory} />
        </MemoryRouter>
      );
    };

    render(<Parent />);
    expect(thumbnailRenders).toHaveBeenCalledTimes(1);

    act(() => bump());

    expect(thumbnailRenders).toHaveBeenCalledTimes(1);
  });
  describe("the session O indicator", () => {
    const lastPlayedAt = "2024-05-01T20:00:00.000Z";
    const O_TITLE = "O clicked during this session";

    function renderRow(lastOAt: string | null | undefined) {
      render(
        <MemoryRouter>
          <SceneListItem
            scene={makeScene("1")}
            watchHistory={{
              lastPlayedAt,
              ...(lastOAt !== undefined && { lastOAt }),
            }}
            showSessionOIndicator
          />
        </MemoryRouter>
      );
    }

    it("shows when the last O is within 5 minutes of the last play", () => {
      renderRow("2024-05-01T20:03:00.000Z");

      expect(screen.getByTitle(O_TITLE)).toBeTruthy();
    });

    it("stays away when the last O is further from the last play", () => {
      renderRow("2024-05-01T20:10:00.000Z");

      expect(screen.queryByTitle(O_TITLE)).toBeNull();
    });

    it("stays away for a scene with no O", () => {
      renderRow(null);

      expect(screen.queryByTitle(O_TITLE)).toBeNull();
    });
  });
});
