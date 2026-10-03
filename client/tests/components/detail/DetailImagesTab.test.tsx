/**
 * A detail page's Images tab is the Images list locked to its entity: the
 * real list page, query client and lightbox against a stubbed server (the
 * images list, the presets, the settings and the rating write). The image
 * card is a stub showing the row it gets, so a case reads what the cached
 * page holds.
 */
import { createRef } from "react";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type ApiStub,
  jsonResponse,
  requestsTo,
  stubApi,
} from "@tests/helpers/stubApi";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { must, renderListPage } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DetailImagesTab, {
  type DetailImagesLightbox,
} from "@/components/detail/DetailImagesTab";
import type * as toastModule from "@/utils/toast";
import { showError, showInfo } from "@/utils/toast";

interface CardProps {
  image: Record<string, unknown>;
  onClick?: (image: Record<string, unknown>) => void;
}

/** A card stub: the image's key and rating, and a click that opens it */
vi.mock("@/components/cards/index", () => ({
  ImageCard: ({ image, onClick }: CardProps) => (
    <div
      data-testid="image-card"
      data-key={`${String(image.id)}:${String(image.instanceId)}`}
      data-rating={String(image.rating100)}
    >
      <button onClick={() => onClick?.(image)}>
        Open {String(image.title)}
      </button>
    </div>
  ),
}));
vi.mock("@/components/wall/WallView", () => ({
  default: (props: {
    items: Record<string, unknown>[];
    onItemClick?: (item: Record<string, unknown>) => void;
  }) => <div data-testid="wall-view" data-count={props.items.length} />,
}));
// The dropped-image note
vi.mock("@/utils/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof toastModule>()),
  showError: vi.fn(),
  showInfo: vi.fn(),
}));
vi.mock("react-swipeable", () => ({ useSwipeable: () => ({}) }));

const TOTAL = 30;
/** The library's images: those after the tab's 30 are not in the tab */
const LIBRARY = 40;
const PER_PAGE = 24;
const INSTANCE = "inst-a";

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
  performers: [],
  tags: [],
  urls: [],
});

/** A request's JSON body */
function jsonBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") throw new Error("No JSON body");
  return JSON.parse(init.body) as Record<string, unknown>;
}

/** The JSON body of each request to `path`, in order */
function bodiesTo(api: ApiStub, path: string): Record<string, unknown>[] {
  return api.mock.calls
    .filter(([url]) => url.replace(/^\/api/, "").split("?")[0] === path)
    .map(([, init]) => jsonBody(init));
}

const lastImagesBody = (api: ApiStub) =>
  must(bodiesTo(api, "/library/images").at(-1), "an images request");

