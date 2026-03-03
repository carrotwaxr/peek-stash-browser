import { describe, it, expect } from "vitest";
import { buildTagTree } from "../../src/utils/buildTagTree";

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

describe("buildTagTree with filter", () => {
  it("returns empty array when no matches", () => {
    const tags = [
      { id: "1", name: "Action", parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { filterQuery: "xyz" });
    expect(result).toEqual([]);
  });

  it("returns matching tags and their ancestors", () => {
    const tags = [
      { id: "1", name: "Genre", parents: [], children: [{ id: "2", name: "Action" }] },
      { id: "2", name: "Action", parents: [{ id: "1", name: "Genre" }], children: [] },
    ];
    const result = buildTagTree(tags, { filterQuery: "action" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1"); // Genre (ancestor)
    expect(result[0].isAncestorOnly).toBe(true);
    expect(result[0].children[0].id).toBe("2"); // Action (match)
    expect(result[0].children[0].isAncestorOnly).toBeUndefined();
  });

  it("marks ancestors as isAncestorOnly", () => {
    const tags = [
      { id: "1", name: "Root", parents: [], children: [{ id: "2", name: "Middle" }] },
      { id: "2", name: "Middle", parents: [{ id: "1", name: "Root" }], children: [{ id: "3", name: "Leaf" }] },
      { id: "3", name: "Leaf", parents: [{ id: "2", name: "Middle" }], children: [] },
    ];
    const result = buildTagTree(tags, { filterQuery: "leaf" });
    expect(result[0].isAncestorOnly).toBe(true); // Root
    expect(result[0].children[0].isAncestorOnly).toBe(true); // Middle
    expect(result[0].children[0].children[0].isAncestorOnly).toBeUndefined(); // Leaf (match)
  });
});

describe("buildTagTree with sorting", () => {
  it("sorts roots alphabetically by name (ASC)", () => {
    const tags = [
      { id: "1", name: "Zebra", parents: [], children: [] },
      { id: "2", name: "Apple", parents: [], children: [] },
      { id: "3", name: "Mango", parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "name", sortDirection: "ASC" });
    expect(result[0].name).toBe("Apple");
    expect(result[1].name).toBe("Mango");
    expect(result[2].name).toBe("Zebra");
  });

  it("sorts roots by name DESC", () => {
    const tags = [
      { id: "1", name: "Apple", parents: [], children: [] },
      { id: "2", name: "Zebra", parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "name", sortDirection: "DESC" });
    expect(result[0].name).toBe("Zebra");
    expect(result[1].name).toBe("Apple");
  });

  it("sorts by scene_count", () => {
    const tags = [
      { id: "1", name: "A", scene_count: 10, parents: [], children: [] },
      { id: "2", name: "B", scene_count: 5, parents: [], children: [] },
      { id: "3", name: "C", scene_count: 20, parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "scenes_count", sortDirection: "DESC" });
    expect(result[0].scene_count).toBe(20);
    expect(result[1].scene_count).toBe(10);
    expect(result[2].scene_count).toBe(5);
  });

  it("sorts children at each level", () => {
    const tags = [
      { id: "1", name: "Parent", parents: [], children: [{ id: "2" }, { id: "3" }] },
      { id: "2", name: "Zebra", parents: [{ id: "1" }], children: [] },
      { id: "3", name: "Apple", parents: [{ id: "1" }], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "name", sortDirection: "ASC" });
    expect(result[0].children[0].name).toBe("Apple");
    expect(result[0].children[1].name).toBe("Zebra");
  });

  it("sorts by scene_count field (alternate key)", () => {
    const tags = [
      { id: "1", name: "A", scene_count: 5, parents: [], children: [] },
      { id: "2", name: "B", scene_count: 15, parents: [], children: [] },
      { id: "3", name: "C", scene_count: 10, parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "scene_count", sortDirection: "ASC" });
    expect(result[0].scene_count).toBe(5);
    expect(result[1].scene_count).toBe(10);
    expect(result[2].scene_count).toBe(15);
  });

  it("sorts by performer_count", () => {
    const tags = [
      { id: "1", name: "A", performer_count: 30, parents: [], children: [] },
      { id: "2", name: "B", performer_count: 10, parents: [], children: [] },
      { id: "3", name: "C", performer_count: 20, parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "performer_count", sortDirection: "DESC" });
    expect(result[0].performer_count).toBe(30);
    expect(result[1].performer_count).toBe(20);
    expect(result[2].performer_count).toBe(10);
  });

  it("sorts by created_at", () => {
    const tags = [
      { id: "1", name: "A", created_at: "2024-03-01", parents: [], children: [] },
      { id: "2", name: "B", created_at: "2024-01-01", parents: [], children: [] },
      { id: "3", name: "C", created_at: "2024-02-01", parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "created_at", sortDirection: "ASC" });
    expect(result[0].created_at).toBe("2024-01-01");
    expect(result[1].created_at).toBe("2024-02-01");
    expect(result[2].created_at).toBe("2024-03-01");
  });

  it("sorts by updated_at", () => {
    const tags = [
      { id: "1", name: "A", updated_at: "2024-03-01", parents: [], children: [] },
      { id: "2", name: "B", updated_at: "2024-01-01", parents: [], children: [] },
      { id: "3", name: "C", updated_at: "2024-02-01", parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "updated_at", sortDirection: "DESC" });
    expect(result[0].updated_at).toBe("2024-03-01");
    expect(result[1].updated_at).toBe("2024-02-01");
    expect(result[2].updated_at).toBe("2024-01-01");
  });

  it("falls back to name sort for unknown sort field", () => {
    const tags = [
      { id: "1", name: "Zebra", parents: [], children: [] },
      { id: "2", name: "Apple", parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "unknown_field", sortDirection: "ASC" });
    expect(result[0].name).toBe("Apple");
    expect(result[1].name).toBe("Zebra");
  });

  it("handles missing sort values gracefully (defaults to 0 or empty string)", () => {
    const tags = [
      { id: "1", name: "A", parents: [], children: [] }, // no scene_count
      { id: "2", name: "B", scene_count: 5, parents: [], children: [] },
    ];
    const result = buildTagTree(tags, { sortField: "scene_count", sortDirection: "DESC" });
    expect(result[0].scene_count).toBe(5);
    // Tag without scene_count defaults to 0, sorts last in DESC
    expect(result[1].scene_count).toBeUndefined();
  });
});

describe("buildTagTree edge cases", () => {
  it("returns empty array for null input", () => {
    expect(buildTagTree(null as any)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(buildTagTree(undefined as any)).toEqual([]);
  });

  it("handles tags without parents property (treated as root)", () => {
    const tags = [
      { id: "1", name: "Root" } as any,
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Root");
  });

  it("handles circular references without infinite loop", () => {
    const tags = [
      { id: "1", name: "A", parents: [], children: [{ id: "2", name: "B" }] },
      { id: "2", name: "B", parents: [{ id: "1", name: "A" }], children: [{ id: "1", name: "A" }] },
    ];
    // Should not hang or throw
    const result = buildTagTree(tags);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });
});
