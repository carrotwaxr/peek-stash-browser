import bcrypt from "bcryptjs";
import { execFileSync } from "child_process";
import { rmSync } from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import {
  type Mock,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  authenticate,
  generateToken,
  verifyToken,
} from "../../middleware/auth.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { authenticateStreamRequest } from "../../middleware/streamAuth.js";
import prisma from "../../prisma/singleton.js";
import authRoutes from "../../routes/auth.js";
import plexRoutes from "../../routes/plexAuth.js";
import { setUserPassword } from "../../services/PasswordService.js";
import {
  cancelPlexFlow,
  plexAccessAllowed,
  plexConfig,
  pollPlexFlow,
  startPlexFlow,
} from "../../services/PlexAuthService.js";
import { setPlexEnabled } from "../../services/PlexSettings.js";
import {
  getStreamLinkKey,
  signStreamLink,
  signedQuery,
} from "../../utils/streamLink.js";
import { startTestApp } from "../helpers/httpTestApp.js";
import { must } from "../helpers/must.js";

const database = vi.hoisted(async () => {
  const fs = await import("fs");
  const os = await import("os");
  const p = await import("path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "peek-plex-test-"));
  fs.writeFileSync(p.join(dir, "test.db"), "");
  return { dir, url: `file:${p.join(dir, "test.db").replace(/\\/g, "/")}` };
});
vi.mock("../../prisma/singleton.js", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return {
    default: new PrismaClient({
      datasources: { db: { url: (await database).url } },
    }),
  };
});
vi.mock("../../services/RankingComputeService.js", () => ({
  default: { ensureFresh: vi.fn() },
}));

const realFetch = globalThis.fetch;
let claimed = true;
let validToken = true;
let accountId = 12345;
let expiresAt: string | undefined;
let pinId = 0;
let upstream: Mock<
  (input: string | URL | Request, init?: RequestInit) => Promise<Response>
>;
let app: Awaited<ReturnType<typeof startTestApp>>;

beforeAll(async () => {
  execFileSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: (await database).url },
      stdio: "pipe",
      timeout: 60000,
    }
  );
  app = await startTestApp((server) => {
    server.use("/api/auth/plex", plexRoutes);
    server.use("/api/auth", authRoutes);
    server.get("/protected", authenticate, (_req, res) =>
      res.json({ ok: true })
    );
    server.get(
      "/stream/:sceneId/:streamPath",
      authenticateStreamRequest,
      (_req, res) => res.json({ ok: true })
    );
    server.use(errorHandler);
  });
}, 70000);

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubEnv("CONFIG_DIR", (await database).dir);
  rmSync(path.join((await database).dir, "plex-settings.json"), {
    force: true,
  });
  vi.stubEnv("PLEX_AUTH_ENABLED", "true");
  vi.stubEnv("PLEX_CLIENT_IDENTIFIER", "unit-test-client");
  vi.stubEnv("PLEX_PUBLIC_URL", "http://localhost:6969");
  vi.stubEnv("SECURE_COOKIES", "false");
  await prisma.plexConnection.deleteMany();
  await prisma.plexIdentity.deleteMany();
  await prisma.user.deleteMany();
  claimed = true;
  validToken = true;
  accountId = 12345;
  expiresAt = undefined;
  upstream = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!url.startsWith("https://plex.tv/api/v2/"))
        return realFetch(input, init);
      if (url.endsWith("/pins"))
        return Response.json({
          id: ++pinId,
          code: "temporary-code",
          ...(expiresAt ? { expiresAt } : {}),
        });
      if (url.includes("/pins/"))
        return Response.json({
          authToken: claimed ? "sensitive-plex-token" : null,
        });
      if (url.endsWith("/user"))
        return validToken
          ? Response.json({
              id: accountId,
              username: "same-as-local",
              email: "same@example.test",
            })
          : new Response("sensitive upstream body", { status: 401 });
      throw new Error("Unexpected upstream request");
    }
  );
  vi.stubGlobal("fetch", upstream);
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.stubEnv("CONFIG_DIR", (await database).dir);
  rmSync(path.join((await database).dir, "plex-settings.json"), {
    force: true,
  });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await app.close();
  await prisma.$disconnect();
  rmSync((await database).dir, { recursive: true, force: true });
});

