/**
 * Sorting and filtering configuration for all entity types
 */
import {
  type CarouselData,
  type ClipFilterInput,
  type GalleryFilterInput,
  type GroupFilterInput,
  type ImageFilterInput,
  type ListKind,
  type Match,
  PANEL_FIELDS,
  type PanelField,
  type PerformerFilterInput,
  type SceneFilterInput,
  type StudioFilterInput,
  type TagFilterInput,
  type WhereGroup,
  type WhereLeaf,
  type WhereNode,
  isWhereGroup,
} from "@peek/shared-types";
import {
  type EditItem,
  type EditTree,
  type FilterOption,
  type KeptLeaf,
  type PanelRow,
  type PanelTable,
  type ReadPanelFilter,
  buildPanelFilter,
  editTreeOf,
  filterOptionsOf,
  panelTableOf,
  panelTreeOf,
  stateOf,
  stateOfWhere,
  treeOf,
  whereOf,
} from "./filterFields";

export type { FilterOption };

// Scene sorting options (alphabetically organized by label)
// Note: Scene Number and Playlist Order are added when the filters name a
// collection or one playlist (`sortOptionsFor`)
export const SCENE_SORT_OPTIONS_BASE = [
  { value: "bitrate", label: "Bitrate" },
  { value: "code", label: "Code" },
  { value: "created_at", label: "Created At" },
  { value: "date", label: "Date" },
  { value: "duration", label: "Duration" },
  { value: "filesize", label: "File Size" },
  { value: "framerate", label: "Framerate" },
  { value: "last_o_at", label: "Last O At" },
  { value: "last_played_at", label: "Last Played At" },
  { value: "o_counter", label: "O Count" },
  { value: "organized", label: "Organized" },
  { value: "path", label: "Path" },
  { value: "performer_age", label: "Performer Age" },
  { value: "performer_count", label: "Performer Count" },
  { value: "play_count", label: "Play Count" },
  { value: "play_duration", label: "Play Duration" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "resolution", label: "Resolution" },
  { value: "resume_time", label: "Resume Time" },
  { value: "studio", label: "Studio" },
  { value: "tag_count", label: "Tag Count" },
  { value: "title", label: "Title" },
  { value: "updated_at", label: "Updated At" },
];

// Scene Number option - only shown when group filter is active
export const SCENE_INDEX_SORT_OPTION = {
  value: "scene_index",
  label: "Scene Number",
};

// Playlist Order option - only shown when exactly one playlist is chosen
export const PLAYLIST_POSITION_SORT_OPTION = {
  value: "playlist_position",
  label: "Playlist Order",
};

// Full list (every scene sort, the two conditional ones included), by label
export const SCENE_SORT_OPTIONS = [
  ...SCENE_SORT_OPTIONS_BASE,
  PLAYLIST_POSITION_SORT_OPTION,
  SCENE_INDEX_SORT_OPTION,
].sort((a, b) => a.label.localeCompare(b.label));

// Recommended sorts: its rank first, then every scene sort
export const RECOMMENDED_SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  ...SCENE_SORT_OPTIONS,
];

// Performer sorting options (alphabetically organized by label)
export const PERFORMER_SORT_OPTIONS = [
  { value: "birthdate", label: "Birthdate" },
  { value: "career_length", label: "Career Length" },
  { value: "group_count", label: "Collection Count" },
  { value: "created_at", label: "Created At" },
  { value: "gallery_count", label: "Gallery Count" },
  { value: "height", label: "Height" },
  { value: "image_count", label: "Image Count" },
  { value: "last_o_at", label: "Last O At" },
  { value: "last_played_at", label: "Last Played At" },
  { value: "marker_count", label: "Marker Count" },
  { value: "measurements", label: "Measurements" },
  { value: "name", label: "Name" },
  { value: "o_counter", label: "O Count" },
  { value: "penis_length", label: "Penis Length" },
  { value: "play_count", label: "Play Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scenes_count", label: "Scene Count" },
  { value: "tag_count", label: "Tag Count" },
  { value: "updated_at", label: "Updated At" },
  { value: "weight", label: "Weight" },
];

