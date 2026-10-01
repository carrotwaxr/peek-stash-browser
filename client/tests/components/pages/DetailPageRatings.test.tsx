/**
 * A detail page rates, favorites, counts its tabs and reads its gallery's
 * images on the loaded entity's own instance, not on the URL's `instance`
 * parameter: a bare-id link carries none.
 */
import { act, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDetailPageMocks } from "./detail/detailPageMocks";
import {
  type DetailType,
  bodiesTo,
  lastBody,
  renderDetailPage,
  requestsTo,
} from "./detail/renderDetailPage";

interface HotkeyOptions {
  enabled?: boolean;
  setRating: (rating: number | null) => void;
  toggleFavorite: () => void;
}

const { hotkeys } = vi.hoisted(() => ({
  hotkeys: vi.fn<(options: HotkeyOptions) => void>(),
}));

vi.mock("@/hooks/useRatingHotkeys", () => ({ useRatingHotkeys: hotkeys }));
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

const PAGES: [DetailType, string][] = [
  ["performer", "performers"],
  ["studio", "studios"],
  ["tag", "tags"],
  ["group", "groups"],
  ["gallery", "galleries"],
];

/** The galleries criterion's values of an images request */
const galleriesOf = (body: Record<string, unknown>) =>
  (
    (body.image_filter as Record<string, unknown>).galleries as {
      value: string[];
    }
  ).value;

describe.each(PAGES)("%s page rating", (type, plural) => {
  beforeEach(() => {
    resetDetailPageMocks();
    hotkeys.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderPage(search: string) {
    return renderDetailPage(type, `/${type}/5${search}`, {
      entity: {
        id: "5",
        instanceId: "inst-b",
        name: "Thing",
        title: "Thing",
        images: [],
      },
      // No tab opens, as before the counts answer
      counts: "loading",
    });
  }

  // The page's own hotkeys are the enabled ones (a gallery's closed lightbox registers a disabled set)
  const latestHotkeys = () =>
    must(
      hotkeys.mock.calls.filter(([options]) => options.enabled).at(-1),
      "the page's rating hotkeys"
    )[0];

  const ratingPath = `/ratings/${type}/5`;

  it.each([
    ["a bare-id link", ""],
    ["a link naming another server", "?instance=inst-a"],
  ])(
    "rates and favorites on the entity's own server from %s",
    async (_n, s) => {
      const { api } = renderPage(s);

      const keys = await waitFor(() => latestHotkeys());
      act(() => {
        keys.setRating(80);
      });
      await waitFor(() =>
        expect(requestsTo(api, ratingPath)).toEqual([`/api${ratingPath}`])
      );
      expect(lastBody(ratingPath)).toEqual({
        rating: 80,
        instanceId: "inst-b",
      });
      const rated = must(
        api.mock.calls.find(([url]) => url === `/api${ratingPath}`),
        "the rating request"
      );
      expect(rated[1]?.method).toBe("PUT");

      act(() => {
        latestHotkeys().toggleFavorite();
      });
      await waitFor(() => expect(requestsTo(api, ratingPath)).toHaveLength(2));
      expect(lastBody(ratingPath)).toEqual({
        favorite: true,
        instanceId: "inst-b",
      });
    }
  );

  it.each([
    ["a bare-id link", ""],
    ["a link naming another server", "?instance=inst-a"],
  ])("counts its tabs on the entity's own server from %s", async (_n, s) => {
    const { api } = renderPage(s);

    await waitFor(() =>
      expect(requestsTo(api, `/library/${plural}/5/counts`)).toEqual([
        `/api/library/${plural}/5/counts?instanceId=inst-b`,
      ])
    );
    // A gallery's images come from its own server too
    await waitFor(() =>
      expect(bodiesTo("/library/images").map(galleriesOf)).toEqual(
        type === "gallery" ? [["5:inst-b"]] : []
      )
    );
  });
});
