/**
 * The startup step for playlist zips: an interrupted zip is resumed and stray
 * files are swept, and neither failing stops the server from starting.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resumeDownloadsAtStartup } from "../../initializers/downloads.js";
import { sweepOrphanedDownloadFiles } from "../../jobs/downloadCleanup.js";
import { recoverPendingDownloads } from "../../services/DownloadJobQueue.js";
import { logger } from "../../utils/logger.js";
import { stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";

vi.mock("../../services/DownloadJobQueue.js", () => ({
  recoverPendingDownloads: vi.fn(),
}));

vi.mock("../../jobs/downloadCleanup.js", () => ({
  sweepOrphanedDownloadFiles: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockRecover = vi.mocked(recoverPendingDownloads, true);
const mockSweep = vi.mocked(sweepOrphanedDownloadFiles, true);

describe("resumeDownloadsAtStartup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecover.mockResolvedValue(undefined);
    mockSweep.mockResolvedValue(undefined);
  });

  it("resumes the interrupted zips, then sweeps the stray files", async () => {
    await resumeDownloadsAtStartup();

    const recovered = must(mockRecover.mock.invocationCallOrder[0]);
    const swept = must(mockSweep.mock.invocationCallOrder[0]);
    expect(recovered).toBeLessThan(swept);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("a failed recovery is logged, and the sweep still runs and startup goes on", async () => {
    mockRecover.mockRejectedValue(new Error("database is locked"));

    await expect(resumeDownloadsAtStartup()).resolves.toBeUndefined();

    expect(mockSweep).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      stringContaining("interrupted playlist zips"),
      { error: "database is locked" }
    );
  });

  it("a failed sweep is logged and startup goes on", async () => {
    mockSweep.mockRejectedValue(new Error("EACCES"));

    await expect(resumeDownloadsAtStartup()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      stringContaining("stray download files"),
      { error: "EACCES" }
    );
  });
});
