import type { UserStatsResponse } from "@peek/shared-types";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserStats from "@/components/pages/UserStats/UserStats";

const stats = vi.hoisted(() => ({ data: null as unknown }));

vi.mock("@/hooks/useUserStats", () => ({
  useUserStats: () => ({
    data: stats.data,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

const response = (
  engagement: Partial<UserStatsResponse["engagement"]>
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
  topScenes: [],
  topPerformers: [],
  topStudios: [],
  topTags: [],
  mostWatchedScene: null,
  mostViewedImage: null,
  mostOdScene: null,
  mostOdPerformer: null,
});

describe("UserStats", () => {
  beforeEach(() => {
    stats.data = null;
  });

  it("with totalPlayCount 0 and totalImagesViewed 0 shows the empty state", () => {
    stats.data = response({});

    renderWithProviders(<UserStats />);

    expect(screen.getByText("No engagement data yet")).toBeTruthy();
    expect(screen.queryByText("Top Content")).toBeNull();
    expect(screen.getByText("Library")).toBeTruthy();
  });

  it("with a play shows the engagement sections", () => {
    stats.data = response({ totalPlayCount: 3 });

    renderWithProviders(<UserStats />);

    expect(screen.queryByText("No engagement data yet")).toBeNull();
    expect(screen.getByText("Top Content")).toBeTruthy();
  });

  it("with images viewed and no plays shows the engagement sections", () => {
    stats.data = response({ totalImagesViewed: 2 });

    renderWithProviders(<UserStats />);

    expect(screen.queryByText("No engagement data yet")).toBeNull();
  });
});
