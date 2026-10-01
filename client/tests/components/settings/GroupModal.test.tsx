import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addGroupMember, getGroup } from "../../../src/api";
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

  const renderModal = (
    group: Parameters<typeof GroupModal>[0]["group"],
    users: Parameters<typeof GroupModal>[0]["users"] = []
  ) => {
    const onClose = vi.fn();
    render(
      <ShortcutScopeProvider>
        <GroupModal group={group} users={users} onClose={onClose} />
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

  it("adding a member then Cancel reloads the groups and users", async () => {
    // The member edit is already saved, so Cancel reports a write: the
    // section then reloads the groups and users (UserManagementSection.test)
    vi.mocked(getGroup).mockResolvedValue({
      group: {
        id: 3,
        name: "Family",
        description: null,
        canShare: false,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        members: [],
      },
    });
    vi.mocked(addGroupMember).mockResolvedValue({});
    const onClose = renderModal({ id: 3, name: "Family" }, [
      { id: 9, username: "viewer", role: "USER" },
    ]);
    await screen.findByText("Members (0)");

    fireEvent.change(screen.getByDisplayValue("Select a user to add..."), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(addGroupMember).toHaveBeenCalledWith("3", 9));
    await screen.findByText("Members (1)");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledWith(true);
  });
});
