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
*/
export const STANDARD_GRID_DENSITIES = {
  small: "card-grid-responsive grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 3xl:grid-cols-6 4xl:grid-cols-8 5xl:grid-cols-12",
  medium: "card-grid-responsive grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-5 4xl:grid-cols-6 5xl:grid-cols-10",
  large: "card-grid-responsive grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4 5xl:grid-cols-6",
};

/** SCENE GRID DENSITY LEVELS */
export const SCENE_GRID_DENSITIES = {
  small: "card-grid-responsive grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-7 5xl:grid-cols-10",
  medium: "card-grid-responsive grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5 5xl:grid-cols-8",
  large: "card-grid-responsive grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4 5xl:grid-cols-5",
};

// Keep legacy exports for backwards compatibility during migration
export const STANDARD_GRID_CONTAINER_CLASSNAMES = STANDARD_GRID_DENSITIES.medium;
export const SCENE_GRID_CONTAINER_CLASSNAMES = SCENE_GRID_DENSITIES.medium;

/** Helper to get grid classes for a density level */
export const getGridClasses = (gridType, density = "medium") => {
  const densities = gridType === "scene" ? SCENE_GRID_DENSITIES : STANDARD_GRID_DENSITIES;
  return densities[density] || densities.medium;
};
