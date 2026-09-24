/**
 * npm run fixtures:record [-- --check] (sweep item 83): records the shape of
 * the test Stash into fixture/shape.json and regenerates the replay fixture
 * from it. The owner runs it, read only, after changing the test Stash.
 *
 * - It reads STASH_TEST_URL and STASH_TEST_API_KEY from the root .env (a
 *   variable set in the shell wins, as dotenv does), refuses when that is
 *   the same Stash as STASH_URL, and never prints the key.
 * - It fetches every entity type whole (per_page: -1), selecting every field
 *   Peek's queries select (fieldPaths in selections.ts), plus Version and
 *   Configuration. Every document is checked to be a query before it is
 *   sent.
 * - shape.json keeps no value: new ids (the Stash id plus FIXTURE_ID_OFFSET),
 *   relations as new ids, which scalar fields were set, list lengths, and
 *   per file its set fields and fingerprint types.
 * - The generator (generate.ts) then builds library.json and manifest.ts in
 *   memory, and the guard checks all three files against the source values
 *   still in memory. A failure prints JSON paths only, never values, and
 *   writes nothing. A source string that is repo text the generator writes
 *   from (a selected field name, or part of synth.ts) is exempt, as its
 *   presence in the output says nothing about the test Stash; dates,
 *   measurements and ids have no such exemption.
 *
 * --check writes nothing and exits 1 when a file would change: run against
 * the test Stash, it detects drift.
 */
import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import {
  Kind,
  type OperationDefinitionNode,
  OperationTypeNode,
  parse,
} from "graphql";
import { ClientError, GraphQLClient } from "graphql-request";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";
import { sameStash } from "../helpers/stashTarget.js";
import { FIXTURE_PATHS, buildFixture } from "./generate.js";
import {
  ENTITY_TYPES,
  type EntityType,
  LIST_ROOTS,
  SINGLE_ROOTS,
  isRecord,
} from "./library.js";
import { TEST_ENTITY_CRITERIA } from "./selectTestEntities.js";
import {
  RELATIONS,
  type Relation,
  type SelectionTree,
  type Selections,
  fieldPaths,
  loadSelections,
} from "./selections.js";
import {
  type EntityShape,
  FIXTURE_ID_OFFSET,
  type FileShape,
  type RecordedShape,
  type RelationShape,
} from "./synth.js";

/** An entity as Stash returned it: relations are { id } objects. */
export type RawEntity = Record<string, unknown>;

/** Everything the recorder fetched: the source values, held in memory only. */
export interface RawStash {
  version: Record<string, unknown>;
  configuration: Record<string, unknown>;
  entities: Record<EntityType, RawEntity[]>;
}

/** Sends one GraphQL document to the test Stash and resolves its data. */
export type StashRequest = (document: string) => Promise<unknown>;

export interface StashTestTarget {
  url: string;
  apiKey: string;
}

type Env = Record<string, string | undefined>;
type Log = (line: string, isError?: boolean) => void;

const ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));

const SYNTH_FILE = "server/integration/stash-replay/synth.ts";
const SYNTH_SOURCE = fileURLToPath(new URL("./synth.ts", import.meta.url));

function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
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

/** Per entity type, its list query and the list key of the answer. */
const TYPE_ROOTS = mapTypes((type): [string, string] => {
  const entry = Object.entries(LIST_ROOTS).find(
    ([, [target]]) => target === type
  );
  if (entry === undefined) {
    throw new Error(`fixtures:record: no list query answers ${type}`);
  }
  return [entry[0], entry[1][1]];
});

const LABELS: Record<EntityType, [string, string]> = {
  scene: ["scene", "scenes"],
  performer: ["performer", "performers"],
  studio: ["studio", "studios"],
  tag: ["tag", "tags"],
  group: ["group", "groups"],
  gallery: ["gallery", "galleries"],
  image: ["image", "images"],
  clip: ["clip", "clips"],
};

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

/**
 * The test Stash to record. `fileEnv` is the parsed root .env, `shellEnv`
 * process.env: a key present in the shell wins, and a value counts only when
 * non-empty. Refuses when STASH_TEST_URL is the same Stash as STASH_URL from
 * either place. Its errors never hold the key.
 */
