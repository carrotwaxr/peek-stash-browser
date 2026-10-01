/**
 * What the five detail pages show below the header: each page's own cards,
 * the description card the viewer keeps on, and the Statistics with their
 * counts.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardSettings, resetDetailPageMocks, unit } from "./detailPageMocks";
import {
  type DetailType,
  cleanupDetailPage,
  currentSearch,
  lastBody,
  renderDetailPage,
  requestsTo,
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
vi.mock("@/hooks/usePageTitle", () =>
  import("./detailPageMocks").then((m) => m.pageTitleModule)
);

const base = { id: "5", instanceId: "inst-b", name: "Thing", title: "Thing" };

beforeEach(() => {
  resetDetailPageMocks();
  cardSettings.current = { showDescriptionOnDetail: true };
});
afterEach(() => {
  cleanupDetailPage();
});

/** A card by its title: the element holding its heading and its content */
const card = async (title: string) => {
  const heading = await screen.findByRole("heading", { name: title });
  return within(heading.parentElement as HTMLElement);
};
const noCard = (title: string) =>
  expect(screen.queryByRole("heading", { name: title })).toBeNull();

/** The href of every link on the page */
const hrefs = () =>
  screen.getAllByRole("link").map((link) => link.getAttribute("href"));

describe("performer page sections", () => {
  const performer = {
    ...base,
    birthdate: "1990-06-15",
    death_date: "2060-06-15",
    career_length: "2010 - 2020",
    country: "Norway",
    ethnicity: "Nordic",
    eye_color: "Blue",
    hair_color: "Red",
    height_cm: 170,
    weight: 60,
    penis_length: 15,
    measurements: "34-24-34",
    fake_tits: "No",
    circumcised: "Cut",
    disambiguation: "The first one",
    url: "https://example.com/performer",
    tags: [
      { id: "2", name: "Zed", instanceId: "inst-b" },
      { id: "1", name: "Alpha", instanceId: "inst-b" },
    ],
  };
  const render = (extra: Record<string, unknown> = {}) =>
    renderDetailPage("performer", "/performer/5", {
      entity: { ...performer, ...extra },
      counts: "loading",
    });

  it("lists the personal and physical fields in the Details card", async () => {
    render();

    const details = await card("Details");
    for (const label of [
      "Born",
      "Died",
      "Career",
      "Country",
      "Ethnicity",
      "Eye Color",
      "Hair Color",
      "Height",
      "Weight",
      "Measurements",
      "Fake Tits",
      "Penis Length",
      "Circumcised",
      "Disambiguation",
    ]) {
      expect(details.getByText(label)).toBeVisible();
    }
    for (const value of [
      "2010 - 2020",
      "Norway",
      "Nordic",
      "Blue",
      "Red",
      "34-24-34",
      "The first one",
    ]) {
      expect(details.getByText(value)).toBeVisible();
    }
    // The age is shown beside the birth date, whatever the zone
    expect(details.getByText(/years old/)).toBeVisible();
  });

  it("formats the height, weight and penis length in the viewer's units", async () => {
    render();

    const details = await card("Details");
    expect(details.getByText("170 cm")).toBeVisible();
    expect(details.getByText("60 kg")).toBeVisible();
    expect(details.getByText("15 cm")).toBeVisible();
  });

  it("formats them in imperial units when the viewer keeps those", async () => {
    unit.current = "imperial";
    render();

    const details = await card("Details");
    expect(details.getByText(`5'7"`)).toBeVisible();
    expect(details.getByText("132 lbs")).toBeVisible();
    expect(details.getByText("5.9 in")).toBeVisible();
  });

  it("shows Body Modifications only with tattoos or piercings", async () => {
    render();
    await card("Details");
    expect(screen.queryByText("Body Modifications")).toBeNull();
    expect(screen.queryByText("Tattoos")).toBeNull();
  });

  it.each([
    ["tattoos", { tattoos: "A rose" }, "Tattoos", "A rose"],
    ["piercings", { piercings: "Ears" }, "Piercings", "Ears"],
  ])("shows Body Modifications with %s", async (_n, extra, label, value) => {
    render(extra);

    const details = await card("Details");
    expect(details.getByText("Body Modifications")).toBeVisible();
    expect(details.getByText(label)).toBeVisible();
    expect(details.getByText(value)).toBeVisible();
  });

  it("shows a Links card for the url", async () => {
    render();

    const links = await card("Links");
    expect(
      links.getAllByRole("link").map((link) => link.getAttribute("href"))
    ).toEqual(["https://example.com/performer"]);
  });

  it("shows no Links card without a url", async () => {
    render({ url: undefined });
    await card("Details");

    noCard("Links");
  });

  it("shows the tags as chips, by name, to each tag's page", async () => {
    render();

    const tags = await card("Tags");
    expect(
      tags
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Alpha", "/tag/1?instance=inst-b"],
      ["Zed", "/tag/2?instance=inst-b"],
    ]);
  });
});

