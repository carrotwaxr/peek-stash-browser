import { useEffect, useId, useRef, useState } from "react";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES_TEXT,
  validatePassword,
} from "@peek/shared-types/password.js";
import { Key, Lock, Shield, Trash2, User, Users } from "lucide-react";
import {
  addGroupMember,
  adminRegenerateRecoveryKey,
  adminResetPassword,
  apiDelete,
  apiPut,
  getUserGroupMemberships,
  getUserPermissions,
  removeGroupMember,
  updateUserPermissionOverrides,
} from "../../api";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { Button, ConfirmDialog, Modal, StatusMessage } from "../ui/index";
import ContentRestrictionsModal from "./ContentRestrictionsModal";

interface UserData {
  id: number;
  username: string;
  role: string;
  setupCompleted?: boolean;
}

interface GroupData {
  id: number;
  name: string;
  description?: string | null;
}

interface PermissionSources {
  canShare: string;
  canDownloadFiles: string;
  canDownloadPlaylists: string;
}

interface UserPermissions {
  canShare: boolean;
  canDownloadFiles: boolean;
  canDownloadPlaylists: boolean;
  sources: PermissionSources;
}

interface UserEditModalContentProps {
  user: UserData;
  groups?: GroupData[];
  currentUser: UserData | null;
  onClose: () => void;
  /** Called once on close when anything was saved while the dialog was open */
  onChanged?: (() => void) | undefined;
  /** Called after the user is deleted (the dialog has closed) */
  onDeleted?: ((username: string) => void) | undefined;
  onMessage?: ((message: string) => void) | undefined;
  onError?: ((message: string) => void) | undefined;
}

/** A control's save state, shown beside it */
interface ControlState {
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
}

const NOTE_TEXT_COLOR = {
  idle: "var(--text-muted)",
  saving: "var(--text-muted)",
  saved: "var(--status-success)",
  error: "var(--status-error)",
} as const;

/**
 * The note beside a control that saves on change: "Saving...", "Saved" or the
 * error. The control names it in `aria-describedby`, and it is a polite live
 * region, so the result is read out too.
 */
const ControlNote = ({ id, state }: { id: string; state?: ControlState }) => {
  const status = state?.status ?? "idle";
  const text =
    status === "saving"
      ? "Saving..."
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? state?.message
          : "";
  return (
    <span
      id={id}
      aria-live="polite"
      className="text-xs"
      style={{ color: NOTE_TEXT_COLOR[status] }}
    >
      {text}
    </span>
  );
};

