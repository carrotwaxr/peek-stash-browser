import { useRef, useState } from "react";
import {
  PRESET_CONTEXT_LABELS,
  isPresetContext,
} from "@peek/shared-types/presetContexts.js";
import { useQueryClient } from "@tanstack/react-query";
import {
  LucideBookmark,
  LucideChevronDown,
  LucidePin,
  LucideSave,
  LucideTrash2,
} from "lucide-react";
import { apiDelete, apiPost, apiPut } from "../../api";
import {
  type SavedPreset,
  invalidatePresets,
  presetsForContext,
  useDefaultPresets,
  useFilterPresets,
} from "../../api/hooks/usePresets";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import Button from "./Button";
import Modal from "./Modal";
import StatusMessage from "./StatusMessage";

// Helper to get context label for UI
const getContextLabel = (ctx: string): string => {
  return isPresetContext(ctx) ? PRESET_CONTEXT_LABELS[ctx] : ctx;
};

/**
 * Filter Presets Component
 * Allows users to save, load, and manage filter presets
 *
 * @param {Object} props
 * @param {string} props.artifactType - Type of artifact for preset storage (scene, performer, studio, tag)
 * @param {string} props.context - Context for default selection (scene_performer, scene_tag, etc.)
 * @param {Object} props.currentFilters - Current filter state (includes permanent filters)
 * @param {Object} props.permanentFilters - Permanent filters to exclude from saved presets
 * @param {string} props.currentSort - Current sort field
 * @param {string} props.currentDirection - Current sort direction
 * @param {string} props.currentViewMode - Current view mode (grid/wall/table)
 * @param {string} props.currentZoomLevel - Current zoom level for wall view (small/medium/large)
 * @param {string} props.currentGridDensity - Current grid density (small/medium/large)
 * @param {Object} props.currentTableColumns - Current table columns config { visible: [], order: [] }
 * @param {Function} props.onLoadPreset - Callback when a preset is loaded
 */
interface PresetData {
  filters: Record<string, unknown>;
  sort: string;
  direction: string;
  viewMode?: string;
  zoomLevel?: string;
  gridDensity?: string;
  tableColumns?: Record<string, unknown> | null;
  perPage?: number | null;
}

interface Props {
  artifactType: string;
  context?: string;
  currentFilters: Record<string, unknown>;
  permanentFilters?: Record<string, unknown>;
  currentSort: string;
  currentDirection: string;
  currentViewMode?: string;
  currentZoomLevel?: string;
  currentGridDensity?: string;
  currentTableColumns?: Record<string, unknown> | null;
  currentPerPage?: number;
  onLoadPreset: (preset: PresetData) => void;
}

