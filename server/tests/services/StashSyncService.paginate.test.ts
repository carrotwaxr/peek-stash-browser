/**
 * Unit tests for StashSyncService's one page loop, `paginate`, and the
 * per-type specs it reads, `ENTITY_SYNC`: paging to Stash's count, the
 * updated_at filter of an incremental sync, narrowing by ids, the newest
 * updated_at as the next sync's watermark, the abort check between pages,
 * and the smart sync's change count (`getChangeCount`).
 *
 * The loop tests stub a spec's `fetchPage` and `processBatch`; the request
 * tests run the real specs against a stubbed Stash client and read the
 * variables of each request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import { CriterionModifier } from "../../graphql/generated/graphql.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
  type SyncRunContext,
  stashSyncService,
} from "../../services/StashSyncService.js";
import { SyncChangeSet, noChanges } from "../../services/SyncChangeSet.js";
import { objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    get: vi.fn(),
    getDefault: vi.fn(),
    getApiKey: vi.fn(() => "key"),
  },
}));

vi.mock("../../services/MergeReconciliationService.js", () => ({
  mergeReconciliationService: {},
}));
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: {},
}));
vi.mock("../../services/EntityImageCountService.js", () => ({
  entityImageCountService: {},
}));
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {},
}));
vi.mock("../../services/SceneTagInheritanceService.js", () => ({
  sceneTagInheritanceService: {},
}));
vi.mock("../../services/ImageGalleryInheritanceService.js", () => ({
  imageGalleryInheritanceService: {},
}));
vi.mock("../../services/ClipPreviewProber.js", () => ({
  clipPreviewProber: {},
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const INSTANCE = "inst-a";
const PAGE_SIZE = 500;
const SINCE = "2025-12-27T16:00:00-08:00";
/** SINCE as Stash reads it: local time, the last second's fraction skipped */
const SINCE_FOR_STASH = "2025-12-27T16:00:00.999";

/** The stubbed Stash client: one mock per sync query. */
const client = {
  findTags: vi.fn<StashClient["findTags"]>(),
  findStudios: vi.fn<StashClient["findStudios"]>(),
  findPerformers: vi.fn<StashClient["findPerformers"]>(),
  findGroups: vi.fn<StashClient["findGroups"]>(),
  findGalleries: vi.fn<StashClient["findGalleries"]>(),
  findScenesCompact: vi.fn<StashClient["findScenesCompact"]>(),
  findSceneMarkers: vi.fn<StashClient["findSceneMarkers"]>(),
  findImages: vi.fn<StashClient["findImages"]>(),
  withSignal: vi.fn<StashClient["withSignal"]>(),
};

/**
 * Every type, the query its sync pages, the argument of its updated_at
 * filter, and the argument that narrows it by ids (images still take Stash's
 * integer list).
 */
const TYPES = [
  { type: "tag", method: "findTags", filterArg: "tag_filter", idsArg: "ids" },
  {
    type: "studio",
    method: "findStudios",
    filterArg: "studio_filter",
    idsArg: "ids",
  },
  {
    type: "performer",
    method: "findPerformers",
    filterArg: "performer_filter",
    idsArg: "ids",
  },
  {
    type: "group",
    method: "findGroups",
    filterArg: "group_filter",
    idsArg: "ids",
  },
  {
    type: "gallery",
    method: "findGalleries",
    filterArg: "gallery_filter",
    idsArg: "ids",
  },
  {
    type: "scene",
    method: "findScenesCompact",
    filterArg: "scene_filter",
    idsArg: "ids",
  },
  {
    type: "clip",
    method: "findSceneMarkers",
    filterArg: "scene_marker_filter",
    idsArg: "ids",
  },
  {
    type: "image",
    method: "findImages",
    filterArg: "image_filter",
    idsArg: "image_ids",
  },
] as const;

