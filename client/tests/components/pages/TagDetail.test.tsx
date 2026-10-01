/**
 * A tag page's Include sub-tags toggle: every tab's filter field (the tags
 * of a scene, gallery, image, performer, studio and collection) takes a
 * depth in the shared contract, so each tab sends depth -1 while it is on.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { jsonResponse } from "@tests/helpers/stubApi";
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

const tag = {
  id: "5",
  instanceId: "inst-a",
  name: "Parent Tag",
  scene_count: 3,
  gallery_count: 2,
  image_count: 4,
  performer_count: 2,
  studio_count: 2,
  group_count: 1,
  children: [{ id: "6", name: "Sub Tag", instanceId: "inst-a" }],
};

const ALL_COUNTS = {
  scenes: 3,
  galleries: 2,
  images: 4,
  performers: 2,
  studios: 2,
  groups: 1,
};

const COUNTS_PATH = "/library/tags/5/counts";

let counts: DetailPageOptions["counts"];

function renderPage(search: string) {
  return renderAt(`/tag/5?instance=inst-a&${search}`);
}

function renderAt(url: string) {
  return renderDetailPage("tag", url, { entity: tag, counts });
}

/** The tag criterion a tab sends: its grid's lock, the scene search's, or the image request's */
async function sentCriterion(tab: string): Promise<unknown> {
  const lock = async (grid: keyof typeof grids, filterKey: string) => {
    await waitFor(() => expect(grids[grid]).toHaveBeenCalled());
    return must(grids[grid].mock.lastCall, `${grid}'s props`)[0]
      .lockedFilters?.[filterKey]?.tags;
  };
  switch (tab) {
    case "scenes":
      await waitFor(() => expect(sceneSearch).toHaveBeenCalled());
      return must(sceneSearch.mock.lastCall, "SceneSearch's props")[0]
        .permanentFilters?.tags;
    case "images":
      await waitFor(() => expect(bodiesTo("/library/images")).not.toEqual([]));
      return (
        lastBody("/library/images").image_filter as Record<string, unknown>
      ).tags;
    case "galleries":
      return lock("GalleryGrid", "gallery_filter");
    case "performers":
      return lock("PerformerGrid", "performer_filter");
    case "studios":
      return lock("StudioGrid", "studio_filter");
    case "groups":
      return lock("GroupGrid", "group_filter");
    default:
      throw new Error(`No tab ${tab}`);
  }
}

const findToggle = () =>
  screen.findByRole("checkbox", { name: /Include sub-tags/ });

/** Waits for the counts to have answered and the tabs to show them */
const countsShown = () =>
  waitFor(() => expect(screen.getByText("Statistics")).toBeInTheDocument());

const TABS = [
  "scenes",
  "galleries",
  "images",
  "performers",
  "studios",
  "groups",
];

