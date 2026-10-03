/**
 * FilterBar: one chip per root row of the list's filters, repeats included,
 * naming its values and its condition ("Tags: all of Blonde, Outdoor"), the
 * names resolved through the entity's `/minimal` endpoint (faked here as
 * the server answers it). A chip's body opens its editor in a popover under
 * it, whose changes apply live: a pick at once, typing 300 ms after the last
 * key, one history entry per open popover. The remove button clears the
 * row. The page's permanent filters show as dimmed labels.
 */
import {
  type ListKind,
  type PinnedFilter,
  type RowKey,
  defaultPinsOf,
} from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type PinsByList, pinsAnswer } from "@tests/helpers/filterPins";
import { renderListControls } from "@tests/helpers/renderListControls";
import { sentFilter } from "@tests/helpers/sentFilter";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import FilterBar from "@/components/filter-bar/FilterBar";
import type { ListFilters } from "@/hooks/useListFilters";
import {
  type FilterOption,
  type PanelState,
  filterOptionsOf,
  treeOf,
} from "@/utils/filterFields";
import { moveFocus } from "@/utils/spatialFocus";

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

const minimal = vi.hoisted(() => ({
  findTagsMinimal: vi.fn(),
  findPerformersMinimal: vi.fn(),
  findStudiosMinimal: vi.fn(),
  findGroupsMinimal: vi.fn(),
  findGalleriesMinimal: vi.fn(),
  findScenesMinimal: vi.fn(),
}));
const playlists = vi.hoisted(() => ({
  getPlaylists: vi.fn(),
  getSharedPlaylists: vi.fn(),
}));

vi.mock("@/api/library", () => ({ libraryApi: minimal }));
vi.mock("@/api/playlists", () => playlists);
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({ presets: {}, defaults: {} }),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({ success: true }),
  libraryApi: minimal,
  ...playlists,
}));

// Images' Studios offers Has none and Has any
vi.mock("@peek/shared-types", async (importOriginal) => {
  const { withRefPresence } = await import("@tests/helpers/refPresence");
  return withRefPresence(await importOriginal(), [["image", "studioIds"]]);
});

let unit = "metric";
vi.mock("@/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: unit }),
}));

let tv = false;
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: tv }),
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
  { id: "3", instanceId: "a", name: "Anal" },
  { id: "4", instanceId: "a", name: "Solo" },
  { id: "5", instanceId: "a", name: "Toys" },
  { id: "6", instanceId: "a", name: "Redhead" },
];
const STUDIOS: Known[] = [
  { id: "10", instanceId: "a", name: "Brazzers" },
  { id: "11", instanceId: "a", name: "Reality Kings" },
  { id: "772", instanceId: "a", name: "Studio A" },
  { id: "772", instanceId: "b", name: "Studio A" },
  { id: "971", instanceId: "a", name: "Studio B" },
];

/** The list's filters held still: what the bar reads, its writes recorded */
function staticFilters(
  kind: ListKind,
  state: PanelState,
  options: readonly FilterOption[] = filterOptionsOf(kind, unit)
) {
  const removeRow = vi.fn<(at: RowKey) => void>();
  const filters: ListFilters = {
    kind,
    filters: state,
    tree: treeOf(kind, state),
    options,
    commit: vi.fn(),
    setRow: vi.fn(),
    removeRow,
    removeGroup: vi.fn(),
    clear: vi.fn(),
  };
  return { filters, removeRow };
}

function renderBar(
  state: PanelState,
  {
    kind = "scene",
    options,
    permanentFilters,
    permanentFiltersMetadata,
    pins = {},
    onOpenSheet,
  }: {
    kind?: ListKind;
    options?: readonly FilterOption[];
    permanentFilters?: Record<string, unknown>;
    permanentFiltersMetadata?: Record<string, unknown>;
    pins?: PinsByList;
    onOpenSheet?: (focus: RowKey | "add") => void;
  } = {}
) {
  const { filters, removeRow } = staticFilters(kind, state, options);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(queryKeys.user.filterPins(), pinsAnswer(pins));
  render(
    <QueryClientProvider client={client}>
      <FilterBar
        filters={filters}
        {...(permanentFilters ? { permanentFilters } : {})}
        {...(permanentFiltersMetadata ? { permanentFiltersMetadata } : {})}
        {...(onOpenSheet ? { onOpenSheet } : {})}
      />
    </QueryClientProvider>
  );
  return { removeRow };
}

const addFilter = () => screen.getByRole("button", { name: "Add filter" });

/** The chip whose text is exactly `text` */
const edit = (text: string) =>
  screen.findByRole("button", { name: `Edit filter: ${text}` });

const removeButtons = () =>
  screen.queryAllByRole("button", { name: /^Remove filter:/ });

beforeEach(() => {
  vi.clearAllMocks();
  unit = "metric";
  minimal.findTagsMinimal.mockImplementation(minimalOf(TAGS));
  minimal.findStudiosMinimal.mockImplementation(minimalOf(STUDIOS));
  for (const find of [
    minimal.findPerformersMinimal,
    minimal.findGroupsMinimal,
    minimal.findGalleriesMinimal,
    minimal.findScenesMinimal,
  ]) {
    find.mockResolvedValue([]);
  }
});

