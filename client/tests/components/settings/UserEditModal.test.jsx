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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Use vi.hoisted to create mock functions that can be accessed in vi.mock
const {
  mockGetUserGroupMemberships,
  mockAddGroupMember,
  mockRemoveGroupMember,
  mockGetUserPermissions,
  mockUpdateUserPermissionOverrides,
} = vi.hoisted(() => ({
  mockGetUserGroupMemberships: vi.fn(),
  mockAddGroupMember: vi.fn(),
  mockRemoveGroupMember: vi.fn(),
  mockGetUserPermissions: vi.fn(),
  mockUpdateUserPermissionOverrides: vi.fn(),
}));

// Mock API functions
vi.mock("../../../src/services/api.js", () => ({
  getUserGroupMemberships: mockGetUserGroupMemberships,
  addGroupMember: mockAddGroupMember,
  removeGroupMember: mockRemoveGroupMember,
  getUserPermissions: mockGetUserPermissions,
  updateUserPermissionOverrides: mockUpdateUserPermissionOverrides,
}));

// Import component after mocks
import UserEditModal from "../../../src/components/settings/UserEditModal.jsx";

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
    { id: 1, name: "Family", description: "Family members", canShare: true },
    { id: 2, name: "Friends", description: null, canDownloadFiles: true },
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

  const mockApi = {
    put: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserGroupMemberships.mockResolvedValue({ groups: [{ id: 1 }] });
    mockGetUserPermissions.mockResolvedValue({ permissions: mockPermissions });
  });

  describe("Rendering", () => {
    it("renders user info correctly", async () => {
      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onSave={vi.fn()}
          api={mockApi}
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
          api={mockApi}
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
          api={mockApi}
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
          api={mockApi}
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
          api={mockApi}
        />
      );

      expect(
        screen.getByText("No groups available. Create a group first to assign users.")
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
          api={mockApi}
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
        expect(mockAddGroupMember).toHaveBeenCalledWith(2, 1);
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
          api={mockApi}
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
        expect(mockRemoveGroupMember).toHaveBeenCalledWith(1, 1);
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
          api={mockApi}
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
          api={mockApi}
        />
      );

      // Wait for permissions to load, then check for default labels
      // There are two permissions with "default" source in mockPermissions
      await waitFor(() => {
        const defaultLabels = screen.getAllByText("Default (no groups grant this)");
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
      mockGetUserPermissions.mockResolvedValue({ permissions: overriddenPermissions });

      render(
        <UserEditModal
          user={mockUser}
          groups={mockGroups}
          currentUser={mockCurrentUser}
          onClose={vi.fn()}
          onSave={vi.fn()}
          api={mockApi}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Overridden \(user-level\)/)).toBeInTheDocument();
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
          api={mockApi}
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
          api={mockApi}
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
          api={mockApi}
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
          api={mockApi}
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
          api={mockApi}
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
          api={mockApi}
        />
      );

      const saveButton = screen.getByText("Save Changes");
      expect(saveButton).toBeDisabled();
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
          api={mockApi}
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
          api={mockApi}
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
