/**
 * Unit tests for the JWT signing secret (sweep item 8).
 *
 * Each test runs against its own temporary CONFIG_DIR with JWT_SECRET unset,
 * so the generated-file path is exercised without touching /app/data.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JWT_SECRET_FILE,
  PUBLISHED_EXAMPLE_SECRETS,
  _resetJwtSecretForTesting,
  getJwtSecret,
  resolveJwtSecret,
} from "../../utils/jwtSecret.js";
import { logger } from "../../utils/logger.js";

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("jwtSecret", () => {
  const originalEnv = { ...process.env };
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-jwt-"));
    process.env.CONFIG_DIR = dir;
    delete process.env.JWT_SECRET;
    _resetJwtSecretForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetJwtSecretForTesting();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("uses JWT_SECRET from the environment", () => {
    const secret = "x".repeat(40);

    expect(resolveJwtSecret({ JWT_SECRET: secret, CONFIG_DIR: dir })).toEqual({
      secret,
      source: "env",
    });
    expect(fs.existsSync(path.join(dir, JWT_SECRET_FILE))).toBe(false);
  });

  it("generates a secret into CONFIG_DIR/.jwt-secret when JWT_SECRET is unset", () => {
    const result = resolveJwtSecret({ CONFIG_DIR: dir });
    const file = path.join(dir, JWT_SECRET_FILE);

    expect(result.source).toBe("generated");
    expect(result.secret.length).toBeGreaterThanOrEqual(32);
    expect(fs.readFileSync(file, "utf8").trim()).toBe(result.secret);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("reuses the persisted secret on the next start", () => {
    const first = resolveJwtSecret({ CONFIG_DIR: dir });
    const second = resolveJwtSecret({ CONFIG_DIR: dir });

    expect(second).toEqual({ secret: first.secret, source: "file" });
  });

  it.each([...PUBLISHED_EXAMPLE_SECRETS])(
    "ignores published example values with a warning (%s)",
    (value) => {
      process.env.JWT_SECRET = value;

      const result = resolveJwtSecret();

      expect(result.source).toBe("generated");
      expect(result.secret).not.toBe(value);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(
        value
      );
    }
  );

  it("refuses to start when it cannot persist a secret", () => {
    const notADirectory = path.join(dir, "regular-file");
    fs.writeFileSync(notADirectory, "not a directory");

    expect(() => resolveJwtSecret({ CONFIG_DIR: notADirectory })).toThrow(
      /JWT_SECRET is not set and Peek cannot write/
    );
  });

  it("getJwtSecret reads the environment at call time, not at import", () => {
    const secret = "y".repeat(40);
    process.env.JWT_SECRET = secret;

    expect(getJwtSecret()).toBe(secret);
  });
});
