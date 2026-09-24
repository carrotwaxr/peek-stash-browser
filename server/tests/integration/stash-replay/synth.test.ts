/**
 * Every value in the replay library is synthetic (sweep item 83): generated
 * from the recorded shape by one rule per field, each from a PRNG seeded
 * with the type, id and field, so the output is deterministic and never a
 * copy of a source value.
 */
import { describe, expect, it } from "vitest";
import {
  type Entity,
  type EntityType,
  type ReplayLibrary,
  isRecord,
} from "../../../integration/stash-replay/library.js";
import {
  type Selections,
  loadSelections,
  mergeSelections,
} from "../../../integration/stash-replay/selections.js";
import {
  type LibraryGraph,
  type RecordedShape,
  synthesize,
} from "../../../integration/stash-replay/synth.js";
import { anyOf, objectContaining } from "../../helpers/matchers.js";
import { must } from "../../helpers/must.js";
import { testStashShape } from "./shapeFixture.js";

const SELECTIONS = loadSelections();

/** The test Stash's shape plus one marker on scene 100001, as a graph. */
function graph(): LibraryGraph {
  const shape: RecordedShape = testStashShape();
  shape.entities.clip.push({
    id: "100001",
    present: shape.fields.clip.filter(
      (path) => !["scene", "primary_tag", "tags"].includes(path)
    ),
    relations: {
      scene: [{ id: "100001" }],
      primary_tag: [{ id: "100001" }],
      tags: [{ id: "100003" }],
    },
    lengths: {},
  });
  return shape;
}

function library(selections: Selections = SELECTIONS): ReplayLibrary {
  return synthesize(graph(), selections);
}

function entity(lib: ReplayLibrary, type: EntityType, id: string): Entity {
  return must(
    lib.entities[type].find((candidate) => candidate.id === id),
    `${type} ${id}`
  );
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("not a list");
  return value.map((item: unknown) => {
    if (!isRecord(item)) throw new Error("not a record");
    return item;
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("not a record");
  return value;
}

function ids(value: unknown): string[] {
  return records(value).map((item) => String(item.id));
}

function firstFile(scene: Entity): Record<string, unknown> {
  return must(records(scene.files)[0], `scene ${scene.id} file`);
}

/** Every [path, value] leaf of a JSON value. */
function leaves(value: unknown, path = ""): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) =>
      leaves(item, `${path}[${index}]`)
    );
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path === "" ? key : `${path}.${key}`)
    );
  }
  return [[path, value]];
}

function threeDecimals(value: unknown): boolean {
  if (typeof value !== "number") return false;
  const thousandths = Math.round(value * 1000);
  return Math.abs(thousandths - value * 1000) < 1e-6 && thousandths % 10 !== 0;
}

