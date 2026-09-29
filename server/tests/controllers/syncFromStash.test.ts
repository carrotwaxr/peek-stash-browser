/**
 * Unit tests for syncFromStash: the admin's one-off import of a user's
 * ratings, favorites, O counts and plays from every Stash instance.
 *
 * The per-type cases run as one describe.each over the seven rated types
 * (RATING_TARGETS): which list query and filter each pass sends, how it
 * pages, which rows it creates or counts as updated, and that each page's
 * upserts go in one writer-queue unit. The scene history cases pin the merge
 * of Stash's O and play dates with Peek's.
 */
import type { WatchHistory } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncFromStash } from "../../controllers/user.js";
import prisma from "../../prisma/singleton.js";
import { rankingComputeService } from "../../services/RankingComputeService.js";
import { recommendationService } from "../../services/RecommendationService.js";
import { IMPORT_PAGE_SIZE } from "../../services/StashImportService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { objectContaining, stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Build a mock StashClient using vi.hoisted so it's available in vi.mock factories
const mockStashClient = vi.hoisted(() => ({
  findScenes: vi.fn(),
  findPerformers: vi.fn(),
  findStudios: vi.fn(),
  findTags: vi.fn(),
  findGalleries: vi.fn(),
  findGroups: vi.fn(),
  findImages: vi.fn(),
}));

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock bcryptjs (imported by user.ts at top level)
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));

// Mock recoveryKey utils
vi.mock("../../utils/recoveryKey.js", () => ({
  generateRecoveryKey: vi.fn(),
  formatRecoveryKey: vi.fn(),
  hashRecoveryKey: vi.fn(),
}));

// Mock passwordValidation
vi.mock("../../utils/passwordValidation.js", () => ({
  validatePassword: vi.fn(),
}));

// Mock PermissionService
vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(),
}));

// Mock ExclusionComputationService
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    recomputeForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock StashInstanceManager (syncFromStash reads every instance from it)
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getAll: vi.fn().mockReturnValue([["instance-1", mockStashClient]]),
  },
}));

