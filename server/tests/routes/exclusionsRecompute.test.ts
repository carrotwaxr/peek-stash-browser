/**
 * POST /api/exclusions/recompute-all: a user whose recompute failed is named
 * by id; the caught error's text (Prisma's included) stays in the log.
 */
import type { NextFunction, Request, Response } from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as authModule from "../../middleware/auth.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { startTestApp } from "../helpers/httpTestApp.js";

vi.mock("../../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof authModule>();
  return {
    ...actual,
    authenticate: (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: unknown }).user = {
        id: 2,
        username: "admin",
        role: "ADMIN",
      };
      next();
    },
  };
});

vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: { recomputeAllUsers: vi.fn() },
}));

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockService = vi.mocked(exclusionComputationService, true);

describe("POST /api/exclusions/recompute-all", () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const { default: routes } = await import("../../routes/exclusions.js");
    ({ baseUrl, close } = await startTestApp((app) => {
      app.use("/api/exclusions", routes);
      app.use(errorHandler);
    }));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names a failed user by id and echoes no error text", async () => {
    mockService.recomputeAllUsers.mockResolvedValue({
      success: 2,
      failed: 1,
      errors: [
        {
          userId: 7,
          error:
            "Invalid `prisma.userExcludedEntity.createMany()` invocation in /app/services/x.ts",
        },
      ],
    });

    const res = await fetch(`${baseUrl}/api/exclusions/recompute-all`, {
      method: "POST",
    });
    const body = (await res.json()) as { errors: unknown };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: false, success: 2, failed: 1 });
    expect(body.errors).toEqual([{ userId: 7 }]);
    expect(JSON.stringify(body)).not.toContain("prisma");
  });
});