export function recordTarget(fileEnv: Env, shellEnv: Env): StashTestTarget {
  const read = (key: string): string | undefined => {
    const value = key in shellEnv ? shellEnv[key] : fileEnv[key];
    return value ? value : undefined;
  };
  const url = read("STASH_TEST_URL");
  const apiKey = read("STASH_TEST_API_KEY");
  if (url === undefined || apiKey === undefined) {
    throw new Error(
      "fixtures:record needs the test Stash: set STASH_TEST_URL and STASH_TEST_API_KEY in the root .env"
    );
  }
  try {
    new URL(url);
  } catch {
    throw new Error("fixtures:record: STASH_TEST_URL is not a URL");
  }
  const production = [fileEnv.STASH_URL, shellEnv.STASH_URL].filter(
    (value): value is string => typeof value === "string" && value !== ""
  );
  if (production.some((stashUrl) => sameStash(url, stashUrl))) {
    throw new Error(
      "fixtures:record: STASH_TEST_URL is the same Stash as STASH_URL. It records only a separate test Stash; point STASH_TEST_URL at one."
    );
  }
  return { url, apiKey };
}

function readRootEnv(): { fileEnv: Env; shellEnv: Env } {
  const fileEnv = existsSync(ROOT_ENV)
    ? dotenv.parse(readFileSync(ROOT_ENV))
    : {};
  return { fileEnv, shellEnv: { ...process.env } };
}

