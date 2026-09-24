/**
 * A small hand-built replay library for the stash-replay unit tests (sweep
 * item 83). The generated fixture arrives with task INT-4; until then these
 * tests build their own, in the same shape: every entity a denormalised
 * tree, references carrying the referenced entity's id and name, and media
 * URLs under {{STASH_ORIGIN}}.
 *
 * Four scenes, ids 100001-100004. Scene 100002 is the newest
 * (2004-01-26T08:04:35+00:00); by updated_at the order is 100003, 100001,
 * 100004, 100002. Scene 100001 has captions, a group, a gallery and the clip.
 */
import type {
  Entity,
  ReplayLibrary,
} from "../../../integration/stash-replay/library.js";

const ORIGIN = "{{STASH_ORIGIN}}";

/** Scene id to its first file's duration and size, then an optional second file. */
const SCENE_FILES: Record<string, Array<{ duration: number; size: number }>> = {
  "100001": [{ duration: 20.125, size: 1000001 }],
  "100002": [{ duration: 15.75, size: 2000002 }],
  "100003": [{ duration: 30.5, size: 3000003 }],
  "100004": [
    { duration: 40.25, size: 4000004 },
    { duration: 900.5, size: 9000009 },
  ],
};

export const NEWEST_UPDATED_AT = "2004-01-26T08:04:35+00:00";

function tagRef(id: string) {
  return { id, name: `Tag ${id}` };
}

function performerRef(id: string, gender: string) {
  return {
    id,
    name: `Performer ${id}`,
    gender,
    image_path: `${ORIGIN}/performer/${id}/image?t=1072915200`,
  };
}

function studioRef(id: string) {
  return { id, name: `Studio ${id}` };
}

function scene(
  id: string,
  updatedAt: string,
  relations: {
    studio: string | null;
    performers: Array<[string, string]>;
    tags: string[];
    group: string | null;
    gallery: string | null;
    captions: boolean;
  }
): Entity {
  const files = (SCENE_FILES[id] ?? []).map((file, index) => ({
    path: `/library/videos/scene-${id}-${index}.webm`,
    basename: `scene-${id}-${index}.webm`,
    format: "webm",
    video_codec: "vp9",
    audio_codec: "opus",
    width: 431,
    height: 243,
    frame_rate: 23.456,
    bit_rate: 1234567,
    duration: file.duration,
    size: file.size,
    fingerprints: [
      { type: "oshash", value: `0a1b2c3d4e5f${id.slice(-4)}` },
      { type: "phash", value: `f0e1d2c3b4a5${id.slice(-4)}` },
    ],
  }));
  return {
    id,
    title: `Scene ${id}`,
    details: `Scene ${id} details`,
    rating100: id === "100001" ? 80 : null,
    created_at: "2003-01-05T10:00:00+00:00",
    updated_at: updatedAt,
    studio: relations.studio === null ? null : studioRef(relations.studio),
    performers: relations.performers.map(([pid, gender]) =>
      performerRef(pid, gender)
    ),
    tags: relations.tags.map(tagRef),
    groups:
      relations.group === null
        ? []
        : [
            {
              group: { id: relations.group, name: `Group ${relations.group}` },
              scene_index: 1,
            },
          ],
    galleries:
      relations.gallery === null
        ? []
        : [{ id: relations.gallery, title: `Gallery ${relations.gallery}` }],
    files,
    paths: {
      screenshot: `${ORIGIN}/scene/${id}/screenshot?t=1072915200`,
      preview: `${ORIGIN}/scene/${id}/preview`,
      webp: `${ORIGIN}/scene/${id}/webp`,
      vtt: `${ORIGIN}/scene/0a1b2c3d4e5f${id.slice(-4)}_thumbs.vtt`,
      sprite: `${ORIGIN}/scene/0a1b2c3d4e5f${id.slice(-4)}_sprite.jpg`,
      stream: null,
      caption: null,
    },
    captions: relations.captions
      ? [{ language_code: "en", caption_type: "vtt" }]
      : [],
    sceneStreams: [
      { label: "Direct stream" },
      { label: "WEBM Standard (480p)" },
      { label: "HLS Standard (480p)" },
    ],
  };
}

