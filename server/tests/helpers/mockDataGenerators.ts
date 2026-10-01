/**
 * Mock Data Generators for Unit Tests
 *
 * Creates realistic test data matching Peek's standalone Normalized types.
 */
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../../types/index.js";

/**
 * Create a mock NormalizedPerformer. Every factory builds its defaults and
 * then spreads `overrides` last, so a falsy override (`instanceId: ""`,
 * `rating100: 0`) is kept as given.
 */
export function createMockPerformer(
  overrides: Partial<NormalizedPerformer> = {}
): NormalizedPerformer {
  const id = overrides.id ?? Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: "default",
    name: `Performer ${id}`,
    disambiguation: null,
    url: null,
    stash_ids: [],
    gender: null,
    birthdate: null,
    ethnicity: null,
    country: null,
    eye_color: null,
    height_cm: null,
    measurements: null,
    fake_tits: null,
    career_length: null,
    tattoos: null,
    piercings: null,
    alias_list: [],
    favorite: false,
    tags: [],
    image_path: null,
    scene_count: 0,
    image_count: 0,
    gallery_count: 0,
    group_count: 0,
    o_counter: 0,
    details: null,
    death_date: null,
    hair_color: null,
    weight: null,
    rating: null,
    rating100: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    play_count: 0,
    last_played_at: null,
    last_o_at: null,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedStudio
 */
export function createMockStudio(
  overrides: Partial<NormalizedStudio> = {}
): NormalizedStudio {
  const id = overrides.id ?? Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: "default",
    name: `Studio ${id}`,
    url: null,
    stash_ids: [],
    image_path: null,
    scene_count: 0,
    image_count: 0,
    gallery_count: 0,
    performer_count: 0,
    group_count: 0,
    parent_studio: null,
    rating: null,
    rating100: null,
    details: null,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    favorite: false,
    o_counter: 0,
    play_count: 0,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedTag
 */
export function createMockTag(
  overrides: Partial<NormalizedTag> = {}
): NormalizedTag {
  const id = overrides.id ?? Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: "default",
    name: `Tag ${id}`,
    aliases: [],
    image_path: null,
    scene_count: 0,
    scene_count_via_performers: 0,
    image_count: 0,
    gallery_count: 0,
    performer_count: 0,
    studio_count: 0,
    group_count: 0,
    parents: [],
    description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rating: null,
    rating100: null,
    favorite: false,
    o_counter: 0,
    play_count: 0,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedGroup
 */
export function createMockGroup(
  overrides: Partial<NormalizedGroup> = {}
): NormalizedGroup {
  const id = overrides.id ?? Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: "default",
    name: `Group ${id}`,
    duration: null,
    date: null,
    rating: null,
    rating100: null,
    director: null,
    synopsis: null,
    urls: [],
    front_image_path: null,
    back_image_path: null,
    scene_count: 0,
    performer_count: 0,
    sub_group_count: 0,
    studio: null,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    favorite: false,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedGallery
 */
export function createMockGallery(
  overrides: Partial<NormalizedGallery> = {}
): NormalizedGallery {
  const id = overrides.id ?? Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: "default",
    title: `Gallery ${id}`,
    code: null,
    date: null,
    url: null,
    details: null,
    rating: null,
    rating100: null,
    image_count: 0,
    cover: null,
    studio: null,
    tags: [],
    performers: [],
    folder: null,
    files: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    favorite: false,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedScene
 */
export function createMockScene(
  overrides: Partial<NormalizedScene> = {}
): NormalizedScene {
  const id = overrides.id ?? Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: "default",
    title: `Scene ${id}`,
    code: null,
    details: null,
    urls: [],
    date: null,
    rating: null,
    rating100: null,
    o_counter: 0,
    organized: false,
    resume_time: 0,
    play_duration: 0,
    play_count: 0,
    captions: [],
    files: [
      {
        path: `/path/to/scene_${id}.mp4`,
        duration: 3600,
        video_codec: "h264",
        audio_codec: "aac",
        width: 1920,
        height: 1080,
        frame_rate: 30,
        bit_rate: 5000000,
        size: 1000000000,
      },
    ],
    paths: {
      screenshot: `/screenshots/scene_${id}.jpg`,
      preview: `/previews/scene_${id}.mp4`,
      stream: `/stream/scene_${id}.mp4`,
      vtt: `/sprites/scene_${id}.vtt`,
      sprite: `/sprites/scene_${id}.jpg`,
      chapters_vtt: null,
      caption: null,
    },
    galleries: [],
    studio: null,
    groups: [],
    tags: [],
    performers: [],
    sceneStreams: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_played_at: null,
    last_o_at: null,
    favorite: false,
    ...overrides,
  };
}
