/**
 * Hand-built "raw Stash" answers for the recorder tests (sweep item 83):
 * what npm run fixtures:record would receive from a Stash whose links are a
 * recorded shape (testStashShape() in shapeFixture.ts), with made-up source
 * values of every kind a real library holds: titles, free text, file paths
 * and basenames, fingerprints, stash ids, dates and timestamps,
 * measurements, and media URLs with t= stamps. None of them is real, and
 * none can equal a synthetic value, so the recorder's guard stays clean.
 *
 * fakeStash() answers the recorder's queries from such a raw Stash with the
 * replay's own evaluation (queryRoot and project), so a query that selects
 * a field the raw Stash lacks fails, as it would against Stash.
 */
import {
  Kind,
  type OperationDefinitionNode,
  parse,
  valueFromASTUntyped,
} from "graphql";
import {
  type Entity,
  type EntityType,
  type ReplayLibrary,
  queryRoot,
} from "../../../integration/stash-replay/library.js";
import {
  project,
  selectedField,
} from "../../../integration/stash-replay/project.js";
import type {
  RawEntity,
  RawStash,
  StashRequest,
} from "../../../integration/stash-replay/record.js";
import {
  RELATIONS,
  type Relation,
} from "../../../integration/stash-replay/selections.js";
import type {
  EntityShape,
  FileShape,
  RecordedShape,
  RelationShape,
} from "../../../integration/stash-replay/synth.js";

/** A documentation-range address, standing for the test Stash's origin. */
export const RAW_ORIGIN = "http://192.0.2.10:9999";

const STREAM_LABELS = [
  "Direct stream",
  "MP4",
  "MP4 Full HD (1080p)",
  "MP4 HD (720p)",
  "WEBM",
  "WEBM Full HD (1080p)",
  "HLS",
  "HLS Full HD (1080p)",
  "DASH",
];

const FILE_EXTENSIONS: Partial<Record<EntityType, string>> = {
  scene: "mp4",
  image: "jpg",
  gallery: "zip",
};

