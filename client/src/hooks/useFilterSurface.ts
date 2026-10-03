import { useMediaQuery } from "./useMediaQuery";
import { useTVMode } from "./useTVMode";

/** Below `md` (768 px) the filters open in the sheet */
export const SHEET_QUERY = "(max-width: 767px)";

/**
 * Where a list's filters are edited: `popover`, a chip's editor under the
 * chip applying live (a desktop), or `sheet`, a full-height sheet over a
 * draft that applies with "Show N results" (a phone, or TV mode).
 */
export type FilterSurface = "sheet" | "popover";

export function useFilterSurface(): FilterSurface {
  const { isTVMode } = useTVMode();
  const narrow = useMediaQuery(SHEET_QUERY);
  return narrow || isTVMode ? "sheet" : "popover";
}
