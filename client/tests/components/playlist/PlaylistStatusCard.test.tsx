/**
 * The status card's Previous and Next follow the queue's rules (Repeat All,
 * Shuffle), and Go to playlist stays inside the app.
 */
import { MemoryRouter, useLocation } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { untrusted } from "@tests/helpers/untrusted";
import { afterEach, describe, expect, it, vi } from "vitest";
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

// The card shows the tablet strip at md and up, the phone strip below
const mockMd = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => mockMd.value,
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
function renderCard(
  currentIndex: number,
  queueId = "virtual-grid",
  ids: Array<[string, string]> = [
    ["1", "inst-a"],
    ["2", "inst-a"],
    ["3", "inst-a"],
  ]
) {
  const queue = buildPlaybackQueue({
    userId: 1,
    id: queueId,
    name: "Weekend",
    scenes: untrusted<NormalizedScene[]>(
      ids.map(([id, instanceId], i) => ({
        id,
        instanceId,
        title: ["First", "Second", "Third"][i],
        paths: { screenshot: `/shot/${instanceId}/${id}.jpg` },
      }))
    ),
    currentIndex,
  });
  const sceneId = ids[currentIndex]?.[0] ?? "1";
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
  afterEach(() => {
    mockMd.value = true;
  });

  it("renders one strip with a lazy, async-decoded image per queue entry", () => {
    for (const wide of [true, false]) {
      mockMd.value = wide;
      const { container, unmount } = renderCard(0);

      const images = container.querySelectorAll("img");
      expect(images).toHaveLength(3);
      expect(container.querySelectorAll("img[loading=lazy]")).toHaveLength(3);
      expect(container.querySelectorAll("img[decoding=async]")).toHaveLength(3);
      unmount();
    }
  });

  it("two entries with the same scene id on two instances render with no duplicate-key warning", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = renderCard(0, "virtual-grid", [
      ["7", "inst-a"],
      ["7", "inst-b"],
      ["8", "inst-a"],
    ]);
    await act(async () => {});

    expect(container.querySelectorAll("img")).toHaveLength(3);
    const keyWarnings = warn.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("key"))
    );
    expect(keyWarnings).toEqual([]);
    warn.mockRestore();
  });

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
