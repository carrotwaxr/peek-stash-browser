/**
 * ScenesLikeThis (item 26): the Similar Scenes tab reads through the
 * useSimilarScenes query, keyed by the scene's instance and page, which the
 * RecommendedSidebar shares, so page 1 is requested once per scene.
 */
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api";
import RecommendedSidebar from "@/components/ui/RecommendedSidebar";
import ScenesLikeThis from "@/components/ui/ScenesLikeThis";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

// Pagination needs the TV-mode provider; the request count is what matters here
vi.mock("@/components/ui/Pagination", () => ({
  default: () => null,
}));

vi.mock("@/components/scene-search/SceneGrid", () => ({
  default: ({ scenes }: { scenes: Array<{ id: string }> }) => (
    <div data-testid="scene-grid">{scenes.map((s) => s.id).join(",")}</div>
  ),
}));

const mockApiGet = vi.mocked(apiGet);

const EMPTY = { scenes: [], count: 0, page: 1, perPage: 12 };

function renderUnderOneClient(ui: React.ReactNode, url = "/scene/7") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ScenesLikeThis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(EMPTY);
  });

  it("the tab and the sidebar share one request for page 1", async () => {
    renderUnderOneClient(
      <>
        <RecommendedSidebar sceneId="7" instanceId="a" />
        <ScenesLikeThis sceneId="7" instanceId="a" />
      </>
    );

    await screen.findByText("No similar scenes found");
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(must(mockApiGet.mock.calls[0])[0]).toBe(
      "/library/scenes/7/similar?instanceId=a&page=1"
    );
  });

  it("requests the page from the URL and reports the count", async () => {
    const onCountChange = vi.fn();
    mockApiGet.mockResolvedValue({
      scenes: [{ id: "s2", instanceId: "a" }],
      count: 13,
      page: 2,
      perPage: 12,
    });

    renderUnderOneClient(
      <ScenesLikeThis
        sceneId="7"
        instanceId="a"
        onCountChange={onCountChange}
      />,
      "/scene/7?page=2"
    );

    await waitFor(() =>
      expect(screen.getByTestId("scene-grid")).toHaveTextContent("s2")
    );
    expect(must(mockApiGet.mock.calls[0])[0]).toBe(
      "/library/scenes/7/similar?instanceId=a&page=2"
    );
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(13));
  });
});
