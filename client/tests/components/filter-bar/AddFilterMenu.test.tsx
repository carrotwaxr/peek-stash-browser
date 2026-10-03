/**
 * AddFilterMenu: "+ Filter" at the end of the chip bar opens a search box
 * (`role="combobox"`) over a listbox of the list's fields, grouped under
 * their sections. Typing narrows the fields by label; the arrows move focus
 * through the options (roving, so TV focus works inside the open list);
 * picking a field opens its editor under a chip: the field's chip when it
 * is in use, else a pending chip that leaves nothing behind if it closes
 * empty. The list's free fields are the options: a field the view fixes
 * (the timeline's date) is not offered, a field the page fixes is.
 */
import { PANEL_GROUP_LABELS } from "@peek/shared-types";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderListControls } from "@tests/helpers/renderListControls";
import { sentFilter } from "@tests/helpers/sentFilter";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPut } from "@/api";
import type { ListView } from "@/hooks/useListUrlState";
import { filterOptionsOf } from "@/utils/filterFields";

interface Known {
  id: string;
  instanceId: string;
  name: string;
}

/**
 * `/minimal`: with `ids` a composite id matches its instance; with
 * `filter.q` the names containing it; else the page
 */
const minimalOf =
  (known: Known[]) =>
  ({ ids, filter }: { ids?: string[]; filter?: { q?: string } } = {}) =>
    Promise.resolve(
      ids !== undefined
        ? known.filter((entity) =>
            ids.includes(`${entity.id}:${entity.instanceId}`)
          )
        : known.filter((entity) =>
            entity.name.toLowerCase().includes((filter?.q ?? "").toLowerCase())
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

vi.mock("@/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "metric" }),
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
];

beforeEach(() => {
  vi.clearAllMocks();
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
});

const addFilter = () => screen.getByRole("button", { name: "Add filter" });
const searchBox = () => screen.getByRole("combobox", { name: "Find a filter" });
const options = () =>
  within(screen.getByRole("listbox")).getAllByRole("option");
const optionNames = () => options().map((option) => option.textContent);
const option = (name: string) =>
  within(screen.getByRole("listbox")).getByRole("option", { name });

async function openMenu() {
  const user = userEvent.setup();
  await user.click(addFilter());
  return user;
}

describe("the menu", () => {
  it('is a combobox over a listbox: `aria-expanded`, `aria-controls`, options `role="option"` grouped under the section labels (`PANEL_GROUP_LABELS`)', async () => {
    const list = renderListControls();
    await list.firstQuery();
    expect(addFilter()).toHaveAttribute("aria-expanded", "false");

    await openMenu();

    expect(addFilter()).toHaveAttribute("aria-expanded", "true");
    const box = searchBox();
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(box).toHaveAttribute("aria-controls", listbox.id);

    // One group per section, named by its label, in the panel's order
    const sections = filterOptionsOf("scene", "metric").filter(
      (each) => each.type === "section-header"
    );
    const labels: readonly string[] = Object.values(PANEL_GROUP_LABELS);
    expect(within(listbox).getAllByRole("group")).toHaveLength(sections.length);
    for (const section of sections) {
      expect(labels).toContain(section.label);
      expect(
        within(listbox).getByRole("group", { name: section.label })
      ).toBeInTheDocument();
    }
    expect(
      within(
        within(listbox).getByRole("group", { name: "Common Filters" })
      ).getByRole("option", { name: "Tags" })
    ).toHaveAttribute("tabindex", "-1");
    // Every field the panel listed is an option
    expect(options()).toHaveLength(
      filterOptionsOf("scene", "metric").length - sections.length
    );
  });

  it("typing narrows the fields by label, case-insensitive; Enter picks the first", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();

    await user.keyboard("pERFORMER t");

    expect(optionNames()).toEqual(["Performer Tags"]);
    await user.clear(searchBox());
    await user.keyboard("TAGS");
    expect(optionNames()).toEqual(["Tags", "Performer Tags", "Favorite Tags"]);
    // A section with no match is not drawn
    expect(
      within(screen.getByRole("listbox")).queryByRole("group", {
        name: "Date Ranges",
      })
    ).not.toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: "Tags filter" })
    ).toBeInTheDocument();
  });

  it("nothing matching says so", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();

    await user.keyboard("zzz");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(searchBox()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("No filter matches “zzz”")).toBeInTheDocument();
  });

  it("the list never shows a view-locked field (the timeline's Date)", async () => {
    const PERIOD = { start: "2024-01-01", end: "2024-01-31" };
    const list = renderListControls(
      {
        viewModes: [
          { id: "grid", label: "Grid view" },
          { id: "timeline", label: "Timeline view" },
        ],
        viewFilters: ({ viewMode }: ListView) =>
          viewMode === "timeline" ? { date: PERIOD } : {},
      },
      { url: "/scenes?view=timeline" }
    );
    await list.firstQuery();
    await openMenu();

    expect(optionNames()).toContain("Created Date");
    expect(optionNames()).not.toContain("Scene Date");
  });

  it("a tag page's Scenes tab offers Tags, and picking a tag adds a row the request ANDs with the page's tag", async () => {
    const TAG = { value: ["5:a"], modifier: "INCLUDES", depth: 0 };
    const list = renderListControls(
      { context: "scene_tag", permanentFilters: { tags: TAG } },
      { url: "/tag/5" }
    );
    await list.firstQuery();
    const user = await openMenu();

    await user.click(option("Tags"));
    const editor = await screen.findByRole("dialog", { name: "Tags filter" });
    await user.click(
      await within(editor).findByRole("button", { name: /^Outdoor/ })
    );

    await waitFor(() => expect(list.params().get("tagIds")).toBe("2:a"));
    const query = list.lastQuery();
    expect(query.scene_filter).toEqual({ tags: TAG });
    expect(query.where).toEqual({
      match: "all",
      rules: [
        {
          field: "tags",
          criterion: { value: ["2:a"], modifier: "INCLUDES_ALL" },
        },
      ],
    });
  });

  it("ArrowDown from the box moves focus into the list (roving); Escape closes and returns focus to + Filter", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();
    const [first, second] = options();

    await user.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    // Up from the first option goes back to the box
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(searchBox()).toHaveFocus();

    await user.keyboard("{ArrowDown}{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(addFilter()).toHaveFocus();
    expect(addFilter()).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter on an option picks it", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();
    await user.keyboard("favorite scenes{ArrowDown}");
    expect(option("Favorite Scenes")).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: "Favorite Scenes filter" })
    ).toBeInTheDocument();
  });
});

