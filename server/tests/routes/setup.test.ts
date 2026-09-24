/**
 * HTTP tests for the setup routes (sweep item 7): the reset endpoint is gone,
 * create-admin signs the new admin in, the wizard's Stash routes need the
 * admin session once an admin or an instance exists, a connection test tells
 * only admins why it failed, and public setup POSTs are rate-limited.
 *
 * `setupRateLimiter` is module-level, so each test resets the module registry
 * and imports the router again for a fresh limiter, along with the mocked
 * prisma and StashClient that router uses.
 */
import type { UserRole } from "@prisma/client";
import {
  type MockedObject,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import { startTestApp } from "../helpers/httpTestApp.js";
import {
  type PrismaMock,
  partialRow,
  prismaImpl,
} from "../helpers/prismaMock.js";

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    stashInstance: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("../../graphql/StashClient.js", () => ({
  StashClient: vi.fn(),
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    reload: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    fullSync: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

type TestUser = { id: number; username: string; role: UserRole };
const ADMIN: TestUser = { id: 1, username: "admin", role: "ADMIN" };
const USER: TestUser = { id: 2, username: "viewer", role: "USER" };
const STASH_BODY = { url: "http://stash:9999/graphql", apiKey: "test-key" };

type Json = Record<string, unknown>;

describe("setup routes", () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let mockPrisma: PrismaMock;
  let MockStashClient: MockedObject<typeof StashClient>;
  let generateToken: (user: typeof ADMIN) => string;
  let verifyToken: (token: string) => { id: number; authTime?: number };
  let CONNECTION_TEST_FAILED: string;

  const post = (path: string, body: unknown, cookie?: string) =>
    fetch(`${baseUrl}/api/setup${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie && { Cookie: cookie }),
      },
      body: JSON.stringify(body),
    });

  const sessionFor = (user: typeof ADMIN) => `token=${generateToken(user)}`;

  const stashConnects = () =>
    MockStashClient.mockImplementation(() =>
      partialRow({
        configuration: vi
          .fn()
          .mockResolvedValue({ configuration: { general: {} } }),
        version: vi.fn().mockResolvedValue({ version: { version: "0.27.0" } }),
      })
    );

  const stashFails = (message: string) =>
    MockStashClient.mockImplementation(() =>
      partialRow({
        configuration: vi.fn().mockRejectedValue(new Error(message)),
        version: vi.fn(),
      })
    );

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { default: setupRoutes } = await import("../../routes/setup.js");
    mockPrisma = vi.mocked(
      (await import("../../prisma/singleton.js")).default,
      true
    );
    MockStashClient = vi.mocked(
      (await import("../../graphql/StashClient.js")).StashClient
    );
    ({ generateToken, verifyToken } = await import("../../middleware/auth.js"));
    ({ CONNECTION_TEST_FAILED } = await import("../../controllers/setup.js"));

    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.stashInstance.count.mockResolvedValue(0);
    mockPrisma.user.findUnique.mockImplementation(
      prismaImpl(({ where }) => {
        const user = [ADMIN, USER].find((u) => u.id === where.id);
        return user ? partialRow(user) : null;
      })
    );
    mockPrisma.stashInstance.create.mockResolvedValue(
      partialRow({
        id: "inst-1",
        name: "Default",
        url: STASH_BODY.url,
        uiUrl: null,
        enabled: true,
        createdAt: new Date(),
      })
    );
    stashConnects();

    ({ baseUrl, close } = await startTestApp((app) => {
      app.use("/api/setup", setupRoutes);
    }));
  });

  afterEach(async () => {
    await close();
  });

  it("POST /api/setup/reset is gone", async () => {
    const res = await post("/reset", {});

    expect(res.status).toBe(404);
  });

  it("create-admin signs the new admin in", async () => {
    mockPrisma.user.create.mockResolvedValue(
      partialRow({
        ...ADMIN,
        createdAt: new Date(),
      })
    );

    const res = await post("/create-admin", {
      username: "admin",
      password: "securepass1",
    });

    expect(res.status).toBe(201);
    const token = res.headers.get("set-cookie")?.match(/token=([^;]+)/)?.[1];
    expect(token).toBeDefined();
    const claims = verifyToken(token!);
    expect(claims.id).toBe(1);
    expect(claims.authTime).toEqual(expect.any(Number));
  });

  it("before any user or instance exists, an anonymous connection test gets pass or fail only", async () => {
    stashFails("ECONNREFUSED");
    const failed = await post("/test-stash-connection", STASH_BODY);
    const failedBody = (await failed.json()) as Json;

    expect(failed.status).toBe(400);
    expect(failedBody).toEqual({
      success: false,
      error: CONNECTION_TEST_FAILED,
    });
    expect(failedBody.details).toBeUndefined();
    expect(JSON.stringify(failedBody)).not.toContain("Connection refused");

    stashConnects();
    const passed = await post("/test-stash-connection", STASH_BODY);

    expect(passed.status).toBe(200);
    expect(await passed.json()).toEqual({
      success: true,
      message: "Connection successful",
    });
  });

  it("once the admin exists, test-stash-connection and create-stash-instance need an admin session", async () => {
    mockPrisma.user.count.mockResolvedValue(1);

    const test = await post("/test-stash-connection", STASH_BODY);
    const create = await post("/create-stash-instance", STASH_BODY);

    expect(test.status).toBe(401);
    expect(create.status).toBe(401);
    expect(mockPrisma.stashInstance.create).not.toHaveBeenCalled();
  });

  it("a USER session gets 403 from both Stash setup routes", async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    const cookie = sessionFor(USER);

    const test = await post("/test-stash-connection", STASH_BODY, cookie);
    const create = await post("/create-stash-instance", STASH_BODY, cookie);

    expect(test.status).toBe(403);
    expect(create.status).toBe(403);
    expect(mockPrisma.stashInstance.create).not.toHaveBeenCalled();
  });

  it("an admin session gets the connection error reason without details, and can add the first instance", async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    const cookie = sessionFor(ADMIN);

    stashFails("ECONNREFUSED");
    const test = await post("/test-stash-connection", STASH_BODY, cookie);
    const testBody = (await test.json()) as Json;

    expect(test.status).toBe(400);
    expect(testBody).toEqual({
      success: false,
      error: "Connection refused. Is Stash running?",
    });

    const create = await post("/create-stash-instance", STASH_BODY, cookie);
    expect(create.status).toBe(201);
  });

  describe("with the connection check on", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("create-stash-instance hides the connection error text", async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      stashFails("connect ECONNREFUSED 10.0.0.5:9000");

      const res = await post(
        "/create-stash-instance",
        STASH_BODY,
        sessionFor(ADMIN)
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Could not connect to Stash server",
      });
      expect(mockPrisma.stashInstance.create).not.toHaveBeenCalled();
    });
  });

  it("anonymous setup POSTs are rate-limited", async () => {
    // An admin exists, so every create-admin is a failed (403) attempt
    mockPrisma.user.count.mockResolvedValue(1);
    const attempt = () =>
      post("/create-admin", { username: "admin", password: "securepass1" });

    for (let i = 0; i < 20; i++) {
      const res = await attempt();
      await res.text();
      expect(res.status).toBe(403);
    }

    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Too many setup attempts, please try again later",
    });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});
