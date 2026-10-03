/**
 * RuleEditor's entity picker, with the real SearchableSelect: a carousel
 * rule lists what its owner sees, so the picker asks the `/minimal`
 * endpoints with no scope, for its options and for the names of the rule's
 * ids. Only the Content Restrictions editor sends `scope: "allEnabled"`
 * (tests/components/settings/ContentRestrictionsModalPickers.test.tsx).
 */
import type { MinimalEntity, MinimalRequest } from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "../../../src/api";
import RuleEditor from "../../../src/components/carousel-builder/RuleEditor";
import type * as filterConfig from "../../../src/utils/filterConfig";
import {
  buildSceneFilter,
  carouselRulesToFilterState,
} from "../../../src/utils/filterConfig";

type FindMinimalMock = (
  params: MinimalRequest,
  signal?: AbortSignal
) => Promise<MinimalEntity[]>;

const { mockFindTagsMinimal, PRESENCE_RULE } = vi.hoisted(() => ({
  mockFindTagsMinimal: vi.fn<FindMinimalMock>(),
  // A test-local ref rule offering presence; the scene rows opt in at F18
  PRESENCE_RULE: {
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
  },
}));

vi.mock("../../../src/utils/filterConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof filterConfig>();
  return {
    ...actual,
    CAROUSEL_FILTER_DEFINITIONS: [
      ...actual.CAROUSEL_FILTER_DEFINITIONS,
      PRESENCE_RULE,
    ],
  };
});

vi.mock("../../../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    libraryApi: { ...actual.libraryApi, findTagsMinimal: mockFindTagsMinimal },
  };
});

describe("RuleEditor", () => {
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
      <RuleEditor
        rule={{
          id: "rule-1",
          filterKey: "tagIds",
          value: ["5:server-a"],
          modifier: "INCLUDES",
        }}
        usedFilterKeys={new Set(["tagIds"])}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
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

    render(
      <RuleEditor
        rule={{ id: "rule-1", filterKey: "tagIds", value: [] }}
        usedFilterKeys={new Set(["tagIds"])}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );

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

    render(
      <RuleEditor
        rule={{ id: "rule-1", filterKey: "bitrate", value: {} }}
        usedFilterKeys={new Set(["bitrate"])}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Min"), {
      target: { value: "2.5" },
    });
    expect(must(onChange.mock.calls[0])[0]).toEqual({ value: { min: 2.5 } });
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
      <RuleEditor
        rule={{
          id: "rule-1",
          filterKey: "lastPlayedAt",
          value: state.lastPlayedAt,
        }}
        usedFilterKeys={new Set(["lastPlayedAt"])}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );

    // The editor shows the stored dates and edits the same shape
    expect(screen.getByDisplayValue("2024-01-01")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("2024-06-30"), {
      target: { value: "2024-12-31" },
    });
    const edited: unknown = must(onChange.mock.calls[0])[0];
    expect(edited).toEqual({
      value: { start: "2024-01-01", end: "2024-12-31" },
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
    const rule = {
      id: "rule-1",
      filterKey: "testTagIds",
      value: ["5:server-a"],
      modifier: "IS_NULL",
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <RuleEditor
        rule={rule}
        usedFilterKeys={new Set(["testTagIds"])}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    );

    const condition = screen.getByRole("combobox", { name: "Condition" });
    expect(condition).toHaveDisplayValue("Has none");
    expect(
      [...condition.querySelectorAll("option")].map((each) => each.text)
    ).toEqual(["Has ANY of these", "Has none", "Has any"]);
    expect(screen.queryByRole("button", { name: /^Test Tags/ })).toBeNull();

    fireEvent.change(condition, { target: { value: "NOT_NULL" } });
    expect(must(onChange.mock.calls[0])[0]).toEqual({ modifier: "NOT_NULL" });

    rerender(
      <RuleEditor
        rule={{ ...rule, modifier: "INCLUDES" }}
        usedFilterKeys={new Set(["testTagIds"])}
        onChange={onChange}
        onRemove={vi.fn()}
      />
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
      <RuleEditor
        rule={{
          id: "rule-1",
          filterKey: "tagIds",
          value: ["5:server-a"],
          excludes: ["6:server-a"],
          modifier: "INCLUDES",
        }}
        usedFilterKeys={new Set(["tagIds"])}
        onChange={onChange}
        onRemove={vi.fn()}
      />
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
      value: [],
      excludes: ["6:server-a", "5:server-a"],
    });
  });
});
