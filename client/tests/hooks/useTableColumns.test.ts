/**
 * useTableColumns: a table's columns are the user's saved columns for its
 * type (`tableColumnDefaults[type]` in the user settings), else the system
 * default. Every change shows at once and saves the whole map (the PUT
 * replaces the field), one save at a time; a preset's columns show without
 * a save.
 */
import { type ReactNode, createElement } from "react";
import type {
  GetUserSettingsResponse,
  TableColumnsConfig,
} from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api";
import { queryKeys } from "@/api/queryKeys";
import {
  CLIP_COLUMNS,
  getColumnSortField,
  getDefaultColumnOrder,
  getDefaultVisibleColumns,
} from "@/config/tableColumns";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { useTableColumns } from "@/hooks/useTableColumns";
import { CLIP_SORT_OPTIONS } from "@/utils/filterConfig";
import { showError } from "@/utils/toast";
import { createAuthValue, flushPromises, must } from "../testUtils";

const { apiGet, apiPut } = vi.hoisted(() => ({
  apiGet: vi.fn<(path: string) => Promise<unknown>>(),
  apiPut: vi.fn<(path: string, body: unknown) => Promise<unknown>>(),
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet,
  apiPut,
}));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

type Columns = Record<string, TableColumnsConfig>;

/** A promise the test settles */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settingsWith = (tableColumnDefaults: Columns | null) =>
  userSettingsResponse({ tableColumnDefaults });

/** The tableColumnDefaults each PUT carried, oldest first */
const putMaps = () =>
  apiPut.mock.calls.map(([path, body]) => {
    expect(path).toBe("/user/settings");
    return (body as { tableColumnDefaults: Columns }).tableColumnDefaults;
  });

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(
      AuthContext.Provider,
      {
        value: createAuthValue({
          isAuthenticated: true,
          user: {
            id: 1,
            username: "viewer",
            role: "USER",
            setupCompleted: true,
          },
        }),
      },
      children
    )
  );

const renderColumns = (entityType = "scene") =>
  renderHook(() => useTableColumns(entityType), { wrapper });

/** Render once the settings query answered */
async function renderLoaded(entityType = "scene") {
  const view = renderColumns(entityType);
  await waitFor(() =>
    expect(queryClient.getQueryData(queryKeys.user.settings())).toBeDefined()
  );
  return view;
}

const SCENE_DEFAULT_VISIBLE = getDefaultVisibleColumns("scene");
const SCENE_DEFAULT_ORDER = getDefaultColumnOrder("scene");

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  apiGet.mockResolvedValue(settingsWith(null));
  apiPut.mockResolvedValue({ success: true });
});

