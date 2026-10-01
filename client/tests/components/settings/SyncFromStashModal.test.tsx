import type {
  SyncFromStashBody,
  SyncFromStashResponse,
} from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SyncFromStashModal from "../../../src/components/settings/SyncFromStashModal";
import { ShortcutScopeProvider } from "../../../src/contexts/ShortcutScopeContext";

const { mockApiPost, mockInvalidate, auth } = vi.hoisted(() => ({
  mockApiPost: vi.fn(),
  mockInvalidate: vi.fn(),
  auth: { userId: 1 },
}));

vi.mock("../../../src/api", () => ({ apiPost: mockApiPost }));
vi.mock("../../../src/api/hooks/useLibraryReady", () => ({
  invalidateLibraryQueries: mockInvalidate,
}));
vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: auth.userId, username: "admin" } }),
}));

const zero = { checked: 0, updated: 0, created: 0 };
const answer = (
  over: Partial<SyncFromStashResponse> = {}
): SyncFromStashResponse => ({
  success: true,
  message: "Successfully synced ratings and favorites from Stash",
  stats: {
    scenes: { checked: 1200, updated: 3, created: 2 },
    performers: zero,
    studios: zero,
    tags: zero,
    galleries: zero,
    groups: zero,
    images: zero,
  },
  failedInstances: [],
  ...over,
});

const user = { id: 4, username: "alice" } as Parameters<
  typeof SyncFromStashModal
>[0]["user"];

describe("SyncFromStashModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.userId = 1;
  });

  const renderModal = (onSyncComplete = vi.fn()) => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ShortcutScopeProvider>
          <SyncFromStashModal
            user={user}
            onClose={onClose}
            onSyncComplete={onSyncComplete}
          />
        </ShortcutScopeProvider>
      </QueryClientProvider>
    );
    return onClose;
  };

  it("opens as a dialog named Sync from Stash", () => {
    renderModal();

    expect(
      screen.getByRole("dialog", { name: "Sync from Stash" })
    ).toBeInTheDocument();
  });

  it("Escape closes it", () => {
    const onClose = renderModal();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape does nothing while syncing", async () => {
    mockApiPost.mockReturnValue(new Promise(() => {}));
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalled());

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("posts the chosen options as SyncFromStashBody to /user/:id/sync-from-stash", async () => {
    mockApiPost.mockResolvedValue(answer());
    renderModal();
    // Scenes' O counter is off by default; turn it on
    const scenes = screen.getByRole("heading", {
      name: "Scenes",
    }).parentElement;
    fireEvent.click(
      within(scenes as HTMLElement).getByLabelText("O counter and dates")
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    const [path, body] = mockApiPost.mock.calls[0] as [
      string,
      SyncFromStashBody,
    ];
    expect(path).toBe("/user/4/sync-from-stash");
    expect(body.options).toEqual({
      scenes: {
        rating: true,
        favorite: false,
        oCounter: true,
        playCount: false,
      },
      performers: { rating: true, favorite: true },
      studios: { rating: true, favorite: true },
      tags: { rating: false, favorite: true },
      galleries: { rating: true },
      groups: { rating: true },
      images: { rating: true },
    });
  });

  it("shows each type's checked, created and updated counts", async () => {
    mockApiPost.mockResolvedValue(answer());
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));

    expect(
      await screen.findByText("Sync Completed Successfully")
    ).toBeVisible();
    const scenes = screen.getByText("Scenes").parentElement as HTMLElement;
    expect(scenes).toHaveTextContent("1,200 checked");
    expect(scenes).toHaveTextContent("2 new");
    expect(scenes).toHaveTextContent("3 updated");
  });

  it("a response with success false names the failed servers and reports a partial import, not success", async () => {
    mockApiPost.mockResolvedValue(
      answer({
        success: false,
        message: "Synced from Stash, except for Archive, which failed",
        failedInstances: [{ id: "lib2", name: "Archive" }],
      })
    );
    const onSyncComplete = vi.fn();
    renderModal(onSyncComplete);

    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));

    expect(await screen.findByText(/Partly imported/)).toHaveTextContent(
      "Archive"
    );
    expect(screen.queryByText("Sync Completed Successfully")).toBeNull();
    // The counts of the servers that did import stay visible
    expect(screen.getByText("Scenes").parentElement).toHaveTextContent(
      "1,200 checked"
    );
    expect(onSyncComplete).toHaveBeenCalledWith("alice", {
      partial: true,
      failedInstances: ["Archive"],
    });
  });

  it("a complete import reports no partial failure", async () => {
    mockApiPost.mockResolvedValue(answer());
    const onSyncComplete = vi.fn();
    renderModal(onSyncComplete);

    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));

    await screen.findByText("Sync Completed Successfully");
    expect(onSyncComplete).toHaveBeenCalledWith("alice", {
      partial: false,
      failedInstances: [],
    });
  });

  it("an error shows the message and keeps the options", async () => {
    mockApiPost.mockRejectedValue(new Error("Stash is down"));
    const onSyncComplete = vi.fn();
    renderModal(onSyncComplete);
    const scenes = screen.getByRole("heading", {
      name: "Scenes",
    }).parentElement;
    fireEvent.click(
      within(scenes as HTMLElement).getByLabelText("O counter and dates")
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));

    expect(await screen.findByText("Stash is down")).toBeVisible();
    expect(onSyncComplete).not.toHaveBeenCalled();
    expect(
      within(
        screen.getByRole("heading", { name: "Scenes" })
          .parentElement as HTMLElement
      ).getByLabelText("O counter and dates")
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Start Sync" })).toBeEnabled();
  });

  it("the dialog cannot close while syncing", async () => {
    mockApiPost.mockReturnValue(new Promise(() => {}));
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));
    await screen.findByText("Syncing from Stash...");

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("syncing the signed-in user's own account invalidates the library queries", async () => {
    auth.userId = 4;
    mockApiPost.mockResolvedValue(answer());
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));

    await screen.findByText("Sync Completed Successfully");
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it("syncing another user's account leaves the library queries alone", async () => {
    mockApiPost.mockResolvedValue(answer());
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Start Sync" }));

    await screen.findByText("Sync Completed Successfully");
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
