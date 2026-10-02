/**
 * Moving around the detail pages: from one entity to another inside the
 * router, the page title, and what each tab sends to scope its list to the
 * entity.
 */
import { screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GridProps,
  cardSettings,
  grids,
  resetDetailPageMocks,
  sceneSearch,
} from "./detailPageMocks";
import {
  type Answer,
  type DetailType,
  bodiesTo,
  cleanupDetailPage,
  listResponse,
  navigateTo,
  renderDetailPage,
} from "./renderDetailPage";

vi.mock("@/components/grids/index", () =>
  import("./detailPageMocks").then((m) => m.gridsModule)
);
vi.mock("@/components/scene-search/SceneSearch", () =>
  import("./detailPageMocks").then((m) => m.sceneSearchModule)
);
vi.mock("@/contexts/CardDisplaySettingsContext", () =>
  import("./detailPageMocks").then((m) => m.cardDisplaySettingsModule)
);
vi.mock("@/contexts/ConfigContext", () =>
  import("./detailPageMocks").then((m) => m.configModule)
);
vi.mock("@/contexts/UnitPreferenceContext", () =>
  import("./detailPageMocks").then((m) => m.unitPreferenceModule)
);
vi.mock("@/hooks/useNavigationState", () =>
  import("./detailPageMocks").then((m) => m.navigationStateModule)
);
vi.mock("@/hooks/useAuth", () =>
  import("./detailPageMocks").then((m) => m.authModule)
);
vi.mock("@/themes/useTheme", () =>
  import("./detailPageMocks").then((m) => m.themeModule)
);

beforeEach(() => {
  resetDetailPageMocks();
  cardSettings.current = { showRating: true };
});
afterEach(() => {
  cleanupDetailPage();
});

const TYPES: DetailType[] = ["performer", "studio", "tag", "group", "gallery"];

describe.each(TYPES)("%s page moving between entities", (type) => {
  const five = {
    id: "5",
    instanceId: "inst-b",
    name: "Entity Five",
    title: "Entity Five",
    rating: 40,
    rating100: 40,
  };
  const six = {
    id: "6",
    instanceId: "inst-b",
    name: "Entity Six",
    title: "Entity Six",
    rating: 80,
    rating100: 80,
  };

  /** A lookup that answers 5 at once and holds 6 until `release` */
  function holdSix() {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lookup: Answer = async (_url, init) => {
      if (typeof init?.body !== "string") throw new Error("No lookup body");
      const body = JSON.parse(init.body) as { ids: string[] };
      const entity = body.ids[0] === "6" ? six : five;
      if (entity === six) await held;
      return listResponse(type, [entity]);
    };
    return { lookup, release };
  }

  it("shows the spinner, never the previous entity, until the next one answers", async () => {
    const { lookup, release } = holdSix();
    renderDetailPage(type, `/${type}/5`, {
      lookup,
      otherIds: ["6"],
      counts: "loading",
    });
    await screen.findByRole("heading", { level: 1, name: /Entity Five/ });

    // The previous page's name must not show at any moment after the move
    let sawFive = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes("Entity Five")) sawFive = true;
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    navigateTo(`/${type}/6`);

    expect(await screen.findByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    release();
    expect(
      await screen.findByRole("heading", { level: 1, name: /Entity Six/ })
    ).toBeVisible();
    observer.disconnect();
    expect(sawFive).toBe(false);
  });

  it("shows the next entity's rating in the slider, not the previous one's", async () => {
    const { lookup, release } = holdSix();
    renderDetailPage(type, `/${type}/5`, {
      lookup,
      otherIds: ["6"],
      counts: "loading",
    });
    expect(await screen.findByRole("slider")).toHaveValue("4");

    navigateTo(`/${type}/6`);
    release();

    await screen.findByRole("heading", { level: 1, name: /Entity Six/ });
    expect(screen.getByRole("slider")).toHaveValue("8");
  });

  it("sets the document title to the entity's name", async () => {
    const { lookup, release } = holdSix();
    renderDetailPage(type, `/${type}/5`, {
      lookup,
      otherIds: ["6"],
      counts: "loading",
    });
    await waitFor(() => expect(document.title).toBe("Entity Five - Peek"));

    navigateTo(`/${type}/6`);
    release();

    await waitFor(() => expect(document.title).toBe("Entity Six - Peek"));
  });
});

/** The criterion on the entity a tab sends, by where each tab puts it */
interface TabSpec {
  tab: string;
  /** Where the lock is: the Scenes tab's props, a grid's, or the images request */
  sent: "scenes" | "images" | keyof typeof grids;
  filterKey?: string;
}

