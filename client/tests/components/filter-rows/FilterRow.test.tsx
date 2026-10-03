/**
 * One row of the row editor, with the real SearchableSelect: a carousel
 * rule lists what its owner sees, so the picker asks the `/minimal`
 * endpoints with no scope, for its options and for the names of the row's
 * ids. Only the Content Restrictions editor sends `scope: "allEnabled"`
 * (tests/components/settings/ContentRestrictionsModalPickers.test.tsx).
 * The cases are the carousel builder's former RuleEditor's, by name.
 */
import type {
  GetSharedPlaylistsResponse,
  GetUserPlaylistsResponse,
  MinimalEntity,
  MinimalRequest,
} from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import FilterRow from "@/components/filter-rows/FilterRow";
import {
  CAROUSEL_FILTER_DEFINITIONS,
  buildSceneFilter,
  carouselRulesToFilterState,
} from "@/utils/filterConfig";
import type { FilterOption, PanelState } from "@/utils/filterFields";

type FindMinimalMock = (
  params: MinimalRequest,
  signal?: AbortSignal
) => Promise<MinimalEntity[]>;

const { mockFindTagsMinimal, mockGetPlaylists, mockGetSharedPlaylists } =
  vi.hoisted(() => ({
    mockFindTagsMinimal: vi.fn<FindMinimalMock>(),
    mockGetPlaylists: vi.fn<() => Promise<GetUserPlaylistsResponse>>(),
    mockGetSharedPlaylists: vi.fn<() => Promise<GetSharedPlaylistsResponse>>(),
  }));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    libraryApi: { ...actual.libraryApi, findTagsMinimal: mockFindTagsMinimal },
    getPlaylists: mockGetPlaylists,
    getSharedPlaylists: mockGetSharedPlaylists,
  };
});

// Test-local Playlists and Path rows
const PLAYLIST_RULE: FilterOption = {
  key: "testPlaylistIds",
  type: "searchable-select",
  label: "Test Playlists",
  entityType: "playlists",
  multi: true,
  defaultValue: [],
  modifierKey: "testPlaylistIdsModifier",
  modifierOptions: [
    { value: "INCLUDES", label: "Has ANY of these" },
    { value: "INCLUDES_ALL", label: "Has ALL of these" },
    { value: "EXCLUDES", label: "Has NONE of these" },
  ],
  defaultModifier: "INCLUDES",
};
const PATH_RULE: FilterOption = {
  key: "testPath",
  type: "text",
  label: "Test Path",
  defaultValue: "",
  placeholder: "Search path...",
  modifierKey: "testPathModifier",
  modifierOptions: [
    { value: "INCLUDES", label: "Contains" },
    { value: "EXCLUDES", label: "Excludes" },
    { value: "EQUALS", label: "Equals" },
    { value: "NOT_EQUALS", label: "Not equals" },
    { value: "STARTS_WITH", label: "Starts with" },
  ],
  defaultModifier: "INCLUDES",
};
// A test-local toggle: the scene rows have none
const TOGGLE_RULE: FilterOption = {
  key: "testToggle",
  type: "checkbox",
  label: "Test Favorites",
  defaultValue: false,
  placeholder: "Favorites Only",
};
// A test-local ref row offering presence
const PRESENCE_RULE: FilterOption = {
  key: "testTagIds",
  type: "searchable-select",
  label: "Test Tags",
  entityType: "tags",
  multi: true,
  defaultValue: [],
  modifierKey: "testTagIdsModifier",
  modifierOptions: [
    { value: "INCLUDES", label: "Has ANY of these" },
    { value: "IS_NULL", label: "Has none" },
    { value: "NOT_NULL", label: "Has any" },
  ],
  defaultModifier: "INCLUDES",
};

const OPTIONS: readonly FilterOption[] = [
  ...CAROUSEL_FILTER_DEFINITIONS,
  PRESENCE_RULE,
  PLAYLIST_RULE,
  PATH_RULE,
  TOGGLE_RULE,
];
const SECTIONS = [
  {
    label: "Rules",
    fields: OPTIONS.map((option) => ({
      key: option.key,
      label: option.label ?? option.key,
    })),
  },
];

/** A carousel's row of field `key` holding `state` */
const rowElement = (
  key: string,
  state: PanelState,
  onChange: (next: PanelState) => void = vi.fn()
) => (
  <FilterRow
    sections={SECTIONS}
    row={{
      id: "row-1",
      key,
      option: must(
        OPTIONS.find((option) => option.key === key),
        key
      ),
      state,
    }}
    containerLabel="top level"
    pickFromAll
    onFieldChange={vi.fn()}
    onChange={onChange}
    onRemove={vi.fn()}
  />
);

