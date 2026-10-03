/**
 * The Advanced view over a list's state: it opens on the list's tree, edits
 * a draft that sends nothing until Apply, applies once (one request, one
 * history entry, normalized), refuses Apply over the limits, asks before
 * discarding, shows the page's own filter as fixed, opens at a group, and
 * takes the whole screen on a phone or a TV. It renders as a list holds it:
 * the list's state from the URL (`useListUrlState`), the scene request from
 * it, and Apply wired to `applyFilters`.
 */
import { useCallback, useMemo, useState } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { ListKind } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { matchMediaQueries } from "@tests/helpers/matchMedia";
import { jsonResponse, stubApi } from "@tests/helpers/stubApi";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "@/api/hooks/usePresets";
import { useSceneList } from "@/api/hooks/useScenes";
import { type LibrarySearchParams, libraryApi } from "@/api/library";
import AdvancedFilterView from "@/components/filter-rows/AdvancedFilterView";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import {
  useFilterOptions,
  useListDefaults,
  useLockedFields,
} from "@/hooks/useListOptions";
import { useListUrlState } from "@/hooks/useListUrlState";
import type { FilterChip } from "@/utils/filterFields";
import { buildListQuery, sortOptionsFor } from "@/utils/listQuery";

const tv = vi.hoisted(() => ({ on: false }));

vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: tv.on, toggleTVMode: () => {} }),
}));

vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({}),
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

const TAGS = [
  { id: "1", instanceId: "a", name: "Tag A" },
  { id: "2", instanceId: "a", name: "Tag B" },
];

const NO_FILTERS: Record<string, unknown> = {};
const NO_CHIPS: readonly FilterChip[] = [];
const VIEW_MODES = ["grid"];

interface HostProps {
  kind?: ListKind;
  permanentFilters?: Record<string, unknown>;
  permanentChips?: readonly FilterChip[];
  focusGroup?: number;
}

/**
 * A list as a page holds it: its state from the URL, the scene request
 * built from it, a button that opens the Advanced view, and Apply wired to
 * the state's `applyFilters`
 */
function Host({
  kind = "scene",
  permanentFilters = NO_FILTERS,
  permanentChips = NO_CHIPS,
  focusGroup,
}: HostProps) {
  const filterOptions = useFilterOptions(kind);
  const lockedFields = useLockedFields(kind, permanentFilters);
  const defaults = useListDefaults(kind, "o_counter");
  const sortOptions = useCallback(
    (filters: Record<string, unknown>) => sortOptionsFor(kind, filters),
    [kind]
  );
  const listState = useListUrlState({
    entityType: kind,
    filterOptions,
    sortOptions,
    viewModes: VIEW_MODES,
    defaults,
    permanentFilters,
    lockedFields,
  });
  const { ready, filters, sort, page, perPage, q } = listState;
  const request = useMemo(
    () =>
      kind === "scene"
        ? buildListQuery(
            kind,
            { ready, filters, sort, page, perPage, q },
            listState.permanentFilters
          )
        : null,
    [kind, ready, filters, sort, page, perPage, q, listState.permanentFilters]
  );
  useSceneList(request as LibrarySearchParams<"scene"> | null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Advanced
      </button>
      <AdvancedFilterView
        isOpen={open}
        onClose={() => setOpen(false)}
        kind={kind}
        value={filters}
        onApply={listState.applyFilters}
        permanentChips={permanentChips}
        {...(focusGroup === undefined ? {} : { focusGroup })}
      />
    </>
  );
}

/** The list at `urls` (the last one current), each navigation's history action recorded */
function renderList(urls: string | readonly string[], props: HostProps = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(presetsQueryOptions.queryKey, { presets: {} });
  queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
    defaults: {},
  });
  const entries = typeof urls === "string" ? [urls] : [...urls];
  const router = createMemoryRouter(
    [{ path: "*", element: <Host {...props} /> }],
    {
      initialEntries: entries,
      initialIndex: entries.length - 1,
    }
  );
  const actions: string[] = [];
  let last = router.state.location;
  router.subscribe((next) => {
    if (next.location === last) return;
    last = next.location;
    actions.push(next.historyAction);
  });
  render(
    <ShortcutScopeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ShortcutScopeProvider>
  );
  return {
    router,
    actions,
    search: () => router.state.location.search,
    params: () => new URLSearchParams(router.state.location.search),
  };
}

