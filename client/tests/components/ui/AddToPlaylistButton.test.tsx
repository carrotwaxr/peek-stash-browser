import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost } from "../../../src/api";
import { ApiError } from "../../../src/api/client";
import AddToPlaylistButton from "../../../src/components/ui/AddToPlaylistButton";
import { showError, showWarning } from "../../../src/utils/toast";

vi.mock("../../../src/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("../../../src/api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
}));

vi.mock("../../../src/components/icons/index", () => ({
  ThemedIcon: () => null,
}));

describe("AddToPlaylistButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiGet).mockImplementation((path: string) =>
      Promise.resolve(
        path === "/playlists"
          ? { playlists: [{ id: "p1", name: "Mine", sceneCount: 0 }] }
          : { playlists: [] }
      )
    );
    vi.mocked(apiPost).mockResolvedValue({});
  });

  it("with scenes, each POST carries its scene's instance", async () => {
    render(
      <AddToPlaylistButton
        scenes={[
          { id: "1", instanceId: "inst-a" },
          { id: "1", instanceId: "inst-b" },
        ]}
      />
    );

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("Mine"));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
    expect(apiPost).toHaveBeenNthCalledWith(1, "/playlists/p1/items", {
      sceneId: "1",
      instanceId: "inst-a",
    });
    expect(apiPost).toHaveBeenNthCalledWith(2, "/playlists/p1/items", {
      sceneId: "1",
      instanceId: "inst-b",
    });
  });

  it("a 409 counts as already in the playlist", async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError("Scene already in playlist", 409));

    render(
      <AddToPlaylistButton
        scenes={[
          { id: "1", instanceId: "inst-a" },
          { id: "1", instanceId: "inst-b" },
        ]}
      />
    );

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("Mine"));

    await waitFor(() =>
      expect(showWarning).toHaveBeenCalledWith(
        "Added 1 scenes, 1 already in playlist"
      )
    );
    expect(showError).not.toHaveBeenCalled();
  });

  it("any other refusal is an error, not already there", async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(
      new ApiError("Scene not found", 404)
    );

    render(
      <AddToPlaylistButton scenes={[{ id: "1", instanceId: "inst-a" }]} />
    );

    fireEvent.click(screen.getByTitle("Add to playlist"));
    fireEvent.click(await screen.findByText("Mine"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Failed to add to playlist")
    );
    expect(showWarning).not.toHaveBeenCalled();
  });
});
