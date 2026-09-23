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
