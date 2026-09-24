/**
 * npm run fixtures:generate [-- --check] (sweep item 83): builds the Stash
 * replay's fixture from the recorded shape, offline and deterministically.
 *
 * Inputs: fixture/shape.json (written by npm run fixtures:record), the
 * query operations in server/graphql/operations (selections.ts), the value
 * rules (synth.ts) and the extension (extend.ts). Outputs, in fixture/:
 * - library.json, the ReplayLibrary the replay serves
 * - manifest.ts, pure literals that vitest and Playwright both load:
 *   FIXTURE_API_KEY, FIXTURE_ID_OFFSET, FIXTURE_LIBRARY (entity counts) and
 *   TEST_ENTITIES (selectTestEntities.ts)
 *
 * It fails, writing nothing, when a selected field has no rule, when the
 * library misses the minimum E2E needs, or when a test entity has no
 * candidate. --check writes nothing and exits 1 when a file would change.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";
import { extend } from "./extend.js";
import {
  ENTITY_TYPES,
  type Entity,
  type EntityType,
  type ReplayLibrary,
  isRecord,
} from "./library.js";
import {
  type RecordedIds,
  TEST_ENTITY_CRITERIA,
  type TestEntities,
  refIds,
  selectTestEntities,
} from "./selectTestEntities.js";
import { type Selections, loadSelections } from "./selections.js";
import {
  type EntityShape,
  FIXTURE_ID_OFFSET,
  type FileShape,
  type RecordedShape,
  type RelationShape,
  synthesize,
} from "./synth.js";

export const FIXTURE_API_KEY = "stash-replay-key";

const FIXTURE_DIR = fileURLToPath(new URL("./fixture/", import.meta.url));

/** Where the command reads and writes. */
export const FIXTURE_PATHS = {
  shapePath: path.join(FIXTURE_DIR, "shape.json"),
  outDir: FIXTURE_DIR,
};

/** FIXTURE_LIBRARY's keys, per entity type. */
const COUNT_KEYS: Record<EntityType, string> = {
  scene: "scenes",
  performer: "performers",
  studio: "studios",
  tag: "tags",
  group: "groups",
  gallery: "galleries",
  image: "images",
  clip: "clips",
};

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
  );
}

function shapeError(source: string, where: string, what: string): Error {
  return new Error(`${source} is not a recorded shape: ${where} ${what}`);
}

function parseRelations(
  value: unknown,
  source: string,
  where: string
): Record<string, RelationShape[]> {
  if (!isRecord(value)) throw shapeError(source, where, "is not an object");
  const relations: Record<string, RelationShape[]> = {};
  for (const [field, list] of Object.entries(value)) {
    if (!Array.isArray(list)) {
      throw shapeError(source, `${where}.${field}`, "is not a list");
    }
    relations[field] = list.map((link: unknown, index) => {
      const at = `${where}.${field}[${index}]`;
      if (!isRecord(link) || typeof link.id !== "string") {
        throw shapeError(source, at, "has no string id");
      }
      if (link.present === undefined) return { id: link.id };
      if (!isStringList(link.present)) {
        throw shapeError(source, `${at}.present`, "is not a list of strings");
      }
      return { id: link.id, present: link.present };
    });
  }
  return relations;
}

function parseFiles(
  value: unknown,
  source: string,
  where: string
): FileShape[] {
  if (!Array.isArray(value)) throw shapeError(source, where, "is not a list");
  return value.map((file: unknown, index) => {
    const at = `${where}[${index}]`;
    if (
      !isRecord(file) ||
      !isStringList(file.present) ||
      !isStringList(file.fingerprints)
    ) {
      throw shapeError(source, at, "needs present and fingerprints lists");
    }
    return { present: file.present, fingerprints: file.fingerprints };
  });
}

function parseEntity(
  value: unknown,
  source: string,
  where: string
): EntityShape {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw shapeError(source, where, "has no string id");
  }
  if (!isStringList(value.present)) {
    throw shapeError(source, `${where}.present`, "is not a list of strings");
  }
  if (!isRecord(value.lengths)) {
    throw shapeError(source, `${where}.lengths`, "is not an object");
  }
  const lengths: Record<string, number> = {};
  for (const [field, length] of Object.entries(value.lengths)) {
    if (typeof length !== "number" || !Number.isInteger(length) || length < 0) {
      throw shapeError(source, `${where}.lengths.${field}`, "is not a count");
    }
    lengths[field] = length;
  }
  const entity: EntityShape = {
    id: value.id,
    present: value.present,
    relations: parseRelations(value.relations, source, `${where}.relations`),
    lengths,
  };
  if (value.files !== undefined) {
    entity.files = parseFiles(value.files, source, `${where}.files`);
  }
  return entity;
}

