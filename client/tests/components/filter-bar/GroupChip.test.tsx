/**
 * A filter group's chip: one chip for the group (its match and its rows'
 * field names, no value lookups), whose body opens the Advanced view at the
 * group and whose button removes the whole group in one history entry. The
 * root's "Match any" is a chip of its own that opens Advanced at the root.
 * It renders as a list holds it (`renderListControls`), at a URL.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderListControls } from "@tests/helpers/renderListControls";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GroupChip from "@/components/filter-bar/GroupChip";
import { groupText } from "@/components/filter-bar/chipText";

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

vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

vi.mock("@/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "metric" }),
}));

vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({}),
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

const ANY_URL =
  "/scenes?g1=any&g1.tagFavorite=true&g1.performerFavorite=true&watched=false";

beforeEach(() => {
  vi.clearAllMocks();
  for (const find of Object.values(minimal)) find.mockResolvedValue([]);
});

describe("group chip text", () => {
  it("an any group reads `Any of: Favorite Performers, Favorite Tags` (the panel's order)", async () => {
    renderListControls({}, { url: ANY_URL });

    expect(
      await screen.findByRole("button", {
        name: "Edit filter group: Any of: Favorite Performers, Favorite Tags",
      })
    ).toBeInTheDocument();
  });

  it("an all group reads `All of: Tags, Tags` (two Tags rows)", async () => {
    renderListControls(
      {},
      {
        url: "/scenes?g1=all&g1.tagIds=1:a&g1.tagIdsModifier=INCLUDES_ALL&g1.2.tagIds=5:a,6:a&g1.2.tagIdsModifier=INCLUDES",
      }
    );

    expect(
      await screen.findByRole("button", {
        name: "Edit filter group: All of: Tags, Tags",
      })
    ).toBeInTheDocument();
  });

  it("a group without a declaration is an all group", async () => {
    renderListControls({}, { url: "/scenes?g1.favorite=true" });

    expect(
      await screen.findByRole("button", {
        name: "Edit filter group: All of: Favorite Scenes",
      })
    ).toBeInTheDocument();
  });

  it("past 3 rows the text names 3 and counts the rest", () => {
    expect(groupText("any", ["A", "B", "C", "D", "E"])).toBe(
      "Any of: A, B, C +2 more"
    );
  });

  it("looks no names up: a group chip summarises", async () => {
    renderListControls(
      {},
      { url: "/scenes?g1=any&g1.tagIds=1:a,2:a&g1.tagIdsModifier=INCLUDES" }
    );

    await screen.findByRole("button", {
      name: "Edit filter group: Any of: Tags",
    });
    expect(minimal.findTagsMinimal).not.toHaveBeenCalled();
  });
});

describe("a group chip's actions", () => {
  it("the body is `Edit filter group: <text>` and opens Advanced at that group", async () => {
    const user = userEvent.setup();
    renderListControls(
      {},
      {
        url: "/scenes?g1=all&g1.favorite=true&g2=any&g2.tagFavorite=true&g2.performerFavorite=true",
      }
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Edit filter group: Any of: Favorite Performers, Favorite Tags",
      })
    );

    const view = screen.getByRole("dialog", { name: "Advanced filters" });
    const second = within(view).getByRole("group", { name: "Group 2" });
    await waitFor(() =>
      expect(second.contains(document.activeElement)).toBe(true)
    );
  });

  it("Remove removes the whole group with one history entry", async () => {
    const user = userEvent.setup();
    const list = renderListControls({}, { url: ANY_URL });

    await user.click(
      await screen.findByRole("button", {
        name: "Remove filter group: Any of: Favorite Performers, Favorite Tags",
      })
    );

    await waitFor(() => expect(list.params().has("g1")).toBe(false));
    const keys = [...list.params().keys()];
    expect(keys.filter((key) => key.startsWith("g1"))).toEqual([]);
    expect(list.params().get("watched")).toBe("false");
    expect(list.actions).toEqual(["PUSH"]);
  });

  it("a remaining group takes the removed one's number and keeps focus on its button", async () => {
    const user = userEvent.setup();
    const list = renderListControls(
      {},
      {
        url: "/scenes?g1=all&g1.favorite=true&g2=any&g2.tagFavorite=true&g2.performerFavorite=true",
      }
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Remove filter group: All of: Favorite Scenes",
      })
    );

    await waitFor(() => expect(list.params().get("g1")).toBe("any"));
    expect(list.params().has("g2")).toBe(false);
    expect(
      screen.getByRole("button", {
        name: "Remove filter group: Any of: Favorite Performers, Favorite Tags",
      })
    ).toHaveFocus();
  });
});

describe("Match any", () => {
  it("a root that matches any has a leading chip that opens Advanced at the root", async () => {
    const user = userEvent.setup();
    renderListControls(
      {},
      { url: "/scenes?match=any&favorite=true&organized=true" }
    );

    const chip = await screen.findByRole("button", {
      name: "Edit filter group: Match any",
    });
    const bar = screen.getByRole("group", { name: "Filters" });
    expect(
      within(bar).getAllByRole("button", { name: /^Edit filter/ })[0]
    ).toBe(chip);
    expect(
      screen.queryByRole("button", { name: /^Remove filter group: Match any/ })
    ).not.toBeInTheDocument();

    await user.click(chip);

    const view = screen.getByRole("dialog", { name: "Advanced filters" });
    expect(within(view).getByText("Advanced filters")).toBeInTheDocument();
  });

  it("a root that matches all has none", async () => {
    renderListControls({}, { url: "/scenes?favorite=true" });

    await screen.findByRole("button", { name: /^Edit filter: Favorite/ });
    expect(
      screen.queryByRole("button", { name: "Edit filter group: Match any" })
    ).not.toBeInTheDocument();
  });
});

describe("GroupChip", () => {
  it("draws its text, and its two buttons call back", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(
      <GroupChip
        rowKey="g3"
        text="Any of: Tags"
        onEdit={onEdit}
        onRemove={onRemove}
      />
    );

    expect(container.querySelector("[data-chip-row='g3']")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit filter group: Any of: Tags" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove filter group: Any of: Tags" })
    );
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
