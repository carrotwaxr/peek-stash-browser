/**
 * The share dialog lists the owner's current groups; saving sends only
 * those, so a stored share for a group the owner left is dropped rather
 * than refused (PM-23).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { jsonResponse, stubApi } from "@tests/helpers/stubApi";
import { afterEach, describe, expect, it, vi } from "vitest";
import SharePlaylistModal from "@/components/playlists/SharePlaylistModal";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SharePlaylistModal", () => {
  it("saving sends only groups the owner belongs to, dropping a stored share for a group they left", async () => {
    const fetchMock = stubApi({
      "/groups/user/mine": () =>
        jsonResponse(200, {
          groups: [
            { id: 1, name: "Friends" },
            { id: 3, name: "Family" },
          ],
        }),
      "/playlists/5/shares": (_url, init) =>
        init?.method === "PUT"
          ? jsonResponse(200, { shares: [] })
          : jsonResponse(200, {
              shares: [
                { groupId: 1, groupName: "Friends", sharedAt: "2026-01-01" },
                // The owner left group 2; its share is still stored
                { groupId: 2, groupName: "Old club", sharedAt: "2026-01-01" },
              ],
            }),
    });
    const onClose = vi.fn();
    render(
      <SharePlaylistModal
        playlistId={5}
        playlistName="Mine"
        isOpen
        onClose={onClose}
      />
    );

    expect(await screen.findByLabelText("Friends")).toBeChecked();
    expect(screen.getByLabelText("Family")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Family"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const puts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "PUT"
    );
    expect(puts.map(([, init]) => init?.body)).toEqual([
      JSON.stringify({ groupIds: [1, 3] }),
    ]);
  });
  it("the share dialog has role dialog and closes on Escape", async () => {
    stubApi({
      "/groups/user/mine": () => jsonResponse(200, { groups: [] }),
      "/playlists/5/shares": () => jsonResponse(200, { shares: [] }),
    });
    const onClose = vi.fn();
    render(
      <ShortcutScopeProvider>
        <SharePlaylistModal
          playlistId={5}
          playlistName="Mine"
          isOpen
          onClose={onClose}
        />
      </ShortcutScopeProvider>
    );

    expect(
      screen.getByRole("dialog", { name: "Share Playlist" })
    ).toBeInTheDocument();
    expect(
      await screen.findByText("You are not a member of any groups.")
    ).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalled();
  });
});
