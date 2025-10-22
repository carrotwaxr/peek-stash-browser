import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import axios from "axios";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { PageLayout } from "../ui/index.js";
import { setupApi } from "../../services/api.js";
import Button from "../ui/Button.jsx";
import Paper from "../ui/Paper.jsx";

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

  // Path mappings state
  const [pathMappings, setPathMappings] = useState([]);
  const [showAddMappingModal, setShowAddMappingModal] = useState(false);
  const [newStashPath, setNewStashPath] = useState("");
  const [newPeekPath, setNewPeekPath] = useState("");
  const [addingMapping, setAddingMapping] = useState(false);
  const [pathTestResult, setPathTestResult] = useState(null);
  const [testingPath, setTestingPath] = useState(false);

  useEffect(() => {
    // Redirect if not admin
    if (currentUser && currentUser.role !== "ADMIN") {
      navigate("/");
      return;
    }

    loadUsers();
    loadPathMappings();
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

  // Path mapping functions
  const loadPathMappings = async () => {
    try {
      const response = await setupApi.getPathMappings();
      setPathMappings(response.mappings || []);
    } catch (err) {
      console.error("Failed to load path mappings:", err);
    }
  };

  const testPath = async () => {
    if (!newPeekPath.trim()) return;

    setTestingPath(true);
    setPathTestResult(null);

    try {
      const result = await setupApi.testPath(newPeekPath.trim());
      setPathTestResult(result);
    } catch (err) {
      setPathTestResult({
        success: false,
        message: "Failed to test path: " + (err.message || "Unknown error"),
      });
    } finally {
      setTestingPath(false);
    }
  };

  const addPathMapping = async (e) => {
    e.preventDefault();

    if (!newStashPath.trim() || !newPeekPath.trim()) {
      setError("Both Stash path and Peek path are required");
      return;
    }

    try {
      setAddingMapping(true);
      setError(null);
      setMessage(null);

      await setupApi.addPathMapping(newStashPath.trim(), newPeekPath.trim());

      setMessage("Path mapping added successfully!");
      setShowAddMappingModal(false);
      setNewStashPath("");
      setNewPeekPath("");
      setPathTestResult(null);
      loadPathMappings();

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to add path mapping");
    } finally {
      setAddingMapping(false);
    }
  };

  const deletePathMapping = async (mappingId, stashPath) => {
    if (!confirm(`Delete path mapping for "${stashPath}"?`)) {
      return;
    }

    try {
      setError(null);
      setMessage(null);

      await setupApi.deletePathMapping(mappingId);

      setMessage("Path mapping deleted successfully!");
      loadPathMappings();

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete path mapping");
    }
  };

  const discoverLibraries = async () => {
    try {
      setError(null);
      setMessage(null);

      const response = await setupApi.discoverStashLibraries();

      if (response.success && response.paths.length > 0) {
        setNewStashPath(response.paths[0]); // Pre-fill with first discovered path
        setShowAddMappingModal(true);
        setMessage(
          `Discovered ${response.paths.length} library path(s) from Stash`
        );
        setTimeout(() => setMessage(null), 3000);
      } else {
        setError("No library paths found in Stash configuration");
      }
    } catch (err) {
      setError("Failed to discover Stash libraries: " + (err.message || "Unknown error"));
    }
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
    <>
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
          <Paper className="mb-6">
            <Paper.Header>
              <div className="flex items-center justify-between">
                <div>
                  <Paper.Title>User Management</Paper.Title>
                  <Paper.Subtitle className="mt-1">
                    Manage user accounts and permissions
                  </Paper.Subtitle>
                </div>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  variant="primary"
                >
                  + Create User
                </Button>
              </div>
            </Paper.Header>
            <Paper.Body padding="none">
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
                                  ? "var(--role-admin-bg)"
                                  : "var(--role-user-bg)",
                              color:
                                user.role === "ADMIN"
                                  ? "var(--role-admin-text)"
                                  : "var(--role-user-text)",
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
                            <Button
                              onClick={() =>
                                changeUserRole(user.id, user.username, user.role)
                              }
                              disabled={user.id === currentUser?.id}
                              variant="secondary"
                              size="sm"
                              className="px-3 py-1 text-sm"
                              style={{
                                backgroundColor: "rgba(59, 130, 246, 0.1)",
                                color: "rgb(59, 130, 246)",
                              }}
                            >
                              Change Role
                            </Button>
                            <Button
                              onClick={() => deleteUser(user.id, user.username)}
                              disabled={user.id === currentUser?.id}
                              variant="destructive"
                              size="sm"
                              className="px-3 py-1 text-sm"
                              style={{
                                backgroundColor: "rgba(239, 68, 68, 0.1)",
                                color: "rgb(239, 68, 68)",
                              }}
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
            </Paper.Body>
          </Paper>

          {/* Path Mappings Section */}
          <Paper className="mb-6">
            <Paper.Header>
              <div className="flex items-center justify-between">
                <div>
                  <Paper.Title>Path Mappings</Paper.Title>
                  <Paper.Subtitle className="mt-1">
                    Configure path translations between Stash and Peek
                  </Paper.Subtitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={discoverLibraries}
                    variant="secondary"
                  >
                    Discover Libraries
                  </Button>
                  <Button
                    onClick={() => setShowAddMappingModal(true)}
                    variant="primary"
                  >
                    + Add Mapping
                  </Button>
                </div>
              </div>
            </Paper.Header>
            <Paper.Body padding="none">
              {pathMappings.length === 0 ? (
                <div className="p-8 text-center">
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    No path mappings configured. Add a mapping to enable video
                    playback.
                  </p>
                </div>
              ) : (
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
                          Stash Path
                        </th>
                        <th
                          className="text-left px-6 py-4 font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Peek Path
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
                      {pathMappings.map((mapping) => (
                        <tr
                          key={mapping.id}
                          style={{
                            borderBottom: "1px solid var(--border-color)",
                          }}
                        >
                          <td
                            className="px-6 py-4 font-mono text-sm"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {mapping.stashPath}
                          </td>
                          <td
                            className="px-6 py-4 font-mono text-sm"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {mapping.peekPath}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              onClick={() =>
                                deletePathMapping(mapping.id, mapping.stashPath)
                              }
                              variant="destructive"
                              size="sm"
                              className="px-3 py-1 text-sm"
                              style={{
                                backgroundColor: "rgba(239, 68, 68, 0.1)",
                                color: "rgb(239, 68, 68)",
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Paper.Body>
          </Paper>
        </div>
      </PageLayout>

      {/* Create User Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !creating && setShowCreateModal(false)}
        >
          <Paper className="max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <Paper.Header title="Create New User" />
            <form onSubmit={createUser}>
              <Paper.Body>
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
                  <Button
                    type="submit"
                    disabled={creating}
                    variant="primary"
                    fullWidth
                    loading={creating}
                  >
                    Create User
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewUsername("");
                      setNewPassword("");
                      setNewRole("USER");
                      setError(null);
                    }}
                    disabled={creating}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
              </Paper.Body>
            </form>
          </Paper>
        </div>
      )}

      {/* Add Path Mapping Modal */}
      {showAddMappingModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !addingMapping && setShowAddMappingModal(false)}
        >
          <Paper className="max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <Paper.Header
              title="Add Path Mapping"
              subtitle="Map a Stash library path to where Peek can access it"
            />
            <form onSubmit={addPathMapping}>
              <Paper.Body>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="stashPath"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Stash Path
                  </label>
                  <input
                    type="text"
                    id="stashPath"
                    value={newStashPath}
                    onChange={(e) => setNewStashPath(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg font-mono text-sm"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="/data or C:\Videos"
                    required
                    autoFocus
                  />
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Path as reported by Stash (use "Discover Libraries" to auto-fill)
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="peekPath"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Peek Path
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="peekPath"
                      value={newPeekPath}
                      onChange={(e) => {
                        setNewPeekPath(e.target.value);
                        setPathTestResult(null);
                      }}
                      className="flex-1 px-4 py-2 rounded-lg font-mono text-sm"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      placeholder="/app/media"
                      required
                    />
                    <Button
                      type="button"
                      onClick={testPath}
                      disabled={!newPeekPath.trim() || testingPath}
                      variant="primary"
                      loading={testingPath}
                    >
                      Test
                    </Button>
                  </div>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Docker mount point where Peek accesses these files
                  </p>
                  {pathTestResult && (
                    <div
                      className="text-sm mt-2 p-2 rounded"
                      style={{
                        backgroundColor:
                          pathTestResult.exists && pathTestResult.readable
                            ? "rgba(34, 197, 94, 0.1)"
                            : "rgba(239, 68, 68, 0.1)",
                        color:
                          pathTestResult.exists && pathTestResult.readable
                            ? "rgb(34, 197, 94)"
                            : "rgb(239, 68, 68)",
                      }}
                    >
                      {pathTestResult.message}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={addingMapping}
                    variant="primary"
                    fullWidth
                    loading={addingMapping}
                  >
                    Add Mapping
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setShowAddMappingModal(false);
                      setNewStashPath("");
                      setNewPeekPath("");
                      setPathTestResult(null);
                      setError(null);
                    }}
                    disabled={addingMapping}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
              </Paper.Body>
            </form>
          </Paper>
        </div>
      )}
    </>
  );
};

export default ServerSettings;
