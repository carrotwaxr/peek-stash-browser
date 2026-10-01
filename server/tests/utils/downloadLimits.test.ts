import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedScene } from "../../types/index.js";
import {
  maxPlaylistBytes,
  plannedZipBytes,
} from "../../utils/downloadLimits.js";
import { logger } from "../../utils/logger.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const MIB = 1024n * 1024n;

describe("maxPlaylistBytes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is 10240 MiB when the variable is unset", () => {
    expect(maxPlaylistBytes({})).toBe(10240n * MIB);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("reads the variable in MiB", () => {
    expect(maxPlaylistBytes({ MAX_PLAYLIST_DOWNLOAD_SIZE_MB: "500" })).toBe(
      500n * MIB
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each(["abc", "0", "-5", ""])(
    "%j gives the default with one warning",
    (value) => {
      expect(maxPlaylistBytes({ MAX_PLAYLIST_DOWNLOAD_SIZE_MB: value })).toBe(
        10240n * MIB
      );
      expect(logger.warn).toHaveBeenCalledTimes(1);
    }
  );
});

describe("plannedZipBytes", () => {
  it("sums each scene's first file, a missing size counting 0", () => {
    const scene = (id: string, instanceId: string, size?: number) =>
      partialRow<NormalizedScene>({
        id,
        instanceId,
        files: size === undefined ? [] : [partialRow({ size })],
      });

    expect(
      plannedZipBytes([
        scene("s1", "inst-a", 100),
        scene("s1", "inst-b", 1000),
        scene("s2", "inst-a"),
      ])
    ).toBe(1100n);
    expect(plannedZipBytes([])).toBe(0n);
  });
});
