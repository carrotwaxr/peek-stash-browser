import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GroupModal from "../../../src/components/settings/GroupModal";
import { ShortcutScopeProvider } from "../../../src/contexts/ShortcutScopeContext";

vi.mock("../../../src/api", () => ({
  addGroupMember: vi.fn(),
  createGroup: vi.fn(),
  getGroup: vi.fn(),
  removeGroupMember: vi.fn(),
  updateGroup: vi.fn(),
}));

describe("GroupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = (group: Parameters<typeof GroupModal>[0]["group"]) => {
    const onClose = vi.fn();
    render(
      <ShortcutScopeProvider>
        <GroupModal group={group} onClose={onClose} />
      </ShortcutScopeProvider>
    );
    return onClose;
  };

  it("opens as a dialog named Create Group for a new group", () => {
    renderModal(null);

    expect(
      screen.getByRole("dialog", { name: "Create Group" })
    ).toBeInTheDocument();
  });

  it("opens as a dialog named for the group it edits", () => {
    renderModal({
      id: 3,
      name: "Family",
      canShare: false,
      canDownloadFiles: false,
      canDownloadPlaylists: false,
    });

    expect(
      screen.getByRole("dialog", { name: "Edit Group: Family" })
    ).toBeInTheDocument();
  });

  it("focuses the name field on open", () => {
    renderModal(null);

    expect(screen.getByLabelText(/^Name/)).toHaveFocus();
  });

  it("Escape closes it without saving", () => {
    const onClose = renderModal(null);

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalledWith(false);
  });
});
