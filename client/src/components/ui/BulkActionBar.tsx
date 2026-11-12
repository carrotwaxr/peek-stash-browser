import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { NormalizedScene } from "@peek/shared-types";
import Button from "./Button";

interface Props {
  /** The selected scenes; a bar over something else gives `selectedCount` */
  selectedScenes?: NormalizedScene[] | undefined;
  /** The count, when the selection is not scenes */
  selectedCount?: number | undefined;
  /** Replaces "scene"/"scenes" after the count (playlists say "selected") */
  countLabel?: string | undefined;
  onClearSelection: () => void;
  actions: ReactNode;
  /**
   * Selects the whole page. It lives in the bar, which is fixed to the
   * screen, so the first selection never pushes the grid down.
   */
  onSelectAll?: (() => void) | undefined;
  /** How many the page holds, shown on Select All */
  selectAllCount?: number | undefined;
}

/**
 * Generic Bulk Action Bar for multiselect
 * Shows selected count and renders provided action buttons
 */
const BulkActionBar = ({
  selectedScenes,
  selectedCount: countOverride,
  countLabel,
  onClearSelection,
  actions,
  onSelectAll,
  selectAllCount,
}: Props) => {
  const selectedCount = countOverride ?? selectedScenes?.length ?? 0;

  // The bar is fixed to the bottom of the screen, so it covers the end of the
  // page; a spacer of the bar's own height keeps the last row (the page
  // buttons) scrollable above it. It is measured, since the bar's height
  // changes with the width and with the actions.
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return undefined;
    const measure = () => setBarHeight(bar.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        data-testid="bulk-action-bar-spacer"
        aria-hidden="true"
        style={{ height: barHeight }}
      />
      <div
        ref={barRef}
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
                  {countLabel ?? (selectedCount === 1 ? "scene" : "scenes")}
                </span>
              </div>

              {selectedCount > 0 && onSelectAll && (
                <Button
                  onClick={onSelectAll}
                  variant="tertiary"
                  size="sm"
                  className="text-xs sm:text-sm underline hover:no-underline !p-0 !border-0 whitespace-nowrap"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Select All
                  {selectAllCount === undefined ? "" : ` (${selectAllCount})`}
                </Button>
              )}

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
    </>
  );
};

export default BulkActionBar;
