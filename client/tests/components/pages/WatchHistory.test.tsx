/**
 * The Watch History page: one page of the viewer's watched scenes from
 * `GET /watch-history/scenes`, in the order the server answers. View, sort
 * and page live in the URL; the totals come from the server.
 *
 * The network is stubbed, not the hook: the behaviour under test is which
 * requests the page sends.
 */
import type { ReactNode } from "react";
import {
  type RouteObject,
  RouterProvider,
  createMemoryRouter,
  useLocation,
} from "react-router-dom";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SignedIn } from "@tests/helpers/SignedIn";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import WatchHistory from "@/components/pages/WatchHistory";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import type * as ToastModule from "@/utils/toast";
import { jsonResponse, requestsTo, stubApi } from "../../helpers/stubApi";

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));

const toast = vi.hoisted(() => ({ showError: vi.fn() }));
vi.mock("@/utils/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof ToastModule>()),
  showError: toast.showError,
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

interface RowProps {
  scene: { id: string; instanceId: string };
  watchHistory?: { playCount?: number; lastOAt?: string | null };
  linkState?: {
    shouldResume?: boolean;
    playlist: { scenes: unknown[]; currentIndex: number; userId?: number };
  };
}

const rowStates = vi.hoisted(() => ({
  queues: [] as Array<{
    scenes: unknown[];
    currentIndex: number;
    userId?: number;
  }>,
}));

// The page imports each piece directly; ConfirmDialog stays real, since the
// page's clear confirmation is under test
vi.mock("@/components/ui/Button", () => ({
  default: ({
    children,
    onClick,
    disabled,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/LoadingSpinner", () => ({
  default: () => <div data-testid="spinner" />,
}));
vi.mock("@/components/ui/PageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/ui/PageLayout", () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/Pagination", () => ({
  default: ({
    currentPage,
    totalPages,
    perPage,
    showPerPageSelector,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    perPage: number;
    showPerPageSelector?: boolean;
    onPageChange: (page: number) => void;
  }) => (
    <nav
      data-testid="pagination"
      data-per-page={perPage}
      data-selector={String(showPerPageSelector)}
    >
      {`page ${currentPage} of ${totalPages}`}
      <button onClick={() => onPageChange(currentPage + 1)}>Next page</button>
    </nav>
  ),
}));
vi.mock("@/components/ui/SceneListItem", () => ({
  default: ({ scene, watchHistory, linkState }: RowProps) => {
    if (linkState) rowStates.queues.push(linkState.playlist);
    return (
      <div data-testid="row">
        {`${scene.id}:${scene.instanceId}:${watchHistory?.playCount ?? "-"}:${linkState?.shouldResume ? "resume" : "-"}`}
      </div>
    );
  },
}));

const WATCHED = "/watch-history/scenes";

function scene(id: string, overrides = {}) {
  return {
    id,
    instanceId: "a",
    resume_time: 100,
    play_count: 3,
    play_duration: 500,
    last_played_at: "2024-01-01T00:00:00.000Z",
    o_counter: 0,
    last_o_at: null,
    files: [{ duration: 1000 }],
    ...overrides,
  };
}

function answer(scenes: unknown[], total = scenes.length, duration = 0) {
  return () =>
    jsonResponse(200, { scenes, total, totalPlayDuration: duration });
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{`${location.pathname}${location.search}`}</div>
  );
}

