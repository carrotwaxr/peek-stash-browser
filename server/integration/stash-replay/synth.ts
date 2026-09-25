/**
 * Synthetic values for the Stash replay's library (sweep item 83).
 *
 * npm run fixtures:record keeps only the shape of the test Stash, in
 * fixture/shape.json (RecordedShape below): ids, relations, which fields
 * were set and how long each list was. synthesize() turns a shape, extended
 * by extend.ts, into a ReplayLibrary with one rule per field. Every drawn
 * value comes from a PRNG seeded with `<SYNTH_SEED>:<type>:<id>:<field>`, so
 * the output is deterministic and a new field changes no other value.
 *
 * It never sees a source value, and the values it builds cannot be real
 * data: names are `<Label> <id>`, URLs sit under .invalid domains or
 * {{STASH_ORIGIN}}, video sizes are odd (real encodes are even), durations,
 * frame rates and marker times have three decimals, countries are the
 * user-assigned codes XA-XZ, and dates fall in 1960-1983, 2001-2009 and
 * 2003-2005. Only PRNG-drawn file sizes, bit rates and dates can equal a
 * source value by chance; fixtures:record checks for that, and bumping
 * SYNTH_SEED (-v1 to -v2) redraws them.
 *
 * A field some query selects and no rule here covers fails the generator,
 * naming the type, field and query, before any value is built.
 */
import { createHash } from "crypto";
import {
  ENTITY_TYPES,
  type Entity,
  type EntityType,
  type ReplayLibrary,
  STASH_ORIGIN,
  isRecord,
} from "./library.js";
import {
  RELATIONS,
  type Relation,
  type SelectedField,
  type SelectionTree,
  type Selections,
} from "./selections.js";

/** Bump the suffix to redraw every PRNG value (see the module comment). */
export const SYNTH_SEED = "peek-stash-replay-v1";

/** Fixture ids are the source ids plus this; extension ids follow on. */
export const FIXTURE_ID_OFFSET = 100000;

/**
 * An entity reference in a recorded shape: the referenced entity's fixture
 * id and, for a link such as a scene's groups entry or a group's sub_groups
 * entry, the link fields that were set ("scene_index", "description").
 */
export interface RelationShape {
  id: string;
  present?: string[];
  /** Link values extend.ts fixes, used as they are (a sub-group's description). */
  values?: Record<string, unknown>;
}

/**
 * A recorded file: the file fields that were set ("path", "size", ...) and
 * the types of its fingerprints in order ("oshash", "phash", "md5").
 */
export interface FileShape {
  present: string[];
  fingerprints: string[];
}

/** One recorded entity. It holds no value except its new id. */
export interface EntityShape {
  /** The Stash id plus FIXTURE_ID_OFFSET. */
  id: string;
  /**
   * The scalar fields that were set (not null, and not "" for a string), as
   * paths from `fields`: "title", "rating100", "paths.screenshot",
   * "folder.path". Relations, files and lists are recorded apart.
   */
  present: string[];
  /**
   * Per relation field (RELATIONS in selections.ts), the references in
   * Stash's order: [] for none, one element for a single reference.
   */
  relations: Record<string, RelationShape[]>;
  /**
   * The length of every non-entity list, 0 included: urls, aliases (studios
   * and tags; a group's aliases is a string), alias_list, stash_ids,
   * captions, chapters, sceneStreams.
   */
  lengths: Record<string, number>;
  /** Scene, image and gallery files, in Stash's order. */
  files?: FileShape[];
}

/**
 * fixture/shape.json, written by npm run fixtures:record: the shape of the
 * test Stash with every value dropped.
 */
export interface RecordedShape {
  /**
   * Per type, the field paths the recording asked for (fieldPaths in
   * selections.ts). A field a query selects now and the recording did not
   * ask for counts as present on every entity.
   */
  fields: Record<EntityType, string[]>;
  /** Per type, the recorded entities in id order. */
  entities: Record<EntityType, EntityShape[]>;
}

