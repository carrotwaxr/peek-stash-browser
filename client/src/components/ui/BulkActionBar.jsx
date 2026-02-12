import Button from "./Button.jsx";

/**
 * Generic Bulk Action Bar for multiselect
 * Shows selected count and renders provided action buttons
 *
 * @param {Object} props
 * @param {Array} props.selectedScenes - Array of selected scene objects
 * @param {Function} props.onClearSelection - Callback to clear selection
 * @param {React.ReactNode} props.actions - Action buttons to render on the right side
 */
const BulkActionBar = ({ selectedScenes, onClearSelection, actions }) => {
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
              <span className="font-semibold text-base sm:text-lg">
                {selectedCount}
              </span>
              <span className="ml-1 sm:ml-2 text-sm sm:text-base">
                {selectedCount === 1 ? "scene" : "scenes"}
              </span>
            </div>

            {selectedCount > 0 && (
              <Button
                onClick={onClearSelection}
                variant="tertiary"
                size="sm"
                className="text-xs sm:text-sm underline hover:no-underline !p-0 !border-0 whitespace-nowrap"
                style={{ color: "var(--text-muted)" }}
              >
                Clear
              </Button>
            )}
          </div>

          {/* Right side - Actions (provided by parent) */}
          <div className="flex items-center gap-2">
            {selectedCount > 0 && actions}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkActionBar;
