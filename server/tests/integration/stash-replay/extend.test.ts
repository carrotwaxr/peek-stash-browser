/**
 * The test Stash alone is smaller than E2E's minimum library (sweep item
 * 83), so the generator extends the recorded graph with a fixed,
 * deterministic set of scenes, images and markers before it synthesises
 * values.
 */
import { describe, expect, it } from "vitest";
import {
  EXTENDED_SCENE_COUNT,
  extend,
  starPerformer,
} from "../../../integration/stash-replay/extend.js";
import type {
  GraphEntity,
  LibraryGraph,
} from "../../../integration/stash-replay/synth.js";
import { arrayContaining } from "../../helpers/matchers.js";
import { must } from "../../helpers/must.js";
import { testStashShape } from "./shapeFixture.js";

function ids(entity: GraphEntity, relation: string): string[] {
  return (entity.relations[relation] ?? []).map((link) => link.id);
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
    // The recorded scenes are left as they were
    expect(scenes.slice(0, 16)).toEqual(testStashShape().entities.scene);
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
    expect(graph.entities.gallery).toEqual(shape.entities.gallery);
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
});
