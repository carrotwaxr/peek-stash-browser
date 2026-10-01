import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BuildZip,
  DownloadJobQueue,
} from "../../services/DownloadJobQueue.js";
import { logger } from "../../utils/logger.js";
import { must } from "../helpers/must.js";

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