afterEach(() => {
  vi.useRealTimers();
  tv = false;
});

describe("chip text", () => {
  it("a tag chip names its tags and its condition", async () => {
    renderBar({ tagIds: ["1:a", "2:a"], tagIdsModifier: "INCLUDES_ALL" });

    expect(await edit("Tags: all of Blonde, Outdoor")).toBeInTheDocument();
  });

  it("an exclusion reads as one", async () => {
    renderBar(
      { studioIds: ["10:a", "11:a"], studioIdsModifier: "EXCLUDES" },
      { kind: "image" }
    );

    expect(
      await edit("Studios: none of Brazzers, Reality Kings")
    ).toBeInTheDocument();
  });

  it("sub-tags show", async () => {
    renderBar({
      tagIds: ["3:a"],
      tagIdsModifier: "INCLUDES",
      tagIdsDepth: -1,
    });

    expect(await edit("Tags: any of Anal, with sub-tags")).toBeInTheDocument();
  });

  it("more than 3 names: the first 3, and how many more; only those are looked up", async () => {
    renderBar({
      tagIds: ["1:a", "2:a", "3:a", "4:a", "5:a"],
      tagIdsModifier: "INCLUDES",
    });

    expect(
      await edit("Tags: any of Blonde, Outdoor, Anal +2 more")
    ).toBeInTheDocument();
    expect(minimal.findTagsMinimal).toHaveBeenCalledTimes(1);
    expect(must(minimal.findTagsMinimal.mock.calls[0])[0]).toMatchObject({
      ids: ["1:a", "2:a", "3:a"],
    });
  });

  it("a name the server does not return is not invented", async () => {
    renderBar({ tagIds: ["1:a", "99:a"], tagIdsModifier: "INCLUDES" });

    expect(
      await edit("Tags: any of Blonde, 1 unavailable")
    ).toBeInTheDocument();
    expect(screen.queryByText(/99/)).not.toBeInTheDocument();
  });

  it("while names load the chip reads how many are selected", async () => {
    minimal.findTagsMinimal.mockImplementation(() => new Promise(() => {}));
    renderBar({ tagIds: ["1:a", "2:a"] });

    expect(await edit("Tags: 2 selected")).toBeInTheDocument();
  });

  it("the To Review preset's bare ids resolve to names; a bare id on two instances shows one name", async () => {
    renderBar(
      { studioIds: ["772", "971"], studioIdsModifier: "EXCLUDES" },
      { kind: "image" }
    );

    expect(
      await edit("Studios: none of Studio A, Studio B")
    ).toBeInTheDocument();
    expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument();
  });

  it("an include and an exclude read as one chip", async () => {
    renderBar({
      tagIds: ["1:a"],
      tagIdsExclude: ["6:a"],
      tagIdsModifier: "INCLUDES",
      tagIdsDepth: -1,
    });

    expect(
      await edit("Tags: any of Blonde; not Redhead, with sub-tags")
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Edit filter/ })
    ).toHaveLength(1);
  });

  it("excludes alone read as not", async () => {
    renderBar({ tagIdsExclude: ["6:a"] });

    expect(await edit("Tags: not Redhead")).toBeInTheDocument();
  });

  it("presence reads as has none or has any", async () => {
    renderBar(
      { studioIds: ["10:a"], studioIdsModifier: "IS_NULL" },
      { kind: "image" }
    );
    expect(await edit("Studios: has none")).toBeInTheDocument();
  });

  it("Has any on Performers reads has any", async () => {
    renderBar({ performerIdsModifier: "NOT_NULL" });

    expect(await edit("Performers: has any")).toBeInTheDocument();
    expect(minimal.findPerformersMinimal).not.toHaveBeenCalled();
  });

  it("a single-pick field names its pick without a condition", async () => {
    renderBar({ studioId: "10:a" }, { kind: "tag" });

    expect(await edit("Studio: Brazzers")).toBeInTheDocument();
  });

  it("Scenes' Studios, once a list, names its condition; a lone string stored before reads the same", async () => {
    renderBar({ studioId: ["10:a", "11:a"], studioIdModifier: "EXCLUDES" });

    expect(
      await edit("Studios: none of Brazzers, Reality Kings")
    ).toBeInTheDocument();
  });

  it("a Studio stored as a lone string reads as one pick", async () => {
    renderBar({ studioId: "10:a" });

    expect(await edit("Studios: any of Brazzers")).toBeInTheDocument();
  });

  it("a three-state favourite reads its choice", async () => {
    renderBar({ favorite: "false" });

    expect(await edit("Favorite Scenes: No")).toBeInTheDocument();
  });

  it("Resolution names its condition", async () => {
    renderBar({ resolution: "FULL_HD", resolutionModifier: "GREATER_THAN" });

    expect(await edit("Resolution: higher than 1080p")).toBeInTheDocument();
  });

  it("a range, a lone bound, a date and a choice read plainly", async () => {
    renderBar({
      rating: { min: "40", max: "80" },
      oCount: { min: "40" },
      performerCount: { max: "40" },
      date: { start: "2020-01-01" },
      favorite: true,
    });

    expect(await edit("Rating: 40 to 80")).toBeInTheDocument();
    expect(await edit("O Count: at least 40")).toBeInTheDocument();
    expect(await edit("Performer Count: at most 40")).toBeInTheDocument();
    expect(await edit("Scene Date: from 2020-01-01")).toBeInTheDocument();
    expect(await edit("Favorite Scenes: Yes")).toBeInTheDocument();
  });

  it("a select reads its choice label", async () => {
    renderBar(
      { resolution: "FULL_HD", resolutionModifier: "GREATER_THAN" },
      { kind: "image" }
    );

    expect(await edit("Resolution: higher than 1080p")).toBeInTheDocument();
  });

  it("a group of boxes with a condition reads it, as a picker's chip does", async () => {
    renderBar({ gender: "FEMALE" }, { kind: "performer" });

    expect(await edit("Gender: any of Female")).toBeInTheDocument();
  });

  it("a number with a unit names it", async () => {
    renderBar({ duration: { min: "5", max: "10" } });

    expect(await edit("Duration: 5 to 10 minutes")).toBeInTheDocument();
  });

  it("a metric viewer's Height chip reads centimetres", async () => {
    renderBar({ height: { min: 178, max: 188 } }, { kind: "performer" });

    expect(await edit("Height: 178 to 188 cm")).toBeInTheDocument();
  });

  it("an imperial viewer's Height chip reads feet and inches from a metric state", async () => {
    unit = "imperial";
    renderBar({ height: { min: 178, max: 188 } }, { kind: "performer" });

    expect(await edit("Height: 5 ft 10 in to 6 ft 2 in")).toBeInTheDocument();
  });

  it("an imperial viewer's Weight and Penis Length chips read pounds and inches", async () => {
    unit = "imperial";
    renderBar(
      { weight: { min: 68 }, penisLength: { max: 15.24 } },
      { kind: "performer" }
    );

    expect(await edit("Weight: at least 150 lbs")).toBeInTheDocument();
    expect(await edit("Penis Length: at most 6 in")).toBeInTheDocument();
  });

  it("a Path condition reads `Path: starts with /media/new`", async () => {
    renderBar({ path: "/media/new", pathModifier: "STARTS_WITH" });

    expect(await edit("Path: starts with /media/new")).toBeInTheDocument();
  });

  it("a playlist chip names its playlists from the lists, not `/minimal`", async () => {
    playlists.getPlaylists.mockResolvedValue(
      untrusted({ playlists: [{ id: 12, name: "Road trip" }] })
    );
    playlists.getSharedPlaylists.mockResolvedValue(
      untrusted({
        playlists: [{ id: 40, name: "Weekend", owner: { username: "alice" } }],
      })
    );

    renderBar({ playlistIds: ["12"], playlistIdsModifier: "INCLUDES" });

    expect(await edit("Playlists: any of Road trip")).toBeInTheDocument();
    for (const find of Object.values(minimal)) {
      expect(find).not.toHaveBeenCalled();
    }
  });

  it("a clip Scenes chip names its scenes by title", async () => {
    minimal.findScenesMinimal.mockResolvedValue([
      { id: "5", instanceId: "a", name: "Beach day" },
    ]);

    renderBar(
      { sceneIds: ["5:a"], sceneIdsModifier: "INCLUDES" },
      { kind: "clip" }
    );

    expect(await edit("Scenes: any of Beach day")).toBeInTheDocument();
  });
});

