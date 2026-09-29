/**
 * authenticated() is the last guard before a handler that reads `req.user`
 * (item 77): without a signed-in user it answers 401 and never calls the
 * handler, so a route that lost its authenticate middleware fails closed and
 * handlers need no sign-in check of their own.
 */
import { describe, expect, it, vi } from "vitest";
import type {
  ApiErrorResponse,
  TypedAuthRequest,
  TypedResponse,
} from "../../types/api/index.js";
import { authenticated } from "../../utils/routeHelpers.js";
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
