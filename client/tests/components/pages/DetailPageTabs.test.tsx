/**
 * The five detail pages open the tab the counts and the URL name, say so when
 * there is nothing to show, and stand aside for a lookup that is loading,
 * not found or failed.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardSettings, resetDetailPageMocks } from "./detail/detailPageMocks";
import {
  type DetailPageOptions,
  type DetailType,
  bodiesTo,
  cleanupDetailPage,
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

const entity = {
  id: "5",
  instanceId: "inst-b",
  name: "Thing",
  title: "Thing",
  details: "About the thing",
  description: "About the thing",
  synopsis: "About the thing",
  alias_list: ["Alias One", "Alias Two"],
  image_path: "/img.jpg",
  rating: 60,
  rating100: 60,
  favorite: true,
  o_counter: 4,
  gender: "FEMALE",
  urls: ["https://example.com/a"],
  tags: [{ id: "1", name: "A tag", instanceId: "inst-b" }],
  children: [],
  parents: [],
  performers: [],
  images: [],
  scene_count: 3,
  image_count: 2,
  gallery_count: 1,
};

/**
 * What shows a tab is open: a mocked child's test id, or `IMAGE_LIST` for
 * an images tab: the real image list, which asks `POST /library/images`
 * and, with no images, says so
 */
type TabContent = string;
const IMAGE_LIST: TabContent = "the image list";

interface PageSpec {
  type: DetailType;
  plural: string;
  /** A tab, the count that opens it, and what it renders */
  tabs: [tab: string, content: TabContent][];
  emptyText: string;
}

const PAGES: PageSpec[] = [
  {
    type: "performer",
    plural: "performers",
    tabs: [
      ["scenes", "SceneSearch"],
      ["galleries", "GalleryGrid"],
      ["images", IMAGE_LIST],
      ["groups", "GroupGrid"],
    ],
    emptyText: "This performer has no content in Peek",
  },
  {
    type: "studio",
    plural: "studios",
    tabs: [
      ["scenes", "SceneSearch"],
      ["galleries", "GalleryGrid"],
      ["images", IMAGE_LIST],
      ["performers", "PerformerGrid"],
      ["groups", "GroupGrid"],
    ],
    emptyText: "This studio has no content in Peek",
  },
  {
    type: "tag",
    plural: "tags",
    tabs: [
      ["scenes", "SceneSearch"],
      ["galleries", "GalleryGrid"],
      ["images", IMAGE_LIST],
      ["performers", "PerformerGrid"],
      ["studios", "StudioGrid"],
      ["groups", "GroupGrid"],
    ],
    emptyText: "This tag has no content in Peek",
  },
  {
    type: "group",
    plural: "groups",
    tabs: [
      ["scenes", "SceneSearch"],
      ["performers", "PerformerGrid"],
    ],
    emptyText: "This collection has no content in Peek",
  },
  {
    type: "gallery",
    plural: "galleries",
    tabs: [
      ["images", IMAGE_LIST],
      ["scenes", "SceneSearch"],
    ],
    emptyText: "This gallery has no content in Peek",
  },
];

const ALL_COUNTS = {
  scenes: 3,
  galleries: 2,
  images: 4,
  performers: 2,
  studios: 2,
  groups: 1,
};

const NO_COUNTS = {
  scenes: 0,
  galleries: 0,
  images: 0,
  performers: 0,
  studios: 0,
  groups: 0,
};

/** Waits for a tab's content to show */
async function tabShown(content: TabContent): Promise<void> {
  if (content === IMAGE_LIST) {
    await waitFor(() => expect(bodiesTo("/library/images")).not.toEqual([]));
    expect(await screen.findByText(/^No images found/)).toBeVisible();
  } else {
    expect((await screen.findAllByTestId(content)).length).toBeGreaterThan(0);
  }
}

describe.each(PAGES)("$type page tabs", ({ type, plural, tabs, emptyText }) => {
  const lookupPath = `/library/${plural}`;
  const countsPath = `/library/${plural}/5/counts`;
  let counts: DetailPageOptions["counts"];

  function renderPage(search = "", options: DetailPageOptions = {}) {
    return renderDetailPage(type, `/${type}/5${search}`, {
      entity,
      counts,
      ...options,
    });
  }

  beforeEach(() => {
    resetDetailPageMocks();
    cardSettings.current = {
      showFavorite: true,
      showRating: true,
      showDescriptionOnDetail: true,
    };
    counts = ALL_COUNTS;
  });
  afterEach(() => {
    cleanupDetailPage();
  });

  it.each(tabs)("opens the %s tab the URL names", async (tab, content) => {
    renderPage(`?tab=${tab}`);

    await tabShown(content);
  });

  it("opens the first tab with content when the URL names none", async () => {
    const [lastTab, lastContent] = must(tabs.at(-1), "the last tab");
    counts = { ...NO_COUNTS, [lastTab]: 2 };
    renderPage();

    await tabShown(lastContent);
    expect(screen.queryByText(emptyText)).toBeNull();
  });

  it("says so when the entity has nothing to show", async () => {
    counts = NO_COUNTS;
    renderPage();

    expect(await screen.findByText(emptyText)).toBeVisible();
  });

  it("shows the rating slider only while the viewer keeps ratings on", async () => {
    const [, firstContent] = must(tabs[0], "the first tab");
    renderPage();
    await tabShown(firstContent);
    const withRating = screen.queryAllByRole("slider").length;
    cleanupDetailPage();

    cardSettings.current = {};
    renderPage();
    await tabShown(firstContent);

    expect(withRating).toBeGreaterThan(0);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("shows nothing but a spinner while the lookup loads", async () => {
    const { api } = renderPage("", { lookup: "loading" });

    await waitFor(() => expect(requestsTo(api, lookupPath)).toHaveLength(1));
    expect(screen.queryByText(emptyText)).toBeNull();
  });

  it("says so when the entity is not found", async () => {
    renderPage("", { lookup: "notFound" });

    expect(await screen.findByRole("heading")).toHaveTextContent(/not found/);
  });

  it("shows the lookup's error with a Retry", async () => {
    const { api } = renderPage("", { lookup: "error" });

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(requestsTo(api, lookupPath)).toHaveLength(2));
  });

  it("shows the counts error under the tabs", async () => {
    counts = "error";
    const { api } = renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(requestsTo(api, countsPath)).toHaveLength(2));
  });
});
