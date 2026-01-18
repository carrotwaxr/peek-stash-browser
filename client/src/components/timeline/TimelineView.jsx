// client/src/components/timeline/TimelineView.jsx
import { memo, useMemo } from "react";
import TimelineControls from "./TimelineControls.jsx";
import TimelineStrip from "./TimelineStrip.jsx";
import { useTimelineState } from "./useTimelineState.js";
import { getGridClasses } from "../../constants/grids.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";

function TimelineView({
  entityType,
  items = [],
  renderItem,
  onItemClick,
  loading = false,
  emptyMessage = "No items found",
  gridDensity = "medium",
  className = "",
}) {
  const {
    zoomLevel,
    setZoomLevel,
    selectedPeriod,
    selectPeriod,
    distribution,
    maxCount,
    isLoading: distributionLoading,
    ZOOM_LEVELS,
  } = useTimelineState({ entityType, autoSelectRecent: true });

  // Build date filter from selected period
  const dateFilter = useMemo(() => {
    if (!selectedPeriod) return null;
    return {
      date: {
        value: selectedPeriod.start,
        value2: selectedPeriod.end,
        modifier: "BETWEEN",
      },
    };
  }, [selectedPeriod]);

  const gridClasses = getGridClasses("standard", gridDensity);

  const isLoading = loading || distributionLoading;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Timeline Header - Fixed */}
      <div className="flex-shrink-0 border-b border-border-primary bg-bg-primary sticky top-0 z-10">
        {/* Controls Row */}
        <div className="flex items-center justify-between px-4 py-2">
          <TimelineControls
            zoomLevel={zoomLevel}
            onZoomLevelChange={setZoomLevel}
            zoomLevels={ZOOM_LEVELS}
          />
          {selectedPeriod && (
            <div className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{selectedPeriod.label}</span>
              {items.length > 0 && (
                <span className="ml-2">({items.length} items)</span>
              )}
            </div>
          )}
        </div>

        {/* Timeline Strip */}
        <TimelineStrip
          distribution={distribution}
          maxCount={maxCount}
          zoomLevel={zoomLevel}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={selectPeriod}
        />
      </div>

      {/* Results Grid - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner className="text-accent-primary" />
          </div>
        ) : !selectedPeriod ? (
          <div className="flex items-center justify-center h-32 text-text-secondary">
            Select a time period on the timeline above
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-secondary">
            {emptyMessage}
          </div>
        ) : (
          <div className={gridClasses}>
            {items.map((item, index) =>
              renderItem(item, index, { onItemClick, dateFilter })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TimelineView);
