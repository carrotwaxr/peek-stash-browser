/**
 * GET /api/library/ready: the re-check the client polls while the library
 * is initializing. It answers 200 either way, with the same test as
 * requireCacheReady.
 */
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as authModule from "../../../middleware/auth.js";
import { getUserAllowedInstanceIds } from "../../../services/UserInstanceService.js";
import {
  findHandler,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";

vi.mock("../../../middleware/auth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof authModule>()),
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
}));

vi.mock("../../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn(),
}));

const mockAllowedInstances = vi.mocked(getUserAllowedInstanceIds);

async function readyHandler() {
  const { default: router } = await import("../../../routes/library/ready.js");
  return findHandler(router, "get", "/ready");
}

describe("GET /api/library/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers ready false while the user has no instance past its first sync", async () => {
    mockAllowedInstances.mockResolvedValue([]);
    const handler = await readyHandler();
    const res = resFor(handler);

    await handler(
      reqFor(handler, { user: testUser({ id: 7 }) }),
      res,
      () => {}
    );

    expect(mockAllowedInstances).toHaveBeenCalledExactlyOnceWith(7);
    expect(res.status).not.toHaveBeenCalled();
    expect(res._getBody()).toEqual({ ready: false });
  });

  it("answers ready true once one of the user's instances can be shown", async () => {
    mockAllowedInstances.mockResolvedValue(["inst-a"]);
    const handler = await readyHandler();
    const res = resFor(handler);

    await handler(
      reqFor(handler, { user: testUser({ id: 7 }) }),
      res,
      () => {}
    );

    expect(res._getBody()).toEqual({ ready: true });
  });
});