describe("chips and rows", () => {
  it("each active row is a chip named `Edit filter: <text>` with `Remove filter: <text>`", async () => {
    renderBar({ favorite: true, organized: true });

    expect(await edit("Favorite Scenes: Yes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove filter: Favorite Scenes: Yes",
      })
    ).toBeInTheDocument();
    expect(removeButtons()).toHaveLength(2);
  });

  it("the remove button removes that row", async () => {
    const user = userEvent.setup();
    const { removeRow } = renderBar({ favorite: true });

    await user.click(
      await screen.findByRole("button", {
        name: "Remove filter: Favorite Scenes: Yes",
      })
    );

    expect(removeRow).toHaveBeenCalledWith({
      group: 0,
      occurrence: 1,
      key: "favorite",
    });
  });

  it("removing a chip moves focus to the next chip's remove button, else the previous one's, else to + Filter", async () => {
    const user = userEvent.setup();
    renderBar({ favorite: true, organized: true });
    await edit("Favorite Scenes: Yes");
    const [first, second] = removeButtons();

    await user.click(must(first, "the first chip"));
    expect(second).toHaveFocus();

    await user.click(must(second, "the last chip"));
    expect(first).toHaveFocus();
    expect(addFilter()).not.toHaveFocus();
  });

  it("the only chip's removal moves focus to + Filter", async () => {
    const user = userEvent.setup();
    renderBar({ favorite: true });

    await user.click(
      await screen.findByRole("button", { name: /^Remove filter:/ })
    );

    expect(addFilter()).toHaveFocus();
  });

  it("two root Tags rows are two chips, each removing its own row", async () => {
    const user = userEvent.setup();
    const { removeRow } = renderBar({
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
      "2.tagIds": ["2:a"],
      "2.tagIdsModifier": "INCLUDES",
    });

    expect(await edit("Tags: any of Blonde")).toBeInTheDocument();
    expect(await edit("Tags: any of Outdoor")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Remove filter: Tags: any of Outdoor",
      })
    );

    expect(removeRow).toHaveBeenCalledWith({
      group: 0,
      occurrence: 2,
      key: "tagIds",
    });
  });

  it("a detail page's permanent chip still renders, is not a button and has no remove", () => {
    renderBar(
      {},
      {
        permanentFilters: { performers: { value: ["1:a"] } },
        permanentFiltersMetadata: { performers: [{ id: "1:a", name: "Ada" }] },
      }
    );

    const chip = screen.getByText("Performer: Ada");
    expect(chip).toBeInTheDocument();
    expect(chip.closest("button")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^(Edit|Remove) filter/ })
    ).not.toBeInTheDocument();
  });

  it("a page's locked field draws no chip", async () => {
    renderBar(
      { performerIds: ["1:a"] },
      {
        options: filterOptionsOf("scene").filter(
          (option) => option.key !== "performerIds"
        ),
      }
    );

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Edit filter/ })).toBeNull()
    );
  });

  it("no filters and no permanent ones draw only + Filter and Advanced", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.user.filterPins(), pinsAnswer());
    render(
      <QueryClientProvider client={client}>
        <FilterBar filters={staticFilters("scene", {}).filters} />
      </QueryClientProvider>
    );

    expect(screen.getAllByRole("button")).toEqual([
      addFilter(),
      screen.getByRole("button", { name: "Advanced" }),
    ]);
  });
});

