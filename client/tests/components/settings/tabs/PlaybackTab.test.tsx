/**
 * PlaybackTab (CS-21): a failed load offers Retry and no form, so Save can
 * never write the defaults over the user's stored playback settings.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../../src/api";
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

const STORED = {
  preferredQuality: "720p",
  preferredPlaybackMode: "direct",
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
    render(<PlaybackTab />);

    expect(await screen.findByText("Database busy")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save Settings" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Preferred Quality")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByLabelText("Preferred Quality")).toHaveValue(
      "720p"
    );
    expect(screen.getByLabelText("Preferred Playback Mode")).toHaveValue(
      "direct"
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
    render(<PlaybackTab />);

    fireEvent.change(await screen.findByLabelText("Preferred Quality"), {
      target: { value: "1080p" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith(
        "Playback settings saved successfully!"
      )
    );
    expect(mockApiPut).toHaveBeenCalledWith("/user/settings", {
      ...STORED,
      preferredQuality: "1080p",
    });
  });

  it("a failed save shows the server's message", async () => {
    mockApiGet.mockResolvedValue({ settings: STORED });
    mockApiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
    render(<PlaybackTab />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Save Settings" })
    );

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Database busy")
    );
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Settings" })).toBeEnabled();
  });

  it("the Playback tab offers no casting toggle", async () => {
    mockApiGet.mockResolvedValue({ settings: STORED });
    mockApiPut.mockResolvedValue({ success: true });
    render(<PlaybackTab />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Save Settings" })
    );

    expect(screen.queryByText(/Chromecast|AirPlay/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Chromecast|AirPlay/)).toBeNull();
    await waitFor(() => expect(mockApiPut).toHaveBeenCalled());
    expect(mockApiPut.mock.calls[0]?.[1]).not.toHaveProperty("enableCast");
  });
});
