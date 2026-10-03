/**
 * A list's pin actions as the chip editor's header uses them: pinning a
 * field or a filter, and turning either off, each saving the list's next
 * pins (`PUT /user/filter-pins/scene`) at once. Tests stub the network.
 */
import type { ListPins, PinnedFilter } from "@peek/shared-types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { pinsAnswer } from "@tests/helpers/filterPins";
import {
  type ApiStub,
  jsonResponse,
  requestsTo,
  stubApi,
} from "@tests/helpers/stubApi";
import { createQueryWrapper, must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useListPinning } from "@/components/filter-bar/useListPinning";

const PINS = "/user/filter-pins";
const SCENE_PINS = "/user/filter-pins/scene";

const UNWATCHED: PinnedFilter = {
  id: "default-unwatched",
  key: "watched",
  state: { watched: "false" },
  label: "Unwatched",
};

/** The scene list's pins loaded from the server; saves are recorded */
async function renderPinning(stored: ListPins) {
  const fetchMock = stubApi({
    [PINS]: () => jsonResponse(200, pinsAnswer({ scene: stored })),
    [SCENE_PINS]: () => jsonResponse(200, {}),
  });
  const view = renderHook(() => useListPinning("scene", []), {
    wrapper: createQueryWrapper(),
  });
  await waitFor(() => expect(view.result.current.pins).toEqual(stored));
  return { fetchMock, view };
}

/** The pins the scene list was last asked to save */
const saved = (fetchMock: ApiStub): unknown => {
  const call = must(
    fetchMock.mock.calls.filter(([url]) => url.endsWith(SCENE_PINS)).at(-1),
    "a save"
  );
  return JSON.parse(typeof call[1]?.body === "string" ? call[1].body : "null");
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useListPinning", () => {
  it("turning a pinned field off saves the pins without it", async () => {
    const { fetchMock, view } = await renderPinning({
      fields: ["tagIds", "organized"],
      filters: [],
    });
    const pinning = must(view.result.current.pinningOf("tagIds"));
    expect(pinning.fieldPinned).toBe(true);

    act(() => pinning.toggleField());

    await waitFor(() =>
      expect(saved(fetchMock)).toEqual({ fields: ["organized"], filters: [] })
    );
  });

  it("turning a pinned filter off saves the pins without it; turning it on saves it back", async () => {
    const { fetchMock, view } = await renderPinning({
      fields: [],
      filters: [UNWATCHED],
    });
    const pinning = must(view.result.current.pinningOf("watched"));
    expect(pinning.isFilterPinned({ watched: "false" })).toBe(true);

    act(() => pinning.toggleFilter({ watched: "false" }));

    await waitFor(() =>
      expect(saved(fetchMock)).toEqual({ fields: [], filters: [] })
    );
    await waitFor(() =>
      expect(
        must(view.result.current.pinningOf("watched")).isFilterPinned({
          watched: "false",
        })
      ).toBe(false)
    );

    act(() =>
      must(view.result.current.pinningOf("watched")).toggleFilter({
        watched: "false",
      })
    );

    await waitFor(() =>
      expect(saved(fetchMock)).toMatchObject({
        fields: [],
        filters: [{ key: "watched", state: { watched: "false" } }],
      })
    );
  });

  it("a field the list does not have offers no pin actions and saves nothing", async () => {
    const { fetchMock, view } = await renderPinning({
      fields: [],
      filters: [],
    });

    expect(view.result.current.pinningOf("noSuchField")).toBeUndefined();
    act(() => view.result.current.toggleField("noSuchField"));

    expect(requestsTo(fetchMock, SCENE_PINS)).toEqual([]);
  });
});
