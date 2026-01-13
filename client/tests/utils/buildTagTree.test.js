import { describe, it, expect } from "vitest";
import { buildTagTree } from "../../src/utils/buildTagTree.js";

describe("buildTagTree", () => {
  it("returns empty array for empty input", () => {
    expect(buildTagTree([])).toEqual([]);
  });

  it("returns root tags (no parents) at top level", () => {
    const tags = [
      { id: "1", name: "Root1", parents: [], children: [] },
      { id: "2", name: "Root2", parents: [], children: [] },
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("nests children under their parents", () => {
    const tags = [
      { id: "1", name: "Parent", parents: [], children: [{ id: "2", name: "Child" }] },
      { id: "2", name: "Child", parents: [{ id: "1", name: "Parent" }], children: [] },
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe("2");
  });

  it("duplicates tags under multiple parents", () => {
    const tags = [
      { id: "1", name: "Parent1", parents: [], children: [{ id: "3", name: "Child" }] },
      { id: "2", name: "Parent2", parents: [], children: [{ id: "3", name: "Child" }] },
      { id: "3", name: "Child", parents: [{ id: "1", name: "Parent1" }, { id: "2", name: "Parent2" }], children: [] },
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(2);
    // Child appears under both parents
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe("3");
    expect(result[1].children).toHaveLength(1);
    expect(result[1].children[0].id).toBe("3");
  });

  it("handles deep nesting (grandchildren)", () => {
    const tags = [
      { id: "1", name: "Grandparent", parents: [], children: [{ id: "2", name: "Parent" }] },
      { id: "2", name: "Parent", parents: [{ id: "1", name: "Grandparent" }], children: [{ id: "3", name: "Child" }] },
      { id: "3", name: "Child", parents: [{ id: "2", name: "Parent" }], children: [] },
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(1);
    expect(result[0].children[0].children[0].id).toBe("3");
  });

  it("preserves original tag properties", () => {
    const tags = [
      { id: "1", name: "Tag", parents: [], children: [], scene_count: 42, favorite: true },
    ];
    const result = buildTagTree(tags);
    expect(result[0].scene_count).toBe(42);
    expect(result[0].favorite).toBe(true);
  });
});