const FilterPresets = ({
  artifactType,
  context,
  currentFilters,
  permanentFilters = {},
  currentSort,
  currentDirection,
  currentViewMode = "grid",
  currentZoomLevel = "medium",
  currentGridDensity = "medium",
  currentTableColumns = null,
  currentPerPage = 24,
  onLoadPreset,
}: Props) => {
  // Use context if provided, otherwise fall back to artifactType
  const effectiveContext = context || artifactType;
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const presetsQuery = useFilterPresets();
  const defaultsQuery = useDefaultPresets();
  const presets = presetsForContext(presetsQuery.data, effectiveContext);
  const defaultPresetId =
    defaultsQuery.data?.defaults?.[effectiveContext] ?? null;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const presetNameRef = useRef<HTMLInputElement>(null);

  const closeSaveDialog = () => {
    setIsSaveDialogOpen(false);
    setPresetName("");
    setError(null);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      setError("Please enter a preset name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Strip out permanent filters before saving
      const permanentKeys = new Set(Object.keys(permanentFilters));
      const filtersToSave = Object.fromEntries(
        Object.entries(currentFilters).filter(
          ([key]) => !permanentKeys.has(key)
        )
      );

      await apiPost("/user/filter-presets", {
        artifactType,
        context: effectiveContext,
        name: presetName,
        filters: filtersToSave,
        sort: currentSort,
        direction: currentDirection,
        viewMode: currentViewMode,
        zoomLevel: currentZoomLevel,
        gridDensity: currentGridDensity,
        tableColumns: currentViewMode === "table" ? currentTableColumns : null,
        perPage: currentPerPage,
        setAsDefault,
      });

      setSuccess(`Preset "${presetName}" saved successfully!`);
      setPresetName("");
      setSetAsDefault(false);
      setIsSaveDialogOpen(false);

      await invalidatePresets(queryClient);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError((err as Error).message || "Failed to save preset");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadPreset = (preset: SavedPreset) => {
    // The preset's own filters: the page's permanent filters are merged into
    // the request, never written into the list's URL
    onLoadPreset({
      filters: preset.filters,
      sort: preset.sort,
      direction: preset.direction,
      viewMode: preset.viewMode || "grid",
      zoomLevel: preset.zoomLevel || "medium",
      gridDensity: preset.gridDensity || "medium",
      tableColumns: preset.tableColumns ?? null,
      perPage: preset.perPage || null,
    });
    setIsDropdownOpen(false);
    setSuccess(`Preset "${preset.name}" loaded!`);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleToggleDefault = async (
    presetId: string,
    presetName: string,
    event: React.MouseEvent
  ) => {
    // Prevent the load preset action from triggering
    event.stopPropagation();

    setIsLoading(true);
    setError(null);

    try {
      const isCurrentlyDefault = defaultPresetId === presetId;

      await apiPut("/user/default-preset", {
        context: effectiveContext,
        presetId: isCurrentlyDefault ? null : presetId,
      });

      if (isCurrentlyDefault) {
        setSuccess(
          `"${presetName}" removed as default for ${getContextLabel(effectiveContext)}`
        );
      } else {
        setSuccess(
          `"${presetName}" set as default for ${getContextLabel(effectiveContext)}!`
        );
      }

      await invalidatePresets(queryClient);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError((err as Error).message || "Failed to update default preset");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePreset = async (presetId: string, presetName: string) => {
    if (
      !(await confirm({
        title: "Delete preset?",
        message: `Delete preset "${presetName}"?`,
        confirmText: "Delete",
      }))
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiDelete(`/user/filter-presets/${artifactType}/${presetId}`);
      setSuccess(`Preset "${presetName}" deleted`);

      await invalidatePresets(queryClient);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError((err as Error).message || "Failed to delete preset");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      {/* Success/Error Messages */}
      {success && (
        <div className="fixed top-4 right-4 z-50">
          <StatusMessage variant="success" message={success} />
        </div>
      )}
      {error && (
        <div className="fixed top-4 right-4 z-50">
          <StatusMessage variant="error" message={error} />
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
            title="Load Preset"
          >
            <span className="hidden sm:inline">Load Preset</span>
            <LucideChevronDown className="w-3 h-3 sm:ml-0" />
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
                    {presets.map((preset) => {
                      const isDefault = defaultPresetId === preset.id;
                      return (
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
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              onClick={(e) =>
                                void handleToggleDefault(
                                  preset.id,
                                  preset.name,
                                  e
                                )
                              }
                              variant="tertiary"
                              className={`p-1 transition-opacity ${
                                isDefault
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100"
                              }`}
                              title={
                                isDefault
                                  ? "Remove as default"
                                  : "Set as default"
                              }
                            >
                              <LucidePin
                                className={`w-3.5 h-3.5 ${
                                  isDefault ? "fill-current" : ""
                                }`}
                                style={{
                                  color: isDefault
                                    ? "var(--accent-primary)"
                                    : "currentColor",
                                }}
                              />
                            </Button>
                            <Button
                              onClick={() =>
                                void handleDeletePreset(preset.id, preset.name)
                              }
                              variant="tertiary"
                              className="p-1 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100"
                              icon={<LucideTrash2 className="w-3.5 h-3.5" />}
                              title="Delete preset"
                            />
                          </div>
                        </div>
                      );
                    })}
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
          title="Save Preset"
        >
          <span className="hidden sm:inline">Save Preset</span>
        </Button>
      </div>

      {/* Save Preset Dialog */}
      <Modal
        isOpen={isSaveDialogOpen}
        onClose={closeSaveDialog}
        size="sm"
        title="Save Filter Preset"
        initialFocusRef={presetNameRef}
        dismissible={!isLoading}
      >
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Give your current filter configuration a name so you can quickly apply
          it later.
        </p>

        <input
          ref={presetNameRef}
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
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSavePreset();
          }}
        />

        {/* Set as Default checkbox */}
        <label
          className="flex items-center gap-2 mb-4 cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
        >
          <input
            type="checkbox"
            checked={setAsDefault}
            onChange={(e) => setSetAsDefault(e.target.checked)}
            className="w-4 h-4 rounded border cursor-pointer"
            style={{
              accentColor: "var(--accent-primary)",
            }}
          />
          <span className="text-sm">
            Set as default for {getContextLabel(effectiveContext)}
          </span>
        </label>

        <div className="flex justify-end gap-3">
          <Button
            onClick={closeSaveDialog}
            variant="secondary"
            size="sm"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSavePreset()}
            variant="primary"
            size="sm"
            disabled={isLoading || !presetName.trim()}
            loading={isLoading}
          >
            Save
          </Button>
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
};

export default FilterPresets;
