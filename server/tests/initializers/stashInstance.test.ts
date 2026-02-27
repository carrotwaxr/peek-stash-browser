/**
 * Unit Tests for initializeStashInstances
 *
 * Tests the startup initializer that checks for existing Stash instance configs
 * and migrates from environment variables when needed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashInstance: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import prisma from "../../prisma/singleton.js";
import { initializeStashInstances } from "../../initializers/stashInstance.js";

const mockPrisma = vi.mocked(prisma);

describe("initializeStashInstances", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    process.env = { ...originalEnv };
    delete process.env.STASH_URL;
    delete process.env.STASH_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns database source when instances exist in DB", async () => {
    mockPrisma.stashInstance.count.mockResolvedValue(2);

    const result = await initializeStashInstances();

    expect(result).toEqual({
      needsSetup: false,
      source: "database",
      instanceCount: 2,
    });
    expect(mockPrisma.stashInstance.create).not.toHaveBeenCalled();
  });

  it("migrates from env vars when no DB instances but env vars are set", async () => {
    mockPrisma.stashInstance.count.mockResolvedValue(0);
    mockPrisma.stashInstance.create.mockResolvedValue({
      id: "migrated-1",
      name: "Default",
    } as any);

    process.env.STASH_URL = "http://stash:9999/graphql";
    process.env.STASH_API_KEY = "test-key";

    const result = await initializeStashInstances();

    expect(result).toEqual({
      needsSetup: false,
      source: "environment",
      instanceCount: 1,
    });
    expect(mockPrisma.stashInstance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Default",
        url: "http://stash:9999/graphql",
        apiKey: "test-key",
        enabled: true,
        priority: 0,
      }),
    });
  });

  it("returns needsSetup when no DB instances and no env vars", async () => {
    mockPrisma.stashInstance.count.mockResolvedValue(0);

    const result = await initializeStashInstances();

    expect(result).toEqual({
      needsSetup: true,
      source: null,
      instanceCount: 0,
    });
  });

  it("returns needsSetup when only STASH_URL is set (no API key)", async () => {
    mockPrisma.stashInstance.count.mockResolvedValue(0);
    process.env.STASH_URL = "http://stash:9999/graphql";

    const result = await initializeStashInstances();

    expect(result.needsSetup).toBe(true);
    expect(result.source).toBeNull();
  });

  it("returns needsSetup when only STASH_API_KEY is set (no URL)", async () => {
    mockPrisma.stashInstance.count.mockResolvedValue(0);
    process.env.STASH_API_KEY = "test-key";

    const result = await initializeStashInstances();

    expect(result.needsSetup).toBe(true);
    expect(result.source).toBeNull();
  });

  it("falls through to needsSetup when env var URL is invalid", async () => {
    mockPrisma.stashInstance.count.mockResolvedValue(0);
    process.env.STASH_URL = "not-a-valid-url";
    process.env.STASH_API_KEY = "test-key";

    const result = await initializeStashInstances();

    expect(result.needsSetup).toBe(true);
    expect(result.source).toBeNull();
  });
});