/**
 * UserEditModalContent - Inner component that handles the modal content
 * This is separated to ensure hooks are always called (user is guaranteed to exist)
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
const UserEditModalContent = ({
  user,
  groups = [],
  currentUser,
  onClose,
  onChanged,
  onDeleted,
  onMessage,
  onError,
}: UserEditModalContentProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  // Check if editing current user
  const isCurrentUser = user?.id === currentUser?.id;

  // Form state
  const [role, setRole] = useState(user.role || "USER");
  const [userGroups, setUserGroups] = useState<number[]>([]);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);

  // Password reset state
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  // Content restrictions modal state
  const [showContentRestrictionsModal, setShowContentRestrictionsModal] =
    useState(false);

  // Every control saves when changed (no Save button). `wroteRef` remembers
  // that something was saved, so closing tells the list to reload.
  const wroteRef = useRef(false);
  const [controls, setControls] = useState<Record<string, ControlState>>({});
  const noteBaseId = useId();
  const passwordRulesId = useId();
  const noteId = (key: string) => `${noteBaseId}-${key}`;
  const isSaving = (key: string) => controls[key]?.status === "saving";
  const setControl = (key: string, state: ControlState) =>
    setControls((prev) => ({ ...prev, [key]: state }));

  // A role change waits for the admin to confirm it
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  // Saves one control's change. The control shows the stored value until the
  // write succeeds, so a failed one leaves it as it was, with the error beside it.
  const saveControl = async (
    key: string,
    write: () => Promise<void>,
    fallback: string
  ) => {
    setControl(key, { status: "saving" });
    try {
      await write();
      wroteRef.current = true;
      setControl(key, { status: "saved" });
    } catch (err) {
      setControl(key, {
        status: "error",
        message: (err as Error).message || fallback,
      });
    }
  };

  // Load user's current group memberships
  useEffect(() => {
    const loadUserGroups = async () => {
      try {
        const response = await getUserGroupMemberships(user.id);
        const groups = response.groups || [];
        const memberGroupIds = groups.map((g) => g.id);
        setUserGroups(memberGroupIds);
      } catch (err) {
        console.error("Failed to load user groups:", err);
      }
    };

    if (user?.id) {
      void loadUserGroups();
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
      void loadPermissions();
    }
  }, [user?.id, userGroups]); // Re-fetch when groups change

  const handleGroupToggle = (groupId: number, isCurrentlyMember: boolean) =>
    saveControl(
      `group-${groupId}`,
      async () => {
        if (isCurrentlyMember) {
          await removeGroupMember(String(groupId), String(user.id));
          setUserGroups((prev) => prev.filter((id) => id !== groupId));
          onMessage?.(`Removed ${user.username} from group`);
        } else {
          await addGroupMember(String(groupId), user.id);
          setUserGroups((prev) => [...prev, groupId]);
          onMessage?.(`Added ${user.username} to group`);
        }
      },
      "Failed to update group membership"
    );

  const handlePermissionOverride = (
    permissionKey: string,
    newValue: boolean | null
  ) =>
    saveControl(
      `perm-${permissionKey}`,
      async () => {
        const overrideKey = `${permissionKey}Override`;
        const response = (await updateUserPermissionOverrides(user.id, {
          [overrideKey]: newValue,
        })) as { permissions: UserPermissions };
        setPermissions(response.permissions);
        onMessage?.(`Permission updated for ${user.username}`);
      },
      "Failed to update permission"
    );

  const handleRoleConfirmed = (newRole: string) => {
    setPendingRole(null);
    void saveControl(
      "role",
      async () => {
        await apiPut(`/user/${user.id}/role`, { role: newRole });
        setRole(newRole);
      },
      "Failed to change the role"
    );
  };

  const handleDeleteUser = async () => {
    if (isCurrentUser) {
      setError("You cannot delete your own account");
      return;
    }

    if (
      !(await confirm({
        title: "Delete user?",
        message: `Delete user "${user.username}"? This cannot be undone.`,
        confirmText: "Delete user",
      }))
    ) {
      return;
    }

    try {
      setLoading(true);
      await apiDelete(`/user/${user.id}`);
      // The caller words the message and reloads; nothing else follows
      onClose();
      onDeleted?.(user.username);
    } catch (err) {
      setError((err as Error).message || "Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      setError(passwordCheck.errors.join(". "));
      return;
    }

    try {
      setLoading(true);
      await adminResetPassword(user.id, newPassword);
      wroteRef.current = true;
      onMessage?.(`Password reset for ${user.username}`);
      setShowPasswordReset(false);
      setNewPassword("");
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateRecoveryKey = async () => {
    if (
      !(await confirm({
        title: "Regenerate recovery key?",
        message: `Regenerate the recovery key for "${user.username}"? Their old key will no longer work.`,
        confirmText: "Regenerate",
      }))
    ) {
      return;
    }

    try {
      setLoading(true);
      const response = await adminRegenerateRecoveryKey(user.id);
      wroteRef.current = true;
      setGeneratedKey(response.recoveryKey);
      onMessage?.(`Recovery key regenerated for ${user.username}`);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to regenerate recovery key");
    } finally {
      setLoading(false);
    }
  };

  const renderInheritanceLabel = (source: string) => {
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
      <span className="text-xs" style={{ color: "var(--status-info)" }}>
        Inherited from: {source}
      </span>
    );
  };

  // Nothing is ever unsaved, so closing asks nothing
  const handleClose = () => {
    onClose();
    if (wroteRef.current) onChanged?.();
  };

  return (
    <>
      <Modal
        isOpen
        onClose={handleClose}
        title={
          <span className="flex items-center gap-2">
            <User
              className="w-5 h-5"
              style={{ color: "var(--text-secondary)" }}
              aria-hidden="true"
            />
            Edit User: {user.username}
          </span>
        }
        footer={
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        }
      >
        <div className="space-y-6">
          {/* Error display */}
          {error && (
            <StatusMessage
              variant="error"
              title={null}
              className="text-sm"
              message={error}
            />
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
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <label
                    htmlFor="userRole"
                    className="block text-sm font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Role
                  </label>
                  <ControlNote id={noteId("role")} state={controls.role} />
                </div>
                <select
                  id="userRole"
                  value={role}
                  aria-describedby={noteId("role")}
                  disabled={isSaving("role")}
                  onChange={(e) => {
                    if (isCurrentUser) {
                      setControl("role", {
                        status: "error",
                        message: "You cannot change your own role",
                      });
                      return;
                    }
                    // The select keeps the stored role until the change is
                    // confirmed and saved
                    setPendingRole(e.target.value);
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
                    const key = `group-${group.id}`;
                    return (
                      <label
                        key={group.id}
                        className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-opacity-50"
                        style={{
                          backgroundColor: isMember
                            ? "color-mix(in srgb, var(--status-info) 5%, transparent)"
                            : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isMember}
                          aria-describedby={noteId(key)}
                          disabled={isSaving(key)}
                          onChange={() =>
                            void handleGroupToggle(group.id, isMember)
                          }
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
                        <ControlNote id={noteId(key)} state={controls[key]} />
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
                          void handlePermissionOverride(
                            "canShare",
                            val === "inherit" ? null : val === "true"
                          );
                        }}
                        aria-describedby={noteId("perm-canShare")}
                        disabled={isSaving("perm-canShare")}
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
                      <ControlNote
                        id={noteId("perm-canShare")}
                        state={controls["perm-canShare"]}
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
                        {renderInheritanceLabel(
                          permissions.sources.canDownloadFiles
                        )}
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
                          void handlePermissionOverride(
                            "canDownloadFiles",
                            val === "inherit" ? null : val === "true"
                          );
                        }}
                        aria-describedby={noteId("perm-canDownloadFiles")}
                        disabled={isSaving("perm-canDownloadFiles")}
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
                      <ControlNote
                        id={noteId("perm-canDownloadFiles")}
                        state={controls["perm-canDownloadFiles"]}
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
                        {renderInheritanceLabel(
                          permissions.sources.canDownloadPlaylists
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={
                          permissions.sources.canDownloadPlaylists ===
                          "override"
                            ? String(permissions.canDownloadPlaylists)
                            : "inherit"
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          void handlePermissionOverride(
                            "canDownloadPlaylists",
                            val === "inherit" ? null : val === "true"
                          );
                        }}
                        aria-describedby={noteId("perm-canDownloadPlaylists")}
                        disabled={isSaving("perm-canDownloadPlaylists")}
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
                      <ControlNote
                        id={noteId("perm-canDownloadPlaylists")}
                        state={controls["perm-canDownloadPlaylists"]}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Section 4: Content Restrictions */}
          <section>
            <h3
              className="text-sm font-medium mb-3 flex items-center gap-2"
              style={{ color: "var(--text-secondary)" }}
            >
              <Lock size={16} />
              Content Restrictions
            </h3>
            <div
              className="p-4 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {role === "ADMIN" ? (
                // The stored role (a change saves before the select shows it):
                // an admin keeps only their own hidden items (item 13)
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Content restrictions do not apply to administrators.
                </p>
              ) : (
                <>
                  <p
                    className="text-sm mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Manage content restrictions for this user. Restrictions
                    control which content is visible based on collections, tags,
                    studios, and galleries.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowContentRestrictionsModal(true)}
                  >
                    <Lock size={14} className="mr-1" />
                    Manage Restrictions
                  </Button>
                </>
              )}
            </div>
          </section>

          {/* Section 5: Account Actions */}
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
                  You cannot modify your own account from this modal. Use the
                  account settings page instead.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Password Reset */}
                  {showPasswordReset ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                          aria-label="New password"
                          aria-describedby={passwordRulesId}
                          minLength={PASSWORD_MIN_LENGTH}
                          className="flex-1 px-3 py-2 rounded text-sm"
                          style={{
                            backgroundColor: "var(--bg-tertiary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void handleResetPassword()}
                          disabled={loading}
                        >
                          Set
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setShowPasswordReset(false);
                            setNewPassword("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      <p
                        id={passwordRulesId}
                        className="text-xs mt-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {PASSWORD_RULES_TEXT}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowPasswordReset(true)}
                      >
                        Reset Password
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleRegenerateRecoveryKey()}
                        disabled={loading}
                      >
                        <Key size={14} className="mr-1" />
                        Regenerate Recovery Key
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void handleDeleteUser()}
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
                      <p
                        className="text-xs mb-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        New recovery key (show to user):
                      </p>
                      <code
                        className="text-sm font-mono"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {generatedKey}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </Modal>

      {/* Role change confirmation: a sibling, stacked above this dialog */}
      <ConfirmDialog
        isOpen={pendingRole !== null}
        onClose={() => setPendingRole(null)}
        onConfirm={() => pendingRole && handleRoleConfirmed(pendingRole)}
        title={
          pendingRole === "ADMIN"
            ? `Make ${user.username} an admin?`
            : `Make ${user.username} a regular user?`
        }
        message={
          pendingRole === "ADMIN"
            ? "Admins manage users, servers and restrictions. Content restrictions stop applying to them."
            : "They will no longer manage users, servers or restrictions, and any content restrictions saved for them apply again."
        }
        confirmText={pendingRole === "ADMIN" ? "Make admin" : "Make user"}
        confirmStyle="primary"
      />

      {/* Delete and recovery-key confirmations: stacked above this dialog */}
      {confirmDialog}

      {/* Content Restrictions Modal: a sibling, stacked above this dialog */}
      {showContentRestrictionsModal && (
        <ContentRestrictionsModal
          user={user}
          onClose={() => setShowContentRestrictionsModal(false)}
          onSave={() => {
            wroteRef.current = true;
            onMessage?.(`Content restrictions updated for ${user.username}`);
          }}
        />
      )}
    </>
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
 * @param {Function} props.onChanged - Called on close when anything was saved
 * @param {Function} props.onDeleted - Called with the username after a delete
 * @param {Function} props.onMessage - Callback for success messages
 * @param {Function} props.onError - Callback for error messages
 * @param {Object} props.api - API instance for requests
 */
const UserEditModal = (
  props: Omit<UserEditModalContentProps, "user"> & { user: UserData | null }
) => {
  // Early return before any hooks - this wrapper has no hooks
  if (!props.user) return null;

  return <UserEditModalContent {...props} user={props.user} />;
};

export default UserEditModal;
