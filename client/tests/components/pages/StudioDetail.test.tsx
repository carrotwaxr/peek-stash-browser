/**
 * A studio page's Include sub-studios toggle: every tab whose filter field
 * takes a depth in the shared contract (a scene's, gallery's, image's and
 * collection's studio) sends depth -1 while it is on; the Performers tab's
 * field takes none, so the toggle is hidden there.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  grids,
  resetDetailPageMocks,
  sceneSearch,
} from "./detail/detailPageMocks";
import {
  type DetailPageOptions,
  bodiesTo,
  cleanupDetailPage,
  currentSearch,
  lastBody,
  renderDetailPage,
  requestsTo,
} from "./detail/renderDetailPage";

vi.mock("@/components/grids/index", () =>
  import("./detail/detailPageMocks").then((m) => m.gridsModule)
);
vi.mock("@/components/scene-search/SceneSearch", () =>
  import("./detail/detailPageMocks").then((m) => m.sceneSearchModule)
);
vi.mock("@/contexts/CardDisplaySettingsContext", () =>
  import("./detail/detailPageMocks").then((m) => m.cardDisplaySettingsModule)
);
vi.mock("@/contexts/ConfigContext", () =>
  import("./detail/detailPageMocks").then((m) => m.configModule)
);
vi.mock("@/contexts/UnitPreferenceContext", () =>
  import("./detail/detailPageMocks").then((m) => m.unitPreferenceModule)
);
vi.mock("@/hooks/useNavigationState", () =>
  import("./detail/detailPageMocks").then((m) => m.navigationStateModule)
);
vi.mock("@/hooks/useAuth", () =>
  import("./detail/detailPageMocks").then((m) => m.authModule)
);
vi.mock("@/hooks/usePageTitle", () =>
  import("./detail/detailPageMocks").then((m) => m.pageTitleModule)
);
vi.mock("@/themes/useTheme", () =>
  import("./detail/detailPageMocks").then((m) => m.themeModule)
);

const studio = {
  id: "5",
  instanceId: "inst-a",
  name: "Parent Studio",
  scene_count: 3,
  gallery_count: 2,
  image_count: 4,
  performer_count: 2,
  group_count: 1,
  child_studios: [{ id: "6", name: "Sub Studio", instanceId: "inst-a" }],
};

const ALL_COUNTS = {
  scenes: 3,
  galleries: 2,
  images: 4,
  performers: 2,
  groups: 1,
};

let counts: DetailPageOptions["counts"];

function renderPage(search: string) {
  return renderDetailPage("studio", `/studio/5?instance=inst-a&${search}`, {
    entity: studio,
    counts,
  });
}

/** The studio criterion a tab sends: its grid's lock, the scene search's, or the image request's */
async function sentCriterion(tab: string): Promise<unknown> {
  const lock = async (grid: keyof typeof grids, filterKey: string) => {
    await waitFor(() => expect(grids[grid]).toHaveBeenCalled());
    return must(grids[grid].mock.lastCall, `${grid}'s props`)[0]
      .lockedFilters?.[filterKey]?.studios;
  };
  switch (tab) {
    case "scenes":
      await waitFor(() => expect(sceneSearch).toHaveBeenCalled());
      return must(sceneSearch.mock.lastCall, "SceneSearch's props")[0]
        .permanentFilters?.studios;
    case "images":
      await waitFor(() => expect(bodiesTo("/library/images")).not.toEqual([]));
      return (
        lastBody("/library/images").image_filter as Record<string, unknown>
      ).studios;
    case "galleries":
      return lock("GalleryGrid", "gallery_filter");
    case "groups":
      return lock("GroupGrid", "group_filter");
    case "performers":
      return lock("PerformerGrid", "performer_filter");
    default:
      throw new Error(`No tab ${tab}`);
  }
}

const toggle = () =>
  screen.queryByRole("checkbox", { name: /Include sub-studios/ });
const findToggle = () =>
  screen.findByRole("checkbox", { name: /Include sub-studios/ });

beforeEach(() => {
  resetDetailPageMocks();
  counts = ALL_COUNTS;
});
afterEach(() => {
  cleanupDetailPage();
});

describe("StudioDetail: Include sub-studios", () => {
  it("the counts follow the toggle, and open the first tab with content", async () => {
    counts = {
      scenes: 0,
      galleries: 0,
      images: 5,
      performers: 1,
      groups: 0,
    };
    const { api } = renderPage("includeSubStudios=true");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Images\b/ })).toHaveAttribute(
        "aria-current",
        "page"
      )
    );
    expect(requestsTo(api, "/library/studios/5/counts")).toEqual([
      "/api/library/studios/5/counts?instanceId=inst-a&includeSubStudios=true",
    ]);
    expect(screen.queryByRole("button", { name: /^Scenes\b/ })).toBeNull();
    expect(sceneSearch).not.toHaveBeenCalled();
    // The Images tab asks for its first page
    await screen.findByText(/No images found/);
  });

  it.each(["scenes", "galleries", "images", "groups"])(
    "the %s tab sends depth -1 when the toggle is on",
    async (tab) => {
      renderPage(`tab=${tab}&includeSubStudios=true`);

      expect(await findToggle()).toBeChecked();
      expect(await sentCriterion(tab)).toEqual({
        value: ["5:inst-a"],
        modifier: "INCLUDES",
        depth: -1,
      });
    }
  );

  it.each(["scenes", "galleries", "images", "groups"])(
    "the %s tab sends no depth when the toggle is off",
    async (tab) => {
      renderPage(`tab=${tab}`);

      expect(await findToggle()).not.toBeChecked();
      expect(await sentCriterion(tab)).toEqual({
        value: ["5:inst-a"],
        modifier: "INCLUDES",
      });
    }
  );

  it("ticking the toggle on the Collections tab sends depth -1", async () => {
    renderPage("tab=groups");
    await sentCriterion("groups");

    fireEvent.click(await findToggle());

    expect(await sentCriterion("groups")).toEqual({
      value: ["5:inst-a"],
      modifier: "INCLUDES",
      depth: -1,
    });
  });

  it("the Performers tab hides the toggle and sends no depth: a performer's studios take none", async () => {
    renderPage("tab=performers&includeSubStudios=true");

    expect(await sentCriterion("performers")).toEqual({
      value: ["5:inst-a"],
      modifier: "INCLUDES",
    });
    expect(toggle()).not.toBeInTheDocument();
  });
});

describe("StudioDetail: a tab and its toggle start clean", () => {
  it("ticking Include sub-studios on page 5 shows page 1", async () => {
    renderPage("tab=groups&page=5");

    fireEvent.click(await findToggle());

    expect(currentSearch()).toEqual({
      instance: "inst-a",
      tab: "groups",
      includeSubStudios: "true",
    });
  });

  it("the Images statistic opens the Images tab clean", async () => {
    renderPage("page=7&sort=title&includeSubStudios=true");

    const images = must(
      (await screen.findByText("Images:")).parentElement?.querySelector(
        "button"
      ),
      "the Images statistic"
    );
    fireEvent.click(images);
    // The Images tab asks for its first page
    await screen.findByText(/No images found/);

    expect(currentSearch()).toEqual({
      instance: "inst-a",
      includeSubStudios: "true",
      tab: "images",
    });
  });
});
