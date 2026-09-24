import { once } from "events";
import fs from "fs";
import type { Server } from "http";
import type { AddressInfo } from "net";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TrustFn = (addr: string, hop: number) => boolean;

// Store the original env
const originalEnv = { ...process.env };

describe("setupAPI - trust proxy configuration", () => {
  beforeEach(() => {
    // Reset modules so each test gets fresh imports
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("setupAPI trusts the loopback hop when TRUST_PROXY is unset", async () => {
    delete process.env.TRUST_PROXY;
    const { setupAPI } = await import("../../initializers/api.js");
    const app = setupAPI();
    const trust = app.get("trust proxy") as TrustFn;
    expect(typeof trust).toBe("function");
    expect(trust("127.0.0.1", 0)).toBe(true);
    expect(trust("::1", 0)).toBe(true);
    expect(trust("172.17.0.2", 0)).toBe(false);
    expect(trust("203.0.113.7", 1)).toBe(false);
  });

  it("TRUST_PROXY=2 trusts two proxies in front of the loopback hop", async () => {
    process.env.TRUST_PROXY = "2";
    const { setupAPI } = await import("../../initializers/api.js");
    const app = setupAPI();
    const trust = app.get("trust proxy") as TrustFn;
    expect(typeof trust).toBe("function");
    expect(trust("127.0.0.1", 0)).toBe(true);
    expect(trust("172.18.0.5", 1)).toBe(true);
    expect(trust("172.18.0.6", 2)).toBe(true);
    expect(trust("203.0.113.7", 3)).toBe(false);
    expect(trust("172.18.0.5", 0)).toBe(false);
  });

  it("sets trust proxy to true when TRUST_PROXY is 'true'", async () => {
    process.env.TRUST_PROXY = "true";
    const { setupAPI } = await import("../../initializers/api.js");
    const app = setupAPI();
    expect(app.get("trust proxy")).toBe(true);
  });

  it("passes string values like 'loopback' directly to Express", async () => {
    process.env.TRUST_PROXY = "loopback";
    const { setupAPI } = await import("../../initializers/api.js");
    const app = setupAPI();
    expect(app.get("trust proxy")).toBe("loopback");
  });
});

describe("health and version", () => {
  const serverDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  );
  const packageVersion = (
    JSON.parse(
      fs.readFileSync(path.join(serverDir, "package.json"), "utf8")
    ) as { version: string }
  ).version;

  let server: Server | undefined;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // npm sets this when it runs the tests; the image runs node directly, without it
    delete process.env.npm_package_version;
    delete process.env.BUILD_DATE;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    process.env = originalEnv;
  });

  const start = async (): Promise<string> => {
    const { setupAPI } = await import("../../initializers/api.js");
    server = setupAPI().listen(0);
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  };

  it("GET /api/health reports the version in server/package.json", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "healthy",
      version: packageVersion,
    });
  });

  it("GET /api/health and GET /api/version report BUILD_DATE", async () => {
    process.env.BUILD_DATE = "2026-09-23T12:00:00Z";
    const base = await start();

    const health = (await (await fetch(`${base}/api/health`)).json()) as {
      buildDate: unknown;
    };
    const version = (await (await fetch(`${base}/api/version`)).json()) as {
      server: unknown;
      buildDate: unknown;
    };

    expect(health.buildDate).toBe("2026-09-23T12:00:00Z");
    expect(version).toEqual({
      server: packageVersion,
      buildDate: "2026-09-23T12:00:00Z",
    });
  });

  it("GET /api/version reports a null buildDate when BUILD_DATE is unset", async () => {
    const base = await start();
    const version = (await (await fetch(`${base}/api/version`)).json()) as {
      server: unknown;
      buildDate: unknown;
    };

    expect(version).toEqual({ server: packageVersion, buildDate: null });
  });

  it("GET /api/health does not touch the database", async () => {
    const { default: prisma } = await import("../../prisma/singleton.js");
    const queryRaw = vi.spyOn(prisma, "$queryRaw");
    const queryRawUnsafe = vi.spyOn(prisma, "$queryRawUnsafe");
    const base = await start();

    const res = await fetch(`${base}/api/health`);

    expect(res.status).toBe(200);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });
});
