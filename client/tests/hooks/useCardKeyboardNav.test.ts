import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { renderHook } from "@testing-library/react";
import { type Mock, describe, expect, it, vi } from "vitest";
import { useCardKeyboardNav } from "../../src/hooks/useCardKeyboardNav";

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

const useNavigateMock = useNavigate as unknown as Mock;

/** A keydown event with only the fields the hook reads */
const keyEvent = (
  fields: Pick<
    KeyboardEvent<HTMLElement>,
    "key" | "preventDefault" | "stopPropagation" | "target" | "currentTarget"
  >
) => fields as KeyboardEvent<HTMLElement>;

describe("useCardKeyboardNav", () => {
  it("navigates on Enter key", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    result.current.onKeyDown(
      keyEvent({
        key: "Enter",
        preventDefault,
        stopPropagation,
        target: document.body,
        currentTarget: document.body,
      })
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/scene/123");
  });

  it("navigates on Space key", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    result.current.onKeyDown(
      keyEvent({
        key: " ",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: document.body,
        currentTarget: document.body,
      })
    );

    expect(navigate).toHaveBeenCalledWith("/scene/123");
  });

  it("calls onCustomAction instead of navigate when provided", () => {
    const navigate = vi.fn();
    const onCustomAction = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123", onCustomAction })
    );

    result.current.onKeyDown(
      keyEvent({
        key: "Enter",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: document.body,
        currentTarget: document.body,
      })
    );

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

    result.current.onKeyDown(
      keyEvent({
        key: "Enter",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: input,
        currentTarget: document.body,
      })
    );

    expect(navigate).not.toHaveBeenCalled();
  });
});
