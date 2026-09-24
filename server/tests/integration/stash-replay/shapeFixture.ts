/**
 * Hand-built recorded shapes for the fixture generator tests (sweep item
 * 83), in the format fixtures:record writes to shape.json: ids, relations,
 * presence and lengths, and no values.
 *
 * testStashShape() is a 16-scene graph shaped like the owner's test Stash
 * (the links only, which shape.json publishes too): 16 scenes, 11
 * performers, 10 studios, 11 tags, 1 group, 2 galleries, 6 images and no
 * markers. Performer 100006 has the most scenes (3); studio 100003 has a
 * parent; tags 100009 and 100011 have parent 100005; images 100004-100006
 * are in gallery 100001, only 100005 with a tag of its own.
 */
import type { EntityType } from "../../../integration/stash-replay/library.js";
import {
  RELATIONS,
  fieldPaths,
  loadSelections,
} from "../../../integration/stash-replay/selections.js";
import type {
  EntityShape,
  FileShape,
  RecordedShape,
  RelationShape,
} from "../../../integration/stash-replay/synth.js";

const FIELDS = fieldPaths(loadSelections());

/** Non-entity lists: the recorder stores their lengths, not presence. */
const LIST_FIELDS = new Set([
  "urls",
  "alias_list",
  "stash_ids",
  "captions",
  "sceneStreams",
  "chapters",
]);

/** The scalar leaves of a type's recorded fields ("title", "paths.webp"). */
function scalarPaths(type: EntityType): string[] {
  return FIELDS[type].filter((path) => {
    const [root = ""] = path.split(".");
    if (root in RELATIONS[type] || root === "files") return false;
    if (LIST_FIELDS.has(root)) return false;
    // Studio and tag aliases are lists; a group's is a string
    return !(root === "aliases" && type !== "group");
  });
}

function fileFields(type: EntityType): string[] {
  return FIELDS[type]
    .filter((path) => path.startsWith("files.") && !path.includes(".", 6))
    .map((path) => path.slice("files.".length))
    .filter((field) => field !== "fingerprints");
}

function fixtureId(sourceId: number): string {
  return String(100000 + sourceId);
}

interface EntityOptions {
  relations?: Record<string, number[]>;
  absent?: string[];
  lengths?: Record<string, number>;
  files?: number;
  fingerprints?: string[];
}

function entity(
  type: EntityType,
  sourceId: number,
  options: EntityOptions = {}
): EntityShape {
  const absent = new Set(options.absent ?? []);
  const relations: Record<string, RelationShape[]> = {};
  for (const [field, ids] of Object.entries(options.relations ?? {})) {
    relations[field] = ids.map((id) =>
      type === "scene" && field === "groups"
        ? { id: fixtureId(id), present: ["scene_index"] }
        : { id: fixtureId(id) }
    );
  }
  const shape: EntityShape = {
    id: fixtureId(sourceId),
    present: scalarPaths(type).filter((path) => !absent.has(path)),
    relations,
    lengths: options.lengths ?? {},
  };
  if (options.files !== undefined) {
    const file: FileShape = {
      present: fileFields(type),
      fingerprints: options.fingerprints ?? [],
    };
    shape.files = Array.from({ length: options.files }, () =>
      structuredClone(file)
    );
  }
  return shape;
}

interface SceneLinks {
  studio?: number;
  performers?: number[];
  tags?: number[];
  groups?: number[];
  galleries?: number[];
}