describe("WatchHistory", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createQueryClient();
    rowStates.queues.length = 0;
  });

  afterEach(() => {
    client.clear();
    vi.unstubAllGlobals();
  });

  function renderPage(url = "/watch-history") {
    const routes: RouteObject[] = [
      {
        path: "/watch-history",
        element: (
          <>
            <WatchHistory />
            <LocationProbe />
          </>
        ),
      },
    ];
    const router = createMemoryRouter(routes, { initialEntries: [url] });
    render(
      <QueryClientProvider client={client}>
        <SignedIn>
          <ShortcutScopeProvider>
            <RouterProvider router={router} />
          </ShortcutScopeProvider>
        </SignedIn>
      </QueryClientProvider>
    );
    return router;
  }

  const lastRequest = (fetchMock: ReturnType<typeof stubApi>) => {
    const requests = requestsTo(fetchMock, WATCHED);
    return new URL(must(requests[requests.length - 1], "a request"), "http://x")
      .searchParams;
  };

  it("view, sort and page live in the URL (?view=&sort=&page=) and reach the request", async () => {
    const fetchMock = stubApi({ [WATCHED]: answer([scene("1")], 60) });

    renderPage("/watch-history?view=in_progress&sort=most_watched&page=2");

    await waitFor(() => {
      expect(screen.getAllByTestId("row")).toHaveLength(1);
    });
    const params = lastRequest(fetchMock);
    expect(params.get("view")).toBe("in_progress");
    expect(params.get("sort")).toBe("most_watched");
    expect(params.get("page")).toBe("2");
    expect(params.get("per_page")).toBe("24");
    expect(screen.getByLabelText<HTMLSelectElement>("Filter:").value).toBe(
      "in_progress"
    );
    expect(screen.getByLabelText<HTMLSelectElement>("Sort:").value).toBe(
      "most_watched"
    );
  });

  it("a view or sort change writes the URL, drops the page and keeps the defaults out", async () => {
    stubApi({ [WATCHED]: answer([scene("1")], 60) });
    renderPage("/watch-history?page=3");
    await waitFor(() => {
      expect(screen.getAllByTestId("row")).toHaveLength(1);
    });

    fireEvent.change(screen.getByLabelText("Filter:"), {
      target: { value: "completed" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/watch-history?view=completed"
      );
    });

    fireEvent.change(screen.getByLabelText("Sort:"), {
      target: { value: "longest_duration" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/watch-history?view=completed&sort=longest_duration"
      );
    });

    fireEvent.change(screen.getByLabelText("Filter:"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("Sort:"), {
      target: { value: "recent" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/watch-history");
    });
  });

  it("Back after choosing Completed returns to All (push)", async () => {
    const fetchMock = stubApi({ [WATCHED]: answer([scene("1")], 1) });
    const router = renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("row")).toHaveLength(1);
    });

    fireEvent.change(screen.getByLabelText("Filter:"), {
      target: { value: "completed" },
    });
    await waitFor(() => {
      expect(lastRequest(fetchMock).get("view")).toBe("completed");
    });

    await act(async () => {
      await router.navigate(-1);
    });

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/watch-history");
    });
    expect(screen.getByLabelText<HTMLSelectElement>("Filter:").value).toBe(
      "all"
    );
  });

  it("Next page requests page 2", async () => {
    const fetchMock = stubApi({ [WATCHED]: answer([scene("1")], 60) });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("pagination")).toBeTruthy();
    });
    // 24 per page, no per-page selector
    expect(screen.getByTestId("pagination").dataset["perPage"]).toBe("24");
    expect(screen.getByTestId("pagination").dataset["selector"]).toBe("false");
    expect(screen.getByTestId("pagination").textContent).toContain(
      "page 1 of 3"
    );

    fireEvent.click(screen.getByText("Next page"));

    await waitFor(() => {
      expect(lastRequest(fetchMock).get("page")).toBe("2");
    });
    expect(screen.getByTestId("location").textContent).toBe(
      "/watch-history?page=2"
    );
  });

  it("Total watch time shows the server's totalPlayDuration, not a page sum", async () => {
    stubApi({
      // The two rows on the page add up to 1,000 s; the whole view is 2 h 3 m
      [WATCHED]: answer(
        [
          scene("1", { play_duration: 400 }),
          scene("2", { play_duration: 600 }),
        ],
        60,
        7380
      ),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Total watch time: 2h 3m")).toBeTruthy();
    });
    expect(screen.getByText("60 scenes")).toBeTruthy();
  });

  it("the rows share one queue array, each at its own index, and resume", async () => {
    stubApi({
      [WATCHED]: answer([scene("1"), scene("2"), scene("3")]),
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("row")).toHaveLength(3);
    });

    const queues = rowStates.queues.slice(-3);
    expect(queues).toHaveLength(3);
    expect(queues[1]?.scenes).toBe(queues[0]?.scenes);
    expect(queues[2]?.scenes).toBe(queues[0]?.scenes);
    expect(queues.map((q) => q.currentIndex)).toEqual([0, 1, 2]);
    expect(queues.map((q) => q.userId)).toEqual([1, 1, 1]);
    expect(screen.getAllByTestId("row")[0]?.textContent).toBe("1:a:3:resume");
  });

  it("shows the empty state when the answer is empty", async () => {
    stubApi({ [WATCHED]: answer([], 0) });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No watch history yet")).toBeTruthy();
    });
  });

  it("Clear History invalidates watch-history, home carousel and user-stats queries", async () => {
    stubApi({
      [WATCHED]: answer([scene("1")], 1),
      "/watch-history": () => jsonResponse(200, { success: true }),
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("row")).toHaveLength(1);
    });

    fireEvent.click(screen.getByText("Clear History"));
    // The dialog's own button
    fireEvent.click(must(screen.getAllByText("Clear History")[1]));

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled();
    });
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(queryKeys.watchHistory.all());
    expect(keys).toContainEqual(queryKeys.homeCarousels.all());
    expect(keys).toContainEqual(queryKeys.user.stats());
  });

  it("the dialog says it clears scene watch history only, and that image views and image O counts are kept", async () => {
    stubApi({ [WATCHED]: answer([scene("1")], 1) });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("row")).toHaveLength(1);
    });

    fireEvent.click(screen.getByText("Clear History"));

    expect(
      screen.getByText(
        "This clears your scene watch history: plays, watch time, resume points and O counts, and the performer, studio and tag totals built from them. Image views and image O counts are kept. This cannot be undone."
      )
    ).toBeTruthy();
  });
  it("Clear History asks in a ConfirmDialog, closes on Escape without clearing, and clears on confirm", async () => {
    const fetchMock = stubApi({
      [WATCHED]: answer([scene("1")], 1),
      "/watch-history": () => jsonResponse(200, { success: true }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("row")).toHaveLength(1);
    });
    const deletes = () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");

    fireEvent.click(screen.getByText("Clear History"));
    expect(
      screen.getByRole("dialog", { name: "Clear Watch History?" })
    ).toBeTruthy();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deletes()).toHaveLength(0);

    fireEvent.click(screen.getByText("Clear History"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(must(within(dialog).getByText("Clear History")));

    await waitFor(() => expect(deletes()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a failed clear says so in an error toast, not the browser's alert, and keeps the dialog", async () => {
    const alertSpy = vi.spyOn(window, "alert");
    toast.showError.mockClear();
    stubApi({
      [WATCHED]: answer([scene("1")], 1),
      "/watch-history": () => jsonResponse(500, { error: "boom" }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("row")).toHaveLength(1);
    });

    fireEvent.click(screen.getByText("Clear History"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(must(within(dialog).getByText("Clear History")));

    await waitFor(() =>
      expect(toast.showError).toHaveBeenCalledWith(
        "Failed to clear watch history. Please try again."
      )
    );
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    alertSpy.mockRestore();
  });
});
