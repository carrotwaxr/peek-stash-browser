import { useEffect, useState } from "react";
import { Users, Edit2, Trash2, Shield, Download, Share2, Plus } from "lucide-react";
import { getGroups, deleteGroup } from "../../services/api.js";
import { formatDate } from "../../utils/date.js";
import CreateUserModal from "./CreateUserModal.jsx";
import GroupModal from "./GroupModal.jsx";
import SyncFromStashModal from "./SyncFromStashModal.jsx";
import UserEditModal from "./UserEditModal.jsx";
import { Button, Paper } from "../ui/index.js";

const UserManagementSection = ({
  users,
  currentUser,
  onUsersChanged,
  onMessage,
  onError,
  api,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncTargetUser, setSyncTargetUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  // Load groups on mount
  const loadGroups = async () => {
    try {
      const response = await getGroups();
      setGroups(response.groups || []);
    } catch (err) {
      onError(err.message || "Failed to load groups");
    }
  };

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group management handlers
  const handleCreateGroup = () => {
    setEditingGroup(null);
    setShowGroupModal(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  const handleDeleteGroup = async (group) => {
    if (!confirm(`Are you sure you want to delete the group "${group.name}"?\n\nThis will remove the group from all members but will not delete any users.`)) {
      return;
    }

    try {
      await deleteGroup(group.id);
      onMessage(`Group "${group.name}" deleted successfully`);
      loadGroups();
      onUsersChanged(); // Refresh users to update their group badges
    } catch (err) {
      onError(err.message || "Failed to delete group");
    }
  };

  const handleGroupModalClose = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
  };

  const handleGroupModalSave = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
    onMessage(editingGroup ? "Group updated successfully" : "Group created successfully");
    loadGroups();
    onUsersChanged(); // Refresh users to update their group badges
  };

  const renderPermissionBadges = (group) => {
    const badges = [];

    if (group?.canShare) {
      badges.push(
        <span
          key="share"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
          style={{
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            color: "rgb(59, 130, 246)",
          }}
        >
          <Share2 size={12} />
          Share
        </span>
      );
    }

    if (group?.canDownloadFiles) {
      badges.push(
        <span
          key="download-files"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            color: "rgb(34, 197, 94)",
          }}
        >
          <Download size={12} />
          Files
        </span>
      );
    }

    if (group?.canDownloadPlaylists) {
      badges.push(
        <span
          key="download-playlists"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
          style={{
            backgroundColor: "rgba(168, 85, 247, 0.1)",
            color: "rgb(168, 85, 247)",
          }}
        >
          <Download size={12} />
          Playlists
        </span>
      );
    }

    if (badges.length === 0) {
      return (
        <span
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          No permissions
        </span>
      );
    }

    return <div className="flex flex-wrap gap-1">{badges}</div>;
  };

  const toggleSyncToStash = async (userId, username, currentSyncToStash) => {
    const newSyncToStash = !currentSyncToStash;

    try {
      await api.put(`/user/${userId}/settings`, {
        syncToStash: newSyncToStash,
      });
      onMessage(
        `Stash sync ${newSyncToStash ? "enabled" : "disabled"} for "${username}"!`
      );
      onUsersChanged();
    } catch (err) {
      onError(err.response?.data?.error || "Failed to update sync setting");
    }
  };

  const openSyncModal = (user) => {
    setSyncTargetUser(user);
    setShowSyncModal(true);
  };

  return (
    <>
      {/* User Groups Section */}
      <Paper className="mb-6">
        <Paper.Header>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <Paper.Title>User Groups</Paper.Title>
              <Paper.Subtitle className="mt-1">
                Create and manage user groups with shared permissions
              </Paper.Subtitle>
            </div>
            <Button
              onClick={handleCreateGroup}
              variant="primary"
              icon={<Plus size={16} />}
              className="w-full md:w-auto"
            >
              Create Group
            </Button>
          </div>
        </Paper.Header>
        <Paper.Body>
          {groups.length === 0 ? (
            <div className="text-center py-8">
              <Users
                size={40}
                className="mx-auto mb-3"
                style={{ color: "var(--text-secondary)" }}
              />
              <p
                className="text-sm mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                No groups yet. Create a group to organize users and manage permissions together.
              </p>
              <Button
                variant="primary"
                icon={<Plus size={16} />}
                onClick={handleCreateGroup}
              >
                Create Your First Group
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <th
                      className="text-left py-3 px-4 font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Name
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Description
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <div className="flex items-center gap-1">
                        <Users size={14} />
                        Members
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <div className="flex items-center gap-1">
                        <Shield size={14} />
                        Permissions
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-4 font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr
                      key={group.id}
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <td
                        className="py-3 px-4 font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {group.name}
                      </td>
                      <td
                        className="py-3 px-4"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {group.description || "-"}
                      </td>
                      <td
                        className="py-3 px-4"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Users size={14} style={{ color: "var(--text-secondary)" }} />
                          {group.memberCount ?? 0}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {renderPermissionBadges(group)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Edit2 size={14} />}
                            onClick={() => handleEditGroup(group)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            onClick={() => handleDeleteGroup(group)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Paper.Body>
      </Paper>

      {/* User Management Section */}
      <Paper className="mb-6">
        <Paper.Header>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <Paper.Title>Users</Paper.Title>
              <Paper.Subtitle className="mt-1">
                Manage user accounts and permissions
              </Paper.Subtitle>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="primary"
              className="w-full md:w-auto"
            >
              + Create User
            </Button>
          </div>
        </Paper.Header>
        <Paper.Body padding="none">
          {/* Sync to Stash Warning */}
          <div
            className="px-6 py-4 text-sm"
            style={{
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              borderBottom: "1px solid var(--border-color)",
              color: "rgb(245, 158, 11)",
            }}
          >
            <div className="font-semibold mb-1">Sync to Stash Policy</div>
            <div
              className="text-xs leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              When enabled, user ratings and favorites will sync to Stash.
              <br />
              <strong>O Counters AGGREGATE</strong> (multiple users increment
              the same counter).
              <br />
              <strong>Ratings OVERWRITE</strong> (last user to rate wins, no
              aggregation).
              <br />
              Be cautious enabling for multiple users to avoid conflicts.
            </div>
          </div>

          {/* User Table */}
          <div className="overflow-x-auto">
            <div
              className="md:hidden px-4 py-3 text-xs"
              style={{
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              Swipe to see more
            </div>
            <table className="w-full" style={{ minWidth: "800px" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  <th
                    className="text-left px-6 py-4 font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Username
                  </th>
                  <th
                    className="text-left px-6 py-4 font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Role
                  </th>
                  <th
                    className="text-center px-6 py-4 font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Sync to Stash
                  </th>
                  <th
                    className="text-left px-6 py-4 font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Groups
                  </th>
                  <th
                    className="text-left px-6 py-4 font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Created
                  </th>
                  <th
                    className="text-right px-6 py-4 font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    <td
                      className="px-6 py-4"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span>{user.username}</span>
                        {user.id === currentUser?.id && (
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: "rgba(59, 130, 246, 0.1)",
                              color: "rgb(59, 130, 246)",
                            }}
                          >
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className="text-sm px-2 py-1 rounded"
                        style={{
                          backgroundColor:
                            user.role === "ADMIN"
                              ? "var(--accent-primary)"
                              : "var(--bg-secondary)",
                          color:
                            user.role === "ADMIN"
                              ? "white"
                              : "var(--text-secondary)",
                        }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={user.syncToStash || false}
                        onChange={() =>
                          toggleSyncToStash(
                            user.id,
                            user.username,
                            user.syncToStash
                          )
                        }
                        className="w-4 h-4 rounded cursor-pointer"
                        style={{
                          accentColor: "var(--primary-color)",
                        }}
                        title={
                          user.syncToStash
                            ? "Syncing activity to Stash"
                            : "Not syncing to Stash"
                        }
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {user.groups && user.groups.length > 0 ? (
                          user.groups.map((group) => (
                            <span
                              key={group.id}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: "rgba(59, 130, 246, 0.1)",
                                color: "rgb(59, 130, 246)",
                              }}
                            >
                              {group.name}
                            </span>
                          ))
                        ) : (
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            None
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-6 py-4 text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <Button
                          onClick={() => openSyncModal(user)}
                          variant="tertiary"
                          size="sm"
                          className="px-3 py-1 text-sm whitespace-nowrap"
                        >
                          Sync from Stash
                        </Button>
                        <Button
                          onClick={() => setEditingUser(user)}
                          variant="secondary"
                          size="sm"
                          icon={<Edit2 size={14} />}
                          className="px-3 py-1 text-sm whitespace-nowrap"
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Paper.Body>
      </Paper>

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onUserCreated={(username) => {
            onMessage(`User "${username}" created successfully!`);
            onUsersChanged();
          }}
          api={api}
        />
      )}

      {showSyncModal && syncTargetUser && (
        <SyncFromStashModal
          user={syncTargetUser}
          onClose={() => {
            setShowSyncModal(false);
            setSyncTargetUser(null);
          }}
          onSyncComplete={(username) => {
            onMessage(`Successfully synced data from Stash for ${username}!`);
          }}
          api={api}
        />
      )}

      {showGroupModal && (
        <GroupModal
          group={editingGroup}
          users={users}
          onClose={handleGroupModalClose}
          onSave={handleGroupModalSave}
          onMessage={onMessage}
        />
      )}

      {editingUser && (
        <UserEditModal
          user={editingUser}
          groups={groups}
          currentUser={currentUser}
          onClose={() => setEditingUser(null)}
          onSave={() => {
            setEditingUser(null);
            onMessage(`User "${editingUser.username}" updated successfully`);
            onUsersChanged();
            loadGroups();
          }}
          onMessage={onMessage}
          onError={onError}
          api={api}
        />
      )}
    </>
  );
};

export default UserManagementSection;
