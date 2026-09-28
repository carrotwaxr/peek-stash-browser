// shared/types/filters/uiKeys.ts
/**
 * The filter panel's keys: what the client's `*_FILTER_OPTIONS` offer, as
 * saved in filter presets and the URL, and the contract field each fills.
 * A key's modifier and depth ride in companion keys (`tagIdsModifier`,
 * `tagIdsDepth`). The server cleans stored presets against this list.
 */
import {
  CLIP_PARAMS,
  GALLERY_FIELDS,
  GROUP_FIELDS,
  IMAGE_FIELDS,
  type ListKind,
  PERFORMER_FIELDS,
  SCENE_FIELDS,
  STUDIO_FIELDS,
  TAG_FIELDS,
} from "./fields.js";

export interface UiKey<F extends string = string> {
  /** The panel's key */
  readonly key: string;
  /** The contract field it fills */
  readonly field: F;
  /** The companion key holding its modifier */
  readonly modifierKey?: string;
  /** The companion key holding its depth (include sub-tags, sub-studios) */
  readonly hierarchyKey?: string;
}

type UiKeysOf<Fields> = readonly UiKey<Extract<keyof Fields, string>>[];

export const SCENE_UI_KEYS = [
  { key: "title", field: "title" },
  { key: "details", field: "details" },
  {
    key: "performerIds",
    field: "performers",
    modifierKey: "performerIdsModifier",
  },
  { key: "studioId", field: "studios", hierarchyKey: "studioIdDepth" },
  {
    key: "tagIds",
    field: "tags",
    modifierKey: "tagIdsModifier",
    hierarchyKey: "tagIdsDepth",
  },
  { key: "groupIds", field: "groups", modifierKey: "groupIdsModifier" },
  { key: "rating", field: "rating100" },
  { key: "oCount", field: "o_counter" },
  { key: "duration", field: "duration" },
  { key: "favorite", field: "favorite" },
  { key: "performerFavorite", field: "performer_favorite" },
  { key: "studioFavorite", field: "studio_favorite" },
  { key: "tagFavorite", field: "tag_favorite" },
  { key: "date", field: "date" },
  { key: "createdAt", field: "created_at" },
  { key: "updatedAt", field: "updated_at" },
  { key: "lastPlayedAt", field: "last_played_at" },
  {
    key: "resolution",
    field: "resolution",
    modifierKey: "resolutionModifier",
  },
  { key: "bitrate", field: "bitrate" },
  { key: "framerate", field: "framerate" },
  { key: "orientation", field: "orientation" },
  { key: "videoCodec", field: "video_codec" },
  { key: "audioCodec", field: "audio_codec" },
  { key: "director", field: "director" },
  { key: "playDuration", field: "play_duration" },
  { key: "playCount", field: "play_count" },
  { key: "performerCount", field: "performer_count" },
  { key: "performerAge", field: "performer_age" },
  { key: "tagCount", field: "tag_count" },
] as const satisfies UiKeysOf<typeof SCENE_FIELDS>;

export const PERFORMER_UI_KEYS = [
  { key: "name", field: "name" },
  {
    key: "tagIds",
    field: "tags",
    modifierKey: "tagIdsModifier",
    hierarchyKey: "tagIdsDepth",
  },
  { key: "gender", field: "gender" },
  { key: "rating", field: "rating100" },
  { key: "oCounter", field: "o_counter" },
  { key: "sceneCount", field: "scene_count" },
  { key: "favorite", field: "favorite" },
  { key: "age", field: "age" },
  { key: "birthYear", field: "birth_year" },
  { key: "deathYear", field: "death_year" },
  { key: "careerLength", field: "career_length" },
  { key: "birthdate", field: "birthdate" },
  { key: "deathDate", field: "death_date" },
  { key: "createdAt", field: "created_at" },
  { key: "updatedAt", field: "updated_at" },
  { key: "hairColor", field: "hair_color" },
  { key: "eyeColor", field: "eye_color" },
  { key: "ethnicity", field: "ethnicity" },
  { key: "fakeTits", field: "fake_tits" },
  { key: "measurements", field: "measurements" },
  { key: "tattoos", field: "tattoos" },
  { key: "piercings", field: "piercings" },
  { key: "height", field: "height" },
  { key: "weight", field: "weight" },
  { key: "penisLength", field: "penis_length" },
  { key: "playCount", field: "play_count" },
  { key: "details", field: "details" },
] as const satisfies UiKeysOf<typeof PERFORMER_FIELDS>;

