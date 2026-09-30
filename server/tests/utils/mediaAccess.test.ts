/**
 * The access check for a media request looks at the instance the request
 * names, and a request names exactly one well-formed instance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canUserAccessEntity,
  canUserSeeApartFromOwnHides,
} from "../../services/EntityAccessService.js";
import {
  canUserLoadMedia,
  isValidInstanceId,
} from "../../utils/mediaAccess.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn(),
  canUserSeeApartFromOwnHides: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockCanUserAccessEntity = vi.mocked(canUserAccessEntity);
const mockApartFromOwnHides = vi.mocked(canUserSeeApartFromOwnHides);

describe("isValidInstanceId", () => {
  it("accepts one well-formed id, `default` included, and nothing else", () => {
    expect(isValidInstanceId("default")).toBe(true);
    expect(isValidInstanceId("cmfxyz123_-A")).toBe(true);
    expect(isValidInstanceId(undefined)).toBe(false);
    expect(isValidInstanceId("")).toBe(false);
    expect(isValidInstanceId("inst a")).toBe(false);
    expect(isValidInstanceId(["a", "b"])).toBe(false);
  });
});

describe("canUserLoadMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks every entity on the instance the request names", async () => {
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

  it("sets aside only the user's own hides when asked, on every entity", async () => {
    mockApartFromOwnHides.mockResolvedValue(true);

    expect(
      await canUserLoadMedia(
        7,
        [
          { entityType: "scene", entityId: "2587" },
          { entityType: "clip", entityId: "429" },
        ],
        "default",
        "apartFromOwnHides"
      )
    ).toBe(true);
    expect(mockApartFromOwnHides.mock.calls).toEqual([
      [7, "scene", "2587", "default"],
      [7, "clip", "429", "default"],
    ]);
    expect(mockCanUserAccessEntity).not.toHaveBeenCalled();

    mockApartFromOwnHides.mockResolvedValueOnce(false);
    expect(
      await canUserLoadMedia(
        7,
        [{ entityType: "scene", entityId: "2587" }],
        "default",
        "apartFromOwnHides"
      )
    ).toBe(false);
  });
});
