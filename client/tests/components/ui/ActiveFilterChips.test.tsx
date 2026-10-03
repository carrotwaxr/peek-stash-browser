/**
 * ActiveFilterChips: one chip per active filter field, naming its values
 * and its condition ("Tags: all of Blonde, Outdoor"), the names resolved
 * through the entity's `/minimal` endpoint (faked here as the server
 * answers it). The chip body opens its field; the remove button clears it.
 */
import type { ComponentProps } from "react";
import type { ListKind } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { untrusted } from "@tests/helpers/untrusted";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { libraryApi } from "@/api/library";
import { getPlaylists, getSharedPlaylists } from "@/api/playlists";
import ActiveFilterChips from "@/components/ui/ActiveFilterChips";
import { filterOptionsOf } from "@/utils/filterFields";

vi.mock("@/api/library", () => ({
  libraryApi: {
    findTagsMinimal: vi.fn(),
    findPerformersMinimal: vi.fn(),
    findStudiosMinimal: vi.fn(),
    findGroupsMinimal: vi.fn(),
    findGalleriesMinimal: vi.fn(),
    findScenesMinimal: vi.fn(),
  },
}));

vi.mock("@/api/playlists", () => ({
  getPlaylists: vi.fn(),
  getSharedPlaylists: vi.fn(),
}));

// Images' Studios and Scenes' Performers offer Has none and Has any, and
// scenes have Path and Playlists rows and clips a Scenes row, as F18 to F21
// opt them in
vi.mock("@peek/shared-types", async (importOriginal) => {
  const { withRefPresence } = await import("@tests/helpers/refPresence");
  const { withEditorRows } = await import("@tests/helpers/editorRows");
  return withEditorRows(
    withRefPresence(await importOriginal(), [
      ["image", "studioIds"],
      ["scene", "performerIds"],
    ])
  );
});

let unit = "metric";
vi.mock("@/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: unit }),
}));

interface Known {
  id: string;
  instanceId: string;
  name: string;
}

/** `/minimal` with `ids`: a composite id matches its instance, a bare id every instance */
const minimalOf =
  (known: Known[]) =>
  ({ ids = [] }: { ids?: string[] } = {}) =>
    Promise.resolve(
      known.filter((entity) =>
        ids.some((id) =>
          id.includes(":")
            ? id === `${entity.id}:${entity.instanceId}`
            : id === entity.id
        )
      )
    );

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

function renderChips(
  filters: Record<string, unknown>,
  props: Partial<ComponentProps<typeof ActiveFilterChips>> & {
    kind?: ListKind;
  } = {}
) {
  const { kind = "scene", ...rest } = props;
  const onRemoveFilter = vi.fn();
  const onChipClick = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ActiveFilterChips
        kind={kind}
        filters={filters}
        filterOptions={filterOptionsOf(kind)}
        onRemoveFilter={onRemoveFilter}
        onChipClick={onChipClick}
        {...rest}
      />
    </QueryClientProvider>
  );
  return { onRemoveFilter, onChipClick };
}

/** The chip whose text is exactly `text` */
const edit = (text: string) =>
  screen.findByRole("button", { name: `Edit filter: ${text}` });