type Request = Record<string, unknown> & {
  where?: unknown;
  scene_filter?: unknown;
};

let findScenes: ReturnType<typeof spyFindScenes>;
const spyFindScenes = () =>
  vi
    .spyOn(libraryApi, "findScenes")
    .mockResolvedValue({ findScenes: { count: 0, scenes: [] } });

const lastRequest = (): Request =>
  must(findScenes.mock.lastCall, "a scene request")[0] as Request;

/** Opens the view from the list's Advanced button */
const openView = () => {
  const opener = screen.getByRole("button", { name: "Advanced" });
  opener.focus();
  fireEvent.click(opener);
  return screen.getByRole("dialog", { name: "Advanced filters" });
};

const view = () => screen.getByRole("dialog", { name: "Advanced filters" });
const discardPrompt = () =>
  screen.queryByRole("dialog", { name: "Discard changes?" });

/** The field selects' values in `scope`, in order, outside any group when `rootOnly` */
const fieldsIn = (scope: HTMLElement, rootOnly = false) =>
  within(scope)
    .queryAllByRole("combobox", { name: "Filter" })
    .filter((select) => !rootOnly || select.closest('[role="group"]') === null)
    .map((select) => (select as HTMLSelectElement).value);

/** Adds a row of `key` to a container's waiting row; focus goes to its value */
const addRow = (container: string, key: string) => {
  fireEvent.change(
    within(view()).getByRole("combobox", {
      name: `Add a filter to ${container}`,
    }),
    { target: { value: key } }
  );
};

/** Sets the focused value control (a choice row's select) */
const setFocused = (value: string) => {
  const control = document.activeElement;
  if (!(control instanceof HTMLSelectElement)) {
    throw new Error("focus is not on a select");
  }
  fireEvent.change(control, { target: { value } });
  return control;
};

const pressEscape = () => {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
  });
};

/** The view's footer button, by name */
const footerButton = (name: string) =>
  within(view()).getByRole("button", { name });

