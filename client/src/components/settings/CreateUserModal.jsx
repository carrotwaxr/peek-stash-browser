import { useState } from "react";
import { Button, Paper } from "../ui/index.js";

const CreateUserModal = ({ onClose, onUserCreated, api }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      await api.post("/user/create", {
        username: username.trim(),
        password,
        role,
      });

      onUserCreated(username);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => !creating && onClose()}
    >
      <Paper
        className="max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header title="Create New User" />
        <form onSubmit={handleSubmit}>
          <Paper.Body>
            <div className="space-y-4">
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
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
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
                  onClick={onClose}
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
  );
};

export default CreateUserModal;