const DATE_PRESET = {
  id: "preset-date",
  name: "By date",
  filters: {},
  sort: "date",
  direction: "DESC",
  viewMode: "grid",
  zoomLevel: "medium",
  gridDensity: "medium",
  perPage: 24,
  tableColumns: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

interface Setup {
  presets?: Record<string, unknown[]>;
  defaults?: Record<string, string>;
  userSettings?: Parameters<typeof userSettingsResponse>[0];
}

/** The server: 30 images, 24 a page; the rating write answers what it got */
function stubServer({ presets = {}, defaults = {} }: Setup = {}): ApiStub {
  return stubApi({
    "/library/images": (_url, init) => {
      // A read by id: the images that exist among them, within the tab's
      // tag when the read names it
      const ids = jsonBody(init).ids as string[] | undefined;
      if (ids) {
        const imageFilter = jsonBody(init).image_filter as
          | { tags?: unknown }
          | undefined;
        const last = imageFilter?.tags === undefined ? LIBRARY : TOTAL;
        // An id that is not one is refused, as the server's parser does
        if (ids.some((id) => !/^img-\d+$/.test(id))) {
          return jsonResponse(400, { error: "Invalid request" });
        }
        const found = ids
          .map((id) => Number(id.replace(/^img-/, "")))
          .filter((n) => n >= 1 && n <= last)
          .map(imageRow);
        return jsonResponse(200, {
          findImages: { images: found, count: found.length },
        });
      }
      const filter = jsonBody(init).filter as
        | { page?: number; per_page?: number }
        | undefined;
      const page = filter?.page ?? 1;
      const perPage = filter?.per_page ?? PER_PAGE;
      const first = (page - 1) * perPage + 1;
      const last = Math.min(page * perPage, TOTAL);
      const images = [];
      for (let n = first; n <= last; n++) images.push(imageRow(n));
      return jsonResponse(200, { findImages: { images, count: TOTAL } });
    },
    "/library/ready": () => jsonResponse(200, { ready: true }),
    "/user/filter-presets": () => jsonResponse(200, { presets }),
    "/user/default-presets": () => jsonResponse(200, { defaults }),
    "/user/settings": () => jsonResponse(200, userSettingsResponse({})),
    "/user/permissions": () => jsonResponse(200, { permissions: {} }),
    "/image-view-history/view": () => jsonResponse(200, { success: true }),
    "/image-view-history/increment-o": () =>
      jsonResponse(200, { success: true, oCount: 1 }),
    "/ratings/image/img-27": (_url, init) => {
      const sent = jsonBody(init) as { rating?: number };
      return jsonResponse(200, {
        success: true,
        rating: {
          id: 27,
          instanceId: INSTANCE,
          rating: sent.rating ?? null,
          favorite: false,
        },
      });
    },
    "/ratings/image/img-1": (_url, init) => {
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
    },
  });
}

const tagTab = (
  initialEntries = [`/tag/5?tab=images&includeSubTags=true`],
  setup: Setup = {}
) => {
  const api = stubServer(setup);
  const rendered = renderListPage(
    <DetailImagesTab
      field="tags"
      entityRef={`5:${INSTANCE}`}
      depth={-1}
      emptyMessage="No images for this tag"
    />,
    {
      initialEntries,
      ...(setup.presets ? { presets: setup.presets as never } : {}),
      ...(setup.defaults ? { defaultPresets: setup.defaults } : {}),
      ...(setup.userSettings ? { userSettings: setup.userSettings } : {}),
    }
  );
  return { api, ...rendered };
};

const search = (router: { state: { location: { search: string } } }) =>
  Object.fromEntries(new URLSearchParams(router.state.location.search));

const cards = () => screen.getAllByTestId("image-card");

describe("DetailImagesTab", () => {
  beforeEach(() => {
    vi.mocked(showInfo).mockClear();
    vi.mocked(showError).mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a tag's images tab asks for image_filter.tags with the ref and depth -1 under Include sub-tags, title ascending", async () => {
    const { api } = tagTab();

    await waitFor(() => expect(cards()).toHaveLength(PER_PAGE));
    expect(lastImagesBody(api)).toMatchObject({
      filter: { page: 1, per_page: PER_PAGE, sort: "title", direction: "ASC" },
      image_filter: {
        tags: { value: [`5:${INSTANCE}`], modifier: "INCLUDES", depth: -1 },
      },
    });
  });

  it("a page change keeps `tab` and `includeSubTags` in the URL", async () => {
    const { api, router } = tagTab();
    await waitFor(() => expect(cards()).toHaveLength(PER_PAGE));

    fireEvent.click(must(screen.getAllByLabelText("Next Page")[0]));

    await waitFor(() => expect(cards()).toHaveLength(TOTAL - PER_PAGE));
    expect(search(router)).toMatchObject({
      tab: "images",
      includeSubTags: "true",
      page: "2",
    });
    expect(lastImagesBody(api)).toMatchObject({ filter: { page: 2 } });
  });

  it("a card click opens the viewer, and the `image` param names the image's ref", async () => {
    const { router } = tagTab();
    await waitFor(() => expect(cards()).toHaveLength(PER_PAGE));

    fireEvent.click(screen.getByText("Open Image 3"));

    expect(
      await screen.findByRole("dialog", { name: "Image viewer" })
    ).toBeInTheDocument();
    expect(search(router)).toMatchObject({
      tab: "images",
      image: `img-3:${INSTANCE}`,
    });
  });

  it("the tab's locked field is offered in the filter panel (FILTERS-12) and the lock shows no chip", async () => {
    tagTab();
    await waitFor(() => expect(cards()).toHaveLength(PER_PAGE));

    expect(screen.queryByText(/^Tag:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Remove filter/)).not.toBeInTheDocument();

    await userEvent
      .setup()
      .click(
        must(screen.getByText("Filters").closest("button"), "Filters button")
      );
    expect(
      await screen.findByText("Performers", { selector: "label" })
    ).toBeInTheDocument();
    // A Tags row narrows the page's tag: both apply
    expect(screen.getByText("Tags", { selector: "label" })).toBeInTheDocument();
  });

  it("a default Images-page preset does not apply on a detail Images tab", async () => {
    const { api } = tagTab(undefined, {
      presets: { image: [DATE_PRESET] },
      defaults: { image: DATE_PRESET.id },
    });

    await waitFor(() => expect(cards()).toHaveLength(PER_PAGE));
    expect(lastImagesBody(api)).toMatchObject({
      filter: { sort: "title", direction: "ASC" },
    });
    expect(
      bodiesTo(api, "/library/images").some(
        (body) => (body.filter as { sort?: string }).sort === "date"
      )
    ).toBe(false);
  });

  it("an `image` param for an image beyond the loaded page opens the viewer on that image alone after one by-id read", async () => {
    const { api, router } = tagTab([
      `/tag/5?tab=images&image=img-27:${INSTANCE}`,
    ]);

    const viewer = await screen.findByRole("dialog", { name: "Image viewer" });
    expect(within(viewer).getByAltText("Image 27")).toBeInTheDocument();
    expect(within(viewer).getByText("1 / 1")).toBeInTheDocument();
    const byId = bodiesTo(api, "/library/images").filter((body) => body.ids);
    expect(byId).toEqual([
      {
        ids: ["img-27"],
        image_filter: {
          tags: { value: [`5:${INSTANCE}`], modifier: "INCLUDES", depth: -1 },
          instance_id: INSTANCE,
        },
      },
    ]);
    expect(search(router)).toMatchObject({
      tab: "images",
      image: `img-27:${INSTANCE}`,
    });
    expect(showInfo).not.toHaveBeenCalled();
  });

  it("an `image` param for an image outside the tab's entity is dropped and says it is no longer available", async () => {
    const { api, router } = tagTab([
      `/tag/5?tab=images&image=img-35:${INSTANCE}`,
    ]);

    await waitFor(() => expect(search(router).image).toBeUndefined());
    expect(search(router)).toMatchObject({ tab: "images" });
    expect(showError).toHaveBeenCalledWith("That image is no longer available");
    expect(
      screen.queryByRole("dialog", { name: "Image viewer" })
    ).not.toBeInTheDocument();
    const byId = bodiesTo(api, "/library/images").filter((body) => body.ids);
    expect(byId).toEqual([
      {
        ids: ["img-35"],
        image_filter: {
          tags: { value: [`5:${INSTANCE}`], modifier: "INCLUDES", depth: -1 },
          instance_id: INSTANCE,
        },
      },
    ]);
  });

  it.each([
    ["the server does not have", `img-99:${INSTANCE}`],
    ["the server refuses the id of", `not-an-id:${INSTANCE}`],
  ])(
    "an `image` param for an image %s is dropped and says it is no longer available",
    async (_case, key) => {
      const { router } = tagTab([`/tag/5?tab=images&image=${key}`]);

      await waitFor(() => expect(search(router).image).toBeUndefined());
      expect(search(router)).toMatchObject({ tab: "images" });
      expect(showError).toHaveBeenCalledWith(
        "That image is no longer available"
      );
      expect(
        screen.queryByRole("dialog", { name: "Image viewer" })
      ).not.toBeInTheDocument();
    }
  );

  it("an image opened alone by its address keeps its new rating after an O press", async () => {
    const { api } = tagTab([`/tag/5?tab=images&image=img-27:${INSTANCE}`]);
    const viewer = await screen.findByRole("dialog", { name: "Image viewer" });
    expect(within(viewer).getByAltText("Image 27")).toBeInTheDocument();

    // r then 4: four stars
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "r" });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "4" });
    await waitFor(() =>
      expect(requestsTo(api, "/ratings/image/img-27")).toHaveLength(1)
    );
    // The details drawer: its rating badge and O button
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "i" });
    await screen.findByLabelText("Rating: 8.0");

    fireEvent.click(
      await screen.findByLabelText("Increment O counter (current: 0)")
    );
    await waitFor(() =>
      expect(requestsTo(api, "/image-view-history/increment-o")).toHaveLength(1)
    );
    await screen.findByLabelText("Increment O counter (current: 1)");
    expect(screen.getByLabelText("Rating: 8.0")).toBeInTheDocument();
  });

  it("an image opened alone by its address keeps its new rating after a double tap's O", async () => {
    const { api } = tagTab([`/tag/5?tab=images&image=img-27:${INSTANCE}`], {
      userSettings: { lightboxDoubleTapAction: "o_counter" },
    });
    const viewer = await screen.findByRole("dialog", { name: "Image viewer" });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "r" });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "4" });
    await waitFor(() =>
      expect(requestsTo(api, "/ratings/image/img-27")).toHaveLength(1)
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "i" });
    await screen.findByLabelText("Rating: 8.0");

    fireEvent.doubleClick(within(viewer).getByAltText("Image 27"), {
      clientX: window.innerWidth / 2,
    });
    await waitFor(() =>
      expect(requestsTo(api, "/image-view-history/increment-o")).toHaveLength(1)
    );
    await screen.findByLabelText("Increment O counter (current: 1)");
    expect(screen.getByLabelText("Rating: 8.0")).toBeInTheDocument();
  });

  it("in table view an image's links keep the tab's list state and add the image; a click opens it there", async () => {
    const { router } = tagTab([
      `/tag/5?tab=images&includeSubTags=true&view=table&page=2&sort=title&dir=ASC`,
    ]);
    // The title and the thumbnail both link to it
    const links = await screen.findAllByRole("link", { name: "Image 25" });
    expect(links).toHaveLength(2);
    const title = must(links[0]);
    const href = new URL(must(title.getAttribute("href")), "http://x");
    expect(href.pathname).toBe("/tag/5");
    expect(Object.fromEntries(href.searchParams)).toEqual({
      tab: "images",
      includeSubTags: "true",
      view: "table",
      page: "2",
      sort: "title",
      dir: "ASC",
      image: `img-25:${INSTANCE}`,
    });
    expect(must(links[1]).getAttribute("href")).toBe(
      title.getAttribute("href")
    );

    fireEvent.click(title);

    const viewer = await screen.findByRole("dialog", { name: "Image viewer" });
    expect(within(viewer).getByText("25 / 30")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/tag/5");
    expect(search(router)).toMatchObject({
      page: "2",
      sort: "title",
      image: `img-25:${INSTANCE}`,
    });
  });

  it("rating an image in the viewer shows the new rating on the tab's card after the viewer closes", async () => {
    const { api } = tagTab();
    await waitFor(() => expect(cards()).toHaveLength(PER_PAGE));
    fireEvent.click(screen.getByText("Open Image 1"));
    await screen.findByRole("dialog", { name: "Image viewer" });

    // r then 4: four stars
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "r" });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "4" });
    await waitFor(() =>
      expect(requestsTo(api, "/ratings/image/img-1")).toHaveLength(1)
    );
    fireEvent.click(screen.getByLabelText("Close lightbox"));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Image viewer" })
      ).not.toBeInTheDocument()
    );
    await waitFor(() => expect(must(cards()[0]).dataset.rating).toBe("80"));
  });

  it("Back changing both the page and the image keeps the `image` param and opens that image", async () => {
    const { router } = tagTab([
      `/tag/5?tab=images&page=2&image=img-27:${INSTANCE}`,
      `/tag/5?tab=images&image=img-2:${INSTANCE}`,
    ]);
    await waitFor(() => expect(cards()).toHaveLength(PER_PAGE));
    await screen.findByRole("dialog", { name: "Image viewer" });
    await waitFor(() => expect(search(router).image).toBe(`img-2:${INSTANCE}`));

    await act(() => router.navigate(-1));

    await waitFor(() => expect(cards()).toHaveLength(TOTAL - PER_PAGE));
    expect(search(router)).toMatchObject({
      page: "2",
      image: `img-27:${INSTANCE}`,
    });
    expect(
      screen.getByRole("dialog", { name: "Image viewer" })
    ).toBeInTheDocument();
    expect(showInfo).not.toHaveBeenCalled();
  });

  it("a gallery's tab keeps file order and the wall, and the host's opener starts the slideshow at the first image", async () => {
    const api = stubServer();
    const lightbox = createRef<DetailImagesLightbox>();
    renderListPage(
      <DetailImagesTab
        field="galleries"
        entityRef={`9:${INSTANCE}`}
        emptyMessage="No images in this gallery"
        defaultSort="path"
        defaultView="wall"
        lightboxRef={lightbox}
      />,
      { initialEntries: ["/gallery/9"] }
    );

    await waitFor(() =>
      expect(screen.getByTestId("wall-view").dataset.count).toBe(
        String(PER_PAGE)
      )
    );
    expect(lastImagesBody(api)).toMatchObject({
      filter: { sort: "path", direction: "ASC" },
      image_filter: {
        galleries: { value: [`9:${INSTANCE}`], modifier: "INCLUDES" },
      },
    });

    act(() => must(lightbox.current, "the opener").open(0, true));

    expect(
      await screen.findByRole("dialog", { name: "Image viewer" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pause slideshow")).toBeInTheDocument();
  });
});
