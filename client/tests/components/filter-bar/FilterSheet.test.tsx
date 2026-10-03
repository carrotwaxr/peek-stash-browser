/**
 * FilterSheet: on a phone or a TV the list's filters open in a full-height
 * sheet over a draft of the list's filters. Each edit asks only the count
 * (`POST /library/<plural>/count`, typing debounced 300 ms) and the footer
 * reads "Show N results"; Show N applies the draft once and closes, and
 * Escape, the close button or the backdrop discard it. The count request is
 * the page's (`countRequestOf`), so a detail tab's lock reaches it.
 */
import { defaultPinsOf } from "@peek/shared-types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouterWithQuery } from "@tests/helpers/MemoryRouterWithQuery";
import { matchMediaQueries } from "@tests/helpers/matchMedia";
import { renderListControls } from "@tests/helpers/renderListControls";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost, apiPut } from "@/api";
import { invalidateExclusionDependents } from "@/api/invalidateExclusionDependents";
import SearchableGrid from "@/components/ui/SearchableGrid";
import { SHEET_QUERY } from "@/hooks/useFilterSurface";

interface Known {
  id: string;
  instanceId: string;
  name: string;
}

/** `/minimal`: with `ids` a composite id matches its instance, a bare id every instance; else the page */
const minimalOf =
  (known: Known[]) =>
  ({ ids }: { ids?: string[] } = {}) =>
    Promise.resolve(
      ids === undefined
        ? known
        : known.filter((entity) =>
            ids.some((id) =>
              id.includes(":")
                ? id === `${entity.id}:${entity.instanceId}`
                : id === entity.id
            )
          )
    );

type Count = (url: string, body: unknown) => Promise<unknown>;

const { minimal, count } = vi.hoisted(() => ({
  minimal: {
    findTagsMinimal: vi.fn(),
    findPerformersMinimal: vi.fn(),
    findStudiosMinimal: vi.fn(),
    findGroupsMinimal: vi.fn(),
    findGalleriesMinimal: vi.fn(),
    findScenesMinimal: vi.fn(),
    findPerformers: vi.fn(),
  },
  count: { answer: null as Count | null },
}));
const playlists = vi.hoisted(() => ({
  getPlaylists: vi.fn(),
  getSharedPlaylists: vi.fn(),
}));

vi.mock("@/api/library", () => ({ libraryApi: minimal }));
vi.mock("@/api/playlists", () => playlists);
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({ presets: {}, defaults: {} }),
  // A count route answers through `count.answer`; anything else is empty
  apiPost: vi.fn((url: string, body: unknown) =>
    url.endsWith("/count") && count.answer !== null
      ? count.answer(url, body)
      : Promise.resolve({})
  ),
  apiPut: vi.fn().mockResolvedValue({ success: true }),
  libraryApi: minimal,
  ...playlists,
}));

vi.mock("@/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "metric" }),
}));

let tv = false;
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: tv }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({}),
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

const TAGS: Known[] = [
  { id: "1", instanceId: "a", name: "Blonde" },
  { id: "2", instanceId: "a", name: "Outdoor" },
];

let restore: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  tv = false;
  restore = matchMediaQueries([SHEET_QUERY]);
  count.answer = () => Promise.resolve({ count: 1204 });
  minimal.findTagsMinimal.mockImplementation(minimalOf(TAGS));
  for (const find of [
    minimal.findPerformersMinimal,
    minimal.findStudiosMinimal,
    minimal.findGroupsMinimal,
    minimal.findGalleriesMinimal,
    minimal.findScenesMinimal,
  ]) {
    find.mockResolvedValue([]);
  }
  minimal.findPerformers.mockResolvedValue({
    findPerformers: { count: 0, performers: [] },
  });
});

afterEach(() => {
  restore?.();
  restore = null;
});

/** The count requests sent so far: [url, body] */
const countPosts = () =>
  vi
    .mocked(apiPost)
    .mock.calls.filter(([url]) => url.endsWith("/count"))
    .map(([url, body]) => [url, body] as const);

const filtersButton = () => screen.getByRole("button", { name: /^Filters/ });
const sheet = () => screen.getByRole("dialog", { name: "Filters" });
const noSheet = () =>
  expect(
    screen.queryByRole("dialog", { name: "Filters" })
  ).not.toBeInTheDocument();
