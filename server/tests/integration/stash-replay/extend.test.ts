/**
 * The test Stash alone is smaller than E2E's minimum library (sweep item
 * 83), so the generator extends the recorded graph with a fixed,
 * deterministic set of scenes, images and markers before it synthesises
 * values. It also adds the few relations between recorded entities that
 * integration tests need and the test Stash lacks.
 */
import { describe, expect, it } from "vitest";
import {
  EXTENDED_SCENE_COUNT,
  extend,
  starPerformer,
} from "../../../integration/stash-replay/extend.js";
import { buildFixture } from "../../../integration/stash-replay/generate.js";
import {
  ENTITY_TYPES,
  type EntityType,
} from "../../../integration/stash-replay/library.js";
import type {
  GraphEntity,
  LibraryGraph,
} from "../../../integration/stash-replay/synth.js";
import { arrayContaining } from "../../helpers/matchers.js";
import { must } from "../../helpers/must.js";
import { OWNER_TEST_ENTITIES, testStashShape } from "./shapeFixture.js";

function ids(entity: GraphEntity, relation: string): string[] {
  return (entity.relations[relation] ?? []).map((link) => link.id);
}

function entity(
  graph: LibraryGraph,
  type: EntityType,
  id: string
): GraphEntity {
  return must(
    graph.entities[type].find((each) => each.id === id),
    `${type} ${id}`
  );
}

function withPerformer(graph: LibraryGraph, type: "scene" | "image") {
  const star = must(starPerformer(graph));
  return graph.entities[type].filter((entity) =>
    ids(entity, "performers").includes(star)
  );
}

