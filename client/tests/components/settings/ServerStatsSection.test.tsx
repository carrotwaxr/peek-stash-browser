import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createAuthValue } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api/client";
import ServerStatsSection from "../../../src/components/settings/ServerStatsSection";
import { useAuth } from "../../../src/hooks/useAuth";
import { showError } from "../../../src/utils/toast";

vi.mock("../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

type ApiMock = (...args: unknown[]) => Promise<unknown>;
const mockApiGet = vi.fn<ApiMock>();
const mockApiPost = vi.fn<ApiMock>();
vi.mock("../../../src/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

/** GET /stats, with the sync `isRefreshing` or not. */
function stats(isRefreshing = false) {
  return {
    system: {
      uptime: "1h",
      cpuCount: 4,
      usedMemory: "1 GB",
      memoryUsagePercent: "25",
    },
    process: { heapUsed: "100 MB", heapUsedPercent: "10" },
    cache: {
      isRefreshing,
      isInitialized: true,
      lastRefreshed: "2026-09-24T09:00:00.000Z",
      counts: {
        scenes: 10,
        performers: 5,
        studios: 2,
        tags: 7,
        galleries: 1,
        groups: 1,
        images: 20,
        clips: 3,
        ungeneratedClips: 0,
      },
    },
    database: { size: "10 MB" },
  };
}

const statsCalls = () =>
  mockApiGet.mock.calls.filter(([endpoint]) => endpoint === "/stats").length;

/** Sets what `document.visibilityState` reads, and tells the page. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("ServerStatsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue(
      createAuthValue({
        isAuthenticated: true,
        user: { id: 1, username: "admin", role: "ADMIN", setupCompleted: true },
      })
    );
    mockApiGet.mockResolvedValue(stats());
    mockApiPost.mockResolvedValue({
      success: true,
      message: "Cache refresh initiated",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // Back to happy-dom's own getter
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("Full Sync asks for confirmation and Cancel sends nothing", async () => {
    render(<ServerStatsSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Full Sync" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/every item from every Stash/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("confirming starts the sync and tells the page", async () => {
    const onSyncStarted = vi.fn();
    render(<ServerStatsSection onSyncStarted={onSyncStarted} />);

    fireEvent.click(await screen.findByRole("button", { name: "Full Sync" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Start Full Sync",
      })
    );

    await waitFor(() => {
      expect(onSyncStarted).toHaveBeenCalledTimes(1);
    });
    expect(mockApiPost.mock.calls).toEqual([["/stats/refresh-cache"]]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a 409 shows 'A sync is already running'", async () => {
    mockApiPost.mockRejectedValue(
      new ApiError("A sync is already running", 409, {
        error: "A sync is already running",
      })
    );
    render(<ServerStatsSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Full Sync" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Start Full Sync",
      })
    );

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("A sync is already running");
    });
  });

  it("does not poll /stats while the document is hidden and resumes when visible", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<ServerStatsSection />);
    await screen.findByRole("button", { name: "Full Sync" });
    expect(statsCalls()).toBe(1);

    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(statsCalls()).toBe(1);

    // Back on the page: one refresh at once, then every 10 s again
    act(() => {
      setVisibility("visible");
    });
    expect(statsCalls()).toBe(2);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(statsCalls()).toBe(3);
  });

  it("tells the page when its poll sees a sync start", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const onSyncStarted = vi.fn();
    render(<ServerStatsSection onSyncStarted={onSyncStarted} />);
    await screen.findByRole("button", { name: "Full Sync" });

    mockApiGet.mockResolvedValue(stats(true));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    await waitFor(() => {
      expect(onSyncStarted).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Syncing...")).toBeInTheDocument();
  });
});

describe("ServerStatsSection Re-probe Clips", () => {
  const NO_MISSES = {
    placeholder: 0,
    notFound: 0,
    tooSmall: 0,
    fetchError: 0,
    noPreviewPath: 0,
  };

  /** What the server answers a re-probe with, from the fields a test sets */
  function reprobeAnswer(answer: {
    checked: number;
    updated: number;
    misses?: Partial<typeof NO_MISSES>;
    firstError?: string;
  }) {
    return {
      ok: true,
      message: "Re-probed",
      ...answer,
      misses: { ...NO_MISSES, ...answer.misses },
    };
  }

  /** GET /stats with 1,682 clips pending previews */
  function statsWithPendingClips(count: number) {
    const base = stats();
    return {
      ...base,
      cache: {
        ...base.cache,
        counts: { ...base.cache.counts, ungeneratedClips: count },
      },
    };
  }

  /** Clicks Re-probe Clips with the server answering `answer`; returns the result banner */
  async function reprobe(answer: ReturnType<typeof reprobeAnswer>) {
    mockApiGet.mockResolvedValue(statsWithPendingClips(1682));
    mockApiPost.mockResolvedValue(answer);
    render(<ServerStatsSection />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Re-probe Clips" })
    );
    const summary = await screen.findByText(/^Checked /);
    const banner = summary.closest("[role]");
    if (!banner) throw new Error("the result banner is missing");
    return banner;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue(
      createAuthValue({
        isAuthenticated: true,
        user: { id: 1, username: "admin", role: "ADMIN", setupCompleted: true },
      })
    );
  });

  it("asks the server to re-probe every instance, naming none", async () => {
    await reprobe(reprobeAnswer({ checked: 3, updated: 3 }));

    expect(mockApiPost).toHaveBeenCalledWith("/sync/reprobe-clips", {});
  });

  it("success with no misses shows the count and no hint", async () => {
    const banner = await reprobe(
      reprobeAnswer({ checked: 1682, updated: 1682 })
    );

    expect(banner).toHaveTextContent(
      "Checked 1,682 clips, 1,682 now have previews."
    );
    expect(banner).not.toHaveTextContent("Still without a preview");
    expect(banner.getAttribute("style")).toContain("--status-success");
  });

  it("some updated and some missed stays a success, with the breakdown", async () => {
    const banner = await reprobe(
      reprobeAnswer({
        checked: 1682,
        updated: 100,
        misses: { placeholder: 1500, notFound: 80, noPreviewPath: 2 },
      })
    );

    expect(banner.getAttribute("style")).toContain("--status-success");
    expect(banner).toHaveTextContent(
      "Still without a preview: 1,500 waiting on Stash to generate, 80 not found, 2 with no preview address."
    );
  });

  it("mostly fetch errors: reach hint with the first error, as a warning", async () => {
    const banner = await reprobe(
      reprobeAnswer({
        checked: 1682,
        updated: 0,
        misses: { fetchError: 1600, notFound: 82 },
        firstError: "Home: Stash answered HTTP 401",
      })
    );

    expect(banner.getAttribute("style")).toContain("--status-warning");
    expect(banner).toHaveTextContent(
      "Peek couldn't reach 1,600 previews on Stash (first error: Home: Stash answered HTTP 401). Check the Stash URL and API key under Settings > Server Configuration > Stash Instances."
    );
  });

  it("mostly placeholders and small files: generate marker previews hint", async () => {
    const banner = await reprobe(
      reprobeAnswer({
        checked: 1682,
        updated: 0,
        // 600 + 700 together outweigh the 300 unreachable
        misses: { placeholder: 600, tooSmall: 700, fetchError: 300 },
      })
    );

    expect(banner).toHaveTextContent(
      "Stash hasn't generated 1,300 marker previews yet. Run Generate > Marker Previews in Stash (Settings > Tasks), then re-probe."
    );
    expect(banner).not.toHaveTextContent("Peek couldn't reach");
  });

  it("mostly 404s: no preview file hint", async () => {
    const banner = await reprobe(
      reprobeAnswer({
        checked: 1682,
        updated: 0,
        misses: { notFound: 1682 },
      })
    );

    expect(banner).toHaveTextContent(
      "Stash has no preview file for 1,682 clips. Run Generate > Marker Previews in Stash, then re-probe."
    );
  });

  it("a failed request shows the error", async () => {
    mockApiGet.mockResolvedValue(statsWithPendingClips(5));
    mockApiPost.mockRejectedValue(new Error("Cannot re-probe clips"));
    render(<ServerStatsSection />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Re-probe Clips" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot re-probe clips"
    );
  });
});