async function approve() {
  await prisma.plexIdentity.create({
    data: { accountId: String(accountId), approved: true },
  });
}
async function flow(binding = "browser-secret") {
  return startPlexFlow(binding);
}
async function post(
  route: string,
  body: unknown,
  cookie?: string,
  origin = app.baseUrl
) {
  return realFetch(`${app.baseUrl}/api/auth${route}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("Plex authentication with real migrated SQLite and mocked Plex", () => {
  it("supports persisted UI settings without a public URL and preserves the identifier", async () => {
    const clientId = plexConfig()?.clientId;
    setPlexEnabled(false);
    expect(plexConfig()).toBeNull();
    await expect(flow()).rejects.toThrow("disabled");
    vi.stubEnv("PLEX_AUTH_ENABLED", "false");
    vi.stubEnv("PLEX_PUBLIC_URL", "");
    setPlexEnabled(true);
    expect(plexConfig()?.clientId).toBe(clientId);
    expect((await flow()).authorizationUrl).toContain(
      "clientID=unit-test-client"
    );
  });

  it("creates one non-admin profile, validates the token in a header and reuses the profile", async () => {
    await approve();
    const first = await flow();
    expect(first.authorizationUrl).toMatch(/^https:\/\/app.plex.tv\/auth#\?/);
    const result = await pollPlexFlow(first.correlationId, "browser-secret");
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("not completed");
    expect(result.user.role).toBe("USER");
    expect(result.user.plexOnly).toBe(true);
    await prisma.user.update({
      where: { id: result.user.id },
      data: { theme: "purple" },
    });
    const next = await flow();
    const repeated = await pollPlexFlow(next.correlationId, "browser-secret");
    expect(repeated.status === "complete" && repeated.user.id).toBe(
      result.user.id
    );
    expect(repeated.status === "complete" && repeated.user.theme).toBe(
      "purple"
    );
    expect(await prisma.user.count()).toBe(1);
    const call = upstream.mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/user")
    );
    expect(new Headers(must(call)[1]?.headers).get("X-Plex-Token")).toBe(
      "sensitive-plex-token"
    );
    expect(JSON.stringify(first)).not.toContain("sensitive-plex-token");
    expect(JSON.stringify(await prisma.plexIdentity.findMany())).not.toContain(
      "sensitive-plex-token"
    );
  });

  it("denies unapproved users without creating accounts and never links by name", async () => {
    await prisma.user.create({
      data: { username: "same-as-local", password: "hash" },
    });
    const denied = await flow();
    await expect(
      pollPlexFlow(denied.correlationId, "browser-secret")
    ).rejects.toThrow("12345 is not approved");
    expect(await prisma.user.count()).toBe(1);
    await approve();
    const allowed = await flow();
    await pollPlexFlow(allowed.correlationId, "browser-secret");
    expect(await prisma.user.count()).toBe(2);
  });

  it("rejects foreign browser bindings, replay, cancellation and expired PINs", async () => {
    await approve();
    const started = await flow();
    await expect(
      pollPlexFlow(started.correlationId, "another-browser")
    ).rejects.toThrow("Invalid");
    await pollPlexFlow(started.correlationId, "browser-secret");
    await expect(
      pollPlexFlow(started.correlationId, "browser-secret")
    ).rejects.toThrow("Invalid");
    const cancelled = await flow();
    cancelPlexFlow(cancelled.correlationId, "browser-secret");
    await expect(
      pollPlexFlow(cancelled.correlationId, "browser-secret")
    ).rejects.toThrow("Invalid");
    expiresAt = new Date(Date.now() - 1000).toISOString();
    const expired = await flow();
    await expect(
      pollPlexFlow(expired.correlationId, "browser-secret")
    ).rejects.toThrow("expired");
  });

  it("keeps pending PINs pending, throttles upstream polls and sanitizes token failures", async () => {
    claimed = false;
    const started = await flow();
    expect(await pollPlexFlow(started.correlationId, "browser-secret")).toEqual(
      { status: "pending" }
    );
    const count = upstream.mock.calls.length;
    await pollPlexFlow(started.correlationId, "browser-secret");
    expect(upstream.mock.calls.length).toBe(count);
    claimed = true;
    validToken = false;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3000);
    await expect(
      pollPlexFlow(started.correlationId, "browser-secret")
    ).rejects.toThrow("Plex verification failed");
    expect(await prisma.user.count()).toBe(0);
  });

  it("serializes simultaneous account creation and consumes a flow once", async () => {
    await approve();
    const [one, two] = await Promise.all([flow("one"), flow("two")]);
    const results = await Promise.all([
      pollPlexFlow(one.correlationId, "one"),
      pollPlexFlow(two.correlationId, "two"),
    ]);
    expect(results.every((r) => r.status === "complete")).toBe(true);
    expect(await prisma.user.count()).toBe(1);
    const three = await flow("three");
    const same = await Promise.all([
      pollPlexFlow(three.correlationId, "three"),
      pollPlexFlow(three.correlationId, "three"),
    ]);
    expect(same.filter((r) => r.status === "complete")).toHaveLength(1);
  });

  it("links only to the original authenticated local profile and refuses conflicting linkage", async () => {
    await approve();
    const local = await prisma.user.create({
      data: { username: "local", password: "hash" },
    });
    const started = await startPlexFlow("browser", local.id);
    await expect(
      pollPlexFlow(started.correlationId, "browser")
    ).rejects.toThrow("original local account");
    const linked = await pollPlexFlow(
      started.correlationId,
      "browser",
      local.id
    );
    expect(linked.status === "complete" && linked.user.id).toBe(local.id);
    expect(await prisma.user.count()).toBe(1);
    const another = await prisma.user.create({
      data: { username: "other", password: "hash" },
    });
    const conflict = await startPlexFlow("browser", another.id);
    await expect(
      pollPlexFlow(conflict.correlationId, "browser", another.id)
    ).rejects.toThrow("cannot be linked");
  });

  it("rejects disabled accounts and approval revocation, while preserving local recovery", async () => {
    await approve();
    const started = await flow();
    const result = await pollPlexFlow(started.correlationId, "browser-secret");
    if (result.status !== "complete") throw new Error("not complete");
    await prisma.user.update({
      where: { id: result.user.id },
      data: { disabled: true },
    });
    const disabled = await flow();
    await expect(
      pollPlexFlow(disabled.correlationId, "browser-secret")
    ).rejects.toThrow("disabled");
    expect(await plexAccessAllowed(result.user.id, true)).toBe(false);
    await prisma.user.update({
      where: { id: result.user.id },
      data: { disabled: false, plexOnly: false },
    });
    await prisma.plexIdentity.update({
      where: { accountId: String(accountId) },
      data: { approved: false },
    });
    expect(await plexAccessAllowed(result.user.id, true)).toBe(false);
    expect(await plexAccessAllowed(result.user.id, false, true)).toBe(false);
    expect(await plexAccessAllowed(result.user.id)).toBe(true);
  });

  it("issues normal protected cookies, enforces origin and rechecks approval on existing JWTs", async () => {
    await approve();
    expect(
      (await post("/plex/start", {}, undefined, "https://attacker.example"))
        .status
    ).toBe(403);
    const started = await post("/plex/start", {});
    const binding = must(must(started.headers.get("set-cookie")).split(";")[0]);
    const value = (await started.json()) as { correlationId: string };
    const completed = await post("/plex/poll", value, binding);
    expect(completed.status).toBe(200);
    const cookies = completed.headers.getSetCookie();
    const session = must(cookies.find((c) => c.startsWith("token=")));
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Strict");
    expect(verifyToken(must(session.split(";")[0]).slice(6)).authProvider).toBe(
      "plex"
    );
    expect(JSON.stringify(await completed.json())).not.toContain(
      "sensitive-plex-token"
    );
    const cookie = must(session.split(";")[0]);
    expect(
      (
        await realFetch(`${app.baseUrl}/protected`, {
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(200);
    await prisma.plexIdentity.update({
      where: { accountId: String(accountId) },
      data: { approved: false },
    });
    expect(
      (
        await realFetch(`${app.baseUrl}/protected`, {
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(401);
    expect((await post("/plex/poll", value, binding)).status).toBe(400);
  });

  it("retains local login when Plex is disabled and denies local password entry for Plex-only profiles", async () => {
    const password = await bcrypt.hash("CorrectPassword1", 4);
    const local = await prisma.user.create({
      data: { username: "admin", password, role: "ADMIN" },
    });
    setPlexEnabled(false);
    expect(
      (
        await post("/login", {
          username: "admin",
          password: "CorrectPassword1",
        })
      ).status
    ).toBe(200);
    await prisma.user.update({
      where: { id: local.id },
      data: { plexOnly: true },
    });
    expect(
      (
        await post("/login", {
          username: "admin",
          password: "CorrectPassword1",
        })
      ).status
    ).toBe(401);
    expect(generateToken(local)).toBeTruthy();
  });

  it("enforces administrator approval permissions and prevents disabling the recovery administrator", async () => {
    const admin = await prisma.user.create({
      data: { username: "recovery", password: "hash", role: "ADMIN" },
    });
    const normal = await prisma.user.create({
      data: { username: "normal", password: "hash" },
    });
    const put = (route: string, body: unknown, token?: string) =>
      realFetch(`${app.baseUrl}/api/auth/plex/admin/${route}`, {
        method: "PUT",
        headers: {
          Origin: app.baseUrl,
          "Content-Type": "application/json",
          ...(token ? { Cookie: `token=${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    expect(
      (await put("approval", { accountId: "12345", approved: true })).status
    ).toBe(401);
    expect(
      (
        await put(
          "approval",
          { accountId: "12345", approved: true },
          generateToken(normal)
        )
      ).status
    ).toBe(403);
    const token = generateToken(admin);
    expect(
      (await put("approval", { accountId: "12345", approved: true }, token))
        .status
    ).toBe(200);
    expect(
      (await put("disabled", { userId: admin.id, disabled: true }, token))
        .status
    ).toBe(400);
    expect(
      (await put("disabled", { userId: normal.id, disabled: true }, token))
        .status
    ).toBe(200);
    expect(await plexAccessAllowed(normal.id)).toBe(false);
  });

  it("requires the current local password for browser-initiated linking and denies Plex-only password resets", async () => {
    const local = await prisma.user.create({
      data: {
        username: "link-local",
        password: await bcrypt.hash("CurrentPassword1", 4),
      },
    });
    const cookie = `token=${generateToken(local)}`;
    expect(
      (await post("/plex/link/start", { password: "wrong" }, cookie)).status
    ).toBe(400);
    expect(
      (await post("/plex/link/start", { password: "CurrentPassword1" }, cookie))
        .status
    ).toBe(200);
    await prisma.user.update({
      where: { id: local.id },
      data: { plexOnly: true },
    });
    await expect(setUserPassword(local.id, "NewPassword1")).rejects.toThrow(
      "unavailable"
    );
    expect(
      (await post("/plex/link/start", { password: "CurrentPassword1" }, cookie))
        .status
    ).toBe(401);
  });

  it("preserves the Plex authentication source during hourly refresh for linked local users", async () => {
    const local = await prisma.user.create({
      data: { username: "linked-local", password: "hash" },
    });
    await prisma.plexIdentity.create({
      data: { accountId: "12345", approved: true, userId: local.id },
    });
    const issued = Math.floor(Date.now() / 1000) - 3700;
    const old = jwt.sign(
      {
        id: local.id,
        username: local.username,
        role: local.role,
        authProvider: "plex",
        iat: issued,
        authTime: issued,
      },
      must(process.env.JWT_SECRET),
      { expiresIn: "2h" }
    );
    const response = await realFetch(`${app.baseUrl}/protected`, {
      headers: { Cookie: `token=${old}` },
    });
    expect(response.status).toBe(200);
    const cookie = must(must(response.headers.get("set-cookie")).split(";")[0]);
    expect(verifyToken(cookie.slice(6))).toMatchObject({
      authProvider: "plex",
      authTime: issued,
    });
    await prisma.plexIdentity.update({
      where: { accountId: "12345" },
      data: { approved: false },
    });
    expect(
      (
        await realFetch(`${app.baseUrl}/protected`, {
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(401);
    expect(
      (
        await realFetch(`${app.baseUrl}/protected`, {
          headers: { Cookie: `token=${generateToken(local)}` },
        })
      ).status
    ).toBe(200);
  });

  it("rejects signed media links after approval revocation or account deactivation", async () => {
    const local = await prisma.user.create({
      data: { username: "media-user", password: "hash" },
    });
    await prisma.plexIdentity.create({
      data: { accountId: "12345", approved: true, userId: local.id },
    });
    const claims = {
      userId: local.id,
      sceneId: "1",
      instanceId: "instance-1",
      exp: Math.floor(Date.now() / 1000) + 600,
      passwordChangedAtMs: 0,
    };
    const query = signedQuery(
      claims,
      signStreamLink(claims, getStreamLinkKey())
    );
    const url = `${app.baseUrl}/stream/1/stream?${query}`;
    expect((await realFetch(url)).status).toBe(200);
    await prisma.plexIdentity.update({
      where: { accountId: "12345" },
      data: { approved: false },
    });
    expect((await realFetch(url)).status).toBe(401);
    await prisma.plexIdentity.update({
      where: { accountId: "12345" },
      data: { approved: true },
    });
    await prisma.user.update({
      where: { id: local.id },
      data: { disabled: true },
    });
    expect((await realFetch(url)).status).toBe(401);
  });

  it("lets cancellation win while an upstream verification is in progress", async () => {
    await approve();
    const started = await flow();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    upstream.mockImplementationOnce(async () => {
      await gate;
      return Response.json({ authToken: "sensitive-plex-token" });
    });
    const checking = pollPlexFlow(started.correlationId, "browser-secret");
    cancelPlexFlow(started.correlationId, "browser-secret");
    release();
    await expect(checking).rejects.toThrow("Invalid or completed");
    expect(await prisma.user.count()).toBe(0);
  });

  it("unlinks a deliberately deleted profile while retaining its administrator-managed approval", async () => {
    await approve();
    const started = await flow();
    const result = await pollPlexFlow(started.correlationId, "browser-secret");
    if (result.status !== "complete") throw new Error("not completed");
    await prisma.user.delete({ where: { id: result.user.id } });
    expect(
      await prisma.plexIdentity.findUnique({ where: { accountId: "12345" } })
    ).toMatchObject({ approved: true, userId: null });
    expect(await plexAccessAllowed(result.user.id, true)).toBe(false);
  });

  it("preserves existing users and playlists when upgrading the previous database schema", async () => {
    const local = await prisma.user.create({
      data: {
        username: "existing-local",
        password: "unchanged-hash",
        role: "ADMIN",
      },
    });
    const playlist = await prisma.playlist.create({
      data: { userId: local.id, name: "Keep this playlist" },
    });
    await prisma.$executeRawUnsafe('DROP TABLE "PlexIdentity"');
    await prisma.$executeRawUnsafe('DROP TABLE "PlexConnection"');
    await prisma.$executeRawUnsafe('ALTER TABLE "User" DROP COLUMN "disabled"');
    await prisma.$executeRawUnsafe('ALTER TABLE "User" DROP COLUMN "plexOnly"');
    await prisma.$executeRawUnsafe(
      "DELETE FROM \"_prisma_migrations\" WHERE migration_name IN ('20261020000100_plex_auth', '20261020000200_plex_server_sync')"
    );
    execFileSync(
      process.execPath,
      [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: (await database).url },
        stdio: "pipe",
        timeout: 60000,
      }
    );
    const restored = await prisma.user.findUniqueOrThrow({
      where: { id: local.id },
    });
    expect(restored.password).toBe("unchanged-hash");
    expect(restored.role).toBe("ADMIN");
    expect(restored.disabled).toBe(false);
    expect(restored.plexOnly).toBe(false);
    expect(
      await prisma.playlist.findUnique({ where: { id: playlist.id } })
    ).toMatchObject({ name: "Keep this playlist", userId: local.id });
  }, 65000);
});
