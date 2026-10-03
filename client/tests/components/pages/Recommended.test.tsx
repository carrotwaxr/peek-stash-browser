/**
 * Recommended on the shared list page (`EntityListPage` with
 * `RECOMMENDED_LIST`): the scene list's request within the user's top 500,
 * its views, paging, sort, filters, Views and count, and the requests it
 * sends and cancels (item 39, UD-R5).
 *
 * These tests stub the network rather than `@/api/hooks`: the behaviour
 * under test is which requests the page sends, and when. The controls,
 * pagination and grid are the real ones, the scene card a stub.
 */
import { Route, Routes } from "react-router-dom";
import { defaultPinsOf } from "@peek/shared-types";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { matchMediaQueries } from "@tests/helpers/matchMedia";
import { must, renderListPage } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import Recommended from "@/components/pages/Recommended";
import SceneSearch from "@/components/scene-search/SceneSearch";
import { SHEET_QUERY } from "@/hooks/useFilterSurface";
import {
  type ApiStub,
  initializingResponse,
  jsonResponse,
  requestsTo,
  stubApi,
} from "../../helpers/stubApi";

const { tvMode } = vi.hoisted(() => ({
  tvMode: vi.fn(() => ({ isTVMode: false })),
}));
vi.mock("@/hooks/useTVMode", () => ({ useTVMode: tvMode }));

/** A scene card stub: its title and a Hide button */
vi.mock("@/components/ui/SceneCard", () => ({
  default: (props: {
    scene: { id: string; instanceId: string; title: string };
    onHideSuccess?: (id: string, type: string, instanceId: string) => void;
  }) => (
    <div data-testid="scene-card">
      {props.scene.title}
      <button
        onClick={() =>
          props.onHideSuccess?.(props.scene.id, "scene", props.scene.instanceId)
        }
      >
        Hide {props.scene.title}
      </button>
    </div>
  ),
}));

const RECOMMENDED = "/library/scenes/recommended";
const RECOMMENDED_COUNT = "/library/scenes/recommended/count";
const SYNCING = "Server is syncing library, please wait...";
const NOTICE = "Filtering within your top 500 recommendations";

type Row = { id: string; instanceId: string; title: string };
type Body = {
  filter: Record<string, unknown>;
  scene_filter?: Record<string, unknown>;
  where?: { match: string; rules: readonly Record<string, unknown>[] };
};

/** Rows titled `<prefix>-<n>` on server a */
const rowsOf = (prefix: string, n = 2): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    instanceId: "a",
    title: `${prefix}-${i}`,
  }));

const answer = (rows: readonly Row[], count: number | null, page = 1) =>
  jsonResponse(200, { scenes: rows, count, page, perPage: 24 });

const bodyOf = (init?: RequestInit): Body =>
  JSON.parse(typeof init?.body === "string" ? init.body : "null") as Body;

/** The bodies the recommended list was sent, oldest first */
const sentTo = (fetchMock: ApiStub, path = RECOMMENDED): Body[] =>
  fetchMock.mock.calls
    .filter(([url]) => url.replace(/^\/api/, "").split("?")[0] === path)
    .map(([, init]) => bodyOf(init));

const lastSent = (fetchMock: ApiStub) =>
  must(sentTo(fetchMock).at(-1), "a recommended request");

/** The server: rows `p<page>-<n>` and a total, null when not asked */
const pagedServer =
  (total: number, perPageRows = 2) =>
  (_url: string, init?: RequestInit) => {
    const { filter } = bodyOf(init);
    const page = filter.page as number;
    return answer(
      rowsOf(`p${page}`, perPageRows),
      filter.count === false ? null : total,
      page
    );
  };

const renderAt = (
  url: string,
  options: Omit<Parameters<typeof renderListPage>[1], "initialEntries"> = {}
) => renderListPage(<Recommended />, { initialEntries: [url], ...options });

