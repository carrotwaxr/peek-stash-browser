import { act, renderHook } from "@testing-library/react";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "../../src/api";
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

describe("useHiddenEntities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const { result } = renderHook(() => useHiddenEntities());

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
    const { result } = renderHook(() => useHiddenEntities());
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
});
