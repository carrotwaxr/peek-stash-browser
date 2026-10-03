/**
 * PlaybackTab (CS-21): a failed load offers Retry and no form, so Save can
 * never write the defaults over the user's stored playback settings.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../../src/api";
import { useUserSettings } from "../../../../src/api/hooks/useUserSettings";
import PlaybackTab from "../../../../src/components/settings/tabs/PlaybackTab";
import { showError, showSuccess } from "../../../../src/utils/toast";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

// The tab's calls are stubbed; the rest (ApiError, getErrorMessage) is real
vi.mock("../../../../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

vi.mock("../../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const renderTab = () =>
  render(
    <SignedInWithQuery>
      <PlaybackTab />
      <PlayerReading />
    </SignedInWithQuery>
  );

/** What the video player reads when a scene starts */
function PlayerReading() {
  const { data } = useUserSettings();
  return <p data-testid="player-reads">{data?.settings.minimumPlayPercent}</p>;
}

const STORED = {
  minimumPlayPercent: 50,
};

describe("PlaybackTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Playback after a failed load offers Retry and no Save", async () => {
    mockApiGet
      .mockRejectedValueOnce(new api.ApiError("Database busy", 503))
      .mockResolvedValueOnce({ settings: STORED });
    renderTab();

    expect(await screen.findByText("Database busy")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save Settings" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Minimum Play Percent/)
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByLabelText(/Minimum Play Percent/)).toHaveValue(
      "50"
    );
    expect(
      screen.getByRole("button", { name: "Save Settings" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Database busy")).not.toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    expect(mockApiPut).not.toHaveBeenCalled();
  });

  it("saves the loaded values with the user's change", async () => {
    mockApiGet.mockResolvedValue({ settings: STORED });
    mockApiPut.mockResolvedValue({ success: true });
    renderTab();

    fireEvent.change(await screen.findByLabelText(/Minimum Play Percent/), {
      target: { value: "75" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith(
        "Playback settings saved successfully!"
      )
    );
    // The body names the play percent and nothing else
    expect(mockApiPut).toHaveBeenCalledWith("/user/settings", {
      minimumPlayPercent: 75,
    });
  });

  it("a saved minimum play percent is what the player reads next, without a reload", async () => {
    mockApiGet.mockResolvedValue({ settings: STORED });
    mockApiPut.mockResolvedValue({ success: true });
    renderTab();
    await screen.findByLabelText(/Minimum Play Percent/);
    expect(screen.getByTestId("player-reads")).toHaveTextContent("50");

    fireEvent.change(screen.getByLabelText(/Minimum Play Percent/), {
      target: { value: "75" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(screen.getByTestId("player-reads")).toHaveTextContent("75")
    );
    // Read from the cache: the save is not followed by a second GET
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it("a failed save shows the server's message", async () => {
    mockApiGet.mockResolvedValue({ settings: STORED });
    mockApiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
    renderTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "Save Settings" })
    );

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Database busy")
    );
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Settings" })).toBeEnabled();
  });

  it("the Playback tab says Chromecast needs HTTPS and offers no casting toggle", async () => {
    mockApiGet.mockResolvedValue({ settings: STORED });
    mockApiPut.mockResolvedValue({ success: true });
    renderTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "Save Settings" })
    );

    expect(screen.getByTestId("casting-help")).toHaveTextContent(
      "Chromecast needs Peek on HTTPS"
    );
    expect(screen.queryByLabelText(/Chromecast|AirPlay/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await waitFor(() => expect(mockApiPut).toHaveBeenCalled());
    expect(mockApiPut.mock.calls[0]?.[1]).not.toHaveProperty("enableCast");
  });

  it("the Playback tab offers no quality or playback-mode control", async () => {
    // A stored row from before the removal may still carry the old fields
    mockApiGet.mockResolvedValue({
      settings: {
        ...STORED,
        preferredQuality: "720p",
        preferredPlaybackMode: "direct",
      },
    });
    mockApiPut.mockResolvedValue({ success: true });
    renderTab();

    fireEvent.click(
      await screen.findByRole("button", { name: "Save Settings" })
    );

    expect(screen.queryByText(/Preferred (Quality|Playback Mode)/)).toBeNull();
    expect(
      screen.queryByLabelText(/Preferred (Quality|Playback Mode)/)
    ).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    await waitFor(() => expect(mockApiPut).toHaveBeenCalled());
    const body: unknown = mockApiPut.mock.calls[0]?.[1];
    expect(body).not.toHaveProperty("preferredQuality");
    expect(body).not.toHaveProperty("preferredPlaybackMode");
  });
});
