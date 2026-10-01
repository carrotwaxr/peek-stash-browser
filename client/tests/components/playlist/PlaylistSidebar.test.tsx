/**
 * The sidebar's controls show the player's own state: a queue started from a
 * grid, a carousel, Watch History or a playlist row names no autoplayNext,
 * and the player still plays on.
 */
import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { createAuthValue } from "@tests/testUtils";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import PlaylistSidebar from "@/components/playlist/PlaylistSidebar";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { ScenePlayerProvider } from "@/contexts/ScenePlayerContext";
import { buildPlaybackQueue } from "@/utils/playbackQueue";

/** Scene 2 is no longer visible to the user; any other loads */
const mockPost = vi.fn((_path: string, body: { ids: string[] }) =>
  Promise.resolve({
    findScenes: {
      scenes:
        body.ids[0] === "2" ? [] : [{ id: body.ids[0], instanceId: "inst-a" }],
    },
  })
);
vi.mock("@/api", () => ({
  apiPost: (path: string, body: { ids: string[] }) => mockPost(path, body),
}));

vi.mock("@/utils/toast", () => ({ showWarning: vi.fn() }));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

/** The sidebar inside the player, on a queue of these scenes */
function renderSidebar(
  titles: string[],
  currentIndex: number,
  instances: string[] = []
) {
  const queue = buildPlaybackQueue({
    userId: 1,
    id: "virtual-grid",
    name: "Scene Grid",
    scenes: untrusted<NormalizedScene[]>(
      titles.map((title, i) => ({
        id: instances.length > 0 ? "7" : String(i + 1),
        instanceId: instances[i] ?? "inst-a",
        title,
      }))
    ),
    currentIndex,
  });
  const sceneId = instances.length > 0 ? "7" : String(currentIndex + 1);
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthContext.Provider
        value={createAuthValue({
          isAuthenticated: true,
          user: { id: 1, username: "viewer", role: "USER" },
        })}
      >
        <MemoryRouter
          initialEntries={[
            { pathname: `/scene/${sceneId}`, state: { playlist: queue } },
          ]}
        >
          <ScenePlayerProvider
            sceneId={sceneId}
            instanceId="inst-a"
            playlist={{ ...queue }}
          >
            <PlaylistSidebar />
          </ScenePlayerProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe("PlaylistSidebar", () => {
  it("an unavailable entry is dimmed, labelled Unavailable and not clickable", async () => {
    // The queue starts on scene 2, which is gone: the player skips to 3
    renderSidebar(["First", "Second", "Third"], 1);

    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    const row = screen.getByText("Second").closest("[aria-disabled]");
    expect(row).toHaveAttribute("aria-disabled", "true");
    await waitFor(() => {
      expect(mockPost).toHaveBeenLastCalledWith("/library/scenes", {
        ids: ["3"],
        scene_filter: { instance_id: "inst-a" },
      });
    });
    const loads = mockPost.mock.calls.length;

    fireEvent.click(screen.getByText("Second"));

    expect(mockPost).toHaveBeenCalledTimes(loads);
  });

  it("Autoplay shows On for a queue without autoplayNext, and one click turns it Off", async () => {
    const queue = buildPlaybackQueue({
      userId: 1,
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
        <AuthContext.Provider
          value={createAuthValue({
            isAuthenticated: true,
            user: { id: 1, username: "viewer", role: "USER" },
          })}
        >
          <MemoryRouter
            initialEntries={[
              { pathname: "/scene/1", state: { playlist: queue } },
            ]}
          >
            <ScenePlayerProvider
              sceneId="1"
              instanceId="inst-a"
              playlist={{ ...queue }}
            >
              <PlaylistSidebar />
            </ScenePlayerProvider>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    const autoplay = await screen.findByTitle("Autoplay: On");
    fireEvent.click(autoplay);

    expect(screen.getByTitle("Autoplay: Off")).toBe(autoplay);
  });

  it("Up Next is hidden in shuffle", async () => {
    renderSidebar(["First", "Second", "Third"], 0);
    expect(await screen.findByText("Up Next")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Shuffle: Off"));

    expect(screen.queryByText("Up Next")).toBeNull();
  });

  it("with Repeat All on the last item Up Next shows item 1", async () => {
    renderSidebar(["First", "Second", "Third"], 2);
    await screen.findByTitle("Repeat: Off");
    expect(screen.queryByText("Up Next")).toBeNull();

    fireEvent.click(screen.getByTitle("Repeat: Off"));

    const upNext = (await screen.findByText("Up Next")).parentElement;
    expect(upNext).not.toBeNull();
    expect(
      within(upNext as HTMLElement).getByText("First")
    ).toBeInTheDocument();
  });

  it("two entries with the same scene id on two instances render with no duplicate-key warning", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    renderSidebar(["First", "Second"], 0, ["inst-a", "inst-b"]);
    await act(async () => {});

    expect(screen.getAllByText("Second").length).toBeGreaterThan(0);
    const keyWarnings = warn.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("key"))
    );
    expect(keyWarnings).toEqual([]);
    warn.mockRestore();
  });
});