export const STUDIO_UI_KEYS = [
  { key: "name", field: "name" },
  { key: "details", field: "details" },
  {
    key: "tagIds",
    field: "tags",
    modifierKey: "tagIdsModifier",
    hierarchyKey: "tagIdsDepth",
  },
  { key: "rating", field: "rating100" },
  { key: "sceneCount", field: "scene_count" },
  { key: "oCounter", field: "o_counter" },
  { key: "playCount", field: "play_count" },
  { key: "favorite", field: "favorite" },
  { key: "createdAt", field: "created_at" },
  { key: "updatedAt", field: "updated_at" },
] as const satisfies UiKeysOf<typeof STUDIO_FIELDS>;

export const TAG_UI_KEYS = [
  { key: "name", field: "name" },
  { key: "description", field: "description" },
  { key: "rating", field: "rating100" },
  { key: "sceneCount", field: "scene_count" },
  { key: "oCounter", field: "o_counter" },
  { key: "playCount", field: "play_count" },
  { key: "favorite", field: "favorite" },
  { key: "performerIds", field: "performers" },
  { key: "studioId", field: "studios" },
  { key: "sceneId", field: "scenes" },
  { key: "groupIds", field: "groups" },
  { key: "createdAt", field: "created_at" },
  { key: "updatedAt", field: "updated_at" },
] as const satisfies UiKeysOf<typeof TAG_FIELDS>;

export const GROUP_UI_KEYS = [
  { key: "name", field: "name" },
  { key: "synopsis", field: "synopsis" },
  { key: "director", field: "director" },
  {
    key: "performerIds",
    field: "performers",
    modifierKey: "performerIdsModifier",
  },
  { key: "studioId", field: "studios" },
  { key: "tagIds", field: "tags", modifierKey: "tagIdsModifier" },
  { key: "rating", field: "rating100" },
  { key: "sceneCount", field: "scene_count" },
  { key: "duration", field: "duration" },
  { key: "favorite", field: "favorite" },
  { key: "date", field: "date" },
  { key: "createdAt", field: "created_at" },
  { key: "updatedAt", field: "updated_at" },
  { key: "sceneId", field: "scenes" },
  /** Parent collection: the direct sub-collections of these */
  { key: "groupIds", field: "containing_groups" },
] as const satisfies UiKeysOf<typeof GROUP_FIELDS>;

export const GALLERY_UI_KEYS = [
  { key: "title", field: "title" },
  {
    key: "performerIds",
    field: "performers",
    modifierKey: "performerIdsModifier",
  },
  {
    key: "studioIds",
    field: "studios",
    modifierKey: "studioIdsModifier",
    hierarchyKey: "studioIdsDepth",
  },
  {
    key: "tagIds",
    field: "tags",
    modifierKey: "tagIdsModifier",
    hierarchyKey: "tagIdsDepth",
  },
  { key: "rating", field: "rating100" },
  { key: "imageCount", field: "image_count" },
  { key: "favorite", field: "favorite" },
  { key: "hasFavoriteImage", field: "hasFavoriteImage" },
] as const satisfies UiKeysOf<typeof GALLERY_FIELDS>;

export const IMAGE_UI_KEYS = [
  {
    key: "performerIds",
    field: "performers",
    modifierKey: "performerIdsModifier",
  },
  {
    key: "studioIds",
    field: "studios",
    modifierKey: "studioIdsModifier",
    hierarchyKey: "studioIdsDepth",
  },
  {
    key: "tagIds",
    field: "tags",
    modifierKey: "tagIdsModifier",
    hierarchyKey: "tagIdsDepth",
  },
  {
    key: "galleryIds",
    field: "galleries",
    modifierKey: "galleryIdsModifier",
  },
  { key: "rating", field: "rating100" },
  { key: "favorite", field: "favorite" },
  { key: "oCounter", field: "o_counter" },
] as const satisfies UiKeysOf<typeof IMAGE_FIELDS>;

export const CLIP_UI_KEYS = [
  { key: "tagIds", field: "tagIds", modifierKey: "tagIdsModifier" },
  {
    key: "sceneTagIds",
    field: "sceneTagIds",
    modifierKey: "sceneTagIdsModifier",
  },
  {
    key: "performerIds",
    field: "performerIds",
    modifierKey: "performerIdsModifier",
  },
  { key: "studioId", field: "studioId" },
  { key: "isGenerated", field: "isGenerated" },
] as const satisfies UiKeysOf<typeof CLIP_PARAMS>;

export const UI_KEYS = {
  scene: SCENE_UI_KEYS,
  performer: PERFORMER_UI_KEYS,
  studio: STUDIO_UI_KEYS,
  tag: TAG_UI_KEYS,
  group: GROUP_UI_KEYS,
  gallery: GALLERY_UI_KEYS,
  image: IMAGE_UI_KEYS,
  clip: CLIP_UI_KEYS,
} as const satisfies Record<ListKind, readonly UiKey[]>;