function sourceId(fixtureId: string): number {
  return Number(fixtureId) - 100000;
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/** A t= stamp for a source entity: a 2024 epoch second. */
function stamp(n: number): number {
  return 1712000000 + n;
}

/** A source value for a scalar field, or a leaf of an object field. */
function scalar(type: EntityType, n: number, path: string): unknown {
  const leaf = path.split(".").pop() ?? path;
  switch (leaf) {
    case "id":
      return String(n);
    case "date":
    case "death_date":
      return `20${16 + (n % 5)}-0${1 + (n % 9)}-1${n % 10}`;
    case "birthdate":
      return `199${n % 10}-0${1 + (n % 9)}-2${n % 9}`;
    case "created_at":
      return `2024-0${1 + (n % 9)}-1${n % 10}T10:11:12-07:00`;
    case "updated_at":
      return `2025-0${1 + (n % 9)}-2${n % 9}T08:09:10-07:00`;
    case "rating100":
      return 60;
    case "o_counter":
    case "play_count":
    case "play_duration":
    case "resume_time":
      return 0;
    case "favorite":
    case "organized":
    case "ignore_auto_tag":
      return n % 2 === 0;
    case "gender":
      return n % 2 === 0 ? "MALE" : "FEMALE";
    case "circumcised":
      return "CUT";
    case "country":
      return "US";
    case "ethnicity":
      return "Caucasian";
    case "hair_color":
      return "Brunette";
    case "eye_color":
      return "Hazel";
    case "fake_tits":
      return "Natural";
    case "height_cm":
      return 160 + n;
    case "weight":
      return 50 + n;
    case "penis_length":
      return 15.5;
    case "duration":
      return 5400 + n;
    case "seconds":
      return 12.5 + n;
    case "end_seconds":
      return 30.25 + n;
    case "url":
    case "twitter":
    case "instagram":
      return `https://social.example/${type}${n}/${leaf}`;
    case "path":
      return `/data/hidden/${type}-${n}-folder`;
    default:
      break;
  }
  if (leaf.endsWith("_count")) return 1 + (n % 3);
  if (leaf.endsWith("image_path") || path.startsWith("paths.")) {
    return `${RAW_ORIGIN}/${type}/${n}/${leaf}?t=${stamp(n)}`;
  }
  if (type === "clip" && ["preview", "screenshot", "stream"].includes(leaf)) {
    return `${RAW_ORIGIN}/scene/1/scene_marker/${n}/${leaf}?t=${stamp(n)}`;
  }
  return `Hidden ${type} ${n} ${path}`;
}

function fingerprint(kind: string, n: number, fileIndex: number): string {
  const tail = pad(n * 10 + fileIndex, 4);
  return kind === "md5"
    ? `d41d8cd98f00b204e9800998ecf8${tail}`
    : `${kind === "oshash" ? "a1b2c3d4e5f6" : "f0e1d2c3b4a5"}${tail}`;
}

function fileValue(type: EntityType, n: number, field: string): unknown {
  const extension = FILE_EXTENSIONS[type] ?? "bin";
  const isImage = type === "image";
  switch (field) {
    case "id":
      return String(500 + n);
    case "path":
      return `/data/hidden/${type}-${n}-original.${extension}`;
    case "basename":
      return `${type}-${n}-original.${extension}`;
    case "size":
      return 734003200 + n * 2;
    case "duration":
      return 1234.5 + n;
    case "bit_rate":
      return 4500000 + n * 2;
    case "frame_rate":
      return 29.97;
    case "width":
      return isImage ? 1600 : 1920;
    case "height":
      return isImage ? 1200 : 1080;
    case "format":
      return "mp4";
    case "video_codec":
      return "h264";
    case "audio_codec":
      return "aac";
    default:
      return scalar(type, n, field);
  }
}

/** Item `index` of a list field: a string, or an object of `leaves`. */
function listItem(
  type: EntityType,
  n: number,
  root: string,
  leaves: string[],
  index: number
): unknown {
  if (leaves.length === 0) {
    return root === "urls"
      ? `https://site.example/hidden/${type}/${n}/${index}`
      : `Hidden alias ${type} ${n} ${index}`;
  }
  const values: Record<string, unknown> = {
    endpoint: "https://stashbox.example/graphql",
    stash_id: `5b0c9a3e-1f2d-4c6b-8a7e-${pad(n * 100 + index, 12)}`,
    language_code: "en",
    caption_type: "srt",
    label: STREAM_LABELS[index % STREAM_LABELS.length],
    id: String(n * 10 + index),
    title: `Hidden chapter ${n} ${index}`,
    image_index: index + 1,
  };
  return Object.fromEntries(leaves.map((leaf) => [leaf, values[leaf] ?? null]));
}

function rawRelation(
  relation: Relation,
  links: RelationShape[],
  linkFields: string[]
): unknown {
  const { via } = relation;
  if (via !== undefined) {
    return links.map((link, index) => ({
      [via]: { id: String(sourceId(link.id)) },
      ...Object.fromEntries(
        linkFields.map((field) => [
          field,
          (link.present ?? []).includes(field)
            ? field === "scene_index"
              ? index + 1
              : `Hidden link ${field}`
            : null,
        ])
      ),
    }));
  }
  const refs = links.map((link) => ({ id: String(sourceId(link.id)) }));
  return relation.many ? refs : (refs[0] ?? null);
}

function rawFile(
  type: EntityType,
  n: number,
  fileIndex: number,
  file: FileShape,
  leaves: string[]
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const leaf of leaves) {
    if (leaf.startsWith("fingerprints.")) continue;
    raw[leaf] = file.present.includes(leaf) ? fileValue(type, n, leaf) : null;
  }
  const fingerprintLeaves = leaves
    .filter((leaf) => leaf.startsWith("fingerprints."))
    .map((leaf) => leaf.slice("fingerprints.".length));
  if (fingerprintLeaves.length > 0) {
    raw.fingerprints = file.fingerprints.map((kind) => ({
      ...(fingerprintLeaves.includes("type") ? { type: kind } : {}),
      ...(fingerprintLeaves.includes("value")
        ? { value: fingerprint(kind, n, fileIndex) }
        : {}),
    }));
  }
  return raw;
}

