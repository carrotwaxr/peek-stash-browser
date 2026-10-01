/**
 * Unit Tests for Tags Library Controller
 *
 * Tests findTags, findTagsMinimal and findTagTree.
 */
// --- Imports ---
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findTagTree,
  findTags,
  findTagsMinimal,
} from "../../../controllers/library/tags.js";
import { ValidationError } from "../../../middleware/errorHandler.js";
import { findMinimalEntities } from "../../../services/MinimalEntityQuery.js";
import { tagQueryBuilder } from "../../../services/TagQueryBuilder.js";
import {
  loadTagTree,
  loadUntaggedCount,
} from "../../../services/TagTreeService.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
import { createMockTag } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";
import { untrusted } from "../../helpers/untrusted.js";

// --- Mocks (must come before module import) ---

vi.mock("../../../services/TagQueryBuilder.js", () => ({
  tagQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/TagTreeService.js", () => ({
  loadTagTree: vi.fn(),
  loadUntaggedCount: vi.fn(),
}));

vi.mock("../../../services/MinimalEntityQuery.js", () => ({
  findMinimalEntities: vi.fn(),
}));

vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../utils/stashUrl.js", () => ({
  buildStashEntityUrl: vi
    .fn()
    .mockImplementation(
      (
        _type: string,
        id: string | number,
        _inst: string | undefined,
        viewer: { role: string } | undefined
      ) => (viewer?.role === "ADMIN" ? `http://stash/tags/${id}` : null)
    ),
}));

const mockLoadTagTree = vi.mocked(loadTagTree);
const mockLoadUntaggedCount = vi.mocked(loadUntaggedCount);
const mockTagQueryBuilder = vi.mocked(tagQueryBuilder);
const mockFindMinimalEntities = vi.mocked(findMinimalEntities);

const defaultUser = testUser();
const adminUser = testUser({ role: "ADMIN" });

