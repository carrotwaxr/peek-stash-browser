/**
 * The Stash replay evaluates list queries against a synthetic library
 * (sweep item 83): Stash's pagination, id lists, the updated_at filter that
 * incremental sync sends, and sort. Anything else fails loudly, naming the
 * argument, so a new filter in Peek cannot pass by being ignored.
 */
import { describe, expect, it } from "vitest";
import {
  type Entity,
  type EntityType,
  type ReplayLibrary,
  ReplayUnsupported,
  deriveSecondLibrary,
  queryList,
} from "../../../integration/stash-replay/library.js";
import { must } from "../../helpers/must.js";
import { NEWEST_UPDATED_AT, fixtureLibrary } from "./fixtureLibrary.js";

const ENTITY_TYPES: EntityType[] = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
  "clip",
];

/** The fixture with its tags replaced by `count` generated ones. */
function libraryWithTags(count: number): ReplayLibrary {
  const library = fixtureLibrary();
  library.entities.tag = Array.from({ length: count }, (_, index) => ({
    id: String(100001 + index),
    name: `Tag ${100001 + index}`,
  }));
  return library;
}

function listIds(result: Record<string, unknown>, key: string): string[] {
  const list = result[key];
  if (!Array.isArray(list)) {
    throw new Error(`result.${key} is not a list`);
  }
  return list.map((entity: unknown) => {
    if (
      typeof entity !== "object" ||
      entity === null ||
      !("id" in entity) ||
      typeof entity.id !== "string"
    ) {
      throw new Error(`result.${key} holds an entity without an id`);
    }
    return entity.id;
  });
}