describe("studio page sections", () => {
  const studio = {
    ...base,
    url: "https://example.com/studio",
    details: "About the studio",
    parent_studio: { id: "7", name: "Parent", instanceId: "inst-a" },
    child_studios: [{ id: "8", name: "Child", instanceId: "inst-c" }],
    tags: [{ id: "1", name: "Alpha", instanceId: "inst-b" }],
  };
  const render = (extra: Record<string, unknown> = {}) =>
    renderDetailPage("studio", "/studio/5", {
      entity: { ...studio, ...extra },
      counts: "loading",
    });

  it("shows the Website as a link", async () => {
    render();

    const website = await card("Website");
    expect(website.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/studio"
    );
  });

  it("links the Parent Studio and the Child Studios on their own servers", async () => {
    render();

    const parent = await card("Parent Studio");
    expect(parent.getByRole("link", { name: "Parent" })).toHaveAttribute(
      "href",
      "/studio/7?instance=inst-a"
    );
    const children = await card("Child Studios");
    expect(children.getByRole("link", { name: "Child" })).toHaveAttribute(
      "href",
      "/studio/8?instance=inst-c"
    );
  });

  it("shows the tags", async () => {
    render();

    const tags = await card("Tags");
    expect(tags.getByRole("link", { name: "Alpha" })).toBeVisible();
  });

  // DETAIL-22: the description shows once, beside the image
  it("shows the description once", async () => {
    render();

    await card("Website");
    expect(screen.getAllByText("About the studio")).toHaveLength(1);
  });
});

describe("tag page sections", () => {
  const render = () =>
    renderDetailPage("tag", "/tag/5", {
      entity: {
        ...base,
        parents: [{ id: "7", name: "Top", instanceId: "inst-a" }],
        children: [{ id: "8", name: "Leaf", instanceId: "inst-c" }],
      },
      counts: "loading",
    });

  it("links the Parent Tags and the Child Tags on their own servers", async () => {
    render();

    const parents = await card("Parent Tags");
    expect(parents.getByRole("link", { name: "Top" })).toHaveAttribute(
      "href",
      "/tag/7?instance=inst-a"
    );
    const children = await card("Child Tags");
    expect(children.getByRole("link", { name: "Leaf" })).toHaveAttribute(
      "href",
      "/tag/8?instance=inst-c"
    );
  });
});

describe("collection page sections", () => {
  const group = {
    ...base,
    director: "A. Director",
    studio: { id: "3", name: "Studio X", instanceId: "inst-a" },
    containing_groups: [
      {
        group: { id: "9", name: "Series", instanceId: "inst-a" },
        description: "Volume 2",
      },
    ],
    sub_groups: [
      {
        group: { id: "10", name: "Part One", instanceId: "inst-c" },
        description: "The start",
      },
    ],
    tags: [{ id: "1", name: "Alpha", instanceId: "inst-b" }],
    urls: ["https://example.com/collection"],
  };
  const render = (extra: Record<string, unknown> = {}) =>
    renderDetailPage("group", "/group/5", {
      entity: { ...group, ...extra },
      counts: "loading",
    });

  it("shows the Studio, the Director, what it is Part Of and its Sub-Collections", async () => {
    render();

    const studio = await card("Studio");
    expect(studio.getByRole("link", { name: "Studio X" })).toHaveAttribute(
      "href",
      "/studio/3?instance=inst-a"
    );
    expect((await card("Director")).getByText("A. Director")).toBeVisible();
    const partOf = await card("Part Of");
    expect(partOf.getByRole("link", { name: /Series/ })).toHaveAttribute(
      "href",
      "/collection/9?instance=inst-a"
    );
    expect(partOf.getByText("Volume 2")).toBeVisible();
    const subs = await card("Sub-Collections");
    expect(subs.getByRole("link", { name: /Part One/ })).toHaveAttribute(
      "href",
      "/collection/10?instance=inst-c"
    );
    expect(subs.getByText("The start")).toBeVisible();
  });

  it("shows the Tags and the Links", async () => {
    render();

    expect(
      (await card("Tags")).getByRole("link", { name: "Alpha" })
    ).toBeVisible();
    expect((await card("Links")).getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/collection"
    );
  });

  it("flips between the front and the back cover when it has both", async () => {
    render({
      front_image_path: "/front.jpg",
      back_image_path: "/back.jpg",
    });

    const cover = await screen.findByAltText("Thing - Front Cover");
    expect(cover).toHaveAttribute("src", "/front.jpg");
    fireEvent.click(screen.getByTitle("Show back cover"));
    expect(screen.getByAltText("Thing - Back Cover")).toHaveAttribute(
      "src",
      "/back.jpg"
    );
    fireEvent.click(screen.getByTitle("Show front cover"));
    expect(screen.getByAltText("Thing - Front Cover")).toBeVisible();
  });

  it("offers no flipper with one cover", async () => {
    render({ front_image_path: "/front.jpg" });

    await screen.findByAltText("Thing - Front Cover");
    expect(screen.queryByTitle("Show back cover")).toBeNull();
  });
});

