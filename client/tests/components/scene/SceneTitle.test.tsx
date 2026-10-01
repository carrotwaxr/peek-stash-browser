import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SceneTitle from "@/components/scene/SceneTitle";

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

const scene = {
  id: "3",
  instanceId: "inst-1",
  title: "Third",
  files: [],
} as unknown as NormalizedScene;

describe("SceneTitle", () => {
  it("clicking a title with a queue in its link state writes nothing to sessionStorage", () => {
    sessionStorage.clear();
    // A video that is playing, as the old flags looked for
    const video = document.createElement("video");
    Object.defineProperty(video, "paused", { value: false });
    Object.defineProperty(video, "readyState", { value: 4 });
    document.body.appendChild(video);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    render(
      <MemoryRouter>
        <SceneTitle
          scene={scene}
          linkState={{ playlist: { key: "q", scenes: [] } }}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Third"));
    const writes = setItem.mock.calls.length;
    setItem.mockRestore();
    video.remove();

    expect(writes).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