describe("the chip's editor", () => {
  const dialog = () => screen.getByRole("dialog");
  /** An option in the editor's open picker list */
  const pick = (name: string) =>
    within(dialog()).findByRole("button", { name: new RegExp(`^${name}`) });

  it("a chip opens its editor in a popover in one click, focus on the field's first control", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();

    const chip = await edit("Favorite Scenes: Yes");
    await user.click(chip);

    expect(chip).toHaveAttribute("aria-expanded", "true");
    const select = within(dialog()).getByRole("combobox", {
      name: "Favorite Scenes",
    });
    expect(select).toHaveFocus();
    // Under the chip: the popover sits in the chip's own wrapper
    expect(must(chip.parentElement?.parentElement)).toContainElement(dialog());
  });

  it("a chip opens from the keyboard", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();

    (await edit("Favorite Scenes: Yes")).focus();
    await user.keyboard("{Enter}");

    expect(dialog()).toBeInTheDocument();
  });

  it("a picker change applies at once: the request carries it and the URL gains one entry", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES" }
    );
    await list.firstQuery();

    await user.click(await edit("Tags: any of Blonde"));
    // The picker's list is open at once
    await user.click(await pick("Outdoor"));

    await waitFor(() => expect(list.params().get("tagIds")).toBe("1:a,2:a"));
    expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
      tags: { value: ["1:a", "2:a"], modifier: "INCLUDES" },
    });
    expect(list.actions).toEqual(["PUSH"]);
    expect(dialog()).toBeInTheDocument();
  });

  it("typing in a number or text field applies 300 ms after the last key, never before", async () => {
    vi.useFakeTimers();
    const list = renderListControls({}, { url: "/scenes?rating_max=90" });
    await act(() => vi.advanceTimersByTimeAsync(0));

    fireEvent.click(
      screen.getByRole("button", { name: "Edit filter: Rating: at most 90" })
    );
    const min = within(dialog()).getByRole("spinbutton", {
      name: /^Minimum Rating/,
    });
    fireEvent.change(min, { target: { value: "6" } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.change(min, { target: { value: "60" } });

    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(list.params().has("rating_min")).toBe(false);
    expect(list.actions).toEqual([]);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(list.params().get("rating_min")).toBe("60");
    expect(list.actions).toEqual(["PUSH"]);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(list.actions).toEqual(["PUSH"]);
  });

  it("one edit session is one history entry: Back restores the state from before the popover opened", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES" }
    );
    await list.firstQuery();

    await user.click(await edit("Tags: any of Blonde"));
    await user.click(await pick("Outdoor"));
    await waitFor(() => expect(list.params().get("tagIds")).toBe("1:a,2:a"));
    await user.click(await pick("Anal"));
    await waitFor(() =>
      expect(list.params().get("tagIds")).toBe("1:a,2:a,3:a")
    );
    fireEvent.change(
      within(dialog()).getByRole("combobox", { name: "Tags condition" }),
      { target: { value: "INCLUDES_ALL" } }
    );
    await waitFor(() =>
      expect(list.params().get("tagIdsModifier")).toBe("INCLUDES_ALL")
    );
    expect(list.actions).toEqual(["PUSH", "REPLACE", "REPLACE"]);

    await list.back();

    expect(list.params().get("tagIds")).toBe("1:a");
    expect(list.params().get("tagIdsModifier")).toBe("INCLUDES");
    await waitFor(() =>
      expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
        tags: { value: ["1:a"], modifier: "INCLUDES" },
      })
    );
  });

  it("closing the popover with a change still waiting applies it", async () => {
    vi.useFakeTimers();
    const list = renderListControls({}, { url: "/scenes?rating_max=90" });
    await act(() => vi.advanceTimersByTimeAsync(0));

    fireEvent.click(
      screen.getByRole("button", { name: "Edit filter: Rating: at most 90" })
    );
    const min = within(dialog()).getByRole("spinbutton", {
      name: /^Minimum Rating/,
    });
    fireEvent.change(min, { target: { value: "60" } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.keyDown(min, { key: "Escape" });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(list.params().get("rating_min")).toBe("60");
    expect(list.actions).toEqual(["PUSH"]);
    expect(
      screen.getByRole("button", { name: "Edit filter: Rating: 60 to 90" })
    ).toHaveFocus();
  });

  it("a pinned filter tapped while a typed change waits applies both: the pin over the flushed edit", async () => {
    vi.useFakeTimers();
    const list = renderListControls(
      {},
      { url: "/scenes?rating_max=90", pins: { scene: defaultPinsOf("scene") } }
    );
    await act(() => vi.advanceTimersByTimeAsync(0));

    fireEvent.click(
      screen.getByRole("button", { name: "Edit filter: Rating: at most 90" })
    );
    fireEvent.change(
      within(dialog()).getByRole("spinbutton", { name: /^Minimum Rating/ }),
      { target: { value: "60" } }
    );
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.click(screen.getByRole("button", { name: "Unwatched" }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(list.params().get("watched")).toBe("false");
    expect(list.params().get("rating_min")).toBe("60");
    expect(list.params().get("rating_max")).toBe("90");
  });

  it("Advanced opened while a typed change waits opens over the flushed edit, with no warning", async () => {
    vi.useFakeTimers();
    const list = renderListControls({}, { url: "/scenes?rating_max=90" });
    await act(() => vi.advanceTimersByTimeAsync(0));

    fireEvent.click(
      screen.getByRole("button", { name: "Edit filter: Rating: at most 90" })
    );
    fireEvent.change(
      within(dialog()).getByRole("spinbutton", { name: /^Minimum Rating/ }),
      { target: { value: "60" } }
    );
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(list.params().get("rating_min")).toBe("60");
    const view = screen.getByRole("dialog", { name: "Advanced filters" });
    expect(
      within(view).getByRole<HTMLInputElement>("spinbutton", {
        name: /^Minimum Rating/,
      }).value
    ).toBe("60");
    expect(
      within(view).queryByText(/The list's filters changed/)
    ).not.toBeInTheDocument();
  });

  it("the URL changing from outside while the popover is open (Back) closes it", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();
    await act(() => list.router.navigate("/scenes?favorite=false"));

    await user.click(await edit("Favorite Scenes: No"));
    expect(dialog()).toBeInTheDocument();
    await list.back();

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(await edit("Favorite Scenes: Yes")).toBeInTheDocument();
    expect(list.params().get("favorite")).toBe("true");
  });

  it("two root Tags rows (`2.tagIds`) are two chips, and editing the second changes only `2.*` keys", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      {
        url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES&2.tagIds=2:a&2.tagIdsModifier=INCLUDES",
      }
    );
    await list.firstQuery();
    expect(await edit("Tags: any of Blonde")).toBeInTheDocument();

    await user.click(await edit("Tags: any of Outdoor"));
    await user.click(await pick("Anal"));

    await waitFor(() => expect(list.params().get("2.tagIds")).toBe("2:a,3:a"));
    expect(list.params().get("tagIds")).toBe("1:a");
    expect(list.params().get("tagIdsModifier")).toBe("INCLUDES");
    expect(list.params().get("2.tagIdsModifier")).toBe("INCLUDES");
  });
});

