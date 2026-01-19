// client/src/utils/buildFolderTree.test.js
import { describe, it, expect } from "vitest";
import { buildFolderTree, UNTAGGED_FOLDER_ID } from "../../src/utils/buildFolderTree.js";

describe("buildFolderTree", () => {
  const mockTags = [
    { id: "1", name: "Color", parents: [], children: [{ id: "2" }, { id: "3" }], image_path: "/tag1.jpg" },
    { id: "2", name: "Red", parents: [{ id: "1" }], children: [], image_path: null },
    { id: "3", name: "Blue", parents: [{ id: "1" }], children: [], image_path: "/tag3.jpg" },
    { id: "4", name: "Size", parents: [], children: [], image_path: null },
  ];

  describe("buildFolderTree at root level", () => {
    it("returns top-level tags as folders at root (only those with content)", () => {
      const items = [
        { id: "s1", tags: [{ id: "2", name: "Red" }] },
      ];
      const result = buildFolderTree(items, mockTags, []);

      // Should have Color folder (parent of Red which has content)
      const folderIds = result.folders.map((f) => f.tag?.id || f.id);
      expect(folderIds).toContain("1"); // Color (parent of Red)
      // Size has no content, should NOT appear
      expect(folderIds).not.toContain("4");
    });

    it("calculates recursive item count for folders", () => {
      const items = [
        { id: "s1", tags: [{ id: "2", name: "Red" }] },
        { id: "s2", tags: [{ id: "2", name: "Red" }] },
        { id: "s3", tags: [{ id: "3", name: "Blue" }] },
      ];
      const result = buildFolderTree(items, mockTags, []);

      const colorFolder = result.folders.find((f) => f.tag?.id === "1");
      expect(colorFolder.totalCount).toBe(3); // 2 Red + 1 Blue
    });

    it("puts untagged items in Untagged folder", () => {
      const items = [
        { id: "s1", tags: [] },
        { id: "s2", tags: [{ id: "2", name: "Red" }] },
      ];
      const result = buildFolderTree(items, mockTags, []);

      const untaggedFolder = result.folders.find((f) => f.id === UNTAGGED_FOLDER_ID);
      expect(untaggedFolder.totalCount).toBe(1);
    });

    it("hides folders with no matching content", () => {
      const items = [
        { id: "s1", tags: [{ id: "2", name: "Red" }] },
      ];
      const result = buildFolderTree(items, mockTags, []);

      // Size has no content, should be hidden
      const sizeFolder = result.folders.find((f) => f.tag?.id === "4");
      expect(sizeFolder).toBeUndefined();
    });
  });

  describe("buildFolderTree with path navigation", () => {
    it("shows child folders and content when navigating into a tag", () => {
      const items = [
        { id: "s1", tags: [{ id: "1", name: "Color" }, { id: "2", name: "Red" }] },
        { id: "s2", tags: [{ id: "1", name: "Color" }] }, // Tagged with Color but not a child
      ];
      const result = buildFolderTree(items, mockTags, ["1"]); // Navigate into Color

      // Should show Red as child folder (has content)
      const folderIds = result.folders.map((f) => f.tag?.id);
      expect(folderIds).toContain("2"); // Red
      // Blue has no content, should not appear
      expect(folderIds).not.toContain("3");

      // s2 is directly tagged with Color (leaf content at this level)
      expect(result.items).toContainEqual(expect.objectContaining({ id: "s2" }));
    });

    it("returns breadcrumb path for navigation", () => {
      const items = [{ id: "s1", tags: [{ id: "2", name: "Red" }] }];
      const result = buildFolderTree(items, mockTags, ["1", "2"]); // Color > Red

      expect(result.breadcrumbs).toEqual([
        { id: "1", name: "Color" },
        { id: "2", name: "Red" },
      ]);
    });
  });

  describe("folder thumbnail", () => {
    it("uses tag image_path if available", () => {
      const items = [{ id: "s1", tags: [{ id: "1", name: "Color" }] }];
      const result = buildFolderTree(items, mockTags, []);

      const colorFolder = result.folders.find((f) => f.tag?.id === "1");
      expect(colorFolder.thumbnail).toBe("/tag1.jpg");
    });

    it("falls back to first item thumbnail if no tag image", () => {
      const items = [
        { id: "s1", tags: [{ id: "4", name: "Size" }], paths: { screenshot: "/scene1.jpg" } },
      ];
      const result = buildFolderTree(items, mockTags, []);

      const sizeFolder = result.folders.find((f) => f.tag?.id === "4");
      expect(sizeFolder.thumbnail).toBe("/scene1.jpg");
    });
  });
});