describe("synthesize", () => {
  it("the same shape gives byte-identical output twice", () => {
    expect(JSON.stringify(library())).toBe(JSON.stringify(library()));
  });

  it("adding a field to a selection changes no other value", () => {
    const base = mergeSelections([
      "query FindScenes { findScenes { scenes { id title date updated_at files { size duration height } paths { screenshot sprite } sceneStreams { label } performers { id name gender } } } }",
      "query FindPerformers { findPerformers { performers { id name gender country height_cm } } }",
    ]);
    const more = mergeSelections([
      "query FindScenes { findScenes { scenes { id title details date updated_at files { size duration height bit_rate } paths { screenshot sprite } sceneStreams { label } performers { id name gender } } } }",
      "query FindPerformers { findPerformers { performers { id name gender country height_cm weight } } }",
    ]);
    const before = library(base);
    const after = library(more);

    expect(before.entities.scene.length).toBe(16);
    // The added fields hold values; without them the first library is back
    for (const scene of after.entities.scene) {
      expect(scene.details).toBe(`Scene ${scene.id} details`);
      Reflect.deleteProperty(scene, "details");
      for (const file of records(scene.files)) {
        expect(file.bit_rate).toEqual(anyOf(Number));
        Reflect.deleteProperty(file, "bit_rate");
      }
    }
    for (const performer of after.entities.performer) {
      expect(performer.weight).toEqual(anyOf(Number));
      Reflect.deleteProperty(performer, "weight");
    }
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("a field absent from present is null or empty", () => {
    const shape = graph();
    const scene = must(shape.entities.scene[0]);
    scene.present = scene.present.filter((path) => path !== "details");
    const lib = synthesize(shape, SELECTIONS);

    // Recorded as absent
    expect(entity(lib, "scene", "100001").details).toBeNull();
    expect(entity(lib, "scene", "100002").details).toBe("Scene 100002 details");
    expect(entity(lib, "scene", "100001").rating100).toBeNull();
    expect(entity(lib, "performer", "100006").birthdate).toBeNull();
    expect(entity(lib, "performer", "100001").birthdate).toMatch(
      /^19(6\d|7\d|8[0-3])-\d{2}-\d{2}$/
    );
    expect(entity(lib, "group", "100001").back_image_path).toBeNull();
    // Recorded lengths of 0
    expect(entity(lib, "scene", "100001").captions).toEqual([]);
    expect(entity(lib, "performer", "100006").alias_list).toEqual([]);
    expect(entity(lib, "performer", "100006").stash_ids).toEqual([]);
    expect(entity(lib, "studio", "100001").aliases).toEqual([]);
    // A relation with no ids
    expect(entity(lib, "scene", "100009").performers).toEqual([]);
    expect(record(entity(lib, "scene", "100004").studio).id).toBe("100010");
    expect(entity(lib, "image", "100001").studio).toBeNull();
    // Fields the recording did not select are present by default
    const newer = graph();
    newer.fields.scene = newer.fields.scene.filter((path) => path !== "code");
    expect(entity(synthesize(newer, SELECTIONS), "scene", "100001").code).toBe(
      "Scene 100001 code"
    );
  });

  it("counts follow the generated relations", () => {
    const lib = library();
    const performer = entity(lib, "performer", "100006");
    expect(performer.scene_count).toBe(3);
    expect(performer.gallery_count).toBe(1);
    expect(performer.image_count).toBe(0);
    expect(performer.group_count).toBe(1);
    expect(performer.movie_count).toBe(1);

    const tag = entity(lib, "tag", "100003");
    expect(tag.scene_count).toBe(10);
    expect(tag.performer_count).toBe(1);
    expect(tag.studio_count).toBe(1);
    expect(tag.gallery_count).toBe(1);
    expect(tag.group_count).toBe(1);
    expect(tag.scene_marker_count).toBe(1);
    expect(entity(lib, "tag", "100001").scene_marker_count).toBe(1);
    expect(entity(lib, "tag", "100005").child_count).toBe(2);
    expect(entity(lib, "tag", "100009").parent_count).toBe(1);

    const studio = entity(lib, "studio", "100007");
    expect(studio.scene_count).toBe(3);
    expect(studio.gallery_count).toBe(1);
    expect(studio.performer_count).toBe(2);
    expect(entity(lib, "studio", "100005").scene_count).toBe(5);

    const group = entity(lib, "group", "100001");
    expect(group.scene_count).toBe(3);
    expect(group.performer_count).toBe(2);
    expect(group.sub_group_count).toBe(0);
    expect(entity(lib, "gallery", "100001").image_count).toBe(3);

    // Every performer's scene_count is the scenes that list it
    for (const each of lib.entities.performer) {
      const listing = lib.entities.scene.filter((scene) =>
        ids(scene.performers).includes(each.id)
      );
      expect(each.scene_count, `performer ${each.id}`).toBe(listing.length);
    }
  });

  it("a nested reference carries the referenced entity's synthetic name", () => {
    const lib = library();
    const scene = entity(lib, "scene", "100003");
    const studio = record(scene.studio);
    const topStudio = entity(lib, "studio", "100007");

    expect(studio.name).toBe("Studio 100007");
    expect(studio.name).toBe(topStudio.name);
    // Every nested field is the referenced entity's own value
    expect(studio.created_at).toBe(topStudio.created_at);
    expect(studio.url).toBe(topStudio.url);
    expect(records(studio.tags)).toEqual([
      objectContaining<Record<string, unknown>>({
        id: "100003",
        name: "Tag 100003",
        image_path: entity(lib, "tag", "100003").image_path,
      }),
    ]);
    expect(records(scene.performers).map((each) => each.name)).toEqual([
      "Performer 100006",
      "Performer 100007",
    ]);
    expect(records(scene.performers).map((each) => each.birthdate)).toEqual([
      entity(lib, "performer", "100006").birthdate,
      entity(lib, "performer", "100007").birthdate,
    ]);
    expect(records(scene.groups)).toEqual([
      { scene_index: 3, group: { id: "100001", name: "Group 100001" } },
    ]);
    expect(records(entity(lib, "image", "100004").galleries)).toEqual([
      { id: "100001", title: "Gallery 100001" },
    ]);
    expect(record(entity(lib, "clip", "100001").scene)).toEqual({
      id: "100001",
    });
  });

  it("heights cycle through 243, 483, 723 and 1083, with the matching stream labels", () => {
    const lib = library();
    const sizes = lib.entities.scene.map((scene) => {
      const file = firstFile(scene);
      return [file.width, file.height];
    });
    expect(sizes.slice(0, 5)).toEqual([
      [431, 243],
      [861, 483],
      [1287, 723],
      [1927, 1083],
      [431, 243],
    ]);

    const labels = (scene: Entity) =>
      records(scene.sceneStreams).map((stream) => stream.label);
    const tiers = (...names: string[]) =>
      ["MP4", "WEBM", "HLS", "DASH"].flatMap((format) => [
        format,
        ...names.map((name) => `${format} ${name}`),
      ]);
    const [first, second, third, fourth] = lib.entities.scene;
    expect(labels(must(first))).toEqual([
      "Direct stream",
      ...tiers("Low (240p)"),
    ]);
    expect(labels(must(second))).toEqual([
      "Direct stream",
      ...tiers("Standard (480p)", "Low (240p)"),
    ]);
    expect(labels(must(third))).toEqual([
      "Direct stream",
      ...tiers("HD (720p)", "Standard (480p)", "Low (240p)"),
    ]);
    expect(labels(must(fourth))).toEqual([
      "Direct stream",
      ...tiers("Full HD (1080p)", "HD (720p)", "Standard (480p)", "Low (240p)"),
    ]);
  });

  it("every media URL starts with {{STASH_ORIGIN}}", () => {
    const lib = library();
    const mediaKeys = new Set([
      "image_path",
      "front_image_path",
      "screenshot",
      "preview",
      "stream",
      "webp",
      "vtt",
      "sprite",
      "caption",
      "thumbnail",
      "image",
      "cover",
    ]);
    const media = leaves(lib).filter(([path, value]) => {
      const key = path.split(".").pop() ?? "";
      return mediaKeys.has(key) && typeof value === "string";
    });

    expect(media.length).toBeGreaterThan(100);
    for (const [path, value] of media) {
      expect(String(value), path).toMatch(/^\{\{STASH_ORIGIN\}\}\/[a-z]/);
      expect(String(value), path).toMatch(/[?&]t=\d+/);
    }
    const scene = entity(lib, "scene", "100001");
    const oshash = records(firstFile(scene).fingerprints).find(
      (fingerprint) => fingerprint.type === "oshash"
    );
    expect(record(scene.paths).sprite).toBe(
      `{{STASH_ORIGIN}}/scene/${String(must(oshash).value)}_sprite.jpg?t=${String(/t=(\d+)/.exec(String(record(scene.paths).screenshot))?.[1])}`
    );
    expect(entity(lib, "tag", "100001").image_path).toMatch(
      /^\{\{STASH_ORIGIN\}\}\/tag\/100001\/image\?t=\d+&default=true$/
    );
    // Every other URL is under a reserved .invalid domain
    const urls = leaves(lib).filter(
      ([, value]) => typeof value === "string" && value.includes("://")
    );
    for (const [path, value] of urls) {
      expect(String(value), path).toMatch(
        /^https:\/\/(example|stashbox)\.invalid\//
      );
    }
  });

  it("a selected field with no rule fails naming type, field and operation", () => {
    expect(() =>
      library(
        mergeSelections([
          "query FindScenes { findScenes { scenes { id interactive } } }",
        ])
      )
    ).toThrow(
      "no synthetic rule for scene.interactive (selected by FindScenes): add one in server/integration/stash-replay/synth.ts"
    );
    // A field of a referenced entity names that entity's type
    expect(() =>
      library(
        mergeSelections([
          "query FindImagesPlus { findImages { images { id studio { id name child_count } } } }",
        ])
      )
    ).toThrow(
      "no synthetic rule for studio.child_count (selected by FindImagesPlus)"
    );
    // So does a field below a non-entity object
    expect(() =>
      library(
        mergeSelections([
          "query FindScenesFiles { findScenes { scenes { files { id mod_time } } } }",
        ])
      )
    ).toThrow("no synthetic rule for scene.files.mod_time");
  });

  it("categorical and measured values cannot be real data", () => {
    const lib = library();
    for (const scene of lib.entities.scene) {
      for (const file of records(scene.files)) {
        expect(Number(file.width) % 2, `scene ${scene.id} width`).toBe(1);
        expect(Number(file.height) % 2, `scene ${scene.id} height`).toBe(1);
        expect(threeDecimals(file.duration), `scene ${scene.id}`).toBe(true);
        expect(threeDecimals(file.frame_rate), `scene ${scene.id}`).toBe(true);
      }
    }
    for (const image of lib.entities.image) {
      expect(records(image.files)).toEqual([
        objectContaining<Record<string, unknown>>({ width: 319, height: 239 }),
      ]);
    }
    for (const performer of lib.entities.performer) {
      expect(performer.country).toMatch(/^X[A-Z]$/);
      for (const field of [
        "ethnicity",
        "hair_color",
        "eye_color",
        "fake_tits",
      ]) {
        expect(performer[field]).toMatch(new RegExp(`^${field} [1-5]$`));
      }
      expect(performer.height_cm).toBeGreaterThanOrEqual(211);
      expect(performer.height_cm).toBeLessThanOrEqual(249);
      expect(performer.weight).toBeGreaterThanOrEqual(311);
      expect(performer.weight).toBeLessThanOrEqual(349);
    }
    const clip = entity(lib, "clip", "100001");
    expect(threeDecimals(clip.seconds)).toBe(true);
    expect(threeDecimals(clip.end_seconds)).toBe(true);
    expect(Number(clip.end_seconds)).toBeGreaterThan(Number(clip.seconds));
    // Dates sit in the synthetic windows
    for (const scene of lib.entities.scene) {
      expect(scene.date).toMatch(/^200[1-9]-\d{2}-\d{2}$/);
      expect(scene.created_at).toMatch(
        /^2003-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/
      );
      expect(scene.updated_at).toMatch(/^200[345]-/);
      expect(Date.parse(String(scene.updated_at))).toBeGreaterThanOrEqual(
        Date.parse(String(scene.created_at))
      );
    }
    // The first two performers with a gender are FEMALE and MALE
    expect(lib.entities.performer.slice(0, 3).map((p) => p.gender)).toEqual([
      "FEMALE",
      "MALE",
      "TRANSGENDER_FEMALE",
    ]);
  });

  it("changing SYNTH_SEED changes every PRNG value", () => {
    const first = leaves(synthesize(graph(), SELECTIONS));
    const second = new Map(
      leaves(synthesize(graph(), SELECTIONS, { seed: "peek-stash-replay-v2" }))
    );
    const changed = (pattern: RegExp) =>
      first
        .filter(([path, value]) => pattern.test(path) && value !== null)
        .map(([path, value]) => [path, value !== second.get(path)] as const);

    // Values drawn from a wide range change everywhere
    for (const pattern of [
      /^entities\.scene\[\d+\]\.files\[\d+\]\.(size|duration|bit_rate|created_at)$/,
      /\.fingerprints\[\d+\]\.value$/,
      /\.stash_ids\[\d+\]\.stash_id$/,
      /^entities\.\w+\[\d+\]\.(created_at|updated_at)$/,
      /^entities\.\w+\[\d+\]\.date$/,
      /^entities\.performer\[\d+\]\.birthdate$/,
      /^entities\.clip\[\d+\]\.(seconds|end_seconds)$/,
      /\.(image_path|screenshot|thumbnail|sprite)$/,
    ]) {
      const results = changed(pattern);
      expect(results.length, String(pattern)).toBeGreaterThan(0);
      for (const [path, differs] of results) {
        expect(differs, path).toBe(true);
      }
    }
    // Values drawn from a few choices change somewhere
    for (const pattern of [
      /\.frame_rate$/,
      /\.country$/,
      /\.hair_color$/,
      /\.height_cm$/,
      /\.weight$/,
      /\.o_counter$/,
      /\.favorite$/,
    ]) {
      expect(
        changed(pattern).some(([, differs]) => differs),
        String(pattern)
      ).toBe(true);
    }
    // Rule-built values do not depend on the seed
    expect(second.get("entities.scene[0].title")).toBe("Scene 100001");
    expect(second.get("entities.scene[0].files[0].height")).toBe(243);
  });
});
