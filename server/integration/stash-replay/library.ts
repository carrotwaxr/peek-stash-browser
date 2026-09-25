/**
 * The Stash replay's library and the queries it evaluates (sweep item 83).
 *
 * A library is a synthetic snapshot of a Stash: per entity type, a list of
 * denormalised entity trees (a reference carries the referenced entity's id
 * and the fields queries select on it), plus the answers to Version and
 * Configuration. Media URLs start with STASH_ORIGIN, which the server
 * rewrites per request to the origin the client used.
 *
 * Query evaluation is deliberately narrow: what Peek's sync sends (Stash's
 * pagination, id lists, the updated_at filter of incremental sync, the
 * galleries filter of its gallery members refetch, sort on an entity field)
 * and nothing else. Anything else throws ReplayUnsupported,
 * so a new filter in Peek fails the run instead of being silently ignored.
 */

export type EntityType =
  | "scene"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery"
  | "image"
  | "clip";

export type Entity = Record<string, unknown> & { id: string };

export interface ReplayLibrary {
  stash: {
    version: Record<string, unknown>;
    configuration: Record<string, unknown>;
  };
  entities: Record<EntityType, Entity[]>;
}

export const ENTITY_TYPES: readonly EntityType[] = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
  "clip",
];

/** A value per entity type, built by `build`. */
function mapEntities(
  build: (type: EntityType) => Entity[]
): Record<EntityType, Entity[]> {
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

/** Stands for the Stash origin in media URLs; see the server's rewrite. */
export const STASH_ORIGIN = "{{STASH_ORIGIN}}";

const FIXTURE_COMMANDS =
  "Run npm run fixtures:generate (no Stash needed) after changing a query in server/graphql/operations, or npm run fixtures:record (owner, needs STASH_TEST_URL) after changing the test Stash.";

/** A request the replay cannot answer. The message says what to do. */
export class ReplayUnsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayUnsupported";
  }

  /** The request selects a field the fixture does not hold. */
  static missingField(operation: string, path: string): ReplayUnsupported {
    return new ReplayUnsupported(
      `stash-replay cannot answer ${operation}: the fixture has no ${path}. ${FIXTURE_COMMANDS}`
    );
  }

  /** The request uses an argument, filter or form the replay does not evaluate. */
  static notEvaluated(
    operation: string,
    what: string,
    file = "library.ts"
  ): ReplayUnsupported {
    return new ReplayUnsupported(
      `stash-replay cannot answer ${operation}: ${what} is not evaluated by the replay; teach server/integration/stash-replay/${file}.`
    );
  }
}

/** Stash's list queries: root field to entity type and result list key. */
export const LIST_ROOTS: Record<string, [EntityType, string]> = {
  findScenes: ["scene", "scenes"],
  findPerformers: ["performer", "performers"],
  findStudios: ["studio", "studios"],
  findTags: ["tag", "tags"],
  findGroups: ["group", "groups"],
  findGalleries: ["gallery", "galleries"],
  findImages: ["image", "images"],
  findSceneMarkers: ["clip", "scene_markers"],
};

/** Stash's single-entity queries Peek sends: root field to entity type. */
export const SINGLE_ROOTS: Record<string, EntityType> = {
  findGroup: "group",
  findGallery: "gallery",
};

/** The criteria argument of each list query. */
const FILTER_ARGS: Record<EntityType, string> = {
  scene: "scene_filter",
  performer: "performer_filter",
  studio: "studio_filter",
  tag: "tag_filter",
  group: "group_filter",
  gallery: "gallery_filter",
  image: "image_filter",
  clip: "scene_marker_filter",
};

/** Stash's older integer id lists, beside `ids`. */
const INT_ID_ARGS: Partial<Record<EntityType, string>> = {
  scene: "scene_ids",
  performer: "performer_ids",
  image: "image_ids",
};

