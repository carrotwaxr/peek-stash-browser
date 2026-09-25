/**
 * The access check for a media request looks at the instance the request is
 * served from: the one it names, or the highest-priority enabled instance
 * when it names none. "default" is an ordinary instance id (the owner's).
 */
import type { StashInstance } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { canUserAccessEntity } from "../../services/EntityAccessService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  canUserLoadMedia,
  resolveMediaInstanceId,
} from "../../utils/mediaAccess.js";
import { stashInstanceRow } from "../helpers/fixtures.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockCanUserAccessEntity = vi.mocked(canUserAccessEntity);

const TOP_PRIORITY = stashInstanceRow({ id: "b", priority: 0 });
const NAMED_DEFAULT = stashInstanceRow({ id: "default", priority: 5 });

/** Load `rows` into the real instance manager, in priority order. */
async function loadInstances(...rows: StashInstance[]): Promise<void> {
  mockPrisma.stashInstance.findMany.mockResolvedValue(rows);
  await stashInstanceManager.reload();
}

describe("resolveMediaInstanceId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is `default` for a request that names `default`, when another instance has the top priority", async () => {
    await loadInstances(TOP_PRIORITY, NAMED_DEFAULT);

    expect(resolveMediaInstanceId("default")).toBe("default");
    expect(resolveMediaInstanceId("b")).toBe("b");
  });

  it("is the highest-priority enabled instance for a request that names none", async () => {
    await loadInstances(TOP_PRIORITY, NAMED_DEFAULT);

    expect(resolveMediaInstanceId(undefined)).toBe("b");
  });

  it("the owner's setup, `default` alone at priority 0: `default` whether named or not", async () => {
    await loadInstances({ ...NAMED_DEFAULT, priority: 0 });

    expect(resolveMediaInstanceId("default")).toBe("default");
    expect(resolveMediaInstanceId(undefined)).toBe("default");
  });
});

describe("canUserLoadMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks every entity on the instance the request names", async () => {
    await loadInstances(TOP_PRIORITY, NAMED_DEFAULT);
    mockCanUserAccessEntity.mockResolvedValue(true);

    const allowed = await canUserLoadMedia(
      7,
      [
        { entityType: "scene", entityId: "2587" },
        { entityType: "clip", entityId: "429" },
      ],
      "default"
    );

    expect(allowed).toBe(true);
    expect(mockCanUserAccessEntity.mock.calls).toEqual([
      [7, "scene", "2587", "default"],
      [7, "clip", "429", "default"],
    ]);
  });

  it("refuses when any entity is refused, and when the path names none", async () => {
    await loadInstances(TOP_PRIORITY, NAMED_DEFAULT);
    mockCanUserAccessEntity.mockImplementation((_user, entityType) =>
      Promise.resolve(entityType === "scene")
    );

    expect(
      await canUserLoadMedia(
        7,
        [
          { entityType: "scene", entityId: "2587" },
          { entityType: "clip", entityId: "429" },
        ],
        "default"
      )
    ).toBe(false);
    expect(await canUserLoadMedia(7, [], "default")).toBe(false);
  });
});
