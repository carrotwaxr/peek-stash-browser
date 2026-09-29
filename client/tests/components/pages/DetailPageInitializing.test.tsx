/**
 * A detail page opened while the server's first sync runs: the lookup gets
 * 503 `ready: false`, and the page shows the library-initializing notice
 * (not "Could not load"), then the entity once the library is ready.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { LIBRARY_READY_POLL_MS } from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import GroupDetail from "@/components/pages/GroupDetail";
import { jsonResponse, stubApi } from "../../helpers/stubApi";

const { findGroupById } = vi.hoisted(() => ({
  findGroupById: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/api", () => ({
  libraryApi: { findGroupById, updateRating: vi.fn(), updateFavorite: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useNavigationState", () => ({
  useNavigationState: () => ({ goBack: vi.fn(), backButtonText: "Back" }),
}));
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({ getSettings: () => ({}) }),
}));
vi.mock("@/components/grids/index", () => ({ PerformerGrid: () => null }));
vi.mock("@/components/scene-search/SceneSearch", () => ({
  default: () => null,
}));

describe("a detail page while the library is initializing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the notice, not the error page, and loads once the library is ready", async () => {
    stubApi({ "/library/ready": () => jsonResponse(200, { ready: true }) });
    findGroupById
      .mockRejectedValueOnce(
        new ApiError("Server is initializing", 503, { ready: false })
      )
      .mockResolvedValue({ id: "3", instanceId: "a", name: "Big Group" });

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/group/3"]}>
          <Routes>
            <Route path="/group/:groupId" element={<GroupDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByText(/Server is syncing library/)).toBeTruthy();
    expect(screen.queryByText(/Could not load/)).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIBRARY_READY_POLL_MS + 50);
    });
    expect(screen.queryByText(/Server is syncing library/)).toBeNull();
    expect(screen.getAllByText("Big Group").length).toBeGreaterThan(0);
  });
});
