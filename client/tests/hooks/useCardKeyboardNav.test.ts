import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, type Mock } from "vitest";
import { useCardKeyboardNav } from "../../src/hooks/useCardKeyboardNav";
import { useNavigate } from "react-router-dom";

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

const useNavigateMock = useNavigate as unknown as Mock;

describe("useCardKeyboardNav", () => {
  it("navigates on Enter key", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    result.current.onKeyDown({
      key: "Enter",
      preventDefault,
      stopPropagation,
      target: document.body,
      currentTarget: document.body,
    } as any);

    expect(preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/scene/123");
  });

  it("navigates on Space key", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    result.current.onKeyDown({
      key: " ",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: document.body,
      currentTarget: document.body,
    } as any);

    expect(navigate).toHaveBeenCalledWith("/scene/123");
  });

  it("calls onCustomAction instead of navigate when provided", () => {
    const navigate = vi.fn();
    const onCustomAction = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123", onCustomAction })
    );

    result.current.onKeyDown({
      key: "Enter",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: document.body,
      currentTarget: document.body,
    } as any);

    expect(onCustomAction).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores key events on input fields", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    const input = document.createElement("input");

    result.current.onKeyDown({
      key: "Enter",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: input,
      currentTarget: document.body,
    } as any);

    expect(navigate).not.toHaveBeenCalled();
  });
});
