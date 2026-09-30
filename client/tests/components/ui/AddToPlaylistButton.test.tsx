import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost } from "../../../src/api";
import AddToPlaylistButton from "../../../src/components/ui/AddToPlaylistButton";

vi.mock("../../../src/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("../../../src/api/client", () => ({
  ApiError: class ApiError extends Error {
    status = 0;
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
});