/** Validates parsed JSON as a recorded shape, naming the first bad part. */
export function parseShape(json: unknown, source: string): RecordedShape {
  if (!isRecord(json) || !isRecord(json.fields) || !isRecord(json.entities)) {
    throw shapeError(source, "the file", "needs fields and entities");
  }
  const { fields, entities } = json;
  const shape: RecordedShape = {
    fields: {
      scene: [],
      performer: [],
      studio: [],
      tag: [],
      group: [],
      gallery: [],
      image: [],
      clip: [],
    },
    entities: {
      scene: [],
      performer: [],
      studio: [],
      tag: [],
      group: [],
      gallery: [],
      image: [],
      clip: [],
    },
  };
  for (const type of ENTITY_TYPES) {
    const typeFields = fields[type];
    if (!isStringList(typeFields)) {
      throw shapeError(source, `fields.${type}`, "is not a list of strings");
    }
    shape.fields[type] = typeFields;
    const list = entities[type];
    if (!Array.isArray(list)) {
      throw shapeError(source, `entities.${type}`, "is not a list");
    }
    shape.entities[type] = list.map((entity: unknown, index) =>
      parseEntity(entity, source, `entities.${type}[${index}]`)
    );
  }
  return shape;
}

function readShape(shapePath: string): RecordedShape {
  let text: string;
  try {
    text = readFileSync(shapePath, "utf8");
  } catch {
    throw new Error(
      `fixtures:generate: no ${shapePath}; npm run fixtures:record (owner, needs STASH_TEST_URL) records it`
    );
  }
  return parseShape(JSON.parse(text) as unknown, shapePath);
}

function firstFile(scene: Entity): Record<string, unknown> | undefined {
  const files = scene.files;
  const first: unknown = Array.isArray(files) ? files[0] : undefined;
  return isRecord(first) ? first : undefined;
}

function streamLabels(scene: Entity): string[] {
  const streams: unknown = scene.sceneStreams;
  if (!Array.isArray(streams)) return [];
  return streams.flatMap((stream: unknown) =>
    isRecord(stream) && typeof stream.label === "string" ? [stream.label] : []
  );
}

/**
 * What the library lacks of E2E's minimum, one phrase each; [] when it
 * meets it.
 */
export function unmetMinimums(library: ReplayLibrary): string[] {
  const { scene, performer, studio, tag, group, gallery, image, clip } =
    library.entities;
  const count = (list: Entity[], field: string, id: string) =>
    list.filter((entity) => refIds(entity[field]).includes(id)).length;
  const genders = new Set(performer.map((each) => each.gender));
  const birthdates = performer.map(
    (each) => typeof each.birthdate === "string"
  );

  const checks: Array<[string, boolean]> = [
    ["30 or more scenes", scene.length >= 30],
    [
      "a performer with 12 or more scenes and 3 or more images",
      performer.some(
        (each) =>
          count(scene, "performers", each.id) >= 12 &&
          count(image, "performers", each.id) >= 3
      ),
    ],
    [
      '3 or more tags whose names contain "a"',
      tag.filter(
        (each) => typeof each.name === "string" && each.name.includes("a")
      ).length >= 3,
    ],
    [
      "a group with scenes",
      group.some((each) => count(scene, "groups", each.id) > 0),
    ],
    [
      "a gallery with 2 or more images",
      gallery.some((each) => count(image, "galleries", each.id) >= 2),
    ],
    ["a clip", clip.length > 0],
    ["a rated scene", scene.some((each) => typeof each.rating100 === "number")],
    [
      "a scene under 720p with Direct stream, a transcode and an HLS label",
      scene.some((each) => {
        const height = firstFile(each)?.height;
        const streams = streamLabels(each);
        return (
          typeof height === "number" &&
          height < 720 &&
          streams.includes("Direct stream") &&
          streams.some((label) => /^(MP4|WEBM)\b/.test(label)) &&
          streams.some((label) => label.startsWith("HLS"))
        );
      }),
    ],
    [
      "a FEMALE and a MALE performer",
      genders.has("FEMALE") && genders.has("MALE"),
    ],
    [
      "performers with and without a birthdate",
      birthdates.includes(true) && birthdates.includes(false),
    ],
    [
      "a studio with a parent",
      studio.some((each) => isRecord(each.parent_studio)),
    ],
    [
      "a tag with a parent",
      tag.some((each) => refIds(each.parents).length > 0),
    ],
  ];
  return checks.filter(([, met]) => !met).map(([phrase]) => phrase);
}

function recordedIds(shape: RecordedShape): RecordedIds {
  const ids = (type: EntityType) =>
    new Set(shape.entities[type].map((entity) => entity.id));
  return {
    scene: ids("scene"),
    performer: ids("performer"),
    studio: ids("studio"),
    tag: ids("tag"),
    group: ids("group"),
    gallery: ids("gallery"),
    image: ids("image"),
    clip: ids("clip"),
  };
}

