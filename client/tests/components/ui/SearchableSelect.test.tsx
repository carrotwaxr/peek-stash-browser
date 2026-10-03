/**
 * SearchableSelect: the entity picker behind filter dropdowns, carousel rules
 * and content restrictions.
 *
 * Its options come from the `/minimal` endpoints: nothing loads until the
 * dropdown opens, each search aborts the one before, and a response for a
 * search that is no longer current is dropped, and no list is kept in the
 * browser. The names of the selected values ("id:instanceId", or a bare id)
 * are resolved with one minimal request carrying their ids, at most 100 per
 * request.
 */
import { useState } from "react";
import type {
  GetSharedPlaylistsResponse,
  GetUserPlaylistsResponse,
  MinimalEntity,
  MinimalRequest,
} from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { untrusted } from "@tests/helpers/untrusted";
import { actAsync, flushPromises, must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Import after mocks are set up
import {
  FilterControl,
  type FilterControlProps,
} from "../../../src/components/ui/FilterControls";
import Modal from "../../../src/components/ui/Modal";
import SearchableSelect from "../../../src/components/ui/SearchableSelect";

// --- Hoisted mocks (available before vi.mock factory runs) ---

type FindMinimalMock = (
  params: MinimalRequest,
  signal?: AbortSignal
) => Promise<MinimalEntity[]>;
type FindMock = (params: unknown) => Promise<unknown>;

const {
  mockFindTags,
  mockFindPerformers,
  mockFindTagsMinimal,
  mockFindPerformersMinimal,
  mockFindStudiosMinimal,
  mockFindGroupsMinimal,
  mockFindGalleriesMinimal,
  mockFindScenesMinimal,
  mockGetPlaylists,
  mockGetSharedPlaylists,
} = vi.hoisted(() => ({
  mockFindTags: vi.fn<FindMock>(),
  mockFindPerformers: vi.fn<FindMock>(),
  mockFindTagsMinimal: vi.fn<FindMinimalMock>(),
  mockFindPerformersMinimal: vi.fn<FindMinimalMock>(),
  mockFindStudiosMinimal: vi.fn<FindMinimalMock>(),
  mockFindGroupsMinimal: vi.fn<FindMinimalMock>(),
  mockFindGalleriesMinimal: vi.fn<FindMinimalMock>(),
  mockFindScenesMinimal: vi.fn<FindMinimalMock>(),
  mockGetPlaylists: vi.fn<() => Promise<GetUserPlaylistsResponse>>(),
  mockGetSharedPlaylists: vi.fn<() => Promise<GetSharedPlaylistsResponse>>(),
}));

const MINIMAL_MOCKS = [
  mockFindTagsMinimal,
  mockFindPerformersMinimal,
  mockFindStudiosMinimal,
  mockFindGroupsMinimal,
  mockFindGalleriesMinimal,
  mockFindScenesMinimal,
];

// Mock useDebounce to return value immediately (no delay)
vi.mock("../../../src/hooks/useDebounce", () => ({
  useDebouncedValue: (value: unknown) => value,
}));

vi.mock("../../../src/api", () => ({
  libraryApi: {
    findTags: mockFindTags,
    findTagsMinimal: mockFindTagsMinimal,
    findPerformers: mockFindPerformers,
    findPerformersMinimal: mockFindPerformersMinimal,
    findStudiosMinimal: mockFindStudiosMinimal,
    findGroupsMinimal: mockFindGroupsMinimal,
    findGalleriesMinimal: mockFindGalleriesMinimal,
    findScenesMinimal: mockFindScenesMinimal,
  },
  getPlaylists: mockGetPlaylists,
  getSharedPlaylists: mockGetSharedPlaylists,
}));

// --- Helpers ---

/** A minimal request the component made, answered when the test says so */
interface PendingCall {
  params: MinimalRequest;
  signal: AbortSignal | undefined;
  resolve: (rows: MinimalEntity[]) => void;
}

/** Makes `mock` hold every request until the test resolves it */
function holdCalls(mock: typeof mockFindPerformersMinimal): PendingCall[] {
  const calls: PendingCall[] = [];
  mock.mockImplementation(
    (params, signal) =>
      new Promise<MinimalEntity[]>((resolve) => {
        calls.push({ params, signal, resolve });
      })
  );
  return calls;
}

const row = (id: string, instanceId: string, name: string): MinimalEntity => ({
  id,
  instanceId,
  name,
});

/** The trigger that opens the dropdown: the one button that says whether it is expanded */
const trigger = () =>
  must(
    screen
      .getAllByRole("button")
      .find((button) => button.hasAttribute("aria-expanded")),
    "the trigger"
  );

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of MINIMAL_MOCKS) mock.mockResolvedValue([]);
});