const DEFAULT_PER_PAGE = 25;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates parsed JSON as a library, naming the first part that is wrong. */
export function parseReplayLibrary(
  json: unknown,
  source: string
): ReplayLibrary {
  if (!isRecord(json) || !isRecord(json.stash) || !isRecord(json.entities)) {
    throw new Error(
      `${source} is not a replay library: it needs stash and entities`
    );
  }
  const { version, configuration } = json.stash;
  if (!isRecord(version) || !isRecord(configuration)) {
    throw new Error(
      `${source} is not a replay library: stash needs version and configuration`
    );
  }
  const listed = json.entities;
  const entities = mapEntities((type) => {
    const list = listed[type];
    if (!Array.isArray(list)) {
      throw new Error(
        `${source} is not a replay library: entities.${type} is not a list`
      );
    }
    return list.map((entity: unknown, index) => {
      if (!isRecord(entity) || typeof entity.id !== "string") {
        throw new Error(
          `${source} is not a replay library: entities.${type}[${index}] has no string id`
        );
      }
      return { ...entity, id: entity.id };
    });
  });
  return { stash: { version, configuration }, entities };
}

/** Numeric ids sort as numbers, as Stash's autoincrement ids do. */
function compareIds(a: string, b: string): number {
  const difference = Number(a) - Number(b);
  return Number.isNaN(difference) ? a.localeCompare(b) : difference;
}

/**
 * Stash compares timestamps as wall-clock time, without their offset: Peek
 * sends updated_at filters as the local time of its newest row plus .999.
 */
function wallClock(value: string): number {
  let local = value
    .trim()
    .replace(/(Z|[+-]\d{2}:?\d{2})$/, "")
    .replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(local)) {
    local += "T00:00:00";
  }
  return Date.parse(`${local}Z`);
}

/** Nulls last; numbers as numbers; everything else as strings. */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function describeValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

interface Page {
  page: number;
  perPage: number;
  sort?: string;
  descending: boolean;
}

function readFindFilter(
  filter: unknown,
  unsupported: (what: string) => ReplayUnsupported
): Page {
  const result: Page = {
    page: 1,
    perPage: DEFAULT_PER_PAGE,
    descending: false,
  };
  if (filter === undefined || filter === null) {
    return result;
  }
  if (!isRecord(filter)) {
    throw unsupported(`filter: ${describeValue(filter)}`);
  }
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null) continue;
    if (
      key === "page" &&
      typeof value === "number" &&
      Number.isInteger(value)
    ) {
      result.page = Math.max(1, value);
    } else if (
      key === "per_page" &&
      typeof value === "number" &&
      Number.isInteger(value)
    ) {
      result.perPage = value;
    } else if (key === "sort" && typeof value === "string") {
      result.sort = value;
    } else if (key === "direction" && (value === "ASC" || value === "DESC")) {
      result.descending = value === "DESC";
    } else if (key === "q" && value === "") {
      // Stash ignores an empty search
    } else if (key === "q") {
      throw unsupported("filter.q");
    } else if (["page", "per_page", "sort", "direction"].includes(key)) {
      throw unsupported(`filter.${key}: ${describeValue(value)}`);
    } else {
      throw unsupported(`filter.${key}`);
    }
  }
  return result;
}

function narrowByIds(
  entities: Entity[],
  value: unknown,
  argument: string,
  unsupported: (what: string) => ReplayUnsupported
): Entity[] {
  if (!Array.isArray(value)) {
    throw unsupported(`${argument}: ${describeValue(value)}`);
  }
  // Stash treats an empty id list as no id list
  if (value.length === 0) {
    return entities;
  }
  const wanted = new Set(value.map((id: unknown) => String(id)));
  return entities.filter((entity) => wanted.has(entity.id));
}

/** The filters whose `galleries` criterion the replay evaluates. */
const GALLERY_CRITERION_ARGUMENTS = new Set(["image_filter", "scene_filter"]);

/** A criterion's `modifier` and `value`; any other part is refused. */
function criterionParts(
  criterion: Record<string, unknown>,
  path: string,
  unsupported: (what: string) => ReplayUnsupported
): { modifier: unknown; value: unknown } {
  for (const [part, partValue] of Object.entries(criterion)) {
    if (partValue === undefined || partValue === null) continue;
    if (part !== "modifier" && part !== "value") {
      throw unsupported(`${path}.${part}`);
    }
  }
  return { modifier: criterion.modifier, value: criterion.value };
}

