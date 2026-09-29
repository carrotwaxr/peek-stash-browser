import { beforeEach, describe, expect, it, vi } from "vitest";
// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import {
  findPerformers,
  findPerformersMinimal,
} from "../../../controllers/library/performers.js";
import { findMinimalEntities } from "../../../services/MinimalEntityQuery.js";
import { performerQueryBuilder } from "../../../services/PerformerQueryBuilder.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
import { createMockPerformer } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../../../services/PerformerQueryBuilder.js", () => ({
  performerQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/MinimalEntityQuery.js", () => ({
  findMinimalEntities: vi.fn(),
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../utils/hierarchyUtils.js", () => ({
  hydrateEntityTags: vi
    .fn()
    .mockImplementation((items) => Promise.resolve(items)),
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
      ) => (viewer?.role === "ADMIN" ? `http://stash/performers/${id}` : null)
    ),
}));

const mockFindMinimalEntities = vi.mocked(findMinimalEntities);

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// HTTP handlers
// ===========================================================================

describe("findPerformers", () => {
  it("returns paginated performers from query builder", async () => {
    const performers = [createMockPerformer({ id: "p1", name: "Alice" })];
    vi.mocked(performerQueryBuilder.execute).mockResolvedValue({
      items: performers,
      total: 1,
    });

    const req = reqFor(findPerformers, {
      body: { filter: { page: 1, per_page: 20 } },
      user: testUser({ role: "ADMIN" }),
    });
    const res = resFor(findPerformers);

    await findPerformers(req, res);

    // The builder reads the parsed request and the viewer's instances
    const call = must(
      vi.mocked(performerQueryBuilder).execute.mock.calls[0]
    )[0];
    expect(call).toMatchObject({
      allowedInstanceIds: ["default"],
      request: { page: 1, perPage: 20, sort: { field: "name" } },
    });
    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.findPerformers.count).toBe(1);
    expect(body.findPerformers.performers).toHaveLength(1);
    expect(must(body.findPerformers.performers[0])).toHaveProperty(
      "stashUrl",
      "http://stash/performers/p1"
    );
  });

  it("does not send stashUrl to a regular user", async () => {
    vi.mocked(performerQueryBuilder.execute).mockResolvedValue({
      items: [
        createMockPerformer({ id: "p1" }),
        createMockPerformer({ id: "p2" }),
      ],
      total: 2,
    });

    const req = reqFor(findPerformers, {
      body: { filter: { page: 1, per_page: 20 } },
      user: testUser(),
    });
    const res = resFor(findPerformers);

    await findPerformers(req, res);

    const performers = res._getOkBody().findPerformers.performers;
    expect(performers).toHaveLength(2);
    for (const performer of performers)
      expect(performer).toHaveProperty("stashUrl", null);
  });

  it("returns 400 for ambiguous single-ID lookup (multiple instances)", async () => {
    const performers = [
      createMockPerformer({ id: "101", instanceId: "inst1" }),
      createMockPerformer({ id: "101", instanceId: "inst2" }),
    ];
    vi.mocked(performerQueryBuilder.execute).mockResolvedValue({
      items: performers,
      total: 2,
    });

    const req = reqFor(findPerformers, {
      body: { ids: ["101"] },
      user: testUser(),
    });
    const res = resFor(findPerformers);

    await findPerformers(req, res);

    expect(res._getStatus()).toBe(400);
    expect(res._getBody()).toMatchObject({ error: "Ambiguous lookup" });
  });

  it("returns 500 when query builder throws", async () => {
    vi.mocked(performerQueryBuilder.execute).mockRejectedValue(
      new Error("DB down")
    );

    const req = reqFor(findPerformers, { user: testUser() });
    const res = resFor(findPerformers);

    await findPerformers(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({
      error: "Failed to find performers",
    });
  });
});

describe("findPerformersMinimal", () => {
  it("answers one page from findMinimalEntities, for the parsed request", async () => {
    const rows = [{ id: "1", instanceId: "inst-a", name: "Alpha" }];
    mockFindMinimalEntities.mockResolvedValue(rows);
    const req = reqFor(findPerformersMinimal, {
      body: {
        ids: ["1:inst-a"],
        filter: { q: " al ", per_page: 20 },
        count_filter: { min_scene_count: 1 },
      },
      user: testUser(),
    });
    const res = resFor(findPerformersMinimal);

    await findPerformersMinimal(req, res);

    expect(mockFindMinimalEntities).toHaveBeenCalledWith(testUser(), {
      entity: "performer",
      q: "al",
      perPage: 20,
      ids: [{ id: "1", instanceId: "inst-a" }],
      countFilter: { min_scene_count: 1 },
      dropped: [],
    });
    expect(res._getOkBody()).toEqual({ performers: rows });
  });

  it("a sort field answers 400 before any query: the pickers always list by name", async () => {
    const req = reqFor(findPerformersMinimal, {
      body: malformed({ filter: { sort: "name" } }),
      user: testUser(),
    });
    const res = resFor(findPerformersMinimal);

    await expect(findPerformersMinimal(req, res)).rejects.toMatchObject({
      statusCode: 400,
      issues: [{ path: "filter.sort" }],
    });
    expect(mockFindMinimalEntities).not.toHaveBeenCalled();
  });

  it("a query error reaches the central error handler", async () => {
    mockFindMinimalEntities.mockRejectedValue(new Error("fail"));
    const req = reqFor(findPerformersMinimal, { user: testUser() });
    const res = resFor(findPerformersMinimal);

    await expect(findPerformersMinimal(req, res)).rejects.toThrow("fail");
  });
});
