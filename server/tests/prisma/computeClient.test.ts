/**
 * Unit tests for the single-connection compute client: the URL it builds from
 * DATABASE_URL, lazy creation with its PRAGMAs, retry after a failed start,
 * and disconnect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disconnectComputeClient,
  getComputeClient,
  singleConnectionUrl,
} from "../../prisma/computeClient.js";

const { PrismaClientMock, instances } = vi.hoisted(() => {
  const instances: Array<{
    options: unknown;
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
    $disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const PrismaClientMock = vi.fn(function (options: unknown) {
    const client = {
      options,
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    instances.push(client);
    return client;
  });
  return { PrismaClientMock, instances };
});

vi.mock("@prisma/client", () => ({ PrismaClient: PrismaClientMock }));

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
    expect(instances[0].$queryRawUnsafe.mock.calls).toEqual([
      ["PRAGMA busy_timeout = 5000"],
      ["PRAGMA temp_store = MEMORY"],
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
        $disconnect: vi.fn().mockResolvedValue(undefined),
      };
      instances.push(client);
      return client;
    });

    await expect(getComputeClient()).rejects.toThrow("locked");
    expect(instances[0].$disconnect).toHaveBeenCalledTimes(1);

    await expect(getComputeClient()).resolves.toBe(instances[1]);
  });

  it("disconnect closes the client and the next call opens a new one", async () => {
    const first = await getComputeClient();

    await disconnectComputeClient();

    expect(instances[0].$disconnect).toHaveBeenCalledTimes(1);
    const second = await getComputeClient();
    expect(second).not.toBe(first);
    expect(PrismaClientMock).toHaveBeenCalledTimes(2);
  });

  it("disconnect is a no-op when no client was created", async () => {
    await disconnectComputeClient();

    expect(PrismaClientMock).not.toHaveBeenCalled();
  });
});