/** `updated_at` GREATER_THAN, as incremental sync sends it. */
function updatedAfter(
  entities: Entity[],
  criterion: Record<string, unknown>,
  path: string,
  unsupported: (what: string) => ReplayUnsupported
): Entity[] {
  const { modifier, value } = criterionParts(criterion, path, unsupported);
  if (modifier !== "GREATER_THAN") {
    throw unsupported(`${path}.modifier: ${describeValue(modifier)}`);
  }
  const since = typeof value === "string" ? wallClock(value) : NaN;
  if (Number.isNaN(since)) {
    throw unsupported(`${path}.value: ${describeValue(value)}`);
  }
  return entities.filter(
    (entity) =>
      typeof entity.updated_at === "string" &&
      wallClock(entity.updated_at) > since
  );
}

/**
 * `galleries` INCLUDES on images and scenes, as sync asks for the members of
 * the galleries that changed: the entities in any of the listed galleries.
 */
function inGalleries(
  entities: Entity[],
  criterion: Record<string, unknown>,
  path: string,
  unsupported: (what: string) => ReplayUnsupported
): Entity[] {
  const { modifier, value } = criterionParts(criterion, path, unsupported);
  if (modifier !== "INCLUDES") {
    throw unsupported(`${path}.modifier: ${describeValue(modifier)}`);
  }
  // Stash reads an empty list as no criterion; sync never sends one
  if (!Array.isArray(value) || value.length === 0) {
    throw unsupported(`${path}.value: ${describeValue(value)}`);
  }
  if (!entities.every((entity) => Array.isArray(entity.galleries))) {
    throw unsupported(path);
  }
  const wanted = new Set(value.map((id: unknown) => String(id)));
  return entities.filter(
    (entity) =>
      Array.isArray(entity.galleries) &&
      entity.galleries.some(
        (gallery: unknown) =>
          isRecord(gallery) && wanted.has(String(gallery.id))
      )
  );
}

function applyCriteria(
  entities: Entity[],
  value: unknown,
  argument: string,
  unsupported: (what: string) => ReplayUnsupported
): Entity[] {
  if (!isRecord(value)) {
    throw unsupported(`${argument}: ${describeValue(value)}`);
  }
  let matched = entities;
  for (const [key, criterion] of Object.entries(value)) {
    if (criterion === undefined || criterion === null) continue;
    const path = `${argument}.${key}`;
    if (!isRecord(criterion)) {
      throw unsupported(path);
    }
    if (key === "updated_at") {
      matched = updatedAfter(matched, criterion, path, unsupported);
    } else if (
      key === "galleries" &&
      GALLERY_CRITERION_ARGUMENTS.has(argument)
    ) {
      matched = inGalleries(matched, criterion, path, unsupported);
    } else {
      throw unsupported(path);
    }
  }
  return matched;
}

function firstFile(entity: Entity): Record<string, unknown> | undefined {
  const files = entity.files;
  const first: unknown = Array.isArray(files) ? files[0] : undefined;
  return isRecord(first) ? first : undefined;
}

function sumOfFirstFiles(entities: Entity[], field: string): number {
  return entities.reduce((sum, entity) => {
    const value = firstFile(entity)?.[field];
    return typeof value === "number" ? sum + value : sum;
  }, 0);
}

/**
 * Evaluates a list query (findScenes, findTags, ...) and returns its
 * unprojected result: `count`, the page of entities under the list key, and
 * for scenes `duration` and `filesize`, summed over the first file of every
 * matched scene as Stash does.
 */
