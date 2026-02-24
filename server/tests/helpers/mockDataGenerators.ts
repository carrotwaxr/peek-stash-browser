/**
 * Mock Data Generators for Unit Tests
 *
 * Creates realistic test data matching Peek's standalone Normalized types.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  GroupRef,
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../../types/index.js";

/**
 * Create a mock NormalizedPerformer
 */
export function createMockPerformer(
  overrides: Partial<NormalizedPerformer> = {}
): NormalizedPerformer {
  const id = overrides.id || Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: overrides.instanceId || "default",
    name: overrides.name || `Performer ${id}`,
    disambiguation: overrides.disambiguation || null,
    url: overrides.url || null,
    gender: overrides.gender || null,
    birthdate: overrides.birthdate || null,
    ethnicity: overrides.ethnicity || null,
    country: overrides.country || null,
    eye_color: overrides.eye_color || null,
    height_cm: overrides.height_cm || null,
    measurements: overrides.measurements || null,
    fake_tits: overrides.fake_tits || null,
    career_length: overrides.career_length || null,
    tattoos: overrides.tattoos || null,
    piercings: overrides.piercings || null,
    alias_list: overrides.alias_list || [],
    favorite: overrides.favorite ?? false,
    tags: overrides.tags || [],
    image_path: overrides.image_path || null,
    scene_count: overrides.scene_count ?? 0,
    image_count: overrides.image_count ?? 0,
    gallery_count: overrides.gallery_count ?? 0,
    group_count: overrides.group_count ?? 0,
    o_counter: overrides.o_counter ?? 0,
    details: overrides.details || null,
    death_date: overrides.death_date || null,
    hair_color: overrides.hair_color || null,
    weight: overrides.weight || null,
    rating: overrides.rating ?? null,
    rating100: overrides.rating100 ?? null,
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
    play_count: overrides.play_count ?? 0,
    last_played_at: overrides.last_played_at ?? null,
    last_o_at: overrides.last_o_at ?? null,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedStudio
 */
export function createMockStudio(
  overrides: Partial<NormalizedStudio> = {}
): NormalizedStudio {
  const id = overrides.id || Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: overrides.instanceId || "default",
    name: overrides.name || `Studio ${id}`,
    url: overrides.url || null,
    image_path: overrides.image_path || null,
    scene_count: overrides.scene_count ?? 0,
    image_count: overrides.image_count ?? 0,
    gallery_count: overrides.gallery_count ?? 0,
    performer_count: overrides.performer_count ?? 0,
    group_count: overrides.group_count ?? 0,
    parent_studio: overrides.parent_studio || null,
    rating: overrides.rating ?? null,
    rating100: overrides.rating100 ?? null,
    details: overrides.details || null,
    tags: overrides.tags || [],
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
    favorite: overrides.favorite ?? false,
    o_counter: overrides.o_counter ?? 0,
    play_count: overrides.play_count ?? 0,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedTag
 */
export function createMockTag(
  overrides: Partial<NormalizedTag> = {}
): NormalizedTag {
  const id = overrides.id || Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: overrides.instanceId || "default",
    name: overrides.name || `Tag ${id}`,
    aliases: overrides.aliases || [],
    image_path: overrides.image_path || null,
    scene_count: overrides.scene_count ?? 0,
    scene_marker_count: overrides.scene_marker_count ?? 0,
    scene_count_via_performers: overrides.scene_count_via_performers ?? 0,
    image_count: overrides.image_count ?? 0,
    gallery_count: overrides.gallery_count ?? 0,
    performer_count: overrides.performer_count ?? 0,
    studio_count: overrides.studio_count ?? 0,
    group_count: overrides.group_count ?? 0,
    parents: overrides.parents || [],
    description: overrides.description || null,
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
    rating: overrides.rating ?? null,
    rating100: overrides.rating100 ?? null,
    favorite: overrides.favorite ?? false,
    o_counter: overrides.o_counter ?? 0,
    play_count: overrides.play_count ?? 0,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedGroup
 */
export function createMockGroup(
  overrides: Partial<NormalizedGroup> = {}
): NormalizedGroup {
  const id = overrides.id || Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: overrides.instanceId || "default",
    name: overrides.name || `Group ${id}`,
    duration: overrides.duration ?? null,
    date: overrides.date || null,
    rating: overrides.rating ?? null,
    rating100: overrides.rating100 ?? null,
    director: overrides.director || null,
    synopsis: overrides.synopsis || null,
    urls: overrides.urls || [],
    front_image_path: overrides.front_image_path || null,
    back_image_path: overrides.back_image_path || null,
    scene_count: overrides.scene_count ?? 0,
    performer_count: overrides.performer_count ?? 0,
    studio: overrides.studio || null,
    tags: overrides.tags || [],
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
    favorite: overrides.favorite ?? false,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedGallery
 */
export function createMockGallery(
  overrides: Partial<NormalizedGallery> = {}
): NormalizedGallery {
  const id = overrides.id || Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: overrides.instanceId || "default",
    title: overrides.title || `Gallery ${id}`,
    code: overrides.code || null,
    date: overrides.date || null,
    url: overrides.url || null,
    details: overrides.details || null,
    rating: overrides.rating ?? null,
    rating100: overrides.rating100 ?? null,
    image_count: overrides.image_count ?? 0,
    cover: overrides.cover || null,
    studio: overrides.studio || null,
    tags: overrides.tags || [],
    performers: overrides.performers || [],
    scenes: overrides.scenes || [],
    folder: overrides.folder || null,
    files: overrides.files || [],
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
    favorite: overrides.favorite ?? false,
    ...overrides,
  };
}

/**
 * Create a mock NormalizedScene
 */
export function createMockScene(
  overrides: Partial<NormalizedScene> = {}
): NormalizedScene {
  const id = overrides.id || Math.random().toString(36).substring(7);
  return {
    id,
    instanceId: overrides.instanceId || "default",
    title: overrides.title || `Scene ${id}`,
    code: overrides.code || null,
    details: overrides.details || null,
    urls: overrides.urls || [],
    date: overrides.date || null,
    rating: overrides.rating ?? null,
    rating100: overrides.rating100 ?? null,
    o_counter: overrides.o_counter ?? 0,
    organized: overrides.organized ?? false,
    resume_time: overrides.resume_time ?? 0,
    play_duration: overrides.play_duration ?? 0,
    play_count: overrides.play_count ?? 0,
    play_history: overrides.play_history || [],
    o_history: overrides.o_history || [],
    captions: overrides.captions || [],
    files: overrides.files || [
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
    paths: overrides.paths || {
      screenshot: `/screenshots/scene_${id}.jpg`,
      preview: `/previews/scene_${id}.mp4`,
      stream: `/stream/scene_${id}.mp4`,
      vtt: `/sprites/scene_${id}.vtt`,
      sprite: `/sprites/scene_${id}.jpg`,
      chapters_vtt: null,
      caption: null,
    },
    galleries: overrides.galleries || [],
    studio: overrides.studio || null,
    groups: overrides.groups || [],
    tags: overrides.tags || [],
    performers: overrides.performers || [],
    sceneStreams: overrides.sceneStreams || [],
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
    last_played_at: overrides.last_played_at ?? null,
    last_o_at: overrides.last_o_at ?? null,
    favorite: overrides.favorite ?? false,
    ...overrides,
  };
}

/**
 * Create an array of mock performers with various characteristics
 */
export function createMockPerformers(count: number): NormalizedPerformer[] {
  const performers: NormalizedPerformer[] = [];
  const genders = ["MALE", "FEMALE", "TRANSGENDER_MALE", "TRANSGENDER_FEMALE"];
  const countries = ["USA", "Canada", "UK", "France", "Germany"];

  for (let i = 0; i < count; i++) {
    performers.push(
      createMockPerformer({
        id: `performer_${i}`,
        instanceId: "default",
        name: `Performer ${i}`,
        gender: genders[i % genders.length] as any,
        country: countries[i % countries.length],
        favorite: i % 5 === 0, // Every 5th performer is a favorite
        rating: i % 3 === 0 ? ((i % 5) + 1) * 20 : null, // Some have ratings
        scene_count: i * 3,
        o_counter: i % 4 === 0 ? i * 2 : 0,
        play_count: i * 5,
      })
    );
  }

  return performers;
}

/**
 * Create an array of mock studios with various characteristics
 */
export function createMockStudios(count: number): NormalizedStudio[] {
  const studios: NormalizedStudio[] = [];

  for (let i = 0; i < count; i++) {
    studios.push(
      createMockStudio({
        id: `studio_${i}`,
        instanceId: "default",
        name: `Studio ${i}`,
        favorite: i % 4 === 0, // Every 4th studio is a favorite
        rating: i % 2 === 0 ? ((i % 5) + 1) * 20 : null,
        scene_count: i * 10,
        o_counter: i * 3,
        play_count: i * 15,
      })
    );
  }

  return studios;
}

/**
 * Create an array of mock tags with various characteristics
 */
export function createMockTags(count: number): NormalizedTag[] {
  const tags: NormalizedTag[] = [];

  for (let i = 0; i < count; i++) {
    tags.push(
      createMockTag({
        id: `tag_${i}`,
        instanceId: "default",
        name: `Tag ${i}`,
        favorite: i % 6 === 0, // Every 6th tag is a favorite
        rating: i % 3 === 0 ? ((i % 5) + 1) * 20 : null,
        scene_count: i * 7,
        o_counter: i * 2,
        play_count: i * 8,
      })
    );
  }

  return tags;
}

/**
 * Create an array of mock groups with various characteristics
 */
export function createMockGroups(count: number): NormalizedGroup[] {
  const groups: NormalizedGroup[] = [];

  for (let i = 0; i < count; i++) {
    groups.push(
      createMockGroup({
        id: `group_${i}`,
        instanceId: "default",
        name: `Group ${i}`,
        favorite: i % 7 === 0, // Every 7th group is a favorite
        rating: i % 2 === 0 ? ((i % 5) + 1) * 20 : null,
        scene_count: i * 4,
        duration: (i + 1) * 600, // 10 minutes * (i+1)
      })
    );
  }

  return groups;
}

/**
 * Create an array of mock galleries with various characteristics
 */
export function createMockGalleries(count: number): NormalizedGallery[] {
  const galleries: NormalizedGallery[] = [];

  for (let i = 0; i < count; i++) {
    galleries.push(
      createMockGallery({
        id: `gallery_${i}`,
        instanceId: "default",
        title: `Gallery ${i}`,
        favorite: i % 8 === 0, // Every 8th gallery is a favorite
        rating: i % 4 === 0 ? ((i % 5) + 1) * 20 : null,
        image_count: i * 25,
      })
    );
  }

  return galleries;
}

/**
 * Create an array of mock scenes with various characteristics and relationships
 */
export function createMockScenes(
  count: number,
  performers: NormalizedPerformer[],
  studios: NormalizedStudio[],
  tags: NormalizedTag[],
  groups: NormalizedGroup[]
): NormalizedScene[] {
  const scenes: NormalizedScene[] = [];

  for (let i = 0; i < count; i++) {
    // Assign 1-3 random performers
    const performerCount = (i % 3) + 1;
    const scenePerformers = [];
    for (let j = 0; j < performerCount && j < performers.length; j++) {
      scenePerformers.push(performers[(i + j) % performers.length]);
    }

    // Assign a studio (or null for some scenes)
    const studio = i % 10 === 0 ? null : studios[i % studios.length];

    // Assign 1-5 random tags
    const tagCount = (i % 5) + 1;
    const sceneTags = [];
    for (let j = 0; j < tagCount && j < tags.length; j++) {
      sceneTags.push(tags[(i + j) % tags.length]);
    }

    // Assign 0-2 random groups
    const groupCount = i % 3;
    const sceneGroups = [];
    for (let j = 0; j < groupCount && j < groups.length; j++) {
      const g = groups[(i + j) % groups.length];
      const groupWithIndex: GroupRef & { scene_index: number } = {
        id: g.id,
        instanceId: g.instanceId,
        name: g.name,
        front_image_path: g.front_image_path,
        back_image_path: g.back_image_path,
        scene_index: j,
      };
      sceneGroups.push(groupWithIndex);
    }

    scenes.push(
      createMockScene({
        id: `scene_${i}`,
        instanceId: "default",
        title: `Scene ${i}`,
        details: i % 2 === 0 ? `Details for scene ${i}` : null,
        performers: scenePerformers,
        studio: studio,
        tags: sceneTags,
        groups: sceneGroups,
        favorite: i % 10 === 0,
        rating100: i % 4 === 0 ? ((i % 5) + 1) * 20 : null,
        o_counter: i % 5 === 0 ? i : 0,
        play_count: i * 2,
        play_duration: i * 300,
        files: [
          {
            path: `/path/to/scene_${i}.mp4`,
            duration: (i + 1) * 600, // 10 minutes * (i+1)
            video_codec: "h264",
            audio_codec: "aac",
            width: i % 2 === 0 ? 1920 : 1280,
            height: i % 2 === 0 ? 1080 : 720,
            frame_rate: i % 3 === 0 ? 60 : 30,
            bit_rate: (i + 1) * 5000000,
            size: (i + 1) * 1000000000,
          },
        ],
        created_at: new Date(Date.now() - i * 86400000).toISOString(),
        updated_at: new Date(Date.now() - i * 43200000).toISOString(),
        last_played_at:
          i % 3 === 0
            ? new Date(Date.now() - i * 3600000).toISOString()
            : null,
      })
    );
  }

  return scenes;
}
