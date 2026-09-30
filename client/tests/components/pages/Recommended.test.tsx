/**
 * The Recommended page's requests (item 39, UD-R5): one query per page,
 * cancelled when the page is left, and the library-initializing notice in
 * place of a retry loop that outlived the page.
 *
 * These tests stub the network rather than `@/api/hooks`: the behaviour
 * under test is which requests the page sends, and when.
 */
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import Recommended from "@/components/pages/Recommended";
import type * as bannerModule from "@/components/ui/LibraryInitializingBanner";
import {
  initializingResponse,
  jsonResponse,
  requestsTo,
  stubApi,
} from "../../helpers/stubApi";

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: vi.fn(() => ({ isTVMode: false })),
}));

interface MockGridProps {
  scenes: Array<{ id: string; title: string }>;
  loading: boolean;
  error?: string;
  currentPage: number;
  onPageChange: (page: number) => void;
}

vi.mock("@/components/scene-search/SceneGrid", () => ({
  default: ({
    scenes,
    loading,
    error,
    currentPage,
    onPageChange,
  }: MockGridProps) => (
    <div data-testid="scene-grid" data-loading={String(loading)}>
      {error && <p>{error}</p>}
      {scenes.map((scene) => (
        <p key={scene.id}>{scene.title}</p>
      ))}
      <button onClick={() => onPageChange(currentPage + 1)}>Next page</button>
    </div>
  ),
}));

// The initializing notice is the real one
vi.mock("@/components/ui/index", async () => ({
  LibraryInitializingBanner: (
    await vi.importActual<typeof bannerModule>(
      "@/components/ui/LibraryInitializingBanner"
    )
  ).default,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pagination: () => <nav data-testid="pagination" />,
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const RECOMMENDED = "/library/scenes/recommended";
const NOTICE = "Server is syncing library, please wait...";

/** Moves the clock on, running the timers and promises due by then. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/**
 * Lets what is due now finish: TanStack Query tells React about a change
 * on a timer a millisecond later.
 */
const settle = () => advance(50);

const page = (title: string) => ({
  scenes: [{ id: title, title }],
  count: 48,
});

describe("Recommended", () => {
  let client: QueryClient;

  const renderAt = (url: string) =>
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <Recommended />
        </MemoryRouter>
      </QueryClientProvider>
    );

  beforeEach(() => {
    vi.useFakeTimers();
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the recommended scenes of the page in the URL", async () => {
    const fetchMock = stubApi({
      [RECOMMENDED]: () => jsonResponse(200, page("Page two scene")),
    });

    renderAt("/recommended?page=2&per_page=12");
    await settle();

    expect(screen.getByText("Page two scene")).toBeInTheDocument();
    expect(requestsTo(fetchMock, RECOMMENDED)).toEqual([
      `/api${RECOMMENDED}?page=2&per_page=12`,
    ]);
  });

  it("leaving Recommended stops all requests", async () => {
    const fetchMock = stubApi({
      [RECOMMENDED]: () => initializingResponse(),
      "/library/ready": () => jsonResponse(200, { ready: false }),
    });

    const { unmount } = renderAt("/recommended");
    await settle();
    // Initializing: the notice, not an error
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByTestId("scene-grid")).toHaveAttribute(
      "data-loading",
      "true"
    );

    unmount();
    await advance(60_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestsTo(fetchMock, RECOMMENDED)).toHaveLength(1);
  });

  it("leaving Recommended cancels its request in flight", async () => {
    let signal: AbortSignal | undefined;
    stubApi({
      [RECOMMENDED]: (_url, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      },
    });

    const { unmount } = renderAt("/recommended");
    await settle();
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("a slow page-1 response does not replace page 2", async () => {
    let answerPageOne: (response: Response) => void = () => {};
    stubApi({
      [RECOMMENDED]: (url) =>
        url.includes("page=1&")
          ? new Promise<Response>((resolve) => {
              answerPageOne = resolve;
            })
          : jsonResponse(200, page("Page two scene")),
    });

    renderAt("/recommended?page=1");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await settle();
    expect(screen.getByText("Page two scene")).toBeInTheDocument();

    // Page 1's answer arrives late
    answerPageOne(jsonResponse(200, page("Page one scene")));
    await settle();

    expect(screen.getByText("Page two scene")).toBeInTheDocument();
    expect(screen.queryByText("Page one scene")).not.toBeInTheDocument();
  });

  it("loads once the library is ready, with no retries meanwhile", async () => {
    const answers = [initializingResponse(), jsonResponse(200, page("Ready"))];
    const fetchMock = stubApi({
      [RECOMMENDED]: () => answers.shift() ?? jsonResponse(500, {}),
      "/library/ready": () => jsonResponse(200, { ready: true }),
    });

    renderAt("/recommended");
    await advance(4_900);
    expect(requestsTo(fetchMock, RECOMMENDED)).toHaveLength(1);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();

    await advance(300);

    expect(requestsTo(fetchMock, "/library/ready")).toHaveLength(1);
    expect(requestsTo(fetchMock, RECOMMENDED)).toHaveLength(2);
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("shows the server's error for any other failure", async () => {
    stubApi({
      [RECOMMENDED]: () =>
        jsonResponse(500, {
          error: "Failed to get recommendations",
          errorType: "INTERNAL",
        }),
    });

    renderAt("/recommended");
    await settle();

    expect(
      screen.getByText("Failed to get recommendations")
    ).toBeInTheDocument();
    expect(screen.getByText("(Error type: INTERNAL)")).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
