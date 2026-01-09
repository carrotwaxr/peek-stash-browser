/**
 * Mock Data Factory
 *
 * Creates realistic test data shaped by API types.
 * Use these factories to create test entities with sensible defaults
 * that can be overridden for specific test cases.
 *
 * IMPORTANT: These represent what the API SHOULD return, not necessarily
 * what the current code expects. Tests should validate correct behavior
 * against this contract.
 */

// ============================================================================
// ID Generation
// ============================================================================

let idCounter = 1;
export const resetIdCounter = () => {
  idCounter = 1;
};
export const nextId = () => String(idCounter++);

// ============================================================================
// Scene Factory
// ============================================================================

/**
 * Creates a mock scene object
 * @param {Partial<Scene>} overrides - Properties to override
 * @returns {Scene}
 */
export const createScene = (overrides = {}) => {
  const id = overrides.id ?? nextId();
  return {
    id,
    title: `Test Scene ${id}`,
    details: null,
    date: "2024-01-15",
    rating100: null,
    o_counter: 0,
    organized: false,
    interactive: false,
    interactive_speed: null,
    resume_time: 0,
    play_duration: 0,
    play_count: 0,
    last_played_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    code: null,
    director: null,
    urls: [],
    paths: {
      screenshot: `/screenshots/${id}.jpg`,
      preview: `/previews/${id}.mp4`,
      stream: `/stream/${id}`,
      webp: `/webp/${id}.webp`,
      vtt: `/vtt/${id}.vtt`,
      sprite: `/sprites/${id}.jpg`,
      funscript: null,
      interactive_heatmap: null,
      caption: null,
    },
    files: [
      {
        id: `file-${id}`,
        path: `/media/scenes/scene_${id}.mp4`,
        basename: `scene_${id}.mp4`,
        size: 1024 * 1024 * 500, // 500MB
        duration: 1800, // 30 minutes
        video_codec: "h264",
        audio_codec: "aac",
        width: 1920,
        height: 1080,
        frame_rate: 29.97,
        bit_rate: 5000000,
      },
    ],
    performers: [],
    tags: [],
    studio: null,
    groups: [],
    galleries: [],
    stash_ids: [],
    ...overrides,
  };
};

/**
 * Creates a scene with no title (should fall back to basename)
 */
export const createUntitledScene = (overrides = {}) => {
  return createScene({
    title: null,
    ...overrides,
  });
};

/**
 * Creates a scene with performers, studio, and tags
 */
export const createSceneWithRelations = (overrides = {}) => {
  const sceneId = overrides.id ?? nextId();
  return createScene({
    id: sceneId,
    performers: [createPerformer(), createPerformer()],
    studio: createStudio(),
    tags: [createTag(), createTag(), createTag()],
    ...overrides,
  });
};

// ============================================================================
// Performer Factory
// ============================================================================

/**
 * Creates a mock performer object
 * @param {Partial<Performer>} overrides - Properties to override
 * @returns {Performer}
 */
export const createPerformer = (overrides = {}) => {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Performer ${id}`,
    disambiguation: null,
    gender: "FEMALE",
    birthdate: "1990-05-15",
    ethnicity: null,
    country: "US",
    eye_color: null,
    hair_color: null,
    height_cm: 165,
    weight: null,
    measurements: null,
    fake_tits: null,
    penis_length: null,
    circumcised: null,
    tattoos: null,
    piercings: null,
    career_length: null,
    aliases: null,
    urls: [],
    twitter: null,
    instagram: null,
    favorite: false,
    rating100: null,
    details: null,
    death_date: null,
    ignore_auto_tag: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    scene_count: 5,
    image_count: 10,
    gallery_count: 2,
    group_count: 1,
    performer_count: 0,
    o_counter: 0,
    tags: [],
    stash_ids: [],
    image_path: `/performers/${id}/image.jpg`,
    ...overrides,
  };
};

// ============================================================================
// Studio Factory
// ============================================================================

/**
 * Creates a mock studio object
 * @param {Partial<Studio>} overrides - Properties to override
 * @returns {Studio}
 */
export const createStudio = (overrides = {}) => {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Studio ${id}`,
    url: `https://studio${id}.example.com`,
    parent_studio: null,
    child_studios: [],
    aliases: [],
    ignore_auto_tag: false,
    favorite: false,
    rating100: null,
    details: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    scene_count: 50,
    image_count: 100,
    gallery_count: 10,
    performer_count: 20,
    group_count: 5,
    stash_ids: [],
    image_path: `/studios/${id}/image.jpg`,
    tags: [],
    ...overrides,
  };
};

// ============================================================================
// Tag Factory
// ============================================================================

/**
 * Creates a mock tag object
 * @param {Partial<Tag>} overrides - Properties to override
 * @returns {Tag}
 */
export const createTag = (overrides = {}) => {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Tag ${id}`,
    description: null,
    aliases: [],
    ignore_auto_tag: false,
    favorite: false,
    image_path: null,
    parent_count: 0,
    child_count: 0,
    parents: [],
    children: [],
    scene_count: 25,
    scene_marker_count: 0,
    image_count: 50,
    gallery_count: 5,
    performer_count: 10,
    studio_count: 3,
    group_count: 2,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
};

// ============================================================================
// Group (Collection) Factory
// ============================================================================

/**
 * Creates a mock group object
 * @param {Partial<Group>} overrides - Properties to override
 * @returns {Group}
 */
export const createGroup = (overrides = {}) => {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Group ${id}`,
    aliases: null,
    duration: null,
    date: null,
    rating100: null,
    director: null,
    synopsis: null,
    urls: [],
    studio: null,
    tags: [],
    containing_groups: [],
    sub_groups: [],
    sub_group_count: 0,
    scene_count: 10,
    front_image_path: `/groups/${id}/front.jpg`,
    back_image_path: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
};

