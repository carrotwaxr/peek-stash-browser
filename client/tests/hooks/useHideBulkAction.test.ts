import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHideBulkAction } from "../../src/hooks/useHideBulkAction";
import { showError, showSuccess } from "../../src/utils/toast";

interface BulkHide {
  entities: Array<{
    entityType: string;
    entityId: string;
    instanceId?: string;
  }>;
  skipConfirmation?: boolean;
}

const mockHideEntities = vi.fn((hide: BulkHide) =>
  Promise.resolve({
    success: true,
    successCount: hide.entities.length,
    failCount: 0,
  })
);
vi.mock("../../src/hooks/useHiddenEntities", () => ({
  useHiddenEntities: () => ({
    hideEntities: mockHideEntities,
    hideConfirmationDisabled: false,
  }),
}));
vi.mock("../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

describe("useHideBulkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function render(
    selectedScenes: ReadonlyArray<{ id: string | number; instanceId?: string }>
  ) {
    const onComplete = vi.fn();
    const onHideSuccess = vi.fn();
    const { result } = renderHook(() =>
      useHideBulkAction({ selectedScenes, onComplete, onHideSuccess })
    );
    return { result, onComplete, onHideSuccess };
  }

  it("sends each selected scene's instance", async () => {
    const { result, onComplete, onHideSuccess } = render([
      { id: "12", instanceId: "A" },
      { id: 12, instanceId: "B" },
    ]);

    await act(async () => {
      await result.current.handleHideConfirm(true);
    });

    expect(mockHideEntities).toHaveBeenCalledExactlyOnceWith({
      entities: [
        { entityType: "scene", entityId: "12", instanceId: "A" },
        { entityType: "scene", entityId: "12", instanceId: "B" },
      ],
      skipConfirmation: true,
    });
    expect(onHideSuccess.mock.calls).toEqual([
      ["12", "scene", "A"],
      [12, "scene", "B"],
    ]);
    expect(showSuccess).toHaveBeenCalledWith("2 scenes hidden");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("never sends a scene without an instance, and counts it as failed", async () => {
    const { result, onHideSuccess } = render([
      { id: "12", instanceId: "A" },
      { id: "13" },
    ]);

    await act(async () => {
      await result.current.handleHideConfirm(false);
    });

    expect(mockHideEntities).toHaveBeenCalledExactlyOnceWith({
      entities: [{ entityType: "scene", entityId: "12", instanceId: "A" }],
      skipConfirmation: false,
    });
    expect(onHideSuccess.mock.calls).toEqual([["12", "scene", "A"]]);
    expect(showError).toHaveBeenCalledWith("Hidden 1 scene, 1 failed");
  });

  it("sends nothing when no selected scene has an instance", async () => {
    const { result, onComplete, onHideSuccess } = render([{ id: "13" }]);

    await act(async () => {
      await result.current.handleHideConfirm(false);
    });

    expect(mockHideEntities).not.toHaveBeenCalled();
    expect(onHideSuccess).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith("Hidden 0 scenes, 1 failed");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
