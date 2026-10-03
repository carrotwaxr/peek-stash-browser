/**
 * ChipEditor: a chip's value editor in a popover under the chip. It holds
 * the row as a local draft and commits it live through the list's
 * filters (`setRow`): the first commit of an open popover pushes, later
 * ones replace. A row emptied while it is open is removed from the list,
 * and the editor stays open as a new row of that field, so a later pick
 * adds that row and never edits a renumbered neighbour.
 */
import { PANEL_FIELDS, PIN_LIMIT } from "@peek/shared-types";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderListControls } from "@tests/helpers/renderListControls";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPut } from "@/api";
import ChipEditorHeader from "@/components/filter-bar/ChipEditorHeader";

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

beforeEach(() => {
  vi.clearAllMocks();
  unit = "metric";
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

const edit = (text: string) =>
  screen.findByRole("button", { name: `Edit filter: ${text}` });
const dialog = () => screen.getByRole("dialog");
/** An option in the editor's open picker list */
const pick = (name: string) =>
  within(dialog()).findByRole("button", { name: new RegExp(`^${name}`) });

const TWO_TAG_ROWS =
  "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES&2.tagIds=2:a&2.tagIdsModifier=INCLUDES";

describe("ChipEditor", () => {
  it("the header names the field and offers Remove", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES&favorite=true" }
    );
    await list.firstQuery();

    await user.click(await edit("Tags: any of Blonde"));
    expect(
      within(dialog()).getByRole("heading", { name: "Tags" })
    ).toBeInTheDocument();
    await user.click(
      within(dialog()).getByRole("button", { name: "Remove Tags filter" })
    );

    await waitFor(() => expect(list.params().has("tagIds")).toBe(false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(list.params().get("favorite")).toBe("true");
    expect(list.actions).toEqual(["PUSH"]);
    // Focus moves to the chip that is left
    expect(
      screen.getByRole("button", {
        name: "Remove filter: Favorite Scenes: Yes",
      })
    ).toHaveFocus();
  });

  it("an imperial Height typed as 5 ft 10 in shows what was typed through the debounced commits", async () => {
    unit = "imperial";
    const user = userEvent.setup();
    const list = renderListControls(
      { artifactType: "performer" },
      { url: "/performers?height_min=150" }
    );
    await list.firstQuery();

    await user.click(await edit("Height: at least 4 ft 11 in"));
    const feet = within(dialog()).getByRole("textbox", {
      name: "Minimum height in feet",
    });
    const inches = within(dialog()).getByRole("textbox", {
      name: "Minimum height in inches",
    });
    await user.clear(feet);
    await user.type(feet, "5");
    // 5 ft 11 in, committed 300 ms after the last key
    await waitFor(() => expect(list.actions).toEqual(["PUSH"]));
    await user.clear(inches);
    await user.type(inches, "10");
    await waitFor(() => expect(list.params().get("height_min")).toBe("177"));

    expect(feet).toHaveValue("5");
    expect(inches).toHaveValue("10");
    expect(list.actions).toEqual(["PUSH", "REPLACE"]);
  });

  it("unticking the only tag keeps the editor open and anchored, focus inside it; picking another applies it", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      { url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES" }
    );
    await list.firstQuery();

    await user.click(await edit("Tags: any of Blonde"));
    await user.click(await pick("Blonde"));

    await waitFor(() => expect(list.params().has("tagIds")).toBe(false));
    // The row is gone from the list; its chip stays while the editor is open
    expect(
      screen.queryByRole("button", { name: /^Remove filter:/ })
    ).not.toBeInTheDocument();
    const chip = screen.getByRole("button", { name: "Edit filter: Tags" });
    expect(must(chip.parentElement?.parentElement)).toContainElement(dialog());
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);

    await user.click(await pick("Outdoor"));

    await waitFor(() => expect(list.params().get("tagIds")).toBe("2:a"));
    expect(list.params().get("tagIdsModifier")).toBe("INCLUDES");
    expect(list.actions).toEqual(["PUSH", "REPLACE"]);
    expect(dialog()).toBeInTheDocument();
  });

  it("emptying the first of two Tags rows leaves the second intact under its new number, and the editor keeps editing its own row", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: TWO_TAG_ROWS });
    await list.firstQuery();

    await user.click(await edit("Tags: any of Blonde"));
    await user.click(await pick("Blonde"));

    // The second row is now the first
    await waitFor(() => expect(list.params().get("tagIds")).toBe("2:a"));
    expect(list.params().has("2.tagIds")).toBe(false);
    expect(await edit("Tags: any of Outdoor")).toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();

    // A pick adds a row of its own, after Outdoor's
    await user.click(await pick("Anal"));

    await waitFor(() => expect(list.params().get("2.tagIds")).toBe("3:a"));
    expect(list.params().get("tagIds")).toBe("2:a");
    expect(list.params().get("tagIdsModifier")).toBe("INCLUDES");
    expect(list.params().get("2.tagIdsModifier")).toBe("INCLUDES");
    expect(await edit("Tags: any of Anal")).toBeInTheDocument();
    expect(await edit("Tags: any of Outdoor")).toBeInTheDocument();
  });

  it("the header offers Pin or Unpin for the field and Pin as quick filter for its value", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: "/scenes?organized=true" });
    await list.firstQuery();

    await user.click(await edit("Organized: Yes"));
    await user.click(
      within(dialog()).getByRole("button", { name: "Pin Organized" })
    );
    expect(apiPut).toHaveBeenLastCalledWith("/user/filter-pins/scene", {
      fields: ["organized"],
      filters: [],
    });
    expect(
      await within(dialog()).findByRole("button", { name: "Unpin Organized" })
    ).toBeEnabled();

    await user.click(
      within(dialog()).getByRole("button", { name: "Pin as quick filter" })
    );
    const [path, body] = must(vi.mocked(apiPut).mock.lastCall, "a save");
    expect(path).toBe("/user/filter-pins/scene");
    expect(body).toMatchObject({
      fields: ["organized"],
      filters: [{ key: "organized", state: { organized: "true" } }],
    });
    expect(JSON.stringify(body)).toMatch(/"id":"[0-9a-f]{32}"/);
    expect(
      await within(dialog()).findByRole("button", {
        name: "Unpin quick filter",
      })
    ).toBeEnabled();
  });

  it("at the cap both say `Up to 10 pins` and are disabled", async () => {
    const user = userEvent.setup();
    const fields = PANEL_FIELDS.scene
      .filter((row) => row.key !== "organized")
      .slice(0, PIN_LIMIT)
      .map((row) => row.key);
    const list = renderListControls(
      {},
      {
        url: "/scenes?organized=true",
        pins: { scene: { fields, filters: [] } },
      }
    );
    await list.firstQuery();

    await user.click(await edit("Organized: Yes"));
    for (const name of ["Pin Organized", "Pin as quick filter"]) {
      const button = within(dialog()).getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription("Up to 10 pins");
    }
  });
});

