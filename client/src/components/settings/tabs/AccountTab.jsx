import { useState, useEffect } from "react";
import axios from "axios";
import { Copy, RefreshCw, Eye, EyeOff } from "lucide-react";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import { Button } from "../../ui/index.js";
import { getRecoveryKey, regenerateRecoveryKey } from "../../../services/api.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const AccountTab = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);

  // Recovery key state
  const [recoveryKey, setRecoveryKey] = useState(null);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [keyLoading, setKeyLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  // Load recovery key on mount
  useEffect(() => {
    const loadRecoveryKey = async () => {
      try {
        const response = await getRecoveryKey();
        setRecoveryKey(response.recoveryKey);
      } catch (err) {
        console.error("Failed to load recovery key:", err);
      } finally {
        setKeyLoading(false);
      }
    };
    loadRecoveryKey();
  }, []);

  const handleRegenerateKey = async () => {
    if (!confirm("Are you sure you want to regenerate your recovery key?\n\nYour old key will no longer work for password recovery.")) {
      return;
    }

    try {
      setRegenerating(true);
      const response = await regenerateRecoveryKey();
      setRecoveryKey(response.recoveryKey);
      setShowRecoveryKey(true);
      showSuccess("Recovery key regenerated");
    } catch {
      showError("Failed to regenerate recovery key");
    } finally {
      setRegenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(recoveryKey);
    showSuccess("Recovery key copied to clipboard");
  };

  const changePassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      showError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      showError("Password must be at least 8 characters");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      showError("Password must contain at least one letter");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      showError("Password must contain at least one number");
      return;
    }

    try {
      setPasswordChanging(true);

      await api.post("/user/change-password", {
        currentPassword,
        newPassword,
      });

      showSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to change password");
    } finally {
      setPasswordChanging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Change Password Section */}
      <form onSubmit={changePassword}>
        <div
          className="p-6 rounded-lg border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <h3
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Change Password
          </h3>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Current Password
              </label>
              <input
                type="password"
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                required
              />
            </div>

            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                New Password
              </label>
              <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                8+ characters with at least one letter and one number
              </p>
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
                minLength={8}
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                required
                minLength={8}
              />
            </div>

            <div className="flex justify-end pt-4 border-t" style={{ borderColor: "var(--border-color)" }}>
              <Button
                type="submit"
                disabled={passwordChanging}
                variant="primary"
                loading={passwordChanging}
              >
                Change Password
              </Button>
            </div>
          </div>
        </div>
      </form>

      {/* Recovery Key Section */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Recovery Key
        </h3>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          Use this key to reset your password if you forget it. Keep it somewhere safe.
        </p>

        {keyLoading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        ) : recoveryKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div
                className="flex-1 px-4 py-3 rounded-lg font-mono text-sm"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                {showRecoveryKey ? recoveryKey : "••••-••••-••••-••••-••••-••••-••••"}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRecoveryKey(!showRecoveryKey)}
                title={showRecoveryKey ? "Hide key" : "Show key"}
              >
                {showRecoveryKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyToClipboard}
                disabled={!showRecoveryKey}
                title="Copy to clipboard"
              >
                <Copy size={16} />
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                variant="tertiary"
                size="sm"
                onClick={handleRegenerateKey}
                disabled={regenerating}
                loading={regenerating}
              >
                <RefreshCw size={14} className="mr-1" />
                Regenerate Key
              </Button>
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>
            No recovery key set. Log out and back in to generate one.
          </p>
        )}
      </div>
    </div>
  );
};

export default AccountTab;
