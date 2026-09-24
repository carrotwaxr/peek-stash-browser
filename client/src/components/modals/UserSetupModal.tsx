import { useEffect, useRef, useState } from "react";
import { Check, Copy, Server } from "lucide-react";
import { userSetupApi } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import { showError } from "../../utils/toast";
import { Button } from "../ui/index";

const COPY_FAILED = "Copy failed: the key is selected, press Ctrl+C";

interface StashInstance {
  id: string;
  name: string;
  description?: string | null;
}

interface Props {
  onComplete?: () => void;
}

/**
 * First sign-in setup, in two steps:
 * 1. Content Sources (when there are 2+ instances) and Continue, which
 *    completes setup on the server and creates the first recovery key.
 * 2. The recovery key, shown this once, and Get Started.
 * When the server returns no key (setup was already complete), step two is
 * skipped.
 */
const UserSetupModal = ({ onComplete }: Props) => {
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const keyRef = useRef<HTMLElement>(null);
  const [instances, setInstances] = useState<StashInstance[]>([]);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [showInstanceSelection, setShowInstanceSelection] = useState(false);

  useEffect(() => {
    const fetchSetupStatus = async () => {
      try {
        const { instances: inst, instanceCount } =
          await userSetupApi.getSetupStatus();

        setInstances(inst || []);
        setShowInstanceSelection((instanceCount ?? 0) >= 2);

        // Pre-select all instances
        setSelectedInstanceIds((inst || []).map((i: StashInstance) => i.id));
      } catch (err) {
        setLoadFailed(true);
        setError("Failed to load setup data");
        console.error("Setup status error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSetupStatus();
  }, []);

  // Select the key for a manual copy when the clipboard API is missing
  // (plain HTTP) or refuses the write
  const selectKeyForManualCopy = () => {
    const keyElement = keyRef.current;
    if (keyElement) {
      window.getSelection()?.selectAllChildren(keyElement);
    }
    showError(COPY_FAILED);
  };

  const handleCopyKey = async () => {
    if (!recoveryKey) return;

    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      selectKeyForManualCopy();
      return;
    }

    try {
      await clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy recovery key:", err);
      selectKeyForManualCopy();
    }
  };

  const handleInstanceToggle = (instanceId: string) => {
    setSelectedInstanceIds((prev) => {
      if (prev.includes(instanceId)) {
        // Don't allow unchecking if it's the last one
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== instanceId);
      }
      return [...prev, instanceId];
    });
  };

  const finish = () => {
    // Update auth context
    updateUser({ setupCompleted: true });
    onComplete?.();
  };

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const { recoveryKey: key } = await userSetupApi.completeSetup(
        showInstanceSelection ? selectedInstanceIds : []
      );

      if (key) {
        setRecoveryKey(key);
      } else {
        finish();
      }
    } catch (err) {
      setError((err as Error).message || "Failed to complete setup");
      console.error("Complete setup error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="text-lg" style={{ color: "var(--text-primary)" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Welcome to Peek
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>Let's get you set up</p>
        </div>

        {/* Error state - show retry if we failed to load data */}
        {loadFailed && (
          <div
            className="p-6 rounded-lg border text-center"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <p className="mb-4" style={{ color: "#ef4444" }}>
              {error}
            </p>
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Step two: the recovery key, shown this once */}
        {!loadFailed && recoveryKey && (
          <>
            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <h2
                className="text-lg font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Your Recovery Key
              </h2>
              <p
                className="text-sm mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Save this somewhere safe - you'll need it if you forget your
                password
              </p>
              <p
                className="text-sm mb-4 font-medium"
                style={{ color: "var(--status-warning)" }}
              >
                Peek shows it only this once; you can create a new one in
                Settings → Account
              </p>

              <div className="flex items-center gap-2">
                <code
                  ref={keyRef}
                  className="flex-1 p-3 rounded font-mono text-sm break-all"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {recoveryKey}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopyKey()}
                  className="shrink-0"
                  aria-label="Copy recovery key"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
            </div>

            <Button variant="primary" size="lg" fullWidth onClick={finish}>
              Get Started
            </Button>
          </>
        )}

        {/* Step one: content sources, then Continue */}
        {!loadFailed && !recoveryKey && (
          <>
            {/* Error during submit - show above form */}
            {error && (
              <div
                className="p-4 rounded border-l-4"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "#ef4444",
                }}
              >
                <p style={{ color: "#ef4444" }}>{error}</p>
              </div>
            )}

            {/* Instance Selection Section */}
            {showInstanceSelection && (
              <div
                className="p-6 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Server size={20} style={{ color: "var(--text-primary)" }} />
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Content Sources
                  </h2>
                </div>
                <p
                  className="text-sm mb-4"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Select which Stash servers to see content from
                </p>

                <div className="space-y-3">
                  {instances.map((instance) => (
                    <label
                      key={instance.id}
                      className="flex items-start gap-3 p-3 rounded cursor-pointer transition-colors"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInstanceIds.includes(instance.id)}
                        onChange={() => handleInstanceToggle(instance.id)}
                        className="mt-1 w-4 h-4"
                        style={{ accentColor: "var(--accent-primary)" }}
                      />
                      <div>
                        <div
                          className="font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {instance.name}
                        </div>
                        {instance.description && (
                          <div
                            className="text-sm"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {instance.description}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleContinue}
              disabled={submitting}
              loading={submitting}
            >
              Continue
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default UserSetupModal;
