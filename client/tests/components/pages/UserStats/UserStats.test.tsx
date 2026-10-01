import { MemoryRouter } from "react-router-dom";
import type { UserStatsResponse } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api";
import { queryKeys } from "@/api/queryKeys";
import UserStats from "@/components/pages/UserStats/UserStats";
import { showError } from "@/utils/toast";

vi.mock("@/api", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  apiGet: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("@/utils/toast", () => ({ showError: vi.fn() }));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

const apiGetMock = vi.mocked(apiGet);

const topScene = (title: string) => ({
  id: "1",
  instanceId: "a",
  title,
  filePath: null,
  imageUrl: null,
  playDuration: 60,
  playCount: 1,
  oCount: 0,
  score: 50,
});

const response = (
  engagement: Partial<UserStatsResponse["engagement"]>,
  topScenes: UserStatsResponse["topScenes"] = []
): UserStatsResponse => ({
  library: {
    sceneCount: 10,
    performerCount: 4,
    studioCount: 3,
    tagCount: 2,
    galleryCount: 1,
    imageCount: 5,
    clipCount: 0,
  },
  engagement: {
    totalWatchTime: 0,
    totalPlayCount: 0,
    totalOCount: 0,
    totalImagesViewed: 0,
    uniqueScenesWatched: 0,
    ...engagement,
  },
  topScenes,
  topPerformers: [],
  topStudios: [],
  topTags: [],
  mostWatchedScene: null,
  mostViewedImage: null,
  mostOdScene: null,
  mostOdPerformer: null,
});

/** Renders the page with the default sort's answer already in the cache */
const renderStats = (data: UserStatsResponse) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData([...queryKeys.user.stats(), "engagement"], data);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserStats />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("UserStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("with totalPlayCount 0 and totalImagesViewed 0 shows the empty state", () => {
    renderStats(response({}));

    expect(screen.getByText("No engagement data yet")).toBeTruthy();
    expect(screen.queryByText("Top Content")).toBeNull();
    expect(screen.getByText("Library")).toBeTruthy();
  });

  it("with a play shows the engagement sections", () => {
    renderStats(response({ totalPlayCount: 3 }));

    expect(screen.queryByText("No engagement data yet")).toBeNull();
    expect(screen.getByText("Top Content")).toBeTruthy();
  });

  it("with images viewed and no plays shows the engagement sections", () => {
    renderStats(response({ totalImagesViewed: 2 }));

    expect(screen.queryByText("No engagement data yet")).toBeNull();
  });

  it("the Refresh spinner stays until the refreshed answer arrives, then the new Top lists show", async () => {
    let answer: (stats: UserStatsResponse) => void = () => undefined;
    apiGetMock.mockReturnValue(
      new Promise<UserStatsResponse>((resolve) => {
        answer = resolve;
      })
    );
    renderStats(response({ totalPlayCount: 3 }, [topScene("Old Top Scene")]));
    const button = screen.getByLabelText("Refresh stats");
    expect(screen.getByText("Old Top Scene")).toBeTruthy();

    fireEvent.click(button);

    expect(apiGetMock).toHaveBeenCalledWith(
      "/user-stats?refresh=1",
      expect.any(AbortSignal)
    );
    expect(
      button.querySelector("svg")?.classList.contains("animate-spin")
    ).toBe(true);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("New Top Scene")).toBeNull();

    await act(() => {
      answer(response({ totalPlayCount: 4 }, [topScene("New Top Scene")]));
      return Promise.resolve();
    });

    expect(screen.getByText("New Top Scene")).toBeTruthy();
    expect(screen.queryByText("Old Top Scene")).toBeNull();
    expect(
      button.querySelector("svg")?.classList.contains("animate-spin")
    ).toBe(false);
  });

  it("a failed refresh shows an error toast, keeps the page and clears the spinner", async () => {
    apiGetMock.mockRejectedValue(new Error("Server down"));
    renderStats(response({ totalPlayCount: 3 }, [topScene("Old Top Scene")]));
    const button = screen.getByLabelText("Refresh stats");

    await act(() => {
      fireEvent.click(button);
      return Promise.resolve();
    });

    expect(showError).toHaveBeenCalledWith("Server down");
    expect(screen.getByText("Old Top Scene")).toBeTruthy();
    expect(
      button.querySelector("svg")?.classList.contains("animate-spin")
    ).toBe(false);
  });
});