describe("Tags Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── findTags HTTP handler ──────────────────────────────────

  describe("findTags", () => {
    it("returns tags from query builder on happy path", async () => {
      const tags = [createMockTag({ id: "t1", name: "TestTag" })];
      mockTagQueryBuilder.execute.mockResolvedValue({ items: tags, total: 1 });

      const req = reqFor(findTags, {
        body: { filter: {}, tag_filter: {} },
        user: defaultUser,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });
      const res = resFor(findTags);

      await findTags(req, res);

      // The builder reads the parsed request and the viewer's instances
      const call = must(mockTagQueryBuilder.execute.mock.calls[0])[0];
      expect(call).toMatchObject({
        allowedInstanceIds: ["inst-a", "inst-b"],
        request: { page: 1, sort: { field: "name", direction: "ASC" } },
      });
      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.findTags.count).toBe(1);
      expect(body.findTags.tags).toHaveLength(1);
    });

    it("adds stashUrl to each tag for an admin", async () => {
      mockTagQueryBuilder.execute.mockResolvedValue({
        items: [createMockTag({ id: "t1" })],
        total: 1,
      });

      const req = reqFor(findTags, {
        body: { filter: {}, tag_filter: {} },
        user: adminUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(must(res._getOkBody().findTags.tags[0])).toHaveProperty(
        "stashUrl",
        "http://stash/tags/t1"
      );
    });

    it("does not send stashUrl to a regular user", async () => {
      mockTagQueryBuilder.execute.mockResolvedValue({
        items: [createMockTag({ id: "t1" }), createMockTag({ id: "t2" })],
        total: 2,
      });

      const req = reqFor(findTags, {
        body: { filter: {}, tag_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      const tags = res._getOkBody().findTags.tags;
      expect(tags).toHaveLength(2);
      for (const tag of tags) expect(tag).toHaveProperty("stashUrl", null);
    });

    it("returns 400 for ambiguous single-ID lookup", async () => {
      const tags = [
        createMockTag({ id: "101", instanceId: "inst-a" }),
        createMockTag({ id: "101", instanceId: "inst-b" }),
      ];
      mockTagQueryBuilder.execute.mockResolvedValue({ items: tags, total: 2 });

      const req = reqFor(findTags, {
        body: { ids: ["101"], filter: {}, tag_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(res._getStatus()).toBe(400);
      const body = res._getBody();
      assert("matches" in body, "expected an ambiguous-lookup body");
      expect(body.error).toBe("Ambiguous lookup");
      expect(body.matches).toHaveLength(2);
    });

    it("a failure reaches the error handler: query builder throws", async () => {
      mockTagQueryBuilder.execute.mockRejectedValue(new Error("DB error"));

      const req = reqFor(findTags, { body: { filter: {} }, user: defaultUser });
      const res = resFor(findTags);

      await expect(findTags(req, res)).rejects.toThrow("DB error");

      expect(res.json).not.toHaveBeenCalled();
    });

    it("a detail answers the builder's row as it is: the card's counts, the viewer's own fields, parents and children", async () => {
      const parent = {
        id: "100",
        instanceId: "inst-b",
        name: "Places",
        image_path: null,
      };
      const child = { ...parent, id: "102", name: "Beaches" };
      const tag = createMockTag({
        id: "101",
        instanceId: "inst-b",
        favorite: false,
        rating: 30,
        rating100: 30,
        o_counter: 5,
        play_count: 6,
        scene_count: 42,
        parents: [parent],
        children: [child],
      });
      mockTagQueryBuilder.execute.mockResolvedValue({ items: [tag], total: 1 });

      const req = reqFor(findTags, {
        body: { ids: ["101"], tag_filter: { instance_id: "inst-b" } },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(res._getOkBody().findTags.tags).toEqual([
        { ...tag, stashUrl: null },
      ]);
    });

    it("does not skip exclusions when fetching by ids", async () => {
      mockTagQueryBuilder.execute.mockResolvedValue({ items: [], total: 0 });

      const req = reqFor(findTags, {
        body: { ids: ["101"], tag_filter: {} },
        user: defaultUser,
      });
      const res = resFor(findTags);

      await findTags(req, res);

      expect(mockTagQueryBuilder.execute).toHaveBeenCalledTimes(1);
      const call = must(mockTagQueryBuilder.execute.mock.calls[0])[0];
      expect(call.applyExclusions).not.toBe(false);
    });
  });

  // ─── findTagsMinimal ────────────────────────────────────────

  describe("findTagsMinimal", () => {
    it("passes req.allowedInstanceIds to the builder or service: one page from findMinimalEntities, for the parsed request", async () => {
      const rows = [{ id: "1", instanceId: "inst-a", name: "Alpha" }];
      mockFindMinimalEntities.mockResolvedValue(rows);
      const req = reqFor(findTagsMinimal, {
        body: {
          ids: ["1:inst-a"],
          filter: { q: " al ", per_page: 20 },
          count_filter: { min_scene_count: 1 },
        },
        user: defaultUser,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(findTagsMinimal);

      await findTagsMinimal(req, res);

      expect(mockFindMinimalEntities).toHaveBeenCalledWith(
        defaultUser,
        {
          entity: "tag",
          q: "al",
          perPage: 20,
          ids: [{ id: "1", instanceId: "inst-a" }],
          countFilter: { min_scene_count: 1 },
        },
        ["inst-a"]
      );
      expect(res._getOkBody()).toEqual({ tags: rows });
    });

    it("a sort field answers 400 before any query: the pickers always list by name", async () => {
      const req = reqFor(findTagsMinimal, {
        body: malformed({ filter: { sort: "name" } }),
        user: defaultUser,
      });
      const res = resFor(findTagsMinimal);

      await expect(findTagsMinimal(req, res)).rejects.toMatchObject({
        statusCode: 400,
        issues: [{ path: "filter.sort" }],
      });
      expect(mockFindMinimalEntities).not.toHaveBeenCalled();
    });

    it("a query error reaches the central error handler", async () => {
      mockFindMinimalEntities.mockRejectedValue(new Error("fail"));
      const req = reqFor(findTagsMinimal, { user: defaultUser });
      const res = resFor(findTagsMinimal);

      await expect(findTagsMinimal(req, res)).rejects.toThrow("fail");
    });
  });

  // ─── findTagTree ────────────────────────────────────────────

  describe("findTagTree", () => {
    const row = {
      id: "5",
      instanceId: "inst-a",
      name: "Five",
      image_path: null,
      parents: [],
      scene_count: 1,
      image_count: 0,
      gallery_count: 0,
      performer_count: 0,
      created_at: null,
      updated_at: null,
      rating100: null,
      favorite: false,
      o_counter: 0,
    };

    it("answers the whole tree on the user's allowed instances, and no untagged count unasked", async () => {
      mockLoadTagTree.mockResolvedValue([row]);

      const req = reqFor(findTagTree, {
        body: {},
        user: defaultUser,
        allowedInstanceIds: ["inst-a", "inst-b"],
      });
      const res = resFor(findTagTree);

      await findTagTree(req, res);

      expect(mockLoadTagTree).toHaveBeenCalledWith({
        userId: defaultUser.id,
        allowedInstanceIds: ["inst-a", "inst-b"],
        scope: undefined,
      });
      expect(mockLoadUntaggedCount).not.toHaveBeenCalled();
      expect(res._getOkBody()).toEqual({ tags: [row] });
    });

    it("with untagged, answers that type's untagged count for the same user, instances and scope", async () => {
      mockLoadTagTree.mockResolvedValue([row]);
      mockLoadUntaggedCount.mockResolvedValue(42);

      const req = reqFor(findTagTree, {
        body: { scope: { performer: "12:inst-a" }, untagged: "image" },
        user: defaultUser,
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(findTagTree);

      await findTagTree(req, res);

      expect(mockLoadUntaggedCount).toHaveBeenCalledWith({
        userId: defaultUser.id,
        allowedInstanceIds: ["inst-a"],
        scope: { performer: { id: "12", instanceId: "inst-a" } },
        kind: "image",
      });
      expect(res._getOkBody()).toEqual({ tags: [row], untagged: 42 });
    });

    it("an absent body is the whole tree", async () => {
      mockLoadTagTree.mockResolvedValue([]);

      const req = reqFor(findTagTree, {
        body: untrusted<undefined>(undefined),
        user: defaultUser,
      });
      const res = resFor(findTagTree);

      await findTagTree(req, res);

      expect(must(mockLoadTagTree.mock.calls[0])[0].scope).toBeUndefined();
      expect(res._getOkBody()).toEqual({ tags: [] });
    });

    it("parses the scope's refs into pairs; a bare id stays bare", async () => {
      mockLoadTagTree.mockResolvedValue([]);

      const req = reqFor(findTagTree, {
        body: {
          scope: { performer: "12:inst-a", tag: "7", studio: "3:inst-b" },
        },
        user: defaultUser,
      });
      const res = resFor(findTagTree);

      await findTagTree(req, res);

      expect(must(mockLoadTagTree.mock.calls[0])[0].scope).toEqual({
        performer: { id: "12", instanceId: "inst-a" },
        tag: { id: "7", instanceId: undefined },
        studio: { id: "3", instanceId: "inst-b" },
      });
    });

    it.each([
      [{ scope: { scene: "1" } }, "scope"],
      [{ scope: { performer: "abc" } }, "scope.performer"],
      [{ scope: { group: "1:bad instance" } }, "scope.group"],
      [{ scope: { tag: 7 } }, "scope.tag"],
      [{ scope: "1" }, "scope"],
      [{ untagged: "performer" }, "untagged"],
      [{ extra: true }, ""],
    ])("%j answers 400 naming %s", async (body, path) => {
      const req = reqFor(findTagTree, {
        body: untrusted(body),
        user: defaultUser,
      });
      const res = resFor(findTagTree);

      const error = await findTagTree(req, res).then(
        () => undefined,
        (e: unknown) => e
      );

      expect(error).toBeInstanceOf(ValidationError);
      expect(
        error instanceof ValidationError
          ? error.issues?.map((i) => i.path)
          : undefined
      ).toContain(path);
      expect(mockLoadTagTree).not.toHaveBeenCalled();
      expect(mockLoadUntaggedCount).not.toHaveBeenCalled();
    });
  });
});
