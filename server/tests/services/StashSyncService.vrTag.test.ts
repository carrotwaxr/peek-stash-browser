/**
 * Unit tests for the VR tag read at the start of each instance's sync
 * (`readStashVrTag`): Stash's `configuration.ui.vrTag` stored trimmed in
 * `StashInstance.stashVrTag` with one `dbWrite` `updateMany`, only when it
 * changed, with the library stamp bumped after it.
 *
 * The steps after the read are stubbed: only the read and its write are
 * under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import prisma from "../../prisma/singleton.js";
import { bumpLibrary } from "../../services/LibraryStamp.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  type SyncRunContext,
  stashSyncService,
} from "../../services/StashSyncService.js";
import { SyncChangeSet } from "../../services/SyncChangeSet.js";
import { dbWrite } from "../../utils/dbWrite.js";
import type * as dbWriteModule from "../../utils/dbWrite.js";
import { _resetLogThrottleForTesting } from "../../utils/logThrottle.js";
import { logger } from "../../utils/logger.js";
import { objectContaining } from "../helpers/matchers.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: { get: vi.fn() },
}));

vi.mock("../../services/LibraryStamp.js", () => ({ bumpLibrary: vi.fn() }));

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
vi.mock("../../services/ClipPreviewProber.js", () => ({
  clipPreviewProber: {},
}));

// The writer queue runs for real; the spy records the units sync enqueues
vi.mock("../../utils/dbWrite.js", async (importOriginal) => {
  const actual = await importOriginal<typeof dbWriteModule>();
  return { ...actual, dbWrite: vi.fn(actual.dbWrite) };
});

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockDbWrite = vi.mocked(dbWrite);
const mockGet = vi.mocked(stashInstanceManager.get);
const mockBump = vi.mocked(bumpLibrary);

const INSTANCE = "inst-a";

const client = {
  configurationUi: vi.fn<StashClient["configurationUi"]>(),
  withSignal: vi.fn(),
};

/** The Stash answer: the saved UI settings, `ui` a JSON map. */
function stashUi(ui: unknown): void {
  client.configurationUi.mockResolvedValue({
    configuration: { ui },
  } as Awaited<ReturnType<StashClient["configurationUi"]>>);
}

/** The address Peek holds for the instance when the sync starts */
const STASH_URL = "http://stash.test:9999/graphql";

/** The value Peek stored at the last sync. */
function stored(value: string | null): void {
  mockPrisma.stashInstance.findUnique.mockResolvedValue(
    partialRow({ stashVrTag: value, url: STASH_URL })
  );
}

function newRun(): SyncRunContext {
  return {
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  };
}

/** Writes the VR tag unit made (dbWrite labels), in order. */
function vrTagWrites(): number {
  return mockDbWrite.mock.calls.filter(([label]) => label === "sync.vrTag")
    .length;
}

type Step = () => Promise<unknown>;

/** A private step of the service, spied on. */
function spyStep(name: string) {
  return vi.spyOn(stashSyncService as unknown as Record<string, Step>, name);
}

/** The entity-type step, stubbed; the other steps after the read follow. */
let types: ReturnType<typeof spyStep>;

/** Everything after the read, stubbed: eight types, then the rest. */
function stubSteps(): void {
  types = spyStep("syncEntityType").mockResolvedValue({});
  spyStep("cleanupEveryType").mockResolvedValue(new Set());
  spyStep("refetchLinkedToDeleted").mockResolvedValue(undefined);
  spyStep("refetchGalleryMembers").mockResolvedValue(undefined);
  spyStep("syncGroupRelations").mockResolvedValue(undefined);
}

async function syncOnce(mode: "full" | "incremental" = "incremental") {
  return stashSyncService["syncInstance"](INSTANCE, mode, newRun());
}

