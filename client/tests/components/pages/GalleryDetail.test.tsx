/**
 * A gallery page's own parts on the shared layout: Play Slideshow, the
 * header's image count, and its Images tab, which is the Images list
 * (B-Q2 (a)): the viewer's rating reaches the tab's card, Back keeps the
 * open image, and the timeline counts the gallery's images only. The real
 * list page, query client and lightbox against a stubbed server; the wall
 * is a stub listing the rows it gets.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { jsonResponse, requestsTo } from "@tests/helpers/stubApi";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDetailPageMocks } from "./detail/detailPageMocks";
import {
  type Answer,
  type DetailPageOptions,
  cleanupDetailPage,
  currentSearch,
  goBack,
  navigateTo,
  renderDetailPage,
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
vi.mock("@/themes/useTheme", () =>
  import("./detail/detailPageMocks").then((m) => m.themeModule)
);
vi.mock("@/hooks/usePageTitle", () =>
  import("./detail/detailPageMocks").then((m) => m.pageTitleModule)
);
/** The wall: one button per row, showing the row's rating */
vi.mock("@/components/wall/WallView", () => ({
  default: ({
    items,
    onItemClick,
  }: {
    items: Record<string, unknown>[];
    onItemClick?: (item: Record<string, unknown>) => void;
  }) => (
    <div data-testid="wall-view">
      {items.map((item) => (
        <button
          key={`${String(item.id)}:${String(item.instanceId)}`}
          data-testid="wall-item"
          data-rating={String(item.rating100)}
          onClick={() => onItemClick?.(item)}
        >
          Open {String(item.title)}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("react-swipeable", () => ({ useSwipeable: () => ({}) }));

const INSTANCE = "inst-b";
const TOTAL = 30;
/** The Images list's page size with the server's default settings */
const PER_PAGE = 24;

const imageRow = (n: number) => ({
  id: `img-${n}`,
  instanceId: INSTANCE,
  title: `Image ${n}`,
  paths: {
    thumbnail: `/t${n}.jpg`,
    preview: `/p${n}.jpg`,
    image: `/i${n}.jpg`,
  },
  rating: null,
  rating100: null,
  favorite: false,
  oCounter: 0,
});

function jsonBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") throw new Error("No JSON body");
  return JSON.parse(init.body) as Record<string, unknown>;
}

/** The gallery's 30 images, a page of the request's size */
const imagesAnswer: Answer = (_url, init) => {
  const filter = jsonBody(init).filter as
    | { page?: number; per_page?: number }
    | undefined;
  const page = filter?.page ?? 1;
  const perPage = filter?.per_page ?? PER_PAGE;
  const images = [];
  const last = Math.min(page * perPage, TOTAL);
  for (let n = (page - 1) * perPage + 1; n <= last; n++) {
    images.push(imageRow(n));
  }
  return jsonResponse(200, { findImages: { images, count: TOTAL } });
};

/** The image rating write: answers the rating it got */
const imageRatingAnswer: Answer = (_url, init) => {
  const sent = jsonBody(init) as { rating?: number };
  return jsonResponse(200, {
    success: true,
    rating: {
      id: 1,
      instanceId: INSTANCE,
      rating: sent.rating ?? null,
      favorite: false,
    },
  });
};

const render = (url: string, options: DetailPageOptions = {}) =>
  renderDetailPage("gallery", url, {
    entity: { id: "5", instanceId: INSTANCE, title: "Beach Day" },
    counts: { images: TOTAL, scenes: 2 },
    ...options,
    routes: {
      "/library/images": imagesAnswer,
      "/ratings/image/img-1": imageRatingAnswer,
      "/user/permissions": () => jsonResponse(200, { permissions: {} }),
      "/image-view-history/view": () => jsonResponse(200, { success: true }),
      "/timeline/image/distribution": () =>
        jsonResponse(200, { distribution: [] }),
      ...options.routes,
    },
  });

const wallItems = () => screen.getAllByTestId("wall-item");
const viewer = () => screen.queryByRole("dialog", { name: "Image viewer" });

beforeEach(() => {
  resetDetailPageMocks();
});
afterEach(() => {
  cleanupDetailPage();
});

describe("gallery page", () => {
  it("Play Slideshow opens the viewer at the first image playing", async () => {
    render("/gallery/5");
    await waitFor(() => expect(wallItems().length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /Play Slideshow/ }));

    expect(
      await screen.findByRole("dialog", { name: "Image viewer" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pause slideshow")).toBeInTheDocument();
    await waitFor(() =>
      expect(currentSearch().image).toBe(`img-1:${INSTANCE}`)
    );
  });

  it("Play Slideshow from the Scenes tab opens the Images tab playing its first image", async () => {
    render("/gallery/5?tab=scenes");
    await screen.findByTestId("SceneSearch");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Play Slideshow/ })
      ).toBeEnabled()
    );

    fireEvent.click(screen.getByRole("button", { name: /Play Slideshow/ }));

    expect(
      await screen.findByRole("dialog", { name: "Image viewer" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pause slideshow")).toBeInTheDocument();
    expect(screen.queryByTestId("SceneSearch")).toBeNull();
    await waitFor(() =>
      expect(currentSearch().image).toBe(`img-1:${INSTANCE}`)
    );
  });

  it("the image count in the header is the images list's total", async () => {
    render("/gallery/5");

    expect(await screen.findByText(`${TOTAL} images`)).toBeVisible();
  });

  it("rating an image in the viewer shows the new rating on the tab's card after the viewer closes", async () => {
    const { api } = render("/gallery/5");
    await waitFor(() => expect(wallItems().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("Open Image 1"));
    await screen.findByRole("dialog", { name: "Image viewer" });

    // r then 4: four stars
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "r" });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "4" });
    await waitFor(() =>
      expect(requestsTo(api, "/ratings/image/img-1")).toHaveLength(1)
    );
    fireEvent.click(screen.getByLabelText("Close lightbox"));

    await waitFor(() => expect(viewer()).not.toBeInTheDocument());
    await waitFor(() => expect(must(wallItems()[0]).dataset.rating).toBe("80"));
    // The gallery itself kept no rating
    expect(requestsTo(api, "/ratings/gallery/5")).toEqual([]);
  });

  it("Back changing both the page and the image keeps the `image` param and opens that image", async () => {
    render(`/gallery/5?page=2&image=img-27:${INSTANCE}`);
    await waitFor(() => expect(wallItems()).toHaveLength(TOTAL - PER_PAGE));
    await screen.findByRole("dialog", { name: "Image viewer" });

    navigateTo(`/gallery/5?image=img-2:${INSTANCE}`);
    await waitFor(() => expect(wallItems()).toHaveLength(PER_PAGE));
    await waitFor(() =>
      expect(currentSearch().image).toBe(`img-2:${INSTANCE}`)
    );

    goBack();

    await waitFor(() => expect(wallItems()).toHaveLength(TOTAL - PER_PAGE));
    expect(currentSearch()).toMatchObject({
      page: "2",
      image: `img-27:${INSTANCE}`,
    });
    expect(viewer()).toBeInTheDocument();
  });

  it("the Images tab's timeline counts the gallery's images only", async () => {
    const { api } = render("/gallery/5?view=timeline");

    await waitFor(() =>
      expect(requestsTo(api, "/timeline/image/distribution")).not.toEqual([])
    );
    const asked = must(
      api.mock.calls
        .filter(
          ([url]) =>
            url.replace(/^\/api/, "") === "/timeline/image/distribution"
        )
        .at(-1),
      "the timeline request"
    );
    expect(asked[1]?.method).toBe("POST");
    expect(jsonBody(asked[1]).image_filter).toMatchObject({
      galleries: { value: [`5:${INSTANCE}`], modifier: "INCLUDES" },
    });
  });
});