function rawEntity(
  type: EntityType,
  shape: EntityShape,
  fields: string[]
): Entity {
  const n = sourceId(shape.id);
  const roots = [...new Set(fields.map((path) => path.split(".")[0] ?? ""))];
  const raw: Entity = { id: String(n) };
  for (const root of roots) {
    const leaves = fields
      .filter((path) => path.startsWith(`${root}.`))
      .map((path) => path.slice(root.length + 1));
    const relation = Object.prototype.hasOwnProperty.call(RELATIONS[type], root)
      ? RELATIONS[type][root]
      : undefined;
    const length = shape.lengths[root];
    if (relation !== undefined) {
      raw[root] = rawRelation(relation, shape.relations[root] ?? [], leaves);
    } else if (root === "files") {
      raw.files = (shape.files ?? []).map((file, index) =>
        rawFile(type, n, index, file, leaves)
      );
    } else if (length !== undefined) {
      raw[root] = range(length).map((index) =>
        listItem(type, n, root, leaves, index)
      );
    } else if (leaves.length > 0) {
      raw[root] = Object.fromEntries(
        leaves.map((leaf) => [
          leaf,
          shape.present.includes(`${root}.${leaf}`)
            ? scalar(type, n, `${root}.${leaf}`)
            : null,
        ])
      );
    } else if (root !== "id") {
      raw[root] = shape.present.includes(root) ? scalar(type, n, root) : null;
    }
  }
  return raw;
}

/** The raw answers of a Stash shaped like `shape`, with made-up values. */
export function rawStash(shape: RecordedShape): RawStash {
  const list = (type: EntityType): RawEntity[] =>
    shape.entities[type].map((entity) =>
      rawEntity(type, entity, shape.fields[type])
    );
  return {
    version: {
      version: "v0.31.1",
      hash: "9c4e1a7b",
      build_time: "2025-11-02 10:00:00",
    },
    configuration: {
      general: {
        stashes: [
          {
            path: "/data/hidden-library",
            excludeVideo: false,
            excludeImage: false,
          },
        ],
      },
    },
    entities: {
      scene: list("scene"),
      performer: list("performer"),
      studio: list("studio"),
      tag: list("tag"),
      group: list("group"),
      gallery: list("gallery"),
      image: list("image"),
      clip: list("clip"),
    },
  };
}

function asEntities(list: RawEntity[]): Entity[] {
  return list.map((entity) => ({ ...entity, id: String(entity.id) }));
}

/**
 * A request function answering GraphQL queries from `raw`, as Stash would;
 * `sent` collects every document it receives.
 */
export function fakeStash(raw: RawStash, sent: string[] = []): StashRequest {
  const library: ReplayLibrary = {
    stash: { version: raw.version, configuration: raw.configuration },
    entities: {
      scene: asEntities(raw.entities.scene),
      performer: asEntities(raw.entities.performer),
      studio: asEntities(raw.entities.studio),
      tag: asEntities(raw.entities.tag),
      group: asEntities(raw.entities.group),
      gallery: asEntities(raw.entities.gallery),
      image: asEntities(raw.entities.image),
      clip: asEntities(raw.entities.clip),
    },
  };
  return (document) => {
    sent.push(document);
    const operation = parse(document).definitions.find(
      (definition): definition is OperationDefinitionNode =>
        definition.kind === Kind.OPERATION_DEFINITION
    );
    if (operation === undefined) {
      return Promise.reject(new Error("fakeStash: no operation"));
    }
    const name = operation.name?.value ?? "(anonymous)";
    const data: Record<string, unknown> = {};
    for (const selection of operation.selectionSet.selections) {
      const field = selectedField(selection, name, "");
      const root = field.name.value;
      const args = Object.fromEntries(
        (field.arguments ?? []).map((argument) => [
          argument.name.value,
          valueFromASTUntyped(argument.value),
        ])
      );
      const value = queryRoot(library, name, root, args);
      data[root] = field.selectionSet
        ? project(value, field.selectionSet, name, root)
        : value;
    }
    return Promise.resolve(data);
  };
}
