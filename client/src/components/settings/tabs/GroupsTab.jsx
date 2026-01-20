import { useEffect, useState } from "react";
import { Users, Edit2, Trash2, Shield, Download, Share2, Plus } from "lucide-react";
import { getGroups, deleteGroup } from "../../../services/api.js";
import { Paper, Button } from "../../ui/index.js";
import GroupModal from "../GroupModal.jsx";

const GroupsTab = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getGroups();
      setGroups(response.groups || []);
    } catch (err) {
      setError(err.message || "Failed to load groups");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const showError = (err) => {
    setError(err);
    setTimeout(() => setError(null), 5000);
  };

  const handleCreateGroup = () => {
    setEditingGroup(null);
    setShowModal(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setShowModal(true);
  };

  const handleDeleteGroup = async (group) => {
    if (!confirm(`Are you sure you want to delete the group "${group.name}"?\n\nThis will remove the group from all members but will not delete any users.`)) {
      return;
    }

    try {
      await deleteGroup(group.id);
      showMessage(`Group "${group.name}" deleted successfully`);
      loadGroups();
    } catch (err) {
      showError(err.message || "Failed to delete group");
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingGroup(null);
  };

  const handleModalSave = () => {
    setShowModal(false);
    setEditingGroup(null);
    showMessage(editingGroup ? "Group updated successfully" : "Group created successfully");
    loadGroups();
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

  if (loading) {
    return (
      <div
        className="flex items-center justify-center p-12"
        style={{ backgroundColor: "var(--bg-card)" }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Messages */}
      {message && (
        <div
          className="mb-6 p-4 rounded-lg"
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "rgb(34, 197, 94)",
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          className="mb-6 p-4 rounded-lg"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "rgb(239, 68, 68)",
          }}
        >
          {error}
        </div>
      )}

      <Paper>
        <Paper.Header>
          <div className="flex justify-between items-center">
            <div>
              <Paper.Title>User Groups</Paper.Title>
              <Paper.Subtitle className="mt-1">
                Create and manage user groups with shared permissions
              </Paper.Subtitle>
            </div>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={handleCreateGroup}
            >
              Create Group
            </Button>
          </div>
        </Paper.Header>

        <Paper.Body>
          {groups.length === 0 ? (
            <div className="text-center py-12">
              <Users
                size={48}
                className="mx-auto mb-4"
                style={{ color: "var(--text-secondary)" }}
              />
              <p
                className="text-lg font-medium mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                No groups yet
              </p>
              <p
                className="text-sm mb-4"
                style={{ color: "var(--text-secondary)" }}
              >
                Create a group to organize users and manage permissions together
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
                  <tr
                    className="border-b"
                    style={{ borderColor: "var(--border-color)" }}
                  >
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
                      className="border-b hover:bg-opacity-50"
                      style={{
                        borderColor: "var(--border-color)",
                      }}
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

      {/* Group Modal */}
      {showModal && (
        <GroupModal
          group={editingGroup}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
};

export default GroupsTab;
