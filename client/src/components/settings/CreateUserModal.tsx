import { useRef, useState } from "react";
import { apiPost } from "../../api";
import { Button, Modal } from "../ui/index";

interface Props {
  onClose: () => void;
  onUserCreated: (username: string) => void;
}

const CreateUserModal = ({ onClose, onUserCreated }: Props) => {
  const usernameRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.SubmitEvent) => {
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

      await apiPost("/user/create", {
        username: username.trim(),
        password,
        role,
      });

      onUserCreated(username);
      onClose();
    } catch (err) {
      setError((err as Error).message || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Create New User"
      size="sm"
      dismissible={!creating}
      initialFocusRef={usernameRef}
    >
      <form onSubmit={(e) => void handleSubmit(e)}>
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
              ref={usernameRef}
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
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
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
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
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
      </form>
    </Modal>
  );
};

export default CreateUserModal;
