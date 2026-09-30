/**
 * ScenesLikeThis (item 26): the Similar Scenes tab reads through the
 * useSimilarScenes query, keyed by the scene's instance and page, which the
 * RecommendedSidebar shares, so page 1 is requested once per scene.
 */
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api";
import { ApiError } from "@/api/client";
import { LIBRARY_READY_POLL_MS } from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import RecommendedSidebar from "@/components/ui/RecommendedSidebar";
import ScenesLikeThis from "@/components/ui/ScenesLikeThis";
import { jsonResponse, stubApi } from "../../helpers/stubApi";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

// Pagination needs the TV-mode provider; the request count is what matters here
vi.mock("@/components/ui/Pagination", () => ({
  default: ({
    onPageChange,
    currentPage,
  }: {
    onPageChange: (page: number) => void;
    currentPage: number;
  }) => (
    <div>
      <span>page {currentPage}</span>
      <button onClick={() => onPageChange(1)}>first page</button>
      <button onClick={() => onPageChange(3)}>third page</button>
    </div>
  ),
}));

vi.mock("@/components/scene-search/SceneGrid", () => ({
  default: ({
    scenes,
    onHideSuccess,
  }: {
    scenes: Array<{ id: string }>;
    onHideSuccess: (
      id: string,
      entityType: string,
      instanceId?: string
    ) => void;
  }) => (
    <div data-testid="scene-grid">
      {scenes.map((s) => s.id).join(",")}
      <button onClick={() => onHideSuccess("s2", "scene", "a")}>hide s2</button>
    </div>
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("while the library initializes the tab and the sidebar wait, then show the scenes", async () => {
    vi.useFakeTimers();
    stubApi({ "/library/ready": () => jsonResponse(200, { ready: true }) });
    mockApiGet.mockRejectedValueOnce(
      new ApiError("Server is initializing", 503, { ready: false })
    );
    mockApiGet.mockResolvedValue({
      scenes: [{ id: "s2", instanceId: "a" }],
      count: 1,
      page: 1,
      perPage: 12,
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/scene/7"]}>
          <ScenesLikeThis sceneId="7" instanceId="a" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.queryByText("Failed to load similar scenes")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIBRARY_READY_POLL_MS + 50);
    });
    expect(screen.getByTestId("scene-grid")).toHaveTextContent("s2");
  });

  it("a failed similar scenes request shows the failure text", async () => {
    mockApiGet.mockRejectedValue(new ApiError("Boom", 500));

    renderUnderOneClient(<ScenesLikeThis sceneId="7" instanceId="a" />);

    expect(
      await screen.findByText("Failed to load similar scenes")
    ).toBeInTheDocument();
  });

  it("a scene hidden from the grid leaves the list", async () => {
    mockApiGet.mockResolvedValue({
      scenes: [
        { id: "s1", instanceId: "a" },
        { id: "s2", instanceId: "a" },
      ],
      count: 2,
      page: 1,
      perPage: 12,
    });

    renderUnderOneClient(<ScenesLikeThis sceneId="7" instanceId="a" />);

    await waitFor(() =>
      expect(screen.getByTestId("scene-grid")).toHaveTextContent("s1,s2")
    );
    fireEvent.click(screen.getByText("hide s2"));
    expect(screen.getByTestId("scene-grid")).toHaveTextContent(/^s1hide/);
  });

  it("paging moves the tab to that page, and the first page drops the page param", async () => {
    mockApiGet.mockResolvedValue({
      scenes: [{ id: "s2", instanceId: "a" }],
      count: 40,
      page: 2,
      perPage: 12,
    });

    renderUnderOneClient(
      <ScenesLikeThis sceneId="7" instanceId="a" />,
      "/scene/7?page=2"
    );

    await waitFor(() => expect(screen.getAllByText("page 2")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("third page")[0] as HTMLElement);
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith(
        "/library/scenes/7/similar?instanceId=a&page=3"
      )
    );
    await waitFor(() => expect(screen.getAllByText("page 3")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("first page")[0] as HTMLElement);
    await waitFor(() =>
      expect(mockApiGet).toHaveBeenLastCalledWith(
        "/library/scenes/7/similar?instanceId=a&page=1"
      )
    );
  });

  it("opening another scene from page 2 starts its similar scenes on page 1", async () => {
    mockApiGet.mockResolvedValue({
      scenes: [{ id: "s2", instanceId: "a" }],
      count: 40,
      page: 2,
      perPage: 12,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const tree = (sceneId: string) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/scene/7?page=2"]}>
          <ScenesLikeThis sceneId={sceneId} instanceId="a" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(tree("7"));
    await waitFor(() => expect(screen.getAllByText("page 2")).toHaveLength(2));

    rerender(tree("8"));

    await waitFor(() =>
      expect(mockApiGet).toHaveBeenCalledWith(
        "/library/scenes/8/similar?instanceId=a&page=1"
      )
    );
    expect(mockApiGet).not.toHaveBeenCalledWith(
      "/library/scenes/8/similar?instanceId=a&page=2"
    );
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