export function queryList(
  lib: ReplayLibrary,
  operation: string,
  root: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const target = LIST_ROOTS[root];
  if (target === undefined) {
    throw ReplayUnsupported.notEvaluated(operation, root);
  }
  const [type, listKey] = target;
  const unsupported = (what: string) =>
    ReplayUnsupported.notEvaluated(operation, `${root}(${what})`);

  let matched = [...lib.entities[type]].sort((a, b) => compareIds(a.id, b.id));
  for (const [name, value] of Object.entries(args)) {
    if (value === undefined || value === null || name === "filter") continue;
    if (name === "ids" || name === INT_ID_ARGS[type]) {
      matched = narrowByIds(matched, value, name, unsupported);
    } else if (name === FILTER_ARGS[type]) {
      matched = applyCriteria(matched, value, name, unsupported);
    } else {
      throw unsupported(name);
    }
  }

  const { page, perPage, sort, descending } = readFindFilter(
    args.filter,
    unsupported
  );
  if (sort !== undefined) {
    if (!lib.entities[type].every((entity) => sort in entity)) {
      throw unsupported(`filter.sort: ${sort}`);
    }
    const direction = descending ? -1 : 1;
    matched.sort(
      (a, b) =>
        direction * compareValues(a[sort], b[sort]) || compareIds(a.id, b.id)
    );
  } else if (descending) {
    matched.reverse();
  }

  const pageItems =
    perPage < 0 ? matched : matched.slice((page - 1) * perPage, page * perPage);
  const result: Record<string, unknown> = {
    count: matched.length,
    [listKey]: pageItems,
  };
  if (type === "scene") {
    result.duration = sumOfFirstFiles(matched, "duration");
    result.filesize = sumOfFirstFiles(matched, "size");
  }
  return result;
}

/**
 * Evaluates one root field of a query: version, configuration, a single
 * entity (null when the library lacks it, as Stash answers), or a list.
 */
export function queryRoot(
  lib: ReplayLibrary,
  operation: string,
  root: string,
  args: Record<string, unknown>
): unknown {
  const given = Object.entries(args).filter(
    ([, value]) => value !== undefined && value !== null
  );
  if (root === "version" || root === "configuration") {
    const [name] = given[0] ?? [];
    if (name !== undefined) {
      throw ReplayUnsupported.notEvaluated(operation, `${root}(${name})`);
    }
    return lib.stash[root];
  }
  const single = SINGLE_ROOTS[root];
  if (single !== undefined) {
    const other = given.find(([name]) => name !== "id");
    if (other !== undefined) {
      throw ReplayUnsupported.notEvaluated(operation, `${root}(${other[0]})`);
    }
    const id = String(args.id);
    return lib.entities[single].find((entity) => entity.id === id) ?? null;
  }
  return queryList(lib, operation, root, args);
}

/**
 * A copy of a record with `id` fields moved by `shift`, and every run of
 * digits in a string that is one of `entityIds` moved too.
 */
function shiftRecord(
  record: Record<string, unknown>,
  shift: (id: string) => string,
  entityIds: Set<string>
): Record<string, unknown> {
  const shiftValue = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      if (key === "id") return shift(value);
      return value.replace(/\d+/g, (digits) =>
        entityIds.has(digits) ? shift(digits) : digits
      );
    }
    if (typeof value === "number" && key === "id") {
      return Number(shift(String(value)));
    }
    if (Array.isArray(value)) {
      return value.map((item) => shiftValue(item));
    }
    if (isRecord(value)) {
      return shiftRecord(value, shift, entityIds);
    }
    return value;
  };
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, shiftValue(value, key)])
  );
}

/**
 * A copy of an entity's record with the digit run `from` renamed to `to` in
 * its own strings. Nested objects with an id are other entities (its studio,
 * performers, tags ...) and are kept as they are.
 */
function renameOwnStrings(
  record: Record<string, unknown>,
  from: string,
  to: string
): Record<string, unknown> {
  const renameValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.replace(/\d+/g, (digits) => (digits === from ? to : digits));
    }
    if (Array.isArray(value)) {
      return value.map(renameValue);
    }
    if (isRecord(value)) {
      return "id" in value ? value : renameOwnStrings(value, from, to);
    }
    return value;
  };
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      key === "id" ? value : renameValue(value),
    ])
  );
}

/** Hex of `length` characters, derived from the seed (FNV-1a rounds). */
function hexFrom(seed: string, length: number): string {
  let hex = "";
  let state = 2166136261;
  while (hex.length < length) {
    for (const char of `${seed}:${hex.length}`) {
      state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
    }
    hex += state.toString(16).padStart(8, "0");
  }
  return hex.slice(0, length);
}

