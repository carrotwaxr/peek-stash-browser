/**
 * CarouselBuilder saves through the carousel mutation: the save marks the
 * carousel list and every carousel's scenes stale, so Home asks for them
 * again (an edited rule set shows its new scenes at once).
 */
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
/** The settings page as the builder leaves to it: names the tab it lands on */
function SettingsProbe() {
  const { search } = useLocation();
  return <div>Settings {new URLSearchParams(search).get("tab")}</div>;
}

function renderEditor(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings/carousels/c1/edit"]}>
        <Routes>
          <Route
            path="/settings/carousels/:id/edit"
            element={<CarouselBuilder />}
          />
          <Route path="/settings" element={<SettingsProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The builder on a new carousel */
function renderNew() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/settings/carousels/new"]}>
        <Routes>
          <Route path="/settings/carousels/new" element={<CarouselBuilder />} />
          <Route path="/settings" element={<SettingsProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Adds a row of `key` in a container's waiting row; focus goes to its value */
const addRow = (container: string, key: string) => {
  fireEvent.change(
    screen.getByRole("combobox", { name: `Add a filter to ${container}` }),
    { target: { value: key } }
  );
};

/** Sets the focused value control (a choice row's select, a text box) */
const setFocused = (value: string) => {
  const control = document.activeElement;
  if (
    !(control instanceof HTMLSelectElement) &&
    !(control instanceof HTMLInputElement)
  ) {
    throw new Error("focus is not on a value control");
  }
  fireEvent.change(control, { target: { value } });
};

/** The field selects' values in `scope`, in order, outside any group when `rootOnly` */
const fieldsIn = (scope: HTMLElement, rootOnly = false) =>
  within(scope)
    .queryAllByRole("combobox", { name: "Filter" })
    .filter((select) => !rootOnly || select.closest('[role="group"]') === null)
    .map((select) => (select as HTMLSelectElement).value);

/** What a kept row reads */
const KEPT = "A rule this editor can't show";

/** A flat rule set as the root "all" tree the builder saves it as */
const rootAll = (flat: Record<string, unknown>) => ({
  match: "all",
  rules: Object.entries(flat).map(([field, criterion]) => ({
    field,
    criterion,
  })),
});
const leaf = (field: string, criterion: unknown) => ({ field, criterion });

/** The row waiting at the end of the rules, whose field select adds a rule */
const waitingRow = () =>
  screen.getByRole("combobox", { name: "Add a filter to top level" });

describe("CarouselBuilder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    await screen.findByText(/^Settings/);

    const sent = (match: (url: string, method?: string) => boolean) =>
      JSON.parse(
        fetchMock.mock.calls.find(([url, init]) =>
          match(url, init?.method)
        )?.[1]?.body as string
      ) as { rules: unknown };
    const stays = rootAll({ rating100: { modifier: "IS_NULL" } });
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

    await screen.findByText(/^Settings/);
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
      await screen.findByText(/^Settings/);
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
    expect(saved).toEqual(
      rootAll({
        tags: { value: ["5:a"], excludes: ["6:a"], modifier: "INCLUDES" },
      })
    );
    cleanup();
    vi.unstubAllGlobals();

    // Read back, the rule is editable as it was saved, and saves the same
    const second = await save(saved);
    expect(
      await screen.findByRole("button", { name: "Exclude Tag B" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(KEPT)).toBeNull();
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
    await screen.findByText(/^Settings/);
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
    expect(screen.queryByText(KEPT)).toBeNull();

    const { previewed, saved } = await previewAndUpdate(fetchMock);
    expect(previewed).toEqual(rootAll({ studios: { modifier: "IS_NULL" } }));
    expect(saved).toEqual(rootAll({ studios: { modifier: "IS_NULL" } }));
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
    expect(screen.queryByText(KEPT)).toBeNull();

    // Own playlists first, then those shared with the user, named by owner
    fireEvent.click(await screen.findByRole("button", { name: /^Playlists/ }));
    expect(
      await screen.findByRole("button", { name: "Weekend by alice" })
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Weekend by alice" }));

    const { saved } = await previewAndUpdate(fetchMock);
    expect(saved).toEqual(
      rootAll({ playlists: { value: [12, 40], modifier: "INCLUDES" } })
    );
  });

  it("a Path Starts with rule saves STARTS_WITH and survives an edit", async () => {
    const stored = { path: { value: "/media/new", modifier: "STARTS_WITH" } };
    const fetchMock = await openWith(stored);

    expect(
      screen.getByRole("combobox", { name: "Condition" })
    ).toHaveDisplayValue("Starts with");
    expect(screen.getByDisplayValue("/media/new")).toBeInTheDocument();
    expect(screen.queryByText(KEPT)).toBeNull();

    const { previewed, saved } = await previewAndUpdate(fetchMock);
    expect(previewed).toEqual(rootAll(stored));
    expect(saved).toEqual(rootAll(stored));
  });

  it("a three-state favourite and a multi Orientation rule survive an edit", async () => {
    const stored = {
      favorite: false,
      orientation: { value: ["LANDSCAPE", "SQUARE"] },
    };
    const fetchMock = await openWith(stored);

    expect(screen.queryByText(KEPT)).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Landscape$/ })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Portrait" })
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Square" })).toBeChecked();

    const { saved } = await previewAndUpdate(fetchMock);
    expect(saved).toEqual(rootAll(stored));
  });
  /** Previews and saves a new carousel; returns the body the save posted */
  async function previewAndSaveNew(fetchMock: ReturnType<typeof stubApi>) {
    fireEvent.change(screen.getByPlaceholderText("My Custom Carousel"), {
      target: { value: "Favourites of any kind" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    const save = await screen.findByRole("button", { name: /^Save/ });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await screen.findByText(/^Settings/);
    const post = must(
      fetchMock.mock.calls.find(
        ([url, init]) =>
          init?.method === "POST" && !url.includes("/carousels/preview")
      )
    );
    return JSON.parse(post[1]?.body as string) as { rules: unknown };
  }

  it("a carousel with a Match any group saves it and reads it back", async () => {
    const fetchMock = stubApi({
      "/carousels": () => jsonResponse(200, { carousel: CAROUSEL }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
    });
    renderNew();

    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    const group = screen.getByRole("group", { name: "Group 1" });
    fireEvent.change(
      within(group).getByRole("combobox", { name: "Match for Group 1" }),
      { target: { value: "any" } }
    );
    addRow("Group 1", "tagFavorite");
    setFocused("true");
    addRow("Group 1", "performerFavorite");
    setFocused("true");
    addRow("top level", "watched");
    setFocused("false");

    const { rules } = await previewAndSaveNew(fetchMock);
    // Root leaves first, then the group; rows in the scene table's order
    const saved = {
      match: "all",
      rules: [
        leaf("watched", false),
        {
          match: "any",
          rules: [leaf("performer_favorite", true), leaf("tag_favorite", true)],
        },
      ],
    };
    expect(rules).toEqual(saved);
    const preview = must(
      fetchMock.mock.calls.find(([url]) => url.includes("/carousels/preview"))
    );
    expect(JSON.parse(preview[1]?.body as string)).toMatchObject({
      rules: saved,
    });
    cleanup();
    vi.unstubAllGlobals();

    // Loaded again: the same rows and group
    await openWith(saved);
    expect(fieldsIn(document.body, true)).toEqual(["watched"]);
    const loaded = screen.getByRole("group", { name: "Group 1" });
    expect(
      within(loaded).getByRole("combobox", { name: "Match for Group 1" })
    ).toHaveValue("any");
    expect(fieldsIn(loaded)).toEqual(["performerFavorite", "tagFavorite"]);
    expect(
      screen.getByRole("combobox", { name: "Match for top level" })
    ).toHaveValue("all");
  });

  it("item 64: two Tags rows in one group save and survive an edit", async () => {
    const TAGS = {
      "/library/tags/minimal": () =>
        jsonResponse(200, {
          tags: ["A", "B", "C", "D"].map((name, at) => ({
            id: String(at + 1),
            instanceId: "a",
            name: `Tag ${name}`,
          })),
        }),
    };
    const stored = {
      match: "all",
      rules: [
        {
          match: "all",
          rules: [
            leaf("tags", { value: ["1:a", "2:a"], modifier: "INCLUDES_ALL" }),
            leaf("tags", { value: ["3:a", "4:a"], modifier: "INCLUDES" }),
          ],
        },
      ],
    };
    const fetchMock = await openWith(stored, TAGS);

    const group = screen.getByRole("group", { name: "Group 1" });
    expect(fieldsIn(group)).toEqual(["tagIds", "tagIds"]);
    expect(screen.queryByText(KEPT)).toBeNull();
    fireEvent.change(screen.getByDisplayValue("Highly rated"), {
      target: { value: "Item 64" },
    });

    const { previewed, saved } = await previewAndUpdate(fetchMock);
    expect(previewed).toEqual(stored);
    expect(saved).toEqual(stored);
    cleanup();
    vi.unstubAllGlobals();

    await openWith(saved, TAGS);
    expect(fieldsIn(screen.getByRole("group", { name: "Group 1" }))).toEqual([
      "tagIds",
      "tagIds",
    ]);
  });

  it("a field can be used twice", async () => {
    const fetchMock = stubApi({
      "/carousels": () => jsonResponse(200, { carousel: CAROUSEL }),
      "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
    });
    renderNew();

    addRow("top level", "title");
    setFocused("beach");
    addRow("top level", "title");
    setFocused("sunset");
    expect(fieldsIn(document.body)).toEqual(["title", "title"]);

    const { rules } = await previewAndSaveNew(fetchMock);
    expect(rules).toEqual({
      match: "all",
      rules: [
        leaf("title", { value: "beach", modifier: "INCLUDES" }),
        leaf("title", { value: "sunset", modifier: "INCLUDES" }),
      ],
    });
  });

  it("a stored leaf no row can edit is a kept row in its container, kept on save until removed", async () => {
    const hasAll = leaf("studios", {
      value: ["3:a"],
      modifier: "INCLUDES_ALL",
    });
    const notBetween = leaf("duration", {
      modifier: "NOT_BETWEEN",
      value: 60,
      value2: 120,
    });
    const stored = {
      match: "all",
      rules: [
        leaf("rating100", { modifier: "BETWEEN", value: 80 }),
        hasAll,
        { match: "any", rules: [leaf("favorite", true), notBetween] },
      ],
    };

    // Saved unedited but for the title: each kept leaf stays where it was
    let fetchMock = await openWith(stored);
    const group = () => screen.getByRole("group", { name: "Group 1" });
    expect(screen.getAllByText(KEPT)).toHaveLength(2);
    expect(within(group()).getAllByText(KEPT)).toHaveLength(1);
    fireEvent.change(screen.getByDisplayValue("Highly rated"), {
      target: { value: "Renamed" },
    });
    const first = await previewAndUpdate(fetchMock);
    expect(first.previewed).toEqual(stored);
    expect(first.saved).toEqual(stored);
    cleanup();
    vi.unstubAllGlobals();

    // Remove drops the group's kept leaf from the save, and only it
    fetchMock = await openWith(stored);
    fireEvent.click(within(group()).getByRole("button", { name: "Remove" }));
    expect(screen.getAllByText(KEPT)).toHaveLength(1);
    expect(within(group()).queryByText(KEPT)).toBeNull();
    const second = await previewAndUpdate(fetchMock);
    expect(second.saved).toEqual({
      match: "all",
      rules: [
        leaf("rating100", { modifier: "BETWEEN", value: 80 }),
        hasAll,
        { match: "any", rules: [leaf("favorite", true)] },
      ],
    });
  });

  it("a group holding only kept leaves keeps its place and its match before a group with rows", async () => {
    const stored = {
      match: "all",
      rules: [
        {
          match: "any",
          rules: [
            leaf("studios", { value: ["3:a"], modifier: "INCLUDES_ALL" }),
            leaf("duration", { modifier: "NOT_BETWEEN", value: 60 }),
          ],
        },
        {
          match: "all",
          rules: [leaf("favorite", true), leaf("watched", false)],
        },
      ],
    };
    const fetchMock = await openWith(stored);

    const first = screen.getByRole("group", { name: "Group 1" });
    expect(within(first).getAllByText(KEPT)).toHaveLength(2);
    expect(
      within(first).getByRole("combobox", { name: "Match for Group 1" })
    ).toHaveValue("any");
    expect(fieldsIn(screen.getByRole("group", { name: "Group 2" }))).toEqual([
      "favorite",
      "watched",
    ]);

    const { saved } = await previewAndUpdate(fetchMock);
    expect(saved).toEqual(stored);
  });

  it("over 20 rules, Preview and Save are refused with the Advanced view's message, and nothing is sent", async () => {
    const fetchMock = await openWith({
      match: "all",
      rules: Array.from({ length: 19 }, (_, at) =>
        leaf("title", { value: `title ${at}`, modifier: "INCLUDES" })
      ),
    });
    // Two rows added while empty (the waiting row stays below 20 filled
    // rules), then both filled: 21 rules, as the server counts them
    addRow("top level", "title");
    const first = document.activeElement;
    addRow("top level", "title");
    setFocused("sunset");
    fireEvent.change(must(first, "the first title box"), {
      target: { value: "beach" },
    });

    expect(
      screen.getByText("21 of 20 rules. Remove 1 to apply.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preview/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    expect(screen.getByRole("button", { name: /Update/ })).toBeDisabled();
    expect(requestsTo(fetchMock, "/carousels/preview")).toEqual([]);
  });

  describe("Back", () => {
    const back = () => screen.getByRole("button", { name: "Back" });
    const prompt = () =>
      screen.queryByRole("dialog", { name: "Discard changes?" });

    it("Back with unsaved changes asks first", async () => {
      await openWith(CAROUSEL.rules);

      // Nothing changed: Back leaves at once, to the tab listing carousels
      fireEvent.click(back());
      expect(prompt()).toBeNull();
      await screen.findByText("Settings navigation");
      cleanup();
      vi.unstubAllGlobals();

      await openWith(CAROUSEL.rules);
      addRow("top level", "watched");
      setFocused("false");
      fireEvent.click(back());
      const dialog = await screen.findByRole("dialog", {
        name: "Discard changes?",
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Keep editing" })
      );
      await waitFor(() => expect(prompt()).toBeNull());
      expect(screen.queryByText(/^Settings/)).toBeNull();
      expect(fieldsIn(document.body)).toEqual(["rating", "watched"]);

      fireEvent.click(back());
      fireEvent.click(
        within(
          await screen.findByRole("dialog", { name: "Discard changes?" })
        ).getByRole("button", { name: "Discard" })
      );
      await screen.findByText(/^Settings/);
    });

    it("Back after Save does not", async () => {
      const fetchMock = await openWith(CAROUSEL.rules);
      fireEvent.change(screen.getByDisplayValue("Highly rated"), {
        target: { value: "Renamed" },
      });

      await previewAndUpdate(fetchMock);

      expect(prompt()).toBeNull();
      expect(screen.getByText(/^Settings/)).toBeVisible();
    });

    it("a change put back as it was is not unsaved", async () => {
      await openWith(CAROUSEL.rules);
      const title = screen.getByDisplayValue("Highly rated");
      fireEvent.change(title, { target: { value: "Renamed" } });
      fireEvent.change(title, { target: { value: "Highly rated" } });

      fireEvent.click(back());

      expect(prompt()).toBeNull();
      await screen.findByText(/^Settings/);
    });
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

    it("Playlist order is offered with one playlist rule and saved", async () => {
      const fetchMock = stubApi({
        "/carousels": () => jsonResponse(200, { carousel: CAROUSEL }),
        "/carousels/preview": () => jsonResponse(200, { scenes: [] }),
        ...PLAYLISTS,
      });
      renderNew();

      fireEvent.change(waitingRow(), { target: { value: "playlistIds" } });
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
      await screen.findByText(/^Settings/);

      const post = must(
        fetchMock.mock.calls.find(
          ([url, init]) =>
            init?.method === "POST" && !url.includes("/carousels/preview")
        )
      );
      expect(JSON.parse(post[1]?.body as string)).toMatchObject({
        sort: "playlist_position",
        rules: rootAll({ playlists: { value: [12], modifier: "INCLUDES" } }),
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

    it("Playlist order needs the playlist as a root row of an all tree", async () => {
      const playlist = leaf("playlists", { value: [12], modifier: "INCLUDES" });
      await openWith(
        { match: "all", rules: [{ match: "all", rules: [playlist] }] },
        PLAYLISTS
      );
      expect(sortLabels()).not.toContain("Playlist Order");
      cleanup();
      vi.unstubAllGlobals();

      await openWith({ match: "any", rules: [playlist] }, PLAYLISTS);
      expect(sortLabels()).not.toContain("Playlist Order");
      cleanup();
      vi.unstubAllGlobals();

      await openWith({ match: "all", rules: [playlist] }, PLAYLISTS);
      expect(sortLabels()).toContain("Playlist Order");
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

      fireEvent.click(
        screen.getByRole("button", { name: "Row actions for Playlists" })
      );
      fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));

      expect(sortSelect()).toHaveDisplayValue("Random");
      expect(
        screen.getByText(
          "Playlist order needs one playlist rule; sorted by Random"
        )
      ).toBeVisible();

      // A new rule of another field is previewed and saved with Random
      fireEvent.change(waitingRow(), { target: { value: "oCount" } });
      fireEvent.change(screen.getByRole("spinbutton", { name: /^Minimum O/ }), {
        target: { value: "3" },
      });
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
      expect(saved).toEqual(rootAll(stored.rules));
      const put = must(
        fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")
      );
      expect(JSON.parse(put[1]?.body as string)).toMatchObject({
        sort: "playlist_position",
      });
    });
  });
});