describe("AdvancedFilterView", () => {
  beforeEach(() => {
    tv.on = false;
    stubApi({
      "/library/tags/minimal": () => jsonResponse(200, { tags: TAGS }),
      "/library/performers/minimal": () =>
        jsonResponse(200, { performers: [] }),
    });
    findScenes = spyFindScenes();
  });
  afterEach(() => {
    findScenes.mockRestore();
    vi.unstubAllGlobals();
  });

  it("opens on the list's tree", async () => {
    renderList(
      "/scenes?tagIds=1:a&g1=any&g1.tagFavorite=true&g1.performerFavorite=true"
    );
    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(1));

    const dialog = openView();

    expect(fieldsIn(dialog, true)).toEqual(["tagIds"]);
    const group = within(dialog).getByRole("group", { name: "Group 1" });
    expect(
      within(group).getByRole("combobox", { name: "Match for Group 1" })
    ).toHaveValue("any");
    expect([...fieldsIn(group)].sort()).toEqual([
      "performerFavorite",
      "tagFavorite",
    ]);
  });

  it("edits fire no request until Apply", async () => {
    const list = renderList("/scenes");
    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(1));
    openView();

    addRow("top level", "favorite");
    setFocused("true");
    addRow("top level", "watched");
    setFocused("false");
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(findScenes).toHaveBeenCalledTimes(1);
    expect(list.actions).toEqual([]);
    const before = list.router.state.location;

    fireEvent.click(footerButton("Apply"));

    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(2));
    expect(lastRequest().where).toEqual({
      match: "all",
      rules: [
        { field: "favorite", criterion: true },
        { field: "watched", criterion: false },
      ],
    });
    expect(list.actions).toEqual(["PUSH"]);
    expect(list.router.state.location.key).not.toBe(before.key);
    expect(list.params().get("favorite")).toBe("true");
    expect(list.params().get("watched")).toBe("false");
    expect(
      screen.queryByRole("dialog", { name: "Advanced filters" })
    ).not.toBeInTheDocument();
  });

  it("Apply normalizes", async () => {
    const list = renderList("/scenes?g1=any&g1.tagIds=1:a&g1.2.tagIds=2:a");
    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(1));
    const dialog = openView();
    const group = within(dialog).getByRole("group", { name: "Group 1" });
    expect(fieldsIn(group)).toEqual(["tagIds", "tagIds"]);

    fireEvent.click(footerButton("Apply"));

    const params = list.params();
    expect(params.get("g1")).toBe("any");
    expect(params.get("g1.tagIds")).toBe("1:a,2:a");
    expect(params.get("g1.tagIdsModifier")).toBe("INCLUDES");
    expect(params.has("g1.2.tagIds")).toBe(false);
    expect(list.actions).toEqual(["PUSH"]);
  });

  it("Apply is disabled over the limits, with the reason", async () => {
    // 18 root rows and an any group whose two Tags rows merge: 19 rules
    const root = Array.from(
      { length: 18 },
      (_, at) => `${at === 0 ? "" : `${at + 1}.`}tagIds=${at + 1}:a`
    );
    const list = renderList(
      `/scenes?${root.join("&")}&g1=any&g1.tagIds=1:a&g1.2.tagIds=2:a`
    );
    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(1));
    openView();
    const url = list.search();

    addRow("top level", "favorite");
    setFocused("true");
    // Unmerged, the group's two rows count twice: 21 rules
    fireEvent.change(
      within(view()).getByRole("combobox", { name: "Match for Group 1" }),
      { target: { value: "all" } }
    );

    const apply = footerButton("Apply");
    expect(apply).toHaveAttribute("aria-disabled", "true");
    const reasonId = must(apply.getAttribute("aria-describedby"), "a reason");
    expect(document.getElementById(reasonId)).toHaveTextContent(
      "21 of 20 rules. Remove 1 to apply."
    );

    fireEvent.click(apply);
    expect(view()).toBeInTheDocument();
    expect(list.search()).toBe(url);
    expect(list.actions).toEqual([]);
  });

  describe("closing with changes asks first", () => {
    /** Opens the view and adds a Favorite Scenes row set to Yes */
    async function openWithChange() {
      const list = renderList("/scenes");
      await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(1));
      openView();
      addRow("top level", "favorite");
      const control = setFocused("true");
      return { list, control };
    }

    /** "Keep editing" returns to the view, the draft intact, focus where it was */
    const keepEditing = (focused: Element | null) => {
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(discardPrompt()).not.toBeInTheDocument();
      expect(fieldsIn(view(), true)).toEqual(["favorite"]);
      expect(document.activeElement).toBe(focused);
    };

    it("Escape asks; Keep editing returns to the draft", async () => {
      const { control } = await openWithChange();
      expect(document.activeElement).toBe(control);

      pressEscape();

      expect(discardPrompt()).toHaveTextContent(
        "Your rule changes are not applied."
      );
      keepEditing(control);
      expect(control).toHaveValue("true");
    });

    it("the close button asks", async () => {
      await openWithChange();
      const close = within(view()).getByRole("button", { name: "Close" });
      close.focus();

      fireEvent.click(close);

      expect(discardPrompt()).toBeInTheDocument();
      keepEditing(close);
    });

    it("the backdrop asks", async () => {
      const { control } = await openWithChange();
      const backdrop = must(view().parentElement, "the backdrop");

      fireEvent.mouseDown(backdrop);
      fireEvent.click(backdrop);

      expect(discardPrompt()).toBeInTheDocument();
      keepEditing(control);
    });

    it("Cancel asks; Discard closes and leaves the URL as it was", async () => {
      const { list } = await openWithChange();
      const url = list.search();
      const cancel = footerButton("Cancel");
      cancel.focus();

      fireEvent.click(cancel);
      expect(discardPrompt()).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Discard" }));
        await Promise.resolve();
      });

      expect(
        screen.queryByRole("dialog", { name: "Advanced filters" })
      ).not.toBeInTheDocument();
      expect(list.search()).toBe(url);
      expect(list.actions).toEqual([]);
      expect(findScenes).toHaveBeenCalledTimes(1);
    });

    it("with no changes, or changes undone, it closes at once", async () => {
      const { control } = await openWithChange();
      fireEvent.change(control, { target: { value: "any" } });

      fireEvent.click(footerButton("Cancel"));

      expect(discardPrompt()).not.toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Advanced filters" })
      ).not.toBeInTheDocument();

      openView();
      pressEscape();
      expect(discardPrompt()).not.toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "Advanced filters" })
      ).not.toBeInTheDocument();
    });
  });

  it("if the list's filters change while open (Back), the draft stays and a warning says Apply replaces them", async () => {
    const list = renderList(["/scenes?favorite=true", "/scenes?watched=true"]);
    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(1));
    openView();
    expect(
      screen.queryByText(/The list's filters changed since you opened this/)
    ).not.toBeInTheDocument();

    await act(() => list.router.navigate(-1));

    expect(
      screen.getByText(
        "The list's filters changed since you opened this. Apply replaces them."
      )
    ).toBeInTheDocument();
    expect(fieldsIn(view(), true)).toEqual(["watched"]);
  });

  it("a page's permanent filter shows as fixed", async () => {
    const performer = { value: ["7:a"], modifier: "INCLUDES" };
    renderList("/performer/7", {
      permanentFilters: { performers: performer },
      permanentChips: [
        { key: "performers", parts: { label: "Performer", values: ["Jane"] } },
      ],
    });
    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(1));
    const dialog = openView();

    const fixed = within(dialog).getByText(
      "Fixed by this page: Performer: Jane"
    );
    expect(fixed.querySelector("input, select, button, textarea")).toBeNull();
    expect(fieldsIn(dialog)).toEqual([]);

    addRow("top level", "favorite");
    setFocused("true");
    fireEvent.click(footerButton("Apply"));

    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(2));
    expect(lastRequest().scene_filter).toEqual({ performers: performer });
    expect(lastRequest().where).toEqual({
      match: "all",
      rules: [{ field: "favorite", criterion: true }],
    });
  });

  it("opened from a group chip, focus lands on that group's Match select", async () => {
    renderList("/scenes?g1.tagIds=1:a&g2=any&g2.favorite=true", {
      focusGroup: 2,
    });
    await waitFor(() => expect(findScenes).toHaveBeenCalledTimes(1));

    const dialog = openView();

    expect(document.activeElement).toBe(
      within(dialog).getByRole("combobox", { name: "Match for Group 2" })
    );
  });

  it("clips take groups", () => {
    renderList("/clips", { kind: "clip" });

    const dialog = openView();

    expect(
      within(dialog).getByRole("button", { name: "Add group" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "Match for top level" })
    ).toBeInTheDocument();
  });

  describe("phone and TV get the full-height sheet", () => {
    /** The dialog fills the screen; its body scrolls; Apply and Cancel stay below it */
    const expectSheet = (dialog: HTMLElement) => {
      expect(dialog).toHaveClass("h-full", "max-w-none");
      expect(dialog).not.toHaveClass("max-h-[90vh]", "rounded-lg");
      const scroller = must(
        dialog.querySelector<HTMLElement>(".overflow-y-auto"),
        "the scrolling body"
      );
      expect(scroller).not.toBe(dialog);
      for (const name of ["Apply", "Cancel"]) {
        const button = within(dialog).getByRole("button", { name });
        expect(scroller.contains(button)).toBe(false);
      }
    };

    it("on a desktop it is the xl dialog", () => {
      renderList("/scenes");
      const dialog = openView();
      expect(dialog).toHaveClass("max-w-5xl");
      expect(dialog).not.toHaveClass("h-full");
    });

    it("at 767 px wide or less", () => {
      const restore = matchMediaQueries(["(max-width: 767px)"]);
      try {
        renderList("/scenes");
        expectSheet(openView());
      } finally {
        restore();
      }
    });

    it("in TV mode", () => {
      tv.on = true;
      renderList("/scenes");
      expectSheet(openView());
    });
  });
});
