/**
 * The replay fixture's extension of the recorded graph (sweep item 83).
 *
 * The test Stash alone is smaller than what E2E needs (30 or more scenes, a
 * performer with 12 scenes and 3 images, markers, a rated scene with a
 * caption), so the generator adds a fixed set of entities before it builds
 * values. The additions depend only on the shape, so the output stays
 * deterministic:
 * - scenes continuing the ids up to EXTENDED_SCENE_COUNT, each with P* (the
 *   recorded performer with the most scenes) as its only performer, no
 *   tags, and the studios in turn; the first is rated 80 and has a caption
 * - EXTENSION_IMAGES images with P* as their only performer and no gallery
 * - EXTENSION_CLIPS markers on the first recorded scene, with the lowest
 *   tag as their primary tag
 * - around G (see below), a collection hierarchy the test Stash lacks: a
 *   group containing G, described "Box set", when G is in none, and a group
 *   inside G, described "Part 2", when G contains none, numbered after the
 *   recorded groups. Each link is listed from both ends (a group's
 *   sub_groups and the other's containing_groups) with the same
 *   description. Live runs skip the test of it (GroupRelations.integration),
 *   since the test Stash has no sub-groups.
 * An added entity has every recorded field set and one of each list.
 *
 * The recorded entities stay as they are, but for one rule, "relations the
 * test Stash lacks that integration tests need". Each relation joins two
 * recorded entities and is added only where it is missing. S is the studio
 * the tests use (studioWithScenes: the lowest recorded studio with two or
 * more scenes) and G the group (groupWithScenes: the lowest recorded group
 * with scenes):
 * - G gets S as its studio (and S lists G among its groups), for
 *   groups.integration "returns group studio with tooltip data"
 * - the lowest recorded scene of S joins G when no scene of S is in a group,
 *   for studios.integration "returns groups with tooltip data" (Peek lists
 *   a studio's groups from its scenes)
 * - S gets the lowest recorded tag, for studios.integration "returns tags
 *   with image_path"; it changes no TEST_ENTITIES pick
 * - the lowest recorded gallery with no studio gets S, when no gallery has
 *   S, for studios.integration "returns galleries with tooltip data"
 * The counts follow from the relations (synth.ts). Live runs still skip
 * those tests until the test Stash has these relations.
 */
import type { EntityType } from "./library.js";
import { RELATIONS } from "./selections.js";
import {
  FIXTURE_ID_OFFSET,
  type FileShape,
  type GraphEntity,
  type LibraryGraph,
  type RecordedShape,
  type RelationShape,
} from "./synth.js";

export const EXTENDED_SCENE_COUNT = 36;
export const EXTENSION_IMAGES = 3;
export const EXTENSION_CLIPS = 2;

/** The descriptions of the links the extension adds around G. */
const GROUP_LINK_DESCRIPTIONS = {
  containing: "Box set",
  sub: "Part 2",
};

/** The values of the first extension scene: E2E's rated, captioned scene. */
export const RATED_SCENE_VALUES = {
  rating100: 80,
  captions: [{ language_code: "en", caption_type: "vtt" }],
};

/** Stash's default fingerprints, for added scenes when none were recorded. */
const DEFAULT_FINGERPRINTS = ["oshash", "phash"];

function byId(a: { id: string }, b: { id: string }): number {
  return Number(a.id) - Number(b.id);
}

function refIds(entity: GraphEntity, field: string): string[] {
  return (entity.relations[field] ?? []).map((link) => link.id);
}

function links(...ids: Array<string | undefined>): RelationShape[] {
  return ids.flatMap((id) => (id === undefined ? [] : [{ id }]));
}

/** A link to a group with a fixed description, as synth.ts serves it. */
function describedLink(id: string, description: string): RelationShape {
  return { id, present: ["description"], values: { description } };
}

/**
 * The group the tests use (groupWithScenes): the lowest recorded group with
 * scenes.
 */
function groupWithScenes(
  recorded: Record<EntityType, GraphEntity[]>
): string | undefined {
  return recorded.group.find((group) =>
    recorded.scene.some((scene) => refIds(scene, "groups").includes(group.id))
  )?.id;
}