beforeEach(() => {
  tvMode.mockReturnValue({ isTVMode: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Recommended", () => {
  it("asks `POST /library/scenes/recommended` with the page, the Recommended sort and no filter", async () => {
    const fetchMock = stubApi({ [RECOMMENDED]: pagedServer(2) });

    renderAt("/recommended");

    expect(await screen.findByText("p1-0")).toBeInTheDocument();
    const [first, ...rest] = sentTo(fetchMock);
    expect(rest).toEqual([]);
    expect(must(fetchMock.mock.calls[0])[1]?.method).toBe("POST");
    expect(first).toEqual({
      filter: {
        page: 1,
        per_page: 24,
        q: "",
        sort: "recommended",
        direction: "DESC",
      },
      scene_filter: {},
    });
    expect(screen.getByRole("heading", { name: "Recommended" })).toBeVisible();
  });

  it("Grid, Wall and Table are offered; Timeline and Folder are not", async () => {
    stubApi({ [RECOMMENDED]: pagedServer(2) });

    renderAt("/recommended");
    await screen.findByText("p1-0");

    fireEvent.click(screen.getByRole("button", { name: /^View mode/ }));
    const names = within(screen.getByRole("listbox", { name: "View modes" }))
      .getAllByRole("option")
      .map((option) => option.getAttribute("aria-label"));
    expect(names).toEqual(["Grid view", "Wall view", "Table view"]);
  });

  it("the page size shows at the top and the bottom, with one page of results too", async () => {
    stubApi({ [RECOMMENDED]: pagedServer(2) });

    renderAt("/recommended");
    await screen.findByText("p1-0");

    expect(screen.getAllByLabelText("Per Page:")).toHaveLength(2);
    expect(screen.getAllByText("Showing 1-2 of 2 records")).toHaveLength(2);
  });

  it("an old link `/recommended?page=2&per_page=48` opens page 2 at 48", async () => {
    const fetchMock = stubApi({ [RECOMMENDED]: pagedServer(60) });

    renderAt("/recommended?page=2&per_page=48");

    expect(await screen.findByText("p2-0")).toBeInTheDocument();
    expect(lastSent(fetchMock).filter).toMatchObject({
      page: 2,
      per_page: 48,
    });
  });

  it("choosing a filter sends it in `where` and shows 'Filtering within your top 500 recommendations'; with no filter and no search the notice is absent", async () => {
    const fetchMock = stubApi({ [RECOMMENDED]: pagedServer(2) });

    renderAt("/recommended", { pins: { scene: defaultPinsOf("scene") } });
    await screen.findByText("p1-0");
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(lastSent(fetchMock).where).toBeUndefined();

    fireEvent.click(await screen.findByRole("button", { name: "Unwatched" }));

    await waitFor(() =>
      expect(
        lastSent(fetchMock).where?.rules.map((rule) => rule.field)
      ).toEqual(["watched"])
    );
    expect(screen.getByRole("status")).toHaveTextContent(NOTICE);
  });

  it("the sort menu lists Recommended first; choosing Date sends `sort: date`", async () => {
    const fetchMock = stubApi({ [RECOMMENDED]: pagedServer(2) });

    renderAt("/recommended");
    await screen.findByText("p1-0");

    const sortBy = screen.getByRole("combobox", { name: "Sort by" });
    const options = Array.from((sortBy as HTMLSelectElement).options);
    expect(must(options[0]).textContent).toBe("Recommended");
    expect((sortBy as HTMLSelectElement).value).toBe("recommended");

    fireEvent.change(sortBy, { target: { value: "date" } });

    await waitFor(() =>
      expect(lastSent(fetchMock).filter).toMatchObject({ sort: "date" })
    );
  });

  it("Recommended sorted by Title after Scenes sorted by Title shows its own total on page 2", async () => {
    const fetchMock = stubApi({
      "/library/scenes": () =>
        jsonResponse(200, {
          findScenes: { count: 9999, scenes: rowsOf("all") },
        }),
      [RECOMMENDED]: pagedServer(30),
    });
    const { router } = renderListPage(
      <Routes>
        <Route path="/scenes" element={<SceneSearch />} />
        <Route path="/recommended" element={<Recommended />} />
      </Routes>,
      { initialEntries: ["/scenes?sort=title"], staleTime: 5 * 60 * 1000 }
    );
    expect(await screen.findByText("all-0")).toBeInTheDocument();

    await act(() => router.navigate("/recommended?sort=title&page=2"));

    expect(await screen.findByText("p2-0")).toBeInTheDocument();
    // Scenes' total is not Recommended's: page 2 is counted
    expect(lastSent(fetchMock).filter.count).toBeUndefined();
    expect(screen.getAllByText("Showing 25-30 of 30 records")).toHaveLength(2);
  });

  describe("the empty state", () => {
    const noActivity = {
      favoritedPerformers: 0,
      ratedPerformers: 0,
      favoritedStudios: 0,
      ratedStudios: 0,
      favoritedTags: 0,
      ratedTags: 0,
      favoritedScenes: 0,
      ratedScenes: 0,
      rankedEntities: 0,
    };

    it("the empty state mentions watching as a source", async () => {
      stubApi({
        [RECOMMENDED]: () =>
          jsonResponse(200, {
            scenes: [],
            count: 0,
            page: 1,
            perPage: 24,
            message: "No recommendations yet",
            criteria: noActivity,
          }),
      });

      renderAt("/recommended");

      expect(
        await screen.findByText("No recommendations yet")
      ).toBeInTheDocument();
      expect(screen.getByText(/keep watching/i)).toBeInTheDocument();
    });

    it("the empty state lists the user's activity when the server sends criteria", async () => {
      stubApi({
        [RECOMMENDED]: () =>
          jsonResponse(200, {
            scenes: [],
            count: 0,
            page: 1,
            perPage: 24,
            message: "No matching recommendations found",
            criteria: { ...noActivity, rankedEntities: 5 },
          }),
      });

      renderAt("/recommended");

      expect(
        await screen.findByText("No matching recommendations found")
      ).toBeInTheDocument();
      expect(
        screen.getByText("5 performers, studios and tags from your viewing")
      ).toBeInTheDocument();
    });

    it("a count of one reads in the singular, line by line", async () => {
      stubApi({
        [RECOMMENDED]: () =>
          jsonResponse(200, {
            scenes: [],
            count: 0,
            page: 1,
            perPage: 24,
            message: "No matching recommendations found",
            criteria: {
              favoritedPerformers: 1,
              ratedPerformers: 1,
              favoritedStudios: 1,
              ratedStudios: 1,
              favoritedTags: 1,
              ratedTags: 1,
              favoritedScenes: 1,
              ratedScenes: 1,
              rankedEntities: 1,
            },
          }),
      });

      renderAt("/recommended");

      await screen.findByText("Your current activity:");
      const lines = screen.getAllByRole("listitem").map((li) => li.textContent);
      expect(lines).toEqual([
        "1 favorited performer, 1 highly-rated",
        "1 favorited studio, 1 highly-rated",
        "1 favorited tag, 1 highly-rated",
        "1 favorited scene, 1 rated scene",
        "1 performer, studio or tag from your viewing",
      ]);
    });

    it("a message without criteria asks for ratings and favorites", async () => {
      stubApi({
        [RECOMMENDED]: () =>
          jsonResponse(200, {
            scenes: [],
            count: 0,
            page: 1,
            perPage: 24,
            message: "No recommendations yet",
          }),
      });

      renderAt("/recommended");

      expect(
        await screen.findByText("No recommendations yet")
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Rate or Favorite more items to get personalized recommendations."
        )
      ).toBeInTheDocument();
    });

    it("a filter that matches nothing says so", async () => {
      stubApi({ [RECOMMENDED]: () => answer([], 0) });

      renderAt("/recommended?q=zzz");

      expect(
        await screen.findByText("No recommendations match these filters")
      ).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(NOTICE);
    });
  });

  it("a library on its first sync shows the notice, not an error, and loads once ready", async () => {
    vi.useFakeTimers();
    const answers = [initializingResponse(), answer(rowsOf("ready"), 2)];
    const fetchMock = stubApi({
      [RECOMMENDED]: () => answers.shift() ?? jsonResponse(500, {}),
      "/library/ready": () => jsonResponse(200, { ready: true }),
    });

    renderAt("/recommended", { queryClient: createQueryClient() });
    await act(() => vi.advanceTimersByTimeAsync(4_900));
    expect(requestsTo(fetchMock, RECOMMENDED)).toHaveLength(1);
    expect(screen.getByText(SYNCING)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(requestsTo(fetchMock, "/library/ready")).toHaveLength(1);
    expect(requestsTo(fetchMock, RECOMMENDED)).toHaveLength(2);
    expect(screen.getByText("ready-0")).toBeInTheDocument();
    expect(screen.queryByText(SYNCING)).not.toBeInTheDocument();
  });

  it("leaving the page cancels its request; a slow page 1 never replaces page 2", async () => {
    let signal: AbortSignal | undefined;
    stubApi({
      [RECOMMENDED]: (_url, init) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      },
    });
    const left = renderAt("/recommended");
    await waitFor(() => expect(signal?.aborted).toBe(false));
    left.unmount();
    expect(signal?.aborted).toBe(true);

    let answerPageOne: (response: Response) => void = () => {};
    stubApi({
      [RECOMMENDED]: (_url, init) =>
        bodyOf(init).filter.page === 1
          ? new Promise<Response>((resolve) => {
              answerPageOne = resolve;
            })
          : answer(rowsOf("p2"), 48, 2),
    });
    const { router } = renderAt("/recommended");
    await act(() => router.navigate("/recommended?page=2"));
    expect(await screen.findByText("p2-0")).toBeInTheDocument();

    // Page 1's answer arrives late
    await act(async () => {
      answerPageOne(answer(rowsOf("p1"), 48));
      await Promise.resolve();
    });

    expect(screen.getByText("p2-0")).toBeInTheDocument();
    expect(screen.queryByText("p1-0")).not.toBeInTheDocument();
  });

  it("a hidden scene leaves the page and the count drops by one", async () => {
    stubApi({ [RECOMMENDED]: () => answer(rowsOf("rec", 3), 3) });

    renderAt("/recommended");
    expect(await screen.findByText("rec-1")).toBeInTheDocument();
    expect(screen.getAllByText("Showing 1-3 of 3 records")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Hide rec-1" }));

    await waitFor(() =>
      expect(screen.queryByText("rec-1")).not.toBeInTheDocument()
    );
    expect(screen.getByText("rec-0")).toBeInTheDocument();
    expect(screen.getAllByText("Showing 1-2 of 2 records")).toHaveLength(2);
  });

  it("TV mode: PageDown asks for the next page", async () => {
    tvMode.mockReturnValue({ isTVMode: true });
    const fetchMock = stubApi({ [RECOMMENDED]: pagedServer(48) });

    renderAt("/recommended");
    await screen.findByText("p1-0");

    fireEvent.keyDown(document.body, { key: "PageDown" });

    expect(await screen.findByText("p2-0")).toBeInTheDocument();
    expect(lastSent(fetchMock).filter).toMatchObject({ page: 2 });
  });

  it("the Views menu uses the `scene_recommended` context", async () => {
    const fetchMock = stubApi({ [RECOMMENDED]: pagedServer(2) });
    const view = (id: string, name: string, sort: string) => ({
      id,
      name,
      filters: {},
      sort,
      direction: "ASC" as const,
    });

    renderAt("/recommended", {
      presets: {
        scene: [
          view("rec", "By date", "date"),
          view("all", "By title", "title"),
        ],
      },
      defaultPresets: { scene_recommended: "rec", scene: "all" },
    });
    await screen.findByText("p1-0");

    // Recommended's own default, not the Scenes page's
    expect(lastSent(fetchMock).filter).toMatchObject({
      sort: "date",
      direction: "ASC",
    });
    fireEvent.click(screen.getByRole("button", { name: /^Views/ }));
    expect(
      screen.getByText("Stop using as default for Recommended page")
    ).toBeInTheDocument();
  });

  it("Recommended's sheet posts to `/library/scenes/recommended/count`", async () => {
    const restore = matchMediaQueries([SHEET_QUERY]);
    try {
      const fetchMock = stubApi({
        [RECOMMENDED]: pagedServer(2),
        [RECOMMENDED_COUNT]: () => jsonResponse(200, { count: 2 }),
      });

      renderAt("/recommended");
      await screen.findByText("p1-0");
      fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

      await waitFor(() =>
        expect(requestsTo(fetchMock, RECOMMENDED_COUNT)).toHaveLength(1)
      );
      expect(requestsTo(fetchMock, "/library/scenes/count")).toEqual([]);
      expect(
        must(sentTo(fetchMock, RECOMMENDED_COUNT)[0]).filter
      ).not.toHaveProperty("sort");
    } finally {
      restore();
    }
  });
});
