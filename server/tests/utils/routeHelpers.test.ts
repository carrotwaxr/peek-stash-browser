/**
 * authenticated() is the last guard before a handler that reads `req.user`
 * (item 77): without a signed-in user it answers 401 and never calls the
 * handler, so a route that lost its authenticate middleware fails closed and
 * handlers need no sign-in check of their own.
 */
import { describe, expect, it, vi } from "vitest";
import type { TypedLibraryRequest } from "../../types/api/express.js";
import type {
  ApiErrorResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import {
  LIBRARY_HANDLER,
  authenticated,
  libraryHandler,
} from "../../utils/routeHelpers.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../helpers/controllerTestUtils.js";

/** A handler as the controllers write them: it reads the signed-in user. */
const handler = vi.fn(
  (
    req: TypedAuthRequest<unknown, { sceneId: string }>,
    res: TypedResponse<{ userId: number } | ApiErrorResponse>
  ): Promise<void> => {
    res.json({ userId: req.user.id });
    return Promise.resolve();
  }
);

describe("authenticated()", () => {
  it("answers 401 and never calls the handler when req.user is missing", async () => {
    handler.mockClear();
    const req = reqFor(handler, { params: { sceneId: "1" } });
    const res = resFor(handler);
    const next = vi.fn();

    await authenticated(handler)(req, res, next);

    expect(handler).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res._getStatus()).toBe(401);
    expect(res._getErrorBody()).toEqual({ error: "Unauthorized" });
  });

  it("answers 401 when req.user has no id", async () => {
    handler.mockClear();
    const req = reqFor(handler, {
      params: { sceneId: "1" },
      user: malformed({}),
    });
    const res = resFor(handler);

    await authenticated(handler)(req, res, vi.fn());

    expect(handler).not.toHaveBeenCalled();
    expect(res._getStatus()).toBe(401);
    expect(res._getErrorBody()).toEqual({ error: "Unauthorized" });
  });

  it("calls the handler when req.user is set", async () => {
    handler.mockClear();
    const req = reqFor(handler, {
      params: { sceneId: "1" },
      user: testUser({ id: 7 }),
    });
    const res = resFor(handler);
    const next = vi.fn();

    await authenticated(handler)(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(res._getStatus()).toBe(200);
    expect(res._getOkBody()).toEqual({ userId: 7 });
  });

  it("passes the handler's rejection back, so Express 5 hands it to the error handler", async () => {
    const failing = (
      _req: TypedAuthRequest,
      _res: TypedResponse<ApiErrorResponse>
    ): Promise<void> => Promise.reject(new Error("database is locked"));
    const req = reqFor(failing, { user: testUser() });

    await expect(
      Promise.resolve(authenticated(failing)(req, resFor(failing), vi.fn()))
    ).rejects.toThrow("database is locked");
  });
});

/** A list handler: it reads the instances a readiness middleware resolved. */
const listHandler = vi.fn(
  (
    req: TypedLibraryRequest,
    res: TypedResponse<{ instances: readonly string[] } | ApiErrorResponse>
  ): Promise<void> => {
    res.json({ instances: req.allowedInstanceIds });
    return Promise.resolve();
  }
);

describe("libraryHandler()", () => {
  it("libraryHandler rejects with an error naming the missing middleware when no middleware set the instances", async () => {
    listHandler.mockClear();
    const req = reqFor(listHandler, { user: testUser() });
    const res = resFor(listHandler);

    await expect(
      Promise.resolve(libraryHandler(listHandler)(req, res, vi.fn()))
    ).rejects.toThrow(
      "allowedInstanceIds missing: the route needs requireCacheReady, requirePickerReady or withAllowedInstances"
    );
    expect(listHandler).not.toHaveBeenCalled();
  });

  it("answers 401 and never calls the handler when req.user is missing", async () => {
    listHandler.mockClear();
    const req = reqFor(listHandler, { allowedInstanceIds: ["inst-a"] });
    const res = resFor(listHandler);

    await libraryHandler(listHandler)(req, res, vi.fn());

    expect(listHandler).not.toHaveBeenCalled();
    expect(res._getStatus()).toBe(401);
  });

  it("calls the handler with the request's instances, an empty list included", async () => {
    for (const instances of [["inst-a", "inst-b"], []]) {
      listHandler.mockClear();
      const req = reqFor(listHandler, {
        user: testUser(),
        allowedInstanceIds: instances,
      });
      const res = resFor(listHandler);
      const next = vi.fn();

      await libraryHandler(listHandler)(req, res, next);

      expect(listHandler).toHaveBeenCalledWith(req, res, next);
      expect(res._getOkBody()).toEqual({ instances });
    }
  });

  it("tags what it returns, for the route guard check", () => {
    expect(libraryHandler(listHandler)[LIBRARY_HANDLER]).toBe(true);
    expect(LIBRARY_HANDLER in authenticated(handler)).toBe(false);
  });
});