describe("in the list's controls", () => {
  it("Clear all removes every filter, not the page's permanent ones, and moves focus to + Filter", async () => {
    const user = userEvent.setup();
    const PERFORMER = { value: ["1:a"], modifier: "INCLUDES" };
    const list = renderListControls(
      {
        context: "scene_performer",
        permanentFilters: { performers: PERFORMER },
        permanentFiltersMetadata: { performers: [{ id: "1:a", name: "Ada" }] },
      },
      { url: "/performer/1?favorite=true&organized=true" }
    );
    await list.firstQuery();
    expect(removeButtons()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() => expect(removeButtons()).toHaveLength(0));
    expect(screen.getByText("Performer: Ada")).toBeInTheDocument();
    expect(list.lastQuery().scene_filter).toEqual({ performers: PERFORMER });
    expect(list.lastQuery().where).toBeUndefined();
    expect(addFilter()).toHaveFocus();
  });

  it("Clear all drops the active View: the list shows no View, unmodified", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      {
        url: "/scenes?savedView=v1&favorite=true",
        presets: {
          scene: [{ id: "v1", name: "Faves", filters: { favorite: "true" } }],
        },
      }
    );
    await list.firstQuery();

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() => expect(list.params().get("filters")).toBe("none"));
    expect(list.params().has("savedView")).toBe(false);
    expect(list.params().has("favorite")).toBe(false);
  });

  it("removing the first of two Tags rows keeps focus on its chip, which then shows the row that took its number", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      {
        url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES&2.tagIds=2:a&2.tagIdsModifier=INCLUDES",
      }
    );
    await list.firstQuery();

    await user.click(
      await screen.findByRole("button", {
        name: "Remove filter: Tags: any of Blonde",
      })
    );

    await waitFor(() => expect(list.params().get("tagIds")).toBe("2:a"));
    expect(
      await screen.findByRole("button", {
        name: "Remove filter: Tags: any of Outdoor",
      })
    ).toHaveFocus();
  });

  it("the Tags hierarchy view draws no chip bar and keeps its note", async () => {
    const list = renderListControls(
      { artifactType: "tag", filterable: false },
      { url: "/tags?favorite=true" }
    );
    await list.firstQuery();

    expect(
      screen.queryByRole("button", { name: /^Edit filter:/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Filters don't apply to the hierarchy view/)
    ).toBeInTheDocument();
  });

  it("a detail tab's locked field has no chip; its permanent chip is dimmed, not a button", async () => {
    const list = renderListControls(
      {
        context: "scene_performer",
        permanentFilters: {
          performers: { value: ["1:a"], modifier: "INCLUDES" },
        },
        permanentFiltersMetadata: { performers: [{ id: "1:a", name: "Ada" }] },
      },
      { url: "/performer/1" }
    );
    await list.firstQuery();

    expect(
      screen.queryByRole("button", { name: /^Edit filter: Performers/ })
    ).not.toBeInTheDocument();
    const chip = screen.getByText("Performer: Ada");
    expect(chip.closest("button")).toBeNull();
    expect(must(chip.parentElement).style.opacity).toBe("0.7");
  });
});

