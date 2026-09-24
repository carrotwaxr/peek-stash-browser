/**
 * ContentRestrictionsModal Component Tests (item 13)
 *
 * The modal edits two lists per restrictable type (Show only, Always hide)
 * and one "Also hide items with no X" box per type:
 * - loads INCLUDE and EXCLUDE rows of one type into the two lists
 * - the box is disabled until a list has an item, defaults on with a
 *   Show-only list and off with only an Always-hide list, and a hand-set
 *   value survives later list edits
 * - saves one row per non-empty list with the type's box value on both
 * - notes ids that are in both lists (Always hide wins)
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContentRestrictionsModal from "../../../src/components/settings/ContentRestrictionsModal";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

vi.mock("../../../src/api", () => ({
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

// A <select multiple> stands in for SearchableSelect: named by its
// placeholder, keyed by entityType, with a fixed option list.
vi.mock("../../../src/components/ui/SearchableSelect", () => ({
  default: ({
    entityType,
    value,
    onChange,
    placeholder,
  }: {
    entityType: string;
    value: string | string[];
    onChange: (v: string | string[]) => void;
    placeholder?: string;
  }) => (
    <select
      multiple
      aria-label={placeholder}
      data-entity-type={entityType}
      value={Array.isArray(value) ? value : [value]}
      onChange={(e) =>
        onChange(
          Array.from(e.target.options)
            .filter((o) => o.selected)
            .map((o) => o.value)
        )
      }
    >
      {["1:A", "2:A", "3:A"].map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  ),
}));

const user = { id: 1, username: "restricted" };

function showOnly(label: string): HTMLSelectElement {
  return screen.getByRole("listbox", {
    name: `Show only these ${label}...`,
  });
}

function alwaysHide(label: string): HTMLSelectElement {
  return screen.getByRole("listbox", {
    name: `Always hide these ${label}...`,
  });
}

function noItemsBox(label: string): HTMLInputElement {
  return screen.getByRole("checkbox", {
    name: `Also hide items with no ${label}`,
  });
}

function selected(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .filter((o) => o.selected)
    .map((o) => o.value);
}

function pick(select: HTMLSelectElement, values: string[]) {
  for (const option of Array.from(select.options)) {
    option.selected = values.includes(option.value);
  }
  fireEvent.change(select);
}

async function renderLoaded(
  restrictions: Array<{
    entityType: string;
    mode: string;
    entityIds: string;
    restrictEmpty: boolean;
  }> = []
) {
  mockApiGet.mockResolvedValue({ restrictions });
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <ContentRestrictionsModal user={user} onClose={onClose} onSave={onSave} />
  );
  await waitFor(() => expect(showOnly("tags")).toBeInTheDocument());
  return { onClose, onSave };
}

describe("ContentRestrictionsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiPut.mockResolvedValue({ success: true });
  });

  it("loads INCLUDE and EXCLUDE rows of one type into the two lists", async () => {
    await renderLoaded([
      {
        entityType: "tags",
        mode: "INCLUDE",
        entityIds: JSON.stringify(["1:A"]),
        restrictEmpty: false,
      },
      {
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["2:A"]),
        restrictEmpty: false,
      },
    ]);

    expect(mockApiGet).toHaveBeenCalledWith("/user/1/restrictions");
    expect(selected(showOnly("tags"))).toEqual(["1:A"]);
    expect(selected(alwaysHide("tags"))).toEqual(["2:A"]);
    // The stored value wins over the default (a Show-only list would default on)
    expect(noItemsBox("tags").checked).toBe(false);
    expect(noItemsBox("tags").disabled).toBe(false);
    // Other types stay empty and disabled
    expect(selected(showOnly("studios"))).toEqual([]);
    expect(noItemsBox("studios").disabled).toBe(true);
  });

  it("box is disabled with both lists empty, ticks itself when the first Show-only item is added, stays unticked with only Always-hide items", async () => {
    await renderLoaded();

    expect(noItemsBox("tags").disabled).toBe(true);
    expect(noItemsBox("tags").checked).toBe(false);

    pick(showOnly("tags"), ["1:A"]);
    expect(noItemsBox("tags").disabled).toBe(false);
    expect(noItemsBox("tags").checked).toBe(true);

    pick(alwaysHide("studios"), ["2:A"]);
    expect(noItemsBox("studios").disabled).toBe(false);
    expect(noItemsBox("studios").checked).toBe(false);
  });

  it("a hand-set box value survives later list edits", async () => {
    await renderLoaded();

    pick(showOnly("tags"), ["1:A"]);
    expect(noItemsBox("tags").checked).toBe(true);

    fireEvent.click(noItemsBox("tags"));
    expect(noItemsBox("tags").checked).toBe(false);

    pick(showOnly("tags"), ["1:A", "3:A"]);
    expect(noItemsBox("tags").checked).toBe(false);
  });

  it("saves one row per non-empty list with the type's box value on both", async () => {
    const { onSave, onClose } = await renderLoaded();

    pick(showOnly("tags"), ["1:A"]);
    pick(alwaysHide("tags"), ["2:A"]);

    fireEvent.click(screen.getByRole("button", { name: "Save Restrictions" }));

    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));
    expect(mockApiPut).toHaveBeenCalledWith("/user/1/restrictions", {
      restrictions: [
        {
          entityType: "tags",
          mode: "INCLUDE",
          entityIds: ["1:A"],
          restrictEmpty: true,
        },
        {
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: ["2:A"],
          restrictEmpty: true,
        },
      ],
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("saves the stored box value for a type whose lists were kept", async () => {
    await renderLoaded([
      {
        entityType: "studios",
        mode: "EXCLUDE",
        entityIds: JSON.stringify(["3:A"]),
        restrictEmpty: true,
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Save Restrictions" }));

    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));
    expect(mockApiPut).toHaveBeenCalledWith("/user/1/restrictions", {
      restrictions: [
        {
          entityType: "studios",
          mode: "EXCLUDE",
          entityIds: ["3:A"],
          restrictEmpty: true,
        },
      ],
    });
  });

  it("shows an overlap note when an id is in both lists", async () => {
    await renderLoaded();

    expect(screen.queryByText(/in both lists/)).not.toBeInTheDocument();

    pick(showOnly("tags"), ["1:A", "2:A"]);
    pick(alwaysHide("tags"), ["2:A"]);

    expect(screen.getByText(/in both lists/)).toBeInTheDocument();
  });

  it("counts several overlapping ids in the note", async () => {
    await renderLoaded();

    pick(showOnly("studios"), ["1:A", "2:A"]);
    pick(alwaysHide("studios"), ["1:A", "2:A"]);

    expect(
      screen.getByText(/2 items are in both lists: Always hide wins/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/1 item is in both/)).not.toBeInTheDocument();

    pick(alwaysHide("studios"), ["2:A"]);
    expect(
      screen.getByText(/1 item is in both lists: Always hide wins/)
    ).toBeInTheDocument();
  });

  it("ignores rows it cannot read and keeps the rest", async () => {
    await renderLoaded([
      {
        entityType: "performers",
        mode: "INCLUDE",
        entityIds: JSON.stringify(["1:A"]),
        restrictEmpty: true,
      },
      {
        entityType: "tags",
        mode: "SOMETIMES",
        entityIds: JSON.stringify(["1:A"]),
        restrictEmpty: true,
      },
      {
        entityType: "studios",
        mode: "INCLUDE",
        entityIds: "not json",
        restrictEmpty: false,
      },
      {
        entityType: "galleries",
        mode: "EXCLUDE",
        entityIds: JSON.stringify({ id: "1:A" }),
        restrictEmpty: false,
      },
      {
        entityType: "groups",
        mode: "EXCLUDE",
        entityIds: JSON.stringify([3]),
        restrictEmpty: true,
      },
    ]);

    // Unknown type and unknown mode: nothing loaded, box untouched
    expect(selected(showOnly("tags"))).toEqual([]);
    expect(noItemsBox("tags").checked).toBe(false);
    expect(noItemsBox("tags").disabled).toBe(true);
    // Unreadable ids load as an empty list
    expect(selected(showOnly("studios"))).toEqual([]);
    expect(selected(alwaysHide("galleries"))).toEqual([]);
    expect(noItemsBox("collections").checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save Restrictions" }));

    // Only the readable row is saved back, with its ids as strings
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));
    expect(mockApiPut).toHaveBeenCalledWith("/user/1/restrictions", {
      restrictions: [
        {
          entityType: "groups",
          mode: "EXCLUDE",
          entityIds: ["3"],
          restrictEmpty: true,
        },
      ],
    });
  });

  it("starts empty when the server sends no restriction list", async () => {
    mockApiGet.mockResolvedValue({});
    render(<ContentRestrictionsModal user={user} onClose={vi.fn()} />);

    await waitFor(() => expect(showOnly("tags")).toBeInTheDocument());
    for (const label of ["collections", "tags", "studios", "galleries"]) {
      expect(selected(showOnly(label))).toEqual([]);
      expect(noItemsBox(label).disabled).toBe(true);
    }
  });

  it("shows the load error and keeps the editor usable", async () => {
    mockApiGet.mockRejectedValue(new Error("Forbidden"));
    render(<ContentRestrictionsModal user={user} onClose={vi.fn()} />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(
      screen.queryByText("Loading restrictions...")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Restrictions" })
    ).toBeEnabled();
  });

  it("shows a generic load error when the failure has no message", async () => {
    mockApiGet.mockRejectedValue(new Error(""));
    render(<ContentRestrictionsModal user={user} onClose={vi.fn()} />);

    expect(
      await screen.findByText("Failed to load restrictions")
    ).toBeInTheDocument();
  });

  it("keeps the modal open and shows the error when saving fails", async () => {
    const { onSave, onClose } = await renderLoaded();
    mockApiPut.mockRejectedValue(new Error("Transaction failed"));

    pick(alwaysHide("tags"), ["1:A"]);
    fireEvent.click(screen.getByRole("button", { name: "Save Restrictions" }));

    expect(await screen.findByText("Transaction failed")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Save Restrictions" })
    ).toBeEnabled();
  });

  it("shows a generic save error when the failure has no message", async () => {
    await renderLoaded();
    mockApiPut.mockRejectedValue(new Error(""));

    fireEvent.click(screen.getByRole("button", { name: "Save Restrictions" }));

    expect(
      await screen.findByText("Failed to save restrictions")
    ).toBeInTheDocument();
  });

  it("saves an empty list when every list is empty, then closes without onSave", async () => {
    mockApiGet.mockResolvedValue({ restrictions: [] });
    const onClose = vi.fn();
    render(<ContentRestrictionsModal user={user} onClose={onClose} />);
    await waitFor(() => expect(showOnly("tags")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Save Restrictions" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockApiPut).toHaveBeenCalledWith("/user/1/restrictions", {
      restrictions: [],
    });
  });

  it("Cancel and a click on the backdrop close the modal", async () => {
    const { onClose } = await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Content Restrictions"));
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = screen
      .getByText("Content Restrictions")
      .closest(".fixed") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("describes the two lists and the administrator rule", async () => {
    await renderLoaded();

    expect(screen.getAllByText("Show only").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Always hide").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Administrators are never restricted/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/must match ALL/)).not.toBeInTheDocument();
    expect(screen.getByText("RECOMMENDED")).toBeInTheDocument();
  });
});