// The per-entity stats are rebuilt after a history import
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: {
    rebuildAllStatsForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// The per-user caches an import that wrote something drops
vi.mock("../../services/RankingComputeService.js", () => ({
  rankingComputeService: { forget: vi.fn() },
}));
vi.mock("../../services/RecommendationService.js", () => ({
  recommendationService: { forget: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockStats = vi.mocked(userStatsService, true);
const mockRankings = vi.mocked(rankingComputeService, true);
const mockRecommendations = vi.mocked(recommendationService, true);

const ADMIN = { id: 1, username: "admin", role: "ADMIN" };
const USER = { id: 2, username: "testuser", role: "USER" };
const TARGET_USER_ID = 2;
const INSTANCE = "instance-1";
const PAGE_SIZE = IMPORT_PAGE_SIZE;
const GT_ZERO = { value: 0, modifier: "GREATER_THAN" };
/** The play pass: scenes with plays, watch time or a resume point in Stash */
const PLAY_PASS = {
  play_count: GT_ZERO,
  OR: { play_duration: GT_ZERO, OR: { resume_time: GT_ZERO } },
};

/** Every type off: a case switches on the one it tests. */
const NOTHING = {
  scenes: { rating: false, favorite: false, oCounter: false, playCount: false },
  performers: { rating: false, favorite: false },
  studios: { rating: false, favorite: false },
  tags: { rating: false, favorite: false },
  galleries: { rating: false },
  groups: { rating: false },
  images: { rating: false },
};

/** Default sync options (match the code defaults) */
const DEFAULT_OPTIONS = {
  scenes: { rating: true, favorite: false, oCounter: false, playCount: false },
  performers: { rating: true, favorite: true },
  studios: { rating: true, favorite: true },
  tags: { rating: false, favorite: true },
  galleries: { rating: true },
  groups: { rating: true },
  images: { rating: true },
};

type OptionsKey = keyof typeof NOTHING;
type StashMethod = keyof typeof mockStashClient;
type RatingModel =
  | "sceneRating"
  | "performerRating"
  | "studioRating"
  | "tagRating"
  | "galleryRating"
  | "groupRating"
  | "imageRating";

/** A Stash entity as the import reads it: only the fields it looks at. */
interface StashEntity {
  id: string;
  rating100?: number | null;
  favorite?: boolean;
  o_counter?: number | null;
  play_count?: number | null;
  o_history?: string[];
  play_history?: string[];
  play_duration?: number | null;
  resume_time?: number | null;
}

interface ImportedType {
  type: string;
  options: OptionsKey;
  method: StashMethod;
  /** The list key under the query's root field. */
  resultKey: string;
  /** The criteria argument of the list query. */
  filterArg: string;
  model: RatingModel;
  /** The entity id column of the rating table. */
  idField: string;
  /** Stash has rating100 on the type (the import reads it). */
  hasRating: boolean;
  /** The filter key that selects Stash favorites, or null when Stash has none on the type. */
  favoriteFilter: "favorite" | "filter_favorites" | null;
}

const TYPES: ImportedType[] = [
  {
    type: "scene",
    options: "scenes",
    method: "findScenes",
    resultKey: "scenes",
    filterArg: "scene_filter",
    model: "sceneRating",
    idField: "sceneId",
    hasRating: true,
    favoriteFilter: null,
  },
  {
    type: "performer",
    options: "performers",
    method: "findPerformers",
    resultKey: "performers",
    filterArg: "performer_filter",
    model: "performerRating",
    idField: "performerId",
    hasRating: true,
    favoriteFilter: "filter_favorites",
  },
  {
    type: "studio",
    options: "studios",
    method: "findStudios",
    resultKey: "studios",
    filterArg: "studio_filter",
    model: "studioRating",
    idField: "studioId",
    hasRating: true,
    favoriteFilter: "favorite",
  },
  {
    type: "tag",
    options: "tags",
    method: "findTags",
    resultKey: "tags",
    filterArg: "tag_filter",
    model: "tagRating",
    idField: "tagId",
    hasRating: false,
    favoriteFilter: "favorite",
  },
  {
    type: "gallery",
    options: "galleries",
    method: "findGalleries",
    resultKey: "galleries",
    filterArg: "gallery_filter",
    model: "galleryRating",
    idField: "galleryId",
    hasRating: true,
    favoriteFilter: null,
  },
  {
    type: "group",
    options: "groups",
    method: "findGroups",
    resultKey: "groups",
    filterArg: "group_filter",
    model: "groupRating",
    idField: "groupId",
    hasRating: true,
    favoriteFilter: null,
  },
  {
    type: "image",
    options: "images",
    method: "findImages",
    resultKey: "images",
    filterArg: "image_filter",
    model: "imageRating",
    idField: "imageId",
    hasRating: true,
    favoriteFilter: null,
  },
];

const SCENE = must(TYPES[0]);

/** The options that switch on `which` for one type and nothing else. */
function only(
  t: ImportedType,
  which: {
    rating?: boolean;
    favorite?: boolean;
    oCounter?: boolean;
    playCount?: boolean;
  }
) {
  return {
    ...NOTHING,
    [t.options]: { ...NOTHING[t.options], ...which },
  };
}

/** A Stash list page as the type's query answers it. */
function page(t: ImportedType, items: StashEntity[], count = items.length) {
  return { [t.method]: { [t.resultKey]: items, count } };
}

/** Answers `items` paged by the request's filter, as Stash does. */
function paged(t: ImportedType, items: StashEntity[]) {
  return (variables: { filter?: { page?: number; per_page?: number } }) => {
    const perPage = variables.filter?.per_page ?? 25;
    const pageNo = variables.filter?.page ?? 1;
    return Promise.resolve(
      page(
        t,
        items.slice((pageNo - 1) * perPage, pageNo * perPage),
        items.length
      )
    );
  };
}

const bare = {
  favorite: false,
  o_counter: null,
  play_count: null,
  o_history: [],
  play_history: [],
};

function rated(id: string, rating100: number | null): StashEntity {
  return { ...bare, id, rating100 };
}

function favorite(id: string, favorite = true): StashEntity {
  return { ...bare, id, rating100: null, favorite };
}

/** A scene with Stash's O and play history. */
function scene(
  id: string,
  history: {
    rating100?: number | null;
    o_counter?: number | null;
    play_count?: number | null;
    o_history?: string[];
    play_history?: string[];
    play_duration?: number | null;
    resume_time?: number | null;
  }
): StashEntity {
  return { ...bare, id, rating100: null, ...history };
}

/** The user's existing rating rows of the type, as its table returns them. */
function setExisting(
  t: ImportedType,
  rows: Array<{ id: string; rating?: number | null; favorite?: boolean }>
): void {
  const base = { userId: TARGET_USER_ID, instanceId: INSTANCE };
  const fields = ({ rating = null, favorite = false }: (typeof rows)[number]) =>
    ({ rating, favorite }) as const;
  switch (t.model) {
    case "sceneRating":
      mockPrisma.sceneRating.findMany.mockResolvedValue(
        rows.map((r) => partialRow({ ...base, sceneId: r.id, ...fields(r) }))
      );
      return;
    case "performerRating":
      mockPrisma.performerRating.findMany.mockResolvedValue(
        rows.map((r) =>
          partialRow({ ...base, performerId: r.id, ...fields(r) })
        )
      );
      return;
    case "studioRating":
      mockPrisma.studioRating.findMany.mockResolvedValue(
        rows.map((r) => partialRow({ ...base, studioId: r.id, ...fields(r) }))
      );
      return;
    case "tagRating":
      mockPrisma.tagRating.findMany.mockResolvedValue(
        rows.map((r) => partialRow({ ...base, tagId: r.id, ...fields(r) }))
      );
      return;
    case "galleryRating":
      mockPrisma.galleryRating.findMany.mockResolvedValue(
        rows.map((r) => partialRow({ ...base, galleryId: r.id, ...fields(r) }))
      );
      return;
    case "groupRating":
      mockPrisma.groupRating.findMany.mockResolvedValue(
        rows.map((r) => partialRow({ ...base, groupId: r.id, ...fields(r) }))
      );
      return;
    case "imageRating":
      mockPrisma.imageRating.findMany.mockResolvedValue(
        rows.map((r) => partialRow({ ...base, imageId: r.id, ...fields(r) }))
      );
      return;
  }
}

/** A watch history row as the table returns it. */
function historyRow(fields: {
  sceneId: string;
  oCount?: number;
  oHistory?: string[];
  playCount?: number;
  playHistory?: string[];
  lastPlayedAt?: Date | null;
  playDuration?: number;
  resumeTime?: number | null;
}): WatchHistory {
  return partialRow<WatchHistory>({
    userId: TARGET_USER_ID,
    instanceId: INSTANCE,
    oCount: 0,
    oHistory: [],
    playCount: 0,
    playHistory: [],
    lastPlayedAt: null,
    playDuration: 0,
    resumeTime: null,
    ...fields,
  });
}

async function run(options: typeof NOTHING = NOTHING) {
  const req = reqFor(syncFromStash, {
    body: { options },
    params: { userId: String(TARGET_USER_ID) },
    user: ADMIN,
  });
  const res = resFor(syncFromStash);
  await syncFromStash(req, res);
  return res;
}

function stashStub() {
  const client = {
    findScenes: vi.fn(),
    findPerformers: vi.fn(),
    findStudios: vi.fn(),
    findTags: vi.fn(),
    findGalleries: vi.fn(),
    findGroups: vi.fn(),
    findImages: vi.fn(),
  };
  resetStash(client);
  return client;
}

function resetStash(client: typeof mockStashClient) {
  for (const t of TYPES) {
    client[t.method].mockResolvedValue(page(t, []));
  }
}

/** The one writer-queue unit of the run, as the Prisma mock saw it. */
function theTransaction() {
  expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  return must(mockPrisma.$transaction.mock.calls[0])[0];
}

// Stash's offset form and its stored (toISOString) form
const STASH_T = "2021-10-12T18:02:42-05:00";
const T = "2021-10-12T23:02:42.000Z";
const T_PLUS_2S = "2021-10-12T23:02:44.000Z";
const T_PLUS_90S = "2021-10-12T23:04:12.000Z";
const U = "2021-11-01T10:00:00.000Z";

describe("syncFromStash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: single instance
    mockInstanceManager.getAll.mockReturnValue([
      [INSTANCE, partialRow(mockStashClient)],
    ]);
    // Default: empty existing records
    for (const t of TYPES) mockPrisma[t.model].findMany.mockResolvedValue([]);
    mockPrisma.watchHistory.findMany.mockResolvedValue([]);
    // Default: all Stash API calls return empty
    resetStash(mockStashClient);
  });

  // ─── Auth & Validation ───

  describe("auth and validation", () => {
    it("returns 403 when user is not admin", async () => {
      const req = reqFor(syncFromStash, {
        params: { userId: "2" },
        user: USER,
      });
      const res = resFor(syncFromStash);
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(403);
      expect(res._getErrorBody().error).toMatch(/Only admins/);
    });

    it("returns 403 when user is missing", async () => {
      const req = reqFor(syncFromStash, {
        params: { userId: "2" },
        user: malformed({}),
      });
      const res = resFor(syncFromStash);
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(403);
    });

    it("returns 400 when userId param is not a number", async () => {
      const req = reqFor(syncFromStash, {
        params: { userId: "abc" },
        user: ADMIN,
      });
      const res = resFor(syncFromStash);
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/Invalid user ID/);
    });

    it("returns 400 when no Stash instances configured", async () => {
      mockInstanceManager.getAll.mockReturnValue([]);
      const req = reqFor(syncFromStash, {
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(syncFromStash);
      await syncFromStash(req, res);
      expect(res._getStatus()).toBe(400);
      expect(res._getErrorBody().error).toMatch(/No Stash instances/);
    });
  });

  // ─── Every rated type ───

  describe.each(TYPES)("$type import", (t) => {
    /** The one option Stash has on the type: rating, or favorite for tags. */
    const primary = t.hasRating
      ? { rating: true as const }
      : { favorite: true as const };
    const entity = (id: string, set = true): StashEntity =>
      t.hasRating ? rated(id, set ? 80 : null) : favorite(id, set);
    /** The change the pass writes, and what an existing row is compared against. */
    const change = t.hasRating ? { rating: 80 } : { favorite: true };
    const primaryFilter = t.hasRating
      ? { rating100: GT_ZERO }
      : { [must(t.favoriteFilter)]: true };
    const method = mockStashClient[t.method];
    const model = mockPrisma[t.model];
    const favoriteFilter = t.favoriteFilter;

    it("fetches nothing when the type's options are off", async () => {
      const res = await run(NOTHING);
      expect(method).not.toHaveBeenCalled();
      expect(res._getOkBody().stats[t.options]).toEqual({
        checked: 0,
        created: 0,
        updated: 0,
      });
    });

    it(`fetches one page of ${PAGE_SIZE} when the count fits in it`, async () => {
      method.mockResolvedValue(page(t, [entity("1"), entity("2")]));
      const res = await run(only(t, primary));
      expect(method).toHaveBeenCalledTimes(1);
      expect(method).toHaveBeenCalledWith({
        filter: { page: 1, per_page: PAGE_SIZE },
        [t.filterArg]: primaryFilter,
      });
      expect(res._getOkBody().stats[t.options].created).toBe(2);
    });

    it("fetches the next page while the count says more", async () => {
      method
        .mockResolvedValueOnce(
          page(t, [entity("1"), entity("2"), entity("3")], 5)
        )
        .mockResolvedValueOnce(page(t, [entity("4"), entity("5")], 5));
      const res = await run(only(t, primary));
      expect(method).toHaveBeenCalledTimes(2);
      expect(method).toHaveBeenNthCalledWith(
        1,
        objectContaining({ filter: { page: 1, per_page: PAGE_SIZE } })
      );
      expect(method).toHaveBeenNthCalledWith(
        2,
        objectContaining({ filter: { page: 2, per_page: PAGE_SIZE } })
      );
      expect(res._getOkBody().stats[t.options].created).toBe(5);
    });

    it("stops at an empty page even when the count says more", async () => {
      method
        .mockResolvedValueOnce(page(t, [entity("1")], 100))
        .mockResolvedValueOnce(page(t, [], 100));
      const res = await run(only(t, primary));
      expect(method).toHaveBeenCalledTimes(2);
      expect(res._getOkBody().stats[t.options].created).toBe(1);
    });

    it("creates a row for each entity with the field set, and none for one Stash's filter returned without it", async () => {
      method.mockResolvedValue(
        page(t, [entity("1"), entity("2", false), entity("3")])
      );
      const res = await run(only(t, primary));
      const stats = res._getOkBody().stats[t.options];
      expect(stats.checked).toBe(3);
      expect(stats.created).toBe(2);
      expect(model.upsert).toHaveBeenCalledTimes(2);
      expect(model.upsert).toHaveBeenCalledWith({
        where: {
          [`userId_instanceId_${t.idField}`]: {
            userId: TARGET_USER_ID,
            instanceId: INSTANCE,
            [t.idField]: "1",
          },
        },
        update: change,
        create: {
          userId: TARGET_USER_ID,
          instanceId: INSTANCE,
          [t.idField]: "1",
          rating: null,
          favorite: false,
          ...change,
        },
      });
    });

    it("counts an existing row with another value as updated", async () => {
      method.mockResolvedValue(page(t, [entity("1")]));
      setExisting(t, [
        { id: "1", ...(t.hasRating ? { rating: 60 } : { favorite: false }) },
      ]);
      const res = await run(only(t, primary));
      const stats = res._getOkBody().stats[t.options];
      expect(stats.updated).toBe(1);
      expect(stats.created).toBe(0);
      expect(model.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({
            userId: TARGET_USER_ID,
            instanceId: INSTANCE,
            [t.idField]: { in: ["1"] },
          }),
        })
      );
    });

    it("does not count an existing row with the same value as updated", async () => {
      method.mockResolvedValue(page(t, [entity("1")]));
      setExisting(t, [{ id: "1", ...change }]);
      const res = await run(only(t, primary));
      const stats = res._getOkBody().stats[t.options];
      expect(stats.updated).toBe(0);
      expect(stats.created).toBe(0);
    });

    it(`writes a page of ${PAGE_SIZE} upserts as one batch, and nothing for a page with nothing to write`, async () => {
      const ids = Array.from({ length: PAGE_SIZE }, (_, i) => String(i + 1));
      method.mockResolvedValue(
        page(
          t,
          ids.map((id) => entity(id))
        )
      );
      await run(only(t, primary));
      const ops = theTransaction();
      expect(Array.isArray(ops) && ops.length).toBe(PAGE_SIZE);
      expect(model.upsert).toHaveBeenCalledTimes(PAGE_SIZE);

      vi.clearAllMocks();
      method.mockResolvedValue(page(t, [entity("1", false)]));
      await run(only(t, primary));
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("writes one batch per page", async () => {
      const ids = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
        String(i + 1)
      );
      method.mockImplementation(
        paged(
          t,
          ids.map((id) => entity(id))
        )
      );
      const res = await run(only(t, primary));
      expect(method).toHaveBeenCalledTimes(2);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(res._getOkBody().stats[t.options].created).toBe(PAGE_SIZE + 1);
    });

    if (t.hasRating) {
      it("ignores a rating of 0 from Stash (unrated)", async () => {
        method.mockResolvedValue(page(t, [rated("1", 0)]));
        const res = await run(only(t, { rating: true }));
        expect(model.upsert).not.toHaveBeenCalled();
        expect(res._getOkBody().stats[t.options].created).toBe(0);
      });
    } else {
      it("ignores the rating option: Stash has no rating on the type", async () => {
        await run(only(t, { rating: true }));
        expect(method).not.toHaveBeenCalled();
      });
    }

    if (favoriteFilter !== null) {
      it("sends Stash's favorite filter for the favorite pass and writes only the favorite", async () => {
        method.mockResolvedValue(page(t, [favorite("1")]));
        const res = await run(only(t, { favorite: true }));
        expect(method).toHaveBeenCalledTimes(1);
        expect(method).toHaveBeenCalledWith({
          filter: { page: 1, per_page: PAGE_SIZE },
          [t.filterArg]: { [favoriteFilter]: true },
        });
        expect(model.upsert).toHaveBeenCalledWith(
          objectContaining({
            update: { favorite: true },
            create: objectContaining({ rating: null, favorite: true }),
          })
        );
        expect(res._getOkBody().stats[t.options].created).toBe(1);
      });

      it("counts an existing row whose favorite differs as updated", async () => {
        method.mockResolvedValue(page(t, [favorite("1")]));
        setExisting(t, [{ id: "1", favorite: false }]);
        const res = await run(only(t, { favorite: true }));
        expect(res._getOkBody().stats[t.options].updated).toBe(1);
      });

      it("never clears a Peek favorite: an unfavorited entity is not written", async () => {
        method.mockResolvedValue(page(t, [favorite("1", false)]));
        setExisting(t, [{ id: "1", favorite: true }]);
        const res = await run(only(t, { favorite: true }));
        expect(model.upsert).not.toHaveBeenCalled();
        expect(res._getOkBody().stats[t.options].updated).toBe(0);
      });
    } else {
      it("ignores the favorite option: Stash has no favorite on the type", async () => {
        await run(only(t, { favorite: true }));
        expect(method).not.toHaveBeenCalled();
      });
    }

    if (t.hasRating && t.favoriteFilter !== null) {
      it("runs a filtered pass per option when both are on, never an unfiltered fetch", async () => {
        method.mockImplementation((variables: Record<string, unknown>) => {
          const criteria = variables[t.filterArg] as Record<string, unknown>;
          return Promise.resolve(
            "rating100" in criteria
              ? page(t, [rated("1", 90), { ...rated("2", 70), favorite: true }])
              : page(t, [favorite("3"), { ...rated("2", 70), favorite: true }])
          );
        });
        const res = await run(only(t, { rating: true, favorite: true }));
        expect(method).toHaveBeenCalledTimes(2);
        expect(method).toHaveBeenCalledWith(
          objectContaining({ [t.filterArg]: { rating100: GT_ZERO } })
        );
        expect(method).toHaveBeenCalledWith(
          objectContaining({
            [t.filterArg]: { [must(t.favoriteFilter)]: true },
          })
        );
        // "2" is rated and a favorite: written in both passes, counted once
        expect(model.upsert).toHaveBeenCalledTimes(4);
        const stats = res._getOkBody().stats[t.options];
        expect(stats.checked).toBe(3);
        expect(stats.created).toBe(3);
        expect(stats.updated).toBe(0);
      });
    }
  });

  // ─── Scene O and play history ───

  describe("scene history", () => {
    it("sends Stash's o_counter filter for the O pass, in pages", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [STASH_T] })])
      );
      await run(only(SCENE, { oCounter: true }));
      expect(mockStashClient.findScenes).toHaveBeenCalledTimes(1);
      expect(mockStashClient.findScenes).toHaveBeenCalledWith({
        filter: { page: 1, per_page: PAGE_SIZE },
        scene_filter: { o_counter: GT_ZERO },
      });
    });

    it("creates a history row with Stash's O dates stored in toISOString form", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [STASH_T] })])
      );
      const res = await run(only(SCENE, { oCounter: true }));
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith({
        where: {
          userId_instanceId_sceneId: {
            userId: TARGET_USER_ID,
            instanceId: INSTANCE,
            sceneId: "1",
          },
        },
        update: { oCount: 1, oHistory: [T] },
        create: {
          userId: TARGET_USER_ID,
          instanceId: INSTANCE,
          sceneId: "1",
          oCount: 1,
          oHistory: [T],
          playCount: 0,
          playDuration: 0,
          playHistory: [],
        },
      });
      const stats = res._getOkBody().stats.scenes;
      expect(stats).toEqual({ checked: 1, created: 1, updated: 0 });
    });

    it("imports a scene with Peek O times and overlapping Stash times without duplicates", async () => {
      // Peek's O at T was pushed to Stash by Sync to Stash and came back 2 s later
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [T_PLUS_2S] })])
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ sceneId: "1", oCount: 2, oHistory: [T, U] }),
      ]);
      const res = await run(only(SCENE, { oCounter: true }));
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({ update: { oCount: 2, oHistory: [T_PLUS_2S, U] } })
      );
      expect(res._getOkBody().stats.scenes.updated).toBe(1);
    });

    it("keeps a Peek-only O", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [T] })])
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ sceneId: "1", oCount: 1, oHistory: [U] }),
      ]);
      await run(only(SCENE, { oCounter: true }));
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({ update: { oCount: 2, oHistory: [T, U] } })
      );
    });

    it("imports a Peek time and a Stash time 90 seconds apart as two events", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [T_PLUS_90S] })])
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ sceneId: "1", oCount: 1, oHistory: [T] }),
      ]);
      await run(only(SCENE, { oCounter: true }));
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({ update: { oCount: 2, oHistory: [T, T_PLUS_90S] } })
      );
    });

    it("never lowers a count: the merged length, Stash's counter and Peek's count, whichever is highest", async () => {
      // Stash counted 4 before it kept history; Peek counted 5 with one date
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [
          scene("1", { o_counter: 4, o_history: [T] }),
          scene("2", { o_counter: 4, o_history: [T] }),
        ])
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ sceneId: "2", oCount: 5, oHistory: [U] }),
      ]);
      await run(only(SCENE, { oCounter: true }));
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          create: objectContaining({ sceneId: "1", oCount: 4, oHistory: [T] }),
        })
      );
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({
            userId_instanceId_sceneId: objectContaining({ sceneId: "2" }),
          }),
          update: { oCount: 5, oHistory: [T, U] },
        })
      );
    });

    it("writes nothing for a scene whose row already holds the merge (a repeat import)", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [STASH_T] })])
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ sceneId: "1", oCount: 2, oHistory: [T, U] }),
      ]);
      const res = await run(only(SCENE, { oCounter: true }));
      // The unit reads the page's rows, finds the merge in place and writes nothing
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.watchHistory.upsert).not.toHaveBeenCalled();
      expect(res._getOkBody().stats.scenes).toEqual({
        checked: 1,
        created: 0,
        updated: 0,
      });
      expect(mockStats.rebuildAllStatsForUser).not.toHaveBeenCalled();
    });

    it("imports plays with the play pass filter: merged dates, the count rule and the latest play", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { play_count: 2, play_history: [STASH_T, U] })])
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({
          sceneId: "1",
          playCount: 3,
          playHistory: [T_PLUS_2S],
          lastPlayedAt: new Date(T_PLUS_2S),
        }),
      ]);
      await run(only(SCENE, { playCount: true }));
      expect(mockStashClient.findScenes).toHaveBeenCalledWith({
        filter: { page: 1, per_page: PAGE_SIZE },
        scene_filter: PLAY_PASS,
      });
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          update: {
            playCount: 3,
            playHistory: [T, U],
            lastPlayedAt: new Date(U),
          },
          create: objectContaining({
            playCount: 3,
            playHistory: [T, U],
            lastPlayedAt: new Date(U),
            oCount: 0,
            oHistory: [],
          }),
        })
      );
    });

    it("reads scenes with watch time or a resume point but no plays in the one play pass", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { play_duration: 300 })])
      );
      await run(only(SCENE, { playCount: true }));
      expect(mockStashClient.findScenes).toHaveBeenCalledTimes(1);
      expect(mockStashClient.findScenes).toHaveBeenCalledWith({
        filter: { page: 1, per_page: PAGE_SIZE },
        scene_filter: PLAY_PASS,
      });
    });

    it("keeps the larger play duration and a Peek resume point, and takes Stash's resume point when Peek has none", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [
          // Stash watched longer; Peek has no resume point
          scene("1", { play_duration: 900, resume_time: 60 }),
          // Peek watched longer and holds a resume point: nothing to write
          scene("2", { play_duration: 300, resume_time: 50 }),
          // Peek's 0 is the start of the scene, so no resume point
          scene("3", { play_duration: 100, resume_time: 70 }),
          // New to Peek: watch time and a resume point, no plays
          scene("4", { play_duration: 400, resume_time: 30 }),
        ])
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ sceneId: "1", playDuration: 500, resumeTime: null }),
        historyRow({ sceneId: "2", playDuration: 500, resumeTime: 120 }),
        historyRow({ sceneId: "3", playDuration: 200, resumeTime: 0 }),
      ]);
      const res = await run(only(SCENE, { playCount: true }));

      const where = (sceneId: string) => ({
        userId_instanceId_sceneId: {
          userId: TARGET_USER_ID,
          instanceId: INSTANCE,
          sceneId,
        },
      });
      const plays = { playCount: 0, playHistory: [], lastPlayedAt: null };
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledTimes(3);
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: where("1"),
          update: { ...plays, playDuration: 900, resumeTime: 60 },
        })
      );
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: where("3"),
          update: { ...plays, resumeTime: 70 },
        })
      );
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: where("4"),
          create: {
            userId: TARGET_USER_ID,
            instanceId: INSTANCE,
            sceneId: "4",
            oCount: 0,
            oHistory: [],
            ...plays,
            playDuration: 400,
            resumeTime: 30,
          },
        })
      );
      expect(res._getOkBody().stats.scenes).toEqual({
        checked: 4,
        created: 1,
        updated: 2,
      });
    });

    it("never moves lastPlayedAt back: a Peek play in progress stays the latest", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { play_count: 1, play_history: [T] })])
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ sceneId: "1", playCount: 0, lastPlayedAt: new Date(U) }),
      ]);
      await run(only(SCENE, { playCount: true }));
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          update: { playCount: 1, playHistory: [T], lastPlayedAt: new Date(U) },
        })
      );
    });

    it("with O and plays both on, the O pass imports both and the play pass skips the scenes it handled", async () => {
      const both = scene("1", {
        o_counter: 1,
        o_history: [T],
        play_count: 1,
        play_history: [U],
      });
      const playedOnly = scene("2", { play_count: 1, play_history: [U] });
      mockStashClient.findScenes.mockImplementation(
        (variables: { scene_filter?: Record<string, unknown> }) =>
          Promise.resolve(
            "o_counter" in (variables.scene_filter ?? {})
              ? page(SCENE, [both])
              : page(SCENE, [both, playedOnly])
          )
      );
      const res = await run(only(SCENE, { oCounter: true, playCount: true }));
      expect(mockStashClient.findScenes).toHaveBeenCalledTimes(2);
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          update: {
            oCount: 1,
            oHistory: [T],
            playCount: 1,
            playHistory: [U],
            lastPlayedAt: new Date(U),
          },
        })
      );
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({
            userId_instanceId_sceneId: objectContaining({ sceneId: "2" }),
          }),
          update: { playCount: 1, playHistory: [U], lastPlayedAt: new Date(U) },
        })
      );
      expect(res._getOkBody().stats.scenes).toEqual({
        checked: 2,
        created: 2,
        updated: 0,
      });
    });

    it("counts a scene once when it gets both a rating and an O count", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [
          scene("1", { rating100: 80, o_counter: 1, o_history: [T] }),
        ])
      );
      const res = await run(only(SCENE, { rating: true, oCounter: true }));
      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledTimes(1);
      expect(res._getOkBody().stats.scenes).toEqual({
        checked: 1,
        created: 1,
        updated: 0,
      });
    });

    it(`writes a page of ${PAGE_SIZE} scenes as one writer-queue unit, reading their rows inside it`, async () => {
      const scenes = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
        scene(String(i + 1), { o_counter: 1, o_history: [T] })
      );
      mockStashClient.findScenes.mockImplementation(paged(SCENE, scenes));
      await run(only(SCENE, { oCounter: true }));
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledTimes(
        PAGE_SIZE + 1
      );
      // The page's rows are read by the unit, not before it
      const firstUnit = must(
        mockPrisma.$transaction.mock.invocationCallOrder[0]
      );
      const firstRead = must(
        mockPrisma.watchHistory.findMany.mock.invocationCallOrder[0]
      );
      expect(firstRead).toBeGreaterThan(firstUnit);
      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledWith({
        where: {
          userId: TARGET_USER_ID,
          instanceId: INSTANCE,
          sceneId: { in: scenes.slice(0, PAGE_SIZE).map((s) => s.id) },
        },
      });
    });

    it("rebuilds the user's per-entity stats once after a history import that wrote something", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [
          scene("1", { o_counter: 1, o_history: [T] }),
          scene("2", { o_counter: 1, o_history: [T] }),
        ])
      );
      await run(only(SCENE, { oCounter: true }));
      expect(mockStats.rebuildAllStatsForUser).toHaveBeenCalledTimes(1);
      expect(mockStats.rebuildAllStatsForUser).toHaveBeenCalledWith(
        TARGET_USER_ID
      );
    });

    it("does not rebuild stats after a ratings-only import", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [rated("1", 80)])
      );
      await run(only(SCENE, { rating: true }));
      expect(mockStats.rebuildAllStatsForUser).not.toHaveBeenCalled();
    });

    it("imports the same scene id on two instances into two rows", async () => {
      const stash2 = stashStub();
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [T] })])
      );
      stash2.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [U] })])
      );
      mockInstanceManager.getAll.mockReturnValue([
        ["instance-1", partialRow(mockStashClient)],
        ["instance-2", partialRow(stash2)],
      ]);
      const res = await run(only(SCENE, { oCounter: true }));
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: TARGET_USER_ID,
              instanceId: "instance-1",
              sceneId: "1",
            },
          },
          update: { oCount: 1, oHistory: [T] },
        })
      );
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: TARGET_USER_ID,
              instanceId: "instance-2",
              sceneId: "1",
            },
          },
          update: { oCount: 1, oHistory: [U] },
        })
      );
      expect(res._getOkBody().stats.scenes.created).toBe(2);
    });
  });

  // ─── Rankings and Recommended ───

  describe("rankings and the Recommended list", () => {
    it("calls forget for the imported user once, after the stats rebuild: rankings and the Recommended list", async () => {
      const stash2 = stashStub();
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [T] })])
      );
      stash2.findScenes.mockResolvedValue(
        page(SCENE, [scene("1", { o_counter: 1, o_history: [U] })])
      );
      mockInstanceManager.getAll.mockReturnValue([
        ["instance-1", partialRow(mockStashClient)],
        ["instance-2", partialRow(stash2)],
      ]);
      await run(only(SCENE, { oCounter: true }));

      expect(mockRankings.forget).toHaveBeenCalledTimes(1);
      expect(mockRankings.forget).toHaveBeenCalledWith(TARGET_USER_ID);
      expect(mockRecommendations.forget).toHaveBeenCalledTimes(1);
      expect(mockRecommendations.forget).toHaveBeenCalledWith(TARGET_USER_ID);
      // The rankings are computed from the rebuilt stats
      const rebuilt = must(
        mockStats.rebuildAllStatsForUser.mock.invocationCallOrder[0]
      );
      expect(
        must(mockRankings.forget.mock.invocationCallOrder[0])
      ).toBeGreaterThan(rebuilt);
    });

    it("forgets the user's rankings and Recommended list after an import that wrote only ratings", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [rated("1", 80)])
      );
      await run(only(SCENE, { rating: true }));

      expect(mockRankings.forget).toHaveBeenCalledWith(TARGET_USER_ID);
      expect(mockRecommendations.forget).toHaveBeenCalledWith(TARGET_USER_ID);
    });

    it("forgets nothing after an import that wrote nothing", async () => {
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [
          scene("1", { rating100: 80, o_counter: 1, o_history: [T] }),
        ])
      );
      setExisting(SCENE, [{ id: "1", rating: 80 }]);
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        historyRow({ sceneId: "1", oCount: 1, oHistory: [T] }),
      ]);
      await run(only(SCENE, { rating: true, oCounter: true }));

      expect(mockPrisma.sceneRating.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.watchHistory.upsert).not.toHaveBeenCalled();
      expect(mockRankings.forget).not.toHaveBeenCalled();
      expect(mockRecommendations.forget).not.toHaveBeenCalled();
    });
  });

  // ─── Multi-Instance Support ───

  describe("multi-instance support", () => {
    it("syncs across multiple instances", async () => {
      const mockStash2 = stashStub();
      mockStash2.findScenes.mockResolvedValue(page(SCENE, [rated("10", 95)]));
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [rated("1", 80)])
      );
      mockInstanceManager.getAll.mockReturnValue([
        ["instance-1", partialRow(mockStashClient)],
        ["instance-2", partialRow(mockStash2)],
      ]);

      const res = await run(DEFAULT_OPTIONS);

      expect(mockStashClient.findScenes).toHaveBeenCalled();
      expect(mockStash2.findScenes).toHaveBeenCalled();
      // Stats accumulate across instances
      expect(res._getOkBody().stats.scenes.created).toBe(2);
    });

    it("keys each instance's rows by its own instance id", async () => {
      const mockStash2 = stashStub();
      mockStash2.findScenes.mockResolvedValue(page(SCENE, [rated("1", 60)]));
      mockStashClient.findScenes.mockResolvedValue(
        page(SCENE, [rated("1", 80)])
      );
      mockInstanceManager.getAll.mockReturnValue([
        ["instance-1", partialRow(mockStashClient)],
        ["instance-2", partialRow(mockStash2)],
      ]);

      const res = await run(only(SCENE, { rating: true }));

      expect(res._getOkBody().stats.scenes.created).toBe(2);
      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: TARGET_USER_ID,
              instanceId: "instance-1",
              sceneId: "1",
            },
          },
          create: objectContaining({ instanceId: "instance-1", rating: 80 }),
        })
      );
      expect(mockPrisma.sceneRating.upsert).toHaveBeenCalledWith(
        objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: TARGET_USER_ID,
              instanceId: "instance-2",
              sceneId: "1",
            },
          },
          create: objectContaining({ instanceId: "instance-2", rating: 60 }),
        })
      );
    });
  });

  // ─── Error Handling ───

  describe("error handling", () => {
    it("continues with other instances when one fails", async () => {
      const failingStash = stashStub();
      failingStash.findScenes.mockRejectedValue(new Error("Connection failed"));
      const workingStash = stashStub();
      workingStash.findScenes.mockResolvedValue(page(SCENE, [rated("1", 80)]));

      mockInstanceManager.getAll.mockReturnValue([
        ["failing-instance", partialRow(failingStash)],
        ["working-instance", partialRow(workingStash)],
      ]);

      const res = await run(DEFAULT_OPTIONS);

      // Should still succeed overall: only the failing instance is skipped
      expect(res._getOkBody().success).toBe(true);
      expect(workingStash.findScenes).toHaveBeenCalled();
      expect(res._getOkBody().stats.scenes.created).toBe(1);
    });

    it("still answers 200 when the only instance fails", async () => {
      mockStashClient.findScenes.mockRejectedValue(new Error("GraphQL Error"));
      const res = await run(only(SCENE, { rating: true }));
      // Per-instance errors are caught, so sync still succeeds
      expect(res._getOkBody().success).toBe(true);
    });
  });

  // ─── Default Options ───

  describe("default options", () => {
    it("uses default sync options when none provided in body", async () => {
      const req = reqFor(syncFromStash, {
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(syncFromStash);
      await syncFromStash(req, res);

      // With defaults: ratings on every type Stash rates, favorites on
      // performers, studios and tags, no O counts or plays
      for (const t of TYPES) {
        expect(mockStashClient[t.method]).toHaveBeenCalledTimes(
          t.hasRating && t.favoriteFilter !== null ? 2 : 1
        );
      }
      expect(mockStashClient.findScenes).toHaveBeenCalledWith(
        objectContaining({ scene_filter: { rating100: GT_ZERO } })
      );
      expect(res._getOkBody().success).toBe(true);
    });
  });

  // ─── Response Shape ───

  describe("response shape", () => {
    it("returns expected response structure", async () => {
      const req = reqFor(syncFromStash, {
        params: { userId: "2" },
        user: ADMIN,
      });
      const res = resFor(syncFromStash);
      await syncFromStash(req, res);

      const body = res._getBody();
      expect(body).toEqual({
        success: true,
        message: stringContaining("Successfully synced"),
        stats: {
          scenes: { checked: 0, updated: 0, created: 0 },
          performers: { checked: 0, updated: 0, created: 0 },
          studios: { checked: 0, updated: 0, created: 0 },
          tags: { checked: 0, updated: 0, created: 0 },
          galleries: { checked: 0, updated: 0, created: 0 },
          groups: { checked: 0, updated: 0, created: 0 },
          images: { checked: 0, updated: 0, created: 0 },
        },
      });
    });
  });
});