/** A fresh copy of the library on every call, so a test may change its own. */
export function fixtureLibrary(): ReplayLibrary {
  return {
    stash: {
      version: {
        version: "v0.0.0-replay",
        hash: "00000000",
        build_time: "2000-01-01 00:00:00",
      },
      configuration: {
        general: {
          stashes: [
            {
              path: "/library/videos",
              excludeVideo: false,
              excludeImage: true,
            },
            {
              path: "/library/images",
              excludeVideo: true,
              excludeImage: false,
            },
          ],
        },
      },
    },
    entities: {
      scene: [
        scene("100001", "2003-06-01T12:00:00+00:00", {
          studio: "100002",
          performers: [
            ["100001", "FEMALE"],
            ["100002", "MALE"],
          ],
          tags: ["100001"],
          group: "100001",
          gallery: "100001",
          captions: true,
        }),
        scene("100002", NEWEST_UPDATED_AT, {
          studio: "100001",
          performers: [["100001", "FEMALE"]],
          tags: [],
          group: null,
          gallery: null,
          captions: false,
        }),
        scene("100003", "2003-03-01T09:30:00+00:00", {
          studio: null,
          performers: [],
          tags: ["100002"],
          group: null,
          gallery: null,
          captions: false,
        }),
        scene("100004", "2003-09-09T18:45:10+00:00", {
          studio: "100002",
          performers: [["100002", "MALE"]],
          tags: [],
          group: null,
          gallery: null,
          captions: false,
        }),
      ],
      performer: [
        {
          ...performerRef("100001", "FEMALE"),
          birthdate: "1971-04-02",
          scene_count: 2,
          image_count: 2,
          tags: [tagRef("100001")],
          updated_at: "2003-02-02T08:00:00+00:00",
        },
        {
          ...performerRef("100002", "MALE"),
          birthdate: null,
          scene_count: 2,
          image_count: 0,
          tags: [],
          updated_at: "2003-02-03T08:00:00+00:00",
        },
      ],
      studio: [
        {
          ...studioRef("100001"),
          image_path: `${ORIGIN}/studio/100001/image?t=1072915200&default=true`,
          parent_studio: null,
          child_studios: [studioRef("100002")],
          scene_count: 1,
          updated_at: "2003-02-04T08:00:00+00:00",
        },
        {
          ...studioRef("100002"),
          image_path: `${ORIGIN}/studio/100002/image?t=1072915200&default=true`,
          parent_studio: studioRef("100001"),
          child_studios: [],
          scene_count: 2,
          updated_at: "2003-02-05T08:00:00+00:00",
        },
      ],
      tag: [
        {
          ...tagRef("100001"),
          image_path: `${ORIGIN}/tag/100001/image?t=1072915200&default=true`,
          parents: [],
          children: [tagRef("100002")],
          scene_count: 1,
          updated_at: "2003-02-06T08:00:00+00:00",
        },
        {
          ...tagRef("100002"),
          image_path: `${ORIGIN}/tag/100002/image?t=1072915200&default=true`,
          parents: [tagRef("100001")],
          children: [],
          scene_count: 1,
          updated_at: "2003-02-07T08:00:00+00:00",
        },
      ],
      group: [
        {
          id: "100001",
          name: "Group 100001",
          studio: studioRef("100002"),
          tags: [],
          scene_count: 1,
          front_image_path: `${ORIGIN}/group/100001/frontimage?t=1072915200`,
          back_image_path: `${ORIGIN}/group/100001/backimage?t=1072915200`,
          updated_at: "2003-02-08T08:00:00+00:00",
        },
      ],
      gallery: [
        {
          id: "100001",
          title: "Gallery 100001",
          image_count: 2,
          scenes: [{ id: "100001", title: "Scene 100001" }],
          performers: [performerRef("100001", "FEMALE")],
          cover: { id: "100001" },
          paths: {
            cover: `${ORIGIN}/gallery/100001/cover?t=1072915200`,
            preview: `${ORIGIN}/gallery/100001/preview/0`,
          },
          updated_at: "2003-02-09T08:00:00+00:00",
        },
      ],
      image: ["100001", "100002"].map((id) => ({
        id,
        title: `Image ${id}`,
        galleries: [{ id: "100001", title: "Gallery 100001" }],
        performers: [{ id: "100001", name: "Performer 100001" }],
        studio: null,
        tags: [],
        files: [
          {
            id,
            path: `/library/images/image-${id}.jpg`,
            basename: `image-${id}.jpg`,
            size: 54321,
            width: 319,
            height: 239,
          },
        ],
        paths: {
          thumbnail: `${ORIGIN}/image/${id}/thumbnail?t=1072915200`,
          preview: `${ORIGIN}/image/${id}/preview?t=1072915200`,
          image: `${ORIGIN}/image/${id}/image?t=1072915200`,
        },
        updated_at: "2003-02-10T08:00:00+00:00",
      })),
      clip: [
        {
          id: "100001",
          title: "Clip 100001",
          seconds: 1.25,
          end_seconds: null,
          scene: { id: "100001" },
          primary_tag: tagRef("100001"),
          tags: [],
          preview: `${ORIGIN}/scene/100001/scene_marker/100001/preview`,
          screenshot: `${ORIGIN}/scene/100001/scene_marker/100001/screenshot`,
          stream: `${ORIGIN}/scene/100001/scene_marker/100001/stream`,
          created_at: "2003-02-11T08:00:00+00:00",
          updated_at: "2003-02-11T08:00:00+00:00",
        },
      ],
    },
  };
}
