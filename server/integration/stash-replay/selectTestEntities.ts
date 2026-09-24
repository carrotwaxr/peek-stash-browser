/**
 * The integration suite's test entities (TEST_ENTITIES in the fixture
 * manifest), picked from the generated library (sweep item 83).
 *
 * Each key has the criterion testEntities.example.ts describes for it, and
 * the lowest id that meets it wins. Only recorded entities are candidates,
 * and only their recorded relations count, so every pick meets its
 * criterion in the live test Stash too, where live runs use it (the id less
 * FIXTURE_ID_OFFSET). On the test Stash's shape this picks the ids the
 * owner chose by hand.
 */
import {
  ENTITY_TYPES,
  type Entity,
  type EntityType,
  type ReplayLibrary,
  isRecord,
} from "./library.js";

export type TestEntityKey =
  | "sceneWithRelations"
  | "performerWithScenes"
  | "studioWithScenes"
  | "tagWithEntities"
  | "groupWithScenes"
  | "sceneInGroup"
  | "galleryWithImages"
  | "galleryWithScenes"
  | "restrictableTag"
  | "galleryPerformerForInheritance"
  | "imageWithGalleryInheritance"
  | "imageWithOwnProperties"
  | "sceneWithInheritedTags"
  | "inheritedTagFromPerformerOrStudio";

export type TestEntities = Record<TestEntityKey, string>;

/** Per type, the ids of the recorded entities (the others are extension). */
export type RecordedIds = Record<EntityType, ReadonlySet<string>>;

/** The ids a reference field holds: one, a list, or a list of links. */
export function refIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => refIds(item));
  }
  if (!isRecord(value)) return [];
  if (typeof value.id === "string") return [value.id];
  // A link, such as a scene's { scene_index, group }
  return refIds(value.group);
}

/** The recorded library: recorded entities, and references to them only. */
class RecordedView {
  private readonly lists: Record<EntityType, Entity[]>;

  constructor(
    library: ReplayLibrary,
    private readonly recorded: RecordedIds
  ) {
    const lists: Partial<Record<EntityType, Entity[]>> = {};
    for (const type of ENTITY_TYPES) {
      lists[type] = library.entities[type]
        .filter((entity) => recorded[type].has(entity.id))
        .sort((a, b) => Number(a.id) - Number(b.id));
    }
    this.lists = {
      scene: lists.scene ?? [],
      performer: lists.performer ?? [],
      studio: lists.studio ?? [],
      tag: lists.tag ?? [],
      group: lists.group ?? [],
      gallery: lists.gallery ?? [],
      image: lists.image ?? [],
      clip: lists.clip ?? [],
    };
  }

  all(type: EntityType): Entity[] {
    return this.lists[type];
  }

  /** The recorded `target` entities that `field` of `entity` refers to. */
  refs(entity: Entity, field: string, target: EntityType): string[] {
    return refIds(entity[field]).filter((id) => this.recorded[target].has(id));
  }

  /** The recorded entities of `type` whose `field` refers to `id`. */
  referrers(type: EntityType, field: string, target: EntityType, id: string) {
    return this.all(type).filter((each) =>
      this.refs(each, field, target).includes(id)
    );
  }

  byId(type: EntityType, id: string): Entity | undefined {
    return this.all(type).find((entity) => entity.id === id);
  }
}

interface Criterion {
  key: TestEntityKey;
  type: EntityType;
  description: string;
  matches: (
    entity: Entity,
    view: RecordedView,
    picked: Partial<TestEntities>
  ) => boolean;
}

function imagesOf(view: RecordedView, gallery: Entity): Entity[] {
  return view.referrers("image", "galleries", "gallery", gallery.id);
}

function galleriesOf(view: RecordedView, image: Entity): Entity[] {
  return view
    .refs(image, "galleries", "gallery")
    .flatMap((id) => view.byId("gallery", id) ?? []);
}

