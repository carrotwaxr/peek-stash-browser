/**
 * The one hook the controls step through the queue with: it keeps playing
 * when the player is playing and stays paused when it is paused.
 */
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { untrusted } from "@tests/helpers/untrusted";
import { describe, expect, it, vi } from "vitest";
import {
  ScenePlayerProvider,
  useScenePlayer,
} from "@/contexts/ScenePlayerContext";
import { useQueueNavigation } from "@/hooks/useQueueNavigation";
import { buildPlaybackQueue } from "@/utils/playbackQueue";

vi.mock("@/api", () => ({
  apiPost: (_path: string, body: { ids: string[] }) =>
    Promise.resolve({
      findScenes: {
        scenes: [{ id: body.ids[0], instanceId: "inst-a" }],
      },
    }),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

/** The part of a video.js player the context asks about */
interface FakePlayer {
  paused: () => boolean;
}

function fakePlayer(paused: boolean): FakePlayer {
  return { paused: () => paused };
}

/** A queue of `count` scenes, the hook, and the player's context */
function renderNavigation(
  count: number,
  currentIndex: number,
  initialShouldAutoplay = false
) {
  const queue = buildPlaybackQueue({
    userId: 1,
    id: "virtual-grid",
    name: "Scene Grid",
    scenes: untrusted<NormalizedScene[]>(
      Array.from({ length: count }, (_, i) => ({
        id: String(i + 1),
        instanceId: "inst-a",
        title: `Scene ${i + 1}`,
      }))
    ),
    currentIndex,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SignedInWithQuery>
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/scene/${currentIndex + 1}`,
            state: { playlist: queue },
          },
        ]}
      >
        <ScenePlayerProvider
          sceneId={String(currentIndex + 1)}
          instanceId="inst-a"
          playlist={{ ...queue }}
          initialShouldAutoplay={initialShouldAutoplay}
        >
          {children}
        </ScenePlayerProvider>
      </MemoryRouter>
    </SignedInWithQuery>
  );
  return renderHook(
    () => ({ nav: useQueueNavigation(), player: useScenePlayer() }),
    { wrapper }
  );
}

describe("useQueueNavigation", () => {
  it("goTo, next and prev keep playing when the player is playing and stay paused when it is paused", async () => {
    const { result } = renderNavigation(4, 1, true);
    await waitFor(() => {
      expect(result.current.player.sceneLoading).toBe(false);
    });

    act(() => result.current.player.registerPlayer(fakePlayer(false)));
    act(() => result.current.nav.next());
    expect(result.current.player.currentIndex).toBe(2);
    expect(result.current.player.shouldAutoplay).toBe(true);

    // Paused: the step clears the autoplay the state still held
    act(() => result.current.player.registerPlayer(fakePlayer(true)));
    act(() => result.current.nav.prev());
    expect(result.current.player.currentIndex).toBe(1);
    expect(result.current.player.shouldAutoplay).toBe(false);

    act(() => result.current.player.registerPlayer(fakePlayer(false)));
    act(() => result.current.nav.goTo(3));
    expect(result.current.player.currentIndex).toBe(3);
    expect(result.current.player.shouldAutoplay).toBe(true);

    act(() => result.current.player.registerPlayer(fakePlayer(true)));
    act(() => result.current.nav.goTo(0));
    expect(result.current.player.currentIndex).toBe(0);
    expect(result.current.player.shouldAutoplay).toBe(false);
  });

  it("with no player registered nothing counts as playing", async () => {
    const { result } = renderNavigation(3, 0, true);
    await waitFor(() => {
      expect(result.current.player.sceneLoading).toBe(false);
    });

    expect(result.current.player.isPlaying()).toBe(false);
    act(() => result.current.player.registerPlayer(fakePlayer(false)));
    expect(result.current.player.isPlaying()).toBe(true);
    act(() => result.current.player.registerPlayer(null));
    expect(result.current.player.isPlaying()).toBe(false);
  });

  it("canNext and canPrev follow the reducer's rules, and upNextIndex is none in shuffle", async () => {
    const { result } = renderNavigation(3, 2);
    await waitFor(() => {
      expect(result.current.player.sceneLoading).toBe(false);
    });

    expect(result.current.nav.canNext).toBe(false);
    expect(result.current.nav.upNextIndex).toBeNull();
    expect(result.current.nav.canPrev).toBe(true);

    // Repeat All wraps: from the last, Next goes to the first
    act(() => result.current.player.toggleRepeat());
    expect(result.current.nav.canNext).toBe(true);
    expect(result.current.nav.upNextIndex).toBe(0);

    act(() => result.current.player.toggleShuffle());
    expect(result.current.nav.canNext).toBe(true);
    expect(result.current.nav.upNextIndex).toBeNull();
  });

  it("goTo ignores an index outside the queue", async () => {
    const { result } = renderNavigation(3, 0);
    await waitFor(() => {
      expect(result.current.player.sceneLoading).toBe(false);
    });

    act(() => result.current.nav.goTo(7));
    act(() => result.current.nav.goTo(-1));

    expect(result.current.player.currentIndex).toBe(0);
  });
});
