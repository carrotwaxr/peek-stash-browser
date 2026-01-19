import { describe, it, expect } from "vitest";
import { buildFolderTree, UNTAGGED_FOLDER_ID } from "../../src/utils/buildFolderTree.js";

// Helper to create test tags with hierarchy
const createTag = (id, name, parents = [], children = []) => ({
  id,
  name,
  parents: parents.map((p) => ({ id: p.id, name: p.name })),
  children: children.map((c) => ({ id: c.id, name: c.name })),
});

// Helper to create test items
const createItem = (id, tagIds = []) => ({
  id,
  tags: tagIds.map((tagId) => ({ id: tagId })),
  paths: { screenshot: `/thumb/${id}.jpg` },
});

describe("buildFolderTree - empty/null handling", () => {
  it("returns empty result for null items", () => {
    const result = buildFolderTree(null, []);
    expect(result).toEqual({ folders: [], items: [], breadcrumbs: [] });
  });

  it("returns empty result for null tags", () => {
    const result = buildFolderTree([], null);
    expect(result).toEqual({ folders: [], items: [], breadcrumbs: [] });
  });

  it("returns empty result for empty arrays", () => {
    const result = buildFolderTree([], []);
    expect(result).toEqual({ folders: [], items: [], breadcrumbs: [] });
  });
});

describe("buildFolderTree - root level behavior", () => {
  it("shows only root-level tag folders at root (no loose items)", () => {
    const tags = [
      createTag("action", "Action"),
      createTag("comedy", "Comedy"),
    ];
    const items = [
      createItem("scene1", ["action"]),
      createItem("scene2", ["comedy"]),
      createItem("scene3", ["action", "comedy"]),
    ];

    const result = buildFolderTree(items, tags, []);

    expect(result.folders).toHaveLength(2);
    expect(result.folders[0].name).toBe("Action");
    expect(result.folders[1].name).toBe("Comedy");
    // NO loose items at root
    expect(result.items).toHaveLength(0);
  });

  it("shows Untagged folder at root for items with no tags", () => {
    const tags = [createTag("action", "Action")];
    const items = [
      createItem("scene1", ["action"]),
      createItem("scene2", []), // untagged
      createItem("scene3", []), // untagged
    ];

    const result = buildFolderTree(items, tags, []);

    const untaggedFolder = result.folders.find((f) => f.id === UNTAGGED_FOLDER_ID);
    expect(untaggedFolder).toBeDefined();
    expect(untaggedFolder.totalCount).toBe(2);
    expect(result.items).toHaveLength(0);
  });

  it("hides empty folders", () => {
    const tags = [
      createTag("action", "Action"),
      createTag("comedy", "Comedy"), // no items have this tag
    ];
    const items = [createItem("scene1", ["action"])];

    const result = buildFolderTree(items, tags, []);

    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].name).toBe("Action");
  });

  it("sorts folders alphabetically", () => {
    const tags = [
      createTag("zebra", "Zebra"),
      createTag("apple", "Apple"),
      createTag("mango", "Mango"),
    ];
    const items = [
      createItem("scene1", ["zebra"]),
      createItem("scene2", ["apple"]),
      createItem("scene3", ["mango"]),
    ];

    const result = buildFolderTree(items, tags, []);

    expect(result.folders[0].name).toBe("Apple");
    expect(result.folders[1].name).toBe("Mango");
    expect(result.folders[2].name).toBe("Zebra");
  });

  it("items with non-root tags only do NOT appear at root", () => {
    // Tag hierarchy: Genre (root) -> Action (child)
    const genre = createTag("genre", "Genre", [], [{ id: "action", name: "Action" }]);
    const action = createTag("action", "Action", [{ id: "genre", name: "Genre" }]);
    const tags = [genre, action];

    // Item only has child tag, not root tag
    const items = [createItem("scene1", ["action"])];

    const result = buildFolderTree(items, tags, []);

    // Item should be inside Genre folder (via descendant), not loose at root
    expect(result.items).toHaveLength(0);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].name).toBe("Genre");
    expect(result.folders[0].totalCount).toBe(1);
  });
});

