import { execFileSync } from "child_process";
import { readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { generateToken } from "../../middleware/auth.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import plexRoutes from "../../routes/plexAuth.js";
import { protectLocalRecovery } from "../../services/LocalRecoveryService.js";
import {
  plexAccessAllowed,
  pollPlexFlow,
  startPlexFlow,
} from "../../services/PlexAuthService.js";
import {
  connectPlexOwner,
  disconnectPlex,
  listPlexServers,
  parsePlexMembers,
  plexConnectionStatus,
  selectPlexServer,
  setPlexActive,
  syncPlexUsers,
} from "../../services/PlexServerService.js";
import { dbWriteTransaction } from "../../utils/dbWrite.js";
import {
  decryptPlexToken,
  encryptPlexToken,
} from "../../utils/plexEncryption.js";
import { startTestApp } from "../helpers/httpTestApp.js";

const database = vi.hoisted(async () => {
  const fs = await import("fs");
  const os = await import("os");
  const p = await import("path");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "peek-plex-sync-test-"));
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

const OWNER_TOKEN = "synthetic-owner-token-for-tests";
const realFetch = globalThis.fetch;
const shared = (
  id: string,
  username = `user-${id}`,
  machine = "server-1",
  pending = "0"
) =>
  `<User id="${id}" username="${username}" email="${id}@example.test"><Server machineIdentifier="${machine}" pending="${pending}" /></User>`;
const xml = (...users: string[]) =>
  `<MediaContainer size="${users.length}">${users.join("")}</MediaContainer>`;
let usersXml = "";
let tokenValid = true;
let available = true;
let loginId = 200;
let adminId: number;
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
    server.use(errorHandler);
  });
}, 70000);
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubEnv("PLEX_AUTH_ENABLED", "true");
  vi.stubEnv("PLEX_CLIENT_IDENTIFIER", "test-client");
  vi.stubEnv("PLEX_PUBLIC_URL", "http://localhost:6969");
  vi.stubEnv("SECURE_COOKIES", "false");
  vi.stubEnv("CONFIG_DIR", (await database).dir);
  rmSync(path.join((await database).dir, "plex-settings.json"), {
    force: true,
  });
  await prisma.plexConnection.deleteMany();
  await prisma.plexIdentity.deleteMany();
  await prisma.user.deleteMany();
  adminId = (
    await prisma.user.create({
      data: { username: "local-admin", password: "hash", role: "ADMIN" },
    })
  ).id;
  tokenValid = true;
  available = true;
  loginId = 200;
  usersXml = xml(
    shared("200", "alice"),
    shared("300", "bob"),
    shared("400", "other-server-user", "server-2"),
    shared("500", "pending-user", "server-1", "1"),
    '<User id="600" title="Managed"><Server machineIdentifier="server-1" /></User>'
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!url.startsWith("https://plex.tv/")) return realFetch(input, init);
      await Promise.resolve();
      if (!tokenValid) return new Response("sensitive body", { status: 401 });
      if (url.includes("resources"))
        return Response.json(
          available
            ? [
                {
                  clientIdentifier: "server-1",
                  name: "Mothership",
                  owned: true,
                  provides: "server",
                  accessToken: "must-not-reach-browser",
                },
                {
                  clientIdentifier: "server-2",
                  name: "Other",
                  owned: false,
                  provides: "server",
                },
              ]
            : []
        );
      if (url.endsWith("/api/users/")) return new Response(usersXml);
      if (url.endsWith("/pins"))
        return Response.json({ id: 1, code: "temporary" });
      if (url.includes("/pins/"))
        return Response.json({ authToken: "login-test-token" });
      if (url.endsWith("/user"))
        return Response.json({
          id:
            new Headers(init?.headers).get("X-Plex-Token") ===
            "login-test-token"
              ? loginId
              : 100,
          username: "owner",
        });
      throw new Error("Unexpected Plex URL");
    })
  );
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync((await database).dir, { recursive: true, force: true });
});
async function connect() {
  await connectPlexOwner(OWNER_TOKEN, "100", "owner", adminId, () => {});
}
async function imported() {
  await connect();
  await selectPlexServer("server-1");
}