const showButton = () =>
  within(sheet()).getByRole("button", { name: /^Show / });
/** A field's control in the sheet, by its label */
const field = (label: string) =>
  within(sheet()).getByLabelText<HTMLSelectElement>(label);

const edit = (text: string) =>
  screen.findByRole("button", { name: `Edit filter: ${text}` });

describe("FilterSheet", () => {
  it("opens as a `Modal` titled `Filters` over a draft of the list's filters; the list's request does not change while editing", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();

    await user.click(filtersButton());
    expect(sheet()).toBeInTheDocument();
    expect(field("Favorite Scenes").value).toBe("true");

    await user.selectOptions(field("Favorite Scenes"), "false");

    expect(field("Favorite Scenes").value).toBe("false");
    await waitFor(() => expect(countPosts().length).toBeGreaterThan(1));
    expect(list.onQueryChange).toHaveBeenCalledTimes(1);
    expect(list.params().get("favorite")).toBe("true");
    expect(list.actions).toEqual([]);
  });

  it("each edit asks only the count, debounced 300 ms for typing; the footer reads `Show 1,204 results`, `Show results` while counting or after a failed count", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();

    await user.click(filtersButton());
    await waitFor(() =>
      expect(showButton()).toHaveTextContent("Show 1,204 results")
    );
    const [url, body] = must(countPosts()[0], "the first count");
    expect(url).toBe("/library/scenes/count");
    expect(body).toMatchObject({
      where: {
        match: "all",
        rules: [{ field: "favorite", criterion: true }],
      },
    });

    // A pick counts at once
    await user.selectOptions(field("Favorite Scenes"), "false");
    await waitFor(() => expect(countPosts()).toHaveLength(2));

    // Typing counts once, 300 ms after the last key; meanwhile the button
    // reads "Show results"
    let answer: (value: unknown) => void = () => {};
    let fail: (reason: unknown) => void = () => {};
    count.answer = () =>
      new Promise((resolve, reject) => {
        answer = resolve;
        fail = reject;
      });
    await user.type(
      within(sheet()).getByRole("combobox", { name: "Find a filter" }),
      "Title"
    );
    await user.click(
      within(sheet()).getByRole("option", { name: "Title Search" })
    );
    const title = within(sheet()).getByLabelText("Title Search");
    await user.type(title, "abc");
    expect(countPosts()).toHaveLength(2);
    expect(showButton()).toHaveTextContent("Show results");
    await waitFor(() => expect(countPosts()).toHaveLength(3));
    expect(must(countPosts()[2], "the typed count")[1]).toMatchObject({
      where: {
        rules: [
          { field: "title", criterion: { value: "abc" } },
          { field: "favorite", criterion: false },
        ],
      },
    });
    expect(showButton()).toHaveTextContent("Show results");
    act(() => answer({ count: 7 }));
    await waitFor(() =>
      expect(showButton()).toHaveTextContent("Show 7 results")
    );

    // A failed count reads "Show results"
    await user.type(title, "d");
    await waitFor(() => expect(countPosts()).toHaveLength(4));
    act(() => fail(new Error("count failed")));
    await waitFor(() => expect(showButton()).toHaveTextContent("Show results"));
    expect(list.onQueryChange).toHaveBeenCalledTimes(1);
  });

  it("Show N applies the draft once (one history entry) and closes; Escape, the close button or the backdrop discard it", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();

    await user.click(filtersButton());
    await user.selectOptions(field("Favorite Scenes"), "false");
    await user.click(showButton());

    noSheet();
    await waitFor(() => expect(list.params().get("favorite")).toBe("false"));
    expect(list.actions).toEqual(["PUSH"]);

    const discards = [
      () => user.keyboard("{Escape}"),
      () => user.click(within(sheet()).getByRole("button", { name: "Close" })),
      () => {
        const backdrop = must(sheet().parentElement, "the backdrop");
        fireEvent.mouseDown(backdrop);
        fireEvent.click(backdrop);
        return Promise.resolve();
      },
    ];
    for (const discard of discards) {
      await user.click(filtersButton());
      // A new draft, from the list
      expect(field("Favorite Scenes").value).toBe("false");
      await user.selectOptions(field("Favorite Scenes"), "true");
      await discard();
      noSheet();
      expect(list.params().get("favorite")).toBe("false");
    }
    expect(list.actions).toEqual(["PUSH"]);
  });

  it("a chip tapped in the row opens the sheet with that row's editor open and focused", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      {
        url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES&favorite=true",
        pins: { scene: { fields: ["organized"], filters: [] } },
      }
    );
    await list.firstQuery();

    await user.click(await edit("Favorite Scenes: Yes"));
    expect(sheet()).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Favorite Scenes filter" })
    ).not.toBeInTheDocument();
    await waitFor(() => expect(field("Favorite Scenes")).toHaveFocus());
    await user.keyboard("{Escape}");
    noSheet();

    // An empty pinned field's chip opens the sheet at a new row of it
    await user.click(await edit("Organized"));
    await waitFor(() => expect(field("Organized")).toHaveFocus());
    expect(list.actions).toEqual([]);
  });

  it("+ Filter in the row opens the sheet at its field list", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes" });
    await list.firstQuery();

    await user.click(screen.getByRole("button", { name: "Add filter" }));
    expect(sheet()).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(sheet()).getByRole("combobox", { name: "Find a filter" })
      ).toHaveFocus()
    );
  });

  it("in TV mode the sheet's + Filter is a button over its menu, so Down from the last row meets it before Show N; a pick adds a focused row", async () => {
    tv = true;
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes" });
    await list.firstQuery();

    await user.click(screen.getByRole("button", { name: "Add filter" }));
    const add = within(sheet()).getByRole("button", { name: "Add filter" });
    await waitFor(() => expect(add).toHaveFocus());
    // The field list is not drawn in place
    expect(
      within(sheet()).queryByRole("combobox", { name: "Find a filter" })
    ).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    const find = within(sheet()).getByRole("combobox", {
      name: "Find a filter",
    });
    await waitFor(() => expect(find).toHaveFocus());
    await user.click(
      within(sheet()).getByRole("option", { name: "Favorite Scenes" })
    );
    expect(
      within(sheet()).queryByRole("combobox", { name: "Find a filter" })
    ).not.toBeInTheDocument();
    await waitFor(() => expect(field("Favorite Scenes")).toHaveFocus());
    expect(list.actions).toEqual([]);
  });

  it("pinned filter toggles in the sheet change the draft only; in the page's chip row they apply at once", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { url: "/scenes", pins: { scene: defaultPinsOf("scene") } }
    );
    await list.firstQuery();

    await user.click(filtersButton());
    const inSheet = within(sheet()).getByRole("button", { name: "Favorites" });
    expect(inSheet).toHaveAttribute("aria-pressed", "false");
    await user.click(inSheet);
    expect(inSheet).toHaveAttribute("aria-pressed", "true");
    expect(field("Favorite Scenes").value).toBe("true");
    expect(list.params().has("favorite")).toBe(false);
    expect(list.actions).toEqual([]);
    await user.keyboard("{Escape}");
    noSheet();

    // In the row: at once
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await waitFor(() => expect(list.params().get("favorite")).toBe("true"));
    expect(list.actions).toEqual(["PUSH"]);
  });

  it("the sheet lists Advanced and Clear all; Advanced replaces the sheet with the row view over the same draft", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { url: "/scenes?favorite=true&organized=true" }
    );
    await list.firstQuery();

    // Clear all empties the draft only
    await user.click(filtersButton());
    await user.click(
      within(sheet()).getByRole("button", { name: "Clear all" })
    );
    expect(
      within(sheet()).queryByLabelText("Favorite Scenes")
    ).not.toBeInTheDocument();
    expect(list.params().get("favorite")).toBe("true");
    await user.keyboard("{Escape}");

    // Advanced opens over the draft; its Apply commits it and closes both
    await user.click(filtersButton());
    await user.selectOptions(field("Favorite Scenes"), "false");
    await user.click(within(sheet()).getByRole("button", { name: "Advanced" }));
    const advanced = await screen.findByRole("dialog", {
      name: "Advanced filters",
    });
    expect(
      within(advanced).getByLabelText<HTMLSelectElement>("Favorite Scenes")
        .value
    ).toBe("false");
    await user.click(within(advanced).getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(list.params().get("favorite")).toBe("false"));
    expect(list.params().get("organized")).toBe("true");
    expect(list.actions).toEqual(["PUSH"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the count is not asked while the sheet is closed, and a hide refetches it", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();
    expect(countPosts()).toHaveLength(0);

    await user.click(filtersButton());
    await waitFor(() => expect(countPosts()).toHaveLength(1));

    // A hide invalidates the library's queries, the count among them
    await act(() => invalidateExclusionDependents(list.queryClient));
    await waitFor(() => expect(countPosts()).toHaveLength(2));

    await user.keyboard("{Escape}");
    await act(() => invalidateExclusionDependents(list.queryClient));
    expect(countPosts()).toHaveLength(2);
  });

  it("on a studio's Performers tab the count request carries `performer_filter.studios`", async () => {
    const user = userEvent.setup();
    restore?.();
    restore = null;
    tv = true;
    const lock = { value: ["7:inst-a"], modifier: "INCLUDES", depth: -1 };
    render(
      <MemoryRouterWithQuery initialEntries={["/tab?favorite=true"]}>
        <SearchableGrid
          entityType="performer"
          lockedFilters={{ performer_filter: { studios: lock } }}
          hideLockedFilters
          renderItem={() => null}
        />
      </MemoryRouterWithQuery>
    );
    await waitFor(() => expect(minimal.findPerformers).toHaveBeenCalled());

    await user.click(filtersButton());
    await waitFor(() => expect(countPosts()).toHaveLength(1));
    const [url, body] = must(countPosts()[0], "the count");
    expect(url).toBe("/library/performers/count");
    expect(body).toMatchObject({
      performer_filter: { studios: lock },
      where: { rules: [{ field: "favorite", criterion: true }] },
    });
  });

  it("emptying a row's value in the sheet keeps its editor and focus", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes" });
    await list.firstQuery();

    await user.click(filtersButton());
    await user.type(
      within(sheet()).getByRole("combobox", { name: "Find a filter" }),
      "Title"
    );
    await user.click(
      within(sheet()).getByRole("option", { name: "Title Search" })
    );
    const title = within(sheet()).getByLabelText("Title Search");
    await waitFor(() => expect(title).toHaveFocus());
    await user.type(title, "ab");
    await user.type(title, "{Backspace}{Backspace}");

    expect(within(sheet()).getByLabelText("Title Search")).toBe(title);
    expect(title).toHaveFocus();
    expect(title).toHaveValue("");
  });

  it("two Tags rows have distinct control ids and each label names its own input", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      {
        url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES&2.tagIds=2:a&2.tagIdsModifier=INCLUDES",
      }
    );
    await list.firstQuery();

    await user.click(filtersButton());
    const labels = within(sheet()).getAllByText("Tags", { selector: "label" });
    expect(labels.map((label) => label.getAttribute("for"))).toEqual([
      "filter-tagIds",
      "filter-2-tagIds",
    ]);
    for (const label of labels) {
      const id = must(label.getAttribute("for"), "the label's control");
      const control = must(document.getElementById(id), `#${id}`);
      expect(control.closest("[data-sheet-row]")).toBe(
        label.closest("[data-sheet-row]")
      );
    }
  });

  it("in the sheet, Pin as quick filter pins the row's value; the draft is unchanged", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?organized=true" });
    await list.firstQuery();

    await user.click(filtersButton());
    const row = must(
      field("Organized").closest<HTMLElement>("[data-sheet-row]"),
      "the Organized row"
    );
    await user.click(
      within(row).getByRole("button", { name: "Pin as quick filter" })
    );

    // Saved at once, not with the draft
    const [path, body] = must(vi.mocked(apiPut).mock.lastCall, "a save");
    expect(path).toBe("/user/filter-pins/scene");
    expect(body).toMatchObject({
      filters: [{ key: "organized", state: { organized: "true" } }],
    });
    expect(
      await within(row).findByRole("button", { name: "Unpin quick filter" })
    ).toBeEnabled();
    expect(field("Organized").value).toBe("true");

    await user.click(showButton());
    noSheet();
    expect(list.actions).toEqual([]);
    expect(list.params().get("organized")).toBe("true");
  });

  it("on a desktop there is no Filters button and a chip opens its popover", async () => {
    restore?.();
    restore = null;
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();

    expect(
      screen.queryByRole("button", { name: /^Filters/ })
    ).not.toBeInTheDocument();
    await user.click(await edit("Favorite Scenes: Yes"));
    expect(
      screen.getByRole("dialog", { name: "Favorite Scenes filter" })
    ).toBeInTheDocument();
    noSheet();
  });
});
