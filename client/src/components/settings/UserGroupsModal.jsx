import { useEffect, useState } from "react";
import { addGroupMember, removeGroupMember } from "../../services/api.js";
import { Button, Paper } from "../ui/index.js";

/**
 * UserGroupsModal - Manage group memberships for a user
 *
 * Displays all groups as checkboxes, allowing admins to toggle
 * user membership immediately via API calls.
 */
const UserGroupsModal = ({ user, groups, onClose }) => {
  const [userGroups, setUserGroups] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize userGroups from the user's existing group memberships
  useEffect(() => {
    if (user.groups) {
      setUserGroups(new Set(user.groups.map((g) => g.id)));
    }
  }, [user]);

  const handleToggleGroup = async (groupId) => {
    const isCurrentlyMember = userGroups.has(groupId);
    setLoading(true);
    setError(null);

    try {
      if (isCurrentlyMember) {
        // Remove from group
        await removeGroupMember(groupId, user.id);
        setUserGroups((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      } else {
        // Add to group
        await addGroupMember(groupId, user.id);
        setUserGroups((prev) => new Set(prev).add(groupId));
      }
    } catch (err) {
      setError(err.message || "Failed to update group membership");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <Paper
        className="max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header>
          <Paper.Title>Manage Groups</Paper.Title>
          <Paper.Subtitle className="mt-1">
            Select groups for {user.username}
          </Paper.Subtitle>
        </Paper.Header>

        <Paper.Body>
          <div className="space-y-4">
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

            {/* Groups List */}
            {groups.length === 0 ? (
              <div
                className="p-4 text-center text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                No groups have been created yet. Create groups in the Groups
                section above.
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                    style={{
                      backgroundColor: userGroups.has(group.id)
                        ? "rgba(59, 130, 246, 0.1)"
                        : "var(--bg-secondary)",
                      border: `1px solid ${
                        userGroups.has(group.id)
                          ? "rgba(59, 130, 246, 0.3)"
                          : "var(--border-color)"
                      }`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={userGroups.has(group.id)}
                      onChange={() => handleToggleGroup(group.id)}
                      disabled={loading}
                      className="w-4 h-4 mt-0.5 rounded cursor-pointer"
                      style={{ accentColor: "var(--primary-color)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {group.name}
                      </div>
                      {group.description && (
                        <div
                          className="text-sm mt-0.5 truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {group.description}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Close Button */}
            <div className="pt-4">
              <Button onClick={onClose} variant="secondary" fullWidth>
                Close
              </Button>
            </div>
          </div>
        </Paper.Body>
      </Paper>
    </div>
  );
};

export default UserGroupsModal;