/** An entity synthesize reads: a recorded one, or one extend.ts added. */
export interface GraphEntity extends EntityShape {
  /** Added by extend.ts: not in the test Stash. */
  extension?: boolean;
  /** Values extend.ts fixes, used as they are (the rated scene's). */
  values?: Record<string, unknown>;
}

/** A recorded shape after extend.ts: what synthesize reads. */
export interface LibraryGraph {
  fields: Record<EntityType, string[]>;
  entities: Record<EntityType, GraphEntity[]>;
}

const SYNTH_FILE = "server/integration/stash-replay/synth.ts";

const LABELS: Record<EntityType, string> = {
  scene: "Scene",
  performer: "Performer",
  studio: "Studio",
  tag: "Tag",
  group: "Group",
  gallery: "Gallery",
  image: "Image",
  clip: "Clip",
};

/** Width by height, cycled over the scenes in id order (odd, as no encode is). */
const DIMENSIONS: ReadonlyArray<readonly [number, number]> = [
  [431, 243],
  [861, 483],
  [1287, 723],
  [1927, 1083],
];
const FRAME_RATES = [23.456, 24.567, 29.876, 59.123];
const RATINGS = [20, 40, 60, 80, 100];
/** The first two performers with a gender are FEMALE and MALE. */
const GENDERS = [
  "FEMALE",
  "MALE",
  "TRANSGENDER_FEMALE",
  "TRANSGENDER_MALE",
  "INTERSEX",
  "NON_BINARY",
];
const CIRCUMCISED = ["CUT", "UNCUT"];
const CAPTION_LANGUAGES = ["en", "de", "fr"];
const FINGERPRINT_LENGTHS: Record<string, number> = {
  oshash: 16,
  phash: 16,
  md5: 32,
};
/** Stash's transcode formats and tiers (the shorter side each tier needs). */
const STREAM_FORMATS = ["MP4", "WEBM", "HLS", "DASH"];
const STREAM_TIERS: ReadonlyArray<readonly [number, string]> = [
  [1080, "Full HD (1080p)"],
  [720, "HD (720p)"],
  [480, "Standard (480p)"],
  [240, "Low (240p)"],
];

const VERSION = {
  version: "v0.0.0-replay",
  hash: "00000000",
  build_time: "2000-01-01 00:00:00",
};
const CONFIGURATION = {
  general: {
    stashes: [
      { path: "/library/videos", excludeVideo: false, excludeImage: true },
      { path: "/library/images", excludeVideo: true, excludeImage: false },
    ],
  },
};

const DAY = 86400;
const START_2003 = Date.UTC(2003, 0, 1) / 1000;

function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

function compareIds(a: string, b: string): number {
  const difference = Number(a) - Number(b);
  return Number.isNaN(difference) ? a.localeCompare(b) : difference;
}

