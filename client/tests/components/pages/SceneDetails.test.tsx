/**
 * SceneDetails' Clips section reads the scene's clips query, so an answer
 * for a scene the user has left never shows under the next one.
 */
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { GetClipsForSceneResponse } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { untrusted } from "@tests/helpers/untrusted";
import { actAsync, flushPromises } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Api from "@/api";
import { getClipsForScene } from "@/api";
import SceneDetails from "@/components/pages/SceneDetails";

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  getClipsForScene: vi.fn(),
}));
const playerState = vi.hoisted(() => ({
  scene: { id: "1", instanceId: "inst-a", tags: [], files: [] } as {
    id: string;
    instanceId: string;
    tags: never[];
    files: never[];
  },
}));
vi.mock("@/contexts/ScenePlayerContext", () => ({
  useScenePlayer: () => ({ scene: playerState.scene, sceneLoading: false }),
}));
vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({ getSettings: () => ({}) }),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("@/components/clips/ClipList", () => ({
  default: ({ clips }: { clips: Array<{ id: string; title: string }> }) => (
    <ul>
      {clips.map((clip) => (
        <li key={clip.id}>{clip.title}</li>
      ))}
    </ul>
  ),
}));

const clipsAnswer = (...titles: string[]): GetClipsForSceneResponse =>
  untrusted({
    clips: titles.map((title) => ({ id: title, title, isGenerated: true })),
  });

describe("SceneDetails clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerState.scene = { id: "1", instanceId: "inst-a", tags: [], files: [] };
  });

  it("a slower clips answer for the previous scene never shows under the new one", async () => {
    const pending = new Map<
      string,
      (answer: GetClipsForSceneResponse) => void
    >();
    vi.mocked(getClipsForScene).mockImplementation(
      (sceneId) =>
        new Promise((resolve) => {
          pending.set(sceneId, resolve);
        })
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    // A new element each time, so a rerender reads the scene again
    const details = () => (
      <SceneDetails
        showDetails={false}
        setShowDetails={vi.fn()}
        showTechnicalDetails={false}
        setShowTechnicalDetails={vi.fn()}
      />
    );

    const { rerender } = render(details(), { wrapper: Wrapper });
    await actAsync(() => {
      playerState.scene = {
        id: "2",
        instanceId: "inst-a",
        tags: [],
        files: [],
      };
      rerender(details());
    });

    // The new scene answers first, then the old one, late
    await actAsync(() => {
      pending.get("2")?.(clipsAnswer("Second"));
    });
    expect(await screen.findByText("(1)")).toBeInTheDocument();
    await act(async () => {
      pending.get("1")?.(clipsAnswer("First", "First again"));
      await flushPromises();
    });

    expect(screen.getByText("(1)")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Clips"));
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });
});
