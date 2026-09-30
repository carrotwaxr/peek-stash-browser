import type { UpdateUserSettingsBody } from "@peek/shared-types";
import { getErrorMessage } from "../../../api";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "../../../api/hooks/useUserSettings";
import { useUnitPreference } from "../../../contexts/UnitPreferenceContext";
import { useSaveTableColumns } from "../../../hooks/useTableColumns";
import { showError, showSuccess } from "../../../utils/toast";
import { ErrorMessage } from "../../ui/index";
import CardDisplaySettings from "../CardDisplaySettings";
import TableColumnSettings from "../TableColumnSettings";

type ViewPreferenceKey = keyof Pick<
  UpdateUserSettingsBody,
  "preferredPreviewQuality" | "wallPlayback" | "lightboxDoubleTapAction"
>;

/** A stable empty set of table columns, so the editor keeps its edits. */
const NO_TABLE_DEFAULTS = {};

const CustomizationTab = () => {
  // The settings query: a save updates it, and every reader with it. After a
  // failed load the editors would show defaults, and a table-column save
  // would replace every stored entity's columns: show Retry instead
  const { data, isPending, error, refetch } = useUserSettings();
  const save = useUpdateUserSettings();
  const saveTableColumns = useSaveTableColumns();
  const { unitPreference, setUnitPreference } = useUnitPreference();
  const settings = data?.settings;
  const preferredPreviewQuality = settings?.preferredPreviewQuality ?? "sprite";
  const wallPlayback = settings?.wallPlayback ?? "autoplay";
  const lightboxDoubleTapAction =
    settings?.lightboxDoubleTapAction ?? "favorite";
  const tableColumnDefaults =
    settings?.tableColumnDefaults ?? NO_TABLE_DEFAULTS;

  const saveViewPreference = async (key: ViewPreferenceKey, value: string) => {
    try {
      await save.mutateAsync({ [key]: value });
      showSuccess("View preference saved!");
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save view preference"));
    }
  };

  // The edited types over the latest saved map, through the tables' save
  // queue. A failure is reported there and rethrown, so the editor keeps its
  // changes marked unsaved
  const saveTableColumnDefaults = async (
    edited: Record<string, { visible: string[]; order: string[] }>
  ) => {
    await saveTableColumns(edited);
    showSuccess("Table columns saved!");
  };

  if (isPending) {
    return (
      <div
        className="flex items-center justify-center p-12"
        style={{ backgroundColor: "var(--bg-card)" }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load customization settings"
        error={getErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* View Preferences */}
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
          View Preferences
        </h3>
        <div className="space-y-4">
          {/* Scene Card Preview Quality */}
          <div>
            <label
              htmlFor="preferredPreviewQuality"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Scene Card Preview Quality
            </label>
            <select
              id="preferredPreviewQuality"
              value={preferredPreviewQuality}
              onChange={(e) =>
                void saveViewPreference(
                  "preferredPreviewQuality",
                  e.target.value
                )
              }
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="sprite">Low Quality - Sprite (Default)</option>
              <option value="webp">High Quality - WebP Animation</option>
              <option value="mp4">High Quality - MP4 Video</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Quality of preview animations shown when hovering over scene
              cards. Low quality (sprite) uses less bandwidth.
            </p>
          </div>

          {/* Wall View Preview Behavior */}
          <div>
            <label
              htmlFor="wallPlayback"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Wall View Preview Behavior
            </label>
            <select
              id="wallPlayback"
              value={wallPlayback}
              onChange={(e) =>
                void saveViewPreference("wallPlayback", e.target.value)
              }
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="autoplay">Autoplay All (Default)</option>
              <option value="hover">Play on Hover Only</option>
              <option value="static">Static Thumbnails</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Controls how scene previews behave in Wall view. Autoplay plays
              all visible previews simultaneously. Hover only plays when you
              mouse over. Static shows thumbnails only.
            </p>
          </div>

          {/* Measurement Units */}
          <div>
            <label
              htmlFor="unitPreference"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Measurement Units
            </label>
            <select
              id="unitPreference"
              value={unitPreference}
              onChange={(e) =>
                (setUnitPreference as (v: string) => void)(e.target.value)
              }
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="metric">Metric (cm, kg)</option>
              <option value="imperial">Imperial (ft/in, lbs)</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Display performer height, weight, and measurements in your
              preferred unit system.
            </p>
          </div>

          {/* Image Lightbox Double-Tap Action */}
          <div>
            <label
              htmlFor="lightboxDoubleTapAction"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Image Lightbox Double-Tap Action
            </label>
            <select
              id="lightboxDoubleTapAction"
              value={lightboxDoubleTapAction}
              onChange={(e) =>
                void saveViewPreference(
                  "lightboxDoubleTapAction",
                  e.target.value
                )
              }
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="favorite">Toggle Favorite (Default)</option>
              <option value="o_counter">Increment O Counter</option>
              <option value="fullscreen">Toggle Fullscreen</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Action performed when double-tapping (mobile) or double-clicking
              (desktop) an image in the lightbox.
            </p>
          </div>
        </div>
      </div>

      {/* Card Display Settings */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <CardDisplaySettings />
      </div>

      {/* Table columns (the ones each table saves) */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <TableColumnSettings
          tableColumnDefaults={tableColumnDefaults}
          onSave={saveTableColumnDefaults}
        />
      </div>
    </div>
  );
};

export default CustomizationTab;
