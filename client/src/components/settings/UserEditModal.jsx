 
import { useState, useEffect } from "react";
import { User, X, Shield, Users, Key, Trash2 } from "lucide-react";
import { Button, Paper } from "../ui/index.js";
import { getUserGroupMemberships, addGroupMember, removeGroupMember, getUserPermissions, updateUserPermissionOverrides, adminResetPassword, adminRegenerateRecoveryKey } from "../../services/api.js";

/**
 * UserEditModalContent - Inner component that handles the modal content
 * This is separated to ensure hooks are always called (user is guaranteed to exist)
 */
/* eslint-disable no-unused-vars */
const UserEditModalContent = ({
  user,
  groups = [],
  currentUser,
  onClose,
  onSave,
  onMessage,
  onError,
  api,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if editing current user
  const isCurrentUser = user?.id === currentUser?.id;

  // Form state
  const [role, setRole] = useState(user.role || "USER");
  const [userGroups, setUserGroups] = useState([]);
  const [permissions, setPermissions] = useState(null);
  /* eslint-enable no-unused-vars */

  // Password reset state
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [generatedKey, setGeneratedKey] = useState(null);

  // Track what has changed for save
  const [hasChanges, setHasChanges] = useState(false);

  // Load user's current group memberships
  useEffect(() => {
    const loadUserGroups = async () => {
      try {
        const response = await getUserGroupMemberships(user.id);
        const memberGroupIds = (response.groups || []).map((g) => g.id);
        setUserGroups(memberGroupIds);
      } catch (err) {
        console.error("Failed to load user groups:", err);
      }
    };

    if (user?.id) {
      loadUserGroups();
    }
  }, [user?.id]);

  // Load user's permissions
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const response = await getUserPermissions(user.id);
        setPermissions(response.permissions);
      } catch (err) {
        console.error("Failed to load user permissions:", err);
      }
    };

    if (user?.id) {
      loadPermissions();
    }
  }, [user?.id, userGroups]); // Re-fetch when groups change

  const handleGroupToggle = async (groupId, isCurrentlyMember) => {
    try {
      if (isCurrentlyMember) {
        await removeGroupMember(groupId, user.id);
        setUserGroups((prev) => prev.filter((id) => id !== groupId));
        onMessage?.(`Removed ${user.username} from group`);
      } else {
        await addGroupMember(groupId, user.id);
        setUserGroups((prev) => [...prev, groupId]);
        onMessage?.(`Added ${user.username} to group`);
      }
      setHasChanges(true);
    } catch (err) {
      setError(err.message || "Failed to update group membership");
    }
  };

  const handlePermissionOverride = async (permissionKey, newValue) => {
    try {
      const overrideKey = `${permissionKey}Override`;
      const response = await updateUserPermissionOverrides(user.id, {
        [overrideKey]: newValue,
      });
      setPermissions(response.permissions);
      onMessage?.(`Permission updated for ${user.username}`);
      setHasChanges(true);
    } catch (err) {
      setError(err.message || "Failed to update permission");
    }
  };

  const handleDeleteUser = async () => {
    if (isCurrentUser) {
      setError("You cannot delete your own account");
      return;
    }

    if (!confirm(`Are you sure you want to delete user "${user.username}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/user/${user.id}`);
      onMessage?.(`User "${user.username}" deleted`);
      onClose();
      onSave?.();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      setError("Password must contain at least one letter");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number");
      return;
    }

    try {
      setLoading(true);
      await adminResetPassword(user.id, newPassword);
      onMessage?.(`Password reset for ${user.username}`);
      setShowPasswordReset(false);
      setNewPassword("");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateRecoveryKey = async () => {
    if (!confirm(`Regenerate recovery key for "${user.username}"?\n\nTheir old key will no longer work.`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await adminRegenerateRecoveryKey(user.id);
      setGeneratedKey(response.recoveryKey);
      onMessage?.(`Recovery key regenerated for ${user.username}`);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to regenerate recovery key");
    } finally {
      setLoading(false);
    }
  };

  const renderInheritanceLabel = (source) => {
    if (source === "override") {
      return (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Overridden (user-level)
        </span>
      );
    }
    if (source === "default") {
      return (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Default (no groups grant this)
        </span>
      );
    }
    return (
      <span className="text-xs" style={{ color: "rgb(59, 130, 246)" }}>
        Inherited from: {source}
      </span>
    );
  };

  const handleClose = () => {
    if (hasChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) {
        return;
      }
    }
    onClose();
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      if (role !== user.role) {
        await api.put(`/user/${user.id}/role`, { role });
      }
      onMessage?.(`User "${user.username}" updated`);
      onSave?.();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save changes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <Paper
        className="max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
              <Paper.Title>Edit User: {user.username}</Paper.Title>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-opacity-80 transition-colors"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </Paper.Header>

        <Paper.Body>
          <div className="space-y-6">
            {/* Error display */}
            {error && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  color: "rgb(239, 68, 68)",
                }}
              >
                {error}
              </div>
            )}

            {/* Section 1: Basic Info */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <User size={16} />
                Basic Info
              </h3>
              <div
                className="p-4 rounded-lg space-y-4"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {/* Username (read-only) */}
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Username
                  </label>
                  <div
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {user.username}
                  </div>
                </div>

                {/* Role dropdown */}
                <div>
                  <label
                    htmlFor="userRole"
                    className="block text-sm font-medium mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Role
                  </label>
                  <select
                    id="userRole"
                    value={role}
                    onChange={(e) => {
                      if (isCurrentUser) {
                        setError("You cannot change your own role");
                        return;
                      }
                      const newRole = e.target.value;
                      setRole(newRole);
                      setHasChanges(true);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Section 2: Groups */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <Users size={16} />
                Groups
              </h3>
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {groups.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No groups available. Create a group first to assign users.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groups.map((group) => {
                      const isMember = userGroups.includes(group.id);
                      return (
                        <label
                          key={group.id}
                          className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-opacity-50"
                          style={{ backgroundColor: isMember ? "rgba(59, 130, 246, 0.05)" : "transparent" }}
                        >
                          <input
                            type="checkbox"
                            checked={isMember}
                            onChange={() => handleGroupToggle(group.id, isMember)}
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{ accentColor: "var(--primary-color)" }}
                          />
                          <div className="flex-1">
                            <span
                              className="text-sm font-medium"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {group.name}
                            </span>
                            {group.description && (
                              <p
                                className="text-xs mt-0.5"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {group.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Section 3: Permissions */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <Shield size={16} />
                Permissions
              </h3>
              <div
                className="p-4 rounded-lg space-y-4"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {!permissions ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Loading permissions...
                  </p>
                ) : (
                  <>
                    {/* Can Share */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Can share playlists
                        </span>
                        <div className="mt-1">
                          {renderInheritanceLabel(permissions.sources.canShare)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={
                            permissions.sources.canShare === "override"
                              ? String(permissions.canShare)
                              : "inherit"
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            handlePermissionOverride(
                              "canShare",
                              val === "inherit" ? null : val === "true"
                            );
                          }}
                          className="px-2 py-1 rounded text-sm"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="inherit">Inherit from groups</option>
                          <option value="true">Force enabled</option>
                          <option value="false">Force disabled</option>
                        </select>
                        <span
                          className={`w-3 h-3 rounded-full ${permissions.canShare ? "bg-green-500" : "bg-gray-400"}`}
                        />
                      </div>
                    </div>

                    {/* Can Download Files */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Can download files
                        </span>
                        <div className="mt-1">
                          {renderInheritanceLabel(permissions.sources.canDownloadFiles)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={
                            permissions.sources.canDownloadFiles === "override"
                              ? String(permissions.canDownloadFiles)
                              : "inherit"
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            handlePermissionOverride(
                              "canDownloadFiles",
                              val === "inherit" ? null : val === "true"
                            );
                          }}
                          className="px-2 py-1 rounded text-sm"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="inherit">Inherit from groups</option>
                          <option value="true">Force enabled</option>
                          <option value="false">Force disabled</option>
                        </select>
                        <span
                          className={`w-3 h-3 rounded-full ${permissions.canDownloadFiles ? "bg-green-500" : "bg-gray-400"}`}
                        />
                      </div>
                    </div>

                    {/* Can Download Playlists */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Can download playlists
                        </span>
                        <div className="mt-1">
                          {renderInheritanceLabel(permissions.sources.canDownloadPlaylists)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={
                            permissions.sources.canDownloadPlaylists === "override"
                              ? String(permissions.canDownloadPlaylists)
                              : "inherit"
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            handlePermissionOverride(
                              "canDownloadPlaylists",
                              val === "inherit" ? null : val === "true"
                            );
                          }}
                          className="px-2 py-1 rounded text-sm"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="inherit">Inherit from groups</option>
                          <option value="true">Force enabled</option>
                          <option value="false">Force disabled</option>
                        </select>
                        <span
                          className={`w-3 h-3 rounded-full ${permissions.canDownloadPlaylists ? "bg-green-500" : "bg-gray-400"}`}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Section 4: Account Actions */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <Key size={16} />
                Account Actions
              </h3>
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {isCurrentUser ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    You cannot modify your own account from this modal. Use the account settings page instead.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Password Reset */}
                    {showPasswordReset ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password (8+ chars, letter, number)"
                          className="flex-1 px-3 py-2 rounded text-sm"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <Button variant="primary" size="sm" onClick={handleResetPassword} disabled={loading}>
                          Set
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => { setShowPasswordReset(false); setNewPassword(""); }}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setShowPasswordReset(true)}>
                          Reset Password
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleRegenerateRecoveryKey} disabled={loading}>
                          <Key size={14} className="mr-1" />
                          Regenerate Recovery Key
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDeleteUser}
                          disabled={loading}
                        >
                          <Trash2 size={14} className="mr-1" />
                          Delete User
                        </Button>
                      </div>
                    )}

                    {/* Show generated key */}
                    {generatedKey && (
                      <div
                        className="p-3 rounded"
                        style={{
                          backgroundColor: "var(--bg-tertiary)",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                          New recovery key (show to user):
                        </p>
                        <code className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
                          {generatedKey}
                        </code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </Paper.Body>

        {/* Footer with action buttons */}
        <div
          className="px-6 py-4 flex justify-end gap-3"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!hasChanges || loading}
            loading={loading}
            onClick={handleSave}
          >
            Save Changes
          </Button>
        </div>
      </Paper>
    </div>
  );
};

/**
 * UserEditModal - Comprehensive user management modal
 *
 * @param {Object} props
 * @param {Object} props.user - User object to edit
 * @param {Array} props.groups - List of all groups
 * @param {Object} props.currentUser - Currently logged in user (for self-edit prevention)
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {Function} props.onSave - Callback when changes are saved
 * @param {Function} props.onMessage - Callback for success messages
 * @param {Function} props.onError - Callback for error messages
 * @param {Object} props.api - API instance for requests
 */
const UserEditModal = (props) => {
  // Early return before any hooks - this wrapper has no hooks
  if (!props.user) return null;

  return <UserEditModalContent {...props} />;
};

export default UserEditModal;
