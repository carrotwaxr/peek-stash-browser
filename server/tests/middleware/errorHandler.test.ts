/**
 * The central error handler answers every error a handler throws or rejects
 * with: an AppError with its own status and text, a database error with what
 * it means (a duplicate 409, a missing row 404, a busy database 503 with
 * Retry-After) in fixed text, express.json's refusal with its 4xx, and
 * anything else with a 500 that never shows its message. Each failure is
 * logged with the request's method, route and user and the whole error.
 */
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUser } from "../../middleware/auth.js";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
  errorHandler,
} from "../../middleware/errorHandler.js";
import { LogLevel, logger } from "../../utils/logger.js";
import { reqFor, resFor, testUser } from "../helpers/controllerTestUtils.js";
import { must } from "../helpers/must.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

type Req = Parameters<typeof errorHandler>[1];
type Res = Parameters<typeof errorHandler>[2];

/** errorHandler in the (req, res) shape `reqFor` and `resFor` type from. */
const asRouteHandler = (req: Req, res: Res) => {
  errorHandler(new Error("unused"), req, res, vi.fn());
};

/** What Prisma throws for `code`, with the text it carries. */
const prismaError = (
  code: string,
  message: string,
  meta?: Record<string, unknown>
) =>
  new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "test",
    ...(meta && { meta }),
  });

/** What express.json passes on when the body is not JSON, as body-parser builds it. */
const jsonParseError = () =>
  Object.assign(
    new SyntaxError(
      `Unexpected token 'h', ..."assword": hunter2}" is not valid JSON`
    ),
    {
      type: "entity.parse.failed",
      status: 400,
      statusCode: 400,
      expose: true,
      body: '{"username": "ann", "password": hunter2}',
    }
  );