const SCENES: Array<[number, SceneLinks]> = [
  [
    1,
    {
      studio: 7,
      performers: [6],
      tags: [1, 3, 4],
      groups: [1],
      galleries: [1],
    },
  ],
  [2, { studio: 7, performers: [7], tags: [1, 3], groups: [1] }],
  [
    3,
    {
      studio: 7,
      performers: [6, 7],
      tags: [1, 3, 5],
      groups: [1],
      galleries: [1],
    },
  ],
  [4, { studio: 10, performers: [10, 11] }],
  [5, { studio: 9, performers: [8, 9] }],
  [6, { studio: 1, performers: [1, 2] }],
  [7, { studio: 3, performers: [3, 4] }],
  [8, { studio: 4, performers: [5] }],
  [9, { studio: 8 }],
  [10, { studio: 5, performers: [6], tags: [2, 3] }],
  [11, { studio: 5, tags: [2, 3] }],
  [12, { studio: 6, tags: [2, 3, 4] }],
  [13, { studio: 5, tags: [1, 2, 3] }],
  [14, { studio: 5, tags: [3] }],
  [15, { studio: 6, tags: [3] }],
  [16, { studio: 5, tags: [3, 5] }],
];

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** A fresh copy on every call, so a test may change its own. */
export function testStashShape(): RecordedShape {
  const scene = SCENES.map(([id, links]) =>
    entity("scene", id, {
      relations: {
        studio: links.studio === undefined ? [] : [links.studio],
        performers: links.performers ?? [],
        tags: links.tags ?? [],
        groups: links.groups ?? [],
        galleries: links.galleries ?? [],
      },
      absent: ["rating100", "code", "director"],
      lengths: { urls: 1, captions: 0, sceneStreams: 9 },
      files: 1,
      fingerprints: ["oshash", "phash"],
    })
  );

  const performerTags: Record<number, number[]> = { 6: [3], 7: [4] };
  const performer = range(1, 11).map((id) => {
    const testPerformer = id === 6 || id === 7;
    return entity("performer", id, {
      relations: { tags: performerTags[id] ?? [] },
      absent: [
        "death_date",
        "circumcised",
        "penis_length",
        ...(testPerformer ? ["birthdate"] : []),
      ],
      lengths: {
        alias_list: testPerformer ? 0 : 1,
        urls: 1,
        stash_ids: testPerformer ? 0 : 1,
      },
    });
  });

  const studio = range(1, 10).map((id) =>
    entity("studio", id, {
      relations: {
        parent_studio: id === 3 ? [2] : [],
        child_studios: id === 2 ? [3] : [],
        groups: [],
        movies: [],
        tags: id === 7 ? [3] : [],
      },
      absent: ["details", "rating100"],
      lengths: { aliases: 0, stash_ids: 0 },
    })
  );

  const tag = range(1, 11).map((id) =>
    entity("tag", id, {
      relations: {
        parents: id === 9 || id === 11 ? [5] : [],
        children: id === 5 ? [9, 11] : [],
      },
      absent: ["description"],
      lengths: { aliases: 0, stash_ids: 0 },
    })
  );

  const group = [
    entity("group", 1, {
      relations: {
        studio: [],
        tags: [3],
        containing_groups: [],
        sub_groups: [],
      },
      absent: [
        "aliases",
        "duration",
        "date",
        "director",
        "synopsis",
        "rating100",
        "back_image_path",
      ],
      lengths: { urls: 0 },
    }),
  ];

  const galleryAbsent = [
    "code",
    "details",
    "photographer",
    "rating100",
    "date",
  ];
  const gallery = [
    entity("gallery", 1, {
      relations: {
        studio: [7],
        performers: [6],
        tags: [3],
        scenes: [1, 3],
        cover: [4],
      },
      absent: galleryAbsent,
      lengths: { urls: 0, chapters: 0 },
      files: 0,
    }),
    entity("gallery", 2, {
      relations: {
        studio: [],
        performers: [],
        tags: [4],
        scenes: [],
        cover: [1],
      },
      absent: galleryAbsent,
      lengths: { urls: 0, chapters: 0 },
      files: 0,
    }),
  ];

  const image = range(1, 6).map((id) =>
    entity("image", id, {
      relations: {
        galleries: id <= 3 ? [2] : [1],
        studio: [],
        tags: id === 5 ? [1] : [],
        performers: [],
      },
      absent: ["code", "details", "photographer", "rating100", "date"],
      lengths: { urls: 0 },
      files: 1,
    })
  );

  return {
    fields: structuredClone(FIELDS),
    entities: {
      scene,
      performer,
      studio,
      tag,
      group,
      gallery,
      image,
      clip: [],
    },
  };
}

/** The ids of the owner's hand-picked test entities, as fixture ids. */
export const OWNER_TEST_ENTITIES = {
  sceneWithRelations: "100003",
  performerWithScenes: "100006",
  studioWithScenes: "100005",
  tagWithEntities: "100003",
  groupWithScenes: "100001",
  sceneInGroup: "100001",
  galleryWithImages: "100001",
  galleryWithScenes: "100001",
  restrictableTag: "100001",
  galleryPerformerForInheritance: "100006",
  imageWithGalleryInheritance: "100004",
  imageWithOwnProperties: "100005",
  sceneWithInheritedTags: "100002",
  inheritedTagFromPerformerOrStudio: "",
};
