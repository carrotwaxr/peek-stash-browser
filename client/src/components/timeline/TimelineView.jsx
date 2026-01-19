// client/src/components/timeline/TimelineView.jsx
import { memo, useEffect, useMemo, useState, useCallback } from "react";
import TimelineControls from "./TimelineControls.jsx";
import TimelineStrip from "./TimelineStrip.jsx";
import TimelineMobileSheet from "./TimelineMobileSheet.jsx";
import { useTimelineState } from "./useTimelineState.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { getGridClasses } from "../../constants/grids.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";

function TimelineView({
  entityType,
  items = [],
  renderItem,
  onItemClick,
  onDateFilterChange,
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

  // Detect mobile devices for responsive layout
  const isMobile = useMediaQuery("(max-width: 768px)");

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

  // Notify parent when selected period changes
  useEffect(() => {
    if (onDateFilterChange) {
      if (selectedPeriod) {
        onDateFilterChange({
          start: selectedPeriod.start,
          end: selectedPeriod.end,
        });
      } else {
        onDateFilterChange(null);
      }
    }
  }, [selectedPeriod, onDateFilterChange]);

  const gridClasses = getGridClasses("standard", gridDensity);

  const isLoading = loading || distributionLoading;

  // Track visible range from timeline strip
  const [visibleRange, setVisibleRange] = useState(null);

  const handleVisibleRangeChange = useCallback((range) => {
    setVisibleRange(range);
  }, []);

  // Format visible range for display
  const visibleRangeText = useMemo(() => {
    if (!visibleRange) return null;
    if (visibleRange.firstLabel === visibleRange.lastLabel) {
      return visibleRange.firstLabel;
    }
    return `${visibleRange.firstLabel} — ${visibleRange.lastLabel}`;
  }, [visibleRange]);

  // Shared timeline header content for both layouts
  const timelineHeaderContent = (
    <>
      {/* Controls Row - Range on left, zoom controls on right */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        {/* Left: Visible range and selection indicator */}
        <div
          className="flex items-center gap-2 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {visibleRangeText && (
            <span style={{ color: "var(--text-primary)" }}>
              {visibleRangeText}
            </span>
          )}
          {!isMobile && selectedPeriod && (
            <>
              <span style={{ color: "var(--text-tertiary)" }}>|</span>
              <span>
                <span className="font-medium" style={{ color: "var(--accent-primary)" }}>Selected:</span>{" "}
                {selectedPeriod.label}
              </span>
            </>
          )}
        </div>

        {/* Right: Zoom controls */}
        <TimelineControls
          zoomLevel={zoomLevel}
          onZoomLevelChange={setZoomLevel}
          zoomLevels={ZOOM_LEVELS}
        />
      </div>

      {/* Timeline Strip */}
      <TimelineStrip
        distribution={distribution}
        maxCount={maxCount}
        zoomLevel={zoomLevel}
        selectedPeriod={selectedPeriod}
        onSelectPeriod={selectPeriod}
        onVisibleRangeChange={handleVisibleRangeChange}
      />
    </>
  );

  // Results grid content shared between layouts
  const resultsContent = (
    <div className={`flex-1 overflow-y-auto p-4 ${isMobile ? "pb-16" : ""}`}>
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <LoadingSpinner className="text-accent-primary" />
        </div>
      ) : !selectedPeriod ? (
        <div className="flex items-center justify-center h-32 text-text-secondary">
          {isMobile
            ? "Tap the timeline below to select a period"
            : "Select a time period on the timeline above"}
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
  );

  // Mobile layout: bottom sheet with timeline
  if (isMobile) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {resultsContent}
        <TimelineMobileSheet
          isOpen={true}
          selectedPeriod={selectedPeriod}
          itemCount={items.length}
        >
          {timelineHeaderContent}
        </TimelineMobileSheet>
      </div>
    );
  }

  // Desktop layout: sticky header at top
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Timeline Header - Fixed */}
      <div className="flex-shrink-0 border-b border-border-primary bg-bg-primary sticky top-0 z-10">
        {timelineHeaderContent}
      </div>
      {resultsContent}
    </div>
  );
}

export default memo(TimelineView);