describe("errorHandler", () => {
  const initialLevel = logger.getLevel();
  let lines: string[];

  beforeEach(() => {
    lines = [];
    const capture = (line: unknown) => {
      lines.push(String(line));
    };
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "log").mockImplementation(capture);
    logger.setLevel(LogLevel.DEBUG);
  });

  afterEach(() => {
    logger.setLevel(initialLevel);
    vi.restoreAllMocks();
  });

  const onlyLine = () => {
    expect(lines).toHaveLength(1);
    return must(lines[0]);
  };

  /** Runs the handler on `err` for POST /api/playlists/3, as `user`. */
  const handle = (
    err: unknown,
    user: RequestUser | null = testUser({ id: 7 })
  ) => {
    const req = Object.assign(reqFor(asRouteHandler, user ? { user } : {}), {
      method: "POST",
      path: "/api/playlists/3",
    });
    const res = resFor(asRouteHandler);
    const next = vi.fn();
    errorHandler(err, req, res, next);
    expect(next).not.toHaveBeenCalled();
    return res;
  };

  it("an unexpected error answers 500 Internal server error and never its message", () => {
    const error = new Error(
      "SQLITE_ERROR: no such column x in SELECT * FROM StashScene (/app/data/peek.db)"
    );

    const res = handle(error);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res._getBody()).toEqual({ error: "Internal server error" });
    const line = onlyLine();
    expect(line).toContain("[ERROR] Request failed");
    expect(line).toContain('"method":"POST"');
    expect(line).toContain('"route":"/api/playlists/3"');
    expect(line).toContain('"userId":7');
    expect(line).toContain(
      '"error":{"name":"Error","message":"SQLITE_ERROR: no such column x'
    );
    expect(line).toContain('"stack":"Error: SQLITE_ERROR');
  });

  it("Prisma P2002 answers 409, P2025 404, P2003 409", () => {
    const cases = [
      {
        error: prismaError(
          "P2002",
          "Unique constraint failed on the fields: (`userId`,`name`)",
          { target: ["userId", "name"] }
        ),
        status: 409,
        errorType: "CONFLICT",
      },
      {
        error: prismaError(
          "P2025",
          "An operation failed because it depends on one or more records that were required but not found. Record to update not found."
        ),
        status: 404,
        errorType: "NOT_FOUND",
      },
      {
        error: prismaError(
          "P2003",
          "Foreign key constraint violated on the constraint: `PlaylistItem_playlistId_fkey`",
          { constraint: "PlaylistItem_playlistId_fkey" }
        ),
        status: 409,
        errorType: "CONFLICT",
      },
    ];

    for (const { error, status, errorType } of cases) {
      lines = [];
      const res = handle(error);

      expect(res.status, error.code).toHaveBeenCalledWith(status);
      const body = res._getErrorBody();
      expect(body.errorType, error.code).toBe(errorType);
      expect(JSON.stringify(body), error.code).not.toMatch(
        /constraint|Prisma|P20|userId|Record to update|PlaylistItem/i
      );
      // A refusal, not a server fault; the log still names the code
      const line = onlyLine();
      expect(line).toContain("[WARN] Request refused");
      expect(line).toContain(`"code":"${error.code}"`);
    }
  });

  it("a busy database answers 503 with Retry-After: 1", () => {
    const busy = [
      prismaError("P1008", "Operations timed out after 5s"),
      prismaError(
        "P2010",
        "Raw query failed. Code: `5`. Message: `database is locked`",
        { code: "5" }
      ),
    ];

    for (const error of busy) {
      lines = [];
      const res = handle(error);

      expect(res.status, error.code).toHaveBeenCalledWith(503);
      expect(res.setHeader, error.code).toHaveBeenCalledWith(
        "Retry-After",
        "1"
      );
      const body = res._getErrorBody();
      expect(body.errorType, error.code).toBe("SERVICE_UNAVAILABLE");
      expect(JSON.stringify(body), error.code).not.toMatch(
        /timed out|Raw query|locked|P1008|P2010/i
      );
      expect(onlyLine()).toContain("[ERROR] Request failed");
    }

    // Another raw-query failure is not the lock: a plain 500
    const res = handle(
      prismaError(
        "P2010",
        "Raw query failed. Code: `1`. Message: `no such table`",
        { code: "1" }
      )
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("a ValidationError answers 400 with errorType VALIDATION_ERROR and its issues", () => {
    const issues = [
      {
        path: "scene_filter.performers.modifier",
        message: "Invalid option: expected one of INCLUDES|EXCLUDES",
      },
    ];

    const res = handle(new ValidationError("Invalid request", { issues }));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res._getBody()).toEqual({
      error: "Invalid request",
      errorType: "VALIDATION_ERROR",
      issues,
    });
    expect(onlyLine()).toContain("[WARN] Request refused");

    const withDetails = handle(
      new ValidationError("Could not connect to Stash server", {
        details: "Could not reach Stash (ECONNREFUSED)",
      })
    );
    expect(withDetails._getBody()).toEqual({
      error: "Could not connect to Stash server",
      errorType: "VALIDATION_ERROR",
      details: "Could not reach Stash (ECONNREFUSED)",
    });
  });

  it("AppErrors answer their own status, text and type", () => {
    expect(handle(new NotFoundError("Scene not found"))._getBody()).toEqual({
      error: "Scene not found",
      errorType: "NOT_FOUND",
    });

    const conflict = handle(new ConflictError("A playlist has that name"));
    expect(conflict.status).toHaveBeenCalledWith(409);
    expect(conflict._getBody()).toEqual({
      error: "A playlist has that name",
      errorType: "CONFLICT",
    });

    const unavailable = handle(
      new ServiceUnavailableError("Sync is running", { retryAfterSeconds: 30 })
    );
    expect(unavailable.status).toHaveBeenCalledWith(503);
    expect(unavailable.setHeader).toHaveBeenCalledWith("Retry-After", "30");
    expect(unavailable._getBody()).toEqual({
      error: "Sync is running",
      errorType: "SERVICE_UNAVAILABLE",
    });
  });

  it("an invalid JSON body answers 400", () => {
    const res = handle(jsonParseError(), null);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res._getBody()).toEqual({ error: "Invalid request body" });
    // The parser's message quotes the body, which may be a password
    const line = onlyLine();
    expect(line).toContain("[WARN] Request refused");
    expect(line).toContain("entity.parse.failed");
    expect(line).not.toContain("hunter2");
  });

  it("a body over the limit answers 413, and another exposed 4xx its own status", () => {
    const tooLarge = Object.assign(new Error("request entity too large"), {
      type: "entity.too.large",
      status: 413,
      statusCode: 413,
      expose: true,
    });
    const large = handle(tooLarge);
    expect(large.status).toHaveBeenCalledWith(413);
    expect(large._getBody()).toEqual({ error: "Request body too large" });

    // res.sendFile's missing file: send's http-error, with a path in its text
    const missing = Object.assign(
      new Error("ENOENT: no such file, stat '/app/data/downloads/9.zip'"),
      { status: 404, statusCode: 404, expose: true, code: "ENOENT" }
    );
    const notFound = handle(missing);
    expect(notFound.status).toHaveBeenCalledWith(404);
    expect(notFound._getBody()).toEqual({ error: "Not Found" });
  });

  it("after headers are sent it destroys the response and writes nothing", () => {
    const req = Object.assign(reqFor(asRouteHandler, { user: testUser() }), {
      method: "GET",
      path: "/api/downloads/9/file",
    });
    const res = Object.assign(resFor(asRouteHandler), {
      headersSent: true,
      destroy: vi.fn(),
    });

    errorHandler(prismaError("P2002", "Unique"), req, res, vi.fn());

    expect(res.destroy).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(onlyLine()).toContain("[WARN] Error after response started");
  });
});
