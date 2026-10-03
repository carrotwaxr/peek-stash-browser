/**
 * CarouselBuilder saves through the carousel mutation: the save marks the
 * carousel list and every carousel's scenes stale, so Home asks for them
 * again (an edited rule set shows its new scenes at once).
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import CarouselBuilder from "@/components/carousel-builder/CarouselBuilder";
import { jsonResponse, requestsTo, stubApi } from "../../helpers/stubApi";

const CAROUSEL = {
  id: "c1",
  userId: 1,
  title: "Highly rated",
  icon: "Film",
  rules: { rating100: { modifier: "BETWEEN", value: 80 } },
  sort: "random",
  direction: "DESC",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** The builder editing carousel c1 */
function renderEditor(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings/carousels/c1/edit"]}>
        <Routes>
          <Route
            path="/settings/carousels/:id/edit"
            element={<CarouselBuilder />}
          />
          <Route path="/settings" element={<div>Settings</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CarouselBuilder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("editing a carousel keeps a rule it cannot edit", async () => {
    const tags = { value: ["284"], modifier: "INCLUDES_ALL" };
    const stored = { ...CAROUSEL, rules: { tagged: true, tags } };
    const fetchMock = stubApi({
      "/carousels/c1": () => jsonResponse(200, { carousel: stored }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
      "/library/tags/minimal": () => jsonResponse(200, { tags: [] }),
    });
    renderEditor(createQueryClient());

    const title = await screen.findByDisplayValue("Highly rated");
    fireEvent.change(title, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    const update = await screen.findByRole("button", { name: /Update/ });
    await waitFor(() => expect(update).toBeEnabled());
    fireEvent.click(update);
    await screen.findByText("Settings");

    const bodyOf = (method: string) =>
      JSON.parse(
        fetchMock.mock.calls.find(([, init]) => init?.method === method)?.[1]
          ?.body as string
      ) as { rules: unknown; title?: string };
    const preview = fetchMock.mock.calls.find(([url]) =>
      url.includes("/carousels/preview")
    );
    expect(JSON.parse(preview?.[1]?.body as string)).toMatchObject({
      rules: { tagged: true, tags },
    });
    expect(bodyOf("PUT")).toMatchObject({
      title: "Renamed",
      rules: { tagged: true, tags },
    });
  });

  it("a rule it cannot edit shows on a line, and Remove drops it from the save", async () => {
    const stored = {
      ...CAROUSEL,
      rules: { ...CAROUSEL.rules, tagged: true, o_counter: { value: 1 } },
    };
    const fetchMock = stubApi({
      "/carousels/c1": () => jsonResponse(200, { carousel: stored }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
    });
    renderEditor(createQueryClient());

    await screen.findByDisplayValue("Highly rated");
    expect(
      screen.getByText("2 more rules this editor can't show")
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText(/more rules? this editor can't show/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    const update = await screen.findByRole("button", { name: /Update/ });
    await waitFor(() => expect(update).toBeEnabled());
    fireEvent.click(update);
    await screen.findByText("Settings");

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    const { rules } = JSON.parse(put?.[1]?.body as string) as {
      rules: Record<string, unknown>;
    };
    expect(Object.keys(rules)).toEqual(["rating100"]);
  });

  it("a rule added for a field it kept replaces the kept rule, on the line and in the save", async () => {
    const stored = {
      ...CAROUSEL,
      rules: { ...CAROUSEL.rules, tagged: true, o_counter: { value: 1 } },
    };
    const fetchMock = stubApi({
      "/carousels/c1": () => jsonResponse(200, { carousel: stored }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
    });
    renderEditor(createQueryClient());

    await screen.findByDisplayValue("Highly rated");
    expect(
      screen.getByText("2 more rules this editor can't show")
    ).toBeVisible();

    // A new rule, turned into O Count: the kept O Count is replaced
    fireEvent.click(screen.getByRole("button", { name: /Add Rule/ }));
    const filters = screen.getAllByRole("combobox", { name: "Filter" });
    fireEvent.change(must(filters.at(-1), "the new rule's filter"), {
      target: { value: "oCount" },
    });
    expect(
      screen.getByText("1 more rule this editor can't show")
    ).toBeVisible();
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Minimum O/ }), {
      target: { value: "3" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    const update = await screen.findByRole("button", { name: /Update/ });
    await waitFor(() => expect(update).toBeEnabled());
    fireEvent.click(update);
    await screen.findByText("Settings");

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    const { rules } = JSON.parse(put?.[1]?.body as string) as {
      rules: Record<string, unknown>;
    };
    expect(rules).toEqual({
      rating100: CAROUSEL.rules.rating100,
      tagged: true,
      o_counter: { modifier: "BETWEEN", value: 3 },
    });
  });

  it('a Rating Not rated rule saves rating100: { modifier: "IS_NULL" } and survives an edit', async () => {
    const stored = {
      ...CAROUSEL,
      rules: { rating100: { modifier: "IS_NULL" } },
    };
    const fetchMock = stubApi({
      "/carousels/c1": () => jsonResponse(200, { carousel: stored }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
    });
    renderEditor(createQueryClient());

    await screen.findByDisplayValue("Highly rated");
    // The stored rule reads as the Not rated choice, with no bounds to fill
    const condition = screen.getByRole("combobox", { name: "Condition" });
    expect(condition).toHaveDisplayValue("Not rated");
    expect(screen.queryByPlaceholderText("Min")).toBeNull();

    // Choosing Between brings the bounds back; Not rated hides them again
    fireEvent.change(condition, { target: { value: "BETWEEN" } });
    expect(screen.getByPlaceholderText("Min")).toBeVisible();
    fireEvent.change(condition, { target: { value: "IS_NULL" } });
    expect(screen.queryByPlaceholderText("Min")).toBeNull();

    fireEvent.change(await screen.findByDisplayValue("Highly rated"), {
      target: { value: "Renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    const update = await screen.findByRole("button", { name: /Update/ });
    await waitFor(() => expect(update).toBeEnabled());
    fireEvent.click(update);
    await screen.findByText("Settings");

    const sent = (match: (url: string, method?: string) => boolean) =>
      JSON.parse(
        fetchMock.mock.calls.find(([url, init]) =>
          match(url, init?.method)
        )?.[1]?.body as string
      ) as { rules: unknown };
    const stays = { rating100: { modifier: "IS_NULL" } };
    expect(sent((url) => url.includes("/carousels/preview")).rules).toEqual(
      stays
    );
    expect(sent((_url, method) => method === "PUT").rules).toEqual(stays);
  });

  it("saving an edited carousel makes Home ask for its scenes again", async () => {
    const fetchMock = stubApi({
      // The edit's read and its save
      "/carousels/c1": () => jsonResponse(200, { carousel: CAROUSEL }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
    });
    const client = createQueryClient();
    // What Home holds: the list and the carousel's scenes
    client.setQueryData(queryKeys.carousels.list(), { carousels: [CAROUSEL] });
    client.setQueryData(queryKeys.carousels.execute("c1"), { scenes: [] });

    renderEditor(client);

    await screen.findByDisplayValue("Highly rated");
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    await waitFor(() =>
      expect(requestsTo(fetchMock, "/carousels/preview")).toHaveLength(1)
    );
    const update = await screen.findByRole("button", { name: /Update/ });
    await waitFor(() => expect(update).toBeEnabled());
    expect(
      client.getQueryState(queryKeys.carousels.list())?.isInvalidated
    ).toBe(false);

    fireEvent.click(update);

    await screen.findByText("Settings");
    expect(
      client.getQueryState(queryKeys.carousels.execute("c1"))?.isInvalidated
    ).toBe(true);
    expect(
      client.getQueryState(queryKeys.carousels.list())?.isInvalidated
    ).toBe(true);
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(put?.[1]?.body as string)).toMatchObject({
      title: "Highly rated",
    });
  });
  it("a rule with Tags include A, exclude B saves `{ value: [A], excludes: [B] }` and survives an edit", async () => {
    const names = {
      tags: [
        { id: "5", instanceId: "a", name: "Tag A" },
        { id: "6", instanceId: "a", name: "Tag B" },
      ],
    };
    const save = async (rules: unknown) => {
      const stored = { ...CAROUSEL, rules };
      const fetchMock = stubApi({
        "/carousels/c1": () => jsonResponse(200, { carousel: stored }),
        "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
        "/library/tags/minimal": () => jsonResponse(200, names),
      });
      renderEditor(createQueryClient());
      await screen.findByDisplayValue("Highly rated");
      return fetchMock;
    };
    const update = async (fetchMock: ReturnType<typeof stubApi>) => {
      fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
      const button = await screen.findByRole("button", { name: /Update/ });
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      await screen.findByText("Settings");
      const put = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "PUT"
      );
      return (JSON.parse(put?.[1]?.body as string) as { rules: unknown }).rules;
    };

    // Both tags included: Tag B is turned into an exclusion
    const first = await save({
      tags: { value: ["5:a", "6:a"], modifier: "INCLUDES" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Exclude Tag B" })
    );
    const saved = await update(first);
    expect(saved).toEqual({
      tags: { value: ["5:a"], excludes: ["6:a"], modifier: "INCLUDES" },
    });
    cleanup();
    vi.unstubAllGlobals();

    // Read back, the rule is editable as it was saved, and saves the same
    const second = await save(saved);
    expect(
      await screen.findByRole("button", { name: "Exclude Tag B" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/more rules? this editor can't show/)).toBeNull();
    expect(await update(second)).toEqual(saved);
  });

  /** Opens the editor on a carousel with these rules; routes are the extra endpoints the rules' pickers ask */
  async function openWith(
    rules: unknown,
    routes: Record<string, () => Response> = {}
  ) {
    const stored = { ...CAROUSEL, rules };
    const fetchMock = stubApi({
      "/carousels/c1": () => jsonResponse(200, { carousel: stored }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
      ...routes,
    });
    renderEditor(createQueryClient());
    await screen.findByDisplayValue("Highly rated");
    return fetchMock;
  }

  /** Previews, saves and returns the rules the preview and the save sent */
  async function previewAndUpdate(fetchMock: ReturnType<typeof stubApi>) {
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    const button = await screen.findByRole("button", { name: /Update/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText("Settings");
    const rulesOf = (
      find: (url: string, method: string | undefined) => boolean
    ) =>
      (
        JSON.parse(
          fetchMock.mock.calls.find(([url, init]) =>
            find(url, init?.method)
          )?.[1]?.body as string
        ) as { rules: unknown }
      ).rules;
    return {
      previewed: rulesOf((url) => url.includes("/carousels/preview")),
      saved: rulesOf((_url, method) => method === "PUT"),
    };
  }

  it('a Studio Has none rule saves `studios: { modifier: "IS_NULL" }` and survives an edit', async () => {
    const fetchMock = await openWith({ studios: { modifier: "IS_NULL" } });

    // The stored rule reads as the Has none choice, with no picker to fill
    expect(
      screen.getByRole("combobox", { name: "Condition" })
    ).toHaveDisplayValue("Has none");
    expect(screen.queryByText("Value")).toBeNull();
    expect(screen.queryByText(/more rules? this editor can't show/)).toBeNull();

    const { previewed, saved } = await previewAndUpdate(fetchMock);
    expect(previewed).toEqual({ studios: { modifier: "IS_NULL" } });
    expect(saved).toEqual({ studios: { modifier: "IS_NULL" } });
  });

  it("a Playlists rule lists own and shared playlists and saves the playlist id", async () => {
    const fetchMock = await openWith(
      { playlists: { value: [12], modifier: "INCLUDES" } },
      {
        "/playlists": () =>
          jsonResponse(200, { playlists: [{ id: 12, name: "Road trip" }] }),
        "/playlists/shared": () =>
          jsonResponse(200, {
            playlists: [
              { id: 40, name: "Weekend", owner: { username: "alice" } },
            ],
          }),
      }
    );
    expect(screen.queryByText(/more rules? this editor can't show/)).toBeNull();

    // Own playlists first, then those shared with the user, named by owner
    fireEvent.click(await screen.findByRole("button", { name: /^Playlists/ }));
    expect(
      await screen.findByRole("button", { name: "Weekend by alice" })
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Weekend by alice" }));

    const { saved } = await previewAndUpdate(fetchMock);
    expect(saved).toEqual({
      playlists: { value: [12, 40], modifier: "INCLUDES" },
    });
  });

  it("a Path Starts with rule saves STARTS_WITH and survives an edit", async () => {
    const stored = { path: { value: "/media/new", modifier: "STARTS_WITH" } };
    const fetchMock = await openWith(stored);

    expect(
      screen.getByRole("combobox", { name: "Condition" })
    ).toHaveDisplayValue("Starts with");
    expect(screen.getByDisplayValue("/media/new")).toBeInTheDocument();
    expect(screen.queryByText(/more rules? this editor can't show/)).toBeNull();

    const { previewed, saved } = await previewAndUpdate(fetchMock);
    expect(previewed).toEqual(stored);
    expect(saved).toEqual(stored);
  });

  it("a three-state favourite and a multi Orientation rule survive an edit", async () => {
    const stored = {
      favorite: false,
      orientation: { value: ["LANDSCAPE", "SQUARE"] },
    };
    const fetchMock = await openWith(stored);

    expect(screen.queryByText(/more rules? this editor can't show/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Landscape$/ })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Portrait" })
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Square" })).toBeChecked();

    const { saved } = await previewAndUpdate(fetchMock);
    expect(saved).toEqual(stored);
  });
  describe("sort options follow the rules", () => {
    const PLAYLISTS = {
      "/playlists": () =>
        jsonResponse(200, { playlists: [{ id: 12, name: "Road trip" }] }),
      "/playlists/shared": () =>
        jsonResponse(200, {
          playlists: [
            { id: 40, name: "Weekend", owner: { username: "alice" } },
          ],
        }),
    };
    const COLLECTIONS = {
      "/library/groups/minimal": () =>
        jsonResponse(200, {
          groups: [{ id: "5", instanceId: "a", name: "Series" }],
        }),
    };
    const sortSelect = () => screen.getByRole("combobox", { name: "Sort By" });
    const sortLabels = () =>
      within(sortSelect())
        .getAllByRole("option")
        .map((option) => option.textContent);

    /** The builder on a new carousel */
    function renderNew() {
      render(
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={["/settings/carousels/new"]}>
            <Routes>
              <Route
                path="/settings/carousels/new"
                element={<CarouselBuilder />}
              />
              <Route path="/settings" element={<div>Settings</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    }

    it("Playlist order is offered with one playlist rule and saved", async () => {
      const fetchMock = stubApi({
        "/carousels": () => jsonResponse(200, { carousel: CAROUSEL }),
        "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
        ...PLAYLISTS,
      });
      renderNew();

      fireEvent.click(screen.getByRole("button", { name: /Add Rule/ }));
      fireEvent.change(screen.getByRole("combobox", { name: "Filter" }), {
        target: { value: "playlistIds" },
      });
      expect(sortLabels()).not.toContain("Playlist Order");
      fireEvent.click(
        await screen.findByRole("button", { name: /^Playlists/ })
      );
      fireEvent.click(await screen.findByRole("button", { name: "Road trip" }));

      expect(sortLabels()).toContain("Playlist Order");
      fireEvent.change(sortSelect(), {
        target: { value: "playlist_position" },
      });
      fireEvent.change(screen.getByPlaceholderText("My Custom Carousel"), {
        target: { value: "In order" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
      const save = await screen.findByRole("button", { name: /^Save/ });
      await waitFor(() => expect(save).toBeEnabled());
      fireEvent.click(save);
      await screen.findByText("Settings");

      const post = must(
        fetchMock.mock.calls.find(
          ([url, init]) =>
            init?.method === "POST" && !url.includes("/carousels/preview")
        )
      );
      expect(JSON.parse(post[1]?.body as string)).toMatchObject({
        sort: "playlist_position",
        rules: { playlists: { value: [12], modifier: "INCLUDES" } },
      });
      const preview = must(
        fetchMock.mock.calls.find(([url]) => url.includes("/carousels/preview"))
      );
      expect(JSON.parse(preview[1]?.body as string)).toMatchObject({
        sort: "playlist_position",
      });
    });

    it("Playlist order is not offered with two playlists or none", async () => {
      await openWith(
        { playlists: { value: [12, 40], modifier: "INCLUDES" } },
        PLAYLISTS
      );
      expect(sortLabels()).not.toContain("Playlist Order");
      cleanup();
      vi.unstubAllGlobals();

      await openWith({ rating100: { modifier: "GREATER_THAN", value: 50 } });
      expect(sortLabels()).not.toContain("Playlist Order");
    });

    it("Scene Number is offered only with a collection rule", async () => {
      await openWith({ rating100: { modifier: "GREATER_THAN", value: 50 } });
      expect(sortLabels()).not.toContain("Scene Number");
      cleanup();
      vi.unstubAllGlobals();

      await openWith(
        { groups: { value: ["5:a"], modifier: "INCLUDES" } },
        COLLECTIONS
      );
      expect(sortLabels()).toContain("Scene Number");
    });

    it("removing the rule a sort needs puts the sort back to Random and says so", async () => {
      const fetchMock = stubApi({
        "/carousels/c1": () =>
          jsonResponse(200, {
            carousel: {
              ...CAROUSEL,
              rules: { playlists: { value: [12], modifier: "INCLUDES" } },
              sort: "playlist_position",
            },
          }),
        "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
        ...PLAYLISTS,
      });
      renderEditor(createQueryClient());
      await screen.findByDisplayValue("Highly rated");
      expect(sortSelect()).toHaveDisplayValue("Playlist Order");
      expect(screen.queryByText(/sorted by Random/)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Remove rule" }));

      expect(sortSelect()).toHaveDisplayValue("Random");
      expect(
        screen.getByText(
          "Playlist order needs one playlist rule; sorted by Random"
        )
      ).toBeVisible();

      // A new rule of another field is previewed and saved with Random
      fireEvent.click(screen.getByRole("button", { name: /Add Rule/ }));
      fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
      await waitFor(() =>
        expect(requestsTo(fetchMock, "/carousels/preview")).toHaveLength(1)
      );
      const preview = must(
        fetchMock.mock.calls.find(([url]) => url.includes("/carousels/preview"))
      );
      expect(JSON.parse(preview[1]?.body as string)).toMatchObject({
        sort: "random",
      });
    });

    it("editing a stored carousel sorted by Playlist order keeps the sort", async () => {
      const stored = {
        ...CAROUSEL,
        rules: { playlists: { value: [12], modifier: "INCLUDES" } },
        sort: "playlist_position",
      };
      const fetchMock = stubApi({
        "/carousels/c1": () => jsonResponse(200, { carousel: stored }),
        "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
        ...PLAYLISTS,
      });
      renderEditor(createQueryClient());
      await screen.findByDisplayValue("Highly rated");
      expect(sortSelect()).toHaveDisplayValue("Playlist Order");
      expect(screen.queryByText(/sorted by Random/)).toBeNull();

      const { saved } = await previewAndUpdate(fetchMock);
      expect(saved).toEqual(stored.rules);
      const put = must(
        fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")
      );
      expect(JSON.parse(put[1]?.body as string)).toMatchObject({
        sort: "playlist_position",
      });
    });
  });
});