function numbers(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function mapTypes<T>(build: (type: EntityType) => T): Record<EntityType, T> {
  return {
    scene: build("scene"),
    performer: build("performer"),
    studio: build("studio"),
    tag: build("tag"),
    group: build("group"),
    gallery: build("gallery"),
    image: build("image"),
    clip: build("clip"),
  };
}

function noRule(type: string, path: string, field: SelectedField): Error {
  return new Error(
    `no synthetic rule for ${type}.${path} (selected by ${field.operations.join(", ")}): add one in ${SYNTH_FILE}`
  );
}

/** A deterministic stream of numbers from a seed (SHA-256 blocks). */
class Prng {
  private draws = 0;

  constructor(private readonly seed: string) {}

  private block(): Buffer {
    return createHash("sha256").update(`${this.seed}#${this.draws++}`).digest();
  }

  /** A number in [0, 1). */
  float(): number {
    return this.block().readUIntBE(0, 6) / 2 ** 48;
  }

  /** An integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) throw new Error("Prng.pick: no items");
    return item;
  }

  hex(length: number): string {
    let hex = "";
    while (hex.length < length) hex += this.block().toString("hex");
    return hex.slice(0, length);
  }

  uuid(): string {
    const hex = this.hex(32);
    const variant = "89ab"[parseInt(hex.charAt(16), 16) % 4] ?? "8";
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  /** min to max with exactly three decimals (the last one never 0). */
  thousandths(min: number, max: number): number {
    let value = this.int(min * 1000, max * 1000 - 1);
    if (value % 10 === 0) value += 1;
    return value / 1000;
  }
}

function timestamp(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** The values of one entity's field, with what its rule needs. */
class FieldContext {
  constructor(
    private readonly synth: Synth,
    readonly type: EntityType,
    readonly entity: GraphEntity,
    readonly field: string
  ) {}

  get id(): string {
    return this.entity.id;
  }

  get label(): string {
    return `${LABELS[this.type]} ${this.entity.id}`;
  }

  /** The PRNG of this field, or of a path below it ("files.0.size"). */
  rng(path: string = this.field): Prng {
    return new Prng(`${this.synth.seed}:${this.type}:${this.id}:${path}`);
  }

  present(path: string = this.field): boolean {
    return this.synth.present(this.type, this.entity, path);
  }

  filePresent(file: FileShape, field: string): boolean {
    return (
      file.present.includes(field) ||
      !this.synth.recorded(this.type, `files.${field}`)
    );
  }

  length(field: string = this.field): number {
    return this.entity.lengths[field] ?? (this.present(field) ? 1 : 0);
  }

  refs(field: string): string[] {
    return (this.entity.relations[field] ?? []).map((link) => link.id);
  }

  /** The ids of `from` entities whose `field` refers to this one. */
  referrers(from: EntityType, field: string): string[] {
    return this.synth.referrers(from, field, this.id);
  }

  /** Distinct ids that `field` of the entities in `from` refer to. */
  refsOf(from: EntityType, ids: string[], field: string): Set<string> {
    return new Set(ids.flatMap((id) => this.synth.refs(from, id, field)));
  }

  /** Its position among the entities of its type that have `field`. */
  presentIndex(): number {
    return this.synth.presentIndex(this.type, this.entity, this.field);
  }

  dimensions(): readonly [number, number] {
    const size = DIMENSIONS[this.synth.index(this.type, this.id) % 4];
    if (size === undefined) throw new Error("synth: no dimensions");
    return size;
  }

  createdSeconds(prefix = ""): number {
    return START_2003 + this.rng(`${prefix}created_at`).int(0, 365 * DAY - 1);
  }

  updatedSeconds(prefix = ""): number {
    return (
      this.createdSeconds(prefix) +
      this.rng(`${prefix}updated_at`).int(0, 400 * DAY)
    );
  }

  /** A day between two years, inclusive, as YYYY-MM-DD. */
  day(fromYear: number, toYear: number): string {
    const start = Date.UTC(fromYear, 0, 1);
    const days = (Date.UTC(toYear + 1, 0, 1) - start) / (DAY * 1000);
    const offset = this.rng().int(0, days - 1);
    return new Date(start + offset * DAY * 1000).toISOString().slice(0, 10);
  }

  /** A Stash media URL under {{STASH_ORIGIN}}, stamped with updated_at. */
  media(route: string, extra = ""): string {
    return `${STASH_ORIGIN}${route}?t=${this.updatedSeconds()}${extra}`;
  }

  fingerprint(fileIndex: number, type: string): string {
    const length = own(FINGERPRINT_LENGTHS, type);
    if (length === undefined) {
      throw new Error(
        `no synthetic rule for fingerprint type ${type} (${this.type} ${this.id}): add one in ${SYNTH_FILE}`
      );
    }
    return this.rng(`files.${fileIndex}.fingerprints.${type}`).hex(length);
  }
}

type Rule = (c: FieldContext) => unknown;

/** The rule's value where the field was recorded as set; null otherwise. */
const when =
  (rule: Rule): Rule =>
  (c) =>
    c.present() ? rule(c) : null;

const label = when((c) => c.label);
const freeText = when((c) => `${c.label} ${c.field}`);
const webLink = when(
  (c) => `https://example.invalid/${c.type}/${c.id}/${c.field}`
);
const aliasList: Rule = (c) =>
  numbers(Math.min(c.length(), 2)).map((n) => `${c.label} alias ${n}`);
const urlList: Rule = (c) =>
  numbers(Math.min(c.length(), 2)).map(
    (n) => `https://example.invalid/${c.type}/${c.id}/${n}`
  );
const stashIds: Rule = (c) =>
  numbers(c.length()).map((n) => ({
    endpoint: "https://stashbox.invalid/graphql",
    stash_id: c.rng(`${c.field}.${n}`).uuid(),
  }));
const createdAt = when((c) => timestamp(c.createdSeconds()));
const updatedAt = when((c) => timestamp(c.updatedSeconds()));
const dayBetween = (fromYear: number, toYear: number): Rule =>
  when((c) => c.day(fromYear, toYear));
const rating = when((c) => c.rng().pick(RATINGS));
const counter = when((c) => c.rng().int(1, 9));
const flag = when((c) => c.rng().int(0, 1) === 1);
const between = (min: number, max: number): Rule =>
  when((c) => c.rng().int(min, max));
const categorical = when((c) => `${c.field} ${c.rng().int(1, 5)}`);
const cycle = (values: string[]): Rule =>
  when((c) => values[c.presentIndex() % values.length]);
const image = (kind: string, extra = ""): Rule =>
  when((c) => c.media(`/${c.type}/${c.id}/${kind}`, extra));
const referrerCount =
  (from: EntityType, field: string): Rule =>
  (c) =>
    c.referrers(from, field).length;
/** Distinct performers over the scenes whose `field` names this entity. */
const scenePerformers =
  (field: string): Rule =>
  (c) =>
    c.refsOf("scene", c.referrers("scene", field), "performers").size;
/** Distinct groups over the scenes whose `field` names this entity. */
const sceneGroups =
  (field: string): Rule =>
  (c) =>
    c.refsOf("scene", c.referrers("scene", field), "groups").size;

function fileId(c: FieldContext, index: number): string {
  return String(Number(c.id) * 10 + index);
}

function fileName(c: FieldContext, index: number, extension: string): string {
  const suffix = index === 0 ? "" : `-${index + 1}`;
  return `${c.type}-${c.id}${suffix}.${extension}`;
}

/** Values of the fields every kind of file has. */
function fileBase(
  c: FieldContext,
  file: FileShape,
  index: number,
  folder: string,
  extension: string
): Record<string, unknown> {
  const at = `files.${index}.`;
  const has = (field: string) => c.filePresent(file, field);
  const basename = fileName(c, index, extension);
  return {
    id: has("id") ? fileId(c, index) : null,
    path: has("path") ? `${folder}/${basename}` : null,
    basename: has("basename") ? basename : null,
    size: has("size") ? c.rng(`${at}size`).int(1e6, 1e10) : null,
    created_at: has("created_at") ? timestamp(c.createdSeconds(at)) : null,
    updated_at: has("updated_at") ? timestamp(c.updatedSeconds(at)) : null,
    fingerprints: file.fingerprints.map((type) => ({
      type,
      value: c.fingerprint(index, type),
    })),
  };
}

const sceneFiles: Rule = (c) => {
  const [width, height] = c.dimensions();
  return (c.entity.files ?? []).map((file, index) => {
    const at = `files.${index}.`;
    const has = (field: string) => c.filePresent(file, field);
    const size = c.rng(`${at}size`).int(1e6, 1e10);
    const duration = c.rng(`${at}duration`).thousandths(20, 900);
    return {
      ...fileBase(c, file, index, "/library/videos", "webm"),
      format: has("format") ? "webm" : null,
      video_codec: has("video_codec") ? "vp9" : null,
      audio_codec: has("audio_codec") ? "opus" : null,
      width: has("width") ? width : null,
      height: has("height") ? height : null,
      frame_rate: has("frame_rate")
        ? c.rng(`${at}frame_rate`).pick(FRAME_RATES)
        : null,
      duration: has("duration") ? duration : null,
      bit_rate: has("bit_rate") ? Math.round((size * 8) / duration) : null,
    };
  });
};

/** The hash Stash names sprites and VTTs by: the first file's oshash. */
function sceneHash(c: FieldContext): string {
  const [first] = c.entity.files ?? [];
  return first?.fingerprints.includes("oshash")
    ? c.fingerprint(0, "oshash")
    : c.id;
}

const scenePaths: Rule = (c) => {
  const hash = sceneHash(c);
  const url = (key: string, route: string) =>
    c.present(`paths.${key}`) ? c.media(route) : null;
  return {
    screenshot: url("screenshot", `/scene/${c.id}/screenshot`),
    preview: url("preview", `/scene/${c.id}/preview`),
    stream: url("stream", `/scene/${c.id}/stream`),
    webp: url("webp", `/scene/${c.id}/webp`),
    vtt: url("vtt", `/scene/${hash}_thumbs.vtt`),
    sprite: url("sprite", `/scene/${hash}_sprite.jpg`),
    caption: url("caption", `/scene/${c.id}/caption`),
  };
};

/** Stash's stream labels for a file whose shorter side is `height`. */
function streamLabels(height: number): string[] {
  const tiers = STREAM_TIERS.filter(([min]) => height >= min).map(
    ([, name]) => name
  );
  return [
    "Direct stream",
    ...STREAM_FORMATS.flatMap((format) => [
      format,
      ...tiers.map((tier) => `${format} ${tier}`),
    ]),
  ];
}

const imageFiles: Rule = (c) =>
  (c.entity.files ?? []).map((file, index) => ({
    ...fileBase(c, file, index, "/library/images", "jpg"),
    width: c.filePresent(file, "width") ? 319 : null,
    height: c.filePresent(file, "height") ? 239 : null,
  }));

const galleryFiles: Rule = (c) =>
  (c.entity.files ?? []).map((file, index) =>
    fileBase(c, file, index, "/library/images", "zip")
  );

const markerMedia = (kind: string): Rule =>
  when((c) => {
    const [scene = ""] = c.refs("scene");
    return c.media(`/scene/${scene}/scene_marker/${c.id}/${kind}`);
  });

/** Rules any type may use; RULES below adds and overrides per type. */
const COMMON: Record<string, Rule> = {
  id: (c) => c.id,
  name: label,
  title: label,
  details: freeText,
  description: freeText,
  synopsis: freeText,
  code: freeText,
  director: freeText,
  photographer: freeText,
  disambiguation: freeText,
  measurements: freeText,
  tattoos: freeText,
  piercings: freeText,
  career_length: freeText,
  aliases: aliasList,
  alias_list: aliasList,
  urls: urlList,
  url: webLink,
  twitter: webLink,
  instagram: webLink,
  stash_ids: stashIds,
  created_at: createdAt,
  updated_at: updatedAt,
  date: dayBetween(2001, 2009),
  rating100: rating,
  favorite: flag,
  organized: flag,
  ignore_auto_tag: flag,
  o_counter: counter,
  play_count: counter,
  play_duration: counter,
  resume_time: counter,
};

const RULES: Record<EntityType, Record<string, Rule>> = {
  scene: {
    files: sceneFiles,
    paths: scenePaths,
    sceneStreams: (c) =>
      c.length() > 0
        ? streamLabels(c.dimensions()[1]).map((name) => ({ label: name }))
        : [],
    captions: (c) =>
      numbers(c.length()).map((n) => ({
        language_code:
          CAPTION_LANGUAGES[(n - 1) % CAPTION_LANGUAGES.length] ?? "en",
        caption_type: "vtt",
      })),
  },
  performer: {
    birthdate: dayBetween(1960, 1983),
    death_date: dayBetween(2001, 2009),
    gender: cycle(GENDERS),
    circumcised: cycle(CIRCUMCISED),
    country: when((c) => `X${String.fromCharCode(65 + c.rng().int(0, 25))}`),
    ethnicity: categorical,
    hair_color: categorical,
    eye_color: categorical,
    fake_tits: categorical,
    height_cm: between(211, 249),
    weight: between(311, 349),
    penis_length: when((c) => c.rng().int(317, 399) / 10),
    image_path: image("image"),
    scene_count: referrerCount("scene", "performers"),
    image_count: referrerCount("image", "performers"),
    gallery_count: referrerCount("gallery", "performers"),
    group_count: sceneGroups("performers"),
    movie_count: sceneGroups("performers"),
  },
  studio: {
    image_path: image("image", "&default=true"),
    scene_count: referrerCount("scene", "studio"),
    image_count: referrerCount("image", "studio"),
    gallery_count: referrerCount("gallery", "studio"),
    group_count: referrerCount("group", "studio"),
    movie_count: referrerCount("group", "studio"),
    performer_count: scenePerformers("studio"),
  },
  tag: {
    image_path: image("image", "&default=true"),
    scene_count: referrerCount("scene", "tags"),
    scene_marker_count: (c) =>
      new Set([
        ...c.referrers("clip", "primary_tag"),
        ...c.referrers("clip", "tags"),
      ]).size,
    image_count: referrerCount("image", "tags"),
    gallery_count: referrerCount("gallery", "tags"),
    performer_count: referrerCount("performer", "tags"),
    studio_count: referrerCount("studio", "tags"),
    group_count: referrerCount("group", "tags"),
    movie_count: referrerCount("group", "tags"),
    child_count: (c) => c.refs("children").length,
    parent_count: (c) => c.refs("parents").length,
  },
  group: {
    // A group's aliases is one string
    aliases: freeText,
    duration: between(600, 9000),
    front_image_path: image("frontimage", "&default=true"),
    back_image_path: image("backimage", "&default=true"),
    scene_count: referrerCount("scene", "groups"),
    performer_count: scenePerformers("groups"),
    sub_group_count: (c) => c.refs("sub_groups").length,
  },
  gallery: {
    image_count: referrerCount("image", "galleries"),
    files: galleryFiles,
    folder: (c) =>
      c.present("folder.path")
        ? { path: `/library/images/gallery-${c.id}` }
        : null,
    paths: (c) => ({
      cover: c.present("paths.cover")
        ? c.media(`/gallery/${c.id}/cover`)
        : null,
      preview: c.present("paths.preview")
        ? c.media(`/gallery/${c.id}/preview`)
        : null,
    }),
    chapters: (c) =>
      numbers(c.length()).map((n) => ({
        id: String(Number(c.id) * 100 + n),
        title: c.label,
        image_index: n,
      })),
  },
  image: {
    files: imageFiles,
    paths: (c) => ({
      thumbnail: c.present("paths.thumbnail")
        ? c.media(`/image/${c.id}/thumbnail`)
        : null,
      preview: c.present("paths.preview")
        ? c.media(`/image/${c.id}/preview`)
        : null,
      image: c.present("paths.image") ? c.media(`/image/${c.id}/image`) : null,
    }),
  },
  clip: {
    seconds: when((c) => c.rng().thousandths(1, 10)),
    end_seconds: when((c) => c.rng().thousandths(10, 20)),
    preview: markerMedia("preview"),
    screenshot: markerMedia("screenshot"),
    stream: markerMedia("stream"),
  },
};

/** Rules for the fields of a link, keyed `<type>.<relation>.<field>`. */
const LINK_RULES: Record<
  string,
  (synth: Synth, entity: GraphEntity, link: RelationShape) => unknown
> = {
  // The scene's place in the group, in scene id order
  "scene.groups.scene_index": (synth, scene, link) =>
    synth.referrers("scene", "groups", link.id).indexOf(scene.id) + 1,
  "group.containing_groups.description": (_synth, group) =>
    `Group ${group.id} description`,
  "group.sub_groups.description": (_synth, group) =>
    `Group ${group.id} description`,
};

/** `value` cut down to `tree`; a selected key the rule lacks fails. */
function fit(
  value: unknown,
  tree: SelectionTree,
  type: string,
  path: string
): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.map((item: unknown) => fit(item, tree, type, path));
  }
  if (!isRecord(value)) {
    throw new Error(
      `synth: the rule for ${type}.${path} gives a ${typeof value}, but the query selects fields of it`
    );
  }
  const fitted: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(tree)) {
    const fieldPath = path === "" ? name : `${path}.${name}`;
    if (!Object.prototype.hasOwnProperty.call(value, name)) {
      throw noRule(type, fieldPath, field);
    }
    const child = value[name];
    fitted[name] =
      field.fields === undefined
        ? child
        : fit(child, field.fields, type, fieldPath);
  }
  return fitted;
}

