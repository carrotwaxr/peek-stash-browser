/**
 * BASE_PATH: the prefix a reverse proxy serves Peek under. Parsing, the
 * startup-time reading of it, and the auth cookie scoped to it.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { generateToken, setTokenCookie } from "../../middleware/auth.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import authRoutes from "../../routes/auth.js";
import {
  getBasePath,
  parseBasePath,
  publicPath,
} from "../../utils/basePath.js";
import { startTestApp } from "../helpers/httpTestApp.js";

vi.mock("../../prisma/singleton.js", () => ({ default: {} }));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

describe("parseBasePath", () => {
  it.each([[""], ["/"], [undefined]])("treats %j as no prefix", (raw) => {
    expect(parseBasePath(raw)).toBe("");
  });

  it.each([
    ["/peek", "/peek"],
    [" /peek/ ", "/peek"],
    ["/a/b-c.d_e~f", "/a/b-c.d_e~f"],
  ])("accepts %j as %j", (raw, expected) => {
    expect(parseBasePath(raw)).toBe(expected);
  });

  it.each([
    ["peek"],
    ["/peek//x"],
    ["/pe ek"],
    ["/peek?x"],
    ["/peek#x"],
    ["//evil.com"],
    ["/.."],
    ["/a/./b"],
  ])("rejects %j", (raw) => {
    expect(parseBasePath(raw)).toBeNull();
  });
});

describe("getBasePath and publicPath", () => {
  const original = process.env.BASE_PATH;

  afterEach(() => {
    if (original === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = original;
  });

  it("reads BASE_PATH on each call", () => {
    process.env.BASE_PATH = "/peek";
    expect(getBasePath()).toBe("/peek");
    process.env.BASE_PATH = "/other/";
    expect(getBasePath()).toBe("/other");
    delete process.env.BASE_PATH;
    expect(getBasePath()).toBe("");
  });

  it("returns an empty prefix when BASE_PATH is invalid", () => {
    process.env.BASE_PATH = "//evil.com";
    expect(getBasePath()).toBe("");
  });

  it("prefixes root-absolute paths under a base path", () => {
    process.env.BASE_PATH = "/peek";
    expect(publicPath("/api/x?y=1")).toBe("/peek/api/x?y=1");
  });

  it("leaves paths unchanged without a base path", () => {
    delete process.env.BASE_PATH;
    expect(publicPath("/api/x?y=1")).toBe("/api/x?y=1");
  });

  it("returns a path not starting with / unchanged", () => {
    process.env.BASE_PATH = "/peek";
    expect(publicPath("api/x")).toBe("api/x");
    expect(publicPath("https://example.com/a")).toBe("https://example.com/a");
  });
});

describe("auth cookie path", () => {
  const original = process.env.BASE_PATH;
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ baseUrl, close } = await startTestApp((app) => {
      app.use("/api/auth", authRoutes);
      app.use(errorHandler);
    }));
  });

  afterAll(async () => {
    await close();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = original;
  });

  const cookieOptions = () => {
    const cookie =
      vi.fn<(name: string, value: string, options: object) => void>();
    const res = { cookie } as unknown as Parameters<typeof setTokenCookie>[0];
    setTokenCookie(res, generateToken({ id: 1, username: "a", role: "USER" }));
    return cookie.mock.calls[0]?.[2];
  };

  it("scopes the token cookie to BASE_PATH", () => {
    process.env.BASE_PATH = "/peek";
    expect(cookieOptions()).toMatchObject({ path: "/peek" });
  });

  it("uses / without BASE_PATH", () => {
    delete process.env.BASE_PATH;
    expect(cookieOptions()).toMatchObject({ path: "/" });
  });

  const logoutClears = async (bp: string | undefined) => {
    if (bp === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = bp;

    const res = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    return res.headers
      .getSetCookie()
      .filter((cookie) => cookie.startsWith("token=;"))
      .map((cookie) => /Path=([^;]*)/.exec(cookie)?.[1]);
  };

  it("logout under BASE_PATH clears the cookie on the prefix and on the root", async () => {
    // A cookie set before BASE_PATH was enabled sits on Path=/
    expect(await logoutClears("/peek")).toEqual(["/peek", "/"]);
  });

  it("logout without BASE_PATH clears the cookie once, on the root", async () => {
    expect(await logoutClears(undefined)).toEqual(["/"]);
  });
});
