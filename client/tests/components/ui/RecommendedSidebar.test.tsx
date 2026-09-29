/**
 * RecommendedSidebar (item 26): the sidebar's list is page 1 of the scene's
 * similar scenes, requested with the scene's instance.
 */
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api";
import { ApiError } from "@/api/client";
import RecommendedSidebar from "@/components/ui/RecommendedSidebar";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

const mockApiGet = vi.mocked(apiGet);

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("react-router-dom")),
  useNavigate: () => mockNavigate,
}));

function renderSidebar(instanceId: string, maxHeight?: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RecommendedSidebar
          sceneId="7"
          instanceId={instanceId}
          maxHeight={maxHeight}
        />
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

  it("a similar scene shows its studio, date and duration, and a click opens it", async () => {
    mockApiGet.mockResolvedValue({
      scenes: [
        {
          id: "s1",
          instanceId: "a",
          title: "Rich scene",
          date: "2024-05-06",
          studio: { id: "st", name: "Studio One" },
          files: [{ duration: 3725 }],
          paths: { screenshot: "/shot.jpg" },
        },
        { id: "s2", instanceId: "a", title: "Bare scene", files: [{}] },
      ],
      count: 2,
      page: 1,
      perPage: 12,
    });

    const { container } = renderSidebar("a", 500);

    expect(await screen.findByText("Rich scene")).toBeInTheDocument();
    expect(screen.getByText("Studio One")).toBeInTheDocument();
    expect(screen.getByText("1:02:05")).toBeInTheDocument();
    expect(screen.getByText("Bare scene")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ height: "500px" });

    fireEvent.click(screen.getByText("Rich scene"));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(must(mockNavigate.mock.calls[0])[1]).toMatchObject({
      state: { fromPageTitle: "Recommended" },
    });
  });

  it("shows nothing when the similar scenes request fails", async () => {
    mockApiGet.mockRejectedValue(new ApiError("Boom", 500));

    const { container } = renderSidebar("a");

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("while the library initializes the sidebar shows its loading placeholder, not nothing", async () => {
    mockApiGet.mockRejectedValue(
      new ApiError("Server is initializing", 503, { ready: false })
    );

    renderSidebar("a");

    expect(await screen.findByText("Recommended")).toBeInTheDocument();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });
});