/** New fingerprint values of the same lengths, derived from the scene id. */
function regenerateFingerprints(scene: Entity): void {
  const files: unknown = scene.files;
  if (!Array.isArray(files)) return;
  files.forEach((file: unknown, fileIndex) => {
    if (!isRecord(file) || !Array.isArray(file.fingerprints)) return;
    file.fingerprints = file.fingerprints.map((fingerprint: unknown) =>
      isRecord(fingerprint) && typeof fingerprint.value === "string"
        ? {
            ...fingerprint,
            value: hexFrom(
              `second:${scene.id}:${fileIndex}:${String(fingerprint.type)}`,
              fingerprint.value.length
            ),
          }
        : fingerprint
    );
  });
}

/** The ids of the entities a reference field names (one or a list). */
function referencedIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => referencedIds(item));
  }
  return isRecord(value) && typeof value.id === "string" ? [value.id] : [];
}

/**
 * A second Stash for multi-instance runs, derived from the first.
 *
 * Every id moves by idOffset, and so does every run of digits in a string
 * that equals an entity id (names such as "Scene 100003", file names, media
 * URLs), so the second library is the first one renumbered and shares no id
 * with it. Scenes are then added up to sceneCount, numbered after the moved
 * ones, each a copy of a moved scene taken in turn: it keeps its performers,
 * studio and tags, drops its groups and galleries, gets fingerprints of its
 * own, and counts in the scene_count of its performers, studio and tags.
 */
export function deriveSecondLibrary(
  a: ReplayLibrary,
  o: { idOffset: number; sceneCount: number }
): ReplayLibrary {
  const shift = (id: string) => {
    const moved = Number(id) + o.idOffset;
    if (!Number.isSafeInteger(moved)) {
      throw new Error(`deriveSecondLibrary: id ${id} is not numeric`);
    }
    return String(moved);
  };
  const entityIds = new Set(
    ENTITY_TYPES.flatMap((type) => a.entities[type].map((entity) => entity.id))
  );
  const entities = mapEntities((type) =>
    a.entities[type].map((entity) => ({
      ...shiftRecord(entity, shift, entityIds),
      id: shift(entity.id),
    }))
  );

  const scenes = [...entities.scene].sort((x, y) => compareIds(x.id, y.id));
  if (o.sceneCount < scenes.length) {
    throw new Error(
      `deriveSecondLibrary: sceneCount ${o.sceneCount} is below the library's ${scenes.length} scenes`
    );
  }
  const byId = (type: EntityType) =>
    new Map(entities[type].map((entity) => [entity.id, entity]));
  const countedBy: Array<[string, Map<string, Entity>]> = [
    ["performers", byId("performer")],
    ["studio", byId("studio")],
    ["tags", byId("tag")],
  ];

  let nextId = Math.max(0, ...scenes.map((scene) => Number(scene.id))) + 1;
  for (let index = 0; scenes.length + index < o.sceneCount; index++) {
    const source = scenes[index % scenes.length];
    if (source === undefined) {
      throw new Error("deriveSecondLibrary: the library has no scene to copy");
    }
    const id = String(nextId++);
    const scene: Entity = {
      ...renameOwnStrings(structuredClone(source), source.id, id),
      id,
    };
    if ("groups" in scene) scene.groups = [];
    if ("galleries" in scene) scene.galleries = [];
    regenerateFingerprints(scene);
    for (const [key, entitiesById] of countedBy) {
      for (const refId of referencedIds(scene[key])) {
        const entity = entitiesById.get(refId);
        if (entity !== undefined && typeof entity.scene_count === "number") {
          entity.scene_count += 1;
        }
      }
    }
    entities.scene.push(scene);
  }

  return { stash: structuredClone(a.stash), entities };
}

/**
 * The second instance's ids start after the test library's; item 34's PR
 * should set this to 0 (bare tag ids match every instance until then).
 */
export const SECOND_ID_OFFSET = 100000;

/**
 * The second Stash of multi-instance runs, as the integration suite and
 * `stash:replay --library second` serve it: the test library renumbered,
 * with more than ten times its scenes, as multi-instance asserts.
 */
export function secondLibraryOf(test: ReplayLibrary): ReplayLibrary {
  return deriveSecondLibrary(test, {
    idOffset: SECOND_ID_OFFSET,
    sceneCount: Math.max(200, 10 * test.entities.scene.length + 1),
  });
}