/** The recorded performer with the most scenes, the lowest id on ties. */
export function starPerformer(shape: RecordedShape): string | undefined {
  const scenes = new Map<string, number>();
  for (const scene of shape.entities.scene) {
    for (const id of refIds(scene, "performers")) {
      scenes.set(id, (scenes.get(id) ?? 0) + 1);
    }
  }
  let star: string | undefined;
  let most = -1;
  for (const performer of [...shape.entities.performer].sort(byId)) {
    const count = scenes.get(performer.id) ?? 0;
    if (count > most) {
      star = performer.id;
      most = count;
    }
  }
  return star;
}

/**
 * Adds "relations the test Stash lacks that integration tests need" (see
 * the file header) to the recorded entities in `entities`, choosing them
 * from `recorded`.
 */
function addIntegrationRelations(
  recorded: Record<EntityType, GraphEntity[]>,
  entities: Record<EntityType, GraphEntity[]>
): void {
  const inOutput = (type: EntityType, id: string | undefined) =>
    id === undefined
      ? undefined
      : entities[type].find((entity) => entity.id === id);
  const sceneCount = (field: string, id: string) =>
    recorded.scene.filter((scene) => refIds(scene, field).includes(id)).length;

  const studio = inOutput(
    "studio",
    recorded.studio.find((each) => sceneCount("studio", each.id) >= 2)?.id
  );
  if (studio === undefined) return;

  const group = inOutput(
    "group",
    recorded.group.find((each) => sceneCount("groups", each.id) > 0)?.id
  );
  if (group !== undefined && refIds(group, "studio").length === 0) {
    group.relations.studio = links(studio.id);
    // A studio's groups and (deprecated) movies both list the group
    for (const field of ["groups", "movies"]) {
      const list = studio.relations[field];
      if (list !== undefined) list.push({ id: group.id });
    }
  }

  const studioScenes = recorded.scene.filter((scene) =>
    refIds(scene, "studio").includes(studio.id)
  );
  const scene = inOutput("scene", studioScenes[0]?.id);
  const inGroup = studioScenes.some(
    (each) => refIds(each, "groups").length > 0
  );
  if (group !== undefined && scene !== undefined && !inGroup) {
    // As a recorded link without scene_index
    scene.relations.groups?.push({ id: group.id, present: [] });
  }

  const [lowestTag] = recorded.tag;
  if (lowestTag !== undefined && refIds(studio, "tags").length === 0) {
    studio.relations.tags = links(lowestTag.id);
  }

  const hasGallery = entities.gallery.some((gallery) =>
    refIds(gallery, "studio").includes(studio.id)
  );
  const gallery = inOutput(
    "gallery",
    recorded.gallery.find((each) => refIds(each, "studio").length === 0)?.id
  );
  if (!hasGallery && gallery !== undefined) {
    gallery.relations.studio = links(studio.id);
  }
}

/** Every recorded path of a type and the paths above them, but relations and files. */
function allPresent(fields: string[], type: EntityType): string[] {
  const paths = new Set<string>();
  for (const path of fields) {
    const parts = path.split(".");
    const [root = ""] = parts;
    if (root in RELATIONS[type] || root === "files") continue;
    parts.forEach((_, index) => paths.add(parts.slice(0, index + 1).join(".")));
  }
  return [...paths].sort();
}

/** One file with every recorded file field, and the recorded fingerprint types. */
function addedFile(
  fields: string[],
  recorded: GraphEntity[],
  fallback: string[]
): FileShape {
  const present = fields
    .filter((path) => /^files\.[^.]+$/.test(path))
    .map((path) => path.slice("files.".length));
  const fingerprints: string[] = [];
  for (const entity of recorded) {
    for (const file of entity.files ?? []) {
      for (const type of file.fingerprints) {
        if (!fingerprints.includes(type)) fingerprints.push(type);
      }
    }
  }
  return {
    present,
    fingerprints: fingerprints.length > 0 ? fingerprints : fallback,
  };
}