/** In testEntities.example.ts order, which is the manifest's. */
export const TEST_ENTITY_CRITERIA: readonly Criterion[] = [
  {
    key: "sceneWithRelations",
    type: "scene",
    description: "a scene with two or more performers and tags, and a studio",
    matches: (scene, view) =>
      view.refs(scene, "performers", "performer").length >= 2 &&
      view.refs(scene, "tags", "tag").length >= 2 &&
      view.refs(scene, "studio", "studio").length === 1,
  },
  {
    key: "performerWithScenes",
    type: "performer",
    description: "a performer in two or more scenes",
    matches: (performer, view) =>
      view.referrers("scene", "performers", "performer", performer.id).length >=
      2,
  },
  {
    key: "studioWithScenes",
    type: "studio",
    description: "a studio with two or more scenes",
    matches: (studio, view) =>
      view.referrers("scene", "studio", "studio", studio.id).length >= 2,
  },
  {
    key: "tagWithEntities",
    type: "tag",
    description:
      "a tag used on scenes, performers, studios, groups and galleries",
    matches: (tag, view) =>
      (["scene", "performer", "studio", "group", "gallery"] as const).every(
        (type) => view.referrers(type, "tags", "tag", tag.id).length > 0
      ),
  },
  {
    key: "groupWithScenes",
    type: "group",
    description: "a group containing scenes",
    matches: (group, view) =>
      view.referrers("scene", "groups", "group", group.id).length > 0,
  },
  {
    key: "sceneInGroup",
    type: "scene",
    description: "a scene in groupWithScenes",
    matches: (scene, view, picked) =>
      picked.groupWithScenes !== undefined &&
      view.refs(scene, "groups", "group").includes(picked.groupWithScenes),
  },
  {
    key: "galleryWithImages",
    type: "gallery",
    description: "a gallery containing images",
    matches: (gallery, view) => imagesOf(view, gallery).length > 0,
  },
  {
    key: "galleryWithScenes",
    type: "gallery",
    description: "a gallery with scenes linked to it",
    matches: (gallery, view) =>
      view.refs(gallery, "scenes", "scene").length > 0 ||
      view.referrers("scene", "galleries", "gallery", gallery.id).length > 0,
  },
  {
    key: "restrictableTag",
    type: "tag",
    description: "a tag on some scenes but not on every scene",
    matches: (tag, view) => {
      const tagged = view.referrers("scene", "tags", "tag", tag.id).length;
      return tagged > 0 && tagged < view.all("scene").length;
    },
  },
  {
    key: "galleryPerformerForInheritance",
    type: "performer",
    description:
      "a performer on a gallery with images, none of which has the performer itself",
    matches: (performer, view) =>
      view
        .referrers("gallery", "performers", "performer", performer.id)
        .some((gallery) => {
          const images = imagesOf(view, gallery);
          return (
            images.length > 0 &&
            images.every(
              (image) =>
                !view
                  .refs(image, "performers", "performer")
                  .includes(performer.id)
            )
          );
        }),
  },
  {
    key: "imageWithGalleryInheritance",
    type: "image",
    description:
      "an image with no performers, tags or studio of its own, in a gallery that has all three",
    matches: (image, view) =>
      view.refs(image, "performers", "performer").length === 0 &&
      view.refs(image, "tags", "tag").length === 0 &&
      view.refs(image, "studio", "studio").length === 0 &&
      galleriesOf(view, image).some(
        (gallery) =>
          view.refs(gallery, "performers", "performer").length > 0 &&
          view.refs(gallery, "tags", "tag").length > 0 &&
          view.refs(gallery, "studio", "studio").length > 0
      ),
  },
  {
    key: "imageWithOwnProperties",
    type: "image",
    description:
      "an image in a gallery, with a tag of its own the gallery lacks, and performers of its own or from the gallery",
    matches: (image, view) => {
      const own = view.refs(image, "tags", "tag");
      const performers = view.refs(image, "performers", "performer");
      return galleriesOf(view, image).some((gallery) => {
        const galleryTags = view.refs(gallery, "tags", "tag");
        return (
          own.some((tag) => !galleryTags.includes(tag)) &&
          (performers.length > 0 ||
            view.refs(gallery, "performers", "performer").length > 0)
        );
      });
    },
  },
  {
    key: "sceneWithInheritedTags",
    type: "scene",
    description:
      "a scene with a tag from its performers, studio or groups that it lacks itself",
    matches: (scene, view) => {
      const direct = view.refs(scene, "tags", "tag");
      const sources = [
        ...view
          .refs(scene, "performers", "performer")
          .flatMap((id) => view.byId("performer", id) ?? []),
        ...view
          .refs(scene, "studio", "studio")
          .flatMap((id) => view.byId("studio", id) ?? []),
        ...view
          .refs(scene, "groups", "group")
          .flatMap((id) => view.byId("group", id) ?? []),
      ];
      return sources.some((source) =>
        view.refs(source, "tags", "tag").some((tag) => !direct.includes(tag))
      );
    },
  },
];

/**
 * TEST_ENTITIES for `library`. inheritedTagFromPerformerOrStudio stays
 * empty: the test that uses it finds the tag from sceneWithInheritedTags.
 * Throws, one line per key, when nothing recorded meets a criterion.
 */
export function selectTestEntities(
  library: ReplayLibrary,
  recorded: RecordedIds
): TestEntities {
  const view = new RecordedView(library, recorded);
  const picked: Partial<TestEntities> = {};
  const unmet: string[] = [];
  for (const criterion of TEST_ENTITY_CRITERIA) {
    const match = view
      .all(criterion.type)
      .find((entity) => criterion.matches(entity, view, picked));
    if (match === undefined) {
      unmet.push(
        `selectTestEntities: no recorded ${criterion.type} qualifies as ${criterion.key} (${criterion.description})`
      );
    } else {
      picked[criterion.key] = match.id;
    }
  }
  if (unmet.length > 0) {
    throw new Error(unmet.join("\n"));
  }
  const pick = (key: TestEntityKey) => picked[key] ?? "";
  return {
    sceneWithRelations: pick("sceneWithRelations"),
    performerWithScenes: pick("performerWithScenes"),
    studioWithScenes: pick("studioWithScenes"),
    tagWithEntities: pick("tagWithEntities"),
    groupWithScenes: pick("groupWithScenes"),
    sceneInGroup: pick("sceneInGroup"),
    galleryWithImages: pick("galleryWithImages"),
    galleryWithScenes: pick("galleryWithScenes"),
    restrictableTag: pick("restrictableTag"),
    galleryPerformerForInheritance: pick("galleryPerformerForInheritance"),
    imageWithGalleryInheritance: pick("imageWithGalleryInheritance"),
    imageWithOwnProperties: pick("imageWithOwnProperties"),
    sceneWithInheritedTags: pick("sceneWithInheritedTags"),
    inheritedTagFromPerformerOrStudio: "",
  };
}