describe("FilterRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("the carousel rule picker sends no scope, for its options or for its ids' names", async () => {
    mockFindTagsMinimal.mockImplementation((params) =>
      Promise.resolve(
        params.ids
          ? [{ id: "5", instanceId: "server-a", name: "Rule Tag" }]
          : []
      )
    );

    render(
      rowElement("tagIds", {
        tagIds: ["5:server-a"],
        tagIdsModifier: "INCLUDES",
      })
    );

    expect(await screen.findByText("Rule Tag")).toBeInTheDocument();
    expect(mockFindTagsMinimal).toHaveBeenCalledTimes(1);
    expect(must(mockFindTagsMinimal.mock.calls[0])[0]).toEqual({
      ids: ["5:server-a"],
      filter: { per_page: 100 },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Tags/ }));
    await waitFor(() => {
      expect(mockFindTagsMinimal).toHaveBeenCalledTimes(2);
    });
    expect(must(mockFindTagsMinimal.mock.calls[1])[0]).toEqual({
      filter: { per_page: 50 },
    });
  });

  it("the carousel picker is a button named by its rule's label", async () => {
    mockFindTagsMinimal.mockResolvedValue([]);

    render(rowElement("tagIds", {}));

    const picker = screen.getByRole("button", { name: /^Tags/ });
    expect(picker).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(picker);
    expect(picker).toHaveAttribute("aria-expanded", "true");
    expect(
      await screen.findByPlaceholderText("Type to search...")
    ).toBeInTheDocument();
  });

  it("a decimal bound is kept", () => {
    const onChange = vi.fn();

    render(rowElement("bitrate", { bitrate: {} }, onChange));

    fireEvent.change(screen.getByPlaceholderText("Min"), {
      target: { value: "2.5" },
    });
    expect(must(onChange.mock.calls[0])[0]).toEqual({
      bitrate: { min: 2.5 },
    });
  });

  it("a Last Played date rule round-trips rules, state, rules", () => {
    const stored = {
      last_played_at: {
        modifier: "BETWEEN",
        value: "2024-01-01",
        value2: "2024-06-30",
      },
    };
    const { state } = carouselRulesToFilterState(stored);
    const onChange = vi.fn();

    render(
      rowElement("lastPlayedAt", { lastPlayedAt: state.lastPlayedAt }, onChange)
    );

    // The editor shows the stored dates and edits the same shape
    expect(screen.getByDisplayValue("2024-01-01")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("2024-06-30"), {
      target: { value: "2024-12-31" },
    });
    const edited: unknown = must(onChange.mock.calls[0])[0];
    expect(edited).toEqual({
      lastPlayedAt: { start: "2024-01-01", end: "2024-12-31" },
    });

    expect(buildSceneFilter(state)).toEqual(stored);
    expect(buildSceneFilter({ lastPlayedAt: { end: "2024-06-30" } })).toEqual({
      last_played_at: { modifier: "BETWEEN", value2: "2024-06-30" },
    });
    expect(
      buildSceneFilter(
        carouselRulesToFilterState({
          last_played_at: { modifier: "BETWEEN", value2: "2024-06-30" },
        }).state
      )
    ).toEqual({
      last_played_at: { modifier: "BETWEEN", value2: "2024-06-30" },
    });
  });
  it("a ref rule offering presence shows Has none and Has any and hides its picker", () => {
    mockFindTagsMinimal.mockResolvedValue([]);
    const state = {
      testTagIds: ["5:server-a"],
      testTagIdsModifier: "IS_NULL",
    };
    const onChange = vi.fn();
    const { rerender } = render(rowElement("testTagIds", state, onChange));

    const condition = screen.getByRole("combobox", { name: "Condition" });
    expect(condition).toHaveDisplayValue("Has none");
    expect(
      [...condition.querySelectorAll("option")].map((each) => each.text)
    ).toEqual(["Has ANY of these", "Has none", "Has any"]);
    expect(screen.queryByRole("button", { name: /^Test Tags/ })).toBeNull();

    fireEvent.change(condition, { target: { value: "NOT_NULL" } });
    expect(must(onChange.mock.calls[0])[0]).toEqual({
      ...state,
      testTagIdsModifier: "NOT_NULL",
    });

    rerender(
      rowElement(
        "testTagIds",
        { ...state, testTagIdsModifier: "INCLUDES" },
        onChange
      )
    );
    expect(
      screen.getByRole("button", { name: /^Test Tags/ })
    ).toBeInTheDocument();
  });

  it("a Tags rule's picks each include or exclude", async () => {
    mockFindTagsMinimal.mockImplementation((params) =>
      Promise.resolve(
        params.ids
          ? [
              { id: "5", instanceId: "server-a", name: "Rule Tag" },
              { id: "6", instanceId: "server-a", name: "Other Tag" },
            ]
          : []
      )
    );
    const onChange = vi.fn();

    render(
      rowElement(
        "tagIds",
        {
          tagIds: ["5:server-a"],
          tagIdsExclude: ["6:server-a"],
          tagIdsModifier: "INCLUDES",
        },
        onChange
      )
    );

    const include = await screen.findByRole("button", {
      name: "Exclude Rule Tag",
    });
    expect(include).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Exclude Other Tag" })
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(include);
    expect(must(onChange.mock.calls[0])[0]).toEqual({
      tagIds: [],
      tagIdsExclude: ["6:server-a", "5:server-a"],
      tagIdsModifier: "INCLUDES",
    });
  });

  it("a Playlists rule lists own and shared playlists and saves the playlist id", async () => {
    mockGetPlaylists.mockResolvedValue(
      untrusted({ playlists: [{ id: 12, name: "Road trip" }] })
    );
    mockGetSharedPlaylists.mockResolvedValue(
      untrusted({
        playlists: [{ id: 40, name: "Weekend", owner: { username: "alice" } }],
      })
    );
    const onChange = vi.fn();
    render(
      rowElement(
        "testPlaylistIds",
        { testPlaylistIds: [], testPlaylistIdsModifier: "INCLUDES" },
        onChange
      )
    );

    fireEvent.click(screen.getByRole("button", { name: /^Test Playlists/ }));
    const options = await screen.findAllByRole("button", { pressed: false });
    expect(options.map((option) => option.textContent)).toEqual([
      "Road trip",
      "Weekend by alice",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Weekend by alice" }));

    expect(must(onChange.mock.calls[0])[0]).toEqual({
      testPlaylistIds: ["40"],
      testPlaylistIdsModifier: "INCLUDES",
    });
  });

  it("a Path Starts with rule saves STARTS_WITH", () => {
    const onChange = vi.fn();
    const state = { testPath: "/media/new", testPathModifier: "INCLUDES" };
    const { rerender } = render(rowElement("testPath", state, onChange));

    const condition = screen.getByRole("combobox", { name: "Condition" });
    expect(
      [...condition.querySelectorAll("option")].map((each) => each.text)
    ).toEqual(["Contains", "Excludes", "Equals", "Not equals", "Starts with"]);
    fireEvent.change(condition, { target: { value: "STARTS_WITH" } });
    expect(must(onChange.mock.calls[0])[0]).toEqual({
      testPath: "/media/new",
      testPathModifier: "STARTS_WITH",
    });

    rerender(
      rowElement(
        "testPath",
        { ...state, testPathModifier: "STARTS_WITH" },
        onChange
      )
    );
    expect(screen.getByDisplayValue("/media/new")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Condition" })).toHaveValue(
      "STARTS_WITH"
    );
  });

  it("a toggle rule reads its label", () => {
    const onChange = vi.fn();
    render(rowElement("testToggle", { testToggle: true }, onChange));

    expect(screen.getByText("Favorites Only")).toBeInTheDocument();
    expect(screen.queryByText("Enabled")).toBeNull();
    const toggle = screen.getByRole("checkbox");
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(must(onChange.mock.calls[0])[0]).toEqual({ testToggle: false });
  });

  it("a text rule offering Has none hides its value", () => {
    render(
      rowElement("testPath", {
        testPath: "/media",
        testPathModifier: "IS_NULL",
      })
    );

    expect(screen.queryByDisplayValue("/media")).toBeNull();
  });
});

describe("every rule control has a name", () => {
  it.each([
    { key: "bitrate", state: { bitrate: {} } },
    { key: "lastPlayedAt", state: { lastPlayedAt: {} } },
    { key: "testPath", state: { testPathModifier: "INCLUDES" } },
    { key: "resolution", state: {} },
    { key: "favorite", state: {} },
    { key: "testToggle", state: { testToggle: true } },
  ])("$key", ({ key, state }) => {
    const { container } = render(rowElement(key, state));

    expect(screen.getByRole("combobox", { name: "Filter" })).toHaveValue(key);
    const controls = [...container.querySelectorAll("input, select")];
    expect(controls.length).toBeGreaterThan(1);
    for (const control of controls) {
      expect(control).toHaveAccessibleName();
    }
  });
});
