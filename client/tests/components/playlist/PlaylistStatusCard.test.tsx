/**
 * The status card's Previous and Next follow the queue's rules (Repeat All,
 * Shuffle), and Go to playlist stays inside the app.
 */
import { MemoryRouter, useLocation } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { untrusted } from "@tests/helpers/untrusted";
import { describe, expect, it, vi } from "vitest";
import PlaylistStatusCard from "@/components/playlist/PlaylistStatusCard";
import { ScenePlayerProvider } from "@/contexts/ScenePlayerContext";
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

/** Shows where the router is */
function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

/** The card inside the player, on a queue of 3 scenes */
function renderCard(currentIndex: number, queueId = "virtual-grid") {
  const queue = buildPlaybackQueue({
    userId: 1,
    id: queueId,
    name: "Weekend",
    scenes: untrusted<NormalizedScene[]>(
      ["First", "Second", "Third"].map((title, i) => ({
        id: String(i + 1),
        instanceId: "inst-a",
        title,
      }))
    ),
    currentIndex,
  });
  const sceneId = String(currentIndex + 1);
  return render(
    <SignedInWithQuery>
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
          <PlaylistStatusCard />
          <Where />
        </ScenePlayerProvider>
      </MemoryRouter>
    </SignedInWithQuery>
  );
}

/** Both layouts render their own buttons; every copy answers alike */
function buttons(label: string) {
  return screen.getAllByLabelText(label);
}

describe("PlaylistStatusCard", () => {
  it("Next is enabled on the last item with Repeat All and in shuffle with unplayed items", async () => {
    renderCard(2);
    await waitFor(() => {
      expect(screen.getByTestId("where")).toHaveTextContent("/scene/3");
    });
    for (const next of buttons("Next scene")) expect(next).toBeDisabled();

    fireEvent.click(buttons("Enable repeat all")[0] as HTMLElement);
    for (const next of buttons("Next scene")) expect(next).toBeEnabled();

    // Back to Repeat Off (all, one, none), then Shuffle
    fireEvent.click(buttons("Switch to repeat one")[0] as HTMLElement);
    fireEvent.click(buttons("Disable repeat one")[0] as HTMLElement);
    for (const next of buttons("Next scene")) expect(next).toBeDisabled();
    fireEvent.click(buttons("Enable shuffle")[0] as HTMLElement);
    for (const next of buttons("Next scene")) expect(next).toBeEnabled();
  });

  it("Previous is enabled on the first item with Repeat All", async () => {
    renderCard(0);
    await waitFor(() => {
      expect(screen.getByTestId("where")).toHaveTextContent("/scene/1");
    });
    for (const prev of buttons("Previous scene")) expect(prev).toBeDisabled();

    fireEvent.click(buttons("Enable repeat all")[0] as HTMLElement);

    for (const prev of buttons("Previous scene")) expect(prev).toBeEnabled();
  });

  it("Go to playlist navigates in the app", async () => {
    renderCard(0, "7");
    await waitFor(() => {
      expect(screen.getByTestId("where")).toHaveTextContent("/scene/1");
    });

    fireEvent.click(screen.getAllByText("Weekend")[0] as HTMLElement);

    expect(screen.getByTestId("where")).toHaveTextContent("/playlist/7");
  });
});