function fitRecord(
  value: Record<string, unknown>,
  tree: SelectionTree,
  root: string
): Record<string, unknown> {
  const fitted = fit(value, tree, root, "");
  return isRecord(fitted) ? fitted : {};
}

/** A graph and its indexes; builds library entities from it. */
class Synth {
  private readonly sorted: Record<EntityType, GraphEntity[]>;
  private readonly byId: Record<EntityType, Map<string, GraphEntity>>;
  private readonly positions: Record<EntityType, Map<string, number>>;
  private readonly recordedPaths: Record<EntityType, Set<string>>;
  private readonly referrerIds = new Map<string, string[]>();
  private readonly presentOrder = new Map<string, Map<string, number>>();
  private readonly values = new Map<string, unknown>();

  constructor(
    graph: LibraryGraph,
    readonly seed: string
  ) {
    this.sorted = mapTypes((type) =>
      [...graph.entities[type]].sort((a, b) => compareIds(a.id, b.id))
    );
    this.byId = mapTypes((type) => {
      const map = new Map<string, GraphEntity>();
      for (const entity of this.sorted[type]) {
        if (map.has(entity.id)) {
          throw new Error(`synth: two ${type} entities have id ${entity.id}`);
        }
        map.set(entity.id, entity);
      }
      return map;
    });
    this.positions = mapTypes(
      (type) =>
        new Map(this.sorted[type].map((entity, index) => [entity.id, index]))
    );
    // A recorded path also records every path above it
    this.recordedPaths = mapTypes((type) => {
      const paths = new Set<string>();
      for (const path of graph.fields[type]) {
        const parts = path.split(".");
        parts.forEach((_, index) =>
          paths.add(parts.slice(0, index + 1).join("."))
        );
      }
      return paths;
    });
    for (const type of ENTITY_TYPES) {
      for (const entity of this.sorted[type]) {
        for (const [field, links] of Object.entries(entity.relations)) {
          const relation = own(RELATIONS[type], field);
          if (relation === undefined) continue;
          for (const link of links) {
            this.entity(
              relation.target,
              link.id,
              `${type} ${entity.id} ${field}`
            );
            const key = `${type}.${field}\0${link.id}`;
            const ids = this.referrerIds.get(key) ?? [];
            if (!ids.includes(entity.id)) ids.push(entity.id);
            this.referrerIds.set(key, ids);
          }
        }
      }
    }
  }

