import { useState, useEffect } from "react";
import Paper from "../ui/Paper.jsx";
import Button from "../ui/Button.jsx";
import SearchableSelect from "../ui/SearchableSelect.jsx";
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

/**
 * Content Restrictions Modal
 *
 * Allows admins to configure per-user content restrictions for Collections, Tags, Studios, and Galleries.
 * Supports INCLUDE (show only) and EXCLUDE (hide) modes with "restrict empty" option.
 */
const ContentRestrictionsModal = ({ user, onClose, onSave }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Restriction state for each entity type
  const [restrictions, setRestrictions] = useState({
    groups: { mode: "NONE", entityIds: [], restrictEmpty: false },
    tags: { mode: "NONE", entityIds: [], restrictEmpty: false },
    studios: { mode: "NONE", entityIds: [], restrictEmpty: false },
    galleries: { mode: "NONE", entityIds: [], restrictEmpty: false },
  });

  // Load existing restrictions
  useEffect(() => {
    loadRestrictions();
  }, [user.id]);

  const loadRestrictions = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get(`/user/${user.id}/restrictions`);
      const existingRestrictions = response.data.restrictions || [];

      // Convert API format to component state
      const newRestrictions = { ...restrictions };
      existingRestrictions.forEach((restriction) => {
        newRestrictions[restriction.entityType] = {
          mode: restriction.mode,
          entityIds: JSON.parse(restriction.entityIds),
          restrictEmpty: restriction.restrictEmpty,
        };
      });

      setRestrictions(newRestrictions);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load restrictions");
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (entityType, mode) => {
    setRestrictions((prev) => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        mode,
        // Clear entity IDs when switching to NONE
        entityIds: mode === "NONE" ? [] : prev[entityType].entityIds,
      },
    }));
  };

  const handleEntityIdsChange = (entityType, entityIds) => {
    setRestrictions((prev) => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        entityIds,
      },
    }));
  };

  const handleRestrictEmptyChange = (entityType, checked) => {
    setRestrictions((prev) => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        restrictEmpty: checked,
      },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Convert component state to API format (exclude NONE modes)
      const restrictionsToSave = Object.entries(restrictions)
        .filter(([_, config]) => config.mode !== "NONE")
        .map(([entityType, config]) => ({
          entityType,
          mode: config.mode,
          entityIds: config.entityIds,
          restrictEmpty: config.restrictEmpty,
        }));

      await api.put(`/user/${user.id}/restrictions`, {
        restrictions: restrictionsToSave,
      });

      onSave?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save restrictions");
    } finally {
      setSaving(false);
    }
  };

  const getEntityLabel = (entityType) => {
    const labels = {
      groups: "Collections",
      tags: "Tags",
      studios: "Studios",
      galleries: "Galleries",
    };
    return labels[entityType] || entityType;
  };

  const getEntityDescription = (entityType) => {
    const descriptions = {
      groups:
        "Most reliable for content organization as groups are typically static and manually curated.",
      tags: "May change frequently if using Stash plugins. Use with caution for dynamic tagging systems.",
      studios:
        "Useful for limiting content by production company or studio name.",
      galleries: "Restrict access to specific gallery content.",
    };
    return descriptions[entityType] || "";
  };

  const getModeDescription = (mode) => {
    const descriptions = {
      NONE: "No restrictions - user can see all content",
      EXCLUDE: "Hide selected items and any content associated with them",
      INCLUDE: "Show ONLY selected items and content associated with them",
    };
    return descriptions[mode] || "";
  };

  const renderEntitySection = (entityType) => {
    const config = restrictions[entityType];

    return (
      <div
        key={entityType}
        className="p-4 rounded-lg"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Entity Type Header */}
        <div className="mb-3">
          <h4
            className="font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {getEntityLabel(entityType)}
          </h4>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {getEntityDescription(entityType)}
          </p>
        </div>

        {/* Mode Selection */}
        <div className="mb-3">
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Restriction Mode
          </label>
          <div className="space-y-2">
            {["NONE", "EXCLUDE", "INCLUDE"].map((mode) => (
              <label
                key={mode}
                className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-opacity-50"
                style={{
                  backgroundColor:
                    config.mode === mode
                      ? "rgba(59, 130, 246, 0.1)"
                      : "transparent",
                }}
              >
                <input
                  type="radio"
                  name={`${entityType}-mode`}
                  value={mode}
                  checked={config.mode === mode}
                  onChange={() => handleModeChange(entityType, mode)}
                  className="mt-0.5"
                  style={{ accentColor: "var(--primary-color)" }}
                />
                <div className="flex-1">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {mode}
                  </span>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {getModeDescription(mode)}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Entity Selection (only show if mode is not NONE) */}
        {config.mode !== "NONE" && (
          <>
            <div className="mb-3">
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Select {getEntityLabel(entityType)}
              </label>
              <SearchableSelect
                entityType={entityType}
                value={config.entityIds}
                onChange={(ids) => handleEntityIdsChange(entityType, ids)}
                multi={true}
                placeholder={`Select ${getEntityLabel(
                  entityType
                ).toLowerCase()}...`}
              />
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {config.mode === "EXCLUDE"
                  ? "Selected items will be hidden from this user"
                  : "User will ONLY see selected items"}
              </p>
            </div>

            {/* Restrict Empty Checkbox */}
            <div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.restrictEmpty}
                  onChange={(e) =>
                    handleRestrictEmptyChange(entityType, e.target.checked)
                  }
                  className="w-4 h-4 rounded cursor-pointer mt-0.5"
                  style={{ accentColor: "var(--primary-color)" }}
                />
                <div className="flex-1">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Restrict items with no{" "}
                    {getEntityLabel(entityType).toLowerCase()}
                  </span>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    When enabled, hides scenes that have no{" "}
                    {getEntityLabel(entityType).toLowerCase()} assigned. Useful
                    for preventing unorganized content from appearing.
                  </p>
                </div>
              </label>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => !saving && onClose()}
    >
      <Paper
        className="max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header>
          <Paper.Title>Content Restrictions</Paper.Title>
          <Paper.Subtitle className="mt-1">
            Configure content visibility for {user.username}
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
              <p
                className="mb-2 font-medium"
                style={{ color: "rgb(59, 130, 246)" }}
              >
                How Content Restrictions Work
              </p>
              <ul
                className="list-disc list-inside space-y-1 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <li>
                  <strong>EXCLUDE mode:</strong> Hides selected items and any
                  scenes/content associated with them. Most users will primarily
                  use this mode as it's the most predictable.
                </li>
                <li>
                  <strong>INCLUDE mode:</strong> Shows ONLY selected items.
                  Multiple INCLUDE filters work together (scenes must match ALL
                  include filters).
                </li>
                <li>
                  <strong>Restrict empty:</strong> Hides items with no metadata
                  for that type, preventing unorganized content from leaking
                  through restrictions.
                </li>
                <li>
                  <strong>Cascading filters:</strong> Restricted
                  tags/studios/groups won't show in dropdowns, detail pages, or
                  cards anywhere in the UI.
                </li>
                <li>
                  <strong>Recommended:</strong> Use Collections (Groups) as your
                  primary filtering mechanism since they're most reliable and
                  static.
                </li>
                <li>
                  <strong>Admin users</strong> always see all content regardless
                  of restrictions.
                </li>
              </ul>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="p-6 text-center">
                <div
                  className="animate-spin w-8 h-8 border-4 border-t-transparent rounded-full mx-auto mb-2"
                  style={{
                    borderColor: "rgba(59, 130, 246, 0.3)",
                    borderTopColor: "transparent",
                  }}
                ></div>
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Loading restrictions...
                </p>
              </div>
            )}

            {/* Error State */}
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

            {/* Entity Sections */}
            {!loading && (
              <div className="space-y-4">
                {/* Groups - Highlighted as recommended */}
                <div
                  className="p-3 rounded-lg"
                  style={{
                    backgroundColor: "rgba(34, 197, 94, 0.05)",
                    border: "2px solid rgba(34, 197, 94, 0.3)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: "rgba(34, 197, 94, 0.2)",
                        color: "rgb(34, 197, 94)",
                      }}
                    >
                      RECOMMENDED
                    </span>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Collections are the most reliable organizational unit for
                      content restrictions
                    </p>
                  </div>
                  {renderEntitySection("groups")}
                </div>

                {/* Other entity types */}
                {renderEntitySection("tags")}
                {renderEntitySection("studios")}
                {renderEntitySection("galleries")}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleSave}
                disabled={saving || loading}
                variant="primary"
                fullWidth
                loading={saving}
              >
                Save Restrictions
              </Button>
              <Button onClick={onClose} disabled={saving} variant="secondary">
                Cancel
              </Button>
            </div>
          </div>
        </Paper.Body>
      </Paper>
    </div>
  );
};

export default ContentRestrictionsModal;