describe("buildFolderTree - inside tag folder", () => {
  it("shows child tag folders and directly-tagged items", () => {
    // Hierarchy: Horror -> Slasher
    const horror = createTag("horror", "Horror", [], [{ id: "slasher", name: "Slasher" }]);
    const slasher = createTag("slasher", "Slasher", [{ id: "horror", name: "Horror" }]);
    const tags = [horror, slasher];

    const items = [
      createItem("scene1", ["horror"]), // directly tagged Horror, no child tag
      createItem("scene2", ["horror", "slasher"]), // has both
      createItem("scene3", ["slasher"]), // only has child tag
    ];

    const result = buildFolderTree(items, tags, ["horror"]);

    // Slasher folder should contain scene2 and scene3
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].name).toBe("Slasher");
    expect(result.folders[0].totalCount).toBe(2);

    // Only scene1 should be a loose item (has Horror but not Slasher)
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("scene1");
  });

  it("item with parent+child tag only appears in child folder", () => {
    // Hierarchy: Horror -> Slasher
    const horror = createTag("horror", "Horror", [], [{ id: "slasher", name: "Slasher" }]);
    const slasher = createTag("slasher", "Slasher", [{ id: "horror", name: "Horror" }]);
    const tags = [horror, slasher];

    // Scene has both Horror AND Slasher
    const items = [createItem("scene1", ["horror", "slasher"])];

    const result = buildFolderTree(items, tags, ["horror"]);

    // Item should NOT be loose at Horror level
    expect(result.items).toHaveLength(0);
    // Item should be in Slasher folder
    expect(result.folders[0].totalCount).toBe(1);
  });

  it("item appears in all child folders when it has multiple child tags", () => {
    // Hierarchy: Genre -> [Action, Comedy]
    const genre = createTag("genre", "Genre", [], [
      { id: "action", name: "Action" },
      { id: "comedy", name: "Comedy" },
    ]);
    const action = createTag("action", "Action", [{ id: "genre", name: "Genre" }]);
    const comedy = createTag("comedy", "Comedy", [{ id: "genre", name: "Genre" }]);
    const tags = [genre, action, comedy];

    // Scene has both Action and Comedy
    const items = [createItem("scene1", ["genre", "action", "comedy"])];

    const result = buildFolderTree(items, tags, ["genre"]);

    // Should appear in both Action and Comedy folders
    expect(result.folders).toHaveLength(2);
    expect(result.folders.find((f) => f.name === "Action").totalCount).toBe(1);
    expect(result.folders.find((f) => f.name === "Comedy").totalCount).toBe(1);
    // Should NOT be a loose item
    expect(result.items).toHaveLength(0);
  });

  it("item without current tag directly does not appear as loose item", () => {
    // Hierarchy: Horror -> Slasher
    const horror = createTag("horror", "Horror", [], [{ id: "slasher", name: "Slasher" }]);
    const slasher = createTag("slasher", "Slasher", [{ id: "horror", name: "Horror" }]);
    const tags = [horror, slasher];

    // Scene only has Slasher (child), not Horror directly
    const items = [createItem("scene1", ["slasher"])];

    const result = buildFolderTree(items, tags, ["horror"]);

    // Should be in Slasher folder
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].totalCount).toBe(1);
    // Should NOT be loose at Horror level (doesn't have Horror tag directly)
    expect(result.items).toHaveLength(0);
  });
});

describe("buildFolderTree - deep hierarchy", () => {
  it("item only surfaces at exact tag level", () => {
    // 3-level hierarchy: Genre -> Horror -> Slasher
    const genre = createTag("genre", "Genre", [], [{ id: "horror", name: "Horror" }]);
    const horror = createTag("horror", "Horror", [{ id: "genre", name: "Genre" }], [{ id: "slasher", name: "Slasher" }]);
    const slasher = createTag("slasher", "Slasher", [{ id: "horror", name: "Horror" }]);
    const tags = [genre, horror, slasher];

    // Scene only has Slasher tag
    const items = [createItem("scene1", ["slasher"])];

    // At root: item is in Genre folder (via descendant)
    const rootResult = buildFolderTree(items, tags, []);
    expect(rootResult.folders[0].name).toBe("Genre");
    expect(rootResult.folders[0].totalCount).toBe(1);
    expect(rootResult.items).toHaveLength(0);

    // At Genre level: item is in Horror folder
    const genreResult = buildFolderTree(items, tags, ["genre"]);
    expect(genreResult.folders[0].name).toBe("Horror");
    expect(genreResult.folders[0].totalCount).toBe(1);
    expect(genreResult.items).toHaveLength(0);

    // At Horror level: item is in Slasher folder
    const horrorResult = buildFolderTree(items, tags, ["genre", "horror"]);
    expect(horrorResult.folders[0].name).toBe("Slasher");
    expect(horrorResult.folders[0].totalCount).toBe(1);
    expect(horrorResult.items).toHaveLength(0);

    // At Slasher level: item appears as loose item (has the tag directly, no children)
    const slasherResult = buildFolderTree(items, tags, ["genre", "horror", "slasher"]);
    expect(slasherResult.folders).toHaveLength(0);
    expect(slasherResult.items).toHaveLength(1);
    expect(slasherResult.items[0].id).toBe("scene1");
  });
});

describe("buildFolderTree - breadcrumbs", () => {
  it("builds correct breadcrumb path", () => {
    const genre = createTag("genre", "Genre", [], [{ id: "horror", name: "Horror" }]);
    const horror = createTag("horror", "Horror", [{ id: "genre", name: "Genre" }]);
    const tags = [genre, horror];
    const items = [];

    const result = buildFolderTree(items, tags, ["genre", "horror"]);

    expect(result.breadcrumbs).toHaveLength(2);
    expect(result.breadcrumbs[0]).toEqual({ id: "genre", name: "Genre" });
    expect(result.breadcrumbs[1]).toEqual({ id: "horror", name: "Horror" });
  });

  it("returns empty breadcrumbs at root", () => {
    const result = buildFolderTree([], [], []);
    expect(result.breadcrumbs).toHaveLength(0);
  });
});

describe("buildFolderTree - folder thumbnails", () => {
  it("uses tag image_path when available", () => {
    const tag = { ...createTag("action", "Action"), image_path: "/tag-image.jpg" };
    const items = [createItem("scene1", ["action"])];

    const result = buildFolderTree(items, [tag], []);

    expect(result.folders[0].thumbnail).toBe("/tag-image.jpg");
  });

  it("falls back to first item thumbnail", () => {
    const tag = createTag("action", "Action");
    const items = [createItem("scene1", ["action"])];

    const result = buildFolderTree(items, [tag], []);

    expect(result.folders[0].thumbnail).toBe("/thumb/scene1.jpg");
  });
});

describe("buildFolderTree - multi-tag items at root", () => {
  it("item with multiple root tags appears in both folders", () => {
    const tags = [
      createTag("action", "Action"),
      createTag("comedy", "Comedy"),
    ];
    // Scene has both Action and Comedy tags
    const items = [createItem("scene1", ["action", "comedy"])];

    const result = buildFolderTree(items, tags, []);

    expect(result.folders).toHaveLength(2);
    expect(result.folders.find((f) => f.name === "Action").totalCount).toBe(1);
    expect(result.folders.find((f) => f.name === "Comedy").totalCount).toBe(1);
    expect(result.items).toHaveLength(0);
  });
});
