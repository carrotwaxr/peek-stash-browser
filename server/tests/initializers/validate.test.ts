/**
 * validateStartup logs the environment summary and warns about unsafe
 * settings. It must never log any character of the Stash API key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateStartup } from "../../initializers/validate.js";
import { logger } from "../../utils/logger.js";

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const ENV_KEYS = [
  "STASH_URL",
  "STASH_API_KEY",
  "PROXY_AUTH_HEADER",
  "PROXY_AUTH_TRUSTED_IPS",
] as const;

const allLogged = () =>
  JSON.stringify(
    (["error", "warn", "info", "debug"] as const).map(
      (level) => vi.mocked(logger[level]).mock.calls
    )
  );

const warnings = () =>
  vi.mocked(logger.warn).mock.calls.map(([message]) => message);

describe("validateStartup", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("reports whether STASH_API_KEY is set, never its characters", () => {
    process.env.STASH_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sig";

    validateStartup();

    expect(allLogged()).toContain("set (40 characters)");
    expect(allLogged()).not.toContain("eyJhbGci");

    vi.clearAllMocks();
    delete process.env.STASH_API_KEY;
    validateStartup();
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Environment Configuration",
      expect.objectContaining({ STASH_API_KEY: "NOT SET" })
    );
  });

  it("logs PROXY_AUTH_HEADER and PROXY_AUTH_TRUSTED_IPS in the summary", () => {
    process.env.PROXY_AUTH_HEADER = "Remote-User";
    process.env.PROXY_AUTH_TRUSTED_IPS = "172.18.0.0/16";

    validateStartup();

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Environment Configuration",
      expect.objectContaining({
        PROXY_AUTH_HEADER: "Remote-User",
        PROXY_AUTH_TRUSTED_IPS: "172.18.0.0/16",
      })
    );
  });

  it("warns when PROXY_AUTH_HEADER is set without PROXY_AUTH_TRUSTED_IPS", () => {
    process.env.PROXY_AUTH_HEADER = "Remote-User";

    validateStartup();

    const warning = warnings().find((message) =>
      message.startsWith(
        "PROXY_AUTH_HEADER is set without PROXY_AUTH_TRUSTED_IPS"
      )
    );
    expect(warning).toBeDefined();
    expect(warning).toContain(
      "any request carrying Remote-User is signed in as the user it names"
    );
  });

  it("does not warn when both are set", () => {
    process.env.PROXY_AUTH_HEADER = "Remote-User";
    process.env.PROXY_AUTH_TRUSTED_IPS = "172.18.0.0/16";

    validateStartup();

    expect(warnings().join("\n")).not.toContain("PROXY_AUTH");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs an error naming each invalid PROXY_AUTH_TRUSTED_IPS entry", () => {
    process.env.PROXY_AUTH_HEADER = "Remote-User";
    process.env.PROXY_AUTH_TRUSTED_IPS = "172.18.0.0/16, nope, 300.1.1.1";

    validateStartup();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message] = vi.mocked(logger.error).mock.calls[0]!;
    expect(message).toContain("PROXY_AUTH_TRUSTED_IPS");
    expect(message).toContain("nope");
    expect(message).toContain("300.1.1.1");
    expect(message).not.toContain("172.18.0.0/16");
  });
});