describe("StashSyncService: the VR tag read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetLogThrottleForTesting();
    client.withSignal.mockReturnValue(client);
    mockGet.mockReturnValue(untypedClient());
    mockPrisma.stashInstance.updateMany.mockResolvedValue({ count: 1 });
    stored(null);
    stubSteps();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function untypedClient(): StashClient {
    return client as unknown as StashClient;
  }

  it("stores ui.vrTag trimmed in stashVrTag through dbWrite", async () => {
    stashUi({ vrTag: "  VR  ", other: "kept out of the log" });

    await syncOnce();

    expect(mockPrisma.stashInstance.updateMany).toHaveBeenCalledExactlyOnceWith(
      { where: { id: INSTANCE, url: STASH_URL }, data: { stashVrTag: "VR" } }
    );
    expect(vrTagWrites()).toBe(1);
  });

  it("writes only to the address it read from: the URL is read before Stash is asked", async () => {
    const order: string[] = [];
    mockPrisma.stashInstance.findUnique.mockImplementation((() => {
      order.push("url");
      return Promise.resolve(partialRow({ stashVrTag: null, url: STASH_URL }));
    }) as never);
    client.configurationUi.mockImplementation((() => {
      order.push("stash");
      return Promise.resolve({ configuration: { ui: { vrTag: "VR" } } });
    }) as never);

    await syncOnce();

    expect(order.slice(0, 2)).toEqual(["url", "stash"]);
    expect(mockPrisma.stashInstance.findUnique).toHaveBeenCalledWith(
      objectContaining({ select: objectContaining({ url: true }) })
    );
    expect(mockPrisma.stashInstance.updateMany).toHaveBeenCalledWith(
      objectContaining({ where: { id: INSTANCE, url: STASH_URL } })
    );
  });

  it.each([
    ["an empty string", { vrTag: "" }],
    ["only spaces", { vrTag: "   " }],
    ["a missing vrTag", {}],
    ["a number", { vrTag: 7 }],
    ["an object", { vrTag: { name: "VR" } }],
    ["a ui that is not a map", "VR"],
    ["a null ui", null],
  ])("stores null for %s", async (_name, ui) => {
    stored("Old");
    stashUi(ui);

    await syncOnce();

    expect(mockPrisma.stashInstance.updateMany).toHaveBeenCalledExactlyOnceWith(
      { where: { id: INSTANCE, url: STASH_URL }, data: { stashVrTag: null } }
    );
  });

  it("writes once per sync, not once per type", async () => {
    stashUi({ vrTag: "VR" });

    await syncOnce("full");

    expect(types.mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(vrTagWrites()).toBe(1);
    expect(client.configurationUi).toHaveBeenCalledTimes(1);
  });

  it("reads before the first entity type", async () => {
    stashUi({ vrTag: "VR" });
    const order: string[] = [];
    client.configurationUi.mockImplementation(() => {
      order.push("read");
      return Promise.resolve({ configuration: { ui: { vrTag: "VR" } } });
    });
    types.mockImplementation(() => {
      order.push("type");
      return Promise.resolve({});
    });

    await syncOnce();

    expect(order[0]).toBe("read");
    expect(order[1]).toBe("type");
  });

  it("does not write when the value is unchanged", async () => {
    stored("VR");
    stashUi({ vrTag: " VR " });

    await syncOnce();

    expect(mockPrisma.stashInstance.updateMany).not.toHaveBeenCalled();
    expect(vrTagWrites()).toBe(0);
    expect(mockBump).not.toHaveBeenCalled();
  });

  it("does not write when nothing is stored and Stash has none", async () => {
    stored(null);
    stashUi({});

    await syncOnce();

    expect(vrTagWrites()).toBe(0);
    expect(mockBump).not.toHaveBeenCalled();
  });

  it("bumps the library stamp after a changed value is written", async () => {
    stored("Old");
    stashUi({ vrTag: "VR" });
    const order: string[] = [];
    mockPrisma.stashInstance.updateMany.mockImplementation((() => {
      order.push("write");
      return Promise.resolve({ count: 1 });
    }) as never);
    mockBump.mockImplementation(() => {
      order.push("bump");
    });

    await syncOnce();

    expect(order).toEqual(["write", "bump"]);
  });

  it("keeps the stored value and lets the sync go on when the read fails", async () => {
    stored("VR");
    client.configurationUi.mockRejectedValue(new Error("connection refused"));

    await expect(syncOnce()).resolves.toBeDefined();

    expect(types).toHaveBeenCalled();
    expect(vrTagWrites()).toBe(0);
    expect(mockBump).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("VR tag"),
      objectContaining({ stashInstanceId: INSTANCE })
    );
  });

  it("warns about a failed read once per instance, not on every sync", async () => {
    client.configurationUi.mockRejectedValue(new Error("connection refused"));

    await syncOnce();
    await syncOnce();
    await syncOnce();

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("never logs the ui map", async () => {
    stashUi({ vrTag: "VR", secret: "SENTINEL-UI-SETTING" });
    await syncOnce();
    client.configurationUi.mockRejectedValue(new Error("boom"));
    _resetLogThrottleForTesting();
    await syncOnce();

    const logged = JSON.stringify(
      (["error", "warn", "info", "debug"] as const).map(
        (level) => vi.mocked(logger[level]).mock.calls
      )
    );
    expect(logged).not.toContain("SENTINEL-UI-SETTING");
  });

  it("an abort during the read still ends the sync as aborted", async () => {
    client.configurationUi.mockRejectedValue(new Error("Sync aborted"));

    await expect(syncOnce()).rejects.toThrow("Sync aborted");

    expect(types).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