describe("queryList", () => {
  it("per_page -1 all, 0 count only, default 25, page 2 of 2", () => {
    const library = libraryWithTags(30);
    const findTags = (filter?: Record<string, unknown>) =>
      queryList(library, "FindTags", "findTags", filter ? { filter } : {});

    const all = findTags({ per_page: -1 });
    expect(all.count).toBe(30);
    expect(listIds(all, "tags")).toHaveLength(30);

    const countOnly = findTags({ page: 1, per_page: 0 });
    expect(countOnly.count).toBe(30);
    expect(countOnly.tags).toEqual([]);

    const byDefault = findTags();
    expect(byDefault.count).toBe(30);
    expect(listIds(byDefault, "tags")).toEqual(
      Array.from({ length: 25 }, (_, index) => String(100001 + index))
    );

    const secondPage = findTags({ page: 2, per_page: 25 });
    expect(secondPage.count).toBe(30);
    expect(listIds(secondPage, "tags")).toEqual([
      "100026",
      "100027",
      "100028",
      "100029",
      "100030",
    ]);
  });

  it("ids and scene_ids narrow", () => {
    const library = fixtureLibrary();

    const byIds = queryList(library, "FindScenes", "findScenes", {
      ids: ["100004", "100002"],
    });
    expect(byIds.count).toBe(2);
    expect(listIds(byIds, "scenes")).toEqual(["100002", "100004"]);

    const bySceneIds = queryList(library, "FindScenes", "findScenes", {
      scene_ids: [100003],
    });
    expect(bySceneIds.count).toBe(1);
    expect(listIds(bySceneIds, "scenes")).toEqual(["100003"]);

    const byTagIds = queryList(library, "FindTags", "findTags", {
      ids: ["100002"],
    });
    expect(listIds(byTagIds, "tags")).toEqual(["100002"]);
  });

  it("updated_at GREATER_THAN compares wall-clock time like Stash", () => {
    const library = fixtureLibrary();
    const newerThan = (value: string) =>
      listIds(
        queryList(library, "FindScenesCompact", "findScenes", {
          filter: { per_page: -1 },
          scene_filter: { updated_at: { modifier: "GREATER_THAN", value } },
        }),
        "scenes"
      );

    // Scene 100002 was updated at 2004-01-26T08:04:35+00:00, the newest
    expect(NEWEST_UPDATED_AT).toBe("2004-01-26T08:04:35+00:00");
    expect(newerThan("2004-01-26T08:04:35.999")).toEqual([]);
    expect(newerThan("2004-01-26T08:04:34.999")).toEqual(["100002"]);
    expect(newerThan("2003-06-01T12:00:00.999")).toEqual(["100002", "100004"]);
  });

  it("sort updated_at ASC", () => {
    const library = fixtureLibrary();
    const sorted = (direction: string) =>
      listIds(
        queryList(library, "FindScenesCompact", "findScenes", {
          filter: { per_page: -1, sort: "updated_at", direction },
        }),
        "scenes"
      );

    expect(sorted("ASC")).toEqual(["100003", "100001", "100004", "100002"]);
    expect(sorted("DESC")).toEqual(["100002", "100004", "100001", "100003"]);
  });

  it("FindSceneMarkers answers a per_page 0 count under an updated_at filter", () => {
    const library = fixtureLibrary();
    // The smart sync's clip change count, as ENTITY_SYNC.clip asks for it
    const changedSince = (value: string) =>
      queryList(library, "FindSceneMarkers", "findSceneMarkers", {
        filter: { page: 1, per_page: 0, sort: "updated_at", direction: "ASC" },
        scene_marker_filter: {
          updated_at: { modifier: "GREATER_THAN", value },
        },
      });

    // The fixture's one clip was updated at 2003-02-11T08:00:00+00:00
    const changed = changedSince("2003-02-11T07:59:59.999");
    expect(changed.count).toBe(1);
    expect(changed.scene_markers).toEqual([]);
    const unchanged = changedSince("2003-02-11T08:00:00.999");
    expect(unchanged.count).toBe(0);
  });

  it("findScenes duration and filesize sum the matched first files", () => {
    const library = fixtureLibrary();

    const all = queryList(library, "FindScenes", "findScenes", {
      filter: { per_page: 1 },
    });
    expect(all).toMatchObject({ count: 4, duration: 106.625 });
    expect(all.filesize).toBe(10000010);

    // Scene 100004 has a second file (900.5 s, 9000009 bytes), not counted
    const narrowed = queryList(library, "FindScenes", "findScenes", {
      ids: ["100001", "100004"],
    });
    expect(narrowed).toMatchObject({
      count: 2,
      duration: 60.375,
      filesize: 5000005,
    });
  });

  it("an unknown filter key, modifier, q or root field throws ReplayUnsupported naming the argument path", () => {
    const library = fixtureLibrary();
    const findScenes = (args: Record<string, unknown>) => () =>
      queryList(library, "FindScenes", "findScenes", args);
    const teach =
      "is not evaluated by the replay; teach server/integration/stash-replay/library.ts.";

    expect(
      findScenes({
        scene_filter: { title: { value: "a", modifier: "EQUALS" } },
      })
    ).toThrow(ReplayUnsupported);
    expect(
      findScenes({
        scene_filter: { title: { value: "a", modifier: "EQUALS" } },
      })
    ).toThrow(
      `stash-replay cannot answer FindScenes: findScenes(scene_filter.title) ${teach}`
    );
    expect(
      findScenes({
        scene_filter: {
          updated_at: { modifier: "LESS_THAN", value: "2004-01-01T00:00:00" },
        },
      })
    ).toThrow(
      `stash-replay cannot answer FindScenes: findScenes(scene_filter.updated_at.modifier: LESS_THAN) ${teach}`
    );
    expect(findScenes({ filter: { q: "Scene" } })).toThrow(
      `stash-replay cannot answer FindScenes: findScenes(filter.q) ${teach}`
    );
    expect(findScenes({ filter: { sort: "random_1234" } })).toThrow(
      `stash-replay cannot answer FindScenes: findScenes(filter.sort: random_1234) ${teach}`
    );
    expect(findScenes({ distinct: true })).toThrow(
      `stash-replay cannot answer FindScenes: findScenes(distinct) ${teach}`
    );
    expect(() =>
      queryList(library, "FindSavedFilters", "findSavedFilters", {})
    ).toThrow(
      `stash-replay cannot answer FindSavedFilters: findSavedFilters ${teach}`
    );
  });
});

/** Keys under which an entity names another one, and the type it names. */
const REFERENCES: Record<string, EntityType> = {
  studio: "studio",
  parent_studio: "studio",
  child_studios: "studio",
  performers: "performer",
  tags: "tag",
  parents: "tag",
  children: "tag",
  primary_tag: "tag",
  group: "group",
  groups: "group",
  galleries: "gallery",
  scenes: "scene",
  scene: "scene",
  cover: "image",
};