describe("extend", () => {
  it("brings a 16-scene shape to 36 scenes", () => {
    const graph = extend(testStashShape());
    const scenes = graph.entities.scene;

    expect(EXTENDED_SCENE_COUNT).toBe(36);
    expect(scenes.map((scene) => scene.id)).toEqual(
      Array.from({ length: 36 }, (_, index) => String(100001 + index))
    );
    const added = scenes.filter((scene) => scene.extension === true);
    expect(added.map((scene) => scene.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => String(100017 + index))
    );
    // One performer (P*), no tags, studios in turn, one file
    const studios = graph.entities.studio.map((studio) => studio.id);
    added.forEach((scene, index) => {
      expect(ids(scene, "performers")).toEqual(["100006"]);
      expect(ids(scene, "tags")).toEqual([]);
      expect(ids(scene, "groups")).toEqual([]);
      expect(ids(scene, "galleries")).toEqual([]);
      expect(ids(scene, "studio")).toEqual([studios[index % studios.length]]);
      expect(scene.files).toEqual([
        {
          present: arrayContaining(["path", "duration", "height"]),
          fingerprints: ["oshash", "phash"],
        },
      ]);
    });
    // The recorded scenes are left as they were, but for scene 100010 joining
    // group 100001 (the relations integration tests need)
    const recordedScenes = testStashShape().entities.scene;
    must(
      recordedScenes.find((scene) => scene.id === "100010"),
      "scene 100010"
    ).relations.groups = [{ id: "100001", present: [] }];
    expect(scenes.slice(0, 16)).toEqual(recordedScenes);
    // A shape at 36 scenes or more gets none
    const full = extend(graph);
    expect(full.entities.scene).toHaveLength(36);
  });

  it("P* reaches 12 scenes and 3 images", () => {
    const shape = testStashShape();
    expect(starPerformer(shape)).toBe("100006");
    expect(withPerformer(shape, "scene")).toHaveLength(3);

    const graph = extend(shape);
    expect(withPerformer(graph, "scene").length).toBeGreaterThanOrEqual(12);
    expect(withPerformer(graph, "image")).toHaveLength(3);
    const added = graph.entities.image.filter((image) => image.extension);
    expect(added.map((image) => image.id)).toEqual([
      "100007",
      "100008",
      "100009",
    ]);
    for (const image of added) {
      expect(ids(image, "performers")).toEqual(["100006"]);
      expect(ids(image, "galleries")).toEqual([]);
      expect(image.files).toHaveLength(1);
    }
  });

  it("adds 2 clips, 1 rated scene with a caption", () => {
    const graph = extend(testStashShape());

    expect(graph.entities.clip).toHaveLength(2);
    for (const clip of graph.entities.clip) {
      expect(clip.extension).toBe(true);
      expect(ids(clip, "scene")).toEqual(["100001"]);
      expect(ids(clip, "primary_tag")).toEqual(["100001"]);
      expect(ids(clip, "tags")).toEqual([]);
    }
    expect(graph.entities.clip.map((clip) => clip.id)).toEqual([
      "100001",
      "100002",
    ]);

    const fixed = graph.entities.scene.filter(
      (scene) => scene.values !== undefined
    );
    expect(fixed.map((scene) => [scene.id, scene.values])).toEqual([
      [
        "100017",
        {
          rating100: 80,
          captions: [{ language_code: "en", caption_type: "vtt" }],
        },
      ],
    ]);
    // The other extension scenes are unrated and have no captions
    const others = graph.entities.scene.filter(
      (scene) => scene.extension && scene.id !== "100017"
    );
    for (const scene of others) {
      expect(scene.present).not.toContain("rating100");
      expect(scene.lengths.captions).toBe(0);
    }
  });

  it("leaves the recorded gallery images untouched", () => {
    const shape = testStashShape();
    const graph = extend(shape);

    expect(graph.entities.image.slice(0, 6)).toEqual(shape.entities.image);
    // The galleries are as recorded, but for the studio gallery 100002 gets
    // (the relations integration tests need)
    const galleries = structuredClone(shape.entities.gallery);
    must(
      galleries.find((gallery) => gallery.id === "100002"),
      "gallery 100002"
    ).relations.studio = [{ id: "100005" }];
    expect(graph.entities.gallery).toEqual(galleries);
    // No image is added to a gallery
    const inGalleries = graph.entities.image.filter(
      (image) => ids(image, "galleries").length > 0
    );
    expect(inGalleries.map((image) => image.id)).toEqual([
      "100001",
      "100002",
      "100003",
      "100004",
      "100005",
      "100006",
    ]);
  });

  it("adds the relations integration tests need, and changes no TEST_ENTITIES pick", () => {
    const shape = testStashShape();
    const graph = extend(shape);

    // The test Stash lacks them: its group has no studio, and the studio the
    // tests use has no tag, no gallery and no scene in a group
    expect(ids(entity(shape, "group", "100001"), "studio")).toEqual([]);
    expect(ids(entity(shape, "studio", "100005"), "tags")).toEqual([]);
    expect(ids(entity(shape, "gallery", "100002"), "studio")).toEqual([]);
    expect(ids(entity(shape, "scene", "100010"), "studio")).toEqual(["100005"]);
    expect(ids(entity(shape, "scene", "100010"), "groups")).toEqual([]);

    const group = entity(graph, "group", "100001");
    const studio = entity(graph, "studio", "100005");
    const gallery = entity(graph, "gallery", "100002");
    expect(ids(group, "studio")).toEqual(["100005"]);
    expect(ids(studio, "groups")).toEqual(["100001"]);
    expect(ids(studio, "movies")).toEqual(["100001"]);
    expect(ids(studio, "tags")).toEqual(["100001"]);
    expect(ids(gallery, "studio")).toEqual(["100005"]);
    expect(entity(graph, "scene", "100010").relations.groups).toEqual([
      { id: "100001", present: [] },
    ]);

    // Nothing else of a recorded entity changes
    const reverted = structuredClone(graph);
    entity(reverted, "group", "100001").relations.studio = [];
    const revertedStudio = entity(reverted, "studio", "100005");
    revertedStudio.relations.groups = [];
    revertedStudio.relations.movies = [];
    revertedStudio.relations.tags = [];
    entity(reverted, "gallery", "100002").relations.studio = [];
    entity(reverted, "scene", "100010").relations.groups = [];
    // G's links to the added groups (the collection hierarchy)
    entity(reverted, "group", "100001").relations.containing_groups = [];
    entity(reverted, "group", "100001").relations.sub_groups = [];
    for (const type of ENTITY_TYPES) {
      expect(
        reverted.entities[type].filter((each) => each.extension !== true),
        type
      ).toEqual(shape.entities[type]);
    }

    // The counts follow, and the picks are the ones the test Stash gives
    const { library, testEntities } = buildFixture(shape);
    const studioEntity = must(
      library.entities.studio.find((each) => each.id === "100005")
    );
    expect(studioEntity.group_count).toBe(1);
    expect(
      must(library.entities.group.find((each) => each.id === "100001"))
        .scene_count
    ).toBe(4);
    expect(studioEntity.gallery_count).toBe(1);
    const tag = must(library.entities.tag.find((each) => each.id === "100001"));
    expect(tag.studio_count).toBe(1);
    expect(testEntities).toEqual(OWNER_TEST_ENTITIES);
  });

  it("the extension adds a group containing G and a group inside G, with descriptions", () => {
    const shape = testStashShape();
    const graph = extend(shape);

    // G, the group the tests use, is in no hierarchy in the test Stash
    expect(ids(entity(shape, "group", "100001"), "containing_groups")).toEqual(
      []
    );
    expect(ids(entity(shape, "group", "100001"), "sub_groups")).toEqual([]);

    // P (100002) holds G as its sub-group, and C (100003) sits inside G,
    // numbered after the recorded group; each link carries its description
    // on both ends
    expect(
      graph.entities.group.map((each) => [each.id, each.extension === true])
    ).toEqual([
      ["100001", false],
      ["100002", true],
      ["100003", true],
    ]);
    const boxSet = {
      present: ["description"],
      values: { description: "Box set" },
    };
    const part2 = {
      present: ["description"],
      values: { description: "Part 2" },
    };
    const g = entity(graph, "group", "100001");
    const p = entity(graph, "group", "100002");
    const c = entity(graph, "group", "100003");
    expect(p.relations.sub_groups).toEqual([{ id: "100001", ...boxSet }]);
    expect(p.relations.containing_groups).toEqual([]);
    expect(g.relations.containing_groups).toEqual([
      { id: "100002", ...boxSet },
    ]);
    expect(g.relations.sub_groups).toEqual([{ id: "100003", ...part2 }]);
    expect(c.relations.containing_groups).toEqual([{ id: "100001", ...part2 }]);
    expect(c.relations.sub_groups).toEqual([]);
    // Every recorded field set, and no studio or tag
    for (const added of [p, c]) {
      expect(added.present).toEqual(
        arrayContaining([
          "aliases",
          "back_image_path",
          "date",
          "director",
          "duration",
          "name",
          "rating100",
          "synopsis",
        ])
      );
      expect(ids(added, "studio")).toEqual([]);
      expect(ids(added, "tags")).toEqual([]);
    }

    // The replay serves each link from both ends, and the picks stay
    const { library, testEntities } = buildFixture(shape);
    const served = (id: string) =>
      must(library.entities.group.find((each) => each.id === id));
    const link = (id: string, description: string) => ({
      group: { id, name: `Group ${id}` },
      description,
    });
    expect(served("100002").sub_groups).toEqual([link("100001", "Box set")]);
    expect(served("100001").containing_groups).toEqual([
      link("100002", "Box set"),
    ]);
    expect(served("100001").sub_groups).toEqual([link("100003", "Part 2")]);
    expect(served("100003").containing_groups).toEqual([
      link("100001", "Part 2"),
    ]);
    expect(served("100001").sub_group_count).toBe(1);
    expect(served("100002").sub_group_count).toBe(1);
    expect(served("100003").sub_group_count).toBe(0);
    expect(served("100002").scene_count).toBe(0);
    expect(testEntities).toEqual(OWNER_TEST_ENTITIES);
  });
});