/** The recorded graph plus the extension, as synthesize reads it. */
export function extend(shape: RecordedShape): LibraryGraph {
  const fields = structuredClone(shape.fields);
  const recorded: Record<EntityType, GraphEntity[]> = structuredClone(
    shape.entities
  );
  for (const list of Object.values(recorded)) list.sort(byId);
  const entities = structuredClone(recorded);

  const nextId = (list: GraphEntity[]) => {
    let id = Math.max(
      FIXTURE_ID_OFFSET,
      ...list.map((each) => Number(each.id))
    );
    return () => String(++id);
  };
  const added = (
    type: EntityType,
    id: string,
    relations: Record<string, RelationShape[]>,
    options: {
      absent?: string[];
      lengths?: Record<string, number>;
      files?: FileShape[];
      values?: Record<string, unknown>;
    } = {}
  ): GraphEntity => {
    const absent = options.absent ?? [];
    const entity: GraphEntity = {
      id,
      extension: true,
      present: allPresent(fields[type], type).filter(
        (path) => !absent.includes(path)
      ),
      relations,
      lengths: options.lengths ?? {},
    };
    if (options.files !== undefined) entity.files = options.files;
    if (options.values !== undefined) entity.values = options.values;
    return entity;
  };

  const star = starPerformer(shape);
  const studios = recorded.studio.map((studio) => studio.id);

  const sceneFile = addedFile(
    fields.scene,
    recorded.scene,
    DEFAULT_FINGERPRINTS
  );
  const sceneId = nextId(entities.scene);
  for (let index = 0; entities.scene.length < EXTENDED_SCENE_COUNT; index++) {
    entities.scene.push(
      added(
        "scene",
        sceneId(),
        {
          studio: links(studios[index % studios.length]),
          performers: links(star),
          tags: [],
          groups: [],
          galleries: [],
        },
        {
          absent: ["rating100"],
          lengths: { captions: 0 },
          files: [structuredClone(sceneFile)],
          values: index === 0 ? structuredClone(RATED_SCENE_VALUES) : undefined,
        }
      )
    );
  }

  const imageFile = addedFile(fields.image, recorded.image, []);
  const imageId = nextId(entities.image);
  for (let index = 0; index < EXTENSION_IMAGES; index++) {
    entities.image.push(
      added(
        "image",
        imageId(),
        { galleries: [], studio: [], tags: [], performers: links(star) },
        { files: [structuredClone(imageFile)] }
      )
    );
  }

  const [firstScene] = recorded.scene;
  const [lowestTag] = recorded.tag;
  if (firstScene !== undefined && lowestTag !== undefined) {
    const clipId = nextId(entities.clip);
    for (let index = 0; index < EXTENSION_CLIPS; index++) {
      entities.clip.push(
        added("clip", clipId(), {
          scene: links(firstScene.id),
          primary_tag: links(lowestTag.id),
          tags: [],
        })
      );
    }
  }

  addIntegrationRelations(recorded, entities);

  // The collection hierarchy around G: P contains G, and G contains C
  const group = entities.group.find(
    (each) => each.id === groupWithScenes(recorded)
  );
  if (group !== undefined) {
    const groupId = nextId(entities.group);
    const containing = group.relations.containing_groups ?? [];
    const sub = group.relations.sub_groups ?? [];
    if (containing.length === 0) {
      const id = groupId();
      const description = GROUP_LINK_DESCRIPTIONS.containing;
      entities.group.push(
        added("group", id, {
          studio: [],
          tags: [],
          containing_groups: [],
          sub_groups: [describedLink(group.id, description)],
        })
      );
      group.relations.containing_groups = [describedLink(id, description)];
    }
    if (sub.length === 0) {
      const id = groupId();
      const description = GROUP_LINK_DESCRIPTIONS.sub;
      entities.group.push(
        added("group", id, {
          studio: [],
          tags: [],
          containing_groups: [describedLink(group.id, description)],
          sub_groups: [],
        })
      );
      group.relations.sub_groups = [describedLink(id, description)];
    }
  }

  return { fields, entities };
}