describe("pins", () => {
  const UNWATCHED: PinnedFilter = {
    id: "default-unwatched",
    key: "watched",
    state: { watched: "false" },
    label: "Unwatched",
  };
  const BLONDE: PinnedFilter = {
    id: "0123456789abcdef0123456789abcdef",
    key: "tagIds",
    state: { tagIds: ["1:a"], tagIdsModifier: "INCLUDES" },
  };
  const toggle = (name: string) => screen.findByRole("button", { name });
  const dialog = () => screen.getByRole("dialog");

  it("pinned filters lead the bar as toggle buttons with `aria-pressed`, labelled by their label or chip text", async () => {
    renderBar(
      { watched: "false", organized: "true" },
      { pins: { scene: { fields: [], filters: [UNWATCHED, BLONDE] } } }
    );

    const unwatched = await toggle("Unwatched");
    const blonde = await toggle("Tags: any of Blonde");
    expect(unwatched).toHaveAttribute("aria-pressed", "true");
    expect(blonde).toHaveAttribute("aria-pressed", "false");
    // The row the pressed toggle stands for draws no chip of its own
    expect(
      screen.queryByRole("button", { name: /^Edit filter: Watched/ })
    ).not.toBeInTheDocument();
    const organized = await edit("Organized: Yes");
    const before = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(before(unwatched, blonde)).toBe(true);
    expect(before(blonde, organized)).toBe(true);
  });

  it("a pinned field is an empty chip `Tags` that opens its editor; once set it shows its value in the same place, with no second chip", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      {
        url: "/scenes?organized=true",
        pins: { scene: { fields: ["tagIds"], filters: [] } },
      }
    );
    await list.firstQuery();
    const chipNames = () =>
      screen
        .getAllByRole("button", { name: /^Edit filter:/ })
        .map((chip) => chip.getAttribute("aria-label"));

    expect(chipNames()).toEqual([
      "Edit filter: Tags",
      "Edit filter: Organized: Yes",
    ]);
    expect(
      screen.queryByRole("button", { name: /^Remove filter: Tags/ })
    ).not.toBeInTheDocument();

    await user.click(await edit("Tags"));
    await user.click(
      await within(dialog()).findByRole("button", { name: /^Blonde/ })
    );
    await waitFor(() => expect(list.params().get("tagIds")).toBe("1:a"));
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(must(chipNames()[0])).toMatch(/^Edit filter: Tags: .*Blonde$/)
    );
    expect(chipNames()).toHaveLength(2);
    expect(chipNames()[1]).toBe("Edit filter: Organized: Yes");
  });

  it("+ Filter's pick of a field a pressed pin covers opens that row's editor, not a second row", async () => {
    const user = userEvent.setup();
    const FAVORITES: PinnedFilter = {
      id: "fedcba9876543210fedcba9876543210",
      key: "favorite",
      state: { favorite: "true" },
      label: "Favorites",
    };
    const list = renderListControls(
      {},
      {
        url: "/scenes?favorite=true",
        pins: { scene: { fields: [], filters: [FAVORITES] } },
      }
    );
    await list.firstQuery();
    expect(await toggle("Favorites")).toHaveAttribute("aria-pressed", "true");

    await user.click(addFilter());
    await user.click(
      await screen.findByRole("option", { name: "Favorite Scenes" })
    );
    const editor = await screen.findByRole("dialog", {
      name: "Favorite Scenes filter",
    });
    const select = within(editor).getByRole<HTMLSelectElement>("combobox", {
      name: "Favorite Scenes",
    });
    expect(select.value).toBe("true");
    await user.selectOptions(select, "false");

    await waitFor(() => expect(list.params().get("favorite")).toBe("false"));
    expect(list.params().has("2.favorite")).toBe(false);
  });

  it("one tap on a pinned filter applies at once with one history entry", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { pins: { scene: defaultPinsOf("scene") } }
    );
    await list.firstQuery();

    const unwatched = await toggle("Unwatched");
    expect(unwatched).toHaveAttribute("aria-pressed", "false");
    await user.click(unwatched);

    await waitFor(() => expect(list.params().get("watched")).toBe("false"));
    expect(list.actions).toEqual(["PUSH"]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Unwatched" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );

    await user.click(screen.getByRole("button", { name: "Unwatched" }));
    await waitFor(() => expect(list.params().has("watched")).toBe(false));
    expect(list.actions).toEqual(["PUSH", "PUSH"]);
  });
});