/** Every [type, id] an entity references, at any depth. */
function referencesOf(
  value: unknown,
  key?: string
): Array<[EntityType, string]> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => referencesOf(item, key));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const found: Array<[EntityType, string]> = [];
  const type = key === undefined ? undefined : REFERENCES[key];
  if (type !== undefined && "id" in value && typeof value.id === "string") {
    found.push([type, value.id]);
  }
  for (const [childKey, child] of Object.entries(value)) {
    found.push(...referencesOf(child, childKey));
  }
  return found;
}

describe("deriveSecondLibrary", () => {
  it("deriveSecondLibrary adds idOffset to every id and reference, builds sceneCount scenes, every relation resolves, no id shared with the source", () => {
    const source = fixtureLibrary();
    const second = deriveSecondLibrary(source, {
      idOffset: 100000,
      sceneCount: 10,
    });

    // The source is left as it was
    expect(source).toEqual(fixtureLibrary());

    // Every source entity moved by the offset, and nothing else is shared
    for (const type of ENTITY_TYPES) {
      const sourceIds = source.entities[type].map((entity) => entity.id);
      const secondIds = second.entities[type].map((entity) => entity.id);
      expect(secondIds.slice(0, sourceIds.length), type).toEqual(
        sourceIds.map((id) => String(Number(id) + 100000))
      );
      expect(
        secondIds.filter((id) => sourceIds.includes(id)),
        type
      ).toEqual([]);
    }

    // sceneCount scenes, the extra ones numbered after the moved ones
    expect(second.entities.scene.map((entity) => entity.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => String(200001 + index))
    );

    // Every reference names an entity of the second library
    const known = new Set(
      ENTITY_TYPES.flatMap((type) =>
        second.entities[type].map((entity) => `${type}:${entity.id}`)
      )
    );
    const references = ENTITY_TYPES.flatMap((type) =>
      second.entities[type].flatMap((entity) =>
        Object.entries(entity).flatMap(([key, value]) =>
          referencesOf(value, key)
        )
      )
    );
    expect(references.length).toBeGreaterThan(30);
    expect(
      references
        .map(([type, id]) => `${type}:${id}`)
        .filter((ref) => !known.has(ref))
    ).toEqual([]);

    // Names and media URLs follow the ids
    const first = must(second.entities.scene[0], "the first scene");
    expect(first).toMatchObject({
      title: "Scene 200001",
      studio: { id: "200002", name: "Studio 200002" },
      paths: {
        screenshot: "{{STASH_ORIGIN}}/scene/200001/screenshot?t=1072915200",
      },
    });
    expect(must(second.entities.clip[0], "the clip")).toMatchObject({
      scene: { id: "200001" },
      preview: "{{STASH_ORIGIN}}/scene/200001/scene_marker/200001/preview",
    });
  });

  it("extra scenes keep performers and studio, drop groups and galleries, and get their own fingerprints", () => {
    const second = deriveSecondLibrary(fixtureLibrary(), {
      idOffset: 100000,
      sceneCount: 10,
    });
    const moved = must(second.entities.scene[0], "scene 200001");
    const extra = must(second.entities.scene[4], "scene 200005");
    // Only the fingerprints of each file: JSON.stringify keeps the listed keys
    const fingerprints = (entity: Entity) =>
      JSON.stringify(entity.files, ["fingerprints", "type", "value"]);

    expect(extra).toMatchObject({
      id: "200005",
      title: "Scene 200005",
      studio: moved.studio,
      performers: moved.performers,
      groups: [],
      galleries: [],
      paths: {
        screenshot: "{{STASH_ORIGIN}}/scene/200005/screenshot?t=1072915200",
      },
    });
    expect(fingerprints(extra)).not.toBe(fingerprints(moved));
    // Performer 200001 is on scenes 200001 and 200002 and on the extra
    // scenes copied from them (200005, 200006, 200009, 200010)
    expect(
      must(second.entities.performer[0], "performer 200001")
    ).toMatchObject({ id: "200001", scene_count: 6 });
  });
});
