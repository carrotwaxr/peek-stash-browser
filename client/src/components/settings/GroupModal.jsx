import { useEffect, useState } from "react";
import { Users, X, Plus } from "lucide-react";
import { Button, Paper } from "../ui/index.js";
import { getGroup, createGroup, updateGroup, addGroupMember, removeGroupMember } from "../../services/api.js";

/**
 * GroupModal - Create or Edit a user group
 *
 * @param {Object} props
 * @param {Object|null} props.group - Group object for edit mode, null for create mode
 * @param {Array} props.users - List of all users (for adding members)
 * @param {Function} props.onClose - Callback when modal is closed/cancelled
 * @param {Function} props.onSave - Callback when group is successfully saved
 * @param {Function} props.onMessage - Callback for success messages
 */
const GroupModal = ({ group, onClose, onSave, users = [], onMessage }) => {
  const isEditMode = !!group;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [canDownloadFiles, setCanDownloadFiles] = useState(false);
  const [canDownloadPlaylists, setCanDownloadPlaylists] = useState(false);

  // Members state (only used in edit mode)
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load group details when editing
  useEffect(() => {
    if (isEditMode && group?.id) {
      loadGroupDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  const loadGroupDetails = async () => {
    try {
      setLoadingMembers(true);
      setError(null);

      const response = await getGroup(group.id);
      const groupData = response.group;

      // Populate form fields
      setName(groupData.name || "");
      setDescription(groupData.description || "");
      setCanShare(groupData.canShare ?? false);
      setCanDownloadFiles(groupData.canDownloadFiles ?? false);
      setCanDownloadPlaylists(groupData.canDownloadPlaylists ?? false);
      setMembers(groupData.members || []);
    } catch (err) {
      setError(err.message || "Failed to load group details");
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;

    const userId = parseInt(selectedUserId, 10);
    const addedUser = users.find((u) => u.id === userId);
    try {
      await addGroupMember(group.id, userId);
      // Find the user details from the users list
      if (addedUser) {
        setMembers((prev) => [
          ...prev,
          {
            user: {
              id: addedUser.id,
              username: addedUser.username,
              role: addedUser.role,
            },
          },
        ]);
        onMessage?.(`Added ${addedUser.username} to group`);
      }
      setSelectedUserId("");
    } catch (err) {
      setError(err.message || `Failed to add ${addedUser?.username || "member"}`);
    }
  };

  const handleRemoveMember = async (userId) => {
    const removedMember = members.find((m) => m.user.id === userId);
    try {
      await removeGroupMember(group.id, userId);
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
      onMessage?.(`Removed ${removedMember?.user?.username || "member"} from group`);
    } catch (err) {
      setError(err.message || `Failed to remove ${removedMember?.user?.username || "member"}`);
    }
  };

  // Get users that are not already members
  const availableUsers = users.filter(
    (user) => !members.some((m) => m.user.id === user.id)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Group name is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const groupData = {
        name: name.trim(),
        description: description.trim() || null,
        canShare,
        canDownloadFiles,
        canDownloadPlaylists,
      };

      if (isEditMode) {
        await updateGroup(group.id, groupData);
      } else {
        await createGroup(groupData);
      }

      if (onSave) {
        onSave();
      } else {
        onClose(true);
      }
    } catch (err) {
      setError(err.message || `Failed to ${isEditMode ? "update" : "create"} group`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose(false);
  };

  const modalTitle = isEditMode ? `Edit Group: ${group.name}` : "Create Group";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => !loading && handleCancel()}
    >
      <Paper
        className="max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
            <Paper.Title>{modalTitle}</Paper.Title>
          </div>
        </Paper.Header>

        <form onSubmit={handleSubmit}>
          <Paper.Body>
            <div className="space-y-6">
              {/* Error Message */}
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

              {/* Loading state for edit mode */}
              {isEditMode && loadingMembers && (
                <div className="p-6 text-center">
                  <div
                    className="animate-spin w-8 h-8 border-4 border-t-transparent rounded-full mx-auto mb-2"
                    style={{
                      borderColor: "rgba(59, 130, 246, 0.3)",
                      borderTopColor: "transparent",
                    }}
                  ></div>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Loading group details...
                  </p>
                </div>
              )}

              {/* Form fields (hidden while loading in edit mode) */}
              {(!isEditMode || !loadingMembers) && (
                <>
                  {/* Name field */}
                  <div>
                    <label
                      htmlFor="groupName"
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Name <span style={{ color: "rgb(239, 68, 68)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      id="groupName"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      required
                      autoFocus
                      placeholder="e.g., Family, Friends, Premium Users"
                    />
                  </div>

                  {/* Description field */}
                  <div>
                    <label
                      htmlFor="groupDescription"
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Description
                    </label>
                    <input
                      type="text"
                      id="groupDescription"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      placeholder="Optional description for this group"
                    />
                  </div>

                  {/* Permissions section */}
                  <div>
                    <h3
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Permissions
                    </h3>
                    <div
                      className="space-y-3 p-4 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      {/* Can Share */}
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canShare}
                          onChange={(e) => setCanShare(e.target.checked)}
                          className="w-4 h-4 rounded cursor-pointer mt-0.5"
                          style={{ accentColor: "var(--primary-color)" }}
                        />
                        <div className="flex-1">
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            Can Share
                          </span>
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Members can share playlists with other users and groups
                          </p>
                        </div>
                      </label>

                      {/* Can Download Files */}
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canDownloadFiles}
                          onChange={(e) => setCanDownloadFiles(e.target.checked)}
                          className="w-4 h-4 rounded cursor-pointer mt-0.5"
                          style={{ accentColor: "var(--primary-color)" }}
                        />
                        <div className="flex-1">
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            Can Download Files
                          </span>
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Members can download individual video files
                          </p>
                        </div>
                      </label>

                      {/* Can Download Playlists */}
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canDownloadPlaylists}
                          onChange={(e) => setCanDownloadPlaylists(e.target.checked)}
                          className="w-4 h-4 rounded cursor-pointer mt-0.5"
                          style={{ accentColor: "var(--primary-color)" }}
                        />
                        <div className="flex-1">
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            Can Download Playlists
                          </span>
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Members can download entire playlists as archives
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Members section (edit mode only) */}
                  {isEditMode && (
                    <div>
                      <h3
                        className="text-sm font-medium mb-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Members ({members.length})
                      </h3>

                      {/* Add member dropdown */}
                      {availableUsers.length > 0 && (
                        <div className="flex gap-2 mb-3">
                          <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg text-sm"
                            style={{
                              backgroundColor: "var(--bg-secondary)",
                              border: "1px solid var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <option value="">Select a user to add...</option>
                            {availableUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.username} {user.role === "ADMIN" ? "(Admin)" : ""}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={<Plus size={14} />}
                            onClick={handleAddMember}
                            disabled={!selectedUserId}
                          >
                            Add
                          </Button>
                        </div>
                      )}

                      {members.length === 0 ? (
                        <p
                          className="text-sm p-4 rounded-lg text-center"
                          style={{
                            backgroundColor: "var(--bg-secondary)",
                            color: "var(--text-muted)",
                          }}
                        >
                          No members yet. Select a user above to add them to this group.
                        </p>
                      ) : (
                        <div
                          className="rounded-lg overflow-hidden"
                          style={{
                            backgroundColor: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          {members.map((member) => (
                            <div
                              key={member.user.id}
                              className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                              style={{ borderColor: "var(--border-color)" }}
                            >
                              <div>
                                <span
                                  className="text-sm font-medium"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {member.user.username}
                                </span>
                                {member.user.role === "ADMIN" && (
                                  <span
                                    className="ml-2 text-xs px-2 py-0.5 rounded"
                                    style={{
                                      backgroundColor: "rgba(59, 130, 246, 0.2)",
                                      color: "rgb(59, 130, 246)",
                                    }}
                                  >
                                    Admin
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member.user.id)}
                                className="p-1 rounded hover:bg-opacity-80 transition-colors"
                                style={{ color: "var(--text-muted)" }}
                                title="Remove from group"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      disabled={loading}
                      variant="primary"
                      fullWidth
                      loading={loading}
                    >
                      {isEditMode ? "Save Changes" : "Create Group"}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCancel}
                      disabled={loading}
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Paper.Body>
        </form>
      </Paper>
    </div>
  );
};

export default GroupModal;
