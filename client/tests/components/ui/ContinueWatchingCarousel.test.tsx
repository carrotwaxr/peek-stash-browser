/**
 * Continue Watching asks the server for one page of in-progress scenes
 * (`GET /watch-history/scenes?view=in_progress&sort=recent&per_page=12`) and
 * shows what it returns, in the server's order. The scenes carry the viewer's
 * own resume point and play count, so no second scene request is made.
 *
 * The network is stubbed, not the hook: the behaviour under test is which
 * requests the carousel sends and when it asks again.
 */
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SignedIn } from "@tests/helpers/SignedIn";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateExclusionDependents } from "@/api/invalidateExclusionDependents";
import { createQueryClient } from "@/api/queryClient";
import ContinueWatchingCarousel from "@/components/ui/ContinueWatchingCarousel";
import {
  initializingResponse,
  jsonResponse,
  requestsTo,
  stubApi,
} from "../../helpers/stubApi";

const configState = vi.hoisted(() => ({ hasMultipleInstances: true }));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: configState.hasMultipleInstances }),
}));

vi.mock("@/components/ui/SceneCarousel", () => ({
  default: ({
    scenes,
    loading,
    onSceneClick,
  }: {
    loading: boolean;
    onSceneClick: (scene: { id: string; instanceId: string }) => void;
    scenes: Array<{
      id: string;
      instanceId: string;
      resume_time: number;
      play_count: number;
    }>;
  }) => (
    <ul data-loading={String(loading)} data-testid="carousel">
      {scenes.map((s) => (
        <li
          key={`${s.id}:${s.instanceId}`}
          data-testid="scene"
          onClick={() => onSceneClick(s)}
        >
          {`${s.id}:${s.instanceId}:${s.resume_time}:${s.play_count}`}
        </li>
      ))}
    </ul>
  ),
}));

const WATCHED = "/watch-history/scenes";

function scene(id: string, instanceId: string, overrides = {}) {
  return {
    id,
    instanceId,
    resume_time: 100,
    play_count: 1,
    play_duration: 500,
    files: [{ duration: 1000 }],
    ...overrides,
  };
}

function answer(scenes: unknown[]) {
  return () =>
    jsonResponse(200, { scenes, total: null, totalPlayDuration: null });
}

function LocationProbe() {
  const location = useLocation();
  const queue = (location.state as { playlist?: { userId?: number } } | null)
    ?.playlist;
  return (
    <>
      <div data-testid="location">{`${location.pathname}${location.search}`}</div>
      <output data-testid="queue-user">{String(queue?.userId)}</output>
    </>
  );
}

describe("ContinueWatchingCarousel", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createQueryClient();
    configState.hasMultipleInstances = true;
  });

  afterEach(() => {
    client.clear();
    vi.unstubAllGlobals();
  });

  function renderCarousel() {
    return render(
      <QueryClientProvider client={client}>
        <SignedIn>
          <MemoryRouter>
            <Routes>
              <Route path="/" element={<ContinueWatchingCarousel />} />
              <Route path="*" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </SignedIn>
      </QueryClientProvider>
    );
  }

  it("asks once for in_progress, recent, per_page 12 and shows what it returns", async () => {
    const fetchMock = stubApi({
      [WATCHED]: answer([
        scene("7", "b", { resume_time: 200, play_count: 2 }),
        scene("7", "a", { resume_time: 100, play_count: 1 }),
      ]),
    });

    renderCarousel();

    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(2);
    });
    const requests = requestsTo(fetchMock, WATCHED);
    expect(requests).toHaveLength(1);
    const params = new URL(must(requests[0], "a request"), "http://x")
      .searchParams;
    expect(params.get("view")).toBe("in_progress");
    expect(params.get("sort")).toBe("recent");
    expect(params.get("per_page")).toBe("12");
    // The server's order and each server's own numbers, nothing re-sorted
    expect(screen.getAllByTestId("scene").map((li) => li.textContent)).toEqual([
      "7:b:200:2",
      "7:a:100:1",
    ]);
  });

  it("makes no second scene request", async () => {
    const fetchMock = stubApi({ [WATCHED]: answer([scene("1", "a")]) });

    renderCarousel();
    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(1);
    });

    // Any other route would reject with "No stubbed route"
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestsTo(fetchMock, "/library/scenes")).toHaveLength(0);
  });

  it("hides when the answer is empty", async () => {
    const fetchMock = stubApi({ [WATCHED]: answer([]) });

    renderCarousel();

    await waitFor(() => {
      expect(requestsTo(fetchMock, WATCHED)).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("carousel")).toBeNull();
    });
  });

  it("a hide refetches Continue Watching", async () => {
    let scenes = [scene("1", "a"), scene("2", "a")];
    const fetchMock = stubApi({
      [WATCHED]: () =>
        jsonResponse(200, { scenes, total: null, totalPlayDuration: null }),
    });

    renderCarousel();
    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(2);
    });

    // Scene 1 is hidden: what useHiddenEntities does after a hide
    scenes = [scene("2", "a")];
    await act(async () => {
      await invalidateExclusionDependents(client);
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(1);
    });
    expect(requestsTo(fetchMock, WATCHED)).toHaveLength(2);
  });

  it("shows the loading state and asks nothing more while the library is initializing", async () => {
    const fetchMock = stubApi({
      [WATCHED]: initializingResponse,
      "/library/ready": () => jsonResponse(200, { ready: false }),
    });

    renderCarousel();

    await waitFor(() => {
      expect(screen.getByTestId("carousel").dataset["loading"]).toBe("true");
    });
    expect(requestsTo(fetchMock, WATCHED)).toHaveLength(1);
  });

  it("shows nothing when the request fails for another reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubApi({ [WATCHED]: () => jsonResponse(500, { error: "boom" }) });

    renderCarousel();

    await waitFor(() => {
      expect(screen.queryByTestId("carousel")).toBeNull();
    });
  });

  it("opens the clicked scene on its own server", async () => {
    stubApi({
      [WATCHED]: answer([scene("1", "a"), scene("2", "b")]),
    });

    renderCarousel();
    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(2);
    });
    fireEvent.click(must(screen.getAllByTestId("scene")[1]));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/scene/2?instance=b"
      );
    });
    // The queue it hands over belongs to the signed-in user
    expect(screen.getByTestId("queue-user").textContent).toBe("1");
  });

  it("opens a scene without the instance in its link when there is a single server", async () => {
    configState.hasMultipleInstances = false;
    stubApi({ [WATCHED]: answer([scene("1", "a")]) });

    renderCarousel();
    await waitFor(() => {
      expect(screen.getAllByTestId("scene")).toHaveLength(1);
    });
    fireEvent.click(must(screen.getAllByTestId("scene")[0]));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/scene/1");
    });
  });
});
