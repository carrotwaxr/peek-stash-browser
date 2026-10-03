import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { apiDelete, apiGet, apiPost, apiPut } from "../../src/api";
import { queryKeys } from "../../src/api/queryKeys";
import { useAuth } from "../../src/hooks/useAuth";
import {
  HIDDEN_ITEMS_PER_PAGE,
  useHiddenEntities,
  useHiddenItems,
} from "../../src/hooks/useHiddenEntities";
import { showError, showSuccess } from "../../src/utils/toast";
import { userSettingsResponse } from "../helpers/userSettings";

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../src/api", () => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock("../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

/** What a hide or restore must refresh: lists, carousels, recommended, stats, Hidden Items */
const DEPENDENTS = [
  queryKeys.scenes.list("inst-a", { page: 1 }),
  queryKeys.performers.detail("inst-a", "1"),
  queryKeys.homeCarousels.byKey("recentlyAdded"),
  queryKeys.carousels.execute("3"),
  queryKeys.clips.list({}),
  queryKeys.scenes.recommended({ filter: { page: 1, per_page: 24 } }),
  queryKeys.user.stats(),
  queryKeys.user.hiddenItems("all", 1),
];

/** The user's stored settings, as the one settings query holds them */
function seedSettings(hideConfirmationDisabled: boolean) {
  queryClient.setQueryData(
    queryKeys.user.settings(),
    userSettingsResponse({ hideConfirmationDisabled })
  );
}

function storedHideConfirmation() {
  return queryClient.getQueryData<
    ReturnType<typeof userSettingsResponse> | undefined
  >(queryKeys.user.settings())?.settings.hideConfirmationDisabled;
}

function seedDependents() {
  for (const key of DEPENDENTS) queryClient.setQueryData(key, { seeded: true });
}

function expectInvalidated(expected: boolean) {
  for (const key of DEPENDENTS) {
    expect(
      queryClient.getQueryState(key)?.isInvalidated,
      JSON.stringify(key)
    ).toBe(expected);
  }
}

