import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { apiDelete, apiPost } from "../../src/api";
import { queryKeys } from "../../src/api/queryKeys";
import { useAuth } from "../../src/hooks/useAuth";
import { useHiddenEntities } from "../../src/hooks/useHiddenEntities";

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
  queryKeys.scenes.recommended(1, 24),
  queryKeys.user.stats(),
  queryKeys.user.hiddenItems("all", 1),
];

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
    (useAuth as unknown as Mock).mockReturnValue({
      user: { hideConfirmationDisabled: true },
      updateUser: vi.fn(),
    });
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
});
