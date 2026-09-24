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
import { beforeEach, describe, expect, it, vi } from "vitest";
// Import component after mocks
import UserEditModal from "../../../src/components/settings/UserEditModal";

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
      onSave?: () => void;
      onMessage?: (message: string) => void;
    } = {}
  ) => {
    const utils = render(
      <UserEditModal
        user={mockUser}
        groups={mockGroups}
        currentUser={mockCurrentUser}
        onClose={handlers.onClose ?? vi.fn()}
        onSave={handlers.onSave}
        onMessage={handlers.onMessage}
      />
    );
    await act(async () => {});
    return utils;
  };

  describe("Rendering", () => {
    it("renders user info correctly", async () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onSave={vi.fn()}
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
          onSave={vi.fn()}
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
          onSave={vi.fn()}
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
          onSave={vi.fn()}
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
          onSave={vi.fn()}
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
          onSave={vi.fn()}
          onMessage={onMessage}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Friends")).toBeInTheDocument();
      });

      // Find the Friends checkbox (unchecked initially since user is only in group 1)
      const checkboxes = screen.getAllByRole("checkbox");
      // Friends is the second group (index 1)
      fireEvent.click(checkboxes[1]);

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
          onSave={vi.fn()}
          onMessage={onMessage}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Family")).toBeInTheDocument();
      });

      // Find the Family checkbox (checked initially since user is in group 1)
      const checkboxes = screen.getAllByRole("checkbox");
      // Family is the first group (index 0)
      fireEvent.click(checkboxes[0]);

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
          onSave={vi.fn()}
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
          onSave={vi.fn()}
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
          onSave={vi.fn()}
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
          onSave={vi.fn()}
        />
      );

      expect(screen.getByText("Loading permissions...")).toBeInTheDocument();
    });
  });

  describe("Current User Restrictions", () => {
    it("disables account actions for current user", async () => {
      render(
        <UserEditModal
          user={mockCurrentUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      expect(
        screen.getByText(/cannot modify your own account/)
      ).toBeInTheDocument();
    });

    it("shows delete button for other users", async () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      expect(screen.getByText("Delete User")).toBeInTheDocument();
    });
  });

  describe("Modal Actions", () => {
    it("calls onClose when cancel is clicked", async () => {
      const onClose = vi.fn();
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={onClose}
          onSave={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText("Cancel"));
      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when X button is clicked", async () => {
      const onClose = vi.fn();
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={onClose}
          onSave={vi.fn()}
        />
      );

      const closeButton = screen.getByLabelText("Close");
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    });

    it("disables save button when no changes", () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const saveButton = screen.getByText("Save Changes");
      expect(saveButton).toBeDisabled();
    });
  });

  describe("Content Restrictions Section", () => {
    it("does not offer Manage Restrictions for admin accounts", async () => {
      render(
        <UserEditModal
          user={{ id: 3, username: "otheradmin", role: "ADMIN" }}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onSave={vi.fn()}
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

    it("offers Manage Restrictions for user accounts", async () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onSave={vi.fn()}
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
    it("deletes after confirmation, then closes and refreshes", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      mockApiDelete.mockResolvedValue({});
      const onClose = vi.fn();
      const onSave = vi.fn();
      const onMessage = vi.fn();

      await renderModal({ onClose, onSave, onMessage });
      fireEvent.click(screen.getByRole("button", { name: /Delete User/ }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(mockApiDelete).toHaveBeenCalledWith("/user/1");
      expect(onSave).toHaveBeenCalled();
      expect(onMessage).toHaveBeenCalledWith('User "testuser" deleted');
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

  describe("Saving and closing", () => {
    it("saves a changed role", async () => {
      mockApiPut.mockResolvedValue({});
      const onSave = vi.fn();
      const onMessage = vi.fn();

      await renderModal({ onSave, onMessage });
      fireEvent.change(screen.getByLabelText("Role"), {
        target: { value: "ADMIN" },
      });
      const save = screen.getByRole("button", { name: "Save Changes" });
      expect(save).toBeEnabled();
      fireEvent.click(save);

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(mockApiPut).toHaveBeenCalledWith("/user/1/role", {
        role: "ADMIN",
      });
      expect(onMessage).toHaveBeenCalledWith('User "testuser" updated');
    });

    it("does not send the role when it is back to the saved value", async () => {
      mockAddGroupMember.mockResolvedValue({});
      const onSave = vi.fn();

      await renderModal({ onSave });
      await waitFor(() =>
        expect(screen.getAllByRole("checkbox")[0]).toBeChecked()
      );
      fireEvent.click(screen.getAllByRole("checkbox")[1]);
      await waitFor(() => expect(mockAddGroupMember).toHaveBeenCalled());
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(mockApiPut).not.toHaveBeenCalled();
    });

    it("shows the error when saving fails", async () => {
      mockApiPut.mockRejectedValue(new Error("Role change refused"));
      const onSave = vi.fn();

      await renderModal({ onSave });
      fireEvent.change(screen.getByLabelText("Role"), {
        target: { value: "ADMIN" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      expect(
        await screen.findByText("Role change refused")
      ).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
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
      expect(
        screen.getByRole("button", { name: "Save Changes" })
      ).toBeDisabled();
    });

    it("asks before discarding changes, and stays open on No", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const onClose = vi.fn();

      await renderModal({ onClose });
      fireEvent.change(screen.getByLabelText("Role"), {
        target: { value: "ADMIN" },
      });
      fireEvent.click(screen.getByLabelText("Close"));

      expect(confirmSpy).toHaveBeenCalledWith(
        "You have unsaved changes. Discard them?"
      );
      expect(onClose).not.toHaveBeenCalled();

      confirmSpy.mockReturnValue(true);
      fireEvent.click(screen.getByLabelText("Close"));
      expect(onClose).toHaveBeenCalled();
      confirmSpy.mockRestore();
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
      fireEvent.change(selects[1], { target: { value: "true" } });

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
      fireEvent.change(selects[index], { target: { value } });

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
      fireEvent.change(selects[0], { target: { value: "false" } });

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
      fireEvent.click(screen.getAllByRole("checkbox")[1]);

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
          onSave={vi.fn()}
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
          onSave={vi.fn()}
        />
      );

      const roleDropdown = screen.getByLabelText("Role");
      const options = roleDropdown.querySelectorAll("option");

      expect(options.length).toBe(2);
      expect(options[0]).toHaveValue("USER");
      expect(options[1]).toHaveValue("ADMIN");
    });
  });
});
