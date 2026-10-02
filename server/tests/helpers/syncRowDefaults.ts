/**
 * The fields Stash's sync queries declare non-null (`server/schema.json`),
 * empty. A sync batch reads them without a guard, so a test row that leaves
 * them out spreads one of these first: `partialRow<SyncScene>({
 * ...SCENE_DEFAULTS, id: "1" })`.
 */

const COUNTS = {
  scene_count: 0,
  image_count: 0,
  gallery_count: 0,
  performer_count: 0,
  group_count: 0,
};

export const SCENE_DEFAULTS = {
  urls: [],
  files: [],
  captions: [],
  sceneStreams: [],
  paths: {},
  performers: [],
  tags: [],
  groups: [],
  galleries: [],
};

export const PERFORMER_DEFAULTS = {
  alias_list: [],
  urls: [],
  tags: [],
  ...COUNTS,
};

export const STUDIO_DEFAULTS = { aliases: [], tags: [], ...COUNTS };

export const TAG_DEFAULTS = {
  parents: [],
  aliases: [],
  studio_count: 0,
  scene_marker_count: 0,
  ...COUNTS,
};

export const GROUP_DEFAULTS = {
  urls: [],
  tags: [],
  scene_count: 0,
  performer_count: 0,
};

export const GALLERY_DEFAULTS = {
  urls: [],
  files: [],
  // No path is set: the batch stores NULL for each
  paths: {} as { cover: string; preview: string },
  performers: [],
  tags: [],
  image_count: 0,
};

export const IMAGE_DEFAULTS = {
  urls: [],
  files: [],
  paths: {},
  performers: [],
  tags: [],
  galleries: [],
};
