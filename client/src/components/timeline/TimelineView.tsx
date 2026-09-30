// client/src/components/timeline/TimelineView.tsx
import { type ReactNode, memo, useCallback, useMemo, useState } from "react";
import { getGridClasses } from "../../constants/grids";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import LoadingSpinner from "../ui/LoadingSpinner";
import TimelineControls from "./TimelineControls";
import TimelineMobileSheet from "./TimelineMobileSheet";
import TimelineStrip from "./TimelineStrip";
import { useTimelineState } from "./useTimelineState";

interface RenderItemOptions {
  onItemClick?: (item: Record<string, unknown>) => void;
  dateFilter: {
    date: { value: string; value2: string; modifier: string };
  } | null;
}

interface TimelineFilters {
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
}

interface VisibleRange {
  firstPeriod: string;
  lastPeriod: string;
  firstLabel: string;
  lastLabel: string;
}

interface Props {
  entityType: string;
  items?: Record<string, unknown>[];
  renderItem: (
    item: Record<string, unknown>,
    index: number,
    options: RenderItemOptions
  ) => ReactNode;
  onItemClick?: (item: Record<string, unknown>) => void;
  /**
   * The selected period, held by the owner (the list's URL); the view shows
   * it and reports every change of the selection through `onPeriodChange`
   */
  period: string | null;
  /**
   * A choice, a deselection, a zoom change and the latest period, chosen
   * once the timeline loads when none was selected
   */
  onPeriodChange: (period: string | null) => void;
  loading?: boolean;
  emptyMessage?: string;
  gridDensity?: string;
  className?: string;
  filters?: TimelineFilters | null;
}

function TimelineView({
  entityType,
  items = [],
  renderItem,
  onItemClick,
  onPeriodChange,
  period,
  loading = false,
  emptyMessage = "No items found",
  gridDensity = "medium",
  className = "",
  filters = null,
}: Props) {
  // Mounted without a period, the latest one is chosen once the timeline
  // loads; read once, so the chosen period does not refetch the timeline
  const [autoSelectRecent] = useState(() => !period);
  const {
    zoomLevel,
    setZoomLevel,
    selectedPeriod,
    selectPeriod,
    distribution,
    maxCount,
    isLoading: distributionLoading,
    ZOOM_LEVELS,
  } = useTimelineState({
    entityType,
    autoSelectRecent,
    filters,
    period,
    onPeriodChange,
  });

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

  const gridClasses = getGridClasses("standard", gridDensity);

  const isLoading = loading || distributionLoading;

  // Track visible range from timeline strip
  const [visibleRange, setVisibleRange] = useState<VisibleRange | null>(null);

  const handleVisibleRangeChange = useCallback((range: VisibleRange) => {
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
                <span
                  className="font-medium"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Selected:
                </span>{" "}
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
        selectedPeriod={
          selectedPeriod as { period: string; count: number } | null
        }
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