describe("gallery page sections", () => {
  it("shows the performers row and the tags", async () => {
    renderDetailPage("gallery", "/gallery/5", {
      entity: {
        ...base,
        performers: [
          { id: "4", name: "Ann", instanceId: "inst-a", gender: "FEMALE" },
        ],
        tags: [{ id: "1", name: "Alpha", instanceId: "inst-b" }],
      },
      counts: "loading",
    });

    expect(
      await screen.findByRole("heading", { name: "Performers" })
    ).toBeVisible();
    expect(hrefs()).toContain("/performer/4?instance=inst-a");
    expect(screen.getByText("Ann")).toBeVisible();
    expect(hrefs()).toContain("/tag/1?instance=inst-b");
  });
});

/** Each page's description: where it is stored, and what its card is */
const DESCRIPTIONS: [DetailType, string][] = [
  ["performer", "details"],
  ["studio", "details"],
  ["tag", "description"],
  ["group", "synopsis"],
  ["gallery", "details"],
];

describe.each(DESCRIPTIONS)("%s page description", (type, key) => {
  const render = () =>
    renderDetailPage(type, `/${type}/5`, {
      entity: { ...base, [key]: "A long story" },
      counts: "loading",
    });

  it("shows it when the viewer keeps descriptions on", async () => {
    cardSettings.current = { showDescriptionOnDetail: true };
    render();

    expect((await screen.findAllByText("A long story")).length).toBeGreaterThan(
      0
    );
  });

  it("hides it when the viewer turns descriptions off", async () => {
    cardSettings.current = { showDescriptionOnDetail: false };
    render();
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByText("A long story")).toBeNull();
  });
});

