import { useEffect, useRef, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { apiPost } from "../../../api";
import { getRecoveryKey, regenerateRecoveryKey } from "../../../api";
import { showError, showSuccess } from "../../../utils/toast";
import { Button } from "../../ui/index";

const COPY_FAILED = "Copy failed: the key is selected, press Ctrl+C";

const AccountTab = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);

  // Recovery key state. Peek stores only a hash, so a key is shown once:
  // right after it is created, until the page is left.
  const [hasRecoveryKey, setHasRecoveryKey] = useState(false);
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyPassword, setKeyPassword] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const keyRef = useRef<HTMLDivElement>(null);

  // Load whether a recovery key exists on mount
  useEffect(() => {
    const loadRecoveryKey = async () => {
      try {
        const response = await getRecoveryKey();
        setHasRecoveryKey(response.hasRecoveryKey);
      } catch (err) {
        console.error("Failed to load recovery key status:", err);
      } finally {
        setKeyLoading(false);
      }
    };
    loadRecoveryKey();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyPassword) return;

    try {
      setCreatingKey(true);
      const response = await regenerateRecoveryKey(keyPassword);
      setNewKey(response.recoveryKey);
      setHasRecoveryKey(true);
      setKeyPassword("");
    } catch (err) {
      showError((err as Error).message || "Failed to create recovery key");
    } finally {
      setCreatingKey(false);
    }
  };

  // Select the key for a manual copy when the clipboard API is missing
  // (plain HTTP) or refuses the write
  const selectKeyForManualCopy = () => {
    const keyElement = keyRef.current;
    if (keyElement) {
      window.getSelection()?.selectAllChildren(keyElement);
    }
    showError(COPY_FAILED);
  };

  const copyToClipboard = async () => {
    if (!newKey) return;

    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      selectKeyForManualCopy();
      return;
    }

    try {
      await clipboard.writeText(newKey);
      showSuccess("Recovery key copied to clipboard");
    } catch (err) {
      console.error("Failed to copy recovery key:", err);
      selectKeyForManualCopy();
    }
  };

  const changePassword = async (e: React.FormEvent) => {
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

      await apiPost("/user/change-password", {
        currentPassword,
        newPassword,
      });

      showSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      showError((err as Error).message || "Failed to change password");
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
              <p
                className="text-xs mb-1"
                style={{ color: "var(--text-muted)" }}
              >
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

            <div
              className="flex justify-end pt-4 border-t"
              style={{ borderColor: "var(--border-color)" }}
            >
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
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          A recovery key resets your password if you forget it. Keep it
          somewhere safe; creating a new key replaces the old one.
        </p>

        {keyLoading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p style={{ color: "var(--text-primary)" }}>
                {hasRecoveryKey
                  ? "A recovery key is set."
                  : "You don't have a recovery key yet."}
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Peek stores only a fingerprint of your key, so it can show a key
                only once, when it is created.
              </p>
            </div>

            {newKey && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    ref={keyRef}
                    className="flex-1 px-4 py-3 rounded-lg font-mono text-sm break-all"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {newKey}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void copyToClipboard()}
                    title="Copy to clipboard"
                    aria-label="Copy recovery key"
                  >
                    <Copy size={16} />
                  </Button>
                </div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--status-warning)" }}
                >
                  Save this key now. Peek won&apos;t show it again.
                </p>
              </div>
            )}

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <label
                  htmlFor="recoveryKeyPassword"
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Confirm with your current password
                </label>
                <input
                  type="password"
                  id="recoveryKeyPassword"
                  autoComplete="current-password"
                  value={keyPassword}
                  onChange={(e) => setKeyPassword(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={!keyPassword || creatingKey}
                  loading={creatingKey}
                >
                  <RefreshCw size={14} className="mr-1" />
                  {hasRecoveryKey ? "Create new key" : "Create key"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountTab;