/** Stash answers every sync query with no rows and `count` as its total. */
function stashCounts(count: number): void {
  client.findTags.mockResolvedValue({ findTags: { tags: [], count } });
  client.findStudios.mockResolvedValue({ findStudios: { studios: [], count } });
  client.findPerformers.mockResolvedValue({
    findPerformers: { performers: [], count },
  });
  client.findGroups.mockResolvedValue({ findGroups: { groups: [], count } });
  client.findGalleries.mockResolvedValue({
    findGalleries: { galleries: [], count },
  });
  client.findScenesCompact.mockResolvedValue({
    findScenes: { scenes: [], count, duration: 0, filesize: 0 },
  });
  client.findSceneMarkers.mockResolvedValue({
    findSceneMarkers: { scene_markers: [], count },
  });
  client.findImages.mockResolvedValue({ findImages: { images: [], count } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The variables and the abort signal of `fn`'s `i`th request. */
function request(
  fn: { mock: { calls: unknown[][] } },
  i = 0
): { vars: Record<string, unknown>; signal: unknown } {
  const [vars, , signal] = must(fn.mock.calls[i], `request ${i + 1}`);
  return { vars: isRecord(vars) ? vars : {}, signal };
}

/** A run whose abort the test controls. */
function newRun(): { run: SyncRunContext; controller: AbortController } {
  const controller = new AbortController();
  return {
    run: { signal: controller.signal, changes: new SyncChangeSet() },
    controller,
  };
}

/** Tags `from` to `to`, each updated at `updatedAt(id)` (none: undefined). */
function tags(
  from: number,
  to: number,
  updatedAt: (id: number) => string | undefined = () =>
    "2025-12-01T00:00:00-08:00"
): Array<SyncEntityOf<"tag">> {
  return Array.from({ length: to - from + 1 }, (_, i) =>
    partialRow<SyncEntityOf<"tag">>({
      id: String(from + i),
      updated_at: updatedAt(from + i),
    })
  );
}

/**
 * The tag spec answers `pages` in turn (then empty pages), reporting `count`
 * as Stash's total, and its processBatch writes nothing.
 */
function tagPages(pages: Array<Array<SyncEntityOf<"tag">>>, count: number) {
  const fetchPage = vi
    .spyOn(ENTITY_SYNC.tag, "fetchPage")
    .mockImplementation((_client, q) =>
      Promise.resolve({ items: pages[q.page - 1] ?? [], count })
    );
  const processBatch = vi
    .spyOn(ENTITY_SYNC.tag, "processBatch")
    .mockImplementation(() => Promise.resolve(noChanges()));
  return { fetchPage, processBatch };
}

const paginate = (
  type: (typeof TYPES)[number]["type"],
  opts: { since?: string; ids?: string[] },
  run: SyncRunContext
) => stashSyncService["paginate"](type, INSTANCE, opts, run);

describe("StashSyncService.paginate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stashInstanceManager.get).mockReturnValue(
      partialRow<StashClient>(client)
    );
    client.withSignal.mockReturnValue(partialRow<StashClient>(client));
    stashCounts(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pages until the count is reached and processes every page in order", async () => {
    const pages = [tags(1, 500), tags(501, 1000), tags(1001, 1100)];
    const { fetchPage, processBatch } = tagPages(pages, 1100);
    const { run } = newRun();

    const result = await paginate("tag", {}, run);

    expect(fetchPage.mock.calls.map(([, q]) => [q.page, q.perPage])).toEqual([
      [1, PAGE_SIZE],
      [2, PAGE_SIZE],
      [3, PAGE_SIZE],
    ]);
    expect(processBatch.mock.calls.map(([items]) => items)).toEqual(pages);
    for (const [, instanceId, batchRun] of processBatch.mock.calls) {
      expect(instanceId).toBe(INSTANCE);
      expect(batchRun).toBe(run);
    }
    // Each page is written before the next one is asked for
    const fetched = fetchPage.mock.invocationCallOrder;
    const written = processBatch.mock.invocationCallOrder;
    expect(must(written[0])).toBeLessThan(must(fetched[1]));
    expect(must(written[1])).toBeLessThan(must(fetched[2]));
    expect(result).toEqual(
      objectContaining({ entityType: "tag", synced: 1100, deleted: 0 })
    );
  });

  it.each(TYPES)(
    "sends the updated_at filter formatted by formatTimestampForStash when since is given: $type",
    async ({ type, method, filterArg }) => {
      const { run } = newRun();

      await paginate(type, { since: SINCE }, run);
      await paginate(type, {}, run);

      const incremental = request(client[method], 0);
      expect(incremental.vars[filterArg]).toEqual({
        updated_at: {
          modifier: CriterionModifier.GreaterThan,
          value: SINCE_FOR_STASH,
        },
      });
      expect(incremental.vars.filter).toEqual(
        objectContaining({ page: 1, per_page: PAGE_SIZE })
      );
      // Without since, the whole list
      expect(request(client[method], 1).vars[filterArg]).toBeUndefined();
    }
  );

  it.each(TYPES)(
    "narrows by ids when ids are given, in chunks of the page size: $type",
    async ({ type, method, idsArg }) => {
      const ids = Array.from({ length: 1200 }, (_, i) => String(i + 1));
      const { run } = newRun();

      await paginate(type, { ids }, run);

      const asked = client[method].mock.calls.map((_, i) => {
        const { vars } = request(client[method], i);
        return {
          ids: vars[idsArg],
          filter: vars.filter,
        };
      });
      const sent = type === "image" ? ids.map(Number) : ids;
      expect(asked).toEqual([
        {
          ids: sent.slice(0, 500),
          filter: objectContaining({ page: 1, per_page: PAGE_SIZE }),
        },
        {
          ids: sent.slice(500, 1000),
          filter: objectContaining({ page: 1, per_page: PAGE_SIZE }),
        },
        {
          ids: sent.slice(1000),
          filter: objectContaining({ page: 1, per_page: PAGE_SIZE }),
        },
      ]);

      // Stash reads an empty id list as none, so nothing is asked for
      client[method].mockClear();
      const result = await paginate(type, { ids: [] }, run);
      expect(client[method]).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
    }
  );

  it("returns the newest updated_at seen as maxUpdatedAt", async () => {
    const newest = "2025-12-28T09:00:00-08:00";
    tagPages(
      [
        tags(1, 500, (id) =>
          id === 250
            ? newest
            : id === 251
              ? undefined
              : "2025-12-27T10:00:00-08:00"
        ),
        tags(501, 600, () => "2025-12-26T00:00:00-08:00"),
      ],
      600
    );
    const { run } = newRun();

    const result = await paginate("tag", {}, run);

    expect(result.maxUpdatedAt).toBe(newest);
  });

  it("stops on an empty page", async () => {
    // Stash counts 1,200 tags but the second page comes back empty
    const { fetchPage, processBatch } = tagPages([tags(1, 500)], 1200);
    const { run } = newRun();

    const result = await paginate("tag", {}, run);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(processBatch).toHaveBeenCalledTimes(1);
    expect(result.synced).toBe(500);
  });

  it("checks abort between pages and passes the run's AbortSignal to the fetch", async () => {
    const { fetchPage, processBatch } = tagPages(
      [tags(1, 500), tags(501, 1000)],
      1000
    );
    const { run, controller } = newRun();
    // The run is aborted while the first page is written
    processBatch.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(noChanges());
    });

    await expect(paginate("tag", {}, run)).rejects.toThrow("Sync aborted");

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(must(fetchPage.mock.calls[0])[1].signal).toBe(run.signal);
  });

  it.each(TYPES)(
    "passes the run's AbortSignal to Stash's request: $type",
    async ({ type, method }) => {
      const { run } = newRun();

      await paginate(type, {}, run);

      expect(request(client[method]).signal).toBe(run.signal);
    }
  );
});

