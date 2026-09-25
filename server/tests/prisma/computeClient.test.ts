/**
 * Unit tests for the single-connection compute client: the URL it builds from
 * DATABASE_URL, lazy creation with its PRAGMAs, retry after a failed start,
 * disconnect, the one-caller-at-a-time connection and the read snapshot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disconnectComputeClient,
  getComputeClient,
  readSnapshot,
  singleConnectionUrl,
  withComputeConnection,
} from "../../prisma/computeClient.js";
import { must } from "../helpers/must.js";

const { PrismaClientMock, instances } = vi.hoisted(() => {
  const instances: Array<{
    options: unknown;
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
    $executeRawUnsafe: ReturnType<typeof vi.fn>;
    $disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const PrismaClientMock = vi.fn(function (options: unknown) {
    const client = {
      options,
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    instances.push(client);
    return client;
  });
  return { PrismaClientMock, instances };
});

vi.mock("@prisma/client", () => ({ PrismaClient: PrismaClientMock }));

/** The statements the first client ran, in order. */
function statements(): string[] {
  return must(instances[0]).$executeRawUnsafe.mock.calls.map(
    (call: unknown[]) => String(call[0])
  );
}

vi.mock("../../utils/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("singleConnectionUrl", () => {
  it("adds connection_limit=1 with ? when the URL has no query", () => {
    expect(singleConnectionUrl("file:/data/peek.db")).toBe(
      "file:/data/peek.db?connection_limit=1"
    );
  });

  it("appends with & when the URL has a query", () => {
    expect(singleConnectionUrl("file:./test.db?socket_timeout=10")).toBe(
      "file:./test.db?socket_timeout=10&connection_limit=1"
    );
  });

  it("replaces a connection_limit already set", () => {
    expect(
      singleConnectionUrl("file:/data/peek.db?connection_limit=5&x=1")
    ).toBe("file:/data/peek.db?x=1&connection_limit=1");
  });
});

describe("getComputeClient", () => {
  beforeEach(() => {
    PrismaClientMock.mockClear();
    instances.length = 0;
    vi.stubEnv("DATABASE_URL", "file:/data/peek.db");
  });

  afterEach(async () => {
    await disconnectComputeClient();
    vi.unstubAllEnvs();
  });

  it("creates one client for concurrent callers, on one connection, with its PRAGMAs set once", async () => {
    const [a, b] = await Promise.all([getComputeClient(), getComputeClient()]);

    expect(a).toBe(b);
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    expect(PrismaClientMock).toHaveBeenCalledWith({
      datasourceUrl: "file:/data/peek.db?connection_limit=1",
    });
    expect(must(instances[0]).$queryRawUnsafe.mock.calls).toEqual([
      ["PRAGMA busy_timeout = 5000"],
      ["PRAGMA temp_store = MEMORY"],
      ["PRAGMA cache_size = -64000"],
      ["PRAGMA synchronous = NORMAL"],
    ]);
  });

  it("reads DATABASE_URL at first use, not at import", async () => {
    vi.stubEnv("DATABASE_URL", "file:/set/at/runtime.db");

    await getComputeClient();

    expect(PrismaClientMock).toHaveBeenCalledWith({
      datasourceUrl: "file:/set/at/runtime.db?connection_limit=1",
    });
  });

  it("fails without DATABASE_URL and retries on the next call", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(getComputeClient()).rejects.toThrow("DATABASE_URL is not set");

    vi.stubEnv("DATABASE_URL", "file:/data/peek.db");
    await expect(getComputeClient()).resolves.toBe(instances[0]);
  });

  it("disconnects a client whose PRAGMAs fail and retries on the next call", async () => {
    PrismaClientMock.mockImplementationOnce(function (options: unknown) {
      const client = {
        options,
        $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("locked")),
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
        $disconnect: vi.fn().mockResolvedValue(undefined),
      };
      instances.push(client);
      return client;
    });

    await expect(getComputeClient()).rejects.toThrow("locked");
    expect(must(instances[0]).$disconnect).toHaveBeenCalledTimes(1);

    await expect(getComputeClient()).resolves.toBe(instances[1]);
  });

  it("disconnect closes the client and the next call opens a new one", async () => {
    const first = await getComputeClient();

    await disconnectComputeClient();

    expect(must(instances[0]).$disconnect).toHaveBeenCalledTimes(1);
    const second = await getComputeClient();
    expect(second).not.toBe(first);
    expect(PrismaClientMock).toHaveBeenCalledTimes(2);
  });

  it("disconnect is a no-op when no client was created", async () => {
    await disconnectComputeClient();

    expect(PrismaClientMock).not.toHaveBeenCalled();
  });
});

