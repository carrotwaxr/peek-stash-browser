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
import type { MinimalEntity, MinimalRequest } from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { untrusted } from "@tests/helpers/untrusted";
import { actAsync, flushPromises, must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Import after mocks are set up
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
} = vi.hoisted(() => ({
  mockFindTags: vi.fn<FindMock>(),
  mockFindPerformers: vi.fn<FindMock>(),
  mockFindTagsMinimal: vi.fn<FindMinimalMock>(),
  mockFindPerformersMinimal: vi.fn<FindMinimalMock>(),
  mockFindStudiosMinimal: vi.fn<FindMinimalMock>(),
  mockFindGroupsMinimal: vi.fn<FindMinimalMock>(),
  mockFindGalleriesMinimal: vi.fn<FindMinimalMock>(),
}));

const MINIMAL_MOCKS = [
  mockFindTagsMinimal,
  mockFindPerformersMinimal,
  mockFindStudiosMinimal,
  mockFindGroupsMinimal,
  mockFindGalleriesMinimal,
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
  },
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