describe("StashSyncService.getChangeCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stashInstanceManager.get).mockReturnValue(
      partialRow<StashClient>(client)
    );
    client.withSignal.mockReturnValue(partialRow<StashClient>(client));
    stashCounts(7);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(TYPES.filter(({ type }) => type !== "clip"))(
    "getChangeCount asks each spec for per_page 0 and returns its count: $type",
    async ({ type, method, filterArg }) => {
      const fetchPage = vi.spyOn(ENTITY_SYNC[type], "fetchPage");
      const { run } = newRun();

      const count = await stashSyncService["getChangeCount"](
        type,
        SINCE,
        INSTANCE,
        run
      );

      expect(count).toBe(7);
      expect(fetchPage).toHaveBeenCalledOnce();
      const { vars, signal } = request(client[method]);
      expect(vars.filter).toEqual(objectContaining({ page: 1, per_page: 0 }));
      expect(vars[filterArg]).toEqual({
        updated_at: {
          modifier: CriterionModifier.GreaterThan,
          value: SINCE_FOR_STASH,
        },
      });
      expect(signal).toBe(run.signal);
    }
  );

  it("counts no clip changes and asks Stash nothing (clips have no change count yet)", async () => {
    const { run } = newRun();

    const count = await stashSyncService["getChangeCount"](
      "clip",
      SINCE,
      INSTANCE,
      run
    );

    expect(count).toBe(0);
    expect(client.findSceneMarkers).not.toHaveBeenCalled();
  });
});
