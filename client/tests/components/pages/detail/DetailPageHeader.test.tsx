/**
 * What the five detail pages show in their header: the name, the aliases, the
 * gender icon, the link to Stash and the rating and favorite controls the
 * viewer keeps on; and the gallery's own subtitle and slideshow button.
 */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auth,
  cardSettings,
  config,
  resetDetailPageMocks,
} from "./detailPageMocks";
import {
  type DetailType,
  bodiesTo,
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
vi.mock("@/hooks/usePageTitle", () =>
  import("./detailPageMocks").then((m) => m.pageTitleModule)
);

const PAGES: { type: DetailType; unnamed?: string }[] = [
  { type: "performer" },
  { type: "studio", unnamed: "Studio 5" },
  { type: "tag", unnamed: "Tag 5" },
  { type: "group", unnamed: "Collection 5" },
  { type: "gallery" },
];

const entity = (extra: Record<string, unknown> = {}) => ({
  id: "5",
  instanceId: "inst-b",
  name: "Thing",
  title: "Thing",
  ...extra,
});

beforeEach(() => {
  resetDetailPageMocks();
  cardSettings.current = { showFavorite: true, showRating: true };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(PAGES)("$type page header", ({ type, unnamed }) => {
  const render = (extra: Record<string, unknown> = {}) =>
    renderDetailPage(type, `/${type}/5`, {
      entity: entity(extra),
      counts: "loading",
    });
  const heading = () => screen.findByRole("heading", { level: 1 });

  it("shows the name as the h1", async () => {
    render();

    expect(await heading()).toHaveTextContent("Thing");
  });

  if (unnamed) {
    it("falls back to the type and id when the entity has no name", async () => {
      render({ name: undefined, title: undefined });

      expect(await heading()).toHaveTextContent(unnamed);
    });
  }

  it("shows View in Stash to an admin, only with a stash URL", async () => {
    auth.current = { user: { role: "ADMIN" } };
    render({ stashUrl: "http://stash.test/thing/5" });
    await heading();

    expect(screen.getByRole("link", { name: "View in Stash" })).toHaveAttribute(
      "href",
      "http://stash.test/thing/5"
    );
    cleanup();
    vi.unstubAllGlobals();

    render({ stashUrl: undefined });
    await heading();

    expect(screen.queryByRole("link", { name: "View in Stash" })).toBeNull();
  });

  it("hides View in Stash from a user who is not an admin", async () => {
    auth.current = { user: { role: "USER" } };
    render({ stashUrl: "http://stash.test/thing/5" });
    await heading();

    expect(screen.queryByRole("link", { name: "View in Stash" })).toBeNull();
  });

  it.each([
    ["favorite", { showFavorite: true }, true, false],
    ["rating", { showRating: true }, false, true],
    ["both", { showFavorite: true, showRating: true }, true, true],
    ["neither", {}, false, false],
  ])(
    "shows the %s controls the viewer keeps on",
    async (_name, settings, favorite, rating) => {
      cardSettings.current = settings;
      render();
      await heading();

      expect(
        screen.queryAllByRole("button", { name: /favorites$/ }).length > 0
      ).toBe(favorite);
      expect(screen.queryAllByRole("slider").length > 0).toBe(rating);
    }
  );
});

describe("performer header", () => {
  const render = (extra: Record<string, unknown> = {}) =>
    renderDetailPage("performer", "/performer/5", {
      entity: entity(extra),
      counts: "loading",
    });

  it("lists the aliases as Also known as", async () => {
    render({ alias_list: ["Ali", "Baba"] });

    expect(await screen.findByText("Also known as: Ali, Baba")).toBeVisible();
  });

  it("says nothing of aliases when there are none", async () => {
    render({ alias_list: [] });
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByText(/Also known as/)).toBeNull();
  });

  it("shows an icon for the gender", async () => {
    render({ gender: "FEMALE" });

    expect(await screen.findByLabelText("Female")).toBeInTheDocument();
  });
});

describe("tag header", () => {
  it("lists the aliases as Also known as", async () => {
    renderDetailPage("tag", "/tag/5", {
      entity: entity({ aliases: ["Sub", "Genre"] }),
      counts: "loading",
    });

    expect(await screen.findByText("Also known as: Sub, Genre")).toBeVisible();
  });
});

describe("gallery header", () => {
  const render = (
    extra: Record<string, unknown> = {},
    images: Record<string, unknown>[] = []
  ) =>
    renderDetailPage("gallery", "/gallery/5", {
      entity: entity(extra),
      images,
      counts: "loading",
    });

  const images = [
    { id: "1", instanceId: "inst-b", title: "One" },
    { id: "2", instanceId: "inst-b", title: "Two" },
  ];

  it("links the studio, with its server when there are several", async () => {
    render({ studio: { id: "3", instanceId: "inst-a", name: "Studio X" } });

    expect(
      await screen.findByRole("link", { name: "Studio X" })
    ).toHaveAttribute("href", "/studio/3?instance=inst-a");
  });

  it("links the studio without a server when there is one", async () => {
    config.current = { hasMultipleInstances: false };
    render({ studio: { id: "3", instanceId: "inst-a", name: "Studio X" } });

    expect(
      await screen.findByRole("link", { name: "Studio X" })
    ).toHaveAttribute("href", "/studio/3");
  });

  it("shows how many images the images answer counts", async () => {
    render({}, images);

    expect(await screen.findByText("2 images")).toBeVisible();
  });

  it("says nothing of images when there are none", async () => {
    const { api } = render();
    await waitFor(() =>
      expect(bodiesTo("/library/images", api)).toHaveLength(1)
    );

    expect(screen.queryByText(/\d+ images?$/)).toBeNull();
  });

  it("shows the date and the photographer", async () => {
    render({ date: "2020-06-15", photographer: "Jane Doe" });

    expect(await screen.findByText("by Jane Doe")).toBeVisible();
    expect(screen.getByText(/2020/)).toBeVisible();
  });

  it("disables Play Slideshow with no images", async () => {
    const { api } = render();
    await waitFor(() =>
      expect(bodiesTo("/library/images", api)).toHaveLength(1)
    );

    expect(
      screen.getByRole("button", { name: /Play Slideshow/ })
    ).toBeDisabled();
  });

  it("enables Play Slideshow once there are images", async () => {
    render({}, images);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Play Slideshow/ })
      ).toBeEnabled()
    );
  });
});