// --- Tests ---

describe("SearchableSelect selected names", () => {
  it("resolves selected names with one minimal request carrying ids", async () => {
    mockFindTagsMinimal.mockResolvedValue([
      row("82", "inst-1", "Tag A"),
      row("15", "inst-2", "Tag B"),
    ]);

    render(
      <SearchableSelect
        entityType="tags"
        value={["82:inst-1", "15:inst-2", "99"]}
        onChange={vi.fn()}
        multi
      />
    );

    expect(await screen.findByText("Tag A")).toBeTruthy();
    expect(screen.getByText("Tag B")).toBeTruthy();
    expect(mockFindTagsMinimal).toHaveBeenCalledTimes(1);
    const [params, signal] = must(mockFindTagsMinimal.mock.calls[0]);
    expect(params).toEqual({
      ids: ["82:inst-1", "15:inst-2", "99"],
      filter: { per_page: 100 },
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    // Never the full list endpoints
    expect(mockFindTags).not.toHaveBeenCalled();
  });

  it("sends each selected id once", async () => {
    mockFindTagsMinimal.mockResolvedValue([row("82", "inst-1", "Tag A")]);

    render(
      <SearchableSelect
        entityType="tags"
        value={["82:inst-1", "82:inst-1"]}
        onChange={vi.fn()}
        multi
      />
    );

    expect(await screen.findByText("Tag A")).toBeTruthy();
    expect(must(mockFindTagsMinimal.mock.calls[0])[0].ids).toEqual([
      "82:inst-1",
    ]);
  });

  it("looks more than 100 selected values up 100 at a time", async () => {
    const value = Array.from({ length: 150 }, (_, i) => `${i + 1}:inst-1`);
    mockFindPerformersMinimal.mockImplementation(({ ids = [] }) =>
      Promise.resolve(
        ids.map((ref) => {
          const id = ref.split(":")[0] ?? ref;
          return row(id, "inst-1", `Performer ${id}`);
        })
      )
    );

    render(
      <SearchableSelect
        entityType="performers"
        value={value}
        onChange={vi.fn()}
        multi
      />
    );

    expect(await screen.findByText("Performer 150")).toBeTruthy();
    const sent = mockFindPerformersMinimal.mock.calls.map(
      ([params]) => params.ids
    );
    expect(sent).toEqual([value.slice(0, 100), value.slice(100)]);
  });

  it("a failed lookup is logged and leaves the placeholder", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindStudiosMinimal.mockRejectedValue(new Error("Server unreachable"));

    render(
      <SearchableSelect
        entityType="studios"
        value="3:inst-y"
        onChange={vi.fn()}
        placeholder="Pick a studio"
      />
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });
    expect(await screen.findByText("Pick a studio")).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("requests nothing for an unsupported entity type", async () => {
    render(
      <SearchableSelect
        entityType={untrusted("unsupported")}
        value={["1:inst-1"]}
        onChange={vi.fn()}
        multi
      />
    );

    await actAsync(() => {});
    for (const mock of MINIMAL_MOCKS) expect(mock).not.toHaveBeenCalled();
    expect(mockFindTags).not.toHaveBeenCalled();
    expect(mockFindPerformers).not.toHaveBeenCalled();
  });
});

describe("SearchableSelect options", () => {
  it("requests nothing until opened", async () => {
    render(
      <SearchableSelect
        entityType="performers"
        value={[]}
        onChange={vi.fn()}
        multi
        countFilterContext="scenes"
      />
    );

    await actAsync(() => {});
    await flushPromises();
    expect(mockFindPerformersMinimal).not.toHaveBeenCalled();

    fireEvent.click(trigger());

    await waitFor(() => {
      expect(mockFindPerformersMinimal).toHaveBeenCalledTimes(1);
    });
    const [params, signal] = must(mockFindPerformersMinimal.mock.calls[0]);
    expect(params).toEqual({
      filter: { per_page: 50 },
      count_filter: { min_scene_count: 1 },
    });
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("lists what the server answers on each opening, never a list kept in the browser", async () => {
    // A list an earlier version kept in localStorage, maybe for another user
    localStorage.setItem(
      "peek-performers-cache",
      JSON.stringify({
        timestamp: Date.now(),
        data: [{ id: "9:inst-1", name: "Kept Name" }],
      })
    );
    mockFindPerformersMinimal.mockResolvedValue([
      row("1", "inst-1", "Fresh Name"),
    ]);
    try {
      render(
        <SearchableSelect
          entityType="performers"
          value={[]}
          onChange={vi.fn()}
          multi
        />
      );

      fireEvent.click(trigger());
      expect(await screen.findByText("Fresh Name")).toBeTruthy();
      expect(screen.queryByText("Kept Name")).toBeNull();

      // Closed and opened again: asked again
      fireEvent.click(trigger());
      fireEvent.click(trigger());
      await waitFor(() => {
        expect(mockFindPerformersMinimal).toHaveBeenCalledTimes(2);
      });
    } finally {
      localStorage.removeItem("peek-performers-cache");
    }
  });

  it("a slower earlier response never replaces a later one", async () => {
    const calls = holdCalls(mockFindPerformersMinimal);
    render(
      <SearchableSelect
        entityType="performers"
        value={[]}
        onChange={vi.fn()}
        multi
      />
    );

    fireEvent.click(trigger());
    const input = await screen.findByPlaceholderText("Type to search...");
    fireEvent.change(input, { target: { value: "ann" } });
    await waitFor(() => {
      expect(calls.some((c) => c.params.filter?.q === "ann")).toBe(true);
    });

    // The search for "ann" answers first
    const later = must(
      calls.find((c) => c.params.filter?.q === "ann"),
      "the request for ann"
    );
    await actAsync(() => later.resolve([row("2", "inst-1", "Anna")]));
    expect(await screen.findByText("Anna")).toBeTruthy();

    // The request made on opening answers last
    const earlier = calls.filter((c) => c.params.filter?.q === undefined);
    expect(earlier.length).toBeGreaterThan(0);
    for (const call of earlier) {
      await actAsync(() => call.resolve([row("1", "inst-1", "Zed")]));
    }
    await flushPromises();

    expect(screen.queryByText("Zed")).toBeNull();
    expect(screen.getByText("Anna")).toBeTruthy();
  });

  it("aborts the previous request when the search changes", async () => {
    const calls = holdCalls(mockFindPerformersMinimal);
    render(
      <SearchableSelect
        entityType="performers"
        value={[]}
        onChange={vi.fn()}
        multi
      />
    );

    fireEvent.click(trigger());
    const input = await screen.findByPlaceholderText("Type to search...");
    await waitFor(() => {
      expect(calls.length).toBeGreaterThan(0);
    });
    const first = must(calls[0], "the request made on opening");
    const firstSignal = must(first.signal, "the first request's signal");
    expect(firstSignal.aborted).toBe(false);

    fireEvent.change(input, { target: { value: "ann" } });
    await waitFor(() => {
      expect(calls.some((c) => c.params.filter?.q === "ann")).toBe(true);
    });

    expect(firstSignal.aborted).toBe(true);
    const latest = must(calls.at(-1), "the latest request");
    expect(must(latest.signal, "the latest signal").aborted).toBe(false);
  });

  it("does not throw and returns empty results for unsupported entity type", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SearchableSelect
        entityType={untrusted("unsupported")}
        value={[]}
        onChange={vi.fn()}
        multi
      />
    );

    // Open the dropdown to trigger loadOptions
    fireEvent.click(trigger());

    // Wait for component to settle - loadOptions should bail out gracefully
    await waitFor(() => {
      // Should show "No unsupported found" (the empty state message)
      expect(document.body.textContent).toContain("No unsupported found");
    });

    // None of the minimal API methods should have been called
    for (const mock of MINIMAL_MOCKS) expect(mock).not.toHaveBeenCalled();

    // Should not have logged any errors (guard returns early, not throws)
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe("SearchableSelect stored bare values", () => {
  // A bare id stands for that id on every server, so removing the option it
  // resolved to removes the bare value for the others too.
  it("a stored bare 466 shown as its option 466:inst is removed by the chip's × (and stands for that id on every server)", async () => {
    mockFindTagsMinimal.mockResolvedValue([row("466", "inst", "Tag 466")]);
    const onChange = vi.fn();

    render(
      <SearchableSelect
        entityType="tags"
        value={["466", "7:inst"]}
        onChange={onChange}
        multi
      />
    );

    fireEvent.click(await screen.findByLabelText("Remove Tag 466"));

    expect(onChange).toHaveBeenCalledWith(["7:inst"]);
  });

  it("a stored bare 466 is shown selected in the option list and its option toggle removes it", async () => {
    mockFindTagsMinimal.mockResolvedValue([row("466", "inst", "Tag 466")]);
    const onChange = vi.fn();

    render(
      <SearchableSelect
        entityType="tags"
        value={["466", "7:inst"]}
        onChange={onChange}
        multi
      />
    );
    await screen.findByLabelText("Remove Tag 466");

    fireEvent.click(trigger());
    await waitFor(() => {
      expect(screen.getByText("✓")).toBeTruthy();
    });
    const option = must(
      screen.getByText("✓").closest("button"),
      "the option, shown selected"
    );
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(["7:inst"]);
  });

  it("a stored bare id in single mode is removed by the chip's ×", async () => {
    mockFindTagsMinimal.mockResolvedValue([row("466", "inst", "Tag 466")]);
    const onChange = vi.fn();

    render(
      <SearchableSelect entityType="tags" value="466" onChange={onChange} />
    );

    fireEvent.click(await screen.findByLabelText("Remove Tag 466"));

    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("SearchableSelect inside a Modal", () => {
  // Modal stops the press React would bubble to its ancestors; the dropdown's
  // outside-press listener on the document must still hear it
  it("a press elsewhere in the dialog closes the open dropdown", async () => {
    render(
      <div onMouseDown={vi.fn()} onClick={vi.fn()}>
        <Modal isOpen onClose={vi.fn()} title="Restrictions">
          <p>Elsewhere in the dialog</p>
          <SearchableSelect
            entityType="performers"
            value={[]}
            onChange={vi.fn()}
            multi
          />
        </Modal>
      </div>
    );

    fireEvent.click(trigger());
    expect(
      await screen.findByPlaceholderText("Type to search...")
    ).toBeTruthy();

    const elsewhere = screen.getByText("Elsewhere in the dialog");
    fireEvent.mouseDown(elsewhere);
    fireEvent.click(elsewhere);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Type to search...")).toBeNull();
    });
  });
});

describe("SearchableSelect as a keyboard control", () => {
  /** A picker that keeps its own value, as a filter panel does */
  function Harness({
    multi = false,
    initial,
    label = "Tags",
  }: {
    multi?: boolean;
    initial: string | string[];
    label?: string;
  }) {
    const [value, setValue] = useState<string | string[]>(initial);
    return (
      <>
        <SearchableSelect
          entityType="tags"
          label={label}
          value={value}
          onChange={setValue}
          multi={multi}
          placeholder="Select Tags..."
        />
        <button type="button">Next field</button>
      </>
    );
  }

  beforeEach(() => {
    mockFindTagsMinimal.mockImplementation((params) =>
      Promise.resolve(
        params.ids
          ? params.ids.map((ref) =>
              row(ref.split(":")[0] ?? ref, "i", `Tag ${ref.split(":")[0]}`)
            )
          : [
              row("1", "i", "Tag 1"),
              row("2", "i", "Tag 2"),
              row("3", "i", "Tag 3"),
            ]
      )
    );
  });

  it("the trigger is a button named by the field", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} multi />);

    const button = screen.getByRole("button", { name: /^Tags/ });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-expanded", "false");

    button.focus();
    await user.keyboard("{Enter}");

    const search = await screen.findByPlaceholderText("Type to search...");
    expect(search).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button.getAttribute("aria-controls")).toBeTruthy();
    expect(
      document.getElementById(must(button.getAttribute("aria-controls")))
    ).toContainElement(search);
  });

  it("the trigger's name carries the selected names", async () => {
    render(<Harness initial={["1:i", "2:i"]} multi />);

    expect(
      await screen.findByRole("button", { name: "Tags: Tag 1, Tag 2" })
    ).toBeInTheDocument();
  });

  it("without a label the placeholder names the button", () => {
    render(
      <SearchableSelect
        entityType="tags"
        value={[]}
        onChange={vi.fn()}
        multi
        placeholder="Show only these tags..."
      />
    );

    expect(
      screen.getByRole("button", { name: "Show only these tags..." })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape closes the dropdown and returns focus to the trigger, and is marked handled", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} multi />);
    await user.click(trigger());
    const search = await screen.findByPlaceholderText("Type to search...");
    await user.type(search, "ta");

    const notCancelled = fireEvent.keyDown(search, { key: "Escape" });

    expect(notCancelled).toBe(false);
    expect(screen.queryByPlaceholderText("Type to search...")).toBeNull();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).toHaveFocus();

    // The search text is gone with the list
    await user.click(trigger());
    expect(await screen.findByPlaceholderText("Type to search...")).toHaveValue(
      ""
    );
  });

  it("Escape on a closed picker is left alone", () => {
    render(<Harness initial={[]} multi />);

    const notCancelled = fireEvent.keyDown(trigger(), { key: "Escape" });

    expect(notCancelled).toBe(true);
  });

  it("a selected value's remove button is not inside the trigger", async () => {
    render(<Harness initial={["1:i", "2:i"]} multi />);

    const remove = await screen.findByRole("button", { name: "Remove Tag 1" });
    expect(trigger()).not.toContainElement(remove);
    expect(
      screen.getByRole("button", { name: "Clear all selections" })
    ).toBeInTheDocument();
    expect(trigger().querySelector("button")).toBeNull();
  });

  it("an option shows whether it is picked", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["2:i"]} multi />);
    await screen.findByRole("button", { name: "Remove Tag 2" });
    await user.click(trigger());

    const picked = await screen.findByRole("button", {
      name: /^Tag 2 ✓$/,
      pressed: true,
    });
    expect(picked).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tag 1", pressed: false })
    ).toBeInTheDocument();
  });

  it("picking in a single picker returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    await user.click(trigger());
    await screen.findByRole("button", { name: "Tag 2", pressed: false });

    await user.click(screen.getByRole("button", { name: "Tag 2" }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Type to search...")).toBeNull();
    });
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute("aria-label", "Tags: Tag 2");
  });

  it("removing a value focuses the next value's remove button, else the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["1:i", "2:i"]} multi />);

    await user.click(
      await screen.findByRole("button", { name: "Remove Tag 1" })
    );
    expect(screen.getByRole("button", { name: "Remove Tag 2" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Remove Tag 2" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Remove Tag 2" })).toBeNull();
    });
    expect(trigger()).toHaveFocus();
  });

  it("focus leaving the picker closes its list", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} multi />);
    await user.click(trigger());
    await screen.findByPlaceholderText("Type to search...");

    // Tab walks the search box and the options, then leaves for the next field
    const nextField = screen.getByRole("button", { name: "Next field" });
    for (let i = 0; i < 8 && document.activeElement !== nextField; i++) {
      await user.tab();
    }
    expect(nextField).toHaveFocus();

    expect(screen.queryByPlaceholderText("Type to search...")).toBeNull();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("moving focus between the search box and an option keeps the list open", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} multi />);
    await user.click(trigger());
    const option = await screen.findByRole("button", { name: "Tag 1" });

    option.focus();

    expect(
      screen.getByPlaceholderText("Type to search...")
    ).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("SearchableSelect include or exclude per value (F22a)", () => {
  /** A picker whose values each include or exclude, as the filter panel holds them */
  function ExcludeHarness({
    initial,
    initialExcluded = [],
  }: {
    initial: string[];
    initialExcluded?: string[];
  }) {
    const [value, setValue] = useState<string[]>(initial);
    const [excluded, setExcluded] = useState<string[]>(initialExcluded);
    return (
      <>
        <SearchableSelect
          entityType="tags"
          label="Tags"
          multi
          value={value}
          excluded={excluded}
          onChange={(next) => setValue(next as string[])}
          onSelectionChange={(included, nextExcluded) => {
            setValue(included);
            setExcluded(nextExcluded);
          }}
          placeholder="Select Tags..."
        />
        <output data-testid="picked">
          {JSON.stringify({ value, excluded })}
        </output>
      </>
    );
  }

  const picked = () =>
    JSON.parse(screen.getByTestId("picked").textContent ?? "{}") as {
      value: string[];
      excluded: string[];
    };

  beforeEach(() => {
    mockFindTagsMinimal.mockImplementation((params) =>
      Promise.resolve(
        params.ids
          ? params.ids.map((ref) =>
              row(ref.split(":")[0] ?? ref, "i", `Tag ${ref.split(":")[0]}`)
            )
          : [row("1", "i", "Tag 1"), row("2", "i", "Tag 2")]
      )
    );
  });

  it("each picked value has an include or exclude toggle, a button reachable by keyboard and TV, `aria-pressed` when excluded", async () => {
    const user = userEvent.setup();
    render(<ExcludeHarness initial={["1:i"]} initialExcluded={["2:i"]} />);

    const include = await screen.findByRole("button", {
      name: "Exclude Tag 1",
    });
    const exclude = screen.getByRole("button", { name: "Exclude Tag 2" });
    // Real buttons: Tab reaches them, and so does TV mode's navigator
    expect(include.tagName).toBe("BUTTON");
    expect(include).not.toHaveAttribute("tabindex", "-1");
    expect(include).toHaveAttribute("aria-pressed", "false");
    expect(exclude).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Tags: Tag 1, not Tag 2" })
    ).toBeInTheDocument();

    // From the keyboard: Tag 1 becomes an exclusion
    include.focus();
    await user.keyboard("{Enter}");
    expect(picked()).toEqual({ value: [], excluded: ["2:i", "1:i"] });
    expect(
      screen.getByRole("button", { name: "Exclude Tag 1" })
    ).toHaveAttribute("aria-pressed", "true");

    // And back: Tag 2 becomes an include
    await user.click(screen.getByRole("button", { name: "Exclude Tag 2" }));
    expect(picked()).toEqual({ value: ["2:i"], excluded: ["1:i"] });

    // Removing an excluded value drops it from the exclusions
    await user.click(screen.getByRole("button", { name: "Remove Tag 1" }));
    expect(picked()).toEqual({ value: ["2:i"], excluded: [] });

    // Clear all empties both
    await user.click(screen.getByRole("button", { name: "Exclude Tag 2" }));
    await user.click(
      screen.getByRole("button", { name: "Clear all selections" })
    );
    expect(picked()).toEqual({ value: [], excluded: [] });
  });

  it("every pick shows its toggle and remove icons, not drawn in the pick's own colour; an included pick's toggle is dimmed until hover or focus", async () => {
    render(<ExcludeHarness initial={["1:i"]} initialExcluded={["2:i"]} />);

    const include = await screen.findByRole("button", {
      name: "Exclude Tag 1",
    });
    const exclude = screen.getByRole("button", { name: "Exclude Tag 2" });
    for (const name of ["Tag 1", "Tag 2"]) {
      const toggle = screen.getByRole("button", { name: `Exclude ${name}` });
      const remove = screen.getByRole("button", { name: `Remove ${name}` });
      const pick = must(toggle.parentElement, `${name}'s pick`);
      // The icons take the pick's text colour, never its background
      expect(toggle.style.color).not.toBe(pick.style.backgroundColor);
      expect(remove.style.color).not.toBe(pick.style.backgroundColor);
    }
    // Included: there but quiet, full strength on hover or focus
    expect(include).toHaveClass(
      "opacity-60",
      "hover:!opacity-100",
      "focus-visible:!opacity-100"
    );
    // Excluded: the pressed toggle shows at full strength
    expect(exclude).not.toHaveClass("opacity-60");
  });

  it("an excluded value is picked in the list, and picking it again removes it", async () => {
    const user = userEvent.setup();
    render(<ExcludeHarness initial={[]} initialExcluded={["2:i"]} />);

    await user.click(await screen.findByRole("button", { name: /^Tags/ }));
    const option = await screen.findByRole("button", {
      name: /^Tag 2/,
      pressed: true,
    });
    await user.click(option);

    expect(picked()).toEqual({ value: [], excluded: [] });
  });

  it("no toggle under Has NONE, nor where the field has no `excludeKey`", async () => {
    const onChange = vi.fn();
    const onSelectionChange = vi.fn();
    const control = (props: Partial<FilterControlProps>) => (
      <FilterControl
        type="searchable-select"
        label="Tags"
        entityType="tags"
        multi
        value={["1:i"]}
        onChange={onChange}
        modifierOptions={[
          { value: "INCLUDES", label: "Has ANY of these" },
          { value: "EXCLUDES", label: "Has NONE of these" },
        ]}
        {...props}
      />
    );

    const { rerender } = render(
      control({
        modifierValue: "INCLUDES",
        excluded: [],
        onSelectionChange,
      })
    );
    expect(
      await screen.findByRole("button", { name: "Exclude Tag 1" })
    ).toBeInTheDocument();

    // Has NONE: every value already excludes
    rerender(
      control({
        modifierValue: "EXCLUDES",
        excluded: [],
        onSelectionChange,
      })
    );
    expect(await screen.findByText("Tag 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exclude Tag 1" })).toBeNull();

    // A field with no excludeKey: no handler, no toggle
    rerender(control({ modifierValue: "INCLUDES" }));
    expect(await screen.findByText("Tag 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exclude Tag 1" })).toBeNull();

    // Nor on a picker used alone without one
    rerender(
      <SearchableSelect
        entityType="tags"
        multi
        value={["1:i"]}
        onChange={onChange}
      />
    );
    expect(await screen.findByText("Tag 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exclude Tag 1" })).toBeNull();
  });
});