beforeEach(() => {
  resetDetailPageMocks();
  counts = ALL_COUNTS;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TagDetail: Include sub-tags", () => {
  it.each(TABS)(
    "the %s tab shows the toggle and sends depth -1 when it is on",
    async (tab) => {
      renderPage(`tab=${tab}&includeSubTags=true`);

      expect(await findToggle()).toBeChecked();
      expect(await sentCriterion(tab)).toEqual({
        value: ["5:inst-a"],
        modifier: "INCLUDES",
        depth: -1,
      });
    }
  );

  it.each(TABS)(
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

  it("ticking the toggle on the Performers tab sends depth -1", async () => {
    renderPage("tab=performers");
    await sentCriterion("performers");

    fireEvent.click(await findToggle());

    expect(await sentCriterion("performers")).toEqual({
      value: ["5:inst-a"],
      modifier: "INCLUDES",
      depth: -1,
    });
  });
});

describe("TagDetail: counts", () => {
  const tabButton = (label: string) =>
    screen.queryByRole("button", { name: new RegExp(`^${label}\\b`) });

  it("tab badges and the default tab follow the counts", async () => {
    counts = {
      scenes: 0,
      galleries: 3,
      images: 0,
      performers: 2,
      studios: 0,
      groups: 1,
    };
    const { api } = renderPage("");

    await waitFor(() =>
      expect(tabButton("Galleries")).toHaveAttribute("aria-current", "page")
    );
    expect(requestsTo(api, COUNTS_PATH)).toEqual([
      "/api/library/tags/5/counts?instanceId=inst-a",
    ]);
    // The first tab with content opens; empty tabs are hidden
    expect(tabButton("Galleries")).toHaveTextContent("Galleries3");
    expect(tabButton("Performers")).toHaveTextContent("Performers2");
    expect(tabButton("Collections")).toHaveTextContent("Collections1");
    expect(tabButton("Scenes")).toBeNull();
    expect(tabButton("Images")).toBeNull();
    expect(grids.GalleryGrid).toHaveBeenCalled();
    expect(sceneSearch).not.toHaveBeenCalled();
    // The statistics show the same numbers
    const stats = must(
      screen.getByText("Statistics").parentElement,
      "the statistics card"
    );
    expect(stats).toHaveTextContent("Galleries:3");
    expect(stats).toHaveTextContent("Performers:2");
  });

  it("while the counts load, every tab shows without a badge and none opens", async () => {
    counts = "loading";
    const { api } = renderPage("");

    await waitFor(() =>
      expect(tabButton("Scenes")).toHaveTextContent(/^Scenes$/)
    );
    expect(requestsTo(api, COUNTS_PATH)).toHaveLength(1);
    expect(tabButton("Galleries")).toHaveTextContent(/^Galleries$/);
    expect(sceneSearch).not.toHaveBeenCalled();
    expect(grids.GalleryGrid).not.toHaveBeenCalled();
    expect(screen.queryByText("This tag has no content in Peek")).toBeNull();
  });

  it("when the counts fail, the tabs stay with the error and a Retry that asks again", async () => {
    counts = "error";
    const { api } = renderPage("");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Counts are down"
    );
    expect(tabButton("Scenes")).toHaveTextContent(/^Scenes$/);
    expect(sceneSearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(requestsTo(api, COUNTS_PATH)).toHaveLength(2));
  });

  it("a counts failure after the counts were shown leaves the page as it is", async () => {
    let calls = 0;
    counts = () =>
      calls++ === 0
        ? jsonResponse(200, { counts: ALL_COUNTS })
        : jsonResponse(500, { error: "Refresh failed" });
    const { api, queryClient } = renderPage("");
    await countsShown();

    await act(() => queryClient.refetchQueries({ type: "active" }));

    expect(requestsTo(api, COUNTS_PATH)).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a tag with nothing to show says so once the counts answer", async () => {
    counts = {
      scenes: 0,
      galleries: 0,
      images: 0,
      performers: 0,
      studios: 0,
      groups: 0,
    };
    renderPage("");

    expect(
      await screen.findByText("This tag has no content in Peek")
    ).toBeVisible();
  });

  it("a bare-id link counts and filters on the tag's own server", async () => {
    const { api } = renderAt("/tag/5?includeSubTags=true");

    expect(await sentCriterion("scenes")).toEqual({
      value: ["5:inst-a"],
      modifier: "INCLUDES",
      depth: -1,
    });
    expect(requestsTo(api, COUNTS_PATH)).toEqual([
      "/api/library/tags/5/counts?instanceId=inst-a&includeSubTags=true",
    ]);
  });
});

describe("TagDetail: a statistic starts its tab clean", () => {
  /** The button of a statistic in the Statistics card */
  const stat = async (label: string) =>
    must(
      (await screen.findByText(label)).parentElement?.querySelector("button"),
      `the ${label} statistic`
    );

  it("the Images statistic opens the Images tab at page 1 when the scenes list was on page 7", async () => {
    renderPage("page=7&sort=title&favorite=true&includeSubTags=true");

    fireEvent.click(await stat("Images:"));
    // The Images tab asks for its first page
    await screen.findByText(/No images found/);

    expect(currentSearch()).toEqual({
      instance: "inst-a",
      includeSubTags: "true",
      tab: "images",
    });
  });

  it("ticking Include sub-tags on page 5 shows page 1", async () => {
    renderPage("tab=performers&page=5");

    fireEvent.click(await findToggle());

    expect(currentSearch()).toEqual({
      instance: "inst-a",
      tab: "performers",
      includeSubTags: "true",
    });
  });

  it("with no scenes, the Scenes statistic's default tab is the first tab with content", async () => {
    counts = { ...ALL_COUNTS, scenes: 0 };
    renderPage("tab=images&page=2");

    // Galleries is the first tab with content: switching to it drops `tab`
    fireEvent.click(await stat("Galleries:"));

    expect(currentSearch().tab).toBeUndefined();
  });
});

describe("TagDetail: title row", () => {
  it("a tag page's title row wraps (has flex-wrap and min-w-0) and the name breaks words", async () => {
    renderPage("tab=scenes");

    const name = await screen.findByText("Parent Tag", { selector: "h1 span" });
    expect(name).toHaveClass("min-w-0", "break-words");
    const row = must(name.parentElement, "the title row");
    expect(row).toHaveClass("flex", "flex-wrap", "items-center", "min-w-0");
  });
});