/** Sends through graphql-request with the ApiKey header, as Peek does. */
function graphqlRequest(target: StashTestTarget): StashRequest {
  const client = new GraphQLClient(target.url, {
    headers: { ApiKey: target.apiKey },
  });
  return (document) => client.request<unknown>(document);
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/** GraphQL validation errors name schema fields only; others may quote data. */
const SAFE_ERRORS = [
  /^Cannot query field "\w+" on type "\w+"\.?$/,
  /^Unknown argument "\w+" on field "[\w.]+"\.?$/,
];

/** What went wrong with a request, without anything Stash sent back. */
function describeRequestError(error: unknown): string {
  if (error instanceof ClientError) {
    const messages = (error.response.errors ?? []).map(
      (graphqlError) => graphqlError.message
    );
    const safe = messages.filter((message) =>
      SAFE_ERRORS.some((pattern) => pattern.test(message))
    );
    const withheld = messages.length - safe.length;
    return [
      `HTTP ${error.response.status}`,
      ...safe,
      ...(withheld > 0
        ? [
            `${withheld} error message(s) withheld, as they may quote library values`,
          ]
        : []),
    ].join("; ");
  }
  if (error instanceof Error) {
    const cause: unknown = "cause" in error ? error.cause : undefined;
    const code =
      isRecord(cause) && typeof cause.code === "string"
        ? ` (${cause.code})`
        : "";
    return `${error.name}${code}`;
  }
  return "an unknown error";
}

/**
 * Sends `document` if every operation in it is a query, and returns its
 * data. A mutation or subscription is refused before anything is sent.
 */
export async function sendQuery(
  request: StashRequest,
  document: string
): Promise<Record<string, unknown>> {
  const operations = parse(document).definitions.filter(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION
  );
  const name = (operation: OperationDefinitionNode) =>
    operation.name?.value ?? `an anonymous ${operation.operation}`;
  const refused = operations.find(
    (operation) => operation.operation !== OperationTypeNode.QUERY
  );
  if (refused !== undefined || operations.length === 0) {
    throw new Error(
      `fixtures:record refuses to send ${refused ? name(refused) : "a document without an operation"}: it sends queries only`
    );
  }
  const label = operations.map(name).join(", ");
  let data: unknown;
  try {
    data = await request(document);
  } catch (error) {
    throw new Error(
      `fixtures:record: ${label} failed: ${describeRequestError(error)}`
    );
  }
  if (!isRecord(data)) {
    throw new Error(`fixtures:record: ${label} returned no data`);
  }
  return data;
}

type Tree = Map<string, Tree>;

function child(tree: Tree, name: string): Tree {
  let sub = tree.get(name);
  if (sub === undefined) {
    sub = new Map();
    tree.set(name, sub);
  }
  return sub;
}

function printTree(tree: Tree): string {
  const fields = [...tree].map(([name, sub]) =>
    sub.size === 0 ? name : `${name} ${printTree(sub)}`
  );
  return `{ ${fields.join(" ")} }`;
}

/**
 * The selection for one type's field paths: every scalar and object leaf,
 * and each relation as the referenced ids (a link's own fields beside it).
 */
function recordSelection(type: EntityType, fields: string[]): Tree {
  const tree: Tree = new Map();
  for (const fieldPath of fields) {
    const [root = "", ...rest] = fieldPath.split(".");
    const relation = own(RELATIONS[type], root);
    if (relation === undefined) {
      let node = tree;
      for (const part of [root, ...rest]) node = child(node, part);
      continue;
    }
    const node = child(tree, root);
    const target =
      relation.via === undefined ? node : child(node, relation.via);
    child(target, "id");
    if (relation.via !== undefined && rest.length > 0) {
      child(node, rest.join("."));
    }
  }
  return tree;
}

function printSelectionTree(tree: SelectionTree): string {
  const fields = Object.entries(tree).map(([name, field]) =>
    field.fields === undefined
      ? name
      : `${name} ${printSelectionTree(field.fields)}`
  );
  return `{ ${fields.join(" ")} }`;
}

function capitalized(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/** The query that fetches every entity of a type with `fields`. */
export function recordQuery(type: EntityType, fields: string[]): string {
  const [root, listKey] = TYPE_ROOTS[type];
  return `query FixturesRecord${capitalized(type)} { ${root}(filter: { per_page: -1 }) { count ${listKey} ${printTree(recordSelection(type, fields))} } }`;
}

/** Fetches every entity type whole, plus Version and Configuration. */
export async function fetchRawStash(
  request: StashRequest,
  selections: Selections
): Promise<RawStash> {
  const fields = fieldPaths(selections);
  const fetchType = async (type: EntityType): Promise<RawEntity[]> => {
    const [root, listKey] = TYPE_ROOTS[type];
    const data = await sendQuery(request, recordQuery(type, fields[type]));
    const answer = data[root];
    const list: unknown = isRecord(answer) ? answer[listKey] : undefined;
    if (!isRecord(answer) || !Array.isArray(list)) {
      throw new Error(`fixtures:record: ${root} returned no ${listKey} list`);
    }
    if (list.length !== answer.count) {
      throw new Error(
        `fixtures:record: ${root} returned ${list.length} ${listKey} of its count`
      );
    }
    return list.map((entity: unknown, index) => {
      if (!isRecord(entity)) {
        throw new Error(
          `fixtures:record: ${root}.${listKey}[${index}] is not an object`
        );
      }
      return entity;
    });
  };
  const fetchStash = async (
    root: "version" | "configuration"
  ): Promise<Record<string, unknown>> => {
    const data = await sendQuery(
      request,
      `query FixturesRecord${capitalized(root)} { ${root} ${printSelectionTree(selections.stash[root])} }`
    );
    const answer = data[root];
    if (!isRecord(answer)) {
      throw new Error(`fixtures:record: ${root} returned no object`);
    }
    return answer;
  };
  const entities: Record<EntityType, RawEntity[]> = mapTypes(() => []);
  for (const type of ENTITY_TYPES) {
    entities[type] = await fetchType(type);
  }
  return {
    version: await fetchStash("version"),
    configuration: await fetchStash("configuration"),
    entities,
  };
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** Set: not null, and not "" for a string. */
function isSet(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function valueAt(record: RawEntity, fieldPath: string): unknown {
  let value: unknown = record;
  for (const part of fieldPath.split(".")) {
    value = isRecord(value) ? value[part] : undefined;
  }
  return value;
}

/** The fixture id of a Stash id: an autoincrement number plus the offset. */
function newId(value: unknown, where: string): string {
  const id =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new Error(`fixtures:record: ${where} has no numeric id`);
  }
  return String(id + FIXTURE_ID_OFFSET);
}

function rootOf(fieldPath: string): string {
  return fieldPath.split(".")[0] ?? fieldPath;
}

function relationShape(
  relation: Relation,
  value: unknown,
  linkFields: string[],
  where: string
): RelationShape[] {
  const links: unknown[] =
    value === null || value === undefined
      ? []
      : Array.isArray(value)
        ? value
        : [value];
  return links.map((link, index) => {
    const at = `${where}[${index}]`;
    if (!isRecord(link)) {
      throw new Error(`fixtures:record: ${at} is not an object`);
    }
    if (relation.via === undefined) return { id: newId(link.id, at) };
    const target = link[relation.via];
    return {
      id: newId(isRecord(target) ? target.id : undefined, at),
      present: linkFields.filter((field) => isSet(link[field])),
    };
  });
}

function fileShapes(
  value: unknown,
  fields: string[],
  where: string
): FileShape[] {
  const fileFields = fields
    .filter((fieldPath) => /^files\.[^.]+$/.test(fieldPath))
    .map((fieldPath) => fieldPath.slice("files.".length));
  const files: unknown[] = Array.isArray(value) ? value : [];
  return files.map((file, index) => {
    if (!isRecord(file)) {
      throw new Error(`fixtures:record: ${where}[${index}] is not an object`);
    }
    const fingerprints: unknown[] = Array.isArray(file.fingerprints)
      ? file.fingerprints
      : [];
    return {
      present: fileFields.filter((field) => isSet(file[field])),
      fingerprints: fingerprints.map((fingerprint, at) => {
        if (!isRecord(fingerprint) || typeof fingerprint.type !== "string") {
          throw new Error(
            `fixtures:record: ${where}[${index}].fingerprints[${at}] has no type`
          );
        }
        return fingerprint.type;
      }),
    };
  });
}

function entityShape(
  type: EntityType,
  raw: RawEntity,
  fields: string[],
  lists: ReadonlySet<string>,
  where: string
): EntityShape {
  const shape: EntityShape = {
    id: newId(raw.id, where),
    present: [],
    relations: {},
    lengths: {},
  };
  const roots = [...new Set(fields.map(rootOf))];
  for (const root of roots) {
    const relation = own(RELATIONS[type], root);
    if (relation !== undefined) {
      const linkFields = fields
        .filter((fieldPath) => fieldPath.startsWith(`${root}.`))
        .map((fieldPath) => fieldPath.slice(root.length + 1));
      shape.relations[root] = relationShape(
        relation,
        raw[root],
        linkFields,
        `${where}.${root}`
      );
    } else if (lists.has(root)) {
      const list = raw[root];
      shape.lengths[root] = Array.isArray(list) ? list.length : 0;
    }
  }
  shape.present = fields.filter((fieldPath) => {
    const root = rootOf(fieldPath);
    return (
      own(RELATIONS[type], root) === undefined &&
      root !== "files" &&
      !lists.has(root) &&
      isSet(valueAt(raw, fieldPath))
    );
  });
  if (fields.some((fieldPath) => fieldPath.startsWith("files."))) {
    shape.files = fileShapes(raw.files, fields, `${where}.files`);
  }
  return shape;
}

/**
 * The fields of `type` whose value is a list (urls, aliases, stash_ids ...),
 * found from the answers: relations and files are recorded apart.
 */
function listFields(
  type: EntityType,
  entities: RawEntity[],
  fields: string[]
): Set<string> {
  const lists = new Set<string>();
  for (const root of new Set(fields.map(rootOf))) {
    if (own(RELATIONS[type], root) !== undefined || root === "files") continue;
    if (entities.some((entity) => Array.isArray(entity[root]))) lists.add(root);
  }
  return lists;
}

/** The recorded shape of a raw Stash: no value but the new ids. */
export function recordShape(
  raw: RawStash,
  selections: Selections = loadSelections()
): RecordedShape {
  const fields = fieldPaths(selections);
  return {
    fields,
    entities: mapTypes((type) => {
      const list = raw.entities[type];
      const lists = listFields(type, list, fields[type]);
      return list
        .map((entity, index) =>
          entityShape(type, entity, fields[type], lists, `${type}[${index}]`)
        )
        .sort((a, b) => Number(a.id) - Number(b.id));
    }),
  };
}

/**
 * shape.json's text: JSON with two-space indents, where a list of plain
 * values or anything short stays on one line.
 */
export function stringifyShape(shape: RecordedShape): string {
  const format = (value: unknown, indent: string): string => {
    const flat = JSON.stringify(value);
    const plainList =
      Array.isArray(value) &&
      value.every((item) => item === null || typeof item !== "object");
    if (!Array.isArray(value) && !isRecord(value)) return flat;
    if (plainList || flat.length + indent.length <= 80) return flat;
    const inner = `${indent}  `;
    if (Array.isArray(value)) {
      const items = value.map(
        (item: unknown) => `${inner}${format(item, inner)}`
      );
      return `[\n${items.join(",\n")}\n${indent}]`;
    }
    const entries = Object.entries(value).map(
      ([key, item]) => `${inner}${JSON.stringify(key)}: ${format(item, inner)}`
    );
    return `{\n${entries.join(",\n")}\n${indent}}`;
  };
  return `${format(shape, "")}\n`;
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/** One leaf of a JSON value, where it sits, and how the guard treats it. */
interface Leaf {
  /** The JSON path, such as entities.scene[0].files[0].size. */
  path: string;
  /** The key the value sits under. */
  key: string;
  value: string | number;
  /** For an id: the type it is an id of ("scene", "image.files"). */
  idType?: string;
  /** A schema constant (enum value, stream label): not checked. */
  exempt: boolean;
  /** A count, rating or activity counter: not a measurement. */
  countLike: boolean;
}

/** Per id type, source id to the path it was first seen at. */
type SourceIds = Map<string, Map<string, string>>;

/** The source values the guard looks for, each with its first source path. */
export interface SourceValues {
  /** Strings of 4 or more characters, lowercased. */
  strings: Map<string, string>;
  /** YYYY-MM-DD dates from any date or timestamp. */
  dates: Map<string, string>;
  /** Measurements (see MEASUREMENTS) and t= epoch stamps. */
  measurements: Map<number, string>;
  ids: SourceIds;
  /** How many distinct source strings were exempt as repo text. */
  exempt: number;
}

/** Number fields that measure something real: never copied to the output. */
const MEASUREMENTS = new Set([
  "size",
  "duration",
  "bit_rate",
  "frame_rate",
  "width",
  "height",
  "height_cm",
  "weight",
  "penis_length",
  "seconds",
  "end_seconds",
]);

/** Small user-activity integers and positions, exempt from the number check. */
const COUNT_KEYS = new Set([
  "count",
  "rating100",
  "o_counter",
  "play_count",
  "play_duration",
  "resume_time",
  "scene_index",
  "image_index",
]);

const DATE = /\d{4}-\d{2}-\d{2}/g;
const DIGIT_RUN = /\d{5,}/g;
const T_STAMP = /[?&]t=(\d+)/g;

function joinPath(at: string, key: string): string {
  return at === "" ? key : `${at}.${key}`;
}

function isCountLike(key: string): boolean {
  return COUNT_KEYS.has(key) || key.endsWith("_count");
}

/** Enum values and Stash's stream labels, as the generator assigns them. */
function isSchemaConstant(scope: string, key: string): boolean {
  return (
    (scope === "performer" && (key === "gender" || key === "circumcised")) ||
    (scope.endsWith(".fingerprints") && key === "type") ||
    (scope.endsWith(".sceneStreams") && key === "label")
  );
}

/**
 * Leaves of a value that is not an entity: `scope` names its owner, such as
 * "scene" for a scene's own fields or "scene.files" inside its files.
 */
function plainLeaves(
  scope: string,
  key: string,
  value: unknown,
  at: string,
  out: Leaf[]
): void {
  if (typeof value === "string" || typeof value === "number") {
    out.push({
      path: at,
      key,
      value,
      idType: key === "id" ? scope : undefined,
      exempt: isSchemaConstant(scope, key),
      countLike: isCountLike(key),
    });
  } else if (Array.isArray(value)) {
    value.forEach((item: unknown, index) => {
      plainLeaves(scope, key, item, `${at}[${index}]`, out);
    });
  } else if (isRecord(value)) {
    const inner = key === "" ? scope : `${scope}.${key}`;
    for (const [name, item] of Object.entries(value)) {
      plainLeaves(inner, name, item, joinPath(at, name), out);
    }
  }
}

/** Leaves of an entity of `type`, its references typed by RELATIONS. */
function entityLeaves(
  type: EntityType,
  value: unknown,
  at: string,
  out: Leaf[]
): void {
  if (!isRecord(value)) {
    plainLeaves(type, "", value, at, out);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const itemPath = joinPath(at, key);
    const relation = own(RELATIONS[type], key);
    if (relation === undefined) {
      plainLeaves(type, key, item, itemPath, out);
      continue;
    }
    const links: Array<[unknown, string]> = Array.isArray(item)
      ? item.map((link: unknown, index) => [link, `${itemPath}[${index}]`])
      : [[item, itemPath]];
    for (const [link, linkPath] of links) {
      const { via } = relation;
      if (via === undefined || !isRecord(link)) {
        entityLeaves(relation.target, link, linkPath, out);
        continue;
      }
      for (const [linkKey, linkValue] of Object.entries(link)) {
        const fieldPath = joinPath(linkPath, linkKey);
        if (linkKey === via) {
          entityLeaves(relation.target, linkValue, fieldPath, out);
        } else {
          plainLeaves(`${type}.${key}`, linkKey, linkValue, fieldPath, out);
        }
      }
    }
  }
}

function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

function entitiesLeaves(
  entities: Record<string, unknown>,
  at: string,
  out: Leaf[]
): void {
  for (const [type, list] of Object.entries(entities)) {
    const listPath = joinPath(at, type);
    if (isEntityType(type) && Array.isArray(list)) {
      list.forEach((entity: unknown, index) => {
        entityLeaves(type, entity, `${listPath}[${index}]`, out);
      });
    } else {
      plainLeaves(type, "", list, listPath, out);
    }
  }
}

/** The source leaves, paths such as scene[3].files[0].basename. */
function rawLeaves(raw: RawStash): Leaf[] {
  const out: Leaf[] = [];
  plainLeaves("version", "", raw.version, "version", out);
  plainLeaves("configuration", "", raw.configuration, "configuration", out);
  entitiesLeaves(raw.entities, "", out);
  return out;
}

/**
 * Text already public in the repo that the generator writes from,
 * lowercased: every field name the merged selections hold (fieldPaths of
 * every entity type, the root fields, the Version and Configuration fields)
 * and the source of synth.ts (its constants, labels and URL templates).
 */
export function repoText(selections: Selections = loadSelections()): string[] {
  const names = new Set<string>([
    ...ENTITY_TYPES.flatMap((type) => fieldPaths(selections)[type]),
    ...Object.keys(LIST_ROOTS),
    ...Object.keys(SINGLE_ROOTS),
    "version",
    "configuration",
  ]);
  const addTree = (tree: SelectionTree, prefix: string) => {
    for (const [name, field] of Object.entries(tree)) {
      const fieldPath = `${prefix}.${name}`;
      names.add(fieldPath);
      if (field.fields !== undefined) addTree(field.fields, fieldPath);
    }
  };
  addTree(selections.stash.version, "version");
  addTree(selections.stash.configuration, "configuration");
  return [
    ...[...names].map((name) => name.toLowerCase()),
    readFileSync(SYNTH_SOURCE, "utf8").toLowerCase(),
  ];
}

/**
 * Everything the guard must not find in the output. A source string that
 * is a substring of `repo` (repoText) is exempt and only counted; its dates
 * and t= stamps still count.
 */
export function collectSources(
  raw: RawStash,
  repo: readonly string[] = repoText()
): SourceValues {
  const sources: SourceValues = {
    strings: new Map(),
    dates: new Map(),
    measurements: new Map(),
    ids: new Map(),
    exempt: 0,
  };
  const exempt = new Set<string>();
  const remember = <K>(map: Map<K, string>, key: K, at: string) => {
    if (!map.has(key)) map.set(key, at);
  };
  for (const leaf of rawLeaves(raw)) {
    if (leaf.exempt) continue;
    const { value, path: at } = leaf;
    if (leaf.idType !== undefined) {
      // Ids have no content; the id rule covers them
      let ids = sources.ids.get(leaf.idType);
      if (ids === undefined) {
        ids = new Map();
        sources.ids.set(leaf.idType, ids);
      }
      remember(ids, String(value), at);
      continue;
    }
    if (typeof value === "number") {
      // A zero measures nothing
      if (MEASUREMENTS.has(leaf.key) && value !== 0) {
        remember(sources.measurements, value, at);
      }
      continue;
    }
    const lower = value.toLowerCase();
    if (lower.length >= 4) {
      if (repo.some((text) => text.includes(lower))) exempt.add(lower);
      else remember(sources.strings, lower, at);
    }
    for (const date of value.match(DATE) ?? []) {
      remember(sources.dates, date, at);
    }
    for (const match of value.matchAll(T_STAMP)) {
      const stamp = Number(match[1]);
      if (stamp !== 0) remember(sources.measurements, stamp, at);
    }
  }
  sources.exempt = exempt.size;
  return sources;
}

/** library.json's leaves, entities typed by RELATIONS. */
function libraryLeaves(json: unknown): Leaf[] {
  const out: Leaf[] = [];
  if (!isRecord(json)) {
    plainLeaves("library", "", json, "", out);
    return out;
  }
  for (const [key, value] of Object.entries(json)) {
    if (key === "entities" && isRecord(value)) {
      entitiesLeaves(value, "entities", out);
    } else if (key === "stash" && isRecord(value)) {
      for (const [name, answer] of Object.entries(value)) {
        plainLeaves(name, "", answer, `stash.${name}`, out);
      }
    } else {
      plainLeaves("library", key, value, key, out);
    }
  }
  return out;
}

/** shape.json's leaves: ids typed by where they sit, lengths as counts. */
function shapeLeaves(json: unknown): Leaf[] {
  const out: Leaf[] = [];
  plainLeaves("shape", "", json, "", out);
  return out.map((leaf) => {
    const entity = /^entities\.(\w+)\[\d+\]\.id$/.exec(leaf.path);
    const link = /^entities\.(\w+)\[\d+\]\.relations\.(\w+)\[\d+\]\.id$/.exec(
      leaf.path
    );
    let idType: string | undefined;
    if (entity?.[1] !== undefined) {
      idType = entity[1];
    } else if (link?.[1] !== undefined && link[2] !== undefined) {
      const [, type, field] = link;
      const relation = isEntityType(type)
        ? own(RELATIONS[type], field)
        : undefined;
      idType = relation?.target ?? `${type}.${field}`;
    }
    return {
      ...leaf,
      idType,
      exempt: /\.files\[\d+\]\.fingerprints\[\d+\]$/.test(leaf.path),
      countLike: typeof leaf.value === "number",
    };
  });
}

/** manifest.ts's literals, by exported name. Throws when it holds more. */
function manifestValues(text: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const rest = text
    .replace(/^\/\/.*$/gm, "")
    .replace(
      /^export const (\w+) = ([\s\S]*?);$/gm,
      (_declaration, name: string, literal: string) => {
        const json = literal
          .replace(/^(\s*)(\w+):/gm, '$1"$2":')
          .replace(/,(\s*[}\]])/g, "$1");
        values[name] = JSON.parse(json) as unknown;
        return "";
      }
    );
  if (rest.trim() !== "") {
    throw new Error("manifest.ts holds more than exported literals");
  }
  return values;
}

/** manifest.ts's leaves: TEST_ENTITIES ids typed, numbers as counts. */
function manifestLeaves(text: string): Leaf[] {
  const out: Leaf[] = [];
  plainLeaves("manifest", "", manifestValues(text), "", out);
  const types = new Map<string, string>(
    TEST_ENTITY_CRITERIA.map(({ key, type }) => [`TEST_ENTITIES.${key}`, type])
  );
  return out.map((leaf) => ({
    ...leaf,
    idType: types.get(leaf.path),
    countLike: typeof leaf.value === "number",
  }));
}

function outputLeaves(name: string, text: string): Leaf[] {
  if (name.endsWith(".ts")) return manifestLeaves(text);
  const json = JSON.parse(text) as unknown;
  return name === "shape.json" ? shapeLeaves(json) : libraryLeaves(json);
}

/** Why a leaf matches a source value, or undefined when it does not. */
function sourceMatch(leaf: Leaf, sources: SourceValues): string | undefined {
  const { value } = leaf;
  if (typeof value === "number") {
    const at = leaf.countLike ? undefined : sources.measurements.get(value);
    return at === undefined ? undefined : `equals a source measurement (${at})`;
  }
  if (leaf.idType !== undefined) {
    const at = sources.ids.get(leaf.idType)?.get(value);
    if (at !== undefined) {
      return `equals a source ${leaf.idType} id (${at})`;
    }
  }
  const lower = value.toLowerCase();
  for (const [source, at] of sources.strings) {
    if (lower.includes(source)) return `contains a source string (${at})`;
  }
  for (const date of value.match(DATE) ?? []) {
    const at = sources.dates.get(date);
    if (at !== undefined) return `contains a source date (${at})`;
  }
  for (const run of value.match(DIGIT_RUN) ?? []) {
    const at = sources.measurements.get(Number(run));
    if (at !== undefined) return `contains a source measurement (${at})`;
  }
  return undefined;
}

/**
 * Checks the output files (by name: shape.json, library.json, manifest.ts)
 * against the source values. Returns one line per hit, as
 * `<file>:<JSON path>: <what> (<source path>)`: paths only, never values.
 */
export function guardFixture(
  sources: SourceValues,
  files: Record<string, string>
): string[] {
  const hits: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    let leaves: Leaf[];
    try {
      leaves = outputLeaves(name, text);
    } catch {
      hits.push(`${name}: the guard cannot read it`);
      continue;
    }
    for (const leaf of leaves) {
      if (leaf.exempt) continue;
      const match = sourceMatch(leaf, sources);
      if (match !== undefined) hits.push(`${name}:${leaf.path}: ${match}`);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

function countPhrase(lists: Record<EntityType, unknown[]>): string {
  return ENTITY_TYPES.map((type) => {
    const count = lists[type].length;
    const [one, many] = LABELS[type];
    return `${count} ${count === 1 ? one : many}`;
  }).join(", ");
}

function readIfPresent(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

const printLine: Log = (line, isError = false) => {
  (isError ? process.stderr : process.stdout).write(`${line}\n`);
};

export interface RecordOptions {
  /** The root .env and the shell; read from disk and process.env by default. */
  env?: { fileEnv: Env; shellEnv: Env };
  /** Builds the request function; graphql-request by default. */
  request?: (target: StashTestTarget) => StashRequest;
  /** Where the three files go; fixture/ by default. */
  outDir?: string;
  log?: Log;
}

/** The command: returns its exit code (0 ok, 1 failed or would change, 2 usage). */
export async function main(
  argv: string[],
  options: RecordOptions = {}
): Promise<number> {
  const log = options.log ?? printLine;
  const outDir = options.outDir ?? FIXTURE_PATHS.outDir;
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
      `fixtures:record: ${error instanceof Error ? error.message : String(error)}\nUsage: npm run fixtures:record [-- --check]`,
      true
    );
    return 2;
  }

  let target: StashTestTarget;
  try {
    const env = options.env ?? readRootEnv();
    target = recordTarget(env.fileEnv, env.shellEnv);
  } catch (error) {
    log(error instanceof Error ? error.message : String(error), true);
    return 1;
  }
  log(
    `fixtures:record: reading the test Stash at ${new URL(target.url).origin}`
  );

  let files: Record<string, string>;
  let summary: string;
  let hits: string[];
  try {
    const selections = loadSelections();
    const raw = await fetchRawStash(
      (options.request ?? graphqlRequest)(target),
      selections
    );
    const shape = recordShape(raw, selections);
    const fixture = buildFixture(shape, selections);
    files = { "shape.json": stringifyShape(shape), ...fixture.files };
    const sources = collectSources(raw, repoText(selections));
    hits = guardFixture(sources, files);
    const exempt = `${sources.exempt} source ${sources.exempt === 1 ? "string" : "strings"} exempt as repo text`;
    summary = `shape: ${countPhrase(shape.entities)}; library after extension: ${countPhrase(fixture.library.entities)}; guard: ${hits.length === 0 ? "clean" : `${hits.length} hits`} (${exempt})`;
  } catch (error) {
    // Messages from this module and the generator name paths, never values
    log(error instanceof Error ? error.message : String(error), true);
    return 1;
  }
  log(summary);
  if (hits.length > 0) {
    log(
      [
        "fixtures:record: the output holds source values, so nothing was written. Output paths, with the source path each matches (values withheld):",
        ...hits.map((hit) => `  ${hit}`),
        `If only file sizes, bit rates or dates match (values the generator draws at random), bump SYNTH_SEED in ${SYNTH_FILE} (peek-stash-replay-v1 to -v2) and record again.`,
      ].join("\n"),
      true
    );
    return 1;
  }

  const changed = Object.entries(files).filter(
    ([name, content]) => readIfPresent(path.join(outDir, name)) !== content
  );
  if (check) {
    if (changed.length === 0) return 0;
    const names = changed.map(([name]) => name).sort();
    log(
      `fixtures:record --check: ${names.join(", ")} would change; run npm run fixtures:record`,
      true
    );
    return 1;
  }
  if (changed.length > 0) {
    mkdirSync(outDir, { recursive: true });
    for (const [name, content] of changed) {
      writeFileSync(path.join(outDir, name), content);
    }
  }
  return 0;
}

const invokedAs = process.argv[1];
if (
  invokedAs !== undefined &&
  import.meta.url === pathToFileURL(invokedAs).href
) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `fixtures:record failed: ${error instanceof Error ? error.name : "unknown error"}\n`
      );
      process.exitCode = 1;
    }
  );
}
