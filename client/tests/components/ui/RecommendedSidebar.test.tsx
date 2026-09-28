/**
 * RecommendedSidebar (item 26): the sidebar's list is page 1 of the scene's
 * similar scenes, requested with the scene's instance.
 */
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api";
import RecommendedSidebar from "@/components/ui/RecommendedSidebar";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

const mockApiGet = vi.mocked(apiGet);

function renderSidebar(instanceId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RecommendedSidebar sceneId="7" instanceId={instanceId} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RecommendedSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests with the scene's instance", async () => {
    mockApiGet.mockResolvedValue({
      scenes: [{ id: "s1", instanceId: "b", title: "First similar" }],
      count: 1,
      page: 1,
      perPage: 12,
    });

    renderSidebar("b");

    expect(await screen.findByText("First similar")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(must(mockApiGet.mock.calls[0])[0]).toBe(
      "/library/scenes/7/similar?instanceId=b&page=1"
    );
  });

  it("renders nothing when there are no similar scenes", async () => {
    mockApiGet.mockResolvedValue({
      scenes: [],
      count: 0,
      page: 1,
      perPage: 12,
    });

    const { container } = renderSidebar("a");

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