  entity(type: EntityType, id: string, where: string): GraphEntity {
    const entity = this.byId[type].get(id);
    if (entity === undefined) {
      throw new Error(
        `synth: ${where} names ${type} ${id}, which the shape lacks`
      );
    }
    return entity;
  }

  recorded(type: EntityType, path: string): boolean {
    return this.recordedPaths[type].has(path);
  }

  present(type: EntityType, entity: GraphEntity, path: string): boolean {
    if (entity.values !== undefined && path in entity.values) return true;
    return entity.present.includes(path) || !this.recorded(type, path);
  }

  refs(type: EntityType, id: string, field: string): string[] {
    const entity = this.byId[type].get(id);
    return (entity?.relations[field] ?? []).map((link) => link.id);
  }

  referrers(from: EntityType, field: string, id: string): string[] {
    return this.referrerIds.get(`${from}.${field}\0${id}`) ?? [];
  }

  index(type: EntityType, id: string): number {
    return this.positions[type].get(id) ?? 0;
  }

  presentIndex(type: EntityType, entity: GraphEntity, field: string): number {
    const key = `${type}.${field}`;
    let order = this.presentOrder.get(key);
    if (order === undefined) {
      order = new Map();
      for (const each of this.sorted[type]) {
        if (this.present(type, each, field)) order.set(each.id, order.size);
      }
      this.presentOrder.set(key, order);
    }
    return order.get(entity.id) ?? 0;
  }