describe("groups and the Advanced entry", () => {
  const advanced = () => screen.getByRole("button", { name: "Advanced" });
  const view = () => screen.getByRole("dialog", { name: "Advanced filters" });

  it("Apply with nothing changed writes nothing: no history entry, the page stays", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { url: "/scenes?favorite=true&page=3" }
    );
    await list.firstQuery();

    await user.click(advanced());
    await user.click(within(view()).getByRole("button", { name: "Apply" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(list.params().get("page")).toBe("3");
    expect(list.actions).toEqual([]);
  });

  it("Advanced opens the row view over the current state; Apply there commits once", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();

    await user.click(advanced());

    expect(
      within(view())
        .getAllByRole("combobox", { name: "Filter" })
        .map((select) => (select as HTMLSelectElement).value)
    ).toEqual(["favorite"]);
    fireEvent.change(
      within(view()).getByRole("combobox", {
        name: "Add a filter to top level",
      }),
      { target: { value: "watched" } }
    );
    fireEvent.change(must(document.activeElement), {
      target: { value: "false" },
    });
    expect(list.actions).toEqual([]);

    await user.click(within(view()).getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(list.params().get("watched")).toBe("false"));
    expect(list.params().get("favorite")).toBe("true");
    expect(list.actions).toEqual(["PUSH"]);
    expect(
      screen.queryByRole("dialog", { name: "Advanced filters" })
    ).not.toBeInTheDocument();
  });

  it("Advanced is in the bar with no filter set, and Cancel leaves the list as it was", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes" });
    await list.firstQuery();

    await user.click(advanced());
    await user.click(within(view()).getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Advanced filters" })
    ).not.toBeInTheDocument();
    expect(list.actions).toEqual([]);
    expect(advanced()).toHaveFocus();
  });

  it("the badge and Clear all count a group as one filter", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { url: "/scenes?g1=any&g1.tagFavorite=true&g1.performerFavorite=true" }
    );
    await list.firstQuery();

    // A group alone: one chip, and Clear all is there for it
    expect(
      screen.getAllByRole("button", { name: /^Edit filter/ })
    ).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() =>
      expect(
        [...list.params().keys()].filter((key) => key.startsWith("g1"))
      ).toEqual([])
    );
    expect(list.actions).toEqual(["PUSH"]);
  });

  it("the hierarchy view's note counts a group as a filter", async () => {
    renderListControls(
      { artifactType: "tag", filterable: false },
      { url: "/tags?g1=any&g1.favorite=true&g1.playCount_min=1" }
    );

    expect(
      await screen.findByText(/Filters don't apply to the hierarchy view/)
    ).toBeInTheDocument();
  });

  it("a URL with groups and no root rows shows only group chips", async () => {
    const list = renderListControls(
      {},
      {
        url: "/scenes?g1=any&g1.tagFavorite=true&g1.performerFavorite=true&g2.favorite=true",
      }
    );
    await list.firstQuery();

    expect(
      screen
        .getAllByRole("button", { name: /^Edit filter/ })
        .map((chip) => chip.getAttribute("aria-label"))
    ).toEqual([
      "Edit filter group: Any of: Favorite Performers, Favorite Tags",
      "Edit filter group: All of: Favorite Scenes",
    ]);
  });

  it("at 5 groups the Advanced button still opens (the limit is the view's to show)", async () => {
    const user = userEvent.setup();
    const groups = [1, 2, 3, 4, 5]
      .map((number) => `g${number}.favorite=true`)
      .join("&");
    const list = renderListControls({}, { url: `/scenes?${groups}` });
    await list.firstQuery();

    await user.click(advanced());

    expect(view()).toBeInTheDocument();
    expect(
      within(view()).getAllByRole("group", { name: /^Group \d$/ })
    ).toHaveLength(5);
  });

  it("the view lists the page's own filters by name, not by count", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {
        permanentFilters: {
          performers: { value: ["9"], modifier: "INCLUDES" },
        },
        permanentFiltersMetadata: {
          performers: [{ id: "9", name: "Jane Roe" }],
          studios: [{ id: "4", name: "Brazzers" }],
        },
      },
      { url: "/scenes" }
    );
    await list.firstQuery();

    await user.click(advanced());

    expect(
      within(view()).getByText(
        "Fixed by this page: Performer: Jane Roe; Studio: Brazzers"
      )
    ).toBeInTheDocument();
  });
});

