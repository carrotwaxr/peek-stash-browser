/**
 * The integration suite's test entities are picked from the generated
 * library (sweep item 83) by the criteria testEntities.example.ts describes,
 * the lowest id winning, and only among recorded entities, so each id also
 * exists in the live test Stash.
 */
import { describe, expect, it } from "vitest";
import { extend } from "../../../integration/stash-replay/extend.js";
import {
  ENTITY_TYPES,
  type EntityType,
  type ReplayLibrary,
} from "../../../integration/stash-replay/library.js";
import { selectTestEntities } from "../../../integration/stash-replay/selectTestEntities.js";
import { loadSelections } from "../../../integration/stash-replay/selections.js";
import {
  type RecordedShape,
  synthesize,
} from "../../../integration/stash-replay/synth.js";
import { must } from "../../helpers/must.js";
import { OWNER_TEST_ENTITIES, testStashShape } from "./shapeFixture.js";

const SELECTIONS = loadSelections();

function recordedIds(
  shape: RecordedShape
): Record<EntityType, ReadonlySet<string>> {
  const sets: Partial<Record<EntityType, ReadonlySet<string>>> = {};
  for (const type of ENTITY_TYPES) {
    sets[type] = new Set(shape.entities[type].map((entity) => entity.id));
  }
  return {
    scene: must(sets.scene),
    performer: must(sets.performer),
    studio: must(sets.studio),
    tag: must(sets.tag),
    group: must(sets.group),
    gallery: must(sets.gallery),
    image: must(sets.image),
    clip: must(sets.clip),
  };
}

/** The shape, extended and synthesised, with its recorded ids. */
function generated(shape: RecordedShape = testStashShape()): {
  library: ReplayLibrary;
  recorded: Record<EntityType, ReadonlySet<string>>;
} {
  return {
    library: synthesize(extend(shape), SELECTIONS),
    recorded: recordedIds(shape),
  };
}

function linkScene(
  shape: RecordedShape,
  sceneId: string,
  relation: string,
  ids: string[]
): void {
  const scene = must(
    shape.entities.scene.find((candidate) => candidate.id === sceneId)
  );
  scene.relations[relation] = ids.map((id) => ({ id }));
}

describe("selectTestEntities", () => {
  it("picks each id by its criterion, lowest id on ties", () => {
    const { library, recorded } = generated();
    expect(selectTestEntities(library, recorded)).toEqual(OWNER_TEST_ENTITIES);

    // A lower scene with two performers, two tags and a studio wins
    const shape = testStashShape();
    linkScene(shape, "100002", "performers", ["100006", "100007"]);
    const tie = generated(shape);
    expect(
      selectTestEntities(tie.library, tie.recorded).sceneWithRelations
    ).toBe("100002");
  });

  it("never picks an extension entity", () => {
    // The extension gives studio 100001 two more scenes; only its recorded
    // scene counts, so the studio with several recorded scenes still wins
    const { library, recorded } = generated();
    const studio1Scenes = library.entities.scene.filter((scene) => {
      const studio = scene.studio;
      return (
        typeof studio === "object" &&
        studio !== null &&
        "id" in studio &&
        studio.id === "100001"
      );
    });
    expect(studio1Scenes.length).toBeGreaterThan(1);
    expect(selectTestEntities(library, recorded).studioWithScenes).toBe(
      "100005"
    );

    // With no recorded studio of several scenes, an extended one does not
    // stand in
    const shape = testStashShape();
    for (const scene of shape.entities.scene) {
      const [first] = scene.relations.studio ?? [];
      if (
        first !== undefined &&
        ["100005", "100006", "100007"].includes(first.id)
      ) {
        scene.relations.studio = [];
      }
    }
    const thin = generated(shape);
    expect(() => selectTestEntities(thin.library, thin.recorded)).toThrow(
      "studioWithScenes"
    );
  });

  it("throws naming the key when nothing qualifies", () => {
    const shape = testStashShape();
    shape.entities.group = [];
    for (const scene of shape.entities.scene) {
      scene.relations.groups = [];
    }
    const { library, recorded } = generated(shape);

    expect(() => selectTestEntities(library, recorded)).toThrow(
      "selectTestEntities: no recorded group qualifies as groupWithScenes (a group containing scenes)"
    );
  });
});
