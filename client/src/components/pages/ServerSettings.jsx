import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import axios from "axios";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { PageLayout } from "../ui/index.js";
import { setupApi } from "../../services/api.js";
import Button from "../ui/Button.jsx";
import Paper from "../ui/Paper.jsx";
import ServerStatsSection from "../settings/ServerStatsSection.jsx";
import ContentRestrictionsModal from "../settings/ContentRestrictionsModal.jsx";
import packageJson from "../../../package.json";

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

  // Version state
  const [serverVersion, setServerVersion] = useState(null);
  const [latestVersion, setLatestVersion] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const CLIENT_VERSION = packageJson.version;

  // Stash sync state
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncTargetUser, setSyncTargetUser] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [syncOptions, setSyncOptions] = useState({
    scenes: { rating: true, favorite: false, oCounter: false }, // Scenes don't have favorites in Stash
    performers: { rating: true, favorite: true },
    studios: { rating: true, favorite: true },
    tags: { rating: false, favorite: true }, // Tags don't have ratings in Stash
  });

  // Content restrictions state
  const [showRestrictionsModal, setShowRestrictionsModal] = useState(false);
  const [restrictionsTargetUser, setRestrictionsTargetUser] = useState(null);

  useEffect(() => {
    // Redirect if not admin
    if (currentUser && currentUser.role !== "ADMIN") {
      navigate("/");
      return;
    }

    loadUsers();
    loadPathMappings();
    loadServerVersion();
    checkForUpdates();
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

    if (!confirm(`Change "${username}" from ${currentRole} to ${newRole}?`)) {
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

  const toggleSyncToStash = async (userId, username, currentSyncToStash) => {
    const newSyncToStash = !currentSyncToStash;

    try {
      setError(null);
      setMessage(null);

      await api.put(`/user/${userId}/settings`, {
        syncToStash: newSyncToStash,
      });

      setMessage(
        `Stash sync ${
          newSyncToStash ? "enabled" : "disabled"
        } for "${username}"!`
      );
      loadUsers();

      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update sync setting");
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
      setError(
        "Failed to discover Stash libraries: " +
          (err.message || "Unknown error")
      );
    }
  };

  // Version functions
  const loadServerVersion = async () => {
    try {
      const response = await api.get("/version");
      setServerVersion(response.data.server);
    } catch (err) {
      console.error("Failed to load server version:", err);
    }
  };

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateError(null);

    try {
      // Check GitHub API for latest release
      const response = await fetch(
        "https://api.github.com/repos/carrotwaxr/peek-stash-browser/releases/latest"
      );

      if (!response.ok) {
        if (response.status === 404) {
          setUpdateError("No releases available yet");
        } else {
          setUpdateError(`GitHub API error: ${response.status}`);
        }
        return;
      }

      const data = await response.json();
      const latestTag = data.tag_name.replace("v", ""); // Remove 'v' prefix if present
      setLatestVersion(latestTag);
    } catch (err) {
      console.error("Failed to check for updates:", err);
      setUpdateError("Network error - could not reach GitHub");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const compareVersions = (current, latest) => {
    if (!current || !latest) return false;

    const currentParts = current.split(".").map(Number);
    const latestParts = latest.split(".").map(Number);

    for (let i = 0; i < 3; i++) {
      if ((latestParts[i] || 0) > (currentParts[i] || 0)) return true;
      if ((latestParts[i] || 0) < (currentParts[i] || 0)) return false;
    }
    return false;
  };

  // Open sync modal for a user
  const openSyncModal = (user) => {
    setSyncTargetUser(user);
    setShowSyncModal(true);
    setSyncResult(null);
    setSyncError(null);
    // Reset sync options to defaults
    setSyncOptions({
      scenes: { rating: true, favorite: false, oCounter: false },
      performers: { rating: true, favorite: true },
      studios: { rating: true, favorite: true },
      tags: { rating: false, favorite: true },
    });
  };

  // Stash sync function
  const syncFromStash = async () => {
    if (!syncTargetUser) return;

    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    setError(null);
    setMessage(null);

    try {
      const response = await api.post(
        `/user/${syncTargetUser.id}/sync-from-stash`,
        {
          options: syncOptions,
        }
      );
      setSyncResult(response.data.stats);
      setMessage(
        `Successfully synced data from Stash for ${syncTargetUser.username}!`
      );
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      setSyncError(err.response?.data?.error || "Failed to sync from Stash");
      setError(err.response?.data?.error || "Failed to sync from Stash");
      setTimeout(() => setError(null), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const toggleSyncOption = (entityType, field) => {
    setSyncOptions((prev) => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        [field]: !prev[entityType][field],
      },
    }));
  };

  // Open content restrictions modal for a user
  const openRestrictionsModal = (user) => {
    setRestrictionsTargetUser(user);
    setShowRestrictionsModal(true);
  };

  // Handle restrictions save success
  const handleRestrictionsSaved = () => {
    setMessage(`Content restrictions updated for ${restrictionsTargetUser?.username}!`);
    setTimeout(() => setMessage(null), 3000);
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
                        className="text-center px-6 py-4 font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Sync to Stash
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
                                  : "var(--bg-tertiary)",
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
                        <td
                          className="px-6 py-4 text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              onClick={() => openSyncModal(user)}
                              variant="tertiary"
                              size="sm"
                              className="px-3 py-1 text-sm"
                            >
                              Sync from Stash
                            </Button>
                            <Button
                              onClick={() => openRestrictionsModal(user)}
                              variant="tertiary"
                              size="sm"
                              className="px-3 py-1 text-sm"
                              title="Manage content restrictions for this user"
                            >
                              Content Restrictions
                            </Button>
                            <Button
                              onClick={() =>
                                changeUserRole(
                                  user.id,
                                  user.username,
                                  user.role
                                )
                              }
                              disabled={user.id === currentUser?.id}
                              variant="secondary"
                              size="sm"
                              className="px-3 py-1 text-sm"
                            >
                              Change Role
                            </Button>
                            <Button
                              onClick={() => deleteUser(user.id, user.username)}
                              disabled={user.id === currentUser?.id}
                              variant="destructive"
                              size="sm"
                              className="px-3 py-1 text-sm"
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
                  <Button onClick={discoverLibraries} variant="secondary">
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

          {/* Server Statistics Section */}
          <ServerStatsSection />

          {/* Version Information Section */}
          <Paper className="mb-6">
            <Paper.Header>
              <div className="flex items-center justify-between">
                <div>
                  <Paper.Title>Version Information</Paper.Title>
                  <Paper.Subtitle className="mt-1">
                    Current versions and update status
                  </Paper.Subtitle>
                </div>
                <Button
                  onClick={checkForUpdates}
                  disabled={checkingUpdate}
                  variant="secondary"
                  loading={checkingUpdate}
                >
                  Check for Updates
                </Button>
              </div>
            </Paper.Header>
            <Paper.Body>
              <div className="space-y-4">
                {/* Version Display */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Client Version
                    </p>
                    <p
                      className="text-lg font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {CLIENT_VERSION}
                    </p>
                  </div>
                  <div>
                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Server Version
                    </p>
                    <p
                      className="text-lg font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {serverVersion || "Loading..."}
                    </p>
                  </div>
                </div>

                {/* Update Notification */}
                {latestVersion &&
                  compareVersions(CLIENT_VERSION, latestVersion) && (
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <svg
                          className="w-5 h-5 flex-shrink-0 mt-0.5"
                          style={{ color: "rgb(59, 130, 246)" }}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div className="flex-1">
                          <p
                            className="font-medium mb-1"
                            style={{ color: "rgb(59, 130, 246)" }}
                          >
                            Update Available
                          </p>
                          <p
                            className="text-sm mb-2"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Version {latestVersion} is now available. You're
                            running version {CLIENT_VERSION}.
                          </p>
                          <a
                            href="https://github.com/carrotwaxr/peek-stash-browser/releases/latest"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium inline-flex items-center gap-1 hover:underline"
                            style={{ color: "rgb(59, 130, 246)" }}
                          >
                            View Release Notes
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Error State */}
                {updateError && (
                  <div
                    className="p-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      color: "rgb(239, 68, 68)",
                    }}
                  >
                    {updateError}
                  </div>
                )}

                {/* Up to Date Message */}
                {latestVersion &&
                  !compareVersions(CLIENT_VERSION, latestVersion) && (
                    <div
                      className="p-3 rounded-lg text-sm"
                      style={{
                        backgroundColor: "rgba(34, 197, 94, 0.1)",
                        color: "rgb(34, 197, 94)",
                      }}
                    >
                      ✓ You're running the latest version
                    </div>
                  )}
              </div>
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
          <Paper
            className="max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
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

      {/* Sync from Stash Modal */}
      {showSyncModal && syncTargetUser && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !syncing && setShowSyncModal(false)}
        >
          <Paper
            className="max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Paper.Header>
              <Paper.Title>Sync from Stash</Paper.Title>
              <Paper.Subtitle className="mt-1">
                Import ratings and favorites for {syncTargetUser.username}
              </Paper.Subtitle>
            </Paper.Header>
            <Paper.Body>
              <div className="space-y-4">
                {/* Info Message */}
                <div
                  className="p-4 rounded-lg text-sm"
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <p className="mb-2">
                    Select which data to import from Stash. Only fields that
                    exist in Stash are shown.
                  </p>
                  <ul
                    className="list-disc list-inside space-y-1 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <li>
                      Only imports items that have the selected fields set in
                      Stash
                    </li>
                    <li>
                      Updates existing Peek data if values differ from Stash
                    </li>
                    <li>
                      O Counter import syncs total count only (not individual
                      timestamps)
                    </li>
                    <li>May take several minutes for large libraries</li>
                  </ul>
                </div>

                {/* Sync Options */}
                {!syncing && !syncResult && (
                  <div className="space-y-4">
                    {/* Scenes */}
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <h4
                        className="font-medium mb-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Scenes
                      </h4>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={syncOptions.scenes.rating}
                            onChange={() =>
                              toggleSyncOption("scenes", "rating")
                            }
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{ accentColor: "var(--primary-color)" }}
                          />
                          <span style={{ color: "var(--text-primary)" }}>
                            Rating
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={syncOptions.scenes.oCounter}
                            onChange={() =>
                              toggleSyncOption("scenes", "oCounter")
                            }
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{ accentColor: "var(--primary-color)" }}
                          />
                          <span style={{ color: "var(--text-primary)" }}>
                            O Counter
                          </span>
                        </label>
                        {syncOptions.scenes.oCounter && (
                          <p
                            className="text-xs ml-6 p-2 rounded"
                            style={{
                              color: "rgb(245, 158, 11)",
                              backgroundColor: "rgba(245, 158, 11, 0.1)",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                            }}
                          >
                            ⚠️ Warning: Only the total O Counter value will be synced. Individual timestamps (last O at) from Stash history will not be imported.
                          </p>
                        )}
                        <p
                          className="text-xs ml-6"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Scenes do not have favorites in Stash
                        </p>
                      </div>
                    </div>

                    {/* Performers */}
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <h4
                        className="font-medium mb-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Performers
                      </h4>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={syncOptions.performers.rating}
                            onChange={() =>
                              toggleSyncOption("performers", "rating")
                            }
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{ accentColor: "var(--primary-color)" }}
                          />
                          <span style={{ color: "var(--text-primary)" }}>
                            Rating
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={syncOptions.performers.favorite}
                            onChange={() =>
                              toggleSyncOption("performers", "favorite")
                            }
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{ accentColor: "var(--primary-color)" }}
                          />
                          <span style={{ color: "var(--text-primary)" }}>
                            Favorite
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Studios */}
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <h4
                        className="font-medium mb-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Studios
                      </h4>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={syncOptions.studios.rating}
                            onChange={() =>
                              toggleSyncOption("studios", "rating")
                            }
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{ accentColor: "var(--primary-color)" }}
                          />
                          <span style={{ color: "var(--text-primary)" }}>
                            Rating
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={syncOptions.studios.favorite}
                            onChange={() =>
                              toggleSyncOption("studios", "favorite")
                            }
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{ accentColor: "var(--primary-color)" }}
                          />
                          <span style={{ color: "var(--text-primary)" }}>
                            Favorite
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Tags */}
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <h4
                        className="font-medium mb-3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Tags
                      </h4>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={syncOptions.tags.favorite}
                            onChange={() =>
                              toggleSyncOption("tags", "favorite")
                            }
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{ accentColor: "var(--primary-color)" }}
                          />
                          <span style={{ color: "var(--text-primary)" }}>
                            Favorite
                          </span>
                        </label>
                        <p
                          className="text-xs ml-6"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Tags do not have ratings in Stash
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Loading State */}
                {syncing && (
                  <div
                    className="p-6 rounded-lg text-center"
                    style={{
                      backgroundColor: "rgba(59, 130, 246, 0.05)",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                    }}
                  >
                    <div className="flex flex-col items-center gap-4">
                      <div
                        className="animate-spin w-12 h-12 border-4 border-t-transparent rounded-full"
                        style={{
                          borderColor: "rgba(59, 130, 246, 0.3)",
                          borderTopColor: "transparent",
                        }}
                      ></div>
                      <div>
                        <p
                          className="font-medium mb-1"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Syncing from Stash...
                        </p>
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          This may take several minutes. Please wait.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Success Result */}
                {syncResult && !syncing && (
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: "rgba(34, 197, 94, 0.1)",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                    }}
                  >
                    <p
                      className="font-medium mb-3"
                      style={{ color: "rgb(34, 197, 94)" }}
                    >
                      ✓ Sync Completed Successfully
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p
                          className="font-medium mb-1"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Scenes
                        </p>
                        <p style={{ color: "var(--text-secondary)" }}>
                          {syncResult.scenes.checked.toLocaleString()} checked
                          <br />
                          {syncResult.scenes.created} new
                          <br />
                          {syncResult.scenes.updated} updated
                        </p>
                      </div>
                      <div>
                        <p
                          className="font-medium mb-1"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Performers
                        </p>
                        <p style={{ color: "var(--text-secondary)" }}>
                          {syncResult.performers.checked.toLocaleString()}{" "}
                          checked
                          <br />
                          {syncResult.performers.created} new
                          <br />
                          {syncResult.performers.updated} updated
                        </p>
                      </div>
                      <div>
                        <p
                          className="font-medium mb-1"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Studios
                        </p>
                        <p style={{ color: "var(--text-secondary)" }}>
                          {syncResult.studios.checked.toLocaleString()} checked
                          <br />
                          {syncResult.studios.created} new
                          <br />
                          {syncResult.studios.updated} updated
                        </p>
                      </div>
                      <div>
                        <p
                          className="font-medium mb-1"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Tags
                        </p>
                        <p style={{ color: "var(--text-secondary)" }}>
                          {syncResult.tags.checked.toLocaleString()} checked
                          <br />
                          {syncResult.tags.created} new
                          <br />
                          {syncResult.tags.updated} updated
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error State */}
                {syncError && (
                  <div
                    className="p-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      color: "rgb(239, 68, 68)",
                    }}
                  >
                    {syncError}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  {!syncing && !syncResult && (
                    <>
                      <Button
                        onClick={syncFromStash}
                        variant="primary"
                        fullWidth
                      >
                        Start Sync
                      </Button>
                      <Button
                        onClick={() => {
                          setShowSyncModal(false);
                          setSyncTargetUser(null);
                          setSyncResult(null);
                          setSyncError(null);
                        }}
                        variant="secondary"
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                  {syncResult && (
                    <Button
                      onClick={() => {
                        setShowSyncModal(false);
                        setSyncTargetUser(null);
                        setSyncResult(null);
                        setSyncError(null);
                      }}
                      variant="primary"
                      fullWidth
                    >
                      Close
                    </Button>
                  )}
                </div>
              </div>
            </Paper.Body>
          </Paper>
        </div>
      )}

      {/* Add Path Mapping Modal */}
      {showAddMappingModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !addingMapping && setShowAddMappingModal(false)}
        >
          <Paper
            className="max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
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
                      Path as reported by Stash (use "Discover Libraries" to
                      auto-fill)
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

      {/* Content Restrictions Modal */}
      {showRestrictionsModal && restrictionsTargetUser && (
        <ContentRestrictionsModal
          user={restrictionsTargetUser}
          onClose={() => {
            setShowRestrictionsModal(false);
            setRestrictionsTargetUser(null);
          }}
          onSave={handleRestrictionsSaved}
        />
      )}
    </>
  );
};

export default ServerSettings;