// ============================================================================
// Gallery Factory
// ============================================================================

/**
 * Creates a mock gallery object
 * @param {Partial<Gallery>} overrides - Properties to override
 * @returns {Gallery}
 */
export const createGallery = (overrides = {}) => {
  const id = overrides.id ?? nextId();
  return {
    id,
    title: `Gallery ${id}`,
    code: null,
    date: null,
    details: null,
    photographer: null,
    rating100: null,
    organized: false,
    urls: [],
    files: [],
    folder: null,
    scenes: [],
    studio: null,
    tags: [],
    performers: [],
    image_count: 20,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    cover: {
      id: `cover-${id}`,
      paths: {
        thumbnail: `/galleries/${id}/cover_thumb.jpg`,
        image: `/galleries/${id}/cover.jpg`,
      },
    },
    ...overrides,
  };
};

// ============================================================================
// Image Factory
// ============================================================================

/**
 * Creates a mock image object
 * @param {Partial<Image>} overrides - Properties to override
 * @returns {Image}
 */
export const createImage = (overrides = {}) => {
  const id = overrides.id ?? nextId();
  return {
    id,
    title: `Image ${id}`,
    code: null,
    date: null,
    details: null,
    photographer: null,
    rating100: null,
    organized: false,
    o_counter: 0,
    urls: [],
    files: [
      {
        id: `file-${id}`,
        path: `/media/images/image_${id}.jpg`,
        basename: `image_${id}.jpg`,
        size: 1024 * 1024 * 2, // 2MB
        width: 1920,
        height: 1080,
      },
    ],
    paths: {
      thumbnail: `/images/${id}/thumb.jpg`,
      image: `/images/${id}/full.jpg`,
      preview: `/images/${id}/preview.jpg`,
    },
    galleries: [],
    studio: null,
    tags: [],
    performers: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
};

/**
 * Creates an array of mock images
 * @param {number} count - Number of images to create
 * @param {Partial<Image>} overrides - Properties to override on all images
 * @returns {Image[]}
 */
export const createImages = (count, overrides = {}) => {
  return Array.from({ length: count }, () => createImage(overrides));
};

// ============================================================================
// Filter Preset Factory
// ============================================================================

/**
 * Creates a mock filter preset
 * @param {Partial<FilterPreset>} overrides - Properties to override
 * @returns {FilterPreset}
 */
export const createFilterPreset = (overrides = {}) => {
  const id = overrides.id ?? `preset-${nextId()}`;
  return {
    id,
    name: `Preset ${id}`,
    sort: "o_counter",
    direction: "DESC",
    filters: {},
    ...overrides,
  };
};

// ============================================================================
// API Response Factories
// ============================================================================

/**
 * Creates a paginated API response
 * @param {Array} items - The items to include
 * @param {object} options - Pagination options
 * @returns {object}
 */
export const createPaginatedResponse = (
  items,
  { totalCount = null } = {}
) => {
  const count = totalCount ?? items.length;
  return {
    count,
    items,
    // These match the shape returned by Peek's API
  };
};

/**
 * Creates a scene query response (matches findScenes shape)
 */
export const createSceneQueryResponse = (scenes, options = {}) => {
  return {
    findScenes: {
      count: options.totalCount ?? scenes.length,
      scenes,
    },
  };
};

/**
 * Creates a performer query response
 */
export const createPerformerQueryResponse = (performers, options = {}) => {
  return {
    findPerformers: {
      count: options.totalCount ?? performers.length,
      performers,
    },
  };
};

// ============================================================================
// Watch History Factory
// ============================================================================

/**
 * Creates a watch history entry
 */
export const createWatchHistoryEntry = (overrides = {}) => {
  const id = overrides.id ?? nextId();
  const scene = overrides.scene ?? createScene();
  return {
    id,
    sceneId: scene.id,
    scene,
    watchedAt: new Date().toISOString(),
    duration: 300, // 5 minutes watched
    completed: false,
    ...overrides,
  };
};

// ============================================================================
// Playlist Factory
// ============================================================================

/**
 * Creates a playlist object
 */
export const createPlaylist = (overrides = {}) => {
  const id = overrides.id ?? `playlist-${nextId()}`;
  const scenes = overrides.scenes ?? [createScene(), createScene(), createScene()];
  return {
    id,
    name: `Playlist ${id}`,
    scenes: scenes.map((scene, index) => ({
      sceneId: scene.id,
      scene,
      position: index,
    })),
    autoplayNext: false,
    shuffle: false,
    repeat: "none", // "none" | "one" | "all"
    ...overrides,
  };
};

/**
 * Creates a virtual playlist (from grid navigation)
 */
export const createVirtualPlaylist = (scenes, overrides = {}) => {
  return createPlaylist({
    id: `virtual-${nextId()}`,
    name: "Grid Results",
    scenes,
    ...overrides,
  });
};
