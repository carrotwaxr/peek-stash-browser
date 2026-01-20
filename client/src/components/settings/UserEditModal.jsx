// eslint-disable-next-line no-unused-vars
import { useState, useEffect } from "react";
import { User, X, Shield, Users, Key, Trash2 } from "lucide-react";
import { Button, Paper } from "../ui/index.js";

/**
 * UserEditModal - Comprehensive user management modal
 *
 * @param {Object} props
 * @param {Object} props.user - User object to edit
 * @param {Array} props.groups - List of all groups
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {Function} props.onSave - Callback when changes are saved
 * @param {Function} props.onMessage - Callback for success messages
 * @param {Function} props.onError - Callback for error messages
 * @param {Object} props.api - API instance for requests
 */
/* eslint-disable no-unused-vars */
const UserEditModal = ({
  user,
  groups = [],
  onClose,
  onSave,
  onMessage,
  onError,
  api,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [role, setRole] = useState(user?.role || "USER");
  const [userGroups, setUserGroups] = useState([]);
  const [permissions, setPermissions] = useState(null);
  /* eslint-enable no-unused-vars */

  // Track what has changed for save
  const [hasChanges, setHasChanges] = useState(false);

  if (!user) return null;

  const handleClose = () => {
    if (hasChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) {
        return;
      }
    }
    onClose();
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
                    className="block text-sm font-medium mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
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

            {/* Section 2: Groups - placeholder */}
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
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Groups section - to be implemented
                </p>
              </div>
            </section>

            {/* Section 3: Permissions - placeholder */}
            <section>
              <h3
                className="text-sm font-medium mb-3 flex items-center gap-2"
                style={{ color: "var(--text-secondary)" }}
              >
                <Shield size={16} />
                Permissions
              </h3>
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Permissions section - to be implemented
                </p>
              </div>
            </section>

            {/* Section 4: Account Actions - placeholder */}
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
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" disabled>
                    Reset Password
                  </Button>
                  <Button variant="destructive" size="sm" disabled>
                    <Trash2 size={14} className="mr-1" />
                    Delete User
                  </Button>
                </div>
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
          >
            Save Changes
          </Button>
        </div>
      </Paper>
    </div>
  );
};

export default UserEditModal;
