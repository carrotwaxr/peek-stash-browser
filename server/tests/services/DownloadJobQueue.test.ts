import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type BuildZip,
  DownloadJobQueue,
  downloadJobQueue,
  recoverPendingDownloads,
} from "../../services/DownloadJobQueue.js";
import { zipPath } from "../../utils/downloadPaths.js";
import { logger } from "../../utils/logger.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** One build the queue started, settled when the test says */
interface Build {
  id: number;
  signal: AbortSignal;
  finish: () => void;
  fail: (error: Error) => void;
}

/** A build function whose promises the test settles, and its calls */
function fakeBuilds(): { build: BuildZip; builds: Build[] } {
  const builds: Build[] = [];
  const build: BuildZip = (id, signal) =>
    new Promise<void>((resolve, reject) => {
      builds.push({ id, signal, finish: resolve, fail: reject });
    });
  return { build, builds };
}

/** Lets the queue run what it can */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** The ids built so far, in order */
function ids(builds: Build[]): number[] {
  return builds.map((b) => b.id);
}

describe("DownloadJobQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs one build at a time, in the order enqueued", async () => {
    const { build, builds } = fakeBuilds();
    const queue = new DownloadJobQueue(build);

    queue.enqueue(1, 5);
    queue.enqueue(2, 6);
    queue.enqueue(3, 5);
    await flush();
    expect(ids(builds)).toEqual([1]);

    must(builds[0]).finish();
    await flush();
    expect(ids(builds)).toEqual([1, 2]);

    must(builds[1]).finish();
    await flush();
    expect(ids(builds)).toEqual([1, 2, 3]);

    must(builds[2]).finish();
    await queue.whenIdle();
    expect(queue.isActive(3)).toBe(false);
  });

  it("enqueueing an id already queued or running does nothing", async () => {
    const { build, builds } = fakeBuilds();
    const queue = new DownloadJobQueue(build);

    queue.enqueue(1, 5);
    queue.enqueue(2, 5);
    await flush();
    queue.enqueue(1, 5);
    queue.enqueue(2, 5);
    expect(queue.isActive(1)).toBe(true);
    expect(queue.isActive(2)).toBe(true);

    must(builds[0]).finish();
    await flush();
    must(builds[1]).finish();
    await queue.whenIdle();

    expect(ids(builds)).toEqual([1, 2]);
  });

  it("cancel removes a queued id without building it", async () => {
    const { build, builds } = fakeBuilds();
    const queue = new DownloadJobQueue(build);

    queue.enqueue(1, 5);
    queue.enqueue(2, 5);
    await flush();
    await queue.cancel(2);
    expect(queue.isActive(2)).toBe(false);

    must(builds[0]).finish();
    await queue.whenIdle();

    expect(ids(builds)).toEqual([1]);
  });

  it("cancel aborts a running build with reason 'cancelled' and resolves after it settles", async () => {
    const { build, builds } = fakeBuilds();
    const queue = new DownloadJobQueue(build);
    queue.enqueue(1, 5);
    await flush();
    const running = must(builds[0]);

    let cancelled = false;
    const cancel = queue.cancel(1).then(() => {
      cancelled = true;
    });
    await flush();

    expect(running.signal.aborted).toBe(true);
    expect(running.signal.reason).toBe("cancelled");
    expect(cancelled).toBe(false);

    running.finish();
    await cancel;
    expect(queue.isActive(1)).toBe(false);
  });

  it("cancelUser cancels that user's queued and running ids only", async () => {
    const { build, builds } = fakeBuilds();
    const queue = new DownloadJobQueue(build);
    queue.enqueue(1, 5);
    queue.enqueue(2, 6);
    queue.enqueue(3, 5);
    await flush();

    const cancel = queue.cancelUser(5);
    await flush();
    expect(must(builds[0]).signal.reason).toBe("cancelled");
    must(builds[0]).finish();
    await cancel;
    await flush();

    expect(ids(builds)).toEqual([1, 2]);
    expect(must(builds[1]).signal.aborted).toBe(false);
    expect(queue.isActive(3)).toBe(false);
    must(builds[1]).finish();
    await queue.whenIdle();
  });

  it("stop aborts the running build with reason 'shutdown' and starts no more", async () => {
    const { build, builds } = fakeBuilds();
    const queue = new DownloadJobQueue(build);
    queue.enqueue(1, 5);
    queue.enqueue(2, 5);
    await flush();

    const stop = queue.stop();
    await flush();
    expect(must(builds[0]).signal.reason).toBe("shutdown");
    must(builds[0]).finish();
    await stop;
    queue.enqueue(4, 5);
    await flush();

    expect(ids(builds)).toEqual([1]);
    expect(queue.isActive(2)).toBe(false);
    expect(queue.isActive(4)).toBe(false);
  });

  it("a build that throws is logged and the next one runs", async () => {
    const { build, builds } = fakeBuilds();
    const queue = new DownloadJobQueue(build);
    queue.enqueue(1, 5);
    queue.enqueue(2, 5);
    await flush();

    must(builds[0]).fail(new Error("boom"));
    await flush();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(ids(builds)).toEqual([1, 2]);
    must(builds[1]).finish();
    await queue.whenIdle();
  });
});