  /** The entity's own value of a non-relation field, computed once. */
  private ownValue(
    type: EntityType,
    entity: GraphEntity,
    field: string,
    selected: SelectedField
  ): unknown {
    const key = `${type}\0${entity.id}\0${field}`;
    if (this.values.has(key)) return this.values.get(key);
    let value: unknown;
    if (entity.values !== undefined && field in entity.values) {
      value = entity.values[field];
    } else {
      const rule = own(RULES[type], field) ?? own(COMMON, field);
      if (rule === undefined) throw noRule(type, field, selected);
      value = rule(new FieldContext(this, type, entity, field));
    }
    this.values.set(key, value);
    return value;
  }

  private link(
    type: EntityType,
    entity: GraphEntity,
    relationName: string,
    link: RelationShape,
    field: string,
    selected: SelectedField
  ): unknown {
    const rule = own(LINK_RULES, `${type}.${relationName}.${field}`);
    if (rule === undefined) {
      throw noRule(type, `${relationName}.${field}`, selected);
    }
    if (link.values !== undefined && field in link.values) {
      return link.values[field];
    }
    const present =
      (link.present ?? []).includes(field) ||
      !this.recorded(type, `${relationName}.${field}`);
    return present ? rule(this, entity, link) : null;
  }

  private reference(
    type: EntityType,
    entity: GraphEntity,
    name: string,
    relation: Relation,
    selected: SelectedField
  ): unknown {
    const tree = selected.fields ?? {};
    const links = entity.relations[name] ?? [];
    const target = (link: RelationShape) =>
      this.entity(relation.target, link.id, `${type} ${entity.id} ${name}`);
    const { via } = relation;
    if (via !== undefined) {
      return links.map((link) => {
        const built: Record<string, unknown> = {};
        for (const [key, field] of Object.entries(tree)) {
          built[key] =
            key === via
              ? this.build(relation.target, target(link), field.fields ?? {})
              : this.link(type, entity, name, link, key, field);
        }
        return built;
      });
    }
    const built = links.map((link) =>
      this.build(relation.target, target(link), tree)
    );
    return relation.many ? built : (built[0] ?? null);
  }

