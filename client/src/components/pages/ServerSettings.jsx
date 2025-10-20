import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import axios from "axios";
import { usePageTitle } from "../../hooks/usePageTitle.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const ServerSettings = () => {
  usePageTitle("Server Settings");
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("USER");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // Redirect if not admin
    if (currentUser && currentUser.role !== "ADMIN") {
      navigate("/");
      return;
    }

    loadUsers();
  }, [currentUser, navigate]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/user/all");
      setUsers(response.data.users || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();

    if (!newUsername.trim() || !newPassword.trim()) {
      setError("Username and password are required");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      setMessage(null);

      await api.post("/user/create", {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });

      setMessage(`User "${newUsername}" created successfully!`);
      setShowCreateModal(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("USER");
      loadUsers();

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async (userId, username) => {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      setError(null);
      setMessage(null);

      await api.delete(`/user/${userId}`);

      setMessage(`User "${username}" deleted successfully!`);
      loadUsers();

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete user");
    }
  };

  const changeUserRole = async (userId, username, currentRole) => {
    const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";

    if (
      !confirm(
        `Change "${username}" from ${currentRole} to ${newRole}?`
      )
    ) {
      return;
    }

    try {
      setError(null);
      setMessage(null);

      await api.put(`/user/${userId}/role`, { role: newRole });

      setMessage(`User "${username}" role changed to ${newRole}!`);
      loadUsers();

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to change user role");
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </PageLayout>
    );
  }

  return (
      <PageLayout>
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1
              className="text-3xl font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Server Settings
            </h1>
            <p style={{ color: "var(--text-secondary)" }}>
              Manage server configuration and user accounts
            </p>
          </div>

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

          {/* User Management Section */}
          <div
            className="card mb-6"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div className="card-header">
              <div className="flex items-center justify-between">
                <div>
                  <h2
                    className="text-xl font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    User Management
                  </h2>
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Manage user accounts and permissions
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 rounded-lg font-medium"
                  style={{
                    backgroundColor: "var(--accent-color)",
                    color: "white",
                  }}
                >
                  + Create User
                </button>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
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
                                  ? "rgba(168, 85, 247, 0.1)"
                                  : "rgba(100, 116, 139, 0.1)",
                              color:
                                user.role === "ADMIN"
                                  ? "rgb(168, 85, 247)"
                                  : "rgb(100, 116, 139)",
                            }}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() =>
                                changeUserRole(user.id, user.username, user.role)
                              }
                              disabled={user.id === currentUser?.id}
                              className="px-3 py-1 text-sm rounded"
                              style={{
                                backgroundColor: "rgba(59, 130, 246, 0.1)",
                                color: "rgb(59, 130, 246)",
                                opacity: user.id === currentUser?.id ? 0.5 : 1,
                                cursor:
                                  user.id === currentUser?.id
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              Change Role
                            </button>
                            <button
                              onClick={() => deleteUser(user.id, user.username)}
                              disabled={user.id === currentUser?.id}
                              className="px-3 py-1 text-sm rounded hover:bg-red-500 hover:text-white transition-colors"
                              style={{
                                backgroundColor: "rgba(239, 68, 68, 0.1)",
                                color: "rgb(239, 68, 68)",
                                opacity: user.id === currentUser?.id ? 0.5 : 1,
                                cursor:
                                  user.id === currentUser?.id
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Future sections can be added here */}
          {/* Example: Server Configuration, Database Settings, etc. */}
        </div>
      </PageLayout>

      {/* Create User Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !creating && setShowCreateModal(false)}
        >
          <div
            className="card max-w-md w-full mx-4"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h2
                className="text-xl font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Create New User
              </h2>
            </div>
            <form onSubmit={createUser} className="card-body">
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="newUsername"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    id="newUsername"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    required
                    minLength={6}
                  />
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Must be at least 6 characters
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="newRole"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Role
                  </label>
                  <select
                    id="newRole"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Admins can manage users and server settings
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 px-4 py-2 rounded-lg font-medium"
                    style={{
                      backgroundColor: "var(--accent-color)",
                      color: "white",
                      opacity: creating ? 0.6 : 1,
                    }}
                  >
                    {creating ? "Creating..." : "Create User"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewUsername("");
                      setNewPassword("");
                      setNewRole("USER");
                      setError(null);
                    }}
                    disabled={creating}
                    className="px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      opacity: creating ? 0.6 : 1,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
  );
};

export default ServerSettings;