describe("recoverPendingDownloads", () => {
  const previousConfigDir = process.env.CONFIG_DIR;
  const mockPrisma = vi.mocked(prisma, true);
  let configDir: string;
  let enqueue: MockInstance<DownloadJobQueue["enqueue"]>;
  let isActive: MockInstance<DownloadJobQueue["isActive"]>;

  beforeEach(() => {
    vi.clearAllMocks();
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-recover-"));
    process.env.CONFIG_DIR = configDir;
    // The real queue would start building: only what recovery asks matters
    enqueue = vi
      .spyOn(downloadJobQueue, "enqueue")
      .mockImplementation(() => {});
    isActive = vi.spyOn(downloadJobQueue, "isActive").mockReturnValue(false);
    mockPrisma.download.findMany.mockResolvedValue([]);
    mockPrisma.download.updateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    enqueue.mockRestore();
    isActive.mockRestore();
    if (previousConfigDir === undefined) delete process.env.CONFIG_DIR;
    else process.env.CONFIG_DIR = previousConfigDir;
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  /** A partial zip a killed build left for the user's download */
  function writePartial(userId: number, downloadId: number): string {
    const file = zipPath(userId, downloadId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "partial");
    return file;
  }

  it("does nothing when no zip was interrupted", async () => {
    await recoverPendingDownloads();

    expect(mockPrisma.download.updateMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("reads the PENDING and PROCESSING playlist zips, oldest first", async () => {
    await recoverPendingDownloads();

    expect(mockPrisma.download.findMany).toHaveBeenCalledWith({
      where: { type: "PLAYLIST", status: { in: ["PENDING", "PROCESSING"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true },
    });
  });

  it("puts the rows back to PENDING at 0%, removes each partial file and queues them in the order read", async () => {
    mockPrisma.download.findMany.mockResolvedValue([
      partialRow({ id: 8, userId: 2 }),
      partialRow({ id: 3, userId: 1 }),
      partialRow({ id: 5, userId: 2 }),
    ]);
    const partial8 = writePartial(2, 8);
    const partial3 = writePartial(1, 3);
    // Id 5 never started writing: no file to remove

    await recoverPendingDownloads();

    expect(mockPrisma.download.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [8, 3, 5] },
        status: { in: ["PENDING", "PROCESSING"] },
      },
      data: { status: "PENDING", progress: 0 },
    });
    expect(fs.existsSync(partial8)).toBe(false);
    expect(fs.existsSync(partial3)).toBe(false);
    expect(enqueue.mock.calls).toEqual([
      [8, 2],
      [3, 1],
      [5, 2],
    ]);
  });

  it("leaves alone a zip the queue already holds: no reset, no file removed, not queued again", async () => {
    mockPrisma.download.findMany.mockResolvedValue([
      partialRow({ id: 1, userId: 1 }),
      partialRow({ id: 2, userId: 1 }),
    ]);
    isActive.mockImplementation((id) => id === 1);
    const held = writePartial(1, 1);
    const stale = writePartial(1, 2);

    await recoverPendingDownloads();

    expect(mockPrisma.download.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [2] }, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "PENDING", progress: 0 },
    });
    expect(fs.existsSync(held)).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
    expect(enqueue.mock.calls).toEqual([[2, 1]]);
  });

  it("writes nothing when the queue holds every one of them", async () => {
    mockPrisma.download.findMany.mockResolvedValue([
      partialRow({ id: 1, userId: 1 }),
    ]);
    isActive.mockReturnValue(true);

    await recoverPendingDownloads();

    expect(mockPrisma.download.updateMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("a zip queued while the rows were being reset keeps its file and is not queued again", async () => {
    mockPrisma.download.findMany.mockResolvedValue([
      partialRow({ id: 1, userId: 1 }),
      partialRow({ id: 2, userId: 1 }),
    ]);
    // Two reads in the filter, then the recheck before each file
    isActive
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const racing = writePartial(1, 1);
    const stale = writePartial(1, 2);

    await recoverPendingDownloads();

    expect(fs.existsSync(racing)).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
    expect(enqueue.mock.calls).toEqual([[2, 1]]);
  });

  it("a partial file that cannot be removed is logged and the zip is still queued", async () => {
    mockPrisma.download.findMany.mockResolvedValue([
      partialRow({ id: 4, userId: 1 }),
    ]);
    // A directory where the file belongs: unlink refuses it
    fs.mkdirSync(zipPath(1, 4), { recursive: true });

    await recoverPendingDownloads();

    expect(logger.warn).toHaveBeenCalledWith(
      "Could not remove an interrupted zip's partial file",
      expect.objectContaining({ downloadId: 4 })
    );
    expect(enqueue.mock.calls).toEqual([[4, 1]]);
  });
});
