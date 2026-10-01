import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SyncFromStashModal from "../../../src/components/settings/SyncFromStashModal";
import { ShortcutScopeProvider } from "../../../src/contexts/ShortcutScopeContext";

const { mockApiPost } = vi.hoisted(() => ({ mockApiPost: vi.fn() }));

vi.mock("../../../src/api", () => ({ apiPost: mockApiPost }));

const user = { id: 4, username: "alice" } as Parameters<
  typeof SyncFromStashModal
>[0]["user"];

describe("SyncFromStashModal", () => {
  beforeEach(() => vi.clearAllMocks());

  const renderModal = () => {
    const onClose = vi.fn();
    render(
      <ShortcutScopeProvider>
        <SyncFromStashModal
          user={user}
          onClose={onClose}
          onSyncComplete={vi.fn()}
        />
      </ShortcutScopeProvider>
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
});
