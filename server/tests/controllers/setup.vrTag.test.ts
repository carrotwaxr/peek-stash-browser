/**
 * The admin's view of an instance's VR tag: the GET carries the chosen tag,
 * its name and Stash's own; the PUT saves a live tag of that instance (400
 * for any other), clears it with null, and a new URL clears both columns.
 */
import type { StashInstance, StashTag } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAllStashInstances,
  getStashInstance,
  updateStashInstance,
} from "../../controllers/setup.js";
import { requireAdmin } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import setupRoutes from "../../routes/setup.js";
import { libraryStampFor } from "../../services/LibraryStamp.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { reqFor, resFor, testUser } from "../helpers/controllerTestUtils.js";
import { stashInstanceRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);
vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../graphql/StashClient.js", () => ({
  StashClient: vi.fn().mockImplementation(() => ({
    configuration: vi.fn().mockResolvedValue({ configuration: {} }),
  })),
  describeStashError: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: { reload: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../services/StashSyncService.js", () => ({
  SyncBusyError: class SyncBusyError extends Error {},
  LastEnabledInstanceError: class LastEnabledInstanceError extends Error {},
  stashSyncService: {
    fullSync: vi.fn(),
    queueFullSync: vi.fn().mockReturnValue("started"),
    deleteInstance: vi.fn(),
  },
}));
vi.mock("../../services/SyncScheduler.js", () => ({
  syncScheduler: { isRunning: vi.fn(() => false), start: vi.fn() },
}));
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: { recomputeUsers: vi.fn() },
}));
vi.mock("../../services/UserInstanceService.js", () => ({
  getUsersSelecting: vi.fn().mockResolvedValue([]),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockManager = vi.mocked(stashInstanceManager, true);
const mockSync = vi.mocked(stashSyncService, true);

const row = (overrides: Partial<StashInstance> = {}) =>
  stashInstanceRow({ id: "inst-a", ...overrides });

/** The `data` of the last instance update */
const lastUpdateData = () => {
  const { calls } = mockPrisma.stashInstance.update.mock;
  return must(calls[calls.length - 1], "an instance update")[0].data;
};

const put = async (body: Parameters<typeof updateStashInstance>[0]["body"]) => {
  const res = resFor(updateStashInstance);
  await updateStashInstance(
    reqFor(updateStashInstance, { body, params: { id: "inst-a" } }),
    res
  );
  return res;
};

describe("an instance's VR tag in the admin setup API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stashInstance.findUnique.mockResolvedValue(row());
    mockPrisma.stashInstance.update.mockResolvedValue(row());
    mockPrisma.stashTag.findMany.mockResolvedValue([]);
    mockPrisma.stashTag.findFirst.mockResolvedValue(null);
  });

  describe("PUT /api/setup/stash-instance/:id", () => {
    it("saves the id of a live tag on that instance", async () => {
      mockPrisma.stashTag.findFirst.mockResolvedValue(
        partialRow<StashTag>({ id: "tag-7" })
      );
      mockPrisma.stashInstance.update.mockResolvedValue(
        row({ vrTagId: "tag-7" })
      );
      mockPrisma.stashTag.findMany.mockResolvedValue([
        partialRow<StashTag>({
          id: "tag-7",
          stashInstanceId: "inst-a",
          name: "VR",
        }),
      ]);

      const res = await put({ vrTagId: "tag-7" });

      expect(mockPrisma.stashTag.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tag-7", stashInstanceId: "inst-a", deletedAt: null },
        })
      );
      expect(lastUpdateData()).toMatchObject({ vrTagId: "tag-7" });
      expect(res._getOkBody().instance).toMatchObject({
        vrTagId: "tag-7",
        vrTagName: "VR",
      });
    });

    it("answers 400 for a tag of another instance or a deleted tag, and saves nothing", async () => {
      // The lookup is scoped to this instance and live tags, so both read as none
      mockPrisma.stashTag.findFirst.mockResolvedValue(null);

      await expect(put({ vrTagId: "tag-of-b" })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.stashInstance.update).not.toHaveBeenCalled();
      expect(mockManager.reload).not.toHaveBeenCalled();
    });

    it("answers 400 for an id that is not text", async () => {
      await expect(
        put({ vrTagId: 7 } as unknown as { vrTagId: string })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.stashInstance.update).not.toHaveBeenCalled();
    });

    it("null clears the override without looking for a tag", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        row({ vrTagId: "tag-7" })
      );

      const res = await put({ vrTagId: null });

      expect(mockPrisma.stashTag.findFirst).not.toHaveBeenCalled();
      expect(lastUpdateData()).toMatchObject({ vrTagId: null });
      expect(res._getOkBody().instance).toMatchObject({
        vrTagId: null,
        vrTagName: null,
      });
    });

    it("leaves the tag alone when the body names none", async () => {
      await put({ name: "Renamed" });
      expect(lastUpdateData()).not.toHaveProperty("vrTagId");
    });

    it("a new URL clears the VR override and Stash's tag", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        row({ vrTagId: "tag-7", stashVrTag: "VR" })
      );

      await put({ url: "http://moved:9999/graphql" });

      expect(lastUpdateData()).toMatchObject({
        url: "http://moved:9999/graphql",
        firstSyncedAt: null,
        vrTagId: null,
        stashVrTag: null,
      });

      // The same address keeps both
      await put({ name: "Renamed" });
      expect(lastUpdateData()).not.toHaveProperty("stashVrTag");
    });

    it("an update still reloads the instance manager, queues no sync for a tag change and moves the library stamp", async () => {
      mockPrisma.stashTag.findFirst.mockResolvedValue(
        partialRow<StashTag>({ id: "tag-7" })
      );
      const before = libraryStampFor(1);

      const res = await put({ vrTagId: "tag-7" });

      expect(mockManager.reload).toHaveBeenCalledOnce();
      expect(mockSync.queueFullSync).not.toHaveBeenCalled();
      expect(res._getOkBody().sync).toBe("none");
      expect(libraryStampFor(1)).not.toBe(before);
    });
  });

  describe("the GETs", () => {
    it("the list answers vrTagId, vrTagName and stashVrTag", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        row({ vrTagId: "tag-7", stashVrTag: "VR" }),
        row({ id: "inst-b", vrTagId: null, stashVrTag: null }),
      ]);
      mockPrisma.stashTag.findMany.mockResolvedValue([
        partialRow<StashTag>({
          id: "tag-7",
          stashInstanceId: "inst-a",
          name: "Virtual reality",
        }),
      ]);

      const res = resFor(getAllStashInstances);
      await getAllStashInstances(reqFor(getAllStashInstances), res);

      const [a, b] = res._getOkBody().instances;
      expect(a).toMatchObject({
        vrTagId: "tag-7",
        vrTagName: "Virtual reality",
        stashVrTag: "VR",
      });
      expect(b).toMatchObject({
        vrTagId: null,
        vrTagName: null,
        stashVrTag: null,
      });
    });

    it("names the tag from live tags of that instance only: a deleted override reads null", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        row({ vrTagId: "tag-gone" }),
      ]);
      // Soft-deleted tags are left out by the query's deletedAt filter
      mockPrisma.stashTag.findMany.mockResolvedValue([]);

      const res = resFor(getAllStashInstances);
      await getAllStashInstances(reqFor(getAllStashInstances), res);

      expect(mockPrisma.stashTag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            OR: [{ id: "tag-gone", stashInstanceId: "inst-a" }],
          },
        })
      );
      expect(must(res._getOkBody().instances[0]).vrTagName).toBeNull();
      expect(must(res._getOkBody().instances[0]).vrTagId).toBe("tag-gone");
    });

    it("looks up no names when no instance chose a tag", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([row()]);
      await getAllStashInstances(
        reqFor(getAllStashInstances),
        resFor(getAllStashInstances)
      );
      expect(mockPrisma.stashTag.findMany).not.toHaveBeenCalled();
    });

    it("the single-instance GET carries the same three fields", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        row({ vrTagId: "tag-7", stashVrTag: "VR" }),
      ]);
      mockPrisma.stashTag.findMany.mockResolvedValue([
        partialRow<StashTag>({
          id: "tag-7",
          stashInstanceId: "inst-a",
          name: "VR",
        }),
      ]);

      const res = resFor(getStashInstance);
      await getStashInstance(reqFor(getStashInstance), res);

      expect(res._getOkBody().instance).toMatchObject({
        vrTagId: "tag-7",
        vrTagName: "VR",
        stashVrTag: "VR",
      });
    });
  });

  describe("access", () => {
    it("the PUT and both GETs sit behind requireAdmin, which answers a non-admin 403", () => {
      for (const [method, path] of [
        ["put", "/stash-instance/:id"],
        ["get", "/stash-instances"],
        ["get", "/stash-instance"],
      ] as const) {
        const layer = setupRoutes.stack.find((l) => l.route?.path === path);
        const handlers = must(layer?.route, path)
          .stack.filter((l) => l.method === method)
          .map((l) => l.handle);
        expect(handlers).toContain(requireAdmin);
      }

      const res = resFor(requireAdmin) as unknown as Response;
      const next = vi.fn();
      requireAdmin(
        { user: testUser({ role: "USER" }) } as unknown as Request,
        res,
        next as NextFunction
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