describe("SearchableSelect playlist and scene sources (F22b)", () => {
  /** An own playlist as `GET /api/playlists` lists it */
  const ownPlaylist = (id: number, name: string) =>
    untrusted<GetUserPlaylistsResponse["playlists"][number]>({
      id,
      userId: 1,
      name,
      description: null,
      _count: { items: 0 },
      items: [],
    });

  /** A playlist shared with the viewer, as `GET /api/playlists/shared` lists it */
  const sharedPlaylist = (id: number, name: string, owner: string) =>
    untrusted<GetSharedPlaylistsResponse["playlists"][number]>({
      id,
      name,
      description: null,
      sceneCount: 0,
      owner: { id: 2, username: owner },
      sharedViaGroups: ["Friends"],
      sharedAt: "2026-01-01T00:00:00.000Z",
      items: [],
    });

  beforeEach(() => {
    mockGetPlaylists.mockResolvedValue({
      playlists: [ownPlaylist(12, "Road trip"), ownPlaylist(3, "Gym")],
    });
    mockGetSharedPlaylists.mockResolvedValue({
      playlists: [sharedPlaylist(40, "Weekend", "alice")],
    });
  });

  it("the playlist picker lists own playlists, then shared ones with `by <owner>`", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchableSelect
        entityType="playlists"
        label="Playlists"
        value={[]}
        onChange={onChange}
        multi
      />
    );
    // Nothing loads before the list opens
    expect(mockGetPlaylists).not.toHaveBeenCalled();

    await user.click(trigger());

    const options = await screen.findAllByRole("button", { pressed: false });
    expect(options.map((option) => option.textContent)).toEqual([
      "Road trip",
      "Gym",
      "Weekend by alice",
    ]);
    // Once per opening: typing filters what was read
    expect(mockGetPlaylists).toHaveBeenCalledTimes(1);
    expect(mockGetSharedPlaylists).toHaveBeenCalledTimes(1);
    await user.type(screen.getByPlaceholderText("Type to search..."), "week");
    expect(
      screen
        .getAllByRole("button", { pressed: false })
        .map((option) => option.textContent)
    ).toEqual(["Weekend by alice"]);
    expect(mockGetPlaylists).toHaveBeenCalledTimes(1);

    // A pick is the playlist's Peek id, never joined with an instance
    await user.click(screen.getByRole("button", { name: "Weekend by alice" }));
    expect(onChange).toHaveBeenCalledWith(["40"]);
    // No entity endpoint is asked
    for (const mock of MINIMAL_MOCKS) expect(mock).not.toHaveBeenCalled();
  });

  it("a stale playlist id shows `Unavailable playlist` and stays selected", async () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        entityType="playlists"
        label="Playlists"
        value={["12", "999"]}
        onChange={onChange}
        multi
      />
    );

    expect(await screen.findByText("Unavailable playlist")).toBeInTheDocument();
    expect(screen.getByText("Road trip")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Playlists: Road trip, Unavailable playlist",
      })
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the scene picker searches `/api/library/scenes/minimal`", async () => {
    const user = userEvent.setup();
    mockFindScenesMinimal.mockImplementation((params) =>
      Promise.resolve(
        params.ids
          ? [row("5", "a", "Beach day")]
          : [row("5", "a", "Beach day"), row("6", "a", "Sunset")]
      )
    );
    const onChange = vi.fn();
    render(
      <SearchableSelect
        entityType="scenes"
        label="Scenes"
        value={["5:a"]}
        onChange={onChange}
        multi
        countFilterContext="scenes"
      />
    );

    expect(await screen.findByText("Beach day")).toBeInTheDocument();
    expect(must(mockFindScenesMinimal.mock.calls[0])[0]).toEqual({
      ids: ["5:a"],
      filter: { per_page: 100 },
    });

    await user.click(trigger());
    await user.type(screen.getByPlaceholderText("Type to search..."), "sun");
    await user.click(await screen.findByRole("button", { name: "Sunset" }));

    expect(onChange).toHaveBeenCalledWith(["5:a", "6:a"]);
    // The scene endpoint takes no count filter and no scope
    expect(must(mockFindScenesMinimal.mock.calls.at(-1))[0]).toEqual({
      filter: { per_page: 50, q: "sun" },
    });
  });
});