describe("withComputeConnection", () => {
  beforeEach(() => {
    PrismaClientMock.mockClear();
    instances.length = 0;
    vi.stubEnv("DATABASE_URL", "file:/data/peek.db");
  });

  afterEach(async () => {
    await disconnectComputeClient();
    vi.unstubAllEnvs();
  });

  it("runs callers one at a time on the single client", async () => {
    // The TEMP namespace is shared on the one connection, so the second
    // caller must not start until the first has returned.
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocker = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withComputeConnection(async (db) => {
      events.push("first-start");
      await firstBlocker;
      events.push("first-end");
      return db;
    });
    const second = withComputeConnection((db) => {
      events.push("second-start");
      return Promise.resolve(db);
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events).toEqual(["first-start"]);

    releaseFirst();
    const [a, b] = await Promise.all([first, second]);

    expect(events).toEqual(["first-start", "first-end", "second-start"]);
    expect(a).toBe(b);
    expect(PrismaClientMock).toHaveBeenCalledTimes(1);
  });

  it("releases the connection when the caller throws", async () => {
    await expect(
      withComputeConnection(() => Promise.reject(new Error("compute failed")))
    ).rejects.toThrow("compute failed");

    await expect(
      withComputeConnection((db) => Promise.resolve(db))
    ).resolves.toBeDefined();
  });
});

describe("readSnapshot", () => {
  beforeEach(() => {
    PrismaClientMock.mockClear();
    instances.length = 0;
    vi.stubEnv("DATABASE_URL", "file:/data/peek.db");
  });

  afterEach(async () => {
    await disconnectComputeClient();
    vi.unstubAllEnvs();
  });

  it("opens with BEGIN and ends with COMMIT, so TEMP tables created inside survive", async () => {
    const db = await getComputeClient();

    const result = await readSnapshot(db, async () => {
      await db.$executeRawUnsafe("CREATE TEMP TABLE _peek_x (id TEXT)");
      return 42;
    });

    expect(result).toBe(42);
    // A bare BEGIN is deferred: no write lock. ROLLBACK would drop the TEMP
    // table the body created, so the snapshot ends with COMMIT.
    expect(statements()).toEqual([
      "BEGIN",
      "CREATE TEMP TABLE _peek_x (id TEXT)",
      "COMMIT",
    ]);
    expect(must(instances[0]).$disconnect).not.toHaveBeenCalled();
  });

  it("rolls back when the body throws and keeps the connection", async () => {
    const db = await getComputeClient();

    await expect(
      readSnapshot(db, () => Promise.reject(new Error("DB read error")))
    ).rejects.toThrow("DB read error");

    expect(statements()).toEqual(["BEGIN", "ROLLBACK"]);
    expect(must(instances[0]).$disconnect).not.toHaveBeenCalled();
    // The next snapshot opens on the same client
    await expect(getComputeClient()).resolves.toBe(db);
  });

  it("drops the connection when the rollback itself fails, so the next call reconnects", async () => {
    const db = await getComputeClient();
    const exec = must(instances[0]).$executeRawUnsafe;
    exec.mockImplementation((sql: string) =>
      sql === "ROLLBACK"
        ? Promise.reject(new Error("cannot rollback"))
        : Promise.resolve(0)
    );

    // The body's own error is the one reported
    await expect(
      readSnapshot(db, () => Promise.reject(new Error("DB read error")))
    ).rejects.toThrow("DB read error");

    expect(must(instances[0]).$disconnect).toHaveBeenCalledTimes(1);
    const next = await getComputeClient();
    expect(next).not.toBe(db);
    expect(PrismaClientMock).toHaveBeenCalledTimes(2);
  });

  it("a failed COMMIT rolls back and rethrows", async () => {
    const db = await getComputeClient();
    const exec = must(instances[0]).$executeRawUnsafe;
    exec.mockImplementation((sql: string) =>
      sql === "COMMIT"
        ? Promise.reject(new Error("commit failed"))
        : Promise.resolve(0)
    );

    await expect(readSnapshot(db, () => Promise.resolve(1))).rejects.toThrow(
      "commit failed"
    );

    expect(statements()).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]);
    expect(must(instances[0]).$disconnect).not.toHaveBeenCalled();
  });
});