function renderManifest(
  library: ReplayLibrary,
  testEntities: TestEntities
): string {
  return [
    "// Generated by npm run fixtures:generate; do not edit",
    "",
    `export const FIXTURE_API_KEY = ${JSON.stringify(FIXTURE_API_KEY)};`,
    "",
    `export const FIXTURE_ID_OFFSET = ${FIXTURE_ID_OFFSET};`,
    "",
    "export const FIXTURE_LIBRARY = {",
    ...ENTITY_TYPES.map(
      (type) => `  ${COUNT_KEYS[type]}: ${library.entities[type].length},`
    ),
    "};",
    "",
    "export const TEST_ENTITIES = {",
    ...Object.entries(testEntities).map(
      ([key, id]) => `  ${key}: ${JSON.stringify(id)},`
    ),
    "};",
    "",
  ].join("\n");
}

export interface Fixture {
  library: ReplayLibrary;
  testEntities: TestEntities;
  /** The output files' contents, by file name. */
  files: { "library.json": string; "manifest.ts": string };
}

/** The fixture for a recorded shape, in memory. */
export function buildFixture(
  shape: RecordedShape,
  selections: Selections = loadSelections()
): Fixture {
  const library = synthesize(extend(shape), selections);
  const unmet = unmetMinimums(library);
  if (unmet.length > 0) {
    throw new Error(
      `fixtures:generate: the library misses E2E's minimum:\n${unmet.map((phrase) => `  - ${phrase}`).join("\n")}`
    );
  }
  const recorded = recordedIds(shape);
  const testEntities = selectTestEntities(library, recorded);
  // Live runs look these ids up in the test Stash itself
  for (const { key, type } of TEST_ENTITY_CRITERIA) {
    const id = testEntities[key];
    if (id !== "" && !recorded[type].has(id)) {
      throw new Error(
        `fixtures:generate: TEST_ENTITIES.${key} is ${type} ${id}, which is not recorded`
      );
    }
  }
  return {
    library,
    testEntities,
    files: {
      "library.json": `${JSON.stringify(library, null, 2)}\n`,
      "manifest.ts": renderManifest(library, testEntities),
    },
  };
}

function readIfPresent(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Builds the fixture from `shapePath` into `outDir` and returns the files
 * that changed. With `check`, writes nothing and returns the files that
 * would change.
 */
export function generate(options: {
  shapePath: string;
  outDir: string;
  check: boolean;
}): string[] {
  const { files } = buildFixture(readShape(options.shapePath));
  const changed = Object.entries(files).filter(
    ([name, content]) =>
      readIfPresent(path.join(options.outDir, name)) !== content
  );
  if (!options.check && changed.length > 0) {
    mkdirSync(options.outDir, { recursive: true });
    for (const [name, content] of changed) {
      writeFileSync(path.join(options.outDir, name), content);
    }
  }
  return changed.map(([name]) => path.join(options.outDir, name));
}

type Log = (line: string, isError?: boolean) => void;

const printLine: Log = (line, isError = false) => {
  (isError ? process.stderr : process.stdout).write(`${line}\n`);
};

/** The command: returns its exit code (0 ok, 1 failed or would change, 2 usage). */
export function main(
  argv: string[],
  paths: { shapePath: string; outDir: string } = FIXTURE_PATHS,
  log: Log = printLine
): number {
  let check: boolean;
  try {
    check =
      parseArgs({
        args: argv,
        options: { check: { type: "boolean", default: false } },
        strict: true,
        allowPositionals: false,
      }).values.check ?? false;
  } catch (error) {
    log(
      `fixtures:generate: ${error instanceof Error ? error.message : String(error)}\nUsage: npm run fixtures:generate [-- --check]`,
      true
    );
    return 2;
  }
  let changed: string[];
  try {
    changed = generate({ ...paths, check });
  } catch (error) {
    log(error instanceof Error ? error.message : String(error), true);
    return 1;
  }
  const names = changed.map((file) => path.basename(file)).join(", ");
  if (check && changed.length > 0) {
    log(
      `fixtures:generate --check: ${names} would change; run npm run fixtures:generate`,
      true
    );
    return 1;
  }
  log(
    changed.length > 0
      ? `fixtures:generate: wrote ${names}`
      : "fixtures:generate: the fixture is up to date"
  );
  return 0;
}

const invokedAs = process.argv[1];
if (
  invokedAs !== undefined &&
  import.meta.url === pathToFileURL(invokedAs).href
) {
  process.exitCode = main(process.argv.slice(2));
}
