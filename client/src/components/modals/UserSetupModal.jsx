import { useEffect, useState } from "react";
import { Copy, Check, Server } from "lucide-react";
import { userSetupApi } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.js";
import { Button } from "../ui/index.js";

const UserSetupModal = ({ onComplete }) => {
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const [recoveryKey, setRecoveryKey] = useState("");
  const [instances, setInstances] = useState([]);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState([]);
  const [showInstanceSelection, setShowInstanceSelection] = useState(false);

  useEffect(() => {
    const fetchSetupStatus = async () => {
      try {
        const data = await userSetupApi.getSetupStatus();
        const { recoveryKey, instances, instanceCount } = data;

        setRecoveryKey(recoveryKey || "");
        setInstances(instances || []);
        setShowInstanceSelection(instanceCount >= 2);

        // Pre-select all instances
        setSelectedInstanceIds((instances || []).map((i) => i.id));
      } catch (err) {
        setError("Failed to load setup data");
        console.error("Setup status error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSetupStatus();
  }, []);

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleInstanceToggle = (instanceId) => {
    setSelectedInstanceIds((prev) => {
      if (prev.includes(instanceId)) {
        // Don't allow unchecking if it's the last one
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== instanceId);
      }
      return [...prev, instanceId];
    });
  };

  const handleComplete = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await userSetupApi.completeSetup(
        showInstanceSelection ? selectedInstanceIds : []
      );

      // Update auth context
      updateUser({ setupCompleted: true });

      onComplete?.();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to complete setup");
      console.error("Complete setup error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
           style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-lg" style={{ color: "var(--text-primary)" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2"
              style={{ color: "var(--text-primary)" }}>
            Welcome to Peek
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Let's get you set up
          </p>
        </div>

        {/* Error state - show retry if we failed to load data */}
        {error && !recoveryKey && (
          <div className="p-6 rounded-lg border text-center"
               style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)" }}>
            <p className="mb-4" style={{ color: "#ef4444" }}>{error}</p>
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Error during submit - show above form */}
        {error && recoveryKey && (
          <div className="p-4 rounded border-l-4"
               style={{ backgroundColor: "var(--bg-card)", borderColor: "#ef4444" }}>
            <p style={{ color: "#ef4444" }}>{error}</p>
          </div>
        )}

        {/* Recovery Key Section - only show if we have data */}
        {recoveryKey && (
          <>
            <div className="p-6 rounded-lg border"
                 style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)" }}>
              <h2 className="text-lg font-semibold mb-2"
                  style={{ color: "var(--text-primary)" }}>
                Your Recovery Key
              </h2>
              <p className="text-sm mb-4"
                 style={{ color: "var(--text-secondary)" }}>
                Save this somewhere safe - you'll need it if you forget your password
              </p>

              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 rounded font-mono text-sm break-all"
                      style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)" }}>
                  {recoveryKey}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyKey}
                  className="shrink-0"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
            </div>

            {/* Instance Selection Section */}
            {showInstanceSelection && (
              <div className="p-6 rounded-lg border"
                   style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Server size={20} style={{ color: "var(--text-primary)" }} />
                  <h2 className="text-lg font-semibold"
                      style={{ color: "var(--text-primary)" }}>
                    Content Sources
                  </h2>
                </div>
                <p className="text-sm mb-4"
                   style={{ color: "var(--text-secondary)" }}>
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
                        <div className="font-medium"
                             style={{ color: "var(--text-primary)" }}>
                          {instance.name}
                        </div>
                        {instance.description && (
                          <div className="text-sm"
                               style={{ color: "var(--text-secondary)" }}>
                            {instance.description}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Complete Button */}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleComplete}
              disabled={submitting}
              loading={submitting}
            >
              Get Started
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default UserSetupModal;
