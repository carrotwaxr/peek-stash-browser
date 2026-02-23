import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

  it("sets trust proxy when TRUST_PROXY env var is set to '1'", async () => {
    process.env.TRUST_PROXY = "1";
    const { setupAPI } = await import("../../initializers/api.js");
    const app = setupAPI();
    expect(app.get("trust proxy")).toBe(1);
  });

  it("sets trust proxy to numeric value when TRUST_PROXY is a number", async () => {
    process.env.TRUST_PROXY = "2";
    const { setupAPI } = await import("../../initializers/api.js");
    const app = setupAPI();
    expect(app.get("trust proxy")).toBe(2);
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

  it("does not set trust proxy when TRUST_PROXY env var is not set", async () => {
    delete process.env.TRUST_PROXY;
    const { setupAPI } = await import("../../initializers/api.js");
    const app = setupAPI();
    // Express default is false (undefined returns false)
    expect(app.get("trust proxy")).toBeFalsy();
  });
});
