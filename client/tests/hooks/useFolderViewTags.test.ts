import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFolderViewTags } from "@/hooks/useFolderViewTags";

const mockUseTagTree = vi.fn((_scope: unknown, _enabled: boolean) => ({
  data: undefined as { tags: Array<{ id: string }> } | undefined,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));
vi.mock("@/api/hooks", () => ({
  useTagTree: (scope: unknown, enabled: boolean) =>
    mockUseTagTree(scope, enabled),
}));

describe("useFolderViewTags", () => {
  beforeEach(() => {
    mockUseTagTree.mockClear();
  });

  it("asks for the whole tree without filters, only while active", () => {
    const { result } = renderHook(() => useFolderViewTags(false));

    expect(mockUseTagTree).toHaveBeenLastCalledWith(undefined, false);
    expect(result.current.tags).toEqual([]);
  });

  it("scopes the tree to the detail page's refs, instance included", () => {
    mockUseTagTree.mockReturnValueOnce({
      data: { tags: [{ id: "5" }] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useFolderViewTags(true, { performerId: "12:inst-a", studioId: "3" })
    );

    expect(mockUseTagTree).toHaveBeenLastCalledWith(
      { performer: "12:inst-a", studio: "3" },
      true
    );
    expect(result.current.tags).toEqual([{ id: "5" }]);
  });

  it("an empty filter set is the whole tree", () => {
    renderHook(() => useFolderViewTags(true, {}));

    expect(mockUseTagTree).toHaveBeenLastCalledWith(undefined, true);
  });

  it("scopes the tree to a tag or group page", () => {
    renderHook(() => useFolderViewTags(true, { tagId: "4:a", groupId: "9:a" }));

    expect(mockUseTagTree).toHaveBeenLastCalledWith(
      { tag: "4:a", group: "9:a" },
      true
    );
  });

  it("returns the tree's error and a refetch that reloads the tag tree", () => {
    const refetch = vi.fn();
    const error = new Error("Tree failed");
    mockUseTagTree.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error,
      refetch,
    } as never);

    const { result } = renderHook(() => useFolderViewTags(true));
    void result.current.refetch();

    expect(result.current.error).toBe(error);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
