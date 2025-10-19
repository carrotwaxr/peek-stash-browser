import { LucideX, LucidePlus } from "lucide-react";
import { useState } from "react";
import AddToPlaylistButton from "./AddToPlaylistButton.jsx";

/**
 * Bulk Action Bar for multiselect mode
 * Shows selected count and available actions
 *
 * @param {Object} props
 * @param {Array} props.selectedScenes - Array of selected scene objects
 * @param {Function} props.onClearSelection - Callback to clear selection
 * @param {Function} props.onExitMultiselect - Callback to exit multiselect mode
 */
const BulkActionBar = ({ selectedScenes, onClearSelection, onExitMultiselect }) => {
  const selectedCount = selectedScenes.length;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Left side - Selection count */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onExitMultiselect}
              className="p-2 rounded-md hover:bg-opacity-80 transition-colors"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
              title="Exit multiselect mode"
            >
              <LucideX className="w-5 h-5" />
            </button>

            <div style={{ color: "var(--text-primary)" }}>
              <span className="font-semibold text-lg">{selectedCount}</span>
              <span className="ml-2">
                {selectedCount === 1 ? "scene" : "scenes"} selected
              </span>
            </div>

            {selectedCount > 0 && (
              <button
                onClick={onClearSelection}
                className="text-sm underline hover:no-underline transition-all"
                style={{ color: "var(--text-muted)" }}
              >
                Clear selection
              </button>
            )}
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center space-x-3">
            {selectedCount > 0 && (
              <AddToPlaylistButton
                sceneIds={selectedScenes.map(s => s.id)}
                buttonText={`Add ${selectedCount} to Playlist`}
                icon={<LucidePlus className="w-4 h-4" />}
                dropdownPosition="above"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkActionBar;
