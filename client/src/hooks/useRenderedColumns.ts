import { type RefObject, useEffect, useRef, useState } from "react";

/** How many tracks a grid element lays out, as its CSS resolved them */
const countColumns = (grid: HTMLElement) => {
  const tracks = getComputedStyle(grid).gridTemplateColumns.trim();
  if (!tracks || tracks === "none") return 0;
  return tracks.split(/\s+/).length;
};

/**
 * The number of columns a grid element renders right now, read from its
 * computed `grid-template-columns` (so it follows the CSS, not a copy of its
 * breakpoints) and kept current by one ResizeObserver on the grid. 0 while the
 * grid is not mounted. The grid may mount after the first render (a list shows
 * a skeleton first), so each render checks whether the ref points at a new
 * element.
 */
export const useRenderedColumns = (gridRef: RefObject<HTMLElement | null>) => {
  const [columns, setColumns] = useState(0);
  const observed = useRef<HTMLElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  // No dependency list on purpose: the ref's element is not reactive
  useEffect(() => {
    const grid = gridRef.current;
    if (grid === observed.current) return;
    observer.current?.disconnect();
    observer.current = null;
    observed.current = grid;
    const measure = () => setColumns(grid ? countColumns(grid) : 0);
    measure();
    if (!grid) return;
    observer.current = new ResizeObserver(measure);
    observer.current.observe(grid);
  });

  useEffect(
    () => () => {
      observer.current?.disconnect();
      observer.current = null;
      observed.current = null;
    },
    []
  );

  return columns;
};