describe("Plex server connection and membership import", () => {
  it("protects the last enabled local administrator from removal or demotion", async () => {
    await expect(
      dbWriteTransaction("test-recovery", (tx) =>
        protectLocalRecovery(tx, adminId)
      )
    ).rejects.toThrow("Keep a local administrator");
    await prisma.user.create({
      data: { username: "second-local-admin", password: "hash", role: "ADMIN" },
    });
    await expect(
      dbWriteTransaction("test-recovery", (tx) =>
        protectLocalRecovery(tx, adminId)
      )
    ).resolves.toBeUndefined();
  });
  it("encrypts authenticated credentials, detects tampering, and requires the matching persistent key", async () => {
    const first = encryptPlexToken(OWNER_TOKEN);
    const second = encryptPlexToken(OWNER_TOKEN);
    expect(first).not.toBe(second);
    expect(first).not.toContain(OWNER_TOKEN);
    expect(decryptPlexToken(first)).toBe(OWNER_TOKEN);
    expect(() => decryptPlexToken(`${first.slice(0, -3)}abc`)).toThrow(
      "could not be decrypted"
    );
    const keyFile = path.join((await database).dir, ".plex-key");
    const saved = readFileSync(keyFile);
    writeFileSync(keyFile, Buffer.alloc(32, 4));
    expect(() => decryptPlexToken(first)).toThrow("could not be decrypted");
    writeFileSync(keyFile, saved);
  });
  it("connects only an owner through a current administrator and exposes no credentials", async () => {
    await connect();
    expect(await listPlexServers()).toEqual([
      { id: "server-1", name: "Mothership" },
    ]);
    expect(JSON.stringify(await plexConnectionStatus())).not.toContain(
      OWNER_TOKEN
    );
    expect(
      (await prisma.plexConnection.findUniqueOrThrow({ where: { id: 1 } }))
        .encryptedToken
    ).not.toContain(OWNER_TOKEN);
    available = false;
    await expect(connect()).rejects.toThrow("does not own");
    available = true;
    await prisma.user.update({
      where: { id: adminId },
      data: { role: "USER" },
    });
    await expect(connect()).rejects.toThrow("Administrator access");
  });
  it("imports full accepted accounts and owner as inactive non-admin users before first login", async () => {
    await imported();
    const identities = await prisma.plexIdentity.findMany({
      include: { user: true },
    });
    expect(identities.map((i) => i.accountId).sort()).toEqual([
      "100",
      "200",
      "300",
    ]);
    expect(
      identities.every(
        (i) =>
          i.serverMember &&
          !i.approved &&
          i.user?.disabled &&
          i.user.plexOnly &&
          i.user.role === "USER"
      )
    ).toBe(true);
    expect(identities.find((i) => i.accountId === "200")?.user?.username).toBe(
      "alice"
    );
    expect(await plexAccessAllowed(adminId)).toBe(true);
  });
  it("does not auto-link colliding local usernames and preserves their profile", async () => {
    const local = await prisma.user.create({
      data: { username: "alice", password: "local-hash", theme: "purple" },
    });
    await imported();
    expect(
      (
        await prisma.plexIdentity.findUniqueOrThrow({
          where: { accountId: "200" },
        })
      ).userId
    ).not.toBe(local.id);
    expect(
      await prisma.user.findUnique({ where: { id: local.id } })
    ).toMatchObject({ password: "local-hash", theme: "purple" });
  });
  it("denies inactive/unknown accounts and logs active accounts into their imported profile with assigned role", async () => {
    await imported();
    const inactive = await startPlexFlow("browser");
    await expect(
      pollPlexFlow(inactive.correlationId, "browser")
    ).rejects.toThrow("inactive in Peek");
    await setPlexActive("200", true, adminId);
    const identity = await prisma.plexIdentity.findUniqueOrThrow({
      where: { accountId: "200" },
    });
    if (!identity.userId) throw new Error("No profile");
    await prisma.user.update({
      where: { id: identity.userId },
      data: { role: "ADMIN" },
    });
    const login = await startPlexFlow("browser");
    const result = await pollPlexFlow(login.correlationId, "browser");
    expect(result.status === "complete" && result.user.id).toBe(
      identity.userId
    );
    expect(result.status === "complete" && result.user.role).toBe("ADMIN");
    loginId = 999;
    const unknown = await startPlexFlow("browser");
    await expect(
      pollPlexFlow(unknown.correlationId, "browser")
    ).rejects.toThrow("does not have access");
  });
  it("preserves active state, roles and history through repeated and concurrent syncs", async () => {
    await imported();
    await setPlexActive("200", true, adminId);
    const identity = await prisma.plexIdentity.findUniqueOrThrow({
      where: { accountId: "200" },
    });
    if (!identity.userId) throw new Error("No profile");
    await prisma.user.update({
      where: { id: identity.userId },
      data: { role: "ADMIN", theme: "purple" },
    });
    await prisma.playlist.create({
      data: { userId: identity.userId, name: "Keep me" },
    });
    const results = await Promise.all([
      syncPlexUsers(),
      syncPlexUsers(),
      syncPlexUsers(),
    ]);
    expect(results.every((r) => r.imported === 0)).toBe(true);
    expect(await prisma.user.count()).toBe(4);
    expect(
      await prisma.user.findUnique({ where: { id: identity.userId } })
    ).toMatchObject({ disabled: false, role: "ADMIN", theme: "purple" });
    expect(
      await prisma.playlist.count({ where: { userId: identity.userId } })
    ).toBe(1);
  });
  it("revokes removed members and requires manual reactivation when they return", async () => {
    await imported();
    await setPlexActive("200", true, adminId);
    const identity = await prisma.plexIdentity.findUniqueOrThrow({
      where: { accountId: "200" },
    });
    if (!identity.userId) throw new Error("No profile");
    usersXml = xml(shared("300"));
    await syncPlexUsers();
    expect(await plexAccessAllowed(identity.userId, true)).toBe(false);
    expect(
      await prisma.plexIdentity.findUnique({ where: { accountId: "200" } })
    ).toMatchObject({ approved: false, serverMember: false });
    await expect(setPlexActive("200", true, adminId)).rejects.toThrow(
      "no verified access"
    );
    usersXml = xml(shared("200"), shared("300"));
    await syncPlexUsers();
    expect(
      await prisma.plexIdentity.findUnique({ where: { accountId: "200" } })
    ).toMatchObject({
      approved: false,
      serverMember: true,
      userId: identity.userId,
    });
  });
  it("preserves membership and activation on failed, incomplete or invalid snapshots", async () => {
    await imported();
    await setPlexActive("200", true, adminId);
    for (const invalid of [
      '<MediaContainer size="2"/>',
      '<MediaContainer size="0" totalSize="3"/>',
      '<MediaContainer size="1"><User id="bad"/></MediaContainer>',
      '<!DOCTYPE x><MediaContainer size="0"/>',
    ]) {
      usersXml = invalid;
      await expect(syncPlexUsers()).rejects.toThrow("sync failed");
      expect(
        await prisma.plexIdentity.findUnique({ where: { accountId: "200" } })
      ).toMatchObject({ approved: true, serverMember: true });
    }
    tokenValid = false;
    await expect(syncPlexUsers()).rejects.toThrow("sync failed");
    expect((await plexConnectionStatus()).lastError).toContain("sync failed");
  });
  it("validates server ownership and refuses stale imports after disconnect", async () => {
    await imported();
    await expect(selectPlexServer("server-2")).rejects.toThrow("owned by");
    let release: () => void = () => {};
    let arrived: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const original = vi.mocked(fetch).getMockImplementation();
    if (!original) throw new Error("Missing HTTP mock");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (typeof input === "string" && input.endsWith("/api/users/")) {
        arrived();
        await gate;
      }
      return original(input, init);
    });
    const pending = syncPlexUsers();
    const refused = pending.catch((error: unknown) => error);
    await reached;
    await disconnectPlex();
    release();
    expect(await refused).toMatchObject({
      message:
        "Plex sync failed. Existing access settings were preserved. Check the connection or reconnect Plex.",
    });
    expect((await plexConnectionStatus()).connected).toBe(false);
    expect(
      (await prisma.plexIdentity.findMany()).every(
        (i) => !i.approved && !i.serverMember
      )
    ).toBe(true);
  });
  it("links an unused imported placeholder to a verified local profile without deleting either record", async () => {
    await imported();
    const local = await prisma.user.create({
      data: {
        username: "existing-profile",
        password: "local-hash",
        theme: "purple",
      },
    });
    const placeholderId = (
      await prisma.plexIdentity.findUniqueOrThrow({
        where: { accountId: "200" },
      })
    ).userId;
    const flow = await startPlexFlow("browser", local.id);
    const result = await pollPlexFlow(flow.correlationId, "browser", local.id);
    expect(result.status === "complete" && result.user.id).toBe(local.id);
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: placeholderId ?? 0 },
        })
      ).disabled
    ).toBe(true);
    expect(
      await prisma.plexIdentity.findUnique({ where: { accountId: "200" } })
    ).toMatchObject({ userId: local.id, approved: false });
    await setPlexActive("200", true, adminId);
    await setPlexActive("200", false, adminId);
    expect(await plexAccessAllowed(local.id)).toBe(true);
    expect(await plexAccessAllowed(local.id, true)).toBe(false);
  });
  it("allows only same-origin administrators to change persisted Plex settings", async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });
    const update = (
      cookie?: string,
      origin = app.baseUrl,
      enabled: unknown = false
    ) =>
      realFetch(`${app.baseUrl}/api/auth/plex/admin/settings`, {
        method: "PUT",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({ enabled }),
      });
    expect((await update()).status).toBe(401);
    const ordinary = await prisma.user.create({
      data: { username: "ordinary", password: "hash" },
    });
    expect((await update(`token=${generateToken(ordinary)}`)).status).toBe(403);
    const cookie = `token=${generateToken(admin)}`;
    expect((await update(cookie, "https://attacker.example")).status).toBe(403);
    expect((await update(cookie, app.baseUrl, "true")).status).toBe(400);
    expect(await (await update(cookie)).json()).toEqual({ enabled: false });
    expect((await update(cookie, app.baseUrl, true)).status).toBe(200);
  });
  it("requires protected administrator flows and never returns the owner credential", async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });
    const post = (route: string, body: unknown, cookie?: string) =>
      realFetch(`${app.baseUrl}/api/auth/plex${route}`, {
        method: "POST",
        headers: {
          Origin: app.baseUrl,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    expect((await post("/admin/connect/start", {})).status).toBe(401);
    const cookie = `token=${generateToken(admin)}`;
    const started = await post("/admin/connect/start", {}, cookie);
    const state = (await started.json()) as { correlationId: string };
    const binding = started.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect((await post("/poll", state, binding)).status).toBe(403);
    const completed = await post(
      "/admin/connect/poll",
      state,
      `${cookie}; ${binding}`
    );
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({ status: "connected" });
    const response = await realFetch(
      `${app.baseUrl}/api/auth/plex/admin/connection`,
      { headers: { Cookie: cookie } }
    );
    expect(await response.text()).not.toContain("token");
  });
  it("parses accepted shares with missing pending flag, excludes managed users, and rejects duplicates", () => {
    expect(
      parsePlexMembers(
        xml(
          '<User id="200" username="alice"><Server machineIdentifier="server-1" /></User>'
        ),
        "server-1"
      )
    ).toEqual([{ accountId: "200", username: "alice" }]);
    expect(() =>
      parsePlexMembers(xml(shared("200"), shared("200")), "server-1")
    ).toThrow("duplicate");
  });

  it("upgrades existing Plex identities without replacing profiles or manual approval", async () => {
    await prisma.plexIdentity.create({
      data: { accountId: "100", approved: true, userId: adminId },
    });
    await prisma.$executeRawUnsafe('DROP TABLE "PlexConnection"');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "PlexIdentity" DROP COLUMN "serverMember"'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "PlexIdentity" DROP COLUMN "username"'
    );
    await prisma.$executeRawUnsafe(
      "DELETE FROM \"_prisma_migrations\" WHERE migration_name = '20261020000200_plex_server_sync'"
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
    expect(
      await prisma.plexIdentity.findUnique({ where: { accountId: "100" } })
    ).toMatchObject({
      userId: adminId,
      approved: true,
      serverMember: false,
      username: null,
    });
    expect(await plexAccessAllowed(adminId, true)).toBe(true);
  }, 65000);
});