  /** The entity's values for `tree`, references built as nested entities. */
  build(type: EntityType, entity: GraphEntity, tree: SelectionTree): Entity {
    const built: Entity = { id: entity.id };
    for (const [name, selected] of Object.entries(tree)) {
      const relation = own(RELATIONS[type], name);
      if (relation !== undefined) {
        built[name] = this.reference(type, entity, name, relation, selected);
        continue;
      }
      const value = this.ownValue(type, entity, name, selected);
      built[name] =
        selected.fields === undefined
          ? value
          : fit(value, selected.fields, type, name);
    }
    return built;
  }

  library(selections: Selections): ReplayLibrary {
    return {
      stash: {
        version: fitRecord(VERSION, selections.stash.version, "version"),
        configuration: fitRecord(
          CONFIGURATION,
          selections.stash.configuration,
          "configuration"
        ),
      },
      entities: mapTypes((type) =>
        this.sorted[type].map((entity) =>
          this.build(type, entity, selections.entities[type])
        )
      ),
    };
  }
}

/**
 * One entity per type, with every field set, one of each list and one file,
 * and every reference pointing at the probe of its type. Building it walks
 * every selected field at every depth, so a field without a rule fails even
 * where the real graph has no entity to reach it.
 */
function probeGraph(): LibraryGraph {
  return {
    fields: mapTypes(() => []),
    entities: mapTypes((type) => [
      {
        id: "1",
        present: [],
        relations: Object.fromEntries(
          Object.keys(RELATIONS[type]).map((field) => [field, [{ id: "1" }]])
        ),
        lengths: {},
        files: [{ present: [], fingerprints: ["oshash"] }],
      },
    ]),
  };
}

/**
 * The replay library for a graph: every field `selections` selects, with a
 * synthetic value (see the module comment), and entities in id order.
 */
export function synthesize(
  graph: LibraryGraph,
  selections: Selections,
  options: { seed?: string } = {}
): ReplayLibrary {
  const seed = options.seed ?? SYNTH_SEED;
  new Synth(probeGraph(), seed).library(selections);
  return new Synth(graph, seed).library(selections);
}