describe("ChipEditorHeader", () => {
  const organized = must(
    PANEL_FIELDS.scene.find((row) => row.key === "organized"),
    "the Organized row"
  );

  it("names the field; Remove, Pin <field> and Pin as quick filter call back, the last only with a value", async () => {
    const user = userEvent.setup();
    const pinning = {
      fieldPinned: false,
      capped: false,
      isFilterPinned: vi.fn(() => false),
      toggleField: vi.fn(),
      toggleFilter: vi.fn(),
    };
    const beforePin = vi.fn();
    const onRemove = vi.fn();
    const { rerender } = render(
      <ChipEditorHeader
        label="Organized"
        field={organized}
        state={{ organized: "true" }}
        pinning={pinning}
        beforePin={beforePin}
        onRemove={onRemove}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Organized" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pin Organized" }));
    expect(pinning.toggleField).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Pin as quick filter" })
    );
    expect(beforePin).toHaveBeenCalledTimes(1);
    expect(pinning.toggleFilter).toHaveBeenCalledWith({ organized: "true" });
    await user.click(
      screen.getByRole("button", { name: "Remove Organized filter" })
    );
    expect(onRemove).toHaveBeenCalledTimes(1);

    // No value: nothing to pin as a quick filter
    rerender(
      <ChipEditorHeader
        label="Organized"
        field={organized}
        state={{}}
        pinning={pinning}
        onRemove={onRemove}
      />
    );
    expect(
      screen.getByRole("button", { name: "Pin as quick filter" })
    ).toBeDisabled();
  });

  it("without pinning it draws the name and Remove only", () => {
    render(
      <ChipEditorHeader
        label="Organized"
        field={organized}
        state={{ organized: "true" }}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Remove",
    ]);
  });
});
