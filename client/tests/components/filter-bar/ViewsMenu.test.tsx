/**
 * The Views menu on a list's URL state: it names the View the list shows,
 * marks it modified, loads a View in one history entry, and saves, saves
 * as new, renames, deletes and sets the default through the Views hooks.
 * Rendered beside `useListUrlState` in a router, the Views served by a
 * mocked API that answers each write.
 */
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { FilterPreset, SaveFilterPresetBody } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { actAsync, must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import {
  type SavedPreset,
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "@/api/hooks/usePresets";
import { VIEW_NAME_TAKEN } from "@/api/hooks/useViews";
import ViewsMenu from "@/components/filter-bar/ViewsMenu";
import type { ColumnConfig } from "@/config/tableColumns";
import { type ListUrlState, useListUrlState } from "@/hooks/useListUrlState";
import { SCENE_FILTER_OPTIONS } from "@/utils/filterConfig";

const { mockApiGet, mockApiPost, mockApiPut, mockApiPatch, mockApiDelete } =
  vi.hoisted(() => ({
    mockApiGet: vi.fn<(path: string) => Promise<unknown>>(),
    mockApiPost: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
    mockApiPut: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
    mockApiPatch: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
    mockApiDelete: vi.fn<(path: string) => Promise<unknown>>(),
  }));

let tv = false;
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: tv }),
}));

vi.mock("@/api", () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiPut: mockApiPut,
  apiPatch: mockApiPatch,
  apiDelete: mockApiDelete,
}));

const SORTS = [
  { value: "o_counter" },
  { value: "rating" },
  { value: "date" },
  { value: "title" },
];

/** A View as the server stores it and the list reads it */
type View = SavedPreset & FilterPreset;

const FAVE_LADIES: View = {
  id: "v1",
  name: "Fave Ladies",
  filters: { performerFavorite: "true" },
  sort: "rating",
  direction: "DESC",
};

const COLUMNS = { visible: ["title", "rating"], order: ["rating", "title"] };

const BIG_TABLE: View = {
  id: "v2",
  name: "Big table",
  filters: {
    tagIds: ["1:abc"],
    g1: "any",
    "g1.tagIds": ["2:abc"],
    "g1.favorite": "true",
  },
  sort: "date",
  direction: "ASC",
  viewMode: "table",
  gridDensity: "small",
  zoomLevel: "large",
  perPage: 48,
  tableColumns: COLUMNS,
};

/** What the server holds: the scene Views and the defaults, changed by each write */
let store: {
  presets: Record<string, FilterPreset[]>;
  defaults: Record<string, string>;
};

interface Setup {
  url?: string;
  views?: FilterPreset[];
  defaults?: Record<string, string>;
  context?: string;
  permanentFilters?: Record<string, unknown>;
  lockedFields?: readonly string[];
}

function renderMenu({
  url = "/scenes",
  views = [FAVE_LADIES, BIG_TABLE],
  defaults = {},
  context = "scene",
  permanentFilters,
  lockedFields,
}: Setup = {}) {
  store = { presets: { scene: views }, defaults };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(presetsQueryOptions.queryKey, {
    presets: store.presets,
  });
  queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
    defaults: store.defaults,
  });
  const onViewColumns = vi.fn<(columns: ColumnConfig | null) => void>();
  const current: { state: ListUrlState | null } = { state: null };
  const Harness = () => {
    const listState = useListUrlState({
      entityType: "scene",
      context,
      filterOptions: SCENE_FILTER_OPTIONS,
      sortOptions: SORTS,
      viewModes: ["grid", "wall", "table"],
      defaults: {
        sort: "o_counter",
        direction: "DESC",
        perPage: 24,
        viewMode: "grid",
        zoomLevel: "medium",
        gridDensity: "medium",
      },
      ...(permanentFilters ? { permanentFilters } : {}),
      ...(lockedFields ? { lockedFields } : {}),
    });
    current.state = listState;
    return (
      <ViewsMenu
        listState={listState}
        context={context}
        {...(permanentFilters ? { permanentFilters } : {})}
        currentTableColumns={null}
        onViewColumns={onViewColumns}
      />
    );
  };
  const router = createMemoryRouter([{ path: "*", element: <Harness /> }], {
    initialEntries: [url],
  });
  const actions: string[] = [];
  let last = router.state.location;
  router.subscribe((next) => {
    if (next.location === last) return;
    last = next.location;
    actions.push(next.historyAction);
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return {
    get state() {
      return must(current.state, "list state");
    },
    actions,
    onViewColumns,
    params: () => new URLSearchParams(router.state.location.search),
  };
}

const viewsButton = () =>
  screen.getByRole("button", { name: /^Views/, expanded: false });

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(viewsButton());
  return screen.findByRole("menu", { name: "Views" });
}