describe("useTableColumns", () => {
  it("with scene columns saved in settings, the table opens with them", async () => {
    const order = [
      "duration",
      ...SCENE_DEFAULT_ORDER.filter((id) => id !== "duration"),
    ];
    apiGet.mockResolvedValue(
      settingsWith({ scene: { visible: ["title", "duration"], order } })
    );

    const { result } = renderColumns();

    await waitFor(() =>
      expect(result.current.visibleColumnIds).toEqual(["title", "duration"])
    );
    expect(result.current.columnOrder).toEqual(order);
    expect(result.current.visibleColumns.map((c) => c.id)).toEqual([
      "duration",
      "title",
    ]);
  });

  it("toggling a column saves it as the scene columns: one PUT carrying tableColumnDefaults.scene, and a remount opens with it", async () => {
    const { result, unmount } = await renderLoaded();

    act(() => result.current.toggleColumn("duration"));

    expect(result.current.visibleColumnIds).toContain("duration");
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(putMaps()).toEqual([
      {
        scene: {
          visible: [...SCENE_DEFAULT_VISIBLE, "duration"],
          order: SCENE_DEFAULT_ORDER,
        },
      },
    ]);

    unmount();
    const again = renderColumns();
    expect(again.result.current.visibleColumnIds).toContain("duration");
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("a toggle made before the settings query answers is kept and saved, and the saved map keeps the other types' entries", async () => {
    const settings = deferred<GetUserSettingsResponse>();
    apiGet.mockReturnValue(settings.promise);
    const performer = { visible: ["name"], order: ["name"] };

    const { result } = renderColumns();
    act(() => result.current.toggleColumn("duration"));

    expect(result.current.visibleColumnIds).toContain("duration");
    await flushPromises();
    expect(apiPut).not.toHaveBeenCalled();

    await act(async () => {
      settings.resolve(settingsWith({ performer }));
      await settings.promise;
    });

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(putMaps()).toEqual([
      {
        performer,
        scene: {
          visible: [...SCENE_DEFAULT_VISIBLE, "duration"],
          order: SCENE_DEFAULT_ORDER,
        },
      },
    ]);
    expect(result.current.visibleColumnIds).toContain("duration");
  });

  it("three quick toggles send at most two PUTs, in order, and the last carries all three changes", async () => {
    const first = deferred<unknown>();
    apiPut.mockReturnValueOnce(first.promise);
    const { result } = await renderLoaded();

    act(() => result.current.toggleColumn("duration"));
    act(() => result.current.toggleColumn("rating"));
    act(() => result.current.toggleColumn("resolution"));

    expect(result.current.visibleColumnIds).toEqual([
      ...SCENE_DEFAULT_VISIBLE,
      "duration",
      "rating",
      "resolution",
    ]);
    await flushPromises();
    expect(apiPut).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({ success: true });
      await first.promise;
    });
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(2));
    await flushPromises();

    expect(apiPut).toHaveBeenCalledTimes(2);
    const [sentFirst, sentLast] = putMaps();
    expect(must(sentFirst, "the first PUT").scene?.visible).toEqual([
      ...SCENE_DEFAULT_VISIBLE,
      "duration",
    ]);
    expect(must(sentLast, "the second PUT").scene?.visible).toEqual([
      ...SCENE_DEFAULT_VISIBLE,
      "duration",
      "rating",
      "resolution",
    ]);
    // The first PUT's answer did not take the later changes off the screen
    expect(result.current.visibleColumnIds).toContain("resolution");
  });

  it("a clip column toggle saves tableColumnDefaults.clip beside the scene entry", async () => {
    const scene = { visible: ["title"], order: SCENE_DEFAULT_ORDER };
    apiGet.mockResolvedValue(settingsWith({ scene }));
    const { result } = await renderLoaded("clip");

    act(() => result.current.toggleColumn("tags"));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(putMaps()).toEqual([
      {
        scene,
        clip: {
          visible: getDefaultVisibleColumns("clip").filter(
            (id) => id !== "tags"
          ),
          order: getDefaultColumnOrder("clip"),
        },
      },
    ]);
  });

  it("the system default shows when nothing is saved", async () => {
    const { result } = await renderLoaded();

    expect(result.current.visibleColumnIds).toEqual(SCENE_DEFAULT_VISIBLE);
    expect(result.current.columnOrder).toEqual(SCENE_DEFAULT_ORDER);
  });

  it("a preset's columns show without a save; the next toggle saves the shown columns", async () => {
    const { result } = await renderLoaded();
    const order = [
      "rating",
      ...SCENE_DEFAULT_ORDER.filter((id) => id !== "rating"),
    ];

    act(() =>
      result.current.applyPresetColumns({ visible: ["title", "rating"], order })
    );

    expect(result.current.visibleColumnIds).toEqual(["title", "rating"]);
    expect(result.current.columnOrder).toEqual(order);
    await flushPromises();
    expect(apiPut).not.toHaveBeenCalled();

    act(() => result.current.toggleColumn("date"));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(putMaps()).toEqual([
      { scene: { visible: ["title", "rating", "date"], order } },
    ]);
  });

  it("a failed save refetches the settings and shows a toast", async () => {
    apiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
    const { result } = await renderLoaded();

    act(() => result.current.toggleColumn("duration"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Database busy")
    );
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.visibleColumnIds).toEqual(SCENE_DEFAULT_VISIBLE)
    );
  });
});

describe("clip table columns", () => {
  it("every sortable clip column maps to a clip sort option", () => {
    const sortable = CLIP_COLUMNS.filter((column) => column.sortable);
    expect(sortable.map((column) => column.id).sort()).toEqual([
      "duration",
      "start_time",
      "title",
    ]);
    const optionValues = CLIP_SORT_OPTIONS.map((option) => option.value);
    for (const column of sortable) {
      expect(optionValues).toContain(getColumnSortField(column.id, "clip"));
      expect(optionValues).toContain(getColumnSortField(column.id, "clips"));
    }
  });
});