const SCENES: TabSpec = { tab: "scenes", sent: "scenes" };
const IMAGES: TabSpec = { tab: "images", sent: "images" };
const GALLERIES: TabSpec = {
  tab: "galleries",
  sent: "GalleryGrid",
  filterKey: "gallery_filter",
};
const PERFORMERS: TabSpec = {
  tab: "performers",
  sent: "PerformerGrid",
  filterKey: "performer_filter",
};
const STUDIOS: TabSpec = {
  tab: "studios",
  sent: "StudioGrid",
  filterKey: "studio_filter",
};
const GROUPS: TabSpec = {
  tab: "groups",
  sent: "GroupGrid",
  filterKey: "group_filter",
};

const LOCKS: {
  type: DetailType;
  /** The criterion's key in every tab's filter, and the toggle's URL param */
  field: string;
  toggle?: string;
  tabs: TabSpec[];
  /** The tabs whose list takes sub-entities (a depth) */
  deep?: string[];
  entity: Record<string, unknown>;
}[] = [
  {
    type: "performer",
    field: "performers",
    tabs: [SCENES, GALLERIES, IMAGES, GROUPS],
    entity: {},
  },
  {
    type: "studio",
    field: "studios",
    toggle: "includeSubStudios",
    tabs: [SCENES, GALLERIES, IMAGES, PERFORMERS, GROUPS],
    deep: ["scenes", "galleries", "images", "performers", "groups"],
    entity: { child_studios: [{ id: "6", name: "Sub", instanceId: "inst-b" }] },
  },
  {
    type: "tag",
    field: "tags",
    toggle: "includeSubTags",
    tabs: [SCENES, GALLERIES, IMAGES, PERFORMERS, STUDIOS, GROUPS],
    deep: ["scenes", "galleries", "images", "performers", "studios", "groups"],
    entity: { children: [{ id: "6", name: "Sub", instanceId: "inst-b" }] },
  },
  {
    type: "group",
    field: "groups",
    tabs: [SCENES, PERFORMERS],
    entity: {},
  },
  {
    type: "gallery",
    field: "galleries",
    tabs: [IMAGES, SCENES],
    entity: {},
  },
];

describe.each(LOCKS)("$type page tab locks", (page) => {
  const { type, field, toggle, deep = [] } = page;

  const ALL_COUNTS = {
    scenes: 3,
    galleries: 2,
    images: 4,
    performers: 2,
    studios: 2,
    groups: 1,
  };

  /** The criterion the tab sent on the entity */
  async function sent(spec: TabSpec): Promise<unknown> {
    if (spec.sent === "scenes") {
      await waitFor(() => expect(sceneSearch).toHaveBeenCalled());
      return must(sceneSearch.mock.lastCall, "SceneSearch's props")[0]
        .permanentFilters?.[field];
    }
    if (spec.sent === "images") {
      await waitFor(() => expect(bodiesTo("/library/images")).not.toEqual([]));
      const body = must(bodiesTo("/library/images").at(-1), "the images body");
      return (body.image_filter as Record<string, unknown>)[field];
    }
    const grid = grids[spec.sent];
    await waitFor(() => expect(grid).toHaveBeenCalled());
    const props: GridProps = must(grid.mock.lastCall, "the grid's props")[0];
    return props.lockedFilters?.[must(spec.filterKey, "the filter key")]?.[
      field
    ];
  }

  const render = (tab: string, search = "") =>
    renderDetailPage(type, `/${type}/5?tab=${tab}${search}`, {
      entity: {
        id: "5",
        instanceId: "inst-b",
        name: "Thing",
        title: "Thing",
        ...page.entity,
      },
      counts: ALL_COUNTS,
    });

  it.each(page.tabs.map((spec) => [spec.tab, spec] as const))(
    "the %s tab is locked to the entity's id and server",
    async (_tab, spec) => {
      render(spec.tab);

      expect(await sent(spec)).toEqual({
        value: ["5:inst-b"],
        modifier: "INCLUDES",
      });
    }
  );

  if (toggle) {
    it.each(page.tabs.map((spec) => [spec.tab, spec] as const))(
      "the %s tab sends the depth the toggle asks for, only where its list takes one",
      async (tab, spec) => {
        render(tab, `&${toggle}=true`);

        expect(await sent(spec)).toEqual({
          value: ["5:inst-b"],
          modifier: "INCLUDES",
          ...(deep.includes(tab) && { depth: -1 }),
        });
      }
    );
  }
});
