/**
 * The sidebar's controls show the player's own state: a queue started from a
 * grid, a carousel, Watch History or a playlist row names no autoplayNext,
 * and the player still plays on.
 */
import type { NormalizedScene } from "@peek/shared-types";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import PlaylistSidebar from "@/components/playlist/PlaylistSidebar";
import { ScenePlayerProvider } from "@/contexts/ScenePlayerContext";
import { buildPlaybackQueue } from "@/utils/playbackQueue";

vi.mock("@/api", () => ({
  apiPost: vi.fn(() =>
    Promise.resolve({
      findScenes: { scenes: [{ id: "1", instanceId: "inst-a" }] },
    })
  ),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

describe("PlaylistSidebar", () => {
  it("Autoplay shows On for a queue without autoplayNext, and one click turns it Off", async () => {
    const queue = buildPlaybackQueue({
      id: "virtual-grid",
      name: "Scene Grid",
      scenes: untrusted<NormalizedScene[]>([
        { id: "1", instanceId: "inst-a", title: "First" },
        { id: "2", instanceId: "inst-a", title: "Second" },
      ]),
      currentIndex: 0,
    });

    render(
      <QueryClientProvider client={createQueryClient()}>
        <ScenePlayerProvider
          sceneId="1"
          instanceId="inst-a"
          playlist={{ ...queue }}
        >
          <PlaylistSidebar />
        </ScenePlayerProvider>
      </QueryClientProvider>
    );

    const autoplay = await screen.findByTitle("Autoplay: On");
    fireEvent.click(autoplay);

    expect(screen.getByTitle("Autoplay: Off")).toBe(autoplay);
  });
});
