/**
 * UserEditModal Component Tests
 *
 * Tests user management modal functionality:
 * - Rendering user information
 * - Group membership display and toggling
 * - Permission inheritance labels
 * - Current user restrictions
 * - Close/cancel behavior
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Import component after mocks
import UserEditModal from "../../../src/components/settings/UserEditModal";
import { ShortcutScopeProvider } from "../../../src/contexts/ShortcutScopeContext";

// Use vi.hoisted to create mock functions that can be accessed in vi.mock
const {
  mockGetUserGroupMemberships,
  mockAddGroupMember,
  mockRemoveGroupMember,
  mockGetUserPermissions,
  mockUpdateUserPermissionOverrides,
  mockAdminResetPassword,
  mockAdminRegenerateRecoveryKey,
  mockApiDelete,
  mockApiGet,
  mockApiPut,
} = vi.hoisted(() => ({
  mockGetUserGroupMemberships: vi.fn(),
  mockAddGroupMember: vi.fn(),
  mockRemoveGroupMember: vi.fn(),
  mockGetUserPermissions: vi.fn(),
  mockUpdateUserPermissionOverrides: vi.fn(),
  mockAdminResetPassword: vi.fn(),
  mockAdminRegenerateRecoveryKey: vi.fn(),
  mockApiDelete: vi.fn(),
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

// Mock API functions
vi.mock("../../../src/api", () => ({
  getUserGroupMemberships: mockGetUserGroupMemberships,
  addGroupMember: mockAddGroupMember,
  removeGroupMember: mockRemoveGroupMember,
  getUserPermissions: mockGetUserPermissions,
  updateUserPermissionOverrides: mockUpdateUserPermissionOverrides,
  adminResetPassword: mockAdminResetPassword,
  adminRegenerateRecoveryKey: mockAdminRegenerateRecoveryKey,
  apiDelete: mockApiDelete,
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

// The restrictions editor's pickers load entities; a plain select stands in
vi.mock("../../../src/components/ui/SearchableSelect", () => ({
  default: ({ placeholder }: { placeholder?: string }) => (
    <select multiple aria-label={placeholder} />
  ),
}));

describe("UserEditModal", () => {
  const mockUser = {
    id: 1,
    username: "testuser",
    role: "USER",
  };

  const mockCurrentUser = {
    id: 2,
    username: "admin",
    role: "ADMIN",
  };

  const mockGroups = [
    { id: 1, name: "Family", description: "Family members" },
    { id: 2, name: "Friends", description: null },
  ];

  const mockPermissions = {
    canShare: true,
    canDownloadFiles: false,
    canDownloadPlaylists: false,
    sources: {
      canShare: "Family",
      canDownloadFiles: "default",
      canDownloadPlaylists: "default",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserGroupMemberships.mockResolvedValue({ groups: [{ id: 1 }] });
    mockGetUserPermissions.mockResolvedValue({ permissions: mockPermissions });
  });

  // Renders for another user and lets the membership and permission loads settle
  const renderModal = async (
    handlers: {
      onClose?: () => void;
      onChanged?: () => void;
      onDeleted?: (username: string) => void;
      onMessage?: (message: string) => void;
    } = {}
  ) => {
    const utils = render(
      <UserEditModal
        user={mockUser}
        groups={mockGroups}
        currentUser={mockCurrentUser}
        onClose={handlers.onClose ?? vi.fn()}
        onChanged={handlers.onChanged}
        onDeleted={handlers.onDeleted}
        onMessage={handlers.onMessage}
      />
    );
    await act(async () => {});
    return utils;
  };

  // The footer's Close button (the header's X is also named Close)
  const footerClose = () =>
    must(
      screen.getAllByRole("button", { name: "Close" }).at(-1),
      "footer Close"
    );

  const permissionSelects = () =>
    screen.getAllByRole("combobox").filter((el) => el.id !== "userRole");

  describe("Rendering", () => {
    it("renders user info correctly", () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("Edit User: testuser")).toBeInTheDocument();
      // Username is shown in the read-only field
      expect(screen.getAllByText("testuser").length).toBeGreaterThan(0);
    });

    it("returns null when user is not provided", () => {
      const { container } = render(
        <UserEditModal
          user={null}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Groups Section", () => {
    it("displays groups with correct membership state", async () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Family")).toBeInTheDocument();
        expect(screen.getByText("Friends")).toBeInTheDocument();
      });
    });

    it("shows group description when available", async () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Family members")).toBeInTheDocument();
      });
    });

    it("shows message when no groups exist", () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={[]}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      expect(
        screen.getByText(
          "No groups available. Create a group first to assign users."
        )
      ).toBeInTheDocument();
    });

    it("toggles group membership - adding to group", async () => {
      mockAddGroupMember.mockResolvedValue({});
      const onMessage = vi.fn();

      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onMessage={onMessage}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Friends")).toBeInTheDocument();
      });

      // Find the Friends checkbox (unchecked initially since user is only in group 1)
      const checkboxes = screen.getAllByRole("checkbox");
      // Friends is the second group (index 1)
      fireEvent.click(must(checkboxes[1]));

      await waitFor(() => {
        expect(mockAddGroupMember).toHaveBeenCalledWith("2", 1);
      });

      await waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith("Added testuser to group");
      });
    });

    it("toggles group membership - removing from group", async () => {
      mockRemoveGroupMember.mockResolvedValue({});
      const onMessage = vi.fn();

      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onMessage={onMessage}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Family")).toBeInTheDocument();
      });

      // Find the Family checkbox (checked initially since user is in group 1)
      const checkboxes = screen.getAllByRole("checkbox");
      // Family is the first group (index 0)
      fireEvent.click(must(checkboxes[0]));

      await waitFor(() => {
        expect(mockRemoveGroupMember).toHaveBeenCalledWith("1", "1");
      });

      await waitFor(() => {
        expect(onMessage).toHaveBeenCalledWith("Removed testuser from group");
      });
    });
  });

  describe("Permissions Section", () => {
    it("shows inheritance label for permissions", async () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Inherited from: Family/)).toBeInTheDocument();
      });
    });

    it("shows default label for permissions with no group source", async () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      // Wait for permissions to load, then check for default labels
      // There are two permissions with "default" source in mockPermissions
      await waitFor(() => {
        const defaultLabels = screen.getAllByText(
          "Default (no groups grant this)"
        );
        expect(defaultLabels.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows override label for overridden permissions", async () => {
      const overriddenPermissions = {
        canShare: true,
        canDownloadFiles: true,
        canDownloadPlaylists: false,
        sources: {
          canShare: "override",
          canDownloadFiles: "default",
          canDownloadPlaylists: "default",
        },
      };
      mockGetUserPermissions.mockResolvedValue({
        permissions: overriddenPermissions,
      });

      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Overridden \(user-level\)/)
        ).toBeInTheDocument();
      });
    });

    it("shows loading state while permissions load", () => {
      // Return a promise that never resolves to simulate loading
      mockGetUserPermissions.mockReturnValue(new Promise(() => {}));

      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("Loading permissions...")).toBeInTheDocument();
    });
  });

  describe("Current User Restrictions", () => {
    it("disables account actions for current user", () => {
      render(
        <UserEditModal
          user={mockCurrentUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      expect(
        screen.getByText(/cannot modify your own account/)
      ).toBeInTheDocument();
    });

    it("shows delete button for other users", () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("Delete User")).toBeInTheDocument();
    });
  });

  describe("Modal Actions", () => {
    it("has only a Close button in the footer", async () => {
      const onClose = vi.fn();
      await renderModal({ onClose });

      expect(
        screen.queryByRole("button", { name: "Save Changes" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cancel" })
      ).not.toBeInTheDocument();
      fireEvent.click(footerClose());
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when X button is clicked", () => {
      const onClose = vi.fn();
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={onClose}
        />
      );

      const closeButton = screen.getByLabelText("Close");
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Content Restrictions Section", () => {
    it("does not offer Manage Restrictions for admin accounts", () => {
      render(
        <UserEditModal
          user={{ id: 3, username: "otheradmin", role: "ADMIN" }}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      expect(
        screen.getByText(/do not apply to administrators/)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Manage Restrictions/ })
      ).not.toBeInTheDocument();
    });

    it("opens the restrictions editor and reports a save", async () => {
      mockApiGet.mockResolvedValue({ restrictions: [] });
      mockApiPut.mockResolvedValue({ success: true });
      const onMessage = vi.fn();

      await renderModal({ onMessage });
      fireEvent.click(
        screen.getByRole("button", { name: /Manage Restrictions/ })
      );

      expect(
        await screen.findByText("Configure content visibility for testuser")
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Save Restrictions" })
        ).toBeEnabled()
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Save Restrictions" })
      );

      await waitFor(() =>
        expect(onMessage).toHaveBeenCalledWith(
          "Content restrictions updated for testuser"
        )
      );
      expect(mockApiPut).toHaveBeenCalledWith("/user/1/restrictions", {
        restrictions: [],
      });
      expect(
        screen.queryByText("Configure content visibility for testuser")
      ).not.toBeInTheDocument();
    });

    it("offers Manage Restrictions for user accounts", () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      expect(
        screen.getByRole("button", { name: /Manage Restrictions/ })
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/do not apply to administrators/)
      ).not.toBeInTheDocument();
    });
  });

  describe("Recovery key", () => {
    it("regenerates the key after confirmation and shows it to the admin", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      mockAdminRegenerateRecoveryKey.mockResolvedValue({
        success: true,
        recoveryKey: "NEWK-EYAB-CDEF",
      });
      const onMessage = vi.fn();

      await renderModal({ onMessage });
      fireEvent.click(
        screen.getByRole("button", { name: /Regenerate Recovery Key/ })
      );

      expect(
        await screen.findByText("New recovery key (show to user):")
      ).toBeInTheDocument();
      expect(screen.getByText("NEWK-EYAB-CDEF")).toBeInTheDocument();
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('Regenerate recovery key for "testuser"?')
      );
      expect(mockAdminRegenerateRecoveryKey).toHaveBeenCalledWith(1);
      expect(onMessage).toHaveBeenCalledWith(
        "Recovery key regenerated for testuser"
      );
      confirmSpy.mockRestore();
    });

    it("does nothing when the admin cancels the confirmation", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      await renderModal();
      fireEvent.click(
        screen.getByRole("button", { name: /Regenerate Recovery Key/ })
      );

      expect(mockAdminRegenerateRecoveryKey).not.toHaveBeenCalled();
      expect(
        screen.queryByText("New recovery key (show to user):")
      ).not.toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("shows the error when regenerating fails", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      mockAdminRegenerateRecoveryKey.mockRejectedValue(new Error(""));

      await renderModal();
      fireEvent.click(
        screen.getByRole("button", { name: /Regenerate Recovery Key/ })
      );

      expect(
        await screen.findByText("Failed to regenerate recovery key")
      ).toBeInTheDocument();
      expect(
        screen.queryByText("New recovery key (show to user):")
      ).not.toBeInTheDocument();
      confirmSpy.mockRestore();
    });
  });

  describe("Password reset", () => {
    const openReset = () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
      return screen.getByPlaceholderText(
        "New password (8+ chars, letter, number)"
      );
    };

    it.each([
      ["short1", "Password must be at least 8 characters"],
      ["12345678", "Password must contain at least one letter"],
      ["abcdefgh", "Password must contain at least one number"],
    ])("rejects %s before calling the server", async (password, message) => {
      await renderModal();
      fireEvent.change(openReset(), { target: { value: password } });
      fireEvent.click(screen.getByRole("button", { name: "Set" }));

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(mockAdminResetPassword).not.toHaveBeenCalled();
    });

    it("sets a valid password and closes the field", async () => {
      mockAdminResetPassword.mockResolvedValue({ success: true });
      const onMessage = vi.fn();

      await renderModal({ onMessage });
      fireEvent.change(openReset(), { target: { value: "NewPass123" } });
      fireEvent.click(screen.getByRole("button", { name: "Set" }));

      await waitFor(() =>
        expect(onMessage).toHaveBeenCalledWith("Password reset for testuser")
      );
      expect(mockAdminResetPassword).toHaveBeenCalledWith(1, "NewPass123");
      expect(
        screen.queryByPlaceholderText("New password (8+ chars, letter, number)")
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reset Password" })
      ).toBeInTheDocument();
    });

    it("keeps the field open and shows the server's error", async () => {
      mockAdminResetPassword.mockRejectedValue(new Error("Too common"));

      await renderModal();
      fireEvent.change(openReset(), { target: { value: "NewPass123" } });
      fireEvent.click(screen.getByRole("button", { name: "Set" }));

      expect(await screen.findByText("Too common")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("New password (8+ chars, letter, number)")
      ).toBeInTheDocument();
    });

    it("Cancel closes the field and clears it", async () => {
      await renderModal();
      fireEvent.change(openReset(), { target: { value: "draft" } });
      fireEvent.click(
        within(
          screen
            .getByPlaceholderText("New password (8+ chars, letter, number)")
            .closest("div") as HTMLElement
        ).getByRole("button", { name: "Cancel" })
      );

      expect(
        screen.queryByPlaceholderText("New password (8+ chars, letter, number)")
      ).not.toBeInTheDocument();
      expect(openReset()).toHaveValue("");
    });
  });

  describe("Deleting a user", () => {
    it('Delete User DELETEs and reports \'User "x" deleted\' through onDeleted, with no "updated" message after it', async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      mockApiDelete.mockResolvedValue({});
      const onClose = vi.fn();
      const onChanged = vi.fn();
      const onDeleted = vi.fn();
      const onMessage = vi.fn();

      await renderModal({ onClose, onChanged, onDeleted, onMessage });
      fireEvent.click(screen.getByRole("button", { name: /Delete User/ }));

      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("testuser"));
      expect(mockApiDelete).toHaveBeenCalledWith("/user/1");
      expect(onClose).toHaveBeenCalledTimes(1);
      // The section words the message; nothing "updated" follows it
      expect(onMessage).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("does nothing when the admin cancels the confirmation", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const onClose = vi.fn();

      await renderModal({ onClose });
      fireEvent.click(screen.getByRole("button", { name: /Delete User/ }));

      expect(mockApiDelete).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("shows the error when deleting fails", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      mockApiDelete.mockRejectedValue(new Error("Last admin"));
      const onClose = vi.fn();

      await renderModal({ onClose });
      fireEvent.click(screen.getByRole("button", { name: /Delete User/ }));

      expect(await screen.findByText("Last admin")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe("Saving each change at once", () => {
    it("changing a permission override saves it at once and shows Saved beside the control; closing then asks nothing", async () => {
      const confirmSpy = vi.spyOn(window, "confirm");
      mockUpdateUserPermissionOverrides.mockResolvedValue({
        permissions: {
          ...mockPermissions,
          canDownloadFiles: true,
          sources: { ...mockPermissions.sources, canDownloadFiles: "override" },
        },
      });
      const onClose = vi.fn();

      await renderModal({ onClose });
      await screen.findByText(/Inherited from: Family/);
      const select = must(permissionSelects()[1], "Can download files");
      fireEvent.change(select, { target: { value: "true" } });

      await waitFor(() => expect(select).toHaveAccessibleDescription("Saved"));
      expect(mockUpdateUserPermissionOverrides).toHaveBeenCalledWith(1, {
        canDownloadFilesOverride: true,
      });
      expect(select).toHaveValue("true");

      fireEvent.click(footerClose());

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      confirmSpy.mockRestore();
    });

    it("changing the role asks to confirm (Make <name> an admin?), and on confirm PUTs /user/:id/role and shows Saved", async () => {
      mockApiPut.mockResolvedValue({});

      await renderModal();
      const role = screen.getByLabelText("Role");
      fireEvent.change(role, { target: { value: "ADMIN" } });

      const confirm = screen.getByRole("dialog", {
        name: "Make testuser an admin?",
      });
      expect(mockApiPut).not.toHaveBeenCalled();
      expect(role).toHaveValue("USER");
      fireEvent.click(
        within(confirm).getByRole("button", { name: "Make admin" })
      );

      await waitFor(() => expect(role).toHaveAccessibleDescription("Saved"));
      expect(mockApiPut).toHaveBeenCalledWith("/user/1/role", {
        role: "ADMIN",
      });
      expect(role).toHaveValue("ADMIN");
      expect(
        screen.queryByRole("dialog", { name: "Make testuser an admin?" })
      ).not.toBeInTheDocument();
      // An admin is never restricted, so the editor goes with the saved role
      expect(
        screen.getByText(/do not apply to administrators/)
      ).toBeInTheDocument();
    });

    it("asks before making an admin a regular user", async () => {
      mockApiPut.mockResolvedValue({});
      render(
        <UserEditModal
          user={{ id: 3, username: "otheradmin", role: "ADMIN" }}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );
      await act(async () => {});

      fireEvent.change(screen.getByLabelText("Role"), {
        target: { value: "USER" },
      });
      const confirm = screen.getByRole("dialog", {
        name: "Make otheradmin a regular user?",
      });
      fireEvent.click(
        within(confirm).getByRole("button", { name: "Make user" })
      );

      await waitFor(() =>
        expect(mockApiPut).toHaveBeenCalledWith("/user/3/role", {
          role: "USER",
        })
      );
      expect(screen.getByLabelText("Role")).toHaveValue("USER");
    });

    it("cancel leaves the role as it was", async () => {
      const onClose = vi.fn();
      const onChanged = vi.fn();

      await renderModal({ onClose, onChanged });
      const role = screen.getByLabelText("Role");
      fireEvent.change(role, { target: { value: "ADMIN" } });
      const confirm = screen.getByRole("dialog", {
        name: "Make testuser an admin?",
      });
      fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByRole("dialog", { name: "Make testuser an admin?" })
      ).not.toBeInTheDocument();
      expect(mockApiPut).not.toHaveBeenCalled();
      expect(role).toHaveValue("USER");
      fireEvent.click(footerClose());
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onChanged).not.toHaveBeenCalled();
    });

    it("a failed write shows the error beside the control and reverts the control to the stored value", async () => {
      mockUpdateUserPermissionOverrides.mockRejectedValue(
        new Error("Override refused")
      );
      mockApiPut.mockRejectedValue(new Error("Role change refused"));

      await renderModal();
      await screen.findByText(/Inherited from: Family/);
      const share = must(permissionSelects()[0], "Can share");
      fireEvent.change(share, { target: { value: "false" } });

      await waitFor(() =>
        expect(share).toHaveAccessibleDescription("Override refused")
      );
      expect(share).toHaveValue("inherit");

      const role = screen.getByLabelText("Role");
      fireEvent.change(role, { target: { value: "ADMIN" } });
      fireEvent.click(
        within(
          screen.getByRole("dialog", { name: "Make testuser an admin?" })
        ).getByRole("button", { name: "Make admin" })
      );

      await waitFor(() =>
        expect(role).toHaveAccessibleDescription("Role change refused")
      );
      expect(role).toHaveValue("USER");
    });

    it("closing after any write calls onChanged once", async () => {
      mockAddGroupMember.mockResolvedValue({});
      mockUpdateUserPermissionOverrides.mockResolvedValue({
        permissions: mockPermissions,
      });
      const onClose = vi.fn();
      const onChanged = vi.fn();

      await renderModal({ onClose, onChanged });
      await waitFor(() =>
        expect(screen.getAllByRole("checkbox")[0]).toBeChecked()
      );
      const friends = must(screen.getAllByRole("checkbox")[1], "Friends");
      fireEvent.click(friends);
      await waitFor(() => expect(friends).toHaveAccessibleDescription("Saved"));
      fireEvent.change(must(permissionSelects()[2], "Can download playlists"), {
        target: { value: "false" },
      });
      await waitFor(() =>
        expect(mockUpdateUserPermissionOverrides).toHaveBeenCalled()
      );
      expect(onChanged).not.toHaveBeenCalled();

      fireEvent.click(footerClose());

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it("closing with no write does not call onChanged", async () => {
      mockAddGroupMember.mockRejectedValue(new Error("Group gone"));
      const onClose = vi.fn();
      const onChanged = vi.fn();

      await renderModal({ onClose, onChanged });
      await waitFor(() =>
        expect(screen.getAllByRole("checkbox")[0]).toBeChecked()
      );
      fireEvent.click(must(screen.getAllByRole("checkbox")[1], "Friends"));
      await screen.findByText("Group gone");
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onChanged).not.toHaveBeenCalled();
    });

    it("does not let an admin change their own role", async () => {
      render(
        <UserEditModal
          user={mockCurrentUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );
      await act(async () => {});

      fireEvent.change(screen.getByLabelText("Role"), {
        target: { value: "USER" },
      });

      expect(
        screen.getByText("You cannot change your own role")
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Role")).toHaveValue("ADMIN");
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(mockApiPut).not.toHaveBeenCalled();
    });
  });

  describe("Permission overrides", () => {
    it("sends a forced value and shows the updated permissions", async () => {
      mockUpdateUserPermissionOverrides.mockResolvedValue({
        permissions: {
          ...mockPermissions,
          canDownloadFiles: true,
          sources: { ...mockPermissions.sources, canDownloadFiles: "override" },
        },
      });
      const onMessage = vi.fn();

      await renderModal({ onMessage });
      await screen.findByText(/Inherited from: Family/);
      const selects = screen
        .getAllByRole("combobox")
        .filter((el) => el.id !== "userRole");
      fireEvent.change(must(selects[1]), { target: { value: "true" } });

      await waitFor(() =>
        expect(onMessage).toHaveBeenCalledWith(
          "Permission updated for testuser"
        )
      );
      expect(mockUpdateUserPermissionOverrides).toHaveBeenCalledWith(1, {
        canDownloadFilesOverride: true,
      });
      expect(screen.getByText(/Overridden \(user-level\)/)).toBeInTheDocument();
    });

    it.each([
      [0, "inherit", { canShareOverride: null }],
      [2, "false", { canDownloadPlaylistsOverride: false }],
    ])("select %i set to %s sends %o", async (index, value, expected) => {
      mockUpdateUserPermissionOverrides.mockResolvedValue({
        permissions: mockPermissions,
      });

      await renderModal();
      await screen.findByText(/Inherited from: Family/);
      const selects = screen
        .getAllByRole("combobox")
        .filter((el) => el.id !== "userRole");
      fireEvent.change(must(selects[index]), { target: { value } });

      await waitFor(() =>
        expect(mockUpdateUserPermissionOverrides).toHaveBeenCalledWith(
          1,
          expected
        )
      );
    });

    it("shows the error when an override fails", async () => {
      mockUpdateUserPermissionOverrides.mockRejectedValue(new Error(""));

      await renderModal();
      await screen.findByText(/Inherited from: Family/);
      const selects = screen
        .getAllByRole("combobox")
        .filter((el) => el.id !== "userRole");
      fireEvent.change(must(selects[0]), { target: { value: "false" } });

      expect(
        await screen.findByText("Failed to update permission")
      ).toBeInTheDocument();
    });
  });

  describe("Load and group errors", () => {
    it("still renders when groups and permissions fail to load", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGetUserGroupMemberships.mockRejectedValue(new Error("offline"));
      mockGetUserPermissions.mockRejectedValue(new Error("offline"));

      await renderModal();

      await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(2));
      expect(screen.getByText("Loading permissions...")).toBeInTheDocument();
      for (const box of screen.getAllByRole("checkbox")) {
        expect(box).not.toBeChecked();
      }
      errorSpy.mockRestore();
    });

    it("treats a membership response without groups as no groups", async () => {
      mockGetUserGroupMemberships.mockResolvedValue({});

      await renderModal();

      await screen.findByText(/Inherited from: Family/);
      for (const box of screen.getAllByRole("checkbox")) {
        expect(box).not.toBeChecked();
      }
    });

    it("shows the error when a group change fails", async () => {
      mockAddGroupMember.mockRejectedValue(new Error("Group gone"));

      await renderModal();
      await waitFor(() =>
        expect(screen.getAllByRole("checkbox")[0]).toBeChecked()
      );
      fireEvent.click(must(screen.getAllByRole("checkbox")[1]));

      expect(await screen.findByText("Group gone")).toBeInTheDocument();
      expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked();
    });
  });

  describe("Role Selection", () => {
    it("shows role dropdown", () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      const roleDropdown = screen.getByLabelText("Role");
      expect(roleDropdown).toBeInTheDocument();
      expect(roleDropdown).toHaveValue("USER");
    });

    it("has User and Admin role options", () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
        />
      );

      const roleDropdown = screen.getByLabelText("Role");
      const options = roleDropdown.querySelectorAll("option");

      expect(options.length).toBe(2);
      expect(options[0]).toHaveValue("USER");
      expect(options[1]).toHaveValue("ADMIN");
    });
  });
  describe("Dialog", () => {
    const renderInScopes = (onClose = vi.fn()) => {
      render(
        <ShortcutScopeProvider>
          <UserEditModal
            user={mockUser}
            groups={mockGroups}
            currentUser={mockCurrentUser}
            onClose={onClose}
          />
        </ShortcutScopeProvider>
      );
      return onClose;
    };

    it("opens as a dialog named Edit User", async () => {
      renderInScopes();
      await act(async () => {});

      expect(
        screen.getByRole("dialog", { name: "Edit User: testuser" })
      ).toBeInTheDocument();
    });

    it("Escape closes it", async () => {
      const onClose = renderInScopes();
      await act(async () => {});

      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Escape closes the restrictions modal first, then the user modal", async () => {
      mockApiGet.mockResolvedValue({ restrictions: [] });
      const onClose = renderInScopes();
      await act(async () => {});
      fireEvent.click(
        screen.getByRole("button", { name: /Manage Restrictions/ })
      );
      await screen.findByRole("dialog", { name: "Content Restrictions" });

      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });

      expect(
        screen.queryByRole("dialog", { name: "Content Restrictions" })
      ).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(
        screen.getByRole("dialog", { name: "Edit User: testuser" })
      ).toBeInTheDocument();

      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
