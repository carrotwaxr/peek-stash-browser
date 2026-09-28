import { beforeEach, describe, expect, it, vi } from "vitest";
// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import {
  findPerformers,
  findPerformersMinimal,
} from "../../../controllers/library/performers.js";
import { entityExclusionHelper } from "../../../services/EntityExclusionHelper.js";
import { performerQueryBuilder } from "../../../services/PerformerQueryBuilder.js";
import { stashEntityService } from "../../../services/StashEntityService.js";
import { reqFor, resFor, testUser } from "../../helpers/controllerTestUtils.js";
import { createMockPerformer } from "../../helpers/mockDataGenerators.js";
import { must } from "../../helpers/must.js";

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getAllPerformers: vi.fn(),
  },
}));

vi.mock("../../../services/EntityExclusionHelper.js", () => ({
  entityExclusionHelper: {
    filterExcluded: vi.fn().mockImplementation((items: unknown[]) => items),
  },
}));

vi.mock("../../../services/PerformerQueryBuilder.js", () => ({
  performerQueryBuilder: { execute: vi.fn() },
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn().mockResolvedValue(["default"]),
}));

vi.mock("../../../utils/entityInstanceId.js", () => ({
  disambiguateEntityNames: vi
    .fn()
    .mockImplementation((entities: unknown[]) => entities),
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
      performers,
      total: 1,
    });

    const req = reqFor(findPerformers, {
      body: { filter: { page: 1, per_page: 20 } },
      user: testUser({ role: "ADMIN" }),
    });
    const res = resFor(findPerformers);

    await findPerformers(req, res);

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
      performers: [
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
      performers,
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
  it("returns minimal performers with search and sort", async () => {
    const performers = [
      createMockPerformer({ id: "p1", name: "Alice" }),
      createMockPerformer({ id: "p2", name: "Bob" }),
    ];
    vi.mocked(stashEntityService.getAllPerformers).mockResolvedValue(
      performers
    );

    const req = reqFor(findPerformersMinimal, {
      body: { filter: { q: "alice", sort: "name", direction: "ASC" } },
      user: testUser(),
    });
    const res = resFor(findPerformersMinimal);

    await findPerformersMinimal(req, res);

    expect(res._getStatus()).toBe(200);
    const body = res._getOkBody();
    expect(body.performers).toHaveLength(1);
    expect(must(body.performers[0]).name).toBe("Alice");
  });

  it("applies count_filter to exclude performers below threshold", async () => {
    const performers = [
      createMockPerformer({ id: "p1", scene_count: 10 }),
      createMockPerformer({ id: "p2", scene_count: 0 }),
    ];
    vi.mocked(stashEntityService.getAllPerformers).mockResolvedValue(
      performers
    );

    const req = reqFor(findPerformersMinimal, {
      body: { count_filter: { min_scene_count: 5 } },
      user: testUser(),
    });
    const res = resFor(findPerformersMinimal);

    await findPerformersMinimal(req, res);

    expect(res._getStatus()).toBe(200);
    expect(res._getOkBody().performers).toHaveLength(1);
    expect(must(res._getOkBody().performers[0]).id).toBe("p1");
  });

  it("applies exclusion filtering for admin users", async () => {
    // An admin's rows hold only their own hides and cascades (item 13)
    vi.mocked(stashEntityService.getAllPerformers).mockResolvedValue([
      createMockPerformer({ id: "p1" }),
    ]);

    const req = reqFor(findPerformersMinimal, {
      user: testUser({ role: "ADMIN" }),
    });
    const res = resFor(findPerformersMinimal);

    await findPerformersMinimal(req, res);

    expect(entityExclusionHelper.filterExcluded).toHaveBeenCalledWith(
      expect.any(Array),
      1,
      "performer"
    );
    expect(res._getStatus()).toBe(200);
  });

  it("returns 500 when service throws", async () => {
    vi.mocked(stashEntityService.getAllPerformers).mockRejectedValue(
      new Error("fail")
    );

    const req = reqFor(findPerformersMinimal, { user: testUser() });
    const res = resFor(findPerformersMinimal);

    await findPerformersMinimal(req, res);

    expect(res._getStatus()).toBe(500);
    expect(res._getBody()).toMatchObject({
      error: "Failed to find performers",
    });
  });
});