describe("useHiddenEntities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    (apiDelete as unknown as Mock).mockResolvedValue({});
    (useAuth as unknown as Mock).mockReturnValue({ isAuthenticated: true });
    seedSettings(true);
    (apiPost as unknown as Mock).mockResolvedValue({
      successCount: 2,
      failCount: 0,
    });
  });

  it("hideEntity posts instanceId", async () => {
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    await act(async () => {
      await result.current.hideEntity({
        entityType: "performer",
        entityId: "12",
        entityName: "Jane",
        instanceId: "inst-a",
      });
    });

    expect(apiPost).toHaveBeenCalledWith("/user/hidden-entities", {
      entityType: "performer",
      entityId: "12",
      instanceId: "inst-a",
    });
  });

  it("hideEntities posts each target's instanceId", async () => {
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });
    const entities = [
      { entityType: "scene", entityId: "1", instanceId: "inst-a" },
      { entityType: "scene", entityId: "1", instanceId: "inst-b" },
    ];

    await act(async () => {
      await result.current.hideEntities({ entities });
    });

    expect(apiPost).toHaveBeenCalledWith("/user/hidden-entities/bulk", {
      entities,
    });
  });
  it("after a hide, every library list, carousel, recommended and stats query is invalidated", async () => {
    seedDependents();
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    await act(async () => {
      await result.current.hideEntity({
        entityType: "performer",
        entityId: "12",
        entityName: "Jane",
        instanceId: "inst-a",
      });
    });

    expectInvalidated(true);
  });

  it("a failed hide invalidates nothing", async () => {
    seedDependents();
    (apiPost as unknown as Mock).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    await act(async () => {
      await result.current.hideEntity({
        entityType: "performer",
        entityId: "12",
        entityName: "Jane",
        instanceId: "inst-a",
      });
    });

    expectInvalidated(false);
  });

  it("after a bulk hide, the same queries are invalidated", async () => {
    seedDependents();
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    await act(async () => {
      await result.current.hideEntities({
        entities: [
          { entityType: "scene", entityId: "1", instanceId: "inst-a" },
        ],
      });
    });

    expectInvalidated(true);
  });

  it("after a restore and after Restore All, the same queries are invalidated", async () => {
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    seedDependents();
    await act(async () => {
      await result.current.unhideEntity({
        entityType: "scene",
        entityId: "1",
        entityName: "A scene",
        instanceId: "inst-a",
      });
    });
    expectInvalidated(true);

    seedDependents();
    await act(async () => {
      await result.current.unhideAll();
    });
    expectInvalidated(true);
  });

  it("hideEntity sends the entity's instance", async () => {
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    await act(async () => {
      await result.current.hideEntity({
        entityType: "tag",
        entityId: "4",
        entityName: "Tag",
        instanceId: "inst-1",
      });
    });

    expect(apiPost).toHaveBeenCalledWith("/user/hidden-entities", {
      entityType: "tag",
      entityId: "4",
      instanceId: "inst-1",
    });
  });

  it("Don't ask again is remembered in the user's settings, and the next hide skips the dialog without a reload", async () => {
    seedSettings(false);
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    await act(async () => {
      await result.current.hideEntity({
        entityType: "tag",
        entityId: "4",
        entityName: "Tag",
        instanceId: "inst-a",
        skipConfirmation: true,
      });
    });
    await act(async () => {
      await result.current.hideEntities({
        entities: [{ entityType: "tag", entityId: "4", instanceId: "inst-a" }],
        skipConfirmation: true,
      });
    });

    // The second hide finds the preference already saved
    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(apiPut).toHaveBeenCalledWith("/user/hide-confirmation", {
      hideConfirmationDisabled: true,
    });
    expect(storedHideConfirmation()).toBe(true);
    expect(result.current.hideConfirmationDisabled).toBe(true);
  });

  it("a failed hide shows the server's message, or a default without one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });
    const hide = () =>
      result.current.hideEntity({
        entityType: "tag",
        entityId: "4",
        entityName: "Tag",
        instanceId: "inst-a",
      });

    (apiPost as unknown as Mock).mockRejectedValueOnce({
      data: { error: "Not found" },
    });
    let hidden: boolean | undefined;
    await act(async () => {
      hidden = await hide();
    });
    expect(hidden).toBe(false);
    expect(showError).toHaveBeenLastCalledWith("Not found");

    (apiPost as unknown as Mock).mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await hide();
    });
    expect(showError).toHaveBeenLastCalledWith(
      "Failed to hide entity. Please try again."
    );
  });

  it("a bulk hide that hid nothing invalidates nothing, and a failed one counts every target failed", async () => {
    seedDependents();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });
    const entities = [
      { entityType: "scene", entityId: "1", instanceId: "inst-a" },
      { entityType: "scene", entityId: "2", instanceId: "inst-a" },
    ];

    (apiPost as unknown as Mock).mockResolvedValueOnce({
      successCount: 0,
      failCount: 2,
    });
    await act(async () => {
      await result.current.hideEntities({ entities });
    });
    expectInvalidated(false);

    (apiPost as unknown as Mock).mockRejectedValueOnce(new Error("boom"));
    let outcome:
      | Awaited<ReturnType<typeof result.current.hideEntities>>
      | undefined;
    await act(async () => {
      outcome = await result.current.hideEntities({ entities });
    });
    expect(outcome).toEqual({ success: false, successCount: 0, failCount: 2 });
  });

  it("a restore names the hidden row's instance, and reports a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    await act(async () => {
      await result.current.unhideEntity({
        entityType: "scene",
        entityId: "1",
        entityName: "A scene",
        instanceId: "inst a",
      });
    });
    expect(apiDelete).toHaveBeenLastCalledWith(
      "/user/hidden-entities/scene/1?instanceId=inst%20a"
    );
    expect(showSuccess).toHaveBeenLastCalledWith("A scene has been restored");

    await act(async () => {
      await result.current.unhideEntity({
        entityType: "scene",
        entityId: "1",
        entityName: "A scene",
      });
    });
    expect(apiDelete).toHaveBeenLastCalledWith("/user/hidden-entities/scene/1");

    (apiDelete as unknown as Mock).mockRejectedValueOnce({
      data: { error: "Gone" },
    });
    await act(async () => {
      await result.current.unhideEntity({
        entityType: "scene",
        entityId: "1",
        entityName: "A scene",
      });
    });
    expect(showError).toHaveBeenLastCalledWith("Gone");

    (apiDelete as unknown as Mock).mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.unhideEntity({
        entityType: "scene",
        entityId: "1",
        entityName: "A scene",
      });
    });
    expect(showError).toHaveBeenLastCalledWith(
      "Failed to restore entity. Please try again."
    );
  });

  it("Restore All can name a type, and reports a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });

    await act(async () => {
      await result.current.unhideAll("scene");
    });
    expect(apiDelete).toHaveBeenLastCalledWith(
      "/user/hidden-entities/all?entityType=scene"
    );
    expect(showSuccess).toHaveBeenLastCalledWith(
      "All hidden scenes have been restored"
    );

    await act(async () => {
      await result.current.unhideAll();
    });
    expect(apiDelete).toHaveBeenLastCalledWith("/user/hidden-entities/all");
    expect(showSuccess).toHaveBeenLastCalledWith(
      "All hidden items have been restored"
    );

    (apiDelete as unknown as Mock).mockRejectedValueOnce({
      data: { error: "Nope" },
    });
    await act(async () => {
      await result.current.unhideAll();
    });
    expect(showError).toHaveBeenLastCalledWith("Nope");

    (apiDelete as unknown as Mock).mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.unhideAll();
    });
    expect(showError).toHaveBeenLastCalledWith(
      "Failed to restore all items. Please try again."
    );
  });

  it("updateHideConfirmation saves the preference, and reports a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    seedSettings(false);
    const { result } = renderHook(() => useHiddenEntities(), { wrapper });
    expect(result.current.hideConfirmationDisabled).toBe(false);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.updateHideConfirmation(true);
    });
    expect(saved).toBe(true);
    expect(apiPut).toHaveBeenCalledWith("/user/hide-confirmation", {
      hideConfirmationDisabled: true,
    });
    expect(storedHideConfirmation()).toBe(true);

    (apiPut as unknown as Mock).mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      saved = await result.current.updateHideConfirmation(false);
    });
    expect(saved).toBe(false);
    expect(storedHideConfirmation()).toBe(true);
    expect(showError).toHaveBeenLastCalledWith("Failed to update preference");
  });
});

describe("useHiddenItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    (apiGet as unknown as Mock).mockResolvedValue({
      items: [],
      total: 0,
      counts: {},
    });
  });

  it("asks for one page of a type", async () => {
    const { result } = renderHook(() => useHiddenItems("scene", 2), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiGet).toHaveBeenCalledWith(
      `/user/hidden-entities?entityType=scene&page=2&per_page=${HIDDEN_ITEMS_PER_PAGE}`
    );
  });

  it("asks for no type when the tab is All", async () => {
    const { result } = renderHook(() => useHiddenItems("all", 1), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiGet).toHaveBeenCalledWith(
      `/user/hidden-entities?page=1&per_page=${HIDDEN_ITEMS_PER_PAGE}`
    );
  });
});