describe("picking a field", () => {
  it("picking an inactive field adds a pending chip and opens its editor; closing it empty leaves no chip and no URL change", async () => {
    const list = renderListControls({}, { url: "/scenes?page=2" });
    await list.firstQuery();
    const user = await openMenu();

    await user.click(option("Favorite Scenes"));

    const editor = screen.getByRole("dialog", {
      name: "Favorite Scenes filter",
    });
    const chip = screen.getByRole("button", {
      name: "Edit filter: Favorite Scenes",
    });
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(must(chip.parentElement?.parentElement)).toContainElement(editor);
    expect(
      within(editor).getByRole("combobox", { name: "Favorite Scenes" })
    ).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Edit filter:/ })
    ).not.toBeInTheDocument();
    expect(list.actions).toEqual([]);
    expect(list.params().toString()).toBe("page=2");
    expect(addFilter()).toHaveFocus();
  });

  it("a value picked in the pending chip's editor applies at once and the chip stays", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();
    await user.click(option("Favorite Scenes"));

    await user.selectOptions(
      within(screen.getByRole("dialog")).getByRole("combobox", {
        name: "Favorite Scenes",
      }),
      "Yes"
    );

    await waitFor(() => expect(list.params().get("favorite")).toBe("true"));
    expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
      favorite: true,
    });
    expect(list.actions).toEqual(["PUSH"]);
    expect(
      screen.getByRole("button", { name: "Edit filter: Favorite Scenes: Yes" })
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("a tag picked in the pending Tags chip's editor stays a chip, which takes focus when the editor closes", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();
    await user.click(option("Tags"));
    const editor = screen.getByRole("dialog", { name: "Tags filter" });

    await user.click(
      await within(editor).findByRole("button", { name: /^Outdoor/ })
    );
    await waitFor(() => expect(list.params().get("tagIds")).toBe("2:a"));
    // The first Escape closes the picker's list, the second the editor
    await user.keyboard("{Escape}");
    expect(
      within(editor).queryByPlaceholderText("Type to search...")
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /^Edit filter: Tags/ })
    ).toHaveFocus();
  });

  it("picking an active field opens that chip's editor", async () => {
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();
    const user = await openMenu();

    await user.click(option("Favorite Scenes"));

    expect(
      screen.getByRole("dialog", { name: "Favorite Scenes filter" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Edit filter:/ })
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Edit filter: Favorite Scenes: Yes" })
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("a field whose row is at the 20-row limit is still offered at the root (the limit counts W's rows; the menu says so only when it is reached)", async () => {
    const rows = (count: number) =>
      [
        "tagIds=1:a",
        ...Array.from(
          { length: count - 1 },
          (_, index) => `${index + 2}.tagIds=1:a`
        ),
      ].join("&");

    const below = renderListControls({}, { url: `/scenes?${rows(19)}` });
    await below.firstQuery();
    await openMenu();
    expect(screen.queryByText(/most a list takes/)).not.toBeInTheDocument();
    expect(option("Favorite Scenes")).not.toHaveAttribute("aria-disabled");
    cleanup();

    const list = renderListControls({}, { url: `/scenes?${rows(20)}` });
    await list.firstQuery();
    const user = await openMenu();

    expect(
      screen.getByText(
        "20 filters is the most a list takes: remove one to add another."
      )
    ).toBeInTheDocument();
    // A field not in use cannot add a row; one in use still opens its chip
    expect(option("Favorite Scenes")).toHaveAttribute("aria-disabled", "true");
    await user.click(option("Favorite Scenes"));
    expect(
      screen.queryByRole("dialog", { name: "Favorite Scenes filter" })
    ).toBeNull();
    expect(option("Tags")).not.toHaveAttribute("aria-disabled");

    await user.click(option("Tags"));

    expect(
      await screen.findByRole("dialog", { name: "Tags filter" })
    ).toBeInTheDocument();
    expect(list.actions).toEqual([]);
  });
});

describe("in the bar", () => {
  it("+ Filter ends the bar, and Clear all shows only while a filter is set", async () => {
    const list = renderListControls({}, { url: "/scenes?favorite=true" });
    await list.firstQuery();

    expect(must(addFilter().closest("[data-tv-search-item]"))).toHaveAttribute(
      "data-tv-search-item",
      "add-filter"
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() => expect(list.params().has("favorite")).toBe(false));
    expect(
      screen.queryByRole("button", { name: "Clear all" })
    ).not.toBeInTheDocument();
    expect(addFilter()).toHaveFocus();
  });
});

describe("values", () => {
  it("typing `out` lists `Tags: Outdoor` under a Values heading after the fields", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();

    await user.keyboard("out");

    const outdoor = await screen.findByRole("option", {
      name: "Tags: Outdoor",
    });
    const values = within(screen.getByRole("listbox")).getByRole("group", {
      name: "Values",
    });
    expect(values).toContainElement(outdoor);
    // After the fields: the Values group is the listbox's last
    const groups = within(screen.getByRole("listbox")).getAllByRole("group");
    expect(groups.at(-1)).toBe(values);
    expect(minimal.findTagsMinimal).toHaveBeenCalledWith(
      { filter: { q: "out", per_page: 5 } },
      expect.any(AbortSignal)
    );
    // Not a field: Blonde does not match
    expect(
      within(values).queryByRole("option", { name: "Tags: Blonde" })
    ).not.toBeInTheDocument();
  });

  it("a name matching no field and no value says so; a value alone keeps the list", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();

    await user.keyboard("outdoor");

    // No field is named Outdoor: the one value is the list
    expect(
      await screen.findByRole("option", { name: "Tags: Outdoor" })
    ).toBeInTheDocument();
    expect(optionNames()).toEqual(["Tags: Outdoor"]);

    await user.clear(searchBox());
    await user.keyboard("zzz");
    await waitFor(() => expect(minimal.findTagsMinimal).toHaveBeenCalled());
    expect(screen.getByText("No filter matches “zzz”")).toBeInTheDocument();
  });

  it("picking it adds Outdoor to Tags with the row's default modifier and leaves other tags in place", async () => {
    const list = renderListControls({}, { url: "/scenes?tagIds=1:a" });
    await list.firstQuery();
    const user = await openMenu();
    await user.keyboard("out");

    await user.click(
      await screen.findByRole("option", { name: "Tags: Outdoor" })
    );

    await waitFor(() => expect(list.params().get("tagIds")).toBe("1:a,2:a"));
    // No condition was written: the row's default stays the default
    expect(list.params().has("tagIdsModifier")).toBe(false);
    expect(list.actions).toEqual(["PUSH"]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /^Edit filter: Tags/ })
    ).toBeInTheDocument();
    expect(addFilter()).toHaveFocus();
  });

  it("a value picked with no Tags row yet starts the row, and the request carries it", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();
    await user.keyboard("out{ArrowDown}");
    expect(
      await screen.findByRole("option", { name: "Tags: Outdoor" })
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    await waitFor(() => expect(list.params().get("tagIds")).toBe("2:a"));
    expect(
      must((list.lastQuery().where as { rules: { field: string }[] }).rules[0])
        .field
    ).toBe("tags");
  });

  it("picking a value of an active excluded row includes it", async () => {
    const list = renderListControls(
      {},
      { url: "/scenes?tagIdsExclude=2:a,1:a" }
    );
    await list.firstQuery();
    const user = await openMenu();
    await user.keyboard("out");

    await user.click(
      await screen.findByRole("option", { name: "Tags: Outdoor" })
    );

    await waitFor(() => expect(list.params().get("tagIds")).toBe("2:a"));
    expect(list.params().get("tagIdsExclude")).toBe("1:a");
  });

  it("at the 20-row limit a value of a field not in use is disabled, one of a field in use still adds", async () => {
    const rows = Array.from(
      { length: 20 },
      (_, index) => `${index === 0 ? "" : `${index + 1}.`}performerIds=1:a`
    ).join("&");
    const list = renderListControls({}, { url: `/scenes?${rows}` });
    await list.firstQuery();
    const user = await openMenu();
    await user.keyboard("out");

    // Tags is not in use: its value cannot add a row
    expect(
      await screen.findByRole("option", { name: "Tags: Outdoor" })
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("pins", () => {
  it("pinned fields come first under Pinned", async () => {
    const list = renderListControls(
      {},
      { pins: { scene: { fields: ["rating", "tagIds"], filters: [] } } }
    );
    await list.firstQuery();

    await openMenu();

    const listbox = screen.getByRole("listbox");
    const [first] = within(listbox).getAllByRole("group");
    expect(must(first, "the first group")).toHaveAccessibleName("Pinned");
    expect(
      within(must(first))
        .getAllByRole("option")
        .map((each) => each.textContent)
    ).toEqual(["Rating (0-100)", "Tags"]);
    // Listed once: not again under their sections
    expect(optionNames().filter((name) => name === "Tags")).toHaveLength(1);
  });

  it("the pin icon in an option pins on click without picking the field, and is `aria-hidden`", async () => {
    const list = renderListControls();
    await list.firstQuery();
    const user = await openMenu();

    const icon = must(
      option("Organized").querySelector("[data-pin-toggle]"),
      "the pin icon"
    );
    expect(icon).toHaveAttribute("aria-hidden", "true");
    await user.click(icon);

    expect(apiPut).toHaveBeenLastCalledWith("/user/filter-pins/scene", {
      fields: ["organized"],
      filters: [],
    });
    // The menu stays open, no editor opened, and the field now leads it
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Organized filter" })
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByRole("group", { name: "Pinned" })).getByRole(
          "option",
          { name: "Organized" }
        )
      ).toBeInTheDocument()
    );
    expect(list.params().has("organized")).toBe(false);
  });
});
