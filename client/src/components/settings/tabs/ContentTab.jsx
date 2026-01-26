import { useEffect, useState } from "react";
import { ChevronRight, Server } from "lucide-react";
import { Link } from "react-router-dom";
import { useHiddenEntities } from "../../../hooks/useHiddenEntities.js";
import { apiGet, apiPut } from "../../../services/api.js";

const ContentTab = () => {
  const { hideConfirmationDisabled, updateHideConfirmation } = useHiddenEntities();

  const [instances, setInstances] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showInstanceSection, setShowInstanceSection] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchInstances = async () => {
      try {
        const data = await apiGet("/user/stash-instances");
        const { selectedInstanceIds, availableInstances } = data;

        setInstances(availableInstances || []);
        // If user has no explicit selections (empty array), default to all instances checked
        // This matches the backend behavior where empty = "show all enabled instances"
        const effectiveSelection = selectedInstanceIds?.length > 0
          ? selectedInstanceIds
          : (availableInstances || []).map((i) => i.id);
        setSelectedIds(effectiveSelection);
        setShowInstanceSection((availableInstances?.length || 0) >= 2);
      } catch (err) {
        console.error("Failed to fetch instances:", err);
      }
    };

    fetchInstances();
  }, []);

  const handleInstanceToggle = async (instanceId) => {
    const newSelectedIds = selectedIds.includes(instanceId)
      ? selectedIds.filter((id) => id !== instanceId)
      : [...selectedIds, instanceId];

    // Don't allow unchecking all
    if (newSelectedIds.length === 0) return;

    setSelectedIds(newSelectedIds);
    setSaving(true);

    try {
      await apiPut("/user/stash-instances", { instanceIds: newSelectedIds });
    } catch (err) {
      console.error("Failed to update instances:", err);
      // Revert on error
      setSelectedIds(selectedIds);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Content Sources Section */}
      {showInstanceSection && (
        <div
          className="p-6 rounded-lg border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Server size={20} style={{ color: "var(--text-primary)" }} />
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Content Sources
            </h3>
          </div>
          <p
            className="text-sm mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            Choose which Stash servers to see content from
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
                  checked={selectedIds.includes(instance.id)}
                  onChange={() => handleInstanceToggle(instance.id)}
                  disabled={saving}
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

      {/* Hidden Items Section */}
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
          Hidden Items
        </h3>

        <div className="space-y-4">
          <Link
            to="/hidden-items"
            className="flex items-center justify-between py-3 px-4 -mx-4 rounded-lg transition-colors duration-200"
            style={{ color: "var(--text-primary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div>
              <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                Hidden Items
              </div>
              <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                Manage items you've hidden from your library
              </div>
            </div>
            <ChevronRight size={20} style={{ color: "var(--text-muted)" }} />
          </Link>

          <div
            className="pt-4 border-t"
            style={{ borderColor: "var(--border-color)" }}
          >
            <label className="flex items-center gap-3 cursor-pointer py-3">
              <input
                type="checkbox"
                checked={hideConfirmationDisabled}
                onChange={(e) => updateHideConfirmation(e.target.checked)}
                className="w-5 h-5 cursor-pointer"
                style={{ accentColor: "var(--accent-primary)" }}
              />
              <div>
                <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                  Don't ask for confirmation when hiding items
                </div>
                <div
                  className="text-sm mt-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Skip the confirmation dialog when hiding entities
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentTab;
