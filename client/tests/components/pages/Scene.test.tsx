import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import {
  type MockInstance,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Scene from "@/components/pages/Scene";

// The provider renders what it was handed, so a test reads the queue the page
// passes down; the player itself is not under test here.
vi.mock("@/contexts/ScenePlayerContext", () => ({
  ScenePlayerProvider: (props: {
    sceneId: string;
    instanceId?: string;
    playlist?: unknown;
    children?: ReactNode;
  }) => (
    <div
      data-testid="provider"
      data-scene-id={props.sceneId}
      data-playlist={JSON.stringify(props.playlist ?? null)}
    />
  ),
  useScenePlayer: vi.fn(),
}));

// The page imports the player, which pulls in video.js and its VR polyfill
vi.mock("@/components/video-player/VideoPlayer", () => ({
  default: () => null,
}));
vi.mock("@/components/video-player/PlaybackControls", () => ({
  default: () => null,
}));

const queue = {
  id: "virtual-grid",
  name: "Grid",
  shuffle: false,
  repeat: "none",
  currentIndex: 0,
  scenes: [
    {
      sceneId: "1",
      instanceId: "a",
      position: 0,
      scene: { title: "One" },
    },
    {
      sceneId: "2",
      instanceId: "b",
      position: 1,
      scene: { title: "Two" },
    },
  ],
};

function page(entry: { pathname: string; search?: string; state?: unknown }) {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/scene/:sceneId" element={<Scene />} />
      </Routes>
    </MemoryRouter>
  );
}

function playlistOf(testId = "provider") {
  const raw = screen.getByTestId(testId).getAttribute("data-playlist");
  return JSON.parse(raw ?? "null") as typeof queue | null;
}

describe("Scene page queue storage", () => {
  // One spy for the file: happy-dom's Storage stops honouring a second spy on
  // the same method once the first is restored
  let setItem: MockInstance<Storage["setItem"]>;
  let warn: MockInstance<Console["warn"]>;

  beforeAll(() => {
    setItem = vi.spyOn(Storage.prototype, "setItem");
    warn = vi.spyOn(console, "warn");
  });

  beforeEach(() => {
    sessionStorage.clear();
    // Back to the real setItem, with no calls recorded
    setItem.mockReset();
    warn.mockReset().mockImplementation(() => undefined);
  });

  afterAll(() => {
    setItem.mockRestore();
    warn.mockRestore();
    sessionStorage.clear();
  });

  it("a sessionStorage that throws QuotaExceededError still renders the player with the queue from navigation state", () => {
    setItem.mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    render(
      page({
        pathname: "/scene/1",
        state: { scene: { id: "1" }, playlist: queue },
      })
    );

    expect(playlistOf()?.scenes).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
  });

  it("the queue is written once per navigation, not on every render", () => {
    const element = () =>
      page({
        pathname: "/scene/1",
        state: { scene: { id: "1" }, playlist: queue },
      });

    // A fresh element each time, so React renders the page again
    const { rerender } = render(element());
    rerender(element());
    rerender(element());
    rerender(element());

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(
      "currentPlaylist",
      JSON.stringify(queue)
    );
  });

  // A guard: PR 5 already matches the entry's server, and this stays true
  it("a reload restores the stored queue when it holds the scene and the instance", () => {
    sessionStorage.setItem("currentPlaylist", JSON.stringify(queue));

    render(page({ pathname: "/scene/2", search: "?instance=b" }));

    const restored = playlistOf();
    expect(restored?.scenes).toHaveLength(2);
    expect(restored?.currentIndex).toBe(1);
  });

  it("a reload drops the stored queue when its entry for that scene is on another instance", () => {
    sessionStorage.setItem("currentPlaylist", JSON.stringify(queue));

    render(page({ pathname: "/scene/2", search: "?instance=a" }));

    expect(playlistOf()).toBeNull();
    expect(sessionStorage.getItem("currentPlaylist")).toBeNull();
  });
});
