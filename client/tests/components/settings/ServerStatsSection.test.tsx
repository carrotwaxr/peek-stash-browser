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
        user: { id: 1, username: "admin", role: "ADMIN" },
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