// Studio sorting options (alphabetically organized by label)
export const STUDIO_SORT_OPTIONS = [
  { value: "child_count", label: "Child Studio Count" },
  { value: "group_count", label: "Collection Count" },
  { value: "created_at", label: "Created At" },
  { value: "gallery_count", label: "Gallery Count" },
  { value: "image_count", label: "Image Count" },
  { value: "name", label: "Name" },
  { value: "o_counter", label: "O Count" },
  { value: "performer_count", label: "Performer Count" },
  { value: "play_count", label: "Play Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scenes_count", label: "Scene Count" },
  { value: "tag_count", label: "Tag Count" },
  { value: "updated_at", label: "Updated At" },
];

// Tag sorting options (alphabetically organized by label)
export const TAG_SORT_OPTIONS = [
  { value: "child_count", label: "Child Tag Count" },
  { value: "group_count", label: "Collection Count" },
  { value: "created_at", label: "Created At" },
  { value: "gallery_count", label: "Gallery Count" },
  { value: "image_count", label: "Image Count" },
  { value: "name", label: "Name" },
  { value: "o_counter", label: "O Count" },
  { value: "parent_count", label: "Parent Tag Count" },
  { value: "performer_count", label: "Performer Count" },
  { value: "play_count", label: "Play Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scenes_count", label: "Scene Count" },
  { value: "studio_count", label: "Studio Count" },
  { value: "updated_at", label: "Updated At" },
];