describe("ActiveFilterChips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unit = "metric";
    vi.mocked(libraryApi.findTagsMinimal).mockImplementation(minimalOf(TAGS));
    vi.mocked(libraryApi.findStudiosMinimal).mockImplementation(
      minimalOf(STUDIOS)
    );
  });

  it("a tag chip names its tags and its condition", async () => {
    renderChips({ tagIds: ["1:a", "2:a"], tagIdsModifier: "INCLUDES_ALL" });

    expect(await edit("Tags: all of Blonde, Outdoor")).toBeInTheDocument();
  });

  it("an exclusion reads as one", async () => {
    renderChips(
      { studioIds: ["10:a", "11:a"], studioIdsModifier: "EXCLUDES" },
      { kind: "image" }
    );

    expect(
      await edit("Studios: none of Brazzers, Reality Kings")
    ).toBeInTheDocument();
  });

  it("sub-tags show", async () => {
    renderChips({
      tagIds: ["3:a"],
      tagIdsModifier: "INCLUDES",
      tagIdsDepth: -1,
    });

    expect(await edit("Tags: any of Anal, with sub-tags")).toBeInTheDocument();
  });

  it("more than 3 names: the first 3, and how many more; only those are looked up", async () => {
    renderChips({
      tagIds: ["1:a", "2:a", "3:a", "4:a", "5:a"],
      tagIdsModifier: "INCLUDES",
    });

    expect(
      await edit("Tags: any of Blonde, Outdoor, Anal +2 more")
    ).toBeInTheDocument();
    expect(libraryApi.findTagsMinimal).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(libraryApi.findTagsMinimal).mock.calls[0]?.[0]?.ids
    ).toEqual(["1:a", "2:a", "3:a"]);
  });

  it("a name the server does not return is not invented", async () => {
    renderChips({ tagIds: ["1:a", "99:a"], tagIdsModifier: "INCLUDES" });

    expect(
      await edit("Tags: any of Blonde, 1 unavailable")
    ).toBeInTheDocument();
    expect(screen.queryByText(/99/)).not.toBeInTheDocument();
  });

  it("while names load the chip reads how many are selected", async () => {
    vi.mocked(libraryApi.findTagsMinimal).mockImplementation(
      () => new Promise(() => {})
    );
    renderChips({ tagIds: ["1:a", "2:a"] });

    expect(await edit("Tags: 2 selected")).toBeInTheDocument();
  });

  it("the To Review preset's bare ids resolve to names; a bare id on two instances shows one name", async () => {
    renderChips(
      { studioIds: ["772", "971"], studioIdsModifier: "EXCLUDES" },
      { kind: "image" }
    );

    expect(
      await edit("Studios: none of Studio A, Studio B")
    ).toBeInTheDocument();
    expect(screen.queryByText(/unavailable/)).not.toBeInTheDocument();
  });

  it("an include and an exclude read as one chip", async () => {
    renderChips({
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
    renderChips({ tagIdsExclude: ["6:a"] });

    expect(await edit("Tags: not Redhead")).toBeInTheDocument();
  });

  it("presence reads as has none or has any", async () => {
    renderChips(
      { studioIds: ["10:a"], studioIdsModifier: "IS_NULL" },
      { kind: "image" }
    );
    expect(await edit("Studios: has none")).toBeInTheDocument();
  });

  it("Has any on Performers reads has any", async () => {
    renderChips({ performerIdsModifier: "NOT_NULL" });

    expect(await edit("Performers: has any")).toBeInTheDocument();
    expect(libraryApi.findPerformersMinimal).not.toHaveBeenCalled();
  });

  it("a single-pick field names its pick without a condition", async () => {
    renderChips({ studioId: "10:a" });

    expect(await edit("Studio: Brazzers")).toBeInTheDocument();
  });

  it("Resolution names its condition", async () => {
    renderChips({ resolution: "FULL_HD", resolutionModifier: "GREATER_THAN" });

    expect(await edit("Resolution: higher than 1080p")).toBeInTheDocument();
  });

  it("a range, a lone bound, a date and a choice read plainly", async () => {
    renderChips({
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
    expect(await edit("Favorite Scenes")).toBeInTheDocument();
  });

  it("a select reads its choice label", async () => {
    renderChips({ gender: "FEMALE" }, { kind: "performer" });

    expect(await edit("Gender: Female")).toBeInTheDocument();
  });

  it("a number with a unit names it", async () => {
    renderChips({ duration: { min: "5", max: "10" } });

    expect(await edit("Duration: 5 to 10 minutes")).toBeInTheDocument();
  });

  it("a metric viewer's Height chip reads centimetres", async () => {
    renderChips({ height: { min: 178, max: 188 } }, { kind: "performer" });

    expect(await edit("Height: 178 to 188 cm")).toBeInTheDocument();
  });

  it("an imperial viewer's Height chip reads feet and inches from a metric state", async () => {
    unit = "imperial";
    renderChips({ height: { min: 178, max: 188 } }, { kind: "performer" });

    expect(await edit("Height: 5 ft 10 in to 6 ft 2 in")).toBeInTheDocument();
  });

  it("an imperial viewer's Weight and Penis Length chips read pounds and inches", async () => {
    unit = "imperial";
    renderChips(
      { weight: { min: 68 }, penisLength: { max: 15.24 } },
      { kind: "performer" }
    );

    expect(await edit("Weight: at least 150 lbs")).toBeInTheDocument();
    expect(await edit("Penis Length: at most 6 in")).toBeInTheDocument();
  });

  it("the chip body is a button that opens that field; the remove button keeps its name", async () => {
    const user = userEvent.setup();
    const { onChipClick, onRemoveFilter } = renderChips({ favorite: true });

    await user.click(await edit("Favorite Scenes"));
    expect(onChipClick).toHaveBeenCalledWith("favorite");

    await user.click(
      screen.getByRole("button", { name: "Remove filter: Favorite Scenes" })
    );
    expect(onRemoveFilter).toHaveBeenCalledWith("favorite");
    expect(onChipClick).toHaveBeenCalledTimes(1);
  });

  it("a chip opens from the keyboard", async () => {
    const user = userEvent.setup();
    const { onChipClick } = renderChips({ favorite: true });

    (await edit("Favorite Scenes")).focus();
    await user.keyboard("{Enter}");

    expect(onChipClick).toHaveBeenCalledWith("favorite");
  });

  it("a detail page's permanent chip still renders, is not a button and has no remove", () => {
    renderChips(
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
    renderChips(
      { performerIds: ["1:a"] },
      {
        filterOptions: filterOptionsOf("scene").filter(
          (option) => option.key !== "performerIds"
        ),
      }
    );

    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });

  it("a Path condition reads `Path: starts with /media/new`", async () => {
    renderChips({ path: "/media/new", pathModifier: "STARTS_WITH" });

    expect(await edit("Path: starts with /media/new")).toBeInTheDocument();
  });

  it("a playlist chip names its playlists from the lists, not `/minimal`", async () => {
    vi.mocked(getPlaylists).mockResolvedValue(
      untrusted({ playlists: [{ id: 12, name: "Road trip" }] })
    );
    vi.mocked(getSharedPlaylists).mockResolvedValue(
      untrusted({
        playlists: [{ id: 40, name: "Weekend", owner: { username: "alice" } }],
      })
    );

    renderChips({ playlistIds: ["12"], playlistIdsModifier: "INCLUDES" });

    expect(await edit("Playlists: any of Road trip")).toBeInTheDocument();
    for (const find of Object.values(libraryApi)) {
      expect(find).not.toHaveBeenCalled();
    }
  });

  it("a clip Scenes chip names its scenes by title", async () => {
    vi.mocked(libraryApi.findScenesMinimal).mockResolvedValue([
      { id: "5", instanceId: "a", name: "Beach day" },
    ]);

    renderChips(
      { sceneIds: ["5:a"], sceneIdsModifier: "INCLUDES" },
      { kind: "clip" }
    );

    expect(await edit("Scenes: any of Beach day")).toBeInTheDocument();
  });
});
