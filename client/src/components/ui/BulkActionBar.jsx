import { LucideX, LucidePlus } from "lucide-react";
import { useState } from "react";
import AddToPlaylistButton from "./AddToPlaylistButton.jsx";

/**
 * Bulk Action Bar for multiselect
 * Shows selected count and available actions
 *
 * @param {Object} props
 * @param {Array} props.selectedScenes - Array of selected scene objects
 * @param {Function} props.onClearSelection - Callback to clear selection
 */
const BulkActionBar = ({ selectedScenes, onClearSelection }) => {
  const selectedCount = selectedScenes.length;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="max-w-7xl mx-auto px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Left side - Selection count */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div style={{ color: "var(--text-primary)" }}>
              <span className="font-semibold text-base sm:text-lg">{selectedCount}</span>
              <span className="ml-1 sm:ml-2 text-sm sm:text-base">
                {selectedCount === 1 ? "scene" : "scenes"}
              </span>
            </div>

            {selectedCount > 0 && (
              <button
                onClick={onClearSelection}
                className="text-xs sm:text-sm underline hover:no-underline transition-all whitespace-nowrap"
                style={{ color: "var(--text-muted)" }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center">
            {selectedCount > 0 && (
              <AddToPlaylistButton
                sceneIds={selectedScenes.map(s => s.id)}
                buttonText={
                  <span>
                    <span className="hidden sm:inline">Add {selectedCount} to Playlist</span>
                    <span className="sm:hidden">Add to Playlist</span>
                  </span>
                }
                icon={<LucidePlus className="w-4 h-4" />}
                dropdownPosition="above"
                onSuccess={onClearSelection}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkActionBar;