// Collection sorting options (alphabetically organized by label); Collection
// Order is offered only beside a parent collection (`sortOptionsFor`)
export const GROUP_SORT_OPTIONS = [
  { value: "sub_group_order", label: "Collection Order" },
  { value: "created_at", label: "Created At" },
  { value: "date", label: "Date" },
  { value: "duration", label: "Duration" },
  { value: "name", label: "Name" },
  { value: "o_counter", label: "O Count" },
  { value: "performer_count", label: "Performer Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "scene_count", label: "Scene Count" },
  { value: "tag_count", label: "Tag Count" },
  { value: "updated_at", label: "Updated At" },
];

// Gallery sorting options (alphabetically organized by label)
export const GALLERY_SORT_OPTIONS = [
  { value: "created_at", label: "Created At" },
  { value: "date", label: "Date" },
  { value: "image_count", label: "Image Count" },
  { value: "path", label: "Path" },
  { value: "performer_count", label: "Performer Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "tag_count", label: "Tag Count" },
  { value: "title", label: "Title" },
  { value: "updated_at", label: "Updated At" },
];

// Image sorting options
export const IMAGE_SORT_OPTIONS = [
  { value: "created_at", label: "Created At" },
  { value: "date", label: "Date" },
  { value: "filesize", label: "File Size" },
  { value: "o_counter", label: "O Count" },
  { value: "path", label: "Path" },
  { value: "performer_count", label: "Performer Count" },
  { value: "random", label: "Random" },
  { value: "rating", label: "Rating" },
  { value: "resolution", label: "Resolution" },
  { value: "tag_count", label: "Tag Count" },
  { value: "title", label: "Title" },
  { value: "updated_at", label: "Updated At" },
];

// Clip sorting options (Peek server API)
export const CLIP_SORT_OPTIONS = [
  { value: "stashCreatedAt", label: "Created At" },
  { value: "title", label: "Title" },
  { value: "seconds", label: "Position in Scene" },
  { value: "duration", label: "Duration" },
  { value: "random", label: "Random" },
];

// Each list's panel options, read from the shared field table
export const SCENE_FILTER_OPTIONS = filterOptionsOf("scene");
export const PERFORMER_FILTER_OPTIONS = filterOptionsOf("performer");
export const STUDIO_FILTER_OPTIONS = filterOptionsOf("studio");
export const TAG_FILTER_OPTIONS = filterOptionsOf("tag");
export const GROUP_FILTER_OPTIONS = filterOptionsOf("group");
export const GALLERY_FILTER_OPTIONS = filterOptionsOf("gallery");
export const IMAGE_FILTER_OPTIONS = filterOptionsOf("image");
export const CLIP_FILTER_OPTIONS = filterOptionsOf("clip");

/**
 * The filter panel's state: option keys with their modifier and depth
 * companions (`tagIdsModifier`, `tagIdsDepth`), and a page's permanent
 * criteria in the request's own shape (a performer page's `performers`)
 */
type FilterState = Readonly<Record<string, unknown>>;

/**
 * The panel's state to each list's request filter, through the one
 * table-driven builder (`buildPanelFilter`). Each returns the list's wire
 * type from the shared contract (`SceneFilterInput`, ...), so what the
 * panel sends is what the server's parser accepts.
 */
export const buildSceneFilter = (filters: FilterState): SceneFilterInput =>
  buildPanelFilter("scene", filters);

export const buildPerformerFilter = (
  filters: FilterState
): PerformerFilterInput => buildPanelFilter("performer", filters);

export const buildStudioFilter = (filters: FilterState): StudioFilterInput =>
  buildPanelFilter("studio", filters);

export const buildTagFilter = (filters: FilterState): TagFilterInput =>
  buildPanelFilter("tag", filters);

export const buildGroupFilter = (filters: FilterState): GroupFilterInput =>
  buildPanelFilter("group", filters);

export const buildGalleryFilter = (filters: FilterState): GalleryFilterInput =>
  buildPanelFilter("gallery", filters);

export const buildImageFilter = (filters: FilterState): ImageFilterInput =>
  buildPanelFilter("image", filters);

/**
 * The Clips page's `clip_filter` for `POST /api/library/clips`. Clips list
 * with a preview unless the panel picks "Without preview only" (false) or
 * "All clips" (no `is_generated`).
 */
export const buildClipFilter = (filters: FilterState): ClipFilterInput =>
  buildPanelFilter("clip", filters);

// ============================================================================
// CAROUSEL BUILDER HELPERS
// ============================================================================

/** The scene panel rows a custom carousel offers as rules */
export const CAROUSEL_FIELDS: readonly PanelField[] = PANEL_FIELDS.scene.filter(
  (row: PanelField) => row.carousel !== false
);

const CAROUSEL_TABLE: PanelTable = {
  ...panelTableOf("scene"),
  rows: CAROUSEL_FIELDS,
};

const CAROUSEL_KEYS = new Set(CAROUSEL_FIELDS.map((row) => row.key));

/**
 * The carousel builder's rule choices: the scene panel's options for the
 * rows a carousel offers, with the panel's labels, choices, conditions and
 * defaults, sorted by label and without the panel's section headers
 */
export const CAROUSEL_FILTER_DEFINITIONS: FilterOption[] = filterOptionsOf(
  "scene"
)
  .filter((option) => CAROUSEL_KEYS.has(option.key))
  .sort((a, b) => (a.label ?? a.key).localeCompare(b.label ?? b.key));

/** A stored carousel's rules as a where tree: the tree as stored, a flat rule set (stored before 9b) as its root "all" tree */
function storedWhereOf(rules: unknown): WhereGroup<"scene"> | undefined {
  if (isWhereGroup(rules)) return rules as WhereGroup<"scene">;
  if (typeof rules !== "object" || rules === null || Array.isArray(rules)) {
    return undefined;
  }
  return {
    match: "all",
    rules: Object.entries(rules as Readonly<Record<string, unknown>>).map(
      ([field, criterion]) => ({ field, criterion }) as WhereLeaf<"scene">
    ),
  };
}

/**
 * A carousel's stored rules, of either shape, as panel state (`stateOfWhere`:
 * each leaf read by the first scene row of its field that can, a repeated
 * field as `2.<key>`, a group as `g<n>.<key>`), with the root's rules no row
 * can edit as a flat filter holds them. A group's unreadable leaves are not
 * in `kept`: the builder edits stored rules through `carouselEditTree`.
 */
export const carouselRulesToFilterState = (rules: unknown): ReadPanelFilter => {
  const { state, kept } = stateOfWhere("scene", storedWhereOf(rules));
  return {
    state,
    kept: Object.fromEntries(
      kept.flatMap(({ group, leaf }) =>
        group === 0 &&
        typeof leaf === "object" &&
        leaf !== null &&
        "field" in leaf &&
        typeof leaf.field === "string" &&
        "criterion" in leaf
          ? [[leaf.field, leaf.criterion]]
          : []
      )
    ),
  };
};

const matchOf = (value: unknown): Match => (value === "any" ? "any" : "all");

/**
 * One stored container's leaves as panel rows, and the nodes no row reads
 * (each leaf no row can read; in a group, a group nested deeper than the
 * editor goes, kept whole)
 */
function containerOf(
  match: Match,
  nodes: readonly unknown[]
): { rows: readonly PanelRow[]; kept: readonly unknown[] } {
  const read = stateOfWhere("scene", {
    match,
    rules: nodes.filter((node) => !isWhereGroup(node)),
  });
  return {
    rows: treeOf("scene", read.state).rows,
    kept: read.kept.map((each) => each.leaf),
  };
}

/**
 * The carousel builder's editing tree of a carousel's stored rules (either
 * shape): its rows, and each leaf no row can read as a kept row in its own
 * container, after the rows. Every stored group stays, in its place and
 * with its match, one holding only kept leaves included, so a save puts
 * each leaf back where it was.
 */
export function carouselEditTree(
  carousel: Pick<CarouselData, "rules">
): EditTree {
  const where = storedWhereOf(carousel.rules);
  const nodes: readonly unknown[] = where?.rules ?? [];
  const root = containerOf(matchOf(where?.match), nodes);
  const groups = nodes.filter(isWhereGroup).map((group) => {
    const match = matchOf(group.match);
    const read = containerOf(match, group.rules);
    return {
      match,
      rows: read.rows,
      kept: [...read.kept, ...group.rules.filter(isWhereGroup)],
    };
  });
  const kept: KeptLeaf[] = [
    ...root.kept.map((leaf) => ({ group: 0, leaf })),
    ...groups.flatMap((group, at) =>
      group.kept.map((leaf) => ({ group: at + 1, leaf }))
    ),
  ];
  return editTreeOf(
    "scene",
    {
      match: matchOf(where?.match),
      rows: root.rows,
      groups: groups.map(({ match, rows }) => ({ match, rows })),
      permanent: {},
    },
    kept
  );
}

/** One editing container's rules as the wire holds them: its rows (merged under "any") and then its kept leaves */
function containerRules(
  match: Match,
  items: readonly EditItem[]
): readonly WhereNode<"scene">[] {
  const { tree, kept } = panelTreeOf({
    match,
    rows: items,
    groups: [],
    permanent: {},
  });
  return whereOf("scene", stateOf("scene", tree), kept)?.rules ?? [];
}

/**
 * The rules a carousel saves and previews: the editing tree as a where
 * tree (Contract 8), each container through `whereOf` (rows that filter,
 * canonical, same-field rows of an "any" container merged, kept leaves
 * after the rows), the root's leaves before its groups, every group that
 * holds a rule in the user's order with its match. Nothing left is an
 * empty root "all" tree.
 */
export function carouselBody(edit: EditTree): WhereGroup<"scene"> {
  const groups = edit.groups.flatMap((group) => {
    const rules = containerRules(group.match, group.rows);
    return rules.length === 0 ? [] : [{ match: group.match, rules }];
  });
  return {
    match: edit.match,
    rules: [...containerRules(edit.match, edit.rows), ...groups],
  };
}

/**
 * The rules a carousel saves and previews: the builder's state built through
 * the scene rows, over the rules it kept but cannot edit
 */
export const buildCarouselRules = (
  state: FilterState,
  kept: Readonly<Record<string, unknown>> = {}
): SceneFilterInput => ({
  ...kept,
  ...buildPanelFilter("scene", state, CAROUSEL_TABLE),
});
