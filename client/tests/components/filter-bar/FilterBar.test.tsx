/**
 * FilterBar: one chip per root row of the list's filters, repeats included,
 * naming its values and its condition ("Tags: all of Blonde, Outdoor"), the
 * names resolved through the entity's `/minimal` endpoint (faked here as
 * the server answers it). A chip's body opens its editor in a popover under
 * it, whose changes apply live: a pick at once, typing 300 ms after the last
 * key, one history entry per open popover. The remove button clears the
 * row. The page's permanent filters show as dimmed labels.
 */
import type { ListKind, RowKey } from "@peek/shared-types";
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
import { renderListControls } from "@tests/helpers/renderListControls";
import { sentFilter } from "@tests/helpers/sentFilter";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FilterBar from "@/components/filter-bar/FilterBar";
import type { ListFilters } from "@/hooks/useListFilters";
import {
  type FilterOption,
  type PanelState,
  filterOptionsOf,
  treeOf,
} from "@/utils/filterFields";

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

vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
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
  }: {
    kind?: ListKind;
    options?: readonly FilterOption[];
    permanentFilters?: Record<string, unknown>;
    permanentFiltersMetadata?: Record<string, unknown>;
  } = {}
) {
  const { filters, removeRow } = staticFilters(kind, state, options);
  const onFocusLeave = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FilterBar
        filters={filters}
        onFocusLeave={onFocusLeave}
        {...(permanentFilters ? { permanentFilters } : {})}
        {...(permanentFiltersMetadata ? { permanentFiltersMetadata } : {})}
      />
    </QueryClientProvider>
  );
  return { removeRow, onFocusLeave };
}

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

  it("removing a chip moves focus to the next chip's remove button, else the previous one's, else out of the bar", async () => {
    const user = userEvent.setup();
    const { onFocusLeave } = renderBar({ favorite: true, organized: true });
    await edit("Favorite Scenes: Yes");
    const [first, second] = removeButtons();

    await user.click(must(first, "the first chip"));
    expect(second).toHaveFocus();

    await user.click(must(second, "the last chip"));
    expect(first).toHaveFocus();
    expect(onFocusLeave).not.toHaveBeenCalled();
  });

  it("the only chip's removal moves focus out of the bar", async () => {
    const user = userEvent.setup();
    const { onFocusLeave } = renderBar({ favorite: true });

    await user.click(
      await screen.findByRole("button", { name: /^Remove filter:/ })
    );

    expect(onFocusLeave).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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

    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });

  it("no filters and no permanent ones draw nothing", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <FilterBar filters={staticFilters("scene", {}).filters} />
      </QueryClientProvider>
    );

    expect(container).toBeEmptyDOMElement();
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
  it("Clear all removes every filter, not the page's permanent ones, and moves focus to the Filters button", async () => {
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

    const filtersButton = screen.getByRole("button", { name: /^Filters/ });
    await user.click(filtersButton);
    await user.click(
      must((await screen.findByText("Clear All")).closest("button"))
    );

    await waitFor(() => expect(removeButtons()).toHaveLength(0));
    expect(screen.getByText("Performer: Ada")).toBeInTheDocument();
    expect(list.lastQuery().scene_filter).toEqual({ performers: PERFORMER });
    expect(filtersButton).toHaveFocus();
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
