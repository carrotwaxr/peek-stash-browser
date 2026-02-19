/**
 * Schema Tests
 *
 * Verify Zod schemas accept valid data and reject invalid data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  SceneSchema,
  PerformerSchema,
  TagSchema,
  StudioSchema,
  GallerySchema,
  ImageSchema,
  GroupSchema,
  PerformerRefSchema,
  StudioRefSchema,
  TagRefSchema,
  GroupRefSchema,
  GalleryRefSchema,
  ApiErrorResponseSchema,
  ApiSuccessResponseSchema,
  CacheNotReadyResponseSchema,
  PaginationMetaSchema,
} from "../../schemas/index.js";
import {
  validateResponse,
  safeValidateResponse,
  validateArrayResponse,
} from "../../utils/schemaValidation.js";
import { logger } from "../../utils/logger.js";

describe("Reference Schemas", () => {
  describe("PerformerRefSchema", () => {
    it("validates correct performer ref", () => {
      const valid = {
        id: "123",
        name: "Test Performer",
        image_path: "/api/proxy/stash?path=/performer/123",
        gender: "FEMALE",
        disambiguation: null,
      };
      expect(() => PerformerRefSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing required fields", () => {
      const invalid = { id: "123" };
      expect(() => PerformerRefSchema.parse(invalid)).toThrow();
    });

    it("accepts null for nullable fields", () => {
      const valid = {
        id: "123",
        name: "Test Performer",
        image_path: null,
        gender: null,
        disambiguation: null,
      };
      expect(() => PerformerRefSchema.parse(valid)).not.toThrow();
    });
  });

  describe("StudioRefSchema", () => {
    it("validates correct studio ref", () => {
      const valid = {
        id: "456",
        name: "Test Studio",
        image_path: null,
      };
      expect(() => StudioRefSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing name", () => {
      const invalid = { id: "456", image_path: null };
      expect(() => StudioRefSchema.parse(invalid)).toThrow();
    });
  });

  describe("TagRefSchema", () => {
    it("validates correct tag ref", () => {
      const valid = {
        id: "789",
        name: "Test Tag",
        image_path: "/api/proxy/stash?path=/tag/789",
      };
      expect(() => TagRefSchema.parse(valid)).not.toThrow();
    });

    it("accepts null image_path", () => {
      const valid = {
        id: "789",
        name: "Test Tag",
        image_path: null,
      };
      expect(() => TagRefSchema.parse(valid)).not.toThrow();
    });
  });

  describe("GroupRefSchema", () => {
    it("validates correct group ref", () => {
      const valid = {
        id: "101",
        instanceId: "instance-1",
        name: "Test Group",
        front_image_path: "/api/proxy/stash?path=/group/101",
      };
      expect(() => GroupRefSchema.parse(valid)).not.toThrow();
    });

    it("accepts null front_image_path", () => {
      const valid = {
        id: "101",
        instanceId: "instance-1",
        name: "Test Group",
        front_image_path: null,
      };
      expect(() => GroupRefSchema.parse(valid)).not.toThrow();
    });
  });

  describe("GalleryRefSchema", () => {
    it("validates correct gallery ref", () => {
      const valid = {
        id: "202",
        instanceId: "instance-1",
        title: "Test Gallery",
        cover: "/api/proxy/stash?path=/gallery/202/cover",
        image_count: 25,
      };
      expect(() => GalleryRefSchema.parse(valid)).not.toThrow();
    });

    it("accepts null for all nullable fields", () => {
      const valid = {
        id: "202",
        instanceId: "instance-1",
        title: null,
        cover: null,
        image_count: null,
      };
      expect(() => GalleryRefSchema.parse(valid)).not.toThrow();
    });
  });
});

describe("Entity Schemas", () => {
  describe("SceneSchema", () => {
    const validScene = {
      id: "1",
      title: "Test Scene",
      code: "TEST001",
      details: "Description",
      director: "Director",
      date: "2024-01-15",
      duration: 1800,
      organized: true,
      rating100: 80,
      paths: {
        screenshot: "/api/proxy/stash?path=/screenshot/1",
        preview: null,
        sprite: null,
        vtt: null,
        stream: null,
        webp: null,
        funscript: null,
        caption: null,
        interactive_heatmap: null,
      },
      sceneStreams: [],
      studio: { id: "1", name: "Studio", image_path: null },
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
      files: [],
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-15T10:00:00Z",
      rating: 4,
      favorite: true,
      o_counter: 5,
      play_count: 10,
      play_duration: 3600,
      resume_time: 500,
      play_history: [],
      o_history: [],
      last_played_at: "2024-01-15T10:00:00Z",
      last_o_at: null,
    };

    it("validates complete scene", () => {
      expect(() => SceneSchema.parse(validScene)).not.toThrow();
    });

    it("validates scene with null optional fields", () => {
      const sceneWithNulls = {
        ...validScene,
        title: null,
        code: null,
        studio: null,
        paths: null,
      };
      expect(() => SceneSchema.parse(sceneWithNulls)).not.toThrow();
    });

    it("rejects scene with wrong type for id", () => {
      const invalid = { ...validScene, id: 123 };
      expect(() => SceneSchema.parse(invalid)).toThrow();
    });

    it("validates scene with performers and tags", () => {
      const sceneWithRelations = {
        ...validScene,
        performers: [
          {
            id: "p1",
            name: "Performer 1",
            image_path: null,
            gender: "FEMALE",
            disambiguation: null,
          },
        ],
        tags: [{ id: "t1", name: "Tag 1", image_path: null }],
      };
      expect(() => SceneSchema.parse(sceneWithRelations)).not.toThrow();
    });

    it("validates scene with groups including scene_index", () => {
      const sceneWithGroups = {
        ...validScene,
        groups: [
          {
            id: "g1",
            instanceId: "instance-1",
            name: "Group 1",
            front_image_path: null,
            scene_index: 5,
          },
        ],
      };
      expect(() => SceneSchema.parse(sceneWithGroups)).not.toThrow();
    });

    it("validates scene with files", () => {
      const sceneWithFiles = {
        ...validScene,
        files: [
          {
            id: "f1",
            path: "/path/to/video.mp4",
            size: 1000000000,
            duration: 1800,
            width: 1920,
            height: 1080,
            bit_rate: 5000000,
            frame_rate: 30,
            video_codec: "h264",
            audio_codec: "aac",
          },
        ],
      };
      expect(() => SceneSchema.parse(sceneWithFiles)).not.toThrow();
    });

    it("validates scene with optional inherited tags", () => {
      const sceneWithInheritedTags = {
        ...validScene,
        inheritedTagIds: ["t1", "t2"],
        inheritedTags: [
          { id: "t1", name: "Inherited Tag 1" },
          { id: "t2", name: "Inherited Tag 2" },
        ],
      };
      expect(() => SceneSchema.parse(sceneWithInheritedTags)).not.toThrow();
    });
  });

  describe("PerformerSchema", () => {
    const validPerformer = {
      id: "1",
      name: "Test Performer",
      disambiguation: null,
      gender: "FEMALE",
      birthdate: "1990-01-01",
      death_date: null,
      country: "US",
      ethnicity: null,
      eye_color: "Brown",
      hair_color: "Black",
      height_cm: 165,
      weight: null,
      measurements: "34-24-36",
      fake_tits: null,
      penis_length: null,
      circumcised: null,
      tattoos: "Left arm",
      piercings: null,
      career_length: "2010-",
      details: "Bio here",
      image_path: "/api/proxy/stash?path=/performer/1",
      aliases: ["Alias 1"],
      urls: ["https://example.com"],
      tags: [],
      scene_count: 50,
      image_count: 100,
      gallery_count: 10,
      group_count: 5,
      performer_count: null,
      o_counter: 25,
      rating100: 90,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
      rating: 5,
      favorite: true,
      play_count: 100,
      last_played_at: "2024-01-15T00:00:00Z",
      last_o_at: null,
    };

    it("validates complete performer", () => {
      expect(() => PerformerSchema.parse(validPerformer)).not.toThrow();
    });

    it("validates performer with minimal data", () => {
      const minimalPerformer = {
        id: "1",
        name: "Test Performer",
        disambiguation: null,
        gender: null,
        birthdate: null,
        death_date: null,
        country: null,
        ethnicity: null,
        eye_color: null,
        hair_color: null,
        height_cm: null,
        weight: null,
        measurements: null,
        fake_tits: null,
        penis_length: null,
        circumcised: null,
        tattoos: null,
        piercings: null,
        career_length: null,
        details: null,
        image_path: null,
        aliases: null,
        urls: null,
        tags: [],
        scene_count: null,
        image_count: null,
        gallery_count: null,
        group_count: null,
        performer_count: null,
        o_counter: null,
        rating100: null,
        created_at: null,
        updated_at: null,
        rating: null,
        favorite: false,
        play_count: 0,
        last_played_at: null,
        last_o_at: null,
      };
      expect(() => PerformerSchema.parse(minimalPerformer)).not.toThrow();
    });

    it("validates performer with tags", () => {
      const performerWithTags = {
        ...validPerformer,
        tags: [{ id: "t1", name: "Tag 1", image_path: null }],
      };
      expect(() => PerformerSchema.parse(performerWithTags)).not.toThrow();
    });

    it("rejects performer with missing name", () => {
      const { name, ...invalidPerformer } = validPerformer;
      expect(() => PerformerSchema.parse(invalidPerformer)).toThrow();
    });
  });

  describe("TagSchema", () => {
    const validTag = {
      id: "1",
      name: "Test Tag",
      description: "Tag description",
      ignore_auto_tag: false,
      image_path: null,
      parents: [],
      children: [{ id: "2", name: "Child Tag" }],
      scene_count: 100,
      image_count: 50,
      gallery_count: 10,
      performer_count: 5,
      studio_count: 2,
      group_count: 1,
      scene_count_via_performers: 150,
      rating100: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
      rating: null,
      favorite: false,
      o_counter: 0,
      play_count: 0,
    };

    it("validates complete tag", () => {
      expect(() => TagSchema.parse(validTag)).not.toThrow();
    });

    it("validates tag with parents and children", () => {
      const tagWithHierarchy = {
        ...validTag,
        parents: [{ id: "p1", name: "Parent Tag" }],
        children: [
          { id: "c1", name: "Child 1" },
          { id: "c2", name: "Child 2" },
        ],
      };
      expect(() => TagSchema.parse(tagWithHierarchy)).not.toThrow();
    });

    it("rejects tag with wrong type for ignore_auto_tag", () => {
      const invalid = { ...validTag, ignore_auto_tag: "yes" };
      expect(() => TagSchema.parse(invalid)).toThrow();
    });
  });

  describe("StudioSchema", () => {
    const validStudio = {
      id: "1",
      name: "Test Studio",
      details: "Studio description",
      url: "https://example.com",
      ignore_auto_tag: false,
      image_path: "/api/proxy/stash?path=/studio/1",
      parent_studio: null,
      child_studios: [],
      tags: [],
      scene_count: 100,
      image_count: 50,
      gallery_count: 10,
      performer_count: 20,
      group_count: 5,
      rating100: 85,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
      rating: 4,
      favorite: true,
      o_counter: 10,
      play_count: 50,
    };

    it("validates complete studio", () => {
      expect(() => StudioSchema.parse(validStudio)).not.toThrow();
    });

    it("validates studio with parent and children", () => {
      const studioWithHierarchy = {
        ...validStudio,
        parent_studio: { id: "p1", name: "Parent Studio", image_path: null },
        child_studios: [
          { id: "c1", name: "Child Studio 1", image_path: null },
          { id: "c2", name: "Child Studio 2", image_path: "/path" },
        ],
      };
      expect(() => StudioSchema.parse(studioWithHierarchy)).not.toThrow();
    });

    it("validates studio with tags", () => {
      const studioWithTags = {
        ...validStudio,
        tags: [{ id: "t1", name: "Tag 1", image_path: null }],
      };
      expect(() => StudioSchema.parse(studioWithTags)).not.toThrow();
    });
  });

  describe("GallerySchema", () => {
    const validGallery = {
      id: "1",
      title: "Test Gallery",
      code: "GAL001",
      details: "Gallery description",
      photographer: "Photographer Name",
      date: "2024-01-15",
      organized: true,
      cover: "/api/proxy/stash?path=/gallery/1/cover",
      paths: {
        cover: "/api/proxy/stash?path=/gallery/1/cover",
      },
      folder: { path: "/path/to/gallery" },
      files: [{ path: "/path/to/file.zip" }],
      studio: { id: "1", name: "Studio", image_path: null },
      performers: [],
      tags: [],
      scenes: [{ id: "s1", title: "Scene 1" }],
      image_count: 25,
      rating100: 80,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
      rating: 4,
      favorite: false,
    };

    it("validates complete gallery", () => {
      expect(() => GallerySchema.parse(validGallery)).not.toThrow();
    });

    it("validates gallery with null optional fields", () => {
      const galleryWithNulls = {
        ...validGallery,
        title: null,
        code: null,
        details: null,
        photographer: null,
        date: null,
        cover: null,
        paths: null,
        folder: null,
        studio: null,
        image_count: null,
        rating100: null,
        created_at: null,
        updated_at: null,
        rating: null,
      };
      expect(() => GallerySchema.parse(galleryWithNulls)).not.toThrow();
    });

    it("validates gallery with performers and tags", () => {
      const galleryWithRelations = {
        ...validGallery,
        performers: [
          {
            id: "p1",
            name: "Performer 1",
            image_path: null,
            gender: null,
            disambiguation: null,
          },
        ],
        tags: [{ id: "t1", name: "Tag 1", image_path: null }],
      };
      expect(() => GallerySchema.parse(galleryWithRelations)).not.toThrow();
    });
  });

  describe("ImageSchema", () => {
    const validImage = {
      id: "1",
      title: "Test Image",
      code: "IMG001",
      details: "Image description",
      photographer: "Photographer Name",
      date: "2024-01-15",
      organized: true,
      paths: {
        thumbnail: "/api/proxy/stash?path=/image/1/thumbnail",
        preview: null,
        image: "/api/proxy/stash?path=/image/1",
      },
      files: [{ path: "/path/to/image.jpg", size: 1000000, width: 1920, height: 1080 }],
      visual_files: [{ width: 1920, height: 1080 }],
      studio: { id: "1", name: "Studio", image_path: null },
      performers: [],
      tags: [],
      galleries: [],
      rating100: 80,
      o_counter: 5,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
      rating: 4,
      favorite: false,
      oCounter: 5,
      viewCount: 10,
      lastViewedAt: "2024-01-15T00:00:00Z",
    };

    it("validates complete image", () => {
      expect(() => ImageSchema.parse(validImage)).not.toThrow();
    });

    it("validates image with null optional fields", () => {
      const imageWithNulls = {
        ...validImage,
        title: null,
        code: null,
        details: null,
        photographer: null,
        date: null,
        paths: null,
        studio: null,
        rating100: null,
        o_counter: null,
        created_at: null,
        updated_at: null,
        rating: null,
        lastViewedAt: null,
      };
      expect(() => ImageSchema.parse(imageWithNulls)).not.toThrow();
    });

    it("validates image with galleries", () => {
      const imageWithGalleries = {
        ...validImage,
        galleries: [{ id: "g1", instanceId: "instance-1", title: "Gallery 1", cover: null, image_count: 10 }],
      };
      expect(() => ImageSchema.parse(imageWithGalleries)).not.toThrow();
    });
  });

  describe("GroupSchema", () => {
    const validGroup = {
      id: "1",
      name: "Test Group",
      aliases: "Alias 1, Alias 2",
      director: "Director Name",
      description: "Group description",
      date: "2024-01-15",
      duration: 7200,
      front_image_path: "/api/proxy/stash?path=/group/1/front",
      back_image_path: "/api/proxy/stash?path=/group/1/back",
      studio: { id: "1", name: "Studio", image_path: null },
      tags: [],
      containing_groups: [],
      sub_groups: [],
      scene_count: 10,
      rating100: 85,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
      rating: 4,
      favorite: true,
    };

    it("validates complete group", () => {
      expect(() => GroupSchema.parse(validGroup)).not.toThrow();
    });

    it("validates group with null optional fields", () => {
      const groupWithNulls = {
        ...validGroup,
        aliases: null,
        director: null,
        description: null,
        date: null,
        duration: null,
        front_image_path: null,
        back_image_path: null,
        studio: null,
        scene_count: null,
        rating100: null,
        created_at: null,
        updated_at: null,
        rating: null,
      };
      expect(() => GroupSchema.parse(groupWithNulls)).not.toThrow();
    });

    it("validates group with containing and sub groups", () => {
      const groupWithHierarchy = {
        ...validGroup,
        containing_groups: [{ group: { id: "cg1", name: "Containing Group" } }],
        sub_groups: [
          { group: { id: "sg1", name: "Sub Group 1" } },
          { group: { id: "sg2", name: "Sub Group 2" } },
        ],
      };
      expect(() => GroupSchema.parse(groupWithHierarchy)).not.toThrow();
    });

    it("validates group with tags", () => {
      const groupWithTags = {
        ...validGroup,
        tags: [{ id: "t1", name: "Tag 1", image_path: null }],
      };
      expect(() => GroupSchema.parse(groupWithTags)).not.toThrow();
    });
  });
});

describe("Schema stripping", () => {
  it("SceneSchema.strip() removes extra fields", () => {
    const sceneWithExtra = {
      id: "1",
      title: "Test",
      code: null,
      details: null,
      director: null,
      date: null,
      duration: null,
      organized: false,
      rating100: null,
      paths: null,
      sceneStreams: [],
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
      files: [],
      created_at: null,
      updated_at: null,
      rating: null,
      favorite: false,
      o_counter: 0,
      play_count: 0,
      play_duration: 0,
      resume_time: 0,
      play_history: [],
      o_history: [],
      last_played_at: null,
      last_o_at: null,
      // Extra field that should be stripped
      internalSecret: "should-not-appear",
    };

    const result = SceneSchema.strip().parse(sceneWithExtra);
    expect(result).not.toHaveProperty("internalSecret");
    expect(result.id).toBe("1");
  });

  it("PerformerSchema.strip() removes extra fields", () => {
    const performerWithExtra = {
      id: "1",
      name: "Test Performer",
      disambiguation: null,
      gender: null,
      birthdate: null,
      death_date: null,
      country: null,
      ethnicity: null,
      eye_color: null,
      hair_color: null,
      height_cm: null,
      weight: null,
      measurements: null,
      fake_tits: null,
      penis_length: null,
      circumcised: null,
      tattoos: null,
      piercings: null,
      career_length: null,
      details: null,
      image_path: null,
      aliases: null,
      urls: null,
      tags: [],
      scene_count: null,
      image_count: null,
      gallery_count: null,
      group_count: null,
      performer_count: null,
      o_counter: null,
      rating100: null,
      created_at: null,
      updated_at: null,
      rating: null,
      favorite: false,
      play_count: 0,
      last_played_at: null,
      last_o_at: null,
      // Extra field that should be stripped
      secretData: "should-not-appear",
    };

    const result = PerformerSchema.strip().parse(performerWithExtra);
    expect(result).not.toHaveProperty("secretData");
    expect(result.id).toBe("1");
    expect(result.name).toBe("Test Performer");
  });
});

describe("Type coercion", () => {
  it("SceneSchema coerces o_history dates", () => {
    const sceneWithDateStrings = {
      id: "1",
      title: "Test",
      code: null,
      details: null,
      director: null,
      date: null,
      duration: null,
      organized: false,
      rating100: null,
      paths: null,
      sceneStreams: [],
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
      files: [],
      created_at: null,
      updated_at: null,
      rating: null,
      favorite: false,
      o_counter: 0,
      play_count: 0,
      play_duration: 0,
      resume_time: 0,
      play_history: [],
      o_history: ["2024-01-15T10:00:00Z", "2024-01-16T10:00:00Z"],
      last_played_at: null,
      last_o_at: null,
    };

    const result = SceneSchema.parse(sceneWithDateStrings);
    expect(result.o_history).toHaveLength(2);
    expect(result.o_history[0]).toBeInstanceOf(Date);
    expect(result.o_history[1]).toBeInstanceOf(Date);
  });
});

describe("API Response Schemas", () => {
  describe("ApiErrorResponseSchema", () => {
    it("validates error with required fields only", () => {
      const valid = { error: "Something went wrong" };
      expect(() => ApiErrorResponseSchema.parse(valid)).not.toThrow();
    });

    it("validates error with all optional fields", () => {
      const valid = {
        error: "Something went wrong",
        message: "Detailed message",
        details: "Stack trace or additional info",
        errorType: "ValidationError",
      };
      expect(() => ApiErrorResponseSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing error field", () => {
      const invalid = { message: "Just a message" };
      expect(() => ApiErrorResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe("ApiSuccessResponseSchema", () => {
    it("validates success response without message", () => {
      const valid = { success: true };
      expect(() => ApiSuccessResponseSchema.parse(valid)).not.toThrow();
    });

    it("validates success response with message", () => {
      const valid = { success: true, message: "Operation completed" };
      expect(() => ApiSuccessResponseSchema.parse(valid)).not.toThrow();
    });

    it("rejects success: false (literal validation)", () => {
      const invalid = { success: false };
      expect(() => ApiSuccessResponseSchema.parse(invalid)).toThrow();
    });

    it("rejects missing success field", () => {
      const invalid = { message: "No success field" };
      expect(() => ApiSuccessResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe("CacheNotReadyResponseSchema", () => {
    it("validates cache not ready response", () => {
      const valid = {
        error: "Cache not initialized",
        message: "Please wait for cache to warm up",
        ready: false,
      };
      expect(() => CacheNotReadyResponseSchema.parse(valid)).not.toThrow();
    });

    it("rejects ready: true (literal validation)", () => {
      const invalid = {
        error: "Cache ready",
        message: "All good",
        ready: true,
      };
      expect(() => CacheNotReadyResponseSchema.parse(invalid)).toThrow();
    });

    it("rejects missing required fields", () => {
      const invalid = { ready: false };
      expect(() => CacheNotReadyResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe("PaginationMetaSchema", () => {
    it("validates pagination metadata", () => {
      const valid = {
        page: 1,
        per_page: 25,
        total: 100,
        total_pages: 4,
      };
      expect(() => PaginationMetaSchema.parse(valid)).not.toThrow();
    });

    it("validates edge case with zero total", () => {
      const valid = {
        page: 1,
        per_page: 25,
        total: 0,
        total_pages: 0,
      };
      expect(() => PaginationMetaSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing fields", () => {
      const invalid = { page: 1, per_page: 25 };
      expect(() => PaginationMetaSchema.parse(invalid)).toThrow();
    });

    it("rejects non-numeric values", () => {
      const invalid = {
        page: "1",
        per_page: 25,
        total: 100,
        total_pages: 4,
      };
      expect(() => PaginationMetaSchema.parse(invalid)).toThrow();
    });
  });
});

describe("Validation Utilities", () => {
  // Simple test schema
  const TestSchema = z.object({
    id: z.string(),
    name: z.string(),
    value: z.number().optional(),
  });

  // Mock logger
  beforeEach(() => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validateResponse", () => {
    it("validates and returns correct data", () => {
      const data = { id: "1", name: "Test", value: 42 };
      const result = validateResponse(TestSchema, data, "test");
      expect(result).toEqual(data);
    });

    it("strips extra fields from data", () => {
      const data = { id: "1", name: "Test", extra: "should be removed" };
      const result = validateResponse(TestSchema, data, "test");
      expect(result).toEqual({ id: "1", name: "Test" });
      expect(result).not.toHaveProperty("extra");
    });

    it("throws ZodError for invalid data", () => {
      const data = { id: 123, name: "Test" }; // id should be string
      expect(() => validateResponse(TestSchema, data, "test")).toThrow();
    });

    it("logs error details on validation failure", () => {
      const data = { id: 123, name: "Test" };
      try {
        validateResponse(TestSchema, data, "test context");
      } catch {
        // Expected to throw
      }
      expect(logger.error).toHaveBeenCalledWith(
        "Schema validation failed for test context",
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: "id",
              code: expect.any(String),
            }),
          ]),
        })
      );
    });

    it("handles deeply nested validation errors", () => {
      const NestedSchema = z.object({
        user: z.object({
          profile: z.object({
            email: z.string().email(),
          }),
        }),
      });
      const data = { user: { profile: { email: "not-an-email" } } };
      try {
        validateResponse(NestedSchema, data, "nested");
      } catch {
        // Expected to throw
      }
      expect(logger.error).toHaveBeenCalledWith(
        "Schema validation failed for nested",
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: "user.profile.email",
            }),
          ]),
        })
      );
    });
  });

  describe("safeValidateResponse", () => {
    it("returns validated data on success", () => {
      const data = { id: "1", name: "Test" };
      const result = safeValidateResponse(TestSchema, data, "test");
      expect(result).toEqual(data);
    });

    it("returns null on validation failure", () => {
      const data = { id: 123, name: "Test" }; // id should be string
      const result = safeValidateResponse(TestSchema, data, "test");
      expect(result).toBeNull();
    });

    it("strips extra fields from valid data", () => {
      const data = { id: "1", name: "Test", secret: "hidden" };
      const result = safeValidateResponse(TestSchema, data, "test");
      expect(result).toEqual({ id: "1", name: "Test" });
      expect(result).not.toHaveProperty("secret");
    });

    it("logs error on failure (via validateResponse)", () => {
      const data = { id: 123 }; // Missing name, wrong id type
      safeValidateResponse(TestSchema, data, "safe test");
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("validateArrayResponse", () => {
    it("validates array of valid items", () => {
      const items = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
        { id: "3", name: "Item 3" },
      ];
      const result = validateArrayResponse(TestSchema, items, "items");
      expect(result).toHaveLength(3);
      expect(result).toEqual(items);
    });

    it("filters out invalid items", () => {
      const items = [
        { id: "1", name: "Valid 1" },
        { id: 123, name: "Invalid - wrong id type" }, // invalid
        { id: "3", name: "Valid 2" },
      ];
      const result = validateArrayResponse(TestSchema, items, "mixed items");
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", name: "Valid 1" });
      expect(result[1]).toEqual({ id: "3", name: "Valid 2" });
    });

    it("logs warning for each invalid item", () => {
      const items = [
        { id: 1 }, // invalid - missing name, wrong id type
        { name: "No ID" }, // invalid - missing id
      ];
      validateArrayResponse(TestSchema, items, "all invalid");
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        "Invalid item at index 0 in all invalid",
        expect.any(Object)
      );
      expect(logger.warn).toHaveBeenCalledWith(
        "Invalid item at index 1 in all invalid",
        expect.any(Object)
      );
    });

    it("strips extra fields from valid items", () => {
      const items = [
        { id: "1", name: "Item 1", extra: "remove me" },
        { id: "2", name: "Item 2", secret: "hidden" },
      ];
      const result = validateArrayResponse(TestSchema, items, "strip test");
      expect(result[0]).not.toHaveProperty("extra");
      expect(result[1]).not.toHaveProperty("secret");
    });

    it("returns empty array when all items invalid", () => {
      const items = [
        { id: 1 }, // invalid
        { id: 2 }, // invalid
      ];
      const result = validateArrayResponse(TestSchema, items, "all invalid");
      expect(result).toEqual([]);
    });

    it("handles empty array", () => {
      const result = validateArrayResponse(TestSchema, [], "empty");
      expect(result).toEqual([]);
    });
  });
});