describe("on the sheet surface (a phone or a TV)", () => {
  it("a chip, an empty pinned chip and + Filter open the sheet, not a popover; the row scrolls sideways", async () => {
    const user = userEvent.setup();
    const onOpenSheet = vi.fn<(focus: RowKey | "add") => void>();
    renderBar(
      { favorite: "true" },
      {
        onOpenSheet,
        pins: { scene: { fields: ["organized"], filters: [] } },
      }
    );

    await user.click(await edit("Favorite Scenes: Yes"));
    expect(onOpenSheet).toHaveBeenLastCalledWith({
      group: 0,
      occurrence: 1,
      key: "favorite",
    });
    await user.click(await edit("Organized"));
    expect(onOpenSheet).toHaveBeenLastCalledWith({
      group: 0,
      occurrence: 1,
      key: "organized",
    });
    await user.click(addFilter());
    expect(onOpenSheet).toHaveBeenLastCalledWith("add");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    const bar = screen.getByRole("group", { name: "Filters" });
    expect(bar).toHaveClass("flex-nowrap", "overflow-x-auto");
  });
});

describe("in TV mode", () => {
  const UNWATCHED: PinnedFilter = {
    id: "default-unwatched",
    key: "watched",
    state: { watched: "false" },
    label: "Unwatched",
  };

  /** A control's name: its label, else its text */
  const nameOf = (el: Element) =>
    (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

  /**
   * happy-dom has no layout: each child of the controls' card is a row,
   * 50 px under the one before, and its controls sit left to right in
   * document order, 100 px wide
   */
  function layOut(card: Element) {
    [...card.children].forEach((row, index) => {
      [
        ...row.querySelectorAll<HTMLElement>(
          'button, input:not([type="hidden"]), select'
        ),
      ].forEach((el, column) => {
        const r = {
          left: column * 110,
          top: index * 50,
          right: column * 110 + 100,
          bottom: index * 50 + 34,
        };
        el.getBoundingClientRect = () =>
          ({ ...r, x: r.left, y: r.top, width: 100, height: 34 }) as DOMRect;
      });
    });
  }

  it("in TV mode the row's order is pinned filters, pinned fields, chips, groups, Filters, Views; Down from the search box lands on the first pin", async () => {
    tv = true;
    const list = renderListControls(
      {},
      {
        url: "/scenes?organized=true&g1=any&g1.tagFavorite=true&g1.performerFavorite=true",
        pins: { scene: { fields: ["studioId"], filters: [UNWATCHED] } },
      }
    );
    await list.firstQuery();
    await screen.findByRole("button", { name: "Unwatched" });

    const bar = screen.getByRole("group", { name: "Filters" });
    const names = [...bar.querySelectorAll("button")].map(nameOf);
    const at = (pattern: RegExp) => {
      const index = names.findIndex((name) => pattern.test(name));
      expect(index, String(pattern)).toBeGreaterThanOrEqual(0);
      return index;
    };
    const order = [
      at(/^Unwatched$/),
      at(/^Edit filter: Studios$/),
      at(/^Edit filter: Organized: Yes$/),
      at(/^Edit filter group: Any of/),
      at(/^Filters \(2\)$/),
      at(/^Views/),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Row 1 keeps search and sort, not Filters or Views
    const search = screen.getByPlaceholderText("Search...");
    expect(bar.contains(search)).toBe(false);

    // Down from the search box: the bar is the next row, its first pin first
    let card = search.parentElement;
    while (card !== null && !card.contains(bar)) card = card.parentElement;
    layOut(must(card, "the controls' card"));
    act(() => search.focus());
    act(() => {
      moveFocus("down", document.body);
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Unwatched" })
    );
  });
});
