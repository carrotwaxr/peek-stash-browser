import { useState, useEffect } from "react";
import { LucideBookmark, LucideSave, LucideTrash2, LucideChevronDown } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "../../services/api.js";
import { InfoMessage, ErrorMessage, SuccessMessage } from "./index.js";
import Button from "./Button.jsx";

/**
 * Filter Presets Component
 * Allows users to save, load, and manage filter presets
 *
 * @param {Object} props
 * @param {string} props.artifactType - Type of artifact (scene, performer, studio, tag)
 * @param {Object} props.currentFilters - Current filter state
 * @param {string} props.currentSort - Current sort field
 * @param {string} props.currentDirection - Current sort direction
 * @param {Function} props.onLoadPreset - Callback when a preset is loaded
 */
const FilterPresets = ({
  artifactType,
  currentFilters,
  currentSort,
  currentDirection,
  onLoadPreset,
}) => {
  const [presets, setPresets] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch presets on mount
  useEffect(() => {
    fetchPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only fetch once on mount, fetchPresets is stable

  const fetchPresets = async () => {
    try {
      const response = await apiGet("/user/filter-presets");
      const allPresets = response?.presets || {};
      setPresets(allPresets[artifactType] || []);
    } catch (err) {
      console.error("Error fetching filter presets:", err);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      setError("Please enter a preset name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiPost("/user/filter-presets", {
        artifactType,
        name: presetName,
        filters: currentFilters,
        sort: currentSort,
        direction: currentDirection,
      });

      setSuccess(`Preset "${presetName}" saved successfully!`);
      setPresetName("");
      setIsSaveDialogOpen(false);

      // Refresh presets
      await fetchPresets();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || "Failed to save preset");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadPreset = (preset) => {
    onLoadPreset({
      filters: preset.filters,
      sort: preset.sort,
      direction: preset.direction,
    });
    setIsDropdownOpen(false);
    setSuccess(`Preset "${preset.name}" loaded!`);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleDeletePreset = async (presetId, presetName) => {
    if (!confirm(`Delete preset "${presetName}"?`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiDelete(`/user/filter-presets/${artifactType}/${presetId}`);
      setSuccess(`Preset "${presetName}" deleted`);

      // Refresh presets
      await fetchPresets();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || "Failed to delete preset");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      {/* Success/Error Messages */}
      {success && (
        <div className="fixed top-4 right-4 z-50">
          <SuccessMessage message={success} />
        </div>
      )}
      {error && (
        <div className="fixed top-4 right-4 z-50">
          <ErrorMessage message={error} />
        </div>
      )}

      {/* Preset Controls */}
      <div className="flex items-center gap-2">
        {/* Load Preset Dropdown */}
        <div className="relative">
          <Button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            variant="secondary"
            size="sm"
            className="text-sm"
            disabled={isLoading}
            icon={<LucideBookmark className="w-4 h-4" />}
          >
            <span>Load Preset</span>
            <LucideChevronDown className="w-3 h-3" />
          </Button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsDropdownOpen(false)}
              />

              {/* Menu */}
              <div
                className="absolute left-0 mt-2 w-64 rounded-md shadow-lg z-20 border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                {presets.length === 0 ? (
                  <div
                    className="px-4 py-3 text-sm text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No saved presets
                  </div>
                ) : (
                  <div className="py-1">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between px-4 py-2 hover:bg-opacity-80 transition-colors group"
                        style={{ backgroundColor: "var(--bg-secondary)" }}
                      >
                        <Button
                          onClick={() => handleLoadPreset(preset)}
                          variant="tertiary"
                          className="flex-1 text-left text-sm !p-0"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {preset.name}
                        </Button>
                        <Button
                          onClick={() => handleDeletePreset(preset.id, preset.name)}
                          variant="tertiary"
                          className="ml-2 p-1 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100"
                          icon={<LucideTrash2 className="w-3.5 h-3.5" />}
                          title="Delete preset"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Save Preset Button */}
        <Button
          onClick={() => setIsSaveDialogOpen(true)}
          variant="secondary"
          size="sm"
          className="text-sm"
          disabled={isLoading}
          icon={<LucideSave className="w-4 h-4" />}
        >
          Save Preset
        </Button>
      </div>

      {/* Save Preset Dialog */}
      {isSaveDialogOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="w-full max-w-md rounded-lg shadow-xl border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="p-6">
                <h3
                  className="text-lg font-semibold mb-4"
                  style={{ color: "var(--text-primary)" }}
                >
                  Save Filter Preset
                </h3>

                <p
                  className="text-sm mb-4"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Give your current filter configuration a name so you can quickly apply it later.
                </p>

                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Enter preset name..."
                  className="w-full px-3 py-2 border rounded-md text-sm mb-4"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
                  autoFocus
                />

                <div className="flex justify-end gap-3">
                  <Button
                    onClick={() => {
                      setIsSaveDialogOpen(false);
                      setPresetName("");
                      setError(null);
                    }}
                    variant="secondary"
                    size="sm"
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSavePreset}
                    variant="primary"
                    size="sm"
                    disabled={isLoading || !presetName.trim()}
                    loading={isLoading}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FilterPresets;
