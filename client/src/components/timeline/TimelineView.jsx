// client/src/components/timeline/TimelineView.jsx
import { memo, useEffect, useMemo, useState, useCallback, useRef } from "react";
import TimelineControls from "./TimelineControls.jsx";
import TimelineStrip from "./TimelineStrip.jsx";
import TimelineMobileSheet from "./TimelineMobileSheet.jsx";
import { useTimelineState, parsePeriodToDateRange } from "./useTimelineState.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { getGridClasses } from "../../constants/grids.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";

function TimelineView({
  entityType,
  items = [],
  renderItem,
  onItemClick,
  onDateFilterChange,
  onPeriodChange,
  initialPeriod = null,
  loading = false,
  emptyMessage = "No items found",
  gridDensity = "medium",
  className = "",
  filters = null,
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
  } = useTimelineState({ entityType, autoSelectRecent: !initialPeriod, initialPeriod, filters });

  // Detect mobile devices for responsive layout
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Track last synced period to avoid unnecessary URL updates
  const lastSyncedPeriodRef = useRef(initialPeriod);
  // Use refs for callbacks to avoid re-triggering effects when they change identity
  const onPeriodChangeRef = useRef(onPeriodChange);
  onPeriodChangeRef.current = onPeriodChange;

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

  // Track whether auto-selection has been notified to parent
  const hasNotifiedAutoSelectRef = useRef(false);

  // Notify parent of auto-selected period (initial load only)
  useEffect(() => {
    if (!hasNotifiedAutoSelectRef.current && selectedPeriod && onDateFilterChange) {
      hasNotifiedAutoSelectRef.current = true;
      onDateFilterChange({ start: selectedPeriod.start, end: selectedPeriod.end });
    }
  }, [selectedPeriod, onDateFilterChange]);

  // Wrap selectPeriod to notify parent directly on user interaction
  const handleSelectPeriod = useCallback((period) => {
    selectPeriod(period);
    hasNotifiedAutoSelectRef.current = true; // Mark as handled
    // selectPeriod toggles: clicking same period deselects
    const willDeselect = selectedPeriod?.period === period;
    if (onDateFilterChange) {
      if (willDeselect) {
        onDateFilterChange(null);
      } else {
        const range = parsePeriodToDateRange(period, zoomLevel);
        onDateFilterChange(range ? { start: range.start, end: range.end } : null);
      }
    }
  }, [selectPeriod, selectedPeriod, zoomLevel, onDateFilterChange]);

  // Sync period to URL separately - only when period actually changes from user action
  // Uses ref for callback to avoid infinite loop from callback identity changes
  useEffect(() => {
    const currentPeriod = selectedPeriod?.period || null;
    // Only sync to URL if the period has changed from what we last synced
    if (currentPeriod !== lastSyncedPeriodRef.current) {
      lastSyncedPeriodRef.current = currentPeriod;
      onPeriodChangeRef.current?.(currentPeriod);
    }
  }, [selectedPeriod]);

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

  // Timeline header content - adapts layout for mobile vs desktop
  const renderTimelineHeader = (forMobile = false) => (
    <>
      {/* Controls Row - Range on left, zoom controls on right */}
      <div
        className={`flex items-center justify-between px-4 py-2 ${forMobile ? "px-3 py-1.5" : ""}`}
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        {/* Left: Visible range and selection indicator */}
        <div
          className={`flex items-center gap-2 ${forMobile ? "text-xs" : "text-sm"}`}
          style={{ color: "var(--text-secondary)" }}
        >
          {visibleRangeText && (
            <span style={{ color: "var(--text-primary)" }}>
              {visibleRangeText}
            </span>
          )}
          {!forMobile && selectedPeriod && (
            <>
              <span style={{ color: "var(--text-tertiary)" }}>|</span>
              <span>
                <span className="font-medium" style={{ color: "var(--accent-primary)" }}>Selected:</span>{" "}
                {selectedPeriod.label}
              </span>
            </>
          )}
        </div>

        {/* Right: Zoom controls - dropdown on mobile, buttons on desktop */}
        <TimelineControls
          zoomLevel={zoomLevel}
          onZoomLevelChange={setZoomLevel}
          zoomLevels={ZOOM_LEVELS}
          variant={forMobile ? "dropdown" : "buttons"}
        />
      </div>

      {/* Timeline Strip */}
      <TimelineStrip
        distribution={distribution}
        maxCount={maxCount}
        zoomLevel={zoomLevel}
        selectedPeriod={selectedPeriod}
        onSelectPeriod={handleSelectPeriod}
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
        <div
          className="flex items-center justify-center h-32"
          style={{ color: "var(--text-secondary)" }}
        >
          {isMobile
            ? "Tap the timeline below to select a period"
            : "Select a time period on the timeline above"}
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex items-center justify-center h-32"
          style={{ color: "var(--text-secondary)" }}
        >
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
          {renderTimelineHeader(true)}
        </TimelineMobileSheet>
      </div>
    );
  }

  // Desktop layout: sticky header at top
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Timeline Header - Fixed */}
      <div
        className="flex-shrink-0 sticky top-0 z-10"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        {renderTimelineHeader(false)}
      </div>
      {resultsContent}
    </div>
  );
}

export default memo(TimelineView);