/** Opens the menu and picks a View by name */
async function loadByClick(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  const menu = await openMenu(user);
  await user.click(within(menu).getByRole("menuitemradio", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tv = false;
  mockApiGet.mockImplementation((path) =>
    Promise.resolve(
      path === "/user/filter-presets"
        ? { presets: store.presets }
        : { defaults: store.defaults }
    )
  );
  mockApiPut.mockImplementation((path, body) => {
    if (path === "/user/default-preset") {
      const { context, presetId } = body as {
        context: string;
        presetId: string | null;
      };
      const { [context]: _dropped, ...rest } = store.defaults;
      store.defaults = presetId ? { ...rest, [context]: presetId } : rest;
      return Promise.resolve({ success: true, defaults: store.defaults });
    }
    const id = must(path.split("/").at(-1), "the View's id");
    const views = store.presets.scene ?? [];
    const saved = {
      ...must(
        views.find((view) => view.id === id),
        "the View"
      ),
      ...(body as object),
    };
    store.presets = {
      scene: views.map((view) => (view.id === id ? saved : view)),
    };
    return Promise.resolve({ success: true, preset: saved });
  });
  mockApiPatch.mockImplementation((path, body) => {
    const id = must(path.split("/").at(-1), "the View's id");
    const { name } = body as { name: string };
    store.presets = {
      scene: (store.presets.scene ?? []).map((view) =>
        view.id === id ? { ...view, name } : view
      ),
    };
    return Promise.resolve({ success: true });
  });
  mockApiDelete.mockImplementation((path) => {
    const id = path.split("/").at(-1);
    store.presets = {
      scene: (store.presets.scene ?? []).filter((view) => view.id !== id),
    };
    return Promise.resolve({ success: true });
  });
  mockApiPost.mockImplementation((_path, body) => {
    const {
      name,
      setAsDefault,
      context = "scene",
      artifactType: _artifactType,
      ...state
    } = body as SaveFilterPresetBody;
    const preset: FilterPreset = { ...state, id: "v-new", name };
    store.presets = { scene: [...(store.presets.scene ?? []), preset] };
    if (setAsDefault)
      store.defaults = { ...store.defaults, [context]: "v-new" };
    return Promise.resolve({ success: true, preset });
  });
});

describe("ViewsMenu", () => {
  it("the button reads `Views` with no view, `Views: Fave Ladies` with the default view applied, and adds a modified mark (`aria-label` ends `, modified`) when `viewModified`", async () => {
    const list = renderMenu();
    expect(viewsButton()).toHaveAccessibleName("Views");

    await actAsync(() => list.state.loadView(FAVE_LADIES));
    expect(viewsButton()).toHaveAccessibleName("Views: Fave Ladies");

    await actAsync(() => list.state.setSort("title"));
    expect(viewsButton()).toHaveAccessibleName("Views: Fave Ladies, modified");
    expect(viewsButton()).toHaveTextContent("Views: Fave Ladies");
  });

  it("the default View names the button, and a filter change marks it and writes savedView: the button reads `Views: Fave Ladies, modified`", async () => {
    const list = renderMenu({ defaults: { scene: "v1" } });
    expect(viewsButton()).toHaveAccessibleName("Views: Fave Ladies");
    expect(viewsButton()).toHaveTextContent("Views: Fave Ladies");

    await actAsync(() =>
      list.state.applyFilters({ performerFavorite: "true", favorite: "true" })
    );

    expect(list.params().get("savedView")).toBe("v1");
    expect(viewsButton()).toHaveAccessibleName("Views: Fave Ladies, modified");
  });

  it('the menu (`role="menu"`, items `menuitemradio` with `aria-checked`) lists the context\'s views, marks the default `Default`, and loads one on Enter: filters, groups, sort, view, density, zoom, per page, its table columns; the URL gains `savedView=<id>`, one history entry', async () => {
    const user = userEvent.setup();
    const list = renderMenu({
      url: "/performer/1",
      context: "scene_performer",
      defaults: { scene_performer: "v1" },
    });

    const menu = await openMenu(user);
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Fave LadiesDefault",
      "Big table",
    ]);
    expect(must(items[0]).getAttribute("aria-checked")).toBe("true");
    expect(must(items[1]).getAttribute("aria-checked")).toBe("false");
    // Focus starts on the View the list shows
    expect(items[0]).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{Enter}");

    const params = list.params();
    expect(params.get("savedView")).toBe("v2");
    expect(params.get("tagIds")).toBe("1:abc");
    expect(params.get("g1")).toBe("any");
    expect(params.get("g1.tagIds")).toBe("2:abc");
    expect(params.get("g1.favorite")).toBe("true");
    expect(params.get("sort")).toBe("date");
    expect(params.get("dir")).toBe("ASC");
    expect(params.get("view")).toBe("table");
    expect(params.get("grid_density")).toBe("small");
    expect(params.get("zoom")).toBe("large");
    expect(params.get("per_page")).toBe("48");
    expect(list.actions).toEqual(["PUSH"]);
    expect(list.onViewColumns).toHaveBeenCalledWith(COLUMNS);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(viewsButton()).toHaveAccessibleName("Views: Big table");
  });

  it("a View saved without columns hands over none, so the user's own show", async () => {
    const user = userEvent.setup();
    const list = renderMenu();
    await loadByClick(user, "Fave Ladies");
    expect(list.onViewColumns).toHaveBeenCalledWith(null);
  });

  it("lists the scene Views on a scene_* tab", async () => {
    const user = userEvent.setup();
    renderMenu({ context: "scene_gallery", url: "/gallery/1" });
    const menu = await openMenu(user);
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(2);
  });

  it("says so when the list has no Views", async () => {
    const user = userEvent.setup();
    renderMenu({ views: [] });
    const menu = await openMenu(user);
    expect(menu).toHaveTextContent("No saved views");
    expect(within(menu).queryAllByRole("menuitemradio")).toEqual([]);
  });

  it("Save changes is enabled only for a modified active view and PUTs the current state without the page's permanent filters, the search text or pins", async () => {
    const user = userEvent.setup();
    const list = renderMenu({
      url: "/performer/1",
      context: "scene_performer",
      permanentFilters: {
        performers: { value: ["1:abc"], modifier: "INCLUDES" },
      },
      lockedFields: ["performers"],
    });

    // No View: nothing to save to
    let menu = await openMenu(user);
    expect(
      within(menu).getByRole("menuitem", { name: "Save changes" })
    ).toBeDisabled();
    await user.keyboard("{Escape}");

    await loadByClick(user, "Fave Ladies");
    menu = await openMenu(user);
    expect(
      within(menu).getByRole("menuitem", { name: "Save changes" })
    ).toBeDisabled();
    await user.keyboard("{Escape}");

    await actAsync(() => list.state.setSort("title"));
    await actAsync(() => list.state.setQuery("beach"));
    expect(viewsButton()).toHaveAccessibleName("Views: Fave Ladies, modified");

    menu = await openMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", { name: "Save changes" })
    );

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith("/user/filter-presets/scene/v1", {
        filters: { performerFavorite: "true" },
        sort: "title",
        direction: "DESC",
        viewMode: "grid",
        zoomLevel: "medium",
        gridDensity: "medium",
        tableColumns: null,
        perPage: 24,
      })
    );
    await waitFor(() =>
      expect(viewsButton()).toHaveAccessibleName("Views: Fave Ladies")
    );
  });

  it("Save as new asks a name (dialog `Save view`), offers Set as default for <context label>, and loads the new view", async () => {
    const user = userEvent.setup();
    const list = renderMenu({ context: "scene_gallery", url: "/gallery/1" });
    await actAsync(() => list.state.applyFilters({ favorite: "true" }));

    const menu = await openMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", { name: "Save as new view" })
    );
    const dialog = await screen.findByRole("dialog", { name: "Save view" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(name).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(name, "Beach");
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Set as default for Gallery pages",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith("/user/filter-presets", {
        artifactType: "scene",
        context: "scene_gallery",
        name: "Beach",
        filters: { favorite: "true" },
        sort: "o_counter",
        direction: "DESC",
        viewMode: "grid",
        zoomLevel: "medium",
        gridDensity: "medium",
        tableColumns: null,
        perPage: 24,
        setAsDefault: true,
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Save view" })).toBeNull()
    );
    expect(list.params().get("savedView")).toBe("v-new");
    expect(list.params().get("favorite")).toBe("true");
    await waitFor(() =>
      expect(viewsButton()).toHaveAccessibleName("Views: Beach")
    );
  });

  it('a 409 for a name another View has says "A view named <name> already exists" in the dialog', async () => {
    const user = userEvent.setup();
    renderMenu();
    mockApiPost.mockRejectedValueOnce(
      new ApiError(VIEW_NAME_TAKEN, 409, {
        error: VIEW_NAME_TAKEN,
        errorType: "CONFLICT",
      })
    );

    const menu = await openMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", { name: "Save as new view" })
    );
    const dialog = await screen.findByRole("dialog", { name: "Save view" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "Fave Ladies"
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A view named Fave Ladies already exists"
    );
    expect(screen.getByRole("dialog", { name: "Save view" })).toBeVisible();
  });

  it("a 409 from a write another tab beat says the Views changed elsewhere and reloads them", async () => {
    const user = userEvent.setup();
    renderMenu();
    const STALE = "Your settings changed while saving; try again";
    mockApiPatch.mockRejectedValueOnce(
      new ApiError(STALE, 409, { error: STALE, errorType: "CONFLICT" })
    );
    await loadByClick(user, "Fave Ladies");
    const gets = mockApiGet.mock.calls.length;

    const menu = await openMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", { name: "Rename view" })
    );
    const dialog = await screen.findByRole("dialog", { name: "Rename view" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Faves");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Your views changed in another tab or window"
    );
    expect(dialog).not.toHaveTextContent("already exists");
    await waitFor(() =>
      expect(mockApiGet.mock.calls.length).toBeGreaterThan(gets)
    );
    expect(mockApiGet).toHaveBeenCalledWith("/user/filter-presets");
  });

  it("Rename asks a name and PATCHes `{ name }`; Delete asks through `useConfirmDialog` and removes `savedView` from the URL; Set as default and Stop using as default PUT `/user/default-preset`", async () => {
    const user = userEvent.setup();
    const list = renderMenu();
    await loadByClick(user, "Fave Ladies");
    expect(list.params().get("savedView")).toBe("v1");

    // Rename
    let menu = await openMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", { name: "Rename view" })
    );
    const dialog = await screen.findByRole("dialog", { name: "Rename view" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("Fave Ladies");
    await user.clear(name);
    await user.type(name, "Faves");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockApiPatch).toHaveBeenCalledWith(
        "/user/filter-presets/scene/v1",
        { name: "Faves" }
      )
    );
    await waitFor(() =>
      expect(viewsButton()).toHaveAccessibleName("Views: Faves")
    );

    // Set as default, then stop using it
    menu = await openMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", {
        name: "Set as default for All Scenes page",
      })
    );
    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith("/user/default-preset", {
        context: "scene",
        presetId: "v1",
      })
    );
    menu = await openMenu(user);
    await user.click(
      await within(menu).findByRole("menuitem", {
        name: "Stop using as default for All Scenes page",
      })
    );
    await waitFor(() =>
      expect(mockApiPut).toHaveBeenLastCalledWith("/user/default-preset", {
        context: "scene",
        presetId: null,
      })
    );

    // Delete, asked first
    menu = await openMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", { name: "Delete view" })
    );
    const confirm = await screen.findByRole("dialog", { name: "Delete view?" });
    expect(confirm).toHaveTextContent('Delete view "Faves"?');
    expect(mockApiDelete).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/user/filter-presets/scene/v1"
      )
    );
    await waitFor(() => expect(list.params().has("savedView")).toBe(false));
    expect(viewsButton()).toHaveAccessibleName("Views");
  });

  it("Delete cancelled deletes nothing", async () => {
    const user = userEvent.setup();
    renderMenu({ defaults: { scene: "v1" } });
    const menu = await openMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", { name: "Delete view" })
    );
    const confirm = await screen.findByRole("dialog", { name: "Delete view?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Delete view?" })).toBeNull()
    );
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it("every action is a visible, named menu item reachable by arrows", async () => {
    const user = userEvent.setup();
    const list = renderMenu();
    await loadByClick(user, "Fave Ladies");
    await actAsync(() => list.state.setSort("title"));

    const menu = await openMenu(user);
    const reached: string[] = [];
    for (let i = 0; i < 8; i++) {
      await user.keyboard("{ArrowDown}");
      reached.push(document.activeElement?.textContent ?? "");
    }
    const ACTIONS = [
      "Save changes",
      "Save as new view",
      "Rename view",
      "Delete view",
      "Set as default for All Scenes page",
    ];
    for (const action of ACTIONS) {
      const item = within(menu).getByRole("menuitem", { name: action });
      expect(item).toBeVisible();
      expect(item.className).not.toMatch(/opacity-0/);
      expect(reached, action).toContain(action);
    }
  });

  it("a `savedView` id the user does not have shows no name and is dropped on the next write", async () => {
    const user = userEvent.setup();
    const list = renderMenu({
      url: "/scenes?savedView=another-users-view&favorite=true",
    });
    expect(viewsButton()).toHaveAccessibleName("Views");
    const menu = await openMenu(user);
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .filter((item) => item.getAttribute("aria-checked") === "true")
    ).toEqual([]);
    expect(menu).not.toHaveTextContent("another-users-view");
    await user.keyboard("{Escape}");

    await actAsync(() => list.state.setSort("title"));
    expect(list.params().has("savedView")).toBe(false);
    expect(list.params().get("sort")).toBe("title");
  });

  it("in TV mode the menu opens as a dialog listing views as buttons, actions below", async () => {
    tv = true;
    const user = userEvent.setup();
    const list = renderMenu();
    // The button says what it opens
    expect(viewsButton()).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(viewsButton());

    const dialog = await screen.findByRole("dialog", { name: "Views" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const fave = within(dialog).getByRole("button", { name: /^Fave Ladies/ });
    const big = within(dialog).getByRole("button", { name: /^Big table/ });
    const actions = [
      "Save changes",
      "Save as new view",
      "Rename view",
      "Delete view",
      "Set as default for All Scenes page",
    ].map((name) => within(dialog).getByRole("button", { name }));
    const before = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(before(fave, big)).toBe(true);
    for (const action of actions) expect(before(big, action)).toBe(true);
    expect(fave).toHaveAttribute("aria-pressed", "false");
    // Focus starts on the first view, so OK loads it
    expect(fave).toHaveFocus();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(list.params().get("savedView")).toBe("v1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: /^Views: Fave Ladies/ });
    await waitFor(() => expect(button).toHaveFocus());

    // Reopened, the active view is pressed and has focus
    await user.click(button);
    const again = await screen.findByRole("dialog", { name: "Views" });
    const active = within(again).getByRole("button", { name: /^Fave Ladies/ });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(active).toHaveFocus();
  });
});