describe("statistics", () => {
  const PAGES: {
    type: DetailType;
    counts: Record<string, number>;
    /** Each statistic's label and the count it shows */
    stats: [label: string, value: string][];
    /** A statistic that is not the default tab's, and the tab it opens */
    switchTo: [label: string, tab: string];
  }[] = [
    {
      type: "performer",
      counts: { scenes: 3, galleries: 4, images: 5, groups: 6 },
      stats: [
        ["Scenes:", "3"],
        ["Galleries:", "4"],
        ["Images:", "5"],
        ["Collections:", "6"],
      ],
      switchTo: ["Galleries:", "galleries"],
    },
    {
      type: "studio",
      counts: { scenes: 3, galleries: 4, images: 5, performers: 7, groups: 6 },
      stats: [
        ["Scenes:", "3"],
        ["Performers:", "7"],
        ["Images:", "5"],
        ["Galleries:", "4"],
        ["Collections:", "6"],
      ],
      switchTo: ["Performers:", "performers"],
    },
    {
      type: "tag",
      counts: {
        scenes: 3,
        galleries: 4,
        images: 5,
        performers: 7,
        studios: 8,
        groups: 6,
      },
      stats: [
        ["Scenes:", "3"],
        ["Images:", "5"],
        ["Galleries:", "4"],
        ["Performers:", "7"],
        ["Studios:", "8"],
        ["Collections:", "6"],
      ],
      switchTo: ["Studios:", "studios"],
    },
    {
      type: "group",
      counts: { scenes: 3, performers: 7 },
      stats: [
        ["Scenes:", "3"],
        ["Performers:", "7"],
      ],
      switchTo: ["Performers:", "performers"],
    },
  ];

  describe.each(PAGES)("$type page", ({ type, counts, stats, switchTo }) => {
    const render = (search = "") =>
      renderDetailPage(type, `/${type}/5${search}`, {
        entity: base,
        counts,
      });

    it("shows each count from the counts answer", async () => {
      render();

      const statistics = await card("Statistics");
      for (const [label, value] of stats) {
        await waitFor(() =>
          expect(statistics.getByText(label).nextSibling).toHaveTextContent(
            new RegExp(`^${value}$`)
          )
        );
      }
    });

    it("switches to a statistic's tab and starts its list on page 1", async () => {
      render("?page=4");
      const [label, tab] = switchTo;

      const statistics = await card("Statistics");
      const button = await waitFor(() => {
        const found = statistics
          .getByText(label)
          .parentElement?.querySelector("button");
        expect(found).toBeTruthy();
        return found as HTMLButtonElement;
      });
      fireEvent.click(button);

      expect(currentSearch()).toEqual({ tab });
    });
  });

  it("a tag's Markers statistic is the clips the viewer can see", async () => {
    renderDetailPage("tag", "/tag/5", {
      entity: base,
      counts: { scenes: 3, clips: 7 },
    });

    const statistics = await card("Statistics");
    await waitFor(() =>
      expect(statistics.getByText("Markers:").nextSibling).toHaveTextContent(
        /^7$/
      )
    );
  });

  it("a gallery has no Statistics card", async () => {
    renderDetailPage("gallery", "/gallery/5", { entity: base });
    await screen.findByRole("heading", { level: 1 });

    noCard("Statistics");
  });

  describe("performer", () => {
    const performer = { ...base, o_counter: 4, rating: 60, rating100: 60 };
    const render = () =>
      renderDetailPage("performer", "/performer/5", {
        entity: performer,
        counts: { scenes: 3, galleries: 1, images: 1, groups: 1 },
      });

    it("shows the O-count and its rate over the scenes", async () => {
      render();

      const statistics = await card("Statistics");
      expect(statistics.getByText("O-Count:").nextSibling).toHaveTextContent(
        "4"
      );
      expect(await statistics.findByText("133.3%")).toBeVisible();
      expect(statistics.getByText(/4 O-Counts in\s+3 scenes/)).toBeVisible();
    });

    it("shows no rate for a performer with no O count", async () => {
      renderDetailPage("performer", "/performer/5", {
        entity: { ...base, o_counter: 0 },
        counts: { scenes: 3, galleries: 1, images: 1, groups: 1 },
      });

      const statistics = await card("Statistics");
      await waitFor(() =>
        expect(statistics.getByText("Scenes:")).toBeVisible()
      );
      expect(statistics.queryByText("O-Count Rate")).toBeNull();
    });
  });

  describe.each(["performer", "studio"] as const)("%s rating bar", (type) => {
    const entity = { ...base, rating: 60, rating100: 60 };
    const render = () =>
      renderDetailPage(type, `/${type}/5`, {
        entity,
        counts: "loading",
      });

    it("shows the rating from the load", async () => {
      cardSettings.current = { showRating: true };
      render();

      const statistics = await card("Statistics");
      expect(statistics.getByText("60/100")).toBeVisible();
    });

    // DETAIL-17: the studio's bar reads the viewer's rating as the detail
    // hook holds it; the performer page's still reads the rating as loaded
    // (B12 moves it onto the layout)
    const followsSlider = type === "studio" ? it : it.fails;
    followsSlider("follows the slider after a change", async () => {
      cardSettings.current = { showRating: true };
      const { api } = render();
      const statistics = await card("Statistics");

      fireEvent.change(await screen.findByRole("slider"), {
        target: { value: "8" },
      });
      await waitFor(() =>
        expect(requestsTo(api, `/ratings/${type}/5`)).toHaveLength(1)
      );
      expect(lastBody(`/ratings/${type}/5`)).toEqual({
        rating: 80,
        instanceId: "inst-b",
      });

      expect(statistics.getByText("80/100")).toBeVisible();
    });
  });
});
