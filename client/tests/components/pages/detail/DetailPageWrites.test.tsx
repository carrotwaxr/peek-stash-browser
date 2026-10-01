/**
 * A detail page's rating and favorite writes: the slider, the heart and the
 * `r` hotkeys send the viewer's value on the entity's own server, keep it,
 * and put the old one back when the server refuses.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cardSettings, resetDetailPageMocks } from "./detailPageMocks";
import {
  type DetailType,
  bodiesTo,
  cleanupDetailPage,
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

const TYPES: DetailType[] = ["performer", "studio", "tag", "group", "gallery"];

const entity = {
  id: "5",
  instanceId: "inst-b",
  name: "Thing",
  title: "Thing",
  rating: 60,
  rating100: 60,
  favorite: false,
};

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  resetDetailPageMocks();
  cardSettings.current = { showFavorite: true, showRating: true };
  // A refused write is logged by the page
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanupDetailPage();
  consoleError.mockRestore();
});

/** Presses keys one after the other on the page; false when the page took one */
function press(...keys: string[]): boolean[] {
  return keys.map((key) => fireEvent.keyDown(document.body, { key }));
}

/**
 * Presses `r` until the page takes it, then the next key. The page registers
 * its hotkeys in an effect that runs after the render showing the entity, so
 * the slider can be on screen a moment before `r` is taken.
 */
async function pressOnceTaken(next?: string): Promise<void> {
  await waitFor(() => expect(press("r")[0]).toBe(false));
  if (next !== undefined) press(next);
}

describe.each(TYPES)("%s page writes", (type) => {
  const path = `/ratings/${type}/5`;
  const render = (options: { ratingAnswer?: number } = {}) =>
    renderDetailPage(type, `/${type}/5`, {
      entity,
      counts: "loading",
      ...options,
    });
  const slider = () => screen.findByRole("slider");
  const heart = (name: string) => screen.findByRole("button", { name });
  const written = (api: ReturnType<typeof render>["api"]) =>
    bodiesTo(path, api);

  it("sends the slider's rating on the entity's server and keeps it", async () => {
    const { api } = render();

    fireEvent.change(await slider(), { target: { value: "8" } });

    await waitFor(() => expect(written(api)).toHaveLength(1));
    expect(written(api)).toEqual([{ rating: 80, instanceId: "inst-b" }]);
    expect(await slider()).toHaveValue("8");
    expect(screen.getByText("8.0")).toBeVisible();
  });

  it("puts the old rating back when the server answers 500", async () => {
    const { api } = render({ ratingAnswer: 500 });

    fireEvent.change(await slider(), { target: { value: "8" } });

    await waitFor(() => expect(written(api)).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("slider")).toHaveValue("6"));
    expect(screen.getByText("6.0")).toBeVisible();
  });

  it("clears the rating with Clear", async () => {
    const { api } = render();

    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));

    await waitFor(() => expect(written(api)).toHaveLength(1));
    expect(written(api)).toEqual([{ rating: null, instanceId: "inst-b" }]);
    expect(screen.getByText("--")).toBeVisible();
  });

  it("sends the favorite on the entity's server and keeps it", async () => {
    const { api } = render();

    fireEvent.click(await heart("Add to favorites"));

    await waitFor(() => expect(written(api)).toHaveLength(1));
    expect(written(api)).toEqual([{ favorite: true, instanceId: "inst-b" }]);
    expect(await heart("Remove from favorites")).toBeVisible();
  });

  it("puts the old favorite back when the server answers 500", async () => {
    const { api } = render({ ratingAnswer: 500 });

    fireEvent.click(await heart("Add to favorites"));

    await waitFor(() => expect(written(api)).toHaveLength(1));
    expect(await heart("Add to favorites")).toBeVisible();
  });

  it("rates 80 with r then 4, once the entity is found", async () => {
    const { api } = render();
    await slider();

    await pressOnceTaken("4");

    await waitFor(() => expect(written(api)).toHaveLength(1));
    expect(written(api)).toEqual([{ rating: 80, instanceId: "inst-b" }]);
    await waitFor(() => expect(screen.getByRole("slider")).toHaveValue("8"));
  });

  it("toggles the favorite with r then f", async () => {
    const { api } = render();
    await slider();

    await pressOnceTaken("f");

    await waitFor(() => expect(written(api)).toHaveLength(1));
    expect(written(api)).toEqual([{ favorite: true, instanceId: "inst-b" }]);
    expect(await heart("Remove from favorites")).toBeVisible();
  });

  it("takes no hotkey while the lookup loads", async () => {
    const { api } = renderDetailPage(type, `/${type}/5`, {
      entity,
      lookup: "loading",
      counts: "loading",
    });
    await waitFor(() =>
      expect(
        requestsTo(
          api,
          `/library/${type === "gallery" ? "galleries" : `${type}s`}`
        )
      ).toHaveLength(1)
    );

    // `r` is not taken, so the page leaves it to the browser
    expect(press("r")[0]).toBe(true);
    press("4");

    expect(requestsTo(api, path)).toEqual([]);
  });

  it("registers no hotkeys on a not-found page", async () => {
    const { api } = renderDetailPage(type, `/${type}/5`, {
      entity,
      lookup: "notFound",
      counts: "loading",
    });
    await screen.findByRole("heading", { name: /not found/ });

    expect(press("r")[0]).toBe(true);
    press("4");

    expect(requestsTo(api, path)).toEqual([]);
  });

  it("takes the r key once the entity is found", async () => {
    render();
    await slider();

    await pressOnceTaken();
  });
});
