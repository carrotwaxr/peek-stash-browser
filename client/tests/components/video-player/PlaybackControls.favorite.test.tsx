/**
 * The Scene page's heart shows the viewer's favourite from the player's state
 * (`scene.favorite`), and every toggle, the heart, its `r f` hotkey and the
 * headset HUD, writes through useUpdateFavorite and SET_SCENE_FAVORITE. So a
 * toggle made in the headset shows on the heart, and the next toggle from
 * either place writes the opposite value.
 *
 * The player's context is a real reducer here; the HUD stands in as the
 * same `useSceneFavorite` call useVrMode makes for it.
 */
import { type ReactNode, createContext, useContext, useReducer } from "react";
import type { NormalizedScene, WithStashUrl } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { createAuthValue, must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { libraryApi } from "@/api/library";
import type * as uiModule from "@/components/ui/index";
import PlaybackControls from "@/components/video-player/PlaybackControls";
import { useSceneFavorite } from "@/components/video-player/useSceneFavorite";
import { AuthContext } from "@/contexts/AuthContextProvider";
import {
  initialState,
  scenePlayerReducer,
} from "@/contexts/scenePlayerReducer";

vi.mock("@/api", () => ({
  apiPost: vi.fn(),
  getMyPermissions: () => Promise.resolve({ permissions: {} }),
}));
// The request useUpdateFavorite sends
vi.mock("@/api/library", () => ({
  libraryApi: {
    updateFavorite: vi.fn(
      (_type: string, _id: string, favorite: boolean, _instanceId: string) =>
        Promise.resolve({ success: true, rating: { favorite } })
    ),
  },
}));

interface Harness {
  scene: WithStashUrl<NormalizedScene> | null;
  sceneLoading: boolean;
  oCounter: number;
  dispatch: (action: { type: string; payload?: unknown }) => void;
}

const HarnessContext = createContext<Harness | null>(null);

vi.mock("@/contexts/ScenePlayerContext", () => ({
  useScenePlayer: () => must(useContext(HarnessContext), "the harness"),
}));

vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({
      showRating: false,
      showOCounter: false,
      showFavorite: true,
    }),
  }),
}));

// The r f hotkey: the toggle PlaybackControls hands over, pressed by the test
const hotkeys = vi.hoisted(() => ({
  toggleFavorite: null as (() => void) | null,
}));
vi.mock("@/hooks/useRatingHotkeys", () => ({
  useRatingHotkeys: ({
    toggleFavorite,
  }: {
    toggleFavorite?: (() => void) | null;
  }) => {
    hotkeys.toggleFavorite = toggleFavorite ?? null;
  },
}));
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof uiModule>()),
  AddToPlaylistButton: () => null,
}));

function ScenePlayerHarness({
  favorite,
  children,
}: {
  favorite: boolean;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(scenePlayerReducer, {
    ...initialState,
    scene: untrusted<WithStashUrl<NormalizedScene>>({
      id: "7",
      instanceId: "inst-b",
      title: "A scene",
      favorite,
    }),
  });
  return (
    <HarnessContext.Provider
      value={{
        scene: state.scene,
        sceneLoading: false,
        oCounter: 0,
        dispatch,
      }}
    >
      {children}
    </HarnessContext.Provider>
  );
}

/** The HUD's favourite button, wired as useVrMode wires it */
function Hud() {
  const { scene, dispatch } = must(useContext(HarnessContext), "the harness");
  const { toggleFavorite } = useSceneFavorite(scene, dispatch);
  return (
    <button type="button" onClick={() => void toggleFavorite()}>
      HUD favourite
    </button>
  );
}

function renderPage({ favorite = false } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={createAuthValue({ isAuthenticated: true })}>
        <ScenePlayerHarness favorite={favorite}>
          <PlaybackControls />
          <Hud />
        </ScenePlayerHarness>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

/** Every heart on the page (one per layout) says `label` */
const heartsSay = (label: string) => {
  expect(screen.queryAllByLabelText(label).length).toBeGreaterThan(0);
  expect(
    screen.queryAllByLabelText(
      label === "Add to favorites"
        ? "Remove from favorites"
        : "Add to favorites"
    )
  ).toHaveLength(0);
};

const press = (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const saved = () =>
  vi.mocked(libraryApi.updateFavorite).mock.calls.map((call) => call[2]);

describe("PlaybackControls: the favourite", () => {
  beforeEach(() => {
    vi.mocked(libraryApi.updateFavorite).mockClear();
    hotkeys.toggleFavorite = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("the heart shows the scene's favourite", () => {
    renderPage({ favorite: true });
    heartsSay("Remove from favorites");
  });

  it("a HUD favourite shows on the heart; a second toggle unfavourites", async () => {
    renderPage();
    heartsSay("Add to favorites");

    await press(screen.getByText("HUD favourite"));
    heartsSay("Remove from favorites");

    await press(must(screen.getAllByLabelText("Remove from favorites")[0]));
    heartsSay("Add to favorites");

    expect(saved()).toEqual([true, false]);
    expect(libraryApi.updateFavorite).toHaveBeenCalledWith(
      "scene",
      "7",
      true,
      "inst-b"
    );
  });

  it("r f toggles through the same write", async () => {
    renderPage();
    await act(async () => {
      must(hotkeys.toggleFavorite, "the r f toggle")();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    heartsSay("Remove from favorites");

    await press(screen.getByText("HUD favourite"));
    heartsSay("Add to favorites");
    expect(saved()).toEqual([true, false]);
  });

  it("a failed write reverts the heart", async () => {
    vi.mocked(libraryApi.updateFavorite).mockRejectedValueOnce(
      new Error("offline")
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();

    await press(must(screen.getAllByLabelText("Add to favorites")[0]));

    heartsSay("Add to favorites");
    expect(saved()).toEqual([true]);
  });
});
