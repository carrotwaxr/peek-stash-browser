/** BREAKPOINTS
  sm	(640px)
  md	(768px)
  lg	(1024px)
  xl	(1280px)
  2xl	(1536px)
  3xl (1920px)
  4xl (2560px)
  5xl (3840px)
*/

/** STANDARD GRID DENSITY LEVELS
  Density: small (more columns), medium (current), large (fewer columns)

  Updated for 1080p users: added xl/2xl breakpoints so scrollbar doesn't
  push users under 3xl threshold. Portrait cards at small now ~264px wide.

  Each density level includes a density-{level} class for CSS text scaling.
*/
export const STANDARD_GRID_DENSITIES = {
  small: "card-grid-responsive density-small grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 4xl:grid-cols-10 5xl:grid-cols-14",
  medium: "card-grid-responsive density-medium grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-8 5xl:grid-cols-12",
  large: "card-grid-responsive density-large grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5 5xl:grid-cols-8",
};

/** SCENE GRID DENSITY LEVELS */
export const SCENE_GRID_DENSITIES = {
  small: "card-grid-responsive density-small grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-7 4xl:grid-cols-9 5xl:grid-cols-12",
  medium: "card-grid-responsive density-medium grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7 5xl:grid-cols-10",
  large: "card-grid-responsive density-large grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5 5xl:grid-cols-6",
};

// Keep legacy exports for backwards compatibility during migration
export const STANDARD_GRID_CONTAINER_CLASSNAMES = STANDARD_GRID_DENSITIES.medium;
export const SCENE_GRID_CONTAINER_CLASSNAMES = SCENE_GRID_DENSITIES.medium;

/** Helper to get grid classes for a density level */
export const getGridClasses = (gridType, density = "medium") => {
  const densities = gridType === "scene" ? SCENE_GRID_DENSITIES : STANDARD_GRID_DENSITIES;
  return densities[density] || densities.medium;
};
