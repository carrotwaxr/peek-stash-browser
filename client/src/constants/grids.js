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

/** STANDARD GRID COLUMNS
  < 640px       1
  640-1023px    2
  1024-1919px   3
  1920-2559px   5
  2560-3839px   6
  3840px+       10
*/
export const STANDARD_GRID_CONTAINER_CLASSNAMES =
  "card-grid-responsive grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-5 4xl:grid-cols-6 5xl:grid-cols-10";

/** SCENE GRID COLUMNS
  < 768px       1
  768-1279px    2
  1280-1919px   3
  1920-2559px   4
  2560-3839px   5
  3840px+       8
*/
export const SCENE_GRID_CONTAINER_CLASSNAMES =
  "card-grid-responsive grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5 5xl:grid-cols-8";
