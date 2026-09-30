/**
 * The folder view's folders (item 57, #398): the current tag's children, or
 * the roots, each shown while its subtree holds a tag with items of the
 * page's type; a folder's badge is its tag's own count for that type. Items
 * are not placed here: the list pages them, the folder's tag at depth 0.
 */
import { describe, expect, it } from "vitest";
import {
  type FolderCountField,
  type FolderTreeTag,
  buildFolderTree,
} from "../../src/utils/buildFolderTree";

/** A tag on instance "a" with its parents' ids and its counts */
const tag = (
  id: string,
  name: string,
  parents: string[] = [],
  counts: Partial<Record<FolderCountField, number>> = {}
): FolderTreeTag => ({
  id,
  instanceId: "a",
  name,
  parents: parents.map((p) => ({ id: p })),
  ...counts,
});

const folders = (
  tags: readonly FolderTreeTag[],
  path: string[],
  field: FolderCountField
) => buildFolderTree(tags, path, field).folders.map((f) => [f.name, f.count]);

describe("buildFolderTree", () => {
  it("a gallery folder view shows a folder whose subtree has galleries and hides one with scenes only", () => {
    const tags = [
      tag("1", "Albums", [], { gallery_count: 2 }),
      tag("2", "Clips only", [], { scene_count: 40 }),
      tag("3", "Holder"),
      tag("4", "Deep album", ["3"], { gallery_count: 1 }),
    ];

    expect(folders(tags, [], "gallery_count")).toEqual([
      ["Albums", 2],
      ["Holder", 0],
    ]);
    // The same tags on the scene list show the scene folder only
    expect(folders(tags, [], "scene_count")).toEqual([["Clips only", 40]]);
  });

  it("a folder's badge is its own count for the page's type", () => {
    const tags = [
      tag("1", "Genre", [], { scene_count: 3, image_count: 9 }),
      tag("2", "Action", ["1"], { scene_count: 5, image_count: 1 }),
    ];

    // Genre's own count, not its subtree's and not another type's
    expect(folders(tags, [], "scene_count")).toEqual([["Genre", 3]]);
    expect(folders(tags, [], "image_count")).toEqual([["Genre", 9]]);
    expect(folders(tags, ["1:a"], "image_count")).toEqual([["Action", 1]]);
  });

  it("a container tag with content only below shows", () => {
    const tags = [
      tag("1", "Container"),
      tag("2", "Middle", ["1"]),
      tag("3", "Leaf", ["2"], { image_count: 4 }),
      tag("4", "Empty"),
      tag("5", "Empty parent"),
      tag("6", "Empty child", ["5"]),
    ];

    expect(folders(tags, [], "image_count")).toEqual([["Container", 0]]);
    expect(folders(tags, ["1:a"], "image_count")).toEqual([["Middle", 0]]);
    expect(folders(tags, ["1:a", "2:a"], "image_count")).toEqual([["Leaf", 4]]);
  });

  it("a tag under two parents shows under each, and a parent loop ends", () => {
    const tags = [
      tag("1", "Genre"),
      tag("2", "Mood"),
      tag("3", "Noir", ["1", "2"], { scene_count: 2 }),
      // A loop with no content: neither shows
      tag("8", "Loop A", ["9"]),
      tag("9", "Loop B", ["8"]),
    ];

    expect(folders(tags, [], "scene_count")).toEqual([
      ["Genre", 0],
      ["Mood", 0],
    ]);
    expect(folders(tags, ["1:a"], "scene_count")).toEqual([["Noir", 2]]);
    expect(folders(tags, ["2:a"], "scene_count")).toEqual([["Noir", 2]]);
  });

  it("folders sort by name and carry the tag's image", () => {
    const tags = [
      { ...tag("1", "Zeta", [], { scene_count: 1 }), image_path: "/z.jpg" },
      tag("2", "Alpha", [], { scene_count: 1 }),
    ];

    const result = buildFolderTree(tags, [], "scene_count");

    expect(result.folders.map((f) => [f.name, f.thumbnail])).toEqual([
      ["Alpha", null],
      ["Zeta", "/z.jpg"],
    ]);
  });

  it("builds the breadcrumbs from the path, Unknown for a tag not loaded", () => {
    const tags = [tag("1", "Genre"), tag("2", "Horror", ["1"])];

    expect(
      buildFolderTree(tags, ["1:a", "2:a", "9:a"], "scene_count").breadcrumbs
    ).toEqual([
      { id: "1:a", name: "Genre" },
      { id: "2:a", name: "Horror" },
      { id: "9:a", name: "Unknown" },
    ]);
    expect(buildFolderTree(tags, [], "scene_count").breadcrumbs).toEqual([]);
  });

  describe("across instances", () => {
    // Tag 5 on A (with child 6) and tag 5 on B (with child 7)
    const tags: FolderTreeTag[] = [
      { id: "5", instanceId: "a", name: "Five A", parents: [], scene_count: 1 },
      {
        id: "6",
        instanceId: "a",
        name: "Six A",
        parents: [{ id: "5" }],
        scene_count: 1,
      },
      { id: "5", instanceId: "b", name: "Five B", parents: [], scene_count: 2 },
      {
        id: "7",
        instanceId: "b",
        name: "Seven B",
        parents: [{ id: "5" }],
        scene_count: 1,
      },
    ];

    it("same-numbered tags on two instances are two folders", () => {
      const result = buildFolderTree(tags, [], "scene_count");

      expect(
        result.folders.map((f) => [f.id, f.name, f.count] as const)
      ).toEqual([
        ["5:a", "Five A", 1],
        ["5:b", "Five B", 2],
      ]);
    });

    it("a path of composite keys opens the folder on its own instance", () => {
      const onA = buildFolderTree(tags, ["5:a"], "scene_count");
      expect(onA.breadcrumbs).toEqual([{ id: "5:a", name: "Five A" }]);
      expect(onA.folders.map((f) => f.id)).toEqual(["6:a"]);

      const onB = buildFolderTree(tags, ["5:b"], "scene_count");
      expect(onB.folders.map((f) => [f.id, f.count])).toEqual([["7:b", 1]]);
    });
  });

  it("each tag's parents are read once per build", () => {
    const base = [
      tag("1", "Genre"),
      tag("2", "Mood"),
      tag("3", "Thriller", ["1", "2"]),
      tag("4", "Dark", ["2"]),
      tag("5", "Noir", ["3", "4"], { image_count: 2 }),
      tag("6", "Action", ["1"], { image_count: 1 }),
    ];
    const reads = new Map<string, number>();
    const counted = base.map((t) => ({
      id: t.id,
      instanceId: t.instanceId,
      name: t.name,
      image_count: t.image_count,
      get parents() {
        reads.set(t.id, (reads.get(t.id) ?? 0) + 1);
        return t.parents;
      },
    }));

    for (const path of [[], ["2:a"], ["2:a", "3:a"]]) {
      reads.clear();
      buildFolderTree(counted, path, "image_count");
      expect(
        Math.max(0, ...reads.values()),
        path.join("/")
      ).toBeLessThanOrEqual(1);
    }
    expect(reads.size).toBeGreaterThan(0);
  });
});
